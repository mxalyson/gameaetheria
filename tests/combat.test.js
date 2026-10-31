import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../public/src/core/rng.js';
import { newCharacter } from '../public/src/core/progression.js';
import { CLASSES } from '../public/src/data/classes.js';
import { SKILLS } from '../public/src/data/skills.js';
import { World, makeHeroActor, makeMobActor } from '../public/src/game/sim.js';

const DT = 1 / 60;
const IDLE = { mx: 0, my: 0 };
const hero = (classId, level = 10) => { const c = newCharacter('T', classId, makeRng(3)); c.level = level; return c; };
// Mundo de teste sem visuais: duas figuras paradas frente a frente; `IDLE` impede a IA de mover o alvo.
function duel(classA, classB = 'warrior', { dist = 60, seed = 11, kindB = 'rival' } = {}) {
  const w = new World('arena', { seed, visuals: false });
  const a = w.add(makeHeroActor(hero(classA), 550, 600, 'player', 1));
  const b = w.add(makeHeroActor(hero(classB), 550, 600 - dist, kindB, 2));
  const run = (secs, intentA = IDLE) => { for (let i = 0; i < Math.round(secs / DT); i++) w.update(DT, { [a.id]: intentA, [b.id]: IDLE }); };
  return { w, a, b, run };
}
const aimAt = (a, b, extra = {}) => ({ mx: 0, my: 0, aimX: b.x, aimY: b.y, ...extra });
const ofType = (w, type) => w.events.filter((e) => e.type === type);

test('determinismo: mesmo estado com visuais ligados ou desligados e sem tocar em Math.random', () => {
  const [cm, ca, cc, cw] = ['mage', 'archer', 'cleric', 'warrior'].map((c) => hero(c, 12)); // criar personagem usa uid() (fora da simulação)
  const realRandom = Math.random;
  Math.random = () => { throw new Error('Math.random usado na simulação'); };
  try {
    const snap = (visuals) => {
      const w = new World('arena_team', { seed: 99, visuals });
      w.objective = { ...w.zone.objective, owner: 0, contested: false };
      const a = w.add(makeHeroActor(cm, 900, 1480, 'rival', 1));
      const b = w.add(makeHeroActor(ca, 900, 320, 'rival', 2));
      const c = w.add(makeHeroActor(cc, 800, 1480, 'rival', 1));
      const d = w.add(makeHeroActor(cw, 1000, 320, 'rival', 2));
      for (let i = 0; i < 60 * 25; i++) w.update(DT);
      return [a, b, c, d].map((x) => [x.x.toFixed(3), x.y.toFixed(3), x.hp.toFixed(3), x.dead, x.cds.s0.toFixed(3)].join(','));
    };
    assert.deepEqual(snap(true), snap(false));
    assert.deepEqual(snap(false), snap(false));
  } finally { Math.random = realRandom; }
});

test('desligar os visuais não cria partículas, textos nem efeitos', () => {
  const { w, a, b, run } = duel('mage');
  run(0.1, aimAt(a, b, { cast: 0 }));
  run(2, aimAt(a, b, { attack: true }));
  assert.equal(w.particles.length + w.texts.length + w.fx.length, 0);
  assert.ok(ofType(w, 'hit').length > 0, 'mas os eventos de combate existem');
});

test('eventos: swing, hit (com a quantia real tirada da vida) e cast, com tempo da simulação', () => {
  const { w, a, b, run } = duel('warrior', 'warrior', { dist: 50 });
  const hp0 = b.hp;
  run(0.05, aimAt(a, b, { attack: true }));
  const sw = ofType(w, 'swing'), hits = ofType(w, 'hit');
  assert.equal(sw.length, 1); assert.equal(hits.length, 1);
  assert.equal(hits[0].src, a); assert.equal(hits[0].target, b);
  assert.equal(Math.round(hp0 - b.hp), hits[0].amount);
  assert.ok(hits[0].t >= 0);
  w.events.length = 0;
  run(0.05, aimAt(a, b, { cast: 0 }));
  assert.equal(ofType(w, 'cast')[0].skill, CLASSES.warrior.skills[0]);
});

test('cooldown: duas intenções de skill no mesmo tick geram um único efeito', () => {
  const { w, a, b } = duel('warrior', 'warrior', { dist: 50 });
  w.update(DT, { [a.id]: aimAt(a, b, { cast: 0 }), [b.id]: IDLE });
  assert.equal(w.castSkill(a, 0, b.x, b.y), false);
  assert.equal(ofType(w, 'cast').length, 1);
  assert.ok(a.cds.s0 > SKILLS.whirlwind.cd - 0.1);
});

test('Investida (stun): atordoa quem atinge e emite status; alvo atordoado não anda', () => {
  const { w, a, b, run } = duel('warrior', 'mage', { dist: 150 });
  run(0.4, aimAt(a, b, { cast: 1 }));
  assert.ok(b.stunT > 0, 'alvo atordoado');
  assert.ok(ofType(w, 'status').some((e) => e.kind === 'stun' && e.actor === b));
  const y0 = b.y;
  w.update(DT, { [b.id]: { mx: 0, my: 1 } });
  assert.equal(b.y, y0, 'atordoado não se move');
});

test('Nova de Gelo (slow): reduz a velocidade e emite status', () => {
  const { w, a, b, run } = duel('mage', 'warrior', { dist: 90 });
  run(0.05, aimAt(a, b, { cast: 1 }));
  assert.ok(b.slowT > 0 && b.slowAmt === SKILLS.frostnova.slow);
  const y0 = b.y; w.update(DT, { [b.id]: { mx: 0, my: -1 } });
  const slowStep = y0 - b.y;
  b.slowT = 0; const y1 = b.y; w.update(DT, { [b.id]: { mx: 0, my: -1 } });
  assert.ok(slowStep < (y1 - b.y) * 0.6, 'passo lento bem menor que o normal');
  assert.ok(ofType(w, 'status').some((e) => e.kind === 'slow'));
});

test('Grito de Guerra (buff): aumenta o dano causado e reduz o recebido, por tempo limitado', () => {
  const dmgWith = (buffed) => {
    const { w, a, b, run } = duel('warrior', 'warrior', { dist: 50, seed: 5 });
    if (buffed) run(0.05, aimAt(a, b, { cast: 2 }));
    const hp0 = b.hp; w.damage(a, b, 1); return { dealt: hp0 - b.hp, a, w, b };
  };
  const base = dmgWith(false), buff = dmgWith(true);
  assert.ok(buff.dealt > base.dealt * 1.25, `com buff ${buff.dealt} vs ${base.dealt}`);
  assert.ok(ofType(buff.w, 'status').some((e) => e.kind === 'buff' && e.skill === 'warcry'));
  for (let i = 0; i < 60 * 7; i++) buff.w.update(DT, { [buff.a.id]: IDLE, [buff.b.id]: IDLE });
  assert.equal(buff.w.buffVal(buff.a, 'dmg'), 0, 'o buff expira');
});

test('Escudo Divino: absorve dano antes da vida e expira', () => {
  const { w, a, b, run } = duel('cleric', 'warrior', { dist: 50 });
  run(0.05, aimAt(a, b, { cast: 1 }));
  assert.ok(a.shield > 0 && ofType(w, 'status').some((e) => e.kind === 'shield'));
  const sh = a.shield, hp0 = a.hp;
  w.damage(b, a, 1);
  assert.ok(a.shield < sh, 'o escudo absorveu'); assert.equal(a.hp, hp0, 'a vida ficou intacta');
  run(7);
  assert.ok(a.shield <= 0, 'escudo expirou');
});

test('Rolamento: invulnerável durante o movimento; depois volta a receber dano', () => {
  const { w, a, b } = duel('archer', 'warrior', { dist: 50 });
  w.update(DT, { [a.id]: aimAt(a, b, { cast: 2 }), [b.id]: IDLE });
  assert.ok(a.dash?.invuln);
  assert.equal(w.damage(b, a, 5), 0);
  for (let i = 0; i < 60; i++) w.update(DT, { [a.id]: IDLE, [b.id]: IDLE });
  assert.equal(a.dash, null);
  assert.ok(w.damage(b, a, 1) > 0);
});

test('Luz Sagrada: cura 22% da vida máxima, fere em volta e emite heal', () => {
  const { w, a, b, run } = duel('cleric', 'warrior', { dist: 80 });
  a.hp = a.maxHp * 0.3;
  const hp0 = a.hp, bhp = b.hp;
  run(0.05, aimAt(a, b, { cast: 0 }));
  assert.ok(Math.abs((a.hp - hp0) - a.maxHp * SKILLS.holylight.heal) < 2);
  assert.ok(b.hp < bhp, 'inimigo próximo ferido');
  assert.ok(ofType(w, 'heal').some((e) => e.actor === a));
});

test('Julgamento: projétil que atordoa ao acertar', () => {
  const { w, a, b, run } = duel('cleric', 'mage', { dist: 200 });
  run(1, aimAt(a, b, { cast: 2 }));
  assert.ok(ofType(w, 'status').some((e) => e.kind === 'stun' && e.actor === b));
});

test('chefe reduz stun a 30% e slow a 50%', () => {
  const w = new World('forest', { seed: 2, visuals: false });
  const boss = w.add(makeMobActor('treant', 5, 500, 500));
  boss.boss = true;
  const src = w.add(makeHeroActor(hero('warrior', 5), 450, 500, 'player', 1));
  w.damage(src, boss, 1, { stun: 1, slow: 0.5, slowDur: 2 });
  assert.ok(Math.abs(boss.stunT - 0.3) < 1e-9);
  assert.equal(boss.slowAmt, 0.25);
});

test('morte: evento único, ator não recebe mais dano e a vida não fica negativa', () => {
  const { w, a, b } = duel('warrior', 'mage', { dist: 50 });
  b.hp = 1;
  w.damage(a, b, 3);
  assert.equal(b.dead, true); assert.equal(b.hp, 0);
  assert.equal(ofType(w, 'death').length, 1);
  assert.equal(w.damage(a, b, 3), 0);
  assert.equal(ofType(w, 'death').length, 1);
});

test('Clérigo em grupo: Luz Sagrada cura aliados próximos (70%), não inimigos nem aliados distantes', () => {
  const { w, a, b, run } = duel('cleric', 'warrior', { dist: 80 });
  const near = w.add(makeHeroActor(hero('mage'), a.x + 60, a.y, 'rival', 1));
  const far = w.add(makeHeroActor(hero('mage'), a.x + 600, a.y, 'rival', 1));
  near.hp = near.maxHp * 0.4; far.hp = far.maxHp * 0.4; b.hp = b.maxHp * 0.4;
  const n0 = near.hp, f0 = far.hp;
  run(0.05, aimAt(a, b, { cast: 0 }));
  const expected = near.maxHp * SKILLS.holylight.heal * SKILLS.holylight.allyHeal;
  assert.ok(Math.abs((near.hp - n0) - expected) < 2, 'aliado próximo curado');
  assert.equal(far.hp, f0, 'aliado distante intacto');
  assert.ok(b.hp <= b.maxHp * 0.4, 'inimigo não é curado');
  assert.ok(ofType(w, 'heal').some((e) => e.actor === near));
});

test('Clérigo em grupo: Escudo Divino protege também o aliado mais próximo (60%)', () => {
  const { w, a, b, run } = duel('cleric', 'warrior', { dist: 80 });
  const ally = w.add(makeHeroActor(hero('archer'), a.x + 100, a.y, 'rival', 1));
  const other = w.add(makeHeroActor(hero('mage'), a.x + 200, a.y, 'rival', 1));
  run(0.05, aimAt(a, b, { cast: 1 }));
  assert.ok(Math.abs(ally.shield - ally.maxHp * 0.35 * SKILLS.divineshield.allyShield) < 1);
  assert.equal(other.shield, 0, 'só o mais próximo');
  assert.ok(ofType(w, 'status').some((e) => e.kind === 'shield' && e.actor === ally && e.from === a));
});

test('Clérigo sozinho continua funcionando (sem aliados, nada quebra)', () => {
  const { w, a, b, run } = duel('cleric', 'warrior', { dist: 80 });
  a.hp = a.maxHp * 0.5;
  run(0.05, aimAt(a, b, { cast: 0 }));
  assert.ok(a.hp > a.maxHp * 0.5);
  run(0.05, aimAt(a, b, { cast: 1 }));
  assert.ok(a.shield > 0);
});
