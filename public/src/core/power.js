import { computeStats, itemScore } from './stats.js';
import { spiritPower } from './progression.js';
import { SLOTS } from '../data/items.js';

// Poder (PWR): número visível que resume quão forte é o personagem. Libera conteúdo e entra no pareamento;
// NÃO mede habilidade (isso é o rating). Pesos iniciais: calibrar com `npm run balance`.
export function playerPower(char) {
  const st = computeStats(char);
  const gear = SLOTS.reduce((s, slot) => s + (char.equipment?.[slot] ? itemScore(char.equipment[slot]) : 0), 0);
  const spirit = char.activeSpirit ? spiritPower(char.spirits.find((s) => s.id === char.activeSpirit) ?? { level: 0, rarity: 'common' }) : 0;
  const base = st.maxHp / 10 + st.power * 1.5 + st.def * 1.2 + st.crit + (st.atkSpeed - 1) * 50;
  return Math.round(base + gear * 0.5 + spirit);
}

// PvP libera neste nível (ajustável); antes disso só PvE e ondas.
export const PVP_MIN_LEVEL = 10;
export const pvpUnlocked = (char) => char.level >= PVP_MIN_LEVEL;

// Janela de pareamento: abre com o tempo de espera (segundos). Retorna true se o adversário serve.
export function matchOk(a, b, waited = 0) {
  const w = Math.min(4, waited / 10);
  const ratingWin = 50 + 150 * (w / 4);
  const pwrWin = 0.15 + 0.15 * (w / 4);
  const pa = a.power, pb = b.power;
  return Math.abs(a.rating - b.rating) <= ratingWin && Math.abs(pa - pb) <= Math.max(pa, pb) * pwrWin;
}
