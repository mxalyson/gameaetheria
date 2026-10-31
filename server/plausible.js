// Verificação de plausibilidade do salvamento na nuvem. ATENÇÃO — é uma defesa PARCIAL: o progresso de PvE de exploração (XP, loot, ouro,
// abates, baús) ainda é calculado no cliente (o PvE autoritativo só existe no cooperativo). Aqui limitamos saltos absurdos entre duas
// gravações e tornamos do servidor o que ele já decide: rating, vitórias/derrotas, contadores de PvP/cooperativo, progresso de missões
// desses tipos e as conquistas (recalculadas a partir dos contadores).
import { QUESTS } from '../public/src/data/quests.js';
import { SERVER_STATS, STAT_KEYS_PROGRESS } from '../public/src/data/achievements.js';
import { ensureJournal, requirementsMet, checkAchievements, SERVER_TYPES, MAX_ACTIVE, isComplete } from '../public/src/core/journal.js';

export const LIMITS = { levelJump: 2, goldBase: 5000, goldPerLevel: 800, newItems: 12, potions: 25, spirits: 3, waves: 6, statJump: 400, newQuests: 3, doneQuests: 3, newChests: 6 };

const itemIds = (c) => new Set([...Object.values(c.equipment ?? {}), ...(c.inventory ?? [])].map((i) => i.id));
const spiritIds = (c) => new Set((c.spirits ?? []).map((s) => s.id));

// Devolve { ok:true, doc } com os campos "do servidor" restaurados, ou { ok:false, reason }.
export function checkSave(oldDoc, neuDoc, now = Date.now()) {
  const old = ensureJournal(structuredClone(oldDoc)), neu = ensureJournal(structuredClone(neuDoc));
  if (neu.classId !== old.classId) return { ok: false, reason: 'class_changed' };
  if (neu.name !== old.name) return { ok: false, reason: 'name_changed' };
  if (neu.created !== old.created) return { ok: false, reason: 'created_changed' };
  if (neu.level < old.level) return { ok: false, reason: 'level_decreased' };
  if (neu.level > old.level + LIMITS.levelJump) return { ok: false, reason: 'level_jump' };
  if (neu.gold - old.gold > LIMITS.goldBase + LIMITS.goldPerLevel * neu.level) return { ok: false, reason: 'gold_jump' };
  if (neu.potions - old.potions > LIMITS.potions) return { ok: false, reason: 'potion_jump' };
  const before = itemIds(old);
  let created = 0;
  for (const id of itemIds(neu)) if (!before.has(id)) created++;
  if (created > LIMITS.newItems) return { ok: false, reason: 'item_flood' };
  const sb = spiritIds(old);
  let newSp = 0;
  for (const id of spiritIds(neu)) if (!sb.has(id)) newSp++;
  if (newSp > LIMITS.spirits) return { ok: false, reason: 'spirit_flood' };
  if (neu.arena.bestWave > old.arena.bestWave + LIMITS.waves) return { ok: false, reason: 'wave_jump' };

  // ---- contadores: os de PvP/cooperativo são do servidor; os outros só crescem, em saltos limitados ----
  const stats = {};
  for (const k of STAT_KEYS_PROGRESS) {
    if (SERVER_STATS.includes(k)) { stats[k] = old.stats[k]; continue; }
    if (neu.stats[k] - old.stats[k] > LIMITS.statJump) return { ok: false, reason: `stat_jump_${k}` };
    stats[k] = Math.max(old.stats[k], neu.stats[k]);
  }

  // ---- missões ----
  const quests = { active: {}, done: { ...old.quests.done } };
  let newDone = 0, newActive = 0;
  for (const [id, ts] of Object.entries(neu.quests.done)) {
    if (old.quests.done[id] != null) continue;
    const q = QUESTS[id], was = old.quests.active[id];
    if (!q || !was) return { ok: false, reason: 'quest_forged' };               // só se pode concluir o que estava ativo
    if (!requirementsMet({ ...neu, quests: { ...neu.quests, done: { ...old.quests.done } } }, q)) return { ok: false, reason: 'quest_requirements' };
    // objetivos de servidor precisam estar completos NO SERVIDOR (progresso antigo, que o cliente não consegue alterar)
    if (q.objectives.some((o, i) => SERVER_TYPES.has(o.type) && (was.p[i] ?? 0) < (o.count ?? 1))) return { ok: false, reason: 'quest_server_objective' };
    quests.done[id] = ts; newDone++;
  }
  if (newDone > LIMITS.doneQuests) return { ok: false, reason: 'quest_flood' };
  for (const [id, a] of Object.entries(neu.quests.active)) {
    if (quests.done[id] != null) continue;
    const q = QUESTS[id], was = old.quests.active[id];
    if (!was) {
      if (!requirementsMet(neu, q)) return { ok: false, reason: 'quest_requirements' };
      newActive++;
    }
    quests.active[id] = { at: was?.at ?? a.at, p: q.objectives.map((o, i) => (SERVER_TYPES.has(o.type) ? (was?.p[i] ?? 0) : Math.max(was?.p[i] ?? 0, a.p[i] ?? 0))) };
  }
  if (newActive > LIMITS.newQuests || Object.keys(quests.active).length > MAX_ACTIVE) return { ok: false, reason: 'quest_flood' };
  void isComplete;

  // ---- baús: a "última abertura" nunca volta no tempo, e poucos registros novos por gravação ----
  const chests = { ...neu.chests };
  let newCh = 0;
  for (const [id, ts] of Object.entries(chests)) { if (old.chests[id] == null) newCh++; else if (ts < old.chests[id]) chests[id] = old.chests[id]; }
  if (newCh > LIMITS.newChests) return { ok: false, reason: 'chest_flood' };

  // ---- campos do servidor ----
  const arena = { ...neu.arena, rating: old.arena.rating, wins: old.arena.wins, losses: old.arena.losses, ratings: old.arena.ratings ?? {} };
  const out = { ...neu, arena, stats, quests, chests, achievements: { ...old.achievements } };
  checkAchievements(out, now); // as conquistas são recalculadas aqui: o cliente não "se concede" nenhuma
  out.title = out.title && out.achievements[out.title] != null ? out.title : null;
  return { ok: true, doc: out };
}
