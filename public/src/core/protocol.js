// Protocolo de rede (cliente ↔ servidor autoritativo). Sem DOM e sem dependências: o mesmo arquivo valida no servidor e é lido pelo cliente.
// Regras: toda mensagem é JSON { v, t, ... }; `v` é a versão do protocolo; o cliente só envia INTENÇÕES (nunca dano, posição final, loot).
import { CLASSES } from '../data/classes.js';

export const PROTOCOL_VERSION = 1;
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
      if (!CLASSES[data.classId]) return { ok: false, code: REJECT.BAD_MESSAGE };
      const token = data.token == null ? null : (typeof data.token === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(data.token) ? data.token : undefined);
      if (token === undefined) return { ok: false, code: REJECT.BAD_TOKEN };
      return { ok: true, msg: { t: 'hello', name: safeName(data.name), classId: data.classId, token } };
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
