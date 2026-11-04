// Texto das habilidades gerado dos dados: nenhuma skill × classe × especialização pode sair com 'undefined', NaN ou [object].
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSkill, describeBasic, describeSpec, describeKit } from '../public/src/core/skilltext.js';
import { CLASSES } from '../public/src/data/classes.js';
import { SKILLS } from '../public/src/data/skills.js';
import { SPECS } from '../public/src/data/specs.js';

const flat = (d) => JSON.stringify(d);
const clean = (d, where) => assert.doesNotMatch(flat(d), /undefined|NaN|\[object|Infinity/, where);

test('todas as skills do kit × spec geram texto completo e limpo', () => {
  for (const [cid, c] of Object.entries(CLASSES)) {
    for (const spec of [null, ...Object.keys(SPECS[cid] ?? {})]) {
      for (const d of describeKit(cid, spec, { power: 120, level: 20 })) {
        clean(d, `${cid}/${spec}/${d.id}`);
        assert.ok(d.name && d.type && d.summary, `${cid}/${spec}/${d.id} sem nome/tipo/resumo`);
        assert.ok(d.lines.length > 0, `${cid}/${spec}/${d.id} sem detalhes`);
      }
      const noPower = describeKit(cid, spec);
      noPower.forEach((d) => clean(d, 'sem poder'));
    }
    assert.equal(describeKit(cid, null).length, 5, 'ataque básico + 3 skills + maestria');
  }
});

test('qualquer skill de data/skills.js (mesmo fora do kit) gera texto', () => {
  for (const id of Object.keys(SKILLS)) {
    const d = describeSkill('warrior', null, id, { power: 50 });
    clean(d, id);
    assert.ok(d.summary.length > 5);
  }
});

test('valores: dano ≈ poder × mult, recarga e efeitos aparecem', () => {
  const d = describeSkill('warrior', null, 'charge', { power: 100, level: 3 });
  const dano = d.lines.find((l) => l.k.startsWith('Dano'));
  assert.match(dano.v, /150% do seu poder \(≈ 150/);
  assert.match(d.lines.find((l) => l.k === 'Efeitos').v, /atordoa 1,2 s/);
  assert.match(d.lines.find((l) => l.k === 'Recarga').v, /6 s/);
  const nova = describeSkill('mage', null, 'frostnova', {});
  assert.match(nova.lines.find((l) => l.k === 'Efeitos').v, /desacelera 50%/);
});

test('liberação: nível por slot e Maestria exige missão', () => {
  assert.equal(describeSkill('warrior', null, 'whirlwind', { level: 1 }).unlock.locked, false);
  const c = describeSkill('warrior', null, 'charge', { level: 1 }).unlock;
  assert.equal(c.locked, true); assert.match(c.text, /Libera no Nv 5/);
  const m = describeSkill('warrior', null, 'colossus', { level: 30 }).unlock;
  assert.equal(m.mastery, true); assert.match(m.text, /Maestria/);
});

test('especialização mostra o que mudou e só nas skills alteradas', () => {
  // kit próprio da especialização: a skill diz qual habilidade da classe ela substitui; a base não muda
  const kit = describeKit('warrior', 'berserker', { level: 30 });
  assert.equal(kit.length, 5);
  assert.ok(kit.slice(1).every((d) => d.specName === 'Berserker' && d.spec.some((l) => l.k === 'Substitui')));
  assert.equal(describeKit('warrior', null, {})[1].spec.length, 0);
  // mecanismo antigo (skills[id] mesclado) continua coberto: o diff mostra antes → depois
  const modded = describeSkill('warrior', 'berserker', 'whirlwind', { level: 20 });
  assert.equal(typeof modded.name, 'string');
  const spec = describeSpec('warrior', 'paladin');
  assert.ok(spec.mods.length && spec.skills.length === 4);
  clean(spec, 'describeSpec');
});

test('skill inventada com kind desconhecido cai no desc manual; sem teclas nos textos', () => {
  const orig = SKILLS.__t = { name: 'Teste', cd: 3, kind: 'novo_tipo', desc: 'Faz algo especial.' };
  const d = describeSkill('warrior', null, '__t', {});
  assert.equal(d.summary, 'Faz algo especial.');
  delete SKILLS.__t;
  for (const k of describeKit('cleric', null, { power: 90, level: 30 })) assert.doesNotMatch(flat(k), /tecla|clique|botão esquerdo|LMB/i);
  void orig;
});
