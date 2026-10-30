import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, segDist } from '../public/src/game/layout.js';
import { ZONES } from '../public/src/data/zones.js';

const L = { forest: buildLayout('forest'), ruins: buildLayout('ruins'), plains: buildLayout('plains'), town: buildLayout('town') };

test('layout é determinístico (mesmo resultado em qualquer cliente)', async () => {
  // Segunda instância do módulo = cache vazio: recalcula tudo do zero.
  const fresh = await import('../public/src/game/layout.js?recalculo');
  for (const id of ['forest', 'ruins', 'plains', 'town']) {
    const a = fresh.buildLayout(id);
    assert.notEqual(a, L[id], 'não é o mesmo objeto em cache');
    assert.deepEqual(a, L[id], id);
  }
  assert.ok(L.forest.ponds.length === 3 && L.ruins.runes.length === 3);
});

test('Bosque: lagoas têm colisão, não cobrem portais, boss nem a trilha', () => {
  const z = ZONES.forest, { ponds, trail, obstacles } = L.forest;
  assert.ok(trail.length > 10, 'trilha existe');
  for (const p of ponds) {
    assert.ok(obstacles.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < p.rx), 'lagoa tem obstáculos');
    for (const pt of [...z.portals, { x: z.boss.x, y: z.boss.y }]) assert.ok(Math.hypot(p.x - pt.x, p.y - pt.y) > p.rx + 120, 'longe de portal/boss');
    for (let i = 0; i < trail.length - 1; i++) assert.ok(segDist(p.x, p.y, trail[i].x, trail[i].y, trail[i + 1].x, trail[i + 1].y) > p.rx + 50, 'longe da trilha');
  }
});

test('trilha liga os portais e fica dentro do mapa', () => {
  for (const id of ['forest', 'ruins', 'plains']) {
    const z = ZONES[id], t = L[id].trail;
    assert.ok(t[0].x < 200 && Math.abs(t[0].y - z.portals[0].y) < 5, id + ': começa no portal oeste');
    assert.ok(t.every((p) => p.x >= 0 && p.x <= z.w && p.y >= 150 && p.y <= z.h - 150), id + ': dentro do mapa');
  }
  const r = ZONES.ruins, last = L.ruins.trail.at(-1);
  assert.ok(Math.hypot(last.x - r.boss.x, last.y - r.boss.y) < 200, 'estrada das ruínas termina perto do guardião');
});

test('árvores e detalhes não nascem sobre a trilha nem sobre lagoas', () => {
  for (const id of ['forest', 'ruins', 'plains']) {
    const { decor, trail, ponds } = L[id];
    for (const d of decor.filter((d) => ['tree', 'pine'].includes(d.type) && d.y > 120 && d.y < ZONES[id].h - 120 && d.x > 120 && d.x < ZONES[id].w - 120)) {
      for (let i = 0; i < trail.length - 1; i++) assert.ok(segDist(d.x, d.y, trail[i].x, trail[i].y, trail[i + 1].x, trail[i + 1].y) > 30, id + ': árvore na trilha');
      for (const p of ponds) assert.ok(Math.hypot(d.x - p.x, d.y - p.y) > p.ry, id + ': árvore na lagoa');
    }
  }
});

test('detalhes pedidos pela zona existem; zonas sem cenário rico não ganham nada', () => {
  const count = (id, type) => L[id].decor.filter((d) => d.type === type).length;
  for (const [type, n] of [['stump', 14], ['fern', 46], ['mushrooms', 16]]) assert.ok(count('forest', type) >= n * 0.5, `forest ${type}`);
  for (const [type, n] of [['brazier', 9], ['statue', 5], ['rubble', 30]]) assert.ok(count('ruins', type) >= n * 0.5, `ruins ${type}`);
  for (const id of ['arena', 'waves']) {
    const l = buildLayout(id);
    assert.deepEqual([l.trail.length, l.ponds.length, l.runes.length], [0, 0, 0], id);
  }
});

test('Planície: lagoas, flores luminosas e geodos existem; lagoas longe de portais e do boss', () => {
  const z = ZONES.plains, { ponds, decor } = L.plains;
  assert.equal(ponds.length, 2);
  const count = (type) => decor.filter((d) => d.type === type).length;
  assert.ok(count('glowflower') >= 32 && count('tallgrass') >= 35 && count('geode') >= 6, 'extras da planície');
  for (const p of ponds) for (const pt of [...z.portals, z.boss]) assert.ok(Math.hypot(p.x - pt.x, p.y - pt.y) > p.rx + 120);
});

test('Vila: lanternas nos caminhos, bancos, canteiros; nada dentro das casas nem sobre os caminhos', () => {
  const z = ZONES.town, { decor, obstacles } = L.town;
  const count = (type) => decor.filter((d) => d.type === type).length;
  assert.ok(count('lantern') >= 5, 'lanternas: ' + count('lantern'));
  assert.equal(count('bench'), 3);
  assert.equal(count('flowerbed'), z.houses.length * 2);
  assert.equal(count('crates'), 1);
  assert.equal(count('signpost'), 1);
  const inHouse = (d, m) => z.houses.some((h) => d.x > h.x - m && d.x < h.x + h.w + m && d.y > h.y - m && d.y < h.y + h.h + m);
  for (const d of decor.filter((d) => ['lantern', 'bench', 'crates', 'signpost'].includes(d.type))) {
    assert.ok(!inHouse(d, 4), `${d.type} dentro de casa (${d.x},${d.y})`);
    for (const [x1, y1, x2, y2] of z.paths) assert.ok(segDist(d.x, d.y, x1, y1, x2, y2) > 38, `${d.type} em cima do caminho (${Math.round(d.x)},${Math.round(d.y)})`);
  }
  for (const d of decor.filter((d) => d.type === 'flowerbed')) assert.ok(!inHouse(d, -1), 'canteiro fora da casa');
  for (const n of z.npcs) assert.ok(!obstacles.some((o) => !o.w && Math.hypot(o.x - n.x, o.y - n.y) < o.r + 14), `obstáculo em cima do NPC ${n.id}`);
  const portal = z.portals[0];
  assert.ok(!obstacles.some((o) => !o.w && Math.hypot(o.x - portal.x, o.y - portal.y) < o.r + 40), 'portal livre');
});

test('há caminho livre do portal oeste até o chefe no Bosque e nas Ruínas (trilha não bloqueada)', () => {
  for (const id of ['forest', 'ruins']) {
    const { trail, obstacles } = L[id];
    for (const p of trail.slice(1, -1)) {
      const hit = obstacles.find((o) => !o.w && Math.hypot(o.x - p.x, o.y - p.y) < o.r + 15);
      assert.ok(!hit, `${id}: obstáculo em (${Math.round(p.x)},${Math.round(p.y)})`);
    }
  }
});
