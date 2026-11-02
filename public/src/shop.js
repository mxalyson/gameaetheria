import { generateItem, rollRarity } from './core/loot.js';
import { makeRng, hashString } from './core/rng.js';
import { CLASSES } from './data/classes.js';
import { SLOTS } from './data/items.js';

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
export function buildShopStock(char) {
  const seed = hashString(`${char.name}|${char.classId}|${char.created}|${char.level}`);
  const rng = makeRng(seed), cls = CLASSES[char.classId], tag = seed.toString(36);
  const rar = () => { const r = rollRarity(rng, 0.8); return r === 'common' ? 'uncommon' : r === 'epic' || r === 'legendary' ? 'rare' : r; };
  const stock = [
    generateItem(rng, char.level, { slot: 'weapon', weaponType: cls.weapon, rarityId: rar() }),
    ...[0, 1, 2].map(() => generateItem(rng, char.level, { slot: rng.pick(SLOTS.slice(1)), rarityId: rar() })),
  ];
  const feat = generateItem(rng, char.level, { classId: char.classId, rarityId: 'epic' });
  feat.baseValue = feat.value;
  feat.value = Math.round(feat.value * PRICES.featuredMarkup / PRICES.itemMarkup);
  stock.push(feat);
  stock.forEach((it, i) => { it.id = `shop-${tag}-${i}`; });
  const owned = new Set([...Object.values(char.equipment ?? {}), ...(char.inventory ?? [])].filter(Boolean).map((i) => i.id));
  return stock.filter((it) => !owned.has(it.id));
}
