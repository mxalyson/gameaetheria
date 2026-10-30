import { CLASSES, STAT_KEYS } from '../data/classes.js';
import { SLOTS, WEAPON_TYPES, RARITY } from '../data/items.js';

export function gearTotals(equipment) {
  const t = {};
  for (const slot of SLOTS) {
    const it = equipment?.[slot];
    if (!it) continue;
    for (const [k, v] of Object.entries(it.stats)) t[k] = (t[k] ?? 0) + v;
  }
  return t;
}

export function primaryStats(char) {
  const cls = CLASSES[char.classId];
  const g = gearTotals(char.equipment);
  const out = {};
  for (const k of STAT_KEYS) out[k] = cls.base[k] + cls.growth[k] * (char.level - 1) + (char.alloc?.[k] ?? 0) + (g[k] ?? 0);
  return out;
}

// Atributos derivados usados em combate. Mesma função para jogador e rivais da arena.
export function computeStats(char) {
  const cls = CLASSES[char.classId];
  const g = gearTotals(char.equipment);
  const p = primaryStats(char);
  return {
    ...p,
    maxHp: Math.round(cls.hpBase + p.vit * 12 + (char.level - 1) * 8 + (g.hp ?? 0)),
    power: Math.round((g.atk ?? 4) + p[cls.primary] * 2.2 + char.level * 1.5),
    def: Math.round((g.def ?? 0) + p.vit * 0.4 + p.agi * 0.2),
    crit: Math.min(60, 5 + p.agi * 0.25 + (g.crit ?? 0)),
    critMult: 1.6,
    atkSpeed: Math.min(2, 1 + p.agi * 0.004 + (g.atkSpeed ?? 0) / 100),
    moveSpeed: 200 * (1 + Math.min(40, g.moveSpeed ?? 0) / 100),
    lifesteal: Math.min(15, g.lifesteal ?? 0) / 100,
  };
}

export function canEquip(char, item) {
  if (item.kind !== 'gear') return { ok: false, reason: 'Não é equipável.' };
  if (char.level < item.reqLevel) return { ok: false, reason: `Requer nível ${item.reqLevel}.` };
  if (item.slot === 'weapon' && WEAPON_TYPES[item.weaponType].classId !== char.classId) {
    return { ok: false, reason: `Apenas ${WEAPON_TYPES[item.weaponType].name} para ${CLASSES[WEAPON_TYPES[item.weaponType].classId].name}.` };
  }
  return { ok: true };
}

// Pontuação aproximada para comparar itens e ordenar.
const SCORE_W = { atk: 3, def: 1.5, hp: 0.25, str: 2, agi: 2, int: 2, vit: 2, crit: 3, atkSpeed: 3, moveSpeed: 2, lifesteal: 4 };
export function itemScore(item) {
  let s = 0;
  for (const [k, v] of Object.entries(item.stats)) s += (SCORE_W[k] ?? 1) * v;
  return Math.round(s * (1 + RARITY[item.rarity].index * 0.05));
}
