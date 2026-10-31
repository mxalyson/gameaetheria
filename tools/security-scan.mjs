// Varredura simples de SEGREDOS nos arquivos versionados: chaves privadas, tokens conhecidos, atribuições de senha/chave, arquivos .env.
// Uso: npm run security:scan (sai com código 1 se achar algo). Não substitui uma ferramenta dedicada; pega os erros mais comuns.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PATTERNS = [
  ['chave privada', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['token do GitHub', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['chave de acesso AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['segredo de cliente Google', /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/],
  ['chave de API Google', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['token Slack', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['chave sk- (API)', /\bsk-[A-Za-z0-9]{32,}\b/],
  ['senha/segredo literal', /\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i],
];
// arquivos onde exemplos/valores de teste são esperados
const IGNORE_FILE = /^(tests\/|docs\/|tools\/security-scan\.mjs$|package-lock\.json$|public\/labs\/iso-poc\/vendor\/)/;
const BINARY = /\.(png|jpg|jpeg|gif|webp|ico|glb|woff2?|ttf|zip|db|mp3|ogg)$/i;

export function scanText(path, text) {
  const out = [];
  text.split('\n').forEach((line, i) => { for (const [name, re] of PATTERNS) if (re.test(line)) out.push({ file: path, line: i + 1, kind: name }); });
  return out;
}

export function scanRepo() {
  const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  const out = [];
  for (const f of files) {
    if (/(^|\/)\.env(\.|$)/.test(f)) out.push({ file: f, line: 0, kind: 'arquivo .env versionado' });
    if (/\.(db|sqlite|sqlite3)(-wal|-shm)?$/.test(f)) out.push({ file: f, line: 0, kind: 'banco de dados versionado' });
    if (IGNORE_FILE.test(f) || BINARY.test(f)) continue;
    let text; try { text = readFileSync(f, 'utf8'); } catch { continue; }
    out.push(...scanText(f, text));
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const found = scanRepo();
  if (found.length) { for (const f of found) console.log(`ACHADO: ${f.kind} em ${f.file}:${f.line}`); process.exit(1); }
  console.log('Varredura de segredos: nada encontrado nos arquivos versionados.');
}
