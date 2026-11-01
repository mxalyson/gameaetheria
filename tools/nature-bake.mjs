// Fotografa os modelos do Stylized Nature MegaKit (CC0, Quaternius) em sprites 2D e grava PNGs + meta em test-results/nature-bake/ (depois `python tools/nature-pack.py` monta o atlas).
// Pré-requisitos: modelos copiados em public/labs/iso-poc/art-local/nature/ (fora do Git) e o servidor estático no ar (`npm start`).
// Uso: node tools/nature-bake.mjs [ppm=26] [elevacao=40]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ppm = Number(process.argv[2]) || 26, el = Number(process.argv[3]) || 40;
const dir = 'public/labs/iso-poc/art-local/nature';
const names = fs.readdirSync(dir).filter((f) => f.endsWith('.gltf')).map((f) => f.replace('.gltf', '')).sort();
const dest = 'test-results/nature-bake'; fs.mkdirSync(dest, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:5174/labs/nature/bake.html');
await page.waitForFunction(() => window.bakeReady, null, { timeout: 60000 });
const meta = [];
for (const n of names) {
  const r = await page.evaluate(([name, p, e]) => window.bake(name, { ppm: p, el: e }), [n, ppm, el]);
  fs.writeFileSync(path.join(dest, n + '.png'), Buffer.from(r.png.split(',')[1], 'base64'));
  const { png, ...m } = r; meta.push(m); console.log(n, `${m.w}×${m.h}`, 'âncora', m.ax, m.ay, 'm', m.size.join('×'));
}
fs.writeFileSync(path.join(dest, 'meta.json'), JSON.stringify(meta, null, 1));
await browser.close();
