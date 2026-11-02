// Distribuição de raridades em N abates (mobs comuns 93% / elites 7%, como o spawn) e taxa esperada de épico/lendário por hora de farm.
// Premissa de ritmo (ajustável): um abate a cada 8 s = 450 abates/h. Uso: node tools/loot-check.mjs [--n 10000] [--kph 450]
import { makeRng } from '../public/src/core/rng.js';
import { rollMobLoot, newPity, OPAL_BOSS } from '../public/src/core/loot.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const N = arg('n', 10000), KPH = arg("kph", 300);

function farm(pity, seed) {
  const rng = makeRng(seed), c = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  let items = 0, gapMax = 0, gap = 0, elites = 0;
  for (let i = 0; i < N; i++) {
    const elite = rng.chance(0.07); if (elite) elites++;
    for (const l of rollMobLoot(rng, { level: 15, elite }, 'mage', pity)) if (l.kind === 'item') {
      items++; c[l.item.rarity]++;
      if (l.item.rarity === 'epic' || l.item.rarity === 'legendary') { gapMax = Math.max(gapMax, gap); gap = 0; } else gap += 1;
    }
  }
  return { c, items, gapMax, elites };
}
for (const [label, mk] of [['SEM pity (servidor atual)', () => null], ['COM pity (jogo offline)', newPity]]) {
  const r = farm(mk(), 42), h = N / KPH;
  console.log(`\n${label}: ${N} abates (${r.elites} elites), ${r.items} itens`);
  for (const k of Object.keys(r.c)) console.log(`  ${k.padEnd(10)} ${String(r.c[k]).padStart(5)}  ${(100 * r.c[k] / r.items).toFixed(2)}% dos itens`);
  console.log(`  por hora (${KPH} abates/h): ${(r.c.epic / h).toFixed(2)} épico · ${(r.c.legendary / h).toFixed(2)} lendário · maior seca sem épico+: ${r.gapMax} itens`);
}
// Chefe final: quantos abates até o exclusivo
const rng = makeRng(7), pity = newPity(); let kills = 0, drops = 0, worst = 0, miss = 0;
for (let i = 0; i < 2000; i++) { kills++; const l = rollMobLoot(rng, { level: 31, boss: true, mobId: OPAL_BOSS }, 'mage', pity); if (l.some((x) => x.item?.opal)) { drops++; miss = 0; } else worst = Math.max(worst, ++miss); }
console.log(`\nCavaleiro Rubro: ${drops} exclusivos em ${kills} abates (1 a cada ${(kills / drops).toFixed(2)}), pior seca ${worst} abates`);
