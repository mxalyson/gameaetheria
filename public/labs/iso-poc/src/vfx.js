// Efeitos de golpe/magia dos heróis em miniatura (PoC). Só VISUAL: não alteram a simulação (dano, alcance e projéteis seguem as regras reais).
// Procedural de propósito: os modelos não trazem efeitos; brilho, rastro e partículas são camadas aditivas sobre o sprite (direção "híbrida", ADR 0004).
// Estado puro (spawn/step, testável em Node) + desenho em Canvas 2D que recebe o contexto e a projeção.
const TAU = Math.PI * 2;

export const HERO_FX = {
  paladino: { style: 'slash', color: '#ffd96a', core: '#fffbe6' },
  aprendiz: { style: 'cast', color: '#5fe3ff', core: '#eafcff' },
  franco: { style: 'shoot', color: '#ffa94d', core: '#fff3d9' },
  sacerdote: { style: 'pray', color: '#7dffc8', core: '#f6fff2' },
};
export const KIND_BY_STYLE = { slash: 'swing', shoot: 'muzzle', cast: 'cast', pray: 'pray' };
// Efeito de cada ação do herói: [ataque básico, skill 1, skill 2, skill 3]. As skills são as REAIS da classe do jogo (data/classes.js):
// Paladino = Guerreiro, Aprendiz = Mago, Franco-atirador = Arqueiro, Sacerdote = Clérigo.
export const HERO_ACTIONS = {
  paladino: ['swing', 'nova', 'dash', 'aura'],      // Golpe Giratório, Investida, Grito de Guerra
  aprendiz: ['cast', 'cast', 'nova', 'blink'],      // Bola de Fogo, Nova de Gelo, Teleporte
  franco: ['muzzle', 'rain', 'muzzle', 'dash'],     // Chuva de Flechas, Tiro Perfurante, Rolamento
  sacerdote: ['swing', 'pray', 'aura', 'cast'],     // Luz Sagrada, Escudo Divino, Julgamento
};
const LIFE = { swing: 0.3, muzzle: 0.18, cast: 0.5, pray: 0.8, impact: 0.34, nova: 0.6, dash: 0.38, aura: 0.95, blink: 0.55, rain: 2.2 };
const MAX = 48;

// `o`: { x, y, z?, ang (rad, mundo), big?, color, core, r? (raio em unid. do mundo: nova/chuva), len? (dash/blink), life? }. `rnd` injetável para teste.
export function spawnVfx(list, kind, o, rnd = Math.random) {
  if (list.length >= MAX) list.shift();
  const big = o.big ? 1.35 : 1;
  const v = { kind, t: 0, life: o.life ?? (LIFE[kind] ?? 0.3) * (kind === 'pray' || kind === 'swing' ? big : 1), x: o.x, y: o.y, z: o.z ?? 34, ang: o.ang ?? 0, big, color: o.color, core: o.core, r: o.r ?? 100, len: o.len ?? 200, parts: [] };
  const n = { cast: 11, pray: 12, impact: 9, muzzle: 7, swing: 0, nova: 14, aura: 8, blink: 10, rain: 18, dash: 0 }[kind] ?? 0;
  for (let i = 0; i < n; i++) v.parts.push({ a: kind === 'muzzle' ? (rnd() - 0.5) * 1.6 : rnd() * TAU, s: 0.4 + rnd() * 0.9, d: rnd() });
  list.push(v);
  return v;
}
export function stepVfx(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) { list[i].t += dt; if (list[i].t >= list[i].life) list.splice(i, 1); }
}

const ease = (k) => 1 - (1 - k) * (1 - k);

// Efeitos no plano do chão (coordenadas do mundo; o chamador aplica a matriz isométrica).
export function drawVfxGround(g, list) {
  for (const v of list) {
    const k = v.t / v.life;
    let x = v.x, y = v.y, r, a, lw = 3;
    if (v.kind === 'pray') { r = (14 + 62 * ease(k)) * v.big; a = (1 - k) * 0.8; }
    else if (v.kind === 'nova') { r = (10 + (v.r - 10) * ease(k)); a = (1 - k) * 0.9; lw = 5; } // onda de choque até o raio real da skill
    else if (v.kind === 'aura') { r = 30 + 8 * Math.sin(k * 12); a = Math.min(1, (1 - k) * 2) * 0.7; lw = 2.5; }
    else if (v.kind === 'blink') { x = v.x + Math.cos(v.ang) * v.len; y = v.y + Math.sin(v.ang) * v.len; r = (8 + 40 * ease(k)); a = (1 - k) * 0.8; }
    else if (v.kind === 'rain') { r = v.r; a = (v.t < 0.2 ? v.t / 0.2 : Math.max(0, 1 - (v.t - 1.6) / 0.6)) * 0.45; lw = 2; } // marca da área bombardeada
    else continue;
    g.globalAlpha = Math.max(0, a);
    const gr = g.createRadialGradient(x, y, r * 0.5, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, v.color);
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = gr; g.fill();
    g.lineWidth = lw * (v.kind === 'rain' ? 1 : (1 - k) + 0.2); g.strokeStyle = v.core; g.stroke();
    g.globalAlpha = 1;
  }
}

// Efeitos em tela (aditivos). `c` = { g, glow(color)->sprite, sprite(g, s, x, y, size, alpha), iso, ox, oy, zoom }.
export function drawVfx(c, list) {
  const { g, iso, ox, oy, zoom: z } = c;
  g.globalCompositeOperation = 'lighter';
  for (const v of list) {
    const k = v.t / v.life, s = iso.toScreen(v.x, v.y, v.z), ax = s.x + ox, ay = s.y + oy;
    const d = iso.toScreen(v.x + Math.cos(v.ang) * 100, v.y + Math.sin(v.ang) * 100, v.z);
    let ux = d.x - s.x, uy = d.y - s.y; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul; // direção do golpe na TELA
    const px = -uy, py = ux;
    const glow = (col, x, y, diam, a) => c.sprite(g, c.glow(col), x, y, Math.max(0.05, diam / 64), a);
    if (v.kind === 'swing') {
      // meia-lua que varre à frente do herói: cabeça no ponto h, cauda esmaece
      const R = (80 + 20 * v.big) * z, sweep = 1.3, h = Math.pow(k, 0.55), N = 26;
      g.lineCap = 'round';
      let hx = ax, hy = ay;
      for (let i = 1; i <= N; i++) {
        const f0 = (i - 1) / N, f1 = i / N, th0 = (0.5 - h * f0) * 2 * sweep, th1 = (0.5 - h * f1) * 2 * sweep;
        const P = (th) => [ax + (ux * Math.cos(th) * R + px * Math.sin(th) * R * 0.85), ay + (uy * Math.cos(th) * R + py * Math.sin(th) * R * 0.85) - Math.sin(th) * 0 * z];
        const [x0, y0] = P(th0), [x1, y1] = P(th1);
        hx = x1; hy = y1;
        const a = Math.pow(f1, 1.4) * (1 - k * 0.7);
        g.globalAlpha = a * 0.9; g.strokeStyle = v.color; g.lineWidth = (4 + 16 * f1) * z * v.big; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.globalAlpha = a; g.strokeStyle = v.core; g.lineWidth = (1.5 + 6 * f1) * z * v.big; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
      g.globalAlpha = 1;
      glow(v.color, hx, hy, 100 * z * v.big * (1 - k * 0.6), 0.9);
      glow(v.core, hx, hy, 26 * z, 0.9 * (1 - k));
    } else if (v.kind === 'muzzle') {
      const tx = ax + ux * 40 * z, ty = ay + uy * 40 * z, f = 1 - k;
      glow(v.color, tx, ty, 110 * z * f, 0.9); glow(v.core, tx, ty, 44 * z * f, 1);
      g.lineCap = 'round';
      for (const p of v.parts) { // faíscas em leque
        const a = Math.atan2(uy, ux) + p.a, len = (30 + 40 * p.s) * z * f;
        g.globalAlpha = f; g.strokeStyle = p.d > 0.5 ? v.core : v.color; g.lineWidth = (1.5 + 2 * p.s) * z;
        g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + Math.cos(a) * len, ty + Math.sin(a) * len * 0.8); g.stroke();
      }
      // rastro do disparo (o projétil real da simulação segue por cima)
      const gr = g.createLinearGradient(tx, ty, tx + ux * 190 * z, ty + uy * 190 * z); gr.addColorStop(0, v.core); gr.addColorStop(1, 'rgba(255,200,120,0)');
      g.globalAlpha = f * 0.8; g.strokeStyle = gr; g.lineWidth = 3.5 * z; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + ux * 190 * z, ty + uy * 190 * z); g.stroke();
      g.globalAlpha = 1;
    } else if (v.kind === 'cast') {
      const tx = ax + ux * 26 * z, ty = ay + uy * 26 * z, f = 1 - k;
      glow(v.color, tx, ty, (70 + 120 * ease(k)) * z * v.big, 0.9 * f + 0.1); glow(v.core, tx, ty, 34 * z * f, 1);
      const r = (10 + 46 * ease(k)) * z * v.big; // anel de energia (elipse isométrica)
      g.globalAlpha = f; g.lineWidth = 2.4 * z; g.strokeStyle = v.color; g.beginPath(); g.ellipse(tx, ty, r, r * 0.55, 0, 0, TAU); g.stroke();
      for (const p of v.parts) { // fagulhas que se abrem e caem
        const sp = (60 + 90 * p.s) * z * v.big, X = tx + Math.cos(p.a) * sp * k, Y = ty + Math.sin(p.a) * sp * k * 0.7 + 60 * z * k * k;
        glow(p.d > 0.5 ? v.core : v.color, X, Y, (10 + 12 * p.s) * z * f, f);
      }
      g.globalAlpha = 1;
    } else if (v.kind === 'pray') {
      const f = 1 - k, gx = iso.toScreen(v.x, v.y, 0), bx = gx.x + ox, by = gx.y + oy;
      const hgt = 130 * z * v.big * Math.min(1, k * 5); // coluna de luz que sobe do chão e esmaece
      const gr = g.createLinearGradient(0, by - hgt, 0, by); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.7, v.color); gr.addColorStop(1, v.core);
      g.globalAlpha = f * 0.55; g.fillStyle = gr; g.fillRect(bx - 20 * z * v.big, by - hgt, 40 * z * v.big, hgt);
      g.globalAlpha = 1;
      glow(v.color, bx, by - 8 * z, 90 * z * v.big * f, 0.7);
      for (const p of v.parts) { // grãos de luz subindo
        const X = bx + Math.cos(p.a) * 38 * z * p.s * v.big, Y = by - (14 + 120 * p.d * k + 30 * k) * z * v.big;
        glow(p.d > 0.5 ? v.core : v.color, X, Y, (8 + 9 * p.s) * z * f, f);
      }
    } else if (v.kind === 'nova') {
      const f = 1 - k, gx = iso.toScreen(v.x, v.y, 0), bx = gx.x + ox, by = gx.y + oy;
      glow(v.color, bx, by - 20 * z, (80 + 120 * ease(k)) * z * f + 20, 0.9 * f); glow(v.core, bx, by - 20 * z, 50 * z * f, f);
      g.lineCap = 'round'; g.strokeStyle = v.core;
      for (const p of v.parts) { // raios que saem do centro até a borda da onda
        const rr = ease(k) * v.r, dx = Math.cos(p.a), dy = Math.sin(p.a) * 0.55, s0 = rr * 0.55, s1 = rr * (0.8 + 0.2 * p.s);
        g.globalAlpha = f * 0.8; g.lineWidth = (1.5 + 2 * p.s) * z;
        g.beginPath(); g.moveTo(bx + dx * s0 * z * 0.9, by + dy * s0 * z * 0.9 - 8 * z); g.lineTo(bx + dx * s1 * z * 0.9, by + dy * s1 * z * 0.9 - 8 * z); g.stroke();
      }
      g.globalAlpha = 1;
    } else if (v.kind === 'dash') {
      const f = 1 - k, e = iso.toScreen(v.x + Math.cos(v.ang) * v.len * ease(Math.min(1, k * 2.2)), v.y + Math.sin(v.ang) * v.len * ease(Math.min(1, k * 2.2)), v.z), ex = e.x + ox, ey = e.y + oy;
      const gr = g.createLinearGradient(ax, ay, ex, ey); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, v.color);
      g.lineCap = 'round'; g.globalAlpha = f; g.strokeStyle = gr; g.lineWidth = 16 * z * f + 2; g.beginPath(); g.moveTo(ax, ay); g.lineTo(ex, ey); g.stroke();
      g.strokeStyle = v.core; g.lineWidth = 4 * z * f + 1; g.beginPath(); g.moveTo(ax + (ex - ax) * 0.3, ay + (ey - ay) * 0.3); g.lineTo(ex, ey); g.stroke(); g.globalAlpha = 1;
      for (let i = 0; i < 5; i++) glow(v.color, ax + (ex - ax) * (i / 5), ay + (ey - ay) * (i / 5), 40 * z * f * (i / 5 + 0.3), 0.55 * f); // imagens residuais
      glow(v.core, ex, ey, 46 * z * f, 0.9 * f);
    } else if (v.kind === 'aura') {
      const f = Math.min(1, (1 - k) * 2.2), gx = iso.toScreen(v.x, v.y, 0), bx = gx.x + ox, by = gx.y + oy, cy = by - 38 * z;
      g.globalAlpha = f * 0.22; g.fillStyle = v.color; g.beginPath(); g.ellipse(bx, cy, (40 + 3 * Math.sin(k * 14)) * z, 54 * z, 0, 0, TAU); g.fill(); // bolha/escudo em torno do corpo
      g.globalAlpha = f * 0.85; g.lineWidth = 2.5 * z; g.strokeStyle = v.core; g.beginPath(); g.ellipse(bx, cy, (40 + 3 * Math.sin(k * 14)) * z, 54 * z, 0, 0, TAU); g.stroke();
      g.globalAlpha = 1;
      glow(v.color, bx, cy, 120 * z * f, 0.45 * f);
      for (const p of v.parts) { const X = bx + Math.cos(p.a) * 34 * z, Y = by - (6 + 100 * ((k * (0.7 + p.s * 0.6) + p.d) % 1)) * z; glow(p.d > 0.5 ? v.core : v.color, X, Y, 11 * z * f, f); }
    } else if (v.kind === 'blink') {
      const f = 1 - k, ex = v.x + Math.cos(v.ang) * v.len, ey2 = v.y + Math.sin(v.ang) * v.len, e = iso.toScreen(ex, ey2, v.z), dx = e.x + ox, dy = e.y + oy;
      glow(v.color, ax, ay, 90 * z * f * f, 0.9 * f); glow(v.core, ax, ay, 30 * z * f, f); // sai: o clarão encolhe
      glow(v.color, dx, dy, (30 + 110 * ease(k)) * z, 0.85 * f); glow(v.core, dx, dy, 40 * z * f, f); // chega: o clarão abre
      for (const p of v.parts) { const q = ease(k); glow(p.d > 0.5 ? v.core : v.color, dx + Math.cos(p.a) * 60 * z * p.s * q, dy + Math.sin(p.a) * 40 * z * p.s * q - 20 * z * k, 11 * z * f, f); }
    } else if (v.kind === 'rain') {
      const gx = iso.toScreen(v.x, v.y, 0), bx = gx.x + ox, by = gx.y + oy;
      g.lineCap = 'round';
      for (const p of v.parts) {
        const tt = v.t - p.d * v.life * 0.72, X = bx + Math.cos(p.a) * p.s * v.r * z * 0.9, Y = by + Math.sin(p.a) * p.s * v.r * z * 0.5;
        if (tt > 0 && tt < 0.22) { const h = 230 * z * (1 - tt / 0.22); g.globalAlpha = 0.95; g.strokeStyle = v.core; g.lineWidth = 2 * z; g.beginPath(); g.moveTo(X - h * 0.12, Y - h - 30 * z); g.lineTo(X - h * 0.12 + 3 * z, Y - h + 6 * z); g.stroke(); }
        else if (tt >= 0.22 && tt < 0.5) { const q = (tt - 0.22) / 0.28; glow(v.color, X, Y, (16 + 26 * q) * z, 0.8 * (1 - q)); }
      }
      g.globalAlpha = 1;
    } else if (v.kind === 'impact') {
      const f = 1 - k;
      glow(v.color, ax, ay, (40 + 50 * ease(k)) * z, 0.8 * f); glow(v.core, ax, ay, 26 * z * f, f);
      g.lineCap = 'round';
      for (const p of v.parts) {
        const sp = (18 + 44 * p.s) * z, a = p.a, X = ax + Math.cos(a) * sp * ease(k), Y = ay + Math.sin(a) * sp * ease(k) * 0.75 + 16 * z * k * k;
        g.globalAlpha = f; g.strokeStyle = p.d > 0.5 ? v.core : v.color; g.lineWidth = 2.2 * z;
        g.beginPath(); g.moveTo(X, Y); g.lineTo(X - Math.cos(a) * 9 * z * f, Y - Math.sin(a) * 7 * z * f); g.stroke();
      }
      g.globalAlpha = 1;
    }
  }
  g.globalCompositeOperation = 'source-over';
}
