import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../public/src/core/rng.js';
import { computeStats, canEquip } from '../public/src/core/stats.js';
import { computeHit, eloDelta, tierFor } from '../public/src/core/combat.js';
import { generateItem, rollMobLoot } from '../public/src/core/loot.js';
import { addXp, xpToNext, newCharacter, createSpirit, addSpiritXp, MAX_LEVEL } from '../public/src/core/progression.js';
import { generateRival } from '../public/src/core/rival.js';
import { CLASSES } from '../public/src/data/classes.js';
import { SLOTS } from '../public/src/data/items.js';
import { World, makeHeroActor, makeMobActor, makeSpiritActor } from '../public/src/game/sim.js';

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
  assert.equal(w.bossProgress.have, 0, 'durante a recarga o contador não anda');
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
