import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../public/src/core/rng.js';
import { newCharacter } from '../public/src/core/progression.js';
import { generateRival } from '../public/src/core/rival.js';
import { CLASSES } from '../public/src/data/classes.js';
import { SKILLS } from '../public/src/data/skills.js';
import { SPECS, SPEC_LEVEL } from '../public/src/data/specs.js';
import { skillOf, chooseSpec, respecCost, activeSpec, specsOf } from '../public/src/core/specs.js';
import { World, makeHeroActor } from '../public/src/game/sim.js';

const hero = (classId, level) => { const c = newCharacter('T', classId, makeRng(4)); c.level = level; return c; };

test('cada classe tem exatamente 2 especializações e elas só ajustam habilidades que a classe já tem', () => {
  for (const [cid, cls] of Object.entries(CLASSES)) {
    const specs = SPECS[cid];
    assert.equal(Object.keys(specs).length, 2, cid);
    for (const [sid, sp] of Object.entries(specs)) {
      assert.ok(sp.name && sp.desc && sp.icon, `${cid}/${sid} sem textos`);
      for (const skillId of Object.keys(sp.skills)) assert.ok(cls.skills.includes(skillId), `${cid}/${sid} mexe em ${skillId}, que não é da classe`);
      for (const k of Object.keys(sp.skills)) for (const f of Object.keys(sp.skills[k])) assert.ok(f === 'desc' || f in SKILLS[k], `${cid}/${sid}/${k}: campo novo "${f}"`);
    }
  }
  assert.equal(Object.keys(CLASSES).length, 4, 'continuam 4 classes');
  for (const cls of Object.values(CLASSES)) assert.equal(cls.skills.length, 3);
});

test('skillOf: sem especialização devolve a habilidade original; com ela mescla (inclusive buff campo a campo)', () => {
  assert.equal(skillOf('warrior', null, 'warcry'), SKILLS.warcry);
  assert.equal(skillOf('warrior', 'bastion', 'whirlwind'), SKILLS.whirlwind, 'skill não alterada pela spec fica igual');
  const w = skillOf('warrior', 'bastion', 'warcry');
  assert.equal(w.dur, 9); assert.equal(w.buff.dr, SPECS.warrior.bastion.skills.warcry.buff.dr);
  assert.equal(w.kind, SKILLS.warcry.kind); assert.equal(w.name, SKILLS.warcry.name);
  assert.equal(SKILLS.warcry.dur, 6, 'o dado original não é alterado');
  assert.equal(skillOf('warrior', 'bastion', 'warcry'), w, 'cache estável');
});

test('escolha: só a partir do nível 15, primeira grátis, troca custa ouro, valida a spec', () => {
  const c = hero('mage', SPEC_LEVEL - 1); c.gold = 1000;
  assert.equal(chooseSpec(c, 'pyromancer').ok, false);
  c.level = SPEC_LEVEL;
  assert.equal(chooseSpec(c, 'inexistente').ok, false);
  assert.equal(respecCost(c), 0);
  assert.deepEqual(chooseSpec(c, 'pyromancer'), { ok: true, cost: 0 });
  assert.equal(c.gold, 1000); assert.equal(c.spec, 'pyromancer');
  assert.equal(chooseSpec(c, 'pyromancer').ok, false, 'mesma spec');
  const cost = respecCost(c); assert.ok(cost > 0);
  assert.deepEqual(chooseSpec(c, 'cryomancer'), { ok: true, cost });
  assert.equal(c.gold, 1000 - cost);
  c.gold = 1;
  assert.equal(chooseSpec(c, 'pyromancer').ok, false, 'sem ouro');
  assert.equal(c.spec, 'cryomancer');
});

test('abaixo do nível 15 a spec salva não vale (activeSpec)', () => {
  const c = hero('cleric', 10); c.spec = 'guardian';
  assert.equal(activeSpec(c), null);
  c.level = 15; assert.equal(activeSpec(c), 'guardian');
  assert.deepEqual(Object.keys(specsOf('cleric')), ['guardian', 'inquisitor']);
});

test('na simulação: a recarga e o efeito vêm da habilidade especializada', () => {
  const run = (spec) => {
    const w = new World('arena', { seed: 3, visuals: false });
    const c = hero('mage', 20); c.spec = spec;
    const a = w.add(makeHeroActor(c, 550, 600, 'player', 1));
    const b = w.add(makeHeroActor(hero('warrior', 20), 550, 450, 'rival', 2));
    const hp0 = b.hp;
    w.update(1 / 60, { [a.id]: { mx: 0, my: 0, aimX: b.x, aimY: b.y, cast: 0 }, [b.id]: { mx: 0, my: 0 } });
    for (let i = 0; i < 60; i++) w.update(1 / 60, { [a.id]: { mx: 0, my: 0 }, [b.id]: { mx: 0, my: 0 } });
    return { cd: a.cds.s0, dmg: hp0 - b.hp };
  };
  const base = run(null), pyro = run('pyromancer'), cryo = run('cryomancer');
  assert.ok(pyro.dmg > base.dmg * 1.3, `piromante ${pyro.dmg} vs base ${base.dmg}`);
  assert.ok(cryo.dmg < base.dmg, 'criomante troca dano da Bola de Fogo por controle');
  assert.ok(Math.abs(pyro.cd - (SPECS.mage.pyromancer.skills.fireball.cd - 1)) < 0.05, 'recarga da spec');
});

test('Bastião: Grito de Guerra dura mais e reduz mais dano; Carrasco: Golpe Giratório bate mais', () => {
  const mk = (spec) => {
    const w = new World('arena', { seed: 8, visuals: false });
    const c = hero('warrior', 20); c.spec = spec;
    const a = w.add(makeHeroActor(c, 550, 600, 'player', 1));
    const b = w.add(makeHeroActor(hero('warrior', 20), 550, 540, 'rival', 2));
    return { w, a, b };
  };
  const { w, a, b } = mk('bastion');
  w.update(1 / 60, { [a.id]: { mx: 0, my: 0, aimX: b.x, aimY: b.y, cast: 2 }, [b.id]: { mx: 0, my: 0 } });
  assert.equal(a.buffs[0].t > 8.9, true);
  assert.equal(w.buffVal(a, 'dr'), SPECS.warrior.bastion.skills.warcry.buff.dr);
  const hit = (spec) => { const m = mk(spec); const hp0 = m.b.hp; m.w.update(1 / 60, { [m.a.id]: { mx: 0, my: 0, aimX: m.b.x, aimY: m.b.y, cast: 0 }, [m.b.id]: { mx: 0, my: 0 } }); return hp0 - m.b.hp; };
  assert.ok(hit('executioner') > hit(null) * 1.4);
});

test('rivais de nível 15+ vêm com especialização; abaixo disso não', () => {
  const me = hero('mage', 20);
  const r = generateRival(makeRng(5), me, { classId: 'cleric' });
  assert.ok(Object.keys(SPECS.cleric).includes(r.spec));
  const low = generateRival(makeRng(5), hero('mage', 5), { classId: 'cleric' });
  assert.equal(low.spec, undefined);
});

test('atributos exibidos têm no máximo 1 casa decimal (crescimento fracionário não vaza ruído de ponto flutuante)', async () => {
  const { primaryStats } = await import('../public/src/core/stats.js');
  for (const classId of Object.keys(CLASSES)) for (const level of [2, 7, 15, 23, 30]) {
    const p = primaryStats(hero(classId, level));
    for (const v of Object.values(p)) assert.equal(Math.round(v * 10) / 10, v, `${classId} nv ${level}: ${v}`);
  }
});
