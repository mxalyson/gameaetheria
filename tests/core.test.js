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
