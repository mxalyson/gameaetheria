import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTeste, buildTesteChar, TESTE_KINDS } from '../public/src/teste.js';
import { auraTier, auraSpec } from '../public/src/core/aura.js';

test('parseTeste aceita só valores conhecidos', () => {
  assert.equal(parseTeste('?teste=paladino&api='), 'paladino');
  assert.equal(parseTeste('?teste=PALADINO-BASE'), 'paladino-base');
  assert.equal(parseTeste('?teste=xyz'), null);
  assert.equal(parseTeste(''), null);
});

test('buildTesteChar: Paladino Nv25 com Maestria e escudo; base sem spec; determinístico', () => {
  const p = buildTesteChar('paladino');
  assert.equal(p.level, 25); assert.equal(auraSpec(p), 'paladin'); assert.equal(auraTier(p), 2);
  assert.equal(p.equipment.offhand.rarity, 'legendary');
  assert.equal(buildTesteChar('paladino').equipment.offhand.stats.def, p.equipment.offhand.stats.def);
  assert.equal(auraTier(buildTesteChar('paladino-base')), 0);
  assert.equal(buildTesteChar('berserker').equipment.offhand, undefined);
  for (const k of Object.keys(TESTE_KINDS)) assert.ok(buildTesteChar(k).level === 25);
});
