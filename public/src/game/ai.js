// IA produz as mesmas "intenções" que o input do jogador.
import { CLASSES } from '../data/classes.js';
import { skillOf, basicOf } from '../core/specs.js';
import { MOBS, BOSS_PHASES } from '../data/mobs.js';
import { isSkillUnlocked, skillIdAt } from '../core/unlocks.js';
import { riverX } from './layout.js';

// Rio: a água bloqueia o movimento (não os projéteis). Se a reta até (tx, ty) cruza um rio, devolve o próximo ponto de passagem
// pela ponte que menos desvia do caminho (margem de aproximação -> pela lacuna -> margem oposta); senão null.
// Ponto de passagem reutilizado (P11.6): waterWaypoint roda várias vezes por tick por monstro e alocava 2 objetos por ponte; quem chama lê x/y na hora.
const WP = { x: 0, y: 0 };
export function waterWaypoint(w, a, tx, ty) {
  const rivers = w.layout.rivers;
  if (!rivers?.length) return null;
  let found = false, bc = Infinity;
  for (const rv of rivers) {
    const sa = Math.sign(a.x - riverX(rv, a.y)), sb = Math.sign(tx - riverX(rv, ty));
    if (!sa || sa === sb) continue; // mesma margem: caminho livre
    const off = rv.w / 2 + 75;
    for (const b of rv.bridges) {
      const apx = b.x + sa * off, exx = b.x - sa * off; // margem de aproximação / margem oposta (y = b.y nas duas)
      const c = Math.hypot(apx - a.x, b.y - a.y) + 2 * off + Math.hypot(tx - exx, ty - b.y);
      if (c < bc) {
        bc = c; found = true;
        WP.x = Math.abs(a.y - b.y) <= b.hw - 14 ? exx : apx; WP.y = b.y;
      }
    }
  }
  return found ? WP : null;
}

// Intenção do monstro reutilizada (uma por monstro): a simulação consome na hora (applyIntent) e ninguém a guarda. Todos os campos são
// reescritos a cada chamada (spd/cast `undefined` = ausente, igual ao objeto novo de antes).
const intentFor = (m) => (m.ai.it ??= { mx: 0, my: 0, aimX: 0, aimY: 0, spd: undefined, attack: false, cast: undefined });
const toward = (m, x, y, spd = 1, w = null) => {
  const wp = w && waterWaypoint(w, m, x, y);
  const it = intentFor(m);
  it.mx = (wp ? wp.x : x) - m.x; it.my = (wp ? wp.y : y) - m.y; it.aimX = x; it.aimY = y; it.spd = spd; it.attack = false; it.cast = undefined;
  return it;
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
    const e = w.nearestEnemy(m, M.aggro * (w.nightMods?.aggroMul ?? 1));
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
  const it = intentFor(m);
  it.aimX = tgt.x; it.aimY = tgt.y; it.mx = 0; it.my = 0; it.attack = false; it.spd = undefined; it.cast = undefined;
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
  const X = BOSS_PHASES[m.mobId] ?? {}, P = X.slam ? X : BOSS_PHASES.default; // chefe com mecânica própria (ex.: Soberano dos Ecos, 2 fases) traz fases/golpes completos
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
// Fração da antecipação de mira (0 = mira no alvo, 1 = mira exata à frente). 0,4 foi o melhor em `npm run balance`: com 0,8–1 o Arqueiro e o Guerreiro dominam.
const LEAD = 0.4;
export function rivalIntent(r, w, dt) {
  const ai = (r.ai ??= { think: 0, strafe: 1, jx: 0, jy: 0, cast: null });
  const tgt = w.nearestEnemy(r);
  if (!tgt) return null;
  const cls = CLASSES[r.classId];
  const basic = basicOf(r.classId, r.spec), melee = basic.kind === 'melee';
  const dx = tgt.x - r.x, dy = tgt.y - r.y, d = Math.hypot(dx, dy) || 1;
  const nx = dx / d, ny = dy / d;

  // Velocidade do alvo (média móvel dos últimos deslocamentos): serve para mirar à frente em projéteis lentos, como um jogador faz.
  if (ai.lid === tgt.id && dt > 0) {
    ai.vx = (ai.vx ?? 0) * 0.85 + ((tgt.x - ai.lx) / dt) * 0.15; ai.vy = (ai.vy ?? 0) * 0.85 + ((tgt.y - ai.ly) / dt) * 0.15;
  } else { ai.vx = 0; ai.vy = 0; }
  ai.lid = tgt.id; ai.lx = tgt.x; ai.ly = tgt.y;

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
  // mira à frente: tempo de voo = distância / velocidade do projétil (o ataque básico ou a habilidade lançada agora)
  let lead = 0;
  if (!melee) {
    const sk = ai.cast ? skillOf(r.classId, r.spec, skillIdAt(r.classId, ai.cast.idx)) : null;
    const sp = sk ? (sk.kind === 'projectile' ? sk.speed : 0) : basic.speed;
    if (sp) lead = Math.min(0.9, d / sp) * LEAD;
  }
  const it = {
    mx, my, aimX: tgt.x + ai.vx * lead + ai.jx, aimY: tgt.y + ai.vy * lead + ai.jy, cast: null,
    attack: d <= (melee ? basic.range + tgt.r : basic.range * 0.95),
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

const CHOOSE_ORDER = [3, 0, 1, 2];
function chooseSkill(r, tgt, d, w) {
  for (const i of CHOOSE_ORDER) { // a Maestria (s3, se o rival a tem) vem primeiro: é a jogada decisiva
    if (r.cds['s' + i] > 0 || !isSkillUnlocked(r.level == null ? 30 : r, i)) continue;
    const s = skillOf(r.classId, r.spec, skillIdAt(r.classId, i));
    switch (s.kind) {
      case 'meteor':
        if (d < s.range * 0.9) return { idx: i };
        break;
      case 'divine':
        if (r.hp < r.maxHp * 0.45 || r.stunT > 0.5) return { idx: i };
        break;
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
