import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { connect, hello, input, closeAll, chase } from './helpers/net.js';
import { createGameServer } from '../server/game-server.js';
import { decodeClient, parseClientMessage, RateLimiter, PROTOCOL_VERSION, REJECT, safeName } from '../public/src/core/protocol.js';

// ---------- utilitários ----------
async function startServer(opts = {}) {
  const srv = createGameServer({ port: 0, autoTick: false, ...opts });
  await srv.ready;
  return srv;
}
// Dois jogadores entram, entram na fila 1×1 e o matchmaking os junta (you = id do ator na sala; slot = time).
async function twoPlayers(srv, classA = 'warrior', classB = 'warrior') {
  const a = await connect(srv), b = await connect(srv);
  a.send(hello('Alfa', classA)); const wa0 = await a.waitFor((m) => m.t === 'welcome');
  b.send(hello('Beta', classB)); const wb0 = await b.waitFor((m) => m.t === 'welcome');
  a.send({ t: 'queue', mode: '1v1' }); b.send({ t: 'queue', mode: '1v1' });
  await a.sync(); await b.sync();
  srv.step(31); // o matchmaking roda a cada 30 ticks
  const ma = await a.waitFor((m) => m.t === 'match_found'), mb = await b.waitFor((m) => m.t === 'match_found');
  return { a, b, wa: { ...wa0, ...ma }, wb: { ...wb0, ...mb } };
}
const toFight = async (srv, ...cs) => { srv.step(60 * 4); for (const c of cs) await c.sync(); };
const actorOf = (srv, id) => srv.actor(id);

// ---------- protocolo (sem rede) ----------
test('protocolo: mensagens válidas passam e são normalizadas com lista branca', () => {
  const h = decodeClient(JSON.stringify({ v: PROTOCOL_VERSION, t: 'hello', name: '<b>Zé</b>', classId: 'mage', token: null, extra: 'x' }));
  assert.equal(h.ok, true); assert.equal(h.msg.name, 'bZéb'); assert.equal(h.msg.token, null); assert.ok(!('extra' in h.msg));
  const i = parseClientMessage({ v: PROTOCOL_VERSION, t: 'input', seq: 3, mx: 999, my: -999, aimX: 1e9, aimY: 5, attack: 'yes', cast: 1, damage: 1e6 });
  assert.equal(i.ok, true);
  assert.equal(i.msg.mx, 1); assert.equal(i.msg.my, -1); assert.equal(i.msg.aimX, 10000); assert.equal(i.msg.attack, false);
  assert.ok(!('damage' in i.msg));
  assert.equal(safeName('  '), 'Herói');
});

test('protocolo: versão errada, tipos proibidos (damage/loot/pos), NaN, skill inválida e token ruim são recusados', () => {
  const bad = (o) => parseClientMessage({ v: PROTOCOL_VERSION, ...o }).code;
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION + 1, t: 'ping', ts: 1 }).code, REJECT.BAD_VERSION);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION - 1, t: 'ping', ts: 1 }).code, REJECT.BAD_VERSION);
  assert.equal(parseClientMessage({ t: 'ping', ts: 1 }).code, REJECT.BAD_VERSION);
  for (const t of ['damage', 'loot', 'pos', 'gold', 'setHp', 'admin', '']) assert.equal(bad({ t, amount: 9999 }), REJECT.BAD_MESSAGE, t);
  assert.equal(bad({ t: 'input', seq: 1, mx: NaN, my: 0, aimX: 0, aimY: 0 }), REJECT.BAD_MESSAGE);
  assert.equal(bad({ t: 'input', seq: -1, mx: 0, my: 0, aimX: 0, aimY: 0 }), REJECT.BAD_MESSAGE);
  assert.equal(bad({ t: 'input', seq: 1.5, mx: 0, my: 0, aimX: 0, aimY: 0 }), REJECT.BAD_MESSAGE);
  assert.equal(bad({ t: 'input', seq: 1, mx: 0, my: 0, aimX: 0, aimY: 0, cast: 7 }), REJECT.BAD_MESSAGE);
  assert.equal(bad({ t: 'input', seq: 1, mx: '1', my: 0, aimX: 0, aimY: 0 }), REJECT.BAD_MESSAGE);
  assert.equal(bad({ t: 'hello', name: 'x', classId: 'dragon' }), REJECT.BAD_MESSAGE);
  assert.equal(bad({ t: 'hello', name: 'x', classId: 'mage', token: '../../etc' }), REJECT.BAD_TOKEN);
  assert.equal(bad({ t: 'queue', mode: '9v9' }), REJECT.BAD_MODE);
  assert.equal(bad({ t: 'party_accept', partyId: 'x' }), REJECT.BAD_MESSAGE);
  assert.equal(bad({ t: 'party_invite', name: 5 }), REJECT.BAD_MESSAGE);
  assert.equal(decodeClient('{nao json').code, REJECT.BAD_JSON);
  assert.equal(decodeClient('x'.repeat(5000)).code, REJECT.BAD_MESSAGE);
  assert.equal(decodeClient(null).code, REJECT.BAD_MESSAGE);
  for (const v of [null, 5, 'a', []]) assert.equal(parseClientMessage(v).ok, false);
});

test('limitador de taxa: bloqueia acima do limite e libera depois da janela', () => {
  const l = new RateLimiter(5);
  for (let i = 0; i < 5; i++) assert.equal(l.allow(1000 + i), true);
  assert.equal(l.allow(1010), false);
  assert.equal(l.allow(2100), true);
});

// ---------- servidor autoritativo ----------
test('dois clientes entram, o matchmaking os põe na mesma sala, cada um vê o outro, e a partida começa após a contagem', async () => {
  const srv = await startServer();
  const { a, b, wa, wb } = await twoPlayers(srv);
  assert.equal(wa.slot, 1); assert.equal(wb.slot, 2);
  assert.notEqual(wa.you, wb.you);
  assert.ok(wa.token && wb.token && wa.token !== wb.token);
  assert.equal(wa.protocol, PROTOCOL_VERSION);
  assert.equal(wa.mode, '1v1'); assert.equal(wa.players.length, 2);
  srv.step(30); await a.sync(); await b.sync();
  assert.equal(a.last('snap').state, 'countdown');
  await toFight(srv, a, b);
  for (const c of [a, b]) {
    const s = c.last('snap');
    assert.equal(s.state, 'fight');
    assert.equal(s.actors.length, 2);
    assert.deepEqual(s.actors.map((x) => x.name).sort(), ['Alfa', 'Beta']);
    assert.ok(s.actors.every((x) => x.online && x.hp === x.maxHp));
  }
  await closeAll(srv, a, b);
});

test('um terceiro jogador fica na fila esperando (não entra na sala dos outros dois)', async () => {
  const srv = await startServer();
  const { a, b } = await twoPlayers(srv);
  const c = await connect(srv);
  c.send(hello('Gama', 'mage')); await c.waitFor((m) => m.t === 'welcome');
  c.send({ t: 'queue', mode: '1v1' }); await c.sync();
  srv.step(31 * 3);
  assert.equal(srv.hub.rooms.size, 1);
  assert.equal(srv.hub.queue.length, 1);
  assert.ok(!c.msgs.some((m) => m.t === 'match_found'));
  await closeAll(srv, a, b, c);
});

test('movimento: o servidor decide a posição; direção/valores absurdos não passam da velocidade máxima', async () => {
  const srv = await startServer();
  const { a, b, wa } = await twoPlayers(srv);
  await toFight(srv, a, b);
  const act = actorOf(srv, wa.you);
  const y0 = act.y, x0 = act.x;
  a.send(input(1, 1e9, -1e9)); await a.sync(); // tenta "andar" absurdamente rápido
  srv.step(60); // 1 s
  const dist = Math.hypot(act.x - x0, act.y - y0);
  const max = act.stats.moveSpeed * act.speedMul * 1.0 * 1.02;
  assert.ok(dist > 100, 'o jogador andou');
  assert.ok(dist <= max, `andou ${dist.toFixed(1)} > máximo ${max.toFixed(1)} em 1 s`);
  await closeAll(srv, a, b);
});

test('anti-trapaça: mensagens de dano/posição/ouro são recusadas e nada muda no estado', async () => {
  const srv = await startServer();
  const { a, b, wa, wb } = await twoPlayers(srv);
  await toFight(srv, a, b);
  const before = JSON.stringify([actorOf(srv, wa.you).hp, actorOf(srv, wb.you).hp, actorOf(srv, wa.you).x]);
  a.send({ t: 'damage', target: wb.you, amount: 99999 });
  a.send({ t: 'pos', x: 550, y: 260 });
  a.send({ t: 'gold', amount: 1e9 });
  a.send({ t: 'input', seq: 1, mx: 0, my: 0, aimX: 0, aimY: 0, attack: false, cast: null, damage: 99999, hp: 99999, x: 550 });
  await a.sync();
  srv.step(2);
  assert.equal(a.msgs.filter((m) => m.t === 'reject' && m.code === REJECT.BAD_MESSAGE).length, 3);
  assert.equal(JSON.stringify([actorOf(srv, wa.you).hp, actorOf(srv, wb.you).hp, actorOf(srv, wa.you).x]), before);
  await closeAll(srv, a, b);
});

test('combate: dano, vida e morte são calculados no servidor; a partida termina com vencedor e a sala fecha', async () => {
  const srv = await startServer({ maxMsgPerSec: 100000 }); // o teste acelera o relógio: muitas mensagens em pouco tempo real
  const { a, b, wa, wb } = await twoPlayers(srv);
  await toFight(srv, a, b);
  const A = actorOf(srv, wa.you), B = actorOf(srv, wb.you);
  const room = srv.room;
  // A persegue o B (parado), contornando os pilares, e ataca até a partida acabar
  await chase(srv, a, A, B, () => room.state !== 'fight');
  assert.equal(room.state, 'over');
  assert.equal(room.winner, 1);
  assert.equal(B.dead, true); assert.equal(B.hp, 0); assert.ok(A.hp > 0);
  srv.step(6); // o servidor segue rodando: os últimos eventos saem no próximo snapshot
  await a.sync(); await b.sync();
  const allEvents = a.msgs.filter((m) => m.t === 'snap').flatMap((m) => m.events);
  const hits = allEvents.filter((e) => e.e === 'hit');
  assert.ok(hits.length > 3 && hits.every((h) => h.src === wa.you && h.target === wb.you), 'só o A causou dano, ao B');
  assert.equal(hits.reduce((s, h) => s + h.amount, 0) >= B.maxHp, true, 'soma do dano cobre a vida do alvo');
  assert.ok(allEvents.some((e) => e.e === 'death' && e.actor === wb.you && e.killer === wa.you));
  assert.ok(allEvents.some((e) => e.e === 'result' && e.winner === 1 && e.reason === 'elimination'));
  assert.equal(b.last('snap').actors.find((x) => x.id === wb.you).dead, true); // o perdedor vê a própria morte
  // 5 s depois a sala fecha e os dois voltam ao lobby
  srv.step(60 * 6);
  assert.equal(srv.hub.rooms.size, 0);
  await a.waitFor((m) => m.t === 'match_end'); await b.waitFor((m) => m.t === 'match_end');
  await closeAll(srv, a, b);
});

test('cooldown no servidor: spam de ataque e skill não passa da taxa permitida', async () => {
  const srv = await startServer({ maxMsgPerSec: 1000 }); // aqui o spam é de propósito (o limite de taxa tem teste próprio)
  const { a, b, wa, wb } = await twoPlayers(srv);
  await toFight(srv, a, b);
  const A = actorOf(srv, wa.you), B = actorOf(srv, wb.you);
  A.x = B.x; A.y = B.y + 40; // encosta (mexer no estado do servidor é só do teste)
  B.stats.def = 1e9; // o alvo aguenta: contamos golpes, não mortes
  let seq = 1;
  for (let i = 0; i < 120; i++) { a.send(input(seq++, 0, 0, { attack: true, cast: 0 })); }
  await a.sync();
  srv.step(180); // 3 s
  await a.sync();
  const evs = a.msgs.filter((m) => m.t === 'snap').flatMap((m) => m.events);
  const swings = evs.filter((e) => e.e === 'swing' && e.actor === wa.you).length;
  const casts = evs.filter((e) => e.e === 'cast' && e.actor === wa.you).length;
  assert.ok(swings <= Math.ceil(3 / 0.5) + 1, `golpes ${swings}`);
  assert.ok(casts <= 1, `habilidade lançada ${casts}x em 3s (cd 5s)`);
  assert.ok(swings >= 3 && casts === 1);
  await closeAll(srv, a, b);
});

test('entradas repetidas ou fora de ordem (replay) são ignoradas', async () => {
  const srv = await startServer();
  const { a, b, wa } = await twoPlayers(srv);
  await toFight(srv, a, b);
  a.send(input(10, 0, -1)); a.send(input(4, 1, 0)); a.send(input(10, -1, 0)); await a.sync();
  assert.equal(srv.stats.staleInputs, 2);
  const A = actorOf(srv, wa.you); const x0 = A.x; srv.step(30);
  assert.equal(A.x, x0, 'só a entrada 10 (para cima) valeu: nenhum deslocamento lateral');
  assert.equal(srv.players.get(wa.you).lastSeq, 10);
  srv.step(3); await a.sync();
  assert.equal(a.last('snap').ack, 10);
  await closeAll(srv, a, b);
});

test('mensagens inválidas: JSON ruim, versão errada, sem hello; excesso de erros derruba a conexão', async () => {
  const srv = await startServer();
  const c = await connect(srv);
  c.raw('{nao json'); assert.equal((await c.waitFor((m) => m.code === REJECT.BAD_JSON)).t, 'reject');
  c.raw(JSON.stringify({ v: 99, t: 'ping', ts: 1 })); await c.waitFor((m) => m.code === REJECT.BAD_VERSION);
  c.send(input(1, 0, 0)); await c.waitFor((m) => m.code === REJECT.NOT_JOINED);
  for (let i = 0; i < 6; i++) c.raw('lixo');
  assert.equal(await c.waitClose(), 1008);
  assert.ok(c.msgs.some((m) => m.code === REJECT.TOO_MANY_ERRORS));
  await closeAll(srv, c);
});

test('mensagem enorme fecha a conexão (limite de payload)', async () => {
  const srv = await startServer();
  const c = await connect(srv);
  c.raw('x'.repeat(5000));
  assert.equal(await c.waitClose(), 1009);
  await closeAll(srv, c);
});

test('limite de taxa: enxurrada de mensagens derruba o cliente abusivo', async () => {
  const srv = await startServer({ maxMsgPerSec: 30 });
  const { a, b } = await twoPlayers(srv);
  for (let i = 0; i < 200; i++) a.send(input(i + 1, 0, 0));
  assert.equal(await a.waitClose(), 1008);
  assert.ok(a.msgs.some((m) => m.code === REJECT.RATE_LIMIT));
  assert.ok(srv.stats.kicked >= 1);
  await closeAll(srv, a, b);
});

test('desconexão e reconexão: o jogador volta ao mesmo personagem com o token; token falso é recusado', async () => {
  const srv = await startServer({ reconnectSec: 30 });
  const { a, b, wb } = await twoPlayers(srv);
  await toFight(srv, a, b);
  const B = actorOf(srv, wb.you); const hp = B.hp;
  b.ws.terminate(); await new Promise((r) => setTimeout(r, 50));
  srv.step(60 * 2); await a.sync();
  assert.equal(a.last('snap').actors.find((x) => x.id === wb.you).online, false);
  assert.equal(srv.room.state, 'fight', 'a partida espera a reconexão');
  const fake = await connect(srv);
  fake.send(hello('Intruso', 'mage', { token: 'tokenfalso1234567' }));
  assert.equal((await fake.waitFor((m) => m.t === 'reject')).code, REJECT.BAD_TOKEN);
  const b2 = await connect(srv);
  b2.send(hello('Beta', 'warrior', { token: wb.token }));
  const w2 = await b2.waitFor((m) => m.t === 'welcome');
  assert.equal(w2.resumed, true);
  const m2 = await b2.waitFor((m) => m.t === 'match_found');
  assert.equal(m2.you, wb.you); assert.equal(m2.slot, 2);
  srv.step(6); await b2.sync();
  assert.equal(b2.last('snap').actors.find((x) => x.id === wb.you).online, true);
  assert.equal(B.hp, hp);
  await closeAll(srv, a, b2, fake);
});

test('quem não volta a tempo é substituído por um bot, e a partida continua', async () => {
  const srv = await startServer({ reconnectSec: 2 });
  const { a, b, wb } = await twoPlayers(srv);
  await toFight(srv, a, b);
  b.ws.terminate(); await new Promise((r) => setTimeout(r, 50));
  srv.step(60 * 3); await a.sync();
  const p = srv.players.get(wb.you);
  assert.equal(p.bot, true); assert.equal(p.left, true);
  assert.equal(p.actor.kind, 'rival', 'a IA assumiu');
  assert.equal(srv.room.state, 'fight', 'a partida segue');
  assert.ok(a.msgs.filter((m) => m.t === 'snap').flatMap((m) => m.events).some((e) => e.e === 'left' && e.actor === wb.you));
  await closeAll(srv, a, b);
});

test('mesma semente e mesmas entradas dão exatamente o mesmo resultado em dois servidores', async () => {
  const run = async () => {
    const srv = await startServer({ seed: 777 });
    const { a, b, wa, wb } = await twoPlayers(srv, 'mage', 'archer');
    await toFight(srv, a, b);
    a.send(input(1, 0, -1, { attack: true, cast: 0 })); b.send(input(1, 0, 1, { attack: true, cast: 2 })); await a.sync(); await b.sync();
    srv.step(60 * 6);
    const out = [wa.you, wb.you].map((id) => { const x = actorOf(srv, id); return [x.x.toFixed(2), x.y.toFixed(2), x.hp.toFixed(2)].join(','); });
    await closeAll(srv, a, b);
    return out.join('|');
  };
  const r1 = await run(), r2 = await run();
  assert.equal(r1, r2);
});

test('origem não permitida é recusada quando há lista de origens', async () => {
  const srv = await startServer({ allowedOrigins: ['http://localhost:5174'] });
  const ok = await new Promise((res) => { const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`, { headers: { origin: 'http://evil.example' } }); ws.on('open', () => res(true)); ws.on('error', () => res(false)); ws.on('unexpected-response', () => res(false)); });
  assert.equal(ok, false);
  const good = await new Promise((res) => { const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`, { headers: { origin: 'http://localhost:5174' } }); ws.on('open', () => { ws.close(); res(true); }); ws.on('error', () => res(false)); });
  assert.equal(good, true);
  await srv.close();
});
