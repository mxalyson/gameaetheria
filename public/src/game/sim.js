// Simulação do mundo: não toca no DOM nem no canvas. Recebe "intenções" por ator
// (mover, mirar, atacar, usar habilidade) — exatamente o que um cliente enviaria
// ao servidor no multiplayer — e produz estado + eventos.
import { makeRng } from '../core/rng.js';
import { computeHit } from '../core/combat.js';
import { computeStats } from '../core/stats.js';
import { spiritPower } from '../core/progression.js';
import { CLASSES } from '../data/classes.js';
import { SKILLS } from '../data/skills.js';
import { skillOf, activeSpec } from '../core/specs.js';
import { MOBS } from '../data/mobs.js';
import { ZONES } from '../data/zones.js';
import { SPIRITS } from '../data/spirits.js';
import { buildLayout } from './layout.js';
import { mobIntent, rivalIntent } from './ai.js';

const TAU = Math.PI * 2;
export const PVP_DAMAGE = 0.32; // duelos entre heróis mais longos e táticos (medido com npm run balance)
let nextId = 1;

export const angDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

function baseActor(extra) {
  return {
    shield: 0, shieldT: 0, buffs: [], slowT: 0, slowAmt: 0, stunT: 0, dash: null,
    facing: Math.PI / 2, swing: 0, hitFlash: 0, lastDamaged: -99, lastCombat: -99,
    dead: false, deadT: 0, moving: false, walk: 0, speedMul: 1, ...extra,
  };
}

export function makeHeroActor(char, x, y, kind = 'player', team = 1) {
  const st = computeStats(char);
  return baseActor({
    kind, team, name: char.name, classId: char.classId, level: char.level, spec: activeSpec(char), x, y, r: 15,
    stats: st, hp: st.maxHp, maxHp: st.maxHp, cds: { basic: 0, s0: 0, s1: 0, s2: 0 },
  });
}

export function makeMobActor(mobId, level, x, y, { elite = false } = {}) {
  const m = MOBS[mobId];
  const hp = Math.round((40 + level * 28) * m.hp * (elite ? 3 : 1));
  return baseActor({
    kind: 'mob', team: 2, mobId, name: (elite ? 'Elite: ' : '') + m.name, level, boss: !!m.boss, elite,
    x, y, r: m.size * (elite ? 1.3 : 1),
    stats: { power: (8 + level * 5) * m.atk * (elite ? 1.3 : 1), def: level * 3 * (m.def ?? 1), crit: 5, critMult: 1.5, maxHp: hp, moveSpeed: m.speed, atkSpeed: 1, lifesteal: 0 },
    hp, maxHp: hp, cds: { basic: 0.5, slam: 4 },
    home: { x, y }, ai: { state: 'idle', t: 0, tx: x, ty: y, target: null },
  });
}

export function makeSpiritActor(sp, owner) {
  return baseActor({
    kind: 'spirit', team: owner.team, owner: owner.id, spiritType: sp.type, rarity: sp.rarity, level: sp.level,
    name: SPIRITS[sp.type].name, untargetable: true, x: owner.x - 20, y: owner.y - 10, r: 8, hp: 1, maxHp: 1,
    stats: { power: spiritPower(sp), crit: 5, critMult: 1.5, lifesteal: 0, def: 0 },
    cds: { basic: 1, s0: 1.5 }, bob: 0,
  });
}

export class World {
  // visuals:false (servidor, simulador de balanceamento): nada de partículas/textos/efeitos é criado — só estado de jogo e eventos.
  constructor(zoneId, { seed, visuals = true } = {}) {
    this.visuals = visuals;
    this.zoneId = zoneId;
    this.zone = ZONES[zoneId];
    this.layout = buildLayout(zoneId);
    this.actors = [];
    this.projectiles = [];
    this.areas = [];
    this.telegraphs = [];
    this.drops = [];
    this.fx = [];
    this.particles = [];
    this.texts = [];
    this.events = [];
    this.time = 0;
    this.frozen = 0;
    this.respawnT = 0;
    this.bossT = 0;
    this.rng = makeRng(seed ?? (Date.now() & 0x7fffffff));
    this.vrng = makeRng(((seed ?? 1) ^ 0x5bd1e995) >>> 0); // RNG só dos efeitos visuais: nunca consome o sorteio do gameplay
  }

  add(a) { a.id = nextId++; if (a.kind === 'spirit') a.bob = (a.id % 7) * 1.3; this.actors.push(a); return a; }
  byId(id) { return this.actors.find((a) => a.id === id); }
  enemiesOf(a) { return this.actors.filter((o) => o.team !== a.team && !o.dead && !o.untargetable); }
  // Aliados vivos (heróis/rivais do mesmo time, sem o próprio ator nem spirits), opcionalmente dentro de um raio.
  alliesOf(a, maxR = Infinity) {
    return this.actors.filter((o) => o !== a && o.team === a.team && !o.dead && o.kind !== 'spirit' && o.kind !== 'mob' && Math.hypot(o.x - a.x, o.y - a.y) <= maxR);
  }
  nearestEnemy(a, maxR = Infinity) {
    let best = null, bd = maxR;
    for (const o of this.actors) {
      if (o.team === a.team || o.dead || o.untargetable) continue;
      const d = Math.hypot(o.x - a.x, o.y - a.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  buffVal(a, key) { let v = 0; for (const b of a.buffs) v += b[key] ?? 0; return v; }

  // ---------- população ----------
  populate(playerLevel) {
    if (!this.zone.mobs) return;
    for (let i = 0; i < this.zone.count; i++) this.spawnRandomMob(playerLevel);
  }

  freePoint(avoid = [], minDist = 0) {
    const z = this.zone;
    for (let i = 0; i < 60; i++) {
      const x = this.rng.range(120, z.w - 120), y = this.rng.range(120, z.h - 120);
      if (this.layout.obstacles.some((o) => (o.w ? x > o.x - 40 && x < o.x + o.w + 40 && y > o.y - 40 && y < o.y + o.h + 40 : Math.hypot(x - o.x, y - o.y) < o.r + 30))) continue;
      if ((z.portals ?? []).some((p) => Math.hypot(x - p.x, y - p.y) < 260 || Math.hypot(x - p.tx, y - p.ty) < 260)) continue;
      if (avoid.some((a) => Math.hypot(x - a.x, y - a.y) < minDist)) continue;
      return { x, y };
    }
    return null;
  }

  spawnRandomMob(playerLevel, avoid = []) {
    const z = this.zone;
    const pt = this.freePoint(avoid, 520);
    if (!pt) return null;
    const id = this.rng.weighted(z.mobs);
    const hi = z.scale ? Math.max(z.level[1], Math.min(30, playerLevel)) : z.level[1];
    // Mais forte quanto mais a leste.
    const lvl = Math.round(z.level[0] + (hi - z.level[0]) * (pt.x / z.w) + this.rng.range(-0.6, 0.6));
    return this.add(makeMobActor(id, Math.max(1, lvl), pt.x, pt.y, { elite: this.rng.chance(0.04) }));
  }

  updateSpawns(dt, player) {
    const z = this.zone;
    if (!z.mobs) return;
    const alive = this.actors.filter((a) => a.kind === 'mob' && !a.dead && !a.boss).length;
    this.respawnT -= dt;
    if (alive < z.count && this.respawnT <= 0) {
      this.spawnRandomMob(player.level, [player]);
      this.respawnT = 3;
    }
    if (z.boss && !this.actors.some((a) => a.boss && !a.dead)) {
      this.bossT -= dt;
      if (this.bossT <= 0) {
        this.add(makeMobActor(z.boss.id, z.boss.level, z.boss.x, z.boss.y));
        this.bossT = 90;
      }
    }
  }

  // ---------- loop ----------
  update(dt, intents = {}) {
    this.time += dt;
    if (this.frozen > 0) { this.frozen -= dt; this.updateVisuals(dt); return; }
    let prune = false;
    for (const a of this.actors) {
      if (a.dead) { a.deadT += dt; if (a.deadT > 0.6 && a.kind !== 'player') prune = true; continue; }
      this.tickTimers(a, dt);
      if (a.kind === 'spirit') { this.updateSpirit(a, dt); continue; }
      const intent = intents[a.id] ?? (a.kind === 'mob' ? mobIntent(a, this, dt) : a.kind === 'rival' ? rivalIntent(a, this, dt) : null);
      if (intent) this.applyIntent(a, intent, dt);
    }
    this.separate();
    this.updateProjectiles(dt);
    this.updateAreas(dt);
    this.updateTelegraphs(dt);
    if (prune) this.actors = this.actors.filter((a) => !(a.dead && a.deadT > 0.6 && a.kind !== 'player'));
    this.updateVisuals(dt);
    if (this.events.length > 2000) this.events.splice(0, this.events.length - 2000);
  }

  tickTimers(a, dt) {
    for (const k in a.cds) a.cds[k] = Math.max(0, a.cds[k] - dt);
    const bs = a.buffs; // compactação no lugar: sem alocar um array novo por ator por tick
    if (bs.length) { let w = 0; for (let i = 0; i < bs.length; i++) { const b = bs[i]; if ((b.t -= dt) > 0) bs[w++] = b; } bs.length = w; }
    if (a.shieldT > 0) { a.shieldT -= dt; if (a.shieldT <= 0) a.shield = 0; }
    a.slowT = Math.max(0, a.slowT - dt);
    a.stunT = Math.max(0, a.stunT - dt);
    a.hitFlash = Math.max(0, a.hitFlash - dt);
    a.swing = Math.max(0, a.swing - dt);
  }

  applyIntent(a, it, dt) {
    if (a.stunT > 0) { a.moving = false; return; }
    if (a.dash) { this.stepDash(a, dt); return; }
    if (it.aimX != null) a.facing = Math.atan2(it.aimY - a.y, it.aimX - a.x);
    let mx = it.mx ?? 0, my = it.my ?? 0;
    const len = Math.hypot(mx, my);
    if (len > 0.01) {
      mx /= len; my /= len;
      const sp = a.stats.moveSpeed * a.speedMul * (it.spd ?? 1) * (a.slowT > 0 ? 1 - a.slowAmt : 1);
      this.moveActor(a, mx * sp * dt, my * sp * dt);
      a.moving = true;
      a.walk += dt * sp / 28;
    } else a.moving = false;
    if (it.attack && a.cds.basic <= 0) this.basicAttack(a, it.aimX, it.aimY);
    if (it.cast != null) this.castSkill(a, it.cast, it.aimX, it.aimY);
  }

  // ---------- movimento / colisão ----------
  moveActor(a, dx, dy) { a.x += dx; a.y += dy; this.collide(a); }

  collide(a) {
    const z = this.zone;
    if (z.circle) {
      const cx = z.w / 2, cy = z.h / 2, R = z.radius - a.r;
      const d = Math.hypot(a.x - cx, a.y - cy);
      if (d > R) { a.x = cx + (a.x - cx) / d * R; a.y = cy + (a.y - cy) / d * R; }
    } else {
      a.x = Math.max(a.r, Math.min(z.w - a.r, a.x));
      a.y = Math.max(a.r, Math.min(z.h - a.r, a.y));
    }
    // grade espacial: só os obstáculos perto do ator (zonas têm centenas; a busca linear custava ~55% do servidor de exploração). Mesma ordem de resolução.
    for (const o of this.nearObstacles(a)) {
      if (o.w) {
        const cx = Math.max(o.x, Math.min(o.x + o.w, a.x)), cy = Math.max(o.y, Math.min(o.y + o.h, a.y));
        const dx = a.x - cx, dy = a.y - cy, d = Math.hypot(dx, dy);
        if (d < a.r) {
          if (d > 0.001) { a.x = cx + dx / d * a.r; a.y = cy + dy / d * a.r; }
          else a.y = o.y + o.h + a.r;
        }
      } else {
        const dx = a.x - o.x, dy = a.y - o.y, d = Math.hypot(dx, dy), min = o.r + a.r;
        if (d < min && d > 0.001) { a.x = o.x + dx / d * min; a.y = o.y + dy / d * min; }
      }
    }
  }

  nearObstacles(a) {
    const L = this.layout;
    const obs = L.obstacles;
    if (obs.length < 24) return obs;
    let g = L.grid;
    if (!g) { // constrói uma vez por layout (o layout é compartilhado entre mundos da mesma zona)
      const C = 128, cols = Math.ceil(this.zone.w / C) + 1, rows = Math.ceil(this.zone.h / C) + 1, cells = Array.from({ length: cols * rows }, () => []);
      obs.forEach((o, i) => {
        const x0 = o.w ? o.x : o.x - o.r, x1 = o.w ? o.x + o.w : o.x + o.r, y0 = o.w ? o.y : o.y - o.r, y1 = o.w ? o.y + o.h : o.y + o.r;
        for (let cy = Math.max(0, Math.floor(y0 / C)); cy <= Math.min(rows - 1, Math.floor(y1 / C)); cy++) for (let cx = Math.max(0, Math.floor(x0 / C)); cx <= Math.min(cols - 1, Math.floor(x1 / C)); cx++) cells[cy * cols + cx].push(i);
      });
      g = L.grid = { C, cols, rows, cells, out: [], seen: new Int32Array(obs.length), stamp: 0 };
    }
    const m = a.r * 2 + 2; // o ator pode ser empurrado até ~a.r por um obstáculo: consulta com folga
    const cx0 = Math.max(0, Math.floor((a.x - m) / g.C)), cx1 = Math.min(g.cols - 1, Math.floor((a.x + m) / g.C));
    const cy0 = Math.max(0, Math.floor((a.y - m) / g.C)), cy1 = Math.min(g.rows - 1, Math.floor((a.y + m) / g.C));
    const ids = (g.ids ??= []); ids.length = 0;
    const st = ++g.stamp;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) for (const i of g.cells[cy * g.cols + cx]) if (g.seen[i] !== st) { g.seen[i] = st; ids.push(i); }
    ids.sort((p, q) => p - q);
    const out = g.out; out.length = 0;
    for (const i of ids) out.push(obs[i]);
    return out;
  }

  separate() {
    const list = (this._sep ??= []);
    list.length = 0;
    for (const a of this.actors) if (!a.dead && a.kind !== 'spirit') list.push(a);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
        if (d < min && d > 0.001) {
          const push = (min - d) / 2, nx = dx / d, ny = dy / d;
          const wa = a.boss ? 0.1 : 1, wb = b.boss ? 0.1 : 1;
          a.x -= nx * push * wa; a.y -= ny * push * wa;
          b.x += nx * push * wb; b.y += ny * push * wb;
        }
      }
    }
  }

  // ---------- ataques ----------
  basicSpec(a) {
    if (a.kind !== 'mob') return CLASSES[a.classId].basic;
    const m = MOBS[a.mobId];
    return m.kind === 'ranged'
      ? { kind: 'projectile', speed: m.projSpeed, range: m.range + 60, cd: m.cd, mult: 1, color: m.projColor, radius: a.boss ? 10 : 6 }
      : { kind: 'melee', range: m.range, arc: 1.7, cd: m.cd, mult: 1, color: '#ffffff' };
  }

  basicAttack(a, ax, ay) {
    const b = this.basicSpec(a);
    a.cds.basic = b.cd / (a.stats.atkSpeed || 1);
    a.swing = 0.25;
    a.lastCombat = this.time;
    const ang = Math.atan2(ay - a.y, ax - a.x);
    a.facing = ang;
    this.events.push({ type: 'swing', actor: a, ang, t: this.time });
    if (b.kind === 'melee') {
      this.addFx({ type: 'slash', x: a.x, y: a.y, ang, arc: b.arc, r: b.range + (a.kind === 'mob' ? a.r * 0.5 : 0), t: 0, life: 0.2, color: b.color });
      for (const e of this.enemiesOf(a)) {
        const d = Math.hypot(e.x - a.x, e.y - a.y);
        if (d <= b.range + e.r + (a.kind === 'mob' ? a.r * 0.5 : 0) && Math.abs(angDiff(Math.atan2(e.y - a.y, e.x - a.x), ang)) <= b.arc / 2 + 0.25) {
          this.damage(a, e, b.mult);
        }
      }
    } else {
      this.spawnProjectile(a, ang, b);
    }
  }

  spawnProjectile(a, ang, spec) {
    this.projectiles.push({
      x: a.x + Math.cos(ang) * (a.r + 4), y: a.y + Math.sin(ang) * (a.r + 4),
      vx: Math.cos(ang) * spec.speed, vy: Math.sin(ang) * spec.speed, ang,
      team: a.team, src: a, mult: spec.mult, radius: spec.radius ?? 6, color: spec.color ?? '#fff',
      range: spec.range ?? 500, traveled: 0, pierce: !!spec.pierce, explode: spec.explode ?? 0,
      stun: spec.stun ?? 0, hit: new Set(), dead: false,
    });
  }

  castSkill(a, idx, ax, ay) {
    const key = 's' + idx;
    if (a.cds[key] > 0 || a.dash) return false;
    const id = CLASSES[a.classId].skills[idx];
    const s = skillOf(a.classId, a.spec, id); // com os ajustes da especialização
    a.cds[key] = s.cd;
    a.swing = 0.3;
    a.lastCombat = this.time;
    const ang = Math.atan2(ay - a.y, ax - a.x);
    const cos = Math.cos(ang), sin = Math.sin(ang);
    a.facing = ang;
    let castTarget = null; // ground_aoe: onde a área cai (o cliente desenha o efeito no mesmo ponto)
    switch (s.kind) {
      case 'aoe_self':
        this.addFx({ type: 'ring', x: a.x, y: a.y, r: s.radius, color: s.color, t: 0, life: 0.45 });
        for (const e of this.enemiesOf(a)) {
          if (Math.hypot(e.x - a.x, e.y - a.y) <= s.radius + e.r) this.damage(a, e, s.mult, { slow: s.slow, slowDur: s.slowDur });
        }
        if (s.heal) {
          this.heal(a, a.maxHp * s.heal);
          if (s.allyHeal) for (const al of this.alliesOf(a, s.radius)) this.heal(al, al.maxHp * s.heal * s.allyHeal);
        }
        this.burst(a.x, a.y, s.color, 22, 220);
        break;
      case 'dash':
        a.dash = { vx: cos * s.speed, vy: sin * s.speed, t: s.dist / s.speed, mult: s.mult, stun: s.stun, hit: new Set(), invuln: !!s.invuln, color: s.color };
        break;
      case 'buff':
        a.buffs.push({ id, t: s.dur, ...s.buff });
        if (s.buff.shieldPct) { a.shield = a.maxHp * s.buff.shieldPct; a.shieldT = s.dur; }
        this.events.push({ type: 'status', actor: a, kind: s.buff.shieldPct ? 'shield' : 'buff', dur: s.dur, skill: id, t: this.time });
        if (s.allyShield) {
          let best = null, bd = s.allyRange;
          for (const al of this.alliesOf(a, s.allyRange)) { const d = Math.hypot(al.x - a.x, al.y - a.y); if (d <= bd) { bd = d; best = al; } }
          if (best) {
            best.shield = Math.max(best.shield, best.maxHp * s.buff.shieldPct * s.allyShield); best.shieldT = s.dur;
            this.events.push({ type: 'status', actor: best, kind: 'shield', dur: s.dur, skill: id, from: a, t: this.time });
            this.addFx({ type: 'ring', x: best.x, y: best.y, r: 50, color: s.color, t: 0, life: 0.5, follow: best });
          }
        }
        this.addFx({ type: 'ring', x: a.x, y: a.y, r: 60, color: s.color, t: 0, life: 0.5, follow: a });
        this.burst(a.x, a.y, s.color, 16, 120);
        break;
      case 'projectile':
        this.spawnProjectile(a, ang, s);
        break;
      case 'ground_aoe': {
        const d = Math.min(s.range, Math.hypot(ax - a.x, ay - a.y));
        castTarget = { x: a.x + cos * d, y: a.y + sin * d };
        this.areas.push({ x: a.x + cos * d, y: a.y + sin * d, r: s.radius, ticks: s.ticks, interval: s.interval, next: 0.2, src: a, mult: s.mult, color: s.color, t: 0 });
        break;
      }
      case 'blink': {
        const d = Math.min(s.dist, Math.hypot(ax - a.x, ay - a.y));
        this.burst(a.x, a.y, s.color, 18, 160);
        a.x += cos * d; a.y += sin * d;
        this.collide(a);
        this.burst(a.x, a.y, s.color, 18, 160);
        break;
      }
    }
    this.events.push({ type: 'cast', actor: a, skill: id, t: this.time, ang, ...(castTarget ? { tx: castTarget.x, ty: castTarget.y } : {}) });
    return true;
  }

  stepDash(a, dt) {
    const d = a.dash;
    const step = Math.min(dt, d.t);
    this.moveActor(a, d.vx * step, d.vy * step);
    d.t -= dt;
    a.moving = true;
    if (d.mult > 0) {
      for (const e of this.enemiesOf(a)) {
        if (!d.hit.has(e.id) && Math.hypot(e.x - a.x, e.y - a.y) < a.r + e.r + 14) {
          d.hit.add(e.id);
          this.damage(a, e, d.mult, { stun: d.stun });
        }
      }
    }
    if (this.particles.length < 700) this.addParticle({ x: a.x, y: a.y, vx: 0, vy: 0, life: 0.3, max: 0.3, color: d.color, size: 7 });
    if (d.t <= 0) a.dash = null;
  }

  // ---------- dano / cura ----------
  damage(src, t, mult, opts = {}) {
    if (!t || t.dead || t.untargetable || t.dash?.invuln) return 0;
    // Duelos entre heróis ficam mais longos e táticos.
    if (t.kind === 'player' || t.kind === 'rival') {
      if (src.kind === 'player' || src.kind === 'rival' || src.kind === 'spirit') mult *= PVP_DAMAGE;
    }
    const res = computeHit(this.rng,
      { power: src.stats.power, crit: src.stats.crit, critMult: src.stats.critMult, dmgBonus: this.buffVal(src, 'dmg') },
      { def: t.stats.def, dr: this.buffVal(t, 'dr') }, mult);
    let amt = res.amount;
    if (t.shield > 0) { const ab = Math.min(t.shield, amt); t.shield -= ab; amt -= ab; }
    t.hp -= amt;
    t.hitFlash = 0.12;
    t.lastDamaged = this.time;
    t.lastCombat = this.time;
    src.lastCombat = this.time;
    if (src.stats.lifesteal > 0 && !src.dead) this.heal(src, res.amount * src.stats.lifesteal, true);
    if (opts.stun) t.stunT = Math.max(t.stunT, t.boss ? opts.stun * 0.3 : opts.stun);
    if (opts.slow) { t.slowT = opts.slowDur; t.slowAmt = t.boss ? opts.slow * 0.5 : opts.slow; }
    if (!t.boss) {
      const ang = Math.atan2(t.y - src.y, t.x - src.x);
      this.moveActor(t, Math.cos(ang) * 4, Math.sin(ang) * 4);
    }
    const hurtsPlayer = t.kind === 'player';
    this.events.push({ type: 'hit', src, target: t, amount: res.amount, absorbed: amt === 0, crit: res.crit, t: this.time });
    if (opts.stun) this.events.push({ type: 'status', actor: t, kind: 'stun', dur: t.stunT, t: this.time });
    if (opts.slow) this.events.push({ type: 'status', actor: t, kind: 'slow', dur: opts.slowDur, t: this.time });
    this.addText({
      x: t.x + this.vrng.range(-8, 8), y: t.y - t.r - 12, t: 0, life: 0.9,
      text: amt === 0 ? 'absorvido' : String(res.amount), size: res.crit ? 21 : 15,
      color: amt === 0 ? '#ffe9a0' : hurtsPlayer ? '#ff6b6b' : res.crit ? '#ffd166' : '#ffffff',
    });
    this.burst(t.x, t.y, hurtsPlayer ? '#ff8080' : '#ffffff', res.crit ? 10 : 5, 140);

    const killer = src.kind === 'spirit' ? this.byId(src.owner) ?? src : src;
    if (t.ai && killer && !killer.dead) { t.ai.target = killer.id; if (t.ai.state !== 'return') t.ai.state = 'chase'; }
    if (t.hp <= 0) {
      t.hp = 0;
      t.dead = true;
      t.deadT = 0;
      t.dash = null;
      this.burst(t.x, t.y, t.kind === 'mob' ? MOBS[t.mobId].color : '#ffffff', 26, 220);
      this.events.push({ type: 'death', actor: t, killer });
    }
    return res.amount;
  }

  heal(a, amount, quiet = false) {
    const before = a.hp;
    a.hp = Math.min(a.maxHp, a.hp + amount);
    const got = Math.round(a.hp - before);
    if (got >= 1) this.events.push({ type: 'heal', actor: a, amount: got, t: this.time });
    if (!quiet && got >= 1) this.addText({ x: a.x, y: a.y - a.r - 14, t: 0, life: 0.9, text: '+' + got, size: 15, color: '#7dff9b' });
    return got;
  }

  // ---------- projéteis / áreas ----------
  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.traveled += Math.hypot(p.vx, p.vy) * dt;
      if (this.visuals && this.particles.length < 700 && this.vrng.next() < 0.7) {
        this.addParticle({ x: p.x, y: p.y, vx: (this.vrng.next() - 0.5) * 30, vy: (this.vrng.next() - 0.5) * 30, life: 0.25, max: 0.25, color: p.color, size: p.radius * 0.7 });
      }
      let done = p.traveled >= p.range;
      for (const e of this.actors) {
        if (done || e.dead || e.untargetable || e.team === p.team || p.hit.has(e.id)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.radius) {
          p.hit.add(e.id);
          if (p.explode) { done = true; break; }
          this.damage(p.src, e, p.mult, { stun: p.stun });
          if (!p.pierce) done = true;
        }
      }
      if (!done && !p.pierce) {
        for (const o of this.layout.obstacles) {
          if (o.block && Math.hypot(o.x - p.x, o.y - p.y) < o.r + p.radius * 0.5) { done = true; break; }
        }
      }
      if (done) {
        p.dead = true;
        if (p.explode) this.explode(p);
        else this.burst(p.x, p.y, p.color, 5, 90);
      }
    }
    if (this.projectiles.some((p) => p.dead)) this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  explode(p) {
    this.addFx({ type: 'ring', x: p.x, y: p.y, r: p.explode, color: p.color, t: 0, life: 0.35 });
    this.burst(p.x, p.y, p.color, 24, 240);
    for (const e of this.actors) {
      if (e.dead || e.untargetable || e.team === p.team) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) <= p.explode + e.r) this.damage(p.src, e, p.mult);
    }
  }

  updateAreas(dt) {
    for (const ar of this.areas) {
      ar.t += dt;
      ar.next -= dt;
      if (ar.next <= 0 && ar.ticks > 0) {
        ar.ticks--;
        ar.next = ar.interval;
        for (const e of this.actors) {
          if (e.dead || e.untargetable || e.team === ar.src.team) continue;
          if (Math.hypot(e.x - ar.x, e.y - ar.y) <= ar.r + e.r) this.damage(ar.src, e, ar.mult);
        }
        for (let i = 0; this.visuals && i < 8; i++) {
          const ang = this.vrng.next() * TAU, d = this.vrng.next() * ar.r;
          this.addParticle({ x: ar.x + Math.cos(ang) * d, y: ar.y + Math.sin(ang) * d - 30, vx: 0, vy: 260, life: 0.15, max: 0.15, color: ar.color, size: 3, streak: true });
        }
      }
    }
    if (this.areas.length) this.areas = this.areas.filter((ar) => ar.ticks > 0 || ar.next > -0.3);
  }

  updateTelegraphs(dt) {
    for (const tg of this.telegraphs) {
      tg.t += dt;
      if (tg.t >= tg.delay && !tg.done) {
        tg.done = true;
        if (!tg.src.dead) {
          this.addFx({ type: 'ring', x: tg.x, y: tg.y, r: tg.r, color: tg.color, t: 0, life: 0.4 });
          this.burst(tg.x, tg.y, tg.color, 30, 260);
          for (const e of this.enemiesOf(tg.src)) {
            if (Math.hypot(e.x - tg.x, e.y - tg.y) <= tg.r + e.r) this.damage(tg.src, e, tg.mult, { stun: 0.5 });
          }
        }
      }
    }
    if (this.telegraphs.length) this.telegraphs = this.telegraphs.filter((tg) => !tg.done);
  }

  // ---------- spirits ----------
  updateSpirit(s, dt) {
    const o = this.byId(s.owner);
    if (!o || o.dead) { s.hidden = true; return; }
    s.hidden = false;
    s.bob += dt;
    const side = s.team === 1 ? -1 : 1;
    const tx = o.x - Math.cos(o.facing) * 26 + Math.cos(o.facing + Math.PI / 2) * 20 * side;
    const ty = o.y - Math.sin(o.facing) * 26 + Math.sin(o.facing + Math.PI / 2) * 20 * side - 14;
    const k = Math.min(1, dt * 6);
    s.x += (tx - s.x) * k;
    s.y += (ty - s.y) * k;
    const color = SPIRITS[s.spiritType].color;
    const shoot = (mult, cd, range = 380) => {
      const e = this.nearestEnemy(s, range);
      if (!e || o.lastCombat < this.time - 6) return;
      this.spawnProjectile(s, Math.atan2(e.y - s.y, e.x - s.x), { speed: 460, mult, radius: 5, color, range: range + 40 });
      s.cds.s0 = cd;
    };
    switch (s.spiritType) {
      case 'ember':
        if (s.cds.s0 <= 0) shoot(1, 1.2);
        break;
      case 'undine':
        if (s.cds.basic <= 0 && o.hp < o.maxHp) {
          this.heal(o, s.stats.power * 1.6);
          this.addFx({ type: 'ring', x: o.x, y: o.y, r: 40, color, t: 0, life: 0.4, follow: o });
          s.cds.basic = 4;
        }
        if (s.cds.s0 <= 0) shoot(0.5, 2);
        break;
      case 'terra':
        if (s.cds.basic <= 0 && o.lastDamaged > this.time - 2) {
          o.shield = Math.min(o.maxHp * 0.3, o.shield + s.stats.power * 3);
          o.shieldT = 6;
          this.addFx({ type: 'ring', x: o.x, y: o.y, r: 34, color, t: 0, life: 0.4, follow: o });
          s.cds.basic = 9;
        }
        if (s.cds.s0 <= 0) {
          const near = this.enemiesOf(s).filter((e) => Math.hypot(e.x - o.x, e.y - o.y) < 95 + e.r);
          if (near.length) {
            this.addFx({ type: 'ring', x: o.x, y: o.y, r: 95, color, t: 0, life: 0.35 });
            for (const e of near) this.damage(s, e, 1);
            s.cds.s0 = 3;
          }
        }
        break;
      case 'zephyr':
        if (s.cds.s0 <= 0) shoot(0.45, 0.55, 340);
        break;
    }
  }

  // ---------- visuais (sem efeito na lógica) ----------
  addFx(f) { if (this.visuals) this.fx.push(f); }
  addText(t) { if (this.visuals) this.texts.push(t); }
  addParticle(p) { if (this.visuals) this.particles.push(p); }
  burst(x, y, color, n, speed) {
    for (let i = 0; this.visuals && i < n && this.particles.length < 800; i++) {
      const ang = this.vrng.next() * TAU, sp = speed * (0.3 + this.vrng.next() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0.45, max: 0.45, color, size: 2 + this.vrng.next() * 3 });
    }
  }

  updateVisuals(dt) {
    if (!this.visuals && !this.drops.length) return; // servidor: nada de efeitos para atualizar
    for (const f of this.fx) { f.t += dt; if (f.follow) { f.x = f.follow.x; f.y = f.follow.y; } }
    this.fx = this.fx.filter((f) => f.t < f.life);
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (!p.streak) { p.vx *= 0.9; p.vy *= 0.9; }
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) { t.t += dt; t.y -= 38 * dt; }
    this.texts = this.texts.filter((t) => t.t < t.life);
    for (const d of this.drops) {
      d.t += dt;
      if (d.t < 0.35) { d.x += d.vx * dt; d.y += d.vy * dt; }
    }
  }
}
