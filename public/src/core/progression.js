import { CLASSES } from '../data/classes.js';
import { SPIRITS, SPIRIT_RARITY_MUL } from '../data/spirits.js';
import { generateItem, rollRarity, uid } from './loot.js';

export const MAX_LEVEL = 30;
export const POINTS_PER_LEVEL = 5;

export const xpToNext = (level) => Math.round(60 * level ** 1.55);

// Retorna quantos níveis foram ganhos.
export function addXp(char, amount) {
  if (char.level >= MAX_LEVEL) return 0;
  char.xp += Math.round(amount);
  let gained = 0;
  while (char.level < MAX_LEVEL && char.xp >= xpToNext(char.level)) {
    char.xp -= xpToNext(char.level);
    char.level++;
    char.statPoints += POINTS_PER_LEVEL;
    gained++;
  }
  if (char.level >= MAX_LEVEL) char.xp = 0;
  return gained;
}

// Mobs muito abaixo do seu nível dão pouco XP; acima dão bônus (limitado).
export function mobXp(mobLevel, playerLevel, mul = 1) {
  const diff = mobLevel - playerLevel;
  const factor = diff < -5 ? 0.1 : diff < -2 ? 0.5 : 1 + Math.min(0.5, Math.max(0, diff) * 0.1);
  return (12 + mobLevel * 6) * mul * factor;
}

export function newCharacter(name, classId, rng) {
  const char = {
    version: 1, name, classId, level: 1, xp: 0, statPoints: 0,
    alloc: { str: 0, agi: 0, int: 0, vit: 0 },
    gold: 60, potions: 3, equipment: {}, inventory: [],
    spirits: [], activeSpirit: null,
    arena: { rating: 1000, wins: 0, losses: 0, bestWave: 0 },
    created: Date.now(),
  };
  char.equipment.weapon = generateItem(rng, 1, { slot: 'weapon', rarityId: 'common', weaponType: CLASSES[classId].weapon });
  char.equipment.armor = generateItem(rng, 1, { slot: 'armor', rarityId: 'common' });
  return char;
}

// ---- Spirits ----
export function createSpirit(rng, { type, rarity, luck = 0, level = 1 } = {}) {
  type = type ?? rng.pick(Object.keys(SPIRITS));
  return { id: uid(), type, rarity: rarity ?? rollRarity(rng, luck), level, xp: 0 };
}

export const spiritXpToNext = (level) => Math.round(45 * level ** 1.5);

export function spiritPower(sp) {
  return Math.round((6 + sp.level * 3.2) * SPIRIT_RARITY_MUL[sp.rarity]);
}

// O spirit não ultrapassa o nível do dono.
export function addSpiritXp(sp, amount, capLevel) {
  if (sp.level >= capLevel) { sp.xp = 0; return 0; }
  sp.xp += Math.round(amount);
  let gained = 0;
  while (sp.level < capLevel && sp.xp >= spiritXpToNext(sp.level)) {
    sp.xp -= spiritXpToNext(sp.level);
    sp.level++;
    gained++;
  }
  if (sp.level >= capLevel) sp.xp = 0;
  return gained;
}
