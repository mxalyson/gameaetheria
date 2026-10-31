// Servidor AUTORITATIVO (prova de conceito P4): uma sala de duelo com dois jogadores reais.
// O cliente envia só INTENÇÕES (mover, mirar, atacar, usar skill); a simulação (public/src/game/sim.js, a mesma do jogo) roda aqui,
// decide posição, dano, vida e morte, e devolve snapshots + eventos. Nada do que o cliente envia vira dano ou posição diretamente.
// Limites desta PoC (ver docs/roadmap/auditoria-p0-e-plano-multiplayer.md): sem contas (P5), personagem padrão gerado no servidor,
// uma sala só, ws:// local (WSS entra atrás de um proxy TLS na implantação).
import { WebSocketServer } from 'ws';
import { randomBytes } from 'node:crypto';
import { World, makeHeroActor } from '../public/src/game/sim.js';
import { makeRng } from '../public/src/core/rng.js';
import { newCharacter, POINTS_PER_LEVEL } from '../public/src/core/progression.js';
import { generateItem } from '../public/src/core/loot.js';
import { CLASSES } from '../public/src/data/classes.js';
import { SLOTS } from '../public/src/data/items.js';
import { applyDuelResult } from '../public/src/core/rewards.js';
import { decodeClient, encode, REJECT, RateLimiter, TICK_DT, SNAPSHOT_EVERY, TICK_HZ, PROTOCOL_VERSION } from '../public/src/core/protocol.js';

const SPAWNS = { 1: { x: 550, y: 840, facing: -Math.PI / 2 }, 2: { x: 550, y: 260, facing: Math.PI / 2 } };
const COUNTDOWN = 3;      // s
const RESULT_SHOW = 5;    // s antes de recomeçar
const LEVEL = 10;         // PoC: todo jogador entra com personagem padrão nível 10 (o servidor decide, não o cliente)

// Personagem padrão gerado PELO SERVIDOR: o cliente só escolhe nome e classe.
export function buildServerChar(name, classId, seed) {
  const rng = makeRng(seed);
  const c = newCharacter(name, classId, rng);
  c.level = LEVEL;
  const cls = CLASSES[classId], pts = POINTS_PER_LEVEL * (LEVEL - 1);
  c.alloc[cls.primary] += Math.round(pts * 0.6); c.alloc.vit += Math.round(pts * 0.3); c.alloc.agi += pts - Math.round(pts * 0.6) - Math.round(pts * 0.3);
  for (const slot of SLOTS) c.equipment[slot] = generateItem(rng, LEVEL, { classId, slot, weaponType: slot === 'weapon' ? cls.weapon : undefined, rarityId: 'uncommon' });
  return c;
}

const r1 = (n) => Math.round(n * 10) / 10;

export function createGameServer({
  port = 5175, host = '127.0.0.1', autoTick = true, seed = 12345, allowedOrigins = null,
  maxMsgPerSec = 120, maxErrors = 5, reconnectSec = 30, heartbeatMs = 10000,
  db = null,                 // com banco: jogadores entram com conta + personagem do servidor e as recompensas são gravadas
  allowGuests = !db,         // sem banco (PoC/testes) aceita convidados com personagem padrão; com banco, conta é obrigatória
} = {}) {
  const rng = makeRng(seed);
  const world = new World('arena', { seed, visuals: false });
  const players = new Map();       // actorId -> player
  const stats = { connections: 0, messages: 0, rejected: 0, staleInputs: 0, kicked: 0 };
  const room = { state: 'waiting', clock: 0, countdown: 0, resultT: 0, tick: 0, winner: 0, lastEvents: [], matchId: null };

  const send = (ws, msg) => { if (ws.readyState === 1) ws.send(encode(msg)); };
  const reject = (ws, code, close = false) => {
    stats.rejected++;
    send(ws, { t: 'reject', code });
    if (close) { stats.kicked++; ws.close(1008, code); }
  };

  const wss = new WebSocketServer({
    port, host, maxPayload: 2048, perMessageDeflate: false,
    verifyClient: allowedOrigins ? ({ origin }) => allowedOrigins.includes(origin) : undefined,
  });

  // ---------- sala ----------
  function resetActor(p) {
    const a = p.actor, sp = SPAWNS[p.slot];
    a.hp = a.maxHp; a.dead = false; a.deadT = 0; a.buffs = []; a.shield = 0; a.shieldT = 0; a.stunT = 0; a.slowT = 0; a.dash = null;
    a.x = sp.x; a.y = sp.y; a.facing = sp.facing; a.swing = 0;
    for (const k of Object.keys(a.cds)) a.cds[k] = 0;
    p.input = idleInput();
  }
  const idleInput = () => ({ mx: 0, my: 0, aimX: 0, aimY: 0, attack: false, cast: null });
  const present = () => [...players.values()].filter((p) => p.conn);

  function startCountdown() {
    for (const p of players.values()) resetActor(p);
    room.state = 'countdown'; room.countdown = COUNTDOWN; room.winner = 0; room.matchId = randomBytes(9).toString('base64url');
  }
  // Fim de partida: grava as recompensas no banco (uma transação por personagem, idempotente por matchId+personagem).
  function endMatch(winnerSlot, reason, leavers = []) {
    if (room.state === 'over') return; // já encerrada: nunca paga duas vezes
    room.state = 'over'; room.resultT = RESULT_SHOW; room.winner = winnerSlot;
    room.lastEvents.push({ e: 'result', winner: winnerSlot, reason });
    if (!db) return;
    const all = [...players.values(), ...leavers].filter((p) => p.charId);
    const before = new Map(all.map((p) => [p, p.rating])); // ratings de ANTES: o resultado não pode depender da ordem de pagamento
    for (const p of all) {
      const foe = all.find((q) => q !== p);
      const foeRating = before.get(foe) ?? 1000;
      try {
        const out = db.applyOperation(`match:${room.matchId}:${p.charId}`, p.charId, 'duel', (doc) => applyDuelResult(doc, { won: p.slot === winnerSlot, foeRating }));
        if (!out.duplicate) {
          p.rating = out.summary.rating;
          db.audit('match_reward', { accountId: p.accountId, detail: JSON.stringify({ match: room.matchId, char: p.charId, ...out.summary }) });
          if (p.conn) send(p.conn, { t: 'reward', ...out.summary });
        }
      } catch (e) { db.audit('match_reward_error', { accountId: p.accountId, detail: e.message }); }
    }
  }

  // Entrada na sala. Com banco: sessão válida + personagem DA CONTA, carregado do servidor (o cliente não envia atributos nem itens).
  function resolveIdentity(msg) {
    if (msg.session) {
      if (!db) return { error: REJECT.AUTH_REQUIRED };
      const acc = db.sessionAccount(msg.session);
      if (!acc) return { error: REJECT.BAD_SESSION };
      const ch = db.ownedCharacter(acc.id, msg.characterId);
      if (!ch) return { error: REJECT.BAD_CHARACTER };
      return { char: ch.doc, charId: ch.id, accountId: acc.id };
    }
    if (!allowGuests) return { error: REJECT.AUTH_REQUIRED };
    return { char: buildServerChar(msg.name, msg.classId, rng.int(1, 0x3fffffff)), charId: null, accountId: null };
  }

  function join(ws, msg) {
    const c = ws.ctx;
    if (c.player) return reject(ws, REJECT.ALREADY_JOINED);
    let p = null;
    if (msg.token) {
      p = [...players.values()].find((q) => q.token === msg.token);
      if (!p || p.conn) return reject(ws, REJECT.BAD_TOKEN, true);
      if (p.accountId && (!msg.session || db.sessionAccount(msg.session)?.id !== p.accountId)) return reject(ws, REJECT.BAD_SESSION, true); // reconectar exige a mesma conta
      p.conn = ws; p.dropT = null; // reconexão: volta ao mesmo ator
    } else {
      const id = resolveIdentity(msg);
      if (id.error) return reject(ws, id.error, true);
      if (id.charId && [...players.values()].some((q) => q.charId === id.charId)) return reject(ws, REJECT.ALREADY_ONLINE, true); // um personagem, uma conexão
      if (players.size >= 2) return reject(ws, REJECT.ROOM_FULL, true);
      const slot = [...players.values()].some((q) => q.slot === 1) ? 2 : 1;
      const sp = SPAWNS[slot];
      const actor = world.add(makeHeroActor(id.char, sp.x, sp.y, 'player', slot));
      actor.facing = sp.facing;
      p = { slot, token: randomBytes(18).toString('base64url'), name: id.char.name, classId: id.char.classId, actor, conn: ws, input: idleInput(), lastSeq: -1, dropT: null,
        charId: id.charId, accountId: id.accountId, rating: id.char.arena?.rating ?? 1000 };
      players.set(actor.id, p);
    }
    c.player = p;
    send(ws, { t: 'welcome', you: p.actor.id, slot: p.slot, token: p.token, name: p.name, tickHz: TICK_HZ, snapEvery: SNAPSHOT_EVERY, protocol: PROTOCOL_VERSION,
      arena: { w: world.zone.w, h: world.zone.h, radius: world.zone.radius }, state: room.state, account: !!p.accountId });
    if (room.state === 'waiting' && present().length === 2) startCountdown();
  }

  function onMessage(ws, data) {
    const c = ws.ctx;
    stats.messages++;
    if (!c.limiter.allow(Date.now())) return reject(ws, REJECT.RATE_LIMIT, true);
    const r = decodeClient(typeof data === 'string' ? data : data.toString('utf8'));
    if (!r.ok) {
      if (++c.errors > maxErrors) return reject(ws, REJECT.TOO_MANY_ERRORS, true);
      return reject(ws, r.code);
    }
    const m = r.msg;
    if (m.t === 'hello') return join(ws, m);
    if (!c.player) return reject(ws, REJECT.NOT_JOINED);
    if (m.t === 'ping') return send(ws, { t: 'pong', ts: m.ts, tick: room.tick });
    if (m.t === 'input') {
      const p = c.player;
      if (m.seq <= p.lastSeq) { stats.staleInputs++; return; } // replay / fora de ordem: ignorado
      p.lastSeq = m.seq;
      // "cast" é um clique: guarda até o próximo tick consumir (não se perde entre dois ticks)
      p.input = { mx: m.mx, my: m.my, aimX: m.aimX, aimY: m.aimY, attack: m.attack, cast: m.cast ?? p.input.cast };
    }
  }

  wss.on('connection', (ws, req) => {
    stats.connections++;
    ws.ctx = { player: null, errors: 0, limiter: new RateLimiter(maxMsgPerSec), alive: true };
    ws.on('pong', () => { ws.ctx.alive = true; });
    ws.on('message', (data) => onMessage(ws, data));
    ws.on('close', () => {
      const p = ws.ctx.player;
      if (p && p.conn === ws) { p.conn = null; p.dropT = room.clock; p.input = idleInput(); }
    });
    ws.on('error', () => { /* o 'close' cuida da limpeza */ });
  });

  // ---------- simulação ----------
  function wireEvent(ev) {
    const id = (a) => a?.id ?? null;
    switch (ev.type) {
      case 'hit': return { e: 'hit', src: id(ev.src), target: id(ev.target), amount: ev.amount, crit: !!ev.crit, absorbed: !!ev.absorbed };
      case 'heal': return { e: 'heal', actor: id(ev.actor), amount: ev.amount };
      case 'swing': return { e: 'swing', actor: id(ev.actor) };
      case 'cast': return { e: 'cast', actor: id(ev.actor), skill: ev.skill };
      case 'status': return { e: 'status', actor: id(ev.actor), kind: ev.kind, dur: r1(ev.dur) };
      case 'death': return { e: 'death', actor: id(ev.actor), killer: id(ev.killer) };
      default: return null;
    }
  }

  function simTick() {
    room.tick++; room.clock += TICK_DT;
    // reservas de reconexão vencidas
    for (const [id, p] of players) {
      if (!p.conn && p.dropT != null && room.clock - p.dropT > reconnectSec) {
        players.delete(id); world.actors = world.actors.filter((a) => a !== p.actor);
        if (room.state === 'fight' || room.state === 'countdown') {
          const left = [...players.values()][0];
          if (left && room.state === 'fight') endMatch(left.slot, 'forfeit', [p]); // abandono em luta = derrota registrada; na contagem, ninguém perde nada
          else if (left) { room.state = 'waiting'; } else { room.state = 'waiting'; }
        } else if (room.state === 'over' && players.size < 2) room.state = 'waiting';
      }
    }
    if (room.state === 'waiting' && present().length === 2) startCountdown();

    const intents = {};
    for (const p of players.values()) {
      const i = p.input;
      intents[p.actor.id] = room.state === 'fight' ? { mx: i.mx, my: i.my, aimX: i.aimX, aimY: i.aimY, attack: i.attack, cast: i.cast } : { mx: 0, my: 0 };
      if (room.state === 'fight') i.cast = null;
    }
    if (room.state === 'countdown') {
      room.countdown -= TICK_DT;
      if (room.countdown <= 0) { room.state = 'fight'; room.lastEvents.push({ e: 'fight' }); }
    } else if (room.state === 'over') {
      room.resultT -= TICK_DT;
      if (room.resultT <= 0) { if (present().length === 2) startCountdown(); else room.state = 'waiting'; }
    }
    world.update(TICK_DT, intents);
    for (const ev of world.events.splice(0)) {
      const w = wireEvent(ev);
      if (w) room.lastEvents.push(w);
      if (ev.type === 'death' && room.state === 'fight') {
        const loser = players.get(ev.actor.id);
        if (loser) endMatch(loser.slot === 1 ? 2 : 1, 'kill');
      }
    }
    if (room.tick % SNAPSHOT_EVERY === 0) broadcast();
  }

  function snapshotActors() {
    return [...players.values()].map((p) => {
      const a = p.actor;
      return { id: a.id, slot: p.slot, name: p.name, classId: p.classId, x: r1(a.x), y: r1(a.y), hp: Math.round(a.hp), maxHp: a.maxHp, dead: a.dead,
        facing: Math.round(a.facing * 100) / 100, spd: Math.round(a.stats.moveSpeed * a.speedMul * (a.slowT > 0 ? 1 - a.slowAmt : 1)), moving: a.moving, swing: a.swing > 0, stun: a.stunT > 0, shield: Math.round(a.shield), online: !!p.conn,
        cds: { basic: r1(a.cds.basic), s0: r1(a.cds.s0), s1: r1(a.cds.s1), s2: r1(a.cds.s2) } };
    });
  }

  function broadcast() {
    const actors = snapshotActors();
    const events = room.lastEvents; room.lastEvents = [];
    for (const p of players.values()) {
      if (p.conn) send(p.conn, { t: 'snap', tick: room.tick, state: room.state, countdown: r1(Math.max(0, room.countdown)), winner: room.winner, ack: p.lastSeq, actors, events });
    }
  }

  // ---------- relógio e batimento ----------
  let timer = null, last = Date.now(), acc = 0;
  if (autoTick) {
    timer = setInterval(() => {
      const now = Date.now(); acc = Math.min(acc + (now - last) / 1000, TICK_DT * 8); last = now;
      while (acc >= TICK_DT) { acc -= TICK_DT; simTick(); }
    }, 8);
  }
  const hb = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.ctx.alive) { ws.terminate(); continue; }
      ws.ctx.alive = false; ws.ping();
    }
  }, heartbeatMs);

  return {
    wss, world, room, players, stats,
    get port() { return wss.address()?.port; },
    ready: new Promise((res) => wss.on('listening', res)),
    step(n = 1) { for (let i = 0; i < n; i++) simTick(); }, // para testes determinísticos (autoTick:false)
    close() { clearInterval(timer); clearInterval(hb); for (const c of wss.clients) c.terminate(); return new Promise((res) => wss.close(res)); },
  };
}
