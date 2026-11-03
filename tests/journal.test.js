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
import { DIALOGS, TIPS } from '../public/src/data/dialogs.js';
import { greetFor, takeTip, tipSeen, TIP_BITS, achievementProgress, evolvedSpirits } from '../public/src/core/journal.js';

const rng = makeRng(9);
const hero = (level = 1, classId = 'warrior') => { const c = newCharacter('Heroi', classId, makeRng(5)); c.level = level; return c; };
const kill = (doc, n, extra = {}) => { for (let i = 0; i < n; i++) recordEvent(doc, { type: 'kill', mobId: 'slime', zoneId: 'forest', boss: false, ...extra }); };

test('dados: toda missão é coerente (giver/after/objetivos/recompensa) e o encadeamento não tem ciclo', () => {
  const npcs = new Set(Object.values(ZONES).flatMap((z) => (z.npcs ?? []).map((n) => n.id)));
  for (const q of Object.values(QUESTS)) {
    assert.ok(npcs.has(q.giver) || (q.giver === 'master' && ['warrior', 'mage', 'archer', 'cleric'].every((c) => npcs.has('master_' + c))), `${q.id}: NPC ${q.giver} não existe`);
    assert.ok(q.objectives.length >= 1 && q.objectives.every((o) => o.label && ['kill', 'boss', 'chest', 'spirit', 'level', 'pvp', 'coop', 'teleport', 'upgrade', 'spiritStage', 'miniboss', 'skillUse', 'spiritKill', 'bank', 'daily', 'friendlyDuel'].includes(o.type)));
    assert.ok(q.text.offer && q.text.progress && q.text.done);
    // coerência de nível ↔ zona: ninguém pede para caçar numa zona muito acima do nível da missão
    for (const o of q.objectives) if (o.zone && o.zone !== 'any') assert.ok(q.level >= ZONES[o.zone].level[0] - 2, `${q.id}: nível ${q.level} baixo demais para ${o.zone}`);
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
  assert.equal(isComplete(d, 'rumo_ao_topo'), false, 'S18: só o nível não basta');
  recordEvent(d, { type: 'chest', zoneId: 'ruins' });
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

// ---------- história: textos, novos objetivos, falas condicionais, dicas ----------
test('textos de jogo: até 220 caracteres por fala, sem teclas e sem NPC inexistente', () => {
  const lines = [];
  for (const q of Object.values(QUESTS)) for (const [k, t] of Object.entries(q.text)) for (const s of [].concat(t)) lines.push([`${q.id}.${k}`, s]);
  for (const [id, d] of Object.entries(DIALOGS)) for (const g of [].concat(d.greet)) lines.push([`${id}.greet`, typeof g === 'string' ? g : g.text]);
  for (const [k, t] of Object.entries(TIPS)) lines.push([`dica.${k}`, t.join(' ')]);
  for (const a of ACHIEVEMENTS) lines.push([`ach.${a.id}`, a.desc]);
  for (const [where, s] of lines) {
    assert.ok(s.length <= 220, `${where}: ${s.length} caracteres`);
    assert.ok(!/tecla|\[E\]|\(H\)|\(G\)/i.test(s), `${where}: cita tecla`);
  }
  assert.equal(QUESTS.ecos_unidos.text.done.length, 3, 'epílogo em 3 linhas');
  for (const g of Object.values(DIALOGS).map((d) => d.greet)) assert.ok(typeof g === 'string' || !g[g.length - 1].when, 'a última fala é o padrão');
});

test('missões de Lia e Brok: teletransporte e aprimoramento contam, e o servidor aceita os contadores', () => {
  const d = ensureJournal(hero(18)); d.quests.done.ruinas_sombrias = 1;
  assert.deepEqual(offeredBy(d, 'merchant').map((q) => q.id), ['pergaminho_de_cortesia']);
  assert.deepEqual(offeredBy(d, 'smith').map((q) => q.id), ['fogo_de_forja', 'martelo_do_guardiao']);
  for (const id of ['pergaminho_de_cortesia', 'fogo_de_forja', 'martelo_do_guardiao']) assert.equal(acceptQuest(d, id).ok, true);
  recordEvent(d, { type: 'upgrade' });
  assert.equal(isComplete(d, 'fogo_de_forja'), true); assert.equal(isComplete(d, 'pergaminho_de_cortesia'), false);
  const out = recordEvent(d, { type: 'teleport' });
  assert.equal(isComplete(d, 'pergaminho_de_cortesia'), true); assert.deepEqual(out.quests.map((q) => q.id), ['pergaminho_de_cortesia']);
  assert.equal(d.stats.teleports, 1); assert.equal(d.stats.upgrades, 1);
  for (let i = 0; i < 3; i++) recordEvent(d, { type: 'chest', zoneId: 'forest' });
  assert.equal(isComplete(d, 'martelo_do_guardiao'), false, 'baú de outra zona não conta');
  for (let i = 0; i < 3; i++) recordEvent(d, { type: 'chest', zoneId: 'ruins' });
  assert.equal(isComplete(d, 'martelo_do_guardiao'), true);
  const g0 = d.gold; assert.equal(turnInQuest(d, 'fogo_de_forja', rng).ok, true); assert.equal(d.gold, g0 + QUESTS.fogo_de_forja.reward.gold);
  // servidor: os novos contadores sobem normalmente e o salto é limitado
  const base = ensureJournal(hero(10)); const n = structuredClone(base); n.stats.teleports = 5; n.stats.upgrades = 3;
  const ok = checkSave(base, n); assert.equal(ok.ok, true); assert.equal(ok.doc.stats.teleports, 5);
  assert.ok(ok.doc.achievements.viajante, 'Viajante concedida pelo contador');
  n.stats.upgrades = LIMITS.statJump + 1; assert.equal(checkSave(base, n).reason, 'stat_jump_upgrades');
});

test('epílogo: Os Ecos Unidos exigem nível 30 e um spirit evoluído; conquistas da história saem das missões', () => {
  const d = ensureJournal(hero(30)); d.quests.done.cavaleiro_rubro = 1;
  d.spirits = [createSpirit(rng, { rarity: 'common' })];
  assert.equal(acceptQuest(d, 'ecos_unidos').ok, true);
  assert.equal(isComplete(d, 'ecos_unidos'), false, 'falta evoluir');
  recordEvent(d, { type: 'spiritStage', count: evolvedSpirits(d) });
  assert.equal(isComplete(d, 'ecos_unidos'), false);
  d.spirits[0].stage = 2;
  recordEvent(d, { type: 'spiritStage', count: evolvedSpirits(d) });
  assert.equal(isComplete(d, 'ecos_unidos'), true);
  // já evoluído ao aceitar: completa na hora
  const e = ensureJournal(hero(30)); e.quests.done.cavaleiro_rubro = 1; e.spirits = [{ ...createSpirit(rng, { rarity: 'common' }), stage: 2 }];
  acceptQuest(e, 'ecos_unidos'); assert.equal(isComplete(e, 'ecos_unidos'), true);
  assert.ok(turnInQuest(e, 'ecos_unidos', rng).achievements.includes('voz_dos_ecos'));
  assert.equal(setTitle(e, 'voz_dos_ecos'), true); assert.equal(titleText(e), 'Voz dos Ecos');
  const p = achievementProgress(hero(1), ACHIEVEMENTS.find((a) => a.id === 'dono_do_gelo'));
  assert.deepEqual([p.value, p.min, p.earned], [0, 1, false]);
  for (const id of ['primeiro_sussurro', 'dono_do_gelo', 'brasa_adormecida', 'viajante', 'mao_de_ferro', 'voz_dos_ecos']) assert.ok(ACHIEVEMENTS.some((a) => a.id === id), id);
});

test('falas condicionais dos NPCs: primeira que bate, com padrão', () => {
  const d = ensureJournal(hero(1));
  assert.match(greetFor(d, DIALOGS.guard.greet), /Se o bosque te assustar/);
  d.stats.bossKills = 1;
  assert.match(greetFor(d, DIALOGS.guard.greet), /vila está calma/, 'depois do 1º chefe cai no padrão');
  d.quests.done.guardiao_das_ruinas = 1; assert.match(greetFor(d, DIALOGS.guard.greet), /Guardião caiu/);
  d.quests.done.cavaleiro_rubro = 1; assert.match(greetFor(d, DIALOGS.guard.greet), /Cinzas apagadas/, 'a mais específica vem primeiro');
  assert.match(greetFor(hero(1), DIALOGS.arena.greet, { online: false }), /Sem rede/);
  assert.match(greetFor(hero(1), DIALOGS.arena.greet, { online: true }), /guarda os ecos/);
  assert.match(greetFor(hero(25), DIALOGS.smith.greet), /cansado/); assert.match(greetFor(hero(24), DIALOGS.smith.greet), /Metal bom/);
  assert.equal(greetFor(d, 'texto fixo'), 'texto fixo');
});

test('dicas de onboarding: cada uma aparece 1× e o servidor não perde os bits', () => {
  const d = ensureJournal(hero(1));
  assert.equal(takeTip(d, 'chest'), true); assert.equal(takeTip(d, 'chest'), false); assert.equal(tipSeen(d, 'chest'), true); assert.equal(tipSeen(d, 'ritual'), false);
  assert.equal(takeTip(d, 'inexistente'), false);
  for (const k of Object.keys(TIP_BITS)) assert.ok(TIPS[k], `texto da dica ${k}`);
  assert.ok(Math.max(...Object.values(TIP_BITS)) < 26, 'a máscara cabe no limite de 1e8 do documento');
  const base = ensureJournal(hero(5)); base.stats.tips = 0b1011;
  const n = structuredClone(base); n.stats.tips = 0b1011 | (1 << TIP_BITS.ritual) | (1 << 20);
  const r = checkSave(base, n); assert.equal(r.ok, true, 'a máscara não esbarra no limite de salto'); assert.equal(r.doc.stats.tips, n.stats.tips);
  n.stats.tips = 0; assert.equal(checkSave(base, n).doc.stats.tips, 0b1011, 'bits nunca somem');
  const v = validate({ ...hero(5), stats: { tips: 1e12 } }); assert.ok(v.ok); assert.ok(v.char.stats.tips <= 1e8);
});

test('diário: a lista de NPCs vem dos givers das missões (todos existem na Vila)', () => {
  const givers = [...new Set(Object.values(QUESTS).map((q) => q.giver))];
  assert.ok(givers.includes('merchant') && givers.includes('smith'));
  for (const g of givers.filter((x) => x !== 'master')) assert.ok([...ZONES.town.npcs, ...ZONES.harbor.npcs].some((n) => n.id === g), g); // vila ou Porto
});

// ---------- lore coletável (S17) ----------
import { interactTarget } from '../public/src/touch-logic.js';
import { LORE_ZONES, readLore, loreSeen, loreCount, achievementValue } from '../public/src/core/journal.js';
import { buildLayout, segDist } from '../public/src/game/layout.js';

test('lore: um objeto tocável por zona de farm, texto curto, perto da trilha e longe de obstáculos', () => {
  for (const id of LORE_ZONES) {
    const z = ZONES[id], l = z.lore?.[0], lay = buildLayout(id);
    assert.ok(l && l.id === id && l.text && l.name && ['signpost', 'statue'].includes(l.kind), `${id}: lore`);
    assert.ok(l.text.length <= 160 && !/tecla/i.test(l.text), `${id}: ${l.text.length} caracteres`);
    assert.ok(l.x > 60 && l.y > 60 && l.x < z.w - 60 && l.y < z.h - 60);
    for (const o of lay.obstacles) {
      if (o.x === l.x && o.y === l.y) continue; // o próprio objeto
      const d = o.w ? Math.hypot(Math.max(o.x - l.x, 0, l.x - (o.x + o.w)), Math.max(o.y - l.y, 0, l.y - (o.y + o.h))) : Math.hypot(o.x - l.x, o.y - l.y) - o.r;
      assert.ok(d > 40, `${id}: lore encostado em obstáculo (${Math.round(d)})`);
    }
    const trail = Math.min(...lay.trail.slice(1).map((p, i) => segDist(l.x, l.y, lay.trail[i].x, lay.trail[i].y, p.x, p.y)));
    assert.ok(trail > 60 && trail < 220, `${id}: distância da trilha ${Math.round(trail)}`);
    for (const p of [...z.chests, ...z.portals, ...(z.camps ?? [])]) assert.ok(Math.hypot(p.x - l.x, p.y - l.y) > 150, `${id}: lore perto de ${p.id ?? p.to}`);
    assert.ok(lay.decor.some((d) => d.type === l.kind && d.x === l.x && d.y === l.y), `${id}: peça desenhada`);
  }
});

test('lore: interactTarget prioriza NPC > baú > lore', () => {
  const lore = { id: 'forest', x: 100, y: 100 }, chest = { id: 'c', x: 150, y: 100 }, npc = { id: 'n', x: 100, y: 150 };
  const world = (z) => ({ zone: { npcs: [], chests: [], lore: [], ...z } });
  assert.deepEqual(interactTarget({ x: 100, y: 100 }, world({ lore: [lore] })), { kind: 'lore', ref: lore });
  assert.equal(interactTarget({ x: 100, y: 300 }, world({ lore: [lore] })), null, 'longe não interage');
  assert.equal(interactTarget({ x: 120, y: 100 }, world({ lore: [lore], chests: [chest] })).kind, 'chest');
  assert.equal(interactTarget({ x: 110, y: 120 }, world({ lore: [lore], chests: [chest], npcs: [npc] })).kind, 'npc');
  assert.equal(interactTarget({ x: 100, y: 100 }, { zone: { npcs: [], chests: [] } }), null, 'zona sem lore');
});

test('lore: cada leitura conta uma vez; as 5 dão "Leitor de Ecos"; o servidor mantém os bits', () => {
  const d = ensureJournal(hero(10));
  assert.equal(readLore(d, 'forest').first, true); assert.equal(readLore(d, 'forest').first, false);
  assert.equal(loreSeen(d, 'forest'), true); assert.equal(loreSeen(d, 'ember'), false); assert.equal(loreCount(d), 1);
  assert.equal(readLore(d, 'inexistente').first, false);
  const a = ACHIEVEMENTS.find((x) => x.id === 'leitor_de_ecos');
  assert.equal(achievementValue(d, a), 1); assert.equal(d.achievements.leitor_de_ecos, undefined);
  for (const z of LORE_ZONES.slice(1, 4)) assert.deepEqual(readLore(d, z).achievements, []);
  assert.deepEqual(readLore(d, 'ember').achievements, ['leitor_de_ecos']);
  assert.equal(loreCount(d), 5); assert.equal(titleText({ ...d, title: 'leitor_de_ecos' }), 'Leitor de Ecos');
  // plausibilidade: bits só se ganham (sem limite de salto) e nunca se perdem
  const base = ensureJournal(hero(5)); base.stats.lore = 0b1;
  const n = structuredClone(base); n.stats.lore = 0b11111;
  const r = checkSave(base, n); assert.equal(r.ok, true); assert.equal(r.doc.stats.lore, 0b11111);
  n.stats.lore = 0; assert.equal(checkSave(base, n).doc.stats.lore, 0b1, 'bits nunca somem');
  assert.ok(validate({ ...hero(5), stats: { lore: 1e12 } }).char.stats.lore <= 1e8);
  // bits fora das 5 zonas não contam para a conquista
  const f = ensureJournal(hero(5)); f.stats.lore = 0xffffffe0; assert.equal(achievementValue(f, a), 0);
});

// ---------- Porto de Marfim: missões, conquistas e falas (hub entre Planície e Ruínas) ----------
import { claimDaily, dailyBoard, dailyState, dayUTC, OFFLINE_TYPES } from '../public/src/core/journal.js';
import { depositItem } from '../public/src/core/bank.js';
import { generateItem } from '../public/src/core/loot.js';

test('Porto: 5 missões novas, com giver no Porto e objetivos bank/daily/friendlyDuel', () => {
  const ids = ['porto_chegada', 'porto_contrato', 'porto_carga', 'porto_gelo', 'porto_duelo'];
  for (const id of ids) { assert.ok(QUESTS[id], id); assert.ok(ZONES.harbor.npcs.some((n) => n.id === QUESTS[id].giver), id + ' giver'); }
  assert.deepEqual(QUESTS.porto_chegada.objectives.map((o) => o.type), ['bank']);
  assert.deepEqual(QUESTS.porto_contrato.objectives.map((o) => o.type), ['daily']);
  assert.deepEqual(QUESTS.porto_duelo.objectives.map((o) => o.type), ['friendlyDuel']);
  assert.ok(QUESTS.porto_gelo.level >= 22 && QUESTS.porto_gelo.objectives[0].zone === 'glacier');
  assert.equal(OFFLINE_TYPES.size, 0, 'o duelo amistoso agora também roda online (o servidor conta a vitória)');
  assert.ok(offeredBy(hero(10), 'duelist', { server: true }).some((q) => q.id === 'porto_duelo'));
});

test('Porto: guardar item no banco avança porto_chegada e conta o depósito; só a missão ativa progride', () => {
  const d = ensureJournal(hero(10));
  d.inventory.push(generateItem(rng, 10, { classId: 'warrior' }));
  assert.equal(acceptQuest(d, 'porto_chegada').ok, true);
  assert.equal(depositItem(d, d.inventory[d.inventory.length - 1].id).ok, true);
  const out = recordEvent(d, { type: 'bank' }); // o jogo emite o evento após o depósito
  assert.equal(isComplete(d, 'porto_chegada'), true); assert.equal(d.stats.deposits, 1); assert.ok(out.quests.some((q) => q.id === 'porto_chegada' && q.complete));
  assert.equal(turnInQuest(d, 'porto_chegada', rng).ok, true);
});

test('Porto: entregar contrato do Quadro cumpre porto_contrato (daily) e soma o contador', () => {
  const d = ensureJournal(hero(10));
  recordEvent(d, { type: 'level', level: 10 });
  d.quests.done.porto_chegada = 1; d.stats.quests++;
  assert.equal(acceptQuest(d, 'porto_contrato').ok, true);
  const now = Date.now(), c = dailyBoard(d, dayUTC(now)).find((x) => x.kind === 'chest');
  dailyState(d, dayUTC(now)).p[c.id] = c.count;
  const r = claimDaily(d, c.id, now);
  assert.equal(r.ok, true); assert.equal(d.stats.contracts, 1);
  assert.equal(isComplete(d, 'porto_contrato'), true); assert.ok(r.quests.some((q) => q.id === 'porto_contrato'));
});

test('Porto: duelo amistoso só conta vitória; a missão porto_duelo aparece offline E online (o servidor conta a vitória)', () => {
  const d = ensureJournal(hero(10));
  assert.ok(offeredBy(d, 'duelist', { server: false }).some((q) => q.id === 'porto_duelo'), 'offline oferece');
  assert.ok(offeredBy(d, 'duelist', { server: true }).some((q) => q.id === 'porto_duelo'), 'online oferece (duelo amistoso agora roda no servidor)');
  acceptQuest(d, 'porto_duelo');
  recordEvent(d, { type: 'friendlyDuel', won: false });
  assert.equal(isComplete(d, 'porto_duelo'), false); assert.equal(d.stats.friendlyWins, 0);
  recordEvent(d, { type: 'friendlyDuel', won: true });
  assert.equal(isComplete(d, 'porto_duelo'), true); assert.equal(d.stats.friendlyWins, 1);
});

test('Porto: porto_carga exige Planície e Ruínas; porto_gelo conta baús só no Cume', () => {
  const d = ensureJournal(hero(22));
  d.quests.done.porto_chegada = 1;
  acceptQuest(d, 'porto_carga'); acceptQuest(d, 'porto_gelo');
  kill(d, 8, { zoneId: 'plains' }); assert.equal(isComplete(d, 'porto_carga'), false);
  kill(d, 7, { zoneId: 'ruins' }); assert.equal(isComplete(d, 'porto_carga'), true);
  for (let i = 0; i < 3; i++) recordEvent(d, { type: 'chest', zoneId: 'ruins' });
  assert.equal(isComplete(d, 'porto_gelo'), false);
  for (let i = 0; i < 3; i++) recordEvent(d, { type: 'chest', zoneId: 'glacier' });
  assert.equal(isComplete(d, 'porto_gelo'), true);
});

test('Porto: conquista Marinheiro ao chegar; o servidor aceita os contadores novos e limita o salto', () => {
  const d = ensureJournal(hero(10));
  assert.equal(recordEvent(d, { type: 'visit', zoneId: 'harbor' }).achievements.includes('marinheiro'), true);
  assert.equal(d.stats.harborVisits, 1);
  recordEvent(d, { type: 'visit', zoneId: 'forest' }); assert.equal(d.stats.harborVisits, 1, 'só o Porto conta');
  const old = validate(JSON.parse(JSON.stringify(d))).char, neu = JSON.parse(JSON.stringify(old));
  neu.stats.deposits = 1;
  assert.equal(checkSave(old, neu).ok, true);
  neu.stats.deposits = 9999;
  assert.equal(checkSave(old, neu).ok, false);
});

test('Porto: falas condicionais por missão feita', () => {
  const d = ensureJournal(hero(10));
  const before = greetFor(d, DIALOGS.captain.greet);
  d.quests.done.porto_chegada = 1;
  assert.notEqual(greetFor(d, DIALOGS.captain.greet), before);
  d.quests.done.porto_carga = 1;
  assert.match(greetFor(d, DIALOGS.captain.greet), /cargas/i);
});

test('saves antigos: quem já visitou as Ruínas também visitou o Porto', () => {
  const d = ensureJournal(hero(15)); d.visited = { town: 1, forest: 1, plains: 1, ruins: 1 };
  assert.equal(validate(JSON.parse(JSON.stringify(d))).char.visited.harbor, 1);
  const n = ensureJournal(hero(15)); n.visited = { town: 1, forest: 1 };
  assert.ok(!validate(JSON.parse(JSON.stringify(n))).char.visited.harbor);
});
