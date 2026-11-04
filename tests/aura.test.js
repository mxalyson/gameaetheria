import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECS } from '../public/src/data/specs.js';
import { SPEC_ORDER, AURA_STYLES, auraTier, auraSpec, auraStyle, lookCode, decodeLook } from '../public/src/core/aura.js';
import { heroLook } from '../public/src/render/hero-sprites.js';
import { actorTuple } from '../server/snapshot.js';
import { SnapshotDecoder } from '../public/src/core/snapshot.js';
import { newCharacter } from '../public/src/core/progression.js';
import { makeRng } from '../public/src/core/rng.js';
import { makeHeroActor } from '../public/src/game/sim.js';

const hero = (classId, level, spec, mastery) => {
  const c = newCharacter('T', classId, makeRng(3)); c.level = level; c.spec = spec;
  if (mastery) c.quests = { ...(c.quests ?? {}), done: { ...(c.quests?.done ?? {}), maestria: 1 } };
  return c;
};

test('toda especialização do jogo tem estilo e posição fixa no código de rede', () => {
  const all = Object.values(SPECS).flatMap((o) => Object.keys(o));
  assert.equal(all.length, 8);
  for (const s of all) { assert.ok(AURA_STYLES[s], s); assert.ok(SPEC_ORDER.includes(s), s); }
  assert.equal(new Set(SPEC_ORDER).size, SPEC_ORDER.length);
  assert.equal(new Set(Object.values(AURA_STYLES).map((s) => s.c)).size, 8, 'cores principais distintas');
});

test('tier: 0 sem spec ou antes do nv 15; 1 com spec; 2 com Maestria', () => {
  assert.equal(auraTier(hero('warrior', 14, 'paladin')), 0);
  assert.equal(auraTier(hero('warrior', 15, null)), 0);
  assert.equal(auraTier(hero('warrior', 15, 'paladin')), 1);
  assert.equal(auraTier(hero('warrior', 25, 'paladin', true)), 2);
  assert.equal(auraTier(hero('warrior', 25, null, true)), 0, 'sem spec não há aura');
  assert.equal(auraTier(hero('warrior', 15, 'warlock')), 0, 'spec de outra classe não vale');
  const a = makeHeroActor(hero('mage', 25, 'arcane', true), 0, 0);
  assert.equal(auraTier(a), 2); assert.equal(auraSpec(a), 'arcane');
});

test('estilo: tier 2 é mais discreto e fino que o tier 1; determinístico e sem aura -> null', () => {
  for (const s of SPEC_ORDER) {
    const t1 = auraStyle(s, 1), t2 = auraStyle(s, 2);
    assert.ok(t2.alpha < t1.alpha && t2.n <= t1.n && t2.thin && !t1.thin && t2.ring, s);
    assert.notEqual(t1.c, t2.c);
    assert.equal(auraStyle(s, 1), t1, 'resolvido uma vez (mesma referência)');
  }
  assert.equal(auraStyle('paladin', 0), null); assert.equal(auraStyle('nada', 1), null);
});

test('código de rede: ida e volta para os 8 specs x 2 tiers, 0 sem aura', () => {
  for (const s of SPEC_ORDER) for (const tier of [1, 2]) {
    const code = lookCode({ spec: s, mastery: tier === 2 });
    assert.ok(code > 0 && code < 64);
    assert.deepEqual(decodeLook(code), { spec: s, tier });
  }
  assert.equal(lookCode({ spec: null }), 0);
  assert.deepEqual(decodeLook(0), { spec: null, tier: 0 });
  assert.deepEqual(decodeLook(63), { spec: null, tier: 0 });
});

test('heroLook: o visual novo vale da escolha da especialização (Nv 15, tier 1) em diante; sem especialização segue o atlas da classe', () => {
  assert.deepEqual(heroLook(hero('archer', 10, null)), { tier: 0, spec: null, atlasVariant: undefined });
  const l = heroLook(hero('archer', 25, 'gunslinger', true));
  assert.equal(l.tier, 2); assert.equal(l.spec, 'gunslinger'); assert.equal(l.atlasVariant, 'gunslinger_nv25');
  assert.equal(heroLook(hero('archer', 25, 'sniper', true)).atlasVariant, 'sniper_nv25');
  assert.equal(heroLook(hero('mage', 25, 'warlock', true)).atlasVariant, 'warlock_nv25');
  assert.equal(heroLook(hero('cleric', 25, 'guardian', true)).atlasVariant, 'guardian_nv25');
  assert.equal(heroLook(hero('archer', 20, 'sniper', false)).atlasVariant, 'sniper_nv25', 'tier 1 (só especialização) já usa o visual novo');
  assert.equal(heroLook(hero('warrior', 25, 'paladin', true)).atlasVariant, 'paladin_nv25');
  assert.equal(heroLook(hero('warrior', 20, 'paladin', false)).atlasVariant, 'paladin_nv25', 'Paladino sem Maestria também');
  assert.equal(heroLook(hero('warrior', 10, null)).atlasVariant, undefined, 'sem especialização: atlas da classe');
  assert.equal(heroLook({ classId: 'warrior', spec: 'paladin', mastery: true }).atlasVariant, 'paladin_nv25', 'ator (jogo/rede) também');
  assert.equal(heroLook(hero('warrior', 25, 'berserker', true)).atlasVariant, 'berserker_nv25');
  assert.equal(heroLook(hero('mage', 25, 'arcane', true)).atlasVariant, 'arcane_nv25');
  assert.equal(heroLook(hero('cleric', 25, 'inquisitor', true)).atlasVariant, 'inquisitor_nv25');
});

test('snapshot: aura viaja no 8º elemento da tupla e só quando existe', () => {
  const base = { id: 7, x: 1, y: 2, hp: 50, facing: 0, shield: 0 };
  assert.equal(actorTuple(base, true).length, 7, 'formato antigo intacto');
  assert.equal(actorTuple({ ...base, spec: 'paladin', mastery: false }, true)[7], lookCode({ spec: 'paladin' }));
  const dec = new SnapshotDecoder().init({ you: 7, players: [{ id: 7, team: 1, name: 'a', classId: 'warrior', level: 25, maxHp: 99 }, { id: 8, team: 1, name: 'b', classId: 'mage', level: 3, maxHp: 50 }] });
  const out = dec.apply({ k: 1, a: [actorTuple({ ...base, spec: 'paladin', mastery: true }, true), [8, 0, 0, 50, 0, 0, 0]] });
  assert.deepEqual(decodeLook(out.actors.find((x) => x.id === 7).look), { spec: 'paladin', tier: 2 });
  assert.equal(out.actors.find((x) => x.id === 8).look, 0);
});
