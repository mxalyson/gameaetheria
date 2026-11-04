// Gera o atlas (PNG por clipe + JSON) de um GLB, no formato de src/atlas.js.
// Uso: node public/labs/iso-poc/tools/bake-atlas.mjs paladino 160 [corte]   (precisa do servidor em :5174: npm start)
// BRI=1.25 SAT=1.1 ajustam brilho/saturação no assar (GLB escuro). Saída: public/labs/iso-poc/art-local/atlas/<modelo>/{idle,walk,attack,skill,hit}.png + <modelo>.json
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [model = 'paladino', size = '160', clip = '0'] = process.argv.slice(2);
const root = fileURLToPath(new URL('../', import.meta.url));
// RIG=1 usa o GLB com esqueleto (art-local/rigged/<id>.glb, feito por tools/blender/rig_animate.py) e grava em atlas-rig/
const dest = process.env.OUTDIR ? path.join(process.env.OUTDIR, model) : path.join(root, 'art-local', process.env.RIG ? (process.env.MIRROR ? 'atlas-rig-m' : 'atlas-rig') : 'atlas', model); // OUTDIR=pasta: grava lá (testes de animação sem sobrescrever o atlas)
fs.mkdirSync(dest, { recursive: true });
const browser = await chromium.launch({ args: process.env.SOFTGL ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] }); // GPU por padrão (software leva ~1,2 s/quadro)
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://localhost:5174/labs/iso-poc/render3d.html?model=${model}&size=${size}&clip=${clip}&clips=1${process.env.RIG ? '&rig=1' : ''}${process.env.MIRROR ? '&mirror=1' : ''}${process.env.BRI ? '&bri=' + process.env.BRI : ''}${process.env.SAT ? '&sat=' + process.env.SAT : ''}`);
await page.waitForFunction(() => window.render3d?.ready, null, { timeout: 1200000 });
const { sheets, meta, info } = await page.evaluate(() => window.render3d);
let total = 0;
for (const [name, d] of Object.entries(sheets)) {
  const buf = Buffer.from(d.split(',')[1], 'base64'); total += buf.length;
  fs.writeFileSync(path.join(dest, `${name}.png`), buf);
}
if (process.env.SIZEMUL) meta.sizeMul = +process.env.SIZEMUL; // multiplicador de tamanho na tela (hero-sprites.js), para igualar a altura do herói base
fs.writeFileSync(path.join(dest, `${model}.json`), JSON.stringify(meta, null, 2));
console.log('ok', model, 'PNG total', (total / 1048576).toFixed(2), 'MiB', 'pivot', meta.pivot, 'tris', info.tris);
await browser.close();
