// Recompensas de partida (regras puras, usadas pelo servidor autoritativo). O cliente NUNCA calcula nem envia isto.
import { addXp, xpToNext } from './progression.js';
import { eloDelta, tierFor } from './combat.js';
import { getRating, setRating, MODES } from './match.js';
import { validate } from './savedoc.js';
import { INVENTORY_SIZE } from '../data/items.js';
import { ensureJournal, recordEvent } from './journal.js';

// Aplica o resultado de uma partida (1×1, 2×2 ou 4×4) a UM personagem. `result`: 'win' | 'loss' | 'draw'.
// Rating separado por modo; times maiores pagam um pouco mais (mesma regra do cliente). Devolve { doc, summary } sem alterar o original.
export function applyMatchResult(doc, { mode, result, foeRating }) {
  if (!MODES[mode]) throw new Error('modo inválido: ' + mode);
  const c = structuredClone(doc);
  const won = result === 'win', draw = result === 'draw';
  const before = { level: c.level, rating: getRating(c, mode) };
  const delta = draw ? 0 : eloDelta(before.rating, foeRating, won);
  setRating(c, mode, Math.max(0, before.rating + delta));
  if (won) c.arena.wins++; else if (!draw) c.arena.losses++;
  const mul = 1 + (MODES[mode].size - 1) * 0.2;
  const gold = Math.round((won ? 40 + c.level * 8 : draw ? 20 + c.level * 4 : 10 + c.level * 2) * mul);
  c.gold += gold;
  const xp = Math.round(xpToNext(c.level) * (won ? 0.12 : 0.04) * mul);
  const levels = addXp(c, xp);
  ensureJournal(c);
  const prog = recordEvent(c, { type: 'pvp', mode, won }); // contador de PvP, missão de arena e conquistas: só o servidor registra
  recordEvent(c, { type: 'level', level: c.level });
  const v = validate(c);
  if (!v.ok) throw new Error('documento inválido após recompensa: ' + v.reason);
  const rating = getRating(v.char, mode);
  return { doc: v.char, summary: { mode, result, won, gold, xp, levels, level: v.char.level, ratingDelta: delta, rating, tier: tierFor(rating).name, was: before, achievements: prog.achievements, quests: prog.quests.filter((q) => q.complete).map((q) => q.id) } };
}

// Compatibilidade: duelo 1×1 (usado pelos testes e pela primeira versão do servidor).
export const applyDuelResult = (doc, { won, foeRating }) => applyMatchResult(doc, { mode: '1v1', result: won ? 'win' : 'loss', foeRating });

// Recompensa de uma partida COOPERATIVA (PvE no servidor): ouro, XP e itens já rolados pelo servidor (com ids do servidor).
// Inventário cheio: o item vira ouro (valor de venda), como no jogo. Devolve { doc, summary } sem alterar o original.
export function applyCoopResult(doc, { gold = 0, xp = 0, items = [], potions = 0, victory = true }) {
  const c = structuredClone(doc);
  const before = { level: c.level, gold: c.gold };
  c.gold += gold;
  const levels = addXp(c, xp);
  const kept = [], converted = [];
  for (const it of items) {
    if (c.inventory.length < INVENTORY_SIZE) { c.inventory.push(it); kept.push(it.id); } else { c.gold += it.value; converted.push(it.value); }
  }
  c.potions = Math.min(999, c.potions + potions);
  ensureJournal(c);
  const prog = recordEvent(c, { type: 'coop', victory });
  recordEvent(c, { type: 'level', level: c.level });
  const v = validate(c);
  if (!v.ok) throw new Error('documento inválido após recompensa coop: ' + v.reason);
  return { doc: v.char, summary: { mode: 'coop', gold: v.char.gold - before.gold, xp, levels, level: v.char.level, items: kept.length, converted: converted.length, potions, achievements: prog.achievements, quests: prog.quests.filter((q) => q.complete).map((q) => q.id) } };
}
