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
  assert.equal(j.zone, 'plains'); assert.equal(j.x, 110); assert.equal(j.y, 1400); // B22: ponto oeste = FARM_ENTRY, FARM_MID assert.equal(j.scrolls, 1);
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

// ---------- B1: zone_enter não confia no `from` do cliente ----------
test('B1: nível 1 na vila não entra nas Cinzas com `from` falso e nada é marcado como visitado', async () => {
  const { db, srv, c, ch } = await setup({ visited: { town: 1 }, scrolls: 0 });
  for (const [zone, from] of [['ember', 'glacier'], ['glacier', 'ruins'], ['plains', 'forest'], ['ruins', 'plains']]) c.send({ t: 'zone_enter', zone, from });
  await c.sync();
  assert.equal(c.all('zone_joined').length, 0, 'nenhuma entrada');
  assert.equal(c.all('reject').filter((m) => m.code === 'bad_zone').length, 4);
  assert.deepEqual(db.character(ch).doc.visited, { town: 1 });
  assert.equal(srv.hub.rooms.size, 0);
  await closeAll(srv, c);
});

test('B1: da vila só o Bosque; o `from` mentiroso é ignorado (entra no ponto do portal real)', async () => {
  const { db, srv, c, ch } = await setup({ visited: { town: 1 }, scrolls: 0 });
  c.send({ t: 'zone_enter', zone: 'forest', from: 'ruins' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  assert.equal(j.zone, 'forest'); assert.equal(j.x, 110); assert.equal(j.y, 1400);
  assert.equal(db.character(ch).doc.visited.forest, 1);
  await closeAll(srv, c);
});

test('B1: dentro da sala só atravessa o portal quem está perto dele (≤ 80 px) e só para a zona vizinha', async () => {
  const { db, srv, c, ch } = await setup({ visited: { town: 1 }, scrolls: 0 });
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  const actor = srv.actor(j.you);
  c.send({ t: 'zone_enter', zone: 'plains', from: 'forest' }); // longe do portal leste
  await c.waitFor((m) => m.t === 'reject' && m.code === 'not_at_portal');
  c.send({ t: 'zone_enter', zone: 'ruins', from: 'plains' }); // não é vizinha da zona atual
  await c.waitFor((m) => m.t === 'reject' && m.code === 'bad_zone');
  assert.equal(db.character(ch).doc.visited.plains, undefined);
  Object.assign(actor, { x: 4560 - 60, y: 1400 }); // ao lado do portal
  c.send({ t: 'zone_enter', zone: 'plains', from: 'town' }); // `from` falso de novo: ignorado
  const j2 = await c.waitFor((m) => m.t === 'zone_joined' && m.zone === 'plains');
  assert.equal(j2.x, 110);
  assert.equal(db.character(ch).doc.visited.plains, 1, 'entrada legítima marca visitado');
  await closeAll(srv, c);
});

test('B15: zone_leave (voltar para a vila) é recusado em combate ou morto; livre depois de 8 s', async () => {
  const { srv, c } = await setup();
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  const room = srv.hub.zoneRooms.values().next().value, me = srv.actor(j.you);
  me.lastCombat = room.world.time;
  c.send({ t: 'zone_leave' });
  await rejected(c, 'in_combat');
  assert.ok(srv.hub.sessions.values().next().value.room, 'continua na instância');
  me.lastCombat = -99; me.dead = true;
  c.send({ t: 'zone_leave' });
  await c.sync();
  assert.ok(srv.hub.sessions.values().next().value.room, 'morto também não sai');
  assert.equal(c.all('zone_exit').length, 0);
  me.dead = false; me.lastCombat = room.world.time - 20;
  c.send({ t: 'zone_leave' });
  assert.equal((await c.waitFor((m) => m.t === 'zone_exit')).to, 'town');
  await closeAll(srv, c);
});

test('B19: reconectar do zero com a sessão antiga ainda na sala encerra a antiga (um personagem, uma sala)', async () => {
  const { db, srv, c, ch } = await setup();
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  await c.waitFor((m) => m.t === 'zone_joined');
  const sess = srv.hub.sessions.values().next().value;
  const accountId = sess.accountId;
  c.ws.terminate(); await new Promise((r) => setTimeout(r, 80));
  assert.equal(srv.hub.sessions.size, 1, 'sessão antiga ainda na janela de reconexão');
  const c2 = await connect(srv);
  c2.send({ t: 'hello', session: db.createSession(accountId), characterId: ch });
  await c2.waitFor((m) => m.t === 'welcome');
  assert.equal(srv.hub.sessions.size, 1, 'só a sessão nova sobrou');
  assert.equal([...srv.hub.zoneRooms.values()].reduce((n, r) => n + r.size, 0), 0, 'a antiga saiu da instância');
  await closeAll(srv, c2);
});

// ---------- Porto no meio da rota (hub sem sala): atravessar Planície -> Porto -> Ruínas e teletransporte pago ----------
test('protocolo: zone_teleport e zone_enter aceitam o Porto', () => {
  assert.equal(decodeClient(JSON.stringify({ v: 4, t: 'zone_teleport', zone: 'harbor' })).ok, true);
  assert.equal(decodeClient(JSON.stringify({ v: 4, t: 'zone_enter', zone: 'ruins', from: 'harbor' })).ok, true);
});

test('teleporte ao Porto custa 1 pergaminho, sai da sala (zone_exit to harbor) e de lá o portal leste entra nas Ruínas', async () => {
  const { db, srv, c, ch } = await setup({ visited: { town: 1, forest: 1, plains: 1, harbor: 1, ruins: 1 } });
  c.send({ t: 'zone_teleport', zone: 'harbor' });
  const ex = await c.waitFor((m) => m.t === 'zone_exit');
  assert.equal(ex.to, 'harbor'); assert.equal(ex.x, 1500); assert.equal(db.character(ch).doc.scrolls, 1);
  wait(srv);
  c.send({ t: 'zone_enter', zone: 'ruins', from: 'harbor' });
  const j = await c.waitFor((m) => m.t === 'zone_joined' && m.zone === 'ruins');
  assert.equal(j.x, 110); assert.equal(j.y, 1400);
  await closeAll(srv, c);
});

test('Porto: sem ter visitado (nem as Ruínas) recusa; quem visitou as Ruínas pode ir; Planície -> Porto sai da instância', async () => {
  const a = await setup({ visited: { town: 1, forest: 1, plains: 1 } });
  a.c.send({ t: 'zone_teleport', zone: 'harbor' });
  await rejected(a.c, 'not_visited');
  assert.equal(a.db.character(a.ch).doc.scrolls, 2);
  await closeAll(a.srv, a.c);
  const b = await setup({ visited: { town: 1, forest: 1, plains: 1, ruins: 1 } });
  b.c.send({ t: 'zone_teleport', zone: 'plains' });
  const j = await b.c.waitFor((m) => m.t === 'zone_joined');
  wait(b.srv);
  Object.assign(b.srv.actor(j.you), { x: 4560, y: 1400, lastCombat: -99, dead: false, hp: 1 });
  b.srv.hub.zoneRooms.values().next().value.players.get(j.you).portalCd = 0;
  b.srv.step(2);
  const ex = await b.c.waitFor((m) => m.t === 'zone_exit');
  assert.equal(ex.to, 'harbor'); assert.equal(ex.x, 110); assert.equal(ex.y, 780);
  await closeAll(b.srv, b.c);
});
