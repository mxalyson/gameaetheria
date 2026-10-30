import { CLASSES } from '../data/classes.js';
import { SLOTS, RARITIES, RARITY, WEAPON_TYPES, BASE_NAMES, EPITHETS, AFFIXES } from '../data/items.js';

let counter = 0;
export const uid = () => Date.now().toString(36) + (counter++).toString(36) + Math.floor(Math.random() * 1e6).toString(36);

// luck > 0 desloca o peso para raridades altas.
export function rollRarity(rng, luck = 0) {
  return rng.weighted(RARITIES.map((r, i) => [r.id, i === 0 ? r.weight / (1 + luck) : r.weight * (1 + luck) ** (i * 0.8)]));
}

export function generateItem(rng, level, { classId, rarityId, slot, weaponType, luck = 0 } = {}) {
  slot = slot ?? rng.pick(SLOTS);
  const rarity = RARITY[rarityId ?? rollRarity(rng, luck)];
  const tier = Math.min(3, Math.floor(level / 8));
  const roll = () => rng.range(0.88, 1.12);
  const stats = {};

  if (slot === 'weapon') {
    weaponType = weaponType ?? (classId && rng.chance(0.75) ? CLASSES[classId].weapon : rng.pick(Object.keys(WEAPON_TYPES)));
    stats.atk = Math.round((6 + level * 2.4) * rarity.mul * roll());
  } else if (slot === 'armor') {
    stats.def = Math.round((3 + level * 1.6) * rarity.mul * roll());
    stats.hp = Math.round((10 + level * 5) * rarity.mul * roll());
  } else if (slot === 'helm' || slot === 'boots') {
    stats.def = Math.round((2 + level * 0.9) * rarity.mul * roll());
  }

  // Joias sempre ganham um afixo extra (não têm atributo base).
  const nAffixes = rarity.affixes + (slot === 'ring' || slot === 'amulet' ? 1 : 0);
  const pool = AFFIXES.filter((a) => !(a.stat in stats) || a.stat === 'hp' || a.stat === 'def');
  for (let i = 0; i < nAffixes && pool.length; i++) {
    const idx = Math.floor(rng.next() * pool.length);
    const a = pool.splice(idx, 1)[0];
    const v = a.flat
      ? Math.round(rng.int(a.flat[0], a.flat[1]) * rarity.mul)
      : Math.max(1, Math.round(level * a.per * rng.range(0.7, 1.2) * rarity.mul + (a.per >= 1 ? a.per * 2 : 1)));
    stats[a.stat] = (stats[a.stat] ?? 0) + v;
  }

  const baseKey = slot === 'weapon' ? weaponType : slot;
  let name = BASE_NAMES[baseKey][tier];
  if (rarity.index >= 2) name += ' ' + rng.pick(EPITHETS);

  return {
    id: uid(), kind: 'gear', name, slot, weaponType: slot === 'weapon' ? weaponType : null,
    rarity: rarity.id, level, reqLevel: Math.max(1, level - 2), stats,
    value: Math.round((6 + level * 3) * rarity.mul ** 2),
  };
}

// Recompensas de um mob abatido (ouro, item, essência de spirit).
export function rollMobLoot(rng, mob, playerClassId) {
  const out = [{ kind: 'gold', amount: rng.int(mob.level * 2 + 1, mob.level * 4 + 3) * (mob.boss ? 8 : mob.elite ? 3 : 1) }];
  const itemChance = mob.boss ? 1 : mob.elite ? 0.6 : 0.14;
  const nItems = mob.boss ? rng.int(2, 3) : 1;
  for (let i = 0; i < nItems; i++) {
    if (rng.chance(itemChance)) out.push({ kind: 'item', item: generateItem(rng, mob.level, { classId: playerClassId, luck: mob.boss ? 2.5 : mob.elite ? 1 : 0 }) });
  }
  if (rng.chance(mob.boss ? 0.25 : mob.elite ? 0.05 : 0.012)) out.push({ kind: 'essence', luck: mob.boss ? 1.5 : 0.3 });
  if (rng.chance(mob.boss ? 1 : 0.04)) out.push({ kind: 'potion', amount: mob.boss ? 3 : 1 });
  return out;
}
