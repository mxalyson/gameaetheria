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

test('correr: o servidor aplica +30% quando o cliente pede e está fora de combate; em combate o pedido é ignorado', async () => {
  const andar = async (extra, prep) => {
    const { srv, players } = await setup(1);
    const { c } = players[0];
    c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
    const j = await c.waitFor((m) => m.t === 'zone_joined');
    const room = srv.hub.zoneRooms.values().next().value;
    const a = srv.actor(j.you); a.hp = a.maxHp = 1e9;
    for (const m of room.mobs()) { m.x = 9999; m.y = 9999; m.dead = true; } // sem monstros por perto: só a regra de correr
    if (prep) prep(a, room);
    c.send(input(1, 1, 0, extra)); await c.sync(); srv.step(5); // a chegada do input varia em ticks: mede só uma janela fixa depois dela
    const x0 = a.x; srv.step(30);
    const d = (a.x - x0) / a.speedMul; await closeAll(srv, c); return d;
  };
  const walk = await andar({}), run = await andar({ run: true });
  assert.ok(walk > 20, `andou (${walk.toFixed(0)})`);
  assert.ok(Math.abs(run / walk - 1.3) < 0.1, `razão ${(run / walk).toFixed(3)}`);
  const emCombate = await andar({ run: true }, (a, room) => { a.lastCombat = room.world.time; });
  assert.ok(Math.abs(emCombate / walk - 1) < 0.1, 'em combate: sem bônus');
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

// ---------- ritual do chefe final no HUD online ----------
import { ZoneRoom } from '../server/zone.js';
import { SnapshotDecoder } from '../public/src/core/snapshot.js';
import { KEYFRAME_EVERY } from '../public/src/core/snapshot.js';

test('ritual: o servidor informa o progresso (rt) só quando muda e em todo quadro-chave; zona sem ritual não envia', () => {
  const mk = (zoneId) => {
    const log = [];
    const room = new ZoneRoom({ id: 1, key: 'k', zoneId, seed: 5, send: { stats: { staleInputs: 0 }, to() {}, raw: (s, t) => log.push(JSON.parse(t)) } });
    const sess = { ws: {}, room: null, player: null, char: newOfficialCharacter('R', 'warrior'), name: 'R', charId: null, accountId: null };
    room.join(sess, { x: 200, y: 1400 });
    return { room, log, sess };
  };
  const { room, log, sess } = mk('ember');
  room.bossState.progress = 7; // 7/40
  room.broadcast();
  assert.deepEqual(log.at(-1).rt, [7, 40, 0, 0, 0]);
  room.broadcast(); // delta sem mudança: não repete
  assert.equal(log.at(-1).rt, undefined);
  room.bossState.progress = 8;
  room.broadcast();
  assert.deepEqual(log.at(-1).rt.slice(0, 2), [8, 40]);
  room.bossState.omenT = 3; room.broadcast();
  assert.equal(log.at(-1).rt[3], 1, 'presságio');
  room.bossState.omenT = 0;
  room.bossState.coolUntil = room.world.clock() + 1200; room.broadcast();
  assert.equal(log.at(-1).rt[2], 20, 'recarga em minutos');
  // quadro-chave periódico repete o campo
  let sawKey = false;
  for (let i = 0; i < KEYFRAME_EVERY + 2; i++) { room.broadcast(); const m = log.at(-1); if (m.k === 1) { sawKey = true; assert.ok(m.rt, 'quadro-chave leva rt'); } }
  assert.ok(sawKey);
  // quem reconecta recebe o quadro-chave com rt
  log.length = 0; sess.log = log; room.sendKeyframe(sess);
  assert.ok(log.at(-1).rt);
  // o decodificador do cliente repassa `rt`
  const dec = new SnapshotDecoder(); dec.you = sess.player.actor.id;
  assert.deepEqual(dec.apply(log.at(-1)).rt, log.at(-1).rt);
  // zona com chefe por tempo (sem ritual) não envia rt
  const f = mk('forest'); f.room.broadcast();
  assert.equal(f.log.at(-1).rt, undefined);
});

// ---------- rodada: chefe na rede, esbirros, Maestria na hora ----------
import { makeMobActor } from '../public/src/game/sim.js';

test('chefe: boss_warn e phase do mundo da sala viram eventos do snapshot (cliente online mostra o aviso e a fúria)', async () => {
  const { srv, players } = await setup(1);
  const { c } = players[0];
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  await c.waitFor((m) => m.t === 'zone_joined');
  const room = srv.hub.zoneRooms.values().next().value;
  const boss = room.mobs()[0];
  room.world.events.push({ type: 'boss_warn', stage: 'omen', mobId: 'x', name: 'Chefe Teste', x: 10.2, y: 20.7, t: 0 }, { type: 'phase', actor: boss, phase: 3, t: 0 });
  srv.step(6);
  const evs = (await c.waitFor((m) => m.t === 'snap' && (m.events ?? []).some((e) => e.e === 'phase'))).events;
  assert.deepEqual(evs.find((e) => e.e === 'boss_warn'), { e: 'boss_warn', stage: 'omen', name: 'Chefe Teste', x: 10, y: 21 });
  assert.deepEqual(evs.find((e) => e.e === 'phase'), { e: 'phase', actor: boss.id, phase: 3 });
  await closeAll(srv, c);
});

test('esbirros de chefe (summoned): sem XP, sem loot e SEM abate (não contam para missão/conquista); mob comum conta', async () => {
  const { srv, players } = await setup(1);
  const { c } = players[0];
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  const room = srv.hub.zoneRooms.values().next().value, me = srv.actor(j.you), p = room.players.get(me.id);
  const minion = makeMobActor('slime', 3, me.x + 20, me.y, { summoned: true });
  room.onMobKilled(minion);
  assert.equal(p.pend.xp, 0); assert.equal(p.pend.kills.length, 0); assert.equal(p.pend.gold + p.pend.potions + p.pend.items.length + p.pend.essences.length, 0);
  const common = makeMobActor('slime', 3, me.x + 20, me.y);
  room.onMobKilled(common);
  assert.ok(p.pend.xp > 0); assert.equal(p.pend.kills.length, 1);
  await closeAll(srv, c);
});

test('Maestria: o ator da sala ganha a 4ª habilidade na hora que o documento a tem (transação ou lote), sem esperar o próximo lote', async () => {
  const { db, srv, players } = await setup(1);
  const { c, ch } = players[0];
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  const room = srv.hub.zoneRooms.values().next().value, me = srv.actor(j.you), p = room.players.get(me.id);
  assert.equal(!!me.mastery, false);
  const doc = structuredClone(db.character(ch).doc); doc.quests.done.maestria = Date.now();
  room.afterTx(p, { op: 'equip' }, doc); // qualquer transação aplicada com o jogador na sala sincroniza o ator
  assert.equal(me.mastery, true);
  // pelo lote: outro caminho que relê o documento oficial
  me.mastery = false;
  const row = db.character(ch); const d2 = structuredClone(row.doc); d2.quests.done.maestria = Date.now(); assert.ok(db.saveCharacter(ch, d2, row.rev));
  p.pend.skills.push('slash');
  room.flush(p);
  assert.equal(me.mastery, true);
  // e a transação de entrega da missão NÃO existe dentro da instância (o mestre fica na Vila): fica claro no servidor
  const { placeProblem } = await import('../server/tx.js');
  assert.equal(placeProblem('quest_turnin', { inZone: true }), 'not_here');
  await closeAll(srv, c);
});

// ---- Cripta dos Ecos (masmorra por instância, decisão 0017) ----
const prep = (db, ch, fn) => db.applyOperation('prep' + Math.random(), ch, 'test', (d) => { const x = structuredClone(d); fn(x); return { doc: x, summary: {} }; });

test('Cripta: o protocolo só aceita crypt_enter sem campos; a masmorra não é alcançável por portal nem teletransporte', async () => {
  const { parseClientMessage, PROTOCOL_VERSION } = await import('../public/src/core/protocol.js');
  const P = (o) => parseClientMessage({ v: PROTOCOL_VERSION, ...o });
  assert.deepEqual(P({ t: 'crypt_enter', zone: 'forest', extra: 1 }).msg, { t: 'crypt_enter' });
  assert.equal(P({ t: 'zone_enter', zone: 'crypt', from: 'town' }).ok, false);
  assert.equal(P({ t: 'zone_teleport', zone: 'crypt' }).ok, false);
  const { ZONES } = await import('../public/src/data/zones.js');
  assert.ok(!ZONES.crypt.mobs && !ZONES.crypt.hub, 'sem monstros soltos e não é cidade');
  assert.ok(!Object.values(ZONES).some((z) => z.hub && z.mobs), 'cidades continuam sem monstros');
});

test('Cripta: entrada conferida no servidor, portão, ondas, chefe de 2 fases com aviso, fragmentos, vitória, saída e espera de 20 min', async () => {
  const { PH } = await import('../server/crypt.js');
  const { CRYPT, CRYPT_GEOM: G } = await import('../public/src/data/crypt.js');
  const { srv, db, players } = await setup(1);
  const { c, ch } = players[0];
  c.send({ t: 'crypt_enter' });
  await c.waitFor((m) => m.t === 'reject' && m.code === 'crypt_level'); // nível 1
  prep(db, ch, (x) => { x.level = 25; x.visited = { ...x.visited }; delete x.visited.ruins; });
  c.send({ t: 'crypt_enter' });
  await c.waitFor((m) => m.t === 'reject' && m.code === 'crypt_locked'); // falta chegar às Ruínas
  prep(db, ch, (x) => { x.visited.ruins = 1; });
  c.send({ t: 'crypt_enter' });
  await c.waitFor((m) => m.t === 'reject' && m.code === 'crypt_locked'); // Guardião das Ruínas ainda de pé
  prep(db, ch, (x) => { x.quests.done.guardiao_das_ruinas = Date.now(); });
  c.send({ t: 'crypt_enter' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  assert.equal(j.zone, 'crypt'); assert.equal(j.x, G.starts[0]); assert.equal(j.w, G.w);
  assert.ok(db.character(ch).doc.echo.entry > 0, 'a entrada foi carimbada no documento oficial');
  const room = [...srv.hub.zoneRooms.values()].find((r) => r.zoneId === 'crypt');
  const p = [...room.players.values()][0], a = p.actor;
  const god = () => { a.maxHp = a.hp = 1e9; a.dead = false; };
  god();
  const kill = () => { for (const m of room.mobs()) if (!m.dead) room.world.damage(a, m, 1e8); };

  // salas 1–3: duas ondas curtas cada; o portão segura o herói antes do muro até a sala ser limpa
  for (let r = 0; r < 3; r++) {
    for (let w = 0; w < 2; w++) {
      srv.step(r === 0 && w === 0 ? 310 : 200); god();
      assert.equal(room.cr.phase, PH.FIGHT, `sala ${r + 1} onda ${w + 1}`);
      const mobs = room.mobs().filter((m) => !m.dead);
      assert.ok(mobs.length >= 4 && mobs.every((m) => m.level >= 25 && m.level <= 30 + CRYPT.rooms[r].lvlPlus), 'mobs no nível do herói (+sala)');
      assert.ok(mobs.every((m) => m.crypt && !m.boss));
      if (w === 0) { a.x = G.walls[r] + 200; srv.step(2); assert.ok(a.x <= G.walls[r], 'portão fechado: o herói não passa do muro'); god(); }
      kill(); srv.step(2);
    }
    assert.equal(room.cr.phase, PH.ADVANCE, `sala ${r + 1} limpa`);
    a.x = G.walls[r] + G.wallW + 100; srv.step(2); god();
  }
  assert.equal(room.cr.phase, PH.BOSS); assert.equal(room.cr.room, 3);
  const boss = room.bossMob;
  assert.ok(boss.boss && boss.mobId === 'echolord' && boss.level >= 28);
  // chefe: golpes em área com AVISO (telegraph), fase 2 abaixo de 50% com esbirros
  a.x = boss.x - 120; a.y = boss.y; srv.step(420); god(); await c.sync();
  assert.ok(c.msgs.some((m) => m.t === 'snap' && m.events?.some((e) => e.e === 'telegraph' && e.delay >= 1)), 'aviso do golpe em área');
  assert.equal(boss.phase, 1);
  boss.hp = boss.maxHp * 0.4; srv.step(900); god(); await c.sync();
  assert.equal(boss.phase, 2, 'fase 2');
  assert.ok(c.msgs.some((m) => m.t === 'snap' && m.events?.some((e) => e.e === 'phase' && e.phase === 2)));
  assert.ok(room.mobs().some((m) => m.summoned && m.mobId === 'echoshade'), 'esbirros na fase 2');
  kill(); srv.step(2);
  assert.equal(room.cr.phase, PH.VICTORY); assert.ok(room.cleared);

  // recompensas gravadas pelo servidor: fragmentos (3 salas + chefe), vitória contada, missão e conquista
  const doc = db.character(ch).doc;
  assert.ok(doc.echo.frags >= 2 + 2 + 3 + 8 && doc.echo.frags <= 3 + 4 + 4 + 12, 'fragmentos: ' + doc.echo.frags);
  assert.equal(doc.stats.cryptClears, 1); assert.ok(doc.achievements.cripta_vencida);
  assert.ok(doc.stats.bossKills >= 1);
  await c.sync();
  assert.equal(c.msgs.filter((m) => m.t === 'zone_reward').reduce((t, m) => t + (m.frags ?? 0), 0), doc.echo.frags, 'os resumos enviados somam os fragmentos gravados');

  // fim: a saída automática leva à Vila; nova entrada imediata é recusada (20 min) e uma Chave de Eco a libera
  srv.step(CRYPT.exitSec * 60 + 30);
  await c.waitFor((m) => m.t === 'zone_exit' && m.to === 'town');
  assert.ok(!srv.hub.zoneRooms.size, 'instância encerrada');
  c.send({ t: 'crypt_enter' });
  await c.waitFor((m) => m.t === 'reject' && m.code === 'crypt_wait');
  prep(db, ch, (x) => { x.echo.keys = 1; });
  c.send({ t: 'crypt_enter' });
  await c.waitFor((m) => m.t === 'zone_joined' && m.zone === 'crypt' && m !== j);
  assert.equal(db.character(ch).doc.echo.keys, 0, 'a Chave foi gasta na mesma operação da entrada');
  await closeAll(srv, c);
});

test('Cripta: 3 quedas por herói; na seguinte ele é levado para fora; sem monstros fora da instância', async () => {
  const { CRYPT } = await import('../public/src/data/crypt.js');
  const { srv, db, players } = await setup(1);
  const { c, ch } = players[0];
  prep(db, ch, (x) => { x.level = 22; x.visited = { ...(x.visited ?? {}), ruins: 1 }; x.quests.done.guardiao_das_ruinas = Date.now(); });
  c.send({ t: 'crypt_enter' });
  await c.waitFor((m) => m.t === 'zone_joined');
  const room = [...srv.hub.zoneRooms.values()].find((r) => r.zoneId === 'crypt');
  const a = [...room.players.values()][0].actor;
  srv.step(320);
  const mob = room.mobs().find((m) => !m.dead);
  let exited = false;
  for (let i = 0; i < CRYPT.maxDeaths + 1 && !exited; i++) {
    a.hp = 1; room.world.damage(mob, a, 1e9);
    srv.step(4 * 60 + 20); await c.sync();
    exited = c.msgs.some((m) => m.t === 'zone_exit');
    if (i < CRYPT.maxDeaths) assert.ok(!exited && !a.dead, `renasceu na queda ${i + 1}`);
  }
  assert.ok(exited, 'quarta queda: fora da masmorra');
  assert.equal(db.character(ch).doc.stats.cryptClears, 0, 'sem vitória');
  c.send({ t: 'crypt_enter' });
  await c.waitFor((m) => m.t === 'reject' && m.code === 'crypt_wait'); // fracasso não devolve a entrada
  await closeAll(srv, c);
});
