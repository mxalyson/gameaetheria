// Renderiza um GLB (art-local/<model>.glb) em 8 direções e grava PNGs em art-local/out/<model>/.
// Uso: node public/labs/iso-poc/tools/render3d.mjs paladino 192   (servidor em :5174 precisa estar no ar: npm start)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [model = 'paladino', size = '192', clip = '0'] = process.argv.slice(2);
const root = fileURLToPath(new URL('../', import.meta.url));
const dest = path.join(root, 'art-local', 'out', model);
fs.mkdirSync(dest, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 260 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://localhost:5174/labs/iso-poc/render3d.html?model=${model}&size=${size}&clip=${clip}`);
await page.waitForFunction(() => window.render3d?.ready, null, { timeout: 120000 });
const { views, info } = await page.evaluate(() => window.render3d);
const names = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
views.forEach((d, i) => fs.writeFileSync(path.join(dest, `${i}_${names[i]}.png`), Buffer.from(d.split(',')[1], 'base64')));
fs.writeFileSync(path.join(dest, 'info.json'), JSON.stringify(info, null, 2));
await page.screenshot({ path: path.join(dest, 'sheet.png') });
console.log('ok', dest, info);
await browser.close();
