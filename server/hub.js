// Hub: sessões, grupos (party) com convites, fila e matchmaking por rating + poder, e as salas de partida.
// Não conhece WebSocket: recebe mensagens já validadas (core/protocol.js) e devolve mensagens por `out` (injetado). Assim cada regra
// é testável sem rede e o relógio é o do servidor (`step()` avança em passos fixos), nunca Date.now().
import { randomBytes } from 'node:crypto';
import { MatchRoom } from './room.js';
import { CoopRoom } from './coop.js';
import { MODES } from '../public/src/core/match.js';
import { playerPower, pvpUnlocked, PVP_MIN_LEVEL } from '../public/src/core/power.js';
import { getRating } from '../public/src/core/match.js';
import { generateRivalForPower } from '../public/src/core/rival.js';
import { makeRng } from '../public/src/core/rng.js';
import { CLASSES } from '../public/src/data/classes.js';
import { TICK_DT, MAX_PARTY, REJECT } from '../public/src/core/protocol.js';

export const INVITE_TTL = 60;        // s
export const BOT_FILL_AFTER = 20;    // s na fila até completar com bots
export const COOP_WAIT = 6;          // s esperando mais jogadores antes de começar o cooperativo
const COOP_LEVEL_GAP = 8;
const RATING_WIN = [50, 400], POWER_WIN = [0.15, 0.5], WIDEN_SEC = 40; // a janela abre linearmente com a espera

export class Hub {
  constructor({ db = null, seed = 1, reconnectSec = 30, out }) {
    Object.assign(this, { db, reconnectSec, out });
    this.rng = makeRng(seed);
    this.clock = 0; this.tick = 0; this.nextRoom = 1; this.nextParty = 1;
    this.sessions = new Map();   // token -> sessão
    this.byName = new Map();     // nome em minúsculas -> sessão (conectada)
    this.byChar = new Map();     // charId -> sessão
    this.parties = new Map();    // id -> { id, leader, members:[sessão], invites: Map(sessão -> expira) }
    this.queue = [];             // entradas { id, mode, members:[sessão], since, rating, power }
    this.rooms = new Map();
    this.stats = { staleInputs: 0, matches: 0, botFills: 0 };
    this.toSession = { stats: this.stats, to: (s, m) => this.out.send(s, m), raw: (s, text) => this.out.raw(s, text) };
  }

  // ---------- sessões ----------
  // identity: { doc, charId, accountId }  (doc = personagem oficial do banco, ou padrão do servidor para convidados)
  createSession(ws, identity) {
    const doc = identity.doc;
    let name = doc.name, n = 1;
    while (this.byName.has(name.toLowerCase())) name = `${doc.name.slice(0, 11)}#${++n}`; // convidados com o mesmo nome
    const s = { id: randomBytes(4).toString('hex'), token: randomBytes(18).toString('base64url'), ws, name, charId: identity.charId ?? null, accountId: identity.accountId ?? null,
      char: doc, partyId: null, queued: null, room: null, player: null, dropT: null };
    this.sessions.set(s.token, s);
    this.byName.set(name.toLowerCase(), s);
    if (s.charId) this.byChar.set(s.charId, s);
    return s;
  }
  sessionByToken(t) { return this.sessions.get(t) ?? null; }
  charOnline(charId) { const s = this.byChar.get(charId); return !!(s && s.ws); }
  rating(s, mode) { return getRating(s.char, mode); }
  power(s) { return playerPower(s.char); }
  info(s) { return { name: s.name, level: s.char.level, classId: s.char.classId, online: !!s.ws, leader: s.partyId ? this.parties.get(s.partyId)?.leader === s : false }; }

  disconnected(s) {
    s.ws = null; s.dropT = this.clock;
    this.cancelQueue(s, true);
    s.room?.dropped(s);
    this.partyBroadcast(s.partyId);
  }
  reconnected(s, ws) {
    s.ws = ws; s.dropT = null;
    s.room?.resumed(s);
    this.partyBroadcast(s.partyId);
  }
  drop(s) { // prazo de reconexão vencido
    this.cancelQueue(s, true);
    this.leaveParty(s, 'timeout');
    this.sessions.delete(s.token);
    if (this.byName.get(s.name.toLowerCase()) === s) this.byName.delete(s.name.toLowerCase());
    if (s.charId && this.byChar.get(s.charId) === s) this.byChar.delete(s.charId);
  }

  // ---------- mensagens ----------
  handle(s, m) {
    const no = (code, extra = {}) => this.out.send(s, { t: 'reject', code, ...extra });
    switch (m.t) {
      case 'ping': return this.out.send(s, { t: 'pong', ts: m.ts, tick: this.tick });
      case 'input': if (s.room) s.room.input(s, m); return;
      case 'party_create': if (s.partyId) return no(REJECT.ALREADY_IN_PARTY); this.newParty(s); return;
      case 'party_invite': return this.invite(s, m.name, no);
      case 'party_accept': return this.accept(s, m.partyId, no);
      case 'party_decline': { const p = this.parties.get(m.partyId); if (p?.invites.delete(s)) this.out.send(p.leader, { t: 'notice', code: 'invite_declined', name: s.name }); return; }
      case 'party_leave': if (!s.partyId) return no(REJECT.NOT_IN_PARTY); if (s.queued) this.cancelQueue(s); this.leaveParty(s, 'left'); return;
      case 'party_kick': return this.kick(s, m.name, no);
      case 'queue': return this.enqueue(s, m.mode, no);
      case 'queue_cancel': if (s.queued) this.cancelQueue(s); return;
    }
  }

  // ---------- grupos ----------
  newParty(leader) {
    const p = { id: this.nextParty++, leader, members: [leader], invites: new Map() };
    this.parties.set(p.id, p); leader.partyId = p.id;
    this.partyBroadcast(p.id);
    return p;
  }
  partyOf(s) { return s.partyId ? this.parties.get(s.partyId) : null; }
  partyBroadcast(id) {
    const p = this.parties.get(id);
    if (!p) return;
    const msg = { t: 'party', id: p.id, leader: p.leader.name, members: p.members.map((x) => this.info(x)) };
    for (const m of p.members) this.out.send(m, msg);
  }
  invite(s, name, no) {
    const target = this.byName.get(name.toLowerCase());
    if (!target || !target.ws) return no(REJECT.NO_SUCH_PLAYER);
    if (target === s) return no(REJECT.SELF);
    let p = this.partyOf(s);
    if (p && p.leader !== s) return no(REJECT.NOT_LEADER);
    if (s.queued || s.room) return no(REJECT.IN_MATCH);
    if (target.partyId) return no(REJECT.ALREADY_IN_PARTY);
    if (p && p.members.length >= MAX_PARTY) return no(REJECT.PARTY_FULL);
    p ??= this.newParty(s);
    p.invites.set(target, this.clock + INVITE_TTL);
    this.out.send(target, { t: 'invite', partyId: p.id, from: s.name });
    this.out.send(s, { t: 'notice', code: 'invite_sent', name: target.name });
  }
  accept(s, partyId, no) {
    const p = this.parties.get(partyId);
    const exp = p?.invites.get(s);
    if (!p || exp == null || exp < this.clock) { p?.invites.delete(s); return no(REJECT.NO_INVITE); }
    if (s.partyId) return no(REJECT.ALREADY_IN_PARTY);
    if (s.queued || s.room) return no(REJECT.IN_MATCH);
    if (p.members.length >= MAX_PARTY) return no(REJECT.PARTY_FULL);
    p.invites.delete(s);
    if (p.leader.queued) this.cancelQueue(p.leader); // o grupo mudou: a fila recomeça
    p.members.push(s); s.partyId = p.id;
    this.partyBroadcast(p.id);
  }
  kick(s, name, no) {
    const p = this.partyOf(s);
    if (!p) return no(REJECT.NOT_IN_PARTY);
    if (p.leader !== s) return no(REJECT.NOT_LEADER);
    const t = p.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!t) return no(REJECT.NO_SUCH_PLAYER);
    if (t === s) return no(REJECT.SELF);
    if (s.queued) this.cancelQueue(s);
    this.leaveParty(t, 'kicked');
  }
  leaveParty(s, why) {
    const p = this.partyOf(s);
    if (!p) return;
    if (p.leader.queued || s.queued) this.cancelQueue(p.leader);
    p.members = p.members.filter((x) => x !== s); s.partyId = null;
    this.out.send(s, { t: 'party', id: null, leader: null, members: [], why });
    if (p.members.length <= 1) { // grupo de um só se desfaz
      for (const m of p.members) { m.partyId = null; this.out.send(m, { t: 'party', id: null, leader: null, members: [], why: 'disbanded' }); }
      this.parties.delete(p.id); return;
    }
    if (p.leader === s) p.leader = p.members.find((x) => x.ws) ?? p.members[0];
    this.partyBroadcast(p.id);
  }

  // ---------- fila e matchmaking ----------
  enqueue(s, mode, no) {
    if (s.queued) return no(REJECT.ALREADY_QUEUED);
    if (s.room) return no(REJECT.IN_MATCH);
    const p = this.partyOf(s);
    if (p && p.leader !== s) return no(REJECT.NOT_LEADER);
    const members = p ? p.members : [s];
    const coop = mode === 'coop';
    const size = coop ? 4 : MODES[mode].size;
    if (members.length > size) return no(REJECT.PARTY_TOO_BIG);
    for (const m of members) {
      if (!m.ws) return no(REJECT.MEMBER_OFFLINE);
      if (m.room || m.queued) return no(REJECT.IN_MATCH);
      if (!coop && !pvpUnlocked(m.char)) return no(REJECT.PVP_LOCKED, { minLevel: PVP_MIN_LEVEL, name: m.name });
    }
    const e = { mode, members, since: this.clock, rating: coop ? 0 : avg(members.map((m) => this.rating(m, mode))), power: avg(members.map((m) => this.power(m))), level: avg(members.map((m) => m.char.level)) };
    for (const m of members) m.queued = e;
    this.queue.push(e);
    for (const m of members) this.out.send(m, { t: 'queue', mode, state: 'searching' });
  }
  cancelQueue(s, silent = false) {
    const e = s.queued;
    if (!e) return;
    this.queue = this.queue.filter((x) => x !== e);
    for (const m of e.members) { m.queued = null; if (!silent || m !== s) this.out.send(m, { t: 'queue', mode: e.mode, state: 'cancelled' }); }
  }
  ok(a, b, wait) {
    const k = Math.min(1, wait / WIDEN_SEC);
    const rw = RATING_WIN[0] + (RATING_WIN[1] - RATING_WIN[0]) * k, pw = POWER_WIN[0] + (POWER_WIN[1] - POWER_WIN[0]) * k;
    return Math.abs(a.rating - b.rating) <= rw && Math.abs(a.power - b.power) <= Math.max(a.power, b.power) * pw;
  }

  // Tenta montar partidas: a entrada mais antiga é a semente; completa os dois times com grupos compatíveis e, passado BOT_FILL_AFTER, com bots.
  // Cooperativo: junta quem espera (nível parecido) até 4 jogadores; começa com 4 ou depois de COOP_WAIT s de espera.
  matchmakeCoop() {
    const list = this.queue.filter((e) => e.mode === 'coop').sort((a, b) => a.since - b.since);
    const used = new Set();
    for (const seed of list) {
      if (used.has(seed)) continue;
      const groups = [seed]; let n = seed.members.length;
      for (const e of list) if (e !== seed && !used.has(e) && n + e.members.length <= 4 && Math.abs(e.level - seed.level) <= COOP_LEVEL_GAP) { groups.push(e); n += e.members.length; }
      if (n < 4 && this.clock - seed.since < COOP_WAIT) continue;
      for (const g of groups) used.add(g);
      this.startCoop(groups);
    }
  }
  startCoop(groups) {
    for (const g of groups) { this.queue = this.queue.filter((x) => x !== g); for (const m of g.members) m.queued = null; }
    const entries = groups.flatMap((g) => g.members.map((s) => ({ session: s, doc: s.char, charId: s.charId, accountId: s.accountId })));
    const id = this.nextRoom++;
    const room = new CoopRoom({ id, entries, seed: this.rng.int(1, 0x3fffffff), db: this.db, reconnectSec: this.reconnectSec, send: this.toSession });
    this.rooms.set(id, room); this.stats.matches++;
    for (const p of room.humans()) this.sendMatchFound(p.session, room, p);
  }

  matchmake() {
    this.matchmakeCoop();
    for (const mode of Object.keys(MODES)) {
      const size = MODES[mode].size;
      const list = this.queue.filter((e) => e.mode === mode).sort((a, b) => a.since - b.since);
      const used = new Set();
      for (const seed of list) {
        if (used.has(seed)) continue;
        const wait = this.clock - seed.since;
        const compatible = list.filter((e) => e !== seed && !used.has(e) && this.ok(seed, e, Math.max(wait, this.clock - e.since)));
        const teams = [{ groups: [seed], n: seed.members.length }, { groups: [], n: 0 }];
        const pool = [...compatible];
        const fill = (team) => { // preenche o time com grupos que cabem exatamente (maiores primeiro)
          for (const g of [...pool].sort((a, b) => b.members.length - a.members.length)) {
            if (team.n + g.members.length <= size) { team.groups.push(g); team.n += g.members.length; pool.splice(pool.indexOf(g), 1); }
          }
        };
        fill(teams[0]); fill(teams[1]);
        const withBots = wait >= BOT_FILL_AFTER;
        if (!withBots && (teams[0].n < size || teams[1].n < size)) continue;
        for (const t of teams) for (const g of t.groups) used.add(g);
        this.startRoom(mode, teams, withBots);
      }
    }
  }

  startRoom(mode, teams, botsAllowed) {
    const size = MODES[mode].size;
    const humans = teams.flatMap((t) => t.groups.flatMap((g) => g.members));
    for (const e of teams.flatMap((t) => t.groups)) this.queue = this.queue.filter((x) => x !== e);
    for (const h of humans) h.queued = null;
    const entries = [];
    teams.forEach((t, i) => t.groups.forEach((g) => g.members.forEach((s) => entries.push({ team: i + 1, session: s, doc: s.char, charId: s.charId, accountId: s.accountId, rating: this.rating(s, mode) }))));
    const ratingAvg = avg(humans.map((s) => this.rating(s, mode))), powerAvg = avg(humans.map((s) => this.power(s)));
    const baseDoc = humans[0].char;
    teams.forEach((t, i) => {
      const have = entries.filter((e) => e.team === i + 1);
      const taken = have.map((e) => e.doc.classId);
      let missing = size - have.length;
      if (missing > 0) this.stats.botFills++;
      while (missing-- > 0) {
        const pool = Object.keys(CLASSES).filter((c) => !taken.includes(c));
        const classId = (pool.length ? pool : Object.keys(CLASSES))[this.rng.int(0, (pool.length ? pool : Object.keys(CLASSES)).length - 1)];
        taken.push(classId);
        const doc = generateRivalForPower(this.rng, baseDoc, powerAvg * (0.95 + this.rng.next() * 0.1), { classId, rating: ratingAvg });
        entries.push({ team: i + 1, bot: true, session: null, doc, rating: doc.arena.rating });
      }
    });
    void botsAllowed;
    const id = this.nextRoom++;
    const room = new MatchRoom({ id, mode, entries, seed: this.rng.int(1, 0x3fffffff), db: this.db, reconnectSec: this.reconnectSec, send: this.toSession });
    this.rooms.set(id, room);
    this.stats.matches++;
    for (const p of room.humans()) this.sendMatchFound(p.session, room, p);
  }
  sendMatchFound(s, room, p) {
    this.out.send(s, { t: 'match_found', room: room.id, mode: room.mode, you: p.actor.id, team: p.team, slot: p.team, arena: { w: room.world.zone.w, h: room.world.zone.h, radius: room.world.zone.radius },
      objective: room.world.objective ? { x: room.world.objective.x, y: room.world.objective.y, r: room.world.objective.r } : null,
      players: [...room.players.values()].filter((q) => !q.left).map((q) => ({ id: q.actor.id, team: q.team, name: q.name, classId: q.classId, level: q.actor.level, maxHp: q.actor.maxHp, bot: q.bot })) });
    room.sendKeyframe?.(s); // reconexão: quadro-chave completo para o decodificador recomeçar
  }

  // ---------- relógio ----------
  step() {
    this.tick++; this.clock += TICK_DT;
    if (this.tick % 60 === 0) for (const e of this.queue) for (const m of e.members) this.out.send(m, { t: 'queue', mode: e.mode, state: 'searching', waited: Math.floor(this.clock - e.since) });
    if (this.tick % 30 === 0) this.matchmake();
    for (const room of [...this.rooms.values()]) {
      room.step();
      if (room.closed) {
        this.rooms.delete(room.id);
        for (const p of room.humans()) { if (p.session.room === room) { p.session.room = null; p.session.player = null; this.out.send(p.session, { t: 'match_end', room: room.id, winner: room.winner, reason: room.reason }); } }
      }
    }
    for (const [id, p] of this.parties) for (const [t, exp] of p.invites) if (exp < this.clock) { p.invites.delete(t); void id; }
    if (this.tick % 60 === 0) for (const s of [...this.sessions.values()]) if (!s.ws && s.dropT != null && !s.room && this.clock - s.dropT > this.reconnectSec) this.drop(s);
  }
}

const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
