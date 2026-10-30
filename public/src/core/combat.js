// Matemática de combate pura (sem estado), compartilhada entre cliente e futuro servidor.
export function mitigate(dmg, def) {
  return dmg * 100 / (100 + Math.max(0, def));
}

// atk: { power, crit, critMult, dmgBonus }  def: { def, dr }
export function computeHit(rng, atk, target, mult) {
  let base = atk.power * mult * (1 + (atk.dmgBonus ?? 0)) * rng.range(0.9, 1.1);
  const crit = rng.chance((atk.crit ?? 0) / 100);
  if (crit) base *= atk.critMult ?? 1.5;
  const final = mitigate(base, target.def) * (1 - Math.min(0.8, target.dr ?? 0));
  return { amount: Math.max(1, Math.round(final)), crit };
}

// Elo simples para o ranking da arena.
export function eloDelta(playerRating, rivalRating, won, k = 32) {
  const expected = 1 / (1 + 10 ** ((rivalRating - playerRating) / 400));
  return Math.round(k * ((won ? 1 : 0) - expected));
}

export const TIERS = [
  { min: 0, name: 'Bronze', color: '#c98a54' },
  { min: 1100, name: 'Prata', color: '#c8d0dc' },
  { min: 1300, name: 'Ouro', color: '#f2c94c' },
  { min: 1500, name: 'Platina', color: '#7fe0d0' },
  { min: 1700, name: 'Diamante', color: '#9ab8ff' },
];
export function tierFor(rating) {
  let t = TIERS[0];
  for (const x of TIERS) if (rating >= x.min) t = x;
  return t;
}
