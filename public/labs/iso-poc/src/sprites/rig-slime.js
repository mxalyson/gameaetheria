// Geleia (monstro real do Bosque, mobId 'slime'). Andaime técnico por código: corpo gelatinoso com squash/stretch,
// 8 direções por rotação (só os olhos e o impulso do ataque dependem da direção).
const TAU = Math.PI * 2;
const OUT = '#12584a';
const EL = Math.PI / 6, cEl = Math.cos(EL), sEl = Math.sin(EL);

function pose(clip, f) {
  const p = { sx: 1, sy: 1, lift: 0, lunge: 0, tint: 0, eyes: 1, puddle: 0, alpha: 1, ph: 0 };
  if (clip === 'idle') { const ph = (f / 6) * TAU; p.sy = 1 + 0.05 * Math.sin(ph); p.sx = 1 - 0.03 * Math.sin(ph); }
  else if (clip === 'move') { const ph = (f / 6) * TAU; p.lift = Math.max(0, Math.sin(ph)) * 13; p.sy = 1 + 0.14 * Math.sin(ph); p.sx = 1 - 0.1 * Math.sin(ph); if (Math.sin(ph) < -0.2) { p.sy = 0.82; p.sx = 1.16; } }
  else if (clip === 'attack') {
    const S = [[1.12, 0.88, 0], [1.22, 0.76, 0], [1.28, 0.7, -4], [0.9, 1.1, 18], [0.96, 1.02, 10], [1.04, 0.95, 2]][f];
    p.sx = S[0]; p.sy = S[1]; p.lunge = S[2]; p.lift = f === 3 ? 6 : 0;
  } else if (clip === 'hit') { p.sx = [1.25, 1.18, 1.05][f]; p.sy = [0.78, 0.86, 0.96][f]; p.tint = [0.7, 0.4, 0.1][f]; p.eyes = 0.2; }
  else if (clip === 'death') {
    p.sx = [1.1, 1.25, 1.35, 1.5, 1.6, 1.7, 1.75, 1.8][f]; p.sy = [0.9, 0.7, 0.55, 0.42, 0.32, 0.24, 0.18, 0.14][f];
    p.eyes = f < 2 ? 0.3 : 0; p.puddle = Math.min(1, f / 4); p.alpha = f >= 6 ? 1 - (f - 5) * 0.28 : 1; p.tint = f === 0 ? 0.6 : 0;
  }
  return p;
}

export function drawSlime(g, { yaw, clip, frame }) {
  const P = pose(clip, frame);
  const cf = Math.cos(yaw), sf = Math.sin(yaw);
  const ox = 64, oy = 112;
  const pr = (X, Y, Z) => ({ x: ox + X * cf + Z * sf, y: oy - Y * cEl + (Z * cf - X * sf) * sEl, d: Z * cf - X * sf });
  const rb = 30 * P.sx, hb = 38 * P.sy;
  const B = pr(0, P.lift, P.lunge);
  g.globalAlpha = P.alpha;
  if (P.puddle > 0) { // poça que sobra da morte
    const r = 34 * P.puddle + 8; g.beginPath(); g.ellipse(ox, oy, r, r * sEl, 0, 0, TAU); g.fillStyle = 'rgba(70,170,130,0.55)'; g.fill();
    g.beginPath(); g.ellipse(ox, oy, r * 0.62, r * 0.62 * sEl, 0, 0, TAU); g.strokeStyle = 'rgba(200,255,230,0.6)'; g.lineWidth = 1.6; g.stroke();
  }
  // corpo
  g.beginPath(); g.moveTo(B.x - rb, B.y);
  g.bezierCurveTo(B.x - rb * 1.02, B.y - hb * 1.28, B.x + rb * 1.02, B.y - hb * 1.28, B.x + rb, B.y);
  g.ellipse(B.x, B.y, rb, rb * sEl, 0, 0, Math.PI, false); g.closePath();
  const gr = g.createRadialGradient(B.x - rb * 0.4, B.y - hb * 0.85, 2, B.x, B.y - hb * 0.35, rb * 1.7);
  gr.addColorStop(0, '#e6fff0'); gr.addColorStop(0.35, '#8ff0bc'); gr.addColorStop(0.75, '#35b58f'); gr.addColorStop(1, '#1f7f6c');
  g.fillStyle = gr; g.fill(); g.lineWidth = 1.7; g.strokeStyle = OUT; g.lineJoin = 'round'; g.stroke();
  // volume interno (núcleo) e bolhas
  g.save(); g.clip();
  g.beginPath(); g.ellipse(B.x + rb * 0.1, B.y - hb * 0.32, rb * 0.62, hb * 0.36, 0, 0, TAU); g.fillStyle = 'rgba(210,255,230,0.38)'; g.fill();
  for (const [bx, by, br] of [[-0.45, -0.3, 2.6], [0.38, -0.5, 1.9], [0.1, -0.12, 1.5]]) { g.beginPath(); g.arc(B.x + rb * bx, B.y + hb * by, br, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill(); }
  g.beginPath(); g.ellipse(B.x, B.y, rb, rb * sEl, 0, 0, Math.PI, false); g.lineTo(B.x - rb, B.y + 8); g.lineTo(B.x + rb, B.y + 8); g.closePath(); g.fillStyle = 'rgba(20,100,80,0.35)'; g.fill();
  g.restore();
  // brilho principal
  g.beginPath(); g.ellipse(B.x - rb * 0.42, B.y - hb * 0.78, rb * 0.22, hb * 0.1, -0.7, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill();
  g.beginPath(); g.arc(B.x - rb * 0.16, B.y - hb * 0.9, 1.7, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill();
  // rosto: só aparece para quem olha para a câmera; some de costas
  const eyeY = P.lift + hb * 0.5, surf = (X) => Math.sqrt(Math.max(1, (rb * 0.93) ** 2 - X * X));
  const eye = (X) => {
    const q = pr(X, eyeY, surf(X) * 0.9 + P.lunge); if (q.d - B.d < 1.5) return;
    const w = Math.max(0.3, Math.min(1, (q.d - B.d) / 20)), ew = 4.2 * w, eh = 6.4 * P.eyes + 0.6;
    g.beginPath(); g.ellipse(q.x, q.y, ew, eh, 0, 0, TAU); g.fillStyle = '#10372f'; g.fill();
    if (P.eyes > 0.5) { g.beginPath(); g.arc(q.x - ew * 0.3, q.y - eh * 0.4, 1.5 * w + 0.3, 0, TAU); g.fillStyle = '#fff'; g.fill(); g.beginPath(); g.arc(q.x + ew * 0.3, q.y + eh * 0.35, 0.8, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill(); }
  };
  if (P.eyes > 0) {
    eye(rb * 0.3); eye(-rb * 0.3);
    const m = pr(0, eyeY - 8, surf(0) * 0.92 + P.lunge);
    if (m.d - B.d > 3) { g.beginPath(); g.moveTo(m.x - 3, m.y); g.quadraticCurveTo(m.x - 1.5, m.y + 2.4, m.x, m.y + 0.6); g.quadraticCurveTo(m.x + 1.5, m.y + 2.4, m.x + 3, m.y); g.strokeStyle = '#10372f'; g.lineWidth = 1.2; g.stroke(); }
    for (const X of [rb * 0.52, -rb * 0.52]) { const b = pr(X, eyeY - 4, surf(X) * 0.85 + P.lunge); if (b.d - B.d > 3) { g.beginPath(); g.ellipse(b.x, b.y, 3.6, 2.1, 0, 0, TAU); g.fillStyle = 'rgba(255,130,150,0.38)'; g.fill(); } }
  }
  if (P.tint > 0) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(255,255,255,${P.tint})`; g.fillRect(0, 0, 128, 128); g.globalCompositeOperation = 'source-over'; }
  g.globalAlpha = 1;
}

export const SLIME_FRAME = { w: 128, h: 128 };
export const SLIME_PIVOT = { x: 64, y: 112 };
