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
  CRYPT_LEVEL: 'crypt_level', CRYPT_LOCKED: 'crypt_locked', CRYPT_WAIT: 'crypt_wait', CRYPT_OVER: 'crypt_over', // Cripta dos Ecos: nível · falta chegar às Ruínas · espera (sem Chave de Eco) · a instância já terminou
  CHAT_WAIT: 'chat_wait', // chat: mensagens rápidas demais ou repetidas
  TX_WAIT: 'tx_wait', NOT_HERE: 'not_here', // transações do servidor (P11.4): pedidos rápidos demais · serviço indisponível neste lugar (ex.: loja dentro da instância)
};

// Transações de personagem decididas pelo servidor (P11.3/P11.4): o cliente só PEDE (op + id/quantidade); preço, estoque, sorteio e ouro são do servidor.
// `id` = item/missão/contrato/baú/spirit; `shop` = 'town' | 'harbor'; `n` = quantidade (poções/pergaminhos) ou raridade máxima (sell_bulk). `ids` = lista de itens a vender (sell_bulk, 1 a 30; sem `n`).
export const TX_OPS = {
  chest: { id: true }, potion: {}, spirit_set: { id: true },
  buy_item: { id: true, shop: true }, buy_potion: { n: [1, 99], shop: true }, buy_scroll: { n: [1, 99], shop: true },
  sell: { id: true, shop: true }, sell_bulk: { n: [0, 5], nOpt: true, idsMax: 30, shop: true }, enhance: { id: true },
  bank_deposit: { id: true }, bank_withdraw: { id: true }, claim_daily: { id: true },
  quest_accept: { id: true }, quest_turnin: { id: true },
  // ganhos que antes eram locais: spirits (libertar/comprar/evoluir), reciclagem, placa de lore; equipamento e atributos (valem também na instância)
  spirit_free: { id: true }, spirit_evolve: { id: true }, buy_essence: { kind: ['essence', 'prism'] }, recycle: { ids: 3 }, lore: { id: true },
  equip: { id: true }, unequip: { slot: true }, alloc: { stat: true, n: [1, 999] }, alloc_auto: {},
  mentor_talk: { id: true }, // conversa com um mentor de especialização no Porto (objetivo `talk` da Prova do Mestre; o servidor confere que o jogador está no Porto)
  respec_buy: {}, respec: { id: true }, // Mestre de Classe: comprar o Selo de Reespecialização / escolher ou trocar de especialização (o Selo é conferido e gasto no servidor)
  buy_phoenix: { n: [1, 20], shop: true }, checkpoint_set: { id: true }, // Amuleto da Fênix (preço e teto do servidor) / Pedra de Retorno (o servidor confere zona e proximidade)
  mount_use_whistle: {}, mount_set: { id: true }, // montarias: usar o Apito (o servidor sorteia a montaria e gasta o Apito) / escolher a ativa (precisa ser sua)
  refine: { id: true }, resonate: { id: true }, // Ferreiro: lapidar (troca um atributo extra sorteado) / ressonância do Eco (leva a peça ao nível atual); core/refine.js
  craft: { id: true }, // forja do Ferreiro: item Eco (fragmentos da Cripta + ouro); id = receita (data/crypt.js ECHO_RECIPES)
};
const TX_ID = /^[A-Za-z0-9_:.-]{1,48}$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Nome seguro (sem HTML): letras, números, espaço, apóstrofo, hífen, sublinhado.
export function safeName(v) {
  const s = String(v ?? '').normalize('NFC').replace(/[^\p{L}\p{N} _'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return s || 'Herói';
}

// Chat (2026-11-04): canal global (todos os conectados) ou do grupo. Texto limpo AQUI (servidor e cliente usam a mesma regra):
// sem caracteres de controle nem invisíveis (\p{Cc}/\p{Cf}: zero-width, inversão de direção), espaços colapsados, até CHAT_MAX caracteres.
// O cliente mostra o texto com textContent (nunca innerHTML), então "<b>" chega como texto e não vira HTML.
export const CHAT_MAX = 140;
export const CHAT_CHANNELS = ['global', 'party'];
export function cleanChat(v) {
  if (typeof v !== 'string') return '';
  return [...v.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim()].slice(0, CHAT_MAX).join('');
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
      if (data.cast != null && ![0, 1, 2, 3].includes(data.cast)) return { ok: false, code: REJECT.BAD_MESSAGE };
      // direção normalizada em [-1,1]; mira dentro de um limite (o servidor ainda clampa à arena)
      return { ok: true, msg: {
        t: 'input', seq: data.seq,
        mx: clamp(data.mx, -1, 1), my: clamp(data.my, -1, 1),
        aimX: clamp(data.aimX, -10000, 10000), aimY: clamp(data.aimY, -10000, 10000),
        attack: data.attack === true, cast: data.cast ?? null,
        ...(Number.isInteger(data.pick) && data.pick >= 0 && data.pick <= 127 ? { pick: data.pick } : {}), // o que o spirit busca (máscara; opção do aparelho)
        ...(data.mount === true || data.mount === false ? { mount: data.mount } : {}), // montar/desmontar: pedido aditivo (o servidor confere posse, zona e combate em game/sim.js)
        ...(data.run === true ? { run: true } : {}), // correr: campo aditivo; o servidor só o honra fora de combate e em zonas de farm (game/sim.js)
      } };
    }
    case 'queue':
      if (!QUEUE_MODES.includes(data.mode)) return { ok: false, code: REJECT.BAD_MODE };
      // `friendly` (duelo amistoso do Porto): só 1×1; sem Elo, ouro nem XP. Aditivo: cliente antigo simplesmente não envia.
      if (data.friendly !== undefined && (data.friendly !== true || data.mode !== '1v1')) return { ok: false, code: REJECT.BAD_MODE };
      return { ok: true, msg: data.friendly ? { t: 'queue', mode: data.mode, friendly: true } : { t: 'queue', mode: data.mode } };
    case 'zone_enter': // exploração no servidor: `zone` = zona de destino, `from` = zona de onde vem (o servidor confere o portal e decide o ponto de entrada)
      return ZONES[data.zone]?.mobs && (data.from === 'town' || data.from === 'resume' || ZONES[data.from]?.mobs || ZONES[data.from]?.hub) ? { ok: true, msg: { t: 'zone_enter', zone: data.zone, from: data.from } } : { ok: false, code: REJECT.BAD_MESSAGE };
    case 'zone_teleport': // teletransporte para mapa já visitado: só o destino; visitado, pergaminho, combate e limite de uso são conferidos no servidor
      return typeof data.zone === 'string' && (data.zone === 'town' || ZONES[data.zone]?.mobs || ZONES[data.zone]?.hub) ? { ok: true, msg: { t: 'zone_teleport', zone: data.zone } } : { ok: false, code: REJECT.BAD_MESSAGE };
    case 'tx': { // transação do servidor: lista branca de operações e de campos
      const spec = typeof data.op === 'string' && Object.hasOwn(TX_OPS, data.op) ? TX_OPS[data.op] : null;
      if (!spec) return { ok: false, code: REJECT.BAD_MESSAGE };
      const msg = { t: 'tx', op: data.op, req: Number.isInteger(data.req) && data.req >= 0 && data.req < 2 ** 31 ? data.req : 0 };
      if (spec.id) { if (typeof data.id !== 'string' || !TX_ID.test(data.id)) return { ok: false, code: REJECT.BAD_MESSAGE }; msg.id = data.id; }
      if (spec.shop) { if (data.shop !== undefined && data.shop !== 'town' && data.shop !== 'harbor') return { ok: false, code: REJECT.BAD_MESSAGE }; msg.shop = data.shop ?? 'town'; }
      if (spec.kind) { if (!spec.kind.includes(data.kind)) return { ok: false, code: REJECT.BAD_MESSAGE }; msg.kind = data.kind; }
      if (spec.slot) { if (!['weapon', 'armor', 'helm', 'boots', 'ring', 'amulet', 'offhand'].includes(data.slot)) return { ok: false, code: REJECT.BAD_MESSAGE }; msg.slot = data.slot; }
      if (spec.stat) { if (!['str', 'agi', 'int', 'vit'].includes(data.stat)) return { ok: false, code: REJECT.BAD_MESSAGE }; msg.stat = data.stat; }
      if (spec.ids) { if (!Array.isArray(data.ids) || data.ids.length !== spec.ids || !data.ids.every((x) => typeof x === 'string' && TX_ID.test(x))) return { ok: false, code: REJECT.BAD_MESSAGE }; msg.ids = [...data.ids]; }
      if (spec.idsMax && data.ids !== undefined) { // venda em lote por lista de ids: 1..idsMax, sem repetidos
        if (!Array.isArray(data.ids) || data.ids.length < 1 || data.ids.length > spec.idsMax || !data.ids.every((x) => typeof x === 'string' && TX_ID.test(x)) || new Set(data.ids).size !== data.ids.length) return { ok: false, code: REJECT.BAD_MESSAGE };
        msg.ids = [...data.ids];
        if (data.n !== undefined) return { ok: false, code: REJECT.BAD_MESSAGE }; // ou lista, ou raridade
      } else if (spec.n) { if (!Number.isInteger(data.n) || data.n < spec.n[0] || data.n > spec.n[1]) return { ok: false, code: REJECT.BAD_MESSAGE }; msg.n = data.n; }
      return { ok: true, msg };
    }
    case 'queue_cancel': case 'party_create': case 'party_leave': case 'zone_leave': case 'zone_respawn': case 'crypt_enter': // crypt_enter: o servidor confere nível, mapa visitado, espera/Chave e a posição (nada vem no pedido)
      return { ok: true, msg: { t: data.t } };
    case 'party_invite': case 'party_kick':
      if (typeof data.name !== 'string' || data.name.length < 1 || data.name.length > 40) return { ok: false, code: REJECT.BAD_MESSAGE };
      return { ok: true, msg: { t: data.t, name: safeName(data.name) } };
    case 'party_accept': case 'party_decline':
      return Number.isInteger(data.partyId) && data.partyId > 0 ? { ok: true, msg: { t: data.t, partyId: data.partyId } } : { ok: false, code: REJECT.BAD_MESSAGE };
    case 'chat': {
      const ch = data.ch ?? 'global', text = cleanChat(data.text);
      if (!CHAT_CHANNELS.includes(ch) || !text) return { ok: false, code: REJECT.BAD_MESSAGE };
      return { ok: true, msg: { t: 'chat', ch, text } };
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
