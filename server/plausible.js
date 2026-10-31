// Verificação de plausibilidade do salvamento na nuvem. ATENÇÃO — é uma defesa PARCIAL: o progresso de PvE (XP, loot, ouro) ainda é
// calculado no cliente (o PvE autoritativo no servidor é trabalho de P6/P8). Aqui só limitamos saltos absurdos entre duas gravações
// e tornamos do servidor tudo o que a arena real já decide (rating, vitórias, derrotas).
export const LIMITS = { levelJump: 2, goldBase: 5000, goldPerLevel: 800, newItems: 12, potions: 25, spirits: 3, waves: 6 };

const itemIds = (c) => new Set([...Object.values(c.equipment ?? {}), ...(c.inventory ?? [])].map((i) => i.id));
const spiritIds = (c) => new Set((c.spirits ?? []).map((s) => s.id));

// Devolve { ok:true, doc } com os campos "do servidor" restaurados, ou { ok:false, reason }.
export function checkSave(old, neu) {
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
  // campos que pertencem ao servidor: o cliente não os altera pela nuvem
  const arena = { ...neu.arena, rating: old.arena.rating, wins: old.arena.wins, losses: old.arena.losses, ratings: old.arena.ratings ?? {} };
  return { ok: true, doc: { ...neu, arena } };
}
