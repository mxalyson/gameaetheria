import { CLASSES } from '../data/classes.js';
import { SLOTS, RARITIES, RARITY, WEAPON_TYPES, BASE_NAMES, GEAR_NAMES, EPITHETS, AFFIXES, OPAL_NAMES } from '../data/items.js';

let counter = 0;
export const uid = () => Date.now().toString(36) + (counter++).toString(36) + Math.floor(Math.random() * 1e6).toString(36);

// luck > 0 desloca o peso para raridades altas.
export function rollRarity(rng, luck = 0) {
  return rng.weighted(RARITIES.map((r, i) => [r.id, i === 0 ? r.weight / (1 + luck) : r.weight * (1 + luck) ** (i * 0.8)]));
}

export function generateItem(rng, level, { classId, rarityId, slot, weaponType, luck = 0 } = {}) {
  slot = slot ?? rng.pick(SLOTS);
  // Tudo é da classe: o item nasce com `classId` (arma: a do tipo de arma; sem classe informada, sorteia uma).
  if (slot === 'weapon' && weaponType && WEAPON_TYPES[weaponType]) classId = WEAPON_TYPES[weaponType].classId;
  if (!CLASSES[classId]) classId = rng.pick(Object.keys(CLASSES));
  const rarity = RARITY[rarityId ?? rollRarity(rng, luck)];
  const tier = Math.min(3, Math.floor(level / 8));
  const roll = () => rng.range(0.85, 1.15); // faixa de variação do atributo base: dois itens do mesmo tipo/raridade raramente são iguais
  const stats = {};

  if (slot === 'weapon') {
    weaponType = weaponType ?? CLASSES[classId]?.weapon ?? rng.pick(Object.keys(WEAPON_TYPES));
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
    // anel/amuleto: o primeiro afixo é sempre o atributo principal da classe (stats focados na classe)
    const pi = i === 0 && (slot === 'ring' || slot === 'amulet') ? pool.findIndex((x) => x.stat === CLASSES[classId].primary) : -1;
    const a = pool.splice(pi >= 0 ? pi : idx, 1)[0];
    const v = a.flat
      ? Math.round(rng.int(a.flat[0], a.flat[1]) * rarity.mul)
      : Math.max(1, Math.round(level * a.per * rng.range(0.7, 1.2) * rarity.mul + (a.per >= 1 ? a.per * 2 : 1)));
    stats[a.stat] = (stats[a.stat] ?? 0) + v;
  }

  let name = slot === 'weapon' ? BASE_NAMES[weaponType][tier] : GEAR_NAMES[classId][slot][tier];
  if (rarity.index >= 2) name += ' ' + rng.pick(EPITHETS);

  return {
    id: uid(), kind: 'gear', name, slot, classId, weaponType: slot === 'weapon' ? weaponType : null,
    rarity: rarity.id, level, reqLevel: Math.max(1, level - 2), stats,
    value: Math.round((6 + level * 3) * rarity.mul ** 2),
  };
}

// ---------- fontes de drop ----------
// Pesos de raridade [comum, incomum, raro, épico, lendário] por fonte. Baú usa `luck` (rollRarity) pelo tier.
export const LOOT_SOURCES = {
  mob: { weights: [67, 26, 6.4, 0.55, 0.05], chance: 0.14, items: [1, 1] },
  elite: { weights: [34, 40, 21.5, 4, 0.5], chance: 0.7, items: [1, 2] },
  boss: { weights: [0, 20, 50, 26, 4], chance: 1, items: [2, 3] },
  // Cavaleiro Rubro: o ritual + recarga longa pagam mais (itens a mais e metade deles épico ou melhor).
  finalboss: { weights: [0, 0, 35, 48, 17], chance: 1, items: [3, 4] },
};
// Proteção de azar: cada item que cai sem ser épico+ (ou lendário) aumenta o peso; garantido ao atingir o teto. Zera ao obter.
export const PITY = { epicStep: 0.015, epicCap: 120, legStep: 0.004, legCap: 600, surprise: 0.015 };
export const newPity = () => ({ epic: 0, legendary: 0, opal: 0 });

// Raridade de UM item de uma fonte, com pity opcional (objeto mutável { epic, legendary }) e chance pequena de "surpresa" (1–2 raridades acima).
export function rollSourceRarity(rng, source, pity = null) {
  const w = [...LOOT_SOURCES[source].weights];
  if (pity) {
    const em = pity.epic >= PITY.epicCap ? 1e6 : 1 + pity.epic * PITY.epicStep;
    const lm = pity.legendary >= PITY.legCap ? 1e6 : 1 + pity.legendary * PITY.legStep;
    w[3] *= em; w[4] *= Math.max(em * 0.5, lm);
  }
  let idx = rng.weighted(w.map((x, i) => [i, x]));
  if (rng.chance(PITY.surprise)) idx = Math.min(RARITIES.length - 1, idx + (rng.chance(0.2) ? 2 : 1));
  if (pity) {
    if (idx >= 3) pity.epic = 0; else pity.epic++;
    if (idx >= 4) pity.legendary = 0; else pity.legendary++;
  }
  return RARITIES[idx].id;
}

// ---------- item exclusivo do último chefe (tema ópalo) ----------
export const OPAL_BOSS = 'infernoknight';
export const OPAL = { base: 0.5, perMiss: 0.25, legendary: 0.25, weaponShare: 0.6, statMul: 1.5 };
export function generateOpalItem(rng, level, classId, forceSlot = null) {
  const weapon = forceSlot ? forceSlot === 'weapon' : rng.chance(OPAL.weaponShare);
  const rarityId = rng.chance(OPAL.legendary) ? 'legendary' : 'epic';
  const cls = CLASSES[classId] ?? CLASSES.warrior;
  const it = generateItem(rng, level, weapon ? { slot: 'weapon', weaponType: cls.weapon, rarityId } : { slot: 'armor', classId, rarityId });
  for (const k of Object.keys(it.stats)) it.stats[k] = Math.round(it.stats[k] * OPAL.statMul);
  if (weapon) { it.stats.crit = (it.stats.crit ?? 0) + 6; it.stats.atkSpeed = (it.stats.atkSpeed ?? 0) + 6; it.stats.lifesteal = (it.stats.lifesteal ?? 0) + 4; }
  else { it.stats.vit = (it.stats.vit ?? 0) + Math.round(level * 0.6); it.stats.moveSpeed = (it.stats.moveSpeed ?? 0) + 5; it.stats.lifesteal = (it.stats.lifesteal ?? 0) + 3; }
  it.name = (weapon ? OPAL_NAMES[it.weaponType] : OPAL_NAMES.armor) + (rarityId === 'legendary' ? ' Radiante' : '');
  it.opal = true;
  it.value = Math.round(it.value * 2);
  return it;
}

// Recompensas de um mob abatido (ouro, item, essência de spirit). `pity` (opcional): contadores do personagem, alterados no lugar.
export function rollMobLoot(rng, mob, playerClassId, pity = null) {
  if (mob.summoned) return []; // esbirros de chefe não dão nada
  const source = mob.mobId === OPAL_BOSS ? 'finalboss' : mob.boss ? 'boss' : mob.elite ? 'elite' : 'mob';
  const S = LOOT_SOURCES[source];
  const out = [{ kind: 'gold', amount: rng.int(mob.level * 2 + 1, mob.level * 4 + 3) * (mob.boss ? 8 : mob.elite ? 3 : 1) }];
  const nItems = rng.int(S.items[0], S.items[1]);
  for (let i = 0; i < nItems; i++) {
    // lootMul (World.onMobDeath): abates repetidos do mesmo chefe em 30 min valem menos itens
    if (!rng.chance((i === 0 ? S.chance : S.chance * 0.5) * (mob.lootMul ?? 1))) continue;
    out.push({ kind: 'item', item: generateItem(rng, mob.level, { classId: playerClassId, rarityId: rollSourceRarity(rng, source, pity) }) });
  }
  if (mob.mobId === OPAL_BOSS) { // exclusivo: chance base + pity por abate sem drop
    const p = OPAL.base + OPAL.perMiss * (pity?.opal ?? 0);
    if (rng.chance(pity ? p : 0.35)) { out.push({ kind: 'item', item: generateOpalItem(rng, mob.level, playerClassId) }); if (pity) pity.opal = 0; }
    else if (pity) pity.opal++;
  }
  if (rng.chance(mob.boss ? 0.25 : mob.elite ? 0.05 : 0.012)) out.push({ kind: 'essence', luck: mob.boss ? 1.5 : 0.3 });
  if (rng.chance(mob.boss ? 1 : 0.04)) out.push({ kind: 'potion', amount: mob.boss ? 3 : 1 });
  return out;
}
