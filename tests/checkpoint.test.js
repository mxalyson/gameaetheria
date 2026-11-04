import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHOENIX, applyDeath, setCheckpoint, respawnPoint, hasDeathPenalty, checkpointsOf } from '../public/src/core/phoenix.js';
import { applyZoneBatch } from '../public/src/core/rewards.js';
import { validate } from '../public/src/core/savedoc.js';
import { runTx, placeProblem, TxError } from '../server/tx.js';
import { checkSave } from '../server/plausible.js';
import { newOfficialCharacter } from '../server/api.js';
import { parseClientMessage, PROTOCOL_VERSION } from '../public/src/core/protocol.js';
import { ZONES } from '../public/src/data/zones.js';
import { buildLayout } from '../public/src/game/layout.js';
import { makeRng } from '../public/src/core/rng.js';

const FARM = ['forest', 'plains', 'ruins', 'glacier', 'ember'];
const doc = () => { const d = newOfficialCharacter('Fenix', 'warrior'); d.gold = 2000; d.xp = 100; return d; };

test('pedras: 2 por zona de farm, dentro do mapa, longe de baús/portais e viram decoração + colisão no layout', () => {
  for (const id of FARM) {
    const z = ZONES[id], cps = checkpointsOf(id);
    assert.equal(cps.length, 2, id);
    const lay = buildLayout(id);
    for (const c of cps) {
      assert.ok(c.x > 100 && c.x < z.w - 100 && c.y > 100 && c.y < z.h - 100, id + ' dentro do mapa');
      for (const ch of z.chests) assert.ok(Math.hypot(ch.x - c.x, ch.y - c.y) > 100, `${id}: longe do baú ${ch.id}`);
      for (const p of z.portals) assert.ok(Math.hypot(p.x - c.x, p.y - c.y) > 200, id + ' longe do portal');
      assert.ok(lay.decor.some((d) => d.cp === c.id), id + ' decoração');
      assert.ok(lay.obstacles.some((o) => o.x === c.x && o.y === c.y), id + ' colisão');
      assert.ok(!lay.rivers.some((rv) => Math.abs(c.x - rv.x) < rv.amp + rv.w), id + ' fora dos rios');
      assert.ok(!lay.camps.some((k) => Math.hypot(k.x - c.x, k.y - c.y) < k.r + 40), id + ' fora dos acampamentos');
    }
  }
});

test('applyDeath: sem amuleto perde 10% do ouro e 10% do XP do nível; com amuleto gasta 1 e nada perde', () => {
  const c = doc(); const lvl = c.level;
  const r = applyDeath(c);
  assert.deepEqual([r.saved, r.gold, r.xp], [false, 200, 10]);
  assert.equal(c.gold, 1800); assert.equal(c.xp, 90); assert.equal(c.level, lvl);
  c.phoenix = 2;
  const s = applyDeath(c);
  assert.deepEqual([s.saved, s.gold, s.xp, c.phoenix, c.gold, c.xp], [true, 0, 0, 1, 1800, 90]);
  c.xp = 0; c.gold = 0; assert.deepEqual(applyDeath(Object.assign(c, { phoenix: 0 })), { saved: false, gold: 0, xp: 0 });
});

test('applyZoneBatch: quedas gastam amuletos primeiro; Cripta e arenas não cobram', () => {
  const d = doc(); d.phoenix = 1;
  const out = applyZoneBatch(d, { xp: 0, gold: 0, kills: [], zoneId: 'forest', deaths: 2 });
  assert.equal(out.summary.deathsSaved, 1); assert.equal(out.doc.phoenix, 0); assert.equal(out.summary.lostGold, 200); assert.equal(out.doc.gold, 1800);
  const crypt = applyZoneBatch(Object.assign(doc(), { phoenix: 1 }), { zoneId: 'crypt', deaths: 3, kills: [] });
  assert.equal(crypt.doc.gold, 2000); assert.equal(crypt.doc.phoenix, 1, 'amuleto não é gasto na Cripta');
  assert.equal(hasDeathPenalty('crypt'), false); assert.equal(hasDeathPenalty('town'), false); assert.equal(hasDeathPenalty('arena'), false); assert.equal(hasDeathPenalty('ember'), true);
});

test('documento: phoenix limitado a 20 e checkpoint só vale se for uma pedra real', () => {
  const d = doc(); d.phoenix = 999; d.checkpoint = { zone: 'forest', x: 1, y: 2 };
  const v = validate(d); assert.ok(v.ok);
  assert.equal(v.char.phoenix, PHOENIX.max); assert.equal(v.char.checkpoint, undefined);
  const s = checkpointsOf('plains')[1]; d.checkpoint = { zone: 'plains', x: s.x, y: s.y };
  assert.deepEqual(validate(d).char.checkpoint, { zone: 'plains', x: s.x, y: s.y });
  assert.equal(validate(newOfficialCharacter('A', 'mage')).char.phoenix, 0, 'documento antigo: 0');
});

test('respawnPoint: pedra da própria zona, senão a entrada; nunca pedra de outra zona', () => {
  const c = doc(), entry = { x: 110, y: 1400 };
  assert.equal(respawnPoint(c, 'forest', entry).saved, false);
  setCheckpoint(c, 'forest', 'forest:cp2');
  const p = respawnPoint(c, 'forest', entry), st = checkpointsOf('forest')[1];
  assert.deepEqual([p.x, p.y, p.saved], [st.x, st.y + PHOENIX.below, true]);
  assert.deepEqual(respawnPoint(c, 'plains', entry), { ...entry, saved: false });
  assert.equal(setCheckpoint(c, 'forest', 'plains:cp1'), null);
});

test('tx buy_phoenix: preço fixo, teto 20, ouro; só nas lojas; protocolo valida n', () => {
  const d = doc();
  const r = runTx(d, { op: 'buy_phoenix', n: 2 }, { rng: makeRng(1) });
  assert.equal(r.doc.phoenix, 2); assert.equal(r.doc.gold, 2000 - 1600);
  assert.throws(() => runTx(r.doc, { op: 'buy_phoenix', n: 1 }, { rng: makeRng(1) }), TxError, 'ouro insuficiente');
  const rich = Object.assign(doc(), { gold: 1e6, phoenix: 19 });
  assert.throws(() => runTx(rich, { op: 'buy_phoenix', n: 2 }, { rng: makeRng(1) }), /máximo/);
  assert.equal(placeProblem('buy_phoenix', { inZone: true }), 'not_here');
  assert.equal(placeProblem('buy_phoenix', { inZone: false, hubAt: 'harbor', shop: 'harbor' }), null);
  const P = (o) => parseClientMessage({ v: PROTOCOL_VERSION, t: 'tx', ...o });
  assert.ok(P({ op: 'buy_phoenix', n: 3, shop: 'harbor' }).ok); assert.equal(P({ op: 'buy_phoenix', n: 21 }).ok, false);
  assert.ok(P({ op: 'checkpoint_set', id: 'forest:cp1' }).ok); assert.equal(P({ op: 'checkpoint_set' }).ok, false);
  assert.ok(parseClientMessage({ v: PROTOCOL_VERSION, t: 'zone_respawn' }).ok);
});

test('tx checkpoint_set: ator perto da pedra da sala, vivo; longe/morto/outra pedra recusa; só dentro da instância', () => {
  const st = checkpointsOf('forest')[0], zone = ZONES.forest;
  const room = { zoneId: 'forest', world: { zone } };
  const at = (x, y, dead = false) => ({ room, player: { actor: { x, y, dead } }, rng: makeRng(1) });
  const r = runTx(doc(), { op: 'checkpoint_set', id: st.id }, at(st.x + 40, st.y));
  assert.deepEqual(r.doc.checkpoint, { zone: 'forest', x: st.x, y: st.y });
  assert.throws(() => runTx(doc(), { op: 'checkpoint_set', id: st.id }, at(st.x + 400, st.y)), /perto/);
  assert.throws(() => runTx(doc(), { op: 'checkpoint_set', id: st.id }, at(st.x, st.y, true)), /caído/);
  assert.throws(() => runTx(doc(), { op: 'checkpoint_set', id: 'plains:cp1' }, at(st.x, st.y)), /inexistente/);
  assert.equal(placeProblem('checkpoint_set', { inZone: false }), 'not_here');
  assert.equal(placeProblem('checkpoint_set', { inZone: true }), null);
});

test('plausibilidade: amuleto e pedra forjados são desfeitos (estrito: só a transação)', () => {
  const old = doc(); old.phoenix = 1;
  const forged = structuredClone(old); forged.phoenix = 15; const st = checkpointsOf('forest')[0]; forged.checkpoint = { zone: 'forest', x: st.x, y: st.y };
  const s = checkSave(old, forged, Date.now(), { strictPve: true });
  assert.ok(s.ok); assert.equal(s.doc.phoenix, 1); assert.equal(s.doc.checkpoint, undefined);
  const l = checkSave(old, forged, Date.now());
  assert.ok(l.ok); assert.equal(l.doc.phoenix, 1, 'sem pagar o preço em ouro não sobe'); assert.deepEqual(l.doc.checkpoint, { zone: 'forest', x: st.x, y: st.y });
  const paid = structuredClone(old); paid.gold -= PHOENIX.price * 2; paid.phoenix = 3;
  assert.equal(checkSave(old, paid, Date.now()).doc.phoenix, 3);
  assert.equal(checkSave(old, paid, Date.now(), { strictPve: true }).doc.phoenix, 1);
});

// ---- instância do servidor (sala real): Amuleto da Fênix e Pedra de Retorno ----
import { openDb } from '../server/db.js';
import { createGameServer } from '../server/game-server.js';
import { connect, closeAll } from './helpers/net.js';

async function zoneSetup(patch) {
  const db = openDb(':memory:');
  const srv = createGameServer({ port: 0, host: '127.0.0.1', autoTick: false, db, allowGuests: false });
  await srv.ready;
  const acc = db.createAccount({ email: 'fx@t.t', pwHash: 'x' });
  const d = newOfficialCharacter('Fenix', 'warrior'); patch(d);
  const ch = db.createCharacter(acc, d.name, d.classId, d);
  const c = await connect(srv);
  c.send({ t: 'hello', session: db.createSession(acc), characterId: ch });
  await c.waitFor((m) => m.t === 'welcome');
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  return { db, srv, c, ch, j, room: srv.hub.zoneRooms.values().next().value, me: srv.actor(j.you) };
}
const fall = (room, me) => { me.x = 900; me.y = 900; me.hp = 0; me.dead = true; me.deadT = 0; room.onPlayerDeath(me); };

test('servidor: cair com Amuleto gasta 1 e não perde nada; renasce na Pedra de Retorno salva', async () => {
  const st = checkpointsOf('forest')[1];
  const { db, srv, c, ch, room, me } = await zoneSetup((d) => { d.gold = 1000; d.xp = 100; d.phoenix = 2; d.checkpoint = { zone: 'forest', x: st.x, y: st.y }; });
  fall(room, me);
  const rw = await c.waitFor((m) => m.t === 'zone_reward' && m.deaths === 1);
  assert.equal(rw.deathsSaved, 1); assert.equal(rw.lostGold, 0); assert.equal(rw.lostXp, 0); assert.equal(rw.phoenix, 1);
  const doc = db.character(ch).doc;
  assert.deepEqual([doc.gold, doc.xp, doc.phoenix], [1000, 100, 1]);
  srv.step(60 * 4 + 5);
  assert.equal(me.dead, false); assert.ok(Math.hypot(me.x - st.x, me.y - (st.y + PHOENIX.below)) < 5, 'renasceu na pedra');
  await closeAll(srv, c);
});

test('servidor: sem Amuleto perde 10% do ouro e do XP, e o botão de renascer só vale depois de 1,5 s', async () => {
  const { db, srv, c, ch, room, me } = await zoneSetup((d) => { d.gold = 1000; d.xp = 100; });
  fall(room, me);
  const rw = await c.waitFor((m) => m.t === 'zone_reward' && m.deaths === 1);
  assert.deepEqual([rw.deathsSaved, rw.lostGold, rw.lostXp], [0, 100, 10]);
  const doc = db.character(ch).doc;
  assert.deepEqual([doc.gold, doc.xp], [900, 90]);
  c.send({ t: 'zone_respawn' }); await new Promise((r) => setTimeout(r, 60)); srv.step(10);
  assert.equal(me.dead, true, 'cedo demais: continua caído');
  srv.step(60 * 2);
  c.send({ t: 'zone_respawn' }); await new Promise((r) => setTimeout(r, 60)); srv.step(5);
  assert.equal(me.dead, false, 'o botão antecipa o renascimento');
  assert.ok(Math.hypot(me.x - 110, me.y - 1400) < 5, 'sem pedra: na entrada');
  await closeAll(srv, c);
});
