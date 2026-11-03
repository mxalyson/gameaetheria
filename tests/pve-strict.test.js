import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../server/db.js';
import { createApi, newOfficialCharacter } from '../server/api.js';
import { checkSave, pveProblem } from '../server/plausible.js';
import { runTx } from '../server/tx.js';
import { buildShopStock } from '../public/src/shop.js';
import { generateItem } from '../public/src/core/loot.js';
import { makeRng } from '../public/src/core/rng.js';

// P11.3: no modo estrito o salvamento do cliente NÃO pode render PvE (XP, ouro, poções, itens, aprimoramento, abates, baús, missões).
const base = () => { const d = newOfficialCharacter('Estrito', 'warrior'); d.gold = 500; d.potions = 3; return d; };
const strict = (o, n) => checkSave(o, n, Date.now(), { strictPve: true });
const loose = (o, n) => checkSave(o, n, Date.now());

test('estrito: ganhos de PvE vindos do cliente são recusados, um motivo para cada canal', () => {
  const old = base();
  const cases = {
    pve_gold: (d) => { d.gold += 50; },
    pve_potions: (d) => { d.potions += 1; },
    pve_xp: (d) => { d.xp += 5; },
    pve_items: (d) => { const it = generateItem(makeRng(5), 1, { classId: 'warrior' }); it.id = 'forjado'; d.inventory.push(it); },
    pve_stat_kills: (d) => { d.stats.kills += 3; },
    pve_stat_bossKills: (d) => { d.stats.bossKills += 1; },
    pve_stat_chests: (d) => { d.stats.chests += 1; },
    pve_chest: (d) => { d.chests = { 'forest:1': Date.now() }; },
    pve_quest: (d) => { d.quests.done.primeiros_passos = Date.now(); },
  };
  for (const [why, fn] of Object.entries(cases)) {
    const neu = structuredClone(old); fn(neu);
    const r = strict(old, neu);
    assert.equal(r.ok, false, why); assert.equal(r.reason, why);
  }
  // mesmo ganho pequeno, que o modo normal tolera, é recusado no estrito
  const small = structuredClone(old); small.gold += 50;
  assert.equal(loose(old, small).ok, true, 'modo normal ainda aceita (limites de plausibilidade)');
  assert.equal(strict(old, small).ok, false);
});

test('estrito: gastar ouro, mover/equipar itens e trocar spirit continuam valendo; sem mudança passa', () => {
  const old = base(); old.gold = 5000;
  const it = generateItem(makeRng(9), 1, { classId: 'warrior', slot: 'helm' }); it.id = 'i-1'; old.inventory.push(it);
  assert.equal(strict(old, structuredClone(old)).ok, true, 'igual passa');
  const spent = structuredClone(old); spent.gold -= 1000;
  assert.equal(strict(old, spent).ok, true, 'gastar ouro');
  const eq = structuredClone(old); eq.equipment.helm = eq.inventory.pop();
  assert.equal(strict(old, eq).ok, true, 'equipar item que já era dele');
  assert.equal(pveProblem(old, spent), null);
});

test('estrito: o resultado de uma transação do servidor é o documento oficial (não passa pelo cliente) e o save seguinte, igual a ele, é aceito', () => {
  const old = base(); old.gold = 90000;
  const it = buildShopStock(old)[0];
  const out = runTx(old, { op: 'buy_item', id: it.id, shop: 'town' }, { rng: makeRng(1), now: Date.now() });
  // o cliente re-lê o documento e salva de volta o MESMO documento: nada novo
  assert.equal(strict(out.doc, structuredClone(out.doc)).ok, true);
  // mas se o cliente tentasse comprar sozinho (item novo + ouro menor) o estrito recusa: item novo só vem do servidor
  const sozinho = structuredClone(old); sozinho.inventory.push({ ...out.doc.inventory[0] }); sozinho.gold -= 100;
  assert.equal(strict(old, sozinho).ok, false);
  assert.equal(strict(old, sozinho).reason, 'pve_items');
});

test('API: createApi({ strictPve }) recusa o PUT com ganho de PvE (422 implausible) e aceita sem a opção', async () => {
  for (const strictPve of [true, false]) {
    const db = openDb(':memory:');
    const api = createApi(db, { strictPve });
    const srv = api.server(); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port;
    const call = (method, path, body, token) => new Promise((resolve, reject) => {
      const data = body === undefined ? null : JSON.stringify(body);
      const req = http.request({ host: '127.0.0.1', port, method, path, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
        let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => resolve({ status: res.statusCode, body: t ? JSON.parse(t) : null }));
      });
      req.on('error', reject); if (data) req.write(data); req.end();
    });
    const reg = await call('POST', '/api/register', { email: 'e@exemplo.com', password: 'Senha-forte-123!' });
    const token = reg.body.token ?? reg.body.session;
    const c = (await call('POST', '/api/characters', { name: 'Api', classId: 'mage' }, token)).body;
    const d = structuredClone(c.character); d.gold += 30;
    const r = await call('PUT', `/api/characters/${c.id}`, { doc: d, rev: 0 }, token);
    if (strictPve) { assert.equal(r.status, 422); assert.match(r.body.message ?? r.body.error ?? '', /pve_gold|implausible/); }
    else assert.equal(r.status, 200);
    await new Promise((res) => srv.close(res));
  }
});

test('especialização: o cliente não troca de graça nem forja Selo (modo normal e estrito); a primeira escolha passa', () => {
  const old = base(); old.level = 20; old.quests.done.prova_do_mestre = 1;
  const first = structuredClone(old); first.spec = 'paladin';
  assert.equal(strict(old, first).ok, true, 'primeira escolha é grátis'); assert.equal(loose(old, first).ok, true);
  const noProva = structuredClone(first); noProva.quests.done = {};
  assert.equal(loose(old, noProva).ok, false);
  const wrong = structuredClone(old); wrong.spec = 'sniper'; // de outra classe
  assert.equal(strict(old, wrong).reason, 'spec_forged');
  const has = structuredClone(first);
  const swap = structuredClone(has); swap.spec = 'berserker';
  for (const f of [strict, loose]) { const r = f(has, swap); assert.equal(r.ok, false); assert.equal(r.reason, 'spec_forged'); }
  const swapSeal = structuredClone(swap); swapSeal.seals = 1; // forjar o Selo junto não adianta
  assert.equal(strict(has, swapSeal).reason, 'spec_forged');
  const unspec = structuredClone(has); unspec.spec = null; assert.equal(loose(has, unspec).reason, 'spec_forged');
  const sealOnly = structuredClone(has); sealOnly.seals = 3; sealOnly.specChanges = 9;
  const kept = loose(has, sealOnly);
  assert.equal(kept.ok, true); assert.equal(kept.doc.seals, 0, 'Selo é do servidor'); assert.equal(kept.doc.specChanges, 0);
  // id antigo no banco x id novo no cliente não é "troca"
  const legacy = structuredClone(has); legacy.spec = 'bastion';
  assert.equal(loose(legacy, has).ok, true);
});

test('especialização: o resultado de respec/respec_buy do servidor é aceito como estado oficial e o save seguinte, igual, passa', () => {
  const doc = base(); doc.level = 20; doc.gold = 30000; doc.quests.done.prova_do_mestre = 1;
  const ctx = { rng: makeRng(2), now: Date.now() };
  let cur = runTx(doc, { op: 'respec', id: 'paladin' }, ctx).doc;
  cur = runTx(cur, { op: 'respec_buy' }, ctx).doc;
  const swapped = runTx(cur, { op: 'respec', id: 'berserker' }, ctx).doc;
  assert.equal(strict(swapped, structuredClone(swapped)).ok, true);
  const withSeal = runTx(cur, { op: 'respec_buy' }, ctx).doc;
  assert.equal(strict(cur, withSeal).doc.seals, cur.seals, 'o cliente não ganha Selo sozinho');
});
