// Servidor de jogo AUTORITATIVO: WebSocket + Hub (lobby, grupos, fila) + salas de partida (1×1, 2×2, 4×4).
// O cliente envia só INTENÇÕES; a simulação (public/src/game/sim.js, a mesma do jogo) roda aqui e decide posição, dano, vida, morte e
// recompensas. Com banco (`db`) a conta é obrigatória e as recompensas são gravadas; sem banco (testes/PoC) aceita convidados.
// Continua sendo ws:// local: WSS entra atrás de um proxy TLS na implantação (ver docs/decisions/0009).
import { WebSocketServer } from 'ws';
import { makeRng } from '../public/src/core/rng.js';
import { newCharacter, POINTS_PER_LEVEL } from '../public/src/core/progression.js';
import { generateItem } from '../public/src/core/loot.js';
import { CLASSES } from '../public/src/data/classes.js';
import { SLOTS } from '../public/src/data/items.js';
import { decodeClient, encode, REJECT, RateLimiter, TICK_DT, SNAPSHOT_EVERY, TICK_HZ, PROTOCOL_VERSION } from '../public/src/core/protocol.js';
import { PVP_MIN_LEVEL } from '../public/src/core/power.js';
import { Hub } from './hub.js';

const LEVEL = 10; // convidados (sem banco): personagem padrão nível 10 gerado pelo servidor

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

export function createGameServer({
  port = 5175, host = '127.0.0.1', autoTick = true, seed = 12345, allowedOrigins = null,
  maxMsgPerSec = 120, maxErrors = 5, reconnectSec = 30, heartbeatMs = 10000,
  db = null,                 // com banco: conta + personagem do servidor e recompensas gravadas
  allowGuests = !db,         // sem banco aceita convidados com personagem padrão; com banco, conta é obrigatória
} = {}) {
  const rng = makeRng(seed);
  const stats = { connections: 0, messages: 0, rejected: 0, kicked: 0 };
  const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(encode(msg)); };
  const reject = (ws, code, close = false, extra = {}) => {
    stats.rejected++;
    send(ws, { t: 'reject', code, ...extra });
    if (close) { stats.kicked++; ws.close(1008, code); }
  };
  const hub = new Hub({ db, seed, reconnectSec, out: { send: (s, m) => send(s.ws, m), raw: (s, text) => { if (s.ws && s.ws.readyState === 1) s.ws.send(text); } } });
  Object.defineProperty(stats, 'staleInputs', { get: () => hub.stats.staleInputs, enumerable: true });

  const wss = new WebSocketServer({
    port, host, maxPayload: 2048, perMessageDeflate: false,
    verifyClient: allowedOrigins ? ({ origin }) => allowedOrigins.includes(origin) : undefined,
  });

  // ---------- entrada ----------
  function identify(msg) {
    if (msg.session) {
      if (!db) return { error: REJECT.AUTH_REQUIRED };
      const acc = db.sessionAccount(msg.session);
      if (!acc) return { error: REJECT.BAD_SESSION };
      const ch = db.ownedCharacter(acc.id, msg.characterId);
      if (!ch) return { error: REJECT.BAD_CHARACTER };
      return { doc: ch.doc, charId: ch.id, accountId: acc.id };
    }
    if (!allowGuests) return { error: REJECT.AUTH_REQUIRED };
    return { doc: buildServerChar(msg.name, msg.classId, rng.int(1, 0x3fffffff)), charId: null, accountId: null };
  }

  function join(ws, msg) {
    const c = ws.ctx;
    if (c.session) return reject(ws, REJECT.ALREADY_JOINED);
    let s = null, resumed = false;
    if (msg.token) {
      s = hub.sessionByToken(msg.token);
      if (!s || s.ws) return reject(ws, REJECT.BAD_TOKEN, true);
      if (s.accountId && (!msg.session || db.sessionAccount(msg.session)?.id !== s.accountId)) return reject(ws, REJECT.BAD_SESSION, true); // reconectar exige a mesma conta
      hub.reconnected(s, ws); resumed = true;
    } else {
      const id = identify(msg);
      if (id.error) return reject(ws, id.error, true);
      if (id.charId && hub.charOnline(id.charId)) return reject(ws, REJECT.ALREADY_ONLINE, true); // um personagem, uma conexão
      s = hub.createSession(ws, id);
    }
    c.session = s;
    send(ws, { t: 'welcome', token: s.token, name: s.name, level: s.char.level, classId: s.char.classId, account: !!s.accountId, resumed, protocol: PROTOCOL_VERSION,
      tickHz: TICK_HZ, snapEvery: SNAPSHOT_EVERY, pvpMinLevel: PVP_MIN_LEVEL, partyMax: 4 });
    if (s.room && s.player) hub.sendMatchFound(s, s.room, s.player);
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
    if (!c.session) return reject(ws, REJECT.NOT_JOINED);
    hub.handle(c.session, m);
  }

  wss.on('connection', (ws) => {
    stats.connections++;
    ws.ctx = { session: null, errors: 0, limiter: new RateLimiter(maxMsgPerSec), alive: true };
    ws.on('pong', () => { ws.ctx.alive = true; });
    ws.on('message', (data) => onMessage(ws, data));
    ws.on('close', () => { const s = ws.ctx.session; if (s && s.ws === ws) hub.disconnected(s); });
    ws.on('error', () => { /* o 'close' cuida da limpeza */ });
  });

  // ---------- relógio e batimento ----------
  let timer = null, last = Date.now(), acc = 0;
  if (autoTick) {
    timer = setInterval(() => {
      const now = Date.now(); acc = Math.min(acc + (now - last) / 1000, TICK_DT * 8); last = now;
      while (acc >= TICK_DT) { acc -= TICK_DT; hub.step(); }
    }, 8);
  }
  const hb = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.ctx.alive) { ws.terminate(); continue; }
      ws.ctx.alive = false; ws.ping();
    }
  }, heartbeatMs);

  const firstRoom = () => hub.rooms.values().next().value ?? null;
  return {
    wss, hub, stats,
    get port() { return wss.address()?.port; },
    ready: new Promise((res) => wss.on('listening', res)),
    step(n = 1) { for (let i = 0; i < n; i++) hub.step(); }, // para testes determinísticos (autoTick:false)
    // Atalhos de observação (usados pelos testes): sala mais antiga e seus jogadores.
    get room() { return firstRoom(); },
    get players() { return firstRoom()?.players ?? new Map(); },
    actor(id) { for (const r of hub.rooms.values()) { const p = r.players.get(id); if (p) return p.actor; } return null; },
    close() { clearInterval(timer); clearInterval(hb); for (const c of wss.clients) c.terminate(); return new Promise((res) => wss.close(res)); },
  };
}
