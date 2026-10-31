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
  for (const [id, a] of Object.entries(doc.quests.active)) {
    const q = QUESTS[id]; let changed = false;
    q.objectives.forEach((o, i) => {
      const max = o.count ?? 1, before = a.p[i] ?? 0;
      let v = before;
      if (o.type === 'level' && ev.type === 'level') v = Math.max(before, Math.min(max, ev.level));
      else if (o.type === 'spirit' && ev.type === 'spirit') v = Math.max(before, Math.min(max, ev.count));
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
export const achievementProgress = (doc, a) => ({ value: Math.min(a.min, statValue(doc, a.stat)), min: a.min, earned: doc.achievements?.[a.id] != null });
// Concede as conquistas cujo contador já foi atingido (o servidor repete este cálculo; o cliente não escolhe).
export function checkAchievements(doc, now = Date.now()) {
  const out = [];
  doc.achievements ??= {};
  for (const a of ACHIEVEMENTS) if (doc.achievements[a.id] == null && statValue(doc, a.stat) >= a.min) { doc.achievements[a.id] = now; out.push(a.id); }
  return out;
}
export function setTitle(doc, achievementId) {
  if (achievementId == null) { doc.title = null; return true; }
  const a = ACH[achievementId];
  if (!a?.title || doc.achievements?.[achievementId] == null) return false;
  doc.title = achievementId; return true;
}
export const titleText = (doc) => (doc.title && ACH[doc.title]?.title) || '';

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
  if (rng.chance(0.3 * tier)) {
    item = generateItem(rng, lvl, { classId: doc.classId, luck: 1.2 * tier });
    if (doc.inventory.length < INVENTORY_SIZE) doc.inventory.push(item); else { doc.gold += item.value; item = { ...item, converted: true }; }
  }
  const out = recordEvent(doc, { type: 'chest', zoneId }, now);
  return { ok: true, gold, item, quests: out.quests, achievements: out.achievements };
}
