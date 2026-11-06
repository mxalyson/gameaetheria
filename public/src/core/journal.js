// Diário do personagem: missões, contadores, conquistas, títulos e baús. Regras PURAS (sem DOM), usadas pelo cliente (offline/online)
// e pelo servidor (partidas PvP/cooperativas e plausibilidade do salvamento). Estado no documento do personagem (v3):
//   doc.quests = { active: { id: { p: [progresso por objetivo], at } }, done: { id: ts } }, doc.stats = {...}, doc.achievements = { id: ts },
//   doc.title = id de conquista | null, doc.chests = { idDoBaú: instante da última abertura }
import { QUESTS, SPIRIT_EVO_QUEST } from '../data/quests.js';
import { CLASSES } from '../data/classes.js';
import { skillIdAt, kitSpec } from './unlocks.js';
import { SPIRITS } from '../data/spirits.js';
import { ACHIEVEMENTS, ACH, STAT_KEYS_PROGRESS } from '../data/achievements.js';
import { INVENTORY_SIZE } from '../data/items.js';
import { addXp } from './progression.js';
import { generateItem, rollRarity } from './loot.js';
import { ZONES } from '../data/zones.js';
import { MOBS, MOBS_EXTRA } from '../data/mobs.js';
import { makeRng, hashString } from './rng.js';
import { grantEchoKey } from './echo.js';
import { MENTOR_BY_ID, mentorsOfClass } from '../data/mentors.js';
import { SPECS } from '../data/specs.js';
import { WHISTLE } from '../data/mounts.js';
import { addWhistles, ownedMounts } from './mounts.js';

export const SERVER_TYPES = new Set(['pvp', 'coop', 'crypt']); // objetivos que só o servidor soma
export const OFFLINE_TYPES = new Set(); // objetivos que só existem no jogo solo (vazio desde que o duelo amistoso passou a rodar online: o servidor conta a vitória)
// Objetivos que, no modo ESTRITO de PvE (server/plausible.js), só o servidor soma (transações `lore`/`spirit_evolve`, teletransporte/visita no hub, vitória no duelo amistoso).
export const PVE_SERVER_TYPES = new Set(['visit', 'teleport', 'lore', 'spiritStage', 'friendlyDuel', 'talk']);
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

// ---------- mentores de especialização (Porto de Marfim) ----------
// Quantos dos mentores da PRÓPRIA classe o personagem já visitou (bits em stats.mentors). Quem já escolheu uma especialização (saves antigos) conta como tendo visitado os dois.
export const mentorSeen = (doc, mentorId) => { const m = MENTOR_BY_ID[mentorId]; return !!m && ((doc.stats?.mentors ?? 0) & (1 << m.bit)) !== 0; };
export function mentorsTalked(doc) {
  if (doc.spec && SPECS[doc.classId]?.[doc.spec]) return 2;
  return mentorsOfClass(doc.classId).filter((m) => mentorSeen(doc, m.id)).length;
}

// ---------- missões ----------
// Mestres de Classe: a missão com `giver: 'master'` é do mestre da classe do jogador (npc `master_<classId>`).
export const masterNpcId = (classId) => 'master_' + classId;
// Id do NPC que oferece/recebe a missão PARA este personagem (a UI do diário usa isto em vez de `q.giver`).
export const questGiverId = (doc, q) => (q.giver === 'master' ? masterNpcId(doc.classId) : q.giver);
// O NPC é o "dono" (oferece/recebe) da missão para este personagem?
const isGiver = (doc, q, npcId, role = q.giver) => role === npcId || (role === 'master' && npcId === masterNpcId(doc.classId));
export function requirementsMet(doc, q) {
  if (q.spirit && !(doc.spirits ?? []).some((s) => s.type === q.spirit.type && s.level >= q.spirit.level)) return false;
  return doc.level >= q.level && (!q.after || doc.quests.done[q.after] != null);
}
// `server:false` (jogo offline) esconde as missões que só o servidor consegue completar (PvP/cooperativo reais).
export const offeredBy = (doc, npcId, { server = true } = {}) => Object.values(QUESTS).filter((q) => isGiver(doc, q, npcId) && doc.quests.done[q.id] == null && !doc.quests.active[q.id] && requirementsMet(doc, q) && (server ? !q.objectives.some((o) => OFFLINE_TYPES.has(o.type)) : !q.objectives.some((o) => SERVER_TYPES.has(o.type))));
export const isComplete = (doc, id) => { const a = doc.quests.active[id], q = QUESTS[id]; return !!a && q.objectives.every((o, i) => (a.p[i] ?? 0) >= (o.count ?? 1)); };
export const readyFor = (doc, npcId) => Object.keys(doc.quests.active).filter((id) => isGiver(doc, QUESTS[id], npcId, QUESTS[id].turnIn ?? QUESTS[id].giver) && isComplete(doc, id));
export const activeFor = (doc, npcId) => Object.keys(doc.quests.active).filter((id) => isGiver(doc, QUESTS[id], npcId, QUESTS[id].turnIn ?? QUESTS[id].giver) && !isComplete(doc, id));

// Estado da missão de evolução de um spirit (a UI de spirits mostra `text`): locked (falta nível) | available (fale com a Sábia Yun) |
// active (em andamento; `progress`) | ready (missão feita; falta evoluir) | evolved. `ok` = evolveSpirit pode funcionar.
export function spiritEvoStatus(doc, sp) {
  const qid = SPIRIT_EVO_QUEST[sp.type], q = QUESTS[qid], S = SPIRITS[sp.type];
  const mk = (state, text, extra = {}) => ({ state, questId: qid, ok: state === 'ready', text, ...extra });
  if (sp.stage === 2) return mk('evolved', 'Já está na forma evoluída.');
  if (doc.quests?.done?.[qid] != null) return mk('ready', 'Missão de evolução concluída: pronto para evoluir.');
  const a = doc.quests?.active?.[qid];
  if (a) {
    const progress = q.objectives.map((o, i) => ({ label: o.label, value: Math.min(o.count ?? 1, a.p[i] ?? 0), count: o.count ?? 1 }));
    return mk('active', `Missão de evolução (${S.element}): ` + progress.map((p) => `${p.value}/${p.count} ${p.label}`).join(' · '), { progress });
  }
  if (sp.level < q.spirit.level) return mk('locked', `Missão de evolução: suba ${S.name} ao nível ${q.spirit.level} (está no ${sp.level}).`);
  return mk('available', `Missão de evolução: fale com a Sábia Yun na Vila para aceitar "${q.name}".`);
}

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

function matches(o, ev, doc) {
  switch (o.type) {
    case 'miniboss': return ev.type === 'kill' && !!ev.mini && (!o.zone || o.zone === 'any' || o.zone === ev.zoneId); // `zone` opcional: o mini-chefe daquele mapa
    case 'spiritKill': return ev.type === 'kill' && ev.spiritType === o.spirit;
    case 'skillUse': return ev.type === 'skill' && (o.skill !== 'signature' || ev.skillId === skillIdAt(doc.classId, 0, kitSpec(doc)) || ev.skillId === CLASSES[doc.classId]?.skills[0]);
    case 'kill': return ev.type === 'kill' && (o.mob === 'any' || o.mob === ev.mobId) && (o.zone === 'any' || o.zone === ev.zoneId);
    case 'boss': return ev.type === 'kill' && ev.boss && (o.mob === 'any' || o.mob === ev.mobId);
    case 'chest': return ev.type === 'chest' && (o.zone === 'any' || o.zone === ev.zoneId);
    case 'pvp': return ev.type === 'pvp' && ev.won && (o.mode === 'any' || o.mode === ev.mode);
    case 'coop': return ev.type === 'coop' && ev.victory;
    case 'crypt': return ev.type === 'crypt'; // vencer o chefe da Cripta dos Ecos (evento do servidor)
    case 'teleport': return ev.type === 'teleport';
    case 'upgrade': return ev.type === 'upgrade';
    case 'bank': return ev.type === 'bank';                       // guardar 1 item no banco do Porto
    case 'daily': return ev.type === 'daily';                     // entregar 1 contrato do Quadro
    case 'friendlyDuel': return ev.type === 'friendlyDuel' && !!ev.won; // vencer um duelo amistoso (offline: o jogo conta; online: o servidor)
    default: return false;
  }
}

// Evento do jogo → contadores, progresso de missões e conquistas. Devolve o que mudou, para a interface avisar o jogador.
export function recordEvent(doc, ev, now = Date.now()) {
  ensureJournal(doc);
  const out = { quests: [], achievements: [] };
  const st = doc.stats;
  if (ev.type === 'kill') { st.kills++; if (ev.boss) st.bossKills++; if (ev.spiritType) st.spiritKills++; }
  else if (ev.type === 'skill') st.skillUses++;
  else if (ev.type === 'chest') st.chests++;
  else if (ev.type === 'pvp') { st.pvpGames++; if (ev.won) st.pvpWins++; }
  else if (ev.type === 'coop' && ev.victory) st.coopClears++;
  else if (ev.type === 'crypt') st.cryptClears++;
  else if (ev.type === 'teleport') st.teleports++;
  else if (ev.type === 'upgrade') st.upgrades++;
  else if (ev.type === 'bank') st.deposits++;
  else if (ev.type === 'daily') st.contracts++;
  else if (ev.type === 'friendlyDuel') { if (ev.won) st.friendlyWins++; }
  else if (ev.type === 'visit' && ev.zoneId === 'harbor') st.harborVisits++;
  else if (ev.type === 'talk' && MENTOR_BY_ID[ev.npc]) st.mentors = (st.mentors | (1 << MENTOR_BY_ID[ev.npc].bit)) >>> 0; // visita ao mentor (qualquer classe, por curiosidade)
  for (const [id, a] of Object.entries(doc.quests.active)) {
    const q = QUESTS[id]; let changed = false;
    q.objectives.forEach((o, i) => {
      const max = o.count ?? 1, before = a.p[i] ?? 0;
      let v = before;
      if (o.type === 'level' && ev.type === 'level') v = Math.max(before, Math.min(max, ev.level));
      else if (o.type === 'spirit' && ev.type === 'spirit') v = Math.max(before, Math.min(max, ev.count));
      else if (o.type === 'spiritStage' && ev.type === 'spiritStage') v = Math.max(before, Math.min(max, ev.count));
      else if (o.type === 'talk' && (ev.type === 'talk' || ev.type === 'level')) v = Math.max(before, Math.min(max, mentorsTalked(doc))); // derivado dos bits: também vale ao aceitar a missão e para saves com especialização
      else if (matches(o, ev, doc)) v = Math.min(max, before + 1);
      if (v !== before) { a.p[i] = v; changed = true; }
    });
    if (changed) out.quests.push({ id, complete: isComplete(doc, id), progress: [...a.p] });
  }
  dailyProgress(doc, ev, now); // Quadro de Contratos do Porto (abaixo): kills e baús avançam os contratos do dia
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
  if (r.mount) doc.mounts = ownedMounts({ ...doc, mounts: [...(doc.mounts ?? []), r.mount] }); // montaria da missão (Lobo Cinzento): fica na lista do documento
  return { ok: true, reward: { gold: r.gold ?? 0, xp: r.xp ?? 0, potions: r.potions ?? 0, items, levels, ...(r.mount ? { mount: r.mount } : {}) }, achievements: out.achievements, quests: out.quests };
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
export const TIP_BITS = { forest: 0, chest: 1, level: 2, skill: 3, spirit: 4, boss: 5, ritual: 6, crypt: 7, spec: 8, phoenix: 9 }; // crypt/spec/phoenix: avisos automáticos (main.js autoTip), nunca durante combate
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
// Condições (todas precisam valer): classId / notClassId (classe do personagem), level (>=), bossKills (>=), bossKillsMax (<=), done (missão concluída, id ou lista), offline (true = só sem servidor).
export function greetMatches(doc, when = {}, { online = false } = {}) {
  if (when.level != null && doc.level < when.level) return false;
  const bk = doc.stats?.bossKills ?? 0;
  if (when.bossKills != null && bk < when.bossKills) return false;
  if (when.bossKillsMax != null && bk > when.bossKillsMax) return false;
  if (when.classId != null && doc.classId !== when.classId) return false;
  if (when.notClassId != null && doc.classId === when.notClassId) return false;
  for (const id of [].concat(when.done ?? [])) if (doc.quests?.done?.[id] == null) return false;
  if (when.offline != null && when.offline !== !online) return false;
  return true;
}
// Serviço do botão do NPC para ESTE personagem: o dos Mestres de Classe só aparece para a própria classe (`service.classId`).
export const serviceFor = (doc, dialog) => (dialog?.service && (!dialog.service.classId || dialog.service.classId === doc.classId) ? dialog.service : null);
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
  const whistle = rng.chance(WHISTLE.chest * tier) && addWhistles(doc, 1) > 0; // Apito de Montaria: baú não dá mais (WHISTLE.chest = 0 desde 2026-11-06)
  const out = recordEvent(doc, { type: 'chest', zoneId }, now);
  return { ok: true, gold, item, whistle, quests: out.quests, achievements: out.achievements };
}

// ---------- Quadro de Contratos do Porto (missões diárias determinísticas) ----------
// 3 contratos por dia UTC, sorteados por semente do dia (todos os jogadores do mesmo nível veem o mesmo quadro): "derrote N de X numa zona",
// "derrote N criaturas numa zona" e "abra N baús". Progresso e entregas em doc.daily = { day, p: { idDoContrato: n }, done: { idDoContrato: 1 } }.
// Quem soma o progresso é recordEvent (acima); quem paga é claimDaily. A interface do Quadro (Mestra de Caça Vesna) só lista dailyBoard e chama claimDaily.
export const DAILY_COUNT = 3;
export const dayUTC = (ms = Date.now()) => Math.floor(ms / 86400000);
export const blankDaily = () => ({ day: 0, p: {}, done: {} });

// Zonas de farm elegíveis para o nível: já liberadas (nível mínimo ≤ nível+1) e não obsoletas (teto ≥ nível-8); sempre pelo menos a mais alta liberada.
function dailyZones(level) {
  const farm = Object.entries(ZONES).filter(([, z]) => z.mobs && z.level).sort((a, b) => a[1].level[0] - b[1].level[0]);
  const open = farm.filter(([, z]) => z.level[0] <= level + 1);
  const fresh = open.filter(([, z]) => z.level[1] >= level - 8);
  return (fresh.length ? fresh : open.slice(-1).length ? open.slice(-1) : farm.slice(0, 1)).map(([id]) => id);
}

export function dailyBoard(doc, day = dayUTC()) {
  const lvl = Math.max(1, doc.level ?? 1), zones = dailyZones(lvl), rng = makeRng(hashString(`board|${day}`));
  const pickZone = () => zones[Math.floor(rng.next() * zones.length)];
  const killXp = Math.round((12 + lvl * 6) * 0.35);
  const board = [];
  // 1) um tipo de criatura específico (N entre 8 e 14)
  { const zone = pickZone(), mobs = ZONES[zone].mobs.map((m) => m[0]), mob = mobs[Math.floor(rng.next() * mobs.length)], count = 8 + Math.floor(rng.next() * 7);
    board.push({ id: `d${day}-0-${zone}-${mob}`, slot: 0, kind: 'kill', zone, mob, count, label: `Derrote ${count}× ${(MOBS[mob] ?? MOBS_EXTRA[mob]).name} (${ZONES[zone].name})`,
      reward: { gold: Math.round(count * (3 + lvl * 1.2)), xp: count * killXp, potions: 1 } }); }
  // 2) qualquer criatura de uma zona (N entre 15 e 25)
  { const zone = pickZone(), count = 15 + Math.floor(rng.next() * 11);
    board.push({ id: `d${day}-1-${zone}-any`, slot: 1, kind: 'kill', zone, mob: 'any', count, label: `Derrote ${count} criaturas (${ZONES[zone].name})`,
      reward: { gold: Math.round(count * (2.5 + lvl)), xp: count * killXp, potions: 1 } }); }
  // 3) baús em qualquer zona (2 ou 3; cada baú recarrega em 10 min)
  { const count = 2 + Math.floor(rng.next() * 2);
    board.push({ id: `d${day}-2-any-chest`, slot: 2, kind: 'chest', zone: 'any', mob: null, count, label: `Abra ${count} baús em qualquer zona`,
      reward: { gold: Math.round(count * lvl * 8), xp: Math.round(count * lvl * 10), potions: 2 } }); }
  return board;
}

// Estado do dia (zera quando o dia UTC muda). Cria doc.daily se faltar.
export function dailyState(doc, day = dayUTC()) {
  if (!doc.daily || doc.daily.day !== day) doc.daily = { ...blankDaily(), day };
  doc.daily.p ??= {}; doc.daily.done ??= {};
  return doc.daily;
}
export const dailyProgressOf = (doc, c) => Math.min(c.count, doc.daily?.p?.[c.id] ?? 0);
export const dailyComplete = (doc, c) => dailyProgressOf(doc, c) >= c.count;

// Soma 1 ao progresso dos contratos do dia que o evento cumpre (kill: mob/zona; chest). Chamada por recordEvent; devolve os contratos que mudaram.
export function dailyProgress(doc, ev, now = Date.now()) {
  if (ev.type !== 'kill' && ev.type !== 'chest') return [];
  const day = dayUTC(now), st = dailyState(doc, day), changed = [];
  for (const c of dailyBoard(doc, day)) {
    if (st.done[c.id] || (st.p[c.id] ?? 0) >= c.count) continue;
    const hit = c.kind === 'kill' ? ev.type === 'kill' && !ev.boss && (c.mob === 'any' || c.mob === ev.mobId) && c.zone === ev.zoneId : ev.type === 'chest';
    if (hit) { st.p[c.id] = (st.p[c.id] ?? 0) + 1; changed.push(c.id); }
  }
  return changed;
}

// Entrega um contrato completo: ouro, XP e poções. Idempotente (done). Devolve { ok, reward, levels } ou { ok:false, reason }.
export function claimDaily(doc, id, now = Date.now()) {
  const day = dayUTC(now), c = dailyBoard(doc, day).find((x) => x.id === id);
  if (!c) return { ok: false, reason: 'Contrato indisponível hoje.' };
  const st = dailyState(doc, day);
  if (st.done[id]) return { ok: false, reason: 'Contrato já entregue hoje.' };
  if (!dailyComplete(doc, c)) return { ok: false, reason: 'O contrato ainda não está completo.' };
  st.done[id] = 1;
  doc.gold += c.reward.gold;
  const levels = addXp(doc, c.reward.xp);
  doc.potions = Math.min(999, doc.potions + c.reward.potions);
  const key = grantEchoKey(doc); // Chave de Eco: entrada extra na Cripta (core/echo.js); no teto não soma
  const ev = recordEvent(doc, { type: 'daily' }, now); // missão `porto_contrato` e contador de contratos
  const out = recordEvent(doc, { type: 'level', level: doc.level }, now);
  return { ok: true, reward: { ...c.reward, key }, levels, achievements: [...ev.achievements, ...out.achievements], quests: [...ev.quests, ...out.quests] };
}
