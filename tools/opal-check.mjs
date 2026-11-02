// Compara o item opalino com um lendário comum do mesmo slot (pontuação de itemScore). Uso: node tools/opal-check.mjs
import { makeRng } from '../public/src/core/rng.js';
import { generateOpalItem, generateItem } from '../public/src/core/loot.js';
import { itemScore } from '../public/src/core/stats.js';
const rng = makeRng(3); const out = {};
for (const slot of ['weapon', 'armor']) {
  let o = 0, l = 0, n = 3000, oatk = 0, latk = 0;
  for (let i = 0; i < n; i++) {
    const op = generateOpalItem(rng, 30, 'mage', slot);
    const lg = generateItem(rng, 30, slot === 'weapon' ? { slot, weaponType: 'staff', rarityId: 'legendary' } : { slot, rarityId: 'legendary' });
    o += itemScore(op); l += itemScore(lg);
  }
  console.log(slot, 'opalino/lendário comum:', (o / l).toFixed(3), '(+' + (100 * (o / l - 1)).toFixed(0) + '%)');
}
