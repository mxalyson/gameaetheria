// Porto de Marfim e dia/noite: ciclo de luz (core/daycycle.js), banco (core/bank.js), contratos diários (core/journal.js) e loja do porto (shop.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../public/src/core/rng.js';
import { newCharacter } from '../public/src/core/progression.js';
import { generateItem } from '../public/src/core/loot.js';
import { INVENTORY_SIZE } from '../public/src/data/items.js';
import { dayPhase, isNight, nightMods, hourFromMs, parseHora, zoneHasCycle, DAY_SECONDS, PHASES } from '../public/src/core/daycycle.js';
import { NIGHT } from '../public/src/data/mobs.js';
import { ZONES } from '../public/src/data/zones.js';
import { skyTint } from '../public/src/render/sky.js';
import { BANK_SIZE, depositItem, withdrawItem, bankFree } from '../public/src/core/bank.js';
import { dailyBoard, dayUTC, recordEvent, claimDaily, dailyComplete, dailyState, DAILY_COUNT } from '../public/src/core/journal.js';
import { validate } from '../public/src/core/savedoc.js';
import { checkSave } from '../server/plausible.js';
import { buildShopStock, buildHarborStock, harborSellValue, HARBOR, PRICES } from '../public/src/shop.js';

const hero = (level = 5, classId = 'warrior') => { const c = newCharacter('Heroi', classId, makeRng(5)); c.level = level; return c; };
const item = (rng, lvl = 5) => generateItem(rng, lvl, { classId: 'warrior' });

test('ciclo: 12 min reais por dia; fases aurora, dia, entardecer e noite nas horas esperadas', () => {
  assert.equal(DAY_SECONDS, 720);
  const d = (h) => dayPhase(h);
  assert.equal(d(3).name, 'night'); assert.equal(d(6).name, 'dawn'); assert.equal(d(12).name, 'day'); assert.equal(d(21.7).name, 'dusk'); assert.equal(d(23).name, 'night');
  assert.equal(d(24).name, 'night'); assert.equal(d(-1).name, 'night'); assert.equal(d(30).name, 'dawn', 'dá a volta (30h = 6h)');
  // duração real de cada fase (30 s por hora): dia 7 min, noite 3,5 min, aurora e entardecer 45 s
  const sec = (a, b) => (b - a) * (DAY_SECONDS / 24);
  assert.equal(sec(...PHASES.day), 420); assert.equal(sec(...PHASES.dawn), 45); assert.equal(sec(...PHASES.dusk), 45);
  assert.equal(sec(0, 24 - (PHASES.dusk[1] - PHASES.dawn[0])), 210);
  // escuridão contínua e monotônica: 0 de dia, 1 de noite, sobe no entardecer e desce na aurora
  assert.equal(d(12).dark, 0); assert.equal(d(2).dark, 1);
  let prev = -1; for (let h = 21; h <= 22.5; h += 0.05) { const k = d(h).dark; assert.ok(k >= prev - 1e-9); prev = k; }
  prev = 2; for (let h = 5.5; h <= 7; h += 0.05) { const k = d(h).dark; assert.ok(k <= prev + 1e-9); prev = k; }
  for (const h of [5.5, 7, 21, 22.5]) assert.ok(Math.abs(dayPhase(h - 1e-6).dark - dayPhase(h + 1e-6).dark) < 1e-3, 'sem salto em ' + h);
});

test('ciclo: relógio de parede, ?hora= e bônus noturno determinísticos', () => {
  assert.equal(hourFromMs(0), 0); assert.equal(hourFromMs(30_000), 1); assert.equal(hourFromMs(720_000), 0); assert.equal(hourFromMs(735_000), 0.5);
  assert.equal(parseHora('?x=1&hora=22'), 22); assert.equal(parseHora('?hora=6,5'), 6.5); assert.equal(parseHora('?hora=25'), null); assert.equal(parseHora(''), null); assert.equal(parseHora('?hora=abc'), null);
  assert.equal(parseHora('?hora=24'), 0);
  assert.ok(isNight(0) && isNight(23) && !isNight(12) && !isNight(7) && !isNight(6.9));
  assert.deepEqual(nightMods(12), { aggroMul: 1, rewardMul: 1 });
  assert.deepEqual(nightMods(1), { aggroMul: NIGHT.aggroMul, rewardMul: NIGHT.rewardMul });
  assert.equal(NIGHT.aggroMul, 1.1); assert.equal(NIGHT.rewardMul, 1.15);
  assert.equal(JSON.stringify(dayPhase(13.37)), JSON.stringify(dayPhase(13.37)), 'puro');
});

test('ciclo: só ao ar livre (arenas e salas fixas ficam de fora) e cor do ar coerente por hora', () => {
  for (const id of ['town', 'harbor', 'forest', 'plains', 'ruins', 'glacier', 'ember']) assert.ok(zoneHasCycle(ZONES[id]), id);
  for (const id of ['arena', 'arena_team', 'waves']) assert.ok(!zoneHasCycle(ZONES[id]), id);
  assert.ok(!zoneHasCycle({ fixedLight: true }));
  assert.equal(skyTint(12)[3], 0, 'sem véu de dia');
  assert.ok(skyTint(2)[3] > 0.4 && skyTint(2)[2] > skyTint(2)[0], 'noite azul-marinho');
  const dawn = [...skyTint(6.25)], dusk = [...skyTint(21.75)];
  assert.ok(dawn[0] > 200 && dawn[0] > dawn[2], 'aurora laranja'); assert.ok(dusk[0] > dusk[1] && dusk[2] > 100, 'entardecer rosado');
});

test('banco: guardar e retirar, limites de 40 vagas e da mochila, sem perder nem duplicar itens', () => {
  const c = hero(), rng = makeRng(2);
  c.inventory = Array.from({ length: 12 }, () => item(rng)); const ids = c.inventory.map((i) => i.id);
  assert.equal(bankFree(c), BANK_SIZE); assert.equal(BANK_SIZE, 40);
  assert.equal(depositItem(c, 'inexistente').ok, false);
  const r = depositItem(c, ids[0]); assert.ok(r.ok);
  assert.equal(c.inventory.length, 11); assert.equal(c.bank.length, 1); assert.equal(depositItem(c, ids[0]).ok, false, 'já saiu da mochila');
  assert.ok(withdrawItem(c, ids[0]).ok); assert.equal(c.bank.length, 0); assert.equal(c.inventory.length, 12);
  assert.equal(withdrawItem(c, ids[0]).ok, false);
  // banco cheio
  c.bank = Array.from({ length: BANK_SIZE }, () => item(rng)); const before = c.inventory.length;
  const full = depositItem(c, ids[1]); assert.ok(!full.ok && /cheio/.test(full.reason)); assert.equal(c.inventory.length, before, 'falha não muda nada');
  // mochila cheia
  c.inventory = Array.from({ length: INVENTORY_SIZE }, () => item(rng)); const bid = c.bank[0].id;
  assert.ok(!withdrawItem(c, bid).ok); assert.equal(c.bank.length, BANK_SIZE);
  const all = [...c.inventory, ...c.bank].map((i) => i.id); assert.equal(new Set(all).size, all.length);
});

test('banco: o save valida (limite, duplicata, item forjado) e o servidor conta os itens guardados', () => {
  const c = hero(10), rng = makeRng(3);
  const a = item(rng, 10), b = item(rng, 10);
  c.inventory = [a]; c.bank = [b, { ...a }, { kind: 'gear', id: 'x', slot: 'nada' }];
  const v = validate(c); assert.ok(v.ok);
  assert.deepEqual(v.char.bank.map((i) => i.id), [b.id], 'duplicata do inventário e item inválido saem');
  c.bank = Array.from({ length: 60 }, () => item(rng, 10)); assert.equal(validate(c).char.bank.length, BANK_SIZE);
  assert.deepEqual(validate({ ...hero(), bank: 'lixo' }).char.bank, []);
  // plausibilidade: item que apenas muda de lugar (mochila → banco → mochila) não é "novo" nem vira "forjado"
  const old = validate({ ...hero(10), inventory: [a], created: 1 }).char, moved = structuredClone(old);
  moved.bank = moved.inventory; moved.inventory = [];
  assert.ok(checkSave(old, moved).ok, 'guardar no banco');
  assert.ok(checkSave(moved, old).ok, 'retirar do banco');
  // um item adulterado dentro do banco é pego
  const forged = structuredClone(moved); forged.bank[0].stats.atk += 500;
  assert.equal(checkSave(moved, forged).reason, 'item_tampered');
  // um item novo e absurdo escondido no banco também
  const sneaky = structuredClone(old); sneaky.bank = [{ ...a, id: 'zz9', level: 60, reqLevel: 58 }];
  assert.ok(!checkSave(old, sneaky).ok, 'item forjado no banco');
});

test('contratos diários: determinísticos por dia UTC, 3 por dia, mudam de um dia para o outro', () => {
  const c = hero(8), day = dayUTC(Date.UTC(2026, 10, 2));
  assert.equal(day, Math.floor(Date.UTC(2026, 10, 2) / 86400000));
  const b1 = dailyBoard(c, day), b2 = dailyBoard({ ...hero(8) }, day);
  assert.deepEqual(b1, b2); assert.equal(b1.length, DAILY_COUNT);
  assert.deepEqual(b1.map((x) => x.kind), ['kill', 'kill', 'chest']);
  const ids = new Set(); for (let d = day; d < day + 30; d++) for (const x of dailyBoard(c, d)) ids.add(x.id);
  assert.ok(ids.size >= 60, 'variedade ao longo do mês: ' + ids.size);
  for (let d = day; d < day + 30; d++) for (const x of dailyBoard(c, d)) {
    assert.ok(x.count >= 2 && x.count <= 25 && x.reward.gold > 0 && x.reward.xp > 0 && /^d\d+-\d-[a-z]+-[a-z]+$/.test(x.id) && x.label);
    if (x.kind === 'kill') { assert.ok(ZONES[x.zone].mobs && ZONES[x.zone].level[0] <= c.level + 1); assert.ok(x.mob === 'any' || ZONES[x.zone].mobs.some((m) => m[0] === x.mob)); }
  }
  assert.notDeepEqual(dailyBoard(c, day).map((x) => x.id), dailyBoard(c, day + 1).map((x) => x.id));
  // nível alto sorteia zonas mais fortes
  assert.ok(dailyBoard(hero(28), day).every((x) => x.kind === 'chest' || ZONES[x.zone].level[1] >= 20));
  assert.ok(dailyBoard(hero(1), day).every((x) => x.kind === 'chest' || x.zone === 'forest'));
});

test('contratos diários: kills e baús avançam, entrega paga uma vez, o dia seguinte zera', () => {
  const c = hero(8), now = Date.UTC(2026, 10, 2, 15), day = dayUTC(now), board = dailyBoard(c, day);
  const [k1, , ch] = board;
  const kill = (mobId, zoneId, boss = false) => recordEvent(c, { type: 'kill', mobId, zoneId, boss }, now);
  assert.ok(!claimDaily(c, k1.id, now).ok, 'incompleto');
  kill(k1.mob === 'any' ? 'slime' : k1.mob, k1.zone === 'forest' ? 'plains' : 'forest'); // zona errada não conta
  assert.equal(dailyState(c, day).p[k1.id] ?? 0, 0);
  for (let i = 0; i < k1.count; i++) kill(k1.mob === 'any' ? ZONES[k1.zone].mobs[0][0] : k1.mob, k1.zone);
  assert.ok(dailyComplete(c, k1));
  for (let i = 0; i < ch.count + 2; i++) recordEvent(c, { type: 'chest', zoneId: 'forest' }, now);
  assert.equal(c.daily.p[ch.id], ch.count, 'não passa da meta');
  const gold = c.gold, xp = c.xp, pots = c.potions;
  const r = claimDaily(c, k1.id, now); assert.ok(r.ok);
  assert.equal(c.gold, gold + k1.reward.gold); assert.equal(c.potions, pots + k1.reward.potions); assert.ok(c.xp >= xp || r.levels > 0);
  assert.ok(!claimDaily(c, k1.id, now).ok, 'não paga duas vezes');
  assert.ok(claimDaily(c, ch.id, now).ok);
  assert.ok(!claimDaily(c, 'd1-0-forest-slime', now).ok, 'contrato de outro dia');
  const next = now + 86400000; recordEvent(c, { type: 'chest', zoneId: 'forest' }, next);
  assert.equal(c.daily.day, day + 1); assert.deepEqual(Object.keys(c.daily.done), [], 'dia novo, entregas zeradas');
  // salvamento
  const v = validate(c); assert.equal(v.char.daily.day, day + 1); assert.ok(Object.keys(v.char.daily.p).length <= 12);
  const bad = validate({ ...hero(), daily: { day: 5, p: { 'x; DROP': 9, 'd5-0-forest-slime': 9999 }, done: { 'd5-0-forest-slime': 1 } } }).char.daily;
  assert.deepEqual(bad, { day: 5, p: { 'd5-0-forest-slime': 99 }, done: { 'd5-0-forest-slime': 1 } });
});

test('contratos diários: o servidor não deixa desfazer a entrega do dia nem inventar um dia futuro', () => {
  const now = Date.UTC(2026, 10, 2, 15), day = dayUTC(now), base = validate({ ...hero(8), created: 1 }).char;
  const old = structuredClone(base); old.daily = { day, p: { a: 1 }, done: { 'd1-0-forest-slime': 1 } };
  const undo = structuredClone(old); undo.daily = { day, p: {}, done: {} };
  assert.deepEqual(checkSave(old, undo, now).doc.daily.done, { 'd1-0-forest-slime': 1 }, 'entrega fica');
  const future = structuredClone(old); future.daily = { day: day + 400, p: {}, done: {} };
  assert.equal(checkSave(old, future, now).doc.daily.day, day, 'dia futuro ignorado');
  const past = structuredClone(old); past.daily = { day: day - 3, p: {}, done: {} };
  assert.equal(checkSave(old, past, now).doc.daily.day, day, 'dia não volta');
  const fresh = structuredClone(old); fresh.daily = { day: day + 1, p: {}, done: {} };
  assert.equal(checkSave(old, fresh, now).doc.daily.day, day + 1, 'virada de dia vale');
});

test('loja do porto: estoque diário rotativo, até épico, preços próprios e ids estáveis', () => {
  const c = hero(12); c.created = 123; const day = 20000;
  const s1 = buildHarborStock(c, { day }), s2 = buildShopStock(c, { harbor: true, day });
  assert.equal(s1.length, 6); assert.deepEqual(s1.map((i) => [i.id, i.name, i.rarity]), s2.map((i) => [i.id, i.name, i.rarity]), 'determinístico');
  assert.ok(s1.every((i) => i.id.startsWith('hb-') && i.rarity !== 'legendary' && i.rarity !== 'common' && i.level === 12));
  assert.ok(s1.filter((i) => i.rarity === 'epic').length >= 2, 'dois épicos do dia');
  const n = buildHarborStock(c, { day: day + 1 });
  assert.notDeepEqual(s1.map((i) => i.name), n.map((i) => i.name), 'rotaciona por dia');
  assert.notEqual(s1[0].id, n[0].id);
  for (const it of s1) { // convenção da vila: valor inflado para a UI exibir valor×itemMarkup = preço; baseValue é o valor real
    assert.equal(it.price, Math.round(it.baseValue * (it.rarity === 'epic' ? HARBOR.epicMarkup : HARBOR.markup)));
    assert.ok(Math.abs(it.value * PRICES.itemMarkup - it.price) <= PRICES.itemMarkup / 2 + 1e-9, 'UI mostra o preço do porto');
  }
  assert.ok(HARBOR.markup < PRICES.itemMarkup && HARBOR.epicMarkup > PRICES.featuredMarkup && HARBOR.sellRate > PRICES.sellRate);
  assert.equal(harborSellValue({ value: 100 }), 60);
  // item já comprado (mochila ou banco) sai do estoque
  c.inventory = [s1[0]]; c.bank = [s1[1]];
  assert.deepEqual(buildHarborStock(c, { day }).map((i) => i.id), s1.slice(2).map((i) => i.id));
  assert.ok(buildShopStock(hero(12)).every((i) => i.id.startsWith('shop-')), 'a loja da Vila não muda');
});

// ---------- bônus noturno ligado à simulação ----------
test('World com night:true segue o relógio; zona sem ciclo e dia ficam em 1; padrão (sem night) nunca muda', async () => {
  const { World } = await import('../public/src/game/sim.js');
  const at = (hour) => () => hour * 30; // relógio em s: 30 s por "hora" (daycycle.js)
  const noite = new World('forest', { seed: 1, visuals: false, night: true, clock: at(23) });
  noite.update(0.05);
  assert.deepEqual(noite.nightMods, { aggroMul: NIGHT.aggroMul, rewardMul: NIGHT.rewardMul });
  const dia = new World('forest', { seed: 1, visuals: false, night: true, clock: at(12) });
  dia.update(0.05);
  assert.deepEqual(dia.nightMods, { aggroMul: 1, rewardMul: 1 });
  const vila = new World('arena', { seed: 1, visuals: false, night: true, clock: at(23) });
  vila.update(0.05);
  assert.equal(vila.nightMods.rewardMul, 1, 'arena (círculo): sem ciclo');
  const sem = new World('forest', { seed: 1, visuals: false, clock: at(23) });
  sem.update(0.05);
  assert.equal(sem.nightMods.rewardMul, 1, 'simulações e testes não dependem da hora');
});

test('nightMods: aggro cresce e ouro/XP/itens rendem mais à noite (rollMobLoot rewardMul)', async () => {
  const { rollMobLoot } = await import('../public/src/core/loot.js');
  const { makeRng } = await import('../public/src/core/rng.js');
  const mob = { level: 10, boss: false, mobId: 'wolf' };
  let g1 = 0, g2 = 0, i1 = 0, i2 = 0;
  for (let s = 1; s <= 400; s++) {
    const a = rollMobLoot(makeRng(s), mob, 'warrior'), b = rollMobLoot(makeRng(s), mob, 'warrior', null, NIGHT.rewardMul);
    g1 += a.find((l) => l.kind === 'gold').amount; g2 += b.find((l) => l.kind === 'gold').amount;
    i1 += a.filter((l) => l.kind === 'item').length; i2 += b.filter((l) => l.kind === 'item').length;
  }
  assert.ok(g2 > g1 * 1.1 && g2 < g1 * 1.2, `ouro ${g1} → ${g2}`);
  assert.ok(i2 >= i1, 'itens não diminuem');
});

test('prefs: daynight só aceita auto/day', async () => {
  const { changePref } = await import('../public/src/prefs.js');
  assert.equal(changePref({ scale: 100, quality: 'auto', controls: 'auto', daynight: 'auto' }, 'daynight:day').daynight, 'day');
  assert.equal(changePref({ scale: 100, quality: 'auto', controls: 'auto', daynight: 'day' }, 'daynight:lixo').daynight, 'auto');
});

// ---------- Porto no meio da rota: desconto e reciclagem ----------
import { harborPrice, recycle, RECYCLE_COUNT } from '../public/src/shop.js';

test('Porto: poção e pergaminho 15% mais baratos que na Vila', () => {
  for (const lv of [1, 10, 25]) for (const k of ['potion', 'scroll']) {
    assert.ok(harborPrice(k, lv) < PRICES[k](lv)); assert.equal(harborPrice(k, lv), Math.round(PRICES[k](lv) * 0.85));
  }
});

test('reciclagem: 3 comuns viram 1 raro da classe; recusa mistura, duplicatas e itens fora da mochila; é determinística', () => {
  const r = makeRng(3), c = hero(10, 'mage');
  const commons = [1, 2, 3, 4].map(() => generateItem(r, 10, { classId: 'mage', rarityId: 'common' }));
  const epic = generateItem(r, 10, { classId: 'mage', rarityId: 'epic' });
  c.inventory = [...commons, epic];
  const ids = commons.slice(0, 3).map((i) => i.id);
  assert.equal(RECYCLE_COUNT, 3);
  assert.equal(recycle(c, ids.slice(0, 2)).ok, false);
  assert.equal(recycle(c, [ids[0], ids[0], ids[1]]).ok, false);
  assert.equal(recycle(c, [ids[0], ids[1], epic.id]).ok, false, 'só comuns');
  assert.equal(recycle(c, [ids[0], ids[1], 'nao-existe']).ok, false);
  assert.equal(c.inventory.length, 5, 'falhas não mudam nada');
  const copy = structuredClone(c);
  const out = recycle(c, ids);
  assert.equal(out.ok, true); assert.equal(out.item.rarity, 'rare');
  assert.equal(c.inventory.length, 3); assert.ok(c.inventory.includes(out.item) && !c.inventory.some((i) => ids.includes(i.id)));
  const { id: _a, ...again } = recycle(copy, ids).item, { id: _b, ...first } = out.item;
  assert.deepEqual(again, first, 'mesma semente, mesmo item (o id é único por geração)');
});

test('Porto: as zonas vizinhas têm portal de ida e volta e o Porto só liga Planície e Ruínas', () => {
  assert.deepEqual(ZONES.harbor.portals.map((p) => p.to), ['plains', 'ruins']);
  const back = (a, b) => ZONES[a].portals.some((p) => p.to === b);
  for (const [a, b] of [['plains', 'harbor'], ['harbor', 'ruins']]) assert.ok(back(a, b) && back(b, a), `${a} <-> ${b}`);
});
