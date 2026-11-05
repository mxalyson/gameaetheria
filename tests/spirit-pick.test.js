// O que o spirit pega (opção do aparelho): máscara por raridade/poção/essência, busca do spirit na simulação e opção salva em prefs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spiritWants, SPIRIT_PICK_ALL } from '../public/src/game/sim.js';
import { changePref, SPIRIT_PICK_ALL as PREF_ALL } from '../public/src/prefs.js';

const item = (rarity) => ({ kind: 'item', item: { rarity } });

test('spiritWants: padrão busca tudo; máscara filtra por raridade, poção e essência', () => {
  for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary']) assert.equal(spiritWants(SPIRIT_PICK_ALL, item(r)), true, r);
  const epicUp = 0b0011000; // só épico e lendário (bits 3 e 4)
  assert.equal(spiritWants(epicUp, item('rare')), false);
  assert.equal(spiritWants(epicUp, item('epic')), true);
  assert.equal(spiritWants(epicUp, item('legendary')), true);
  assert.equal(spiritWants(epicUp, { kind: 'potion' }), false);
  assert.equal(spiritWants(0b0100000, { kind: 'potion' }), true);
  assert.equal(spiritWants(0b1000000, { kind: 'essence' }), true);
  assert.equal(spiritWants(0, item('legendary')), false);
});

test('prefs: spiritPick alterna bits, "all" e "none"; valores inválidos voltam ao padrão', () => {
  assert.equal(PREF_ALL, SPIRIT_PICK_ALL);
  let p = { scale: 'auto', quality: 'auto', controls: 'auto', spiritPick: SPIRIT_PICK_ALL };
  p = changePref(p, 'spiritPick:0', 1000, 500); assert.equal(p.spiritPick, SPIRIT_PICK_ALL & ~1); // tira o Comum
  p = changePref(p, 'spiritPick:0', 1000, 500); assert.equal(p.spiritPick, SPIRIT_PICK_ALL);       // põe de volta
  assert.equal(changePref(p, 'spiritPick:none', 1000, 500).spiritPick, 0);
  assert.equal(changePref({ ...p, spiritPick: 0 }, 'spiritPick:all', 1000, 500).spiritPick, SPIRIT_PICK_ALL);
  assert.equal(changePref({ ...p, spiritPick: 'x' }, 'scale:auto', 1000, 500).spiritPick, SPIRIT_PICK_ALL);
});

test('sim: o spirit ignora no chão o item que a máscara não quer e busca o que quer', async () => {
  const { World, makeHeroActor, makeSpiritActor } = await import('../public/src/game/sim.js');
  const { newCharacter, createSpirit } = await import('../public/src/core/progression.js');
  const { makeRng } = await import('../public/src/core/rng.js');
  const c = newCharacter('T', 'warrior', makeRng(3)); const sp = createSpirit(makeRng(2), { level: 1, rarity: 'rare' });
  const w = new World('forest', { visuals: true }); const hero = w.add(makeHeroActor(c, 500, 500, 'player', 1)); w.add(makeSpiritActor(sp, hero));
  const mk = (rarity, x) => ({ kind: 'item', item: { rarity }, x, y: 500, vx: 0, vy: 0, t: 1 });
  const common = mk('common', 560), epic = mk('epic', 440); w.drops.push(common, epic);
  w.spiritPick = 0b0011000; // só épico+
  const spirit = w.actors.find((a) => a.kind === 'spirit');
  for (let i = 0; i < 20; i++) w.update(1 / 60, new Map());
  assert.equal(spirit.fetch === common, false, 'comum não é buscado');
  assert.ok(spirit.fetch === epic || spirit.carry === epic || epic.fetched, 'épico é buscado');
});
