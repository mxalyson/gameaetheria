// Fotografa TODAS as peças dos GLB do Meshy (public/labs/iso-poc/art-local/meshy-cenario/*.glb) em test-results/glb-bake/<conjunto>_<n>.png + meta.json.
// Depois: python tools/meshy-pack.py (monta o atlas public/assets/nature/meshy.webp). Uso: node tools/glb-bake.mjs [max-px=230] [elevacao=40] [conjunto=Cozy_Medieval_Village] [pecas=0,8,10,11] [hd]  (com 'hd': luz de recorte, aa 4 e saída em public/labs/iso-poc/art-local/hd-bake/glb (fora de test-results, que o Playwright apaga) para o atlas HD (python tools/hd-pack.py); sem filtro, fotografa tudo; o meta.json é MESCLADO, nunca perdido)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.wasm': 'application/wasm' };
// serve public/ direto do disco (sem servidor/porta)
async function serveDisk(p) {
  await p.route('http://localhost:5174/**', (route) => {
    const f = path.join('public', decodeURIComponent(new URL(route.request().url()).pathname));
    if (!f.startsWith('public') || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ status: 200, contentType: MIME[path.extname(f)] ?? 'application/octet-stream', body: fs.readFileSync(f) });
  });
}
const max = Number(process.argv[2]) || 230, el = Number(process.argv[3]) || 40, onlySet = process.argv[4], onlyIdx = process.argv[5]?.split(',').map(Number);
const dir = 'public/labs/iso-poc/art-local/meshy-cenario', HD = process.argv[6] === 'hd', dest = HD ? 'public/labs/iso-poc/art-local/hd-bake/glb' : 'test-results/glb-bake'; fs.mkdirSync(dest, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const metaPath = `${dest}/meta.json`, meta = (onlySet && fs.existsSync(metaPath)) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.glb'))) {
  const set = f.replace(/^Meshy_AI_/, '').replace(/_\d+_texture\.glb$/, '');
  if (onlySet && set !== onlySet) continue;
  const p = await b.newPage({ viewport: { width: 400, height: 300 } }); p.on('pageerror', (e) => console.log('pageerror', e.message));
  await serveDisk(p); await p.goto('http://localhost:5174/labs/nature/glb.html'); await p.waitForFunction(() => window.glbReady, null, { timeout: 60000 });
  const parts = await p.evaluate((f) => window.loadGlb(f), f);
  for (const x of parts) {
    if (onlyIdx && !onlyIdx.includes(x.idx)) continue;
    const r = await p.evaluate(([i, o]) => window.bakePart(i, o), [x.idx, { max, el, ...(HD ? { aa: 4, hd: true } : {}) }]);
    const name = `${set}_${x.idx}`; fs.writeFileSync(`${dest}/${name}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
    const { png, ...m } = r; const old = meta.findIndex((q) => q.name === name); if (old >= 0) meta.splice(old, 1); meta.push({ name, set, idx: x.idx, ...m }); console.log(name, `${m.w}×${m.h}`, 'âncora', m.ax, m.ay);
  }
  await p.close();
}
fs.writeFileSync(`${dest}/meta.json`, JSON.stringify(meta, null, 1)); await b.close();
