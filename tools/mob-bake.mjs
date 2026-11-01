// Fotografa UMA criatura do Meshy em 8 direções e grava public/assets/mobs/<id>.webp + .json (grade 4x2, mesma janela e âncora em todas as vistas).
// Uso: node tools/mob-bake.mjs <arquivo.glb> <id> [parte|-1=todas] [px-maior-lado=168]   (GLB em public/labs/iso-poc/art-local/<pasta>/; passe o caminho relativo a essa art-local, ex.: meshy-mobs/slime.glb)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const [file, id, part = '-1', max = '168'] = process.argv.slice(2);
if (!file || !id) { console.log('uso: node tools/mob-bake.mjs <pasta/arquivo.glb> <id> [parte] [px]'); process.exit(1); }
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 400, height: 300 } }); p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5174/labs/nature/glb.html'); await p.waitForFunction(() => window.glbReady, null, { timeout: 60000 });
const parts = await p.evaluate((f) => window.loadGlb(f), file); console.log(parts.length, 'peças no arquivo');
const r = await p.evaluate(([i, m]) => window.bakeDirs(i, { max: m }), [Number(part), Number(max)]);
fs.mkdirSync('test-results/mob-bake', { recursive: true }); fs.writeFileSync(`test-results/mob-bake/${id}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
const { png, ...meta } = r; fs.mkdirSync('public/assets/mobs', { recursive: true });
fs.writeFileSync(`public/assets/mobs/${id}.json`, JSON.stringify({ id, ...meta, src: file }, null, 1));
// índice das criaturas com arte (o jogo só pede os arquivos que estão aqui)
const idxPath = 'public/assets/mobs/index.json', ids = new Set(fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')).ids : []); ids.add(id);
fs.writeFileSync(idxPath, JSON.stringify({ ids: [...ids].sort() }, null, 1));
await b.close();
execFileSync('python', ['-c', `from PIL import Image; Image.open('test-results/mob-bake/${id}.png').save('public/assets/mobs/${id}.webp','WEBP',quality=88,method=6)`]);
console.log(id, 'célula', r.cell.join('×'), 'âncora', r.ax, r.ay, 'tam. do modelo', r.size.join('×'), '→ public/assets/mobs/' + id + '.webp');
