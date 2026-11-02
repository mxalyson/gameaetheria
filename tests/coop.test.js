import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createGameServer } from '../server/game-server.js';
import { newOfficialCharacter } from '../server/api.js';
import { COOP_WAVES } from '../server/coop.js';
import { COOP_WAIT } from '../server/hub.js';
import { coopRewardPlan, COOP, WAVES } from '../public/src/core/economy.js';
import { xpToNext } from '../public/src/core/progression.js';
import { INVENTORY_SIZE } from '../public/src/data/items.js';
import { connect, closeAll } from './helpers/net.js';

// Cooperativo (PvE no servidor): ondas + chefe; XP, ouro e loot decididos e gravados pelo servidor.
function world(levels = [10]) {
  const db = openDb(':memory:');
  const chars = levels.map((level, i) => {
    const acc = db.createAccount({ email: `c${i}@x.com`, pwHash: 'x' });
    const doc = { ...newOfficialCharacter(`Coop${i}`, ['warrior', 'mage', 'archer', 'cleric'][i % 4]), level };
    return { session: db.createSession(acc), charId: db.createCharacter(acc, doc.name, doc.classId, doc), doc };
  });
  return { db, chars };
}
async function start(db, opts = {}) { const srv = createGameServer({ port: 0, autoTick: false, db, maxMsgPerSec: 100000, ...opts }); await srv.ready; return srv; }
async function enter(srv, who) { const c = await connect(srv); c.send({ t: 'hello', session: who.session, characterId: who.charId }); c.welcome = await c.waitFor((m) => m.t === 'welcome'); return c; }
async function coop(srv, chars) {
  const cs = [];
  for (const w of chars) cs.push(await enter(srv, w));
  for (const c of cs) c.send({ t: 'queue', mode: 'coop' });
  await Promise.all(cs.map((c) => c.sync()));
  srv.step(chars.length >= 4 ? 31 : 60 * (COOP_WAIT + 1));
  const found = await Promise.all(cs.map((c) => c.waitFor((m) => m.t === 'match_found')));
  return { cs, found, room: srv.room };
}
// "Mata" todos os monstros vivos usando o servidor (atalho de teste: o dano passa pela regra normal de dano do mundo).
function clearMobs(room) { const p = [...room.players.values()].find((x) => !x.left && !x.actor.dead)?.actor; for (const m of room.mobs()) if (!m.dead) room.world.damage(p, m, 9999); }
// Mobs mais fortes (ver docs/gameplay/dificuldade.md): quem fica parado de propósito nos testes não pode morrer antes do que o teste quer medir.
function stepAlive(srv, room, n) { for (let i = 0; i < n; i++) { srv.step(1); for (const p of room.players.values()) if (p.actor && !p.left) { p.actor.hp = p.actor.maxHp; p.actor.dead = false; } } }

function playToEnd(srv, room, { max = 60 * 400 } = {}) {
  let g = 0;
  while (room.state !== 'over' && g++ < max) { if (room.state === 'fight' && room.wave.state === 'fight') clearMobs(room); srv.step(1); }
}

test('cooperativo: um jogador sozinho começa depois da espera e enfrenta ondas de monstros do servidor', async () => {
  const { db, chars } = world([10]);
  const srv = await start(db);
  const { cs, found, room } = await coop(srv, chars);
  assert.equal(found[0].mode, 'coop'); assert.equal(found[0].objective, null);
  assert.equal(srv.hub.rooms.size, 1);
  srv.step(60 * 4 + 60 * 4); // contagem + descanso inicial
  await cs[0].sync();
  assert.equal(room.state, 'fight'); assert.equal(room.wave.n, 1);
  const snap = cs[0].last('snap');
  assert.equal(snap.mode, 'coop'); assert.equal(snap.coop.wave, 1); assert.equal(snap.coop.total, COOP_WAVES);
  assert.ok(snap.mobs.length >= 1, 'monstros na onda 1');
  assert.ok(snap.mobs.every((m) => m.mob && m.maxHp > 0 && !m.boss));
  await closeAll(srv, ...cs);
});

test('quatro jogadores começam na hora; mais jogadores = mais monstros e mais vida por monstro', async () => {
  const { db, chars } = world([10, 10, 10, 10]);
  const srv = await start(db);
  const { cs, room } = await coop(srv, chars);
  assert.equal(room.players.size, 4);
  srv.step(60 * 8);
  const mobs = room.mobs();
  assert.equal(mobs.length, WAVES.coop.base + Math.floor(WAVES.coop.perWave) + WAVES.coop.extraPerPlayer * 3, 'onda 1 com 4 jogadores: base + por onda + extra por jogador extra');
  const solo = world([10]); const s2 = await start(solo.db);
  const r2 = await coop(s2, solo.chars); s2.step(60 * 8);
  assert.ok(mobs[0].maxHp > r2.room.mobs()[0].maxHp * 1.5, 'vida dos monstros cresce com o grupo');
  await closeAll(srv, ...cs); await closeAll(s2, ...r2.cs);
});

test('vitória: 5 ondas, chefe na última; o servidor grava ouro, XP, itens e poções, uma vez só', async () => {
  const { db, chars } = world([10, 12]);
  const srv = await start(db);
  const { cs, room } = await coop(srv, chars);
  const seen = new Set(); let bossSeen = false;
  let g = 0;
  while (room.state !== 'over' && g++ < 60 * 600) {
    if (room.state === 'fight' && room.wave.state === 'fight') { seen.add(room.wave.n); if (room.mobs().some((m) => m.boss && !m.dead)) bossSeen = true; clearMobs(room); }
    srv.step(1);
  }
  assert.equal(room.state, 'over'); assert.equal(room.winner, 1); assert.equal(room.reason, 'boss');
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5]); assert.ok(bossSeen, 'o chefe apareceu na onda 5');
  srv.step(6); await Promise.all(cs.map((c) => c.sync()));
  const avg = Math.round((10 + 12) / 2);
  const plan = coopRewardPlan({ level: avg, crew: 2, wavesCleared: COOP_WAVES, bossDown: true, poolXp: 1e9 });
  const goldExpected = plan.gold;
  for (let i = 0; i < 2; i++) {
    const d = db.character(chars[i].charId).doc, before = chars[i].doc;
    assert.ok(d.gold >= before.gold + goldExpected, 'ouro das ondas (mais itens convertidos, se houver)');
    assert.ok(d.xp > before.xp || d.level > before.level, 'XP');
    assert.ok(d.inventory.length >= 1, 'loot do chefe');
    assert.ok(d.inventory.every((it) => /^i[\w-]{12}/.test(it.id)), 'ids de item emitidos pelo servidor');
    assert.equal(d.potions, before.potions + 3);
    assert.equal(d.arena.rating, 1000, 'cooperativo não mexe no rating');
    const rw = await cs[i].waitFor((m) => m.t === 'reward');
    assert.ok(rw.xp > 0 && rw.xp <= Math.round(xpToNext(avg) * COOP.xpCapPct * (1 + COOP.groupBonus)) + 1, 'XP respeita o teto da economia: ' + rw.xp);
    assert.equal(rw.mode, 'coop'); assert.equal(rw.won, true); assert.equal(rw.waves, COOP_WAVES); assert.ok(rw.items >= 1);
  }
  assert.equal(db.raw.prepare("select count(*) n from operations where kind = 'coop'").get().n, 2);
  assert.equal(db.audits('coop_reward').length, 2);
  // fim duplicado não paga de novo
  room.end('victory', 'boss');
  assert.equal(db.raw.prepare("select count(*) n from operations where kind = 'coop'").get().n, 2);
  assert.equal(db.audits('coop_reward').length, 2);
  await closeAll(srv, ...cs);
});

test('derrota: todos caem; recebe só o que foi conquistado (sem loot do chefe)', async () => {
  const { db, chars } = world([10]);
  const srv = await start(db);
  const { cs, room } = await coop(srv, chars);
  srv.step(60 * 8);
  clearMobs(room); srv.step(60 * 6); // onda 1 vencida, onda 2 começa
  const me = [...room.players.values()][0].actor;
  room.world.damage(room.mobs()[0], me, 1e6); // o monstro derruba o jogador
  srv.step(5);
  assert.equal(room.state, 'over'); assert.equal(room.winner, 0); assert.equal(room.reason, 'wipe');
  srv.step(6); await cs[0].sync();
  const d = db.character(chars[0].charId).doc;
  assert.ok(d.gold > chars[0].doc.gold, 'ouro da onda 1');
  assert.equal(d.inventory.length, 0, 'sem chefe, sem loot');
  const rw = await cs[0].waitFor((m) => m.t === 'reward');
  assert.equal(rw.won, false); assert.equal(rw.waves, 1);
  await closeAll(srv, ...cs);
});

test('quem cai durante as ondas volta na próxima com metade da vida', async () => {
  const { db, chars } = world([10, 10]);
  const srv = await start(db);
  const { cs, room } = await coop(srv, chars);
  srv.step(60 * 8);
  const [p1, p2] = [...room.players.values()];
  room.world.damage(room.mobs()[0], p2.actor, 1e6);
  assert.equal(p2.actor.dead, true);
  clearMobs(room); srv.step(60 * 6);
  assert.equal(room.wave.n >= 2 && p2.actor.dead, false, 'reviveu ao começar a onda');
  assert.ok(p2.actor.hp > 0 && p2.actor.hp <= p2.actor.maxHp * 0.6 + 1);
  assert.equal(room.state, 'fight'); void p1;
  await closeAll(srv, ...cs);
});

test('abandono: quem sai não recebe nada, quem fica recebe; ninguém é punido', async () => {
  const { db, chars } = world([10, 10]);
  const srv = await start(db, { reconnectSec: 2 });
  const { cs, room } = await coop(srv, chars);
  stepAlive(srv, room, 60 * 8);
  cs[1].ws.terminate(); await new Promise((r) => setTimeout(r, 50));
  stepAlive(srv, room, 60 * 3);
  const left = [...room.players.values()].find((p) => p.charId === chars[1].charId);
  assert.equal(left.left, true);
  assert.equal(room.world.actors.includes(left.actor), false, 'o personagem sai do mundo');
  playToEnd(srv, room);
  srv.step(6);
  assert.equal(room.winner, 1);
  assert.equal(db.character(chars[1].charId).doc.gold, chars[1].doc.gold, 'quem saiu não ganha nada');
  assert.ok(db.character(chars[0].charId).doc.gold > chars[0].doc.gold);
  assert.equal(db.character(chars[1].charId).doc.arena.losses, 0, 'e não leva derrota');
  await closeAll(srv, ...cs);
});

test('inventário cheio: o item do chefe vira ouro (nada se perde, nada passa do limite)', async () => {
  const { db, chars } = world([10]);
  const full = structuredClone(chars[0].doc);
  const tpl = Object.values(full.equipment)[0];
  full.inventory = Array.from({ length: INVENTORY_SIZE }, (_, i) => ({ ...tpl, id: 'x' + String(i).padStart(10, '0') }));
  db.raw.prepare('update characters set doc = ? where id = ?').run(JSON.stringify(full), chars[0].charId);
  const srv = await start(db);
  const { cs, room } = await coop(srv, chars);
  playToEnd(srv, room); srv.step(6); await cs[0].sync();
  const d = db.character(chars[0].charId).doc;
  assert.equal(d.inventory.length, INVENTORY_SIZE);
  const rw = await cs[0].waitFor((m) => m.t === 'reward');
  assert.ok(rw.converted >= 1 && rw.items === 0);
  await closeAll(srv, ...cs);
});

test('fila cooperativa respeita a diferença de nível; grupo entra junto', async () => {
  const { db, chars } = world([5, 28]);
  const srv = await start(db);
  const cs = [await enter(srv, chars[0]), await enter(srv, chars[1])];
  for (const c of cs) c.send({ t: 'queue', mode: 'coop' });
  await Promise.all(cs.map((c) => c.sync()));
  srv.step(60 * (COOP_WAIT + 1));
  assert.equal(srv.hub.rooms.size, 2, 'níveis 5 e 28 não jogam na mesma sala (cada um em uma)');
  await closeAll(srv, ...cs);
  const w2 = world([10, 10]); const s2 = await start(w2.db);
  const [a, b] = [await enter(s2, w2.chars[0]), await enter(s2, w2.chars[1])];
  a.send({ t: 'party_invite', name: b.welcome.name }); await Promise.all([a.sync(), b.sync()]);
  b.send({ t: 'party_accept', partyId: b.last('invite').partyId }); await Promise.all([a.sync(), b.sync()]);
  a.send({ t: 'queue', mode: 'coop' }); await Promise.all([a.sync(), b.sync()]);
  s2.step(60 * (COOP_WAIT + 1));
  assert.equal(s2.hub.rooms.size, 1); assert.equal(s2.room.players.size, 2);
  await closeAll(s2, a, b);
});

test('snapshot cooperativo tem monstros e onda; tamanho medido', async () => {
  const { db, chars } = world([10, 10, 10, 10]);
  const srv = await start(db);
  const { cs, room } = await coop(srv, chars);
  srv.step(60 * 9); await Promise.all(cs.map((c) => c.sync()));
  const bytes = room.bytes;
  console.log(`# medição: snapshot cooperativo (4 jogadores + ${room.mobs().length} monstros) = ${bytes} bytes ≈ ${(bytes * 20 / 1024).toFixed(1)} KB/s por jogador a 20 Hz`);
  assert.ok(bytes < 7000, `snapshot grande demais: ${bytes}`);
  await closeAll(srv, ...cs);
});
