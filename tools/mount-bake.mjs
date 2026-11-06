// Assa uma MONTARIA (GLB do Meshy) em 8 direções x N quadros de ciclo e grava public/assets/mounts/<id>-3d.webp (alta) + <id>-3d-lo.webp (baixa) + <id>-3d.json.
// Reaproveita a página labs/nature/glb.html (bakeAnim), mas NÃO toca em public/assets/mobs nem no índice de mobs.
// Uso: node tools/mount-bake.mjs <pasta/arquivo.glb> <id> [parte|-1|"a,b"] [estilo trot|flap|hop|waddle] [quadros=6] [px-alta=176] [elev=40] [--saddle=fx,fy,fz] [--idle] [--lo=112] [--yaw=graus] [--list]
//   GLB em public/labs/iso-poc/art-local/ (caminho relativo, ex.: meshy-cenario/mount-frostpack-scout.glb).
//   --saddle: ponto da SELA em fração da caixa do modelo no pose original: fx = deslocamento lateral (-0.5..0.5 de x), fy = altura (0 chão..1 topo), fz = ao longo do corpo (-0.5 rabo .. 0.5 focinho).
//   --idle: quadro extra sem deformação, usado parado (índice = quadros).
// Saída json: frames, idle, cols, rows=8 (linha = direção 0 S,1 SE,2 L,3 NE,4 N,5 NO,6 O,7 SO = para onde a montaria olha), feet, saddle[8] (quadro parado) e saddleF[8][quadros] em FRAÇÃO da célula.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [file, id, part = '-1', style = 'trot', frames = '6', max = '176', elev = '40'] = pos;
if (!file || !id) { console.log('uso: node tools/mount-bake.mjs <pasta/arquivo.glb> <id> [parte] [estilo] [quadros] [px] [elev] [--saddle=fx,fy,fz] [--idle] [--lo=112] [--list]'); process.exit(1); }
const OUT = 'public/assets/mounts', TMP = 'test-results/mount-bake';
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); // PW_CHROMIUM: navegador já instalado (versão do Playwright diferente)
const p = await b.newPage({ viewport: { width: 400, height: 300 } }); p.on('pageerror', (e) => console.log('pageerror', e.message));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.wasm': 'application/wasm' };
await p.route('http://localhost:5174/**', (route) => { // serve public/ do disco (sem servidor no ar)
  const f = path.join('public', decodeURIComponent(new URL(route.request().url()).pathname));
  if (!f.startsWith('public') || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: '' });
  route.fulfill({ status: 200, contentType: MIME[path.extname(f)] ?? 'application/octet-stream', body: fs.readFileSync(f) });
});
await p.goto('http://localhost:5174/labs/nature/glb.html'); await p.waitForFunction(() => window.glbReady, null, { timeout: 60000 });
let parts = await p.evaluate((f) => window.loadGlb(f), file);
const partArg0 = part.includes(',') ? part.split(',').map(Number) : Number(part);
if (flags.yaw) parts = await p.evaluate(([i, d]) => window.yawParts(i, d), [partArg0, Number(flags.yaw)]); // --yaw=graus: gira o modelo para a frente ficar em +Z
if (flags.list) { console.log(JSON.stringify(parts)); await b.close(); process.exit(0); }
const partArg = part.includes(',') ? part.split(',').map(Number) : Number(part);
// tamanho do conjunto escolhido (para converter a fração da sela em coordenadas do modelo, relativas ao pé = centro x/z e mínimo y)
const sel = (Array.isArray(partArg) ? partArg : partArg < 0 ? parts.map((q) => q.idx) : [partArg]).map((i) => parts[i]);
const mn = [0, 1, 2].map((k) => Math.min(...sel.map((q) => q.min[k]))), mx = [0, 1, 2].map((k) => Math.max(...sel.map((q) => q.min[k] + q.size[k])));
const size = mx.map((v, k) => v - mn[k]);
const [fx, fy, fz] = (flags.saddle ?? '0,0.7,0').split(',').map(Number);
const saddle3 = [fx * size[0], fy * size[1], fz * size[2]];
const r = await p.evaluate(([i, o]) => window.bakeAnim(i, o), [partArg, { style, frames: Number(frames), max: Number(max), el: Number(elev), idle: !!flags.idle, track: [saddle3] }]);
await b.close();
fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${TMP}/${id}-grid.png`, Buffer.from(r.png.split(',')[1], 'base64'));
const [W, H] = r.cell, NF = r.cols, lo = Number(flags.lo ?? 112);
// recorta TODAS as células na mesma caixa justa (mesma janela em todas as vistas: a montaria não "pula" ao virar) e grava alta e baixa
const py = `from PIL import Image
import json
g=Image.open('${TMP}/${id}-grid.png').convert('RGBA'); W,H,NF=${W},${H},${NF}
x0,y0,x1,y1=W,H,0,0
for k in range(8):
  for f in range(NF):
    bb=g.crop((f*W,k*H,(f+1)*W,(k+1)*H)).getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()
    if bb: x0=min(x0,bb[0]);y0=min(y0,bb[1]);x1=max(x1,bb[2]);y1=max(y1,bb[3])
m=2; x0=max(0,x0-m);y0=max(0,y0-m);x1=min(W,x1+m);y1=min(H,y1+m); cw,ch=x1-x0,y1-y0
o=Image.new('RGBA',(cw*NF,ch*8))
for k in range(8):
  for f in range(NF): o.paste(g.crop((f*W+x0,k*H+y0,f*W+x1,k*H+y1)),(f*cw,k*ch))
o.save('${OUT}/${id}-3d.webp','WEBP',quality=90,method=6,exact=True)
s=${lo}/max(cw,ch); lw,lh=round(cw*s),round(ch*s)
ol=Image.new('RGBA',(lw*NF,lh*8))
for k in range(8):
  for f in range(NF): ol.paste(o.crop((f*cw,k*ch,(f+1)*cw,(k+1)*ch)).resize((lw,lh),Image.LANCZOS),(f*lw,k*lh))
ol.save('${OUT}/${id}-3d-lo.webp','WEBP',quality=90,method=6,exact=True)
print(json.dumps([cw,ch,x0,y0,lw,lh]))`;
const [cw, ch, bx0, by0, lw, lh] = JSON.parse(execFileSync('python', ['-c', py]).toString().trim().split('\n').pop());
const rnd = (v) => +v.toFixed(4), tr = r.tracks[0]; // tr[direção][quadro] = [px,py] na célula original
const frac = ([x, y]) => [rnd((x - bx0) / cw), rnd((y - by0) / ch)];
const nIdle = r.idle ? r.frames : 0;
const saddleF = tr.map((row) => row.map(frac));
const rx = 0.3 * Math.max(size[0], size[2]) * r.ppm / cw;
const meta = {
  id, src: file, style, frames: r.frames, idle: !!r.idle, cols: NF, rows: 8, views: ['S', 'SE', 'L', 'NE', 'N', 'NO', 'O', 'SO'],
  sizes: { hi: { file: `${id}-3d.webp`, w: cw * NF, h: ch * 8, cell: [cw, ch], bytes_decoded: cw * NF * ch * 8 * 4 }, lo: { file: `${id}-3d-lo.webp`, w: lw * NF, h: lh * 8, cell: [lw, lh], bytes_decoded: lw * NF * lh * 8 * 4 } },
  aspect: rnd(cw / ch), ppm: rnd(r.ppm), size: size.map(rnd),
  feet: frac([r.ax, r.ay]), saddle: saddleF.map((row) => row[r.idle ? nIdle : 0]), saddleF,
  shadow: [...frac([r.ax, r.ay]), rnd(rx), rnd(rx * 0.42 * cw / ch)], // elipse no chão (fração da célula; ry em fração da altura)
};
fs.writeFileSync(`${OUT}/${id}-3d.json`, JSON.stringify(meta));
console.log(id, 'célula', cw + '×' + ch, 'x', NF, 'quadros; textura alta', (meta.sizes.hi.bytes_decoded / 1048576).toFixed(2), 'MiB, baixa', (meta.sizes.lo.bytes_decoded / 1048576).toFixed(2), 'MiB; sela vista 2:', meta.saddle[2], 'pés', meta.feet);
