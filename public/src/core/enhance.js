// Aprimoramento de equipamento (ralo de ouro de fim de jogo): cada +N soma PLUS_BONUS dos atributos BASE do item, sem risco de perder o item.
// Custo cresce com o nível do item, a raridade e o +N atual; a venda NÃO devolve o ouro gasto (é um ralo de verdade).
import { RARITY, SLOTS } from '../data/items.js';

export const MAX_PLUS = 8;
export const PLUS_BONUS = 0.08; // G9/G10: era 0,06 (+48% em +8); +8 agora rende +64% dos atributos base
export const LATE_FROM = 6, LATE_MUL = 0.6;

export const plusMul = (item) => 1 + PLUS_BONUS * (item?.plus ?? 0);

// Custo do próximo nível (de +n para +n+1).
export function enhanceCost(item) {
  const n = (item.plus ?? 0) + 1;
  // G10: +6..+8 custam 60% do que a curva daria (6 lendários +8: 543 mil → ≈ 396 mil; carreira ≈ 440 mil de ouro)
  const late = n >= LATE_FROM ? LATE_MUL : 1;
  return Math.round((60 + item.level * 15 * (1 + RARITY[item.rarity].index * 0.25) * n ** 1.6) * late);
}

export function findGear(char, id) {
  for (const s of SLOTS) if (char.equipment?.[s]?.id === id) return char.equipment[s];
  return char.inventory?.find((i) => i.id === id) ?? null;
}

// Muda o personagem no lugar; devolve { ok, reason?, cost?, plus? }.
export function enhance(char, id) {
  const it = findGear(char, id);
  if (!it || it.kind !== 'gear') return { ok: false, reason: 'Item não encontrado.' };
  if ((it.plus ?? 0) >= MAX_PLUS) return { ok: false, reason: `Já está no máximo (+${MAX_PLUS}).` };
  const cost = enhanceCost(it);
  if (char.gold < cost) return { ok: false, reason: `Faltam ${cost - char.gold} de ouro.` };
  char.gold -= cost;
  it.plus = (it.plus ?? 0) + 1;
  return { ok: true, cost, plus: it.plus };
}

// Ouro total para levar um item novo de +0 até +MAX_PLUS (usado na análise de economia).
export function totalEnhanceCost(item) {
  let t = 0;
  for (let p = 0; p < MAX_PLUS; p++) t += enhanceCost({ ...item, plus: p });
  return t;
}
