import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../public/src/core/rng.js';
import { computeStats, canEquip } from '../public/src/core/stats.js';
import { computeHit, eloDelta, tierFor } from '../public/src/core/combat.js';
import { generateItem, rollMobLoot } from '../public/src/core/loot.js';
import { addXp, xpToNext, newCharacter, createSpirit, addSpiritXp, MAX_LEVEL } from '../public/src/core/progression.js';
import { generateRival } from '../public/src/core/rival.js';
import { CLASSES } from '../public/src/data/classes.js';
import { SLOTS } from '../public/src/data/items.js';
import { World, makeHeroActor, makeMobActor } from '../public/src/game/sim.js';

test('rng é determinístico pela semente', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 20; i++) assert.equal(a.next(), b.next());
});

test('todo personagem novo tem stats válidos e arma da própria classe', () => {
  for (const id of Object.keys(CLASSES)) {
    const c = newCharacter('T', id, makeRng(1));
    const st = computeStats(c);
    assert.ok(st.maxHp > 0 && st.power > 0, id);
    assert.ok(canEquip(c, c.equipment.weapon).ok, id);
  }
});

test('subir de nível dá pontos e respeita o nível máximo', () => {
  const c = newCharacter('T', 'warrior', makeRng(1));
  assert.equal(addXp(c, xpToNext(1)), 1);
  assert.equal(c.level, 2);
  assert.equal(c.statPoints, 5);
  addXp(c, 1e9);
  assert.equal(c.level, MAX_LEVEL);
  assert.equal(c.xp, 0);
});

test('itens escalam com nível e raridade', () => {
  const rng = makeRng(7);
  const low = generateItem(rng, 1, { slot: 'weapon', rarityId: 'common', weaponType: 'sword' });
  const high = generateItem(rng, 20, { slot: 'weapon', rarityId: 'legendary', weaponType: 'sword' });
  assert.ok(high.stats.atk > low.stats.atk * 4);
  assert.equal(Object.keys(high.stats).length >= 4, true);
});

test('arma de outra classe não equipa; nível exigido é respeitado', () => {
  const rng = makeRng(3);
  const c = newCharacter('T', 'mage', rng);
  assert.equal(canEquip(c, generateItem(rng, 1, { slot: 'weapon', weaponType: 'sword' })).ok, false);
  assert.equal(canEquip(c, generateItem(rng, 10, { slot: 'helm' })).ok, false);
});

test('dano respeita defesa e nunca é menor que 1', () => {
  const rng = makeRng(5);
  const weak = computeHit(rng, { power: 10, crit: 0 }, { def: 10000 }, 1);
  assert.equal(weak.amount, 1);
  const a = computeHit(makeRng(9), { power: 100, crit: 0 }, { def: 0 }, 1).amount;
  const b = computeHit(makeRng(9), { power: 100, crit: 0 }, { def: 100 }, 1).amount;
  assert.ok(b < a);
});

test('elo e ligas', () => {
  assert.ok(eloDelta(1000, 1000, true) > 0);
  assert.ok(eloDelta(1000, 1000, false) < 0);
  assert.equal(tierFor(1000).name, 'Bronze');
  assert.equal(tierFor(1550).name, 'Platina');
});

test('spirit não passa do nível do dono', () => {
  const sp = createSpirit(makeRng(2), { level: 1 });
  addSpiritXp(sp, 1e9, 5);
  assert.equal(sp.level, 5);
});

test('rival é completo e equipável', () => {
  const rng = makeRng(11);
  const me = newCharacter('Eu', 'archer', rng);
  me.level = 10;
  const r = generateRival(rng, me);
  assert.ok(r.equipment.weapon && r.equipment.armor);
  for (const s of SLOTS) if (r.equipment[s]) assert.equal(r.equipment[s].slot, s);
  assert.ok(Math.abs(r.level - 10) <= 1);
  assert.ok(r.spirits.length === 1 && r.activeSpirit);
});

test('chefe sempre dropa item', () => {
  const loot = rollMobLoot(makeRng(4), { level: 7, boss: true }, 'cleric');
  assert.ok(loot.some((l) => l.kind === 'item'));
});

test('simulação: jogador derrota um mob e o evento de morte é emitido', () => {
  const w = new World('arena', { seed: 1 });
  const c = newCharacter('T', 'warrior', makeRng(1));
  const p = w.add(makeHeroActor(c, 550, 550));
  const m = w.add(makeMobActor('slime', 1, 600, 550));
  let died = false;
  for (let i = 0; i < 600 && !died; i++) {
    w.update(1 / 60, { [p.id]: { aimX: m.x, aimY: m.y, attack: true } });
    died = w.events.some((e) => e.type === 'death' && e.actor === m);
    w.events.length = 0;
  }
  assert.ok(died);
});

test('poder (PWR) cresce com nível e equipamento; PvP libera no nível 10', async () => {
  const { playerPower, pvpUnlocked, matchOk, PVP_MIN_LEVEL } = await import('../public/src/core/power.js');
  const c = newCharacter('T', 'mage', makeRng(3));
  const p1 = playerPower(c);
  c.level = 10;
  assert.ok(playerPower(c) > p1);
  assert.equal(pvpUnlocked({ level: PVP_MIN_LEVEL - 1 }), false);
  assert.equal(pvpUnlocked({ level: PVP_MIN_LEVEL }), true);
  // pareamento: janela estreita no início, abre com a espera
  const a = { rating: 1000, power: 500 }, b = { rating: 1120, power: 500 };
  assert.equal(matchOk(a, b, 0), false);
  assert.equal(matchOk(a, b, 30), true);
  assert.equal(matchOk(a, { rating: 1000, power: 800 }, 0), false);
});

test('partida por times: ponto de controle, vitória por eliminação, pontos e tempo', async () => {
  const { newMatch, controlTick, matchWinner, SCORE_TARGET, getRating, setRating, spawnSlots } = await import('../public/src/core/match.js');
  const m = newMatch('2v2');
  controlTick(m, 10, 2, 0);
  assert.equal(m.owner, 1); assert.equal(m.score[1], 20);
  controlTick(m, 10, 1, 1); // disputado não pontua
  assert.equal(m.score[1], 20); assert.equal(m.score[2], 0);
  controlTick(m, 5, 0, 1);
  assert.equal(m.owner, 2); assert.equal(m.score[2], 10);
  assert.equal(matchWinner(m, 2, 2), 0);
  assert.equal(matchWinner(m, 0, 2), 2);
  assert.equal(matchWinner(m, 2, 0), 1);
  assert.equal(matchWinner(m, 0, 0), 3);
  m.score[1] = SCORE_TARGET;
  assert.equal(matchWinner(m, 1, 2), 1);
  const t = newMatch('1v1'); t.time = t.limit; t.score[2] = 5;
  assert.equal(matchWinner(t, 1, 1), 2); // fim do tempo: lidera nos pontos
  t.score[2] = 0;
  assert.equal(matchWinner(t, 1, 1, 100, 300), 2); // empate de pontos: mais vida
  assert.equal(matchWinner(t, 1, 1, 100, 100), 3);
  // rating separado por modo; 1v1 mantém o campo antigo
  const c = { arena: { rating: 1100 } };
  assert.equal(getRating(c, '1v1'), 1100); assert.equal(getRating(c, '4v4'), 1000);
  setRating(c, '4v4', 1250);
  assert.equal(getRating(c, '4v4'), 1250); assert.equal(c.arena.rating, 1100);
  const s = spawnSlots(1, 4, 900, 1480, 320);
  assert.equal(s.length, 4); assert.ok(s.every((p) => p.y === 1480)); assert.equal(Math.round((s[0].x + s[3].x) / 2), 900);
});

test('IA do rival vai ao ponto de controle quando o inimigo está longe, e luta quando está perto', () => {
  const w = new World('arena_team', { seed: 5 });
  w.objective = { ...w.zone.objective, owner: 0, contested: false };
  const a = w.add(makeHeroActor(newCharacter('A', 'warrior', makeRng(1)), 900, 1480, 'rival', 1));
  const b = w.add(makeHeroActor(newCharacter('B', 'warrior', makeRng(2)), 900, 320, 'rival', 2));
  const y0 = a.y;
  for (let i = 0; i < 60; i++) w.update(1 / 30);
  assert.ok(a.y < y0 - 30, 'o bot anda rumo ao centro');
  assert.ok(Math.hypot(a.x - 900, a.y - 900) < Math.hypot(900 - 900, y0 - 900));
  for (let i = 0; i < 30 * 40 && !a.dead && !b.dead; i++) w.update(1 / 30);
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp, 'ao se encontrarem, trocam golpes');
});

test('rival gerado por poder-alvo fica perto do alvo (±12%) para jogadores fracos e fortes', async () => {
  const { generateRivalForPower } = await import('../public/src/core/rival.js');
  const { playerPower } = await import('../public/src/core/power.js');
  const rng = makeRng(77);
  for (const lvl of [10, 15, 25]) {
    const me = newCharacter('P', 'mage', makeRng(lvl));
    me.level = lvl;
    me.alloc.int += 4 * (lvl - 1); // nem todos os pontos distribuídos
    const target = playerPower(me);
    for (const classId of Object.keys(CLASSES)) {
      const r = generateRivalForPower(rng, me, target, { classId });
      assert.equal(r.classId, classId);
      const p = playerPower(r);
      assert.ok(Math.abs(p - target) <= target * 0.12, `nível ${lvl} ${classId}: alvo ${target}, rival ${p}`);
    }
  }
});

test('pareamento por poder é robusto: 640 combinações (nível × classe × semente) ficam dentro de ±20% do alvo, com e sem pontos distribuídos', async () => {
  const { generateRivalForPower } = await import('../public/src/core/rival.js');
  const { playerPower } = await import('../public/src/core/power.js');
  let worst = 0, n = 0;
  for (const alloc of [false, true]) for (const lvl of [10, 15, 20, 25]) for (let seed = 1; seed <= 20; seed++) for (const classId of Object.keys(CLASSES)) {
    const rng = makeRng(seed);
    const me = newCharacter('P', classId, rng); me.level = lvl;
    const sp = createSpirit(rng, { rarity: 'common' }); me.spirits.push(sp); me.activeSpirit = sp.id;
    if (alloc) me.alloc[CLASSES[classId].primary] += 3 * (lvl - 1);
    const t = playerPower(me);
    const r = generateRivalForPower(makeRng(seed * 7), me, t * (0.95 + (seed % 10) / 100), { classId });
    worst = Math.max(worst, Math.abs(playerPower(r) - t) / t); n++;
  }
  assert.equal(n, 640);
  assert.ok(worst <= 0.2, `pior desvio ${(worst * 100).toFixed(1)}%`);
});

// ---- Aprimoramento de equipamento (ralo de ouro) ----
import { enhance, enhanceCost, totalEnhanceCost, MAX_PLUS, PLUS_BONUS } from '../public/src/core/enhance.js';
import { validate } from '../public/src/core/savedoc.js';
import { checkSave } from '../server/plausible.js';
import { newOfficialCharacter } from '../server/api.js';

test('aprimorar: cobra ouro, soma 6% por nível aos atributos, para no máximo e recusa sem ouro', () => {
  const c = newOfficialCharacter('P', 'warrior'); c.gold = 1e9;
  const w = c.equipment.weapon, base = computeStats(c).power;
  const cost = enhanceCost(w);
  const r = enhance(c, w.id);
  assert.equal(r.ok, true); assert.equal(c.gold, 1e9 - cost); assert.equal(w.plus, 1);
  assert.ok(computeStats(c).power > base, 'poder sobe');
  assert.ok(enhanceCost(w) > cost, 'cada nível custa mais');
  for (let i = 1; i < MAX_PLUS; i++) assert.equal(enhance(c, w.id).ok, true);
  assert.equal(w.plus, MAX_PLUS);
  assert.equal(enhance(c, w.id).ok, false, 'máximo');
  c.gold = 0; w.plus = 0;
  assert.equal(enhance(c, w.id).ok, false, 'sem ouro');
  assert.equal(w.plus, 0); assert.equal(c.gold, 0);
  assert.ok(totalEnhanceCost(w) > 10 * w.value, 'é um ralo grande em comparação ao valor do item');
  assert.equal(PLUS_BONUS, 0.06);
});

test('aprimorar: o save mantém +N dentro do limite; servidor recusa item novo aprimorado e saltos grandes', () => {
  const c = newOfficialCharacter('P', 'warrior'); c.equipment.weapon.plus = 3;
  assert.equal(validate(structuredClone(c)).char.equipment.weapon.plus, 3);
  c.equipment.weapon.plus = 99;
  assert.equal(validate(structuredClone(c)).char.equipment.weapon.plus, MAX_PLUS, 'limitado ao máximo');
  c.equipment.weapon.plus = 'x';
  assert.equal(validate(structuredClone(c)).char.equipment.weapon.plus, undefined);
  const old = newOfficialCharacter('P', 'warrior'), neu = structuredClone(old);
  neu.equipment.weapon.plus = 2;
  assert.equal(checkSave(old, neu).ok, true, 'aprimoramento normal');
  neu.inventory.push({ ...old.equipment.weapon, id: 'novo1', plus: 5 });
  assert.equal(checkSave(old, neu).reason, 'plus_forged', 'item novo não nasce aprimorado');
  const neu2 = structuredClone(old); neu2.equipment.weapon.plus = 8; neu2.equipment.armor.plus = 8;
  assert.equal(checkSave(old, neu2).reason, 'plus_jump', 'salto grande entre gravações');
});

test('colisão com grade espacial dá exatamente o mesmo resultado da busca linear (3 zonas, 6 000 passos aleatórios)', () => {
  for (const zone of ['forest', 'plains', 'ruins']) {
    const fast = new World(zone, { seed: 5, visuals: false }), slow = new World(zone, { seed: 5, visuals: false });
    slow.nearObstacles = function () { return this.layout.obstacles; };
    const rng = makeRng(77);
    const mk = () => ({ x: rng.range(200, 2500), y: rng.range(200, 1700), r: rng.pick([12, 16, 22, 30]) });
    for (let n = 0; n < 40; n++) {
      const a = mk(), b = { ...a };
      for (let i = 0; i < 150; i++) {
        const dx = rng.range(-40, 40), dy = rng.range(-40, 40);
        fast.moveActor(a, dx, dy); slow.moveActor(b, dx, dy);
        assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9, `${zone}: divergiu no passo ${i}`);
      }
    }
  }
});
