// Sala de partida autoritativa (1×1, 2×2 ou 4×4): roda a MESMA simulação do jogo, com ponto de controle (core/match.js), bots que
// preenchem vagas ou assumem quem abandonou, e recompensas gravadas pelo servidor. Sem rede aqui: o Hub entrega as mensagens.
import { randomBytes } from 'node:crypto';
import { World, makeHeroActor } from '../public/src/game/sim.js';
import { MODES, newMatch, controlTick, matchWinner, spawnSlots } from '../public/src/core/match.js';
import { applyMatchResult } from '../public/src/core/rewards.js';
import { TICK_DT, SNAPSHOT_EVERY, PROTOCOL_VERSION } from '../public/src/core/protocol.js';
import { wire } from './wire.js';

export const COUNTDOWN = 3;   // s
export const RESULT_SHOW = 5; // s com o resultado na tela antes de fechar a sala
const r1 = (n) => Math.round(n * 10) / 10;
const idle = () => ({ mx: 0, my: 0, aimX: 0, aimY: 0, attack: false, cast: null });

export class MatchRoom {
  // entries: [{ team: 1|2, session|null, bot: bool, doc, charId, accountId, rating }]
  constructor({ id, mode, entries, seed, db = null, reconnectSec = 30, send }) {
    Object.assign(this, { id, mode, db, reconnectSec, send, size: MODES[mode].size });
    this.matchId = randomBytes(9).toString('base64url');
    this.world = new World('arena_team', { seed, visuals: false });
    const z = this.world.zone;
    this.world.objective = { ...z.objective, owner: 0, contested: false };
    this.match = newMatch(mode);
    this.state = 'countdown'; this.countdown = COUNTDOWN; this.resultT = 0; this.winner = 0; this.reason = null;
    this.clock = 0; this.tick = 0; this.events = []; this.closed = false;
    this.players = new Map(); // actorId -> jogador da sala
    const next = { 1: 0, 2: 0 };
    const slots = { 1: spawnSlots(1, this.size, z.w / 2, z.spawns.south, z.spawns.north), 2: spawnSlots(2, this.size, z.w / 2, z.spawns.south, z.spawns.north) };
    for (const e of entries) {
      const sp = slots[e.team][next[e.team]++];
      const actor = this.world.add(makeHeroActor(e.doc, sp.x, sp.y, e.bot ? 'rival' : 'player', e.team));
      actor.facing = e.team === 1 ? -Math.PI / 2 : Math.PI / 2;
      const p = { actor, team: e.team, session: e.session ?? null, bot: !!e.bot, left: false, charId: e.charId ?? null, accountId: e.accountId ?? null,
        rating: e.rating ?? 1000, doc: e.doc, name: e.doc.name, classId: e.doc.classId, lastSeq: -1, input: idle(), dropT: null, slot: e.team };
      this.players.set(actor.id, p);
      if (e.session) { e.session.room = this; e.session.player = p; }
    }
  }

  humans() { return [...this.players.values()].filter((p) => !p.bot && p.session); }
  teamOf(team) { return [...this.players.values()].filter((p) => p.team === team); }

  // ---- entrada do jogador ----
  input(session, m) {
    const p = session.player;
    if (!p || p.bot || this.state === 'over') return;
    if (m.seq <= p.lastSeq) { this.send.stats.staleInputs++; return; } // replay / fora de ordem
    p.lastSeq = m.seq;
    p.input = { mx: m.mx, my: m.my, aimX: m.aimX, aimY: m.aimY, attack: m.attack, cast: m.cast ?? p.input.cast }; // "cast" é um clique: espera o próximo tick
  }
  dropped(session) { const p = session.player; if (p && !p.bot) { p.dropT = this.clock; p.input = idle(); } }
  resumed(session) { const p = session.player; if (p && !p.bot) p.dropT = null; }

  // ---- simulação ----
  step() {
    this.tick++; this.clock += TICK_DT;
    // quem ficou desconectado além do prazo é substituído por um bot (e conta como derrota por abandono)
    for (const p of this.players.values()) {
      if (!p.bot && p.session && !p.session.ws && p.dropT != null && this.clock - p.dropT > this.reconnectSec) {
        if (this.state === 'countdown') return this.abort('aborted'); // saiu antes da largada: ninguém é punido nem premiado
        this.takeover(p);
      }
    }
    const intents = {};
    for (const p of this.players.values()) {
      if (p.bot) continue; // bots usam a IA do mundo
      const i = p.input;
      if (this.state === 'fight') { intents[p.actor.id] = { ...i }; i.cast = null; } else intents[p.actor.id] = { mx: 0, my: 0 };
    }
    if (this.state === 'countdown') {
      for (const p of this.players.values()) if (p.bot) intents[p.actor.id] = { mx: 0, my: 0 }; // bots também esperam a largada
      this.countdown -= TICK_DT;
      if (this.countdown <= 0) { this.state = 'fight'; this.events.push({ e: 'fight' }); }
    }
    this.world.update(TICK_DT, intents);
    for (const ev of this.world.events.splice(0)) { const w = wire(ev); if (w) this.events.push(w); }
    if (this.state === 'fight') this.judge();
    else if (this.state === 'over') { this.resultT -= TICK_DT; if (this.resultT <= 0) { this.broadcast(); this.closed = true; } }
    if (this.tick % SNAPSHOT_EVERY === 0) this.broadcast();
  }

  abort(reason) {
    this.state = 'over'; this.winner = 0; this.reason = reason; this.closed = true;
  }

  takeover(p) {
    p.bot = true; p.left = true; p.actor.kind = 'rival'; // a IA assume o personagem
    if (p.session) { p.session.room = null; p.session.player = null; }
    this.events.push({ e: 'left', actor: p.actor.id });
  }

  judge() {
    const ob = this.world.objective, all = [...this.players.values()];
    const inside = (a) => !a.dead && Math.hypot(a.x - ob.x, a.y - ob.y) < ob.r + a.r;
    const t1 = all.filter((p) => p.team === 1).map((p) => p.actor), t2 = all.filter((p) => p.team === 2).map((p) => p.actor);
    const in1 = t1.filter(inside).length, in2 = t2.filter(inside).length;
    controlTick(this.match, TICK_DT, in1, in2);
    ob.owner = this.match.owner; ob.contested = in1 > 0 && in2 > 0;
    const a1 = t1.filter((a) => !a.dead), a2 = t2.filter((a) => !a.dead);
    const w = matchWinner(this.match, a1.length, a2.length, a1.reduce((s, a) => s + a.hp, 0), a2.reduce((s, a) => s + a.hp, 0));
    if (w) this.end(w, w === 3 ? 'draw' : a1.length === 0 || a2.length === 0 ? 'elimination' : this.match.time >= this.match.limit ? 'time' : 'score');
  }

  // ---- fim e recompensas ----
  end(winner, reason) {
    if (this.state === 'over') return; // nunca paga duas vezes
    this.state = 'over'; this.resultT = RESULT_SHOW; this.winner = winner; this.reason = reason;
    this.events.push({ e: 'result', winner, reason });
    if (!this.db) return;
    const teamRating = (team) => { const t = this.teamOf(team); return t.length ? Math.round(t.reduce((s, p) => s + p.rating, 0) / t.length) : 1000; };
    const foe = { 1: teamRating(2), 2: teamRating(1) }; // ratings de ANTES: o pagamento não depende da ordem
    for (const p of this.players.values()) {
      if (!p.charId || (p.bot && !p.left)) continue;
      const result = p.left ? 'loss' : winner === 3 ? 'draw' : winner === p.team ? 'win' : 'loss';
      try {
        const out = this.db.applyOperation(`match:${this.matchId}:${p.charId}`, p.charId, this.mode, (doc) => applyMatchResult(doc, { mode: this.mode, result, foeRating: foe[p.team] }));
        if (!out.duplicate) {
          this.db.audit('match_reward', { accountId: p.accountId, detail: JSON.stringify({ match: this.matchId, mode: this.mode, char: p.charId, ...out.summary }) });
          if (p.session?.ws && p.session.player === p) this.send.to(p.session, { t: 'reward', ...out.summary });
          if (p.session) p.session.char = out.doc; // o lobby passa a usar o personagem atualizado
        }
      } catch (e) { this.db.audit('match_reward_error', { accountId: p.accountId, detail: e.message }); }
    }
  }

  // ---- snapshots ----
  snapshotJson() {
    const m = this.match;
    const actors = [...this.players.values()].map((p) => {
      const a = p.actor;
      return { id: a.id, team: p.team, name: p.name, classId: p.classId, x: r1(a.x), y: r1(a.y), hp: Math.round(a.hp), maxHp: a.maxHp, dead: a.dead,
        facing: Math.round(a.facing * 100) / 100, spd: Math.round(a.stats.moveSpeed * a.speedMul * (a.slowT > 0 ? 1 - a.slowAmt : 1)), moving: a.moving, swing: a.swing > 0,
        stun: a.stunT > 0, shield: Math.round(a.shield), online: p.bot || !!p.session?.ws, bot: p.bot,
        cds: { basic: r1(a.cds.basic), s0: r1(a.cds.s0), s1: r1(a.cds.s1), s2: r1(a.cds.s2) } };
    });
    const ev = this.events; this.events = [];
    return JSON.stringify({ v: PROTOCOL_VERSION, t: 'snap', room: this.id, mode: this.mode, tick: this.tick, state: this.state, countdown: r1(Math.max(0, this.countdown)),
      winner: this.winner, reason: this.reason, match: { score: { 1: Math.floor(m.score[1]), 2: Math.floor(m.score[2]) }, owner: m.owner, left: Math.max(0, Math.ceil(m.limit - m.time)) },
      actors, events: ev });
  }
  broadcast() {
    const head = this.snapshotJson().slice(0, -1);
    this.bytes = head.length;
    for (const p of this.humans()) if (p.session.ws && p.session.player === p) this.send.raw(p.session, head + `,"ack":${p.lastSeq}}`);
  }
}
