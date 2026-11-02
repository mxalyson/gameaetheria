// Divide um GLB do Meshy em peças e grava uma visão geral + lista em test-results/glb/<nome>/ (olhar antes de fotografar).
// Uso: node tools/glb-inspect.mjs <arquivo.glb>   (o arquivo fica em public/labs/iso-poc/art-local/meshy-cenario/; sem servidor: serve public/ do disco)
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
const f = process.argv[2], name = f.replace(/^Meshy_AI_/, '').replace(/_\d+_texture\.glb$/, '');
const dest = `test-results/glb/${name}`; fs.mkdirSync(dest, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 400, height: 300 } }); p.on('pageerror', (e) => console.log('pageerror', e.message));
await serveDisk(p); await p.goto('http://localhost:5174/labs/nature/glb.html'); await p.waitForFunction(() => window.glbReady, null, { timeout: 60000 });
const parts = await p.evaluate((f) => window.loadGlb(f), f); console.log(name, parts.length, 'peças'); for (const x of parts) console.log(x.idx, 'tris', x.tris, 'tam', x.size.join('×'), 'centro', x.center.join(','));
fs.writeFileSync(`${dest}/parts.json`, JSON.stringify(parts, null, 1));
fs.writeFileSync(`${dest}/all.png`, Buffer.from((await p.evaluate(() => window.previewAll({ w: 1400 }))).split(',')[1], 'base64'));
await b.close();
