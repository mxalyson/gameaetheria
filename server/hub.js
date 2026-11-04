// Hub: sessões, grupos (party) com convites, fila e matchmaking por rating + poder, e as salas de partida.
// Não conhece WebSocket: recebe mensagens já validadas (core/protocol.js) e devolve mensagens por `out` (injetado). Assim cada regra
// é testável sem rede e o relógio é o do servidor (`step()` avança em passos fixos), nunca Date.now().
import { randomBytes } from 'node:crypto';
import { MatchRoom } from './room.js';
import { CoopRoom } from './coop.js';
import { ZoneRoom, entryPoint } from './zone.js';
import { CryptRoom } from './crypt.js';
import { cryptEntryCheck, applyCryptEntry } from '../public/src/core/echo.js';
import { runTx, placeProblem, TxError, recordServerEvent } from './tx.js';
import { ZONES, FARM_ENTRY, FARM_MID } from '../public/src/data/zones.js';
import { MODES } from '../public/src/core/match.js';
import { playerPower, pvpUnlocked, PVP_MIN_LEVEL } from '../public/src/core/power.js';
import { getRating } from '../public/src/core/match.js';
import { generateRivalForPower } from '../public/src/core/rival.js';
import { makeRng } from '../public/src/core/rng.js';
import { CLASSES } from '../public/src/data/classes.js';
import { TICK_DT, MAX_PARTY, REJECT } from '../public/src/core/protocol.js';

export const INVITE_TTL = 60;        // s
export const BOT_FILL_AFTER = 20;    // s na fila até completar com bots
export const FRIENDLY_BOT_AFTER = 3; // s: duelo amistoso do Porto completa com bot depressa (é a luta contra o Duelista)
export const COOP_WAIT = 6;          // s esperando mais jogadores antes de começar o cooperativo
const COOP_LEVEL_GAP = 8;
export const TELEPORT_COOLDOWN = 5;      // s entre pedidos de teletransporte da mesma sessão (vale também para pedidos recusados)
export const TELEPORT_COMBAT_SEC = 8;    // mesmo critério do cliente offline: sem dano causado/recebido nos últimos 8 s
const TELEPORT_ENTRY = { x: FARM_ENTRY, y: FARM_MID }; // ponto oeste, igual ao de quem entra por portal (B22)
export const TX_MIN_GAP = 0.1;           // s entre transações da mesma sessão (cada uma é uma gravação no banco)
export const PORTAL_REACH = 80;          // px: distância máxima do ator ao portal para atravessá-lo (o servidor usa a posição do ator, nunca a do cliente)
// Chat (2026-11-04): por sessão, 1 mensagem a cada `gap` s, no máximo `burst` a cada `window` s e sem repetir o mesmo texto em `repeatSec` s.
// O histórico do canal global (últimas `history`) vai para quem entra; nada de chat é gravado no banco (só em memória, some ao reiniciar).
export const CHAT = { gap: 1.2, burst: 5, window: 10, repeatSec: 15, history: 30 };
const RATING_WIN = [50, 400], POWER_WIN = [0.15, 0.5], WIDEN_SEC = 40; // a janela abre linearmente com a espera

export class Hub {
  constructor({ db = null, seed = 1, reconnectSec = 30, out, log = null }) {
    Object.assign(this, { db, reconnectSec, out });
    this.log = log ?? ((msg, extra) => console.error(JSON.stringify({ level: 'error', msg, ...extra })));
    this.rng = makeRng(seed);
    this.clock = 0; this.tick = 0; this.tpSeq = 0; this.nextRoom = 1; this.nextParty = 1;
    this.sessions = new Map();   // token -> sessão
    this.byName = new Map();     // nome em minúsculas -> sessão (conectada)
    this.byChar = new Map();     // charId -> sessão
    this.parties = new Map();    // id -> { id, leader, members:[sessão], invites: Map(sessão -> expira) }
    this.queue = [];             // entradas { id, mode, members:[sessão], since, rating, power }
    this.rooms = new Map();
    this.zoneRooms = new Map();  // chave (grupo ou jogador + zona) -> sala de exploração
    this.stats = { staleInputs: 0, matches: 0, botFills: 0, roomErrors: 0, chat: 0 };
    this.chatLog = [];           // últimas mensagens do canal global
    this.toSession = { stats: this.stats, to: (s, m) => this.out.send(s, m), raw: (s, text) => this.out.raw(s, text) };
  }

  // ---------- sessões ----------
  // identity: { doc, charId, accountId }  (doc = personagem oficial do banco, ou padrão do servidor para convidados)
  createSession(ws, identity) {
    const doc = identity.doc;
    let name = doc.name, n = 1;
    while (this.byName.has(name.toLowerCase())) name = `${doc.name.slice(0, 11)}#${++n}`; // convidados com o mesmo nome
    // B19: recarregar a página enquanto a sessão antiga ainda espera reconexão: encerra a antiga (grava o lote da instância) para o personagem não ficar em duas salas
    const old = identity.charId ? this.byChar.get(identity.charId) : null;
    if (old && !old.ws && (!old.room || old.room.mode === 'zone')) {
      try { if (old.room && old.player) old.room.leave(old.player, 'replaced'); } catch (e) { this.fail('replace_session', e); }
      this.drop(old);
    }
    const s = { id: randomBytes(4).toString('hex'), token: randomBytes(18).toString('base64url'), ws, name, charId: identity.charId ?? null, accountId: identity.accountId ?? null,
      char: doc, partyId: null, queued: null, room: null, player: null, dropT: null };
    this.sessions.set(s.token, s);
    this.byName.set(name.toLowerCase(), s);
    if (s.charId) this.byChar.set(s.charId, s);
    return s;
  }
  // Documento oficial FRESCO: o que foi gravado pela API depois do login (equipar, pontos, spec) vale na sala; sem banco (convidado) fica o do hello.
  refreshChar(s) {
    if (!this.db || !s.charId) return;
    try { const row = this.db.character(s.charId); if (row) s.char = row.doc; } catch { /* mantém o documento que já tinha */ }
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
    // partida já decidida (resultado na tela por RESULT_SHOW s): quem clicou em "Voltar" não fica preso à sala; transação, fila, grupo e viagem valem já
    if (m.t !== 'input' && m.t !== 'ping' && s.room && s.room.mode !== 'zone' && s.room.state === 'over') { s.room = null; s.player = null; }
    switch (m.t) {
      case 'ping': return this.out.send(s, { t: 'pong', ts: m.ts, tick: this.tick });
      case 'input': if (s.room) s.room.input(s, m); return;
      case 'party_create': if (s.partyId) return no(REJECT.ALREADY_IN_PARTY); this.newParty(s); return;
      case 'party_invite': return this.invite(s, m.name, no);
      case 'party_accept': return this.accept(s, m.partyId, no);
      case 'party_decline': { const p = this.parties.get(m.partyId); if (p?.invites.delete(s)) this.out.send(p.leader, { t: 'notice', code: 'invite_declined', name: s.name }); return; }
      case 'party_leave': if (!s.partyId) return no(REJECT.NOT_IN_PARTY); if (s.queued) this.cancelQueue(s); this.leaveParty(s, 'left'); return;
      case 'party_kick': return this.kick(s, m.name, no);
      case 'queue': return this.enqueue(s, m.mode, no, !!m.friendly);
      case 'queue_cancel': if (s.queued) this.cancelQueue(s); return;
      case 'zone_enter': return this.zoneEnter(s, m.zone, m.from, no);
      case 'zone_leave': return this.zoneLeave(s);
      case 'zone_respawn': if (s.room?.mode === 'zone') s.room.respawnNow?.(s.player); return; // botão "Renascer no ponto salvo": antecipa o renascimento (a espera mínima é conferida na sala)
      case 'crypt_enter': return this.cryptEnter(s, no);
      case 'zone_teleport': return this.zoneTeleport(s, m.zone, no);
      case 'tx': return this.transaction(s, m, no);
      case 'chat': return this.chat(s, m, no);
    }
  }

  // ---------- chat ----------
  // m.text já chega limpo (core/protocol.js › cleanChat). O nome é o da sessão (do servidor), nunca um campo do cliente.
  chat(s, m, no) {
    const now = this.clock, c = (s.chat ??= { last: -Infinity, times: [], text: '', textAt: -Infinity });
    c.times = c.times.filter((t) => now - t < CHAT.window);
    const same = m.text.toLowerCase() === c.text && now - c.textAt < CHAT.repeatSec;
    if (now - c.last < CHAT.gap || c.times.length >= CHAT.burst || same) return no(REJECT.CHAT_WAIT);
    const party = m.ch === 'party' ? this.parties.get(s.partyId) : null;
    if (m.ch === 'party' && !party) return no(REJECT.NOT_IN_PARTY);
    c.last = now; c.times.push(now); c.text = m.text.toLowerCase(); c.textAt = now;
    this.stats.chat++;
    const msg = { t: 'chat', ch: m.ch, from: s.name, cls: s.char.classId, lv: s.char.level, text: m.text, at: Date.now() };
    if (party) { for (const x of party.members) if (x.ws) this.out.send(x, msg); return; }
    this.chatLog.push(msg);
    if (this.chatLog.length > CHAT.history) this.chatLog.shift();
    for (const x of this.sessions.values()) if (x.ws) this.out.send(x, msg);
  }
  sendChatHistory(s) { if (this.chatLog.length) this.out.send(s, { t: 'chat_history', list: this.chatLog }); }

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
  enqueue(s, mode, no, friendly = false) {
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
      if (!coop && !friendly && !pvpUnlocked(m.char)) return no(REJECT.PVP_LOCKED, { minLevel: PVP_MIN_LEVEL, name: m.name });
    }
    const e = { mode, friendly, members, since: this.clock, rating: coop ? 0 : avg(members.map((m) => this.rating(m, mode))), power: avg(members.map((m) => this.power(m))), level: avg(members.map((m) => m.char.level)) };
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
    for (const g of groups) for (const s of g.members) this.refreshChar(s);
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
      const list = this.queue.filter((e) => e.mode === mode).sort((a, b) => a.since - b.since); // amistosos só casam entre si
      const used = new Set();
      for (const seed of list) {
        if (used.has(seed)) continue;
        const wait = this.clock - seed.since;
        const compatible = list.filter((e) => e.friendly === seed.friendly && e !== seed && !used.has(e) && this.ok(seed, e, Math.max(wait, this.clock - e.since)));
        const teams = [{ groups: [seed], n: seed.members.length }, { groups: [], n: 0 }];
        const pool = [...compatible];
        const fill = (team) => { // preenche o time com grupos que cabem exatamente (maiores primeiro)
          for (const g of [...pool].sort((a, b) => b.members.length - a.members.length)) {
            if (team.n + g.members.length <= size) { team.groups.push(g); team.n += g.members.length; pool.splice(pool.indexOf(g), 1); }
          }
        };
        fill(teams[0]); fill(teams[1]);
        const withBots = wait >= (seed.friendly ? FRIENDLY_BOT_AFTER : BOT_FILL_AFTER);
        if (!withBots && (teams[0].n < size || teams[1].n < size)) continue;
        for (const t of teams) for (const g of t.groups) used.add(g);
        this.startRoom(mode, teams, withBots, !!seed.friendly);
      }
    }
  }

  startRoom(mode, teams, botsAllowed, friendly = false) {
    const size = MODES[mode].size;
    const humans = teams.flatMap((t) => t.groups.flatMap((g) => g.members));
    for (const e of teams.flatMap((t) => t.groups)) this.queue = this.queue.filter((x) => x !== e);
    for (const h of humans) h.queued = null;
    for (const h of humans) this.refreshChar(h);
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
    const room = new MatchRoom({ id, mode, entries, friendly, seed: this.rng.int(1, 0x3fffffff), db: this.db, reconnectSec: this.reconnectSec, send: this.toSession });
    this.rooms.set(id, room);
    this.stats.matches++;
    for (const p of room.humans()) this.sendMatchFound(p.session, room, p);
  }
  sendMatchFound(s, room, p) {
    if (room.mode === 'zone') return this.sendZoneJoined(s, room);
    this.out.send(s, { t: 'match_found', room: room.id, mode: room.mode, ...(room.friendly ? { friendly: true } : {}), you: p.actor.id, team: p.team, slot: p.team, arena: { w: room.world.zone.w, h: room.world.zone.h, radius: room.world.zone.radius },
      objective: room.world.objective ? { x: room.world.objective.x, y: room.world.objective.y, r: room.world.objective.r } : null,
      players: [...room.players.values()].filter((q) => !q.left).map((q) => ({ id: q.actor.id, team: q.team, name: q.name, classId: q.classId, level: q.actor.level, maxHp: q.actor.maxHp, bot: q.bot })) });
    room.sendKeyframe?.(s); // reconexão: quadro-chave completo para o decodificador recomeçar
  }

  // ---------- exploração no servidor (P11) ----------
  // Instância por grupo (ou por jogador, se solo) e por zona: quem do mesmo grupo entra depois cai na mesma sala (até MAX_PARTY).
  // O servidor sabe onde o jogador está: na sala de zona, a zona dela; fora de sala, a vila (ou o Porto, se acabou de sair dele: `s.hubAt`). O `from` do cliente é IGNORADO.
  // Cidades neutras (hub: vila e Porto) não têm sala: o jogador sai da instância (zone_exit com `to`) e anda sozinho nelas, sem monstros.
  // Só vale o portal real (zona atual → destino) e, dentro da sala, só com o ator a ≤ PORTAL_REACH do portal.
  zoneEnter(s, zoneId, _from, no) {
    if (s.queued) return no(REJECT.ALREADY_QUEUED);
    if (s.room && s.room.mode !== 'zone') return no(REJECT.IN_MATCH);
    // fora de sala: vale o hub de onde saiu (Porto) e, se o cliente voltou à vila por conta própria, a vila
    const cur = s.room ? s.room.zoneId : [s.hubAt, 'town'].find((f) => f && entryPoint(zoneId, f));
    const at = cur && entryPoint(zoneId, cur);
    if (!at || !ZONES[zoneId].mobs) return no(REJECT.BAD_ZONE);
    if (s.room) {
      const portal = ZONES[cur].portals.find((q) => q.to === zoneId), a = s.player?.actor;
      if (!a || Math.hypot(a.x - portal.x, a.y - portal.y) > PORTAL_REACH) return no(REJECT.NOT_AT_PORTAL);
    }
    if (this.zoneRoomFor(s, zoneId).room?.size >= MAX_PARTY) return no(REJECT.ROOM_FULL);
    if (s.room) s.room.leave(s.player, 'portal'); // só sai depois de conferir tudo (grava o lote pendente)
    this.joinZoneRoom(s, zoneId, at);
  }
  // sala existente da instância (grupo/solo + zona) com vaga; null se cheia
  zoneRoomFor(s, zoneId) {
    const key = `${s.partyId ?? 's' + s.id}:${zoneId}`;
    const room = this.zoneRooms.get(key);
    if (room?.closed) this.zoneRooms.delete(key);
    return { key, room: room && !room.closed ? room : null };
  }
  joinZoneRoom(s, zoneId, at, extra = null) {
    const { key } = this.zoneRoomFor(s, zoneId);
    let { room } = this.zoneRoomFor(s, zoneId);
    if (!room) {
      const id = this.nextRoom++;
      const Room = ZONES[zoneId].dungeon ? CryptRoom : ZoneRoom; // masmorra (Cripta dos Ecos): sala própria com ondas e chefe
      room = new Room({ id, key, zoneId, seed: this.rng.int(1, 0x3fffffff), db: this.db, reconnectSec: this.reconnectSec, send: this.toSession, onPortal: (p, pt) => this.zonePortal(room, p, pt) });
      this.rooms.set(id, room); this.zoneRooms.set(key, room);
    }
    this.refreshChar(s);
    room.join(s, at);
    s.hubAt = null;
    this.markVisited(s, zoneId);
    this.sendZoneJoined(s, room, extra);
  }
  // Mapa visitado é gravado pelo servidor (o cliente fica com a nuvem pausada dentro da instância): é o que libera o teletransporte depois.
  markVisited(s, zoneId) {
    if (!this.db || !s.charId || !(ZONES[zoneId]?.mobs || ZONES[zoneId]?.hub)) return; // a masmorra não é parada de viagem
    try {
      if (this.db.character(s.charId)?.doc.visited?.[zoneId]) return;
      const out = this.db.applyOperation(`visit:${s.id}:${++this.tpSeq}:${randomBytes(4).toString('hex')}`, s.charId, 'visit', (d) => {
        const c = structuredClone(d); (c.visited ??= {})[zoneId] = 1;
        return { doc: c, summary: { zone: zoneId } };
      });
      s.char = out.doc;
    } catch { /* sem o registro o jogador só precisa passar por lá de novo */ }
  }
  // Evento de diário contado pelo servidor (teletransporte, visita ao Porto): o cliente não soma esses objetivos sozinho (modo estrito de PvE).
  serverEvent(s, ev) {
    const out = recordServerEvent(this.db, `ev:${s.id}:${++this.tpSeq}:${randomBytes(4).toString('hex')}`, s.charId, ev);
    if (out) s.char = out.doc;
    return out;
  }
  // Teletransporte: o servidor confere TUDO (o cliente só pede). Vila é grátis; outras zonas custam 1 pergaminho debitado no documento oficial.
  zoneTeleport(s, zoneId, no) {
    if (this.clock - (s.tpAt ?? -99) < TELEPORT_COOLDOWN) return no(REJECT.TELEPORT_WAIT);
    s.tpAt = this.clock;
    if (!this.db || !s.charId) return no(REJECT.BAD_CHARACTER);
    if (s.queued) return no(REJECT.ALREADY_QUEUED);
    const toTown = zoneId === 'town';
    const toHub = !toTown && !!ZONES[zoneId]?.hub && !ZONES[zoneId].mobs; // Porto: custa 1 pergaminho, mas não tem sala
    if (!toTown && !toHub && !ZONES[zoneId]?.mobs) return no(REJECT.BAD_ZONE);
    const room = s.room;
    if (room && room.mode !== 'zone') return no(REJECT.IN_MATCH); // partida em andamento não permite viajar
    if (room) {
      if (room.zoneId === zoneId) return no(REJECT.BAD_ZONE);
      const a = s.player?.actor;
      if (a && (a.dead || room.world.time - a.lastCombat < TELEPORT_COMBAT_SEC)) return no(REJECT.IN_COMBAT);
    }
    // documento oficial FRESCO do banco (o cliente grava a nuvem antes de pedir): visitado e pergaminho valem pelo que está salvo
    const row = this.db.character(s.charId);
    if (!row) return no(REJECT.BAD_CHARACTER);
    const doc = row.doc;
    const seen = doc.visited?.[zoneId] || (zoneId === 'harbor' && doc.visited?.ruins); // quem já chegou às Ruínas passou pelo Porto
    if (!toTown && !seen) return no(REJECT.NOT_VISITED);
    if (!toTown && (doc.scrolls ?? 0) < 1) return no(REJECT.NO_SCROLL);
    if (!toTown && !toHub && this.zoneRoomFor(s, zoneId).room?.size >= MAX_PARTY) return no(REJECT.ROOM_FULL); // antes de cobrar
    let scrolls = doc.scrolls ?? 0;
    if (!toTown) {
      try {
        const out = this.db.applyOperation(`tp:${s.id}:${++this.tpSeq}:${randomBytes(4).toString('hex')}`, s.charId, 'teleport', (d) => {
          if ((d.scrolls ?? 0) < 1) throw new Error('sem pergaminho');
          const c = structuredClone(d); c.scrolls -= 1;
          return { doc: c, summary: { zone: zoneId, scrolls: c.scrolls } };
        });
        s.char = out.doc; scrolls = out.doc.scrolls;
        this.db.audit('teleport', { accountId: s.accountId, detail: JSON.stringify({ char: s.charId, zone: zoneId, scrolls }) });
      } catch { return no(REJECT.NO_SCROLL); }
    }
    if (room) room.leave(s.player, 'teleport'); // grava o lote pendente de recompensas antes de trocar de lugar
    this.serverEvent(s, { type: 'teleport' }); // objetivo/contador de teletransporte: do servidor (antes de zone_exit/zone_joined, que o cliente usa para reler o personagem)
    if (toHub && zoneId === 'harbor') this.serverEvent(s, { type: 'visit', zoneId });
    if (toTown) { s.hubAt = null; return this.out.send(s, { t: 'zone_exit', to: 'town' }); }
    if (toHub) { s.hubAt = zoneId; this.markVisited(s, zoneId); return this.out.send(s, { t: 'zone_exit', to: zoneId, x: ZONES[zoneId].spawn.x, y: ZONES[zoneId].spawn.y }); }
    this.joinZoneRoom(s, zoneId, { ...(ZONES[zoneId].spawn ?? TELEPORT_ENTRY) }, { scrolls });
  }
  // Cripta dos Ecos (masmorra): a entrada é um nó do MAPA. O servidor confere tudo no documento oficial: nível, Ruínas visitadas, espera de 20 min ou Chave de Eco
  // (debitada na mesma operação idempotente que carimba a entrada), fora de partida/fila, e que o jogador está numa cidade (não dentro de outra instância).
  // Grupo: cada membro paga a própria entrada e cai na mesma instância (até MAX_PARTY); instância já vencida não aceita mais ninguém.
  cryptEnter(s, no) {
    if (!this.db || !s.charId) return no(REJECT.BAD_CHARACTER);
    if (s.queued) return no(REJECT.ALREADY_QUEUED);
    if (s.room) return no(s.room.mode !== 'zone' ? REJECT.IN_MATCH : REJECT.NOT_HERE); // dentro de outra instância: volte à cidade antes
    const { room } = this.zoneRoomFor(s, 'crypt');
    if (room?.cleared) return no(REJECT.CRYPT_OVER);
    if (room?.size >= MAX_PARTY) return no(REJECT.ROOM_FULL);
    this.refreshChar(s);
    const row = this.db.character(s.charId);
    if (!row) return no(REJECT.BAD_CHARACTER);
    const chk = cryptEntryCheck(row.doc, Date.now());
    if (!chk.ok) return no(chk.code, { reason: chk.reason, waitSec: chk.waitSec });
    try {
      const out = this.db.applyOperation(`crypt:${s.id}:${++this.tpSeq}:${randomBytes(4).toString('hex')}`, s.charId, 'crypt_entry', (d) => {
        const c = structuredClone(d), r = applyCryptEntry(c, Date.now());
        if (!r.ok) throw new Error(r.code);
        return { doc: c, summary: { via: r.via, keys: c.echo.keys } };
      });
      s.char = out.doc;
      this.db.audit('crypt_entry', { accountId: s.accountId, detail: JSON.stringify({ char: s.charId, via: out.summary.via, keys: out.summary.keys }) });
    } catch (e) { return no(REJECT.CRYPT_WAIT, { reason: 'Não foi possível entrar agora.' }); }
    this.joinZoneRoom(s, 'crypt', { ...ZONES.crypt.spawn }, { crypt: true });
  }
  sendZoneJoined(s, room, extra = null) {
    const p = s.player;
    this.out.send(s, { t: 'zone_joined', room: room.id, zone: room.zoneId, you: p.actor.id, x: p.actor.x, y: p.actor.y, w: room.world.zone.w, h: room.world.zone.h, ...(extra ?? {}),
      players: room.statics([...room.players.values()].filter((q) => !q.left)).map((q) => ({ ...q, team: 1 })) });
    room.sendKeyframe(s);
  }
  // Transações de personagem (P11.3/P11.4, server/tx.js): o cliente pede, o servidor confere no documento OFICIAL e responde `tx_result`.
  // Dentro da instância valem só baú, poção e spirit; nas cidades, o resto (loja, ferreiro, banco, contratos, missões). Nunca durante partida PvP/coop.
  transaction(s, m, no) {
    if (!this.db || !s.charId) return no(REJECT.BAD_CHARACTER);
    const room = s.room;
    if (room && room.mode !== 'zone') return no(REJECT.IN_MATCH);
    if (s.queued) return no(REJECT.ALREADY_QUEUED);
    if (this.clock - (s.txAt ?? -9) < TX_MIN_GAP) return no(REJECT.TX_WAIT);
    s.txAt = this.clock;
    const reply = (extra) => this.out.send(s, { t: 'tx_result', op: m.op, req: m.req, ...extra });
    const bad = placeProblem(m.op, { inZone: !!room, hubAt: s.hubAt, shop: m.shop });
    if (bad) return reply({ ok: false, code: bad, reason: 'Isso não está disponível aqui.' });
    const p = s.player;
    if (m.op === 'potion') {
      const why = room.potionProblem(p);
      if (why) return reply({ ok: false, code: why, reason: why === 'cooldown' ? 'A poção ainda está em recarga.' : why === 'full' ? 'Sua vida já está cheia.' : 'Você está caído.' });
    }
    try {
      const out = this.db.applyOperation(`tx:${s.token}:${s.txSeq = (s.txSeq ?? 0) + 1}`, s.charId, 'tx', (doc) => runTx(doc, m, { rng: this.rng, now: Date.now(), room, player: p, hubAt: s.hubAt }));
      s.char = out.doc;
      if (room) room.afterTx(p, m, out.doc);
      if (m.op !== 'potion' && m.op !== 'spirit_set') this.db.audit('tx', { accountId: s.accountId, detail: JSON.stringify({ char: s.charId, op: m.op, id: m.id, gold: out.summary.goldTotal }) });
      reply({ ok: true, sync: m.op !== 'potion' && m.op !== 'spirit_set', ...out.summary });
    } catch (e) {
      if (e instanceof TxError) return reply({ ok: false, reason: e.message });
      this.fail('tx', e, { op: m.op });
      reply({ ok: false, reason: 'Erro no servidor.' });
    }
  }

  zoneLeave(s) {
    const room = s.room;
    if (!room || room.mode !== 'zone') return;
    const a = s.player?.actor;
    // B15: sair da instância em luta (ou morto) devolveria o herói com vida cheia; mesmo critério do teletransporte
    if (a && (a.dead || room.world.time - a.lastCombat < TELEPORT_COMBAT_SEC)) return this.out.send(s, { t: 'reject', code: REJECT.IN_COMBAT });
    room.leave(s.player, 'left');
    s.hubAt = null;
    this.out.send(s, { t: 'zone_exit', to: 'town' });
  }
  zonePortal(room, p, pt) {
    const s = p.session;
    if (!s) return;
    const dest = ZONES[pt.to];
    if (pt.to === 'town' || (dest.hub && !dest.mobs)) { // cidade neutra: sai da instância; o cliente anda no mapa local
      room.leave(p, 'portal');
      s.hubAt = pt.to === 'town' ? null : pt.to;
      if (s.hubAt) { this.markVisited(s, pt.to); if (pt.to === 'harbor') this.serverEvent(s, { type: 'visit', zoneId: 'harbor' }); }
      this.out.send(s, { t: 'zone_exit', to: pt.to, x: pt.tx, y: pt.ty });
      return;
    }
    this.zoneEnter(s, pt.to, room.zoneId, (code) => this.out.send(s, { t: 'reject', code }));
  }

  fail(what, e, extra = {}) { this.stats.roomErrors++; try { this.log(what, { erro: String(e?.stack ?? e), ...extra }); } catch { /* log nunca derruba */ } }
  // Desligamento limpo: grava o lote pendente de cada sala de exploração (XP/ouro/itens/azar de até FLUSH_EVERY s)
  flushAll() { for (const room of this.rooms.values()) { try { room.flushAll?.(); } catch (e) { this.fail('flush_all', e, { room: room.id }); } } }

  // ---------- relógio ----------
  step() {
    this.tick++; this.clock += TICK_DT;
    if (this.tick % 60 === 0) for (const e of this.queue) for (const m of e.members) this.out.send(m, { t: 'queue', mode: e.mode, state: 'searching', waited: Math.floor(this.clock - e.since) });
    if (this.tick % 30 === 0) { try { this.matchmake(); } catch (e) { this.fail('matchmake', e); } }
    for (const room of [...this.rooms.values()]) {
      // uma exceção numa sala fecha SÓ essa sala (grava o que der) e o servidor segue com as outras
      try { room.step(); } catch (e) {
        this.fail('room_step', e, { room: room.id, mode: room.mode });
        try { room.flushAll?.(); } catch { /* já registrado acima */ }
        room.closed = true; room.reason = 'error'; room.winner = 0;
      }
      if (room.closed) {
        this.rooms.delete(room.id);
        if (room.key && this.zoneRooms.get(room.key) === room) this.zoneRooms.delete(room.key);
        try {
          for (const p of room.humans()) { if (p.session.room === room) { p.session.room = null; p.session.player = null; this.out.send(p.session, { t: 'match_end', room: room.id, winner: room.winner, reason: room.reason }); } }
        } catch (e) { this.fail('room_close', e, { room: room.id }); }
        for (const s of this.sessions.values()) if (s.room === room) { s.room = null; s.player = null; } // sessão nunca fica presa a sala morta
      }
    }
    for (const [id, p] of this.parties) for (const [t, exp] of p.invites) if (exp < this.clock) { p.invites.delete(t); void id; }
    if (this.tick % 60 === 0) for (const s of [...this.sessions.values()]) if (!s.ws && s.dropT != null && !s.room && this.clock - s.dropT > this.reconnectSec) this.drop(s);
  }
}

const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
