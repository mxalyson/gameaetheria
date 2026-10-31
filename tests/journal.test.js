import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../public/src/core/rng.js';
import { newCharacter, createSpirit } from '../public/src/core/progression.js';
import { QUESTS } from '../public/src/data/quests.js';
import { ACHIEVEMENTS } from '../public/src/data/achievements.js';
import { INVENTORY_SIZE } from '../public/src/data/items.js';
import { offeredBy, acceptQuest, recordEvent, isComplete, turnInQuest, readyFor, activeFor, checkAchievements, setTitle, titleText, openChest, chestReady, MAX_ACTIVE, CHEST_COOLDOWN_MS, SERVER_TYPES, ensureJournal } from '../public/src/core/journal.js';
import { parseSave, migrate, validate } from '../public/src/core/savedoc.js';
import { checkSave, LIMITS } from '../server/plausible.js';
import { applyMatchResult, applyCoopResult } from '../public/src/core/rewards.js';
import { ZONES } from '../public/src/data/zones.js';

const rng = makeRng(9);
const hero = (level = 1, classId = 'warrior') => { const c = newCharacter('Heroi', classId, makeRng(5)); c.level = level; return c; };
const kill = (doc, n, extra = {}) => { for (let i = 0; i < n; i++) recordEvent(doc, { type: 'kill', mobId: 'slime', zoneId: 'forest', boss: false, ...extra }); };

test('dados: toda missão é coerente (giver/after/objetivos/recompensa) e o encadeamento não tem ciclo', () => {
  const npcs = new Set(Object.values(ZONES).flatMap((z) => (z.npcs ?? []).map((n) => n.id)));
  for (const q of Object.values(QUESTS)) {
    assert.ok(npcs.has(q.giver), `${q.id}: NPC ${q.giver} não existe`);
    assert.ok(q.objectives.length >= 1 && q.objectives.every((o) => o.label && ['kill', 'boss', 'chest', 'spirit', 'level', 'pvp', 'coop'].includes(o.type)));
    assert.ok(q.text.offer && q.text.progress && q.text.done);
    assert.ok(q.reward && (q.reward.gold > 0 || q.reward.xp > 0 || q.reward.items));
    if (q.after) assert.ok(QUESTS[q.after], `${q.id}: depende de ${q.after}`);
    let hops = 0, cur = q; while (cur.after && hops++ < 30) cur = QUESTS[cur.after];
    assert.ok(hops < 30, 'ciclo em ' + q.id);
  }
});

test('missão: oferta respeita nível e pré-requisito; aceitar, progredir, entregar uma vez só', () => {
  const d = ensureJournal(hero(1));
  assert.deepEqual(offeredBy(d, 'guard').map((q) => q.id), ['primeiros_passos']);
  assert.equal(acceptQuest(d, 'caca_aos_lobos').ok, false, 'depende da anterior');
  assert.equal(acceptQuest(d, 'primeiros_passos').ok, true);
  assert.equal(acceptQuest(d, 'primeiros_passos').ok, false, 'já ativa');
  kill(d, 4, { zoneId: 'plains' }); // zona errada não conta
  assert.equal(isComplete(d, 'primeiros_passos'), false);
  kill(d, 4);
  assert.equal(d.quests.active.primeiros_passos.p[0], 4);
  assert.deepEqual(activeFor(d, 'guard'), ['primeiros_passos']);
  assert.equal(turnInQuest(d, 'primeiros_passos', rng).ok, false);
  kill(d, 5); // além do necessário não passa de 5
  assert.equal(d.quests.active.primeiros_passos.p[0], 5);
  assert.deepEqual(readyFor(d, 'guard'), ['primeiros_passos']);
  const gold0 = d.gold, xp0 = d.xp;
  const r = turnInQuest(d, 'primeiros_passos', rng);
  assert.equal(r.ok, true); assert.equal(d.gold, gold0 + 60); assert.ok(d.xp > xp0 || d.level > 1);
  assert.ok(d.quests.done.primeiros_passos); assert.equal(d.quests.active.primeiros_passos, undefined);
  assert.equal(d.stats.quests, 1);
  assert.equal(turnInQuest(d, 'primeiros_passos', rng).ok, false, 'não paga duas vezes');
  assert.equal(acceptQuest(d, 'primeiros_passos').ok, false, 'não se repete');
  assert.ok(d.level >= 2, 'a recompensa de XP subiu o nível');
  assert.ok(offeredBy(d, 'guard').some((q) => q.id === 'caca_aos_lobos'), 'agora a próxima missão da cadeia aparece');
  const low = ensureJournal(hero(1)); low.quests.done.primeiros_passos = 1;
  assert.equal(offeredBy(low, 'guard').some((q) => q.id === 'caca_aos_lobos'), false, 'nível 2 exigido');
});

test('missão: tipos de objetivo (lobo específico, chefe, baú, spirit, nível) e limite de missões ativas', () => {
  const d = ensureJournal(hero(10));
  d.quests.done.primeiros_passos = 1; d.quests.done.caca_aos_lobos = 1;
  assert.equal(acceptQuest(d, 'ervas_do_bosque').ok, true);
  recordEvent(d, { type: 'chest', zoneId: 'plains' }); assert.equal(d.quests.active.ervas_do_bosque.p[0], 0, 'baú de outra zona não conta');
  recordEvent(d, { type: 'chest', zoneId: 'forest' }); recordEvent(d, { type: 'chest', zoneId: 'forest' });
  assert.equal(isComplete(d, 'ervas_do_bosque'), true);
  assert.equal(acceptQuest(d, 'carvalho_ancestral').ok, true);
  recordEvent(d, { type: 'kill', mobId: 'slime', zoneId: 'forest', boss: true });
  assert.equal(isComplete(d, 'carvalho_ancestral'), false, 'chefe errado');
  recordEvent(d, { type: 'kill', mobId: 'treant', zoneId: 'forest', boss: true });
  assert.equal(isComplete(d, 'carvalho_ancestral'), true);
  assert.equal(acceptQuest(d, 'primeiro_spirit').ok, true);
  d.spirits = [createSpirit(rng, { rarity: 'common' }), createSpirit(rng, { rarity: 'common' })];
  recordEvent(d, { type: 'spirit', count: 2 });
  assert.equal(isComplete(d, 'primeiro_spirit'), true);
  assert.equal(acceptQuest(d, 'rumo_ao_topo').ok, true);
  d.level = 20; recordEvent(d, { type: 'level', level: 20 });
  assert.equal(isComplete(d, 'rumo_ao_topo'), true);
  // limite: 5 ativas
  assert.equal(Object.keys(d.quests.active).length, 4);
  d.quests.done.coracao_de_cristal = 1; d.quests.done.cristais_vivos = 1; d.quests.done.carvalho_ancestral = 1;
  assert.equal(acceptQuest(d, 'coragem_na_arena').ok, true);
  assert.equal(Object.keys(d.quests.active).length, MAX_ACTIVE);
  assert.equal(acceptQuest(d, 'equipe_de_ecos').ok, false);
});

test('recompensas de missão: item na mochila (ids próprios) e, com a mochila cheia, vira ouro', () => {
  const d = ensureJournal(hero(5));
  d.quests.done.primeiros_passos = 1; d.quests.done.caca_aos_lobos = 1;
  acceptQuest(d, 'carvalho_ancestral');
  recordEvent(d, { type: 'kill', mobId: 'treant', zoneId: 'forest', boss: true });
  const r = turnInQuest(d, 'carvalho_ancestral', rng);
  assert.equal(r.reward.items.length, 1); assert.equal(d.inventory.length, 1); assert.equal(d.inventory[0].rarity, 'rare');
  // mochila cheia
  const d2 = ensureJournal(hero(5)); d2.quests.done.primeiros_passos = 1; d2.quests.done.caca_aos_lobos = 1;
  d2.inventory = Array.from({ length: INVENTORY_SIZE }, (_, i) => ({ ...d.inventory[0], id: 'x' + i }));
  acceptQuest(d2, 'carvalho_ancestral'); recordEvent(d2, { type: 'kill', mobId: 'treant', zoneId: 'forest', boss: true });
  const g = d2.gold; turnInQuest(d2, 'carvalho_ancestral', rng);
  assert.equal(d2.inventory.length, INVENTORY_SIZE); assert.ok(d2.gold > g + 200);
});

test('conquistas: contadores concedem, não repetem, título só de conquista ganha', () => {
  const d = ensureJournal(hero(1));
  assert.deepEqual(checkAchievements(d), []);
  const out = recordEvent(d, { type: 'kill', mobId: 'slime', zoneId: 'forest', boss: false });
  assert.deepEqual(out.achievements, ['primeiro_sangue']);
  assert.deepEqual(recordEvent(d, { type: 'kill', mobId: 'slime', zoneId: 'forest', boss: false }).achievements, [], 'não repete');
  assert.equal(setTitle(d, 'cacador'), false, 'ainda não ganhou');
  assert.equal(setTitle(d, 'primeiro_sangue'), true); assert.equal(titleText(d), 'o Novato');
  kill(d, 100); assert.ok(d.achievements.cacador);
  d.stats.bossKills = 0; recordEvent(d, { type: 'kill', mobId: 'treant', zoneId: 'forest', boss: true });
  assert.ok(d.achievements.quebra_chefes);
  assert.equal(setTitle(d, null), true); assert.equal(titleText(d), '');
  d.level = 10; assert.ok(checkAchievements(d).includes('aventureiro'));
  assert.equal(ACHIEVEMENTS.every((a) => a.id && a.name && a.desc && a.min > 0), true);
});

test('baús: abrem uma vez por janela de recarga, pagam ouro/item e contam para missão e conquista', () => {
  const d = ensureJournal(hero(5)); const chest = { id: 'forest:1', tier: 1 };
  const t0 = 1_000_000;
  assert.equal(chestReady(d, chest.id, t0), true);
  const g0 = d.gold;
  const r = openChest(d, chest, 'forest', rng, t0);
  assert.equal(r.ok, true); assert.ok(d.gold > g0); assert.equal(d.stats.chests, 1);
  assert.equal(openChest(d, chest, 'forest', rng, t0 + 1000).ok, false, 'ainda recarregando');
  assert.equal(chestReady(d, chest.id, t0 + CHEST_COOLDOWN_MS), true);
  assert.equal(openChest(d, chest, 'forest', rng, t0 + CHEST_COOLDOWN_MS).ok, true);
  for (let i = 0; i < 200; i++) d.chests['x' + i] = i; // o registro não cresce sem limite
  openChest(d, { id: 'forest:9' }, 'forest', rng, t0 + 3 * CHEST_COOLDOWN_MS);
  assert.ok(Object.keys(d.chests).length <= 121);
});

test('zonas: baús e NPCs de missão ficam dentro do mapa e fora de obstáculos', async () => {
  const { buildLayout } = await import('../public/src/game/layout.js');
  for (const [zid, z] of Object.entries(ZONES)) {
    const lay = buildLayout(zid);
    for (const p of [...(z.chests ?? []), ...(z.npcs ?? [])]) {
      assert.ok(p.x > 40 && p.y > 40 && p.x < z.w - 40 && p.y < z.h - 40, `${zid}/${p.id} fora do mapa`);
      for (const o of lay.obstacles) {
        const d = o.w ? Math.hypot(Math.max(o.x - p.x, 0, p.x - (o.x + o.w)), Math.max(o.y - p.y, 0, p.y - (o.y + o.h))) : Math.hypot(o.x - p.x, o.y - p.y) - o.r;
        assert.ok(d > 24, `${zid}/${p.id} encostado em obstáculo (${Math.round(d)})`);
      }
    }
  }
  assert.ok(ZONES.forest.chests.length >= 3 && ZONES.plains.chests.length >= 3 && ZONES.ruins.chests.length >= 3);
});

// ---------- documento v3 ----------
test('migração v2 → v3 e validação: missões inválidas, progresso acima do limite e título forjado são limpos', () => {
  const old = { ...hero(12), version: 2 }; delete old.quests; delete old.stats; delete old.achievements; delete old.title; delete old.chests;
  const r = parseSave(JSON.stringify(old));
  assert.equal(r.ok, true); assert.equal(r.migratedFrom, 2); assert.equal(r.char.version, 3);
  assert.deepEqual(r.char.quests, { active: {}, done: {} }); assert.equal(r.char.stats.kills, 0);
  const bad = { ...hero(12), quests: { active: { primeiros_passos: { p: [999999], at: 5 }, inexistente: { p: [1] } }, done: { caca_aos_lobos: 3, falsa: 1 } },
    stats: { kills: -5, bossKills: 'x', hack: 99 }, achievements: { cacador: 1, inventada: 1 }, title: 'cacador', chests: { 'ok:1': 5, '<img>': 1 } };
  const v = parseSave(JSON.stringify(bad));
  assert.equal(v.ok, true);
  assert.equal(v.char.quests.active.primeiros_passos.p[0], 5, 'progresso limitado à contagem do objetivo');
  assert.equal(v.char.quests.active.inexistente, undefined); assert.equal(v.char.quests.done.falsa, undefined); assert.ok(v.char.quests.done.caca_aos_lobos);
  assert.equal(v.char.stats.kills, 0); assert.equal(v.char.stats.hack, undefined);
  assert.equal(v.char.achievements.inventada, undefined);
  assert.equal(v.char.chests['<img>'], undefined); assert.equal(v.char.chests['ok:1'], 5);
  void migrate; void validate;
});

// ---------- servidor: plausibilidade e recompensas ----------
test('plausibilidade: não se conclui missão que não estava ativa, nem de servidor sem o servidor, nem estoura contadores', () => {
  const base = ensureJournal(hero(10)); base.quests.done.primeiros_passos = 1; base.quests.done.caca_aos_lobos = 1;
  acceptQuest(base, 'carvalho_ancestral'); acceptQuest(base, 'coragem_na_arena');
  const edit = (f) => { const n = structuredClone(base); f(n); return checkSave(base, n); };
  assert.equal(edit((n) => { n.stats.kills += 50; n.quests.active.carvalho_ancestral.p[0] = 1; }).ok, true, 'progresso legítimo');
  assert.equal(edit((n) => { n.quests.done.cristais_vivos = 1; }).reason, 'quest_forged');
  assert.equal(edit((n) => { n.quests.done.carvalho_ancestral = 1; delete n.quests.active.carvalho_ancestral; }).ok, true, 'concluída que estava ativa (cliente reporta o abate do chefe)');
  assert.equal(edit((n) => { n.quests.done.coragem_na_arena = 1; delete n.quests.active.coragem_na_arena; }).reason, 'quest_server_objective', 'PvP só o servidor completa');
  const prog = edit((n) => { n.quests.active.coragem_na_arena.p[0] = 1; });
  assert.equal(prog.ok, true); assert.equal(prog.doc.quests.active.coragem_na_arena.p[0], 0, 'progresso de PvP forjado é descartado');
  assert.equal(edit((n) => { n.stats.pvpWins = 99; n.stats.coopClears = 9; }).doc.stats.pvpWins, 0);
  assert.equal(edit((n) => { n.stats.kills += LIMITS.statJump + 1; }).reason, 'stat_jump_kills');
  assert.equal(edit((n) => { n.stats.kills = 0; }).doc.stats.kills, base.stats.kills, 'contador não diminui');
  const ach = edit((n) => { n.achievements = { campeao: 1, lenda: 1 }; n.title = 'lenda'; });
  assert.equal(ach.ok, true); assert.equal(ach.doc.achievements.campeao, undefined); assert.equal(ach.doc.title, null, 'conquista e título forjados são descartados');
  const fresh = edit((n) => { n.stats.kills = 100; });
  assert.ok(fresh.doc.achievements.cacador, 'o servidor concede ao recalcular');
  assert.equal(edit((n) => { for (let i = 0; i < 20; i++) n.chests['c' + i] = 5; }).reason, 'chest_flood');
  const reset = structuredClone(base); reset.chests.a = 900; const back = structuredClone(reset); back.chests.a = 100;
  assert.equal(checkSave(reset, back).doc.chests.a, 900, 'recarga do baú não volta no tempo');
  const lvl = edit((n) => { n.level = 3; });
  assert.equal(lvl.reason, 'level_decreased');
  assert.ok(SERVER_TYPES.has('pvp'));
});

test('recompensas do servidor atualizam contadores, missões de arena/cooperativo e conquistas', () => {
  const d = ensureJournal(hero(10)); acceptQuest(d, 'coragem_na_arena'); acceptQuest(d, 'equipe_de_ecos');
  const w = applyMatchResult(d, { mode: '2v2', result: 'win', foeRating: 1000 });
  assert.equal(w.doc.stats.pvpWins, 1); assert.equal(w.doc.stats.pvpGames, 1);
  assert.equal(isComplete(w.doc, 'coragem_na_arena'), true); assert.deepEqual(w.summary.quests, ['coragem_na_arena']);
  const l = applyMatchResult(w.doc, { mode: '1v1', result: 'loss', foeRating: 1000 });
  assert.equal(l.doc.stats.pvpWins, 1); assert.equal(l.doc.stats.pvpGames, 2);
  const c = applyCoopResult(l.doc, { gold: 10, xp: 5, victory: true });
  assert.equal(c.doc.stats.coopClears, 1); assert.equal(isComplete(c.doc, 'equipe_de_ecos'), true); assert.ok(c.doc.achievements.camarada);
  assert.deepEqual(c.summary.achievements, ['camarada']);
  const lost = applyCoopResult(c.doc, { gold: 0, xp: 0, victory: false });
  assert.equal(lost.doc.stats.coopClears, 1, 'derrota cooperativa não conta como limpeza');
});
