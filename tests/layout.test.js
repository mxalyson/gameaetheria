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
  assert.ok(L.forest.ponds.length === ZONES.forest.scenery.ponds && L.ruins.runes.length === ZONES.ruins.scenery.runes);
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
  assert.equal(ponds.length, ZONES.plains.scenery.ponds);
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

// ---------------- mapas grandes, rios com pontes, acampamentos (P12) ----------------
import { campSpawns, minibossSpawn, riverX, nearRiver } from '../public/src/game/layout.js';
import { groundBudget, BUDGET_MIB } from '../public/src/render/ground-tiles.js';
import { SET } from '../public/src/render/nature-sprites.js';
import { MOBS } from '../public/src/data/mobs.js';

const FARM = ['forest', 'plains', 'ruins', 'glacier', 'ember'];
const LF = Object.fromEntries(FARM.map((id) => [id, buildLayout(id)]));
const distTo = (o, p) => (o.w ? Math.hypot(Math.max(o.x - p.x, 0, p.x - (o.x + o.w)), Math.max(o.y - p.y, 0, p.y - (o.y + o.h))) : Math.hypot(o.x - p.x, o.y - p.y) - o.r);
const blockedAt = (L, p, R) => L.obstacles.some((o) => distTo(o, p) < R);

test('zonas de farm: 4600×2800, portais nas bordas oeste/leste na altura do meio, mobs proporcionais à área', () => {
  for (const id of FARM) {
    const z = ZONES[id];
    assert.equal(z.w, 4600); assert.equal(z.h, 2800);
    assert.ok(z.portals[0].x < 100 && z.portals[0].y === 1400, id + ': portal oeste');
    if (z.portals[1]) assert.ok(z.portals[1].x > z.w - 100 && z.portals[1].y === 1400, id + ': portal leste');
    assert.ok(z.count >= 38 && z.count <= 50, id + ': ' + z.count + ' mobs (área 2,4× a antiga: ~2× a contagem)');
    assert.ok(z.boss.x > z.w * 0.7, id + ': chefe no fim do mapa');
  }
  // os portais de ida e volta se encontram: o ponto de chegada de um fica junto do portal do outro
  for (const [from, z] of Object.entries(ZONES)) for (const p of z.portals ?? []) {
    if (z.dungeon) continue; // masmorra: entra-se pelo mapa (crypt_enter) e a saída é de mão única para a Vila
    const back = ZONES[p.to].portals.find((q) => q.to === from);
    assert.ok(back, `${from} → ${p.to} tem volta`);
    assert.ok(p.tx > 0 && p.tx < ZONES[p.to].w && p.ty > 0 && p.ty < ZONES[p.to].h, `${from} → ${p.to}: chegada dentro do mapa`);
    assert.ok(Math.hypot(p.tx - back.x, p.ty - back.y) < 140, `${from} → ${p.to}: chega perto do portal de volta`);
  }
});

test('rios: barreira contínua de colisão, com lacuna só nas pontes', () => {
  for (const id of FARM) {
    const z = ZONES[id], L = LF[id];
    assert.equal(L.rivers.length, 2, id);
    assert.equal(L.bridges.length, 4, id + ': 2 pontes por rio');
    for (const rv of L.rivers) {
      for (let y = 0; y <= z.h; y += 16) {
        const p = { x: riverX(rv, y), y };
        if (rv.bridges.some((b) => Math.abs(y - b.y) < b.hw - 17)) assert.ok(!blockedAt(L, p, 15), `${id}: ponte livre em y=${y}`);
        else if (!rv.bridges.some((b) => Math.abs(y - b.y) < b.hw + 17)) assert.ok(blockedAt(L, p, 0.01), `${id}: rio sem colisão em y=${y}`);
      }
      // margem a margem: nenhum ponto da faixa de água (fora das pontes) é livre para um herói de raio 15
      for (let y = 20; y < z.h; y += 40) {
        if (rv.bridges.some((b) => Math.abs(y - b.y) < b.hw + 40)) continue;
        const cx = riverX(rv, y);
        for (let dx = -rv.w / 2 + 12; dx <= rv.w / 2 - 12; dx += 12) assert.ok(blockedAt(L, { x: cx + dx, y }, 15), `${id}: furo no rio em (${Math.round(cx + dx)},${y})`);
      }
      for (const b of rv.bridges) assert.ok(Math.abs(b.x - riverX(rv, b.y)) < 1 && Math.abs(riverX(rv, b.y + 1) - riverX(rv, b.y - 1)) < 2, id + ': ponte no extremo da curva (rio vertical, ponte horizontal)');
    }
    const [r1, r2] = L.rivers;
    assert.ok(r2.x - r1.x > 2 * (r1.amp + r1.w) + 200, id + ': rios separados');
    for (const pt of [...z.portals.flatMap((p) => [{ x: p.x, y: p.y }, { x: p.tx, y: p.ty }]), z.boss, ...z.camps, z.miniboss, ...z.chests]) for (const rv of L.rivers) assert.ok(!nearRiver(rv, pt.x, pt.y, 60), `${id}: algo dentro/perto da água em (${pt.x},${pt.y})`);
  }
});

test('a água só bloqueia movimento (magias passam); árvores e pedras não nascem dentro d\'água', () => {
  for (const id of FARM) {
    const L = LF[id];
    const water = L.obstacles.filter((o) => L.rivers.some((rv) => (o.w ? nearRiver(rv, o.x + o.w / 2, o.y + o.h / 2, 0) : nearRiver(rv, o.x, o.y, 0))));
    assert.ok(water.length > 100, id + ': obstáculos de água');
    assert.ok(water.every((o) => !o.block), id + ': água sem block');
    for (const d of L.decor.filter((d) => ['tree', 'pine', 'rock', 'crystal', 'pillar', 'bush', 'stump', 'fern'].includes(d.type))) assert.ok(!L.rivers.some((rv) => nearRiver(rv, d.x, d.y, 4)), `${id}: ${d.type} na água (${Math.round(d.x)},${Math.round(d.y)})`);
  }
});

test('alcançável a pé do portal oeste até chefe, baús, acampamentos e mini-chefe; sem as pontes o rio separa a zona', () => {
  const C = 24, R = 15;
  for (const id of FARM) {
    const z = ZONES[id], L = LF[id], cols = Math.ceil(z.w / C), rows = Math.ceil(z.h / C), block = new Uint8Array(cols * rows);
    for (const o of L.obstacles) { // marca as células cobertas por cada obstáculo
      const x0 = o.w ? o.x : o.x - o.r, x1 = o.w ? o.x + o.w : o.x + o.r, y0 = o.w ? o.y : o.y - o.r, y1 = o.w ? o.y + o.h : o.y + o.r;
      for (let cy = Math.max(0, Math.floor((y0 - R) / C)); cy <= Math.min(rows - 1, Math.floor((y1 + R) / C)); cy++) for (let cx = Math.max(0, Math.floor((x0 - R) / C)); cx <= Math.min(cols - 1, Math.floor((x1 + R) / C)); cx++) {
        if (distTo(o, { x: cx * C + C / 2, y: cy * C + C / 2 }) < R) block[cy * cols + cx] = 1;
      }
    }
    const cell = (p) => Math.floor(p.y / C) * cols + Math.floor(p.x / C);
    const flood = (grid) => {
      const seen = new Uint8Array(cols * rows), q = [cell({ x: 110, y: 1400 })]; seen[q[0]] = 1;
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % cols, y = (i - x) / cols;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const j = ny * cols + nx; if (seen[j] || grid[j]) continue; seen[j] = 1; q.push(j);
        }
      }
      return seen;
    };
    const seen = flood(block);
    for (const [nome, p] of [['chefe', z.boss], ['mini-chefe', z.miniboss], ...z.chests.map((c) => [c.id, c]), ...z.camps.map((c) => [c.id, c]), ...(z.portals[1] ? [['portal leste', { x: z.portals[1].x - 60, y: z.portals[1].y }]] : [])]) assert.ok(seen[cell(p)], `${id}: ${nome} inalcançável`);
    const closed = new Uint8Array(block); // fecha a passagem de cada ponte
    for (const b of L.bridges) for (let cy = Math.floor((b.y - b.hw) / C); cy <= Math.floor((b.y + b.hw) / C); cy++) for (let cx = Math.floor((b.x - b.w / 2 - 20) / C); cx <= Math.floor((b.x + b.w / 2 + 20) / C); cx++) closed[cy * cols + cx] = 1;
    assert.ok(!flood(closed)[cell(z.boss)], id + ': sem as pontes o chefe seria alcançável (o rio não separa)');
  }
});

test('a trilha só pisa na água em cima da ponte e passa pela 1ª ponte de cada rio; postes e guarda-corpos têm sprite', () => {
  for (const id of FARM) {
    const L = LF[id], z = ZONES[id];
    for (const p of L.trail) for (const rv of L.rivers) if (nearRiver(rv, p.x, p.y, 0)) assert.ok(rv.bridges.some((b) => Math.abs(p.y - b.y) < 1 && Math.abs(p.x - b.x) < b.len / 2), `${id}: trilha na água fora da ponte (${Math.round(p.x)},${Math.round(p.y)})`);
    for (const rv of L.rivers) assert.ok(L.trail.some((p) => Math.abs(p.y - rv.bridges[0].y) < 1 && Math.abs(p.x - rv.bridges[0].x) < 5), id + ': trilha passa na 1ª ponte');
    const stone = z.scenery.kind === 'ruins' || z.scenery.kind === 'ember', kit = SET[z.look ?? id];
    const used = new Set(L.decor.map((d) => d.type));
    assert.ok(used.has(stone ? 'brazier' : 'lantern') && used.has(stone ? 'rubble' : 'log'), id + ': peças da ponte no layout');
    assert.ok(stone ? kit.rubble : kit.lantern && kit.log, id + ': sprite das peças da ponte');
  }
});

test('acampamentos: 4–6 mobs fixos com elite, determinísticos, fora de obstáculos/água, baú de tier maior; clareiras sem baú', () => {
  for (const id of FARM) {
    const z = ZONES[id], L = LF[id], spawns = campSpawns(id, 30);
    assert.deepEqual(campSpawns(id, 30), spawns, id + ': determinístico');
    const camps = z.camps.filter((c) => !c.glade), glades = z.camps.filter((c) => c.glade);
    assert.ok(camps.length >= 2 && camps.length <= 4 && glades.length >= 1, id + ': ' + camps.length + ' acampamentos, ' + glades.length + ' clareiras');
    const regularMax = Math.max(...z.chests.filter((c) => !c.camp).map((c) => c.tier));
    for (const c of z.camps) {
      const mine = spawns.filter((s) => s.camp === c.id);
      assert.ok(mine.length >= 4 && mine.length <= 6, `${c.id}: ${mine.length} mobs`);
      assert.ok(mine.filter((s) => s.elite).length >= 1, c.id + ': tem elite');
      for (const s of mine) {
        assert.ok(z.mobs.some(([m]) => m === s.mobId), `${c.id}: ${s.mobId} não é mob da zona`);
        assert.ok(s.level >= z.level[0] && s.level <= (z.scale ? 30 : z.level[1]) + 3, `${c.id}: nível ${s.level}`);
        assert.ok(Math.hypot(s.x - c.x, s.y - c.y) <= c.r && s.x > 60 && s.y > 60 && s.x < z.w - 60 && s.y < z.h - 60, c.id + ': dentro do acampamento');
        assert.ok(!blockedAt(L, s, 16), `${c.id}: mob em obstáculo (${Math.round(s.x)},${Math.round(s.y)})`);
        assert.ok(!L.rivers.some((rv) => nearRiver(rv, s.x, s.y, 10)), c.id + ': mob na água');
      }
      if (c.glade) assert.ok(!c.chest && !z.chests.some((k) => k.camp === c.id) && mine.filter((s) => s.elite).length >= 2, c.id + ': clareira = 2 elites, sem baú');
      else assert.ok(c.chest > regularMax && z.chests.some((k) => k.id === c.id && k.tier === c.chest), `${c.id}: baú de tier maior (${c.chest} > ${regularMax})`);
    }
    const mb = minibossSpawn(id);
    assert.ok(mb && mb.miniboss && mb.elite && MOBS[mb.mobId] && !MOBS[mb.mobId].boss && mb.hpMul >= 3 && mb.sizeMul > 1.2 && mb.respawn >= 120, id + ': mini-chefe');
    assert.ok(!blockedAt(L, mb, 30), id + ': mini-chefe em obstáculo');
  }
  assert.equal(campSpawns('town').length, 0); assert.equal(minibossSpawn('town'), null);
  // em zona com `scale` o nível dos acampamentos acompanha o do jogador; nas demais não muda
  assert.ok(campSpawns('ruins', 30)[0].level >= campSpawns('ruins', 1)[0].level);
  assert.deepEqual(campSpawns('forest', 30), campSpawns('forest', 1));
});

test('Cume Gélido e Cinzas Ardentes têm cenário próprio (conjunto de sprites e tipo de chão), não o do Bosque/Ruínas', () => {
  assert.equal(ZONES.glacier.look, 'glacier'); assert.equal(ZONES.ember.look, 'ember');
  assert.equal(ZONES.glacier.scenery.kind, 'glacier'); assert.equal(ZONES.ember.scenery.kind, 'ember');
  assert.ok(SET.glacier.tree && SET.glacier.crystal && SET.ember.statue && SET.ember.pine);
  const types = (id) => new Set(LF[id].decor.map((d) => d.type));
  assert.ok(types('glacier').has('crystal') && !types('glacier').has('bush'), 'gelo: cristais, sem arbustos verdes');
  assert.ok(types('ember').has('brazier') && types('ember').has('pillar'), 'brasa: braseiros e pilares');
});

test('memória do terreno: teto de blocos < 40 MiB para qualquer mapa (inteiro seria 49 MiB); zonas pequenas num canvas só', () => {
  const MIB = 1048576;
  for (const [id, z] of Object.entries(ZONES)) {
    const b = groundBudget(z);
    assert.ok(b.bytes < 40 * MIB, `${id}: ${(b.bytes / MIB).toFixed(1)} MiB`);
    assert.equal(b.mode, FARM.includes(id) || id === 'harbor' || id === 'crypt' ? 'tiles' : 'whole', id); // o Porto (2400×1700) passa de 14 MiB e vai em blocos
  }
  assert.ok(4600 * 2800 * 4 > 40 * MIB, 'sem blocos o mapa novo estouraria o teto');
  assert.ok(BUDGET_MIB <= 36);
  assert.ok(groundBudget(ZONES.forest, 1920, 1080).bytes < 40 * MIB, 'também no monitor grande');
});

test('layouts novos são determinísticos (glacial e brasa também)', async () => {
  const fresh = await import('../public/src/game/layout.js?recalculo2');
  for (const id of FARM) assert.deepEqual(fresh.buildLayout(id), LF[id], id);
});

// ---------------- Porto de Marfim (cidade neutra nº 2) ----------------
import { WORLD_NODES, WORLD_ROUTE, isHub, teleportCost } from '../public/src/data/zones.js';

test('Porto: zona segura e neutra (hub), sem monstros, com ligação de ida e volta com a Vila e posição no mapa-múndi', () => {
  const h = ZONES.harbor;
  assert.ok(h.safe && h.hub && !h.mobs && !h.boss, 'segura, sem mobs');
  assert.equal(h.w, 2400); assert.equal(h.h, 1700);
  assert.ok(isHub('town') && isHub('harbor') && !isHub('forest'));
  assert.equal(teleportCost('harbor'), 1, 'o Porto custa 1 pergaminho como as zonas de farm'); assert.equal(teleportCost('town'), 0); assert.equal(teleportCost('forest'), 1);
  assert.deepEqual(ZONES.town.portals.map((p) => p.to), ['forest'], 'a Vila não liga ao Porto');
  assert.deepEqual(h.portals.map((p) => p.to), ['plains', 'ruins'], 'oeste volta à Planície, leste segue às Ruínas');
  assert.deepEqual(WORLD_ROUTE, ['town', 'forest', 'plains', 'harbor', 'ruins', 'glacier', 'ember'], 'Porto no meio da rota');
  for (let i = 1; i < WORLD_ROUTE.length; i++) assert.ok(!(isHub(WORLD_ROUTE[i]) && isHub(WORLD_ROUTE[i - 1])), 'duas cidades neutras coladas');
  assert.ok(ZONES.plains.portals.some((p) => p.to === 'harbor') && !ZONES.plains.portals.some((p) => p.to === 'ruins'));
  assert.ok(ZONES.ruins.portals.some((p) => p.to === 'harbor') && !ZONES.ruins.portals.some((p) => p.to === 'plains'));
  assert.equal(h.portals[0].y, h.portals[1].y, 'portais do Porto na mesma altura');
  for (const id of WORLD_ROUTE) { const n = WORLD_NODES[id]; assert.ok(n && n.x >= 0 && n.x <= 100 && n.y >= 0 && n.y <= 100, `nó de ${id} no mapa`); }
  const pts = WORLD_ROUTE.map((id) => WORLD_NODES[id]);
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) > 8, 'nós separados');
  assert.ok(h.arenaFriendly && h.arenaFriendly.rated === false && h.arenaFriendly.mode === '1v1' && h.npcs.some((n) => n.id === h.arenaFriendly.npc));
});

test('Porto: spawn, portais, chegadas e NPCs livres de obstáculos e de água; 5 serviços e casas fora da água', () => {
  const h = ZONES.harbor, T = ZONES.town, Lh = buildLayout('harbor'), Lt = buildLayout('town');
  const clear = (Lx, p, m, what) => assert.ok(!Lx.obstacles.some((o) => distTo(o, p) < m) && !Lx.rivers.some((rv) => nearRiver(rv, p.x, p.y, 20)), `${what} bloqueado (${p.x},${p.y})`);
  clear(Lh, h.spawn, 60, 'spawn do porto');
  for (const p of h.portals) clear(Lh, p, 40, 'portal do porto');
  for (const from of ['plains', 'ruins']) { const to = ZONES[from].portals.find((p) => p.to === 'harbor'); clear(Lh, { x: to.tx, y: to.ty }, 60, 'chegada no porto vinda de ' + from); }
  for (const n of h.npcs) { clear(Lh, n, 40, 'NPC ' + n.id); assert.ok(n.x > 40 && n.y > 40 && n.x < h.w - 40 && n.y < h.h - 40); }
  assert.deepEqual(h.npcs.map((n) => n.role).sort(), ['bank', 'board', 'duel', 'harborshop', 'quest']);
  for (let i = 0; i < h.npcs.length; i++) for (let j = i + 1; j < h.npcs.length; j++) assert.ok(Math.hypot(h.npcs[i].x - h.npcs[j].x, h.npcs[i].y - h.npcs[j].y) >= 120, `rótulos de ${h.npcs[i].id} e ${h.npcs[j].id} se sobrepõem`);
  for (const hs of h.houses) for (const q of [[hs.x, hs.y], [hs.x + hs.w, hs.y], [hs.x, hs.y + hs.h], [hs.x + hs.w, hs.y + hs.h]]) assert.ok(!Lh.rivers.some((rv) => nearRiver(rv, q[0], q[1], 20)), 'casa na água');
  for (const p of Lh.ponds) assert.ok(Lh.obstacles.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < p.rx), 'baía tem colisão');
  // a moldura de árvores abre onde ficam os portais oeste e leste
  for (const p of h.portals) assert.ok(!Lh.decor.some((d) => d.type === 'tree' && (p.x < 100 ? d.x < 60 : d.x > h.w - 60) && Math.abs(d.y - p.y) < 110), 'abertura no portal ' + p.to);
});

test('Porto: tudo alcançável a pé a partir da chegada (ponte sobre o canal, baías contornadas, ringue do duelo)', () => {
  const z = ZONES.harbor, L = buildLayout('harbor'), C = 20, R = 15, cols = Math.ceil(z.w / C), rows = Math.ceil(z.h / C), block = new Uint8Array(cols * rows);
  for (const o of L.obstacles) {
    const x0 = o.w ? o.x : o.x - o.r, x1 = o.w ? o.x + o.w : o.x + o.r, y0 = o.w ? o.y : o.y - o.r, y1 = o.w ? o.y + o.h : o.y + o.r;
    for (let cy = Math.max(0, Math.floor((y0 - R) / C)); cy <= Math.min(rows - 1, Math.floor((y1 + R) / C)); cy++) for (let cx = Math.max(0, Math.floor((x0 - R) / C)); cx <= Math.min(cols - 1, Math.floor((x1 + R) / C)); cx++) if (distTo(o, { x: cx * C + C / 2, y: cy * C + C / 2 }) < R) block[cy * cols + cx] = 1;
  }
  const cell = (p) => Math.floor(p.y / C) * cols + Math.floor(p.x / C);
  const flood = (grid) => {
    const seen = new Uint8Array(cols * rows), q = [cell({ x: 1500, y: 920 })]; seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % cols, y = (i - x) / cols;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue; const j = ny * cols + nx; if (seen[j] || grid[j]) continue; seen[j] = 1; q.push(j); }
    }
    return seen;
  };
  const seen = flood(block);
  for (const n of z.npcs) assert.ok(seen[cell(n)], `${n.id} inalcançável`);
  assert.ok(seen[cell(z.spawn)] && z.portals.every((p) => seen[cell(p)]), 'spawn e portais'); // a chegada oeste (x=110) já é do lado da Capitã, do outro lado do canal
  assert.ok(seen[cell({ x: 520, y: 780 })], 'o outro lado do canal (Capitã Maré) é alcançável');
  const closed = new Uint8Array(block); // sem a ponte o canal separa o porto: a ponte é o único caminho
  const b = L.bridges[0];
  for (let cy = Math.floor((b.y - b.hw) / C); cy <= Math.floor((b.y + b.hw) / C); cy++) for (let cx = Math.floor((b.x - b.w / 2 - 20) / C); cx <= Math.floor((b.x + b.w / 2 + 20) / C); cx++) closed[cy * cols + cx] = 1;
  assert.ok(!flood(closed)[cell({ x: 520, y: 780 })], 'sem a ponte, o oeste fica isolado');
});

test('Porto: visual próprio (sprites, textura de chão e luz), diferente da Vila', async () => {
  const L = buildLayout('harbor'), types = new Set(L.decor.map((d) => d.type));
  for (const t of ['house', 'lantern', 'well', 'fence', 'signpost', 'log']) assert.ok(types.has(t), 'decor ' + t);
  assert.equal(L.decor.filter((d) => d.type === 'house').length, ZONES.harbor.houses.length);
  const kit = SET.harbor;
  for (const t of types) if (['house', 'lantern', 'well', 'fence', 'signpost', 'log', 'tree', 'rock', 'bush'].includes(t)) assert.ok(kit[t], 'sprite de ' + t);
  assert.ok(kit.house.v.length === 4 && ZONES.harbor.houses.every((h) => h.art >= 0 && h.art < 4));
  assert.ok(new Set(ZONES.harbor.houses.map((h) => h.art)).size >= 3, 'casas variadas');
  assert.notEqual(ZONES.harbor.scenery.kind, ZONES.town.scenery.kind);
  assert.notEqual(ZONES.harbor.palette.ground, ZONES.town.palette.ground);
  assert.ok(SET.harbor.tree !== SET.town.tree, 'cerejeiras no porto, árvores do Bosque na vila');
  const { dayPhase } = await import('../public/src/core/daycycle.js');
  assert.equal(dayPhase(12).name, 'day');
});

test('Vila: a trilha automática não corta a vila (noTrail) e o layout da vila segue determinístico', async () => {
  assert.equal(L.town.trail.length, 0);
  const fresh = await import('../public/src/game/layout.js?recalculo3');
  assert.deepEqual(fresh.buildLayout('harbor'), buildLayout('harbor'));
});

test('Cripta dos Ecos: layout determinístico, muros com porta aberta e pontos importantes livres', async () => {
  const { CRYPT_GEOM: G } = await import('../public/src/data/crypt.js');
  const z = ZONES.crypt, a = buildLayout('crypt');
  const fresh = await import('../public/src/game/layout.js?recalculo-cripta');
  assert.deepEqual(fresh.buildLayout('crypt'), a, 'mesmo resultado em qualquer cliente');
  assert.ok(!z.mobs && !z.boss, 'sem monstros soltos: a sala do servidor povoa a masmorra');
  const rects = a.obstacles.filter((o) => o.w && G.walls.includes(o.x)); // blocos dos muros (os sarcófagos também são retângulos, em outro x)
  assert.equal(rects.length, G.walls.length * 2, 'dois blocos por muro (acima e abaixo da porta)');
  const inRect = (x, y, r = 0) => rects.some((o) => x > o.x - r && x < o.x + o.w + r && y > o.y - r && y < o.y + o.h + r);
  for (const x of G.walls) {
    assert.ok(!inRect(x + G.wallW / 2, G.mid, 20), 'a porta do muro ' + x + ' deixa um herói passar');
    assert.ok(inRect(x + G.wallW / 2, G.door[0] - 40) && inRect(x + G.wallW / 2, G.door[1] + 40), 'o muro fecha fora da porta');
  }
  for (const s of G.starts) assert.ok(!inRect(s, G.mid, 30), 'chegada livre');
  assert.ok(!inRect(G.bossAt.x, G.bossAt.y, 60), 'chefe nasce em lugar livre');
  assert.ok(!inRect(z.portals[0].x, z.portals[0].y, 30), 'saída livre');
  // as salas ficam entre os muros e as faixas de nascimento cabem no corredor
  G.roomX.forEach(([x0, x1], i) => assert.ok(x0 < x1 && (i === 0 || x0 > G.walls[i - 1] + G.wallW) && (i === G.roomX.length - 1 || x1 < G.walls[i]), 'faixa da sala ' + i));
  assert.ok(a.decor.some((d) => d.type === 'pillar') && a.decor.some((d) => d.type === 'brazier'), 'muros desenhados com colunas e braseiros');
  assert.equal(a.decor.filter((d) => d.type === 'cgate').length, G.walls.length, 'um portão em cada porta');
  const sarc = a.obstacles.filter((o) => o.w && !G.walls.includes(o.x));
  assert.ok(sarc.length >= 4 && sarc.every((o) => o.y + o.h < 400 || o.y > 600), 'sarcófagos fora da faixa central (portas, chegadas e chefe)');
});
test('Porto: caixotes e barcos decorativos, determinísticos e fora das ruas', () => {
  const a = buildLayout('harbor'), props = a.decor.filter((d) => d.type === 'cprop'), boats = a.decor.filter((d) => d.type === 'cboat');
  assert.ok(props.length >= 6 && boats.length >= 2 && boats.length <= 3);
  for (const d of props) assert.ok(Math.abs(d.y - ZONES.harbor.paths.find((p) => p[1] === p[3] && p[0] < 100)[1]) > 60, 'longe da rua principal (y ' + d.y + ')');
  assert.deepEqual(buildLayout('harbor').decor.filter((d) => d.type === 'cprop'), props);
});
