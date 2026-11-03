import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createGameServer } from '../server/game-server.js';
import { newOfficialCharacter } from '../server/api.js';
import { connect, closeAll } from './helpers/net.js';
import { parseClientMessage, PROTOCOL_VERSION, TX_OPS } from '../public/src/core/protocol.js';
import { runTx, placeProblem, TxError } from '../server/tx.js';
import { buildShopStock, buildHarborStock, PRICES, sellValue } from '../public/src/shop.js';
import { dayUTC } from '../public/src/core/journal.js';
import { makeRng } from '../public/src/core/rng.js';
import { ZONES } from '../public/src/data/zones.js';

// Transações do servidor (P11.3/P11.4): baú, compra, venda, aprimoramento, banco, contratos, missões, poção e spirit.
async function setup() {
  const db = openDb(':memory:');
  const srv = createGameServer({ port: 0, host: '127.0.0.1', autoTick: false, db, allowGuests: false });
  await srv.ready;
  const acc = db.createAccount({ email: 'tx@t.t', pwHash: 'x' });
  const doc = newOfficialCharacter('Txer', 'warrior');
  const ch = db.createCharacter(acc, doc.name, doc.classId, doc);
  const sess = db.createSession(acc);
  const c = await connect(srv);
  c.send({ t: 'hello', session: sess, characterId: ch });
  await c.waitFor((m) => m.t === 'welcome');
  const patch = (fn) => db.applyOperation('p' + Math.random(), ch, 'test', (d) => { const x = structuredClone(d); fn(x); return { doc: x, summary: {} }; });
  const sessionOf = () => srv.hub.byChar.get(ch);
  let req = 0;
  // envia uma transação, avança o relógio do servidor (limite entre pedidos) e devolve a resposta
  const tx = async (msg) => { const r = ++req; srv.step(10); c.send({ t: 'tx', req: r, ...msg }); return c.waitFor((m) => m.t === 'tx_result' && m.req === r); };
  return { db, srv, c, ch, patch, sessionOf, tx };
}
const TX = (o) => parseClientMessage({ v: PROTOCOL_VERSION, t: 'tx', ...o });

test('protocolo: tx só aceita operações da lista, com ids/quantidades válidos; campos extras somem', () => {
  assert.ok(TX({ op: 'potion' }).ok);
  assert.deepEqual(TX({ op: 'buy_potion', n: 3, shop: 'harbor', req: 7, extra: 1 }).msg, { t: 'tx', op: 'buy_potion', req: 7, n: 3, shop: 'harbor' });
  assert.equal(TX({ op: 'buy_potion', n: 0 }).ok, false);
  assert.equal(TX({ op: 'buy_potion', n: 1000 }).ok, false);
  assert.equal(TX({ op: 'buy_potion', n: 1.5 }).ok, false);
  assert.equal(TX({ op: 'sell' }).ok, false, 'sem id');
  assert.equal(TX({ op: 'sell', id: '../x' }).ok, false);
  assert.equal(TX({ op: 'sell', id: 'a'.repeat(60) }).ok, false);
  assert.equal(TX({ op: 'buy_item', id: 'shop-1', shop: 'cave' }).ok, false);
  assert.equal(TX({ op: 'gold' }).ok, false); assert.equal(TX({ op: '__proto__' }).ok, false); assert.equal(TX({ op: 'toString' }).ok, false);
  assert.equal(TX({}).ok, false);
  for (const op of Object.keys(TX_OPS)) assert.ok([null, 'not_here'].includes(placeProblem(op, { inZone: false, hubAt: 'harbor' })), 'placeProblem devolve string|null: ' + op);
});

test('placeProblem: dentro da instância só baú/poção/spirit; cidades têm o resto; Porto é separado da Vila', () => {
  const inZ = (op) => placeProblem(op, { inZone: true, hubAt: null });
  for (const op of ['chest', 'potion', 'spirit_set']) assert.equal(inZ(op), null);
  for (const op of ['buy_item', 'sell', 'enhance', 'bank_deposit', 'quest_accept', 'claim_daily']) assert.equal(inZ(op), 'not_here', op);
  assert.equal(placeProblem('chest', { inZone: false }), 'not_here');
  assert.equal(placeProblem('potion', { inZone: false }), 'not_here');
  assert.equal(placeProblem('buy_item', { inZone: false, hubAt: null, shop: 'town' }), null);
  assert.equal(placeProblem('buy_item', { inZone: false, hubAt: 'harbor', shop: 'town' }), 'not_here', 'loja da Vila não existe no Porto');
  assert.equal(placeProblem('buy_item', { inZone: false, hubAt: null, shop: 'harbor' }), 'not_here');
  assert.equal(placeProblem('bank_deposit', { inZone: false, hubAt: null }), 'not_here');
  assert.equal(placeProblem('bank_deposit', { inZone: false, hubAt: 'harbor' }), null);
  assert.equal(placeProblem('enhance', { inZone: false, hubAt: 'harbor' }), null);
});

test('runTx (puro): compra, venda e aprimoramento usam o estoque e os preços do servidor; falhas lançam sem mudar o original', () => {
  const doc = newOfficialCharacter('P', 'warrior'); doc.gold = 100000;
  const rng = makeRng(1), ctx = { rng, now: Date.now() };
  const stock = buildShopStock(doc), it = stock[0];
  const price = Math.round(it.price ?? it.value * PRICES.itemMarkup);
  const out = runTx(doc, { op: 'buy_item', id: it.id, shop: 'town' }, ctx);
  assert.equal(out.doc.gold, 100000 - price); assert.ok(out.doc.inventory.some((i) => i.id === it.id));
  assert.equal(doc.gold, 100000, 'original intacto'); assert.equal(doc.inventory.length, 0);
  assert.throws(() => runTx(doc, { op: 'buy_item', id: 'shop-fake-9', shop: 'town' }, ctx), TxError);
  const poor = { ...doc, gold: 1 };
  assert.throws(() => runTx(poor, { op: 'buy_item', id: it.id, shop: 'town' }, ctx), /Ouro insuficiente/);
  const sold = runTx(out.doc, { op: 'sell', id: it.id, shop: 'town' }, ctx);
  assert.equal(sold.doc.gold, out.doc.gold + sellValue(out.doc.inventory.find((i) => i.id === it.id)));
  assert.equal(sold.doc.inventory.length, 0);
  assert.throws(() => runTx(sold.doc, { op: 'sell', id: it.id, shop: 'town' }, ctx), /não está na mochila/);
  const w = out.doc.inventory[0];
  const up = runTx(out.doc, { op: 'enhance', id: w.id }, ctx);
  assert.equal(up.doc.inventory[0].plus, 1); assert.ok(up.doc.gold < out.doc.gold); assert.equal(up.doc.stats.upgrades, 1);
});

test('runTx (puro): poção, pergaminho, loja do Porto, banco, contrato e missão', () => {
  const doc = newOfficialCharacter('P', 'warrior'); doc.gold = 100000; doc.level = 12;
  const ctx = { rng: makeRng(2), now: Date.UTC(2026, 10, 3, 12) };
  let r = runTx(doc, { op: 'buy_potion', n: 5, shop: 'town' }, ctx);
  assert.equal(r.doc.potions, doc.potions + 5); assert.equal(r.doc.gold, 100000 - 5 * PRICES.potion(12));
  const hp = runTx(doc, { op: 'buy_potion', n: 5, shop: 'harbor' }, ctx);
  assert.ok(hp.doc.gold > r.doc.gold, 'Porto tem desconto');
  assert.throws(() => runTx({ ...doc, potions: 995 }, { op: 'buy_potion', n: 10, shop: 'town' }, ctx), /demais/);
  r = runTx(doc, { op: 'buy_scroll', n: 2, shop: 'town' }, ctx);
  assert.equal(r.doc.scrolls, (doc.scrolls ?? 0) + 2);
  assert.throws(() => runTx({ ...doc, scrolls: 98 }, { op: 'buy_scroll', n: 2, shop: 'town' }, ctx), /máximo/);
  // loja do Porto: o estoque do dia, com o preço próprio; o item sai com o valor real
  const hs = buildHarborStock(doc, { day: dayUTC(ctx.now) })[0];
  r = runTx(doc, { op: 'buy_item', id: hs.id, shop: 'harbor' }, ctx);
  assert.equal(r.doc.gold, 100000 - hs.price); const got = r.doc.inventory.find((i) => i.id === hs.id);
  assert.equal(got.value, hs.baseValue); assert.equal(got.price, undefined); assert.equal(got.baseValue, undefined);
  // banco
  const dep = runTx(r.doc, { op: 'bank_deposit', id: hs.id }, ctx);
  assert.equal(dep.doc.bank.length, 1); assert.equal(dep.doc.inventory.length, 0); assert.equal(dep.doc.stats.deposits, 1);
  const wd = runTx(dep.doc, { op: 'bank_withdraw', id: hs.id }, ctx);
  assert.equal(wd.doc.bank.length, 0); assert.equal(wd.doc.inventory.length, 1);
  assert.throws(() => runTx(wd.doc, { op: 'bank_withdraw', id: hs.id }, ctx), /não está no banco/);
  // missão: aceitar e entregar sem completar é recusado; completa e paga (XP/ouro/poções do servidor)
  assert.throws(() => runTx(doc, { op: 'quest_turnin', id: 'ervas_do_bosque' }, ctx), TxError);
  const acc = runTx(doc, { op: 'quest_accept', id: 'ervas_do_bosque' }, ctx);
  assert.ok(acc.doc.quests.active.ervas_do_bosque);
  assert.throws(() => runTx(acc.doc, { op: 'quest_turnin', id: 'ervas_do_bosque' }, ctx), /não está completa/);
  assert.throws(() => runTx(acc.doc, { op: 'quest_accept', id: 'ervas_do_bosque' }, ctx), /já fez/);
  assert.throws(() => runTx(doc, { op: 'quest_accept', id: 'nao_existe' }, ctx), TxError);
  const done = structuredClone(acc.doc); done.quests.active.ervas_do_bosque.p = [2];
  const turned = runTx(done, { op: 'quest_turnin', id: 'ervas_do_bosque' }, ctx);
  assert.ok(turned.doc.quests.done.ervas_do_bosque); assert.equal(turned.doc.quests.active.ervas_do_bosque, undefined);
  assert.ok(turned.doc.gold > done.gold || turned.doc.xp !== done.xp || turned.doc.potions > done.potions, 'recompensa paga');
  assert.throws(() => runTx(doc, { op: 'claim_daily', id: 'inexistente' }, ctx), /indispon/);
});

test('servidor: compra/venda/aprimoramento na Vila gravam no banco e respondem tx_result; o cliente não define preço', async () => {
  const { db, srv, c, ch, patch, tx } = await setup();
  patch((d) => { d.gold = 50000; });
  const doc0 = db.character(ch).doc, it = buildShopStock(doc0)[0];
  let r = await tx({ op: 'buy_item', id: it.id, shop: 'town' });
  assert.equal(r.ok, true); assert.equal(r.sync, true);
  const doc = db.character(ch).doc;
  assert.ok(doc.inventory.some((i) => i.id === it.id)); assert.equal(doc.gold, 50000 - r.price);
  r = await tx({ op: 'enhance', id: it.id });
  assert.equal(r.ok, true); assert.equal(r.plus, 1);
  assert.equal(db.character(ch).doc.inventory.find((i) => i.id === it.id).plus, 1);
  r = await tx({ op: 'sell', id: it.id, shop: 'town' });
  assert.equal(r.ok, true); assert.equal(db.character(ch).doc.inventory.length, 0);
  r = await tx({ op: 'sell', id: it.id, shop: 'town' });
  assert.equal(r.ok, false, 'vender de novo falha');
  r = await tx({ op: 'buy_potion', n: 2, shop: 'town' });
  assert.equal(db.character(ch).doc.potions, doc0.potions + 2);
  // 'price' e 'gold' vindos do cliente são ignorados (campos fora da lista branca)
  const g = db.character(ch).doc.gold;
  srv.step(10); c.send({ t: 'tx', req: 99, op: 'buy_potion', n: 1, price: 0, gold: 1e9 });
  await c.waitFor((m) => m.t === 'tx_result' && m.req === 99);
  assert.equal(db.character(ch).doc.gold, g - PRICES.potion(doc0.level));
  assert.ok(db.audits('tx', 20).length >= 4, 'transações ficam na auditoria');
  await closeAll(srv, c);
});

test('servidor: lugar certo para cada serviço (Porto só no Porto, Vila só na Vila) e limite de ritmo', async () => {
  const { db, srv, c, ch, patch, sessionOf, tx } = await setup();
  patch((d) => { d.gold = 50000; });
  let r = await tx({ op: 'bank_deposit', id: 'x' });
  assert.equal(r.ok, false); assert.equal(r.code, 'not_here');
  r = await tx({ op: 'buy_potion', n: 1, shop: 'harbor' });
  assert.equal(r.code, 'not_here');
  sessionOf().hubAt = 'harbor';
  r = await tx({ op: 'buy_potion', n: 1, shop: 'town' });
  assert.equal(r.code, 'not_here', 'a loja da Vila não atende no Porto');
  r = await tx({ op: 'buy_potion', n: 1, shop: 'harbor' });
  assert.equal(r.ok, true);
  const hs = buildHarborStock(db.character(ch).doc, { day: dayUTC(Date.now()) })[0];
  r = await tx({ op: 'buy_item', id: hs.id, shop: 'harbor' });
  assert.equal(r.ok, true, r.reason);
  r = await tx({ op: 'bank_deposit', id: hs.id });
  assert.equal(r.ok, true); assert.equal(db.character(ch).doc.bank.length, 1);
  // ritmo: pedidos sem o relógio avançar -> reject tx_wait
  srv.step(10);
  c.send({ t: 'tx', op: 'buy_potion', n: 1, shop: 'harbor', req: 1 });
  c.send({ t: 'tx', op: 'buy_potion', n: 1, shop: 'harbor', req: 2 });
  await c.waitFor((m) => m.t === 'reject' && m.code === 'tx_wait');
  await closeAll(srv, c);
});

test('servidor: convidado (sem personagem no banco) não faz transações', async () => {
  const srv = createGameServer({ port: 0, host: '127.0.0.1', autoTick: false });
  await srv.ready;
  const c = await connect(srv);
  c.send({ t: 'hello', name: 'Conv', classId: 'warrior' });
  await c.waitFor((m) => m.t === 'welcome');
  c.send({ t: 'tx', op: 'buy_potion', n: 1 });
  await c.waitFor((m) => m.t === 'reject' && m.code === 'bad_character');
  await closeAll(srv, c);
});

test('instância: baú abre só perto, paga no servidor, tem recarga e não existe fora da instância', async () => {
  const { db, srv, c, ch, tx } = await setup();
  let r = await tx({ op: 'chest', id: 'forest:1' });
  assert.equal(r.code, 'not_here', 'fora da instância não há baú');
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  const me = srv.actor(j.you), chest = ZONES.forest.chests[0];
  r = await tx({ op: 'chest', id: chest.id });
  assert.equal(r.ok, false); assert.match(r.reason, /perto/);
  r = await tx({ op: 'chest', id: 'forest:99' });
  assert.equal(r.ok, false);
  r = await tx({ op: 'chest', id: 'plains:1' });
  assert.equal(r.ok, false, 'baú de outra zona não existe aqui');
  const g0 = db.character(ch).doc.gold;
  me.x = chest.x + 20; me.y = chest.y;
  r = await tx({ op: 'chest', id: chest.id });
  assert.equal(r.ok, true, r.reason); assert.ok(r.gold > 0);
  const d = db.character(ch).doc;
  assert.ok(d.gold >= g0 + r.gold, 'ouro do baú gravado'); assert.equal(d.stats.chests, 1); assert.ok(d.chests[chest.id] > 0);
  r = await tx({ op: 'chest', id: chest.id });
  assert.equal(r.ok, false); assert.match(r.reason, /vazio/);
  // morto não abre
  const c2 = ZONES.forest.chests[1];
  me.x = c2.x; me.y = c2.y; me.dead = true;
  r = await tx({ op: 'chest', id: c2.id });
  assert.equal(r.ok, false);
  await closeAll(srv, c);
});

test('instância: loja, banco, ferreiro e missões são recusados; poção cura, debita e tem recarga; spirit troca o ator', async () => {
  const { db, srv, c, ch, patch, tx } = await setup();
  patch((d) => { d.gold = 90000; d.potions = 3; });
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  const me = srv.actor(j.you), room = srv.hub.zoneRooms.values().next().value;
  for (const op of [{ op: 'buy_potion', n: 1 }, { op: 'sell', id: 'x' }, { op: 'enhance', id: 'x' }, { op: 'quest_accept', id: 'caca_aos_lobos' }, { op: 'bank_deposit', id: 'x' }]) {
    const r = await tx(op); assert.equal(r.code, 'not_here', op.op);
  }
  assert.equal(db.character(ch).doc.potions, 3);
  // poção com vida cheia é recusada e não gasta
  let r = await tx({ op: 'potion' });
  assert.equal(r.ok, false); assert.equal(r.code, 'full'); assert.equal(db.character(ch).doc.potions, 3);
  me.hp = Math.round(me.maxHp * 0.2);
  r = await tx({ op: 'potion' });
  assert.equal(r.ok, true); assert.equal(r.sync, false); assert.equal(r.potions, 2);
  assert.ok(me.hp >= me.maxHp * 0.2 + me.maxHp * 0.34, `curou ~35% (${me.hp}/${me.maxHp})`);
  assert.equal(db.character(ch).doc.potions, 2);
  me.hp = 5;
  r = await tx({ op: 'potion' }); // tx() avança 10 ticks (0,17 s) < 8 s de recarga
  assert.equal(r.code, 'cooldown'); assert.equal(db.character(ch).doc.potions, 2);
  srv.step(60 * 8);
  r = await tx({ op: 'potion' });
  assert.equal(r.ok, true); assert.equal(db.character(ch).doc.potions, 1);
  // sem poção
  patch((d) => { d.potions = 0; }); me.hp = 5; srv.step(60 * 9);
  r = await tx({ op: 'potion' });
  assert.equal(r.ok, false); assert.match(r.reason, /Sem poções/);
  // spirit: o ator do spirit existe na sala e troca ao mudar o ativo
  const spirits = () => room.world.actors.filter((a) => a.kind === 'spirit');
  assert.equal(spirits().length, 1); assert.equal(spirits()[0].owner, me.id);
  r = await tx({ op: 'spirit_set', id: 'nao-e-meu' });
  assert.equal(r.ok, false);
  patch((d) => { d.spirits.push({ ...d.spirits[0], id: 'sp-outro', type: d.spirits[0].type === 'zephyr' ? 'ember' : 'zephyr' }); });
  r = await tx({ op: 'spirit_set', id: 'sp-outro' });
  assert.equal(r.ok, true); assert.equal(r.sync, false);
  assert.equal(db.character(ch).doc.activeSpirit, 'sp-outro');
  assert.equal(spirits().length, 1, 'um spirit por herói');
  assert.equal(spirits()[0].spiritType, db.character(ch).doc.spirits.find((s) => s.id === 'sp-outro').type);
  // sair da instância remove o spirit
  c.send({ t: 'zone_leave' }); await c.waitFor((m) => m.t === 'zone_exit');
  assert.equal(room.world.actors.filter((a) => a.kind === 'spirit').length, 0);
  await closeAll(srv, c);
});

test('instância: o Zéfiro dá +12% de velocidade ao herói', async () => {
  const { srv, c, patch } = await setup();
  patch((d) => { d.spirits[0].type = 'zephyr'; });
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  assert.equal(srv.actor(j.you).speedMul, 1.12);
  await closeAll(srv, c);
});
