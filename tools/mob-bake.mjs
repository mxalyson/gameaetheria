// Fotografa UMA criatura do Meshy em 8 direções e grava public/assets/mobs/<id>.webp + .json (grade 4x2, mesma janela e âncora em todas as vistas).
// Uso: node tools/mob-bake.mjs <arquivo.glb> <id> [parte|-1=todas] [px-maior-lado=168] [estilo: hop|waddle|trot] [quadros=6] [elevação=40; menor mostra mais o rosto de criaturas de chapéu/capuz]   (com estilo: deforma o modelo em N quadros de ciclo; sem: 8 vistas estáticas)   (GLB em public/labs/iso-poc/art-local/<pasta>/; passe o caminho relativo a essa art-local, ex.: meshy-mobs/slime.glb)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
// Opções de PROPS (objetos de cenário, não criaturas): --props grava em public/assets/props/<id>.webp+.json SEM tocar no índice de mobs; --views=0,2 guarda só essas vistas
// (uma linha de N células, json.views = vistas originais) e --scale=0.6 reduz as células (orçamento de textura). --repack refaz o pacote a partir da grade já fotografada
// em test-results/mob-bake/<id>.png + .json (sem GLB nem navegador). Ex.: node tools/mob-bake.mjs --props --views=0,1,2 --scale=0.6 meshy-cenario/x.glb harbor_boat0 0
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
process.argv = process.argv.filter((a, i) => i < 2 || !a.startsWith('--'));
const PROPS = !!(flags.props || flags.repack), OUT = PROPS ? 'public/assets/props' : 'public/assets/mobs';
const [file, id, part = '-1', max = '168', style = '', frames = '6', elev = '40'] = process.argv.slice(2); // style (hop|waddle|trot) => atlas ANIMADO: 8 direções x quadros do ciclo
if (!file || !id) { console.log('uso: node tools/mob-bake.mjs <pasta/arquivo.glb> <id> [parte] [px]'); process.exit(1); }
let b, r;
if (flags.repack) { r = JSON.parse(fs.readFileSync(`test-results/mob-bake/${id}.json`, 'utf8')); } else {
b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 400, height: 300 } }); p.on('pageerror', (e) => console.log('pageerror', e.message));
// serve public/ direto do disco (interceptação do Playwright): não precisa de servidor no ar nem abre porta
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.wasm': 'application/wasm' };
await p.route('http://localhost:5174/**', (route) => {
  const f = path.join('public', decodeURIComponent(new URL(route.request().url()).pathname));
  if (!f.startsWith('public') || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: '' });
  route.fulfill({ status: 200, contentType: MIME[path.extname(f)] ?? 'application/octet-stream', body: fs.readFileSync(f) });
});
await p.goto('http://localhost:5174/labs/nature/glb.html'); await p.waitForFunction(() => window.glbReady, null, { timeout: 60000 });
const parts = await p.evaluate((f) => window.loadGlb(f), file); console.log(parts.length, 'peças no arquivo');
const partArg = part.includes(',') ? part.split(',').map(Number) : Number(part); // "5,1,2" junta várias peças numa criatura
r = style ? await p.evaluate(([i, m, st, n, e]) => window.bakeAnim(i, { max: m, style: st, frames: n, el: Number(e) }), [partArg, Number(max), style, Number(frames), elev]) : await p.evaluate(([i, m, e]) => window.bakeDirs(i, { max: m, el: e }), [partArg, Number(max), Number(elev)]);
}
fs.mkdirSync('test-results/mob-bake', { recursive: true }); if (!flags.repack) fs.writeFileSync(`test-results/mob-bake/${id}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
const { png, ...meta } = r; fs.mkdirSync(OUT, { recursive: true });
if (!flags.repack) fs.writeFileSync(`test-results/mob-bake/${id}.json`, JSON.stringify({ id, ...meta, src: file }, null, 1)); // grade completa: base do --repack
let outMeta = { id, ...meta, src: meta.src ?? file, v: Math.floor(Date.now() / 1000) };
if (PROPS && (flags.views || flags.scale)) { // pacote enxuto: só as vistas pedidas, em uma linha, na escala pedida
  const views = (flags.views ?? '0,1,2,3,4,5,6,7').split(',').map(Number), k = Number(flags.scale ?? 1);
  const cw = Math.round(meta.cell[0] * k), ch = Math.round(meta.cell[1] * k);
  execFileSync('python', ['-c', `from PIL import Image
g=Image.open('test-results/mob-bake/${id}.png').convert('RGBA'); W,H=${meta.cell[0]},${meta.cell[1]}; V=${JSON.stringify(views)}
o=Image.new('RGBA',(${cw}*len(V),${ch}))
for n,v in enumerate(V):
  c=g.crop(((v%${meta.cols})*W,(v//${meta.cols})*H,(v%${meta.cols}+1)*W,(v//${meta.cols}+1)*H)).resize((${cw},${ch}),Image.LANCZOS); o.paste(c,(n*${cw},0))
o.save('${OUT}/${id}.webp','WEBP',quality=88,method=6)`]);
  outMeta = { ...outMeta, cell: [cw, ch], cols: views.length, rows: 1, ax: Math.round(meta.ax * k), ay: Math.round(meta.ay * k), ppm: meta.ppm * k, views };
  delete outMeta.png;
}
fs.writeFileSync(`${OUT}/${id}.json`, JSON.stringify(outMeta, null, 1));
// índice das criaturas com arte (o jogo só pede os arquivos que estão aqui); props não entram
if (!PROPS) {
  const idxPath = 'public/assets/mobs/index.json', ids = new Set(fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')).ids : []); ids.add(id);
  fs.writeFileSync(idxPath, JSON.stringify({ ids: [...ids].sort() }, null, 1));
}
await b?.close();
if (!(PROPS && (flags.views || flags.scale))) execFileSync('python', ['-c', `from PIL import Image; Image.open('test-results/mob-bake/${id}.png').save('${OUT}/${id}.webp','WEBP',quality=88,method=6)`]);
console.log(id, 'célula', outMeta.cell.join('×'), 'âncora', outMeta.ax, outMeta.ay, 'tam. do modelo', r.size.join('×'), '→ ' + OUT + '/' + id + '.webp');
