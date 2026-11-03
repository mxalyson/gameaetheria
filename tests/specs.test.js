import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../public/src/core/rng.js';
import { newCharacter } from '../public/src/core/progression.js';
import { generateRival } from '../public/src/core/rival.js';
import { CLASSES } from '../public/src/data/classes.js';
import { SKILLS } from '../public/src/data/skills.js';
import { SPECS, SPEC_LEVEL, SEAL_PRICE, SEAL_MAX, SPEC_ALIASES, SKILL_EXTRA_FIELDS } from '../public/src/data/specs.js';
import { skillOf, chooseSpec, buySeal, activeSpec, specsOf, basicOf, lowHpBonus, normSpec } from '../public/src/core/specs.js';
import { computeStats } from '../public/src/core/stats.js';
import { validate } from '../public/src/core/savedoc.js';
import { SPEC_ORDER } from '../public/src/core/aura.js';
import { World, makeHeroActor } from '../public/src/game/sim.js';

const hero = (classId, level) => { const c = newCharacter('T', classId, makeRng(4)); c.level = level; return c; };
const ALL = Object.entries(SPECS).flatMap(([cid, m]) => Object.keys(m).map((sid) => [cid, sid]));
const withProva = (c) => { c.quests = { active: {}, done: { prova_do_mestre: 1 } }; return c; };
const NONE = { mx: 0, my: 0 };
// duelo parado: herói `a` (classe/spec) a 150 px do inimigo `b`; step(n, intenção) avança n quadros
const duel = (classId, spec, enemyClass = 'warrior', lvl = 20) => {
  const w = new World('arena', { seed: 3, visuals: false });
  const c = hero(classId, lvl); c.spec = spec;
  const a = w.add(makeHeroActor(c, 550, 600, 'player', 1));
  const b = w.add(makeHeroActor(hero(enemyClass, lvl), 550, 450, 'rival', 2));
  return { w, a, b, step: (n, it) => { for (let i = 0; i < n; i++) w.update(1 / 60, { [a.id]: { ...NONE, aimX: b.x, aimY: b.y, ...(i === 0 ? it : null) }, [b.id]: NONE }); } };
};

test('as 8 especializações: nomes, descrições (até 140 caracteres), ícones e só ajustam o que a classe já tem', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(SPECS).map(([k, v]) => [k, Object.keys(v)])), {
    warrior: ['paladin', 'berserker'], mage: ['arcane', 'warlock'], archer: ['sniper', 'gunslinger'], cleric: ['guardian', 'inquisitor'],
  });
  assert.equal(ALL.length, 8);
  for (const [cid, sid] of ALL) {
    const sp = SPECS[cid][sid], cls = CLASSES[cid];
    assert.ok(sp.name && sp.icon && sp.desc, sid + ' sem textos');
    assert.ok(sp.desc.length <= 140, `${sid}: descrição com ${sp.desc.length} caracteres`);
    for (const [skillId, mod] of Object.entries(sp.skills)) {
      assert.ok(cls.skills.includes(skillId), `${cid}/${sid} mexe em ${skillId}, que não é da classe`);
      assert.ok(mod.desc && mod.desc.length <= 140, `${sid}/${skillId}: desc`);
      for (const f of Object.keys(mod)) assert.ok(f === 'desc' || f in SKILLS[skillId] || SKILL_EXTRA_FIELDS.includes(f), `${sid}/${skillId}: campo desconhecido "${f}"`);
    }
    assert.doesNotMatch(sp.desc, /tecla|clique|botão/i, 'sem citar teclas');
  }
  assert.equal(Object.keys(CLASSES).length, 4, 'continuam 4 classes');
  for (const cls of Object.values(CLASSES)) assert.equal(cls.skills.length, 3);
});

test('os 8 códigos de rede da aura continuam na mesma ordem e cobrem exatamente as 8 especializações', () => {
  assert.deepEqual(SPEC_ORDER, ['paladin', 'berserker', 'arcane', 'warlock', 'sniper', 'gunslinger', 'guardian', 'inquisitor']);
  assert.deepEqual([...SPEC_ORDER].sort(), ALL.map(([, s]) => s).sort());
});

test('migração dos saves: ids antigos viram os novos (documento e normSpec); sem especialização continua sem', () => {
  assert.deepEqual(SPEC_ALIASES, { bastion: 'paladin', executioner: 'berserker', pyromancer: 'arcane', cryomancer: 'warlock', marksman: 'sniper', hunter: 'gunslinger' });
  const cases = [['warrior', 'bastion', 'paladin'], ['warrior', 'executioner', 'berserker'], ['mage', 'pyromancer', 'arcane'], ['mage', 'cryomancer', 'warlock'],
    ['archer', 'marksman', 'sniper'], ['archer', 'hunter', 'gunslinger'], ['cleric', 'guardian', 'guardian'], ['cleric', 'inquisitor', 'inquisitor']];
  for (const [cid, old, neu] of cases) {
    const c = hero(cid, 20); c.spec = old;
    const r = validate(c);
    assert.equal(r.ok, true); assert.equal(r.char.spec, neu, old); assert.deepEqual(r.warnings, [], 'migração silenciosa');
    assert.equal(normSpec(old), neu);
  }
  const c = hero('mage', 20); c.spec = 'bastion'; // id antigo de OUTRA classe continua inválido
  assert.equal(validate(c).char.spec, null);
  assert.equal(validate(hero('mage', 20)).char.spec, null);
});

test('skillOf: sem especialização devolve a habilidade original; com ela mescla (inclusive buff campo a campo)', () => {
  assert.equal(skillOf('warrior', null, 'warcry'), SKILLS.warcry);
  assert.equal(skillOf('warrior', 'paladin', 'whirlwind'), SKILLS.whirlwind, 'skill não alterada pela spec fica igual');
  const w = skillOf('warrior', 'paladin', 'warcry');
  assert.equal(w.dur, 12); assert.equal(w.buff.dr, SPECS.warrior.paladin.skills.warcry.buff.dr); assert.equal(w.buff.dmg, 0.15);
  assert.equal(w.kind, SKILLS.warcry.kind); assert.equal(w.name, SKILLS.warcry.name);
  assert.equal(SKILLS.warcry.dur, 6, 'o dado original não é alterado');
  assert.equal(skillOf('warrior', 'paladin', 'warcry'), w, 'cache estável');
  assert.equal(skillOf('mage', 'arcane', 'fireball').name, 'Projétil Arcano');
});

test('escolha: só no nível 15 com a Prova; a PRIMEIRA é grátis e sem Selo', () => {
  const c = hero('mage', SPEC_LEVEL - 1); c.gold = 1000;
  assert.equal(chooseSpec(c, 'arcane').ok, false);
  c.level = SPEC_LEVEL;
  assert.equal(chooseSpec(c, 'arcane').ok, false, 'sem a Prova do Mestre não escolhe');
  withProva(c);
  assert.equal(chooseSpec(c, 'inexistente').ok, false);
  assert.equal(chooseSpec(c, 'guardian').ok, false, 'spec de outra classe');
  assert.deepEqual(chooseSpec(c, 'arcane'), { ok: true, paid: false, seals: 0 });
  assert.equal(c.gold, 1000); assert.equal(c.spec, 'arcane'); assert.ok(!c.specChanges);
  assert.equal(chooseSpec(c, 'arcane').ok, false, 'mesma spec');
});

test('reespecialização paga: sem Selo não troca; o Selo custa 15.000 de ouro e é consumido na troca', () => {
  assert.equal(SEAL_PRICE, 15000);
  const c = withProva(hero('mage', 20)); c.gold = 20000;
  assert.equal(chooseSpec(c, 'arcane').ok, true);
  const no = chooseSpec(c, 'warlock');
  assert.equal(no.ok, false); assert.match(no.reason, /Selo/); assert.equal(c.spec, 'arcane', 'nada mudou'); assert.equal(c.gold, 20000);
  assert.deepEqual(buySeal(c), { ok: true, price: 15000, seals: 1 }); assert.equal(c.gold, 5000);
  const poor = buySeal(c);
  assert.equal(poor.ok, false); assert.match(poor.reason, /Faltam 10000/);
  assert.deepEqual(chooseSpec(c, 'warlock'), { ok: true, paid: true, seals: 0 });
  assert.equal(c.spec, 'warlock'); assert.equal(c.seals, 0); assert.equal(c.specChanges, 1, 'histórico de trocas');
  assert.equal(chooseSpec(c, 'arcane').ok, false, 'o Selo foi consumido: trocar de novo exige outro');
  c.gold = 15000 * 2; buySeal(c); buySeal(c); chooseSpec(c, 'arcane'); chooseSpec(c, 'warlock');
  assert.equal(c.specChanges, 3); assert.equal(c.seals, 0);
});

test('Selo: teto de carga e nível mínimo; o documento guarda seals e specChanges dentro dos limites', () => {
  const c = hero('warrior', 20); c.gold = 1e9;
  for (let i = 0; i < SEAL_MAX; i++) assert.equal(buySeal(c).ok, true);
  assert.equal(buySeal(c).ok, false); assert.equal(c.seals, SEAL_MAX);
  assert.equal(buySeal(hero('warrior', 10)).ok, false, 'antes do nível 15');
  const d = hero('warrior', 20); d.seals = 999; d.specChanges = 5;
  assert.equal(validate(d).char.seals, SEAL_MAX); assert.equal(validate(d).char.specChanges, 5);
  assert.equal(validate(hero('warrior', 20)).char.seals, 0);
});

test('abaixo do nível 15 a spec salva não vale (activeSpec)', () => {
  const c = hero('cleric', 10); c.spec = 'guardian';
  assert.equal(activeSpec(c), null);
  c.level = 15; assert.equal(activeSpec(c), 'guardian');
  assert.deepEqual(Object.keys(specsOf('cleric')), ['guardian', 'inquisitor']);
});

test('o início do jogo não muda: abaixo do nível 15 a spec não mexe nos atributos e o ataque básico é o da classe', () => {
  for (const cid of Object.keys(CLASSES)) {
    const a = hero(cid, 14); a.spec = Object.keys(SPECS[cid])[0];
    assert.deepEqual(computeStats(a), computeStats(hero(cid, 14)));
    assert.equal(basicOf(cid, null), CLASSES[cid].basic);
  }
});

test('atributos por especialização: Paladino defende, Berserker troca defesa por poder, Bruxo é frágil e rouba vida, Franco-atirador acerta crítico', () => {
  const st = (cid, spec, lvl = 20) => { const c = hero(cid, lvl); c.spec = spec; return computeStats(c); };
  const w0 = st('warrior', null), pal = st('warrior', 'paladin'), ber = st('warrior', 'berserker');
  assert.ok(pal.def > w0.def); assert.ok(pal.lifesteal > 0); assert.equal(pal.block, 0, 'sem escudo equipado não bloqueia');
  assert.ok(ber.power > w0.power && ber.def < w0.def);
  const m0 = st('mage', null), wl = st('mage', 'warlock');
  assert.ok(wl.maxHp < m0.maxHp); assert.ok(wl.lifesteal > m0.lifesteal);
  const a0 = st('archer', null), sn = st('archer', 'sniper');
  assert.ok(sn.crit > a0.crit + 7 && sn.critMult > a0.critMult);
  const sh = hero('warrior', 20); sh.spec = 'paladin';
  sh.equipment.offhand = { id: 'e', kind: 'gear', slot: 'offhand', classId: 'warrior', rarity: 'rare', level: 10, reqLevel: 8, value: 5, name: 'Escudo', stats: { def: 3, block: 20 } };
  assert.equal(computeStats(sh).block, 28, 'Paladino soma 8 ao bloqueio do escudo');
});

test('ataque básico: Franco-atirador mais lento e de longo alcance; Pistoleiro mais rápido e de curto alcance', () => {
  const base = CLASSES.archer.basic;
  assert.ok(basicOf('archer', 'sniper').cd > base.cd && basicOf('archer', 'sniper').range > base.range);
  assert.ok(basicOf('archer', 'gunslinger').cd < base.cd && basicOf('archer', 'gunslinger').range < base.range);
  assert.equal(basicOf('archer', 'sniper'), basicOf('archer', 'sniper'), 'cache');
  const { a, step } = duel('archer', 'gunslinger');
  step(1, { attack: true });
  assert.ok(Math.abs(a.cds.basic - (SPECS.archer.gunslinger.mods.basic.cd / a.stats.atkSpeed - 1 / 60)) < 0.02, 'a recarga do ataque vem da spec');
});

test('na simulação (Mago): Arcano perfura e atordoa, Bruxo queima ao longo do tempo e rouba vida', () => {
  // Arcano: o projétil atravessa dois alvos alinhados
  const w = new World('arena', { seed: 3, visuals: false });
  const c = hero('mage', 20); c.spec = 'arcane';
  const a = w.add(makeHeroActor(c, 550, 600, 'player', 1));
  const b1 = w.add(makeHeroActor(hero('warrior', 20), 550, 470, 'rival', 2));
  const b2 = w.add(makeHeroActor(hero('warrior', 20), 550, 380, 'rival', 2));
  const hp = [b1.hp, b2.hp];
  w.update(1 / 60, { [a.id]: { ...NONE, aimX: 550, aimY: 300, cast: 0 }, [b1.id]: NONE, [b2.id]: NONE });
  for (let i = 0; i < 60; i++) w.update(1 / 60, { [a.id]: NONE, [b1.id]: NONE, [b2.id]: NONE });
  assert.ok(b1.hp < hp[0] && b2.hp < hp[1], 'os dois levaram dano');
  assert.ok(Math.abs(a.cds.s0 - (SPECS.mage.arcane.skills.fireball.cd - 1)) < 0.05, 'recarga da spec');
  // Nova Arcana atordoa (inimigo dentro do raio)
  const n = duel('mage', 'arcane'); n.b.y = 560; n.step(1, { cast: 1 });
  assert.ok(n.b.stunT > 0.8, `Nova Arcana atordoa (stunT=${n.b.stunT})`);
  const n0 = duel('mage', null); n0.b.y = 560; n0.step(1, { cast: 1 });
  assert.equal(n0.b.stunT, 0, 'a Nova de Gelo comum não atordoa');
  // Teleporte do Arcano recarrega mais depressa
  const t = duel('mage', 'arcane'); t.step(1, { cast: 2 });
  assert.ok(t.a.cds.s2 < SKILLS.blink.cd - 1);
  // Bruxo: dano ao longo do tempo
  const k = duel('mage', 'warlock'); k.b.y = 580; k.step(1, { cast: 0 });
  k.step(30);
  assert.ok(k.b.burn, 'o alvo está sob maldição');
  const hpA = k.b.hp; k.a.hp = 1; k.step(60);
  assert.ok(k.b.hp < hpA, 'continua perdendo vida sem novo golpe');
  assert.ok(k.a.hp > 1, 'e a vida do Bruxo é alimentada pelo dano');
});

test('na simulação (Guerreiro): Paladino protege aliados; Berserker bate mais forte, ainda mais com pouca vida', () => {
  const w = new World('arena', { seed: 8, visuals: false });
  const c = hero('warrior', 20); c.spec = 'paladin';
  const a = w.add(makeHeroActor(c, 550, 600, 'player', 1));
  const ally = w.add(makeHeroActor(hero('mage', 20), 600, 600, 'rival', 1));
  const foe = w.add(makeHeroActor(hero('warrior', 20), 550, 400, 'rival', 2));
  w.update(1 / 60, { [a.id]: { ...NONE, aimX: foe.x, aimY: foe.y, cast: 2 }, [ally.id]: NONE, [foe.id]: NONE });
  assert.equal(a.buffs[0].t > 11.9, true, 'Grito dura 12s');
  assert.equal(w.buffVal(a, 'dr'), 0.28); assert.equal(w.buffVal(ally, 'dr'), 0.28, 'aliado por perto recebe o mesmo reforço');
  // Investida do Paladino: escudo para o aliado
  const w2 = new World('arena', { seed: 8, visuals: false });
  const c2 = hero('warrior', 20); c2.spec = 'paladin';
  const p2 = w2.add(makeHeroActor(c2, 550, 600, 'player', 1));
  const al2 = w2.add(makeHeroActor(hero('mage', 20), 600, 600, 'rival', 1));
  w2.update(1 / 60, { [p2.id]: { ...NONE, aimX: 550, aimY: 300, cast: 1 }, [al2.id]: NONE });
  assert.ok(al2.shield > 0, 'a Investida ampara o aliado');
  const dmgAt = (spec, frac) => { const m = duel('warrior', spec); m.b.y = 540; m.a.hp = m.a.maxHp * frac; const hp0 = m.b.hp; m.step(1, { cast: 0 }); return hp0 - m.b.hp; };
  assert.ok(dmgAt('berserker', 1) > dmgAt(null, 1) * 1.3, 'Golpe Giratório mais forte');
  assert.equal(lowHpBonus({ spec: 'berserker', classId: 'warrior', hp: 100, maxHp: 100 }), 0);
  assert.ok(lowHpBonus({ spec: 'berserker', classId: 'warrior', hp: 25, maxHp: 100 }) > 0.15);
  assert.equal(lowHpBonus({ spec: 'paladin', classId: 'warrior', hp: 1, maxHp: 100 }), 0, 'só o Berserker');
  let lo = 0, hi = 0; for (let i = 0; i < 6; i++) { lo += dmgAt('berserker', 0.2); hi += dmgAt('berserker', 1); }
  assert.ok(lo > hi * 1.1, `com pouca vida bate mais forte (${lo} vs ${hi})`);
});

test('na simulação (Arqueiro): Franco-atirador acerta um tiro devastador; Pistoleiro dispara rajada em leque e rola mais rápido', () => {
  const shot = (spec) => { const m = duel('archer', spec); const hp0 = m.b.hp; m.step(1, { cast: 1 }); m.step(90); return hp0 - m.b.hp; };
  const base = shot(null), sn = shot('sniper'), gun = shot('gunslinger');
  assert.ok(sn > base * 1.4, `Tiro Perfurante do Franco-atirador ${sn} vs ${base}`);
  assert.ok(gun > 0, 'a Rajada acerta');
  const g = duel('archer', 'gunslinger'); g.step(1, { cast: 1 });
  assert.equal(g.w.projectiles.length, 3, 'três virotes em leque');
  const r = duel('archer', 'gunslinger'); r.step(1, { cast: 2 });
  assert.ok(r.a.cds.s2 < SKILLS.roll.cd - 0.5 && r.a.cds.s2 > 2.9);
  assert.ok(skillOf('archer', 'gunslinger', 'roll').cd < SKILLS.roll.cd);
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

// ---- Berserker luta sem escudo (decisão do dono) ----
import { canEquip, noShieldSpec } from '../public/src/core/stats.js';
import { generateItem } from '../public/src/core/loot.js';
import { INVENTORY_SIZE } from '../public/src/data/items.js';
const shieldFor = (lvl = 10) => generateItem(makeRng(9), lvl, { classId: 'warrior', slot: 'offhand', rarityId: 'uncommon' });

test('Berserker: o escudo não equipa (motivo claro), não bloqueia; Paladino e sem spec continuam equipando', () => {
  const sh = shieldFor();
  const c = withProva(hero('warrior', 20));
  assert.equal(canEquip(c, sh).ok, true, 'sem spec equipa');
  c.spec = 'paladin'; assert.equal(canEquip(c, sh).ok, true);
  c.spec = 'berserker';
  const r = canEquip(c, sh);
  assert.equal(r.ok, false); assert.equal(r.reason, 'O Berserker luta sem escudo.');
  assert.ok(noShieldSpec(c));
  const low = withProva(hero('warrior', 10)); low.spec = 'berserker';
  assert.equal(canEquip(low, shieldFor(8)).ok, true, 'abaixo do nível 15 a spec ainda não vale');
  // escudo preso no slot (save sem vaga) não dá bloqueio nem defesa
  const stuck = hero('warrior', 20); stuck.spec = 'berserker'; const d0 = computeStats(stuck).def;
  stuck.equipment.offhand = sh;
  assert.equal(computeStats(stuck).block, 0); assert.equal(computeStats(stuck).def, d0);
  assert.equal(canEquip(c, { ...sh, slot: 'helm' }).ok, true, 'só o escudo é recusado');
});

test('escolher Berserker devolve o escudo equipado à mochila; mochila cheia bloqueia sem gastar Selo; voltar ao Paladino equipa de novo', () => {
  const c = withProva(hero('warrior', 20)); c.spec = 'paladin'; c.seals = 1;
  const sh = shieldFor(); c.equipment.offhand = sh; c.inventory = [];
  const r = chooseSpec(c, 'berserker');
  assert.equal(r.ok, true); assert.equal(r.shieldStored, true);
  assert.equal(c.equipment.offhand, undefined); assert.equal(c.inventory.at(-1).id, sh.id); assert.equal(c.seals, 0);
  // mochila cheia: bloqueia e não mexe em nada
  const f = withProva(hero('warrior', 20)); f.spec = 'paladin'; f.seals = 1; f.equipment.offhand = sh;
  f.inventory = Array.from({ length: INVENTORY_SIZE }, (_, i) => ({ id: 'x' + i }));
  const b = chooseSpec(f, 'berserker');
  assert.equal(b.ok, false); assert.match(b.reason, /Mochila cheia/);
  assert.equal(f.spec, 'paladin'); assert.equal(f.seals, 1); assert.ok(f.equipment.offhand);
  // volta ao Paladino (outro Selo) e equipa de novo
  c.seals = 1; assert.equal(chooseSpec(c, 'paladin').ok, true);
  assert.equal(canEquip(c, sh).ok, true);
  // primeira escolha (grátis) também devolve o escudo
  const g = withProva(hero('warrior', 20)); g.equipment.offhand = sh; g.inventory = [];
  assert.equal(chooseSpec(g, 'berserker').paid, false); assert.equal(g.inventory.length, 1);
});

test('savedoc: Berserker com escudo salvo migra o escudo para a mochila (ou o banco) e Paladino o mantém', () => {
  const mk = (spec) => { const c = hero('warrior', 20); c.spec = spec; c.equipment.offhand = shieldFor(); c.inventory = []; c.bank = []; return c; };
  const v = validate(mk('berserker'));
  assert.equal(v.ok, true); assert.equal(v.char.equipment.offhand, undefined); assert.equal(v.char.inventory.length, 1); assert.equal(v.char.inventory[0].slot, 'offhand');
  const full = mk('berserker'); full.inventory = Array.from({ length: INVENTORY_SIZE }, (_, i) => generateItem(makeRng(100 + i), 5, { classId: 'warrior', slot: 'helm' })).map((it, i) => ({ ...it, id: 'h' + i }));
  const vf = validate(full);
  assert.equal(vf.char.equipment.offhand, undefined); assert.equal(vf.char.inventory.length, INVENTORY_SIZE); assert.equal(vf.char.bank.length, 1);
  assert.ok(validate(mk('paladin')).char.equipment.offhand);
});

test('rival Berserker nasce sem escudo; a spec é mais forte em dano físico (poder, ataque básico e habilidades) que a do Paladino', () => {
  for (let s = 1; s <= 8; s++) {
    const r = generateRival(makeRng(s), { level: 20, arena: { rating: 1000 } }, { classId: 'warrior', spec: 'berserker', exactLevel: true });
    assert.equal(r.equipment.offhand, undefined);
  }
  const st = (spec) => { const c = hero('warrior', 20); c.spec = spec; return computeStats(c); };
  assert.ok(st('berserker').power > st('paladin').power);
  assert.ok(basicOf('warrior', 'berserker').mult > basicOf('warrior', 'paladin').mult);
  assert.ok(skillOf('warrior', 'berserker', 'whirlwind').mult > skillOf('warrior', 'paladin', 'whirlwind').mult * 1.4);
  assert.ok(skillOf('warrior', 'berserker', 'charge').mult > skillOf('warrior', 'paladin', 'charge').mult * 1.8);
  assert.ok(st('berserker').def < st('paladin').def);
});
