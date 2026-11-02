// Protocolo de rede (cliente ↔ servidor autoritativo). Sem DOM e sem dependências: o mesmo arquivo valida no servidor e é lido pelo cliente.
// Regras: toda mensagem é JSON { v, t, ... }; `v` é a versão do protocolo; o cliente só envia INTENÇÕES (nunca dano, posição final, loot).
import { CLASSES } from '../data/classes.js';
import { ZONES } from '../data/zones.js';

export const PROTOCOL_VERSION = 4; // v2: hello autenticado e reward · v3: lobby, fila, grupos e salas por modo · v4: snapshots compactos por delta (core/snapshot.js)
export const MAX_PARTY = 4;
export const QUEUE_MODES = ['1v1', '2v2', '4v4', 'coop']; // coop = PvE cooperativo (ondas + chefe) no servidor
export const TICK_HZ = 60;                    // simulação (igual ao FIXED_DT do cliente)
export const TICK_DT = 1 / TICK_HZ;
export const SNAPSHOT_EVERY = 3;              // snapshot a cada 3 ticks = 20 Hz
export const MAX_MESSAGE_BYTES = 1024;       // mensagens do cliente são minúsculas; maior que isto é abuso
export const MAX_NAME = 14;

// Códigos de recusa (o cliente decide o texto).
export const REJECT = {
  BAD_JSON: 'bad_json', BAD_VERSION: 'bad_version', BAD_MESSAGE: 'bad_message', NOT_JOINED: 'not_joined',
  ALREADY_JOINED: 'already_joined', ROOM_FULL: 'room_full', RATE_LIMIT: 'rate_limit', TOO_MANY_ERRORS: 'too_many_errors',
  BAD_TOKEN: 'bad_token', BAD_ORIGIN: 'bad_origin', SERVER_BUSY: 'server_busy',
  PVP_LOCKED: 'pvp_locked', BAD_MODE: 'bad_mode', ALREADY_QUEUED: 'already_queued', IN_MATCH: 'in_match', NOT_IN_PARTY: 'not_in_party', NOT_LEADER: 'not_leader',
  PARTY_FULL: 'party_full', PARTY_TOO_BIG: 'party_too_big', NO_SUCH_PLAYER: 'no_such_player', NO_INVITE: 'no_invite', ALREADY_IN_PARTY: 'already_in_party', SELF: 'self', MEMBER_OFFLINE: 'member_offline',
  BAD_ZONE: 'bad_zone', AUTH_REQUIRED: 'auth_required', BAD_SESSION: 'bad_session', BAD_CHARACTER: 'bad_character', ALREADY_ONLINE: 'already_online',
  NOT_VISITED: 'not_visited', NO_SCROLL: 'no_scroll', IN_COMBAT: 'in_combat', TELEPORT_WAIT: 'teleport_wait', NOT_AT_PORTAL: 'not_at_portal', // teletransporte online
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Nome seguro (sem HTML): letras, números, espaço, apóstrofo, hífen, sublinhado.
export function safeName(v) {
  const s = String(v ?? '').normalize('NFC').replace(/[^\p{L}\p{N} _'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return s || 'Herói';
}

// Valida UMA mensagem do cliente já decodificada. Devolve { ok, msg } (msg normalizada, com lista branca de campos) ou { ok:false, code }.
export function parseClientMessage(data) {
  if (!isObj(data)) return { ok: false, code: REJECT.BAD_MESSAGE };
  if (data.v !== PROTOCOL_VERSION) return { ok: false, code: REJECT.BAD_VERSION };
  switch (data.t) {
    case 'hello': {
      const token0 = data.token;
      if (data.session !== undefined) { // jogador com conta: sessão da API + personagem escolhido (o servidor carrega o personagem do banco)
        if (typeof data.session !== 'string' || !/^[A-Za-z0-9_-]{32,64}$/.test(data.session) || !Number.isInteger(data.characterId) || data.characterId < 1) return { ok: false, code: REJECT.BAD_MESSAGE };
        const tk = token0 == null ? null : (typeof token0 === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(token0) ? token0 : undefined);
        if (tk === undefined) return { ok: false, code: REJECT.BAD_TOKEN };
        return { ok: true, msg: { t: 'hello', session: data.session, characterId: data.characterId, token: tk } };
      }
      if (!CLASSES[data.classId]) return { ok: false, code: REJECT.BAD_MESSAGE };
      const token = data.token == null ? null : (typeof data.token === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(data.token) ? data.token : undefined);
      if (token === undefined) return { ok: false, code: REJECT.BAD_TOKEN };
      return { ok: true, msg: { t: 'hello', session: null, name: safeName(data.name), classId: data.classId, token } };
    }
    case 'input': {
      if (!Number.isInteger(data.seq) || data.seq < 0 || data.seq > 2 ** 31) return { ok: false, code: REJECT.BAD_MESSAGE };
      if (![data.mx, data.my, data.aimX, data.aimY].every(finite)) return { ok: false, code: REJECT.BAD_MESSAGE };
      if (data.cast != null && ![0, 1, 2].includes(data.cast)) return { ok: false, code: REJECT.BAD_MESSAGE };
      // direção normalizada em [-1,1]; mira dentro de um limite (o servidor ainda clampa à arena)
      return { ok: true, msg: {
        t: 'input', seq: data.seq,
        mx: clamp(data.mx, -1, 1), my: clamp(data.my, -1, 1),
        aimX: clamp(data.aimX, -10000, 10000), aimY: clamp(data.aimY, -10000, 10000),
        attack: data.attack === true, cast: data.cast ?? null,
      } };
    }
    case 'queue':
      return QUEUE_MODES.includes(data.mode) ? { ok: true, msg: { t: 'queue', mode: data.mode } } : { ok: false, code: REJECT.BAD_MODE };
    case 'zone_enter': // exploração no servidor: `zone` = zona de destino, `from` = zona de onde vem (o servidor confere o portal e decide o ponto de entrada)
      return ZONES[data.zone]?.mobs && (data.from === 'town' || ZONES[data.from]?.mobs) ? { ok: true, msg: { t: 'zone_enter', zone: data.zone, from: data.from } } : { ok: false, code: REJECT.BAD_MESSAGE };
    case 'zone_teleport': // teletransporte para mapa já visitado: só o destino; visitado, pergaminho, combate e limite de uso são conferidos no servidor
      return typeof data.zone === 'string' && (data.zone === 'town' || ZONES[data.zone]?.mobs) ? { ok: true, msg: { t: 'zone_teleport', zone: data.zone } } : { ok: false, code: REJECT.BAD_MESSAGE };
    case 'queue_cancel': case 'party_create': case 'party_leave': case 'zone_leave':
      return { ok: true, msg: { t: data.t } };
    case 'party_invite': case 'party_kick':
      if (typeof data.name !== 'string' || data.name.length < 1 || data.name.length > 40) return { ok: false, code: REJECT.BAD_MESSAGE };
      return { ok: true, msg: { t: data.t, name: safeName(data.name) } };
    case 'party_accept': case 'party_decline':
      return Number.isInteger(data.partyId) && data.partyId > 0 ? { ok: true, msg: { t: data.t, partyId: data.partyId } } : { ok: false, code: REJECT.BAD_MESSAGE };
    case 'ping':
      return finite(data.ts) ? { ok: true, msg: { t: 'ping', ts: data.ts } } : { ok: false, code: REJECT.BAD_MESSAGE };
    default:
      return { ok: false, code: REJECT.BAD_MESSAGE }; // inclui tentativas de enviar 'damage', 'loot', 'pos'...
  }
}

// Decodifica o texto recebido (com limite de tamanho) e valida.
export function decodeClient(text) {
  if (typeof text !== 'string' || text.length > MAX_MESSAGE_BYTES) return { ok: false, code: REJECT.BAD_MESSAGE };
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, code: REJECT.BAD_JSON }; }
  return parseClientMessage(data);
}

// Limitador de taxa por janela deslizante simples (mensagens por segundo).
export class RateLimiter {
  constructor(maxPerSec) { this.max = maxPerSec; this.stamps = []; }
  allow(now) {
    const cut = now - 1000;
    while (this.stamps.length && this.stamps[0] <= cut) this.stamps.shift();
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(now);
    return true;
  }
}

export const encode = (msg) => JSON.stringify({ v: PROTOCOL_VERSION, ...msg });
