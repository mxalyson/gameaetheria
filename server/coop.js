// Sala COOPERATIVA (PvE autoritativo): 1–4 jogadores contra ondas de monstros e um chefe, com a MESMA simulação do jogo.
// Aqui o servidor decide tudo: spawn, dano, morte, XP, ouro e LOOT (o cliente nunca informa recompensa). Mesma interface da MatchRoom
// (o Hub trata as duas igual). Recompensas gravadas numa transação idempotente por personagem.
import { randomBytes } from 'node:crypto';
import { World, makeHeroActor, makeMobActor } from '../public/src/game/sim.js';
import { makeRng } from '../public/src/core/rng.js';
import { mobXp } from '../public/src/core/progression.js';
import { rollMobLoot } from '../public/src/core/loot.js';
import { applyCoopResult } from '../public/src/core/rewards.js';
import { coopRewardPlan } from '../public/src/core/economy.js';
import { NORMAL_MOBS, BOSS_MOBS } from '../public/src/data/mobs.js';
import { TICK_DT, SNAPSHOT_EVERY, PROTOCOL_VERSION } from '../public/src/core/protocol.js';
import { wire } from './wire.js';

export const COOP_WAVES = 5;   // a 5ª onda traz o chefe
const FIRST_REST = 3, REST = 4, RESULT_SHOW = 6;
const r1 = (n) => Math.round(n * 10) / 10;
const idle = () => ({ mx: 0, my: 0, aimX: 0, aimY: 0, attack: false, cast: null });

export class CoopRoom {
  // entries: [{ session, doc, charId, accountId }]
  constructor({ id, entries, seed, db = null, reconnectSec = 30, send }) {
    Object.assign(this, { id, mode: 'coop', db, reconnectSec, send });
    this.matchId = randomBytes(9).toString('base64url');
    this.rng = makeRng(seed);
    this.world = new World('waves', { seed, visuals: false });
    this.state = 'countdown'; this.countdown = 3; this.resultT = 0; this.winner = 0; this.reason = null; this.closed = false;
    this.clock = 0; this.tick = 0; this.events = [];
    this.wave = { n: 0, state: 'rest', t: FIRST_REST, total: COOP_WAVES };
    this.pool = { xp: 0, gold: 0, bossDown: false, wavesCleared: 0 };
    this.players = new Map();
    const n = entries.length;
    entries.forEach((e, i) => {
      const x = 550 + (i - (n - 1) / 2) * 70, y = 560;
      const actor = this.world.add(makeHeroActor(e.doc, x, y, 'player', 1));
      actor.facing = -Math.PI / 2;
      const p = { actor, team: 1, session: e.session, bot: false, left: false, charId: e.charId ?? null, accountId: e.accountId ?? null, doc: e.doc,
        rating: 1000, name: e.doc.name, classId: e.doc.classId, lastSeq: -1, input: idle(), dropT: null, slot: 1 };
      this.players.set(actor.id, p);
      e.session.room = this; e.session.player = p;
    });
    this.avgLevel = Math.max(1, Math.round(entries.reduce((s, e) => s + e.doc.level, 0) / n));
  }

  humans() { return [...this.players.values()].filter((p) => !p.left && p.session); }
  mobs() { return this.world.actors.filter((a) => a.kind === 'mob'); }

  input(session, m) {
    const p = session.player;
    if (!p || p.left || this.state === 'over') return;
    if (m.seq <= p.lastSeq) { this.send.stats.staleInputs++; return; }
    p.lastSeq = m.seq;
    p.input = { mx: m.mx, my: m.my, aimX: m.aimX, aimY: m.aimY, attack: m.attack, cast: m.cast ?? p.input.cast };
  }
  dropped(session) { const p = session.player; if (p && !p.left) { p.dropT = this.clock; p.input = idle(); } }
  resumed(session) { const p = session.player; if (p && !p.left) p.dropT = null; }

  // ---- ondas ----
  spawnWave(n) {
    const w = this.world, humans = this.alive();
    this.wave.state = 'fight'; this.wave.n = n;
    const lvl = Math.min(30, this.avgLevel + Math.floor((n - 1) / 3));
    const crew = this.players.size, hpMul = 1 + 0.4 * (crew - 1);
    const spawn = (id, opts = {}, bonus = 0) => {
      const ang = this.rng.next() * Math.PI * 2;
      const m = w.add(makeMobActor(id, Math.min(30, lvl + bonus), 550 + Math.cos(ang) * 430, 550 + Math.sin(ang) * 430, opts));
      m.hp = m.maxHp = Math.round(m.maxHp * hpMul);
      const t = humans[this.rng.int(0, humans.length - 1)];
      m.ai.target = t?.actor.id ?? null; m.ai.state = 'chase';
      return m;
    };
    const count = Math.min(14, 2 + n + 2 * (crew - 1));
    if (n === COOP_WAVES) { spawn(BOSS_MOBS[this.rng.int(0, BOSS_MOBS.length - 1)], {}, 2); }
    for (let i = 0; i < (n === COOP_WAVES ? Math.ceil(count / 2) : count); i++) spawn(NORMAL_MOBS[this.rng.int(0, NORMAL_MOBS.length - 1)], { elite: n === 3 && i === 0 });
    for (const p of this.players.values()) if (!p.left && p.actor.dead) this.revive(p);
    this.events.push({ e: 'wave', n, boss: n === COOP_WAVES });
  }
  revive(p) { const a = p.actor; a.dead = false; a.deadT = 0; a.hp = Math.round(a.maxHp * 0.5); a.stunT = 0; a.buffs = []; this.events.push({ e: 'revive', actor: a.id }); }
  alive() { return [...this.players.values()].filter((p) => !p.left && !p.actor.dead); }

  // ---- simulação ----
  step() {
    this.tick++; this.clock += TICK_DT;
    for (const p of this.players.values()) {
      if (!p.left && p.session && !p.session.ws && p.dropT != null && this.clock - p.dropT > this.reconnectSec) this.leave(p);
    }
    const intents = {};
    for (const p of this.players.values()) {
      if (p.left) continue;
      const i = p.input;
      if (this.state === 'fight') { intents[p.actor.id] = { ...i }; i.cast = null; } else intents[p.actor.id] = { mx: 0, my: 0 };
    }
    if (this.state === 'countdown') { this.countdown -= TICK_DT; if (this.countdown <= 0) { this.state = 'fight'; this.events.push({ e: 'fight' }); } }
    // monstros sem alvo vivo escolhem o jogador vivo mais próximo
    const humans = this.alive();
    for (const m of this.mobs()) {
      if (m.dead || (m.ai.target != null && !this.world.byId(m.ai.target)?.dead)) continue;
      let best = null, bd = Infinity;
      for (const p of humans) { const d = Math.hypot(p.actor.x - m.x, p.actor.y - m.y); if (d < bd) { bd = d; best = p; } }
      m.ai.target = best?.actor.id ?? null; m.ai.state = 'chase';
    }
    this.world.update(TICK_DT, intents);
    for (const ev of this.world.events.splice(0)) {
      if (ev.type === 'death' && ev.actor.kind === 'mob') { this.pool.xp += mobXp(ev.actor.level, this.avgLevel); if (ev.actor.boss) this.pool.bossDown = true; }
      const w = wire(ev); if (w) this.events.push(w);
    }
    if (this.state === 'fight') this.judge();
    else if (this.state === 'over') { this.resultT -= TICK_DT; if (this.resultT <= 0) { this.broadcast(); this.closed = true; } }
    if (this.tick % SNAPSHOT_EVERY === 0) this.broadcast();
  }

  judge() {
    const W = this.wave;
    if (!this.alive().length) return this.end('defeat', 'wipe');
    if (W.state === 'rest') {
      W.t -= TICK_DT;
      if (W.t <= 0) this.spawnWave(W.n + 1);
    } else if (!this.mobs().some((m) => !m.dead)) {
      this.pool.gold += 15 + W.n * this.avgLevel * 2; this.pool.wavesCleared = W.n;
      this.events.push({ e: 'wave_clear', n: W.n });
      if (W.n >= COOP_WAVES) return this.end('victory', 'boss');
      W.state = 'rest'; W.t = REST;
      for (const p of this.alive()) this.world.heal(p.actor, p.actor.maxHp * 0.2);
    }
  }

  leave(p) { p.left = true; this.world.actors = this.world.actors.filter((a) => a !== p.actor); if (p.session) { p.session.room = null; p.session.player = null; } this.events.push({ e: 'left', actor: p.actor.id }); }

  // ---- fim e recompensas (servidor decide; transação idempotente por personagem) ----
  end(result, reason) {
    if (this.state === 'over') return;
    this.state = 'over'; this.resultT = RESULT_SHOW; this.winner = result === 'victory' ? 1 : 0; this.reason = reason;
    this.events.push({ e: 'result', winner: this.winner, reason });
    if (!this.db) return;
    const crew = this.players.size, victory = result === 'victory';
    for (const p of this.players.values()) {
      if (p.left || !p.charId) continue;
      // valores pela regra de economia (core/economy.js): tetos de XP por nível, ouro das ondas e bônus de chefe
      const plan = coopRewardPlan({ level: this.avgLevel, crew, wavesCleared: this.pool.wavesCleared, bossDown: this.pool.bossDown, poolXp: this.pool.xp, victory });
      const xp = plan.xp, items = [], potions = plan.potions;
      if (this.pool.bossDown) {
        const rng = makeRng(this.rng.int(1, 0x3fffffff));
        for (const d of rollMobLoot(rng, { level: Math.min(30, this.avgLevel + 2), boss: true }, p.classId)) {
          if (d.kind === 'item') items.push({ ...d.item, id: 'i' + randomBytes(9).toString('base64url') });
        }
      }
      try {
        const out = this.db.applyOperation(`coop:${this.matchId}:${p.charId}`, p.charId, 'coop', (doc) => applyCoopResult(doc, { gold: plan.gold, xp, items, potions, victory }));
        if (!out.duplicate) {
          this.db.audit('coop_reward', { accountId: p.accountId, detail: JSON.stringify({ match: this.matchId, char: p.charId, victory, waves: this.pool.wavesCleared, ...out.summary }) });
          if (p.session?.ws && p.session.player === p) this.send.to(p.session, { t: 'reward', ...out.summary, won: victory, result, waves: this.pool.wavesCleared });
          if (p.session) p.session.char = out.doc;
        }
      } catch (e) { this.db.audit('coop_reward_error', { accountId: p.accountId, detail: e.message }); }
    }
  }

  // ---- snapshots ----
  snapshotJson() {
    const actors = [...this.players.values()].filter((p) => !p.left).map((p) => {
      const a = p.actor;
      return { id: a.id, team: 1, name: p.name, classId: p.classId, level: a.level, x: r1(a.x), y: r1(a.y), hp: Math.round(a.hp), maxHp: a.maxHp, dead: a.dead,
        facing: Math.round(a.facing * 100) / 100, spd: Math.round(a.stats.moveSpeed * a.speedMul * (a.slowT > 0 ? 1 - a.slowAmt : 1)), moving: a.moving, swing: a.swing > 0,
        stun: a.stunT > 0, shield: Math.round(a.shield), online: !!p.session?.ws, bot: false,
        cds: { basic: r1(a.cds.basic), s0: r1(a.cds.s0), s1: r1(a.cds.s1), s2: r1(a.cds.s2) } };
    });
    const mobs = this.mobs().filter((m) => !m.dead || m.deadT < 0.6).map((m) => ({ id: m.id, mob: m.mobId, level: m.level, boss: !!m.boss, elite: !!m.elite, x: r1(m.x), y: r1(m.y), hp: Math.round(m.hp), maxHp: m.maxHp, dead: m.dead,
      facing: Math.round(m.facing * 100) / 100, moving: m.moving, swing: m.swing > 0 }));
    const ev = this.events; this.events = [];
    return JSON.stringify({ v: PROTOCOL_VERSION, t: 'snap', room: this.id, mode: 'coop', tick: this.tick, state: this.state, countdown: r1(Math.max(0, this.countdown)),
      winner: this.winner, reason: this.reason, coop: { wave: this.wave.n, total: COOP_WAVES, rest: this.wave.state === 'rest' ? r1(Math.max(0, this.wave.t)) : 0, mobs: mobs.filter((m) => !m.dead).length, gold: this.pool.gold },
      actors, mobs, events: ev });
  }
  broadcast() {
    const head = this.snapshotJson().slice(0, -1);
    this.bytes = head.length;
    for (const p of this.humans()) if (p.session.ws && p.session.player === p) this.send.raw(p.session, head + `,"ack":${p.lastSeq}}`);
  }
}
