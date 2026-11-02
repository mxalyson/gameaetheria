import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createGameServer } from '../server/game-server.js';
import { newOfficialCharacter } from '../server/api.js';
import { connect, closeAll } from './helpers/net.js';
import { decodeClient } from '../public/src/core/protocol.js';

// Teletransporte online: o servidor confere visitado, pergaminho, combate e intervalo, e debita o pergaminho no documento oficial.
async function setup({ visited = { town: 1, forest: 1, plains: 1 }, scrolls = 2 } = {}) {
  const db = openDb(':memory:');
  const srv = createGameServer({ port: 0, host: '127.0.0.1', autoTick: false, db, allowGuests: false });
  await srv.ready;
  const acc = db.createAccount({ email: 'tp@t.t', pwHash: 'x' });
  const doc = newOfficialCharacter('Tele', 'warrior');
  doc.visited = visited; doc.scrolls = scrolls;
  const ch = db.createCharacter(acc, doc.name, doc.classId, doc);
  const c = await connect(srv);
  c.send({ t: 'hello', session: db.createSession(acc), characterId: ch });
  await c.waitFor((m) => m.t === 'welcome');
  return { db, srv, c, ch };
}
const wait = (srv) => srv.step(60 * 6); // passa o intervalo mínimo entre pedidos
const rejected = (c, code) => c.waitFor((m) => m.t === 'reject' && m.code === code);

test('protocolo: zone_teleport só aceita vila ou zona de farm, string', () => {
  assert.equal(decodeClient(JSON.stringify({ v: 4, t: 'zone_teleport', zone: 'forest' })).ok, true);
  assert.equal(decodeClient(JSON.stringify({ v: 4, t: 'zone_teleport', zone: 'town' })).ok, true);
  for (const zone of ['arena', 'nowhere', 5, null, undefined, { a: 1 }, '__proto__']) assert.equal(decodeClient(JSON.stringify({ v: 4, t: 'zone_teleport', zone })).ok, false, String(zone));
});

test('teleporte válido: entra no ponto oeste, debita 1 pergaminho no banco e informa a contagem', async () => {
  const { db, srv, c, ch } = await setup();
  c.send({ t: 'zone_teleport', zone: 'plains' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  assert.equal(j.zone, 'plains'); assert.equal(j.x, 110); assert.equal(j.y, 950); assert.equal(j.scrolls, 1);
  assert.equal(db.character(ch).doc.scrolls, 1);
  assert.equal(srv.hub.sessions.values().next().value.char.scrolls, 1);
  // de dentro de uma instância para outra (sai da sala atual)
  wait(srv); Object.assign(srv.actor(j.you), { lastCombat: -99, dead: false, hp: 1 }); // nível 1 na Planície: os monstros podem ter atacado/matado; força "vivo e fora de combate"
  c.send({ t: 'zone_teleport', zone: 'forest' });
  const j2 = await c.waitFor((m) => m.t === 'zone_joined' && m.zone === 'forest');
  assert.equal(j2.scrolls, 0); assert.equal(db.character(ch).doc.scrolls, 0);
  assert.equal([...srv.hub.zoneRooms.values()].filter((r) => r.size > 0).length, 1, 'só uma sala ocupada');
  await closeAll(srv, c);
});

test('vila é grátis e não gasta pergaminho', async () => {
  const { db, srv, c, ch } = await setup({ scrolls: 0 });
  c.send({ t: 'zone_teleport', zone: 'town' });
  const ex = await c.waitFor((m) => m.t === 'zone_exit');
  assert.equal(ex.to, 'town'); assert.equal(db.character(ch).doc.scrolls, 0);
  await closeAll(srv, c);
});

test('recusa mapa não visitado (sem debitar)', async () => {
  const { db, srv, c, ch } = await setup({ visited: { town: 1, forest: 1 } });
  c.send({ t: 'zone_teleport', zone: 'ruins' });
  await rejected(c, 'not_visited');
  assert.equal(db.character(ch).doc.scrolls, 2);
  await closeAll(srv, c);
});

test('recusa sem pergaminho', async () => {
  const { srv, c } = await setup({ scrolls: 0 });
  c.send({ t: 'zone_teleport', zone: 'forest' });
  await rejected(c, 'no_scroll');
  await closeAll(srv, c);
});

test('recusa em combate recente e depois de 8 s libera', async () => {
  const { db, srv, c, ch } = await setup();
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  const room = srv.hub.zoneRooms.values().next().value, me = srv.actor(j.you);
  me.lastCombat = room.world.time;
  wait(srv); me.lastCombat = room.world.time;
  c.send({ t: 'zone_teleport', zone: 'plains' });
  await rejected(c, 'in_combat');
  assert.equal(db.character(ch).doc.scrolls, 2, 'nada debitado');
  wait(srv); srv.step(120); // passam mais de 8 s sem combate
  c.send({ t: 'zone_teleport', zone: 'plains' });
  await c.waitFor((m) => m.t === 'zone_joined' && m.zone === 'plains');
  assert.equal(db.character(ch).doc.scrolls, 1);
  await closeAll(srv, c);
});

test('mensagem malformada e zona inexistente', async () => {
  const { srv, c } = await setup();
  c.send({ t: 'zone_teleport' }); await rejected(c, 'bad_message');
  c.send({ t: 'zone_teleport', zone: ['forest'] }); await c.sync().catch(() => {});
  c.send({ t: 'zone_teleport', zone: 'forest', cost: 0, scrolls: 99 }); // campos extras são ignorados
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  assert.equal(j.scrolls, 1, 'o cliente não escolhe o custo');
  await closeAll(srv, c);
});

test('spam: pedidos seguidos são recusados pelo intervalo e só um pergaminho é gasto', async () => {
  const { db, srv, c, ch } = await setup({ scrolls: 5 });
  for (let i = 0; i < 10; i++) c.send({ t: 'zone_teleport', zone: i % 2 ? 'forest' : 'plains' });
  await c.waitFor((m) => m.t === 'zone_joined');
  await rejected(c, 'teleport_wait');
  await c.sync().catch(() => {});
  assert.equal(db.character(ch).doc.scrolls, 4);
  await closeAll(srv, c);
});

test('em partida PvP/fila não teleporta', async () => {
  const { srv, c } = await setup();
  srv.hub.sessions.values().next().value.queued = { mode: 'coop', members: [] }; // simula estar na fila (não entra em srv.queue, então não há matchmaking)
  c.send({ t: 'zone_teleport', zone: 'forest' });
  await rejected(c, 'already_queued');
  await closeAll(srv, c);
});

test('entrar por portal grava o mapa como visitado no personagem oficial', async () => {
  const { db, srv, c, ch } = await setup({ visited: { town: 1 } });
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  await c.waitFor((m) => m.t === 'zone_joined');
  assert.equal(db.character(ch).doc.visited.forest, 1);
  await closeAll(srv, c);
});
