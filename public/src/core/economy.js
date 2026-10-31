// Economia do cooperativo (regras puras, usadas pelo servidor e pela análise `npm run economy`).
// Meta de projeto: uma vitória cooperativa vale ≈ 25–35% de um nível de XP e ouro moderado — paga mais que 10–15 minutos de abates solo
// (por causa do chefe e do grupo) sem tornar o farm solo inútil. Os tetos abaixo impedem recompensas desproporcionais em níveis altos.
import { xpToNext } from './progression.js';

export const COOP = {
  xpCapPct: 0.30,          // XP máximo por jogador = 30% do nível atual (antes do bônus de grupo)
  groupBonus: 0.10,        // +10% por jogador extra (cada um recebe a fatia dividida, mais este bônus)
  goldPerWaveMul: 0.5,     // metade da fórmula original de ondas (15 + onda × nível × 2)
  bossGold: 4,             // ouro extra por nível do grupo ao derrubar o chefe
  bossPotions: 3,
  defeatPct: 0.6,          // derrota paga 60% do que foi conquistado (sem chefe)
};

// avgLevel/crew: nível médio e tamanho do grupo; pool: { xp (soma dos abates), gold (soma das ondas) } já acumulados na partida.
export function coopRewardPlan({ level, crew, wavesCleared, bossDown, poolXp = null, victory = bossDown }) {
  let goldWaves = 0;
  for (let n = 1; n <= wavesCleared; n++) goldWaves += (15 + n * level * 2) * COOP.goldPerWaveMul;
  const rawXp = poolXp ?? wavesCleared * (12 + level * 6) * (4 + wavesCleared);   // estimativa quando não há acúmulo real (análise)
  const share = (rawXp * (1 + COOP.groupBonus * (crew - 1))) / crew;
  const cap = xpToNext(level) * COOP.xpCapPct * (1 + COOP.groupBonus * (crew - 1));
  const mul = victory ? 1 : COOP.defeatPct;
  return {
    gold: Math.round((goldWaves + (bossDown ? COOP.bossGold * level : 0)) * mul),
    xp: Math.round(Math.min(share, cap) * mul),
    potions: bossDown ? COOP.bossPotions : 0,
  };
}
