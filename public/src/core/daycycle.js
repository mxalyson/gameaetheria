// Ciclo de dia e noite: regra PURA (sem DOM, sem Date implícito), pronta para o servidor usar o mesmo relógio.
// Um dia de jogo = 12 min reais (720 s = 24 "horas" de 30 s). Fases em horas do dia (0-24):
//   aurora 5,5-7 (45 s) · dia 7-21 (7 min) · entardecer 21-22,5 (45 s) · noite 22,5-5,5 (3,5 min).
// `clock` é sempre a hora do dia (0-24, fracionária). Use hourFromMs(Date.now()) para o relógio de parede, ou parseHora('?hora=22') p/ teste.
import { NIGHT } from '../data/mobs.js';

export const DAY_SECONDS = 720;
export const HOUR_SECONDS = DAY_SECONDS / 24;
export const PHASES = { dawn: [5.5, 7], day: [7, 21], dusk: [21, 22.5] }; // a noite é o resto (22,5 → 5,5 do dia seguinte)

const mod24 = (h) => ((h % 24) + 24) % 24;
const smooth = (u) => u * u * (3 - 2 * u);

// Relógio de parede (ms) → hora do dia. Todos os jogadores veem a mesma hora.
export const hourFromMs = (ms) => mod24(ms / 1000 / HOUR_SECONDS);

// `?hora=22` (ou 22.5) fixa a hora para teste; devolve null se ausente/inválido.
export function parseHora(search) {
  const m = /[?&]hora=(-?\d+(?:[.,]\d+)?)/.exec(String(search ?? ''));
  if (!m) return null;
  const h = Number(m[1].replace(',', '.'));
  return Number.isFinite(h) && h >= 0 && h <= 24 ? mod24(h) : null;
}

// { name: 'dawn'|'day'|'dusk'|'night', t: progresso na fase (0-1), dark: escuridão suave 0 (dia) → 1 (noite fechada), hour }
export function dayPhase(clock) {
  const h = mod24(clock), [a0, a1] = PHASES.dawn, [d0, d1] = PHASES.day, [e0, e1] = PHASES.dusk;
  if (h >= a0 && h < a1) { const t = (h - a0) / (a1 - a0); return { name: 'dawn', t, dark: 1 - smooth(t), hour: h }; }
  if (h >= d0 && h < d1) return { name: 'day', t: (h - d0) / (d1 - d0), dark: 0, hour: h };
  if (h >= e0 && h < e1) { const t = (h - e0) / (e1 - e0); return { name: 'dusk', t, dark: smooth(t), hour: h }; }
  const into = h >= e1 ? h - e1 : h + 24 - e1; // horas desde o início da noite
  return { name: 'night', t: into / (24 - (e1 - a0)), dark: 1, hour: h };
}

// Noite "de verdade" (vale o bônus de risco): escuridão ≥ 0,6 — pega o fim do entardecer e o começo da aurora.
export const isNight = (clock) => dayPhase(clock).dark >= 0.6;

// Multiplicadores de jogo à noite (data/mobs.js › NIGHT): alcance de visão (aggro) dos mobs e XP/drops. De dia: tudo 1.
// Como ligar (sim/servidor): aggro = mob.aggro * nightMods(clock).aggroMul; recompensa de XP/ouro/drop *= rewardMul. Zona segura/arena: nunca (use zoneHasCycle).
export function nightMods(clock) {
  return isNight(clock) ? { aggroMul: NIGHT.aggroMul, rewardMul: NIGHT.rewardMul } : { aggroMul: 1, rewardMul: 1 };
}

// Arenas (círculo) e interiores têm luz fixa; o resto, ao ar livre, segue o ciclo.
export const zoneHasCycle = (zone) => !!zone && !zone.circle && !zone.fixedLight;
