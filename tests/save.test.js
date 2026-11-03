import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../public/src/core/rng.js';
import { newCharacter, createSpirit, SAVE_VERSION, POINTS_PER_LEVEL } from '../public/src/core/progression.js';
import { generateItem } from '../public/src/core/loot.js';
import { parseSave, exportSave, cleanName, migrate, validate, MAX_SAVE_BYTES } from '../public/src/core/savedoc.js';
import { INVENTORY_SIZE } from '../public/src/data/items.js';

const rng = makeRng(21);
function fullChar(classId = 'mage', level = 16) {
  const c = newCharacter('Aria', classId, rng);
  c.level = level; c.xp = 40; c.gold = 500; c.potions = 4;
  c.alloc.int = 20; c.statPoints = 5;
  for (let i = 0; i < 5; i++) c.inventory.push(generateItem(rng, level, { classId }));
  const sp = createSpirit(rng, { rarity: 'rare' }); c.spirits.push(sp); c.activeSpirit = sp.id;
  c.spec = 'arcane';
  return c;
}
const parse = (o) => parseSave(JSON.stringify(o));

test('personagem novo já nasce na versão atual e passa na validação sem avisos', () => {
  const c = newCharacter('Bia', 'warrior', rng);
  assert.equal(c.version, SAVE_VERSION);
  const r = parse(c);
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.migratedFrom, null);
});

test('ida e volta: exportar e importar preserva o personagem inteiro', () => {
  const c = fullChar();
  const r = parseSave(exportSave(c));
  assert.equal(r.ok, true);
  assert.deepEqual(r.char.equipment, c.equipment);
  assert.deepEqual(r.char.inventory, c.inventory);
  assert.deepEqual(r.char.spirits, c.spirits);
  assert.equal(r.char.spec, 'arcane');
  assert.equal(r.char.gold, 500); assert.equal(r.char.level, 16); assert.equal(r.char.alloc.int, 20);
  assert.deepEqual(r.warnings, []);
});

test('migração v1 → atual: save antigo (sem ratings nem spec) é atualizado sem perder nada', () => {
  const c = fullChar('archer', 12); delete c.spec;
  const old = { ...c, version: 1, arena: { rating: 1234, wins: 3, losses: 2, bestWave: 7 } };
  const r = parse(old);
  assert.equal(r.ok, true);
  assert.equal(r.migratedFrom, 1);
  assert.equal(r.char.version, SAVE_VERSION);
  assert.equal(r.char.arena.rating, 1234); assert.equal(r.char.arena.bestWave, 7);
  assert.deepEqual(r.char.arena.ratings, {});
  assert.equal(r.char.inventory.length, 5);
  // save sem campo de versão também é tratado como v1
  const { version, ...semVersao } = old;
  assert.equal(parse(semVersao).migratedFrom, 1);
});

test('save de uma versão mais nova é recusado (não corrompe nada)', () => {
  const r = migrate({ ...newCharacter('X', 'mage', rng), version: SAVE_VERSION + 1 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /mais nova/);
});

test('lixo e arquivos inválidos nunca lançam exceção', () => {
  for (const t of ['', 'abc', '{', 'null', '[]', '42', '{"classId":"dragon"}', '{"format":"aetheria-save","char":5}']) {
    const r = parseSave(t);
    assert.equal(r.ok, false, t);
    assert.ok(r.reason);
  }
  assert.equal(parseSave('x'.repeat(MAX_SAVE_BYTES + 1)).ok, false);
  assert.equal(parseSave(undefined).ok, false);
});

test('trapaça no save: nível, ouro, pontos, atributos e quantias absurdas são limitados', () => {
  const c = fullChar('warrior', 5);
  c.level = 999; c.gold = 1e15; c.potions = -50; c.statPoints = 5000; c.alloc = { str: 9999, agi: -3, int: 'x', vit: 1 }; c.xp = NaN;
  const r = parse(c);
  assert.equal(r.ok, true);
  assert.equal(r.char.level, 30);
  assert.equal(r.char.gold, 1e9); assert.equal(r.char.potions, 0); assert.equal(r.char.xp, 0);
  const budget = POINTS_PER_LEVEL * (r.char.level - 1);
  const spent = Object.values(r.char.alloc).reduce((a, b) => a + b, 0) + r.char.statPoints;
  assert.ok(spent <= budget, `pontos ${spent} > ${budget}`);
  assert.ok(Object.values(r.char.alloc).every((v) => v >= 0));
  assert.ok(r.warnings.length > 0);
});

test('itens: inválidos, duplicados e acima do limite são removidos; estatísticas absurdas, limitadas', () => {
  const c = fullChar('mage', 10);
  const good = generateItem(rng, 10, { classId: 'mage' });
  c.inventory = [good, { ...good }, { kind: 'gear', slot: 'weapon', rarity: 'mythic', stats: {}, id: 'a' }, { kind: 'gear', slot: 'helm', rarity: 'rare', id: 'b', stats: { atk: 1e12, hack: 99, def: -5 } }, 'lixo', null];
  for (let i = 0; i < INVENTORY_SIZE + 5; i++) c.inventory.push(generateItem(rng, 10, { classId: 'mage' }));
  c.equipment.weapon = { ...good, id: 'weapon-fake', slot: 'weapon', weaponType: 'laser' }; // arma de tipo inexistente
  const r = parse(c);
  assert.equal(r.ok, true);
  assert.ok(r.char.inventory.length <= INVENTORY_SIZE);
  assert.equal(new Set(r.char.inventory.map((i) => i.id)).size, r.char.inventory.length, 'sem ids repetidos');
  assert.equal(r.char.equipment.weapon, undefined);
  const hacked = r.char.inventory.find((i) => i.id === 'b');
  assert.ok(!hacked || (hacked.stats.atk <= 2000 && !('hack' in hacked.stats) && !('def' in hacked.stats)));
  assert.ok(r.warnings.length > 0);
});

test('item equipado só vale no slot certo e não pode repetir id do inventário', () => {
  const c = fullChar('mage', 10);
  const it = generateItem(rng, 10, { classId: 'mage', slot: 'helm' });
  c.equipment.armor = it; // elmo no slot de armadura
  c.equipment.boots = generateItem(rng, 10, { classId: 'mage', slot: 'boots' });
  c.inventory.push({ ...c.equipment.boots }); // mesma id equipada e no inventário
  const r = parse(c);
  assert.equal(r.char.equipment.armor, undefined);
  assert.ok(r.char.equipment.boots);
  assert.ok(!r.char.inventory.some((i) => i.id === r.char.equipment.boots.id));
});

test('spirits: tipos/raridades inválidos saem e o ativo aponta para um spirit que existe', () => {
  const c = fullChar();
  c.spirits.push({ id: 's2', type: 'dragao', rarity: 'rare', level: 5 }, { id: 's3', type: 'ember', rarity: 'divine', level: 5 });
  c.activeSpirit = 'inexistente';
  const r = parse(c);
  assert.equal(r.char.spirits.length, 1);
  assert.equal(r.char.activeSpirit, r.char.spirits[0].id);
});

test('especialização inválida ou abaixo do nível 15 é removida', () => {
  const c = fullChar('mage', 12); c.spec = 'arcane';
  assert.equal(parse(c).char.spec, null);
  const d = fullChar('mage', 20); d.spec = 'guardian'; // spec de outra classe
  assert.equal(parse(d).char.spec, null);
  const e = fullChar('mage', 20); e.spec = 'warlock';
  assert.equal(parse(e).char.spec, 'warlock');
});

test('nomes: HTML e símbolos não passam; acentos e espaços sim; sempre há um nome', () => {
  assert.equal(cleanName('<img src=x onerror=alert(1)>'), 'img srcx onerr'); // sem < > = ( ) e cortado em 14
  assert.equal(cleanName('  João   da   Silva  '), 'João da Silva');
  assert.equal(cleanName("D'Arc-Lux_9"), "D'Arc-Lux_9");
  assert.equal(cleanName('a'.repeat(40)).length, 14);
  assert.equal(cleanName('<<<>>>'), 'Herói');
  assert.equal(cleanName(null), 'Herói');
  const c = fullChar(); c.name = '<script>alert(1)</script>';
  const r = parse(c);
  assert.ok(!/[<>]/.test(r.char.name));
  assert.ok(r.warnings.includes('nome ajustado'));
  const it = generateItem(rng, 5, { classId: 'mage' }); it.name = '<b onmouseover=x>Espada</b>';
  const c2 = fullChar(); c2.inventory = [it];
  assert.ok(!/[<>]/.test(parse(c2).char.inventory[0].name));
});

test('validate recusa documento sem classe e não altera o objeto de entrada', () => {
  assert.equal(validate(null).ok, false);
  assert.equal(validate({ classId: 'x' }).ok, false);
  const c = fullChar(); const copia = JSON.stringify(c);
  validate(c);
  assert.equal(JSON.stringify(c), copia);
});

test('especialização: ids antigos migram para os novos e Selos/trocas entram no documento (seals 0..9, specChanges)', () => {
  const old = { bastion: ['warrior', 'paladin'], executioner: ['warrior', 'berserker'], pyromancer: ['mage', 'arcane'], cryomancer: ['mage', 'warlock'], marksman: ['archer', 'sniper'], hunter: ['archer', 'gunslinger'] };
  for (const [id, [cls, neu]] of Object.entries(old)) {
    const c = fullChar(cls, 20); c.spec = id;
    const r = parse(c);
    assert.equal(r.char.spec, neu); assert.ok(!r.warnings.some((w) => /especializa/.test(w)));
  }
  const c = fullChar('mage', 20); c.seals = 4; c.specChanges = 2;
  const r = parse(c);
  assert.equal(r.char.seals, 4); assert.equal(r.char.specChanges, 2);
  const lost = fullChar('mage', 20); lost.seals = 50; lost.specChanges = -3;
  assert.equal(parse(lost).char.seals, 9); assert.equal(parse(lost).char.specChanges, 0);
  assert.equal(parse(fullChar('mage', 20)).char.seals, 0, 'save antigo sem o campo');
});
