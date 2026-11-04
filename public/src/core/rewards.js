// Recompensas de partida (regras puras, usadas pelo servidor autoritativo). O cliente NUNCA calcula nem envia isto.
import { addXp, xpToNext } from './progression.js';
import { eloDelta, tierFor } from './combat.js';
import { getRating, setRating, MODES } from './match.js';
import { validate } from './savedoc.js';
import { INVENTORY_SIZE } from '../data/items.js';
import { MAX_SPIRITS } from '../data/spirits.js';
import { ensureJournal, recordEvent } from './journal.js';
import { hashString } from './rng.js';
import { ensureEcho } from './echo.js';
import { CRYPT } from '../data/crypt.js';
import { applyDeath, hasDeathPenalty } from './phoenix.js';

// Aplica o resultado de uma partida (1×1, 2×2 ou 4×4) a UM personagem. `result`: 'win' | 'loss' | 'draw'.
// Rating separado por modo; times maiores pagam um pouco mais (mesma regra do cliente). Devolve { doc, summary } sem alterar o original.
// XP de PvP (G3): vitória 6% / derrota 2% de um nível (×mul do modo), SEM teto por hora (decisão do dono); 0 se o MESMO adversário
// aparece pela 3ª vez seguida em 30 min. Contadores em `stats` (minutos desde 1970 para caber no limite de 1e8 do savedoc).
// `pvpHour`/`pvpHourN` ficaram sem uso (eram o teto por hora); as chaves seguem em STAT_KEYS_PROGRESS só por compatibilidade de saves.
export const PVP_XP = { win: 0, loss: 0, foeMax: 2, foeWindowMin: 30 }; // dono (2026-11-04): arena NÃO dá XP (rendia mais que o farm); só rating e ouro
export function pvpXpFactor(stats, foeId, now) {
  const min = Math.floor(now / 60000);
  let f = 1;
  if (foeId != null) {
    const h = (hashString(String(foeId)) % 99999989) + 1;
    if (stats.pvpFoe === h && min - stats.pvpFoeMin <= PVP_XP.foeWindowMin) stats.pvpFoeN++;
    else { stats.pvpFoe = h; stats.pvpFoeN = 1; stats.pvpFoeMin = min; }
    if (stats.pvpFoeN > PVP_XP.foeMax) f = 0;
  }
  return f;
}

// `foeId` (opcional): identificação estável do adversário/time adversário, para o limite de repetição; `now` injetável (testes).
export function applyMatchResult(doc, { mode, result, foeRating, foeId = null, now = Date.now() }) {
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
  ensureJournal(c);
  const xpFactor = pvpXpFactor(c.stats, foeId, now);
  const xp = Math.round(xpToNext(c.level) * (won ? PVP_XP.win : PVP_XP.loss) * mul * xpFactor);
  const levels = addXp(c, xp);
  const prog = recordEvent(c, { type: 'pvp', mode, won }); // contador de PvP, missão de arena e conquistas: só o servidor registra
  recordEvent(c, { type: 'level', level: c.level });
  const v = validate(c);
  if (!v.ok) throw new Error('documento inválido após recompensa: ' + v.reason);
  const rating = getRating(v.char, mode);
  return { doc: v.char, summary: { mode, result, won, gold, xp, levels, level: v.char.level, ratingDelta: delta, rating, tier: tierFor(rating).name, was: before, achievements: prog.achievements, quests: prog.quests.filter((q) => q.complete).map((q) => q.id) } };
}


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

// Lote de recompensas da EXPLORAÇÃO (PvE no servidor): abates acumulados pela sala de zona e gravados em operação idempotente.
// `batch`: { xp, gold, potions, items:[com id do servidor], essences:[espíritos já sorteados], kills:[{mobId,boss}], zoneId, deaths }.
// Inventário cheio: o item vira ouro (valor de venda); spirits além do limite viram 100 de ouro; cada morte custa 10% do ouro (como no jogo offline).
export function applyZoneBatch(doc, batch) {
  const c = structuredClone(doc);
  const before = { level: c.level, gold: c.gold };
  c.gold += batch.gold ?? 0;
  const levels = addXp(c, batch.xp ?? 0);
  // Quedas (só zonas de farm): cada uma gasta 1 Amuleto da Fênix, se houver; senão perde 10% do ouro e 10% do XP do nível (nunca desce de nível). Cripta e arenas: nada.
  const dead = { saved: 0, gold: 0, xp: 0 };
  if (hasDeathPenalty(batch.zoneId)) for (let i = 0; i < (batch.deaths ?? 0); i++) { const r = applyDeath(c); if (r.saved) dead.saved++; dead.gold += r.gold; dead.xp += r.xp; }
  let kept = 0, converted = 0;
  for (const it of batch.items ?? []) {
    if (c.inventory.length < INVENTORY_SIZE) { c.inventory.push(it); kept++; } else { c.gold += it.value; converted++; }
  }
  for (const sp of batch.essences ?? []) {
    if (c.spirits.length < MAX_SPIRITS) { c.spirits.push(sp); if (!c.activeSpirit) c.activeSpirit = sp.id; } else c.gold += 100;
  }
  c.potions = Math.min(999, c.potions + (batch.potions ?? 0));
  if (batch.frags) { const e = ensureEcho(c); e.frags = Math.min(CRYPT.frags.cap, e.frags + batch.frags); } // Fragmentos de Eco (só a Cripta rende)
  if (batch.pity) c.pity = batch.pity; // azar acumulado (validate limita os valores)
  ensureJournal(c);
  const ach = [], quests = [];
  for (const k of batch.kills ?? []) { const r = recordEvent(c, { type: 'kill', mobId: k.mobId, zoneId: batch.zoneId, boss: !!k.boss, mini: !!k.mini, spiritType: k.spiritType }); ach.push(...r.achievements); quests.push(...r.quests.filter((q) => q.complete).map((q) => q.id)); }
  if (batch.crypt) { const r = recordEvent(c, { type: 'crypt' }); ach.push(...r.achievements); quests.push(...r.quests.filter((q) => q.complete).map((q) => q.id)); } // Cripta vencida: só o servidor registra
  for (const skillId of batch.skills ?? []) { const r = recordEvent(c, { type: 'skill', skillId }); ach.push(...r.achievements); quests.push(...r.quests.filter((q) => q.complete).map((q) => q.id)); }
  if (levels) recordEvent(c, { type: 'level', level: c.level });
  if (c.spirits.length) recordEvent(c, { type: 'spirit', count: c.spirits.length });
  const v = validate(c);
  if (!v.ok) throw new Error('documento inválido após recompensa de zona: ' + v.reason);
  return { doc: v.char, summary: { mode: 'zone', zone: batch.zoneId, gold: v.char.gold - before.gold, xp: batch.xp ?? 0, levels, level: v.char.level, items: kept, converted, potions: batch.potions ?? 0, frags: batch.frags ?? 0, kills: (batch.kills ?? []).length, deaths: batch.deaths ?? 0, deathsSaved: dead.saved, lostGold: dead.gold, lostXp: dead.xp, phoenix: v.char.phoenix ?? 0, achievements: ach, quests } };
}
