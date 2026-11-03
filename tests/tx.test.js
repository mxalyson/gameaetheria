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

// ---------------- rodada: ganhos locais viram transações (spirits, reciclagem, lore, equipamento/atributos) ----------------
import { SPIRIT_RARITY_MUL, MAX_SPIRITS } from '../public/src/data/spirits.js';
import { SPIRIT_EVO_QUEST, QUESTS } from '../public/src/data/quests.js';
import { generateItem } from '../public/src/core/loot.js';
import { checkSave } from '../server/plausible.js';

test('protocolo: ops novas (spirit_free/spirit_evolve/buy_essence/recycle/lore/equip/unequip/alloc/alloc_auto) têm campos validados e extras somem', () => {
  assert.deepEqual(TX({ op: 'buy_essence', kind: 'prism', req: 2, ouro: 9 }).msg, { t: 'tx', op: 'buy_essence', req: 2, kind: 'prism' });
  assert.equal(TX({ op: 'buy_essence', kind: 'ouro' }).ok, false); assert.equal(TX({ op: 'buy_essence' }).ok, false);
  assert.equal(TX({ op: 'spirit_free' }).ok, false); assert.ok(TX({ op: 'spirit_free', id: 'sp1' }).ok); assert.ok(TX({ op: 'spirit_evolve', id: 'sp1' }).ok);
  assert.deepEqual(TX({ op: 'recycle', ids: ['a', 'b', 'c'] }).msg.ids, ['a', 'b', 'c']);
  assert.equal(TX({ op: 'recycle', ids: ['a', 'b'] }).ok, false); assert.equal(TX({ op: 'recycle', ids: ['a', 'b', '../c'] }).ok, false); assert.equal(TX({ op: 'recycle', ids: 'abc' }).ok, false);
  assert.ok(TX({ op: 'lore', id: 'forest' }).ok); assert.equal(TX({ op: 'lore' }).ok, false);
  assert.ok(TX({ op: 'unequip', slot: 'weapon' }).ok); assert.equal(TX({ op: 'unequip', slot: 'tail' }).ok, false);
  assert.deepEqual(TX({ op: 'alloc', stat: 'str', n: 5 }).msg, { t: 'tx', op: 'alloc', req: 0, stat: 'str', n: 5 });
  assert.equal(TX({ op: 'alloc', stat: 'luck', n: 1 }).ok, false); assert.equal(TX({ op: 'alloc', stat: 'str', n: 0 }).ok, false); assert.equal(TX({ op: 'alloc', stat: 'str', n: 1000 }).ok, false);
  assert.ok(TX({ op: 'alloc_auto' }).ok);
});

test('placeProblem: equipamento/atributos/spirit valem na instância e nas cidades; lore só na instância; reciclar só no Porto; spirits só fora da instância', () => {
  for (const op of ['equip', 'unequip', 'alloc', 'alloc_auto', 'spirit_set']) { assert.equal(placeProblem(op, { inZone: true }), null, op); assert.equal(placeProblem(op, { inZone: false, hubAt: null }), null, op); }
  assert.equal(placeProblem('lore', { inZone: true }), null); assert.equal(placeProblem('lore', { inZone: false }), 'not_here');
  for (const op of ['spirit_free', 'spirit_evolve', 'buy_essence', 'recycle']) assert.equal(placeProblem(op, { inZone: true }), 'not_here', op);
  assert.equal(placeProblem('recycle', { inZone: false, hubAt: null }), 'not_here'); assert.equal(placeProblem('recycle', { inZone: false, hubAt: 'harbor' }), null);
  assert.equal(placeProblem('spirit_free', { inZone: false, hubAt: null }), null);
});

test('runTx (puro): libertar spirit paga pelo nível e raridade; comprar essência cobra, sorteia no servidor e respeita o limite', () => {
  const doc = newOfficialCharacter('S', 'mage'); doc.gold = 50000; doc.level = 14;
  const sp = doc.spirits[0];
  const free = runTx(doc, { op: 'spirit_free', id: sp.id }, { rng: makeRng(1) });
  assert.equal(free.summary.gold, Math.round(30 * sp.level * SPIRIT_RARITY_MUL[sp.rarity]));
  assert.equal(free.doc.gold, 50000 + free.summary.gold); assert.equal(free.doc.spirits.length, doc.spirits.length - 1);
  assert.notEqual(free.doc.activeSpirit, sp.id);
  assert.throws(() => runTx(doc, { op: 'spirit_free', id: 'nao-existe' }, { rng: makeRng(1) }), TxError);
  const buy = runTx(doc, { op: 'buy_essence', kind: 'essence' }, { rng: makeRng(7) });
  assert.equal(buy.doc.gold, 50000 - PRICES.essence(14)); assert.equal(buy.doc.spirits.length, doc.spirits.length + 1);
  assert.equal(buy.doc.spirits.at(-1).level, 12);
  const prism = runTx(doc, { op: 'buy_essence', kind: 'prism' }, { rng: makeRng(7) });
  assert.equal(prism.doc.gold, 50000 - PRICES.prism(14)); assert.ok(['rare', 'epic', 'legendary'].includes(prism.doc.spirits.at(-1).rarity));
  assert.throws(() => runTx({ ...doc, gold: 10 }, { op: 'buy_essence', kind: 'essence' }, { rng: makeRng(7) }), /Ouro/);
  const full = structuredClone(doc); while (full.spirits.length < MAX_SPIRITS) full.spirits.push({ ...sp, id: 'f' + full.spirits.length });
  assert.throws(() => runTx(full, { op: 'buy_essence', kind: 'essence' }, { rng: makeRng(7) }), /Limite/);
});

test('runTx (puro): evoluir spirit cobra, exige missão/nível e conta o objetivo spiritStage NO SERVIDOR; reciclar troca 3 comuns por 1 raro', () => {
  const doc = newOfficialCharacter('E', 'mage'); doc.gold = 90000; doc.level = 30;
  const sp = doc.spirits[0]; sp.level = 12;
  doc.quests.done.cavaleiro_rubro = 1; doc.quests.active.ecos_unidos = { at: 1, p: [30, 0] };
  assert.throws(() => runTx(doc, { op: 'spirit_evolve', id: sp.id }, { rng: makeRng(1) }), /missão/);
  doc.quests.done[SPIRIT_EVO_QUEST[sp.type]] = 1;
  const r = runTx(doc, { op: 'spirit_evolve', id: sp.id }, { rng: makeRng(1) });
  assert.equal(r.doc.spirits[0].stage, 2); assert.ok(r.doc.gold < 90000);
  assert.deepEqual(r.doc.quests.active.ecos_unidos.p, [30, 1], 'objetivo spiritStage contado pelo servidor');
  assert.ok(r.summary.quests.includes('ecos_unidos'));
  assert.throws(() => runTx(r.doc, { op: 'spirit_evolve', id: sp.id }, { rng: makeRng(1) }), /evoluída/);
  // reciclar
  const d2 = newOfficialCharacter('R', 'warrior'); d2.level = 10;
  const rng = makeRng(3), commons = [0, 1, 2].map(() => generateItem(rng, 10, { classId: 'warrior', rarityId: 'common' }));
  d2.inventory.push(...commons);
  const out = runTx(d2, { op: 'recycle', ids: commons.map((i) => i.id) }, { rng: makeRng(4) });
  assert.equal(out.doc.inventory.length, d2.inventory.length - 2); assert.equal(out.summary.item.rarity, 'rare');
  assert.throws(() => runTx(d2, { op: 'recycle', ids: [commons[0].id, commons[0].id, commons[1].id] }, { rng: makeRng(4) }), TxError);
});

test('runTx (puro): equipar, desequipar e distribuir atributos pelo documento oficial', () => {
  const doc = newOfficialCharacter('Q', 'warrior'); doc.level = 10; doc.statPoints = 7;
  const rng = makeRng(9);
  const weapon = generateItem(rng, 5, { classId: 'warrior', rarityId: 'rare', slot: 'weapon' });
  doc.inventory.push(weapon);
  let r = runTx(doc, { op: 'equip', id: weapon.id }, { rng });
  assert.equal(r.doc.equipment.weapon.id, weapon.id); assert.ok(!r.doc.inventory.some((i) => i.id === weapon.id));
  r = runTx(r.doc, { op: 'unequip', slot: 'weapon' }, { rng });
  assert.equal(r.doc.equipment.weapon, undefined); assert.ok(r.doc.inventory.some((i) => i.id === weapon.id));
  assert.throws(() => runTx(r.doc, { op: 'unequip', slot: 'weapon' }, { rng }), /Nada equipado/);
  assert.throws(() => runTx(doc, { op: 'equip', id: 'nao-tenho' }, { rng }), /mochila/);
  r = runTx(doc, { op: 'alloc', stat: 'str', n: 5 }, { rng });
  assert.equal(r.doc.statPoints, 2); assert.equal(r.doc.alloc.str, doc.alloc.str + 5);
  r = runTx(r.doc, { op: 'alloc', stat: 'vit', n: 999 }, { rng }); // n é limitado aos pontos livres
  assert.equal(r.doc.statPoints, 0); assert.equal(r.doc.alloc.vit, doc.alloc.vit + 2);
  assert.throws(() => runTx(r.doc, { op: 'alloc', stat: 'str', n: 1 }, { rng }), /Sem pontos/);
  const a = runTx(doc, { op: 'alloc_auto' }, { rng });
  const sum = (d) => d.alloc.str + d.alloc.vit + d.alloc.agi + d.alloc.int;
  assert.equal(a.doc.statPoints, 0); assert.equal(sum(a.doc), sum(doc) + 7);
});

test('instância: equipar e distribuir pontos recalculam o ator NA HORA; reciclar/libertar/comprar essência são recusados lá; lore exige estar perto e marca só na 1ª leitura', async () => {
  const { db, srv, c, ch, patch, tx } = await setup();
  const weapon = generateItem(makeRng(5), 1, { classId: 'warrior', rarityId: 'epic', slot: 'weapon' });
  patch((d) => { d.level = 10; d.statPoints = 6; d.inventory.push(weapon); }); // nível 10: o documento só mantém pontos livres que o nível comporta
  c.send({ t: 'zone_enter', zone: 'forest', from: 'town' });
  const j = await c.waitFor((m) => m.t === 'zone_joined');
  const me = srv.actor(j.you);
  const p0 = me.stats.power, hp0 = me.maxHp;
  let r = await tx({ op: 'equip', id: weapon.id });
  assert.equal(r.ok, true, r.reason); assert.equal(r.sync, true);
  assert.ok(me.stats.power > p0, `poder subiu (${p0} -> ${me.stats.power})`);
  assert.equal(db.character(ch).doc.equipment.weapon.id, weapon.id);
  r = await tx({ op: 'alloc', stat: 'vit', n: 6 });
  assert.equal(r.ok, true, r.reason); assert.ok(me.maxHp > hp0, 'vida máxima subiu');
  assert.equal(db.character(ch).doc.statPoints, 0);
  r = await tx({ op: 'unequip', slot: 'weapon' });
  assert.equal(r.ok, true); assert.ok(me.stats.power <= p0 + 0.001, 'sem a arma o poder volta');
  for (const op of [{ op: 'spirit_free', id: 'x' }, { op: 'buy_essence', kind: 'essence' }, { op: 'spirit_evolve', id: 'x' }, { op: 'recycle', ids: ['a', 'b', 'c'] }]) assert.equal((await tx(op)).code, 'not_here', op.op);
  // lore
  const lore = ZONES.forest.lore[0];
  r = await tx({ op: 'lore', id: lore.id });
  assert.equal(r.ok, false); assert.match(r.reason, /perto/);
  r = await tx({ op: 'lore', id: 'plains' });
  assert.equal(r.ok, false, 'placa de outra zona não existe aqui');
  me.x = lore.x + 20; me.y = lore.y;
  r = await tx({ op: 'lore', id: lore.id });
  assert.equal(r.ok, true, r.reason); assert.equal(r.first, true);
  assert.equal(db.character(ch).doc.stats.lore & 1, 1);
  r = await tx({ op: 'lore', id: lore.id });
  assert.equal(r.ok, true); assert.equal(r.first, false, 'só a primeira leitura conta');
  await closeAll(srv, c);
});

test('hub: teletransporte conta o objetivo/contador `teleport` e a chegada ao Porto conta `visit` no SERVIDOR (o cliente não soma mais)', async () => {
  const { db, srv, c, ch, patch } = await setup();
  const qid = Object.values(QUESTS).find((q) => q.objectives.some((o) => o.type === 'teleport'))?.id;
  assert.ok(qid, 'existe missão com objetivo teleport');
  patch((d) => { d.level = 10; d.scrolls = 3; d.visited = { ...d.visited, forest: 1, harbor: 1 }; d.quests.active = { [qid]: { at: 1, p: QUESTS[qid].objectives.map(() => 0) } }; });
  const idx = QUESTS[qid].objectives.findIndex((o) => o.type === 'teleport');
  srv.step(60 * 6);
  c.send({ t: 'zone_teleport', zone: 'harbor' });
  await c.waitFor((m) => m.t === 'zone_exit' && m.to === 'harbor');
  let d = db.character(ch).doc;
  assert.equal(d.stats.teleports, 1); assert.equal(d.stats.harborVisits, 1); assert.equal(d.quests.active[qid].p[idx], 1);
  srv.step(60 * 6);
  c.send({ t: 'zone_teleport', zone: 'town' });
  await c.waitFor((m) => m.t === 'zone_exit' && m.to === 'town');
  d = db.character(ch).doc;
  assert.equal(d.stats.teleports, 2, 'a Vila também conta (igual ao cliente antigo)'); assert.equal(d.stats.harborVisits, 1);
  await closeAll(srv, c);
});

test('hub: vencer o duelo amistoso online conta SÓ a missão porto_duelo (sem Elo, ouro nem XP); derrota não conta e a mesma partida não paga duas vezes', async () => {
  const { db, srv, c, ch, patch } = await setup();
  patch((d) => { d.level = 10; d.quests.active.porto_duelo = { at: 1, p: [0] }; });
  const before = db.character(ch).doc;
  c.send({ t: 'queue', mode: '1v1', friendly: true });
  await c.sync(); // o servidor já processou o pedido; só então o relógio avança (amistoso completa com bot após 3 s)
  srv.step(60 * 6);
  const found = await c.waitFor((m) => m.t === 'match_found');
  assert.equal(found.friendly, true);
  const room = [...srv.hub.rooms.values()].find((r) => r.friendly);
  const mine = [...room.players.values()].find((p) => p.charId === ch);
  room.end(mine.team === 1 ? 2 : 1, 'elimination'); // derrota: nada muda
  assert.equal(db.character(ch).doc.stats.friendlyWins ?? 0, 0);
  room.state = 'fight';
  room.end(3, 'draw'); // empate: nada muda
  assert.equal(db.character(ch).doc.stats.friendlyWins ?? 0, 0);
  room.state = 'fight';
  room.end(mine.team, 'elimination');
  const msg = await c.waitFor((m) => m.t === 'friendly_reward');
  assert.ok(msg.quests.includes('porto_duelo'));
  const d = db.character(ch).doc;
  assert.equal(d.stats.friendlyWins, 1); assert.equal(d.quests.active.porto_duelo.p[0], 1);
  assert.equal(d.gold, before.gold); assert.equal(d.xp, before.xp); assert.equal(d.level, before.level);
  assert.equal(d.arena.rating, before.arena.rating); assert.equal(d.arena.wins, before.arena.wins);
  room.state = 'fight'; room.end(mine.team, 'elimination'); // mesma partida: idempotente
  assert.equal(db.character(ch).doc.stats.friendlyWins, 1);
  await closeAll(srv, c);
});

test('modo estrito: spirit novo, evolução, lore, teletransporte, visita e duelo amistoso locais são recusados; gastar ouro segue valendo', () => {
  const old = newOfficialCharacter('Z', 'warrior'); old.level = 12; old.gold = 5000;
  const strict = (n) => checkSave(old, n, Date.now(), { strictPve: true });
  const mk = (f) => { const n = structuredClone(old); f(n); return n; };
  assert.equal(strict(mk((n) => { n.spirits.push({ ...n.spirits[0], id: 'novo' }); })).reason, 'pve_spirit');
  assert.equal(strict(mk((n) => { n.spirits[0].stage = 2; })).reason, 'pve_spirit_stage');
  assert.equal(strict(mk((n) => { n.stats.lore = 1; })).reason, 'pve_lore');
  assert.equal(strict(mk((n) => { n.stats.teleports = 1; })).reason, 'pve_stat_teleports');
  assert.equal(strict(mk((n) => { n.stats.harborVisits = 1; })).reason, 'pve_stat_harborVisits');
  assert.equal(strict(mk((n) => { n.stats.friendlyWins = 1; })).reason, 'pve_stat_friendlyWins');
  const sc = strict(mk((n) => { n.scrolls = 3; n.gold -= 500; }));
  assert.equal(sc.ok, true); assert.equal(sc.doc.scrolls, old.scrolls ?? 0, 'pergaminho local é descartado (só a transação buy_scroll vale)');
  assert.equal(strict(mk((n) => { n.gold -= 100; })).ok, true);
});

test('objetivos visit/teleport/lore/spiritStage/friendlyDuel só valem se o SERVIDOR os contou (progresso do cliente é descartado no estrito)', () => {
  const old = newOfficialCharacter('Y', 'warrior'); old.level = 12;
  old.quests.active.porto_duelo = { at: 1, p: [0] };
  const neu = structuredClone(old); neu.quests.active.porto_duelo.p = [1];
  const r = checkSave(old, neu, Date.now(), { strictPve: true });
  assert.equal(r.ok, true); assert.equal(r.doc.quests.active.porto_duelo.p[0], 0, 'cliente não conta o duelo amistoso');
  const lax = checkSave(old, neu, Date.now());
  assert.equal(lax.doc.quests.active.porto_duelo.p[0], 1, 'sem o modo estrito (STRICT_PVE=0) segue como antes');
  const done = structuredClone(neu); delete done.quests.active.porto_duelo; done.quests.done.porto_duelo = Date.now();
  assert.equal(checkSave(old, done, Date.now(), { strictPve: true }).reason, 'pve_quest', 'no estrito nenhuma missão é concluída pelo cliente (só a transação quest_turnin)');
});

test('runTx (puro): escudo equipa/desequipa para Guerreiro e Clérigo; Mago e Arqueiro recusam; slot offhand passa no protocolo', () => {
  const rng = makeRng(21);
  for (const [cid, ok] of [['warrior', true], ['cleric', true], ['mage', false], ['archer', false]]) {
    const doc = newOfficialCharacter('S', cid); doc.level = 10;
    const sh = generateItem(rng, 5, { classId: ok ? cid : 'warrior', rarityId: 'rare', slot: 'offhand' });
    sh.classId = cid; // item da classe do dono (a recusa vem da regra de escudo, não da classe do item)
    doc.inventory.push(sh);
    if (ok) {
      const r = runTx(doc, { op: 'equip', id: sh.id }, { rng });
      assert.equal(r.doc.equipment.offhand.id, sh.id);
      const u = runTx(r.doc, { op: 'unequip', slot: 'offhand' }, { rng });
      assert.equal(u.doc.equipment.offhand, undefined); assert.ok(u.doc.inventory.some((i) => i.id === sh.id));
    } else assert.throws(() => runTx(doc, { op: 'equip', id: sh.id }, { rng }), TxError);
  }
  assert.ok(TX({ op: 'unequip', slot: 'offhand' }).ok);
});

test('craft (Forja do Eco): fragmentos + ouro viram 1 arma e 1 armadura Eco por personagem; o servidor decide tudo', async () => {
  const { craftEcho, ownsEcho } = await import('../public/src/core/echo.js');
  const { ECHO_RECIPES, ECHO_NAMES, ECHO_ITEM, CRYPT } = await import('../public/src/data/crypt.js');
  const { checkSave } = await import('../server/plausible.js');
  const { validate } = await import('../public/src/core/savedoc.js');
  assert.deepEqual(TX({ op: 'craft', id: 'eco_weapon', gold: 0 }).msg, { t: 'tx', op: 'craft', req: 0, id: 'eco_weapon' });
  assert.equal(TX({ op: 'craft' }).ok, false);
  assert.equal(placeProblem('craft', { inZone: true }), 'not_here'); assert.equal(placeProblem('craft', { inZone: false, hubAt: null }), null);
  assert.equal(placeProblem('craft', { inZone: false, hubAt: 'harbor' }), 'not_here', 'o Ferreiro é da Vila');
  const doc = newOfficialCharacter('Forja', 'mage'); doc.level = 25; doc.gold = 10_000; doc.echo = { frags: 120, keys: 0, entry: 0 };
  const ctx = { rng: makeRng(5), now: Date.now() };
  // falhas: receita desconhecida, fragmentos/ouro/nível/mochila; o original não muda
  assert.throws(() => runTx(doc, { op: 'craft', id: 'eco_lanca' }, ctx), TxError);
  assert.throws(() => runTx({ ...doc, echo: { frags: 39, keys: 0, entry: 0 } }, { op: 'craft', id: 'eco_weapon' }, ctx), /Faltam fragmentos/);
  assert.throws(() => runTx({ ...doc, gold: 100 }, { op: 'craft', id: 'eco_weapon' }, ctx), /Ouro insuficiente/);
  assert.throws(() => runTx({ ...doc, level: 19 }, { op: 'craft', id: 'eco_weapon' }, ctx), TxError);
  assert.equal(doc.echo.frags, 120); assert.equal(doc.gold, 10_000);
  const r = runTx(doc, { op: 'craft', id: 'eco_weapon' }, ctx);
  const it = r.doc.inventory.find((x) => x.eco);
  assert.ok(it && it.slot === 'weapon' && it.weaponType === 'staff' && it.classId === 'mage' && it.rarity === 'epic');
  assert.equal(it.name, ECHO_NAMES.weapon.staff);
  assert.equal(r.doc.echo.frags, 120 - ECHO_RECIPES.eco_weapon.frags); assert.equal(r.doc.gold, 10_000 - ECHO_RECIPES.eco_weapon.gold);
  assert.ok(it.stats.crit >= ECHO_ITEM.weapon.crit && it.stats.atk > 0);
  assert.equal(r.summary.name, it.name); assert.equal(r.summary.fragsTotal, r.doc.echo.frags);
  assert.ok(ownsEcho(r.doc, 'weapon') && !ownsEcho(r.doc, 'armor'));
  assert.throws(() => runTx(r.doc, { op: 'craft', id: 'eco_weapon' }, ctx), /já possui/); // 1 por personagem (também equipado)
  const eq = structuredClone(r.doc); eq.equipment.weapon = eq.inventory.pop();
  assert.throws(() => runTx(eq, { op: 'craft', id: 'eco_weapon' }, ctx), /já possui/);
  const r2 = runTx(r.doc, { op: 'craft', id: 'eco_armor' }, ctx);
  const ar = r2.doc.inventory.find((x) => x.eco && x.slot === 'armor');
  assert.equal(ar.name, ECHO_NAMES.armor.mage); assert.ok(ar.stats.vit > 0 && ar.stats.def > 0 && ar.classId === 'mage');
  // o item Eco sobrevive à validação do documento e NÃO pode ser forjado pelo cliente (plausibilidade)
  assert.ok(validate(structuredClone(r2.doc)).char.inventory.every((x) => x.eco === true || !x.eco));
  assert.equal(validate(structuredClone(r2.doc)).char.inventory.filter((x) => x.eco).length, 2);
  const old = validate(structuredClone(doc)).char, forged = structuredClone(old);
  forged.inventory.push({ ...structuredClone(it), id: 'iForjado' });
  assert.equal(checkSave(old, forged).ok, false, 'item Eco criado pelo cliente é recusado');
  assert.equal(checkSave(old, forged, Date.now(), { strictPve: true }).ok, false);
  const more = structuredClone(old); more.echo.frags += 10; // fragmentos só vêm do servidor
  assert.equal(checkSave(old, more, Date.now(), { strictPve: true }).reason, 'pve_echo');
  assert.equal(checkSave(old, more).doc.echo.frags, old.echo.frags, 'fora do modo estrito o valor oficial prevalece');
  assert.ok(CRYPT.frags.cap >= 120);
});

test('servidor: craft grava no banco, responde tx_result e some quando o personagem não tem fragmentos', async () => {
  const { srv, db, c, ch, patch, tx } = await setup();
  patch((x) => { x.level = 22; x.gold = 5000; x.echo = { frags: 45, keys: 0, entry: 0 }; });
  const bad = await tx({ op: 'craft', id: 'eco_armor' });
  assert.equal(bad.ok, false); assert.match(bad.reason, /Faltam fragmentos/);
  const ok = await tx({ op: 'craft', id: 'eco_weapon' });
  assert.equal(ok.ok, true); assert.equal(ok.sync, true); assert.equal(ok.name, 'Lâmina do Eco');
  const doc = db.character(ch).doc;
  assert.equal(doc.echo.frags, 5); assert.equal(doc.gold, 2500); assert.ok(doc.inventory.some((x) => x.eco && x.weaponType === 'sword'));
  const again = await tx({ op: 'craft', id: 'eco_weapon' });
  assert.equal(again.ok, false);
  await closeAll(srv, c);
});
