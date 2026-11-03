// Bloqueio passivo do escudo (Guerreiro e Clérigo): sem botão. Cada golpe/projétil vindo da FRENTE tem uma chance (do item) de ser bloqueado.
// Puro e determinístico: quem chama sorteia com o RNG da simulação.
export const BLOCK = {
  arc: (140 * Math.PI) / 180, // arco frontal que protege
  reduce: 0.6,                // fração do dano removida num bloqueio
  stillT: 0.6,                // s parado encarando o alvo para ganhar o bônus
  stillBonus: 10,             // pontos percentuais de chance
  cap: 75,
  pvpMul: 0.1,                // em duelo entre heróis a chance vale só esta fração (o PvP já é longo e apertado; medido em npm run balance)
};

// Chance (0..1) de bloquear agora. `stats.block` vem do escudo equipado (%); sem escudo = 0. `stillT`: tempo parado.
export function blockChance(stats, stillT = 0) {
  const b = stats?.block ?? 0;
  if (b <= 0) return 0;
  return Math.min(BLOCK.cap, b + (stillT >= BLOCK.stillT ? BLOCK.stillBonus : 0)) / 100;
}

// O atacante em (sx, sy) está dentro do arco frontal de quem olha para `facing`?
export function inFrontArc(facing, x, y, sx, sy) {
  let d = (Math.atan2(sy - y, sx - x) - facing) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) <= BLOCK.arc / 2;
}
