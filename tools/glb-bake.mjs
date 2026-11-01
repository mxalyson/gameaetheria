// Fotografa TODAS as peças dos GLB do Meshy (public/labs/iso-poc/art-local/meshy-cenario/*.glb) em test-results/glb-bake/<conjunto>_<n>.png + meta.json.
// Depois: python tools/meshy-pack.py (monta o atlas public/assets/nature/meshy.webp). Uso: node tools/glb-bake.mjs [max-px=230] [elevacao=40]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const max = Number(process.argv[2]) || 230, el = Number(process.argv[3]) || 40;
const dir = 'public/labs/iso-poc/art-local/meshy-cenario', dest = 'test-results/glb-bake'; fs.mkdirSync(dest, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const meta = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.glb'))) {
  const set = f.replace(/^Meshy_AI_/, '').replace(/_\d+_texture\.glb$/, '');
  const p = await b.newPage({ viewport: { width: 400, height: 300 } }); p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto('http://localhost:5174/labs/nature/glb.html'); await p.waitForFunction(() => window.glbReady, null, { timeout: 60000 });
  const parts = await p.evaluate((f) => window.loadGlb(f), f);
  for (const x of parts) {
    const r = await p.evaluate(([i, m, e]) => window.bakePart(i, { max: m, el: e }), [x.idx, max, el]);
    const name = `${set}_${x.idx}`; fs.writeFileSync(`${dest}/${name}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
    const { png, ...m } = r; meta.push({ name, set, idx: x.idx, ...m }); console.log(name, `${m.w}×${m.h}`, 'âncora', m.ax, m.ay);
  }
  await p.close();
}
fs.writeFileSync(`${dest}/meta.json`, JSON.stringify(meta, null, 1)); await b.close();
