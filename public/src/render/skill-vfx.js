// Efeitos visuais das habilidades (Canvas 2D). SÓ APRESENTAÇÃO: nascem dos eventos reais de combate (`cast` da simulação local ou confirmados pelo servidor)
// e dos projéteis já existentes; nunca decidem dano, alcance nem resultado. Tempo = world.time (a simulação local e o modo online avançam o mesmo relógio).
// Visual PINTADO: sprites do kit (render/vfx-kit.js, atlas gerado por tools/vfx-kit.py) em mistura aditiva ('lighter') e 'screen', mais partículas de um POOL fixo.
// Sem alocação por quadro: efeitos e projéteis guardam estado em campos próprios; o desenho só lê, calcula e emite partículas no pool (arrays tipados).
import { SKILLS } from '../data/skills.js';
import { SP, PL, sprite, loadVfxKit, vfxKitReady, warm, warmStep } from './vfx-kit.js';

const TAU = Math.PI * 2, HALF = Math.PI / 2;
const MAX_FX = 22;
const ease = (k) => 1 - (1 - k) * (1 - k);
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const rnd = Math.random;

// qual efeito cada habilidade usa (a chave é o id real em data/skills.js)
const KIND = {
  whirlwind: 'whirl', charge: 'dashtrail', warcry: 'warcry',
  fireball: 'muzzle', frostnova: 'frost', blink: 'blink',
  rain: 'rain', pierce: 'pierce', roll: 'roll',
  holylight: 'sun', divineshield: 'bubble', judgement: 'beam',
  // Maestria: colossus e meteor têm desenho próprio; arrowstorm/intervention reaproveitam chuva/sol com mais tamanho e outra cor
  colossus: 'colossus', meteor: 'meteor', arrowstorm: 'rain', intervention: 'sun',
  // Kits das especializações (data/kits.js): reaproveitam os efeitos acima (a cor sai da especialização); 'zone' é o anel de runas no chão (armadilha, santuário)
  pal_hammer: 'muzzle', pal_aura: 'warcry', pal_rush: 'dashtrail', pal_sanctuary: 'zone',
  bsk_leap: 'dashtrail', bsk_frenzy: 'warcry', bsk_cleave: 'muzzle', bsk_fury: 'warcry',
  arc_prism: 'beam', arc_barrier: 'bubble', arc_phase: 'blink', arc_comet: 'meteor',
  wl_curse: 'muzzle', wl_drain: 'frost', wl_pact: 'frost', wl_souls: 'rain',
  sn_aim: 'muzzle', sn_trap: 'zone', sn_retreat: 'roll', sn_lethal: 'muzzle',
  gs_fan: 'pierce', gs_grenade: 'muzzle', gs_roll2: 'roll', gs_barrage: 'pierce',
  gd_light: 'sun', gd_ward: 'bubble', gd_word: 'sun', gd_celestial: 'sun',
  inq_judge: 'beam', inq_mark: 'muzzle', inq_flame: 'muzzle', inq_verdict: 'meteor',
};
const LIFE = { zone: 6.4, colossus: 6.6, meteor: 1.9, crit: 0.32, absorb: 0.4, heal: 0.85, whirl: 0.55, dashtrail: 0.65, warcry: 1.2, muzzle: 0.3, frost: 0.7, blink: 0.6, rain: 2.6, pierce: 0.32, roll: 0.7, sun: 0.85, bubble: 6.4, beam: 0.45 };

// ---- estilo (cores e família de partículas) por habilidade e por especialização ----
const FAM = { fire: 0, ice: 1, arcane: 2, toxic: 3, holy: 4, nature: 5 };
const sty = (m, h, fam) => ({ m: PL[m], h: PL[h], fam: FAM[fam] });
const BASE = {
  whirlwind: sty('fire', 'amber', 'fire'), charge: sty('fire', 'amber', 'fire'), warcry: sty('fire', 'amber', 'fire'), colossus: sty('amber', 'gold', 'fire'),
  fireball: sty('fire', 'amber', 'fire'), frostnova: sty('ice', 'holy', 'ice'), blink: sty('violet', 'ice', 'arcane'), meteor: sty('fire', 'amber', 'fire'),
  rain: sty('leaf', 'gold', 'nature'), pierce: sty('leaf', 'gold', 'nature'), roll: sty('leaf', 'gold', 'nature'), arrowstorm: sty('ember', 'amber', 'fire'),
  holylight: sty('gold', 'holy', 'holy'), divineshield: sty('gold', 'holy', 'holy'), judgement: sty('gold', 'holy', 'holy'), intervention: sty('gold', 'holy', 'holy'),
  basic_mage: sty('violet', 'holy', 'arcane'), basic_archer: sty('leaf', 'gold', 'nature'), crit: sty('fire', 'amber', 'fire'), absorb: sty('gold', 'holy', 'holy'), heal: sty('leaf', 'holy', 'nature'),
};
// cada especialização pinta TODAS as suas habilidades na própria cor: Paladino dourado, Berserker brasa, Arcano prisma violeta, Bruxo verde tóxico,
// Franco-atirador turquesa, Pistoleiro âmbar, Guardião branco-dourado, Inquisidor violeta-âmbar
const SPEC = {
  paladin: sty('gold', 'holy', 'holy'), berserker: sty('ember', 'fire', 'fire'), arcane: sty('violet', 'holy', 'arcane'), warlock: sty('toxic', 'leaf', 'toxic'),
  sniper: sty('turq', 'holy', 'arcane'), gunslinger: sty('amber', 'fire', 'fire'), guardian: sty('holy', 'gold', 'holy'), inquisitor: sty('violamber', 'amber', 'holy'),
};
const styleOf = (skill, spec) => (spec && SPEC[spec]) || BASE[skill] || BASE.fireball;

// ---- pool de partículas (arrays tipados; nada é alocado por quadro) ----
const MAXP = 200;
const f32 = () => new Float32Array(MAXP);
const P = { n: 0, x: f32(), y: f32(), z: f32(), vx: f32(), vy: f32(), vz: f32(), rot: f32(), vr: f32(), s0: f32(), s1: f32(), age: f32(), life: f32(), a: f32(), drag: f32(), grav: f32(), spr: new Int16Array(MAXP), pal: new Int16Array(MAXP), bl: new Uint8Array(MAXP) };
const PA = [P.x, P.y, P.z, P.vx, P.vy, P.vz, P.rot, P.vr, P.s0, P.s1, P.age, P.life, P.a, P.drag, P.grav, P.spr, P.pal, P.bl];
let cap = MAXP, LITE = false, DT = 0, poolWorld = null, lastT = 0;
// mistura: 0 = aditiva ('lighter'), 1 = 'screen' (brilho suave), 2 = normal (fumaça, pedra)
const BLEND = ['lighter', 'screen', 'source-over'];
let curBl = -1;
const setBl = (g, b) => { if (b !== curBl) { g.globalCompositeOperation = BLEND[b]; curBl = b; } };

function em(spr, pal, bl, x, y, z, vx, vy, vz, s0, s1, life, rot, vr, a, drag, grav) {
  if (P.n >= cap) return;
  const i = P.n++;
  P.spr[i] = spr; P.pal[i] = pal; P.bl[i] = bl; P.x[i] = x; P.y[i] = y; P.z[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
  P.s0[i] = s0; P.s1[i] = s1; P.age[i] = 0; P.life[i] = life; P.rot[i] = rot; P.vr[i] = vr; P.a[i] = a; P.drag[i] = drag; P.grav[i] = grav;
}
function stepP(dt) {
  for (let i = P.n - 1; i >= 0; i--) {
    P.age[i] += dt;
    if (P.age[i] >= P.life[i]) { const l = --P.n; if (i !== l) for (let j = 0; j < PA.length; j++) PA[j][i] = PA[j][l]; continue; }
    const d = Math.max(0, 1 - P.drag[i] * dt);
    P.vx[i] *= d; P.vy[i] *= d; P.vz[i] = P.vz[i] * d - P.grav[i] * dt;
    P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt; P.rot[i] += P.vr[i] * dt;
    if (P.z[i] < 0 && P.grav[i] > 0) { P.z[i] = 0; P.vz[i] *= -0.25; P.vx[i] *= 0.6; P.vy[i] *= 0.6; }
  }
}
function drawP(g) {
  for (let i = 0; i < P.n; i++) {
    const k = P.age[i] / P.life[i], a = P.a[i] * Math.min(1, k * 10) * (1 - k * k), s = P.s0[i] + (P.s1[i] - P.s0[i]) * ease(k);
    const sp = sprite(P.spr[i], P.pal[i]); if (!sp || a < 0.01 || s < 0.5) continue;
    setBl(g, P.bl[i] === 0 && BODY[P.spr[i]] ? 2 : P.bl[i]); blit(g, sp, P.x[i], P.y[i] - P.z[i], s, s, P.rot[i], a);
  }
}

// ---- desenho de sprite ----
function blit(g, s, x, y, w, h, rot, alpha) {
  const kx = w / s.w, ky = h / s.h; g.globalAlpha = alpha > 1 ? 1 : alpha;
  if (rot) { g.translate(x, y); g.rotate(rot); g.drawImage(s.cv, -s.ax * kx, -s.ay * ky, w, h); g.rotate(-rot); g.translate(-x, -y); }
  else g.drawImage(s.cv, x - s.ax * kx, y - s.ay * ky, w, h);
}
// sprites de CORPO (chamas, cristais, fitas, runas, cortes...) são pintados em mistura normal: a cor aparece em qualquer fundo (a aditiva estoura para branco no gramado claro);
// só luz pura (glow, faíscas, estrelas, rajadas, raios) fica aditiva
const BODY = new Uint8Array(64);
for (const n of ['ring', 'shock', 'flame0', 'flame1', 'flame2', 'flame3', 'crystal0', 'crystal1', 'crystal2', 'flake', 'wisp0', 'wisp1', 'leaf0', 'leaf1', 'ribbon0', 'ribbon1', 'wind', 'bolt0', 'bolt1', 'bolt2', 'rune0', 'rune1', 'slash0', 'slash1', 'shard0', 'shard1', 'cross', 'rays']) BODY[SP[n]] = 1;
function put(g, id, pal, bl, x, y, w, h, rot, a) {
  if (a < 0.01 || w < 0.5) return;
  const s = sprite(id, pal); if (!s) return;
  setBl(g, bl === 0 && BODY[id] ? 2 : bl); blit(g, s, x, y, w, h, rot, a);
}
const rate = (f, perSec) => { f.acc += perSec * (LITE ? 0.5 : 1) * DT; const n = f.acc | 0; f.acc -= n; return n; };
const cnt = (n) => (LITE ? Math.ceil(n / 2) : n);

// pedaço elemental da família (fogo: chama; gelo: floco; arcano: estrela; tóxico: fiapo; sagrado: faísca; natureza: folha)
function bit(f, x, y, z, vx, vy, vz, size, life, a = 1) {
  switch (f.fam) {
    case 0: em(SP.flame0 + ((rnd() * 4) | 0), f.m, 0, x, y, z, vx, vy, vz, size, size * 0.35, life, 0, 0, a, 1.2, -70); break;
    case 1: em(SP.flake, f.m, 1, x, y, z, vx, vy, vz, size * 0.7, size * 0.3, life, rnd() * TAU, (rnd() - 0.5) * 6, a, 1.4, 30); break;
    case 2: em(rnd() < 0.4 ? SP.star8 : SP.spark, rnd() < 0.5 ? f.m : f.h, 0, x, y, z, vx, vy, vz, size * 0.8, size * 0.2, life, 0, 0, a, 1.5, 10); break;
    case 3: em(SP.wisp0 + ((rnd() * 2) | 0), f.m, 0, x, y, z, vx, vy, vz, size, size * 0.5, life, rnd() * TAU, (rnd() - 0.5) * 3, a * 0.9, 1.3, -30); break;
    case 4: em(SP.spark, rnd() < 0.5 ? f.m : f.h, 0, x, y, z, vx, vy, vz, size * 0.8, size * 0.25, life, 0, 0, a, 1.2, -25); break;
    default: em(SP.leaf0 + ((rnd() * 2) | 0), f.m, 1, x, y, z, vx, vy, vz, size * 0.55, size * 0.4, life, rnd() * TAU, (rnd() - 0.5) * 9, a, 1.0, 40); break;
  }
}
const spark = (f, x, y, z, vx, vy, vz, size, life, a = 1) => em(SP.spark, f.h, 0, x, y, z, vx, vy, vz, size, size * 0.2, life, 0, 0, a, 1.6, 60);
const ember = (f, x, y, z, vx, vy, vz, size, life, a = 1) => em(SP.ember0 + ((rnd() * 2) | 0), f.m, 0, x, y, z, vx, vy, vz, size, size * 0.3, life, 0, 0, a, 0.8, 120);
const smoke = (f, x, y, z, vx, vy, vz, size, life, a = 0.4) => em(SP.smoke0 + ((rnd() * 3) | 0), f.fam === 3 ? PL.toxic : f.fam === 0 ? PL.smoke : PL.dust, 2, x, y, z, vx, vy, vz, size * 0.5, size, life, rnd() * TAU, (rnd() - 0.5) * 1.2, a, 1.5, -25);
const chunk = (x, y, vx, vy, vz, size, life) => em(SP.shard0 + ((rnd() * 2) | 0), PL.stone, 2, x, y, 4, vx, vy, vz, size, size * 0.85, life, rnd() * TAU, (rnd() - 0.5) * 14, 1, 0.2, 900);

// tremor de câmera discreto (golpes fortes): o renderer soma isto ao deslocamento da câmera
function shake(world, amp, dur) {
  const s = (world.shake ??= { t0: -9, dur: 0, amp: 0 });
  if (world.time - s.t0 < s.dur && s.amp * (1 - (world.time - s.t0) / s.dur) > amp) return;
  s.t0 = world.time; s.dur = dur; s.amp = amp;
}
const SH = { x: 0, y: 0 };
export function vfxShake(world) {
  const s = world.shake, e = s ? world.time - s.t0 : 9;
  if (!s || e < 0 || e >= s.dur) { SH.x = 0; SH.y = 0; return SH; }
  const a = s.amp * (1 - e / s.dur) ** 2; SH.x = Math.sin(e * 73) * a; SH.y = Math.cos(e * 91) * a;
  return SH;
}

// Acerto crítico, golpe absorvido por escudo e cura relevante (eventos reais `hit` e `heal`; o servidor manda os mesmos no online). Cura de regeneração (pequena e constante) não gera efeito.
const healAt = new WeakMap();
export function spawnEventVfx(world, ev) {
  const a = ev.type === 'heal' ? ev.actor : ev.target;
  if (!a || !world) return null;
  let kind = null;
  if (ev.type === 'hit') kind = ev.absorbed || ev.blocked ? 'absorb' : ev.crit ? 'crit' : null;
  else if (ev.type === 'heal' && ev.amount >= (a.maxHp ?? 100) * 0.04) {
    const last = healAt.get(a);
    if (last === undefined || world.time - last >= 0.5) { healAt.set(a, world.time); kind = 'heal'; }
  }
  if (!kind) return null;
  loadVfxKit();
  const list = (world.svfx ??= []);
  if (list.length >= MAX_FX) list.shift();
  const s = BASE[kind];
  const f = { kind, skill: null, spec: null, t0: world.time, life: LIFE[kind], actor: a, x: a.x, y: a.y, ang: 0, color: '', r: a.r ?? 14, tx: null, ty: null, ox: a.x, oy: a.y, seed: (a.id ?? 1) * 7919, pts: null, dur: 0, range: 0, m: s.m, h: s.h, fam: s.fam, n: 0, acc: 0, mask: 0 };
  list.push(f);
  return f;
}

// posição anterior de cada ator (para achar a ORIGEM do Teleporte, já que o evento chega depois de o ator se mover)
const lastPos = new WeakMap();

export function spawnSkillVfx(world, ev) {
  const kind = KIND[ev.skill];
  const a = ev.actor;
  if (!kind || !a || !world) return null;
  loadVfxKit();
  const s = SKILLS[ev.skill];
  const list = (world.svfx ??= []);
  if (list.length >= MAX_FX) list.shift();
  const prev = lastPos.get(a), st = styleOf(ev.skill, a.spec);
  const f = {
    kind, skill: ev.skill, spec: a.spec ?? null, t0: world.time, life: s.vfxLife ?? (kind === 'bubble' || kind === 'warcry' ? Math.max(LIFE[kind], (s.dur ?? 0) + 0.4) : LIFE[kind]),
    actor: a, x: a.x, y: a.y, ang: ev.ang ?? a.facing ?? 0, color: s.color, r: s.radius ?? s.vfxR ?? 60,
    tx: ev.tx ?? null, ty: ev.ty ?? null, ox: prev ? prev.x : a.x, oy: prev ? prev.y : a.y,
    seed: ((world.time * 1000) | 0) ^ (a.id ?? 7), pts: kind === 'dashtrail' || kind === 'roll' || kind === 'colossus' ? [] : null, dur: s.dur ?? 0, range: s.range ?? 500,
    m: st.m, h: st.h, fam: st.fam, n: 0, acc: 0, mask: 0,
  };
  list.push(f);
  return f;
}

// ---------------- projéteis ----------------
const PT = new WeakMap(); // projétil -> último instante em que soltou partículas
// Projéteis dos jogadores (habilidades e ataques básicos); devolve true se desenhou. Sem o kit carregado devolve false e o renderer usa o desenho simples.
export function drawSkillProjectile(g, p, time) {
  const src = p.src;
  if (!src || src.kind === 'spirit' || src.kind === 'mob' || !src.classId) return false;
  if (!vfxKitReady()) { loadVfxKit(); return false; }
  const cls = src.classId, speed = Math.hypot(p.vx, p.vy);
  let id;
  if (p.explode > 0) id = 'fireball';
  else if (p.pierce) id = cls === 'archer' ? 'pierce' : 'fireball';
  else if (p.stun > 0 && p.radius >= 8) id = 'judgement';
  else if (cls === 'archer') id = p.radius >= 6 ? 'pierce' : 'basic_archer';
  else if (cls === 'mage') id = 'basic_mage';
  else if (cls === 'cleric') id = 'judgement'; // Julgamento Ardente / Marca da Pena
  else return false;
  const st = id.startsWith('basic') ? (src.spec && SPEC[src.spec]) || BASE[id] : styleOf(id, src.spec);
  let rec = PT.get(p); if (!rec) { rec = { t: time }; PT.set(p, rec); }
  const emit = time - rec.t >= 0.028; if (emit) rec.t = time;
  const prevOp = g.globalCompositeOperation; curBl = -1;
  const x = p.x, y = p.y, cos = Math.cos(p.ang), sin = Math.sin(p.ang), r = p.radius;
  const f = { m: st.m, h: st.h, fam: st.fam };
  if (id === 'fireball' && p.explode > 0 && st.fam !== 3) { // Bola de Fogo: cabeça incandescente com cauda de chamas
    const fl = ((time * 22) | 0) & 3, sz = r * 10;
    put(g, SP.glow, st.m, 1, x, y, r * 8, r * 8, 0, 0.75);
    put(g, SP.flame0 + fl, st.m, 0, x - cos * sz * 0.36, y - sin * sz * 0.36, sz, sz, p.ang - HALF, 1);
    put(g, SP.flame0 + ((fl + 2) & 3), st.h, 0, x - cos * sz * 0.3, y - sin * sz * 0.3, sz * 0.62, sz * 0.62, p.ang - HALF, 0.9);
    put(g, SP.glow, PL.holy, 0, x, y, r * 3.2, r * 3.2, 0, 1);
    if (emit) {
      bit(f, x - cos * 8 + (rnd() - 0.5) * 8, y - sin * 8 + (rnd() - 0.5) * 8, 4, -cos * 40, -sin * 40, 20 + rnd() * 30, 20 + rnd() * 14, 0.35, 0.85);
      if (rnd() < 0.6) ember(f, x - cos * 12, y - sin * 12, 6, (rnd() - 0.5) * 70 - cos * 30, (rnd() - 0.5) * 70 - sin * 30, 20 + rnd() * 40, 8 + rnd() * 6, 0.5);
      if (rnd() < 0.3) smoke(f, x - cos * 16, y - sin * 16, 8, 0, 0, 12, 16, 0.6, 0.3);
    }
  } else if (st.fam === 3 && p.explode > 0) { // Praga Ardente (Bruxo): bola maldita verde com fiapos
    put(g, SP.glow, st.m, 1, x, y, r * 8, r * 8, 0, 0.7);
    put(g, SP.wisp0 + (((time * 6) | 0) & 1), st.m, 0, x, y, r * 5.4, r * 5.4, time * 5, 0.95);
    put(g, SP.wisp1, st.h, 0, x, y, r * 4, r * 4, -time * 7, 0.8);
    put(g, SP.glow, PL.holy, 0, x, y, r * 2.6, r * 2.6, 0, 0.95);
    if (emit) { bit(f, x - cos * 6, y - sin * 6, 4, -cos * 30 + (rnd() - 0.5) * 40, -sin * 30 + (rnd() - 0.5) * 40, 14 + rnd() * 20, 20 + rnd() * 10, 0.5, 0.8); if (rnd() < 0.4) smoke(f, x, y, 6, 0, 0, 14, 18, 0.7, 0.3); }
  } else if (id === 'fireball') { // Projétil Arcano (Arcano): estrela prismática com fita de luz e cacos
    put(g, SP.glow, st.m, 1, x, y, r * 9, r * 9, 0, 0.7);
    put(g, SP.ribbon0, st.m, 0, x - cos * 46, y - sin * 46, 100, r * 2.6, p.ang, 0.9);
    put(g, SP.ribbon0, st.h, 0, x - cos * 32, y - sin * 32, 66, r * 1.1, p.ang, 1);
    put(g, SP.star8, st.m, 0, x, y, r * 7.2, r * 7.2, time * 4, 1);
    put(g, SP.glow, PL.holy, 0, x, y, r * 2.6, r * 2.6, 0, 1);
    if (emit && rnd() < 0.7) bit(f, x - cos * 10 + (rnd() - 0.5) * 10, y - sin * 10 + (rnd() - 0.5) * 10, 4, -cos * 20 + (rnd() - 0.5) * 50, -sin * 20 + (rnd() - 0.5) * 50, 10, 14 + rnd() * 8, 0.45);
  } else if (id === 'pierce') { // flecha/virote: fita de luz atrás e ponta brilhante
    const long = speed > 900 ? 170 : speed > 700 ? 120 : 80, th = 34;
    put(g, SP.ribbon0, st.m, 0, x - cos * long * 0.45, y - sin * long * 0.45, long, th, p.ang, 0.85);
    put(g, SP.ribbon0, st.h, 0, x - cos * long * 0.3, y - sin * long * 0.3, long * 0.6, th * 0.4, p.ang, 1);
    put(g, SP.glow, st.m, 1, x, y, 40, 40, 0, 0.7);
    put(g, SP.spark, PL.holy, 0, x + cos * 4, y + sin * 4, 30, 30, p.ang, 1);
    if (emit && rnd() < 0.15) spark(f, x - cos * 20, y - sin * 20, 4, (rnd() - 0.5) * 50, (rnd() - 0.5) * 50, 10, 6 + rnd() * 5, 0.35, 0.9);
  } else if (id === 'judgement') { // Julgamento: estrela sagrada com raios girando
    put(g, SP.glow, st.m, 1, x, y, r * 10, r * 10, 0, 0.8);
    put(g, SP.rays, st.h, 0, x, y, r * 9, r * 9, time * 3, 0.75);
    put(g, SP.star8, st.m, 0, x, y, r * 8, r * 8, -time * 5, 1);
    put(g, SP.glow, PL.holy, 0, x, y, r * 3, r * 3, 0, 1);
    if (emit) { spark(f, x - cos * 8 + (rnd() - 0.5) * 12, y - sin * 8 + (rnd() - 0.5) * 12, 6, -cos * 25, -sin * 25, 10 + rnd() * 20, 9 + rnd() * 7, 0.5); }
  } else if (id === 'basic_archer') { // flecha comum: haste luminosa curta
    put(g, SP.ribbon0, st.m, 0, x - cos * 16, y - sin * 16, 56, 14, p.ang, 0.9);
    put(g, SP.ribbon0, st.h, 0, x - cos * 10, y - sin * 10, 30, 6, p.ang, 1);
    put(g, SP.glow, PL.holy, 0, x, y, 12, 12, 0, 1);
  } else { // basic_mage: orbe
    put(g, SP.glow, st.m, 2, x, y, r * 6, r * 6, 0, 0.85);
    put(g, SP.glow, st.m, 1, x, y, r * 9, r * 9, 0, 0.6);
    put(g, SP.spark, st.h, 0, x, y, r * 7, r * 7, time * 3, 0.95);
    put(g, SP.glow, PL.holy, 0, x, y, r * 2.4, r * 2.4, 0, 1);
    if (emit && rnd() < 0.6) bit(f, x - cos * 6, y - sin * 6, 4, -cos * 20 + (rnd() - 0.5) * 30, -sin * 20 + (rnd() - 0.5) * 30, 8, 10 + rnd() * 6, 0.4, 0.8);
  }
  g.globalCompositeOperation = prevOp; curBl = -1; g.globalAlpha = 1;
  return true;
}

// Corte do ataque básico corpo a corpo (efeito `slash` da simulação): meia-lua pintada que varre o arco.
const SLASH_PAL = { '#ffe1d0': PL.amber, '#fff3b0': PL.holy, '#ffb199': PL.ember, '#ffc27a': PL.amber };
export function drawBasicSlash(g, f) {
  const k = f.t / f.life, sc = (f.r * 0.98) / 96, sweep = (k - 0.5) * 0.7;
  if (!vfxKitReady()) return false;
  const pal = SLASH_PAL[f.color] ?? PL.holy, prevOp = g.globalCompositeOperation; curBl = -1;
  put(g, SP.slash0, pal, 0, f.x, f.y, 140 * sc, 210 * sc * Math.min(1.35, f.arc / 1.6), f.ang + sweep, 1 - k * k * 0.6);
  put(g, SP.slash1, PL.holy, 0, f.x, f.y, 128 * sc * 0.96, 192 * sc * 0.9, f.ang + sweep * 1.3, (1 - k) * 0.8);
  g.globalCompositeOperation = prevOp; curBl = -1; g.globalAlpha = 1;
  return true;
}

// Desenha e descarta os efeitos vencidos. `lite` (qualidade baixa) reduz partículas e camadas.
export function drawSkillVfx(g, world, lite = false) {
  const list = world.svfx, now = world.time;
  if (world !== poolWorld) { P.n = 0; poolWorld = world; lastT = now; }
  DT = Math.min(0.05, Math.max(0, now - lastT)); lastT = now;
  LITE = lite; cap = lite ? 90 : MAXP;
  if ((!list || !list.length) && P.n === 0) return;
  if (!vfxKitReady()) { loadVfxKit(); if (list) for (let i = list.length - 1; i >= 0; i--) if (now - list[i].t0 >= list[i].life) list.splice(i, 1); return; }
  if (DT > 0) { stepP(DT); warmStep(); }
  g.save(); curBl = -1; g.lineCap = 'round';
  if (list) for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i], el = now - f.t0;
    if (el >= f.life || el < -0.5) { list.splice(i, 1); continue; }
    if (!f.w) { f.w = 1; warm(f.m); warm(f.h); }
    const k = clamp01(el / f.life), a = f.actor;
    const cx = a && !a.dead ? a.x : f.x, cy = a && !a.dead ? a.y : f.y;
    switch (f.kind) {
      case 'whirl': drawWhirl(g, f, k, el, cx, cy); break;
      case 'dashtrail': drawDash(g, f, el, cx, cy, 24, world); break;
      case 'roll': drawRoll(g, f, el, cx, cy); break;
      case 'warcry': drawWarcry(g, f, el, cx, cy); break;
      case 'muzzle': drawMuzzle(g, f, k); break;
      case 'frost': drawFrost(g, f, k, el, cx, cy); break;
      case 'blink': drawBlink(g, f, k, el, cx, cy); break;
      case 'colossus': drawColossus(g, f, el, cx, cy, world); break;
      case 'meteor': drawMeteor(g, f, el, world); break;
      case 'rain': drawRain(g, f, el); break;
      case 'pierce': drawPierce(g, f, k, cx, cy); break;
      case 'sun': drawSun(g, f, k, el, cx, cy); break;
      case 'zone': drawZone(g, f, el); break;
      case 'bubble': drawBubble(g, f, el, cx, cy); break;
      case 'beam': drawBeam(g, f, k, cx, cy); break;
      case 'crit': drawCrit(g, f, k, cx, cy); break;
      case 'absorb': drawAbsorb(g, f, k, cx, cy); break;
      case 'heal': drawHeal(g, f, k, cx, cy); break;
    }
  }
  drawP(g);
  g.restore(); curBl = -1;
  g.globalAlpha = 1;
}

// ---- um desenho por efeito (todos só leem o estado do efeito e emitem partículas) ----
function burstOnce(f, cx, cy, n, spd, up) { // leque de faíscas/pedaços elementais na primeira vez
  if (f.n) return; f.n = 1;
  for (let i = cnt(n); i > 0; i--) { const a = rnd() * TAU, v = spd * (0.4 + rnd() * 0.8); if (i % 2) spark(f, cx, cy, 8, Math.cos(a) * v, Math.sin(a) * v * 0.8, up * rnd(), 8 + rnd() * 8, 0.35 + rnd() * 0.3); else bit(f, cx, cy, 8, Math.cos(a) * v * 0.6, Math.sin(a) * v * 0.5, up * rnd() + 10, 16 + rnd() * 12, 0.45 + rnd() * 0.3); }
}

function drawWhirl(g, f, k, el, cx, cy) {
  const R = f.r, e = ease(k), o = 1 - k, sc = R * 0.95 / 96;
  put(g, SP.shock, f.m, 0, cx, cy, R * 2.5 * (0.45 + 0.55 * e), R * 2.5 * (0.45 + 0.55 * e), el * 2, o * 0.85);
  for (let i = 0; i < 3; i++) put(g, i === 1 ? SP.slash1 : SP.slash0, i === 1 ? f.h : f.m, 0, cx, cy, 150 * sc, 225 * sc, k * TAU * 1.6 + i * TAU / 3, Math.min(1, o * 1.3));
  burstOnce(f, cx, cy, 10, 220, 30);
  if (el < 0.4) for (let n = rate(f, 110); n > 0; n--) {
    const a = rnd() * TAU, r = R * (0.65 + rnd() * 0.35), tx = -Math.sin(a) * 160, ty = Math.cos(a) * 160;
    if (n % 2) bit(f, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9, 6, tx, ty, 50, 20 + rnd() * 14, 0.45);
    else spark(f, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9, 8, tx * 1.2 + Math.cos(a) * 80, ty * 1.2 + Math.sin(a) * 80, 40, 7 + rnd() * 6, 0.4);
  }
  if (f.m === PL.ember && el < 0.3 && !LITE) for (let n = rate(f, 30); n > 0; n--) smoke(f, cx + (rnd() - 0.5) * R, cy + (rnd() - 0.5) * R * 0.6, 4, 0, 0, 20, 22, 0.6, 0.3);
}

// rastro do avanço/rolamento: acompanha o ator e guarda os últimos pontos (alocação só no início do efeito); desenha UMA fita do ponto mais antigo ao mais novo
function trail(f, el, cx, cy) {
  const pts = f.pts;
  if (el < 0.38) {
    const l = pts[pts.length - 2], d = l === undefined ? 0 : Math.hypot(cx - l, cy - pts[pts.length - 1]);
    if (d > 140) pts.length = 0; // salto grande (teletransporte/troca de mapa/empurrão): recomeça o rastro em vez de riscar uma faixa até o ponto antigo (V18)
    if (l === undefined || d > 3) pts.push(cx, cy);
    if (pts.length > 30) pts.splice(0, 2);
  }
  return pts.length / 2;
}
function ribbon(g, f, el, cx, cy, w, pal, pal2, spr) {
  const n = trail(f, el, cx, cy), pts = f.pts, fade = clamp01(1 - (el - 0.2) / 0.45);
  if (n < 2) return fade;
  const x0 = pts[0], y0 = pts[1], x1 = pts[pts.length - 2], y1 = pts[pts.length - 1], len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 4) return fade;
  const ang = Math.atan2(y1 - y0, x1 - x0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  put(g, SP.glow, pal, 1, mx, my, len * 1.15 + w * 2, w * 3.6, ang, 0.5 * fade);
  put(g, spr, pal, 0, mx, my, len * 1.25 + 30, w * 1.6, ang, 0.95 * fade);
  put(g, spr, pal2, 0, mx, my, len * 1.1 + 20, w * 0.6, ang, fade);
  return fade;
}
function drawDash(g, f, el, cx, cy, w, world) {
  const fade = ribbon(g, f, el, cx, cy, w, f.m, f.h, SP.ribbon0);
  if (f.n === 0) { f.n = 1; put(g, SP.shock, f.m, 0, f.x, f.y, 80, 80, 0, 0.8); }
  if (el < 0.4) { put(g, SP.glow, f.m, 1, cx, cy, 70, 70, 0, 0.8 * fade); for (let n = rate(f, 80); n > 0; n--) bit(f, cx - Math.cos(f.ang) * 10 + (rnd() - 0.5) * 16, cy - Math.sin(f.ang) * 10 + (rnd() - 0.5) * 12, 6, -Math.cos(f.ang) * 60, -Math.sin(f.ang) * 60, 20 + rnd() * 30, 18 + rnd() * 12, 0.4); }
  if (el > 0.3 && f.n === 1) { // chegada: clarão, onda e faíscas
    f.n = 2; dashImpact(f, cx, cy, 1, world);
  }
  if (f.n === 2 && el < 0.7) { const u = clamp01((el - 0.3) / 0.35); put(g, SP.burst, f.h, 0, cx, cy, 40 + 90 * ease(u), 40 + 90 * ease(u), 0, (1 - u) * 0.95); put(g, SP.shock, f.m, 0, cx, cy, 160 * ease(u), 160 * ease(u), 0, (1 - u) * 0.8); }
}
function dashImpact(f, cx, cy, big, world) {
  for (let i = cnt(14 * big); i > 0; i--) { const a = rnd() * TAU, v = 150 + rnd() * 200 * big; spark(f, cx, cy, 8, Math.cos(a) * v, Math.sin(a) * v * 0.8, 40 + rnd() * 80, 8 + rnd() * 7, 0.35 + rnd() * 0.3); }
  for (let i = cnt(6 * big); i > 0; i--) { const a = rnd() * TAU; bit(f, cx, cy, 6, Math.cos(a) * 90, Math.sin(a) * 70, 40 + rnd() * 60, 24 + rnd() * 16, 0.5); }
  if (big > 1) shake(world, 4, 0.35);
}
function drawRoll(g, f, el, cx, cy) {
  const fade = ribbon(g, f, el, cx, cy, 16, f.m, f.h, SP.ribbon0);
  if (f.n === 0) { f.n = 1; for (let i = cnt(5); i > 0; i--) smoke(f, f.x + (rnd() - 0.5) * 16, f.y + 6, 2, (rnd() - 0.5) * 50, (rnd() - 0.5) * 30, 10, 20 + rnd() * 10, 0.5, 0.35); put(g, SP.shock, f.m, 0, f.x, f.y, 60, 60, 0, 0.6); }
  if (el < 0.5) { put(g, SP.glow, f.m, 1, cx, cy, 44, 44, 0, 0.5 * fade); for (let n = rate(f, 55); n > 0; n--) bit(f, cx + (rnd() - 0.5) * 14, cy + (rnd() - 0.5) * 10, 4 + rnd() * 6, (rnd() - 0.5) * 70, (rnd() - 0.5) * 50, 20 + rnd() * 30, 18 + rnd() * 8, 0.55); }
  if (el < 0.4 && !LITE) put(g, SP.wind, f.h, 0, cx - Math.cos(f.ang) * 26, cy - Math.sin(f.ang) * 26, 70, 26, f.ang, (1 - el / 0.4) * 0.7);
}
function drawWarcry(g, f, el, cx, cy) {
  if (el < 0.6) for (let i = 0; i < 3; i++) { // ondas de choque à frente
    const u = clamp01((el - i * 0.1) / 0.45); if (u <= 0) continue;
    const d = 20 + u * 90, sz = 60 + u * 170;
    put(g, SP.shock, i === 1 ? f.h : f.m, 0, cx + Math.cos(f.ang) * d * 0.55, cy + Math.sin(f.ang) * d * 0.55 - 8, sz, sz, f.ang + i, (1 - u) * 0.85);
  }
  if (!f.n) { f.n = 1; put(g, SP.burst, f.h, 0, cx, cy - 10, 100, 100, 0, 1); for (let i = cnt(14); i > 0; i--) { const a = rnd() * TAU; spark(f, cx, cy - 8, 10, Math.cos(a) * 200, Math.sin(a) * 160, 60 + rnd() * 60, 8 + rnd() * 6, 0.5); } }
  const aura = clamp01(Math.min(el / 0.25, (f.dur + 0.2 - el) / 0.6));
  if (aura > 0) { // anel de runas pintado no chão + brasas subindo durante o reforço
    put(g, SP.glow, f.m, 1, cx, cy + 6, 100, 70, 0, 0.45 * aura);
    put(g, SP.rune0, f.m, 0, cx, cy + 8, 92 + Math.sin(el * 5) * 3, 58 + Math.sin(el * 5) * 2, 0, 0.8 * aura);
    put(g, SP.rune1, f.h, 0, cx, cy + 8, 64, 40, 0, 0.5 * aura);
    for (let n = rate(f, 14); n > 0; n--) bit(f, cx + (rnd() - 0.5) * 40, cy + 6 + (rnd() - 0.5) * 12, 2, (rnd() - 0.5) * 16, 0, 40 + rnd() * 40, 12 + rnd() * 10, 0.9, aura);
  }
}
function drawMuzzle(g, f, k) { // clarão na mão ao lançar a Bola de Fogo / projétil
  const x = f.x + Math.cos(f.ang) * 20, y = f.y + Math.sin(f.ang) * 20 - 6;
  put(g, SP.glow, f.m, 1, x, y, 90 * (0.7 + k), 90 * (0.7 + k), 0, 1 - k);
  put(g, f.fam === 2 ? SP.star8 : SP.burst, f.h, 0, x, y, 64 * (0.6 + k), 64 * (0.6 + k), k * 2, (1 - k) * 1.1);
  if (!f.n) { f.n = 1; for (let i = cnt(6); i > 0; i--) { const a = f.ang + (rnd() - 0.5) * 1.2, v = 120 + rnd() * 160; spark(f, x, y, 6, Math.cos(a) * v, Math.sin(a) * v, 20 + rnd() * 30, 7 + rnd() * 6, 0.3 + rnd() * 0.2); } }
}
function drawFrost(g, f, k, el, cx, cy) {
  const R = f.r, e = ease(k), o = 1 - k;
  put(g, SP.rune1, f.m, 0, cx, cy, R * 2.1 * ease(Math.min(1, k * 2.2)), R * 2.1 * ease(Math.min(1, k * 2.2)), el * 0.9, 0.9 * (1 - k * k));
  if (!LITE) put(g, SP.shock, f.m, 0, cx, cy, R * 2.5 * e, R * 2.5 * e, 0, o * 0.8);
  if (f.fam === 3) { // Névoa Pestilenta: nuvens e fiapos tóxicos
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + el, r = R * (0.2 + 0.6 * e); put(g, SP.smoke0 + (i % 3), PL.toxic, 1, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9, R * 0.9, R * 0.9, a, o * 0.7); }
    for (let i = 0; i < 3; i++) put(g, SP.wisp0 + (i & 1), f.m, 0, cx + Math.cos(i * 2.1 + el * 2) * R * 0.45, cy + Math.sin(i * 2.1 + el * 2) * R * 0.4, R * 0.8, R * 0.8, el * 3 + i, o * 0.85);
  } else { // cristais que brotam em raios
    const N = LITE ? 5 : 7, gr = ease(Math.min(1, k * 2.4));
    for (let i = 0; i < N; i++) { const a = i * TAU / N + 0.25, rr = R * (0.2 + 0.72 * e) * (i % 2 ? 0.7 : 1), sz = R * (i % 2 ? 0.42 : 0.62) * gr; put(g, SP.crystal0 + (i % 3), f.m, 1, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, sz, sz, a + HALF, o * 1.2); }
  }
  burstOnce(f, cx, cy, 18, 260, 60);
  if (el < 0.4) for (let n = rate(f, 50); n > 0; n--) { const a = rnd() * TAU, r = R * (0.3 + rnd() * 0.6); bit(f, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 4, Math.cos(a) * 40, Math.sin(a) * 30, 30 + rnd() * 40, 16 + rnd() * 10, 0.6); }
}
function drawBlink(g, f, k, el, cx, cy) {
  const o = 1 - k, u = ease(Math.min(1, k * 2));
  // origem: implosão (runa que encolhe + estrela) | destino: florescer de luz
  put(g, SP.rune1, f.m, 0, f.ox, f.oy + 4, 120 * (1 - u) + 20, 120 * (1 - u) + 20, -el * 4, o * 0.9);
  put(g, SP.glow, f.m, 1, f.ox, f.oy - 8, 100 * o, 100 * o, 0, o);
  put(g, SP.star8, f.h, 0, f.ox, f.oy - 10, 90 * (1 - u) + 10, 90 * (1 - u) + 10, el * 5, o);
  put(g, SP.ribbon1, f.m, 0, (f.ox + cx) / 2, (f.oy + cy) / 2 - 6, Math.hypot(cx - f.ox, cy - f.oy) + 24, 14 * o + 3, Math.atan2(cy - f.oy, cx - f.ox), o * 0.8);
  put(g, SP.glow, f.m, 1, cx, cy - 8, 150 * (0.5 + k), 150 * (0.5 + k), 0, o);
  put(g, SP.burst, f.h, 0, cx, cy - 10, 50 + 90 * ease(k), 50 + 90 * ease(k), el * 2, o);
  put(g, SP.shock, f.m, 0, cx, cy, 160 * ease(k), 160 * ease(k), 0, o * 0.8);
  put(g, SP.star8, PL.holy, 0, cx, cy - 12, 60 * o + 10, 60 * o + 10, -el * 4, o);
  if (!f.n) {
    f.n = 1; const dx = cx - f.ox, dy = cy - f.oy;
    for (let i = cnt(18); i > 0; i--) { const t = rnd(); spark(f, f.ox + dx * t, f.oy + dy * t - 6, 8 + rnd() * 10, (rnd() - 0.5) * 40, (rnd() - 0.5) * 40, 20 + rnd() * 30, 8 + rnd() * 8, 0.35 + rnd() * 0.4); }
    for (let i = cnt(10); i > 0; i--) { const a = rnd() * TAU; bit(f, cx, cy - 6, 8, Math.cos(a) * 70, Math.sin(a) * 50, 40 + rnd() * 60, 16 + rnd() * 10, 0.6); }
  }
}
// Fúria do Colosso: rastro dourado, onda de choque com pedras ao chegar e aura que dura o reforço
function drawColossus(g, f, el, cx, cy, world) {
  drawDash(g, f, Math.min(el, 0.69), cx, cy, 34, world);
  if (el > 0.3 && f.n < 3) { f.n = 3; // chegada: pedras, poeira, onda dupla, tremor
    for (let i = cnt(9); i > 0; i--) { const a = rnd() * TAU, v = 90 + rnd() * 160; chunk(cx, cy, Math.cos(a) * v, Math.sin(a) * v * 0.7, 260 + rnd() * 220, 14 + rnd() * 12, 1.4); }
    for (let i = cnt(8); i > 0; i--) { const a = rnd() * TAU; smoke(f, cx + Math.cos(a) * 30, cy + Math.sin(a) * 24, 4, Math.cos(a) * 80, Math.sin(a) * 60, 20, 40 + rnd() * 20, 0.9, 0.5); }
    shake(world, 5, 0.45);
  }
  if (el > 0.28 && el < 1.1) { const u = (el - 0.28) / 0.82, e = ease(u); put(g, SP.shock, f.m, 0, cx, cy, 380 * e, 380 * e, 0, (1 - u) * 0.95); put(g, SP.shock, f.h, 0, cx, cy, 300 * e * 0.8, 300 * e * 0.8, 1, (1 - u) * 0.7); put(g, SP.burst, f.h, 0, cx, cy - 6, 70 + 120 * e, 70 + 120 * e, 0, (1 - u)); put(g, SP.glow, f.m, 1, cx, cy, 300 * e, 300 * e, 0, (1 - u) * 0.6); }
  const aura = clamp01(Math.min(el / 0.3, (f.dur + 0.3 - el) / 0.6));
  if (aura > 0 && el > 0.3) {
    put(g, SP.glow, f.m, 1, cx, cy + 6, 120, 84, 0, 0.5 * aura);
    put(g, SP.rune0, f.m, 0, cx, cy + 8, 108, 68, 0, 0.8 * aura);
    put(g, SP.rune1, f.h, 0, cx, cy + 8, 74, 46, 0, 0.5 * aura);
    for (let n = rate(f, 16); n > 0; n--) bit(f, cx + (rnd() - 0.5) * 46, cy + 6 + (rnd() - 0.5) * 12, 2, (rnd() - 0.5) * 14, 0, 40 + rnd() * 50, 14 + rnd() * 12, 0.9, aura);
  }
}
// Meteoro Arcano: telégrafo de runas na área, rocha em chamas caindo (1 s) e explosão
function drawMeteor(g, f, el, world) {
  const tx = f.tx ?? f.x, ty = f.ty ?? f.y, R = f.r, fall = 1.0;
  if (el < fall) {
    const u = el / fall, pulse = 0.7 + 0.3 * Math.sin(el * 12);
    put(g, SP.glow, f.m, 2, tx, ty, R * 2.4 * ease(Math.min(1, u * 3)), R * 2.4 * ease(Math.min(1, u * 3)), 0, 0.3 + 0.2 * u);
    put(g, SP.rune1, f.m, 0, tx, ty, R * 2.08, R * 2.08, el * 0.5, 0.85 * pulse);
    put(g, SP.rune0, f.h, 0, tx, ty, R * 1.5 * (1.05 - u * 0.4), R * 1.5 * (1.05 - u * 0.4), -el * 0.8, 0.6 * pulse);
    put(g, SP.ring, f.m, 0, tx, ty, R * 3.03 * (1 - u * 0.05), R * 3.03 * (1 - u * 0.05), 0, 0.6 * pulse);
    const h = (1 - u) * (1 - u) * 560, mx = tx + h * 0.45, my = ty - h, tail = Math.atan2(-1, 0.45) + HALF;
    put(g, SP.glow, f.m, 1, mx, my, 170, 170, 0, 0.9);
    put(g, SP.flame0 + (((el * 24) | 0) & 3), f.m, 0, mx + 26, my - 58, 150, 150, tail, 1);
    put(g, SP.flame0 + (((el * 24 + 2) | 0) & 3), f.h, 0, mx + 14, my - 32, 96, 96, tail, 0.95);
    put(g, SP.glow, PL.holy, 0, mx, my, 56, 56, 0, 1);
    for (let n = rate(f, 150); n > 0; n--) { if (n % 3) bit(f, mx + 12 + (rnd() - 0.5) * 24, my - 26 + (rnd() - 0.5) * 24, 0, 40, -80, 0, 30 + rnd() * 20, 0.45); else ember(f, mx + (rnd() - 0.5) * 20, my + (rnd() - 0.5) * 20, 0, (rnd() - 0.5) * 60, 30, 20, 10 + rnd() * 8, 0.6); }
    return;
  }
  const u = clamp01((el - fall) / 0.9), o = 1 - u, e = ease(u);
  if (f.n < 2) { f.n = 2; // impacto: pedras, chamas, fumaça, faíscas e tremor
    for (let i = cnt(10); i > 0; i--) { const a = rnd() * TAU, v = 120 + rnd() * 260; chunk(tx, ty, Math.cos(a) * v, Math.sin(a) * v * 0.7, 300 + rnd() * 260, 14 + rnd() * 14, 1.5); }
    for (let i = cnt(18); i > 0; i--) { const a = rnd() * TAU, v = 60 + rnd() * R * 1.2; bit(f, tx + Math.cos(a) * R * 0.2, ty + Math.sin(a) * R * 0.2, 6, Math.cos(a) * v, Math.sin(a) * v * 0.8, 90 + rnd() * 160, 34 + rnd() * 26, 0.6 + rnd() * 0.4); }
    for (let i = cnt(12); i > 0; i--) { const a = rnd() * TAU, v = 40 + rnd() * R; smoke(f, tx + Math.cos(a) * R * 0.3, ty + Math.sin(a) * R * 0.3, 6, Math.cos(a) * v, Math.sin(a) * v * 0.8, 30 + rnd() * 40, 60 + rnd() * 40, 1.3, 0.55); }
    for (let i = cnt(26); i > 0; i--) { const a = rnd() * TAU, v = 150 + rnd() * 380; spark(f, tx, ty, 8, Math.cos(a) * v, Math.sin(a) * v * 0.8, 80 + rnd() * 160, 8 + rnd() * 8, 0.5 + rnd() * 0.6); }
    shake(world, 6, 0.5);
  }
  put(g, SP.glow, f.m, 1, tx, ty, R * 3 * (0.6 + 0.5 * e), R * 3 * (0.6 + 0.5 * e), 0, o * 0.9);
  put(g, SP.burst, f.h, 0, tx, ty, R * 2.4 * (0.4 + 0.6 * e), R * 2.4 * (0.4 + 0.6 * e), 0, o * 1.1);
  put(g, SP.shock, f.m, 0, tx, ty, R * 2.5 * e, R * 2.5 * e, 0, o);
  put(g, SP.shock, f.h, 0, tx, ty, R * 2.5 * ease(Math.max(0, u - 0.12) / 0.88) * 0.7, R * 2.5 * ease(Math.max(0, u - 0.12) / 0.88) * 0.7, 2, o * 0.7);
  if (el - fall < 0.9) put(g, SP.rune1, f.m, 0, tx, ty, R * 2.08, R * 2.08, el * 0.5, o * 0.5);
  if (el - fall < 0.7) for (let n = rate(f, 22); n > 0; n--) { const a = rnd() * TAU, r = rnd() * R * 0.8; ember(f, tx + Math.cos(a) * r, ty + Math.sin(a) * r, 0, (rnd() - 0.5) * 20, (rnd() - 0.5) * 20, 50 + rnd() * 60, 9 + rnd() * 7, 0.8); } // brasas da queimadura
}
function drawRain(g, f, el) {
  const tx = f.tx ?? f.x, ty = f.ty ?? f.y, R = f.r, storm = f.skill === 'arrowstorm' || f.skill === 'wl_souls';
  const ring = clamp01(Math.min(el / 0.2, (f.life - el) / 0.4));
  put(g, SP.glow, f.m, 1, tx, ty, R * 2.4, R * 2.4, 0, 0.3 * ring);
  put(g, SP.rune0, f.m, 0, tx, ty, R * 2.08, R * 2.08, el * 0.3, 0.8 * ring);
  put(g, SP.rune1, f.h, 0, tx, ty, R * 1.35, R * 1.35, -el * 0.4, 0.45 * ring);
  const gap = storm ? 0.1 : 0.125, N = storm ? (LITE ? 16 : 28) : LITE ? 10 : 18; let s = f.seed >>> 0;
  for (let i = 0; i < N; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const ra = (s / 4294967296) * TAU;
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const rr = Math.sqrt(s / 4294967296) * R * 0.92;
    const lx = tx + Math.cos(ra) * rr, ly = ty + Math.sin(ra) * rr, local = el - (0.15 + i * gap);
    if (local < 0) continue;
    if (local < 0.2) { // flecha caindo (inclinada), fita luminosa
      const u = local / 0.2, h = 150 * (1 - u), hx = lx + h * 0.35, hy = ly - h;
      put(g, SP.ribbon0, f.m, 0, hx - 1.5, hy - 14, 52, storm ? 22 : 15, 1.69, 0.95);
      put(g, SP.ribbon0, f.h, 0, hx - 1.5, hy - 10, 30, 7, 1.69, 1);
      put(g, SP.glow, f.m, 1, hx, hy, storm ? 34 : 22, storm ? 34 : 22, 0, 0.8);
    } else if (local < 0.55) { // impacto
      const u = (local - 0.2) / 0.35;
      put(g, SP.burst, f.h, 0, lx, ly, 26 + u * 26, 26 + u * 26, 0, (1 - u) * 0.9);
      put(g, SP.shock, f.m, 0, lx, ly, 18 + u * 56, 18 + u * 56, 0, (1 - u) * 0.8);
      if (!(f.mask & (1 << i))) { f.mask |= 1 << i; for (let j = LITE ? 1 : 2; j > 0; j--) { const a = rnd() * TAU; if (storm) bit(f, lx, ly, 2, Math.cos(a) * 40, Math.sin(a) * 30, 40 + rnd() * 50, 20 + rnd() * 10, 0.5); else bit(f, lx, ly, 2, Math.cos(a) * 50, Math.sin(a) * 40, 60 + rnd() * 60, 16 + rnd() * 8, 0.8); } spark(f, lx, ly, 3, (rnd() - 0.5) * 120, (rnd() - 0.5) * 90, 80 + rnd() * 60, 7 + rnd() * 5, 0.4); }
    }
  }
}
function drawPierce(g, f, k, cx, cy) { // clarão do disparo + fita de luz até o fim do alcance (Rajada do Pistoleiro: três em leque)
  const o = 1 - k, n = f.spec === 'gunslinger' ? 3 : 1;
  for (let b = 0; b < n; b++) {
    const ang = f.ang + (n > 1 ? (b - 1) * 0.18 : 0), L = Math.min(f.range, n > 1 ? 480 : 720) * (0.25 + 0.75 * ease(Math.min(1, k * 2.2))), cos = Math.cos(ang), sin = Math.sin(ang), x0 = cx + cos * 18, y0 = cy + sin * 18 - 6;
    put(g, SP.ribbon0, f.m, 0, x0 + cos * L * 0.5, y0 + sin * L * 0.5, L, (n > 1 ? 26 : 52) * o + 6, ang, o * 0.9);
    put(g, SP.ribbon0, f.h, 0, x0 + cos * L * 0.5, y0 + sin * L * 0.5, L, (n > 1 ? 9 : 18) * o + 2, ang, o);
  }
  const x0 = cx + Math.cos(f.ang) * 18, y0 = cy + Math.sin(f.ang) * 18 - 6;
  put(g, SP.glow, f.m, 1, x0, y0, 90 * (0.6 + k), 90 * (0.6 + k), 0, o);
  put(g, SP.star8, f.h, 0, x0, y0, 70 * (0.6 + k), 70 * (0.6 + k), k * 3, o);
  if (!f.n) { f.n = 1; for (let i = cnt(9); i > 0; i--) { const t = rnd() * Math.min(f.range, 720) * 0.8, a = f.ang + (rnd() - 0.5) * 0.1; spark(f, x0 + Math.cos(a) * t, y0 + Math.sin(a) * t, 4, (rnd() - 0.5) * 40, (rnd() - 0.5) * 40, 20 + rnd() * 30, 6 + rnd() * 6, 0.3 + rnd() * 0.3); } }
}
function drawSun(g, f, k, el, cx, cy) {
  const big = f.skill === 'intervention' || f.skill === 'gd_celestial', R = f.r * (big ? 0.55 : 1), e = ease(k), o = 1 - k * k;
  if (big) { // coluna de luz que desce sobre o clérigo
    const w = 80 * (1 - k * 0.5);
    put(g, SP.glow, f.m, 1, cx, cy - 110, w * 1.7, 340, 0, o * 0.9);
    put(g, SP.glow, PL.holy, 0, cx, cy - 110, w * 0.55, 330, 0, o * 0.9);
    put(g, SP.rune1, f.m, 0, cx, cy + 6, f.r * 1.3 * ease(Math.min(1, k * 2)), f.r * 1.3 * ease(Math.min(1, k * 2)), el * 0.6, o * 0.7);
  }
  put(g, SP.glow, f.m, 1, cx, cy, R * 2.8, R * 2.8, 0, o * 0.65);
  put(g, SP.rays, f.h, 0, cx, cy - 6, R * 2.2 * (0.5 + 0.5 * e), R * 2.2 * (0.5 + 0.5 * e), k * 1.2, o * 0.95);
  put(g, SP.rays, f.m, 0, cx, cy - 6, R * 1.5 * (0.5 + 0.5 * e), R * 1.5 * (0.5 + 0.5 * e), -k * 1.6, o * 0.8);
  put(g, SP.ring, f.m, 0, cx, cy, R * 3.03 * e, R * 3.03 * e, 0, (1 - k) * 0.9);
  put(g, SP.star8, PL.holy, 0, cx, cy - 8, 52 * (1 - k * 0.4), 52 * (1 - k * 0.4), k * 2, o * 0.8);
  if (!f.n) { f.n = 1; if (f.spec === 'inquisitor') for (let i = cnt(12); i > 0; i--) { const a = rnd() * TAU; spark(f, cx, cy - 6, 8, Math.cos(a) * 240, Math.sin(a) * 190, 40, 9 + rnd() * 7, 0.5); } }
  if (el < 0.6) for (let n = rate(f, big ? 90 : 50); n > 0; n--) { const a = rnd() * TAU, r = rnd() * R * 0.85; bit(f, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.5, 2, 0, 0, 50 + rnd() * 70, 16 + rnd() * 12, 0.8); }
}
// Anel de runas no chão que dura a vida da zona (Armadilha de Gelo, Santuário do Sol): lê só o estado do efeito.
function drawZone(g, f, el) {
  const tx = f.tx ?? f.x, ty = f.ty ?? f.y, R = f.r, a = clamp01(Math.min(el / 0.3, (f.life - el) / 0.6)), pulse = 0.85 + 0.15 * Math.sin(el * 4);
  if (a <= 0) return;
  put(g, SP.glow, f.m, 1, tx, ty, R * 2.3, R * 2.3, 0, 0.32 * a * pulse);
  put(g, SP.rune0, f.m, 0, tx, ty, R * 2.05, R * 2.05, el * 0.35, 0.75 * a);
  put(g, SP.rune1, f.h, 0, tx, ty, R * 1.35, R * 1.35, -el * 0.5, 0.5 * a);
  if (!LITE) put(g, SP.ring, f.m, 0, tx, ty, R * 2.9, R * 2.9, 0, 0.35 * a * pulse);
  for (let n = rate(f, 16); n > 0; n--) { const ang = rnd() * TAU, r = rnd() * R * 0.85; bit(f, tx + Math.cos(ang) * r, ty + Math.sin(ang) * r * 0.55, 2, 0, 0, 40 + rnd() * 50, 12 + rnd() * 8, 0.9, a); }
}
function drawBubble(g, f, el, cx, cy) {
  const alpha = clamp01(Math.min(el / 0.15, (f.dur + 0.2 - el) / 0.6));
  if (alpha > 0) {
    const R = 36 + Math.sin(el * 5) * 1.5;
    put(g, SP.glow, f.m, 1, cx, cy - 6, R * 2.6, R * 2.6, 0, 0.35 * alpha);
    put(g, SP.bubble, f.m, 1, cx, cy - 6, R * 2.1, R * 2.1, 0, 0.9 * alpha);
    put(g, SP.rune1, f.m, 0, cx, cy + 8, 100, 64, 0, 0.75 * alpha);
    put(g, SP.rune0, f.h, 0, cx, cy + 8, 70, 44, 0, 0.5 * alpha);
    for (let i = 0; i < 3; i++) { const a = el * 1.6 + i * TAU / 3; put(g, SP.spark, f.h, 0, cx + Math.cos(a) * R, cy - 6 + Math.sin(a) * R * 0.8, 20, 20, a, 0.9 * alpha); }
    for (let n = rate(f, 5); n > 0; n--) bit(f, cx + (rnd() - 0.5) * 46, cy + 4, 2, 0, 0, 30 + rnd() * 20, 12 + rnd() * 8, 0.9, alpha);
  }
  if (el < 0.5) { const u = el / 0.5; put(g, SP.shock, f.m, 0, cx, cy, 70 + ease(u) * 200, 70 + ease(u) * 200, 0, (1 - u) * 0.9); put(g, SP.burst, f.h, 0, cx, cy - 8, 70 + 60 * u, 70 + 60 * u, 0, (1 - u)); }
}
function drawBeam(g, f, k, cx, cy) { // raio sagrado até o fim do alcance
  const L = Math.min(f.range, 560), cos = Math.cos(f.ang), sin = Math.sin(f.ang), x0 = cx + cos * 16, y0 = cy + sin * 16 - 6, o = 1 - k, e = ease(Math.min(1, k * 2.5));
  const len = L * (0.35 + 0.65 * e), mx = x0 + cos * len / 2, my = y0 + sin * len / 2, ex = x0 + cos * L, ey = y0 + sin * L;
  put(g, SP.glow, f.m, 1, mx, my, len, 80 * o + 12, f.ang, o * 0.7);
  put(g, SP.ribbon0, f.m, 0, mx, my, len, 38 * o + 6, f.ang, o * 0.9);
  put(g, SP.ribbon0, f.h, 0, mx, my, len, 15 * o + 2, f.ang, o);
  put(g, SP.ribbon0, PL.holy, 0, mx, my, len, 5 * o, f.ang, o);
  put(g, SP.star8, f.h, 0, x0, y0, 80 * o + 20, 80 * o + 20, k * 3, o);
  put(g, SP.rays, f.m, 0, ex, ey, 140 * e, 140 * e, k * 2, o * 0.8); put(g, SP.glow, f.m, 1, ex, ey, 150 * e, 150 * e, 0, o); put(g, SP.shock, f.m, 0, ex, ey, 150 * e, 150 * e, 0, o * 0.8);
  if (!f.n) { f.n = 1; for (let i = cnt(16); i > 0; i--) { const t = rnd() * L; spark(f, x0 + cos * t, y0 + sin * t, 6, (rnd() - 0.5) * 60, (rnd() - 0.5) * 60, 20 + rnd() * 50, 8 + rnd() * 7, 0.4 + rnd() * 0.4); } }
}

function drawCrit(g, f, k, cx, cy) { // estouro de estrela e faíscas no alvo
  const o = 1 - k, e = ease(k);
  put(g, SP.glow, f.m, 1, cx, cy - 6, 110, 110, 0, o * 0.8);
  put(g, SP.burst, f.h, 0, cx, cy - 6, 40 + 70 * e, 40 + 70 * e, k * 1.5, o);
  put(g, SP.star8, PL.holy, 0, cx, cy - 6, 70 * (1 - k * 0.3), 70 * (1 - k * 0.3), k * 2, o);
  if (!f.n) { f.n = 1; for (let i = cnt(8); i > 0; i--) { const a = rnd() * TAU, v = 130 + rnd() * 160; spark(f, cx, cy - 6, 8, Math.cos(a) * v, Math.sin(a) * v * 0.8, 30 + rnd() * 50, 7 + rnd() * 6, 0.35 + rnd() * 0.25); } }
}
function drawAbsorb(g, f, k, cx, cy) { // escudo absorveu o golpe: clarão em bolha dourada
  const o = 1 - k, R = (f.r ?? 14) + 14 + 8 * ease(k);
  put(g, SP.bubble, f.m, 1, cx, cy - 4, R * 2.2, R * 2.2, 0, o);
  put(g, SP.ring, f.h, 0, cx, cy - 4, R * 2.9 * (0.8 + 0.3 * ease(k)), R * 2.9 * (0.8 + 0.3 * ease(k)), 0, o * 0.8);
  if (!f.n) { f.n = 1; for (let i = cnt(5); i > 0; i--) { const a = rnd() * TAU; spark(f, cx + Math.cos(a) * R, cy - 4 + Math.sin(a) * R * 0.8, 6, Math.cos(a) * 60, Math.sin(a) * 50, 30, 7 + rnd() * 5, 0.4); } }
}
function drawHeal(g, f, k, cx, cy) { // cruzes verdes subindo do alvo, com aura e fagulhas
  const o = 1 - k * k;
  put(g, SP.glow, f.m, 1, cx, cy, 90, 90, 0, o * 0.55);
  put(g, SP.ring, f.m, 0, cx, cy + 4, (24 + 40 * ease(k)) * 3.03 * 0.5, (24 + 40 * ease(k)) * 3.03 * 0.5 * 0.7, 0, (1 - k) * 0.8);
  for (let i = 0; i < 4; i++) {
    const u = clamp01(k * 1.15 - i * 0.07); if (u <= 0) continue;
    put(g, SP.cross, f.m, 0, cx + Math.sin(i * 2.1 + k * 3) * 14, cy - 6 - u * 44, 15 * (1 - u * 0.4), 15 * (1 - u * 0.4), 0, o * (1 - u * 0.4));
  }
  if (!f.n) { f.n = 1; for (let i = cnt(8); i > 0; i--) em(SP.spark, f.h, 0, cx + (rnd() - 0.5) * 24, cy + (rnd() - 0.5) * 10, 2, 0, 0, 40 + rnd() * 40, 9 + rnd() * 5, 2, 0.6 + rnd() * 0.4, 0, 0, 1, 0.5, -20); }
}

// o desenho chama isto uma vez por quadro: guarda a posição anterior dos atores que podem se teleportar
export function trackActors(world) {
  for (const a of world.actors) if (a.classId === 'mage' && a.kind !== 'mob') { const p = lastPos.get(a); if (p) { p.x = a.x; p.y = a.y; } else lastPos.set(a, { x: a.x, y: a.y }); }
}
