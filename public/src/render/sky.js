// Dia e noite (só apresentação): cor do ar por hora do dia, luz de lampiões/braseiros/portais, halo de lanterna do herói, vaga-lumes e estrelas.
// A regra do relógio vive em core/daycycle.js (pura, testada); aqui só se desenha. Um gancho no renderer: drawDayNight(g, world, cam, ww, wh, zoom, player, quality).
//   - Hora: relógio de parede (12 min reais = 1 dia). `?hora=22` (0-24) fixa a hora para teste/captura; setHora(22) no console faz o mesmo; setHora(null) volta ao relógio.
//   - Sempre ligado (sem opção para desligar). Arenas (círculo) têm luz fixa.
//   - Custo: 1 retângulo de cor + 1 vinheta em tela pequena (metade da resolução) + sprites de luz (drawImage) pré-renderizados. Qualidade baixa: só o retângulo e o halo.
import { dayPhase, hourFromMs, parseHora, zoneHasCycle } from '../core/daycycle.js';

const TAU = Math.PI * 2;
const hash = (i, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const mod = (a, n) => ((a % n) + n) % n;

// ---------- hora e modo ----------
let fixedHour; // undefined = ainda não lido do endereço; null = sem hora fixa
export function setHora(h) { fixedHour = h == null ? null : mod(Number(h) || 0, 24); }
export function currentHour() {
  if (fixedHour === undefined) { try { fixedHour = parseHora(globalThis.location?.search); } catch { fixedHour = null; } }
  return fixedHour ?? hourFromMs(Date.now());
}
if (typeof globalThis === 'object') globalThis.setHora = setHora; // atalho de QA no console

// ---------- cor do ar: [hora, r, g, b, alfa] (interpolado; fora do dia o alfa sobe) ----------
const KEYS = [
  [0, 12, 20, 58, 0.52], [5.5, 14, 24, 64, 0.52], [6.25, 255, 140, 90, 0.2], [7, 255, 200, 140, 0],
  [21, 255, 200, 140, 0], [21.75, 255, 110, 140, 0.22], [22.5, 14, 24, 64, 0.52], [24, 12, 20, 58, 0.52],
];
const TINT = [0, 0, 0, 0];
export function skyTint(hour, out = TINT) {
  const h = mod(hour, 24);
  let i = 0; while (i < KEYS.length - 2 && h >= KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1], u = (h - a[0]) / (b[0] - a[0] || 1), s = u * u * (3 - 2 * u);
  for (let k = 0; k < 4; k++) out[k] = a[k + 1] + (b[k + 1] - a[k + 1]) * s;
  return out;
}
// quanto a zona escurece (Ruínas e Cume mais fechados; Cinzas têm brasa própria)
const ZONE_DARK = { town: 0.85, harbor: 0.85, forest: 1, plains: 0.95, ruins: 1.3, glacier: 1.15, ember: 0.9 };

// ---------- sprites de luz (criados uma vez) ----------
let sprites = null;
function radial(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  x.fillStyle = gr; x.fillRect(0, 0, size, size);
  return c;
}
function getSprites() {
  if (sprites) return sprites;
  const v = document.createElement('canvas'); v.width = 128; v.height = 128;
  const vx = v.getContext('2d'), vg = vx.createRadialGradient(64, 64, 30, 64, 64, 92);
  vg.addColorStop(0, 'rgba(4,8,30,0)'); vg.addColorStop(1, 'rgba(4,8,30,0.85)');
  vx.fillStyle = vg; vx.fillRect(0, 0, 128, 128);
  sprites = {
    hole: radial(128, [[0, 'rgba(0,0,0,1)'], [0.4, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']]), // fura a escuridão
    warm: radial(128, [[0, 'rgba(255,200,110,0.9)'], [0.45, 'rgba(255,150,60,0.32)'], [1, 'rgba(255,120,40,0)']]),
    violet: radial(128, [[0, 'rgba(200,160,255,0.85)'], [0.45, 'rgba(150,100,255,0.3)'], [1, 'rgba(120,80,255,0)']]),
    fly: radial(32, [[0, 'rgba(235,255,150,1)'], [0.35, 'rgba(190,240,110,0.45)'], [1, 'rgba(160,230,90,0)']]),
    ember: radial(32, [[0, 'rgba(255,230,160,1)'], [0.4, 'rgba(255,140,60,0.5)'], [1, 'rgba(255,90,30,0)']]),
    vig: v,
  };
  return sprites;
}

// Fontes de luz fixas por layout (lampiões, braseiros) + portais da zona. Montadas uma vez por zona.
const LIGHTS = new WeakMap();
function lightsOf(world) {
  let l = LIGHTS.get(world.layout);
  if (l) return l;
  l = [];
  for (const d of world.layout.decor) {
    if (d.type === 'lantern') l.push({ x: d.x, y: d.y - 46, r: 150, s: 'warm' });
    else if (d.type === 'brazier') l.push({ x: d.x, y: d.y - 22, r: 170, s: 'warm' });
  }
  for (const p of world.zone.portals ?? []) l.push({ x: p.x, y: p.y - 10, r: 210, s: 'violet' });
  LIGHTS.set(world.layout, l);
  return l;
}

let ov = null, ovg = null;
const MAX_LIGHTS = 26;

// Desenha o ar da hora por cima do mundo (antes das barras e nomes: legíveis à noite). `g` já está na transformação do mundo (zoom e câmera).
export function drawDayNight(g, world, cam, ww, wh, zoom, player, quality = 2) {
  const z = world.zone;
  if (!zoneHasCycle(z)) return;
  const hour = currentHour(), ph = dayPhase(hour), lit = ph.dark;
  const tint = skyTint(hour), kind = z.scenery?.kind, zm = ZONE_DARK[kind] ?? 1;
  const alpha = Math.min(0.78, tint[3] * zm);
  if (alpha < 0.01 && lit < 0.02) return;
  const px = player ? player.x : cam.x + ww / 2, py = player ? player.y - 10 : cam.y + wh / 2;
  const col = `rgba(${tint[0] | 0},${tint[1] | 0},${tint[2] | 0},`;

  if (quality === 0) { // baixa: um retângulo e o halo aditivo do herói
    g.fillStyle = col + (alpha * 0.85).toFixed(3) + ')'; g.fillRect(cam.x, cam.y, ww, wh);
    if (lit > 0.05) glow(g, getSprites().warm, px, py, 190, 0.22 * lit);
    return;
  }

  const S = getSprites();
  const ow = Math.max(2, Math.round(ww * zoom * 0.5)), oh = Math.max(2, Math.round(wh * zoom * 0.5)), k = ow / ww;
  if (!ov) { ov = document.createElement('canvas'); ovg = ov.getContext('2d'); }
  if (ov.width !== ow || ov.height !== oh) { ov.width = ow; ov.height = oh; }
  ovg.globalCompositeOperation = 'source-over'; ovg.globalAlpha = 1;
  ovg.clearRect(0, 0, ow, oh);
  ovg.fillStyle = col + alpha.toFixed(3) + ')'; ovg.fillRect(0, 0, ow, oh);
  if (lit > 0.05) { ovg.globalAlpha = Math.min(1, lit * 0.8 * zm); ovg.drawImage(S.vig, 0, 0, ow, oh); ovg.globalAlpha = 1; }

  // buracos na escuridão: halo do herói e fontes de luz visíveis
  if (lit > 0.05) {
    ovg.globalCompositeOperation = 'destination-out';
    hole(ovg, S.hole, (px - cam.x) * k, (py - cam.y) * k, 230 * k, 0.92 * lit);
    const ls = lightsOf(world); let n = 0;
    for (let i = 0; i < ls.length && n < MAX_LIGHTS; i++) {
      const L = ls[i];
      if (L.x < cam.x - L.r || L.x > cam.x + ww + L.r || L.y < cam.y - L.r || L.y > cam.y + wh + L.r) continue;
      hole(ovg, S.hole, (L.x - cam.x) * k, (L.y - cam.y) * k, L.r * k, 0.8 * lit); n++;
    }
    ovg.globalCompositeOperation = 'source-over';
  }
  g.drawImage(ov, cam.x, cam.y, ww, wh);

  if (lit <= 0.05) return;
  // brilho aditivo: lanterna quente do herói, luzes e (extras) vaga-lumes, estrelas, brasas
  const t = world.time;
  g.globalCompositeOperation = 'lighter';
  glow(g, S.warm, px, py + 6, 150, 0.2 * lit);
  const ls = lightsOf(world); let n = 0;
  for (let i = 0; i < ls.length && n < MAX_LIGHTS; i++) {
    const L = ls[i];
    if (L.x < cam.x - L.r || L.x > cam.x + ww + L.r || L.y < cam.y - L.r || L.y > cam.y + wh + L.r) continue;
    glow(g, S[L.s], L.x, L.y, L.r * 0.8, (L.s === 'warm' ? 0.5 : 0.4) * lit * (0.9 + 0.1 * Math.sin(t * 7 + L.x)));
    n++;
  }
  if (kind === 'ember') emberNight(g, world, cam, ww, wh, t, lit, quality, S);
  else {
    const flies = quality >= 2 ? 14 : 7;
    for (let i = 0; i < flies; i++) { // vaga-lumes: derivam devagar e piscam (posição por hash, sem estado)
      const x = cam.x + mod(hash(i, 1) * ww + Math.sin(t * 0.3 + i * 2.1) * 40, ww), y = cam.y + mod(hash(i, 2) * wh + Math.cos(t * 0.25 + i * 1.7) * 30, wh);
      glow(g, S.fly, x, y, 9, lit * Math.max(0, Math.sin(t * 1.6 + i * 3.3)) * 0.9);
    }
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  if (quality >= 2 && lit > 0.5) { // estrelas leves no alto da tela
    g.fillStyle = '#fff';
    for (let i = 0; i < 26; i++) {
      g.globalAlpha = (lit - 0.3) * 0.7 * (0.35 + 0.65 * Math.max(0, Math.sin(t * (0.8 + hash(i, 5)) + i * 4.1)));
      g.fillRect(cam.x + hash(i, 3) * ww, cam.y + hash(i, 4) * wh * 0.4, 1.6, 1.6);
    }
    g.globalAlpha = 1;
  }
}

// Cinzas Ardentes à noite: o rio de lava e as brasas ficam brilhantes (aditivo).
function emberNight(g, world, cam, ww, wh, t, lit, quality, S) {
  let n = 0;
  for (const rv of world.layout.rivers ?? []) {
    for (let i = 0; i < rv.pts.length && n < 10; i += 4) {
      const p = rv.pts[i];
      if (p.x < cam.x - 200 || p.x > cam.x + ww + 200 || p.y < cam.y - 200 || p.y > cam.y + wh + 200) continue;
      glow(g, S.warm, p.x, p.y, rv.w * 0.95, 0.45 * lit * (0.75 + 0.25 * Math.sin(t * 1.6 + i)));
      n++;
    }
  }
  const sparks = quality >= 2 ? 24 : 10;
  for (let i = 0; i < sparks; i++) {
    const x = cam.x + mod(hash(i, 7) * ww + Math.sin(t * 0.6 + i) * 24, ww), y = cam.y + mod(hash(i, 8) * wh - t * (14 + hash(i, 9) * 18), wh);
    glow(g, S.ember, x, y, 6 + hash(i, 10) * 4, lit * (0.5 + 0.5 * Math.sin(t * 3 + i * 2.2)));
  }
}

function hole(c, spr, x, y, r, a) { c.globalAlpha = a; c.drawImage(spr, x - r, y - r, r * 2, r * 2); c.globalAlpha = 1; }
function glow(g, spr, x, y, r, a) { if (a <= 0.01) return; g.globalAlpha = Math.min(1, a); g.drawImage(spr, x - r, y - r, r * 2, r * 2); g.globalAlpha = 1; }
