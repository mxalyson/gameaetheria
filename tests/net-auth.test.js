import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../server/db.js';
import { createGameServer } from '../server/game-server.js';
import { newOfficialCharacter } from '../server/api.js';
import { PROTOCOL_VERSION, REJECT } from '../public/src/core/protocol.js';

// Multiplayer com contas: o servidor carrega o personagem DO BANCO e grava as recompensas da partida (idempotentes).
function world() {
  const db = openDb(':memory:');
  const mkAcc = (email, name, classId, patch = {}) => {
    const acc = db.createAccount({ email, pwHash: 'x' });
    const doc = { ...newOfficialCharacter(name, classId), ...patch };
    return { acc, session: db.createSession(acc), charId: db.createCharacter(acc, doc.name, doc.classId, doc), doc };
  };
  return { db, A: mkAcc('a@x.com', 'Alfa', 'warrior'), B: mkAcc('b@x.com', 'Beta', 'warrior'), mkAcc };
}
async function start(db, opts = {}) { const srv = createGameServer({ port: 0, autoTick: false, db, ...opts }); await srv.ready; return srv; }
function connect(srv) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    const c = { ws, msgs: [], closed: null, waiters: [] };
    ws.on('message', (d) => { const m = JSON.parse(d.toString()); c.msgs.push(m); c.waiters = c.waiters.filter((w) => !w(m)); });
    ws.on('close', (code) => { c.closed = code; c.waiters = c.waiters.filter((w) => !w(null)); });
    ws.on('open', () => resolve(c)); ws.on('error', reject);
    c.send = (o) => ws.send(JSON.stringify({ v: PROTOCOL_VERSION, ...o }));
    c.waitFor = (pred, ms = 3000) => new Promise((res, rej) => { const f = c.msgs.find(pred); if (f) return res(f); const to = setTimeout(() => rej(new Error('timeout')), ms); c.waiters.push((m) => { if (m && pred(m)) { clearTimeout(to); res(m); return true; } return false; }); });
    c.waitClose = (ms = 3000) => new Promise((res, rej) => { if (c.closed != null) return res(c.closed); const to = setTimeout(() => rej(new Error('timeout fechar')), ms); c.waiters.push((m) => { if (m === null) { clearTimeout(to); res(c.closed); return true; } return false; }); });
    c.sync = async () => { const ts = Math.random(); c.send({ t: 'ping', ts }); await c.waitFor((m) => m.t === 'pong' && m.ts === ts); };
  });
}
const hello = (who, extra = {}) => ({ t: 'hello', session: who.session, characterId: who.charId, ...extra });
const input = (seq, my, extra = {}) => ({ t: 'input', seq, mx: 0, my, aimX: 550, aimY: -5000, attack: false, cast: null, ...extra });
const closeAll = async (srv, ...cs) => { for (const c of cs) c.ws.terminate(); await srv.close(); };

// A persegue o B (parado) e ataca até a partida acabar.
async function playUntilOver(srv, a, A, B) {
  srv.step(60 * 4); await a.sync();
  const byChar = (id) => [...srv.players.values()].find((p) => p.charId === id).actor;
  const actA = byChar(A.charId), actB = byChar(B.charId);
  let seq = 1, moving = true;
  a.send(input(seq++, -1, { attack: true })); await a.sync();
  let g = 0;
  while (srv.room.state === 'fight' && g++ < 60 * 120) {
    srv.step(1);
    const d = actA.y - actB.y;
    if (moving && d <= 55) { moving = false; a.send(input(seq++, 0, { attack: true })); await a.sync(); }
    else if (!moving && d > 70) { moving = true; a.send(input(seq++, -1, { attack: true })); await a.sync(); }
  }
  srv.step(6);
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
  assert.equal(srv.players.size, 0);
  await closeAll(srv, c1, c2, c3);
});

test('o personagem vem do banco: o cliente não consegue impor nível, vida nem classe', async () => {
  const { db, A, mkAcc } = world();
  const forte = mkAcc('f@x.com', 'Forte', 'mage', { level: 10 });
  const srv = await start(db);
  const a = await connect(srv), f = await connect(srv);
  a.send(hello(A, { level: 99, hp: 1e9, classId: 'mage', name: 'Hacker', stats: { power: 1e6 } }));
  const wa = await a.waitFor((m) => m.t === 'welcome');
  f.send(hello(forte));
  const wf = await f.waitFor((m) => m.t === 'welcome');
  assert.equal(wa.name, 'Alfa'); assert.equal(wa.account, true);
  const actA = srv.players.get(wa.you).actor, actF = srv.players.get(wf.you).actor;
  assert.equal(actA.level, 1); assert.equal(actA.classId, 'warrior');
  assert.equal(actF.level, 10); assert.equal(actF.classId, 'mage');
  assert.ok(actF.maxHp > actA.maxHp);
  await closeAll(srv, a, f);
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
  assert.equal((await volta.waitFor((m) => m.t === 'welcome')).you, wa.you);
  await closeAll(srv, a, dup, ladrao, semSessao, volta);
});

test('fim de partida: ouro, XP e rating são gravados no banco pelo servidor, uma vez só, e cada jogador recebe o resumo', async () => {
  const { db, A, B } = world();
  const srv = await start(db);
  const a = await connect(srv), b = await connect(srv);
  a.send(hello(A)); await a.waitFor((m) => m.t === 'welcome');
  b.send(hello(B)); await b.waitFor((m) => m.t === 'welcome');
  srv.step(1);
  const matchId = srv.room.matchId;
  assert.ok(matchId);
  await playUntilOver(srv, a, A, B);
  assert.equal(srv.room.state, 'over'); assert.equal(srv.room.winner, 1);
  await a.sync(); await b.sync();
  const dA = db.character(A.charId).doc, dB = db.character(B.charId).doc;
  assert.equal(dA.gold, A.doc.gold + 40 + 8, 'vencedor: ouro = 40 + nível × 8');
  assert.equal(dB.gold, B.doc.gold + 10 + 2, 'perdedor: ouro = 10 + nível × 2');
  assert.equal(dA.arena.wins, 1); assert.equal(dA.arena.losses, 0); assert.equal(dB.arena.losses, 1);
  assert.equal(dA.arena.rating, 1016); assert.equal(dB.arena.rating, 984);
  assert.ok(dA.xp > A.doc.xp || dA.level > 1);
  const ra = await a.waitFor((m) => m.t === 'reward'), rb = await b.waitFor((m) => m.t === 'reward');
  assert.equal(ra.won, true); assert.equal(ra.ratingDelta, 16); assert.equal(rb.won, false); assert.equal(rb.ratingDelta, -16);
  assert.equal(db.raw.prepare("select count(*) n from operations where kind = 'duel'").get().n, 2);
  assert.equal(db.audits('match_reward').length, 2);
  // pagamento duplicado do mesmo fim de partida (ex.: evento repetido) não paga de novo
  srv.step(1);
  const again = db.applyOperation(`match:${matchId}:${A.charId}`, A.charId, 'duel', () => { throw new Error('não deveria executar'); });
  assert.equal(again.duplicate, true);
  assert.equal(db.character(A.charId).doc.gold, dA.gold);
  await closeAll(srv, a, b);
});

test('abandono em luta: quem sai perde (registrado) e o outro ganha', async () => {
  const { db, A, B } = world();
  const srv = await start(db, { reconnectSec: 2 });
  const a = await connect(srv), b = await connect(srv);
  a.send(hello(A)); await a.waitFor((m) => m.t === 'welcome');
  b.send(hello(B)); await b.waitFor((m) => m.t === 'welcome');
  srv.step(60 * 4); await a.sync();
  b.ws.terminate(); await new Promise((r) => setTimeout(r, 50));
  srv.step(60 * 3); await a.sync();
  assert.equal(srv.room.state, 'over');
  assert.equal(db.character(A.charId).doc.arena.wins, 1);
  assert.equal(db.character(B.charId).doc.arena.losses, 1, 'quem abandonou leva a derrota');
  await closeAll(srv, a, b);
});

test('abandono na contagem regressiva não pune ninguém', async () => {
  const { db, A, B } = world();
  const srv = await start(db, { reconnectSec: 1 });
  const a = await connect(srv), b = await connect(srv);
  a.send(hello(A)); await a.waitFor((m) => m.t === 'welcome');
  b.send(hello(B)); await b.waitFor((m) => m.t === 'welcome');
  srv.step(30);
  b.ws.terminate(); await new Promise((r) => setTimeout(r, 50));
  srv.step(60 * 2);
  assert.equal(db.character(B.charId).doc.arena.losses, 0); assert.equal(db.character(A.charId).doc.arena.wins, 0);
  assert.equal(srv.room.state, 'waiting');
  await closeAll(srv, a, b);
});
