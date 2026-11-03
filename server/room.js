// Sala de partida autoritativa (1×1, 2×2 ou 4×4): roda a MESMA simulação do jogo, com ponto de controle (core/match.js), bots que
// preenchem vagas ou assumem quem abandonou, e recompensas gravadas pelo servidor. Sem rede aqui: o Hub entrega as mensagens.
import { randomBytes } from 'node:crypto';
import { World, makeHeroActor } from '../public/src/game/sim.js';
import { MODES, newMatch, controlTick, matchWinner, spawnSlots } from '../public/src/core/match.js';
import { applyMatchResult } from '../public/src/core/rewards.js';
import { TICK_DT, SNAPSHOT_EVERY, PROTOCOL_VERSION } from '../public/src/core/protocol.js';
import { wire } from './wire.js';
import { recordServerEvent } from './tx.js';
import { DeltaEncoder, actorTuple } from './snapshot.js';

export const COUNTDOWN = 3;   // s
export const RESULT_SHOW = 5; // s com o resultado na tela antes de fechar a sala
const r1 = (n) => Math.round(n * 10) / 10;
const idle = () => ({ mx: 0, my: 0, aimX: 0, aimY: 0, attack: false, cast: null });

export class MatchRoom {
  // entries: [{ team: 1|2, session|null, bot: bool, doc, charId, accountId, rating }]
  constructor({ id, mode, entries, seed, db = null, reconnectSec = 30, send, friendly = false }) {
    Object.assign(this, { id, mode, friendly: !!friendly, db, reconnectSec, send, size: MODES[mode].size });
    this.matchId = randomBytes(9).toString('base64url');
    this.world = new World('arena_team', { seed, visuals: false });
    const z = this.world.zone;
    this.world.objective = { ...z.objective, owner: 0, contested: false };
    this.match = newMatch(mode);
    this.state = 'countdown'; this.countdown = COUNTDOWN; this.resultT = 0; this.winner = 0; this.reason = null;
    this.clock = 0; this.tick = 0; this.events = []; this.closed = false; this.enc = new DeltaEncoder();
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
    const ob = this.world.objective;
    let in1 = 0, in2 = 0, n1 = 0, n2 = 0, hp1 = 0, hp2 = 0; // contagem direta: sem arrays temporários por tick
    for (const p of this.players.values()) {
      const a = p.actor;
      if (a.dead) continue;
      const inside = Math.hypot(a.x - ob.x, a.y - ob.y) < ob.r + a.r;
      if (p.team === 1) { n1++; hp1 += a.hp; if (inside) in1++; } else { n2++; hp2 += a.hp; if (inside) in2++; }
    }
    controlTick(this.match, TICK_DT, in1, in2);
    ob.owner = this.match.owner; ob.contested = in1 > 0 && in2 > 0;
    const w = matchWinner(this.match, n1, n2, hp1, hp2);
    if (w) this.end(w, w === 3 ? 'draw' : n1 === 0 || n2 === 0 ? 'elimination' : this.match.time >= this.match.limit ? 'time' : 'score');
  }

  // ---- fim e recompensas ----
  end(winner, reason) {
    if (this.state === 'over') return; // nunca paga duas vezes
    this.state = 'over'; this.resultT = RESULT_SHOW; this.winner = winner; this.reason = reason;
    this.events.push({ e: 'result', winner, reason });
    if (this.friendly) return this.friendlyWins(winner); // amistoso: nada de Elo, ouro, XP nem auditoria de recompensa; só a vitória conta para a missão `porto_duelo`
    if (!this.db) return;
    const teamRating = (team) => { const t = this.teamOf(team); return t.length ? Math.round(t.reduce((s, p) => s + p.rating, 0) / t.length) : 1000; };
    const foeId = (team) => [...this.players.values()].filter((q) => q.team !== team && q.charId).map((q) => q.charId).sort((x, y) => x - y)[0] ?? 0; // id estável do adversário (humano de menor id): anti-troca de vitórias do PvP
    this.foeIdOf = foeId;
    const foe = { 1: teamRating(2), 2: teamRating(1) }; // ratings de ANTES: o pagamento não depende da ordem
    for (const p of this.players.values()) {
      if (!p.charId || (p.bot && !p.left)) continue;
      const result = p.left ? 'loss' : winner === 3 ? 'draw' : winner === p.team ? 'win' : 'loss';
      try {
        const out = this.db.applyOperation(`match:${this.matchId}:${p.charId}`, p.charId, this.mode, (doc) => applyMatchResult(doc, { mode: this.mode, result, foeRating: foe[p.team], foeId: this.foeIdOf(p.team) }));
        if (!out.duplicate) {
          this.db.audit('match_reward', { accountId: p.accountId, detail: JSON.stringify({ match: this.matchId, mode: this.mode, char: p.charId, ...out.summary }) });
          if (p.session?.ws && p.session.player === p) this.send.to(p.session, { t: 'reward', ...out.summary });
          if (p.session) p.session.char = out.doc; // o lobby passa a usar o personagem atualizado
        }
      } catch (e) { this.db.audit('match_reward_error', { accountId: p.accountId, detail: e.message }); }
    }
  }


  // Duelo amistoso do Porto: quem VENCEU (humano, ainda na sala, não empate) ganha o evento `friendlyDuel` (missão + contador). Idempotente por partida e personagem.
  friendlyWins(winner) {
    if (!this.db || winner === 3) return;
    for (const p of this.players.values()) {
      if (!p.charId || p.bot || p.left || p.team !== winner) continue;
      const out = recordServerEvent(this.db, `friendly:${this.matchId}:${p.charId}`, p.charId, { type: 'friendlyDuel', won: true });
      if (!out) continue;
      if (p.session) p.session.char = out.doc;
      if (p.session?.ws && p.session.player === p) this.send.to(p.session, { t: 'friendly_reward', ...out.summary });
    }
  }

  // ---- snapshots (compactos e por delta: ver core/snapshot.js) ----
  meta() {
    return { v: PROTOCOL_VERSION, t: 'snap', room: this.id, mode: this.mode, tick: this.tick, state: this.state, countdown: r1(Math.max(0, this.countdown)), winner: this.winner, reason: this.reason, match: { score: { 1: Math.floor(this.match.score[1]), 2: Math.floor(this.match.score[2]) }, owner: this.match.owner, left: Math.max(0, Math.ceil(this.match.limit - this.match.time)) } };
  }
  // dados só do dono: velocidade e recargas (os outros jogadores não precisam deles)
  meJson(p) {
    const a = p.actor;
    return JSON.stringify({ spd: Math.round(a.stats.moveSpeed * a.speedMul * (a.slowT > 0 ? 1 - a.slowAmt : 1)), c: [r1(a.cds.basic), r1(a.cds.s0), r1(a.cds.s1), r1(a.cds.s2), r1(a.cds.s3 ?? 0)] });
  }
  frameFor(commit) {
    const tuples = [...this.players.values()].map((p) => actorTuple(p.actor, p.bot || !!p.session?.ws));
    return this.enc.frame(tuples, [], new Map(), { commit, forceKey: !commit });
  }

  broadcast() {
    const f = this.frameFor(true);
    const ev = this.events; this.events = [];
    const head = JSON.stringify({ ...this.meta(), ...f, events: ev }).slice(0, -1);
    for (const p of this.humans()) {
      if (!(p.session.ws && p.session.player === p)) continue;
      const msg = head + `,"ack":${p.lastSeq},"me":${this.meJson(p)}}`;
      this.bytes = msg.length;
      this.send.raw(p.session, msg);
    }
  }
  // quem reconecta no meio da partida recebe um quadro-chave completo (sem mexer no estado dos outros)
  sendKeyframe(session) {
    const p = session.player;
    if (!p) return;
    const f = this.frameFor(false);
    this.send.raw(session, JSON.stringify({ ...this.meta(), ...f, events: [] }).slice(0, -1) + `,"ack":${p.lastSeq},"me":${this.meJson(p)}}`);
  }
}
