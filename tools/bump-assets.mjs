// Versão da arte estática como DADO (hash do conteúdo de public/assets/**), não número manual.
// Reescreve: ASSET_V em public/src/assets-version.js e VERSION do service worker (public/sw.js) => 'aetheria-<hash>',
// e (a não ser com --no-css) anexa/atualiza `?v=<hash>` nas referências assets/*.(webp|png|svg) de public/style.css e public/index.html.
// Uso: node tools/bump-assets.mjs [--no-css] [--check]   (--check só confere e sai com 1 se estiver desatualizado)
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUB = join(ROOT, 'public');

function listFiles(dir) {
  return readdirSync(dir).sort().flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

// Só arquivos de arte entram no hash: o Windows cria Thumbs.db/desktop.ini nas pastas de imagem (fora do Git), e o hash da máquina do dono
// nunca batia com o de um clone limpo (teste de ASSET_V falhando em qualquer outro computador).
const ART = /\.(webp|png|jpe?g|svg|json|woff2?|ttf|mp3|ogg)$/i;

export function assetsHash() {
  const h = createHash('sha1');
  for (const f of listFiles(join(PUB, 'assets')).filter((f) => ART.test(f))) {
    h.update(relative(PUB, f).split('\\').join('/')).update('\0').update(readFileSync(f)).update('\0');
  }
  return h.digest('hex').slice(0, 8);
}

function patch(file, fn) {
  const raw = readFileSync(file, 'utf8');
  const next = fn(raw);
  if (next === raw) return false;
  writeFileSync(file, next);
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hash = assetsHash();
  const check = process.argv.includes('--check');
  const withCss = !process.argv.includes('--no-css');
  const cur = /ASSET_V = '([^']*)'/.exec(readFileSync(join(PUB, 'src/assets-version.js'), 'utf8'))?.[1];
  if (check) {
    console.log(cur === hash ? `assets ok (${hash})` : `assets DESATUALIZADOS: ASSET_V=${cur}, conteúdo=${hash} (rode node tools/bump-assets.mjs)`);
    process.exit(cur === hash ? 0 : 1);
  }
  const done = [];
  if (patch(join(PUB, 'src/assets-version.js'), (s) => s.replace(/ASSET_V = '[^']*'/, `ASSET_V = '${hash}'`))) done.push('assets-version.js');
  if (patch(join(PUB, 'sw.js'), (s) => s.replace(/const VERSION = '[^']*'/, `const VERSION = 'aetheria-${hash}'`))) done.push('sw.js');
  if (withCss) {
    const re = /(assets\/[^\s)"'?]+\.(?:webp|png|svg))(\?v=[\w]+)?/g;
    for (const f of ['style.css', 'index.html']) if (patch(join(PUB, f), (s) => s.replace(re, `$1?v=${hash}`))) done.push(f);
  }
  console.log(`hash ${hash}; atualizados: ${done.join(', ') || 'nada (já estava em dia)'}`);
}
