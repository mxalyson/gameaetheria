// Cripta dos Ecos: regras puras do documento (entrada, Fragmentos de Eco e forja do Ferreiro). Sem DOM; o servidor aplica (hub.js/tx.js) e a interface só lê.
// Estado em `doc.echo = { frags, keys, entry }`: fragmentos (material só da masmorra), Chaves de Eco (pulam a espera) e o instante da última entrada (ms, hora do servidor).
import { CRYPT, ECHO_RECIPES } from '../data/crypt.js';
import { INVENTORY_SIZE } from '../data/items.js';
import { generateEchoItem } from './loot.js';

export const blankEcho = () => ({ frags: 0, keys: 0, entry: 0 });
export function ensureEcho(doc) { doc.echo = { ...blankEcho(), ...(doc.echo ?? {}) }; return doc.echo; }
export const echoFrags = (doc) => doc.echo?.frags ?? 0;
export const echoKeys = (doc) => doc.echo?.keys ?? 0;

// Segundos até a próxima entrada GRÁTIS (0 = já pode).
export const cryptWaitSec = (doc, now = Date.now()) => Math.max(0, Math.ceil(((doc.echo?.entry ?? 0) + CRYPT.cooldownSec * 1000 - now) / 1000));

// Pode entrar agora? { ok, via: 'free' | 'key', code, reason, waitSec }. `code` são os mesmos de core/protocol.js REJECT (crypt_level | crypt_locked | crypt_wait).
export function cryptEntryCheck(doc, now = Date.now()) {
  const waitSec = cryptWaitSec(doc, now);
  if ((doc.level ?? 1) < CRYPT.minLevel) return { ok: false, code: 'crypt_level', reason: `Nível ${CRYPT.minLevel} para entrar na Cripta dos Ecos.`, waitSec };
  if (!doc.visited?.[CRYPT.needVisited]) return { ok: false, code: 'crypt_locked', reason: 'Chegue às Ruínas Sombrias a pé para encontrar a entrada.', waitSec };
  if (waitSec <= 0) return { ok: true, via: 'free', waitSec };
  if (echoKeys(doc) > 0) return { ok: true, via: 'key', waitSec };
  const m = Math.ceil(waitSec / 60);
  return { ok: false, code: 'crypt_wait', reason: `A Cripta recupera o fôlego: volte em ${m} min ou use uma Chave de Eco.`, waitSec };
}
// Registra a entrada (muda o documento): a Chave só é gasta quando a espera ainda corre.
export function applyCryptEntry(doc, now = Date.now()) {
  const chk = cryptEntryCheck(doc, now);
  if (!chk.ok) return chk;
  const e = ensureEcho(doc);
  if (chk.via === 'key') e.keys--;
  e.entry = now;
  return chk;
}

// Chave de Eco por contrato do Porto entregue (core/journal.js claimDaily). Devolve 1 se ganhou, 0 se já estava no teto.
export function grantEchoKey(doc) {
  const e = ensureEcho(doc);
  if (e.keys >= CRYPT.keyMax) return 0;
  e.keys++;
  return 1;
}

const gearList = (c) => [...Object.values(c.equipment ?? {}), ...(c.inventory ?? []), ...(c.bank ?? [])];
export const ownsEcho = (doc, slot) => gearList(doc).some((it) => it.eco && it.slot === slot);

// Forja do Ferreiro (op `craft`): 1 arma e 1 armadura Eco por personagem, gastando fragmentos + ouro. Muda o documento.
export function craftEcho(doc, recipeId, rng) {
  const R = Object.hasOwn(ECHO_RECIPES, recipeId) ? ECHO_RECIPES[recipeId] : null;
  if (!R) return { ok: false, reason: 'Receita desconhecida.' };
  if (doc.level < CRYPT.minLevel) return { ok: false, reason: `O Ferreiro só forja Eco para o nível ${CRYPT.minLevel}+.` };
  if (ownsEcho(doc, R.slot)) return { ok: false, reason: 'Você já possui essa peça do Eco.' };
  if (echoFrags(doc) < R.frags) return { ok: false, reason: `Faltam fragmentos: ${R.frags} necessários (você tem ${echoFrags(doc)}).` };
  if (doc.gold < R.gold) return { ok: false, reason: 'Ouro insuficiente.' };
  if (doc.inventory.length >= INVENTORY_SIZE) return { ok: false, reason: 'Inventário cheio.' };
  const item = generateEchoItem(rng, Math.max(1, doc.level), doc.classId, R.slot);
  ensureEcho(doc).frags -= R.frags;
  doc.gold -= R.gold;
  doc.inventory.push(item);
  return { ok: true, item, frags: R.frags, gold: R.gold };
}
