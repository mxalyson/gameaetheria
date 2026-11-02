import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../public/src/core/rng.js';
import { computeStats, canEquip, rookieHp, rookiePower } from '../public/src/core/stats.js';
import { computeHit, eloDelta, tierFor } from '../public/src/core/combat.js';
import { generateItem, rollMobLoot } from '../public/src/core/loot.js';
import { addXp, xpToNext, newCharacter, createSpirit, addSpiritXp, MAX_LEVEL } from '../public/src/core/progression.js';
import { generateRival } from '../public/src/core/rival.js';
import { CLASSES } from '../public/src/data/classes.js';
import { SLOTS } from '../public/src/data/items.js';
import { World, makeHeroActor, makeMobActor, makeSpiritActor, DROP_MAX } from '../public/src/game/sim.js';
import { riverX } from '../public/src/game/layout.js';

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

test('poder (PWR) cresce com nível e equipamento; PvP libera no nível 10', async () => {
  const { playerPower, pvpUnlocked, matchOk, PVP_MIN_LEVEL } = await import('../public/src/core/power.js');
  const c = newCharacter('T', 'mage', makeRng(3));
  const p1 = playerPower(c);
  c.level = 10;
  assert.ok(playerPower(c) > p1);
  assert.equal(pvpUnlocked({ level: PVP_MIN_LEVEL - 1 }), false);
  assert.equal(pvpUnlocked({ level: PVP_MIN_LEVEL }), true);
  // pareamento: janela estreita no início, abre com a espera
  const a = { rating: 1000, power: 500 }, b = { rating: 1120, power: 500 };
  assert.equal(matchOk(a, b, 0), false);
  assert.equal(matchOk(a, b, 30), true);
  assert.equal(matchOk(a, { rating: 1000, power: 800 }, 0), false);
});

test('partida por times: ponto de controle, vitória por eliminação, pontos e tempo', async () => {
  const { newMatch, controlTick, matchWinner, SCORE_TARGET, getRating, setRating, spawnSlots } = await import('../public/src/core/match.js');
  const m = newMatch('2v2');
  controlTick(m, 10, 2, 0);
  assert.equal(m.owner, 1); assert.equal(m.score[1], 20);
  controlTick(m, 10, 1, 1); // disputado não pontua
  assert.equal(m.score[1], 20); assert.equal(m.score[2], 0);
  controlTick(m, 5, 0, 1);
  assert.equal(m.owner, 2); assert.equal(m.score[2], 10);
  assert.equal(matchWinner(m, 2, 2), 0);
  assert.equal(matchWinner(m, 0, 2), 2);
  assert.equal(matchWinner(m, 2, 0), 1);
  assert.equal(matchWinner(m, 0, 0), 3);
  m.score[1] = SCORE_TARGET;
  assert.equal(matchWinner(m, 1, 2), 1);
  const t = newMatch('1v1'); t.time = t.limit; t.score[2] = 5;
  assert.equal(matchWinner(t, 1, 1), 2); // fim do tempo: lidera nos pontos
  t.score[2] = 0;
  assert.equal(matchWinner(t, 1, 1, 100, 300), 2); // empate de pontos: mais vida
  assert.equal(matchWinner(t, 1, 1, 100, 100), 3);
  // rating separado por modo; 1v1 mantém o campo antigo
  const c = { arena: { rating: 1100 } };
  assert.equal(getRating(c, '1v1'), 1100); assert.equal(getRating(c, '4v4'), 1000);
  setRating(c, '4v4', 1250);
  assert.equal(getRating(c, '4v4'), 1250); assert.equal(c.arena.rating, 1100);
  const s = spawnSlots(1, 4, 900, 1480, 320);
  assert.equal(s.length, 4); assert.ok(s.every((p) => p.y === 1480)); assert.equal(Math.round((s[0].x + s[3].x) / 2), 900);
});

test('IA do rival vai ao ponto de controle quando o inimigo está longe, e luta quando está perto', () => {
  const w = new World('arena_team', { seed: 5 });
  w.objective = { ...w.zone.objective, owner: 0, contested: false };
  const a = w.add(makeHeroActor(newCharacter('A', 'warrior', makeRng(1)), 900, 1480, 'rival', 1));
  const b = w.add(makeHeroActor(newCharacter('B', 'warrior', makeRng(2)), 900, 320, 'rival', 2));
  const y0 = a.y;
  for (let i = 0; i < 60; i++) w.update(1 / 30);
  assert.ok(a.y < y0 - 30, 'o bot anda rumo ao centro');
  assert.ok(Math.hypot(a.x - 900, a.y - 900) < Math.hypot(900 - 900, y0 - 900));
  for (let i = 0; i < 30 * 40 && !a.dead && !b.dead; i++) w.update(1 / 30);
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp, 'ao se encontrarem, trocam golpes');
});

test('rival gerado por poder-alvo fica perto do alvo (±12%) para jogadores fracos e fortes', async () => {
  const { generateRivalForPower } = await import('../public/src/core/rival.js');
  const { playerPower } = await import('../public/src/core/power.js');
  const rng = makeRng(77);
  for (const lvl of [10, 15, 25]) {
    const me = newCharacter('P', 'mage', makeRng(lvl));
    me.level = lvl;
    me.alloc.int += 4 * (lvl - 1); // nem todos os pontos distribuídos
    const target = playerPower(me);
    for (const classId of Object.keys(CLASSES)) {
      const r = generateRivalForPower(rng, me, target, { classId });
      assert.equal(r.classId, classId);
      const p = playerPower(r);
      assert.ok(Math.abs(p - target) <= target * 0.12, `nível ${lvl} ${classId}: alvo ${target}, rival ${p}`);
    }
  }
});

test('pareamento por poder é robusto: 640 combinações (nível × classe × semente) ficam dentro de ±20% do alvo, com e sem pontos distribuídos', async () => {
  const { generateRivalForPower } = await import('../public/src/core/rival.js');
  const { playerPower } = await import('../public/src/core/power.js');
  let worst = 0, n = 0;
  for (const alloc of [false, true]) for (const lvl of [10, 15, 20, 25]) for (let seed = 1; seed <= 20; seed++) for (const classId of Object.keys(CLASSES)) {
    const rng = makeRng(seed);
    const me = newCharacter('P', classId, rng); me.level = lvl;
    const sp = createSpirit(rng, { rarity: 'common' }); me.spirits.push(sp); me.activeSpirit = sp.id;
    if (alloc) me.alloc[CLASSES[classId].primary] += 3 * (lvl - 1);
    const t = playerPower(me);
    const r = generateRivalForPower(makeRng(seed * 7), me, t * (0.95 + (seed % 10) / 100), { classId });
    worst = Math.max(worst, Math.abs(playerPower(r) - t) / t); n++;
  }
  assert.equal(n, 640);
  assert.ok(worst <= 0.2, `pior desvio ${(worst * 100).toFixed(1)}%`);
});

// ---- Aprimoramento de equipamento (ralo de ouro) ----
import { enhance, enhanceCost, totalEnhanceCost, MAX_PLUS, PLUS_BONUS } from '../public/src/core/enhance.js';
import { validate } from '../public/src/core/savedoc.js';
import { checkSave } from '../server/plausible.js';
import { newOfficialCharacter } from '../server/api.js';

test('aprimorar: cobra ouro, soma 6% por nível aos atributos, para no máximo e recusa sem ouro', () => {
  const c = newOfficialCharacter('P', 'warrior'); c.gold = 1e9;
  const w = c.equipment.weapon, base = computeStats(c).power;
  const cost = enhanceCost(w);
  const r = enhance(c, w.id);
  assert.equal(r.ok, true); assert.equal(c.gold, 1e9 - cost); assert.equal(w.plus, 1);
  assert.ok(computeStats(c).power > base, 'poder sobe');
  assert.ok(enhanceCost(w) > cost, 'cada nível custa mais');
  for (let i = 1; i < MAX_PLUS; i++) assert.equal(enhance(c, w.id).ok, true);
  assert.equal(w.plus, MAX_PLUS);
  assert.equal(enhance(c, w.id).ok, false, 'máximo');
  c.gold = 0; w.plus = 0;
  assert.equal(enhance(c, w.id).ok, false, 'sem ouro');
  assert.equal(w.plus, 0); assert.equal(c.gold, 0);
  assert.ok(totalEnhanceCost(w) > 10 * w.value, 'é um ralo grande em comparação ao valor do item');
  assert.equal(PLUS_BONUS, 0.06);
});

test('aprimorar: o save mantém +N dentro do limite; servidor recusa item novo aprimorado e saltos grandes', () => {
  const c = newOfficialCharacter('P', 'warrior'); c.equipment.weapon.plus = 3;
  assert.equal(validate(structuredClone(c)).char.equipment.weapon.plus, 3);
  c.equipment.weapon.plus = 99;
  assert.equal(validate(structuredClone(c)).char.equipment.weapon.plus, MAX_PLUS, 'limitado ao máximo');
  c.equipment.weapon.plus = 'x';
  assert.equal(validate(structuredClone(c)).char.equipment.weapon.plus, undefined);
  const old = newOfficialCharacter('P', 'warrior'), neu = structuredClone(old);
  neu.equipment.weapon.plus = 2;
  assert.equal(checkSave(old, neu).ok, true, 'aprimoramento normal');
  neu.inventory.push({ ...old.equipment.weapon, id: 'novo1', plus: 5 });
  assert.equal(checkSave(old, neu).reason, 'plus_forged', 'item novo não nasce aprimorado');
  const neu2 = structuredClone(old); neu2.equipment.weapon.plus = 8; neu2.equipment.armor.plus = 8;
  assert.equal(checkSave(old, neu2).reason, 'plus_jump', 'salto grande entre gravações');
});

test('colisão com grade espacial dá exatamente o mesmo resultado da busca linear (3 zonas, 6 000 passos aleatórios)', () => {
  for (const zone of ['forest', 'plains', 'ruins']) {
    const fast = new World(zone, { seed: 5, visuals: false }), slow = new World(zone, { seed: 5, visuals: false });
    slow.nearObstacles = function () { return this.layout.obstacles; };
    const rng = makeRng(77);
    const mk = () => ({ x: rng.range(200, 2500), y: rng.range(200, 1700), r: rng.pick([12, 16, 22, 30]) });
    for (let n = 0; n < 40; n++) {
      const a = mk(), b = { ...a };
      for (let i = 0; i < 150; i++) {
        const dx = rng.range(-40, 40), dy = rng.range(-40, 40);
        fast.moveActor(a, dx, dy); slow.moveActor(b, dx, dy);
        assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9, `${zone}: divergiu no passo ${i}`);
      }
    }
  }
});

// ---- Rodada de jogabilidade: curva de XP, evolução do spirit, spirit sem ataque espontâneo e mobs passivos ----
test('XP: nível 20 leva ≥ 5× o XP total da curva antiga (farm mais longo)', () => {
  let novo = 0, antigo = 0;
  for (let L = 1; L < 20; L++) { novo += xpToNext(L); antigo += Math.round(60 * L ** 1.55); }
  assert.ok(novo >= antigo * 5, `novo ${novo} vs antigo ${antigo}`);
});

test('spirit evolui só no nível 10, paga ouro e fica 50% mais forte', async () => {
  const { evolveSpirit, evolveCost, spiritPower, EVOLVE_LEVEL } = await import('../public/src/core/progression.js');
  const c = newCharacter('T', 'mage', makeRng(5));
  const sp = createSpirit(makeRng(2), { level: EVOLVE_LEVEL - 1, rarity: 'rare' }); c.spirits.push(sp); c.gold = 1e6;
  assert.equal(evolveSpirit(c, sp.id).ok, false);
  sp.level = EVOLVE_LEVEL;
  const p0 = spiritPower(sp), cost = evolveCost(sp);
  c.gold = cost - 1; assert.equal(evolveSpirit(c, sp.id).ok, false);
  c.gold = cost; assert.equal(evolveSpirit(c, sp.id).ok, true);
  assert.equal(c.gold, 0); assert.equal(sp.stage, 2);
  assert.equal(spiritPower(sp), Math.round(p0 * 1.5));
  assert.equal(evolveSpirit(c, sp.id).ok, false, 'não evolui duas vezes');
});

test('spirit só ataca o alvo do dono: não puxa o mob, não atira em quem passa e para quando o combate acaba', () => {
  const w = new World('arena', { seed: 3 });
  const c = newCharacter('T', 'warrior', makeRng(1));
  const p = w.add(makeHeroActor(c, 550, 550)); p.hp = p.maxHp = 1e9;
  w.add(makeSpiritActor(createSpirit(makeRng(2), { type: 'ember', level: 5 }), p));
  const alvo = w.add(makeMobActor('slime', 1, 700, 550, { hostile: false }));
  const passante = w.add(makeMobActor('slime', 1, 640, 600, { hostile: false }));
  const tiros = () => w.projectiles.filter((q) => q.src.kind === 'spirit');
  let n = 0;
  for (let i = 0; i < 240; i++) { w.update(1 / 60, {}); n += tiros().length; }
  assert.equal(n, 0, 'sem combate o spirit não dispara');
  w.damage(p, alvo, 1); // o dono bate no alvo
  n = 0; for (let i = 0; i < 90; i++) { w.update(1 / 60, {}); n += tiros().length; }
  assert.ok(n > 0, 'depois de o dono atacar o spirit dispara');
  assert.equal(alvo.ai.target, p.id, 'o alvo revida contra o dono (não contra o spirit)');
  assert.equal(passante.hp, passante.maxHp, 'quem só passa não apanha do spirit');
  alvo.hp = alvo.maxHp = 1e9; alvo.ai.target = null; alvo.hostile = false; alvo.x = 900; // o dono para de atacar e o alvo fica longe e parado
  p.lastDealt = -99; p.lastDamaged = -99; p.lastAttacker = null; p.lastTarget = null; w.time += 10;
  n = 0; for (let i = 0; i < 240; i++) { w.update(1 / 60, {}); n += tiros().length; }
  assert.equal(n, 0, 'passados 3 s sem combate o spirit para (não fica atacando os mobs do caminho)');
});

test('mob passivo não ataca de longe, mas revida quando apanha', () => {
  const w = new World('arena', { seed: 4 });
  const c = newCharacter('T', 'warrior', makeRng(1));
  const p = w.add(makeHeroActor(c, 550, 550)); p.hp = p.maxHp = 1e6;
  const passivo = w.add(makeMobActor('slime', 1, 640, 550, { hostile: false }));
  const hostil = w.add(makeMobActor('wolf', 1, 560, 700, { hostile: true }));
  for (let i = 0; i < 120; i++) w.update(1 / 60, {});
  assert.equal(passivo.ai.target, null, 'passivo ignora o jogador');
  assert.equal(hostil.ai.target, p.id, 'hostil persegue');
  w.damage(p, passivo, 1);
  assert.equal(passivo.ai.target, p.id, 'passivo revida depois de apanhar');
});

test('teletransporte: custo em pergaminhos e só para mapas visitados (save antigo libera pelo nível)', async () => {
  const { teleportCost, WORLD_ROUTE, ZONES } = await import('../public/src/data/zones.js');
  const { validate } = await import('../public/src/core/savedoc.js');
  assert.equal(teleportCost('town'), 0);
  assert.equal(teleportCost('ruins'), 1, 'uma viagem = 1 pergaminho'); assert.ok(WORLD_ROUTE.every((id) => ZONES[id]));
  assert.equal(newCharacter('T', 'mage', makeRng(8)).scrolls, 2, 'personagem novo começa com 2 pergaminhos');
  const c = newCharacter('T', 'mage', makeRng(8)); c.level = 8; delete c.visited;
  const v = validate(c).char.visited;
  assert.ok(v.forest && v.plains && !v.ruins, 'nível 8 já alcança Bosque e Planície, não Ruínas');
  c.visited = { ruins: 1, arena: 1, naoexiste: 1 };
  assert.deepEqual(validate(c).char.visited, { ruins: 1 }, 'só zonas de farm válidas');
});

// ---------------- dificuldade, habilidades por nível, chefes, loot (docs/gameplay/dificuldade.md) ----------------
import { isSkillUnlocked, unlockedSkills, newlyUnlocked, skillUnlockLevel } from '../public/src/core/unlocks.js';
import { generateOpalItem, rollSourceRarity, newPity, PITY, OPAL_BOSS } from '../public/src/core/loot.js';
import { MOB_CURVE } from '../public/src/data/mobs.js';

test('habilidades: ataque básico no 1, s0 no 1, s1 no 5, s2 no 10; funções puras', () => {
  const c = newCharacter('T', 'mage', makeRng(1));
  assert.deepEqual(unlockedSkills(c), ['fireball']);
  c.level = 5; assert.deepEqual(unlockedSkills(c), ['fireball', 'frostnova']);
  c.level = 10; assert.equal(unlockedSkills(c).length, 3);
  assert.equal(isSkillUnlocked(4, 1), false); assert.equal(isSkillUnlocked(5, 1), true);
  assert.deepEqual(newlyUnlocked('mage', 4, 10).map((u) => u.id), ['frostnova', 'blink']);
  assert.equal(skillUnlockLevel(2), 10);
});

test('simulação ignora a intenção de lançar habilidade bloqueada e aceita a liberada', () => {
  const w = new World('arena', { seed: 1, visuals: false });
  const c = newCharacter('T', 'mage', makeRng(1));
  const p = w.add(makeHeroActor(c, 550, 550));
  assert.equal(w.castSkill(p, 1, 700, 550), false, 's1 bloqueada no nível 1');
  assert.equal(p.cds.s1, 0, 'e não gasta recarga');
  assert.equal(w.castSkill(p, 0, 700, 550), true);
  p.level = 5;
  assert.equal(w.castSkill(p, 1, 700, 550), true);
  assert.equal(w.castSkill(p, 2, 700, 550), false);
});

test('mobs comuns nunca usam o golpe em área; elites só a partir da Planície; chefes sempre', () => {
  const run = (zone, spec) => {
    const w = new World(zone, { seed: 3, visuals: false });
    const hero = w.add(makeHeroActor(newCharacter('T', 'warrior', makeRng(1)), 500, 500)); hero.stats.def = 1e7; // imortal: o teste só conta golpes telegrafados
    const m = w.add(makeMobActor(spec.id, spec.level, 560, 500, { elite: !!spec.elite })); m.ai.target = hero.id; m.ai.state = 'chase';
    let seen = 0;
    for (let i = 0; i < 60 * 12; i++) { hero.hp = hero.maxHp; w.update(1 / 60); seen += w.events.filter((e) => e.type === 'telegraph').length; w.events.length = 0; }
    return seen;
  };
  assert.equal(run('forest', { id: 'wolf', level: 3 }), 0);
  assert.equal(run('forest', { id: 'wolf', level: 3, elite: true }), 0, 'elite do Bosque ainda não aprendeu');
  assert.ok(run('plains', { id: 'crystalwolf', level: 9, elite: true }) > 0);
  assert.ok(run('forest', { id: 'treant', level: 7 }) > 0);
});

test('chefe: fases por vida (rápido <60%, fúria <30%) e esbirros só no último chefe', () => {
  const w = new World('ember', { seed: 5, visuals: false });
  const hero = w.add(makeHeroActor(newCharacter('T', 'warrior', makeRng(1)), 500, 500)); hero.stats.def = 1e7;
  const b = w.add(makeMobActor('infernoknight', 31, 600, 500)); b.ai.target = hero.id; b.ai.state = 'chase';
  const base = b.stats.power;
  const tick = () => { hero.hp = hero.maxHp; w.update(1 / 60); };
  tick(); assert.equal(b.phase, 1);
  b.hp = b.maxHp * 0.5; tick(); assert.equal(b.phase, 2); assert.equal(b.stats.atkSpeed, 1.25);
  b.hp = b.maxHp * 0.2; tick(); assert.equal(b.phase, 3); assert.ok(b.stats.power > base * 1.15);
  assert.ok(w.events.some((e) => e.type === 'phase' && e.phase === 3), 'evento de fúria para a interface');
  for (let i = 0; i < 60 * 40; i++) tick();
  const minions = w.actors.filter((a) => a.summonedBy === b.id && !a.dead);
  assert.ok(minions.length > 0 && minions.length <= 4);
  assert.equal(rollMobLoot(makeRng(1), minions[0], 'warrior').length, 0, 'esbirro não dropa');
  w.damage(hero, b, 1e9);
  assert.equal(w.actors.filter((a) => a.summonedBy === b.id && !a.dead).length, 0, 'esbirros somem com o chefe');
  const t = new World('forest', { seed: 5, visuals: false });
  const th = t.add(makeHeroActor(newCharacter('T', 'warrior', makeRng(1)), 500, 500)); th.stats.def = 1e7;
  const tb = t.add(makeMobActor('treant', 7, 600, 500)); tb.hp = tb.maxHp * 0.2; tb.ai.target = th.id; tb.ai.state = 'chase';
  for (let i = 0; i < 60 * 30; i++) { th.hp = th.maxHp; t.update(1 / 60); }
  assert.equal(t.actors.filter((a) => a.summonedBy).length, 0, 'só o último chefe invoca');
});

test('curva de mobs: chefe é muito mais forte que mob comum e elite passa o comum', () => {
  const c = makeMobActor('wolf', 20, 0, 0), e = makeMobActor('wolf', 20, 0, 0, { elite: true }), bo = makeMobActor('guardian', 20, 0, 0);
  assert.ok(e.maxHp > c.maxHp * 3 && e.stats.power > c.stats.power);
  assert.ok(bo.maxHp > c.maxHp * 8);
  assert.ok(makeMobActor('wolf', 25, 0, 0).maxHp > c.maxHp);
  assert.ok(MOB_CURVE.hp(30) > MOB_CURVE.hp(10) * 2);
});

test('diferença de nível: herói muito abaixo do mob causa menos dano', () => {
  const dmg = (heroLevel) => {
    const w = new World('arena', { seed: 9, visuals: false });
    const c = newCharacter('T', 'warrior', makeRng(1)); c.level = 20;
    const h = w.add(makeHeroActor(c, 500, 500)); h.level = heroLevel;
    const m = w.add(makeMobActor('wolf', 20, 540, 500));
    let tot = 0; for (let i = 0; i < 40; i++) tot += w.damage(h, m, 1); return tot;
  };
  assert.ok(dmg(8) < dmg(20) * 0.6);
  assert.ok(Math.abs(dmg(18) - dmg(20)) < dmg(20) * 0.2, 'até 2 níveis de diferença não pesa');
});

test('ritual do último chefe: não aparece sozinho; contador enche com abates, avisa e depois recarrega', () => {
  const w = new World('ember', { seed: 11, visuals: false });
  const hero = w.add(makeHeroActor(newCharacter('T', 'warrior', makeRng(1)), 500, 500));
  for (let i = 0; i < 60 * 130; i++) w.updateSpawns(1 / 60, hero);
  assert.ok(!w.actors.some((a) => a.boss), 'sem abates, nada de chefe');
  assert.deepEqual({ have: w.bossProgress.have, need: w.bossProgress.need }, { have: 0, need: 40 });
  const kill = (id, o) => { const m = w.add(makeMobActor(id, 27, 700, 500, o)); w.damage(hero, m, 1e9); };
  for (let i = 0; i < 39; i++) kill('emberwolf');
  assert.equal(w.bossProgress.have, 39);
  for (let i = 0; i < 60; i++) w.updateSpawns(1 / 60, hero);
  assert.ok(!w.actors.some((a) => a.boss));
  kill('emberwolf');
  w.events.length = 0;
  for (let i = 0; i < 60 * 5; i++) w.updateSpawns(1 / 60, hero);
  assert.ok(w.events.some((e) => e.type === 'boss_warn' && e.stage === 'omen') && w.events.some((e) => e.type === 'boss_warn' && e.stage === 'arrive'));
  const boss = w.actors.find((a) => a.boss);
  assert.equal(boss.mobId, 'infernoknight');
  w.damage(hero, boss, 1e9);
  assert.ok(w.bossProgress.cool > 1000, 'recarga longa depois da morte');
  kill('emberwolf');
  assert.equal(w.bossProgress.have, 1, 'durante a recarga o contador anda, mas nunca passa de need-1');
  for (let i = 0; i < 60; i++) kill('emberwolf');
  assert.equal(w.bossProgress.have, 39);
  // o estado externo sobrevive à troca de mundo; elite vale mais
  const st = {};
  const w2 = new World('ember', { seed: 2, visuals: false, bossState: st });
  const h2 = w2.add(makeHeroActor(newCharacter('T', 'warrior', makeRng(1)), 500, 500));
  w2.damage(h2, w2.add(makeMobActor('emberwolf', 27, 700, 500, { elite: true })), 1e9);
  assert.equal(new World('ember', { bossState: st, visuals: false }).bossProgress.have, 4);
  // chefes iniciais continuam por tempo
  const f = new World('forest', { seed: 1, visuals: false });
  f.updateSpawns(0.1, hero); assert.ok(f.actors.some((a) => a.boss));
  assert.equal(f.bossProgress, null);
});

test('item de Ópalo: só do último chefe, épico/lendário acima do comum, com pity, e passa na validação do save', () => {
  const rng = makeRng(77);
  for (const cls of Object.keys(CLASSES)) {
    const it = generateOpalItem(makeRng(5), 31, cls, 'weapon');
    assert.equal(it.weaponType, CLASSES[cls].weapon); assert.ok(/Opalin/.test(it.name) && it.opal);
  }
  let leg = 0, w = 0, sumO = 0, sumR = 0;
  for (let i = 0; i < 400; i++) {
    const it = generateOpalItem(rng, 31, 'mage');
    if (it.rarity === 'legendary') leg++; if (it.slot === 'weapon') w++;
    const ref = generateItem(makeRng(i), 31, { slot: it.slot, weaponType: it.weaponType ?? undefined, rarityId: it.rarity });
    const key = it.slot === 'weapon' ? 'atk' : 'def';
    sumO += it.stats[key]; sumR += ref.stats[key]; // cada item varia ±15%: compara a média
    assert.ok(it.stats.crit || it.stats.vit, 'atributos extras exclusivos');
  }
  assert.ok(sumO > sumR * 1.2, 'base claramente acima do item comum da mesma raridade');
  assert.ok(leg / 400 > 0.15 && leg / 400 < 0.35, `~25% lendário (${leg})`);
  assert.ok(w / 400 > 0.5 && w / 400 < 0.7, '~60% arma');
  for (let i = 0; i < 300; i++) assert.ok(!rollMobLoot(makeRng(i), { level: 30, boss: true, mobId: 'guardian' }, 'mage').some((l) => l.item?.opal));
  const pity = newPity(); let miss = 0, maxMiss = 0, drops = 0;
  const r2 = makeRng(3);
  for (let i = 0; i < 400; i++) {
    const l = rollMobLoot(r2, { level: 31, boss: true, mobId: OPAL_BOSS }, 'mage', pity);
    const n = l.filter((x) => x.item?.opal).length; assert.ok(n <= 1);
    if (n) { drops++; miss = 0; } else maxMiss = Math.max(maxMiss, ++miss);
  }
  assert.ok(maxMiss <= 4, `pity do exclusivo (${maxMiss})`);
  assert.ok(drops > 100 && drops < 300, 'não é garantido, mas frequente com pity');
  const c = newCharacter('T', 'mage', makeRng(1)); c.level = 30;
  const it = generateOpalItem(makeRng(9), 31, 'mage', 'weapon'); c.inventory.push(it);
  const v = validate(JSON.parse(JSON.stringify(c)));
  assert.equal(v.ok, true);
  const back = v.char.inventory[0];
  assert.equal(back.opal, true); assert.equal(back.name, it.name); assert.equal(back.rarity, it.rarity); assert.equal(back.stats.atk, it.stats.atk);
  assert.deepEqual(v.char.pity, { epic: 0, legendary: 0, opal: 0 }, 'save antigo ganha pity zerado');
  const forged = JSON.parse(JSON.stringify(c)); forged.inventory[0].opal = 'sim';
  assert.equal(validate(forged).char.inventory[0].opal, undefined);
});

test('loot: pesos por fonte (elite > mob), pity eleva e garante épico e zera ao obter', () => {
  const rate = (src, n) => { const r = makeRng(8); let e = 0; for (let i = 0; i < n; i++) if (['epic', 'legendary'].includes(rollSourceRarity(r, src))) e++; return e / n; };
  assert.ok(rate('elite', 20000) > rate('mob', 20000) * 3);
  assert.ok(rate('boss', 20000) > rate('elite', 20000));
  const p = newPity(); p.epic = PITY.epicCap;
  assert.ok(['epic', 'legendary'].includes(rollSourceRarity(makeRng(2), 'mob', p)));
  assert.equal(p.epic, 0);
  const z = newPity(), r = makeRng(5); let worst = 0, run = 0;
  for (let i = 0; i < 20000; i++) { const x = rollSourceRarity(r, 'mob', z); if (x === 'epic' || x === 'legendary') run = 0; else worst = Math.max(worst, ++run); }
  assert.ok(worst <= PITY.epicCap, `pior sequência ${worst}`);
});

// Ondas (Arena das Ondas e cooperativo): composição pura e determinística, calibrada com tools/waves-check.mjs.
import { soloWaveSpec, coopWaveSpec, waveBoss, COOP_WAVES, WAVES, coopRewardPlan } from '../public/src/core/economy.js';
test('ondas: composição determinística, nível/quantidade crescem e chefe nunca é o Cavaleiro Rubro', () => {
  const a = soloWaveSpec(7, { level: 10 }, makeRng(3)), b = soloWaveSpec(7, { level: 10 }, makeRng(3));
  assert.deepEqual(a, b);
  assert.ok(soloWaveSpec(9, { level: 10 }).mobs.length > soloWaveSpec(1, { level: 10 }).mobs.length);
  assert.equal(soloWaveSpec(4, { level: 10 }).lvl, 11);
  const e = soloWaveSpec(5, { level: 10 }).mobs;
  assert.equal(e.filter((m) => m.elite).length, 1);
  assert.ok(e.find((m) => m.elite).level < 10 + 1, 'elite entra abaixo do nível da onda');
  for (const lv of [1, 12, 20, 30]) for (let s = 0; s < 20; s++) assert.notEqual(waveBoss(lv, makeRng(s)), 'infernoknight');
  const c1 = coopWaveSpec(COOP_WAVES, { avgLevel: 20, crew: 1 }, makeRng(1)), c4 = coopWaveSpec(COOP_WAVES, { avgLevel: 20, crew: 4 }, makeRng(1));
  assert.ok(c4.mobs.length > c1.mobs.length && c4.hpMul > c1.hpMul);
  assert.equal(c4.mobs.filter((m) => !['treant', 'colossus', 'guardian', 'frostlord'].includes(m.id)).length, c4.mobs.length - 1, 'um único chefe na última onda');
  assert.ok(WAVES.coop.restHeal >= 0.2 && WAVES.solo.restHeal >= 0.2);
});
test('economia do coop: vitória paga mais que derrota e o XP fica abaixo do teto de 30% do nível', () => {
  const win = coopRewardPlan({ level: 12, crew: 4, wavesCleared: 5, bossDown: true });
  const lose = coopRewardPlan({ level: 12, crew: 4, wavesCleared: 3, bossDown: false, victory: false });
  assert.ok(win.xp > lose.xp && win.gold > lose.gold);
  assert.ok(win.xp < xpToNext(12) * 0.3 * 1.3);
});

// ---------- rodada de balanceamento (G1–G13) ----------
import { blankJournal, openChest } from '../public/src/core/journal.js';
import { PRICES, buildShopStock, sellValue } from '../public/src/shop.js';
import { applyMatchResult, PVP_XP } from '../public/src/core/rewards.js';
import { MOBS } from '../public/src/data/mobs.js';
import { QUESTS } from '../public/src/data/quests.js';
import { itemScore } from '../public/src/core/stats.js';

test('G1: baú dá poucos épicos (tier 1 ≈ 1%, tier 3,8 < 12%) e lendário raro', () => {
  const rate = (tier) => {
    const rng = makeRng(77); let epicPlus = 0, leg = 0; const N = 6000;
    for (let i = 0; i < N; i++) {
      const doc = { ...blankJournal(), level: 15, classId: 'mage', gold: 0, inventory: [] };
      const it = openChest(doc, { id: 'x:' + i, tier }, 'forest', rng, 1e12).item;
      if (it && (it.rarity === 'epic' || it.rarity === 'legendary')) epicPlus++;
      if (it?.rarity === 'legendary') leg++;
    }
    return { epicPlus: epicPlus / N, leg: leg / N };
  };
  const t1 = rate(1), t38 = rate(3.8);
  assert.ok(t1.epicPlus < 0.025, 'tier 1: ' + t1.epicPlus);
  assert.ok(t38.epicPlus > 0.05 && t38.epicPlus < 0.14, 'tier 3,8: ' + t38.epicPlus);
  assert.ok(t38.leg < 0.04, 'lendário: ' + t38.leg);
});

test('G2/G13: loja só vende até raro + 1 épico de destaque, estoque estável entre recargas, venda a 50%', () => {
  const c = newCharacter('Lojista', 'mage', makeRng(3)); c.level = 14; c.created = 1700000000000;
  const a = buildShopStock(c), b = buildShopStock(structuredClone(c));
  assert.deepEqual(a.map((i) => [i.id, i.name, i.rarity, i.value]), b.map((i) => [i.id, i.name, i.rarity, i.value]));
  assert.equal(a.filter((i) => i.rarity === 'epic').length, 1);
  assert.ok(a.every((i) => i.rarity !== 'legendary'));
  const feat = a.find((i) => i.rarity === 'epic');
  assert.ok(Math.abs(feat.value * PRICES.itemMarkup - feat.baseValue * PRICES.featuredMarkup) <= PRICES.itemMarkup, 'destaque custa valor·25');
  c.level = 15; assert.notEqual(buildShopStock(c)[0].id, a[0].id, 'outro nível = outro estoque');
  c.level = 14; c.inventory.push({ ...a[0], value: a[0].value }); // já comprado sai do estoque
  assert.equal(buildShopStock(c).length, a.length - 1);
  assert.equal(sellValue({ value: 101 }), 50); assert.equal(sellValue({ value: 1 }), 1);
});

test('G3: XP de PvP — vitória 6%, derrota 2%, 10 partidas/hora a 100% depois 25%, 3º duelo seguido contra o mesmo adversário = 0', () => {
  const base = () => { const d = newCharacter('Duelista', 'warrior', makeRng(5)); d.level = 10; return validate(d).char; };
  const T0 = 1.8e12, need = xpToNext(10);
  const w = applyMatchResult(base(), { mode: '1v1', result: 'win', foeRating: 1000, now: T0 });
  assert.equal(w.summary.xp, Math.round(need * PVP_XP.win));
  const l = applyMatchResult(base(), { mode: '1v1', result: 'loss', foeRating: 1000, now: T0 });
  assert.equal(l.summary.xp, Math.round(need * PVP_XP.loss));
  assert.equal(applyMatchResult(base(), { mode: '4v4', result: 'win', foeRating: 1000, now: T0 }).summary.xp, Math.round(need * 0.06 * 1.6));
  let d = base(); const xps = [];
  for (let i = 0; i < 12; i++) { const r = applyMatchResult(d, { mode: '1v1', result: 'loss', foeRating: 1000, now: T0 + i * 60000, foeId: 'rival' + i }); d = r.doc; d.level = 10; d.xp = 0; xps.push(r.summary.xp); }
  assert.ok(xps.slice(0, 10).every((x) => x === xps[0]) && xps[10] === Math.round(xps[0] * 0.25), 'depois de 10/hora paga 25%: ' + xps);
  d = base(); const rep = [];
  for (let i = 0; i < 4; i++) { const r = applyMatchResult(d, { mode: '1v1', result: 'win', foeRating: 1000, now: T0 + i * 60000, foeId: 'mesmo' }); d = r.doc; d.level = 10; d.xp = 0; rep.push(r.summary.xp); }
  assert.ok(rep[0] > 0 && rep[1] > 0 && rep[2] === 0 && rep[3] === 0, 'repetição: ' + rep);
  const later = applyMatchResult(d, { mode: '1v1', result: 'win', foeRating: 1000, now: T0 + 40 * 60000, foeId: 'mesmo' });
  assert.ok(later.summary.xp > 0, 'passada a janela de 30 min volta a pagar');
});

test('G4: Guardião e Ancião com vida menor, missões em níveis mais altos; Cavaleiro Rubro intocado', () => {
  assert.equal(MOBS.guardian.hp, 9); assert.equal(MOBS.frostlord.hp, 8.5); assert.equal(MOBS.infernoknight.hp, 16);
  assert.equal(QUESTS.guardiao_das_ruinas.level, 22); assert.equal(QUESTS.anciao_gelido.level, 27);
});

test('G9/G10: opalino rende ≥ 25% a mais que lendário comum e Ferreiro +6..+8 custa 60%', () => {
  const rng = makeRng(9); let o = 0, l = 0;
  for (let i = 0; i < 400; i++) {
    o += itemScore(generateOpalItem(rng, 30, 'mage', 'weapon'));
    l += itemScore(generateItem(rng, 30, { slot: 'weapon', weaponType: 'staff', rarityId: 'legendary' }));
  }
  assert.ok(o / l >= 1.25, 'razão ' + (o / l));
  const it = { level: 30, rarity: 'legendary' };
  const raw = (n) => Math.round(60 + 30 * 15 * 2 * n ** 1.6);
  assert.equal(enhanceCost({ ...it, plus: 4 }), raw(5));
  assert.equal(enhanceCost({ ...it, plus: 5 }), Math.round(raw(6) * 0.6));
  assert.ok(totalEnhanceCost(it) * 6 < 420000 && totalEnhanceCost(it) * 6 > 340000, 'seis lendários +8: ' + totalEnhanceCost(it) * 6);
});

// ---- Rodada de balanceamento: rio, drops, separate, chefe, ritual ----
test('mob atravessa o rio pela ponte para chegar ao herói na outra margem (e volta para casa)', () => {
  const w = new World('forest', { seed: 3, visuals: false });
  const hero = w.add(makeHeroActor(newCharacter('T', 'warrior', makeRng(1)), 1850, 900)); hero.hp = hero.maxHp = 1e9;
  const wolf = w.add(makeMobActor('wolf', 3, 1150, 900, { hostile: true }));
  wolf.ai.target = hero.id; wolf.ai.state = 'chase'; // alvo já travado (fora do alcance de aggro)
  const side = (a) => Math.sign(a.x - riverX(w.layout.rivers[0], a.y));
  assert.notEqual(side(wolf), side(hero));
  let reached = -1;
  for (let i = 0; i < 60 * 25 && reached < 0; i++) { w.update(1 / 60, { [hero.id]: { mx: 0, my: 0, aimX: hero.x, aimY: hero.y } }); if (Math.hypot(wolf.x - hero.x, wolf.y - hero.y) < 60) reached = i / 60; }
  assert.ok(reached > 0 && reached < 25, 'chegou em ' + reached + ' s');
  // em retorno, o lobo do outro lado também cruza de volta até o ponto de origem
  wolf.ai.target = null; wolf.ai.state = 'return'; wolf.hp = wolf.maxHp;
  hero.x = 3000; hero.y = 2600;
  for (let i = 0; i < 60 * 25 && wolf.ai.state === 'return'; i++) w.update(1 / 60, {});
  assert.ok(Math.hypot(wolf.x - wolf.home.x, wolf.y - wolf.home.y) < 60, 'voltou para casa');
});

test('drops no chão expiram em 120 s e há teto por mundo (descarta os mais antigos)', () => {
  const w = new World('arena', { seed: 1, visuals: false });
  w.drops.push({ kind: 'gold', x: 1, y: 1, vx: 0, vy: 0, t: 0 });
  for (let i = 0; i < 60 * 119; i++) w.update(1 / 60, {});
  assert.equal(w.drops.length, 1, 'ainda no chão aos 119 s');
  for (let i = 0; i < 60 * 2; i++) w.update(1 / 60, {});
  assert.equal(w.drops.length, 0, 'sumiu depois de 120 s');
  for (let i = 0; i < DROP_MAX + 40; i++) w.drops.push({ kind: 'gold', n: i, x: 1, y: 1, vx: 0, vy: 0, t: 0 });
  w.update(1 / 60, {});
  assert.equal(w.drops.length, DROP_MAX);
  assert.equal(w.drops[0].n, 40, 'os mais antigos foram descartados');
});

test('separate() com grade dá o mesmo resultado do todos-contra-todos', () => {
  for (const zone of ['forest', 'ruins']) {
    const mk = () => { const w = new World(zone, { seed: 1, visuals: false }); const r = makeRng(5); for (let i = 0; i < 90; i++) w.add(makeMobActor(r.pick(['wolf', 'golem', 'slime', 'treant']), 5, r.range(400, 900), r.range(400, 800), { elite: r.chance(0.2) })); return w; };
    const fast = mk(), slow = mk();
    slow.separate = function () { const l = this.actors.filter((a) => !a.dead && a.kind !== 'spirit'); for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) this.pushApart(l[i], l[j]); };
    for (let k = 0; k < 40; k++) { fast.separate(); slow.separate(); }
    let worst = 0;
    fast.actors.forEach((a, i) => { worst = Math.max(worst, Math.abs(a.x - slow.actors[i].x), Math.abs(a.y - slow.actors[i].y)); });
    assert.ok(worst < 1e-6, `${zone}: divergiu ${worst}`);
  }
});

test('G11: a recarga do ritual é em tempo absoluto: corre fora da zona e sobrevive à recriação do mundo', () => {
  let now = 1000;
  const clock = () => now, st = {};
  const w = new World('ember', { seed: 11, visuals: false, bossState: st, clock });
  const hero = w.add(makeHeroActor(newCharacter('T', 'warrior', makeRng(1)), 500, 500));
  st.progress = 40; st.go = true;
  w.updateSpawns(0.1, hero); for (let i = 0; i < 60 * 5; i++) w.updateSpawns(1 / 60, hero);
  const boss = w.actors.find((a) => a.boss); assert.ok(boss);
  w.damage(hero, boss, 1e9);
  assert.equal(st.coolUntil, 1000 + 1200, 'recarga de 1200 s em relógio absoluto');
  now += 600; // 10 min fora da zona: o mundo é recriado
  const w2 = new World('ember', { seed: 2, visuals: false, bossState: st, clock });
  assert.equal(w2.bossProgress.cool, 600);
  now += 601;
  assert.equal(w2.bossProgress.cool, 0, 'terminou sem nenhum tick dentro da zona');
});

test('G5: chefes de zona reaparecem em 7–15 min (mesmo recriando o mundo) e abates repetidos em 30 min dão metade, depois um quarto, da chance de item', () => {
  let now = 5000;
  const clock = () => now, st = {};
  const mk = () => new World('forest', { seed: 1, visuals: false, bossState: st, clock });
  let w = mk();
  const hero = w.add(makeHeroActor(newCharacter('T', 'mage', makeRng(1)), 500, 500));
  const killBoss = () => { w.updateSpawns(0.1, hero); const b = w.actors.find((a) => a.boss && !a.dead); assert.ok(b, 'chefe presente'); w.damage(hero, b, 1e9); return b; };
  assert.equal(killBoss().lootMul, 1, 'primeiro abate: tabela cheia');
  now += 100; w = mk(); w.add(hero);
  w.updateSpawns(0.1, hero); assert.ok(!w.actors.some((a) => a.boss), 'recriar o mundo não zera o respawn');
  now += 330; w = mk(); w.add(hero); // 430 s depois do abate
  assert.equal(killBoss().lootMul, 0.5);
  now += 500; w = mk(); w.add(hero);
  assert.equal(killBoss().lootMul, 0.25);
  now += 2000; w = mk(); w.add(hero); // fora da janela de 30 min
  assert.equal(killBoss().lootMul, 1);
  // lootMul reduz a chance de item no sorteio
  let full = 0, half = 0;
  for (let i = 0; i < 2000; i++) {
    full += rollMobLoot(makeRng(i), { level: 7, boss: true, mobId: 'treant' }, 'mage').filter((l) => l.kind === 'item').length;
    half += rollMobLoot(makeRng(i), { level: 7, boss: true, mobId: 'treant', lootMul: 0.5 }, 'mage').filter((l) => l.kind === 'item').length;
  }
  assert.ok(half / full > 0.4 && half / full < 0.6, `razão ${half / full}`);
});

test('G6/G7: a rampa de iniciante dos mobs é leve (só poder) e some no nível 6; chefes não mudam', () => {
  const pure = (lv) => 60 + 120 * lv ** 1.15;
  const p = (lv) => 6 + 4.2 * lv ** 1.42;
  assert.equal(makeMobActor('wolf', 1, 0, 0).maxHp, Math.round(pure(1) * 0.9 * 1.15));
  assert.ok(makeMobActor('wolf', 1, 0, 0).stats.power < p(1) * 3.1 && makeMobActor('wolf', 1, 0, 0).stats.power > p(1) * 3.1 * 0.9);
  assert.ok(Math.abs(makeMobActor('wolf', 6, 0, 0).stats.power - p(6) * 3.1 * 1.0) / (p(6) * 3.1) < 0.06, 'quase na curva pura no 6');
  assert.equal(makeMobActor('wolf', 6, 0, 0).maxHp, Math.round(pure(6) * 0.9 * 1.15));
  assert.equal(makeMobActor('treant', 3, 0, 0).maxHp, Math.round(pure(3) * 9));
  assert.ok(rookieHp(1) > rookieHp(4) && rookieHp(4) > 0 && rookieHp(10) === 0 && rookiePower(10) === 0, 'bônus de iniciante some antes do PvP (nível 10)');
});

test('G10: reforço de iniciante do Clérigo existe só abaixo do nível 10 e o PvP libera as 3 habilidades', async () => {
  const { PVP_MIN_LEVEL } = await import('../public/src/core/power.js');
  const { isSkillUnlocked } = await import('../public/src/core/unlocks.js');
  assert.ok(CLASSES.cleric.rookie > 1 && CLASSES.warrior.rookie === undefined);
  const mk = (classId, level) => ({ classId, level, alloc: {}, equipment: {} });
  assert.ok(computeStats(mk('cleric', 3)).maxHp > computeStats(mk('warrior', 3)).maxHp - 150, 'Clérigo iniciante não fica atrás em vida');
  assert.equal(rookieHp(PVP_MIN_LEVEL, CLASSES.cleric.rookie), 0);
  // no nível 10 a conta do Clérigo é a mesma de qualquer classe: sem bônus escondido nos duelos
  const c10 = computeStats(mk('cleric', 10)), base = CLASSES.cleric;
  assert.equal(c10.maxHp, Math.round(base.hpBase + c10.vit * 12 + 9 * 8));
  for (let i = 0; i < 3; i++) assert.ok(isSkillUnlocked(PVP_MIN_LEVEL, i), 'habilidade ' + i + ' liberada no nível mínimo do PvP');
});

test('G10: acampamento só volta CAMP_RESPAWN s depois do último morto (não 150 s)', async () => {
  const { CAMP_RESPAWN } = await import('../public/src/data/mobs.js');
  const w = new World('forest', { seed: 3, visuals: false });
  const hero = w.add(makeHeroActor(newCharacter('T', 'warrior', makeRng(1)), 10, 10));
  const camp = w.zone.camps[0].id;
  w.spawnCamps(hero.level, camp);
  const alive = () => w.actors.filter((a) => a.camp === camp && !a.dead).length;
  assert.ok(alive() > 0);
  for (const a of w.actors) if (a.camp === camp) a.dead = true;
  assert.ok(CAMP_RESPAWN >= 300);
  for (let t = 0; t < 200; t += 1) w.updateSpawns(1, hero);
  assert.equal(alive(), 0, 'aos 200 s ainda vazio');
  for (let t = 0; t < CAMP_RESPAWN; t += 1) w.updateSpawns(1, hero);
  assert.ok(alive() > 0, 'depois de CAMP_RESPAWN o acampamento volta');
});
