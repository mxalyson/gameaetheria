import { generateItem, rollRarity } from './core/loot.js';
import { makeRng, hashString } from './core/rng.js';
import { CLASSES } from './data/classes.js';
import { SLOTS, SHIELD_CLASSES } from './data/items.js';

// Espaços sortáveis na loja (sem arma): o escudo só aparece para quem o equipa.
const gearSlots = (classId) => (SHIELD_CLASSES.includes(classId) ? SLOTS.slice(1) : SLOTS.slice(1, 6));

export const SCROLL_MAX = 99; // igual ao teto de `scrolls` em core/savedoc.js (B25)

export const PRICES = {
  potion: (level) => 15 + level * 3,
  scroll: (level) => 60 + level * 8, // pergaminho de teletransporte (uma viagem)
  essence: (level) => 250 + level * 20,
  prism: (level) => 1500 + level * 60,
  itemMarkup: 6,        // G2: era 4 (item raro custava ~1 min de renda)
  featuredMarkup: 25,   // item épico de destaque (1 por nível)
  sellRate: 0.5,        // G13: venda paga 50% do valor (economia.md)
};

// Quanto a loja paga por um item (50%, mínimo 1).
export const sellValue = (it) => Math.max(1, Math.floor(it.value * PRICES.sellRate));

// Estoque da loja determinístico por (personagem, nível, criação): recarregar a página NÃO refaz o estoque.
// Comuns/incomuns/raras (nunca épico+) e UM épico de destaque por nível. O `value` do destaque já vem inflado
// (valor·25/markup) para a UI continuar exibindo valor·itemMarkup; `baseValue` guarda o valor real, restaurado na compra.
// Ids estáveis (`shop-<semente>-<i>`): itens já comprados (no inventário/equipados) saem do estoque.
export function buildShopStock(char, opts = {}) {
  if (opts.harbor) return buildHarborStock(char, opts); // loja do Porto: estoque diário (no fim do arquivo)
  const seed = hashString(`${char.name}|${char.classId}|${char.created}|${char.level}`);
  const rng = makeRng(seed), cls = CLASSES[char.classId], tag = seed.toString(36);
  const rar = () => { const r = rollRarity(rng, 0.8); return r === 'common' ? 'uncommon' : r === 'epic' || r === 'legendary' ? 'rare' : r; };
  const stock = [
    generateItem(rng, char.level, { slot: 'weapon', weaponType: cls.weapon, rarityId: rar() }),
    ...[0, 1, 2].map(() => generateItem(rng, char.level, { classId: char.classId, slot: rng.pick(gearSlots(char.classId)), rarityId: rar() })),
  ];
  const feat = generateItem(rng, char.level, { classId: char.classId, rarityId: 'epic' });
  feat.baseValue = feat.value;
  feat.value = Math.round(feat.value * PRICES.featuredMarkup / PRICES.itemMarkup);
  stock.push(feat);
  stock.forEach((it, i) => { it.id = `shop-${tag}-${i}`; });
  const owned = new Set([...Object.values(char.equipment ?? {}), ...(char.inventory ?? [])].filter(Boolean).map((i) => i.id));
  return stock.filter((it) => !owned.has(it.id));
}

// ---------- Mercador do Porto (Bartolomeu) ----------
// Estoque ROTATIVO por dia UTC (semente = personagem + nível + dia): 6 itens, de incomum a ÉPICO (nunca lendário), 2 deles épicos "do dia".
// Preços diferentes da loja da Vila: itens comuns saem mais baratos (×5,2 em vez de ×6), épicos mais caros (×30 em vez de ×25) e o porto paga mais na venda (60%).
// Mesma convenção do destaque da Vila: `value` já vem inflado (preço/itemMarkup) para a UI exibir valor·itemMarkup; `baseValue` é o valor real, restaurado na compra
// (main.js › compra). `price` é o preço final em ouro, para quem preferir exibi-lo direto. Ids estáveis `hb-<semente>-<i>`.
export const HARBOR = { markup: 5.2, epicMarkup: 30, sellRate: 0.6, discount: 0.15 }; // discount: poções e pergaminhos (harborPrice, no fim do arquivo)
export const harborSellValue = (it) => Math.max(1, Math.floor(it.value * HARBOR.sellRate));
export function buildHarborStock(char, { day = Math.floor(Date.now() / 86400000) } = {}) {
  const seed = hashString(`harbor|${char.name}|${char.classId}|${char.created}|${char.level}|${day}`);
  const rng = makeRng(seed), cls = CLASSES[char.classId], tag = seed.toString(36);
  const rar = () => { const r = rollRarity(rng, 1.3); return r === 'common' ? 'uncommon' : r === 'legendary' ? 'epic' : r; }; // incomum → épico
  const stock = [
    generateItem(rng, char.level, { slot: 'weapon', weaponType: cls.weapon, rarityId: rar() }),
    ...[0, 1, 2].map(() => generateItem(rng, char.level, { classId: char.classId, slot: rng.pick(gearSlots(char.classId)), rarityId: rar() })),
    generateItem(rng, char.level, { classId: char.classId, slot: 'weapon', weaponType: cls.weapon, rarityId: 'epic' }),
    generateItem(rng, char.level, { classId: char.classId, slot: rng.pick(gearSlots(char.classId)), rarityId: 'epic' }),
  ];
  stock.forEach((it, i) => {
    it.id = `hb-${tag}-${i}`;
    const mk = it.rarity === 'epic' ? HARBOR.epicMarkup : HARBOR.markup;
    it.baseValue = it.value;
    it.price = Math.round(it.baseValue * mk);
    it.value = Math.round(it.price / PRICES.itemMarkup);
  });
  const owned = new Set([...Object.values(char.equipment ?? {}), ...(char.inventory ?? []), ...(char.bank ?? [])].filter(Boolean).map((i) => i.id));
  return stock.filter((it) => !owned.has(it.id));
}

// ---------- Porto: desconto e reciclagem (Mercador Bartolomeu) ----------
// Poções e pergaminhos saem 15% mais baratos no Porto (preço de atacado de cais). A UI do Mercador do Porto deve usar `harborPrice`.
export const harborPrice = (kind, level) => Math.max(1, Math.round(PRICES[kind](level) * (1 - HARBOR.discount)));
// Reciclagem: 3 itens COMUNS da mochila viram 1 item RARO da classe do personagem, no nível dele. Determinística (semente = personagem + itens).
// Só itens da mochila (nada equipado nem no banco); falha sem mudar nada. `rng` opcional (testes).
export const RECYCLE_COUNT = 3;
export function recycle(char, ids, rng = null) {
  if (!Array.isArray(ids) || ids.length !== RECYCLE_COUNT || new Set(ids).size !== RECYCLE_COUNT) return { ok: false, reason: `Entregue exatamente ${RECYCLE_COUNT} itens diferentes.` };
  const inv = char.inventory ?? [];
  const picks = ids.map((id) => inv.find((it) => it.id === id));
  if (picks.some((it) => !it)) return { ok: false, reason: 'Algum item não está na mochila.' };
  if (picks.some((it) => it.rarity !== 'common')) return { ok: false, reason: 'Só itens comuns podem ser reciclados.' };
  const r = rng ?? makeRng(hashString(`recycle|${char.name}|${char.created}|${char.level}|${[...ids].sort().join(',')}`));
  const item = generateItem(r, Math.max(1, char.level), { classId: char.classId, rarityId: 'rare' });
  char.inventory = inv.filter((it) => !ids.includes(it.id));
  char.inventory.push(item);
  return { ok: true, item };
}
