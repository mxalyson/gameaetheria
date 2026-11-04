import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questTarget, trackerText, pickTracked, zoneRoute, guideGoal, buildNavGrid, findPath, followPath, lineFree, farmZoneForLevel, npcZone, mobArea, ARRIVE } from '../public/src/core/autopath.js';
import { newOfficialCharacter } from '../server/api.js';
import { acceptQuest, recordEvent, ensureJournal } from '../public/src/core/journal.js';
import { buildLayout } from '../public/src/game/layout.js';
import { World, makeHeroActor } from '../public/src/game/sim.js';
import { ZONES } from '../public/src/data/zones.js';
import { QUESTS } from '../public/src/data/quests.js';

const hero = (level = 1, classId = 'warrior') => { const d = newOfficialCharacter('Guia', classId); d.level = level; ensureJournal(d); return d; };
const take = (d, id) => { d.level = Math.max(d.level, QUESTS[id].level); d.quests.done = {}; let q = QUESTS[id]; while (q.after) { d.quests.done[q.after] = 1; q = QUESTS[q.after]; } assert.ok(acceptQuest(d, id).ok, id); return d; };

test('alvo: quem oferece a missão, área de caça, chefe, baú e entrega no NPC certo', () => {
  const d = hero(1);
  let t = questTarget(d, 'primeiros_passos');
  assert.deepEqual([t.kind, t.zone, t.npcId], ['npc', 'town', 'guard'], 'ainda não aceita: vai ao Ren');
  take(d, 'primeiros_passos');
  t = questTarget(d, 'primeiros_passos');
  assert.equal(t.kind, 'area'); assert.equal(t.zone, 'forest'); assert.ok(t.x > 0 && t.y > 0);
  for (let i = 0; i < 5; i++) recordEvent(d, { type: 'kill', mobId: 'slime', zoneId: 'forest' });
  t = questTarget(d, 'primeiros_passos');
  assert.deepEqual([t.kind, t.npcId, t.why], ['npc', 'guard', 'Entregar a missão']);
  take(d, 'carvalho_ancestral');
  t = questTarget(d, 'carvalho_ancestral');
  assert.deepEqual([t.kind, t.zone, t.x, t.y], ['boss', 'forest', ZONES.forest.boss.x, ZONES.forest.boss.y]);
  take(d, 'ervas_do_bosque');
  t = questTarget(d, 'ervas_do_bosque', { zoneId: 'forest', x: 2300, y: 1500 });
  assert.deepEqual([t.kind, t.zone, t.chestId], ['chest', 'forest', 'forest:3'], 'o baú livre mais perto');
  d.chests['forest:3'] = Date.now();
  assert.notEqual(questTarget(d, 'ervas_do_bosque', { zoneId: 'forest', x: 2300, y: 1500 }).chestId, 'forest:3', 'baú em recarga fica por último');
});

test('alvo: mobs específicos vão ao acampamento que os tem; objetivos sem lugar viram none; mentores e NPCs de serviço', () => {
  const d = hero(10);
  take(d, 'caca_aos_lobos');
  const t = questTarget(d, 'caca_aos_lobos');
  const camp = ZONES.forest.camps.find((c) => c.id === 'forest:c3'); // 3 lobos + 1 elite lobo: o acampamento com mais lobos
  assert.deepEqual([t.zone, t.x, t.y], ['forest', camp.x, camp.y]);
  assert.equal(mobArea('forest', 'dragon'), null, 'mob que não existe na zona');
  assert.equal(npcZone('smith'), 'town'); assert.equal(npcZone('banker'), 'harbor'); assert.equal(npcZone('nobody'), null);
  const r = hero(22); take(r, 'rumo_ao_topo');
  assert.equal(questTarget(r, 'rumo_ao_topo').kind, 'chest', 'nível 20 já cumprido: próximo objetivo é o baú das Ruínas');
  assert.equal(questTarget(r, 'rumo_ao_topo').zone, 'ruins');
  const none = hero(5); take(none, 'rumo_ao_topo');
  assert.equal(questTarget(none, 'rumo_ao_topo').kind, 'none');
  assert.equal(farmZoneForLevel(1), 'forest'); assert.equal(farmZoneForLevel(13), 'ruins'); assert.equal(farmZoneForLevel(8, 'plains'), 'plains');
});

test('rastreador: texto com progresso, missão escolhida > pronta > primeira ativa', () => {
  const d = hero(6);
  assert.equal(pickTracked(d), null);
  take(d, 'primeiros_passos'); take(d, 'ervas_do_bosque');
  assert.equal(pickTracked(d), 'primeiros_passos');
  assert.equal(pickTracked(d, 'ervas_do_bosque'), 'ervas_do_bosque');
  assert.equal(pickTracked(d, 'inexistente'), 'primeiros_passos');
  recordEvent(d, { type: 'kill', mobId: 'slime', zoneId: 'forest' });
  assert.match(trackerText(d, 'primeiros_passos').text, /\(1\/5\)/);
  for (let i = 0; i < 4; i++) recordEvent(d, { type: 'kill', mobId: 'slime', zoneId: 'forest' });
  assert.equal(pickTracked(d, 'ervas_do_bosque'), 'ervas_do_bosque');
  assert.equal(trackerText(d, 'primeiros_passos').done, true);
});

test('rota entre zonas: pela WORLD_ROUTE, portal certo em cada passo, Cripta sai pela Vila', () => {
  assert.deepEqual(zoneRoute('town', 'plains'), ['town', 'forest', 'plains']);
  assert.deepEqual(zoneRoute('ruins', 'forest'), ['ruins', 'harbor', 'plains', 'forest']);
  assert.deepEqual(zoneRoute('crypt', 'forest'), ['crypt', 'town', 'forest']);
  assert.equal(zoneRoute('town', 'arena'), null);
  const tgt = { kind: 'area', zone: 'plains', x: 1000, y: 1400, reach: ARRIVE.area };
  let g = guideGoal(tgt, 'town');
  assert.deepEqual([g.portal, g.nextZone, g.hops, g.x, g.y], [true, 'forest', 2, ZONES.town.portals[0].x, ZONES.town.portals[0].y]);
  g = guideGoal(tgt, 'forest');
  assert.equal(g.nextZone, 'plains'); assert.equal(g.x, ZONES.forest.portals.find((p) => p.to === 'plains').x);
  g = guideGoal(tgt, 'plains');
  assert.deepEqual([g.portal, g.x, g.y, g.hops], [false, 1000, 1400, 0]);
  assert.equal(guideGoal({ kind: 'none' }, 'forest'), null);
  g = guideGoal({ kind: 'npc', zone: 'harbor', x: 1, y: 1, reach: 58 }, 'plains');
  assert.equal(g.nextZone, 'harbor');
});

test('caminho: sem células bloqueadas no trajeto e atravessa o rio só pela ponte', () => {
  for (const id of ['forest', 'plains', 'ruins', 'glacier', 'ember', 'town', 'harbor']) {
    const z = ZONES[id], L = buildLayout(id), g = buildNavGrid(id, z, L);
    const a = id === 'town' ? { x: 850, y: 720 } : { x: z.portals[0].x + 70, y: z.portals[0].y }, b = { x: z.portals.at(-1).x - 10, y: z.portals.at(-1).y };
    const path = findPath(g, a, b);
    assert.ok(path && path.length, id + ': há caminho');
    let prev = a;
    for (const p of path) { assert.ok(lineFree(g, prev.x, prev.y, p.x, p.y), `${id}: trecho livre`); prev = p; }
    assert.ok(Math.hypot(prev.x - b.x, prev.y - b.y) < 40, id + ': chega ao destino');
  }
  const f = ZONES.forest, g = buildNavGrid('forest', f, buildLayout('forest'));
  const path = findPath(g, { x: 700, y: 400 }, { x: 2300, y: 400 }); // longe das pontes (y 1400/2100): precisa descer até uma ponte e voltar
  assert.ok(path.some((p) => Math.abs(p.y - 1400) < 200 || Math.abs(p.y - 2100) < 200), 'passa por uma ponte');
  assert.equal(findPath(g, { x: 700, y: 400 }, { x: 2300, y: 400 }).length >= 3, true);
});

test('A* e a simulação: o herói segue o caminho pela colisão real e chega ao portal (sem teleporte)', () => {
  for (const [id, from, to] of [['forest', ZONES.forest.portals[0], ZONES.forest.portals[1]], ['town', { x: 850, y: 720 }, ZONES.town.portals[0]], ['ruins', ZONES.ruins.portals[0], ZONES.ruins.portals[1]]]) {
    const z = ZONES[id], w = new World(id, { seed: 5, visuals: false }), p = w.add(makeHeroActor(hero(5), id === 'town' ? from.x : from.x + 70, from.y, 'player', 1));
    const g = buildNavGrid(id, z, w.layout);
    let path = findPath(g, p, to), t = 0, replans = 0, lastX = p.x, lastY = p.y, still = 0;
    while (t < 150 && Math.hypot(to.x - p.x, to.y - p.y) > 40) {
      const mv = followPath(path, p, 20);
      if (!mv) { path = findPath(g, p, to); replans++; if (replans > 5) break; continue; }
      w.update(1 / 20, { [p.id]: { mx: mv.mx, my: mv.my, aimX: p.x, aimY: p.y, attack: false, cast: null } });
      t += 1 / 20;
      if (Math.hypot(p.x - lastX, p.y - lastY) < 0.3) still++; else still = 0; lastX = p.x; lastY = p.y;
      assert.ok(still < 60, `${id}: travou em ${Math.round(p.x)},${Math.round(p.y)}`);
    }
    assert.ok(Math.hypot(to.x - p.x, to.y - p.y) <= 40, `${id}: chegou (restam ${Math.round(Math.hypot(to.x - p.x, to.y - p.y))} px em ${t.toFixed(0)} s)`);
    assert.ok(t < 150, id + ' em tempo razoável');
  }
});

test('followPath: consome pontos alcançados e devolve null no fim', () => {
  const path = [{ x: 10, y: 0 }, { x: 100, y: 0 }];
  assert.deepEqual(followPath(path, { x: 5, y: 0 }, 22), { mx: 1, my: 0, left: 1 }, 'o ponto a 5 px já foi alcançado');
  assert.equal(followPath(path, { x: 95, y: 0 }, 22), null);
  assert.equal(followPath([], { x: 0, y: 0 }), null);
});
