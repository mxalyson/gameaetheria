// Props "assados" (árvores, arbustos, pedras, tufos, brilho e sombra). Arte por código, resolução 1,5x; luz fixa do alto-esquerda.
import { makeRng } from '../../../src/core/rng.js';
const TAU = Math.PI * 2;

export function makeSprite(w, h, px, py, draw, bake = 1.5) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * bake); canvas.height = Math.ceil(h * bake);
  const g = canvas.getContext('2d');
  g.scale(bake, bake);
  draw(g);
  return { canvas, w, h, px, py, bytes: canvas.width * canvas.height * 4 };
}
export function drawSprite(g, s, x, y, size = 1, alpha = 1) {
  if (alpha !== 1) g.globalAlpha = alpha;
  g.drawImage(s.canvas, x - s.px * size, y - s.py * size, s.w * size, s.h * size);
  if (alpha !== 1) g.globalAlpha = 1;
}

const blob = (g, cx, cy, r, [light, base, dark], outline = 'rgba(20,50,40,0.35)') => {
  const gr = g.createRadialGradient(cx - r * 0.38, cy - r * 0.42, r * 0.1, cx, cy, r * 1.05);
  gr.addColorStop(0, light); gr.addColorStop(0.5, base); gr.addColorStop(1, dark);
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fillStyle = gr; g.fill();
  g.lineWidth = 1; g.strokeStyle = outline; g.stroke();
};

const PALETTES = [
  ['#c4f58a', '#5fbf5a', '#2b7c53'], ['#a8ecb0', '#41b08c', '#22706c'], ['#eef59a', '#8fcb5c', '#3f8c4b'], ['#ffe49a', '#f1a83e', '#b45f2c'],
];

export function bakeOak(variant, seed) {
  const rng = makeRng(seed * 977 + variant), pal = PALETTES[variant % PALETTES.length];
  return makeSprite(200, 250, 100, 232, (g) => {
    // raízes e tronco
    const tg = g.createLinearGradient(80, 0, 120, 0); tg.addColorStop(0, '#9b7655'); tg.addColorStop(0.5, '#6a4b37'); tg.addColorStop(1, '#3d2a21');
    g.beginPath(); g.moveTo(78, 232); g.quadraticCurveTo(90, 224, 90, 205); g.lineTo(92, 138); g.lineTo(110, 138); g.lineTo(111, 205); g.quadraticCurveTo(112, 224, 126, 232); g.closePath();
    g.fillStyle = tg; g.fill(); g.lineWidth = 1.4; g.strokeStyle = '#2a1b17'; g.stroke();
    g.strokeStyle = 'rgba(30,18,14,0.35)'; g.lineWidth = 1;
    for (let k = 0; k < 6; k++) { const x = 93 + k * 3; g.beginPath(); g.moveTo(x, 228 - k * 2); g.quadraticCurveTo(x + rng.range(-2, 2), 190, x + rng.range(-1, 2), 142); g.stroke(); }
    // copa: bolhas de folhagem de trás para frente
    g.beginPath(); g.ellipse(100, 150, 62, 18, 0, 0, TAU); g.fillStyle = 'rgba(10,40,30,0.35)'; g.fill();
    const blobs = [];
    for (let k = 0; k < 17; k++) { const a = (k / 17) * TAU + rng.range(-0.2, 0.2), rr = rng.range(26, 56); blobs.push({ x: 100 + Math.cos(a) * rr * 0.95, y: 100 + Math.sin(a) * rr * 0.72, r: rng.range(21, 33) }); }
    blobs.sort((a, b) => a.y - b.y);
    for (const b of blobs) blob(g, b.x, b.y, b.r, [pal[0], pal[1], pal[2]]);
    blob(g, 96, 90, 34, [pal[0], pal[1], pal[2]]);
    // folhas de destaque (luz) e frestas escuras
    for (let k = 0; k < 34; k++) { const a = rng.range(Math.PI * 0.9, Math.PI * 1.95), rr = rng.range(10, 58); g.beginPath(); g.ellipse(100 + Math.cos(a) * rr, 96 + Math.sin(a) * rr * 0.75, rng.range(3, 6.5), rng.range(1.6, 3), rng.range(0, 3), 0, TAU); g.fillStyle = `rgba(255,255,230,${rng.range(0.18, 0.4)})`; g.fill(); }
    for (let k = 0; k < 16; k++) { const a = rng.range(0, TAU), rr = rng.range(16, 56); g.beginPath(); g.ellipse(100 + Math.cos(a) * rr, 104 + Math.sin(a) * rr * 0.7, rng.range(3, 6), rng.range(1.5, 3), rng.range(0, 3), 0, TAU); g.fillStyle = 'rgba(10,50,40,0.28)'; g.fill(); }
  });
}

export function bakePine(variant, seed) {
  const rng = makeRng(seed * 131 + variant);
  return makeSprite(170, 290, 85, 276, (g) => {
    g.fillStyle = '#5a4034'; g.fillRect(80, 236, 11, 40); g.strokeStyle = '#2a1b17'; g.lineWidth = 1.2; g.strokeRect(80, 236, 11, 40);
    const tiers = 5;
    for (let t = 0; t < tiers; t++) {
      const y0 = 246 - t * 40, w = 64 - t * 9, top = y0 - 62 + t * 4;
      const gr = g.createLinearGradient(85 - w, 0, 85 + w, 0); gr.addColorStop(0, '#8ae0b0'); gr.addColorStop(0.45, '#33a380'); gr.addColorStop(1, '#17584f');
      g.beginPath(); g.moveTo(85, top);
      const n = 6;
      for (let k = 0; k <= n; k++) { const x = 85 + w - (2 * w * k) / n, y = y0 + (k % 2 ? 8 : -2) + rng.range(-1.5, 1.5); g.lineTo(x, y); }
      g.closePath(); g.fillStyle = gr; g.fill(); g.lineWidth = 1.2; g.strokeStyle = 'rgba(10,50,45,0.55)'; g.stroke();
      g.beginPath(); g.moveTo(85, top + 3); g.lineTo(85 - w * 0.55, y0 - 12); g.lineTo(85 - w * 0.2, y0 - 14); g.closePath(); g.fillStyle = 'rgba(230,255,235,0.22)'; g.fill();
    }
  });
}

export function bakeBush(variant, seed) {
  const rng = makeRng(seed * 53 + variant), pal = PALETTES[variant % 3];
  return makeSprite(110, 80, 55, 68, (g) => {
    g.beginPath(); g.ellipse(55, 66, 40, 9, 0, 0, TAU); g.fillStyle = 'rgba(10,40,30,0.3)'; g.fill();
    const bl = [[30, 50, 20], [80, 50, 20], [55, 38, 27], [38, 34, 17], [72, 34, 17], [55, 24, 14]];
    for (const [x, y, r] of bl) blob(g, x, y, r, pal);
    for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(rng.range(25, 85), rng.range(28, 56), 2.6, 0, TAU); g.fillStyle = '#ff6f8e'; g.fill(); g.lineWidth = 0.8; g.strokeStyle = '#8a2038'; g.stroke(); }
  });
}

export function bakeRock(variant, seed) {
  const rng = makeRng(seed * 71 + variant);
  return makeSprite(100, 76, 50, 64, (g) => {
    g.beginPath(); g.ellipse(52, 62, 38, 8, 0, 0, TAU); g.fillStyle = 'rgba(20,30,40,0.3)'; g.fill();
    const pts = [[12, 58], [8, 38], [22, 18], [50, 8], [78, 20], [92, 42], [88, 60]];
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x + rng.range(-2, 2), y + rng.range(-2, 2)) : g.moveTo(x, y))); g.closePath();
    const gr = g.createLinearGradient(10, 10, 90, 62); gr.addColorStop(0, '#c9d2dc'); gr.addColorStop(0.5, '#8d9bab'); gr.addColorStop(1, '#4e5b6e');
    g.fillStyle = gr; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#2b3442'; g.lineJoin = 'round'; g.stroke();
    g.beginPath(); g.moveTo(22, 18); g.lineTo(50, 8); g.lineTo(60, 30); g.lineTo(30, 38); g.closePath(); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fill();
    g.beginPath(); g.ellipse(34, 16, 22, 6, -0.2, 0, TAU); g.fillStyle = 'rgba(110,190,110,0.75)'; g.fill();
  });
}

export function bakeTuft(variant) {
  const rng = makeRng(variant + 5);
  return makeSprite(44, 40, 22, 36, (g) => {
    for (let k = 0; k < 9; k++) {
      const x = 8 + k * 3.5, h = rng.range(16, 32), lean = rng.range(-8, 8);
      g.beginPath(); g.moveTo(x - 1.6, 36); g.quadraticCurveTo(x + lean * 0.3, 36 - h * 0.6, x + lean, 36 - h); g.quadraticCurveTo(x + lean * 0.3 + 2, 36 - h * 0.5, x + 1.6, 36); g.closePath();
      g.fillStyle = k % 3 === 0 ? '#9be66a' : k % 3 === 1 ? '#52b855' : '#2f8a4c'; g.fill();
    }
  });
}

export function bakeFlower(color) {
  return makeSprite(26, 38, 13, 34, (g) => {
    g.strokeStyle = '#2f8a4c'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(13, 36); g.quadraticCurveTo(12, 24, 13, 15); g.stroke();
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; g.beginPath(); g.ellipse(13 + Math.cos(a) * 4.2, 13 + Math.sin(a) * 4.2, 3.6, 2.6, a, 0, TAU); g.fillStyle = color; g.fill(); g.lineWidth = 0.7; g.strokeStyle = 'rgba(70,30,60,0.5)'; g.stroke(); }
    g.beginPath(); g.arc(13, 13, 2.3, 0, TAU); g.fillStyle = '#ffd34d'; g.fill();
  });
}

const glowCache = new Map();
// Brilho aditivo de uma cor (hex ou rgb): gradiente radial 64x64, desenhado com 'lighter'.
export function glowSprite(color) {
  let s = glowCache.get(color);
  if (s) return s;
  s = makeSprite(64, 64, 32, 32, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }, 1);
  glowCache.set(color, s);
  return s;
}
