import { CLASSES, STAT_KEYS } from '../data/classes.js';
import { SLOTS, WEAPON_TYPES, RARITY, SHIELD_CLASSES } from '../data/items.js';
import { plusMul } from './enhance.js';

export function gearTotals(equipment) {
  const t = {};
  for (const slot of SLOTS) {
    const it = equipment?.[slot];
    if (!it) continue;
    const m = plusMul(it); // aprimoramento (+N) multiplica os atributos base do item
    for (const [k, v] of Object.entries(it.stats)) t[k] = (t[k] ?? 0) + (m === 1 ? v : Math.round(v * m * 100) / 100);
  }
  return t;
}

// Maestria (missão do Mestre de Classe, nível 25): bônus permanente pequeno no atributo principal e em Vitalidade.
export const MASTERY = { primary: 4, vit: 3 };
export const hasMastery = (char) => char.quests?.done?.maestria != null;

export function primaryStats(char) {
  const cls = CLASSES[char.classId];
  const g = gearTotals(char.equipment);
  const out = {};
  // 1 casa decimal: o crescimento por nível é fracionário e a soma em ponto flutuante aparecia como 48.1999999 na tela
  for (const k of STAT_KEYS) out[k] = Math.round((cls.base[k] + cls.growth[k] * (char.level - 1) + (char.alloc?.[k] ?? 0) + (g[k] ?? 0) + (hasMastery(char) ? (k === cls.primary ? MASTERY.primary : k === 'vit' ? MASTERY.vit : 0) : 0)) * 10) / 10;
  return out;
}

// Bônus de iniciante (vida e poder): some até o nível 10 (o PvP só abre no 10). Mantém o kit inicial vivo contra 2 mobs do mesmo nível sem mexer no balanço de duelos.
export const ROOKIE = { hp: 360, power: 12, fadeLevels: 9 };
const rookieFade = (level) => Math.max(0, 1 - (level - 1) / ROOKIE.fadeLevels);
// mul: reforço por classe (`rookie` em data/classes.js); some junto com o bônus, antes do PvP (nível 10)
export const rookieHp = (level, mul = 1) => Math.round(ROOKIE.hp * mul * rookieFade(level));
export const rookiePower = (level, mul = 1) => Math.round(ROOKIE.power * mul * rookieFade(level));

// Atributos derivados usados em combate. Mesma função para jogador e rivais da arena.
export function computeStats(char) {
  const cls = CLASSES[char.classId];
  const g = gearTotals(char.equipment);
  const p = primaryStats(char);
  return {
    ...p,
    maxHp: Math.round(cls.hpBase + p.vit * 12 + (char.level - 1) * 8 + Math.max(0, char.level - 4) * 12 + rookieHp(char.level, cls.rookie) + (g.hp ?? 0)),
    power: Math.round((g.atk ?? 4) + p[cls.primary] * 2.2 + char.level * 1.5 + rookiePower(char.level, cls.rookie)),
    def: Math.round((g.def ?? 0) + p.vit * 0.4 + p.agi * 0.2),
    crit: Math.min(60, 5 + p.agi * 0.25 + (g.crit ?? 0)),
    critMult: 1.6,
    atkSpeed: Math.min(2, 1 + p.agi * 0.004 + (g.atkSpeed ?? 0) / 100),
    moveSpeed: 200 * (1 + Math.min(40, g.moveSpeed ?? 0) / 100),
    lifesteal: Math.min(15, g.lifesteal ?? 0) / 100,
    block: char.equipment?.offhand && SHIELD_CLASSES.includes(char.classId) ? Math.min(60, g.block ?? 0) : 0, // % de chance de bloqueio (core/block.js); só o escudo dá
  };
}

// Classe dona do item: `classId` do item; arma antiga sem o campo usa a do tipo de arma. Item antigo SEM classe (armadura/joia genérica de
// save antigo) devolve null: core/savedoc.js (validate) o carimba com a classe do personagem dono ao carregar; até lá, vale para a classe corrente.
export const itemClassId = (item) => item.classId ?? (item.slot === 'weapon' ? WEAPON_TYPES[item.weaponType]?.classId ?? null : null);
// Texto legível da restrição ("Mago"), para tooltips e células da mochila/loja. '' se o item é de legado sem classe.
export const itemClassName = (item) => CLASSES[itemClassId(item)]?.name ?? '';

export function canEquip(char, item) {
  if (item.kind !== 'gear') return { ok: false, reason: 'Não é equipável.' };
  if (char.level < item.reqLevel) return { ok: false, reason: `Requer nível ${item.reqLevel}.` };
  const cid = itemClassId(item);
  if (cid && cid !== char.classId) return { ok: false, reason: `Apenas para ${itemClassName(item)}.` };
  if (item.slot === 'offhand' && !SHIELD_CLASSES.includes(char.classId)) return { ok: false, reason: 'Só Guerreiro e Clérigo usam escudo.' };
  return { ok: true };
}

// Pontuação aproximada para comparar itens e ordenar.
const SCORE_W = { atk: 3, def: 1.5, hp: 0.25, str: 2, agi: 2, int: 2, vit: 2, crit: 3, atkSpeed: 3, moveSpeed: 2, lifesteal: 4, block: 2 };
export function itemScore(item) {
  let s = 0;
  for (const [k, v] of Object.entries(item.stats)) s += (SCORE_W[k] ?? 1) * v;
  return Math.round(s * (1 + RARITY[item.rarity].index * 0.05));
}
