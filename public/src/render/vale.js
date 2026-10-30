// Protótipo visual (Fase 3): Vale de Auren como diorama isométrico em Canvas 2D.
// Autônomo: não toca no jogo. Serve para validar o padrão visual antes de levá-lo ao renderer principal.
// Projeção isométrica 2:1; altura em "degraus" (HZ px). Luz vem da esquerda: face esquerda clara, direita escura.
import { makeRng, hashString } from '../core/rng.js';
import { shade } from './renderer.js';

// shade() monta strings de cor; memoizar evita refazê-las a cada quadro.
const shadeCache = new Map();
const sh = (hex, amt) => {
  const k = hex + amt;
  let v = shadeCache.get(k);
  if (!v) shadeCache.set(k, (v = shade(hex, amt)));
  return v;
};

const TAU = Math.PI * 2;
const N = 18, TW = 72, TH = 36, HZ = 18, BASE = -2.5, WATER = 0.7;

// Rio: desce em degraus (cachoeiras) e despenca pela borda do diorama. Degraus só em passos +x/+y (face visível).
const RIVER = [[14, 0], [14, 1], [14, 2], [14, 3], [13, 3], [13, 4], [13, 5], [13, 6], [12, 6], [12, 7], [12, 8], [12, 9],
  [11, 9], [11, 10], [11, 11], [10, 11], [10, 12], [10, 13], [10, 14], [10, 15], [10, 16], [10, 17]];
const RIVER_L = RIVER.map((_, i) => (i <= 6 ? 3 : i <= 13 ? 2 : 1));
const PLATEAU = { x0: 4, y0: 3, x1: 8, y1: 7 };
const HERO = { x: 6.5, y: 9.2 };

const P = (x, y, z = 0) => [(x - y) * TW / 2, (x + y) * TH / 2 - z * HZ];
const rnd = (a, b, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function poly(g, pts, fill, stroke) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
}
const ell = (g, x, y, rx, ry, fill) => { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); };

const STONE = { top: '#d3cee0', left: '#aaa5bd', right: '#7c7791' };
const WOOD = { top: '#b98a58', left: '#9a6c3f', right: '#6e4a2a' };

function isoBox(g, x, y, z, w, d, hh, c, joints = true) {
  poly(g, [P(x, y + d, z + hh), P(x + w, y + d, z + hh), P(x + w, y + d, z), P(x, y + d, z)], c.left, c.left);
  poly(g, [P(x + w, y, z + hh), P(x + w, y + d, z + hh), P(x + w, y + d, z), P(x + w, y, z)], c.right, c.right);
  poly(g, [P(x, y, z + hh), P(x + w, y, z + hh), P(x + w, y + d, z + hh), P(x, y + d, z + hh)], c.top, c.top);
  if (!joints) return;
  g.strokeStyle = 'rgba(40,36,60,0.28)'; g.lineWidth = 1;
  for (let k = 1; k < Math.ceil(hh * 2.5); k++) {
    const zz = z + k / 2.5;
    if (zz >= z + hh) break;
    g.beginPath();
    let a = P(x, y + d, zz), b = P(x + w, y + d, zz); g.moveTo(...a); g.lineTo(...b);
    a = P(x + w, y, zz); b = P(x + w, y + d, zz); g.moveTo(...a); g.lineTo(...b);
    g.stroke();
  }
}

export class Vale {
  constructor(canvas, { fixedTime = null } = {}) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.fixedTime = fixedTime;
    this.stats = { frames: 0, avgMs: 0, maxMs: 0 };
    this.build();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.t0 = performance.now();
    requestAnimationFrame(() => this.loop());
  }

  // ---------- geração determinística ----------
  build() {
    const riverAt = new Map(RIVER.map(([x, y], i) => [y * N + x, i]));
    const grid = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let ws = 0, wl = 0;
      RIVER.forEach(([rx, ry], i) => { const w = 1 / ((x - rx) ** 2 + (y - ry) ** 2 + 1.5); ws += w; wl += w * RIVER_L[i]; });
      const slope = 1 - (x + y) / (2 * N);
      let h = Math.round((wl / ws) * 0.6 + slope * 1.8 + 0.7 + (rnd(x, y) - 0.5) * 0.8);
      h = Math.max(1, Math.min(4, h));
      const ri = riverAt.get(y * N + x) ?? -1;
      grid.push({ x, y, h: ri >= 0 ? RIVER_L[ri] : h, type: ri >= 0 ? 'water' : 'grass', river: ri });
    }
    const at = (x, y) => (x >= 0 && y >= 0 && x < N && y < N ? grid[y * N + x] : null);
    for (const t of grid) if (t.river >= 0) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nb = at(t.x + dx, t.y + dy);
        if (nb && nb.river < 0) nb.h = Math.max(nb.h, t.h + 1);
      }
    }
    for (let y = PLATEAU.y0; y <= PLATEAU.y1; y++) for (let x = PLATEAU.x0; x <= PLATEAU.x1; x++) {
      const t = at(x, y);
      t.h = 4;
      if (x > PLATEAU.x0 && x < PLATEAU.x1 && y > PLATEAU.y0 && y < PLATEAU.y1) t.type = 'ruin';
    }
    // Estrada: sai das ruínas, atravessa o rio por uma ponte e segue para leste.
    const road = [[6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8], [13, 8], [14, 8], [15, 8], [6, 9], [6, 10], [6, 11]];
    for (const [x, y] of road) { const t = at(x, y); t.type = 'path'; if (y === 8) t.h = 3; }
    at(6, 9).h = 3; at(6, 10).h = 3;
    this.grid = grid; this.at = at;
    this.byDepth = Array.from({ length: 2 * N }, () => []);
    for (const t of grid) this.byDepth[t.x + t.y].push(t);
    this.buildProps();
  }

  buildProps() {
    const rng = makeRng(hashString('vale-de-auren'));
    const props = [];
    const add = (o) => { o.z = this.at(Math.floor(o.x), Math.floor(o.y)).h; props.push(o); return o; };
    const LEAF = ['#4f9f62', '#5fb46c', '#3f8a6a', '#e0b350', '#7ac26a'];
    for (const t of this.grid) {
      if (t.type !== 'grass') continue;
      if (Math.hypot(t.x + 0.5 - HERO.x, t.y + 0.5 - HERO.y) < 1.6) continue;
      const onPlateau = t.x >= PLATEAU.x0 && t.x <= PLATEAU.x1 && t.y >= PLATEAU.y0 && t.y <= PLATEAU.y1;
      const r = rng.next();
      const tx = t.x + rng.range(0.25, 0.75), ty = t.y + rng.range(0.25, 0.75);
      const nearRuins = t.x >= 2 && t.x <= 10 && t.y >= 1 && t.y <= 9;
      if (!onPlateau && r < (nearRuins ? 0.14 : 0.27)) {
        const pine = t.h >= 3 || rng.chance(0.3);
        const leaf = rng.weighted([[LEAF[0], 3], [LEAF[1], 3], [LEAF[2], 2], [LEAF[3], 0.5], [LEAF[4], 2]]);
        add({ k: 'tree', x: tx, y: ty, s: rng.range(0.8, 1.25), shape: pine ? 'pine' : 'oak', leaf, trunk: '#7a5535' });
      } else if (r < 0.36) {
        add({ k: 'bush', x: tx, y: ty, s: rng.range(0.8, 1.2), leaf: rng.pick(LEAF) });
      } else if (r < 0.42) {
        add({ k: 'rock', x: tx, y: ty, s: rng.range(0.7, 1.3), seed: rng.next() });
      }
      if (rng.chance(0.4)) {
        const col = rng.pick(['#ffb3c7', '#ffffff', '#fff1a8', '#c7b3ff', '#ffa86b']);
        const dots = Array.from({ length: 5 }, () => [rng.range(-12, 12), rng.range(-5, 5)]);
        add({ k: 'flowers', x: t.x + rng.range(0.2, 0.8), y: t.y + rng.range(0.2, 0.8), col, dots });
      }
    }
    // Cristais mágicos ao redor das ruínas.
    [[3.5, 5.2, '#b48cff'], [9.5, 5.4, '#6fe3ff'], [4.3, 8.7, '#6fe3ff'], [8.9, 2.5, '#b48cff']].forEach(([x, y, col], i) => {
      add({ k: 'crystal', x, y, col, ph: i * 1.7, s: 0.9 + (i % 2) * 0.25 });
    });
    // Ruínas.
    const rz = 4;
    const ruin = (o) => { o.z = rz; props.push(o); };
    [[4.6, 7.3, 2.7, false], [8.0, 7.3, 1.5, true], [4.5, 4.3, 2.4, false], [8.1, 4.1, 1.1, true], [5.3, 3.9, 2.9, false], [7.7, 3.9, 1.9, true]]
      .forEach(([x, y, h, broken]) => ruin({ k: 'column', x, y, h, broken, seed: x * 7 + y }));
    ruin({ k: 'box', x: 5.15, y: 3.75, w: 1.8, d: 0.3, zo: 2.45, h: 0.42, front: 3.9 });
    ruin({ k: 'box', x: 4.1, y: 3.1, w: 2.4, d: 0.4, zo: 0, h: 1.3, crumble: true });
    ruin({ k: 'box', x: 7.1, y: 3.1, w: 1.8, d: 0.4, zo: 0, h: 0.8, crumble: true });
    ruin({ k: 'box', x: 4.1, y: 4.5, w: 0.4, d: 1.7, zo: 0, h: 0.9, crumble: true });
    ruin({ k: 'altar', x: 6.5, y: 5.5 });
    ruin({ k: 'fallen', x: 7.0, y: 6.7 });
    // Ponte sobre o rio, na altura das margens.
    props.push({ k: 'bridge', x: 11.35, y: 8.2, z: 3 });
    props.push({ k: 'hero', x: HERO.x, y: HERO.y, z: this.at(6, 9).h });
    props.forEach((o) => {
      const fx = o.k === 'box' ? o.x + o.w - 0.01 : o.k === 'bridge' ? 13.64 : o.x;
      const fy = o.k === 'box' ? o.y + o.d - 0.01 : o.k === 'bridge' ? 8.79 : o.y;
      o.depth = Math.floor(fx) + Math.floor(fy);
      o.sort = fx + fy;
    });
    this.propsByDepth = Array.from({ length: 2 * N }, () => []);
    for (const o of props) this.propsByDepth[o.depth].push(o);
    for (const b of this.propsByDepth) b.sort((a, b2) => a.sort - b2.sort);
    this.motes = Array.from({ length: 70 }, () => ({ x: rng.range(0, N), y: rng.range(0, N), z0: rng.range(0, 2), ph: rng.range(0, TAU), cool: rng.chance(0.5) }));
  }

  resize() {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.vw = innerWidth; this.vh = innerHeight;
    this.c.width = Math.round(this.vw * this.dpr);
    this.c.height = Math.round(this.vh * this.dpr);
    this.scale = Math.min(this.vw / 1360, this.vh / 960) * 0.98;
    this.bg = null;
    for (const t of this.grid ?? []) t.sprite = null;
  }

  loop() {
    const now = performance.now();
    const time = this.fixedTime ?? (now - this.t0) / 1000;
    this.draw(time);
    const ms = performance.now() - now;
    const s = this.stats;
    s.frames++; s.avgMs += (ms - s.avgMs) * 0.05; s.maxMs = Math.max(s.maxMs, ms);
    requestAnimationFrame(() => this.loop());
  }

  // ---------- desenho ----------
  draw(time) {
    const g = this.g, vw = this.vw, vh = this.vh;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const bg = g.createRadialGradient(vw * 0.45, vh * 0.4, 60, vw / 2, vh / 2, Math.max(vw, vh) * 0.8);
    bg.addColorStop(0, '#3b4a78'); bg.addColorStop(0.6, '#222c4d'); bg.addColorStop(1, '#0f1426');
    g.fillStyle = bg; g.fillRect(0, 0, vw, vh);

    const s = this.scale;
    g.setTransform(this.dpr * s, 0, 0, this.dpr * s, this.dpr * vw / 2, this.dpr * (vh / 2 - 290 * s));
    // Sombra da maquete sobre a mesa.
    g.save(); g.translate(0, P(N / 2, N / 2, BASE)[1] + 40); g.scale(1, 0.38);
    const sh = g.createRadialGradient(0, 0, 40, 0, 0, 700);
    sh.addColorStop(0, 'rgba(5,8,18,0.7)'); sh.addColorStop(1, 'rgba(5,8,18,0)');
    g.fillStyle = sh; g.beginPath(); g.arc(0, 0, 700, 0, TAU); g.fill(); g.restore();

    for (let d = 0; d < 2 * N - 1; d++) {
      for (const t of this.byDepth[d]) this.drawTile(g, t, time);
      for (const o of this.propsByDepth[d] ?? []) this.drawProp(g, o, time);
    }
    this.drawFallMist(g, time);
    this.drawMotes(g, time);

    // Pós-processamento em espaço de tela: luz quente, raios de sol, vinheta.
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const warm = g.createLinearGradient(0, 0, vw, vh);
    warm.addColorStop(0, 'rgba(255,196,120,0.14)'); warm.addColorStop(0.55, 'rgba(255,180,120,0)'); warm.addColorStop(1, 'rgba(30,40,110,0.22)');
    g.fillStyle = warm; g.fillRect(0, 0, vw, vh);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = vw * (0.1 + i * 0.17) + Math.sin(time * 0.2 + i) * 14;
      const gr = g.createLinearGradient(x, 0, x + vh * 0.5, vh);
      gr.addColorStop(0, 'rgba(255,214,150,0.07)'); gr.addColorStop(1, 'rgba(255,214,150,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 70, 0); g.lineTo(x + vh * 0.5 + 70, vh); g.lineTo(x + vh * 0.5 - 40, vh); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    const vg = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.4, vw / 2, vh / 2, Math.max(vw, vh) * 0.78);
    vg.addColorStop(0, 'rgba(8,10,24,0)'); vg.addColorStop(1, 'rgba(8,10,24,0.55)');
    g.fillStyle = vg; g.fillRect(0, 0, vw, vh);
  }

  face(g, side, t, zTop, zBot) {
    const { x, y } = t;
    const lipCol = t.type === 'ruin' ? '#a5a0b6' : t.type === 'path' ? '#c9a96c' : '#5ea34a';
    const k = side === 'R' ? -0.3 : -0.12;
    const soil = ['#8e5d38', '#7b4d2e'], rock = ['#908d9e', '#807d90', '#706d82'];
    let z1 = zTop, i = 0;
    while (z1 > zBot + 1e-6) {
      const z2 = Math.max(zBot, z1 - 1);
      const col = sh(i < 2 ? soil[i] : rock[(Math.round(z1) + 9) % 3], k);
      const pts = side === 'R'
        ? [P(x + 1, y, z1), P(x + 1, y + 1, z1), P(x + 1, y + 1, z2), P(x + 1, y, z2)]
        : [P(x, y + 1, z1), P(x + 1, y + 1, z1), P(x + 1, y + 1, z2), P(x, y + 1, z2)];
      poly(g, pts, col, col);
      // Veios e seixos da camada.
      g.strokeStyle = sh(col, -0.08); g.lineWidth = 1.5;
      g.beginPath();
      for (let n = 0; n < 3; n++) {
        const u = rnd(x, y, i * 7 + n + (side === 'R' ? 50 : 0)), v = 0.25 + rnd(x, y, i * 11 + n) * 0.5;
        const a = [pts[0][0] + (pts[1][0] - pts[0][0]) * u, pts[0][1] + (pts[1][1] - pts[0][1]) * u + (pts[3][1] - pts[0][1]) * v];
        g.moveTo(a[0], a[1]); g.lineTo(a[0] + (pts[1][0] - pts[0][0]) * 0.18, a[1] + (pts[1][1] - pts[0][1]) * 0.18);
      }
      g.stroke();
      z1 = z2; i++;
    }
    // Borda de grama (ou pedra) com contorno irregular.
    const A = P(side === 'R' ? x + 1 : x, side === 'R' ? y : y + 1, zTop), B = P(x + 1, y + 1, zTop);
    g.fillStyle = sh(lipCol, side === 'R' ? -0.2 : -0.06);
    for (let n = 0; n < 7; n++) {
      const u = (n + 0.5) / 7;
      g.beginPath();
      g.arc(A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u + 3, 5 + rnd(x, y, n) * 3, 0, TAU);
      g.fill();
    }
    g.strokeStyle = sh('#3b2a1c', k); g.lineWidth = 1;
  }

  // Terreno é estático: cada tile vira um sprite (topo + faces) gerado uma vez na escala atual.
  drawTile(g, t, time) {
    if (t.river >= 0) return this.drawWater(g, t, time);
    const s = t.sprite ?? this.bake(t);
    g.drawImage(s.cv, s.x, s.y, s.w, s.h);
  }

  bake(t) {
    const f = this.dpr * this.scale, pad = 12;
    const nr = this.at(t.x + 1, t.y), nl = this.at(t.x, t.y + 1);
    const zmin = Math.min(t.h, nr ? nr.h : BASE, nl ? nl.h : BASE);
    const x = P(t.x, t.y + 1, t.h)[0] - pad, y = P(t.x, t.y, t.h)[1] - pad;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((TW + 2 * pad) * f); cv.height = Math.ceil((TH + (t.h - zmin) * HZ + 2 * pad) * f);
    const g = cv.getContext('2d');
    g.scale(f, f); g.translate(-x, -y);
    this.paintLand(g, t);
    return (t.sprite = { cv, x, y, w: cv.width / f, h: cv.height / f });
  }

  paintLand(g, t) {
    const { x, y, h } = t;
    const nr = this.at(x + 1, y), nl = this.at(x, y + 1);
    const zr = nr ? nr.h : BASE, zl = nl ? nl.h : BASE;
    if (zr < h) this.face(g, 'R', t, h, zr);
    if (zl < h) this.face(g, 'L', t, h, zl);
    let base;
    if (t.type === 'path') base = ['#e4cb92', '#dcc085', '#e9d5a0'][Math.floor(rnd(x, y, 3) * 3)];
    else if (t.type === 'ruin') base = ['#bdb8cc', '#b1acc2'][(x + y) & 1];
    else base = sh(['#86c862', '#7cc05a', '#8fcf6c'][Math.floor(rnd(x, y, 3) * 3)], (h - 2) * 0.025 + ((x + y) & 1 ? 0.012 : 0));
    const top = [P(x, y, h), P(x + 1, y, h), P(x + 1, y + 1, h), P(x, y + 1, h)];
    poly(g, top, base, base);
    if (t.type === 'grass') {
      for (let n = 0; n < 5; n++) {
        const [px, py] = P(x + 0.12 + rnd(x, y, 20 + n) * 0.76, y + 0.12 + rnd(x, y, 30 + n) * 0.76, h);
        g.strokeStyle = sh(base, n & 1 ? -0.13 : 0.09); g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(px - 2, py); g.lineTo(px - 3, py - 5); g.moveTo(px, py); g.lineTo(px + 1, py - 6); g.moveTo(px + 2, py); g.lineTo(px + 4, py - 4); g.stroke();
      }
    } else if (t.type === 'path') {
      for (let n = 0; n < 4; n++) {
        const [px, py] = P(x + 0.15 + rnd(x, y, 40 + n) * 0.7, y + 0.15 + rnd(x, y, 50 + n) * 0.7, h);
        ell(g, px, py, 2.2, 1.2, sh(base, -0.12));
      }
    } else if (t.type === 'ruin') {
      g.strokeStyle = 'rgba(50,44,76,0.3)'; g.lineWidth = 1;
      g.beginPath();
      let a = P(x + 0.5, y, h), b = P(x + 0.5, y + 1, h); g.moveTo(...a); g.lineTo(...b);
      a = P(x, y + 0.5, h); b = P(x + 1, y + 0.5, h); g.moveTo(...a); g.lineTo(...b);
      g.stroke();
      if (rnd(x, y, 9) > 0.5) { const [px, py] = P(x + 0.4, y + 0.6, h); ell(g, px, py, 9, 4, 'rgba(95,160,74,0.5)'); }
    }
  }

  drawWater(g, t, time) {
    const { x, y } = t, zS = t.h + WATER;
    const top = [P(x, y, zS), P(x + 1, y, zS), P(x + 1, y + 1, zS), P(x, y + 1, zS)];
    poly(g, top, '#3fb0d4', '#3fb0d4');
    // Reflexos deslizando pela corrente.
    g.save();
    poly(g, top); g.clip();
    g.strokeStyle = 'rgba(220,248,255,0.5)'; g.lineWidth = 1.5;
    for (let n = 0; n < 4; n++) {
      const u = (rnd(x, y, 60 + n) + time * 0.22 * (0.6 + n * 0.2)) % 1;
      const v = rnd(x, y, 70 + n);
      const a = P(x + u, y + v, zS);
      g.beginPath(); g.moveTo(a[0] - 8, a[1] - 3); g.lineTo(a[0] + 8, a[1] + 3); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 2.5; g.stroke();
    g.restore();
    // Quedas d'água nos degraus e na borda do diorama.
    const nl = this.at(x, y + 1);
    if (!nl) this.waterfall(g, 'L', t, zS, BASE, time);
    else if (nl.river >= 0 && nl.h < t.h) this.waterfall(g, 'L', t, zS, nl.h + WATER, time);
    const nr = this.at(x + 1, y);
    if (nr && nr.river >= 0 && nr.h < t.h) this.waterfall(g, 'R', t, zS, nr.h + WATER, time);
  }

  waterfall(g, side, t, zFrom, zTo, time) {
    const { x, y } = t;
    const a = side === 'L' ? P(x, y + 1, zFrom) : P(x + 1, y, zFrom);
    const b = P(x + 1, y + 1, zFrom);
    const drop = (zFrom - zTo) * HZ;
    const gr = g.createLinearGradient(0, a[1], 0, a[1] + drop + 18);
    gr.addColorStop(0, '#cdf1ff'); gr.addColorStop(1, side === 'L' ? '#5ab9de' : '#3f98c0');
    poly(g, [a, b, [b[0], b[1] + drop], [a[0], a[1] + drop]], gr);
    g.save();
    g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(b[0], b[1] + drop); g.lineTo(a[0], a[1] + drop); g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.65)'; g.lineWidth = 2; g.setLineDash([9, 13]);
    for (let n = 0; n < 7; n++) {
      const u = (n + 0.5) / 7;
      const px = a[0] + (b[0] - a[0]) * u, py = a[1] + (b[1] - a[1]) * u;
      g.lineDashOffset = -time * (60 + n * 9);
      g.beginPath(); g.moveTo(px, py); g.lineTo(px, py + drop); g.stroke();
    }
    g.setLineDash([]);
    g.restore();
    // Espuma na base.
    const bx = (a[0] + b[0]) / 2, by = (a[1] + b[1]) / 2 + drop;
    for (let n = 0; n < 5; n++) {
      const o = (n - 2) * 12;
      ell(g, bx + o, by + Math.sin(time * 3 + n) * 1.5, 11 + Math.sin(time * 2 + n * 2) * 2, 4, 'rgba(255,255,255,0.7)');
    }
  }

  drawFallMist(g, time) {
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, z, r] of [[10.5, 18, BASE + 0.4, 70], [13.5, 6, 2.9, 38], [11.5, 11, 1.9, 38]]) {
      const [px, py] = P(x, y, z);
      for (let n = 0; n < 3; n++) {
        const gr = g.createRadialGradient(px, py, 2, px, py, r);
        const a = 0.16 + Math.sin(time * 1.4 + n * 2 + x) * 0.05;
        gr.addColorStop(0, `rgba(220,245,255,${a})`); gr.addColorStop(1, 'rgba(220,245,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(px + (n - 1) * 14, py - n * 10, r, 0, TAU); g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  drawMotes(g, time) {
    g.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const x = m.x + Math.sin(time * 0.25 + m.ph) * 0.5, y = m.y + Math.cos(time * 0.2 + m.ph) * 0.5;
      const t = this.at(Math.min(N - 1, Math.max(0, Math.floor(x))), Math.min(N - 1, Math.max(0, Math.floor(y))));
      const z = t.h + 0.6 + ((m.z0 + time * 0.07) % 2);
      const [px, py] = P(x, y, z);
      const a = 0.35 + 0.45 * Math.max(0, Math.sin(time * 1.6 + m.ph * 3));
      const gr = g.createRadialGradient(px, py, 0, px, py, 7);
      const c = m.cool ? '150,230,255' : '255,225,140';
      gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(px, py, 7, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }

  drawProp(g, o, time) {
    switch (o.k) {
      case 'tree': return this.tree(g, o, time);
      case 'bush': return this.bush(g, o, time);
      case 'rock': return this.rock(g, o);
      case 'flowers': return this.flowers(g, o);
      case 'crystal': return this.crystal(g, o, time);
      case 'column': return this.column(g, o);
      case 'box': return this.wall(g, o);
      case 'altar': return this.altar(g, o, time);
      case 'fallen': return this.fallen(g, o);
      case 'bridge': return this.bridge(g, o);
      case 'hero': return this.hero(g, o, time);
    }
  }

  tree(g, o, time) {
    const [sx, sy] = P(o.x, o.y, o.z), s = o.s;
    const sway = Math.sin(time * 1.3 + o.x * 2.1 + o.y) * 1.6 * s;
    ell(g, sx + 16 * s, sy + 3, 24 * s, 8 * s, 'rgba(12,20,40,0.26)');
    const th = 26 * s;
    g.fillStyle = sh(o.trunk, -0.05); g.fillRect(sx - 3 * s, sy - th, 6 * s, th);
    g.fillStyle = sh(o.trunk, -0.26); g.fillRect(sx + 0.5 * s, sy - th, 2.5 * s, th);
    if (o.shape === 'pine') {
      for (let i = 0; i < 3; i++) {
        const w = (28 - i * 6) * s, y1 = sy - th * 0.55 - i * 17 * s, yt = y1 - 28 * s, cx = sx + sway * (0.4 + i * 0.4);
        poly(g, [[cx, yt], [cx - w / 2, y1], [cx, y1 + 4 * s]], sh(o.leaf, 0.04));
        poly(g, [[cx, yt], [cx + w / 2, y1], [cx, y1 + 4 * s]], sh(o.leaf, -0.17));
      }
    } else {
      const cx = sx + sway, cy = sy - th - 14 * s;
      ell(g, cx - 14 * s, cy + 6 * s, 12 * s, 11 * s, sh(o.leaf, -0.2));
      ell(g, cx + 14 * s, cy + 5 * s, 12 * s, 11 * s, sh(o.leaf, -0.24));
      ell(g, cx + 2 * s, cy + 4 * s, 22 * s, 20 * s, sh(o.leaf, -0.14));
      ell(g, cx - 2 * s, cy, 21 * s, 19 * s, o.leaf);
      ell(g, cx - 8 * s, cy - 8 * s, 11 * s, 9 * s, sh(o.leaf, 0.1));
      ell(g, cx - 12 * s, cy - 11 * s, 4 * s, 3 * s, sh(o.leaf, 0.2));
    }
  }

  bush(g, o, time) {
    const [sx, sy] = P(o.x, o.y, o.z), s = o.s, sw = Math.sin(time * 1.5 + o.x * 3) * 0.8;
    ell(g, sx + 6 * s, sy + 2, 13 * s, 4.5 * s, 'rgba(12,20,40,0.24)');
    ell(g, sx + 4 * s, sy - 5 * s, 8 * s, 7 * s, sh(o.leaf, -0.2));
    ell(g, sx - 5 * s + sw, sy - 6 * s, 8 * s, 7 * s, sh(o.leaf, -0.08));
    ell(g, sx + sw, sy - 10 * s, 8 * s, 7 * s, o.leaf);
    ell(g, sx - 3 * s + sw, sy - 12 * s, 4 * s, 3 * s, sh(o.leaf, 0.14));
  }

  rock(g, o) {
    const [sx, sy] = P(o.x, o.y, o.z), s = o.s;
    ell(g, sx + 7 * s, sy + 2, 14 * s, 4.5 * s, 'rgba(12,20,40,0.26)');
    const a = o.seed * 6;
    poly(g, [[sx - 10 * s, sy], [sx - 8 * s, sy - 9 * s - a], [sx - 1 * s, sy - 14 * s], [sx + 8 * s, sy - 10 * s], [sx + 11 * s, sy]], '#9a98a8');
    poly(g, [[sx + 1 * s, sy - 14 * s], [sx + 8 * s, sy - 10 * s], [sx + 11 * s, sy], [sx + 2 * s, sy]], '#74728a');
    poly(g, [[sx - 8 * s, sy - 9 * s - a], [sx - 1 * s, sy - 14 * s], [sx + 1 * s, sy - 9 * s], [sx - 6 * s, sy - 6 * s]], '#bab8c8');
  }

  flowers(g, o) {
    const [sx, sy] = P(o.x, o.y, o.z);
    for (const [dx, dy] of o.dots) {
      g.strokeStyle = '#4c8f45'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(sx + dx, sy + dy); g.lineTo(sx + dx, sy + dy - 4); g.stroke();
      ell(g, sx + dx, sy + dy - 5, 2, 1.8, o.col);
    }
  }

  crystal(g, o, time) {
    const [sx, sy] = P(o.x, o.y, o.z), s = o.s;
    const pulse = 0.75 + 0.25 * Math.sin(time * 2 + o.ph);
    ell(g, sx + 8, sy + 2, 18 * s, 6 * s, 'rgba(12,20,40,0.28)');
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(sx, sy - 14 * s, 2, sx, sy - 14 * s, 42 * s);
    gr.addColorStop(0, o.col + '66'); gr.addColorStop(1, o.col + '00');
    g.globalAlpha = pulse; g.fillStyle = gr; g.beginPath(); g.arc(sx, sy - 14 * s, 42 * s, 0, TAU); g.fill();
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    for (const [dx, hh, w] of [[-8, 18, 5], [7, 14, 4.5], [0, 30, 6.5]]) {
      const x = sx + dx * s, hgt = hh * s, ww = w * s;
      poly(g, [[x - ww, sy], [x - ww * 0.8, sy - hgt * 0.8], [x, sy - hgt], [x, sy]], sh(o.col, 0.12));
      poly(g, [[x, sy], [x, sy - hgt], [x + ww * 0.8, sy - hgt * 0.8], [x + ww, sy]], sh(o.col, -0.22));
      poly(g, [[x - ww * 0.5, sy - hgt * 0.7], [x, sy - hgt], [x - ww * 0.1, sy - hgt * 0.45]], 'rgba(255,255,255,0.55)');
    }
  }

  column(g, o) {
    const [sx, sy] = P(o.x, o.y, o.z), hp = o.h * HZ, w = 9;
    g.fillStyle = 'rgba(12,20,40,0.28)';
    g.beginPath(); g.ellipse(sx + hp * 0.45, sy + 3, 12 + hp * 0.3, 6, 0, 0, TAU); g.fill();
    g.fillStyle = '#9b97ad'; g.fillRect(sx - w - 4, sy - 7, 2 * w + 8, 7);
    g.fillStyle = '#7c7791'; g.fillRect(sx + 1, sy - 7, w + 3, 7);
    const gr = g.createLinearGradient(sx - w, 0, sx + w, 0);
    gr.addColorStop(0, '#e1ddea'); gr.addColorStop(0.5, '#bfbacd'); gr.addColorStop(1, '#7e798f');
    const top = sy - hp;
    g.fillStyle = gr;
    if (o.broken) {
      g.beginPath(); g.moveTo(sx - w, sy - 7);
      const pts = [[-w, 0], [-5, -5], [-2, 3], [2, -6], [5, 2], [w, -3]];
      g.lineTo(sx - w, top + 3);
      for (const [dx, dy] of pts) g.lineTo(sx + dx, top + dy);
      g.lineTo(sx + w, sy - 7); g.fill();
    } else {
      g.fillRect(sx - w, top, 2 * w, hp - 7);
      g.fillStyle = '#ddd9e8'; g.fillRect(sx - w - 4, top - 6, 2 * w + 8, 7);
      g.fillStyle = '#8d889f'; g.fillRect(sx + 2, top - 6, w + 2, 7);
    }
    g.strokeStyle = 'rgba(60,54,86,0.3)'; g.lineWidth = 1;
    g.beginPath();
    for (const dx of [-4, 1, 6]) { g.moveTo(sx + dx, sy - 8); g.lineTo(sx + dx, top + 6); }
    g.stroke();
    // Musgo e trepadeira.
    ell(g, sx - 2, sy - 8, 11, 6, 'rgba(95,160,74,0.75)');
    ell(g, sx - 5, sy - 15, 5, 4, 'rgba(95,160,74,0.7)');
    if (!o.broken) ell(g, sx + 3, top + 4, 6, 3.5, 'rgba(95,160,74,0.6)');
  }

  wall(g, o) {
    isoBox(g, o.x, o.y, o.z + (o.zo || 0), o.w, o.d, o.h, STONE);
    if (o.crumble) {
      const n = Math.max(2, Math.round(o.w * 1.4 + o.d * 1.4));
      for (let i = 0; i < n; i++) {
        if (rnd(o.x, o.y, i) < 0.4) continue;
        const u = (i + 0.2) / n, hh = 0.14 + rnd(o.x, o.y, i + 9) * 0.3;
        const bw = o.w >= o.d ? o.w / n * 0.8 : o.w, bd = o.w >= o.d ? o.d : o.d / n * 0.8;
        isoBox(g, o.x + (o.w >= o.d ? o.w * u : 0), o.y + (o.w >= o.d ? 0 : o.d * u), o.z + o.h, bw, bd, hh, STONE, false);
      }
    }
    const [mx, my] = P(o.x + o.w * 0.5, o.y + o.d, o.z + o.h);
    ell(g, mx, my + 2, 12, 4, 'rgba(95,160,74,0.7)');
  }

  altar(g, o, time) {
    const pulse = 0.6 + 0.4 * Math.sin(time * 1.8);
    const ring = (r, z) => Array.from({ length: 48 }, (_, i) => P(o.x + Math.cos(i / 48 * TAU) * r, o.y + Math.sin(i / 48 * TAU) * r, z));
    g.globalCompositeOperation = 'lighter';
    for (const [r, w] of [[1.15, 2.5], [0.8, 1.5]]) {
      g.strokeStyle = `rgba(120,230,255,${0.55 * pulse})`; g.lineWidth = w; poly(g, ring(r, o.z + 0.02)); g.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + time * 0.1;
      const p1 = P(o.x + Math.cos(a) * 0.85, o.y + Math.sin(a) * 0.85, o.z + 0.02), p2 = P(o.x + Math.cos(a) * 1.12, o.y + Math.sin(a) * 1.12, o.z + 0.02);
      g.strokeStyle = `rgba(160,240,255,${0.7 * pulse})`; g.lineWidth = 2;
      g.beginPath(); g.moveTo(...p1); g.lineTo(...p2); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    isoBox(g, o.x - 0.4, o.y - 0.4, o.z, 0.8, 0.8, 0.35, STONE);
    isoBox(g, o.x - 0.28, o.y - 0.28, o.z + 0.35, 0.56, 0.56, 0.14, { top: '#e1ddec', left: '#b9b4cb', right: '#8a859f' }, false);
    const [px, py] = P(o.x, o.y, o.z + 1.1 + Math.sin(time * 1.5) * 0.12);
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(px, py, 2, px, py, 55);
    gr.addColorStop(0, `rgba(130,235,255,${0.5 * pulse})`); gr.addColorStop(1, 'rgba(130,235,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, 55, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    poly(g, [[px, py - 17], [px - 8, py], [px, py + 6]], '#9fefff');
    poly(g, [[px, py - 17], [px + 8, py], [px, py + 6]], '#4ab9d6');
    poly(g, [[px - 2, py - 11], [px - 5, py - 3], [px - 1, py - 1]], 'rgba(255,255,255,0.7)');
  }

  fallen(g, o) {
    isoBox(g, o.x, o.y, o.z, 1.3, 0.34, 0.26, STONE);
    isoBox(g, o.x + 1.2, o.y + 0.05, o.z, 0.3, 0.3, 0.2, STONE, false);
  }

  bridge(g, o) {
    const x0 = o.x, x1 = o.x + 2.3, y0 = o.y, y1 = o.y + 0.6, z = o.z;
    isoBox(g, x0, y0 + 0.02, z + 0.4, x1 - x0, 0.06, 0.06, WOOD, false);
    for (const px of [x0, x1 - 0.08]) isoBox(g, px, y0, z, 0.08, 0.08, 0.45, WOOD, false);
    isoBox(g, x0, y0, z - 0.12, x1 - x0, y1 - y0, 0.12, WOOD, false);
    g.strokeStyle = 'rgba(60,35,15,0.55)'; g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < 10; i++) { const a = P(x0 + (x1 - x0) * i / 10, y0, z), b = P(x0 + (x1 - x0) * i / 10, y1, z); g.moveTo(...a); g.lineTo(...b); }
    g.stroke();
    for (const px of [x0, x1 - 0.08]) isoBox(g, px, y1 - 0.08, z, 0.08, 0.08, 0.45, WOOD, false);
    isoBox(g, x0, y1 - 0.06, z + 0.4, x1 - x0, 0.06, 0.06, WOOD, false);
  }

  // Herói: proporção anime (~7 cabeças), sem chibi. Figura de referência de escala, ainda sem rig.
  hero(g, o, time) {
    const [sx, sy] = P(o.x, o.y, o.z);
    const bob = Math.sin(time * 2) * 0.8, sway = Math.sin(time * 2.4);
    const blink = (time % 4.2) < 0.12;
    ell(g, sx + 5, sy + 1, 13, 4.5, 'rgba(12,20,40,0.38)');
    g.save(); g.translate(sx, sy + bob * 0.3);
    // capa
    poly(g, [[-7, -41], [7, -41], [10 + sway * 2, -14], [-1, -10], [-10 + sway * 2, -15]], '#7d2a3c');
    poly(g, [[-1, -41], [7, -41], [10 + sway * 2, -14], [-1, -10]], '#5e1d2e');
    // espada nas costas
    poly(g, [[3, -38], [5, -36], [13, -57], [11, -58]], '#cfd6e6');
    poly(g, [[9, -50], [15, -52], [16, -50], [10, -48]], '#d8b25a');
    // pernas e botas
    poly(g, [[-6, -22], [-1, -22], [-1.5, -5], [-6, -5]], '#2b3354');
    poly(g, [[1, -22], [6, -22], [6.5, -5], [1.5, -5]], '#222a46');
    poly(g, [[-7, -6], [-1, -6], [-0.5, 0], [-8, 0]], '#5b3b2b');
    poly(g, [[1, -6], [7, -6], [8, 0], [0.5, 0]], '#4a2f22');
    // túnica
    poly(g, [[-8, -42], [8, -42], [9, -26], [11, -17], [-11, -17], [-9, -26]], '#2f93a3');
    poly(g, [[1, -42], [8, -42], [9, -26], [11, -17], [1, -17]], '#237787');
    poly(g, [[-11, -17], [11, -17], [11, -15], [-11, -15]], '#e0c06a');
    poly(g, [[-9, -28], [9, -28], [9, -25.5], [-9, -25.5]], '#d2a94c');
    poly(g, [[-1, -42], [1, -42], [1, -17], [-1, -17]], '#e8d38a');
    // braços
    poly(g, [[-10, -41], [-7, -41], [-8, -27], [-11, -27]], '#2f93a3');
    poly(g, [[7, -41], [10, -41], [11, -27], [8, -27]], '#237787');
    ell(g, -9.5, -26, 2.4, 2.6, '#f6d5bd'); ell(g, 9.5, -26, 2.4, 2.6, '#e8c0a6');
    // lenço
    poly(g, [[-6, -44], [6, -44], [7, -40], [-7, -40]], '#d9524a');
    poly(g, [[3, -41], [7, -40], [9 + sway * 2, -31], [5 + sway * 2, -32]], '#b83d3b');
    // cabeça
    const hy = -51;
    poly(g, [[-3, -46], [3, -46], [3, -43], [-3, -43]], '#e8c0a6');
    g.fillStyle = '#f6d5bd'; g.beginPath(); g.ellipse(0, hy, 5.4, 6.4, 0, 0, TAU); g.fill();
    // cabelo: franja em pontas, rabo de cavalo
    const hair = '#262b63', hl = '#8fa2ff';
    poly(g, [[5, hy - 4], [11 + sway * 2, hy + 2], [14 + sway * 3, hy + 14], [8, hy + 3], [5, hy + 2]], hair);
    g.fillStyle = hair; g.beginPath(); g.ellipse(0, hy - 2.5, 6.2, 5.2, 0, Math.PI, TAU); g.fill();
    poly(g, [[-6, hy - 2], [-3, hy + 2], [-5, hy + 6]], hair);
    poly(g, [[-3, hy - 2], [0, hy + 3.5], [1.5, hy - 2]], hair);
    poly(g, [[1.5, hy - 2], [4, hy + 3], [6, hy - 2]], hair);
    poly(g, [[-4, hy - 7], [0, hy - 8.5], [-1, hy - 5]], hl);
    // olhos
    if (blink) { g.strokeStyle = '#2a2250'; g.lineWidth = 1; g.beginPath(); g.moveTo(-3.8, hy + 1.2); g.lineTo(-1.4, hy + 1.2); g.moveTo(1.4, hy + 1.2); g.lineTo(3.8, hy + 1.2); g.stroke(); }
    else {
      for (const ex of [-2.6, 2.6]) {
        ell(g, ex, hy + 1.2, 1.6, 2.1, '#3ac3df');
        ell(g, ex, hy + 1.6, 0.8, 1.3, '#16336a');
        ell(g, ex - 0.5, hy + 0.5, 0.5, 0.5, '#fff');
      }
    }
    g.restore();
  }
}
