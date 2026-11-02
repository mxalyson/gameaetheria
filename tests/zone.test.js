import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createGameServer } from '../server/game-server.js';
import { newOfficialCharacter } from '../server/api.js';
import { connect, input, closeAll } from './helpers/net.js';
import { applyZoneBatch } from '../public/src/core/rewards.js';
import { entryPoint } from '../server/zone.js';
import { makeRng } from '../public/src/core/rng.js';
import { generateItem } from '../public/src/core/loot.js';

// Exploração no servidor (P11.1): instância solo/grupo por zona, movimento e combate autoritativos, recompensas decididas e gravadas pelo servidor.
async function setup(n = 1) {
  const db = openDb(':memory:');
  const srv = createGameServer({ port: 0, host: '127.0.0.1', autoTick: false, db, allowGuests: false });
  await srv.ready;
  const players = [];
  for (let i = 0; i < n; i++) {
    const acc = db.createAccount({ email: `z${i}@t.t`, pwHash: 'x' });
    const doc = newOfficialCharacter('Zed' + i, 'warrior');
    const ch = db.createCharacter(acc, doc.name, doc.classId, doc);
    const sess = db.createSession(acc);
    const c = await connect(srv);
    c.send({ t: 'hello', session: sess, characterId: ch });
    await c.waitFor((m) => m.t === 'welcome');
    players.push({ c, acc, ch });
  }
  return { db, srv, players };
}

test('entryPoint: só portais reais levam à zona; vila → bosque cai na entrada do bosque', () => {
  assert.deepEqual(entryPoint('forest', 'town'), { x: 110, y: 1400 });
  assert.equal(entryPoint('ruins', 'town'), null);
  assert.equal(entryPoint('plains', 'forest').x, 110);
});

test('applyZoneBatch: XP, ouro, itens, mortes e contadores', () => {
  const doc = newOfficialCharacter('P', 'warrior'); doc.gold = 1000;
  const item = generateItem(makeRng(3), 4, { classId: 'warrior' }); item.id = 'iX1';
  const out = applyZoneBatch(doc, { xp: 5000, gold: 200, potions: 2, items: [item], essences: [], kills: [{ mobId: 'slime' }, { mobId: 'slime' }], zoneId: 'forest', deaths: 1 });
  assert.ok(out.doc.level > doc.level, 'subiu de nível');
  assert.equal(out.doc.gold, Math.floor(1200 * 0.9));
  assert.equal(out.summary.items, 1); assert.equal(out.summary.kills, 2);
  assert.ok(out.doc.inventory.some((i) => i.id === 'iX1'));
});

test('entrar na zona: instância criada, zone_joined com o ponto de entrada e snapshots com monstros', async () => {
  const { srv, players } = await setup(1);
  const { c } = players[0];
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  assert.equal(j.zone, 'forest'); assert.equal(j.x, 110); assert.equal(j.y, 1400); assert.equal(j.players.length, 1);
  srv.step(30);
  const snap = await c.waitFor((m) => m.t === 'snap' && m.mode === 'zone');
  assert.ok(snap.mobs.length > 5, 'monstros da zona');
  assert.ok(snap.actors.some((a) => a.id === j.you));
  const mb = snap.mobs.find((m) => m.miniboss);
  assert.ok(mb, 'mini-chefe da zona marcado no snapshot'); assert.equal(mb.name, 'Alfa da Matilha'); assert.ok(mb.r > 0); assert.ok(mb.maxHp > 0);
  assert.ok(snap.mobs.some((m) => m.camp), 'acampamentos marcados');
  c.send({ t: 'zone_enter', zone: 'ruins', from: 'town' });
  await c.waitFor((m) => m.t === 'reject' && m.code === 'in_match' || m.code === 'bad_zone');
  await closeAll(srv, c);
});

test('portal inexistente é recusado', async () => {
  const { srv, players } = await setup(1);
  const { c } = players[0];
  c.send({ t: 'zone_enter', zone: 'ruins', from: 'town' });
  await c.waitFor((m) => m.t === 'reject' && m.code === 'bad_zone');
  await closeAll(srv, c);
});

test('movimento é do servidor: andar é limitado pela velocidade', async () => {
  const { srv, players } = await setup(1);
  const { c } = players[0];
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  const a0 = srv.actor(j.you), x0 = a0.x;
  c.send(input(1, 1, 0)); await c.sync(); srv.step(60);
  assert.ok(a0.x > x0 + 100 && a0.x < x0 + 260, `andou ~1 s de velocidade (${(a0.x - x0).toFixed(0)})`);
  await closeAll(srv, c);
});

test('matar monstros gera recompensa decidida e gravada pelo servidor; ganhos enviados pelo cliente são recusados', async () => {
  const { db, srv, players } = await setup(1);
  const { c, ch } = players[0];
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  const room = srv.hub.zoneRooms.values().next().value;
  const me = srv.actor(j.you), before = db.character(ch).doc;
  const mob = room.mobs().find((m) => !m.dead);
  mob.hp = 1; mob.x = me.x + 30; mob.y = me.y;
  c.send(input(1, 0, 0, { attack: true, aimX: mob.x, aimY: mob.y })); await c.sync();
  for (let i = 0; i < 240 && !mob.dead; i++) srv.step(1);
  assert.ok(mob.dead, 'monstro morreu');
  const p = room.players.get(j.you);
  assert.ok(p.pend.xp > 0 && p.pend.kills.length === 1, 'recompensa pendente no servidor');
  room.flush(p);
  const after = db.character(ch).doc;
  assert.ok(after.xp > before.xp || after.level > before.level, 'XP gravado');
  const rw = await c.waitFor((m) => m.t === 'zone_reward');
  assert.equal(rw.kills, 1);
  c.send({ t: 'reward', gold: 99999 }); c.send({ t: 'loot', item: 'x' });
  await c.sync().catch(() => {});
  assert.equal(db.character(ch).doc.gold, after.gold);
  await closeAll(srv, c);
});

test('morrer: renasce na entrada depois de 4 s e a morte custa 10% do ouro', async () => {
  const { db, srv, players } = await setup(1);
  const { c, ch } = players[0];
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  const room = srv.hub.zoneRooms.values().next().value, me = srv.actor(j.you);
  const g0 = db.character(ch).doc.gold;
  me.x = 900; me.y = 900; me.hp = 0; me.dead = true; me.deadT = 0; room.onPlayerDeath(me);
  srv.step(60 * 4 + 5);
  assert.equal(me.dead, false); assert.ok(Math.hypot(me.x - 110, me.y - 1400) < 5, 'voltou à entrada');
  room.flush(room.players.get(j.you));
  assert.equal(db.character(ch).doc.gold, g0 - Math.floor(g0 * 0.1));
  await closeAll(srv, c);
});

test('grupo: membros caem na MESMA instância; solo fica separado; sala vazia fecha', async () => {
  const { srv, players } = await setup(3);
  const [a, b, solo] = players;
  a.c.send({ t: 'party_create' }); await a.c.waitFor((m) => m.t === 'party');
  a.c.send({ t: 'party_invite', name: 'Zed1' });
  const inv = await b.c.waitFor((m) => m.t === 'invite'); b.c.send({ t: 'party_accept', partyId: inv.partyId });
  await b.c.waitFor((m) => m.t === 'party' && m.members?.length === 2);
  for (const p of [a, b, solo]) p.c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const ja = await a.c.waitFor((m) => m.t === 'zone_joined'), jb = await b.c.waitFor((m) => m.t === 'zone_joined'), js = await solo.c.waitFor((m) => m.t === 'zone_joined');
  assert.equal(ja.room, jb.room, 'grupo na mesma sala');
  assert.notEqual(ja.room, js.room, 'solo em outra');
  assert.equal(jb.players.length, 2);
  srv.step(40); await a.c.sync();
  assert.equal(a.c.last('snap').actors.length, 2, 'A enxerga B');
  b.c.send({ t: 'zone_leave' }); await b.c.waitFor((m) => m.t === 'zone_exit');
  srv.step(40); await a.c.sync();
  assert.equal(a.c.last('snap').actors.length, 1);
  solo.c.send({ t: 'zone_leave' }); await solo.c.waitFor((m) => m.t === 'zone_exit');
  srv.step(3);
  assert.equal(srv.hub.zoneRooms.size, 1, 'sala vazia do solo foi fechada');
  await closeAll(srv, a.c, b.c, solo.c);
});

test('portais: Bosque → Planície (nova instância) e Planície → Bosque', async () => {
  const { srv, players } = await setup(1);
  const { c } = players[0];
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  const me = srv.actor(j.you);
  me.x = 4560; me.y = 1400; srv.hub.zoneRooms.values().next().value.players.get(j.you).portalCd = 0;
  srv.step(2);
  const j2 = await c.waitFor((m) => m.t === 'zone_joined' && m.zone === 'plains');
  assert.equal(j2.x, 110);
  const me2 = srv.actor(j2.you); me2.x = 40; me2.y = 1400;
  srv.hub.zoneRooms.get([...srv.hub.zoneRooms.keys()].find((k) => k.endsWith(':plains'))).players.get(j2.you).portalCd = 0;
  srv.step(2);
  const j3 = await c.waitFor((m) => m.t === 'zone_joined' && m.zone === 'forest' && m.room !== j.room);
  assert.equal(j3.x, 4490);
  await closeAll(srv, c);
});

test('eventos do chefe (aviso do ritual e fases) chegam ao cliente online', async () => {
  const { wire } = await import('../server/wire.js');
  assert.deepEqual(wire({ type: 'boss_warn', stage: 'omen', name: 'Cavaleiro Rubro', x: 100.4, y: 200.6 }), { e: 'boss_warn', stage: 'omen', name: 'Cavaleiro Rubro', x: 100, y: 201 });
  assert.deepEqual(wire({ type: 'phase', actor: { id: 7 }, phase: 3 }), { e: 'phase', actor: 7, phase: 3 });
});

// ---------- B4 / B8 / B9 ----------
import { computeStats } from '../public/src/core/stats.js';

test('B4: a sala usa o documento ATUAL do banco (equipamento gravado depois do login), não o do hello', async () => {
  const { db, srv, players } = await setup(1);
  const { c, ch } = players[0];
  const row = db.character(ch), doc = structuredClone(row.doc);
  doc.equipment.armor.stats.hp = (doc.equipment.armor.stats.hp ?? 0) + 777;
  assert.ok(db.saveCharacter(ch, doc, row.rev));
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  assert.equal(srv.actor(j.you).maxHp, computeStats(doc).maxHp);
  assert.ok(computeStats(doc).maxHp > computeStats(row.doc).maxHp);
  await closeAll(srv, c);
});

test('B8: hub.flushAll grava as recompensas pendentes das instâncias (desligamento limpo)', async () => {
  const { db, srv, players } = await setup(1);
  const { c, ch } = players[0];
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  const room = srv.hub.rooms.values().next().value, p = room.players.get(j.you);
  const gold0 = db.character(ch).doc.gold;
  p.pend.gold += 321;
  srv.hub.flushAll();
  assert.equal(db.character(ch).doc.gold, gold0 + 321);
  assert.equal(p.pend.gold, 0);
  await closeAll(srv, c);
});

test('B8: flush que falha devolve o lote ao pendente (a recompensa não some)', async () => {
  const { db, srv, players } = await setup(1);
  const { c } = players[0];
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  const room = srv.hub.rooms.values().next().value, p = room.players.get(j.you);
  p.pend.gold = 50; p.pend.xp = 10;
  const real = db.applyOperation; db.applyOperation = () => { throw new Error('disco cheio'); };
  assert.equal(room.flush(p), null);
  db.applyOperation = real;
  assert.equal(p.pend.gold, 50); assert.equal(p.pend.xp, 10);
  await closeAll(srv, c);
});

test('B9: exceção numa sala fecha só essa sala; o servidor segue e a outra sala continua', async () => {
  const { srv, players } = await setup(2);
  const [a, b] = players;
  a.c.send({ t: 'zone_enter', zone: 'forest', from: 'town' }); b.c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  await a.c.waitFor((m) => m.t === 'zone_joined'); await b.c.waitFor((m) => m.t === 'zone_joined');
  const [ra, rb] = [...srv.hub.rooms.values()];
  assert.notEqual(ra, rb);
  const logs = []; srv.hub.log = (msg, extra) => logs.push([msg, extra]);
  ra.step = () => { throw new Error('mob com id desconhecido'); };
  assert.doesNotThrow(() => srv.step(5));
  assert.ok(ra.closed); assert.ok(!srv.hub.rooms.has(ra.id)); assert.ok(srv.hub.rooms.has(rb.id));
  assert.equal(logs[0][0], 'room_step'); assert.equal(srv.hub.stats.roomErrors, 1);
  await a.c.waitFor((m) => m.t === 'match_end' && m.reason === 'error');
  const tick0 = rb.tick; srv.step(3); assert.equal(rb.tick, tick0 + 3, 'a outra sala segue');
  await closeAll(srv, a.c, b.c);
});
