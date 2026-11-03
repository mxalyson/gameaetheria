// Simulador de balanceamento: duelos classe × classe com a simulação real (sem navegador).
// Uso: npm run balance [-- --level 10 --n 40]
import { makeRng } from '../public/src/core/rng.js';
import { newCharacter, POINTS_PER_LEVEL } from '../public/src/core/progression.js';
import { generateItem } from '../public/src/core/loot.js';
import { playerPower } from '../public/src/core/power.js';
import { CLASSES } from '../public/src/data/classes.js';
// NOSHIELD=1: duela sem escudo (referência para medir o efeito do escudo)
import { SLOTS, SHIELD_CLASSES } from '../public/src/data/items.js';
import { World, makeHeroActor } from '../public/src/game/sim.js';
import { specsOf, SPEC_LEVEL } from '../public/src/core/specs.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const LEVEL = arg('level', 10), N = arg('n', 30), MAXT = 90, DT = 1 / 60; // mesmo passo fixo do jogo
const MASTERY = process.argv.includes('--mastery'); // nível >= 25: concede a Maestria (skill s3) aos duelistas
const SPEC_IDX =arg('spec', -1); // --spec 0|1 fixa a especialização (índice) de todas as classes; padrão: alterna

// Com nível >= SPEC_LEVEL a especialização alterna pela semente: o resultado é a média das duas escolhas de cada classe.
function build(classId, level, seed) {
  const rng = makeRng(seed);
  const c = newCharacter('B', classId, rng);
  c.level = level;
  if (MASTERY && level >= 25) { c.quests ??= { active: {}, done: {} }; c.quests.done.maestria = 1; } // --mastery: ambos usam a 4ª habilidade (a IA a escolhe primeiro)
  if (level >= SPEC_LEVEL) { const ids = Object.keys(specsOf(classId)); c.spec = SPEC_IDX >= 0 ? ids[SPEC_IDX] : ids[seed % ids.length]; }
  const cls = CLASSES[classId], pts = POINTS_PER_LEVEL * (level - 1);
  c.alloc[cls.primary] += Math.round(pts * 0.6); c.alloc.vit += Math.round(pts * 0.3); c.alloc.agi += pts - Math.round(pts * 0.6) - Math.round(pts * 0.3);
  for (const slot of SLOTS) if ((slot !== 'offhand' || (SHIELD_CLASSES.includes(classId) && !process.env.NOSHIELD))) c.equipment[slot] = generateItem(rng, level, { classId, slot, weaponType: slot === 'weapon' ? cls.weapon : undefined, rarityId: 'uncommon' });
  return c;
}

function duel(ca, cb, seed) {
  const w = new World('arena', { seed, visuals: false });
  const a = w.add(makeHeroActor(ca, 550, 840, 'rival', 1));
  const b = w.add(makeHeroActor(cb, 550, 260, 'rival', 2));
  let t = 0;
  while (t < MAXT && !a.dead && !b.dead) { w.update(DT); t += DT; }
  return { winner: a.dead && b.dead ? 0 : a.dead ? 2 : b.dead ? 1 : 0, t };
}

const ids = Object.keys(CLASSES);
console.log(`Balanceamento: nível ${LEVEL}, ${N} duelos por par (equipamento incomum, atributos 60/30/10).`);
const pw = Object.fromEntries(ids.map((i) => [i, playerPower(build(i, LEVEL, 1))]));
console.log('PWR:', ids.map((i) => `${i}=${pw[i]}`).join('  '));
const total = Object.fromEntries(ids.map((i) => [i, { w: 0, g: 0, t: 0 }]));
console.log('\nTaxa de vitória (linha vence coluna) · tempo médio de duelo');
console.log(''.padEnd(10) + ids.map((i) => i.padStart(9)).join(''));
for (const x of ids) {
  let row = x.padEnd(10);
  for (const y of ids) {
    if (x === y) { row += '        -'; continue; }
    let wins = 0, tsum = 0;
    for (let s = 0; s < N; s++) {
      const r = duel(build(x, LEVEL, 100 + s), build(y, LEVEL, 500 + s), 7 + s);
      if (r.winner === 1) wins++; else if (r.winner === 0) wins += 0.5;
      tsum += r.t;
    }
    total[x].w += wins; total[x].g += N; total[x].t += tsum;
    row += (`${Math.round((wins / N) * 100)}%`).padStart(9);
  }
  console.log(row);
}
console.log('\nResumo (meta: 45–55%, duelo 20–40 s):');
let bad = 0;
for (const i of ids) {
  const rate = (total[i].w / total[i].g) * 100, avg = total[i].t / total[i].g;
  const flag = rate < 45 || rate > 55 ? '  <- fora da meta' : '';
  if (flag) bad++;
  console.log(`${i.padEnd(10)} ${rate.toFixed(0)}% · ${avg.toFixed(0)} s${flag}`);
}
process.exitCode = 0;
