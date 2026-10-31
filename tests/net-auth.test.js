import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createGameServer } from '../server/game-server.js';
import { newOfficialCharacter } from '../server/api.js';
import { REJECT } from '../public/src/core/protocol.js';
import { connect, chase, closeAll } from './helpers/net.js';

// Multiplayer com contas: o servidor carrega o personagem DO BANCO, exige nível para PvP e grava as recompensas da partida (idempotentes).
function world() {
  const db = openDb(':memory:');
  const mkAcc = (email, name, classId, patch = { level: 10 }) => {
    const acc = db.createAccount({ email, pwHash: 'x' });
    const doc = { ...newOfficialCharacter(name, classId), ...patch };
    return { acc, session: db.createSession(acc), charId: db.createCharacter(acc, doc.name, doc.classId, doc), doc };
  };
  return { db, A: mkAcc('a@x.com', 'Alfa', 'warrior'), B: mkAcc('b@x.com', 'Beta', 'warrior'), mkAcc };
}
async function start(db, opts = {}) { const srv = createGameServer({ port: 0, autoTick: false, db, maxMsgPerSec: 100000, ...opts }); await srv.ready; return srv; }
const hello = (who, extra = {}) => ({ t: 'hello', session: who.session, characterId: who.charId, ...extra });
async function enter(srv, who) { const c = await connect(srv); c.send(hello(who)); const w = await c.waitFor((m) => m.t === 'welcome'); return { c, w }; }
async function duel(srv, A, B) {
  const a = await enter(srv, A), b = await enter(srv, B);
  a.c.send({ t: 'queue', mode: '1v1' }); b.c.send({ t: 'queue', mode: '1v1' }); await a.c.sync(); await b.c.sync();
  srv.step(31);
  const ma = await a.c.waitFor((m) => m.t === 'match_found'), mb = await b.c.waitFor((m) => m.t === 'match_found');
  return { a: a.c, b: b.c, wa: { ...a.w, ...ma }, wb: { ...b.w, ...mb } };
}

test('com banco, convidado é recusado: conta é obrigatória', async () => {
  const { db } = world();
  const srv = await start(db);
  const c = await connect(srv);
  c.send({ t: 'hello', name: 'Convidado', classId: 'mage' });
  assert.equal((await c.waitFor((m) => m.t === 'reject')).code, REJECT.AUTH_REQUIRED);
  assert.equal(await c.waitClose(), 1008);
  await closeAll(srv, c);
});

test('sessão falsa e personagem de outra conta são recusados', async () => {
  const { db, A, B } = world();
  const srv = await start(db);
  const c1 = await connect(srv);
  c1.send({ t: 'hello', session: 'x'.repeat(43), characterId: A.charId });
  assert.equal((await c1.waitFor((m) => m.t === 'reject')).code, REJECT.BAD_SESSION);
  const c2 = await connect(srv);
  c2.send(hello({ session: A.session, charId: B.charId })); // sessão da A, personagem do B
  assert.equal((await c2.waitFor((m) => m.t === 'reject')).code, REJECT.BAD_CHARACTER);
  const c3 = await connect(srv);
  c3.send({ t: 'hello', session: A.session, characterId: 99999 });
  assert.equal((await c3.waitFor((m) => m.t === 'reject')).code, REJECT.BAD_CHARACTER);
  assert.equal(srv.hub.sessions.size, 0);
  await closeAll(srv, c1, c2, c3);
});

test('o personagem vem do banco: o cliente não consegue impor nível, vida nem classe', async () => {
  const { db, A, mkAcc } = world();
  const forte = mkAcc('f@x.com', 'Forte', 'mage', { level: 12 }); // poder parecido com o do nível 10: o matchmaking os junta
  const srv = await start(db);
  const a = await connect(srv), f = await connect(srv);
  a.send(hello(A, { level: 99, hp: 1e9, classId: 'mage', name: 'Hacker', stats: { power: 1e6 } }));
  const wa = await a.waitFor((m) => m.t === 'welcome');
  f.send(hello(forte));
  const wf = await f.waitFor((m) => m.t === 'welcome');
  assert.equal(wa.name, 'Alfa'); assert.equal(wa.account, true); assert.equal(wa.level, 10); assert.equal(wa.classId, 'warrior');
  assert.equal(wf.level, 12); assert.equal(wf.classId, 'mage');
  a.send({ t: 'queue', mode: '1v1' }); f.send({ t: 'queue', mode: '1v1' }); await a.sync(); await f.sync();
  srv.step(31 * 2);
  const ma = await a.waitFor((m) => m.t === 'match_found'), mf = await f.waitFor((m) => m.t === 'match_found');
  const actA = srv.actor(ma.you), actF = srv.actor(mf.you);
  assert.equal(actA.level, 10); assert.equal(actA.classId, 'warrior');
  assert.equal(actF.level, 12); assert.equal(actF.classId, 'mage');
  await closeAll(srv, a, f);
});

test('PvP só a partir do nível 10: personagem de nível menor não entra na fila', async () => {
  const { db, mkAcc } = world();
  const novo = mkAcc('n@x.com', 'Novato', 'mage', { level: 9 });
  const srv = await start(db);
  const { c } = await enter(srv, novo);
  c.send({ t: 'queue', mode: '2v2' });
  const r = await c.waitFor((m) => m.t === 'reject');
  assert.equal(r.code, REJECT.PVP_LOCKED); assert.equal(r.minLevel, 10);
  assert.equal(srv.hub.queue.length, 0);
  await closeAll(srv, c);
});

test('um personagem não entra duas vezes; reconexão exige a mesma conta', async () => {
  const { db, A, B } = world();
  const srv = await start(db);
  const a = await connect(srv); a.send(hello(A)); const wa = await a.waitFor((m) => m.t === 'welcome');
  const dup = await connect(srv); dup.send(hello(A));
  assert.equal((await dup.waitFor((m) => m.t === 'reject')).code, REJECT.ALREADY_ONLINE);
  a.ws.terminate(); await new Promise((r) => setTimeout(r, 50));
  const ladrao = await connect(srv); ladrao.send({ t: 'hello', session: B.session, characterId: B.charId, token: wa.token });
  assert.equal((await ladrao.waitFor((m) => m.t === 'reject')).code, REJECT.BAD_SESSION, 'token roubado + outra conta não retoma');
  const semSessao = await connect(srv); semSessao.send({ t: 'hello', session: 'y'.repeat(43), characterId: 1, token: wa.token });
  assert.equal((await semSessao.waitFor((m) => m.t === 'reject')).code, REJECT.BAD_SESSION);
  const volta = await connect(srv); volta.send({ t: 'hello', session: A.session, characterId: A.charId, token: wa.token });
  const w2 = await volta.waitFor((m) => m.t === 'welcome');
  assert.equal(w2.resumed, true); assert.equal(w2.token, wa.token);
  await closeAll(srv, a, dup, ladrao, semSessao, volta);
});

test('fim de partida: ouro, XP e rating são gravados no banco pelo servidor, uma vez só, e cada jogador recebe o resumo', async () => {
  const { db, A, B } = world();
  const srv = await start(db);
  const { a, b, wa, wb } = await duel(srv, A, B);
  const room = srv.room, matchId = room.matchId;
  assert.ok(matchId);
  srv.step(60 * 4); await a.sync();
  await chase(srv, a, srv.actor(wa.you), srv.actor(wb.you), () => room.state !== 'fight');
  assert.equal(room.state, 'over'); assert.equal(room.winner, 1);
  srv.step(6); await a.sync(); await b.sync();
  const dA = db.character(A.charId).doc, dB = db.character(B.charId).doc;
  assert.equal(dA.gold, A.doc.gold + 40 + 80, 'vencedor: ouro = 40 + nível × 8 (nível 10)');
  assert.equal(dB.gold, B.doc.gold + 10 + 20, 'perdedor: ouro = 10 + nível × 2');
  assert.equal(dA.arena.wins, 1); assert.equal(dA.arena.losses, 0); assert.equal(dB.arena.losses, 1);
  assert.equal(dA.arena.rating, 1016); assert.equal(dB.arena.rating, 984, 'o rating do perdedor não depende da ordem de pagamento');
  assert.ok(dA.xp > A.doc.xp || dA.level > 10);
  const ra = await a.waitFor((m) => m.t === 'reward'), rb = await b.waitFor((m) => m.t === 'reward');
  assert.equal(ra.won, true); assert.equal(ra.ratingDelta, 16); assert.equal(rb.won, false); assert.equal(rb.ratingDelta, -16); assert.equal(ra.mode, '1v1');
  assert.equal(db.raw.prepare("select count(*) n from operations where kind = '1v1'").get().n, 2);
  assert.equal(db.audits('match_reward').length, 2);
  // pagamento duplicado do mesmo fim de partida (ex.: evento repetido) não paga de novo
  room.end(1, 'elimination');
  const again = db.applyOperation(`match:${matchId}:${A.charId}`, A.charId, '1v1', () => { throw new Error('não deveria executar'); });
  assert.equal(again.duplicate, true);
  assert.equal(db.character(A.charId).doc.gold, dA.gold);
  await closeAll(srv, a, b);
});

test('quem abandona uma luta é substituído por um bot e leva a derrota (registrada); o outro lado ganha', async () => {
  const { db, A, B } = world();
  const srv = await start(db, { reconnectSec: 2 });
  const { a, b, wb } = await duel(srv, A, B);
  srv.step(60 * 4); await a.sync();
  b.ws.terminate(); await new Promise((r) => setTimeout(r, 50));
  srv.step(60 * 3); await a.sync();
  const room = srv.room;
  assert.equal(room.players.get(wb.you).left, true);
  room.end(1, 'elimination'); // o time 1 vence (o time do bot perde)
  assert.equal(db.character(A.charId).doc.arena.wins, 1);
  assert.equal(db.character(B.charId).doc.arena.losses, 1, 'quem abandonou leva a derrota');
  assert.equal(db.character(B.charId).doc.arena.wins, 0);
  await closeAll(srv, a, b);
});

test('mesmo que o time de quem abandonou vença, o desertor não ganha nada', async () => {
  const { db, A, B } = world();
  const srv = await start(db, { reconnectSec: 2 });
  const { a, b } = await duel(srv, A, B);
  srv.step(60 * 4); await a.sync();
  a.ws.terminate(); await new Promise((r) => setTimeout(r, 50));
  srv.step(60 * 3);
  srv.room.end(1, 'elimination'); // o time 1 (do desertor A) "vence"
  assert.equal(db.character(A.charId).doc.arena.wins, 0, 'desertor não é premiado');
  assert.equal(db.character(A.charId).doc.arena.losses, 1);
  assert.equal(db.character(B.charId).doc.arena.losses, 1);
  await closeAll(srv, a, b);
});

test('abandono na contagem regressiva cancela a partida sem punir ninguém', async () => {
  const { db, A, B } = world();
  const srv = await start(db, { reconnectSec: 1 });
  const { a, b } = await duel(srv, A, B);
  srv.step(30);
  b.ws.terminate(); await new Promise((r) => setTimeout(r, 50));
  srv.step(60 * 2);
  assert.equal(srv.hub.rooms.size, 0);
  assert.equal(db.character(B.charId).doc.arena.losses, 0); assert.equal(db.character(A.charId).doc.arena.wins, 0);
  assert.equal((await a.waitFor((m) => m.t === 'match_end')).reason, 'aborted');
  assert.equal(db.raw.prepare('select count(*) n from operations').get().n, 0);
  await closeAll(srv, a, b);
});
