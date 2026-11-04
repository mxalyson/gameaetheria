// Aura de evolução do herói (efeito de luz/partícula procedural; NÃO desenha o personagem). Estilos em core/aura.js.
// Custo por herói com aura: 2 drawImage (halo + anel; 3 na Maestria, com o 2º anel) + poucas partículas (um drawImage cada) de sprites de luz pintados UMA vez por (spec, tier, qualidade).
// Qualidade baixa: só o halo. Sem alocação no quadro: posições das partículas são função pura de (tempo, id, índice).
import { auraStyle, auraTier } from '../core/aura.js';
import { SP, PL, sprite, loadVfxKit, vfxKitReady } from './vfx-kit.js';

const HALO = 96, RING = 96, PART = 24;       // lado (px) dos sprites pintados
const cache = new Map();                      // `${spec}:${tier}:${q}` -> { halo, ring, part, st }
export const auraStats = { built: 0, drawn: 0 };

function mk(w, h) {
  if (typeof document === 'undefined') return null; // testes em Node: sem canvas
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

function paintHalo(st) {
  const c = mk(HALO, HALO); if (!c) return null;
  const x = c.getContext('2d'), m = HALO / 2;
  const gr = x.createRadialGradient(m, m, 0, m, m, m);
  gr.addColorStop(0, st.c + (st.big ? '88' : '58')); gr.addColorStop(0.55, st.c + (st.big ? '44' : '2c')); gr.addColorStop(1, st.c + '00'); // Maestria: halo mais denso
  x.fillStyle = gr; x.fillRect(0, 0, HALO, HALO);
  return c;
}
// Anel tracejado em círculo (o desenho o achata em elipse isométrica e gira devagar). Maestria: traço mais grosso e brilhante, anel interno cheio e três gemas.
function paintRing(st) {
  const c = mk(RING, RING); if (!c) return null;
  const x = c.getContext('2d'), m = RING / 2, r = m - 6;
  x.lineCap = 'round'; x.strokeStyle = st.c; x.shadowColor = st.c; x.shadowBlur = st.big ? 9 : 5;
  x.lineWidth = st.big ? 3.4 : 2.4; const seg = 6;
  for (let i = 0; i < seg; i++) { const a = i * Math.PI * 2 / seg; x.globalAlpha = i % 2 ? (st.big ? 0.8 : 0.55) : 1; x.beginPath(); x.arc(m, m, r, a, a + 0.62); x.stroke(); }
  x.globalAlpha = st.big ? 0.8 : 0.5; x.lineWidth = st.big ? 1.6 : 1; x.strokeStyle = st.c2; x.beginPath(); x.arc(m, m, r - 7, 0, Math.PI * 2); x.stroke();
  if (st.big) { x.fillStyle = st.c2; x.globalAlpha = 1; for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.3; x.beginPath(); x.arc(m + Math.cos(a) * r, m + Math.sin(a) * r, 2.6, 0, Math.PI * 2); x.fill(); } }
  return c;
}
// Partícula: ponto de luz (spark), brasa, cristal (losango), folha ou runa (estrela de 4 pontas), conforme o estilo.
function paintPart(st) {
  const c = mk(PART, PART); if (!c) return null;
  const x = c.getContext('2d'), m = PART / 2;
  x.shadowColor = st.c; x.shadowBlur = st.big ? 8 : 6; x.fillStyle = st.c2;
  const k = st.big ? 1.25 : 1;
  if (st.kind === 'crystal') { x.beginPath(); x.moveTo(m, m - 7 * k); x.lineTo(m + 3.5 * k, m); x.lineTo(m, m + 7 * k); x.lineTo(m - 3.5 * k, m); x.closePath(); x.fill(); x.fillStyle = st.c; x.globalAlpha = 0.6; x.beginPath(); x.moveTo(m, m - 7 * k); x.lineTo(m + 3.5 * k, m); x.lineTo(m, m); x.closePath(); x.fill(); }
  else if (st.kind === 'leaf') { x.save(); x.translate(m, m); x.rotate(-0.6); x.beginPath(); x.ellipse(0, 0, 6 * k, 2.8 * k, 0, 0, Math.PI * 2); x.fillStyle = st.c; x.fill(); x.strokeStyle = st.c2; x.lineWidth = 0.8; x.beginPath(); x.moveTo(-5 * k, 0); x.lineTo(5 * k, 0); x.stroke(); x.restore(); }
  else if (st.kind === 'rune') { x.beginPath(); x.moveTo(m, m - 7 * k); x.quadraticCurveTo(m, m, m + 7 * k, m); x.quadraticCurveTo(m, m, m, m + 7 * k); x.quadraticCurveTo(m, m, m - 7 * k, m); x.quadraticCurveTo(m, m, m, m - 7 * k); x.fill(); }
  else if (st.kind === 'ember') { const g = x.createRadialGradient(m, m, 0, m, m, 5 * k); g.addColorStop(0, st.c2); g.addColorStop(0.5, st.c); g.addColorStop(1, st.c + '00'); x.fillStyle = g; x.shadowBlur = 0; x.fillRect(0, 0, PART, PART); }
  else { const g = x.createRadialGradient(m, m, 0, m, m, 6 * k); g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, st.c2); g.addColorStop(1, st.c + '00'); x.fillStyle = g; x.shadowBlur = 0; x.fillRect(0, 0, PART, PART); }
  return c;
}

// Partículas PINTADAS (atlas de VFX do dono, tingidas pela paleta do spec) no lugar da fallback por código, assim que o kit carrega.
const PART_PAL = { paladin: PL.holy, berserker: PL.ember, arcane: PL.violet, warlock: PL.toxic, sniper: PL.turq, gunslinger: PL.amber, guardian: PL.holy, inquisitor: PL.violet };
const PART_SP = {
  spark: [SP.spark, SP.twinkle0, SP.twinkle1, SP.twinkle2, SP.twinkle3, SP.star8], ember: [SP.ember0, SP.ember1, SP.ember2, SP.ember3, SP.flamelet0, SP.flamelet1, SP.flamelet2, SP.flamelet3],
  crystal: [SP.crystal0, SP.crystal1, SP.crystal2], leaf: [SP.leaf0, SP.leaf1, SP.leaf2, SP.leaf3], rune: [SP.star8, SP.twinkle0, SP.twinkle2, SP.spark],
};
function paintedParts(e) {
  if (e.pp) return e.pp;
  if (!vfxKitReady()) { loadVfxKit(); return null; }
  const ids = PART_SP[e.st.kind] ?? PART_SP.spark, pal = PART_PAL[e.st.spec] ?? PL.holy;
  const out = ids.map((id) => sprite(id, pal)).filter(Boolean);
  return (e.pp = out.length ? out : null);
}

function get(spec, tier, q) {
  const key = spec + ':' + tier + ':' + q;
  let e = cache.get(key);
  if (!e) {
    const st = auraStyle(spec, tier);
    e = { st, halo: paintHalo(st), ring: q > 0 && st.ring ? paintRing(st) : null, part: q > 0 ? paintPart(st) : null };
    cache.set(key, e); auraStats.built++;
  }
  return e;
}

// Fração [0,1) pseudo-aleatória estável por (id, i): determinística, sem Math.random.
const h01 = (id, i) => { const v = Math.sin(id * 12.9898 + i * 78.233) * 43758.5453; return v - Math.floor(v); };

// Camada de TRÁS (chão): halo + anel. Chamar antes do sprite do herói. feetY = y dos pés no mundo.
export function drawAuraBack(g, a, t, q, feetY) {
  const tier = auraTier(a); if (!tier || a.dead) return;
  const e = get(a.spec, tier, q); if (!e.halo) return;
  const st = e.st, pulse = 1 + Math.sin(t * 1.6 + (a.id ?? 0)) * 0.05;
  const prev = g.globalAlpha;
  g.globalAlpha = prev * st.alpha;
  const w = 74 * st.scale * pulse;
  g.drawImage(e.halo, a.x - w, feetY - w * 0.5, w * 2, w);
  if (e.ring) {
    g.save(); g.translate(a.x, feetY); g.scale(1, 0.5); g.rotate(t * 0.5 + (a.id ?? 0));
    const r = 34 * st.scale; g.globalAlpha = prev * 0.9;
    g.drawImage(e.ring, -r, -r, r * 2, r * 2);
    if (st.ring2) { g.rotate(-t * 1.1 - (a.id ?? 0) * 2); const r2 = r * 0.68; g.globalAlpha = prev * 0.85; g.drawImage(e.ring, -r2, -r2, r2 * 2, r2 * 2); } // segundo anel, menor, em contra-rotação
    g.restore();
  }
  g.globalAlpha = prev; auraStats.drawn++;
}

// Camada da FRENTE: partículas que sobem em volta do corpo (qualidade baixa: nada).
export function drawAuraMotes(g, a, t, q, feetY) {
  if (q < 1) return;
  const tier = auraTier(a); if (!tier || a.dead) return;
  const e = get(a.spec, tier, q); if (!e.part) return;
  const st = e.st, n = q === 1 ? Math.max(1, st.n >> 1) : st.n, prev = g.globalAlpha, id = a.id ?? 0;
  const s = st.big ? 15 : 12;
  for (let i = 0; i < n; i++) {
    const ph = (t * (0.25 + st.rise * 0.25) + h01(id, i)) % 1;       // vida da partícula 0..1
    const ang = h01(id, i + 31) * 6.283 + t * 0.6 * (i % 2 ? 1 : -1);
    const rad = 14 + h01(id, i + 7) * 16;
    const px = a.x + Math.cos(ang) * rad, py = feetY - ph * 62 * (0.6 + st.rise * 0.5) + Math.sin(ang) * rad * 0.4;
    g.globalAlpha = prev * st.alpha * Math.sin(ph * Math.PI);        // nasce e some suave
    const pp = paintedParts(e);
    if (pp) { const sp = pp[(h01(id, i + 5) * pp.length) | 0], w = s * (st.kind === 'ember' || st.kind === 'spark' ? 1.7 : 1.5) * (st.spec === 'berserker' ? 0.7 : 1), // Berserker: brasas menores (fogo demais, dono) h = w * sp.h / sp.w; g.drawImage(sp.cv, px - w * 0.5, py - h * 0.5, w, h); }
    else g.drawImage(e.part, px - s * 0.5, py - s * 0.5, s, s);
  }
  g.globalAlpha = prev;
}
