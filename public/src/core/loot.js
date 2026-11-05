import { CLASSES } from '../data/classes.js';
import { rollBossWhistle } from './mounts.js';
import { CRYPT, ECHO_NAMES, ECHO_ITEM } from '../data/crypt.js';
import { SLOTS, RARITIES, RARITY, WEAPON_TYPES, BASE_NAMES, GEAR_NAMES, EPITHETS, AFFIXES, OPAL_NAMES, SHIELD_CLASSES, SHIELD_BLOCK, WEAPON_IMPLICIT } from '../data/items.js';

let counter = 0;
export const uid = () => Date.now().toString(36) + (counter++).toString(36) + Math.floor(Math.random() * 1e6).toString(36);

// Afixos possíveis para um item: sem repetir o que a base já tem (vida/defesa podem somar) e escudo só defensivo. O resto é sorte (como sempre foi).
export function affixPool(slot, stats) {
  return AFFIXES.filter((a) => (!(a.stat in stats) || a.stat === 'hp' || a.stat === 'def') && (slot !== 'offhand' || a.stat === 'hp' || a.stat === 'def'));
}
export function rollAffixValue(rng, a, level, rarity) {
  return a.flat
    ? Math.round(rng.int(a.flat[0], a.flat[1]) * rarity.mul)
    : Math.max(1, Math.round(level * a.per * rng.range(0.7, 1.2) * rarity.mul + (a.per >= 1 ? a.per * 2 : 1)));
}

// luck > 0 desloca o peso para raridades altas.
export function rollRarity(rng, luck = 0) {
  return rng.weighted(RARITIES.map((r, i) => [r.id, i === 0 ? r.weight / (1 + luck) : r.weight * (1 + luck) ** (i * 0.8)]));
}

export function generateItem(rng, level, { classId, rarityId, slot, weaponType, luck = 0 } = {}) {
  // escudo só cai para quem o usa: as demais classes sorteiam entre os 6 espaços de sempre (mesma sequência de antes)
  slot = slot ?? rng.pick(SHIELD_CLASSES.includes(classId) ? SLOTS : SLOTS.slice(0, 6));
  if (slot === 'offhand' && !SHIELD_CLASSES.includes(classId)) classId = SHIELD_CLASSES[0];
  // Tudo é da classe: o item nasce com `classId` (arma: a do tipo de arma; sem classe informada, sorteia uma).
  if (slot === 'weapon' && weaponType && WEAPON_TYPES[weaponType]) classId = WEAPON_TYPES[weaponType].classId;
  if (!CLASSES[classId]) classId = rng.pick(Object.keys(CLASSES));
  const rarity = RARITY[rarityId ?? rollRarity(rng, luck)];
  const tier = Math.min(3, Math.floor(level / 8));
  const roll = () => rng.range(0.85, 1.15); // faixa de variação do atributo base: dois itens do mesmo tipo/raridade raramente são iguais
  const stats = {};

  const primary = CLASSES[classId].primary;
  if (slot === 'weapon') {
    weaponType = weaponType ?? CLASSES[classId]?.weapon ?? rng.pick(Object.keys(WEAPON_TYPES));
    stats.atk = Math.round((6 + level * 2.4) * rarity.mul * roll());
    // atributo implícito: toda arma traz o atributo principal da classe (arco → Agilidade), até a comum de nível 1
    stats[primary] = Math.max(1, Math.round((1 + level * WEAPON_IMPLICIT) * rarity.mul * roll()));
  } else if (slot === 'armor') {
    stats.def = Math.round((3 + level * 1.6) * rarity.mul * roll());
    stats.hp = Math.round((10 + level * 5) * rarity.mul * roll());
  } else if (slot === 'offhand') {
    stats.def = Math.round((0.5 + level * 0.15) * rarity.mul * roll());
    stats.hp = Math.round((1 + level * 0.25) * rarity.mul * roll());
    stats.block = SHIELD_BLOCK[rarity.id];
  } else if (slot === 'helm' || slot === 'boots') {
    stats.def = Math.round((2 + level * 0.9) * rarity.mul * roll());
  }

  // Joias sempre ganham um afixo extra (não têm atributo base).
  const nAffixes = slot === 'offhand' ? 0 : rarity.affixes + (slot === 'ring' || slot === 'amulet' ? 1 : 0); // escudo: sem afixos (defesa, vida e bloqueio já são o item; medido em npm run balance)
  // escudo: afixos só defensivos (vida/defesa); ataque e atributo principal ficam com as outras peças (não vira 7º espaço de poder)
  const pool = affixPool(slot, stats);
  const affix = {}; // só os afixos sorteados (a lapidação troca um deles; a base e o implícito ficam)
  for (let i = 0; i < nAffixes && pool.length; i++) {
    const idx = Math.floor(rng.next() * pool.length);
    // anel/amuleto: o primeiro afixo é sempre o atributo principal da classe (stats focados na classe)
    const pi = i === 0 && (slot === 'ring' || slot === 'amulet') ? pool.findIndex((x) => x.stat === primary) : -1;
    const a = pool.splice(pi >= 0 ? pi : idx, 1)[0];
    const v = rollAffixValue(rng, a, level, rarity);
    stats[a.stat] = (stats[a.stat] ?? 0) + v;
    affix[a.stat] = v;
  }

  let name = slot === 'weapon' ? BASE_NAMES[weaponType][tier] : GEAR_NAMES[classId][slot][tier];
  if (rarity.index >= 2) name += ' ' + rng.pick(EPITHETS);

  return {
    id: uid(), kind: 'gear', name, slot, classId, weaponType: slot === 'weapon' ? weaponType : null,
    rarity: rarity.id, level, reqLevel: Math.max(1, level - 2), stats, affix,
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
  for (const k of Object.keys(it.affix)) it.affix[k] = Math.round(it.affix[k] * OPAL.statMul);
  if (weapon) { it.stats.crit = (it.stats.crit ?? 0) + 6; it.stats.atkSpeed = (it.stats.atkSpeed ?? 0) + 6; it.stats.lifesteal = (it.stats.lifesteal ?? 0) + 4; }
  else { it.stats.vit = (it.stats.vit ?? 0) + Math.round(level * 0.6); it.stats.moveSpeed = (it.stats.moveSpeed ?? 0) + 5; it.stats.lifesteal = (it.stats.lifesteal ?? 0) + 3; }
  it.name = (weapon ? OPAL_NAMES[it.weaponType] : OPAL_NAMES.armor) + (rarityId === 'legendary' ? ' Radiante' : '');
  it.opal = true;
  it.value = Math.round(it.value * 2);
  return it;
}

// Recompensas de um mob abatido (ouro, item, essência de spirit). `pity` (opcional): contadores do personagem, alterados no lugar.
// rewardMul (bônus noturno, core/daycycle.js): multiplica o ouro e a chance dos itens; 1 de dia.
export function rollMobLoot(rng, mob, playerClassId, pity = null, rewardMul = 1) {
  if (mob.summoned) return []; // esbirros de chefe não dão nada
  const source = mob.mobId === OPAL_BOSS ? 'finalboss' : mob.boss ? 'boss' : mob.elite ? 'elite' : 'mob';
  const S = LOOT_SOURCES[source];
  const out = [{ kind: 'gold', amount: Math.round(rng.int(mob.level * 2 + 1, mob.level * 4 + 3) * (mob.boss ? 8 : mob.elite ? 3 : 1) * rewardMul) }];
  const nItems = rng.int(S.items[0], S.items[1]);
  for (let i = 0; i < nItems; i++) {
    // lootMul (World.onMobDeath): abates repetidos do mesmo chefe em 30 min valem menos itens
    if (!rng.chance((i === 0 ? S.chance : S.chance * 0.5) * (mob.lootMul ?? 1) * rewardMul)) continue;
    out.push({ kind: 'item', item: generateItem(rng, mob.level, { classId: playerClassId, rarityId: rollSourceRarity(rng, source, pity) }) });
  }
  if (mob.mobId === OPAL_BOSS) { // exclusivo: chance base + pity por abate sem drop
    const p = OPAL.base + OPAL.perMiss * (pity?.opal ?? 0);
    if (rng.chance(pity ? p : 0.35)) { out.push({ kind: 'item', item: generateOpalItem(rng, mob.level, playerClassId) }); if (pity) pity.opal = 0; }
    else if (pity) pity.opal++;
  }
  if (rng.chance(mob.boss ? 0.25 : mob.elite ? 0.05 : 0.012)) out.push({ kind: 'essence', luck: mob.boss ? 1.5 : 0.3 });
  if (rng.chance(mob.boss ? 1 : 0.04)) out.push({ kind: 'potion', amount: mob.boss ? 3 : 1 });
  if (mob.boss && rollBossWhistle(rng, pity)) out.push({ kind: 'whistle', amount: 1 }); // Apito de Montaria (core/mounts.js): só chefes, com pity; sem pity (cooperativo) não rola
  return out;
}

// ---------- Cripta dos Ecos (masmorra, decisão 0017) ----------
// Item Eco: arma ou armadura da classe, épico com atributos base ×ECHO_ITEM.statMul e bônus fixos. Só nasce no servidor (drop do chefe ou forja do Ferreiro).
export function generateEchoItem(rng, level, classId, slot = 'weapon') {
  const weapon = slot === 'weapon';
  const cls = CLASSES[classId] ?? CLASSES.warrior;
  const it = generateItem(rng, level, weapon ? { slot: 'weapon', weaponType: cls.weapon, rarityId: 'epic' } : { slot: 'armor', classId: cls.id ?? classId, rarityId: 'epic' });
  for (const k of Object.keys(it.stats)) it.stats[k] = Math.round(it.stats[k] * ECHO_ITEM.statMul);
  for (const k of Object.keys(it.affix)) it.affix[k] = Math.round(it.affix[k] * ECHO_ITEM.statMul);
  for (const [k, v] of Object.entries(ECHO_ITEM[weapon ? 'weapon' : 'armor'])) it.stats[k] = (it.stats[k] ?? 0) + v;
  if (!weapon) it.stats.vit = (it.stats.vit ?? 0) + Math.round(level * ECHO_ITEM.vitPerLevel);
  it.name = weapon ? ECHO_NAMES.weapon[it.weaponType] : ECHO_NAMES.armor[it.classId];
  it.eco = true;
  it.value = Math.round(it.value * 2);
  return it;
}
// Fragmentos de uma sala limpa (kind 'room', índice da sala) ou do chefe (kind 'boss'); sorteio individual do herói.
export function rollCryptFrags(rng, kind, room = 0) {
  const [a, b] = kind === 'boss' ? CRYPT.frags.boss : CRYPT.frags.room[Math.max(0, Math.min(CRYPT.frags.room.length - 1, room))];
  return rng.int(a, b);
}
// Item Eco direto do chefe (chance por herói); null se não saiu.
export function rollEchoDrop(rng, level, classId) {
  if (!rng.chance(CRYPT.itemChance)) return null;
  return generateEchoItem(rng, level, classId, rng.chance(CRYPT.itemWeaponShare) ? 'weapon' : 'armor');
}
