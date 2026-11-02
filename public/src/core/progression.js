import { CLASSES } from '../data/classes.js';
import { SPIRITS, SPIRIT_RARITY_MUL } from '../data/spirits.js';
import { generateItem, rollRarity, uid } from './loot.js';

export const MAX_LEVEL = 30;
export const POINTS_PER_LEVEL = 5;
// Versão do documento do personagem (migrações em core/savedoc.js). v2: ratings por modo de arena e especialização. v3: missões, contadores, conquistas, título e baús.
export const SAVE_VERSION = 3;

// Curva mais lenta (antes 60·n^1,55: nível 20 em ~20 min de farm). Agora ≈ 6× o XP total até o 20 (algumas horas), nível 30 como meta longa.
export const xpToNext = (level) => Math.round(150 * level ** 1.9);

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
    version: SAVE_VERSION, name, classId, level: 1, xp: 0, statPoints: 0,
    alloc: { str: 0, agi: 0, int: 0, vit: 0 },
    gold: 60, potions: 3, scrolls: 2, equipment: {}, inventory: [],
    spirits: [], activeSpirit: null,
    arena: { rating: 1000, wins: 0, losses: 0, bestWave: 0, ratings: {} },
    quests: { active: {}, done: {} }, stats: { kills: 0, bossKills: 0, chests: 0, quests: 0, pvpWins: 0, pvpGames: 0, coopClears: 0 }, achievements: {}, title: null, chests: {}, pity: { epic: 0, legendary: 0, opal: 0 },
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
  return Math.round((6 + sp.level * 3.2) * SPIRIT_RARITY_MUL[sp.rarity] * (sp.stage === 2 ? EVOLVED_MUL : 1));
}

// Evolução (forma 2): nível mínimo e ouro; o spirit evoluído tem 50% mais poder e a arte da forma evoluída.
export const EVOLVE_LEVEL = 10;
export const EVOLVED_MUL = 1.5;
export const evolveCost = (sp) => Math.round(80 * sp.level * SPIRIT_RARITY_MUL[sp.rarity]);
export function evolveSpirit(char, id) {
  const sp = char.spirits.find((s) => s.id === id);
  if (!sp) return { ok: false, reason: 'Spirit não encontrado.' };
  if (sp.stage === 2) return { ok: false, reason: 'Já está na forma evoluída.' };
  if (sp.level < EVOLVE_LEVEL) return { ok: false, reason: `Precisa do nível ${EVOLVE_LEVEL} (está no ${sp.level}).` };
  const cost = evolveCost(sp);
  if (char.gold < cost) return { ok: false, reason: `Faltam ${cost - char.gold} de ouro.` };
  char.gold -= cost; sp.stage = 2;
  return { ok: true, cost };
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
