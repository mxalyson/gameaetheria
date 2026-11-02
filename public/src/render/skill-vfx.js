// Efeitos visuais das 12 habilidades (Canvas 2D). SÓ APRESENTAÇÃO: nascem dos eventos reais de combate (`cast` da simulação local ou confirmados pelo servidor)
// e dos projéteis já existentes; nunca decidem dano, alcance nem resultado. Tempo = world.time (a simulação local e o modo online avançam o mesmo relógio).
// Sem alocação por quadro: os objetos de efeito são criados uma vez ao lançar; o desenho só lê e calcula.
import { SKILLS } from '../data/skills.js';

const TAU = Math.PI * 2;
const MAX_FX = 22;
const ease = (k) => 1 - (1 - k) * (1 - k);
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); };

// qual efeito cada habilidade usa (a chave é o id real em data/skills.js)
const KIND = {
  whirlwind: 'whirl', charge: 'dashtrail', warcry: 'warcry',
  fireball: 'muzzle', frostnova: 'frost', blink: 'blink',
  rain: 'rain', pierce: 'pierce', roll: 'roll',
  holylight: 'sun', divineshield: 'bubble', judgement: 'beam',
};
const LIFE = { crit: 0.32, absorb: 0.4, heal: 0.85, whirl: 0.55, dashtrail: 0.65, warcry: 1.2, muzzle: 0.3, frost: 0.7, blink: 0.6, rain: 2.6, pierce: 0.32, roll: 0.7, sun: 0.85, bubble: 6.4, beam: 0.45 };

// Acerto crítico, golpe absorvido por escudo e cura relevante (eventos reais `hit` e `heal`; o servidor manda os mesmos no online). Cura de regeneração (pequena e constante) não gera efeito.
const healAt = new WeakMap();
export function spawnEventVfx(world, ev) {
  const a = ev.type === 'heal' ? ev.actor : ev.target;
  if (!a || !world) return null;
  let kind = null;
  if (ev.type === 'hit') kind = ev.absorbed ? 'absorb' : ev.crit ? 'crit' : null;
  else if (ev.type === 'heal' && ev.amount >= (a.maxHp ?? 100) * 0.04) {
    const last = healAt.get(a);
    if (last === undefined || world.time - last >= 0.5) { healAt.set(a, world.time); kind = 'heal'; }
  }
  if (!kind) return null;
  const list = (world.svfx ??= []);
  if (list.length >= MAX_FX) list.shift();
  const f = { kind, skill: null, t0: world.time, life: LIFE[kind], actor: a, x: a.x, y: a.y, ang: 0, color: '', r: a.r ?? 14, tx: null, ty: null, ox: a.x, oy: a.y, seed: (a.id ?? 1) * 7919, pts: null, dur: 0, range: 0 };
  list.push(f);
  return f;
}

// posição anterior de cada ator (para achar a ORIGEM do Teleporte, já que o evento chega depois de o ator se mover)
const lastPos = new WeakMap();

export function spawnSkillVfx(world, ev) {
  const kind = KIND[ev.skill];
  const a = ev.actor;
  if (!kind || !a || !world) return null;
  const s = SKILLS[ev.skill];
  const list = (world.svfx ??= []);
  if (list.length >= MAX_FX) list.shift();
  const prev = lastPos.get(a);
  const f = {
    kind, skill: ev.skill, t0: world.time, life: kind === 'bubble' || kind === 'warcry' ? Math.max(LIFE[kind], (s.dur ?? 0) + 0.4) : LIFE[kind],
    actor: a, x: a.x, y: a.y, ang: ev.ang ?? a.facing ?? 0, color: s.color, r: s.radius ?? 60,
    tx: ev.tx ?? null, ty: ev.ty ?? null, ox: prev ? prev.x : a.x, oy: prev ? prev.y : a.y,
    seed: ((world.time * 1000) | 0) ^ (a.id ?? 7), pts: kind === 'dashtrail' || kind === 'roll' ? [] : null, dur: s.dur ?? 0, range: s.range ?? 500,
  };
  list.push(f);
  return f;
}

// Projéteis das habilidades (reconhecidos pelas propriedades que a simulação já dá): devolve true se desenhou.
export function drawSkillProjectile(g, p, time) {
  const prevOp = g.globalCompositeOperation; g.globalCompositeOperation = 'source-over';
  const done = drawSkillProjectileOpaque(g, p, time);
  g.globalCompositeOperation = prevOp;
  return done;
}
function drawSkillProjectileOpaque(g, p, time) {
  const speed = Math.hypot(p.vx, p.vy);
  if (p.src?.kind === 'spirit') return false;
  const cos = Math.cos(p.ang), sin = Math.sin(p.ang);
  if (p.explode > 0) { // Bola de Fogo: cabeça incandescente + cauda de chamas tremulante
    for (let i = 5; i >= 1; i--) {
      const back = i * 9, fl = Math.sin(time * 38 + i * 1.7) * 2.5, r = p.radius * (1.9 - i * 0.2);
      g.globalAlpha = 0.5 - i * 0.07; g.fillStyle = i > 3 ? '#c8321a' : '#ff7a3a';
      circle(g, p.x - cos * back - sin * fl, p.y - sin * back + cos * fl, r); g.fill();
    }
    g.globalAlpha = 1;
    const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 2.6);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.3, '#ffd27a'); grd.addColorStop(0.65, p.color); grd.addColorStop(1, p.color + '00');
    g.fillStyle = grd; circle(g, p.x, p.y, p.radius * 2.6); g.fill();
    return true;
  }
  if (p.pierce && speed > 600) { // Tiro Perfurante: flecha fina com rastro longo
    g.strokeStyle = 'rgba(30,70,20,0.45)'; g.lineWidth = 6.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(p.x - cos * 60, p.y - sin * 60); g.lineTo(p.x + cos * 6, p.y + sin * 6); g.stroke();
    const grd = g.createLinearGradient(p.x - cos * 70, p.y - sin * 70, p.x, p.y);
    grd.addColorStop(0, '#9be02e00'); grd.addColorStop(1, '#ffffff');
    g.strokeStyle = grd; g.lineWidth = 3.4;
    g.beginPath(); g.moveTo(p.x - cos * 70, p.y - sin * 70); g.lineTo(p.x + cos * 6, p.y + sin * 6); g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(p.x + cos * 12, p.y + sin * 12); g.lineTo(p.x - cos * 2 - sin * 4, p.y - sin * 2 + cos * 4); g.lineTo(p.x - cos * 2 + sin * 4, p.y - sin * 2 - cos * 4); g.closePath(); g.fill();
    return true;
  }
  if (p.stun > 0 && !p.explode && !p.pierce && p.radius >= 8) { // Julgamento: núcleo branco-dourado com estrela de quatro pontas
    const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.3, '#ffe27a'); grd.addColorStop(0.7, '#ffb81f'); grd.addColorStop(1, '#d98f0000');
    g.fillStyle = grd; circle(g, p.x, p.y, p.radius * 3); g.fill();
    g.strokeStyle = '#a8760d'; g.lineWidth = 3.4; g.lineCap = 'round'; g.beginPath();
    const L = p.radius * 2.8, rot = time * 6;
    for (let i = 0; i < 2; i++) { const a = rot + i * Math.PI / 2; g.moveTo(p.x - Math.cos(a) * L, p.y - Math.sin(a) * L); g.lineTo(p.x + Math.cos(a) * L, p.y + Math.sin(a) * L); }
    g.stroke();
    return true;
  }
  return false;
}

// Desenha e descarta os efeitos vencidos. `lite` (qualidade baixa) reduz detalhes.
export function drawSkillVfx(g, world, lite = false) {
  const list = world.svfx;
  const now = world.time;
  if (!list || !list.length) { return; }
  g.save();
  g.globalCompositeOperation = 'source-over';
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i];
    const el = now - f.t0;
    if (el >= f.life || el < -0.5) { list.splice(i, 1); continue; }
    const k = clamp01(el / f.life);
    const a = f.actor;
    const cx = a && !a.dead ? a.x : f.x, cy = a && !a.dead ? a.y : f.y;
    g.lineCap = 'round'; g.lineJoin = 'round';
    switch (f.kind) {
      case 'whirl': drawWhirl(g, f, k, cx, cy, lite); break;
      case 'dashtrail': drawTrail(g, f, el, cx, cy, '#ff5a1f', '#ffe08a', 16); break;
      case 'roll': drawTrail(g, f, el, cx, cy, '#2e9d4f', '#eaffe9', 11); drawLeaves(g, f, el, cx, cy); break;
      case 'warcry': drawWarcry(g, f, el, cx, cy, lite); break;
      case 'muzzle': drawMuzzle(g, f, k); break;
      case 'frost': drawFrost(g, f, k, cx, cy, lite); break;
      case 'blink': drawBlink(g, f, k, cx, cy); break;
      case 'rain': drawRain(g, f, el, lite); break;
      case 'pierce': drawPierce(g, f, k, cx, cy); break;
      case 'sun': drawSun(g, f, k, cx, cy, lite); break;
      case 'bubble': drawBubble(g, f, el, cx, cy); break;
      case 'beam': drawBeam(g, f, k, cx, cy); break;
      case 'crit': drawCrit(g, f, k, cx, cy); break;
      case 'absorb': drawAbsorb(g, f, k, cx, cy); break;
      case 'heal': drawHeal(g, f, k, cx, cy); break;
    }
  }
  g.restore();
  g.globalAlpha = 1;
}

// ---- um desenho por efeito ----
function drawWhirl(g, f, k, cx, cy, lite) {
  const R = f.r * (0.4 + 0.6 * ease(k)), a0 = k * TAU * 1.7;
  g.globalAlpha = (1 - k) * 0.95;
  for (let i = 0; i < 3; i++) {
    const a = a0 + i * TAU / 3, rr = R * (0.8 + 0.1 * i);
    g.strokeStyle = 'rgba(90,25,5,0.4)'; g.lineWidth = 14 * (1 - k) + 4; g.beginPath(); g.arc(cx, cy, rr, a, a + 1.6); g.stroke();
    g.strokeStyle = i === 1 ? '#ff8a3d' : '#ff5a1f'; g.lineWidth = 10 * (1 - k) + 2;
    g.beginPath(); g.arc(cx, cy, rr, a, a + 1.6); g.stroke();
    g.strokeStyle = '#fff0b0'; g.lineWidth = 3.4 * (1 - k) + 0.6;
    g.beginPath(); g.arc(cx, cy, rr, a + 0.25, a + 1.35); g.stroke();
  }
  g.strokeStyle = '#ff5a1f'; g.lineWidth = 3 * (1 - k) + 1; circle(g, cx, cy, R * 1.06); g.stroke();
  if (!lite) { const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R); grd.addColorStop(0, 'rgba(255,120,40,0)'); grd.addColorStop(1, 'rgba(255,90,20,0.34)'); g.fillStyle = grd; circle(g, cx, cy, R); g.fill(); }
}
// rastro do avanço/rolamento: acompanha o ator e guarda os últimos pontos (alocação só no início do efeito)
function drawTrail(g, f, el, cx, cy, c1, c2, w) {
  const pts = f.pts;
  if (el < 0.38) {
    const l = pts[pts.length - 2], d = l === undefined ? 0 : Math.hypot(cx - l, cy - pts[pts.length - 1]);
    if (d > 140) pts.length = 0; // salto grande (teletransporte/troca de mapa/empurrão): recomeça o rastro em vez de riscar uma faixa diagonal até o ponto antigo (V18)
    if (l === undefined || d > 3) pts.push(cx, cy); if (pts.length > 30) pts.splice(0, 2);
  }
  const fade = clamp01(1 - (el - 0.2) / 0.45);
  const n = pts.length / 2;
  if (n < 2) return;
  for (let i = 1; i < n; i++) {
    if (Math.hypot(pts[i * 2] - pts[(i - 1) * 2], pts[i * 2 + 1] - pts[(i - 1) * 2 + 1]) > 140) continue;
    const u = i / n;
    g.globalAlpha = fade * u * 0.9;
    g.strokeStyle = 'rgba(40,20,10,0.32)'; g.lineWidth = w * u + 4;
    g.beginPath(); g.moveTo(pts[(i - 1) * 2], pts[(i - 1) * 2 + 1]); g.lineTo(pts[i * 2], pts[i * 2 + 1]); g.stroke();
    g.strokeStyle = c1; g.lineWidth = w * u + 1;
    g.beginPath(); g.moveTo(pts[(i - 1) * 2], pts[(i - 1) * 2 + 1]); g.lineTo(pts[i * 2], pts[i * 2 + 1]); g.stroke();
    g.strokeStyle = c2; g.lineWidth = (w * u + 1) * 0.35;
    g.beginPath(); g.moveTo(pts[(i - 1) * 2], pts[(i - 1) * 2 + 1]); g.lineTo(pts[i * 2], pts[i * 2 + 1]); g.stroke();
  }
  if (el < 0.25) { g.globalAlpha = (1 - el / 0.25) * 0.7; g.strokeStyle = c2; g.lineWidth = 3; circle(g, f.x, f.y, 14 + el * 120); g.stroke(); }
}
function drawLeaves(g, f, el, cx, cy) {
  g.globalAlpha = clamp01(1 - el / 0.65) * 0.9; g.fillStyle = '#3fae4a';
  for (let i = 0; i < 6; i++) { const a = el * 9 + i * TAU / 6, r = 18 + el * 26; g.save(); g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7); g.rotate(a * 2); g.beginPath(); g.ellipse(0, 0, 5, 2.2, 0, 0, TAU); g.fill(); g.restore(); }
}
function drawWarcry(g, f, el, cx, cy, lite) {
  // ondas sonoras à frente (início) + aura de brasas que dura o tempo do buff
  if (el < 0.6) for (let i = 0; i < 3; i++) {
    const u = clamp01((el - i * 0.1) / 0.45); if (u <= 0) continue;
    g.globalAlpha = (1 - u) * 0.85; g.strokeStyle = i === 1 ? '#ffb02e' : '#ff5a1f'; g.lineWidth = 5 * (1 - u) + 1;
    const d = 20 + u * 90; g.beginPath(); g.arc(cx + Math.cos(f.ang) * d * 0.5, cy + Math.sin(f.ang) * d * 0.5, d, f.ang - 0.9, f.ang + 0.9); g.stroke();
  }
  if (el < 0.5) { g.globalAlpha = (1 - el / 0.5) * 0.8; g.strokeStyle = '#e8501c'; g.lineWidth = 4; circle(g, cx, cy, 26 + ease(el / 0.5) * 70); g.stroke(); }
  const aura = clamp01(Math.min(el / 0.25, (f.dur + 0.2 - el) / 0.6));
  if (aura > 0) {
    g.globalAlpha = aura * 0.75; g.strokeStyle = '#e8501c'; g.lineWidth = 2.5; g.setLineDash([7, 6]); g.lineDashOffset = -el * 40;
    circle(g, cx, cy + 6, 30 + Math.sin(el * 7) * 2); g.stroke(); g.setLineDash([]);
    if (!lite) for (let i = 0; i < 6; i++) { const u = (el * 0.9 + i / 6) % 1, ang = i * 2.1 + el; g.globalAlpha = aura * (1 - u) * 0.85; g.fillStyle = i % 2 ? '#ffb02e' : '#ff5a1f'; circle(g, cx + Math.cos(ang) * 22, cy + 6 - u * 42, 2.4 * (1 - u) + 0.6); g.fill(); }
  }
}
function drawMuzzle(g, f, k) { // clarão no cajado/mão ao lançar a Bola de Fogo
  const x = f.x + Math.cos(f.ang) * 20, y = f.y + Math.sin(f.ang) * 20;
  g.globalAlpha = 1 - k; const grd = g.createRadialGradient(x, y, 0, x, y, 30 * (0.6 + k)); grd.addColorStop(0, '#fff6d8'); grd.addColorStop(0.4, '#ff9a2e'); grd.addColorStop(1, '#ff5a1f00');
  g.fillStyle = grd; circle(g, x, y, 30 * (0.6 + k)); g.fill();
}
function drawFrost(g, f, k, cx, cy, lite) {
  const R = f.r * ease(k), n = lite ? 6 : 10;
  g.globalAlpha = (1 - k) * 0.5; const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R); grd.addColorStop(0, 'rgba(170,230,255,0.75)'); grd.addColorStop(1, 'rgba(60,170,230,0)'); g.fillStyle = grd; circle(g, cx, cy, R); g.fill();
  g.globalAlpha = (1 - k * k) * 0.95;
  for (let i = 0; i < n; i++) {
    const a = i * TAU / n + 0.2, len = R * (i % 2 ? 0.62 : 0.95), w = 7 + (i % 2) * 3;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    g.lineTo(cx + Math.cos(a + 1.5708) * w, cy + Math.sin(a + 1.5708) * w); g.lineTo(cx + Math.cos(a - 1.5708) * w, cy + Math.sin(a - 1.5708) * w); g.closePath();
    g.fillStyle = i % 2 ? '#38a9e6' : '#bfefff'; g.fill(); g.strokeStyle = '#1d6fa5'; g.lineWidth = 1.6; g.stroke();
  }
  g.strokeStyle = '#1d6fa5'; g.lineWidth = 5 * (1 - k) + 2; circle(g, cx, cy, R); g.stroke(); g.strokeStyle = '#bfefff'; g.lineWidth = 2.4 * (1 - k) + 0.6; circle(g, cx, cy, R); g.stroke();
}
function drawBlink(g, f, k, cx, cy) {
  const o = 1 - k;
  g.globalAlpha = o * 0.95; g.strokeStyle = '#7a4dff'; g.lineWidth = 4 * o + 1; circle(g, f.ox, f.oy, 8 + 46 * (1 - ease(Math.min(1, k * 2)))); g.stroke(); // implosão na origem
  const grd = g.createLinearGradient(f.ox, f.oy - 70, f.ox, f.oy + 6); grd.addColorStop(0, 'rgba(122,77,255,0)'); grd.addColorStop(1, 'rgba(122,77,255,0.8)');
  g.globalAlpha = o * 0.8; g.fillStyle = grd; g.fillRect(f.ox - 7 * o, f.oy - 70, 14 * o, 76);
  g.globalAlpha = o; g.strokeStyle = '#5b2fe0'; g.lineWidth = 5 * o; circle(g, cx, cy, 10 + 44 * ease(k)); g.stroke(); g.strokeStyle = '#e9e0ff'; g.lineWidth = 2 * o; circle(g, cx, cy, 10 + 44 * ease(k)); g.stroke(); // chegada
  g.globalAlpha = o * 0.85; g.strokeStyle = '#4fb8ea'; g.lineWidth = 3; g.beginPath(); g.moveTo(f.ox, f.oy); g.lineTo(cx, cy); g.stroke(); // rastro entre os pontos
  g.fillStyle = '#7a4dff';
  for (let i = 0; i < 5; i++) { const a = i * 1.26 + k * 3, r = 10 + k * 34; circle(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.2 * o + 0.4); g.fill(); }
}
function drawRain(g, f, el, lite) {
  const tx = f.tx ?? f.x, ty = f.ty ?? f.y, R = f.r;
  const ring = clamp01(Math.min(el / 0.2, (f.life - el) / 0.4));
  g.globalAlpha = ring * 0.8; g.strokeStyle = '#2e7d32'; g.lineWidth = 2.5; g.setLineDash([9, 7]); g.lineDashOffset = -el * 36; circle(g, tx, ty, R); g.stroke(); g.setLineDash([]);
  const N = lite ? 10 : 18; let s = f.seed >>> 0;
  for (let i = 0; i < N; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const ra = (s / 4294967296) * TAU;
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const rr = Math.sqrt(s / 4294967296) * R * 0.92;
    const lx = tx + Math.cos(ra) * rr, ly = ty + Math.sin(ra) * rr, local = el - (0.15 + i * 0.125);
    if (local < 0) continue;
    if (local < 0.2) { // flecha caindo (inclinada)
      const u = local / 0.2, h = 150 * (1 - u);
      g.globalAlpha = 0.95; g.strokeStyle = '#4a3010'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(lx + h * 0.35, ly - h - 26); g.lineTo(lx + h * 0.35 - 3, ly - h); g.stroke();
      g.strokeStyle = '#fff3c4'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(lx + h * 0.35, ly - h - 26); g.lineTo(lx + h * 0.35 - 3, ly - h); g.stroke();
    } else if (local < 0.55) { // impacto
      const u = (local - 0.2) / 0.35; g.globalAlpha = (1 - u) * 0.9; g.strokeStyle = '#2e7d32'; g.lineWidth = 2.6 * (1 - u) + 0.6; circle(g, lx, ly, 4 + u * 20); g.stroke();
      g.fillStyle = '#d7f5a0'; circle(g, lx, ly, 3 * (1 - u)); g.fill();
    }
  }
}
function drawPierce(g, f, k, cx, cy) { // clarão do disparo + linha de luz até o fim do alcance
  const L = Math.min(f.range, 720), cos = Math.cos(f.ang), sin = Math.sin(f.ang), x0 = cx + cos * 18, y0 = cy + sin * 18;
  const grd = g.createLinearGradient(x0, y0, x0 + cos * L, y0 + sin * L); grd.addColorStop(0, 'rgba(120,200,30,0.95)'); grd.addColorStop(1, 'rgba(120,200,30,0)');
  g.globalAlpha = (1 - k); g.strokeStyle = 'rgba(30,70,20,0.35)'; g.lineWidth = 11 * (1 - k) + 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + cos * L * 0.7, y0 + sin * L * 0.7); g.stroke(); g.strokeStyle = grd; g.lineWidth = 7 * (1 - k) + 1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + cos * L, y0 + sin * L); g.stroke();
  g.strokeStyle = '#ffffff'; g.lineWidth = 2 * (1 - k); g.stroke();
  circle(g, x0, y0, 14 * (1 - k) + 3); g.fillStyle = '#c8ff3d'; g.fill();
}
function drawSun(g, f, k, cx, cy, lite) {
  const R = f.r * (0.45 + 0.55 * ease(k)), o = 1 - k * k;
  g.globalAlpha = o * 0.6; const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R); grd.addColorStop(0, 'rgba(255,240,170,0.95)'); grd.addColorStop(0.6, 'rgba(255,190,40,0.5)'); grd.addColorStop(1, 'rgba(255,190,40,0)');
  g.fillStyle = grd; circle(g, cx, cy, R); g.fill();
  const rays = lite ? 8 : 14; g.globalAlpha = o * 0.95;
  for (let i = 0; i < rays; i++) { const a = i * TAU / rays + k * 1.1, len = R * (i % 2 ? 0.7 : 1.05), w = 0.1; g.beginPath(); g.moveTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14); g.lineTo(cx + Math.cos(a - w) * len, cy + Math.sin(a - w) * len); g.lineTo(cx + Math.cos(a + w) * len, cy + Math.sin(a + w) * len); g.closePath(); g.fillStyle = '#ffb81f'; g.fill(); g.strokeStyle = '#b87a00'; g.lineWidth = 1.2; g.stroke(); }
  g.strokeStyle = '#d98f00'; g.lineWidth = 5 * (1 - k) + 1.5; circle(g, cx, cy, R); g.stroke(); g.strokeStyle = '#fff6d6'; g.lineWidth = 2 * (1 - k) + 0.5; circle(g, cx, cy, R); g.stroke();
  if (!lite) for (let i = 0; i < 9; i++) { const u = (k * 1.2 + i / 9) % 1, ang = i * 2.4; g.globalAlpha = (1 - u) * o; g.fillStyle = '#ffd24a'; circle(g, cx + Math.cos(ang) * R * 0.7 * (0.4 + (i % 3) * 0.25), cy - u * 56 + Math.sin(ang) * R * 0.2, 2.2 * (1 - u) + 0.5); g.fill(); }
}
function drawBubble(g, f, el, cx, cy) {
  const alpha = clamp01(Math.min(el / 0.15, (f.dur + 0.2 - el) / 0.6));
  if (alpha > 0) {
    const R = 34 + Math.sin(el * 5) * 1.5, grd = g.createRadialGradient(cx, cy - 4, R * 0.55, cx, cy - 4, R);
    grd.addColorStop(0, 'rgba(255,225,120,0)'); grd.addColorStop(0.75, 'rgba(255,200,60,0.3)'); grd.addColorStop(1, 'rgba(255,190,40,0.7)');
    g.globalAlpha = alpha; g.fillStyle = grd; circle(g, cx, cy - 4, R); g.fill();
    g.strokeStyle = '#d98f00'; g.lineWidth = 2.6; g.globalAlpha = alpha * 0.95; circle(g, cx, cy - 4, R); g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; for (let i = 0; i < 2; i++) { const a = el * 1.6 + i * Math.PI; g.beginPath(); g.arc(cx, cy - 4, R - 3, a, a + 0.7); g.stroke(); }
  }
  if (el < 0.45) { const u = el / 0.45; g.globalAlpha = (1 - u) * 0.95; g.strokeStyle = '#d98f00'; g.lineWidth = 5 * (1 - u) + 1; circle(g, cx, cy, 20 + ease(u) * 56); g.stroke(); }
}
function drawBeam(g, f, k, cx, cy) { // raio sagrado até o fim do alcance
  const L = Math.min(f.range, 560), cos = Math.cos(f.ang), sin = Math.sin(f.ang), x0 = cx + cos * 16, y0 = cy + sin * 16, o = 1 - k;
  g.globalAlpha = o * 0.5; g.strokeStyle = 'rgba(168,118,13,0.9)'; g.lineWidth = 30 * o + 5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + cos * L, y0 + sin * L); g.stroke();
  g.globalAlpha = o * 0.75; g.strokeStyle = 'rgba(255,196,60,0.95)'; g.lineWidth = 22 * o + 3; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + cos * L, y0 + sin * L); g.stroke();
  g.globalAlpha = o; g.strokeStyle = '#ffe27a'; g.lineWidth = 9 * o + 1; g.stroke();
  g.strokeStyle = '#ffffff'; g.lineWidth = 3 * o; g.stroke();
  const ex = x0 + cos * L, ey = y0 + sin * L; g.strokeStyle = '#d98f00'; g.lineWidth = 4 * o + 0.5; circle(g, ex, ey, 10 + 36 * ease(k)); g.stroke();
  g.globalAlpha = o * 0.95; g.fillStyle = '#ffd24a'; for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; circle(g, ex + Math.cos(a) * (8 + k * 30), ey + Math.sin(a) * (8 + k * 30), 2.4 * o + 0.5); g.fill(); }
}

function drawCrit(g, f, k, cx, cy) { // estrela de oito pontas que estoura no alvo
  const o = 1 - k, R = 12 + 30 * ease(k);
  g.globalAlpha = o;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + 0.3, len = R * (i % 2 ? 0.6 : 1), w = 0.13;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5); g.lineTo(cx + Math.cos(a - w) * len, cy + Math.sin(a - w) * len); g.lineTo(cx + Math.cos(a + w) * len, cy + Math.sin(a + w) * len); g.closePath();
    g.fillStyle = i % 2 ? '#ff9a2e' : '#ffe27a'; g.fill(); g.strokeStyle = '#a8460d'; g.lineWidth = 1.2; g.stroke();
  }
  g.strokeStyle = '#ff6a2a'; g.lineWidth = 3 * o + 0.5; circle(g, cx, cy, R * 0.8); g.stroke();
}
function drawAbsorb(g, f, k, cx, cy) { // escudo absorveu o golpe: hexágono dourado que cintila
  const o = 1 - k, R = (f.r ?? 14) + 12 + 8 * ease(k);
  g.globalAlpha = o; g.beginPath();
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + k; const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R * 0.9; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.closePath(); g.fillStyle = 'rgba(255,200,60,0.28)'; g.fill();
  g.strokeStyle = '#8a5d08'; g.lineWidth = 4 * o + 1; g.stroke(); g.strokeStyle = '#ffe27a'; g.lineWidth = 2 * o + 0.5; g.stroke();
}
function drawHeal(g, f, k, cx, cy) { // cruzes verdes subindo do alvo
  const o = 1 - k * k;
  for (let i = 0; i < 4; i++) {
    const u = clamp01(k * 1.15 - i * 0.07); if (u <= 0) continue;
    const x = cx + Math.sin(i * 2.1 + k * 3) * 14, y = cy - 6 - u * 40, s = 5.5 * (1 - u * 0.4);
    g.globalAlpha = o * (1 - u * 0.4); g.lineCap = 'butt';
    g.strokeStyle = '#1f7a3a'; g.lineWidth = 5.2; g.beginPath(); g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s); g.stroke();
    g.strokeStyle = '#8dffb3'; g.lineWidth = 2.6; g.stroke();
  }
  g.lineCap = 'round'; g.globalAlpha = o * 0.7; g.strokeStyle = '#2fb866'; g.lineWidth = 2.5 * (1 - k) + 0.5; circle(g, cx, cy + 4, 12 + 16 * ease(k)); g.stroke();
}

// o desenho chama isto uma vez por quadro: guarda a posição anterior dos atores que podem se teleportar
export function trackActors(world) {
  for (const a of world.actors) if (a.classId === 'mage' && a.kind !== 'mob') { const p = lastPos.get(a); if (p) { p.x = a.x; p.y = a.y; } else lastPos.set(a, { x: a.x, y: a.y }); }
}
