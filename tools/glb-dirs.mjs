// Fotografa UMA peça do GLB em 8 giros (grade 4x2, mesma janela/âncora) em test-results/glb-dirs/<id>.png + .json: para escolher o giro que serve (ex.: ponte reta).
// Uso: node tools/glb-dirs.mjs <pasta/arquivo.glb> <id> <parte> [px=200] [elevacao=40] [hd]   (sem servidor: serve public/ do disco)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const [file, id, part, max = '200', el = '40', mode] = process.argv.slice(2), HD = mode === 'hd'; // 'hd': luz de recorte e aa 4 (atlas HD)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.wasm': 'application/wasm' };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 400, height: 300 } }); p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.route('http://localhost:5174/**', (route) => {
  const f = path.join('public', decodeURIComponent(new URL(route.request().url()).pathname));
  if (!f.startsWith('public') || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: '' });
  route.fulfill({ status: 200, contentType: MIME[path.extname(f)] ?? 'application/octet-stream', body: fs.readFileSync(f) });
});
await p.goto('http://localhost:5174/labs/nature/glb.html'); await p.waitForFunction(() => window.glbReady, null, { timeout: 60000 });
await p.evaluate((f) => window.loadGlb(f), file);
const r = await p.evaluate(([i, m, e, h]) => window.bakeDirs(i, { max: m, el: e, ...(h ? { aa: 4, hd: true } : {}) }), [Number(part), Number(max), Number(el), HD]);
const OUT = HD ? 'public/labs/iso-poc/art-local/hd-bake/dirs' : 'test-results/glb-dirs'; // HD fora de test-results (o Playwright apaga)
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/${id}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
const { png, ...meta } = r; fs.writeFileSync(`${OUT}/${id}.json`, JSON.stringify(meta, null, 1)); console.log(id, JSON.stringify(meta)); await b.close();
