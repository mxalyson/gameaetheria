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
import { itemClassName, itemClassId } from '../public/src/core/stats.js';
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
  assert.equal(PLUS_BONUS, 0.08);
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
  sp.type = 'ember';
  c.gold = cost; assert.equal(evolveSpirit(c, sp.id).ok, false, 'sem a missão de evolução do elemento não evolui');
  c.quests.done.evolucao_do_spirit_fogo = 1;
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
  assert.deepEqual(validate(c).char.visited, { ruins: 1, harbor: 1 }, 'só zonas válidas; quem visitou as Ruínas passou pelo Porto');
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

test('G3: XP de PvP — vitória 6%, derrota 2%, sem teto por hora, 3º duelo seguido contra o mesmo adversário = 0', () => {
  const base = () => { const d = newCharacter('Duelista', 'warrior', makeRng(5)); d.level = 10; return validate(d).char; };
  const T0 = 1.8e12, need = xpToNext(10);
  const w = applyMatchResult(base(), { mode: '1v1', result: 'win', foeRating: 1000, now: T0 });
  assert.equal(w.summary.xp, Math.round(need * PVP_XP.win));
  const l = applyMatchResult(base(), { mode: '1v1', result: 'loss', foeRating: 1000, now: T0 });
  assert.equal(l.summary.xp, Math.round(need * PVP_XP.loss));
  assert.equal(applyMatchResult(base(), { mode: '4v4', result: 'win', foeRating: 1000, now: T0 }).summary.xp, Math.round(need * 0.06 * 1.6));
  let d = base(); const xps = [];
  for (let i = 0; i < 12; i++) { const r = applyMatchResult(d, { mode: '1v1', result: 'loss', foeRating: 1000, now: T0 + i * 60000, foeId: 'rival' + i }); d = r.doc; d.level = 10; d.xp = 0; xps.push(r.summary.xp); }
  assert.ok(xps.slice(0, 12).every((x) => x === xps[0]), 'sem teto por hora: todas as partidas pagam igual: ' + xps);
  d = base(); const rep = [];
  for (let i = 0; i < 4; i++) { const r = applyMatchResult(d, { mode: '1v1', result: 'win', foeRating: 1000, now: T0 + i * 60000, foeId: 'mesmo' }); d = r.doc; d.level = 10; d.xp = 0; rep.push(r.summary.xp); }
  assert.ok(rep[0] > 0 && rep[1] > 0 && rep[2] === 0 && rep[3] === 0, 'repetição: ' + rep);
  const later = applyMatchResult(d, { mode: '1v1', result: 'win', foeRating: 1000, now: T0 + 40 * 60000, foeId: 'mesmo' });
  assert.ok(later.summary.xp > 0, 'passada a janela de 30 min volta a pagar');
});

test('G4: chefes recalibrados após os kits próprios (Guardião/Ancião vida; Carvalho, Colosso e Cavaleiro Rubro vida e ataque), missões em níveis mais altos', () => {
  assert.equal(MOBS.guardian.hp, 20); assert.equal(MOBS.frostlord.hp, 21); assert.equal(MOBS.infernoknight.hp, 25); assert.equal(MOBS.infernoknight.atk, 5.3);
  assert.equal(MOBS.treant.hp, 10); assert.equal(MOBS.treant.atk, 1.55); assert.equal(MOBS.colossus.hp, 13); assert.equal(MOBS.colossus.atk, 2.0);
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
  assert.equal(makeMobActor('treant', 3, 0, 0).maxHp, Math.round(pure(3) * 10));
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
  assert.equal(c10.maxHp, Math.round(base.hpBase + c10.vit * 12 + 9 * 8 + 6 * 12)); // + bônus de vida de nível alto (começa depois do nível 4)
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

// ---- Rodada: equipamento por classe, ouro direto, spirit coletor, missões de evolução e Mestres de Classe ----
import { WEAPON_TYPES } from '../public/src/data/items.js';
import { parseSave, exportSave } from '../public/src/core/savedoc.js';
import { SPIRIT_EVO_QUEST } from '../public/src/data/quests.js';
import { acceptQuest, recordEvent, turnInQuest, offeredBy, readyFor, spiritEvoStatus, ensureJournal, greetFor, serviceFor, masterNpcId } from '../public/src/core/journal.js';
import { chooseSpec } from '../public/src/core/specs.js';
import { evolveSpirit } from '../public/src/core/progression.js';
import { DIALOGS } from '../public/src/data/dialogs.js';
import { ZONES } from '../public/src/data/zones.js';
import { sanitizeImport, itemCeiling } from '../server/plausible.js';
import { applyZoneBatch } from '../public/src/core/rewards.js';

const CLASS_IDS = Object.keys(CLASSES);

test('equipamento por classe: todo espaço nasce com classId da classe pedida e só ela equipa (matriz classe x item)', () => {
  const rng = makeRng(11);
  for (const owner of CLASS_IDS) {
    for (const slot of SLOTS) {
      if (slot === 'offhand' && owner !== 'warrior' && owner !== 'cleric') continue; // escudo só existe para quem o usa
      const it = generateItem(rng, 10, { classId: owner, slot, rarityId: 'rare' });
      assert.equal(it.classId, owner, `${owner}/${slot}`);
      assert.equal(itemClassId(it), owner);
      for (const other of CLASS_IDS) {
        const c = newCharacter('T', other, makeRng(1)); c.level = 30;
        const r = canEquip(c, it);
        assert.equal(r.ok, other === owner, `${owner}/${slot} em ${other}`);
        if (!r.ok) assert.equal(r.reason, `Apenas para ${CLASSES[owner].name}.`);
      }
    }
  }
  assert.equal(itemClassName(generateItem(rng, 5, { classId: 'mage', slot: 'ring' })), 'Mago');
});

test('equipamento por classe: arma deriva a classe do tipo; mago e clérigo têm nomes distintos; joia foca o atributo principal', () => {
  const rng = makeRng(3);
  assert.equal(generateItem(rng, 5, { slot: 'weapon', weaponType: 'bow' }).classId, 'archer');
  for (const t of Object.keys(WEAPON_TYPES)) assert.equal(generateItem(rng, 5, { slot: 'weapon', weaponType: t }).classId, WEAPON_TYPES[t].classId);
  const names = (cid) => new Set(SLOTS.filter((s) => s !== 'weapon').map((s) => generateItem(makeRng(1), 1, { classId: cid, slot: s, rarityId: 'common' }).name));
  const m = names('mage'), cl = names('cleric');
  assert.ok([...m].every((n) => !cl.has(n)), 'nomes de mago e clérigo não se repetem');
  for (const cid of CLASS_IDS) for (const slot of ['ring', 'amulet']) for (let i = 0; i < 30; i++) {
    const it = generateItem(rng, 12, { classId: cid, slot, rarityId: ['common', 'rare', 'epic'][i % 3] });
    assert.ok(it.stats[CLASSES[cid].primary] > 0, `${cid}/${slot} sem o atributo principal`);
  }
  assert.ok(CLASSES[generateItem(rng, 5, { slot: 'armor' }).classId], 'sem classe informada o gerador sorteia uma');
});

test('equipamento por classe: loot de mob/baú/loja e personagem novo vêm sempre da classe do jogador', () => {
  for (const cid of CLASS_IDS) {
    const c = newCharacter('T', cid, makeRng(2));
    assert.ok(Object.values(c.equipment).every((i) => i.classId === cid), 'kit inicial');
    const drops = []; const rng = makeRng(9);
    for (let i = 0; i < 400; i++) drops.push(...rollMobLoot(rng, { level: 10, boss: i % 5 === 0 }, cid).filter((l) => l.kind === 'item'));
    assert.ok(drops.length > 30 && drops.every((l) => l.item.classId === cid), 'drops de mob');
    c.level = 12; c.name = 'Lojista' + cid;
    const stock = buildShopStock(c);
    assert.ok(stock.length >= 4 && stock.every((i) => i.classId === cid), 'estoque da loja');
  }
});

test('equipamento por classe: save antigo sem classId ganha a classe do personagem; item de outra classe equipado sai', () => {
  const c = newCharacter('Velho', 'mage', makeRng(4)); c.level = 10;
  const legacy = (seed, o) => { const it = generateItem(makeRng(seed), 8, { rarityId: 'rare', ...o }); delete it.classId; return it; };
  c.equipment = { weapon: legacy(7, { classId: 'mage', slot: 'weapon' }), armor: legacy(5, { classId: 'mage', slot: 'armor' }) };
  c.inventory = [legacy(6, { classId: 'mage', slot: 'ring' })];
  const r = validate(c);
  assert.ok(r.ok);
  assert.equal(r.char.equipment.armor.classId, 'mage'); assert.equal(r.char.inventory[0].classId, 'mage'); assert.equal(r.char.equipment.weapon.classId, 'mage');
  assert.equal(parseSave(exportSave(r.char)).char.inventory[0].classId, 'mage', 'exportar/importar mantém');
  const bad = structuredClone(r.char); bad.equipment.helm = generateItem(makeRng(8), 5, { classId: 'warrior', slot: 'helm' });
  const v = validate(bad);
  assert.equal(v.char.equipment.helm, undefined); assert.ok(v.warnings.some((w) => /outra classe/.test(w)));
});

test('equipamento por classe (servidor): item novo de outra classe é rejeitado; save antigo sem classId passa; teto continua valendo', () => {
  const d0 = newCharacter('Srv', 'archer', makeRng(3)); d0.level = 10;
  const old = validate(d0).char, neu = structuredClone(old);
  neu.inventory.push(generateItem(makeRng(1), 10, { classId: 'archer', slot: 'boots', rarityId: 'rare' }));
  assert.equal(checkSave(old, neu).ok, true);
  const forged = structuredClone(old); forged.inventory.push(generateItem(makeRng(1), 10, { classId: 'warrior', slot: 'boots', rarityId: 'rare' }));
  assert.deepEqual(checkSave(old, forged), { ok: false, reason: 'item_wrong_class' });
  const dbOld = structuredClone(old); delete dbOld.equipment.armor.classId; delete dbOld.equipment.weapon.classId; // o banco ainda guarda sem classId
  assert.equal(checkSave(dbOld, structuredClone(old)).ok, true);
  const swap = structuredClone(old); swap.equipment.armor.classId = 'mage';
  assert.equal(checkSave(dbOld, swap).ok, false);
  const rng = makeRng(77);
  for (let i = 0; i < 1500; i++) {
    const it = generateItem(rng, 1 + (i % 30), { classId: CLASS_IDS[i % 4], rarityId: ['common', 'uncommon', 'rare', 'epic', 'legendary'][i % 5], slot: SLOTS[i % 6] });
    const cap = itemCeiling(it.slot, it.rarity, it.level);
    for (const [k, v] of Object.entries(it.stats)) assert.ok(v <= cap.stats[k], `${it.slot} ${k}`);
    assert.ok(Object.keys(it.stats).length <= cap.maxKeys);
  }
  const imp = { ...old, equipment: { ...old.equipment, helm: generateItem(makeRng(2), 5, { classId: 'mage', slot: 'helm' }) } };
  assert.equal(sanitizeImport(structuredClone(imp), old).equipment.helm, undefined, 'import: item de outra classe sai');
});

test('ouro cai direto: o loot ainda sorteia ouro (o servidor credita no lote), mas o cliente não cria drop de ouro', async () => {
  const loot = rollMobLoot(makeRng(1), { level: 5, mobId: 'wolf' }, 'warrior');
  assert.ok(loot.some((l) => l.kind === 'gold' && l.amount > 0));
  const src = (await import('node:fs')).readFileSync(new URL('../public/src/main.js', import.meta.url), 'utf8');
  assert.match(src, /if \(l\.kind === 'gold'\) \{[^}]*this\.char\.gold \+= l\.amount/s, 'onMobKilled credita o ouro direto');
  assert.doesNotMatch(src, /d\.kind === 'gold'/, 'collectDrops não coleta mais ouro do chão');
});

test('spirit coletor: fora de combate busca o drop mais próximo (até 260 px do dono), traz ao herói e emite pickup', () => {
  const w = new World('arena', { seed: 3 });
  const p = w.add(makeHeroActor(newCharacter('T', 'warrior', makeRng(1)), 550, 550));
  const sp = w.add(makeSpiritActor(createSpirit(makeRng(2), { type: 'zephyr', level: 5 }), p));
  const longe = { kind: 'item', item: generateItem(makeRng(3), 5, { classId: 'warrior' }), x: 950, y: 550, vx: 0, vy: 0, t: 1 };
  const perto = { kind: 'potion', amount: 1, x: 750, y: 550, vx: 0, vy: 0, t: 1 };
  const perto2 = { kind: 'item', item: generateItem(makeRng(4), 5, { classId: 'warrior' }), x: 550, y: 790, vx: 0, vy: 0, t: 1 };
  const ouro = { kind: 'gold', amount: 5, x: 560, y: 560, vx: 0, vy: 0, t: 1 };
  w.drops.push(longe, perto, perto2, ouro);
  const got = []; let tFirst = null;
  for (let i = 0; i < 60 * 8; i++) {
    w.update(1 / 60, {});
    for (const e of w.events.splice(0)) if (e.type === 'pickup') { got.push(e.drop); tFirst ??= w.time; assert.equal(e.actor, p); assert.equal(e.spirit, sp); }
  }
  assert.equal(got.length, 2, 'dois drops dentro do alcance foram trazidos, um de cada vez');
  assert.ok(got.includes(perto) && got.includes(perto2) && perto.fetched && perto2.fetched);
  assert.ok(!longe.fetched && !longe.carried, 'fora de 260 px do dono não é buscado');
  assert.ok(!ouro.fetched && !ouro.carried, 'ouro nunca é buscado');
  assert.ok(tFirst > 0.4 && tFirst < 3, 'a 320 px/s leva ~1 s: ' + tFirst);
});

test('spirit coletor: em combate larga o drop e a simulação é determinística', () => {
  const run = () => {
    const w = new World('arena', { seed: 3 });
    const p = w.add(makeHeroActor(newCharacter('T', 'warrior', makeRng(1)), 550, 550));
    const sp = w.add(makeSpiritActor(createSpirit(makeRng(2), { type: 'undine', level: 5 }), p));
    const d = { kind: 'potion', amount: 1, x: 700, y: 550, vx: 0, vy: 0, t: 1 };
    w.drops.push(d);
    for (let i = 0; i < 40; i++) w.update(1 / 60, {});
    const pos = [sp.x, sp.y], midCarry = !!d.carried;
    p.lastDealt = w.time;
    for (let i = 0; i < 60; i++) w.update(1 / 60, {});
    return { pos, midCarry, carried: d.carried, fetched: d.fetched, fetch: sp.fetch };
  };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.ok(!a.fetched && !a.carried && !a.fetch, 'em combate o spirit larga o que buscava');
});

const mkHero = (classId, level = 14) => { const d = newCharacter('Aluno' + classId, classId, makeRng(5)); d.level = level; return ensureJournal(validate(d).char); };

test('evolução do spirit: missão por elemento (40 abates com o spirit ativo + 2 baús) libera evolveSpirit; status para a UI', () => {
  assert.deepEqual(Object.keys(SPIRIT_EVO_QUEST).sort(), ['ember', 'terra', 'undine', 'zephyr']);
  for (const type of Object.keys(SPIRIT_EVO_QUEST)) {
    const c = mkHero('mage', 12); const sp = createSpirit(makeRng(2), { type, level: 9, rarity: 'common' }); c.spirits.push(sp); c.activeSpirit = sp.id; c.gold = 1e6;
    const qid = SPIRIT_EVO_QUEST[type];
    assert.equal(spiritEvoStatus(c, sp).state, 'locked');
    assert.equal(acceptQuest(c, qid).ok, false, 'spirit abaixo do nível 10 não aceita');
    sp.level = 10;
    assert.equal(spiritEvoStatus(c, sp).state, 'available');
    assert.ok(offeredBy(c, 'sage').some((q) => q.id === qid), 'a Sábia Yun oferece');
    assert.equal(evolveSpirit(c, sp.id).ok, false);
    assert.ok(acceptQuest(c, qid).ok);
    for (let i = 0; i < 39; i++) recordEvent(c, { type: 'kill', mobId: 'slime', zoneId: 'forest', spiritType: type });
    for (let i = 0; i < 50; i++) recordEvent(c, { type: 'kill', mobId: 'slime', zoneId: 'forest' }); // sem spirit não conta
    const other = Object.keys(SPIRIT_EVO_QUEST).find((t) => t !== type);
    recordEvent(c, { type: 'kill', mobId: 'slime', zoneId: 'forest', spiritType: other }); // spirit de outro elemento não conta
    recordEvent(c, { type: 'chest', zoneId: 'forest' }); recordEvent(c, { type: 'chest', zoneId: 'forest' });
    assert.equal(spiritEvoStatus(c, sp).state, 'active');
    assert.deepEqual(spiritEvoStatus(c, sp).progress.map((p) => p.value), [39, 2]);
    recordEvent(c, { type: 'kill', mobId: 'slime', zoneId: 'forest', spiritType: type });
    assert.ok(readyFor(c, 'sage').includes(qid));
    assert.equal(evolveSpirit(c, sp.id).ok, false, 'concluir os objetivos não basta: precisa entregar');
    assert.ok(turnInQuest(c, qid, makeRng(1)).ok);
    assert.equal(spiritEvoStatus(c, sp).state, 'ready');
    assert.equal(evolveSpirit(c, sp.id).ok, true);
    assert.equal(spiritEvoStatus(c, sp).state, 'evolved');
    assert.ok(c.stats.spiritKills >= 40);
  }
});

test('Prova do Mestre/evolução (servidor): lote de zona soma abates com spirit, mini-chefes e usos de habilidade; limite de skillUses', () => {
  const d = mkHero('archer', 14); const sp = createSpirit(makeRng(2), { type: 'ember', level: 10 }); d.spirits.push(sp); d.activeSpirit = sp.id;
  acceptQuest(d, SPIRIT_EVO_QUEST.ember); acceptQuest(d, 'prova_do_mestre');
  const r = applyZoneBatch(d, { zoneId: 'forest', kills: [{ mobId: 'wolf', spiritType: 'ember', mini: true }, { mobId: 'wolf', spiritType: 'ember' }], skills: [CLASSES.archer.skills[0], CLASSES.archer.skills[0], CLASSES.archer.skills[1]] });
  assert.equal(r.doc.quests.active.evolucao_do_spirit_fogo.p[0], 2);
  assert.deepEqual(r.doc.quests.active.prova_do_mestre.p, [1, 2, 0], 'mini-chefe 1; 2 usos da assinatura; a outra habilidade não conta; 0 mentores (só o servidor conta a conversa)');
  assert.equal(r.doc.stats.skillUses, 3);
  const neu = structuredClone(r.doc); neu.stats.skillUses += 1501;
  assert.equal(checkSave(r.doc, neu).reason, 'stat_jump_skillUses');
  neu.stats.skillUses = r.doc.stats.skillUses + 1000;
  assert.equal(checkSave(r.doc, neu).ok, true);
});

test('Mestres de Classe: 4 NPCs lado a lado na Vila; cada um só dá missões e serviço à própria classe', () => {
  const town = ZONES.town.npcs;
  const row = CLASS_IDS.map((cid) => town.find((n) => n.id === masterNpcId(cid)));
  assert.ok(row.every(Boolean), 'os 4 mestres existem');
  assert.ok(row.every((n) => n.x >= 880 && n.x <= 1300 && n.y >= 900 && n.y <= 1100), 'praça dos mestres');
  assert.ok(Math.max(...row.map((n) => n.y)) - Math.min(...row.map((n) => n.y)) <= 15, 'mesma fileira (o Clérigo desvia 10 px de um obstáculo)');
  for (const cid of CLASS_IDS) {
    const c = mkHero(cid, 14);
    for (const other of CLASS_IDS) {
      assert.deepEqual(offeredBy(c, masterNpcId(other)).map((q) => q.id), other === cid ? ['prova_do_mestre'] : [], `${cid} falando com o mestre de ${other}`);
      assert.equal(!!serviceFor(c, DIALOGS[masterNpcId(other)]), other === cid, 'serviço só da própria classe');
      assert.ok(greetFor(c, DIALOGS[masterNpcId(other)].greet).length > 20, 'fala em português');
    }
  }
});

test('Prova do Mestre: mini-chefe + 10 usos da habilidade assinatura liberam a especialização (que antes era livre)', () => {
  const c = mkHero('mage', 15); c.gold = 1000;
  assert.equal(chooseSpec(c, 'arcane').ok, false, 'sem a prova não escolhe');
  assert.equal(offeredBy(mkHero('mage', 13), 'master_mage').length, 0, 'nível 14 mínimo');
  assert.ok(acceptQuest(c, 'prova_do_mestre').ok);
  for (let i = 0; i < 20; i++) recordEvent(c, { type: 'skill', skillId: 'frostnova' }); // não é a assinatura
  for (let i = 0; i < 9; i++) recordEvent(c, { type: 'skill', skillId: CLASSES.mage.skills[0] });
  recordEvent(c, { type: 'kill', mobId: 'wolf', zoneId: 'forest', mini: false });
  assert.equal(readyFor(c, 'master_mage').length, 0);
  recordEvent(c, { type: 'kill', mobId: 'wolf', zoneId: 'forest', mini: true });
  recordEvent(c, { type: 'skill', skillId: CLASSES.mage.skills[0] });
  assert.equal(readyFor(c, 'master_mage').length, 0, 'falta conversar com os dois mentores do Mago no Porto');
  recordEvent(c, { type: 'talk', npc: 'mentor_arcane' });
  assert.equal(readyFor(c, 'master_mage').length, 0, 'um só não basta');
  recordEvent(c, { type: 'talk', npc: 'mentor_paladin' }); // mentor de outra classe não conta
  assert.equal(readyFor(c, 'master_mage').length, 0);
  recordEvent(c, { type: 'talk', npc: 'mentor_warlock' });
  assert.deepEqual(readyFor(c, 'master_mage'), ['prova_do_mestre']);
  assert.deepEqual(readyFor(c, 'master_warrior'), [], 'outro mestre não recebe');
  assert.ok(turnInQuest(c, 'prova_do_mestre', makeRng(1)).ok);
  assert.equal(chooseSpec(c, 'arcane').ok, true);
  assert.equal(c.spec, 'arcane');
});

test('Maestria (nível 25): exige a prova, dá bônus permanente pequeno e o título Mestre', async () => {
  const { primaryStats, MASTERY } = await import('../public/src/core/stats.js');
  const { setTitle, titleText } = await import('../public/src/core/journal.js');
  const c = mkHero('warrior', 25);
  assert.equal(offeredBy(c, 'master_warrior').some((q) => q.id === 'maestria'), false, 'antes da prova não aparece');
  c.quests.done.prova_do_mestre = 1;
  assert.deepEqual(offeredBy(c, 'master_warrior').map((q) => q.id), ['maestria']);
  const before = primaryStats(c);
  assert.ok(acceptQuest(c, 'maestria').ok);
  for (let i = 0; i < 3; i++) recordEvent(c, { type: 'kill', mobId: 'treant', zoneId: 'forest', boss: true });
  for (let i = 0; i < 50; i++) recordEvent(c, { type: 'skill', skillId: 'charge' });
  assert.ok(turnInQuest(c, 'maestria', makeRng(1)).ok);
  const after = primaryStats(c);
  assert.equal(Math.round((after.str - before.str) * 10) / 10, MASTERY.primary);
  assert.equal(Math.round((after.vit - before.vit) * 10) / 10, MASTERY.vit);
  assert.ok(c.achievements.mestre_de_classe, 'conquista da maestria');
  assert.ok(setTitle(c, 'mestre_de_classe')); assert.equal(titleText(c), 'Mestre');
  assert.ok(MASTERY.primary <= 5 && MASTERY.vit <= 5, 'bônus pequeno');
  assert.equal(primaryStats(validate(c).char).str, after.str, 'o save mantém o bônus');
});

test('PvP: sem teto por hora (nenhum resquício de "10 partidas por hora" nos parâmetros de XP)', () => {
  assert.equal(PVP_XP.fullPerHour, undefined); assert.equal(PVP_XP.afterFull, undefined);
});

// ---------- Habilidade de Maestria (s3): nível 25 + missão `maestria` ----------
import { isSkillUnlocked as isUnl, skillIdAt, masteryUnlock } from '../public/src/core/unlocks.js';
import { SKILLS as SK } from '../public/src/data/skills.js';
import { parseClientMessage, PROTOCOL_VERSION as PV } from '../public/src/core/protocol.js';
import { rivalIntent as rivalAi } from '../public/src/game/ai.js';

const masteryHero = (classId, level, done) => { const c = newCharacter('M', classId, makeRng(5)); c.level = level; if (done) c.quests.done.maestria = 1; return c; };
const mw = (hero, mobs = []) => {
  const w = new World('arena', { seed: 9, visuals: false });
  const a = w.add(makeHeroActor(hero, 550, 700, 'player', 1));
  const es = mobs.map(([dx, dy, hp]) => { const m = w.add(makeMobActor('wolf', 25, 550 + dx, 700 + dy)); m.hostile = false; m.ai.state = 'idle'; m.stats.moveSpeed = 0; m.stats.power = 0; if (hp) m.hp = m.maxHp = hp; return m; });
  return { w, a, es, run: (s, intent = {}) => { for (let t = 0; t < s; t += 1 / 60) w.update(1 / 60, { [a.id]: { mx: 0, my: 0, aimX: a.x, aimY: a.y - 100, attack: false, ...intent } }); } };
};

test('Maestria: matriz classe × desbloqueio (nv 24 sem; nv 25 sem missão sem; nv 25 com missão com)', () => {
  for (const id of Object.keys(CLASSES)) {
    assert.equal(SK[CLASSES[id].mastery].cd >= 30 && SK[CLASSES[id].mastery].cd <= 45, true, id + ' recarga 30-45 s');
    assert.equal(skillIdAt(id, 3), CLASSES[id].mastery); assert.equal(masteryUnlock(id).id, CLASSES[id].mastery);
    const a24 = masteryHero(id, 24, true), a25 = masteryHero(id, 25, false), ok = masteryHero(id, 25, true);
    assert.equal(isUnl(a24, 3), false, id + ' nv24 mesmo com missão');
    assert.equal(isUnl(a25, 3), false, id + ' nv25 sem missão');
    assert.equal(isUnl(ok, 3), true, id + ' nv25 com missão');
    assert.equal(isUnl(25, 3), false, 'só o nível (número) nunca basta');
    assert.equal(unlockedSkills(a25).length, 3); assert.equal(unlockedSkills(ok).length, 4); assert.equal(unlockedSkills(ok)[3], CLASSES[id].mastery);
    // o ator da simulação lê a missão do documento
    assert.equal(makeHeroActor(ok, 0, 0).mastery, true); assert.equal(makeHeroActor(a25, 0, 0).mastery, false);
  }
});

test('Maestria: cast válido só com desbloqueio; recarga; cast inválido não gasta recarga', () => {
  for (const id of Object.keys(CLASSES)) {
    const locked = mw(masteryHero(id, 25, false));
    assert.equal(locked.w.castSkill(locked.a, 3, 550, 600), false); assert.equal(locked.a.cds.s3, 0);
    const { w, a } = mw(masteryHero(id, 25, true));
    assert.equal(w.castSkill(a, 3, 550, 600), true);
    assert.equal(a.cds.s3, SK[CLASSES[id].mastery].cd);
    assert.equal(w.castSkill(a, 3, 550, 600), false, 'em recarga');
    assert.equal(w.events.filter((e) => e.type === 'cast' && e.skill === CLASSES[id].mastery).length, 1);
  }
});

test('Maestria: o protocolo aceita cast 0..3 e rejeita 4', () => {
  const m = (cast) => parseClientMessage({ v: PV, t: 'input', seq: 1, mx: 0, my: 0, aimX: 10, aimY: 10, attack: false, cast });
  assert.equal(m(3).ok, true); assert.equal(m(3).msg.cast, 3); assert.equal(m(4).ok, false); assert.equal(m(-1).ok, false);
});

test('Fúria do Colosso: investida + impacto em área com atordoamento e +35% de dano por 6 s', () => {
  const { w, a, es, run } = mw(masteryHero('warrior', 25, true), [[0, -200, 99999], [60, -230, 99999], [400, 300, 99999]]);
  const hp0 = es.map((e) => e.hp);
  assert.equal(w.castSkill(a, 3, a.x, a.y - 300), true);
  assert.equal(w.buffVal(a, 'dmg'), 0.2);
  run(0.6, { aimY: a.y - 300 });
  assert.ok(es[0].hp < hp0[0] && es[1].hp < hp0[1], 'o impacto fere quem está perto do destino');
  assert.equal(es[2].hp, hp0[2], 'quem está longe não é atingido');
  assert.ok(es[0].stunT > 0.1, 'atordoado pelo impacto (0,8 s)');
  run(6.5);
  assert.equal(w.buffVal(a, 'dmg'), 0, 'o reforço acaba em 6 s');
});

test('Meteoro Arcano: aviso de 1 s, depois dano alto em área, atordoamento e queimadura que renova sem acumular', () => {
  const { w, a, es, run } = mw(masteryHero('mage', 25, true), [[0, -300, 99999], [0, -700, 99999]]);
  w.castSkill(a, 3, a.x, a.y - 300);
  assert.equal(w.telegraphs.length, 1); assert.equal(w.telegraphs[0].delay, 1.0);
  assert.ok(w.events.some((e) => e.type === 'telegraph'));
  const hp0 = es[0].hp;
  run(0.9); assert.equal(es[0].hp, hp0, 'nada antes do impacto');
  run(0.2);
  const afterHit = es[0].hp; assert.ok(afterHit < hp0, 'impacto');
  assert.ok(es[0].stunT > 0 && es[0].burn, 'atordoado e queimando');
  assert.equal(es[1].hp, es[1].maxHp, 'fora da área');
  run(2.2); assert.ok(es[0].hp < afterHit, 'a queimadura continua ferindo');
  run(2.5); assert.equal(es[0].burn, null, 'a queimadura acaba');
  // o meteoro cai mesmo que o herói morra antes
  const t = mw(masteryHero('mage', 25, true), [[0, -300, 99999]]);
  t.w.castSkill(t.a, 3, t.a.x, t.a.y - 300); t.a.dead = true; t.run(1.2);
  assert.ok(t.es[0].hp < t.es[0].maxHp);
});

test('Tempestade de Flechas Ardentes: 12 rajadas em 3 s na área e lentidão de 40%', () => {
  const { w, a, es, run } = mw(masteryHero('archer', 25, true), [[0, -300, 999999]]);
  w.castSkill(a, 3, a.x, a.y - 300);
  assert.equal(w.areas.length, 1); assert.equal(w.areas[0].ticks, 12);
  let hits = 0; run(0.5); for (const ev of w.events) if (ev.type === 'hit') hits++;
  assert.ok(hits >= 1 && es[0].slowT > 0 && es[0].slowAmt === 0.4, 'lentidão aplicada');
  w.events.length = 0; run(3.2); hits = w.events.filter((e) => e.type === 'hit').length;
  assert.ok(hits >= 9 && hits <= 12, 'rajadas: ' + hits);
});

test('Intervenção Divina: cura grande, escudo, remove atordoamento/lentidão e pode ser usada atordoado; PvE cura só o herói', () => {
  const { w, a, run } = mw(masteryHero('cleric', 25, true));
  const ally = w.add(makeHeroActor(masteryHero('warrior', 20, false), 600, 700, 'player', 1));
  ally.hp = ally.maxHp * 0.2; ally.stunT = 2; a.hp = a.maxHp * 0.2; a.stunT = 3; a.slowT = 2; a.slowAmt = 0.5;
  run(0.05, { cast: 3 }); // atordoado, mas a Intervenção rompe
  assert.ok(a.cds.s3 > 30, 'lançada atordoado');
  assert.equal(a.stunT, 0); assert.equal(a.slowT, 0); assert.equal(ally.stunT, 0);
  assert.ok(a.hp >= a.maxHp * 0.58, 'cura de 40%'); assert.ok(a.shield >= a.maxHp * 0.29, 'escudo de 30%');
  assert.ok(ally.hp > ally.maxHp * 0.2 + ally.maxHp * 0.3, 'aliado perto recebe 80% da cura'); assert.ok(ally.shield > 0);
  // outra habilidade não rompe o atordoamento
  const b = mw(masteryHero('cleric', 25, true)); b.a.stunT = 2; b.run(0.05, { cast: 0 }); assert.equal(b.a.cds.s0, 0);
  // sem aliados: cura só o herói e não falha
  const c = mw(masteryHero('cleric', 25, true)); c.a.hp = c.a.maxHp * 0.3; assert.equal(c.w.castSkill(c.a, 3, 0, 0), true); assert.ok(c.a.hp > c.a.maxHp * 0.65);
});

test('Maestria: a IA do rival só usa s3 se tiver a Maestria (e usa quando tem)', () => {
  const w0 = new World('arena', { seed: 3, visuals: false });
  const r = w0.add(makeHeroActor(masteryHero('mage', 30, false), 550, 700, 'rival', 2)), t = w0.add(makeHeroActor(masteryHero('warrior', 30, false), 550, 500, 'player', 1));
  let used = false;
  for (let i = 0; i < 300; i++) { const it = rivalAi(r, w0, 1 / 60); if (it?.cast === 3) used = true; w0.update(1 / 60, { [r.id]: it ?? {}, [t.id]: {} }); }
  assert.equal(used, false);
  const w1 = new World('arena', { seed: 3, visuals: false });
  const r1 = w1.add(makeHeroActor(masteryHero('mage', 30, true), 550, 700, 'rival', 2)); w1.add(makeHeroActor(masteryHero('warrior', 30, false), 550, 500, 'player', 1));
  let used1 = false;
  for (let i = 0; i < 300; i++) { const it = rivalAi(r1, w1, 1 / 60); if (it?.cast === 3) used1 = true; w1.update(1 / 60, { [r1.id]: it ?? {} }); }
  assert.equal(used1, true);
});

test('Balanceamento: bônus de vida por nível só vale depois do nível 4 (início do jogo segue perigoso)', () => {
  const mk = (level) => ({ classId: 'warrior', level, alloc: {}, equipment: {} });
  const hp = (l) => computeStats(mk(l)).maxHp;
  const vit = (l) => computeStats(mk(l)).vit;
  const sem = (l) => Math.round(CLASSES.warrior.hpBase + vit(l) * 12 + (l - 1) * 8);
  assert.equal(hp(4), sem(4) + rookieHp(4, CLASSES.warrior.rookie));
  assert.equal(hp(30), sem(30) + 26 * 12);
});

// ---------- IA do rival: mira à frente em projéteis lentos (item 12 de pendencias) ----------
test('IA do rival: o Mago mira à frente do alvo que anda (mas não na posição exata) e o parado é mirado no lugar', () => {
  const w = new World('arena', { seed: 3, visuals: false });
  const mage = w.add(makeHeroActor(newCharacter('M', 'mage', makeRng(1)), 550, 840, 'rival', 1));
  const foe = w.add(makeHeroActor(newCharacter('W', 'warrior', makeRng(2)), 550, 400, 'rival', 2));
  // alvo parado: velocidade 0, mira dentro do tremor (±18) de sempre
  let it;
  for (let i = 0; i < 30; i++) it = rivalAi(mage, w, 1 / 60);
  assert.ok(Math.abs(it.aimX - foe.x) <= 18.01 && Math.abs(it.aimY - foe.y) <= 18.01, 'parado: sem antecipação');
  // alvo andando para a direita a 200 px/s: a mira passa a ficar à direita dele
  for (let i = 0; i < 90; i++) { foe.x += 200 / 60; it = rivalAi(mage, w, 1 / 60); }
  assert.ok(it.aimX > foe.x + 20, 'a mira antecipa o movimento (aimX ' + it.aimX.toFixed(0) + ' > ' + (foe.x + 20).toFixed(0) + ')');
  assert.ok(it.aimX < foe.x + 200, 'e não passa do razoável');
});

test('PvP: o fator de dano entre heróis (PVP_DAMAGE) fica em 0,28 e só vale herói contra herói', async () => {
  const { PVP_DAMAGE } = await import('../public/src/game/sim.js');
  assert.equal(PVP_DAMAGE, 0.28);
  const mk = () => { const w = new World('arena', { seed: 4, visuals: false }); const a = w.add(makeHeroActor(newCharacter('A', 'warrior', makeRng(1)), 500, 500, 'rival', 1)); return { w, a }; };
  const { w, a } = mk();
  const rival = w.add(makeHeroActor(newCharacter('B', 'warrior', makeRng(2)), 520, 500, 'rival', 2));
  const mob = w.add(makeMobActor('wolf', 4, 520, 520)); mob.stats.defense = rival.stats.defense = 0; mob.maxHp = mob.hp = rival.maxHp = rival.hp = 1e6;
  const dHero = w.damage(a, rival, 1, {}), dMob = w.damage(a, mob, 1, {});
  assert.ok(dHero > 0 && dMob > 0 && dHero < dMob * 0.6, `herói→herói (${dHero}) bem menor que herói→mob (${dMob})`);
});

// ---------------- escudo e bloqueio passivo ----------------
import { blockChance, inFrontArc, BLOCK } from '../public/src/core/block.js';
import { SHIELD_BLOCK } from '../public/src/data/items.js';

test('escudo: só Guerreiro e Clérigo equipam; stats def/vida/bloqueio por raridade; Mago/Arqueiro nunca sorteiam escudo', () => {
  const rng = makeRng(3);
  for (const cid of Object.keys(CLASSES)) {
    const c = newCharacter('T', cid, makeRng(1)); c.level = 20;
    const sh = generateItem(rng, 10, { classId: cid, slot: 'offhand', rarityId: 'epic' });
    sh.classId = cid;
    assert.equal(canEquip(c, sh).ok, cid === 'warrior' || cid === 'cleric', cid);
  }
  for (const r of Object.keys(SHIELD_BLOCK)) {
    const sh = generateItem(makeRng(5), 12, { classId: 'warrior', slot: 'offhand', rarityId: r });
    assert.equal(sh.stats.block, SHIELD_BLOCK[r]); assert.ok(sh.stats.def > 0 && sh.stats.hp > 0);
    assert.equal(sh.slot, 'offhand'); assert.equal(sh.classId, 'warrior');
  }
  assert.ok(SHIELD_BLOCK.common >= 20 && SHIELD_BLOCK.legendary <= 40);
  for (let i = 0; i < 400; i++) assert.notEqual(generateItem(rng, 10, { classId: i % 2 ? 'mage' : 'archer' }).slot, 'offhand');
  let seen = 0;
  for (let i = 0; i < 400; i++) if (generateItem(rng, 10, { classId: 'cleric' }).slot === 'offhand') seen++;
  assert.ok(seen > 20, 'Clérigo recebe escudos no loot');
});

test('computeStats: escudo equipado dá bloqueio e defesa; sem escudo, bloqueio 0', () => {
  const c = newCharacter('T', 'warrior', makeRng(1)); c.level = 10;
  const base = computeStats(c);
  assert.equal(base.block, 0);
  c.equipment.offhand = generateItem(makeRng(4), 10, { classId: 'warrior', slot: 'offhand', rarityId: 'rare' });
  const st = computeStats(c);
  assert.equal(st.block, SHIELD_BLOCK.rare); assert.ok(st.def > base.def && st.maxHp > base.maxHp);
});

test('bloqueio: chance vem do item, +10 parado >= 0,6 s, arco frontal de 140 graus', () => {
  assert.equal(blockChance({ block: 0 }, 5), 0);
  assert.equal(blockChance({ block: 30 }, 0), 0.3);
  assert.equal(blockChance({ block: 30 }, BLOCK.stillT), 0.4);
  assert.ok(inFrontArc(0, 0, 0, 100, 0));
  assert.ok(inFrontArc(0, 0, 0, 100, 100)); // 45 graus
  assert.ok(!inFrontArc(0, 0, 0, 0, 100));  // 90 graus: fora de 70
  assert.ok(!inFrontArc(0, 0, 0, -100, 0));
});

function duelo(seed, { shield, front = true, n = 400, ranged = false }) {
  const w = new World('arena', { seed, visuals: false });
  const c = newCharacter('T', 'warrior', makeRng(1)); c.level = 10;
  if (shield) c.equipment.offhand = generateItem(makeRng(4), 10, { classId: 'warrior', slot: 'offhand', rarityId: 'legendary' });
  const p = w.add(makeHeroActor(c, 500, 500)); p.facing = 0;
  const m = w.add(makeMobActor('wolf', 10, front ? 530 : 470, 500));
  let blocked = 0, hits = 0;
  for (let i = 0; i < n; i++) {
    p.hp = p.maxHp; p.stunT = 0; m.stunT = 0; p.x = 500; p.y = 500; m.x = front ? 530 : 470; m.y = 500; // o recuo de cada golpe empurra o herói: recoloca
    const before = w.events.length;
    w.damage(m, p, 1);
    for (const e of w.events.slice(before)) { if (e.type === 'hit') hits++; if (e.type === 'block') { blocked++; assert.equal(m.stunT, 0, 'bloquear não atordoa o atacante'); } }
  }
  return { blocked, hits };
}

test('bloqueio no sim: só com escudo e golpe frontal; taxa perto da chance; não atordoa o atacante; determinístico', () => {
  const a = duelo(11, { shield: true });
  assert.ok(a.blocked > 400 * 0.3 && a.blocked < 400 * 0.5, `taxa ${a.blocked}/400 (lendário 40%)`);
  assert.deepEqual(duelo(11, { shield: true }), a, 'mesma semente, mesmo resultado');
  assert.equal(duelo(11, { shield: false }).blocked, 0, 'sem escudo não bloqueia');
  assert.equal(duelo(11, { shield: true, front: false }).blocked, 0, 'golpe pelas costas não bloqueia');
});

test('bloqueio reduz o dano em 60% e não vale para dano contínuo', () => {
  const run = (shield, dot) => {
    const w = new World('arena', { seed: 2, visuals: false });
    const c = newCharacter('T', 'warrior', makeRng(1)); c.level = 10;
    if (shield) { c.equipment.offhand = generateItem(makeRng(4), 10, { classId: 'warrior', slot: 'offhand', rarityId: 'legendary' }); c.equipment.offhand.stats.block = 100; }
    const p = w.add(makeHeroActor(c, 500, 500)); p.facing = 0; p.stats.block = shield ? 60 : 0;
    p.stillT = 1; // 60 + 10 = 70% de chance; força passando o rng por muitas tentativas
    const m = w.add(makeMobActor('wolf', 10, 530, 500)); m.stats.crit = 0;
    let best = Infinity, worst = 0;
    for (let i = 0; i < 60; i++) { p.hp = p.maxHp; p.x = 500; p.y = 500; w.damage(m, p, 1, dot ? { dot: true } : {}); const d = p.maxHp - p.hp; best = Math.min(best, d); worst = Math.max(worst, d); }
    return { best, worst };
  };
  const plain = run(false, false), sh = run(true, false), dot = run(true, true);
  assert.ok(sh.best < plain.best * 0.5, 'algum golpe foi bloqueado (-60%)');
  assert.ok(dot.best >= plain.best * 0.8, 'dano contínuo ignora o bloqueio');
});

test('save: equipamento.offhand opcional; escudo em classe sem escudo é removido', () => {
  const mk = (cid) => {
    const c = newCharacter('T', cid, makeRng(1));
    const sh = generateItem(makeRng(4), 5, { classId: 'warrior', slot: 'offhand', rarityId: 'rare' }); sh.classId = cid;
    c.equipment.offhand = sh;
    return c;
  };
  const w = parseSave(JSON.stringify(mk('warrior')));
  assert.ok(w.ok && w.char.equipment.offhand?.stats.block > 0);
  const m = parseSave(JSON.stringify(mk('mage')));
  assert.ok(m.ok && !m.char.equipment.offhand);
  const none = parseSave(JSON.stringify(newCharacter('T', 'cleric', makeRng(1))));
  assert.ok(none.ok && !none.char.equipment.offhand);
});

test('Soberano dos Ecos: só 2 fases (sem fúria), golpes em área com AVISO maiores na fase 2 e esbirros só nela; criaturas da Cripta fora das ondas da arena', async () => {
  const { NORMAL_MOBS, MOBS, BOSS_PHASES } = await import('../public/src/data/mobs.js');
  const { generateEchoItem, rollCryptFrags, rollEchoDrop } = await import('../public/src/core/loot.js');
  const { CRYPT, ECHO_NAMES } = await import('../public/src/data/crypt.js');
  assert.ok(['echoshade', 'echoknight', 'echobrute', 'echolord'].every((id) => MOBS[id].crypt && !NORMAL_MOBS.includes(id)), 'as ondas da arena (economy.js) não mudam');
  const w = new World('arena', { seed: 5, visuals: false });
  const hero = w.add(makeHeroActor(newCharacter('T', 'warrior', makeRng(1)), 500, 500)); hero.stats.def = 1e7;
  const b = w.add(makeMobActor('echolord', 28, 620, 500)); b.ai.target = hero.id; b.ai.state = 'chase';
  const tick = () => { hero.hp = hero.maxHp; w.update(1 / 60); };
  const slams = () => w.events.filter((e) => e.type === 'telegraph' && e.src === undefined);
  for (let i = 0; i < 60 * 8; i++) tick();
  const s1 = w.events.filter((e) => e.type === 'telegraph');
  assert.ok(s1.length >= 1 && s1.every((e) => e.r === BOSS_PHASES.echolord.slam.r[0] && e.delay >= 1), 'golpe com aviso (delay ≥ 1 s) na fase 1');
  assert.ok(!w.actors.some((a) => a.summonedBy === b.id), 'sem esbirros na fase 1');
  w.events.length = 0; b.hp = b.maxHp * 0.45; tick();
  assert.equal(b.phase, 2); assert.ok(b.stats.atkSpeed > 1 && b.stats.power > b.base.power);
  b.hp = b.maxHp * 0.05; for (let i = 0; i < 60 * 30; i++) tick();
  assert.equal(b.phase, 2, 'sem 3ª fase: não há fúria');
  assert.ok(w.events.filter((e) => e.type === 'telegraph').every((e) => e.r === BOSS_PHASES.echolord.slam.r[1]), 'golpes maiores na fase 2');
  const mins = w.actors.filter((a) => a.summonedBy === b.id && !a.dead);
  assert.ok(mins.length > 0 && mins.length <= 4 && mins.every((m) => m.mobId === 'echoshade' && m.summoned));
  void slams;
  // item Eco: da classe, épico, nome próprio e sempre acima do épico comum; fragmentos dentro da faixa
  for (const cid of Object.keys(CLASSES)) for (const slot of ['weapon', 'armor']) {
    const it = generateEchoItem(makeRng(7), 26, cid, slot), base = generateItem(makeRng(7), 26, { classId: cid, slot, weaponType: slot === 'weapon' ? CLASSES[cid].weapon : undefined, rarityId: 'epic' });
    assert.ok(it.eco && it.rarity === 'epic' && it.classId === cid && it.slot === slot);
    assert.equal(it.name, slot === 'weapon' ? ECHO_NAMES.weapon[CLASSES[cid].weapon] : ECHO_NAMES.armor[cid]);
    assert.ok((it.stats.atk ?? it.stats.def) > (base.stats.atk ?? base.stats.def), 'base ×1,35');
  }
  const rng = makeRng(11);
  for (let i = 0; i < 200; i++) { const f = rollCryptFrags(rng, 'boss'); assert.ok(f >= CRYPT.frags.boss[0] && f <= CRYPT.frags.boss[1]); const r = rollCryptFrags(rng, 'room', 1); assert.ok(r >= CRYPT.frags.room[1][0] && r <= CRYPT.frags.room[1][1]); }
  let drops = 0; for (let i = 0; i < 2000; i++) if (rollEchoDrop(rng, 26, 'mage')) drops++;
  assert.ok(drops > 2000 * CRYPT.itemChance * 0.8 && drops < 2000 * CRYPT.itemChance * 1.2, 'chance do item Eco ~' + CRYPT.itemChance + ': ' + drops);
});

// Correr (sprint): +30% só fora de combate e só em zonas de farm/cidade (nunca arena PvP, ondas ou Cripta)
test('correr: +30% em zona de farm fora de combate; sem efeito em arena, em combate ou atacando', () => {
  const dist = (zone, it, prep) => {
    const w = new World(zone, { seed: 1, visuals: false });
    const p = w.add(makeHeroActor(newCharacter('T', 'warrior', makeRng(1)), 1000, 1000));
    if (prep) prep(w, p);
    const x0 = p.x;
    for (let i = 0; i < 20; i++) w.update(1 / 60, { [p.id]: { mx: 1, my: 0, aimX: p.x + 100, aimY: p.y, ...it } });
    return { d: p.x - x0, running: p.running };
  };
  const walk = dist('town', {}), run = dist('town', { run: true });
  assert.ok(walk.d > 50, 'andou');
  assert.ok(Math.abs(run.d / walk.d - 1.3) < 0.02, `razão ${(run.d / walk.d).toFixed(3)}`);
  const noRun = dist('arena_team', { run: true }), noWaves = dist('waves', { run: true }), noCrypt = dist('crypt', { run: true });
  for (const r of [noRun, noWaves, noCrypt]) assert.ok(!r.running);
  assert.ok(Math.abs(noRun.d - dist('arena_team', {}).d) < 1e-6, 'arena PvP: sem bônus');
  assert.ok(Math.abs(noWaves.d - dist('waves', {}).d) < 1e-6, 'ondas: sem bônus');
  const hit = dist('town', { run: true }, (w, p) => { p.lastCombat = w.time; });
  assert.ok(Math.abs(hit.d - walk.d) < 1e-6 && !hit.running, 'em combate (últimos 3 s): sem bônus');
  const atk = dist('town', { run: true, attack: true });
  assert.ok(atk.d <= walk.d + 1e-6 && !atk.running, 'atacando: cai o correr');
  assert.ok(dist('town', { run: true }, (w, p) => { p.lastCombat = w.time - 3.1; }).running, 'passados 3 s volta a correr');
});

import { ZONES as ZONES_WALL } from '../public/src/data/zones.js';
// Muros e sarcófagos da Cripta são retângulos com `block`: antes o teste de projéteis só via círculos e a flecha atravessava o muro.
test('projétil para no muro da Cripta (retângulo com block) e passa pela porta', () => {
  const wl = ZONES_WALL.crypt.walls[0];
  const shoot = (y) => {
    const w = new World('crypt', { seed: 3, visuals: false });
    w.actors = []; // só os dois atores do teste
    const hero = w.add(makeHeroActor(newCharacter('Arq', 'archer', makeRng(1)), wl.x - 120, y));
    const mob = w.add(makeMobActor(Object.keys(MOBS)[0], 1, wl.x + wl.w + 120, y, { hostile: false }));
    const hp0 = mob.hp;
    w.basicAttack(hero, mob.x, mob.y);
    for (let i = 0; i < 90; i++) w.updateProjectiles(1 / 60);
    return { hit: mob.hp < hp0, left: w.projectiles.length };
  };
  const wall = shoot(wl.gap[0] / 2); // meio do muro norte
  assert.equal(wall.hit, false, 'o muro bloqueia a flecha');
  assert.equal(wall.left, 0, 'a flecha morre no muro');
  assert.equal(shoot((wl.gap[0] + wl.gap[1]) / 2).hit, true, 'pela porta a flecha passa e acerta');
});
