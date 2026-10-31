import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../server/game-server.js';
import { openDb } from '../server/db.js';
import { newOfficialCharacter } from '../server/api.js';
import { REJECT, MAX_PARTY } from '../public/src/core/protocol.js';
import { playerPower } from '../public/src/core/power.js';
import { connect, hello, input, closeAll } from './helpers/net.js';
import { BOT_FILL_AFTER, INVITE_TTL } from '../server/hub.js';

// Lobby: grupos (party) com convites, fila e matchmaking por rating + poder, salas 2×2 e 4×4, bots e isolamento entre salas.
async function start(opts = {}) { const srv = createGameServer({ port: 0, autoTick: false, maxMsgPerSec: 100000, ...opts }); await srv.ready; return srv; }
const CLASSES = ['warrior', 'mage', 'archer', 'cleric'];
async function player(srv, name, classId = 'warrior') {
  const c = await connect(srv);
  c.send(hello(name, classId));
  c.welcome = await c.waitFor((m) => m.t === 'welcome');
  c.name = c.welcome.name;
  return c;
}
async function players(srv, n, prefix = 'P') { const out = []; for (let i = 0; i < n; i++) out.push(await player(srv, `${prefix}${i + 1}`, CLASSES[i % 4])); return out; }
const sync = (...cs) => Promise.all(cs.map((c) => c.sync()));
const lastParty = (c) => c.last('party');
const partyNames = (c) => lastParty(c)?.members.map((m) => m.name).sort();
const rejects = (c) => c.all('reject').map((m) => m.code);

// ---------- grupos ----------
test('grupo: criar, convidar, aceitar; todos veem o mesmo grupo e o líder', async () => {
  const srv = await start();
  const [a, b, c] = await players(srv, 3);
  a.send({ t: 'party_invite', name: b.name }); await sync(a, b);
  const inv = b.last('invite');
  assert.equal(inv.from, a.name);
  assert.ok(a.msgs.some((m) => m.t === 'notice' && m.code === 'invite_sent' && m.name === b.name));
  b.send({ t: 'party_accept', partyId: inv.partyId }); await sync(a, b);
  assert.deepEqual(partyNames(a), [a.name, b.name].sort()); assert.deepEqual(partyNames(b), partyNames(a));
  assert.equal(lastParty(a).leader, a.name); assert.equal(lastParty(b).leader, a.name);
  a.send({ t: 'party_invite', name: c.name.toUpperCase() }); await sync(a, c); // nome sem diferenciar maiúsculas
  c.send({ t: 'party_accept', partyId: c.last('invite').partyId }); await sync(a, b, c);
  assert.equal(lastParty(c).members.length, 3);
  assert.equal(lastParty(a).members.length, 3);
  await closeAll(srv, a, b, c);
});

test('grupo: regras de convite (só o líder convida, sem autoconvite, sem inexistente, sem quem já tem grupo, limite de 4)', async () => {
  const srv = await start();
  const cs = await players(srv, 7);
  const [a, b, c, d, e, f, g] = cs;
  a.send({ t: 'party_invite', name: a.name }); await a.sync(); assert.ok(rejects(a).includes(REJECT.SELF));
  a.send({ t: 'party_invite', name: 'Fantasma' }); await a.sync(); assert.ok(rejects(a).includes(REJECT.NO_SUCH_PLAYER));
  a.send({ t: 'party_invite', name: b.name }); await sync(a, b);
  b.send({ t: 'party_accept', partyId: b.last('invite').partyId }); await sync(a, b);
  b.send({ t: 'party_invite', name: c.name }); await b.sync(); assert.ok(rejects(b).includes(REJECT.NOT_LEADER), 'membro comum não convida');
  c.send({ t: 'party_create' }); await c.sync();
  a.send({ t: 'party_invite', name: c.name }); await a.sync(); assert.ok(rejects(a).includes(REJECT.ALREADY_IN_PARTY), 'quem já tem grupo');
  c.send({ t: 'party_leave' }); await c.sync();
  for (const x of [c, d]) { a.send({ t: 'party_invite', name: x.name }); await sync(a, x); x.send({ t: 'party_accept', partyId: x.last('invite').partyId }); await sync(a, x); }
  assert.equal(lastParty(a).members.length, MAX_PARTY);
  a.send({ t: 'party_invite', name: e.name }); await a.sync(); assert.ok(rejects(a).includes(REJECT.PARTY_FULL));
  e.send({ t: 'party_accept', partyId: 999 }); await e.sync(); assert.ok(rejects(e).includes(REJECT.NO_INVITE), 'convite que não existe');
  void f; void g;
  await closeAll(srv, ...cs);
});

test('grupo: convite recusado, convite que expira e convite só vale uma vez', async () => {
  const srv = await start();
  const [a, b, c] = await players(srv, 3);
  a.send({ t: 'party_invite', name: b.name }); await sync(a, b);
  const id = b.last('invite').partyId;
  b.send({ t: 'party_decline', partyId: id }); await sync(a, b);
  assert.ok(a.msgs.some((m) => m.t === 'notice' && m.code === 'invite_declined'));
  b.send({ t: 'party_accept', partyId: id }); await b.sync(); assert.ok(rejects(b).includes(REJECT.NO_INVITE), 'convite recusado não vale mais');
  a.send({ t: 'party_invite', name: c.name }); await sync(a, c);
  srv.step(60 * (INVITE_TTL + 2));
  c.send({ t: 'party_accept', partyId: c.last('invite').partyId }); await c.sync();
  assert.ok(rejects(c).includes(REJECT.NO_INVITE), 'convite expirado');
  await closeAll(srv, a, b, c);
});

test('grupo: sair, expulsar, líder passa para outro e grupo de um só se desfaz', async () => {
  const srv = await start();
  const [a, b, c] = await players(srv, 3);
  for (const x of [b, c]) { a.send({ t: 'party_invite', name: x.name }); await sync(a, x); x.send({ t: 'party_accept', partyId: x.last('invite').partyId }); await sync(a, x); }
  b.send({ t: 'party_kick', name: c.name }); await b.sync(); assert.ok(rejects(b).includes(REJECT.NOT_LEADER));
  a.send({ t: 'party_kick', name: c.name }); await sync(a, b, c);
  assert.equal(lastParty(c).id, null); assert.equal(lastParty(c).why, 'kicked');
  assert.deepEqual(partyNames(a), [a.name, b.name].sort());
  a.send({ t: 'party_leave' }); await sync(a, b);
  assert.equal(lastParty(a).id, null);
  assert.equal(lastParty(b).id, null, 'sobrou um só: o grupo se desfaz');
  assert.equal(srv.hub.parties.size, 0);
  // líder sai de um grupo de 3: o próximo vira líder
  for (const x of [b, c]) { a.send({ t: 'party_invite', name: x.name }); await sync(a, x); x.send({ t: 'party_accept', partyId: x.last('invite').partyId }); await sync(a, x); }
  a.send({ t: 'party_leave' }); await sync(a, b, c);
  assert.equal(lastParty(b).leader, b.name);
  await closeAll(srv, a, b, c);
});

// ---------- fila e matchmaking ----------
test('2×2: quatro jogadores solo são juntados em duas equipes de dois, numa sala só', async () => {
  const srv = await start();
  const cs = await players(srv, 4);
  for (const c of cs) c.send({ t: 'queue', mode: '2v2' });
  await sync(...cs);
  assert.ok(cs.every((c) => c.last('queue').state === 'searching'));
  srv.step(31);
  const found = await Promise.all(cs.map((c) => c.waitFor((m) => m.t === 'match_found')));
  assert.equal(srv.hub.rooms.size, 1);
  assert.equal(new Set(found.map((f) => f.room)).size, 1);
  const teams = found.map((f) => f.team);
  assert.equal(teams.filter((t) => t === 1).length, 2); assert.equal(teams.filter((t) => t === 2).length, 2);
  assert.ok(found.every((f) => f.mode === '2v2' && f.players.length === 4 && f.players.every((p) => !p.bot)));
  assert.equal(srv.hub.queue.length, 0);
  await closeAll(srv, ...cs);
});

test('grupo entra na fila junto e fica no MESMO time; só o líder enfileira', async () => {
  const srv = await start();
  const [a, b, c, d] = await players(srv, 4);
  a.send({ t: 'party_invite', name: b.name }); await sync(a, b);
  b.send({ t: 'party_accept', partyId: b.last('invite').partyId }); await sync(a, b);
  b.send({ t: 'queue', mode: '2v2' }); await b.sync(); assert.ok(rejects(b).includes(REJECT.NOT_LEADER));
  a.send({ t: 'queue', mode: '2v2' }); c.send({ t: 'queue', mode: '2v2' }); d.send({ t: 'queue', mode: '2v2' }); await sync(a, b, c, d);
  assert.equal(b.last('queue').state, 'searching', 'o membro também vê que o grupo está na fila');
  srv.step(31);
  const fa = await a.waitFor((m) => m.t === 'match_found'), fb = await b.waitFor((m) => m.t === 'match_found');
  assert.equal(fa.team, fb.team, 'o grupo joga junto');
  assert.equal(fa.room, fb.room);
  await closeAll(srv, a, b, c, d);
});

test('grupo grande demais para o modo é recusado; mudar o grupo cancela a fila', async () => {
  const srv = await start();
  const cs = await players(srv, 4);
  const [a, b, c, d] = cs;
  for (const x of [b, c]) { a.send({ t: 'party_invite', name: x.name }); await sync(a, x); x.send({ t: 'party_accept', partyId: x.last('invite').partyId }); await sync(a, x); }
  a.send({ t: 'queue', mode: '2v2' }); await a.sync();
  assert.ok(rejects(a).includes(REJECT.PARTY_TOO_BIG), 'grupo de 3 não cabe em 2×2');
  a.send({ t: 'queue', mode: '4v4' }); await sync(a, b, c);
  assert.equal(srv.hub.queue.length, 1);
  a.send({ t: 'party_invite', name: d.name }); await a.sync();
  assert.ok(rejects(a).includes(REJECT.IN_MATCH), 'com o grupo na fila não se convida ninguém');
  c.send({ t: 'party_leave' }); await sync(a, b, c);
  assert.equal(srv.hub.queue.length, 0, 'alguém saiu do grupo: a fila é cancelada para todos');
  assert.equal(b.last('queue').state, 'cancelled');
  a.send({ t: 'queue', mode: '4v4' }); await a.sync(); a.send({ t: 'queue', mode: '4v4' }); await a.sync();
  assert.ok(rejects(a).includes(REJECT.ALREADY_QUEUED));
  await closeAll(srv, ...cs);
});

test('sair da fila, cair da conexão ou sair do grupo tiram o jogador da fila', async () => {
  const srv = await start();
  const [a, b] = await players(srv, 2);
  a.send({ t: 'queue', mode: '1v1' }); await a.sync();
  a.send({ t: 'queue_cancel' }); await a.sync();
  assert.equal(srv.hub.queue.length, 0); assert.equal(a.last('queue').state, 'cancelled');
  b.send({ t: 'queue', mode: '4v4' }); await b.sync();
  b.ws.terminate(); await new Promise((r) => setTimeout(r, 50));
  assert.equal(srv.hub.queue.length, 0, 'quem cai não fica "fantasma" na fila');
  await closeAll(srv, a, b);
});

test('sem adversários humanos, depois de 20 s a fila completa os dois times com bots de poder parecido', async () => {
  const srv = await start();
  const [a] = await players(srv, 1);
  a.send({ t: 'queue', mode: '2v2' }); await a.sync();
  srv.step(60 * (BOT_FILL_AFTER - 2));
  assert.equal(srv.hub.rooms.size, 0, 'ainda espera por humanos');
  srv.step(60 * 4);
  const f = await a.waitFor((m) => m.t === 'match_found');
  assert.equal(f.players.length, 4);
  assert.equal(f.players.filter((p) => p.bot).length, 3);
  const mine = f.players.find((p) => p.id === f.you);
  assert.equal(f.players.filter((p) => p.team === mine.team).length, 2); assert.equal(f.players.filter((p) => p.team !== mine.team).length, 2);
  const room = srv.room;
  const me = playerPower(srv.hub.sessionByToken(a.welcome.token).char);
  const bots = [...room.players.values()].filter((p) => p.bot);
  assert.equal(bots.length, 3);
  for (const p of bots) assert.ok(Math.abs(playerPower(p.doc) - me) <= me * 0.25, 'bot com poder parecido: ' + playerPower(p.doc) + ' vs ' + me);
  assert.equal(new Set(bots.filter((p) => p.team !== mine.team).map((p) => p.classId)).size, 2, 'classes distintas no mesmo time');
  assert.ok(srv.hub.stats.botFills >= 1);
  await closeAll(srv, a);
});

test('matchmaking respeita rating e poder: jogadores muito diferentes não se enfrentam (ganham bots)', async () => {
  const db = openDb(':memory:');
  const mk = (email, name, patch) => { const acc = db.createAccount({ email, pwHash: 'x' }); const doc = { ...newOfficialCharacter(name, 'warrior'), ...patch }; return { session: db.createSession(acc), charId: db.createCharacter(acc, doc.name, doc.classId, doc) }; };
  const A = mk('a@x.com', 'Alfa', { level: 10 }), B = mk('b@x.com', 'Beta', { level: 10 }), C = mk('c@x.com', 'Ceta', { level: 28 });
  B.charId = mk('b2@x.com', 'BetaRico', { level: 10, arena: { rating: 1900, wins: 0, losses: 0, bestWave: 0, ratings: {} } }).charId; // rating muito diferente
  const srv = await start({ db });
  const login = async (who) => { const c = await connect(srv); c.send({ t: 'hello', session: who.session, characterId: who.charId }); await c.waitFor((m) => m.t === 'welcome'); return c; };
  const a = await login(A);
  const accB = db.createAccount({ email: 'b3@x.com', pwHash: 'x' }); const sessB = db.createSession(accB);
  const doc2 = { ...newOfficialCharacter('Rico', 'mage'), level: 10, arena: { rating: 1900, wins: 0, losses: 0, bestWave: 0, ratings: {} } };
  const rico = { session: sessB, charId: db.createCharacter(accB, doc2.name, doc2.classId, doc2) };
  const b = await login(rico);
  const c = await login(C);
  for (const x of [a, b, c]) x.send({ t: 'queue', mode: '1v1' });
  await sync(a, b, c);
  srv.step(60 * 10);
  assert.equal(srv.hub.rooms.size, 0, 'rating 1000 × 1900 e nível 10 × 28 não combinam');
  assert.equal(srv.hub.queue.length, 3);
  srv.step(60 * 12); // 20 s: cada um recebe um bot
  assert.equal(srv.hub.rooms.size, 3);
  await sync(a, b, c);
  for (const m of [a, b, c]) assert.ok(m.last('match_found').players.some((p) => p.bot));
  await closeAll(srv, a, b, c);
});

test('4×4 com oito jogadores: duas equipes de quatro, snapshots só para quem está na sala, e o tamanho do snapshot é medido', async () => {
  const srv = await start();
  const cs = await players(srv, 8);
  for (const c of cs) c.send({ t: 'queue', mode: '4v4' });
  await sync(...cs);
  srv.step(31);
  const found = await Promise.all(cs.map((c) => c.waitFor((m) => m.t === 'match_found')));
  assert.equal(srv.hub.rooms.size, 1);
  assert.equal(found[0].players.length, 8);
  srv.step(60 * 4); await sync(...cs);
  const snap = cs[0].last('snap');
  assert.equal(snap.actors.length, 8); assert.equal(snap.state, 'fight'); assert.equal(snap.mode, '4v4');
  const bytes = srv.room.bytes;
  console.log(`# medição: snapshot 4×4 (8 atores) = ${bytes} bytes; a 20 Hz ≈ ${(bytes * 20 / 1024).toFixed(1)} KB/s por jogador`);
  assert.ok(bytes < 4500, `snapshot grande demais: ${bytes} bytes`);
  await closeAll(srv, ...cs);
});

test('isolamento: duas salas ao mesmo tempo não misturam jogadores, snapshots nem entradas', async () => {
  const srv = await start();
  const cs = await players(srv, 4, 'I');
  for (const c of cs) c.send({ t: 'queue', mode: '1v1' });
  await sync(...cs);
  srv.step(31);
  const found = await Promise.all(cs.map((c) => c.waitFor((m) => m.t === 'match_found')));
  assert.equal(srv.hub.rooms.size, 2);
  srv.step(60 * 4); await sync(...cs);
  const roomOf = (c, i) => found[i].room;
  for (let i = 0; i < 4; i++) {
    const s = cs[i].last('snap');
    assert.equal(s.room, roomOf(cs[i], i));
    const ids = new Set(found[i].players.map((p) => p.id));
    assert.ok(s.actors.every((a) => ids.has(a.id)), 'só enxerga quem é da própria sala');
    assert.equal(cs[i].all('snap').every((x) => x.room === found[i].room), true);
  }
  // a entrada de um jogador só mexe no ator dele
  const mine = srv.actor(found[0].you), other = srv.actor(found[2].you); const ox = other.x, oy = other.y;
  cs[0].send(input(1, 1, 0)); await cs[0].sync(); srv.step(30);
  assert.ok(mine.x > 900); assert.equal(other.x, ox); assert.equal(other.y, oy);
  await closeAll(srv, ...cs);
});

// ---------- regras da partida por times ----------
test('ponto de controle: o time que o segura pontua e vence por pontos; recompensa de 4×4 paga mais', async () => {
  const db = openDb(':memory:');
  const mk = (n) => { const acc = db.createAccount({ email: `${n}@x.com`, pwHash: 'x' }); const doc = { ...newOfficialCharacter(n, CLASSES[n.length % 4]), level: 10 }; return { session: db.createSession(acc), charId: db.createCharacter(acc, doc.name, doc.classId, doc), doc }; };
  const who = ['Aa', 'Bbb', 'Cccc', 'Dddddd', 'Eeeee', 'Fffffff', 'Gggg', 'Hhhhh'].map(mk);
  const srv = await start({ db });
  const cs = [];
  for (const w of who) { const c = await connect(srv); c.send({ t: 'hello', session: w.session, characterId: w.charId }); await c.waitFor((m) => m.t === 'welcome'); cs.push(c); }
  for (const c of cs) c.send({ t: 'queue', mode: '4v4' });
  await sync(...cs); srv.step(31);
  const found = await Promise.all(cs.map((c) => c.waitFor((m) => m.t === 'match_found')));
  const room = srv.room;
  srv.step(60 * 4);
  // o time 1 inteiro ocupa o ponto; o time 2 fica longe e parado
  for (const p of room.players.values()) { p.actor.x = p.team === 1 ? room.world.objective.x : 900; p.actor.y = p.team === 1 ? room.world.objective.y : 1500; }
  let guard = 0;
  while (room.state === 'fight' && guard++ < 60 * 80) { for (const p of room.players.values()) if (p.team === 1) { p.actor.x = room.world.objective.x; p.actor.y = room.world.objective.y; } srv.step(1); }
  assert.equal(room.state, 'over'); assert.equal(room.winner, 1); assert.equal(room.reason, 'score');
  assert.ok(room.match.score[1] >= 100 && room.match.score[2] === 0);
  const winner = found.findIndex((f) => f.team === 1), loser = found.findIndex((f) => f.team === 2);
  const dW = db.character(who[winner].charId).doc, dL = db.character(who[loser].charId).doc;
  assert.equal(dW.gold, who[winner].doc.gold + Math.round((40 + 80) * 1.6), '4×4 paga ×1,6');
  assert.equal(dL.gold, who[loser].doc.gold + Math.round((10 + 20) * 1.6));
  assert.equal(dW.arena.ratings['4v4'], 1016); assert.equal(dW.arena.rating, 1000, 'o rating 1×1 não é tocado');
  assert.equal(dL.arena.ratings['4v4'], 984);
  await closeAll(srv, ...cs);
});

test('fim do tempo: vence quem tem mais pontos; empate de pontos decide pela vida; tudo empatado = empate sem vencedor', async () => {
  const srv = await start();
  const [a, b] = await players(srv, 2);
  a.send({ t: 'queue', mode: '1v1' }); b.send({ t: 'queue', mode: '1v1' }); await sync(a, b); srv.step(31);
  const room = srv.room;
  srv.step(60 * 4);
  const [p1, p2] = [...room.players.values()];
  room.match.time = room.match.limit - 0.01; p2.actor.hp -= 50; // time 1 com mais vida
  srv.step(2);
  assert.equal(room.state, 'over'); assert.equal(room.winner, 1); assert.equal(room.reason, 'time');
  void p1;
  const srv2 = await start();
  const c = await player(srv2, 'Cc', 'warrior'), d = await player(srv2, 'Dd', 'warrior');
  c.send({ t: 'queue', mode: '1v1' }); d.send({ t: 'queue', mode: '1v1' }); await sync(c, d); srv2.step(31 + 60 * 4);
  for (const p of srv2.room.players.values()) { p.actor.maxHp = 500; p.actor.hp = 500; } // vida igual: empate total
  srv2.room.match.time = srv2.room.match.limit - 0.01;
  srv2.step(2);
  assert.equal(srv2.room.winner, 3); assert.equal(srv2.room.reason, 'draw');
  await closeAll(srv2, c, d); await closeAll(srv, a, b);
});

test('reconexão dentro de uma sala 2×2: o jogador volta ao time e ao grupo; depois do prazo um bot assume e o resto continua', async () => {
  const srv = await start({ reconnectSec: 5 });
  const cs = await players(srv, 4);
  const [a, b, c, d] = cs;
  a.send({ t: 'party_invite', name: b.name }); await sync(a, b); b.send({ t: 'party_accept', partyId: b.last('invite').partyId }); await sync(a, b);
  for (const x of [a, c, d]) x.send({ t: 'queue', mode: '2v2' });
  await sync(a, b, c, d); srv.step(31);
  const fb = await b.waitFor((m) => m.t === 'match_found');
  srv.step(60 * 4);
  b.ws.terminate(); await new Promise((r) => setTimeout(r, 50));
  srv.step(60 * 2); await a.sync();
  assert.equal(a.last('party').members.find((m) => m.name === b.name).online, false, 'o grupo vê quem caiu');
  const b2 = await connect(srv); b2.send(hello(b.name, 'warrior', { token: b.welcome.token }));
  const w2 = await b2.waitFor((m) => m.t === 'welcome'); assert.equal(w2.resumed, true);
  const f2 = await b2.waitFor((m) => m.t === 'match_found');
  assert.equal(f2.you, fb.you); assert.equal(f2.team, fb.team);
  await b2.sync(); assert.equal(b2.last('party').members.length, 2);
  // agora o c some e não volta
  c.ws.terminate(); await new Promise((r) => setTimeout(r, 50));
  srv.step(60 * 7); await a.sync();
  const pc = [...srv.room.players.values()].find((p) => p.name === c.name);
  assert.equal(pc.bot, true); assert.equal(srv.room.state, 'fight');
  await closeAll(srv, a, b2, c, d);
});

test('nomes de convidados repetidos ganham sufixo, e nomes com HTML são limpos', async () => {
  const srv = await start();
  const x = await player(srv, 'Zeca'), y = await player(srv, 'Zeca'), z = await player(srv, '<img src=x onerror=1>');
  assert.equal(x.name, 'Zeca'); assert.notEqual(y.name, 'Zeca'); assert.match(y.name, /^Zeca#2$/);
  assert.ok(!/[<>=]/.test(z.name));
  await closeAll(srv, x, y, z);
});
