import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../server/game-server.js';
import { CHAT } from '../server/hub.js';
import { REJECT, cleanChat, parseClientMessage, PROTOCOL_VERSION, CHAT_MAX } from '../public/src/core/protocol.js';
import { connect, hello, closeAll } from './helpers/net.js';

// Chat online (2026-11-04): canal global e do grupo, texto limpo no protocolo, limite de ritmo e histórico para quem entra.
async function start() { const srv = createGameServer({ port: 0, autoTick: false, maxMsgPerSec: 100000 }); await srv.ready; return srv; }
async function player(srv, name) { const c = await connect(srv); c.send(hello(name, 'mage')); const w = await c.waitFor((m) => m.t === 'welcome'); c.name = w.name; return c; }
const wait = (srv, sec) => srv.step(Math.ceil(sec * 60) + 1); // relógio do hub anda por tick (60/s)

test('cleanChat: tira controle/invisíveis, colapsa espaços, limita o tamanho; mensagens inválidas são recusadas', () => {
  assert.equal(cleanChat('  oi​  \n mundo‮ '), 'oi mundo');
  assert.equal(cleanChat('<b>x</b>'), '<b>x</b>', 'HTML vira texto no cliente (textContent), não é removido');
  assert.equal([...cleanChat('é'.repeat(500))].length, CHAT_MAX);
  assert.equal(cleanChat(42), '');
  const p = (o) => parseClientMessage({ v: PROTOCOL_VERSION, t: 'chat', ...o });
  assert.deepEqual(p({ text: 'olá' }).msg, { t: 'chat', ch: 'global', text: 'olá' });
  assert.equal(p({ text: '   ' }).ok, false, 'só espaços');
  assert.equal(p({ text: 'oi', ch: 'admin' }).ok, false, 'canal desconhecido');
  assert.equal(p({ text: 'oi', from: 'Rei' }).msg.from, undefined, 'o cliente não escolhe o remetente');
});

test('chat global chega a todos com o nome do servidor; histórico vai para quem entra depois', async () => {
  const srv = await start();
  const a = await player(srv, 'Ana'), b = await player(srv, 'Beto');
  a.send({ t: 'chat', text: 'bom dia, Lúmen!' });
  const got = await b.waitFor((m) => m.t === 'chat');
  assert.equal(got.from, 'Ana'); assert.equal(got.ch, 'global'); assert.equal(got.text, 'bom dia, Lúmen!'); assert.equal(got.cls, 'mage');
  await a.waitFor((m) => m.t === 'chat'); // o remetente também recebe (eco)
  const c = await player(srv, 'Caio');
  const h = await c.waitFor((m) => m.t === 'chat_history');
  assert.deepEqual(h.list.map((x) => x.text), ['bom dia, Lúmen!']);
  await closeAll(srv, a, b, c);
});

test('limite de ritmo: rápido demais, rajada e texto repetido são recusados (chat_wait)', async () => {
  const srv = await start();
  const a = await player(srv, 'Ana'), b = await player(srv, 'Beto');
  const rejects = () => a.all('reject').filter((r) => r.code === REJECT.CHAT_WAIT).length;
  a.send({ t: 'chat', text: 'um' }); a.send({ t: 'chat', text: 'dois' }); await a.sync();
  assert.equal(rejects(), 1, 'segunda mensagem dentro de 1,2 s');
  wait(srv, CHAT.gap); a.send({ t: 'chat', text: 'UM' }); await a.sync();
  assert.equal(rejects(), 2, 'mesmo texto (sem diferenciar maiúsculas) em 15 s');
  for (const t of ['três', 'quatro', 'cinco', 'seis']) { wait(srv, CHAT.gap); a.send({ t: 'chat', text: t }); await a.sync(); } // sync: a mensagem chega antes do próximo passo do relógio
  wait(srv, CHAT.gap); a.send({ t: 'chat', text: 'sete' }); await a.sync();
  assert.equal(rejects(), 3, 'mais de 5 em 10 s');
  await b.sync();
  assert.deepEqual(b.all('chat').map((m) => m.text), ['um', 'três', 'quatro', 'cinco', 'seis']);
  await closeAll(srv, a, b);
});

test('canal do grupo: só os membros recebem; sem grupo é recusado; não entra no histórico global', async () => {
  const srv = await start();
  const a = await player(srv, 'Ana'), b = await player(srv, 'Beto'), c = await player(srv, 'Caio');
  a.send({ t: 'chat', ch: 'party', text: 'alguém?' }); await a.sync();
  assert.ok(a.all('reject').some((r) => r.code === REJECT.NOT_IN_PARTY));
  a.send({ t: 'party_create' }); a.send({ t: 'party_invite', name: 'Beto' }); await a.sync();
  const inv = await b.waitFor((m) => m.t === 'invite'); b.send({ t: 'party_accept', partyId: inv.partyId }); await b.sync();
  wait(srv, CHAT.gap); a.send({ t: 'chat', ch: 'party', text: 'vamos à Cripta' }); await a.sync();
  assert.equal((await b.waitFor((m) => m.t === 'chat')).ch, 'party');
  await c.sync();
  assert.equal(c.all('chat').length, 0, 'quem não é do grupo não recebe');
  const d = await player(srv, 'Duda'); await d.sync();
  assert.equal(d.all('chat_history').length, 0, 'mensagem de grupo não vai ao histórico global');
  await closeAll(srv, a, b, c, d);
});

import { ChatLog, CHAT_KEEP } from '../public/src/ui/chat-log.js';
test('ChatLog (cliente): não lidas, histórico sem contar, limite por canal e silenciar salvo no aparelho', () => {
  const mem = new Map(), store = { get: (k) => mem.get(k) ?? null, set: (k, v) => mem.set(k, v) };
  const log = new ChatLog(store);
  log.history([{ from: 'Ana', text: 'antes' }]);
  assert.equal(log.unread, 0, 'histórico não acende o contador');
  assert.equal(log.list.global.length, 1);
  log.add({ ch: 'global', from: 'Beto', text: 'oi' }); log.add({ ch: 'party', from: 'Ana', text: 'vem' });
  log.add({ ch: 'global', from: 'Eu', text: 'minha' }, { mine: true });
  assert.equal(log.unread, 2, 'a própria mensagem não conta');
  log.setOpen(true); assert.equal(log.unread, 0);
  assert.equal(log.add({ ch: 'admin', from: 'X', text: 'y' }), false, 'canal desconhecido é ignorado');
  for (let i = 0; i < CHAT_KEEP + 10; i++) log.add({ ch: 'global', from: 'Spam', text: String(i) });
  assert.equal(log.list.global.length, CHAT_KEEP);
  assert.equal(log.toggleMute('SPAM'), true);
  assert.equal(log.list.global.some((m) => m.from === 'Spam'), false, 'mensagens de quem foi silenciado somem');
  assert.equal(log.add({ ch: 'global', from: 'spam', text: 'de novo' }), false, 'sem diferenciar maiúsculas');
  assert.equal(new ChatLog(store).isMuted('Spam'), true, 'silenciados persistem no aparelho');
  log.clearMutes(); assert.equal(new ChatLog(store).isMuted('Spam'), false);
  assert.doesNotThrow(() => new ChatLog({ get: () => '{bad', set() {} }), 'armazenamento corrompido não quebra');
});
