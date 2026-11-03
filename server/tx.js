// Transações de personagem do servidor (P11.3/P11.4): baú, compra, venda, aprimoramento, banco, contratos, missões, poção e spirit.
// O cliente só PEDE (core/protocol.js › TX_OPS); aqui o servidor confere tudo no documento OFICIAL do banco e devolve o novo documento.
// Função pura sobre o documento (testável sem rede): runTx(doc, m, ctx) -> { doc, summary } ou lança TxError (a operação do banco reverte).
// Toda transação passa por db.applyOperation (idempotente, uma gravação atômica) e pelo mesmo `validate` do restante do servidor.
import { openChest, claimDaily, acceptQuest, turnInQuest, recordEvent, ensureJournal, dayUTC } from '../public/src/core/journal.js';
import { enhance, findGear } from '../public/src/core/enhance.js';
import { depositItem, withdrawItem } from '../public/src/core/bank.js';
import { buildShopStock, buildHarborStock, PRICES, sellValue, harborSellValue, harborPrice, SCROLL_MAX } from '../public/src/shop.js';
import { INVENTORY_SIZE, RARITY } from '../public/src/data/items.js';
import { validate } from '../public/src/core/savedoc.js';
import { QUESTS } from '../public/src/data/quests.js';

export class TxError extends Error {}
const fail = (msg) => { throw new TxError(msg); };

export const POTION_HEAL = 0.35;   // fração da vida (igual ao jogo offline)
export const POTION_COOLDOWN = 8;  // s
export const CHEST_REACH = 130;    // px entre o ATOR do servidor e o baú (o cliente abre a 70; folga para latência)

// Onde cada operação existe: dentro da instância só baú/poção/spirit; nas cidades, o resto. Devolve o código de recusa ou null.
export function placeProblem(op, { inZone, hubAt, shop = 'town' }) {
  const inst = op === 'chest' || op === 'potion';
  if (inZone) return op === 'spirit_set' || inst ? null : 'not_here';
  if (inst) return 'not_here';
  const harborOnly = op === 'bank_deposit' || op === 'bank_withdraw' || op === 'claim_daily';
  if (harborOnly && hubAt !== 'harbor') return 'not_here';
  if (shop === 'harbor' && hubAt !== 'harbor') return 'not_here';
  if (shop === 'town' && hubAt && ['buy_item', 'buy_potion', 'buy_scroll', 'sell', 'sell_bulk'].includes(op)) return 'not_here'; // lojas da Vila só na Vila
  return null;
}

// Estoque oficial da loja (recalculado do documento fresco; o cliente não envia preço nem item).
export function stockFor(doc, shop, now) {
  return shop === 'harbor' ? buildHarborStock(doc, { day: dayUTC(now) }) : buildShopStock(doc);
}

const questsReady = (out) => out.quests.filter((q) => q.complete).map((q) => q.id);

// ctx: { rng, now, room?, player? (para baú e poção), hubAt }
export function runTx(doc, m, ctx) {
  const c = structuredClone(doc);
  ensureJournal(c);
  const now = ctx.now ?? Date.now(), lv = c.level, shop = m.shop ?? 'town', harbor = shop === 'harbor';
  const s = { op: m.op };
  switch (m.op) {
    case 'chest': {
      const a = ctx.player?.actor, zone = ctx.room?.world?.zone;
      const chest = zone?.chests?.find((x) => x.id === m.id);
      if (!a || !chest) fail('Baú inexistente aqui.');
      if (a.dead) fail('Você está caído.');
      if (Math.hypot(a.x - chest.x, a.y - chest.y) > CHEST_REACH) fail('Chegue mais perto do baú.');
      const r = openChest(c, chest, ctx.room.zoneId, ctx.rng, now);
      if (!r.ok) fail(r.reason);
      Object.assign(s, { gold: r.gold, item: r.item, quests: questsReady(r), achievements: r.achievements, chestId: chest.id });
      break;
    }
    case 'potion': {
      if (c.potions < 1) fail('Sem poções! Compre com a Mercadora Lia.');
      c.potions--; s.potions = c.potions;
      break;
    }
    case 'spirit_set': {
      if (!c.spirits.some((x) => x.id === m.id)) fail('Spirit não encontrado.');
      c.activeSpirit = m.id; s.spirit = m.id;
      break;
    }
    case 'buy_item': {
      const it = stockFor(c, shop, now).find((x) => x.id === m.id);
      if (!it) fail('Esse item não está mais à venda.');
      if (c.inventory.length >= INVENTORY_SIZE) fail('Inventário cheio.');
      const price = Math.round(it.price ?? it.value * PRICES.itemMarkup);
      if (c.gold < price) fail('Ouro insuficiente.');
      c.gold -= price;
      delete it.price;
      if (it.baseValue != null) { it.value = it.baseValue; delete it.baseValue; } // volta ao valor real (venda e teto de plausibilidade)
      c.inventory.push(it);
      Object.assign(s, { price, itemId: it.id, name: it.name });
      break;
    }
    case 'buy_potion': {
      const price = (harbor ? harborPrice('potion', lv) : PRICES.potion(lv)) * m.n;
      if (c.gold < price) fail('Ouro insuficiente.');
      if (c.potions + m.n > 999) fail('Você já carrega poções demais.');
      c.gold -= price; c.potions += m.n; s.price = price;
      break;
    }
    case 'buy_scroll': {
      if ((c.scrolls ?? 0) + m.n > SCROLL_MAX) fail(`Você já carrega o máximo (${SCROLL_MAX}).`);
      const price = (harbor ? harborPrice('scroll', lv) : PRICES.scroll(lv)) * m.n;
      if (c.gold < price) fail('Ouro insuficiente.');
      c.gold -= price; c.scrolls = (c.scrolls ?? 0) + m.n; s.price = price; s.scrolls = c.scrolls;
      break;
    }
    case 'sell': {
      const i = c.inventory.findIndex((x) => x.id === m.id);
      if (i < 0) fail('Item não está na mochila.');
      const pay = (harbor ? harborSellValue : sellValue)(c.inventory[i]);
      c.inventory.splice(i, 1); c.gold += pay; s.pay = pay;
      break;
    }
    case 'sell_bulk': { // vende da mochila tudo até a raridade `n` (índice em RARITY)
      const sold = c.inventory.filter((x) => RARITY[x.rarity].index <= m.n);
      if (!sold.length) fail('Nada para vender.');
      const pay = sold.reduce((t, x) => t + (harbor ? harborSellValue : sellValue)(x), 0);
      c.inventory = c.inventory.filter((x) => RARITY[x.rarity].index > m.n);
      c.gold += pay; s.pay = pay; s.count = sold.length;
      break;
    }
    case 'enhance': {
      const r = enhance(c, m.id);
      if (!r.ok) fail(r.reason);
      recordEvent(c, { type: 'upgrade' }, now);
      Object.assign(s, { cost: r.cost, plus: r.plus, name: findGear(c, m.id).name });
      break;
    }
    case 'bank_deposit': {
      const r = depositItem(c, m.id);
      if (!r.ok) fail(r.reason);
      const ev = recordEvent(c, { type: 'bank' }, now);
      Object.assign(s, { quests: questsReady(ev), achievements: ev.achievements });
      break;
    }
    case 'bank_withdraw': {
      const r = withdrawItem(c, m.id);
      if (!r.ok) fail(r.reason);
      break;
    }
    case 'claim_daily': {
      const r = claimDaily(c, m.id, now);
      if (!r.ok) fail(r.reason);
      Object.assign(s, { reward: r.reward, levels: r.levels, quests: questsReady(r), achievements: r.achievements });
      break;
    }
    case 'quest_accept': {
      const r = acceptQuest(c, m.id, now);
      if (!r.ok) fail(r.reason);
      s.questId = m.id;
      break;
    }
    case 'quest_turnin': {
      if (!QUESTS[m.id]) fail('Missão inexistente.');
      const r = turnInQuest(c, m.id, ctx.rng, now);
      if (!r.ok) fail(r.reason);
      Object.assign(s, { reward: r.reward, quests: questsReady(r), achievements: r.achievements, levels: r.reward.levels, level: c.level });
      break;
    }
    default: fail('Operação desconhecida.');
  }
  const v = validate(c);
  if (!v.ok) fail('Documento inválido após a transação: ' + v.reason);
  s.goldTotal = v.char.gold; s.potionsTotal = v.char.potions;
  return { doc: v.char, summary: s };
}
