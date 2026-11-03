// Banco do Porto de Marfim: baú pessoal de 40 vagas (`char.bank`, lista de itens como o inventário). Regras PURAS, sem DOM.
// A UI (painel do Banqueiro Octávio) só chama depositItem/withdrawItem e redesenha; o servidor pode repetir as mesmas chamadas.
// Os itens guardados continuam contando para a plausibilidade do save (server/plausible.js) e a validação (core/savedoc.js).
import { INVENTORY_SIZE } from '../data/items.js';

export const BANK_SIZE = 40;

export function ensureBank(doc) {
  if (!Array.isArray(doc.bank)) doc.bank = [];
  return doc.bank;
}
export const bankFree = (doc) => BANK_SIZE - ensureBank(doc).length;

// Inventário → banco. Só itens da mochila (equipado precisa ser tirado antes). Falha sem mudar nada.
export function depositItem(doc, itemId) {
  const bank = ensureBank(doc), inv = doc.inventory ?? (doc.inventory = []);
  const i = inv.findIndex((it) => it.id === itemId);
  if (i < 0) return { ok: false, reason: 'Item não está na mochila.' };
  if (bank.length >= BANK_SIZE) return { ok: false, reason: `O banco está cheio (${BANK_SIZE} vagas).` };
  const [it] = inv.splice(i, 1);
  bank.push(it);
  return { ok: true, item: it };
}

// Banco → inventário. Falha se a mochila estiver cheia.
export function withdrawItem(doc, itemId) {
  const bank = ensureBank(doc), inv = doc.inventory ?? (doc.inventory = []);
  const i = bank.findIndex((it) => it.id === itemId);
  if (i < 0) return { ok: false, reason: 'Item não está no banco.' };
  if (inv.length >= INVENTORY_SIZE) return { ok: false, reason: 'A mochila está cheia.' };
  const [it] = bank.splice(i, 1);
  inv.push(it);
  return { ok: true, item: it };
}
