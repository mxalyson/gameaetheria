// Documento do personagem: versão, migração e validação. Sem DOM (o mesmo código valida no cliente hoje e no servidor depois).
// ATENÇÃO: validar no cliente NÃO impede trapaça (o jogador controla o navegador); serve para (1) não quebrar o jogo com save
// corrompido/antigo, (2) não deixar texto malicioso entrar na tela, (3) ser a base do validador que o servidor vai usar.
import { CLASSES } from '../data/classes.js';
import { SLOTS, RARITY, WEAPON_TYPES, INVENTORY_SIZE } from '../data/items.js';
import { SPIRITS, SPIRIT_RARITY_MUL, MAX_SPIRITS } from '../data/spirits.js';
import { MAX_PLUS } from './enhance.js';
import { MAX_LEVEL, POINTS_PER_LEVEL, SAVE_VERSION } from './progression.js';
import { SPECS, SPEC_LEVEL } from '../data/specs.js';
import { QUESTS } from '../data/quests.js';
import { ZONES } from '../data/zones.js';
import { ACH, STAT_KEYS_PROGRESS } from '../data/achievements.js';

export { SAVE_VERSION };
export const SAVE_FORMAT = 'aetheria-save';
export const MAX_SAVE_BYTES = 300 * 1024;

const STAT_CAP = { str: 400, agi: 400, int: 400, vit: 400, atk: 2000, def: 2000, hp: 20000, crit: 100, atkSpeed: 100, moveSpeed: 100, lifesteal: 100 };
const ALLOC_KEYS = ['str', 'agi', 'int', 'vit'];

const int = (v, min, max, dflt) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.round(n)));
};
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Nome do personagem: só letras, números, espaço, apóstrofo, hífen e sublinhado (nada de HTML), no máximo 14.
export function cleanName(v) {
  const s = String(v ?? '').normalize('NFC').replace(/[^\p{L}\p{N} _'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  return s || 'Herói';
}
const cleanText = (v, max) => str(v, max).replace(/[<>&"`]/g, '').trim();

// ---------- migrações: cada passo leva a versão N para N+1 ----------
const MIGRATIONS = {
  // v1 (localStorage original) → v2: ratings por modo de arena, especialização
  1: (d) => {
    d.arena = { rating: 1000, wins: 0, losses: 0, bestWave: 0, ratings: {}, ...(isObj(d.arena) ? d.arena : {}) };
    d.arena.ratings ??= {};
    d.spec ??= null;
    return d;
  },
  // v2 → v3: missões, contadores, conquistas, título e baús
  2: (d) => {
    d.quests = isObj(d.quests) ? d.quests : { active: {}, done: {} };
    d.stats = isObj(d.stats) ? d.stats : {};
    d.achievements = isObj(d.achievements) ? d.achievements : {};
    d.title ??= null; d.chests = isObj(d.chests) ? d.chests : {};
    return d;
  },
};

export function migrate(doc) {
  const from = Number.isInteger(doc.version) && doc.version >= 1 ? doc.version : 1;
  if (from > SAVE_VERSION) return { ok: false, reason: `Save de uma versão mais nova (${from}); atualize o jogo.` };
  let d = { ...doc };
  for (let v = from; v < SAVE_VERSION; v++) d = MIGRATIONS[v](d);
  d.version = SAVE_VERSION;
  return { ok: true, doc: d, from };
}

function cleanItem(it) {
  if (!isObj(it) || it.kind !== 'gear') return null;
  if (!SLOTS.includes(it.slot) || !RARITY[it.rarity]) return null;
  const weaponType = it.slot === 'weapon' ? (WEAPON_TYPES[it.weaponType] ? it.weaponType : null) : null;
  if (it.slot === 'weapon' && !weaponType) return null;
  const stats = {};
  if (!isObj(it.stats)) return null;
  for (const [k, v] of Object.entries(it.stats)) {
    if (!(k in STAT_CAP)) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) stats[k] = Math.min(STAT_CAP[k], Math.round(n));
  }
  const id = str(it.id, 48).replace(/[^\w-]/g, '');
  if (!id) return null;
  return {
    id, kind: 'gear', name: cleanText(it.name, 60) || 'Item', slot: it.slot, weaponType, rarity: it.rarity,
    level: int(it.level, 1, 60, 1), reqLevel: int(it.reqLevel, 1, 60, 1), stats, value: int(it.value, 0, 1e6, 0),
    ...(it.opal === true ? { opal: true } : {}), // exclusivo do último chefe
    ...(int(it.plus, 0, MAX_PLUS, 0) > 0 ? { plus: int(it.plus, 0, MAX_PLUS, 0) } : {}),
  };
}

function cleanSpirit(sp) {
  if (!isObj(sp) || !SPIRITS[sp.type] || !(sp.rarity in SPIRIT_RARITY_MUL)) return null;
  const id = str(sp.id, 48).replace(/[^\w-]/g, '');
  if (!id) return null;
  const level = int(sp.level, 1, MAX_LEVEL, 1);
  return { id, type: sp.type, rarity: sp.rarity, level, xp: int(sp.xp, 0, 1e7, 0), ...(sp.stage === 2 && level >= 10 ? { stage: 2 } : {}) };
}

// Valida e normaliza um documento JÁ migrado. Devolve { ok, char, warnings } (nunca lança).
export function validate(doc) {
  const warnings = [];
  if (!isObj(doc)) return { ok: false, reason: 'Documento inválido.' };
  if (!CLASSES[doc.classId]) return { ok: false, reason: 'Classe desconhecida.' };
  const level = int(doc.level, 1, MAX_LEVEL, 1);
  if (level !== Number(doc.level)) warnings.push('nível ajustado');

  const alloc = {};
  for (const k of ALLOC_KEYS) alloc[k] = int(doc.alloc?.[k], 0, 999, 0);
  let statPoints = int(doc.statPoints, 0, 999, 0);
  // Contabilidade de pontos: ninguém tem mais pontos do que o nível permite.
  const budget = POINTS_PER_LEVEL * (level - 1);
  let spent = ALLOC_KEYS.reduce((s, k) => s + alloc[k], 0);
  if (spent + statPoints > budget) {
    warnings.push('pontos de atributo acima do permitido foram removidos');
    statPoints = Math.max(0, Math.min(statPoints, budget - spent));
    for (const k of ALLOC_KEYS) { const over = spent + statPoints - budget; if (over > 0) { const cut = Math.min(alloc[k], over); alloc[k] -= cut; spent -= cut; } }
  }

  const equipment = {};
  if (isObj(doc.equipment)) {
    for (const slot of SLOTS) {
      if (!doc.equipment[slot]) continue;
      const it = cleanItem(doc.equipment[slot]);
      if (it && it.slot === slot) equipment[slot] = it; else warnings.push(`item inválido em ${slot} removido`);
    }
  }
  const seen = new Set(Object.values(equipment).map((i) => i.id));
  const inventory = [];
  for (const raw of Array.isArray(doc.inventory) ? doc.inventory : []) {
    const it = cleanItem(raw);
    if (!it) { warnings.push('item inválido removido do inventário'); continue; }
    if (seen.has(it.id)) { warnings.push('item duplicado removido'); continue; } // proteção contra duplicação por edição do save
    if (inventory.length >= INVENTORY_SIZE) { warnings.push('inventário acima do limite'); break; }
    seen.add(it.id); inventory.push(it);
  }
  const spirits = [];
  const sids = new Set();
  for (const raw of Array.isArray(doc.spirits) ? doc.spirits : []) {
    const sp = cleanSpirit(raw);
    if (!sp || sids.has(sp.id) || spirits.length >= MAX_SPIRITS) { warnings.push('spirit inválido removido'); continue; }
    sids.add(sp.id); spirits.push(sp);
  }
  const activeSpirit = spirits.some((s) => s.id === doc.activeSpirit) ? doc.activeSpirit : (spirits[0]?.id ?? null);

  const a = isObj(doc.arena) ? doc.arena : {};
  const ratings = {};
  for (const m of ['2v2', '4v4']) if (isObj(a.ratings) && a.ratings[m] != null) ratings[m] = int(a.ratings[m], 0, 5000, 1000);
  const spec = doc.spec && SPECS[doc.classId]?.[doc.spec] && level >= SPEC_LEVEL ? doc.spec : null;
  if (doc.spec && !spec) warnings.push('especialização inválida removida');

  // ---- diário (v3): tudo é reconstruído a partir de listas brancas ----
  const quests = { active: {}, done: {} };
  const qin = isObj(doc.quests) ? doc.quests : {};
  for (const [id, v] of Object.entries(isObj(qin.done) ? qin.done : {})) if (QUESTS[id]) quests.done[id] = int(v, 0, 4e12, 0);
  for (const [id, v] of Object.entries(isObj(qin.active) ? qin.active : {})) {
    const q = QUESTS[id];
    if (!q || quests.done[id] != null || Object.keys(quests.active).length >= 5) { warnings.push('missão inválida removida'); continue; }
    quests.active[id] = { p: q.objectives.map((o, i) => int(Array.isArray(v?.p) ? v.p[i] : 0, 0, o.count ?? 1, 0)), at: int(v?.at, 0, 4e12, 0) };
  }
  const stats = {};
  for (const k of STAT_KEYS_PROGRESS) stats[k] = int(isObj(doc.stats) ? doc.stats[k] : 0, 0, 1e8, 0);
  const achievements = {};
  for (const [id, v] of Object.entries(isObj(doc.achievements) ? doc.achievements : {})) if (ACH[id]) achievements[id] = int(v, 0, 4e12, 0);
  const title = typeof doc.title === 'string' && ACH[doc.title]?.title && achievements[doc.title] != null ? doc.title : null;
  const chests = {};
  for (const [id, v] of Object.entries(isObj(doc.chests) ? doc.chests : {}).slice(0, 200)) if (/^[a-z0-9_:-]{1,40}$/.test(id)) chests[id] = int(v, 0, 4e12, 0);

  const visited = {};
  for (const id of Object.keys(isObj(doc.visited) ? doc.visited : {})) if (ZONES[id] && (id === 'town' || ZONES[id].mobs)) visited[id] = 1;
  if (!isObj(doc.visited)) for (const [id, z] of Object.entries(ZONES)) if (z.mobs && z.level[0] <= level) visited[id] = 1; // saves antigos: libera o que o nível já alcança

  const char = {
    version: SAVE_VERSION, visited, name: cleanName(doc.name), quests, stats, achievements, title, chests, classId: doc.classId, level,
    xp: int(doc.xp, 0, 1e9, 0), statPoints, alloc,
    gold: int(doc.gold, 0, 1e9, 0), potions: int(doc.potions, 0, 999, 0), scrolls: int(doc.scrolls, 0, 99, 0),
    equipment, inventory, spirits, activeSpirit, spec,
    arena: { rating: int(a.rating, 0, 5000, 1000), wins: int(a.wins, 0, 1e6, 0), losses: int(a.losses, 0, 1e6, 0), bestWave: int(a.bestWave, 0, 1e4, 0), ratings },
    pity: { epic: int(doc.pity?.epic, 0, 9999, 0), legendary: int(doc.pity?.legendary, 0, 9999, 0), opal: int(doc.pity?.opal, 0, 99, 0) }, // proteção de azar do loot
    created: int(doc.created, 0, 4e12, Date.now()),
  };
  if (char.name !== doc.name) warnings.push('nome ajustado');
  return { ok: true, char, warnings };
}

// Texto (JSON) → personagem validado. Aceita o save cru ou o arquivo exportado (envelope).
export function parseSave(text) {
  if (typeof text !== 'string' || !text.length) return { ok: false, reason: 'Arquivo vazio.' };
  if (text.length > MAX_SAVE_BYTES) return { ok: false, reason: 'Arquivo grande demais.' };
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, reason: 'Não é um JSON válido.' }; }
  if (isObj(data) && data.format === SAVE_FORMAT && isObj(data.char)) data = data.char;
  if (!isObj(data)) return { ok: false, reason: 'Formato desconhecido.' };
  const m = migrate(data);
  if (!m.ok) return m;
  const v = validate(m.doc);
  if (!v.ok) return v;
  return { ok: true, char: v.char, warnings: v.warnings, migratedFrom: m.from < SAVE_VERSION ? m.from : null };
}

export function exportSave(char) {
  return JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION, exportedAt: new Date().toISOString(), char }, null, 1);
}
