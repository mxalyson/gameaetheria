// Alvo da barra de chefe (puro, testável em Node): o chefe tem prioridade sobre elites próximos, que só valem na ausência de chefe.
export function pickBossTarget(actors, player, radius = 650) {
  let best = null;
  for (const a of actors) {
    if (!(a.boss || a.elite) || a.dead || Math.hypot(a.x - player.x, a.y - player.y) >= radius) continue;
    if (!best || (a.boss && !best.boss)) best = a;
  }
  return best;
}
