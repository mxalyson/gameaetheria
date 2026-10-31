// Recompensas de partida (regras puras, usadas pelo servidor autoritativo). O cliente NUNCA calcula nem envia isto.
import { addXp, xpToNext } from './progression.js';
import { eloDelta, tierFor } from './combat.js';
import { validate } from './savedoc.js';

// Aplica o resultado de um duelo 1×1 a UM personagem. Devolve { doc, summary } sem alterar o original.
export function applyDuelResult(doc, { won, foeRating }) {
  const c = structuredClone(doc);
  const before = { level: c.level, rating: c.arena.rating };
  const delta = eloDelta(c.arena.rating, foeRating, won);
  c.arena.rating = Math.max(0, c.arena.rating + delta);
  if (won) c.arena.wins++; else c.arena.losses++;
  const gold = won ? 40 + c.level * 8 : 10 + c.level * 2;
  c.gold += gold;
  const xp = Math.round(xpToNext(c.level) * (won ? 0.12 : 0.04));
  const levels = addXp(c, xp);
  const v = validate(c);
  if (!v.ok) throw new Error('documento inválido após recompensa: ' + v.reason);
  return {
    doc: v.char,
    summary: { won, gold, xp, levels, level: v.char.level, ratingDelta: delta, rating: v.char.arena.rating, tier: tierFor(v.char.arena.rating).name, was: before },
  };
}
