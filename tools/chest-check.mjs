// Taxa de épico+/lendário por baú e por hora de varredura (G1). Uso: node tools/chest-check.mjs [--n 20000] [--cph 48] [--old]
// --old reproduz a fórmula antiga (luck 1,2·tier; item 0,3·tier) só para comparar; sem ela mede o openChest real.
import { makeRng } from '../public/src/core/rng.js';
import { blankJournal, openChest } from '../public/src/core/journal.js';
import { generateItem } from '../public/src/core/loot.js';
import { ZONES } from '../public/src/data/zones.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const N = arg('n', 20000), CPH = arg('cph', 48), OLD = process.argv.includes('--old'); // 8 baús a cada 10 min = 48/h
const LEVEL = 15;

function rate(tier, seed) {
  const rng = makeRng(seed);
  let item = 0, epic = 0, leg = 0;
  for (let i = 0; i < N; i++) {
    let it = null;
    if (OLD) { if (rng.chance(0.3 * tier)) it = generateItem(rng, LEVEL, { classId: 'mage', luck: 1.2 * tier }); }
    else {
      const doc = { ...blankJournal(), level: LEVEL, classId: 'mage', gold: 0, inventory: [] };
      it = openChest(doc, { id: 'x:' + i, tier }, 'forest', rng, 1e12).item;
    }
    if (!it) continue;
    item++; if (it.rarity === 'epic') epic++; if (it.rarity === 'legendary') leg++;
  }
  return { item: item / N, epic: epic / N, leg: leg / N };
}
console.log(OLD ? 'FÓRMULA ANTIGA' : 'openChest ATUAL', `· nível ${LEVEL} · ${N} baús por tier`);
for (const tier of [1, 1.3, 1.8, 2.2, 2.8, 3.8]) {
  const r = rate(tier, 5 + tier * 10);
  console.log(`  tier ${String(tier).padEnd(3)} item ${(100 * r.item).toFixed(0).padStart(3)}% · épico ${(100 * r.epic).toFixed(2).padStart(5)}% · lendário ${(100 * r.leg).toFixed(2).padStart(5)}% · épico+ ${(100 * (r.epic + r.leg)).toFixed(2).padStart(5)}%`);
}
console.log(`\nPor hora (${CPH} baús/h, tier médio da zona):`);
for (const [zid, z] of Object.entries(ZONES)) {
  if (!z.chests?.length) continue;
  const tier = z.chests.reduce((s, c) => s + c.tier, 0) / z.chests.length, r = rate(tier, 99);
  console.log(`  ${zid.padEnd(8)} tier ${tier.toFixed(2)}: ${(CPH * (r.epic + r.leg)).toFixed(1).padStart(5)} épico+/h · ${(CPH * r.leg).toFixed(2)} lendário/h`);
}
