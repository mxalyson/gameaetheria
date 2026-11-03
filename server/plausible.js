// Verificação de plausibilidade do salvamento na nuvem. ATENÇÃO — é uma defesa PARCIAL: o progresso de PvE de exploração (XP, loot, ouro,
// abates, baús) ainda é calculado no cliente (o PvE autoritativo só existe no cooperativo). Aqui limitamos saltos absurdos entre duas
// gravações e tornamos do servidor o que ele já decide: rating, vitórias/derrotas, contadores de PvP/cooperativo, progresso de missões
// desses tipos e as conquistas (recalculadas a partir dos contadores).
import { QUESTS } from '../public/src/data/quests.js';
import { SERVER_STATS, STAT_KEYS_PROGRESS, FLAG_STATS } from '../public/src/data/achievements.js';
import { ensureJournal, requirementsMet, checkAchievements, SERVER_TYPES, MAX_ACTIVE, isComplete } from '../public/src/core/journal.js';
import { RARITY, AFFIXES } from '../public/src/data/items.js';
import { xpToNext } from '../public/src/core/progression.js';
import { PRICES } from '../public/src/shop.js';

// itemSlack: folga sobre o máximo que o gerador (core/loot.js) consegue sortear; itemLevelAhead: quantos níveis acima do herói um drop pode vir (chefes/zonas mais fortes).
export const LIMITS = { levelJump: 2, goldBase: 5000, goldPerLevel: 800, newItems: 12, potions: 25, spirits: 3, waves: 6, statJump: 400, skillUsesJump: 1500, newQuests: 3, doneQuests: 3, newChests: 6, plusJump: 10, itemSlack: 1.15, itemLevelAhead: 10, xpPerKillMul: 3, xpFreeLevels: 1.5 };

// Teto plausível de cada atributo de um item NOVO: espelha as fórmulas de generateItem (base × maior rolagem 1,15 + maior afixo), com folga.
// Quem muda o gerador precisa mudar aqui (o teste 'teto de itens' sorteia milhares de itens reais e confere).
export function itemCeiling(slot, rarityId, level) {
  const r = RARITY[rarityId], mul = r.mul, c = {};
  const add = (k, v) => { c[k] = (c[k] ?? 0) + v; };
  if (slot === 'weapon') add('atk', Math.round((6 + level * 2.4) * mul * 1.15));
  else if (slot === 'armor') { add('def', Math.round((3 + level * 1.6) * mul * 1.15)); add('hp', Math.round((10 + level * 5) * mul * 1.15)); }
  else if (slot === 'helm' || slot === 'boots') add('def', Math.round((2 + level * 0.9) * mul * 1.15));
  const baseKeys = Object.keys(c).length;
  for (const a of AFFIXES) {
    const v = a.flat ? Math.round(a.flat[1] * mul) : Math.max(1, Math.round(level * a.per * 1.2 * mul + (a.per >= 1 ? a.per * 2 : 1)));
    if (a.stat === 'hp' || a.stat === 'def') add(a.stat, v); else c[a.stat] = v;
  }
  for (const k of Object.keys(c)) c[k] = Math.ceil(c[k] * LIMITS.itemSlack) + 1;
  const maxKeys = baseKeys + r.affixes + (slot === 'ring' || slot === 'amulet' ? 1 : 0);
  return { stats: c, maxKeys, value: Math.ceil((6 + level * 3) * mul * mul * LIMITS.itemSlack) + 1 };
}
// Item NOVO (id que o banco não conhecia) é plausível? Devolve o motivo ou null. Opalino nunca nasce no cliente (só o servidor emite).
// Item por classe: todo item novo precisa ser da classe do herói (ou legado sem classe, que o servidor carimba).
function newItemProblem(it, heroLevel, heroClass) {
  if (it.opal) return 'opal_forged';
  if (heroClass && it.classId && it.classId !== heroClass) return 'item_wrong_class';
  if (it.level > heroLevel + LIMITS.itemLevelAhead || it.reqLevel < Math.max(1, it.level - 2)) return 'item_forged';
  const cap = itemCeiling(it.slot, it.rarity, it.level);
  const keys = Object.keys(it.stats);
  if (keys.length > cap.maxKeys || it.value > cap.value) return 'item_forged';
  for (const k of keys) if (!(it.stats[k] <= (cap.stats[k] ?? 0))) return 'item_forged';
  return null;
}
// Save importado de arquivo (nada é confiável): remove itens fora do teto/opalinos e zera o que é do servidor (pergaminhos, mapas visitados, azar acumulado).
export function sanitizeImport(doc, fresh) {
  const ok = (it) => !newItemProblem(it, doc.level, doc.classId);
  for (const k of Object.keys(doc.equipment)) if (!ok(doc.equipment[k])) delete doc.equipment[k];
  doc.inventory = doc.inventory.filter(ok);
  doc.bank = (doc.bank ?? []).filter(ok);
  doc.scrolls = 0; doc.pity = { epic: 0, legendary: 0, opal: 0 }; doc.visited = { ...fresh.visited };
  return doc;
}
const SAME_ITEM = ['slot', 'weaponType', 'rarity', 'level', 'reqLevel', 'value'];
const gearList = (c) => [...Object.values(c.equipment ?? {}), ...(c.inventory ?? []), ...(c.bank ?? [])]; // o banco do Porto (core/bank.js) conta como posse

// XP total acumulado (níveis anteriores + XP do nível atual)
const totalXp = (c) => { let t = c.xp; for (let l = 1; l < c.level; l++) t += xpToNext(l); return t; };
const MAX_QUEST_XP = Math.max(0, ...Object.values(QUESTS).map((q) => q.reward?.xp ?? 0));

const itemIds = (c) => new Set(gearList(c).map((i) => i.id));
const plusById = (c) => new Map(gearList(c).map((i) => [i.id, i.plus ?? 0]));
const spiritIds = (c) => new Set((c.spirits ?? []).map((s) => s.id));

// Devolve { ok:true, doc } com os campos "do servidor" restaurados, ou { ok:false, reason }.
// Modo ESTRITO de PvE (P11.3), para servidor com a exploração autoritativa: o que o PvE rende é decidido SÓ pelo servidor (lotes da instância
// e transações de server/tx.js), então um salvamento do cliente que AUMENTA XP/nível, ouro, poções, itens, aprimoramento, abates, baús ou
// missões concluídas é recusado. Gastar ouro, mover/equipar itens, distribuir pontos e trocar spirit seguem valendo. O que o cliente ainda
// ganha por conta própria (libertar spirit, comprar essência, reciclar) NÃO está coberto: por isso o modo é opcional (STRICT_PVE=1) até migrar.
export const PVE_STATS = ['kills', 'bossKills', 'chests', 'spiritKills', 'skillUses', 'upgrades', 'deposits', 'contracts', 'quests'];
export function pveProblem(old, neu) {
  if (neu.level > old.level || totalXp(neu) > totalXp(old)) return 'pve_xp';
  if (neu.gold > old.gold) return 'pve_gold';
  if (neu.potions > old.potions) return 'pve_potions';
  const had = itemIds(old);
  for (const id of itemIds(neu)) if (!had.has(id)) return 'pve_items';
  const plusOld = plusById(old);
  for (const [id, p] of plusById(neu)) if (p > (plusOld.get(id) ?? 0)) return 'pve_plus';
  for (const k of PVE_STATS) if ((neu.stats[k] ?? 0) > (old.stats[k] ?? 0)) return 'pve_stat_' + k;
  for (const id of Object.keys(neu.quests.done)) if (old.quests.done[id] == null) return 'pve_quest';
  for (const id of Object.keys(neu.chests ?? {})) if (old.chests[id] == null || neu.chests[id] > old.chests[id]) return 'pve_chest';
  return null;
}

export function checkSave(oldDoc, neuDoc, now = Date.now(), opts = {}) {
  const old = ensureJournal(structuredClone(oldDoc)), neu = ensureJournal(structuredClone(neuDoc));
  if (neu.classId !== old.classId) return { ok: false, reason: 'class_changed' };
  if (neu.name !== old.name) return { ok: false, reason: 'name_changed' };
  if (neu.created !== old.created) return { ok: false, reason: 'created_changed' };
  if (opts.strictPve) { const bad = pveProblem(old, neu); if (bad) return { ok: false, reason: bad }; }
  if (neu.level < old.level) return { ok: false, reason: 'level_decreased' };
  if (neu.level > old.level + LIMITS.levelJump) return { ok: false, reason: 'level_jump' };
  if (neu.gold - old.gold > LIMITS.goldBase + LIMITS.goldPerLevel * neu.level) return { ok: false, reason: 'gold_jump' };
  if (neu.potions - old.potions > LIMITS.potions) return { ok: false, reason: 'potion_jump' };
  const before = itemIds(old);
  let created = 0;
  for (const id of itemIds(neu)) if (!before.has(id)) created++;
  if (created > LIMITS.newItems) return { ok: false, reason: 'item_flood' };
  // aprimoramento: item novo nasce +0 (drops/lojas nunca vêm aprimorados) e o salto entre gravações é limitado
  const plusOld = plusById(old); let plusGain = 0;
  for (const [id, p] of plusById(neu)) {
    if (!plusOld.has(id)) { if (p > 0) return { ok: false, reason: 'plus_forged' }; continue; }
    if (p > plusOld.get(id)) plusGain += p - plusOld.get(id);
  }
  if (plusGain > LIMITS.plusJump) return { ok: false, reason: 'plus_jump' };
  // itens: os que o banco já conhecia não mudam de atributos/raridade/nível/opal; os novos respeitam o teto do gerador por nível e raridade
  const oldItems = new Map(gearList(old).map((i) => [i.id, i]));
  for (const it of gearList(neu)) {
    const was = oldItems.get(it.id);
    if (was) {
      // classId: item antigo do banco pode não ter o campo (o cliente o carimba com a classe do dono ao migrar): aceitar só essa classe
      if (was.classId != null ? it.classId !== was.classId : (it.classId != null && it.classId !== old.classId)) return { ok: false, reason: 'item_tampered' };
      if (SAME_ITEM.some((k) => it[k] !== was[k]) || !!it.opal !== !!was.opal || JSON.stringify(it.stats) !== JSON.stringify(was.stats)) return { ok: false, reason: 'item_tampered' };
      continue;
    }
    const bad = newItemProblem(it, neu.level, neu.classId);
    if (bad) return { ok: false, reason: bad };
  }
  const sb = spiritIds(old);
  let newSp = 0;
  for (const id of spiritIds(neu)) if (!sb.has(id)) newSp++;
  if (newSp > LIMITS.spirits) return { ok: false, reason: 'spirit_flood' };
  if (neu.arena.bestWave > old.arena.bestWave + LIMITS.waves) return { ok: false, reason: 'wave_jump' };

  // ---- contadores: os de PvP/cooperativo são do servidor; os outros só crescem, em saltos limitados ----
  const stats = {};
  for (const k of STAT_KEYS_PROGRESS) {
    if (SERVER_STATS.includes(k)) { stats[k] = old.stats[k]; continue; }
    if (FLAG_STATS.includes(k)) { stats[k] = (old.stats[k] | neu.stats[k]) >>> 0; continue; } // máscara de dicas: só ganha bits, sem limite de salto
    if (neu.stats[k] - old.stats[k] > (k === 'skillUses' ? LIMITS.skillUsesJump : LIMITS.statJump)) return { ok: false, reason: `stat_jump_${k}` };
    stats[k] = Math.max(old.stats[k], neu.stats[k]);
  }

  // ---- nível ↔ XP: o XP ganho entre duas gravações precisa caber no que foi jogado ----
  // Orçamento: 1,5 nível de folga (xpFreeLevels) (baús/ondas/recompensas que o servidor não separa) + XP máximo por abate × abates novos (chefe ×10) + XP máximo de missão × missões concluídas.
  const dKills = Math.max(0, neu.stats.kills - old.stats.kills), dBoss = Math.max(0, neu.stats.bossKills - old.stats.bossKills);
  const dQuests = Object.keys(neu.quests.done).filter((id) => old.quests.done[id] == null).length;
  const perKill = (12 + 6 * (neu.level + 6)) * 1.5 * LIMITS.xpPerKillMul;
  const xpBudget = Math.round(xpToNext(old.level) * LIMITS.xpFreeLevels) + (dKills + dBoss * 10) * perKill + dQuests * MAX_QUEST_XP;
  if (totalXp(neu) - totalXp(old) > xpBudget) return { ok: false, reason: 'xp_jump' };

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
  // scrolls/visited/pity são do servidor: scrolls só sobem se o ouro caiu o preço (compra na loja, que é do cliente); visited vem do banco; pity só desce
  const paid = Math.max(0, Math.floor((old.gold - neu.gold) / PRICES.scroll(old.level)));
  const scrolls = Math.max(0, Math.min(neu.scrolls ?? 0, (old.scrolls ?? 0) + paid));
  const pity = {}; for (const k of ['epic', 'legendary', 'opal']) pity[k] = Math.min(neu.pity?.[k] ?? 0, old.pity?.[k] ?? 0);
  // Contratos diários (core/journal.js): o dia nunca volta nem salta além de amanhã, e a entrega do dia não se desfaz (sem repetir recompensa).
  const nowDay = Math.floor(now / 86400000), od = old.daily, nd = neu.daily;
  let daily = nd;
  if (nd && (nd.day > nowDay + 1 || (od && nd.day < od.day))) daily = od ?? { day: 0, p: {}, done: {} };
  else if (nd && od && nd.day === od.day) daily = { day: nd.day, p: { ...nd.p }, done: { ...nd.done, ...od.done } };
  const out = { ...neu, ...(daily ? { daily } : {}), arena, stats, quests, chests, scrolls, visited: { ...(old.visited ?? {}) }, pity, achievements: { ...old.achievements } };
  checkAchievements(out, now); // as conquistas são recalculadas aqui: o cliente não "se concede" nenhuma
  out.title = out.title && out.achievements[out.title] != null ? out.title : null;
  return { ok: true, doc: out };
}
