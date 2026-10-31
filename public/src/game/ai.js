// IA produz as mesmas "intenções" que o input do jogador.
import { CLASSES } from '../data/classes.js';
import { SKILLS } from '../data/skills.js';
import { MOBS } from '../data/mobs.js';

const toward = (a, x, y, spd = 1) => ({ mx: x - a.x, my: y - a.y, aimX: x, aimY: y, spd });

export function mobIntent(m, w, dt) {
  const ai = m.ai, M = MOBS[m.mobId];
  let tgt = ai.target != null ? w.byId(ai.target) : null;
  if (tgt?.dead) { tgt = null; ai.target = null; }
  const homeD = Math.hypot(m.x - m.home.x, m.y - m.home.y);

  if (ai.state === 'return') {
    if (homeD < 30) ai.state = 'idle';
    else return toward(m, m.home.x, m.home.y, 1.3);
  }
  if (!tgt && !w.zone.safe) {
    const e = w.nearestEnemy(m, M.aggro);
    if (e) { ai.target = e.id; tgt = e; ai.state = 'chase'; }
  }
  if (tgt && !m.boss && !w.zone.noLeash && homeD > 700) {
    ai.state = 'return'; ai.target = null;
    m.hp = m.maxHp;
    return toward(m, m.home.x, m.home.y, 1.3);
  }
  if (!tgt) {
    ai.t -= dt;
    if (ai.t <= 0) {
      ai.t = 2 + w.rng.next() * 3;
      const ang = w.rng.next() * Math.PI * 2, d = w.rng.chance(0.4) ? 0 : w.rng.range(30, 120);
      ai.tx = m.home.x + Math.cos(ang) * d;
      ai.ty = m.home.y + Math.sin(ang) * d;
    }
    if (Math.hypot(ai.tx - m.x, ai.ty - m.y) > 8) return toward(m, ai.tx, ai.ty, 0.4);
    return null;
  }

  const d = Math.hypot(tgt.x - m.x, tgt.y - m.y);
  // Chefes: golpe em área telegrafado sob o alvo.
  if (m.boss && m.cds.slam <= 0 && d < 450) {
    w.telegraphs.push({ x: tgt.x, y: tgt.y, r: 115, t: 0, delay: 1.1, src: m, mult: 1.8, color: M.color });
    m.cds.slam = 5.5;
  }
  const it = { aimX: tgt.x, aimY: tgt.y, mx: 0, my: 0, attack: false };
  if (M.kind === 'ranged') {
    if (d > M.range * 0.85) { it.mx = tgt.x - m.x; it.my = tgt.y - m.y; }
    else if (d < M.range * 0.4) { it.mx = m.x - tgt.x; it.my = m.y - tgt.y; it.spd = 0.7; }
    if (d <= M.range) it.attack = true;
  } else {
    const reach = M.range + tgt.r + m.r * 0.5;
    if (d > reach - 6) { it.mx = tgt.x - m.x; it.my = tgt.y - m.y; }
    if (d <= reach + 4) it.attack = true;
  }
  return it;
}

// Rival da arena: usa o mesmo kit de classe do jogador.
export function rivalIntent(r, w, dt) {
  const ai = (r.ai ??= { think: 0, strafe: 1, jx: 0, jy: 0, cast: null });
  const tgt = w.nearestEnemy(r);
  if (!tgt) return null;
  const cls = CLASSES[r.classId];
  const melee = cls.basic.kind === 'melee';
  const dx = tgt.x - r.x, dy = tgt.y - r.y, d = Math.hypot(dx, dy) || 1;
  const nx = dx / d, ny = dy / d;

  ai.think -= dt;
  if (ai.think <= 0) {
    ai.think = 0.22 + w.rng.next() * 0.25; // tempo de reação humano
    if (w.rng.chance(0.25)) ai.strafe *= -1;
    ai.jx = w.rng.range(-18, 18);
    ai.jy = w.rng.range(-18, 18);
    ai.cast = chooseSkill(r, tgt, d);
  }

  const pref = melee ? 40 : 300;
  let mx = 0, my = 0;
  // Partida por times: longe de qualquer inimigo, vai ao ponto de controle em vez de vagar.
  const ob = w.objective;
  if (ob && d > 420) {
    const ox = ob.x - r.x, oy = ob.y - r.y, od = Math.hypot(ox, oy) || 1;
    if (od > ob.r * 0.6) { const [sx, sy] = steerAround(r, w, ox / od, oy / od); return { mx: sx, my: sy, aimX: tgt.x, aimY: tgt.y, cast: null, attack: false }; }
  }
  if (d > pref + 40) { mx = nx; my = ny; }
  else if (!melee && d < pref - 90) { mx = -nx; my = -ny; }
  if (!melee || d < 140) { mx += -ny * ai.strafe * 0.7; my += nx * ai.strafe * 0.7; }

  [mx, my] = steerAround(r, w, mx, my);
  const it = {
    mx, my, aimX: tgt.x + ai.jx, aimY: tgt.y + ai.jy, cast: null,
    attack: d <= (melee ? cls.basic.range + tgt.r : cls.basic.range * 0.95),
  };
  if (ai.cast) {
    it.cast = ai.cast.idx;
    if (ai.cast.away) { it.aimX = r.x - nx * 200 + -ny * ai.strafe * 120; it.aimY = r.y - ny * 200 + nx * ai.strafe * 120; }
    ai.cast = null;
  }
  return it;
}

// Contorna pilares de frente (sem isto o bot trava atrás de um pilar no caminho reto até o alvo).
function steerAround(r, w, mx, my) {
  const len = Math.hypot(mx, my);
  if (len < 0.01) return [mx, my];
  const ux = mx / len, uy = my / len;
  for (const o of w.layout.obstacles) {
    if (!o.r || !o.block) continue;
    const dx = o.x - r.x, dy = o.y - r.y, d = Math.hypot(dx, dy), reach = o.r + r.r + 60;
    if (d > reach || d < 0.001) continue;
    if ((dx * ux + dy * uy) / d < 0.6) continue; // não está à frente
    const side = ux * dy - uy * dx > 0 ? -1 : 1; // lado mais curto
    mx += -uy * side * 1.6; my += ux * side * 1.6;
    break;
  }
  return [mx, my];
}

function chooseSkill(r, tgt, d) {
  const ids = CLASSES[r.classId].skills;
  for (let i = 0; i < ids.length; i++) {
    if (r.cds['s' + i] > 0) continue;
    const s = SKILLS[ids[i]];
    switch (s.kind) {
      case 'aoe_self':
        if (s.heal ? r.hp < r.maxHp * 0.6 || d < s.radius * 0.8 : d < s.radius * 0.9) return { idx: i };
        break;
      case 'projectile':
        if (d < s.range * 0.85) return { idx: i };
        break;
      case 'ground_aoe':
        if (d < s.range) return { idx: i };
        break;
      case 'buff':
        if (d < 260 || r.hp < r.maxHp * 0.5) return { idx: i };
        break;
      case 'dash':
        if (s.mult > 0 ? d > 110 && d < s.dist : d < 110) return { idx: i, away: s.mult === 0 };
        break;
      case 'blink':
        if (d < 120) return { idx: i, away: true };
        break;
    }
  }
  return null;
}
