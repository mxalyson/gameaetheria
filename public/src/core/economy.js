// Economia do cooperativo (regras puras, usadas pelo servidor e pela análise `npm run economy`).
// Meta de projeto: uma vitória cooperativa vale ≈ 25–35% de um nível de XP e ouro moderado — paga mais que 10–15 minutos de abates solo
// (por causa do chefe e do grupo) sem tornar o farm solo inútil. Os tetos abaixo impedem recompensas desproporcionais em níveis altos.
import { xpToNext, mobXp } from './progression.js';
import { NORMAL_MOBS } from '../data/mobs.js';

export const COOP_WAVES = 5;   // a 5ª onda do cooperativo traz o chefe

// Composição das ondas (pura; com `rng` sorteia os tipos, sem ele alterna em ordem fixa). Compartilhada por main.js (solo),
// server/coop.js e tools/waves-check.mjs, para o simulador medir exatamente o que o jogo gera. Números em docs/gameplay/dificuldade.md.
// base/perWave/cap: quantidade de mobs comuns = min(cap, base + floor(n·perWave)); lvlOffset: nível da onda 1 em relação ao do herói;
// lvlEvery: sobe 1 nível a cada tantas ondas; restHeal: cura entre ondas; hpPerExtra: vida dos mobs por jogador extra (coop).
export const WAVES = {
  solo: { base: 1, perWave: 0.3, cap: 14, eliteEvery: 5, eliteLvlMinus: 3, bossEvery: 10, lvlOffset: 0, lvlEvery: 3, restHeal: 0.5 },
  coop: { base: 1, perWave: 0.3, extraPerPlayer: 1, cap: 14, eliteMinCrew: 3, eliteLvlMinus: 3, lvlOffset: 0, lvlEvery: 3, restHeal: 0.5, hpPerExtra: 0.35, soloBossEase: 8, bossLevelBonus: 0, bossEscort: 0.5 },
};
// Chefe da onda por nível médio (o Cavaleiro Rubro, Nv 31, fica de fora: é do ritual da Cripta). Sorteia entre a faixa do nível e a anterior.
export const WAVE_BOSS_TIERS = [[0, 'treant'], [10, 'colossus'], [18, 'guardian'], [25, 'frostlord']];
export function waveBoss(level, rng = null) {
  let t = 0;
  WAVE_BOSS_TIERS.forEach(([min], i) => { if (level >= min) t = i; });
  const ids = t > 0 ? [WAVE_BOSS_TIERS[t][1], WAVE_BOSS_TIERS[t - 1][1]] : [WAVE_BOSS_TIERS[0][1]];
  return rng ? rng.pick(ids) : ids[0];
}
export function soloWaveSpec(n, { level }, rng = null) {
  const C = WAVES.solo;
  const lvl = Math.max(1, Math.min(30, level + C.lvlOffset + Math.floor((n - 1) / C.lvlEvery)));
  const pick = (list, i) => (rng ? rng.pick(list) : list[i % list.length]);
  const mobs = [];
  if (n % C.bossEvery === 0) mobs.push({ id: waveBoss(lvl, rng), level: lvl, elite: false });
  const count = Math.min(C.cap, C.base + Math.floor(n * C.perWave));
  for (let i = 0; i < count; i++) { const elite = C.eliteEvery > 0 && n % C.eliteEvery === 0 && i === 0; mobs.push({ id: pick(NORMAL_MOBS, i), level: elite ? Math.max(1, lvl - C.eliteLvlMinus) : lvl, elite }); }
  return { lvl, hpMul: 1, mobs };
}
export function coopWaveSpec(n, { avgLevel, crew }, rng = null) {
  const C = WAVES.coop;
  const lvl = Math.max(1, Math.min(30, avgLevel + C.lvlOffset + Math.floor((n - 1) / C.lvlEvery)));
  const hpMul = 1 + C.hpPerExtra * (crew - 1);
  const pick = (list, i) => (rng ? rng.pick(list) : list[i % list.length]);
  const count = Math.min(C.cap, C.base + Math.floor(n * C.perWave) + C.extraPerPlayer * (crew - 1));
  const mobs = [];
  if (n === COOP_WAVES) mobs.push({ id: waveBoss(crew === 1 ? lvl - C.soloBossEase : lvl, rng), level: Math.min(30, lvl + C.bossLevelBonus), elite: false });
  const normals = n === COOP_WAVES ? Math.ceil(count * C.bossEscort) : count;
  for (let i = 0; i < normals; i++) { const elite = n === 3 && i === 0 && crew >= C.eliteMinCrew; mobs.push({ id: pick(NORMAL_MOBS, i), level: elite ? Math.max(1, lvl - C.eliteLvlMinus) : lvl, elite }); }
  return { lvl, hpMul, mobs };
}

export const COOP = {
  xpCapPct: 0.30,          // XP máximo por jogador = 30% do nível atual (antes do bônus de grupo)
  groupBonus: 0.10,        // +10% por jogador extra (cada um recebe a fatia dividida, mais este bônus)
  goldPerWaveMul: 0.5,     // metade da fórmula original de ondas (15 + onda × nível × 2)
  bossGold: 4,             // ouro extra por nível do grupo ao derrubar o chefe
  bossPotions: 3,
  bossXpPct: 0.06,         // XP extra por derrubar o chefe = 6% do nível (vitória ≈ 11–15% de um nível em ~4 min; o farm solo rende mais XP por hora, o coop paga loot do chefe)
  defeatPct: 0.6,          // derrota paga 60% do que foi conquistado (sem chefe)
};

// XP bruto das ondas 1..k (mesma fórmula do servidor: mobXp(nível do mob, nível médio) por abate, chefe incluso).
export function estimatePoolXp(level, crew, wavesCleared) {
  let xp = 0;
  for (let n = 1; n <= wavesCleared; n++) for (const f of coopWaveSpec(n, { avgLevel: level, crew }).mobs) xp += mobXp(f.level, level);
  return xp;
}

// avgLevel/crew: nível médio e tamanho do grupo; pool: { xp (soma dos abates), gold (soma das ondas) } já acumulados na partida.
export function coopRewardPlan({ level, crew, wavesCleared, bossDown, poolXp = null, victory = bossDown }) {
  let goldWaves = 0;
  for (let n = 1; n <= wavesCleared; n++) goldWaves += (15 + n * level * 2) * COOP.goldPerWaveMul;
  const rawXp = poolXp ?? estimatePoolXp(level, crew, wavesCleared);   // sem acúmulo real (análise): soma o XP das ondas que o jogo realmente gera
  const share = (rawXp * (1 + COOP.groupBonus * (crew - 1))) / crew + (bossDown ? xpToNext(level) * COOP.bossXpPct : 0);
  const cap = xpToNext(level) * COOP.xpCapPct * (1 + COOP.groupBonus * (crew - 1));
  const mul = victory ? 1 : COOP.defeatPct;
  return {
    gold: Math.round((goldWaves + (bossDown ? COOP.bossGold * level : 0)) * mul),
    xp: Math.round(Math.min(share, cap) * mul),
    potions: bossDown ? COOP.bossPotions : 0,
  };
}
