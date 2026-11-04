import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../public/src/core/rng.js';
import { newCharacter } from '../public/src/core/progression.js';
import { CLASSES } from '../public/src/data/classes.js';
import { SKILLS } from '../public/src/data/skills.js';
import { KIT_SKILLS, SPEC_KITS } from '../public/src/data/kits.js';
import { SPECS } from '../public/src/data/specs.js';
import { skillIdAt, kitIds, kitSpec, isSkillUnlocked, masteryUnlock, unlockedSkills } from '../public/src/core/unlocks.js';
import { skillOf } from '../public/src/core/specs.js';
import { skillIconUrl } from '../public/src/render/skill-icons.js';
import { World, makeHeroActor } from '../public/src/game/sim.js';
import { spawnSkillVfx } from '../public/src/render/skill-vfx.js';
import { validate } from '../public/src/core/savedoc.js';
import { existsSync } from 'node:fs';

const ALL = Object.entries(SPECS).flatMap(([cid, m]) => Object.keys(m).map((sid) => [cid, sid]));
const hero = (classId, level, spec = null) => {
  const c = newCharacter('T', classId, makeRng(4)); c.level = level; c.spec = spec;
  if (level >= 25) c.quests = { active: {}, done: { prova_do_mestre: 1, maestria: 1 } };
  return c;
};
const NONE = { mx: 0, my: 0 };

test('cada especialização tem kit próprio: 3 habilidades + Maestria, ids únicos e distintos entre TODAS as especializações e das da classe', () => {
  assert.equal(ALL.length, 8);
  const seen = new Set();
  for (const [cid, sid] of ALL) {
    const kit = SPECS[cid][sid].kit;
    assert.ok(kit && kit === SPEC_KITS[sid], sid + ' sem kit');
    assert.equal(kit.skills.length, 3);
    for (const id of [...kit.skills, kit.mastery]) {
      assert.ok(KIT_SKILLS[id] && SKILLS[id] === KIT_SKILLS[id], `${sid}: ${id} fora de data/kits.js`);
      assert.ok(!seen.has(id), `${id} repetida`); seen.add(id);
      assert.ok(!CLASSES[cid].skills.includes(id) && CLASSES[cid].mastery !== id, `${id} igual à da classe`);
    }
  }
  assert.equal(seen.size, 32);
  const names = new Set([...seen].map((i) => SKILLS[i].name));
  assert.equal(names.size, 32, 'nomes distintos');
  // Paladino e Berserker (a queixa do dono): nenhuma habilidade em comum
  const p = SPEC_KITS.paladin, b = SPEC_KITS.berserker;
  for (const id of [...p.skills, p.mastery]) assert.ok(![...b.skills, b.mastery].includes(id));
});

test('dados de cada habilidade do kit: textos, recarga, kind conhecido e ícone existente (arte emprestada até o dono entregar a própria)', () => {
  const KINDS = ['aoe_self', 'dash', 'buff', 'projectile', 'ground_aoe', 'blink', 'meteor', 'divine', 'cone', 'channel', 'summon', 'trap', 'zone'];
  for (const [id, s] of Object.entries(KIT_SKILLS)) {
    assert.ok(s.name && s.icon && s.desc && s.desc.length <= 190, id);
    assert.ok(KINDS.includes(s.kind), `${id}: kind ${s.kind}`);
    assert.ok(s.cd >= 3 && s.cd <= 45, `${id}: recarga ${s.cd}`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(s.color), id);
    assert.ok(existsSync('public/' + skillIconUrl(id)), `${id}: sem ícone (${s.art})`);
  }
});

test('skillIdAt: o kit da especialização ocupa os slots; sem spec ou abaixo do nível 15 vale o kit da classe', () => {
  for (const [cid, sid] of ALL) {
    const kit = SPEC_KITS[sid];
    for (let i = 0; i < 3; i++) assert.equal(skillIdAt(cid, i, sid), kit.skills[i]);
    assert.equal(skillIdAt(cid, 3, sid), kit.mastery);
    assert.equal(skillIdAt(cid, 0, null), CLASSES[cid].skills[0]);
    assert.equal(skillIdAt(cid, 3), CLASSES[cid].mastery);
    assert.deepEqual(kitIds(hero(cid, 14, sid)), [...CLASSES[cid].skills, CLASSES[cid].mastery], 'Nv14: spec ainda não vale');
    assert.deepEqual(kitIds(hero(cid, 20, sid)), [...kit.skills, kit.mastery]);
    assert.equal(kitSpec({ level: 14, spec: sid }), null);
    assert.equal(masteryUnlock(cid, sid).id, kit.mastery);
    assert.deepEqual(unlockedSkills(hero(cid, 20, sid)), kit.skills, 'Nv20 sem Maestria: 3 habilidades do kit');
    assert.deepEqual(unlockedSkills(hero(cid, 25, sid)), [...kit.skills, kit.mastery]);
  }
  assert.equal(skillOf('warrior', 'paladin', 'pal_hammer'), SKILLS.pal_hammer, 'skillOf devolve a habilidade do kit sem mods');
});

test('migração de save: a habilidade antiga some e a do kit ocupa o slot; sem especialização nada muda', () => {
  const c = hero('warrior', 20, 'paladin');
  const r = validate(c);
  assert.ok(r.ok);
  assert.deepEqual(kitIds(r.char), [...SPEC_KITS.paladin.skills, SPEC_KITS.paladin.mastery]);
  const base = validate(hero('warrior', 20, null)).char;
  assert.deepEqual(kitIds(base), [...CLASSES.warrior.skills, CLASSES.warrior.mastery]);
});

// ---- cada habilidade dispara, tem cooldown e vfx válido ----
const arena = (classId, spec, { foe = 'warrior', dist = 160, n = 1, foeLevel = 20 } = {}) => {
  const w = new World('arena', { seed: 5, visuals: true });
  const a = w.add(makeHeroActor(hero(classId, 30, spec), 600, 600, 'player', 1));
  const foes = [];
  for (let i = 0; i < n; i++) foes.push(w.add(makeHeroActor(hero(foe, foeLevel), 600 + dist, 600 + i * 14, 'rival', 2)));
  const step = (k, it = {}) => { for (let i = 0; i < k; i++) w.update(1 / 60, { [a.id]: { ...NONE, aimX: foes[0].x, aimY: foes[0].y, ...(i === 0 ? it : null) }, ...Object.fromEntries(foes.map((f) => [f.id, NONE])) }); };
  return { w, a, foes, step };
};

for (const [cid, sid] of ALL) {
  test(`kit ${sid}: as 4 habilidades disparam, têm cooldown, afetam o alvo e têm efeito visual numérico válido`, () => {
    const kit = SPEC_KITS[sid];
    [...kit.skills, kit.mastery].forEach((id, idx) => {
      const s = SKILLS[id];
      const { w, a, foes, step } = arena(cid, sid, { dist: s.kind === 'cone' || s.kind === 'dash' && s.slam ? 100 : 160, n: 2 });
      a.hp = a.maxHp * 0.6; foes.forEach((f) => { f.hp = f.maxHp; });
      const hp0 = foes.map((f) => f.hp), mine0 = a.hp;
      step(1, { cast: idx });
      assert.ok(a.cds['s' + idx] > 0, `${id}: sem cooldown`);
      const castEv = w.events.find((e) => e.type === 'cast' && e.skill === id);
      assert.ok(castEv, `${id}: sem evento cast`);
      assert.ok(a.cds['s' + idx] <= s.cd + 1e-6, `${id}: cooldown maior que o dado`);
      // recarga: segunda tentativa imediata é ignorada (exceto a 2ª carga do Rolamento Duplo)
      const before = w.events.filter((e) => e.type === 'cast').length;
      if (!s.twice) { step(1, { cast: idx }); assert.equal(w.events.filter((e) => e.type === 'cast').length, before, `${id}: lançou de novo em cooldown`); }
      step(150, { aimX: foes[0].x, aimY: foes[0].y }); // deixa mira, ondas, minas e canais acontecerem
      const dealt = foes.some((f, i) => f.hp < hp0[i] || f.stunT > 0 || f.markT > 0 || f.slowT > 0 || f.burn);
      const selfEffect = a.hp > mine0 || a.shield > 0 || a.buffs.length > 0 || a.dash || a.cds['s' + idx] > 0;
      if (s.kind === 'projectile' || s.kind === 'cone' || s.kind === 'channel' || s.kind === 'summon' || s.kind === 'ground_aoe' || s.kind === 'meteor' || s.kind === 'trap' || s.kind === 'aoe_self') assert.ok(dealt, `${id}: não afetou o inimigo`);
      assert.ok(selfEffect, id);
      // efeito visual: números finitos
      const f = spawnSkillVfx(w, castEv);
      assert.ok(f, `${id}: sem vfx mapeado`);
      for (const k of ['life', 'x', 'y', 'ang', 'r', 'dur', 'range']) assert.ok(Number.isFinite(f[k]), `${id}: vfx.${k}`);
      assert.ok(f.life > 0 && f.life < 12);
    });
  });
}

test('kits: fisica das novas mecânicas (marca, sangramento, cone, escudo em grupo, reflexo, imunidade, custo de vida, duas cargas, mira)', () => {
  // Martelo Sagrado: atordoa e marca (+15% de dano recebido)
  let t = arena('warrior', 'paladin');
  t.step(1, { cast: 0 }); t.step(60, { aimX: t.foes[0].x, aimY: t.foes[0].y });
  assert.ok(t.foes[0].markT > 0 && t.foes[0].markAmt === 0.15, 'marcado');
  // Machadada em Arco: acerta quem está no cone e sangra; quem está atrás não é atingido
  t = arena('warrior', 'berserker', { dist: 100 });
  const behind = t.w.add(makeHeroActor(hero('warrior', 20), 500, 600, 'rival', 2)); // atrás do herói (ele mira para +x)
  t.step(1, { cast: 2 });
  assert.ok(t.foes[0].hp < t.foes[0].maxHp && t.foes[0].burn, 'cone acertou e sangra');
  assert.equal(behind.hp, behind.maxHp, 'fora do cone');
  // Frenesi custa vida e dá velocidade de ataque e roubo de vida; não mata (vida baixa recusa)
  t = arena('warrior', 'berserker');
  const hp0 = t.a.hp; t.step(1, { cast: 1 });
  assert.ok(t.a.hp < hp0 && t.w.buffVal(t.a, 'as') > 0 && t.w.buffVal(t.a, 'ls') > 0);
  t = arena('warrior', 'berserker'); t.a.hp = 5;
  t.step(1, { cast: 1 }); assert.equal(t.a.cds.s1, 0, 'sem vida para pagar: não lança'); assert.equal(t.a.hp, 5);
  // Salto Brutal: invulnerável no ar, esmaga e sangra
  t = arena('warrior', 'berserker', { dist: 250 });
  t.step(1, { cast: 0 }); assert.ok(t.a.dash?.invuln);
  t.step(40, { aimX: t.foes[0].x, aimY: t.foes[0].y });
  assert.ok(t.foes[0].hp < t.foes[0].maxHp, 'o esmagamento feriu');
  // Investida do Escudo: imune por 1 s (nenhum dano passa) e depois volta a sofrer
  t = arena('warrior', 'paladin', { dist: 300 });
  t.step(1, { cast: 2 }); const f = t.foes[0]; const hp1 = t.a.hp;
  t.w.damage(f, t.a, 5); assert.equal(t.a.hp, hp1, 'imune');
  t.step(70); t.w.damage(f, t.a, 5); assert.ok(t.a.hp < hp1, 'imunidade acabou');
  // Aura de Bastião: reflete parte do dano ao agressor
  t = arena('warrior', 'paladin');
  t.step(1, { cast: 1 });
  const fhp = t.foes[0].hp; t.w.damage(t.foes[0], t.a, 3);
  assert.ok(t.foes[0].hp < fhp, 'agressor sofreu o reflexo');
  // Escudo Divino Reforçado: TODOS os aliados no raio ganham escudo
  const w = new World('arena', { seed: 2, visuals: false });
  const g = w.add(makeHeroActor(hero('cleric', 30, 'guardian'), 600, 600, 'player', 1));
  const al = [1, 2, 3].map((i) => w.add(makeHeroActor(hero('warrior', 20), 600 + i * 60, 600, 'player', 1)));
  w.update(1 / 60, { [g.id]: { ...NONE, cast: 1, aimX: 700, aimY: 600 } });
  assert.ok(g.shield > 0); for (const x of al) assert.ok(x.shield > 0, 'aliado sem escudo');
  // Palavra de Salvação cura aliados e remove atordoamento deles
  al[0].hp = 10; al[0].stunT = 3;
  w.update(1 / 60, { [g.id]: { ...NONE, cast: 2, aimX: 700, aimY: 600 } });
  assert.ok(al[0].hp > 10 && al[0].stunT === 0);
  // Recuo Tático: impulso para trás + crítico garantido consumido no 1º golpe
  t = arena('archer', 'sniper', { dist: 200 });
  const x0 = t.a.x; t.step(1, { cast: 2 }); t.step(20, { aimX: t.foes[0].x, aimY: t.foes[0].y });
  assert.ok(t.a.x < x0 - 100, 'foi para trás'); // inimigo está em +x
  assert.ok(t.w.buffVal(t.a, 'crit') >= 100);
  t.w.damage(t.a, t.foes[0], 1); assert.equal(t.w.buffVal(t.a, 'crit'), 0, 'crítico consumido'); assert.ok(t.w.events.some((e) => e.type === 'hit' && e.crit));
  // Tiro Mira Perfeita: demora o windup e o atordoamento cancela o tiro
  t = arena('archer', 'sniper');
  t.step(1, { cast: 0 }); assert.equal(t.w.projectiles.length, 0, 'ainda mirando');
  t.a.stunT = 1; t.step(60); assert.equal(t.w.projectiles.length, 0, 'tiro cancelado'); assert.equal(t.foes[0].hp, t.foes[0].maxHp);
  t = arena('archer', 'sniper'); t.step(1, { cast: 0 }); t.step(50, { aimX: t.foes[0].x, aimY: t.foes[0].y });
  assert.ok(t.foes[0].hp < t.foes[0].maxHp, 'tiro saiu');
  // Rolamento Duplo: 2ª esquiva sai logo; depois a recarga cheia
  t = arena('archer', 'gunslinger');
  t.step(1, { cast: 2 }); assert.ok(t.a.cds.s2 <= 0.3 + 1e-6); t.step(25);
  assert.equal(t.a.cds.s2, 0); t.step(1, { cast: 2 }); assert.ok(t.a.cds.s2 > 3.5, 'recarga cheia após a 2ª');
  t = arena('archer', 'gunslinger'); t.step(1, { cast: 2 }); t.step(60 * 2.5);
  assert.ok(t.a.cds.s2 > 3, 'janela vencida: recarga cheia começa');
  // Saraivada: 5 rajadas de 3 = 15 projéteis ao longo do tempo
  t = arena('archer', 'gunslinger'); t.a.cds.s3 = 0;
  let shots = 0; t.step(1, { cast: 3 }); shots += t.w.projectiles.length;
  let prev = new Set(t.w.projectiles); for (let i = 0; i < 80; i++) { t.step(1); for (const p of t.w.projectiles) if (!prev.has(p)) { shots++; prev.add(p); } }
  assert.equal(shots, 25);
  // Armadilha: prende uma vez por inimigo
  t = arena('archer', 'sniper', { dist: 200 });
  t.step(1, { cast: 1 }); t.step(10, { aimX: t.foes[0].x, aimY: t.foes[0].y });
  assert.ok(t.foes[0].stunT > 0.8, 'preso'); t.step(120); const s1 = t.foes[0].stunT; assert.equal(s1, 0, 'preso só uma vez');
  // Maldição: ao morrer amaldiçoado, passa ao vizinho
  t = arena('mage', 'warlock', { n: 2, dist: 150 });
  const [v1, v2] = t.foes; v1.x = 720; v2.x = 760; v2.y = 650; v1.hp = 5; v1.maxHp = 5;
  t.w.applyBurn(t.a, v1, { dur: 7, every: 0.5, mult: 0.5, spread: 150 }); t.step(40);
  assert.ok(v1.dead && v2.burn, 'praga saltou');
  // Drenar Vida cura o bruxo; quebra se atordoado
  t = arena('mage', 'warlock', { dist: 150 }); t.a.hp = t.a.maxHp * 0.5; const h0 = t.a.hp;
  t.step(1, { cast: 1 }); t.step(100, { aimX: t.foes[0].x, aimY: t.foes[0].y });
  assert.ok(t.a.hp > h0 && t.foes[0].hp < t.foes[0].maxHp, 'drenou');
  // Pacto Sombrio: custa vida e espectros atiram sozinhos
  t = arena('mage', 'warlock', { dist: 250 }); const hp2 = t.a.hp;
  t.step(1, { cast: 2 }); assert.ok(t.a.hp < hp2);
  t.step(120, { aimX: t.foes[0].x, aimY: t.foes[0].y }); assert.ok(t.foes[0].hp < t.foes[0].maxHp, 'espectros feriram');
  // Passo Fase: deixa mina na origem que explode
  t = arena('mage', 'arcane', { dist: 160 });
  const ox = t.a.x; t.a.x = ox; t.step(1, { cast: 2, aimX: ox - 300, aimY: 600 });
  assert.ok(t.a.x < ox - 100, 'teleportou'); assert.equal(t.w.telegraphs.length, 1);
  // Santuário do Sol: cura e protege quem está dentro
  const w2 = new World('arena', { seed: 2, visuals: false });
  const p = w2.add(makeHeroActor(hero('warrior', 30, 'paladin'), 600, 600, 'player', 1));
  const ally = w2.add(makeHeroActor(hero('mage', 20), 660, 600, 'player', 1));
  ally.hp = ally.maxHp * 0.5; const ah = ally.hp;
  w2.update(1 / 60, { [p.id]: { ...NONE, cast: 3, aimX: 700, aimY: 600 } });
  for (let i = 0; i < 90; i++) w2.update(1 / 60, {});
  assert.ok(ally.hp > ah, 'aliado curado'); assert.ok(w2.buffVal(ally, 'dr') >= 0.45, 'protegido');
});

test('o kit é a única fonte do slot: o ator só lança a habilidade da própria especialização', () => {
  const w = new World('arena', { seed: 1, visuals: false });
  const a = w.add(makeHeroActor(hero('warrior', 30, 'berserker'), 600, 600, 'player', 1));
  const b = w.add(makeHeroActor(hero('warrior', 30, 'paladin'), 700, 600, 'rival', 2));
  w.update(1 / 60, { [a.id]: { ...NONE, cast: 1, aimX: 700, aimY: 600 }, [b.id]: { ...NONE, cast: 1, aimX: 600, aimY: 600 } });
  const casts = w.events.filter((e) => e.type === 'cast').map((e) => e.skill).sort();
  assert.deepEqual(casts, ['bsk_frenzy', 'pal_aura']);
});
