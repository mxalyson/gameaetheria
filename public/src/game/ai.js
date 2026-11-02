// IA produz as mesmas "intenções" que o input do jogador.
import { CLASSES } from '../data/classes.js';
import { SKILLS } from '../data/skills.js';
import { skillOf } from '../core/specs.js';
import { MOBS, BOSS_PHASES } from '../data/mobs.js';
import { isSkillUnlocked } from '../core/unlocks.js';
import { riverX } from './layout.js';

// Rio: a água bloqueia o movimento (não os projéteis). Se a reta até (tx, ty) cruza um rio, devolve o próximo ponto de passagem
// pela ponte que menos desvia do caminho (margem de aproximação -> pela lacuna -> margem oposta); senão null.
export function waterWaypoint(w, a, tx, ty) {
  const rivers = w.layout.rivers;
  if (!rivers?.length) return null;
  let best = null, bc = Infinity;
  for (const rv of rivers) {
    const sa = Math.sign(a.x - riverX(rv, a.y)), sb = Math.sign(tx - riverX(rv, ty));
    if (!sa || sa === sb) continue; // mesma margem: caminho livre
    const off = rv.w / 2 + 75;
    for (const b of rv.bridges) {
      const ap = { x: b.x + sa * off, y: b.y }, ex = { x: b.x - sa * off, y: b.y };
      const c = Math.hypot(ap.x - a.x, ap.y - a.y) + 2 * off + Math.hypot(tx - ex.x, ty - ex.y);
      if (c < bc) { bc = c; best = Math.abs(a.y - b.y) <= b.hw - 14 ? ex : ap; }
    }
  }
  return best;
}

const toward = (a, x, y, spd = 1, w = null) => {
  const wp = w && waterWaypoint(w, a, x, y);
  return { mx: (wp ?? { x }).x - a.x, my: (wp ?? { y }).y - a.y, aimX: x, aimY: y, spd };
};

export function mobIntent(m, w, dt) {
  const ai = m.ai, M = MOBS[m.mobId];
  let tgt = ai.target != null ? w.byId(ai.target) : null;
  if (tgt?.dead) { tgt = null; ai.target = null; }
  const homeD = Math.hypot(m.x - m.home.x, m.y - m.home.y);

  if (ai.state === 'return') {
    if (homeD < 30) ai.state = 'idle';
    else return toward(m, m.home.x, m.home.y, 1.3, w);
  }
  if (!tgt && !w.zone.safe && m.hostile !== false) { // passivo: só reage depois de apanhar (ver World.damage)
    const e = w.nearestEnemy(m, M.aggro);
    if (e) { ai.target = e.id; tgt = e; ai.state = 'chase'; }
  }
  // a trela é maior quando a casa fica do outro lado de um rio: o desvio pela ponte alonga o caminho
  if (tgt && !m.boss && !w.zone.noLeash && homeD > (waterWaypoint(w, m, m.home.x, m.home.y) ? 1100 : 700)) {
    ai.state = 'return'; ai.target = null;
    m.hp = m.maxHp;
    return toward(m, m.home.x, m.home.y, 1.3, w);
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
  if (m.boss) bossTick(m, w, tgt, d, M);
  else if (m.elite && (w.zone.level?.[0] ?? 0) >= 6 && m.cds.slam <= 0 && d < 380) { // elites aprendem o golpe em área a partir da Planície
    telegraph(w, m, tgt.x, tgt.y, 90, 1.5, 1.2, M.color);
    m.cds.slam = 7;
  }
  const it = { aimX: tgt.x, aimY: tgt.y, mx: 0, my: 0, attack: false };
  if (M.kind === 'ranged') {
    if (d > M.range * 0.85) { const wp = waterWaypoint(w, m, tgt.x, tgt.y) ?? tgt; it.mx = wp.x - m.x; it.my = wp.y - m.y; }
    else if (d < M.range * 0.4) { it.mx = m.x - tgt.x; it.my = m.y - tgt.y; it.spd = 0.7; }
    if (d <= M.range) it.attack = true;
  } else {
    const reach = M.range + tgt.r + m.r * 0.5;
    if (d > reach - 6) { const wp = waterWaypoint(w, m, tgt.x, tgt.y) ?? tgt; it.mx = wp.x - m.x; it.my = wp.y - m.y; }
    if (d <= reach + 4) it.attack = true;
  }
  return it;
}

// Golpe em área telegrafado: o dano cai quando o aviso (delay) termina; o cliente desenha o aviso de perigo.
function telegraph(w, m, x, y, r, mult, delay, color) {
  w.telegraphs.push({ x, y, r, t: 0, delay, src: m, mult, color });
  w.events.push({ type: 'telegraph', x, y, r, delay, color });
}

// Mecânica dos chefes: 3 fases por vida (<60% mais rápido, <30% enrage), golpes em área maiores/mais frequentes e, no último chefe, invocações.
function bossTick(m, w, tgt, d, M) {
  const P = BOSS_PHASES.default, X = BOSS_PHASES[m.mobId] ?? {};
  const frac = m.hp / m.maxHp;
  const ph = frac < P.p3 ? 3 : frac < P.p2 ? 2 : 1;
  if (ph !== m.phase) {
    m.phase = ph;
    m.stats.moveSpeed = m.base.moveSpeed * P.speed[ph - 1];
    m.stats.atkSpeed = P.atkSpeed[ph - 1];
    m.stats.power = m.base.power * P.power[ph - 1];
    w.events.push({ type: 'phase', actor: m, phase: ph, t: w.time });
  }
  const i = ph - 1, S = P.slam;
  if (m.cds.slam <= 0 && d < 450) {
    telegraph(w, m, tgt.x, tgt.y, S.r[i], S.mult[i], S.delay[i], M.color);
    if (ph === 3) { // enrage: um segundo golpe cai ao lado, forçando o jogador a se mexer
      const a = w.rng.next() * Math.PI * 2;
      telegraph(w, m, tgt.x + Math.cos(a) * S.r[i] * 1.3, tgt.y + Math.sin(a) * S.r[i] * 1.3, S.r[i] * 0.85, S.mult[i], S.delay[i] + 0.25, M.color);
    }
    m.cds.slam = S.cd[i];
  }
  const sm = X.summon;
  if (sm && ph >= 2 && m.cds.summon <= 0) {
    m.cds.summon = sm.every;
    w.summonMinions(m, tgt, sm);
  }
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
    ai.cast = chooseSkill(r, tgt, d, w);
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

function chooseSkill(r, tgt, d, w) {
  const ids = CLASSES[r.classId].skills;
  for (let i = 0; i < ids.length; i++) {
    if (r.cds['s' + i] > 0 || !isSkillUnlocked(r.level ?? 30, i)) continue;
    const s = skillOf(r.classId, r.spec, ids[i]);
    switch (s.kind) {
      case 'aoe_self':
        if (s.heal ? r.hp < r.maxHp * 0.6 || d < s.radius * 0.8 || w.alliesOf(r, s.radius).some((al) => al.hp < al.maxHp * 0.5) : d < s.radius * 0.9) return { idx: i };
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
