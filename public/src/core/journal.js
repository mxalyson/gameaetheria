// Diário do personagem: missões, contadores, conquistas, títulos e baús. Regras PURAS (sem DOM), usadas pelo cliente (offline/online)
// e pelo servidor (partidas PvP/cooperativas e plausibilidade do salvamento). Estado no documento do personagem (v3):
//   doc.quests = { active: { id: { p: [progresso por objetivo], at } }, done: { id: ts } }, doc.stats = {...}, doc.achievements = { id: ts },
//   doc.title = id de conquista | null, doc.chests = { idDoBaú: instante da última abertura }
import { QUESTS } from '../data/quests.js';
import { ACHIEVEMENTS, ACH, STAT_KEYS_PROGRESS } from '../data/achievements.js';
import { INVENTORY_SIZE } from '../data/items.js';
import { addXp } from './progression.js';
import { generateItem, rollRarity } from './loot.js';

export const SERVER_TYPES = new Set(['pvp', 'coop']); // objetivos que só o servidor soma
export const MAX_ACTIVE = 5;
export const CHEST_COOLDOWN_MS = 10 * 60 * 1000;

export const blankStats = () => Object.fromEntries(STAT_KEYS_PROGRESS.map((k) => [k, 0]));
export const blankJournal = () => ({ quests: { active: {}, done: {} }, stats: blankStats(), achievements: {}, title: null, chests: {} });
export function ensureJournal(doc) { // documentos antigos/incompletos ganham os campos que faltam
  const b = blankJournal();
  doc.quests ??= b.quests; doc.quests.active ??= {}; doc.quests.done ??= {};
  doc.stats = { ...b.stats, ...(doc.stats ?? {}) };
  doc.achievements ??= {}; doc.title ??= null; doc.chests ??= {};
  return doc;
}

// ---------- missões ----------
export function requirementsMet(doc, q) {
  return doc.level >= q.level && (!q.after || doc.quests.done[q.after] != null);
}
// `server:false` (jogo offline) esconde as missões que só o servidor consegue completar (PvP/cooperativo reais).
export const offeredBy = (doc, npcId, { server = true } = {}) => Object.values(QUESTS).filter((q) => q.giver === npcId && doc.quests.done[q.id] == null && !doc.quests.active[q.id] && requirementsMet(doc, q) && (server || !q.objectives.some((o) => SERVER_TYPES.has(o.type))));
export const isComplete = (doc, id) => { const a = doc.quests.active[id], q = QUESTS[id]; return !!a && q.objectives.every((o, i) => (a.p[i] ?? 0) >= (o.count ?? 1)); };
export const readyFor = (doc, npcId) => Object.keys(doc.quests.active).filter((id) => (QUESTS[id].turnIn ?? QUESTS[id].giver) === npcId && isComplete(doc, id));
export const activeFor = (doc, npcId) => Object.keys(doc.quests.active).filter((id) => (QUESTS[id].turnIn ?? QUESTS[id].giver) === npcId && !isComplete(doc, id));

export const evolvedSpirits = (doc) => (doc.spirits ?? []).filter((s) => s.stage === 2).length;

export function acceptQuest(doc, id, now = Date.now()) {
  const q = QUESTS[id];
  if (!q) return { ok: false, reason: 'Missão inexistente.' };
  if (doc.quests.done[id] != null || doc.quests.active[id]) return { ok: false, reason: 'Você já fez ou está fazendo esta missão.' };
  if (!requirementsMet(doc, q)) return { ok: false, reason: 'Você ainda não cumpre os requisitos.' };
  if (Object.keys(doc.quests.active).length >= MAX_ACTIVE) return { ok: false, reason: `Você já tem ${MAX_ACTIVE} missões ativas.` };
  // objetivos de nível/spirit já podem estar cumpridos no momento de aceitar
  doc.quests.active[id] = { p: q.objectives.map(() => 0), at: now };
  recordEvent(doc, { type: 'level', level: doc.level });
  recordEvent(doc, { type: 'spirit', count: doc.spirits?.length ?? 0 });
  recordEvent(doc, { type: 'spiritStage', count: evolvedSpirits(doc) });
  return { ok: true };
}
export function abandonQuest(doc, id) { delete doc.quests.active[id]; }

function matches(o, ev) {
  switch (o.type) {
    case 'kill': return ev.type === 'kill' && (o.mob === 'any' || o.mob === ev.mobId) && (o.zone === 'any' || o.zone === ev.zoneId);
    case 'boss': return ev.type === 'kill' && ev.boss && (o.mob === 'any' || o.mob === ev.mobId);
    case 'chest': return ev.type === 'chest' && (o.zone === 'any' || o.zone === ev.zoneId);
    case 'pvp': return ev.type === 'pvp' && ev.won && (o.mode === 'any' || o.mode === ev.mode);
    case 'coop': return ev.type === 'coop' && ev.victory;
    case 'teleport': return ev.type === 'teleport';
    case 'upgrade': return ev.type === 'upgrade';
    default: return false;
  }
}

// Evento do jogo → contadores, progresso de missões e conquistas. Devolve o que mudou, para a interface avisar o jogador.
export function recordEvent(doc, ev, now = Date.now()) {
  ensureJournal(doc);
  const out = { quests: [], achievements: [] };
  const st = doc.stats;
  if (ev.type === 'kill') { st.kills++; if (ev.boss) st.bossKills++; }
  else if (ev.type === 'chest') st.chests++;
  else if (ev.type === 'pvp') { st.pvpGames++; if (ev.won) st.pvpWins++; }
  else if (ev.type === 'coop' && ev.victory) st.coopClears++;
  else if (ev.type === 'teleport') st.teleports++;
  else if (ev.type === 'upgrade') st.upgrades++;
  for (const [id, a] of Object.entries(doc.quests.active)) {
    const q = QUESTS[id]; let changed = false;
    q.objectives.forEach((o, i) => {
      const max = o.count ?? 1, before = a.p[i] ?? 0;
      let v = before;
      if (o.type === 'level' && ev.type === 'level') v = Math.max(before, Math.min(max, ev.level));
      else if (o.type === 'spirit' && ev.type === 'spirit') v = Math.max(before, Math.min(max, ev.count));
      else if (o.type === 'spiritStage' && ev.type === 'spiritStage') v = Math.max(before, Math.min(max, ev.count));
      else if (matches(o, ev)) v = Math.min(max, before + 1);
      if (v !== before) { a.p[i] = v; changed = true; }
    });
    if (changed) out.quests.push({ id, complete: isComplete(doc, id), progress: [...a.p] });
  }
  out.achievements = checkAchievements(doc, now);
  return out;
}

// Recompensa de entrega: ouro, XP, poções e itens; inventário cheio converte o item em ouro. Idempotente por missão (done).
export function turnInQuest(doc, id, rng, now = Date.now()) {
  if (!isComplete(doc, id)) return { ok: false, reason: 'A missão ainda não está completa.' };
  const q = QUESTS[id], r = q.reward ?? {};
  delete doc.quests.active[id];
  doc.quests.done[id] = now;
  doc.stats.quests++;
  doc.gold += r.gold ?? 0;
  const levels = r.xp ? addXp(doc, r.xp) : 0;
  doc.potions = Math.min(999, doc.potions + (r.potions ?? 0));
  const items = [];
  for (const spec of r.items ?? []) {
    const it = generateItem(rng, Math.max(1, doc.level), { classId: doc.classId, rarityId: spec.rarity ?? rollRarity(rng, 1) });
    if (doc.inventory.length < INVENTORY_SIZE) { doc.inventory.push(it); items.push(it); } else doc.gold += it.value;
  }
  const out = recordEvent(doc, { type: 'level', level: doc.level }, now);
  return { ok: true, reward: { gold: r.gold ?? 0, xp: r.xp ?? 0, potions: r.potions ?? 0, items, levels }, achievements: out.achievements, quests: out.quests };
}

// ---------- conquistas ----------
export function statValue(doc, stat) { return stat === 'level' ? doc.level : doc.stats?.[stat] ?? 0; }
// Conquista da história (`quest`) vale 1 quando a missão foi concluída; as outras leem o contador.
const bitCount = (n) => { let c = 0; for (let v = n >>> 0; v; v &= v - 1) c++; return c; };
export const achievementValue = (doc, a) => (a.quest ? (doc.quests?.done?.[a.quest] != null ? 1 : 0) : a.mask ? bitCount(statValue(doc, a.stat) & LORE_MASK) : statValue(doc, a.stat));
export const achievementProgress = (doc, a) => ({ value: Math.min(a.min, achievementValue(doc, a)), min: a.min, earned: doc.achievements?.[a.id] != null });
// Concede as conquistas cujo contador já foi atingido (o servidor repete este cálculo; o cliente não escolhe).
export function checkAchievements(doc, now = Date.now()) {
  const out = [];
  doc.achievements ??= {};
  for (const a of ACHIEVEMENTS) if (doc.achievements[a.id] == null && achievementValue(doc, a) >= a.min) { doc.achievements[a.id] = now; out.push(a.id); }
  return out;
}
export function setTitle(doc, achievementId) {
  if (achievementId == null) { doc.title = null; return true; }
  const a = ACH[achievementId];
  if (!a?.title || doc.achievements?.[achievementId] == null) return false;
  doc.title = achievementId; return true;
}
export const titleText = (doc) => (doc.title && ACH[doc.title]?.title) || '';

// ---------- dicas de onboarding (cada uma aparece 1× por personagem: máscara de bits em stats.tips) ----------
export const TIP_BITS = { forest: 0, chest: 1, level: 2, skill: 3, spirit: 4, boss: 5, ritual: 6 };
export const tipSeen = (doc, key) => ((doc.stats?.tips ?? 0) & (1 << TIP_BITS[key])) !== 0;
export function takeTip(doc, key) { // true se for a primeira vez (e marca como vista)
  if (!(key in TIP_BITS) || tipSeen(doc, key)) return false;
  ensureJournal(doc);
  doc.stats.tips = (doc.stats.tips | (1 << TIP_BITS[key])) >>> 0;
  return true;
}

// ---------- lore coletável (placa/estátua por zona de farm; bit = posição em LORE_ZONES, em stats.lore) ----------
export const LORE_ZONES = ['forest', 'plains', 'ruins', 'glacier', 'ember'];
export const LORE_MASK = (1 << LORE_ZONES.length) - 1;
export const loreSeen = (doc, zoneId) => { const b = LORE_ZONES.indexOf(zoneId); return b >= 0 && ((doc.stats?.lore ?? 0) & (1 << b)) !== 0; };
export const loreCount = (doc) => LORE_ZONES.filter((z) => loreSeen(doc, z)).length;
export function readLore(doc, zoneId) { // true se for a primeira leitura (marca como lida e checa a conquista)
  const b = LORE_ZONES.indexOf(zoneId);
  if (b < 0 || loreSeen(doc, zoneId)) return { first: false, achievements: [] };
  ensureJournal(doc);
  doc.stats.lore = (doc.stats.lore | (1 << b)) >>> 0;
  return { first: true, achievements: checkAchievements(doc) };
}

// ---------- falas condicionais dos NPCs ----------
// `greet` = texto ou lista de { when, text }; vale a primeira entrada cuja `when` bate (sem `when` = padrão).
// Condições (todas precisam valer): level (>=), bossKills (>=), bossKillsMax (<=), done (missão concluída, id ou lista), offline (true = só sem servidor).
export function greetMatches(doc, when = {}, { online = false } = {}) {
  if (when.level != null && doc.level < when.level) return false;
  const bk = doc.stats?.bossKills ?? 0;
  if (when.bossKills != null && bk < when.bossKills) return false;
  if (when.bossKillsMax != null && bk > when.bossKillsMax) return false;
  for (const id of [].concat(when.done ?? [])) if (doc.quests?.done?.[id] == null) return false;
  if (when.offline != null && when.offline !== !online) return false;
  return true;
}
export function greetFor(doc, greet, opts) {
  if (typeof greet === 'string') return greet;
  return (greet ?? []).find((g) => greetMatches(doc, g.when, opts))?.text ?? '…';
}

// ---------- baús ----------
export const chestReady = (doc, chestId, now = Date.now()) => now - (doc.chests?.[chestId] ?? -Infinity) >= CHEST_COOLDOWN_MS;
export function openChest(doc, chest, zoneId, rng, now = Date.now()) {
  if (!chestReady(doc, chest.id, now)) return { ok: false, reason: 'O baú está vazio por enquanto.' };
  doc.chests[chest.id] = now;
  // limpa registros velhos (mantém o objeto pequeno)
  const keys = Object.keys(doc.chests); if (keys.length > 120) for (const k of keys.sort((x, y) => doc.chests[x] - doc.chests[y]).slice(0, keys.length - 120)) delete doc.chests[k];
  const lvl = Math.max(1, doc.level), tier = chest.tier ?? 1;
  const gold = Math.round(rng.int(lvl * 6, lvl * 12) * tier);
  doc.gold += gold;
  let item = null;
  // G1: o baú era a maior fonte de épicos (18/h nas Cinzas); agora ~1–3 épico+/h nas zonas finais (tools/chest-check.mjs)
  if (rng.chance(Math.min(0.8, 0.15 * tier))) {
    item = generateItem(rng, lvl, { classId: doc.classId, luck: 0.25 * tier });
    if (doc.inventory.length < INVENTORY_SIZE) doc.inventory.push(item); else { doc.gold += item.value; item = { ...item, converted: true }; }
  }
  const out = recordEvent(doc, { type: 'chest', zoneId }, now);
  return { ok: true, gold, item, quests: out.quests, achievements: out.achievements };
}
