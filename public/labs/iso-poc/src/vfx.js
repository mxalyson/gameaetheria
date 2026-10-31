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
const LIFE = { swing: 0.3, muzzle: 0.18, cast: 0.5, pray: 0.8, impact: 0.34 };
const MAX = 48;

// `o`: { x, y, z?, ang (rad, mundo), big?, color, core }. `rnd` injetável para teste determinístico.
export function spawnVfx(list, kind, o, rnd = Math.random) {
  if (list.length >= MAX) list.shift();
  const big = o.big ? 1.35 : 1;
  const v = { kind, t: 0, life: (LIFE[kind] ?? 0.3) * (kind === 'pray' || kind === 'swing' ? big : 1), x: o.x, y: o.y, z: o.z ?? 34, ang: o.ang ?? 0, big, color: o.color, core: o.core, parts: [] };
  const n = { cast: 11, pray: 12, impact: 9, muzzle: 7, swing: 0 }[kind] ?? 0;
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
    if (v.kind !== 'pray') continue;
    const k = v.t / v.life, r = (14 + 62 * ease(k)) * v.big;
    g.globalAlpha = (1 - k) * 0.8;
    const gr = g.createRadialGradient(v.x, v.y, r * 0.5, v.x, v.y, r); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, v.color);
    g.beginPath(); g.arc(v.x, v.y, r, 0, TAU); g.fillStyle = gr; g.fill();
    g.lineWidth = 3 * (1 - k) + 0.6; g.strokeStyle = v.core; g.stroke();
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
