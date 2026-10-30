// Mago de referência (andaime técnico, arte por código). Corpo descrito em 3D simplificado e projetado para cada uma
// das 8 direções por rotação (yaw), com luz fixa vinda do alto-esquerda da tela. Unidades: ~1 px lógico; altura ≈ 150.
const TAU = Math.PI * 2;
const OUT = '#241a54';
const C = {
  robe: ['#7b74e8', '#4b47b8', '#2c2a7a'], inner: ['#fbf4ff', '#e3d6ff', '#b7a6ee'], cape: ['#fffaf0', '#ece4ff', '#b9acea'], capeIn: '#3bc4bb',
  hat: ['#6a62e0', '#3f3ba6', '#26236f'], gold: ['#ffe58a', '#f1c453', '#b4811c'], hair: ['#f1e8ff', '#b99dff', '#7458d6'],
  skin: ['#fff0e6', '#ffd9c7', '#efb3a3'], wood: ['#8d6a4c', '#5c4030', '#3a281e'], iris: ['#9ffcf0', '#2fd6c8', '#17808f'],
};
const EL = Math.PI / 6, cEl = Math.cos(EL), sEl = Math.sin(EL);

function pose(clip, f, n) {
  const t = f / n, ph = TAU * t;
  const p = { bob: 0, lean: 0, stepA: 0, stepB: 0, liftA: 0, liftB: 0, sway: 0, hem: 0, raise: 0, fwd: 0, twoHand: false, armL: 0, armLf: 0, orb: 1, blink: false, flash: 0, tint: 0 };
  if (clip === 'idle') {
    Object.assign(p, { bob: Math.sin(ph) * 1.1, sway: Math.sin(ph + 1) * 1.6, hem: Math.sin(ph) * 0.8, orb: 1 + 0.15 * Math.sin(ph * 2), blink: f === 4, armLf: Math.sin(ph) * 1.5 });
  } else if (clip === 'walk') {
    Object.assign(p, {
      stepA: Math.sin(ph) * 9, stepB: -Math.sin(ph) * 9, liftA: Math.max(0, Math.cos(ph)) * 3.5, liftB: Math.max(0, -Math.cos(ph)) * 3.5,
      bob: -Math.abs(Math.sin(ph)) * 2.2, lean: 3.5, sway: -Math.sin(ph + 0.6) * 3 - 2, hem: Math.sin(ph) * 2.2, armLf: -Math.sin(ph) * 9, orb: 1.05,
    });
  } else if (clip === 'attack') {
    const L = (a) => a[f];
    Object.assign(p, { raise: L([0, 6, 12, 4, 1, 0]), fwd: L([0, -3, -7, 15, 9, 2]), lean: L([0, -2, -4, 6, 3, 0]), flash: L([0, 0, 0.15, 1, 0.5, 0]), orb: L([1, 1.3, 1.6, 2.1, 1.4, 1]), sway: L([0, 1, 3, -4, -2, 0]), armLf: L([0, -2, -4, 6, 3, 0]), bob: L([0, 0, -1, -1.5, -0.5, 0]) });
  } else if (clip === 'skill') {
    const L = (a) => a[f];
    Object.assign(p, {
      raise: L([0, 12, 26, 34, 30, 12, 4, 0]), fwd: L([0, -2, -4, -6, 14, 12, 6, 2]), lean: L([0, -2, -4, -6, 7, 5, 2, 0]), twoHand: f <= 4,
      flash: L([0, 0, 0.1, 0.35, 1, 0.6, 0.2, 0]), orb: L([1, 1.5, 2, 2.7, 3.3, 2.1, 1.4, 1]), sway: L([0, 2, 4, 5, -5, -3, -1, 0]), armL: L([0, 10, 22, 30, 24, 8, 2, 0]), bob: L([0, 0, 1, 2, -2, -1, 0, 0]),
    });
  } else if (clip === 'hit') {
    Object.assign(p, { lean: [-6, -9, -4][f], bob: [-1, -2, -1][f], blink: true, flash: 0, tint: [0.5, 0.3, 0][f], sway: [4, 6, 2][f], orb: 0.9 });
  }
  return p;
}

function gradX(g, x0, x1, [a, b, c]) { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, a); gr.addColorStop(0.45, b); gr.addColorStop(1, c); return gr; }
function stroke(g, w = 1.3, col = OUT) { g.lineWidth = w; g.strokeStyle = col; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }

export function drawMage(g, { yaw, clip, frame, frames }) {
  const P = pose(clip, frame, frames);
  const cf = Math.cos(yaw), sf = Math.sin(yaw), front = cf;
  const ox = 80, oy = 158;
  // 3D (X = lado esquerdo do personagem, Y = altura, Z = para frente) -> tela
  const pr = (X, Y, Z) => { const sx = X * cf + Z * sf, d = Z * cf - X * sf; return { x: ox + sx, y: oy - Y * cEl + d * sEl, d }; };
  const leanZ = (Y) => P.lean * (Y / 100);
  const bodyP = (X, Y, Z) => pr(X, Y + (Y > 40 ? P.bob : 0), Z + leanZ(Y));
  const ops = [];
  const op = (d, fn) => ops.push({ d, fn });

  // ---- cilindros/cones: silhueta de um tronco de cone entre dois discos horizontais ----
  const frustum = (Y1, r1, Y2, r2, cols, xo1 = 0, xo2 = 0) => {
    const A = bodyP(xo1, Y1, 0), B = bodyP(xo2, Y2, 0);
    g.beginPath();
    g.moveTo(A.x - r1, A.y); g.lineTo(B.x - r2, B.y);
    g.ellipse(B.x, B.y, r2, r2 * sEl, 0, Math.PI, TAU, false);
    g.lineTo(A.x + r1, A.y);
    g.ellipse(A.x, A.y, r1, r1 * sEl, 0, 0, Math.PI, false);
    g.closePath();
    g.fillStyle = gradX(g, Math.min(A.x - r1, B.x - r2), Math.max(A.x + r1, B.x + r2), cols); g.fill(); stroke(g);
  };

  const flare = P.hem;
  // ---- capa (atrás do corpo de frente; cobre o corpo de costas) ----
  op(-front * 18 - 5, () => {
    const a = bodyP(14, 84, -4), b = bodyP(-14, 84, -4), c = bodyP(-23 - P.sway, 40, -18), d = bodyP(23 + P.sway, 40, -18), m = bodyP(0, 31 + P.sway * 0.4, -22);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.quadraticCurveTo(m.x, m.y + 3, d.x, d.y); g.closePath();
    g.fillStyle = gradX(g, Math.min(c.x, d.x), Math.max(c.x, d.x), C.cape); g.fill(); stroke(g);
    g.beginPath(); g.moveTo(c.x, c.y); g.quadraticCurveTo(m.x, m.y + 3, d.x, d.y); g.strokeStyle = C.gold[1]; g.lineWidth = 2; g.stroke();
    g.strokeStyle = 'rgba(80,60,160,0.28)'; g.lineWidth = 1;
    for (const k of [-0.5, 0.5]) { const t1 = bodyP(14 * k * 2, 83, -4.5), t2 = bodyP(21 * k * 2 + P.sway * k, 38, -19); g.beginPath(); g.moveTo(t1.x, t1.y); g.quadraticCurveTo((t1.x + t2.x) / 2 + k * 3, (t1.y + t2.y) / 2, t2.x, t2.y); g.stroke(); }
    if (front < -0.2) { // emblema nas costas
      const e = bodyP(0, 64, -17.5); g.beginPath(); g.arc(e.x, e.y, 5.2, 0, TAU); g.fillStyle = C.capeIn; g.fill(); stroke(g, 1);
      g.beginPath(); g.moveTo(e.x, e.y - 3.4); g.lineTo(e.x + 1, e.y - 0.8); g.lineTo(e.x + 3.4, e.y); g.lineTo(e.x + 1, e.y + 0.8); g.lineTo(e.x, e.y + 3.4); g.lineTo(e.x - 1, e.y + 0.8); g.lineTo(e.x - 3.4, e.y); g.lineTo(e.x - 1, e.y - 0.8); g.closePath(); g.fillStyle = C.gold[0]; g.fill();
    }
  });

  // ---- pés (botas sob a barra) ----
  const foot = (X, step, lift) => {
    const q = pr(X, 0, step), d = q.d;
    op(d - 2, () => {
      g.beginPath(); g.ellipse(q.x, q.y - lift * cEl, 5.6, 4.2, 0, 0, TAU); g.fillStyle = gradX(g, q.x - 6, q.x + 6, ['#7a66d8', '#4a3f9a', '#2b2468']); g.fill(); stroke(g, 1.2);
      g.beginPath(); g.ellipse(q.x - 1.2, q.y - lift * cEl - 1.4, 2.4, 1.3, 0, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();
    });
  };
  foot(7, P.stepA, P.liftA); foot(-7, P.stepB, P.liftB);

  // ---- corpo: saia, tronco, detalhes frontais ----
  op(0, () => {
    frustum(6 + P.liftA * 0, 22 + flare * 0.4, 46, 12, C.robe, 0, 0);
    // painel frontal claro + runas na barra
    const FR = (X, Y, r) => bodyP(X, Y, Math.sqrt(Math.max(0, r * r - X * X)));
    if (front > -0.05) {
      const a = FR(-5, 8, 21.4), b = FR(5, 8, 21.4), c = FR(3, 46, 11.3), d2 = FR(-3, 46, 11.3);
      const vis = Math.max(0, Math.min(1, front * 1.4 + 0.1));
      g.globalAlpha = vis; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d2.x, d2.y); g.closePath();
      g.fillStyle = gradX(g, a.x, b.x, C.inner); g.fill(); stroke(g, 1); g.globalAlpha = 1;
    }
    const hemC = bodyP(0, 6, 0);
    g.beginPath(); g.ellipse(hemC.x, hemC.y, 22 + flare * 0.4, (22 + flare * 0.4) * sEl, 0, 0, Math.PI, false); g.strokeStyle = C.gold[1]; g.lineWidth = 2.6; g.stroke();
    for (let k = 0; k < 9; k++) { // runas ao redor da barra, giram com a direção
      const th = (k / 9) * TAU, q = bodyP(Math.sin(th) * 21.6, 8.5, Math.cos(th) * 21.6), dd = Math.cos(th) * cf - Math.sin(th) * sf;
      if (dd > 0.25) { g.beginPath(); g.arc(q.x, q.y, 1.5, 0, TAU); g.fillStyle = C.gold[0]; g.fill(); }
    }
    frustum(46, 12, 78, 14, C.robe, 0, 0);
    // cinto dourado e bolsa
    const bc = bodyP(0, 47, 0); g.beginPath(); g.ellipse(bc.x, bc.y, 12.3, 12.3 * sEl, 0, 0, Math.PI, false); g.strokeStyle = C.gold[1]; g.lineWidth = 3.2; g.stroke(); g.strokeStyle = OUT; g.lineWidth = 0.8; g.stroke();
    if (front > 0.2) { const gem = bodyP(0, 47, 12.2); g.beginPath(); g.arc(gem.x, gem.y, 2.6, 0, TAU); g.fillStyle = C.capeIn; g.fill(); stroke(g, 1); }
    // colarinho em V e gola dourada
    if (front > -0.1) {
      const l = bodyP(-6, 80, 10), r = bodyP(6, 80, 10), tip = bodyP(0, 60, 12.6);
      g.globalAlpha = Math.min(1, front * 1.6 + 0.2); g.beginPath(); g.moveTo(l.x, l.y); g.lineTo(r.x, r.y); g.lineTo(tip.x, tip.y); g.closePath(); g.fillStyle = gradX(g, l.x, r.x, C.inner); g.fill(); stroke(g, 1); g.globalAlpha = 1;
    }
    const sc = bodyP(0, 79, 0); g.beginPath(); g.ellipse(sc.x, sc.y, 14.2, 14.2 * sEl, 0, Math.PI, TAU, false); g.lineTo(sc.x + 14.2, sc.y); g.strokeStyle = C.gold[1]; g.lineWidth = 2.2; g.stroke();
    // ombreiras
    for (const sx of [14, -14]) { const s = bodyP(sx, 80, 0); g.beginPath(); g.ellipse(s.x, s.y, 6.2, 5.2, 0, 0, TAU); g.fillStyle = gradX(g, s.x - 5, s.x + 5, C.robe); g.fill(); stroke(g, 1.1); }
  });

  // ---- cajado e braços ----
  const G = { X: -20, Y: 58 + P.raise * 0.55, Z: 9 + P.fwd * 0.6 };
  const tilt = P.fwd * 0.5 + P.lean * 0.5;
  const staffBase = pr(G.X, P.raise * 0.8, G.Z - tilt * 0.35), staffTop = pr(G.X, P.raise * 0.8 + 132, G.Z + tilt * 0.65);
  op(pr(G.X, 0, G.Z).d + 0.5, () => {
    const a = staffBase, b = staffTop;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokeStyle = OUT; g.lineWidth = 5; g.lineCap = 'round'; g.stroke();
    g.strokeStyle = C.wood[1]; g.lineWidth = 3.1; g.stroke();
    g.beginPath(); g.moveTo(a.x - 0.6, a.y); g.lineTo(b.x - 0.6, b.y); g.strokeStyle = 'rgba(255,230,200,0.35)'; g.lineWidth = 0.9; g.stroke();
    const w = Math.min(2, P.orb) * 0 + 1;
    // crescente dourado + orbe
    const T = b, orbR = 6.2 * Math.min(1.7, P.orb), glow = 12 + 9 * P.orb;
    const gl = g.createRadialGradient(T.x, T.y - 3, 1, T.x, T.y - 3, glow); gl.addColorStop(0, `rgba(120,255,235,${0.55 + 0.1 * P.orb})`); gl.addColorStop(1, 'rgba(120,255,235,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(T.x, T.y - 3, glow, 0, TAU); g.fill();
    g.beginPath(); g.arc(T.x, T.y - 4, 8.6, Math.PI * 0.12, Math.PI * 0.88, false); g.strokeStyle = OUT; g.lineWidth = 4.6; g.stroke(); g.strokeStyle = C.gold[1]; g.lineWidth = 2.6; g.stroke();
    const og = g.createRadialGradient(T.x - 1.6, T.y - 6.2, 0.5, T.x, T.y - 4.5, orbR); og.addColorStop(0, '#ffffff'); og.addColorStop(0.35, '#a6fff2'); og.addColorStop(1, '#27c4c0');
    g.beginPath(); g.arc(T.x, T.y - 4.5, orbR, 0, TAU); g.fillStyle = og; g.fill(); stroke(g, 1.1);
    if (P.flash > 0) {
      const fr = orbR * (2.1 + P.flash * 1.6), fg = g.createRadialGradient(T.x, T.y - 4.5, orbR * 0.4, T.x, T.y - 4.5, fr);
      fg.addColorStop(0, `rgba(255,255,255,${0.85 * P.flash})`); fg.addColorStop(0.4, `rgba(150,255,240,${0.5 * P.flash})`); fg.addColorStop(1, 'rgba(120,255,235,0)');
      g.fillStyle = fg; g.beginPath(); g.arc(T.x, T.y - 4.5, fr, 0, TAU); g.fill();
      for (let k = 0; k < 6; k++) { const a2 = (k / 6) * TAU + frame, r2 = orbR * (2 + P.flash * 2.2); g.beginPath(); g.arc(T.x + Math.cos(a2) * r2, T.y - 4.5 + Math.sin(a2) * r2 * 0.8, 1.3, 0, TAU); g.fillStyle = '#d9fffb'; g.fill(); }
    }
  });
  const sleeve = (S, H, cuff) => {
    const dx = H.x - S.x, dy = H.y - S.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    g.beginPath(); g.moveTo(S.x + nx * 4.2, S.y + ny * 4.2); g.lineTo(H.x + nx * cuff, H.y + ny * cuff); g.lineTo(H.x - nx * cuff, H.y - ny * cuff); g.lineTo(S.x - nx * 4.2, S.y - ny * 4.2); g.closePath();
    g.fillStyle = gradX(g, Math.min(S.x, H.x) - 8, Math.max(S.x, H.x) + 8, C.robe); g.fill(); stroke(g, 1.2);
    g.beginPath(); g.moveTo(H.x + nx * cuff, H.y + ny * cuff); g.lineTo(H.x - nx * cuff, H.y - ny * cuff); g.strokeStyle = C.gold[1]; g.lineWidth = 2.4; g.stroke();
    g.beginPath(); g.arc(H.x + (dx / len) * 3, H.y + (dy / len) * 3, 3.1, 0, TAU); g.fillStyle = gradX(g, H.x - 3, H.x + 3, C.skin); g.fill(); stroke(g, 1);
  };
  const SR = bodyP(-14.5, 79, 0), SL = bodyP(14.5, 79, 0);
  const HR = bodyP(G.X, G.Y, G.Z);
  const HLpos = P.twoHand ? { X: G.X, Y: G.Y + 16, Z: G.Z + tilt * 0.12 } : { X: 17, Y: 52 + P.armL * 0.9, Z: 7 + P.armLf + P.armL * 0.25 };
  const HL = bodyP(HLpos.X, HLpos.Y, HLpos.Z);
  op((SR.d + HR.d) / 2 + 0.8, () => sleeve(SR, HR, 6.2));
  op((SL.d + HL.d) / 2 + 0.8, () => sleeve(SL, HL, 6.2));

  // ---- cabelo de trás (atrás da cabeça de frente; cobre de costas) ----
  const sw = P.sway;
  op(-front * 20 - 3, () => {
    const tl = bodyP(13, 100, -3), tr = bodyP(-13, 100, -3), br = bodyP(-14, 68, -12), bl = bodyP(14, 68, -12);
    const tip1 = bodyP(-10 - sw, 44, -14), tip2 = bodyP(0, 36 - sw * 0.3, -15), tip3 = bodyP(10 - sw, 45, -14);
    g.beginPath(); g.moveTo(tl.x, tl.y); g.lineTo(tr.x, tr.y); g.lineTo(br.x, br.y); g.lineTo(tip1.x, tip1.y); g.lineTo((tip1.x + tip2.x) / 2, tip2.y - 5); g.lineTo(tip2.x, tip2.y); g.lineTo((tip3.x + tip2.x) / 2, tip2.y - 5); g.lineTo(tip3.x, tip3.y); g.lineTo(bl.x, bl.y); g.closePath();
    g.fillStyle = gradX(g, Math.min(tl.x, tr.x) - 6, Math.max(tl.x, tr.x) + 6, C.hair); g.fill(); stroke(g, 1.3);
    g.strokeStyle = 'rgba(70,40,170,0.30)'; g.lineWidth = 1;
    for (const k of [-0.66, -0.22, 0.22, 0.66]) { const t1 = bodyP(13 * k, 92, -6), t2 = bodyP(12 * k - sw * 0.4, 46, -13); g.beginPath(); g.moveTo(t1.x, t1.y); g.quadraticCurveTo((t1.x + t2.x) / 2 + k * 4, (t1.y + t2.y) / 2, t2.x, t2.y); g.stroke(); }
    if (front < 0.3) {
      const h = bodyP(0, 96, -2); g.beginPath(); g.arc(h.x, h.y, 15.2, 0, TAU); g.fillStyle = gradX(g, h.x - 14, h.x + 14, C.hair); g.fill(); stroke(g, 1.4);
      g.save(); g.beginPath(); g.arc(h.x, h.y, 15.2, 0, TAU); g.clip();
      g.strokeStyle = 'rgba(70,40,170,0.34)'; g.lineWidth = 1.1;
      for (let k = -4; k <= 4; k++) { g.beginPath(); g.moveTo(h.x + k * 3.1, h.y - 15); g.quadraticCurveTo(h.x + k * 4.6, h.y, h.x + k * 3.3 + sw * 0.2, h.y + 17); g.stroke(); }
      g.beginPath(); g.arc(h.x - 1, h.y - 1, 11, Math.PI * 1.1, Math.PI * 1.62); g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2.6; g.stroke();
      g.restore();
      const tie = bodyP(0, 80, -12.5); // laco dourado com fitas
      g.beginPath(); g.arc(tie.x, tie.y, 3.2, 0, TAU); g.fillStyle = C.gold[1]; g.fill(); stroke(g, 1);
      g.beginPath(); g.moveTo(tie.x, tie.y); g.quadraticCurveTo(tie.x - 7 - sw, tie.y + 8, tie.x - 5 - sw, tie.y + 17); g.lineTo(tie.x - 1, tie.y + 3); g.closePath(); g.fillStyle = C.capeIn; g.fill(); stroke(g, 0.9);
      g.beginPath(); g.moveTo(tie.x, tie.y); g.quadraticCurveTo(tie.x + 7 - sw, tie.y + 8, tie.x + 5 - sw, tie.y + 17); g.lineTo(tie.x + 1, tie.y + 3); g.closePath(); g.fillStyle = C.capeIn; g.fill(); stroke(g, 0.9);
    }
  });

  // ---- cabeça: crânio, rosto, olhos, franja ----
  const R = 14, HC = bodyP(0, 96, 0);
  op(0.2, () => {
    g.beginPath(); g.arc(HC.x, HC.y, R, 0, TAU); g.fillStyle = gradX(g, HC.x - R, HC.x + R, C.hair); g.fill();
    g.save(); g.beginPath(); g.arc(HC.x, HC.y, R, 0, TAU); g.clip();
    if (front > -0.9) { // placa do rosto: fica do lado para onde o personagem olha
      const fw = Math.max(0, R * (0.52 + 0.42 * cf)), fx = HC.x + R * 0.6 * sf;
      g.beginPath(); g.ellipse(fx, HC.y + 2.6, fw, R * 0.82, 0, 0, TAU); g.fillStyle = gradX(g, fx - fw, fx + fw, C.skin); g.fill();
    }
    g.restore();
    g.beginPath(); g.arc(HC.x, HC.y, R, 0, TAU); stroke(g, 1.4);
    const eye = (X) => {
      const q = bodyP(X, 95, 12.4);
      const vis = q.d - HC.d; if (vis < 1.5) return;
      const wv = Math.max(0.3, Math.min(1, vis / 12)), ew = 4 * wv, eh = 5.9;
      if (P.blink) { g.beginPath(); g.moveTo(q.x - ew - 0.8, q.y + 0.4); g.quadraticCurveTo(q.x, q.y + 2.2, q.x + ew + 0.8, q.y + 0.4); g.strokeStyle = OUT; g.lineWidth = 1.4; g.stroke(); return; }
      g.beginPath(); g.ellipse(q.x, q.y, ew + 0.7, eh + 0.5, 0, 0, TAU); g.fillStyle = '#fff'; g.fill();
      const ig = g.createLinearGradient(0, q.y - eh, 0, q.y + eh); ig.addColorStop(0, C.iris[2]); ig.addColorStop(0.5, C.iris[1]); ig.addColorStop(1, C.iris[0]);
      g.beginPath(); g.ellipse(q.x + sf * 0.3, q.y + 0.3, ew * 0.92, eh * 0.95, 0, 0, TAU); g.fillStyle = ig; g.fill();
      g.beginPath(); g.ellipse(q.x + sf * 0.4, q.y + 0.9, ew * 0.4, eh * 0.45, 0, 0, TAU); g.fillStyle = '#0d3b4a'; g.fill();
      g.beginPath(); g.arc(q.x - ew * 0.35, q.y - eh * 0.4, 1.25 * wv + 0.2, 0, TAU); g.fillStyle = '#fff'; g.fill();
      g.beginPath(); g.arc(q.x + ew * 0.3, q.y + eh * 0.45, 0.65, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill();
      g.beginPath(); g.ellipse(q.x, q.y - eh * 0.9, ew + 1.2, 1.3, 0, Math.PI, TAU); g.strokeStyle = OUT; g.lineWidth = 1.9; g.stroke();
    };
    eye(5.2); eye(-5.2);
    if (front > 0.15) {
      const m = bodyP(0, 88.4, 13.1); g.beginPath(); g.moveTo(m.x - 1.6, m.y); g.quadraticCurveTo(m.x, m.y + 1.5, m.x + 1.6, m.y); g.strokeStyle = '#a24a5a'; g.lineWidth = 1.1; g.stroke();
      for (const X of [8.2, -8.2]) { const b = bodyP(X, 90.8, 10.6); if (b.d - HC.d > 2) { g.beginPath(); g.ellipse(b.x, b.y, 2.5, 1.5, 0, 0, TAU); g.fillStyle = 'rgba(255,120,140,0.32)'; g.fill(); } }
    }
    if (Math.abs(sf) > 0.55 && cf > -0.6) { // nariz no perfil / tres quartos
      const n1 = bodyP(0, 94.4, 13.6), n2 = bodyP(0, 92.4, 15.8), n3 = bodyP(0, 91.4, 13.7);
      g.beginPath(); g.moveTo(n1.x, n1.y); g.lineTo(n2.x, n2.y); g.lineTo(n3.x, n3.y); g.closePath(); g.fillStyle = C.skin[1]; g.fill(); stroke(g, 0.9);
    }
    // franja
    if (front > -0.25) {
      const bangs = [[-8.5, 5], [-4.5, 7.5], [0, 5], [4.5, 7.5], [8.5, 5]];
      g.beginPath(); const s0 = bodyP(-13, 104, 3); g.moveTo(s0.x, s0.y);
      for (const [X, dy] of bangs) { const tip = bodyP(X * 1.1, 100.5 - dy, Math.sqrt(Math.max(1, 13.8 * 13.8 - X * X * 1.2)) - 0.5); const up = bodyP(X + 2.6, 105.5, 11.6); g.lineTo(tip.x, tip.y); g.lineTo(up.x, up.y); }
      const s1 = bodyP(13, 104, 3); g.lineTo(s1.x, s1.y); g.lineTo(HC.x, HC.y - R - 1); g.closePath();
      g.globalAlpha = Math.min(1, front * 2.4 + 0.5); g.fillStyle = gradX(g, HC.x - 12, HC.x + 12, C.hair); g.fill(); stroke(g, 1.1); g.globalAlpha = 1;
    }
  });
  // mechas laterais caindo sobre os ombros
  for (const X of [13.2, -13.2]) {
    const top = bodyP(X, 94, 3.5), bot = bodyP(X * 0.95, 60, 8 + sw * 0.15), d = (top.d + bot.d) / 2;
    op(d + 0.9, () => {
      const nx = 3.1;
      g.beginPath(); g.moveTo(top.x - nx, top.y); g.quadraticCurveTo(top.x - nx - 1 + sw * 0.3, (top.y + bot.y) / 2, bot.x - 0.8, bot.y + 4); g.quadraticCurveTo(bot.x + 1, bot.y - 3, top.x + nx, top.y); g.closePath();
      g.fillStyle = gradX(g, top.x - 4, top.x + 4, C.hair); g.fill(); stroke(g, 1.1);
    });
  }

  // ---- chapéu de mago: aba, cone dobrado para trás, faixa dourada e estrela ----
  op(0.6, () => {
    const brim = bodyP(0, 113, -4), bR = 23;
    g.beginPath(); g.ellipse(brim.x, brim.y, bR, bR * sEl, 0, 0, TAU);
    g.fillStyle = gradX(g, brim.x - bR, brim.x + bR, C.hat); g.fill(); stroke(g, 1.4);
    g.beginPath(); g.ellipse(brim.x, brim.y + 1.1, bR - 1.6, (bR - 1.6) * sEl, 0, 0.05, Math.PI - 0.05, false); g.strokeStyle = C.gold[1]; g.lineWidth = 1.6; g.stroke();
    const base = bodyP(0, 114, -4.5), baseR = 16.4, tipP = bodyP(7 + sw * 0.6, 160, -21 - P.lean * 0.3);
    const mid = bodyP(-1, 139, -12);
    g.beginPath(); g.moveTo(base.x - baseR, base.y); g.quadraticCurveTo(mid.x - 8, mid.y + 4, tipP.x, tipP.y);
    g.quadraticCurveTo(mid.x + 11, mid.y + 6, base.x + baseR, base.y);
    g.ellipse(base.x, base.y, baseR, baseR * sEl, 0, 0, Math.PI, false); g.closePath();
    g.fillStyle = gradX(g, base.x - baseR, base.x + baseR, C.hat); g.fill(); stroke(g, 1.4);
    const b2 = bodyP(0, 118, -4.5); g.beginPath(); g.ellipse(b2.x, b2.y, 16, 16 * sEl, 0, 0, Math.PI, false); g.strokeStyle = OUT; g.lineWidth = 5.6; g.stroke(); g.strokeStyle = C.gold[1]; g.lineWidth = 3.6; g.stroke();
    if (front > -0.1) { // estrela na faixa
      const s = bodyP(0, 118, 11.6), r = 3.8; g.globalAlpha = Math.min(1, front * 2 + 0.3); g.beginPath();
      for (let k = 0; k < 10; k++) { const a2 = (k / 10) * TAU - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; g.lineTo(s.x + Math.cos(a2) * rr, s.y + Math.sin(a2) * rr); }
      g.closePath(); g.fillStyle = C.gold[0]; g.fill(); stroke(g, 0.9); g.globalAlpha = 1;
    }
  });

  ops.sort((a, b) => a.d - b.d);
  for (const o of ops) o.fn();
  if (P.tint > 0) { // quadro de dano: clareia o desenho já feito
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(255,255,255,${P.tint})`; g.fillRect(0, 0, 160, 176); g.globalCompositeOperation = 'source-over';
  }
}

export const MAGE_FRAME = { w: 160, h: 176 };
export const MAGE_PIVOT = { x: 80, y: 158 };
