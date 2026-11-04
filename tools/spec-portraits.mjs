// Gera os retratos de BUSTO das especializações (public/assets/portraits/spec-<id>.webp, 512x512, fundo transparente)
// a partir dos GLBs esqueletados Nv25 (public/labs/iso-poc/art-local/rigged/<id>_nv25.glb, fora do Git) com three.js
// (public/labs/iso-poc/portrait3d.html). Determinístico: mesmos GLBs + mesmos parâmetros = mesmos arquivos.
// Uso: node tools/spec-portraits.mjs [id ...]   (sem servidor: sobe um estático próprio em porta livre; GPU D3D11, SOFTGL=1 usa software)
// Ajustes por herói na tabela PARAMS (top/span/fx = enquadramento; el = elevação da câmera; bri/sat = brilho/saturação do assar).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../public/', import.meta.url));
const OUT = path.join(root, 'assets/portraits');
const PARAMS = {
  paladin: { top: -0.01, span: 0.68, fx: 0, el: 12, bri: 1.2, sat: 1.1 },
  berserker: { top: -0.03, span: 0.7, fx: 0, el: 12, bri: 1.2, sat: 1.1 },
  arcane: { top: 0.02, span: 0.68, fx: 0.01, el: 12, bri: 1.2, sat: 1.1 },
  warlock: { top: -0.03, span: 0.68, fx: 0, el: 12, bri: 1.5, sat: 1.15 },
  sniper: { top: -0.04, span: 0.7, fx: 0.01, el: 12, bri: 1.2, sat: 1.1 },
  gunslinger: { top: -0.04, span: 0.7, fx: 0, el: 12, bri: 1.2, sat: 1.1 },
  guardian: { top: 0.0, span: 0.68, fx: 0, el: 12, bri: 1.2, sat: 1.1 },
  inquisitor: { top: -0.04, span: 0.7, fx: 0.04, el: 12, bri: 1.2, sat: 1.1 },
};
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PARAMS);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const browser = await chromium.launch({ args: process.env.SOFTGL ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
for (const id of ids) {
  const p = { ...PARAMS[id] };
  for (const kv of (process.env.OVR ?? '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); p[k] = +v; } // OVR=top=0.1,el=20 (afinar sem editar)
  const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(`http://127.0.0.1:${port}/labs/iso-poc/portrait3d.html?model=${id}_nv25&size=512&${new URLSearchParams(p)}`);
  await page.waitForFunction(() => window.portrait?.ready, null, { timeout: 120000 });
  const webp = await page.evaluate(() => window.portrait.webp);
  const file = path.join(OUT, `spec-${id}.webp`);
  fs.writeFileSync(file, Buffer.from(webp.split(',')[1], 'base64'));
  console.log('ok', id, (fs.statSync(file).size / 1024).toFixed(0), 'KiB');
  await page.close();
}
await browser.close(); srv.close();
