// Análise de economia (fontes e destinos de ouro, ritmo de XP) a partir das regras REAIS do código — nada inventado à mão.
// Uso: npm run economy [-- --level 12]. Simula N abates por nível com o RNG do jogo e reporta médias; é estimativa de regras, não telemetria de jogadores.
import { makeRng } from '../public/src/core/rng.js';
import { mobXp, xpToNext, MAX_LEVEL } from '../public/src/core/progression.js';
import { rollMobLoot, generateItem } from '../public/src/core/loot.js';
import { MOBS } from '../public/src/data/mobs.js';
import { ZONES } from '../public/src/data/zones.js';
import { PRICES } from '../public/src/shop.js';
import { COOP_WAVES } from '../server/coop.js';
import { coopRewardPlan } from '../public/src/core/economy.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const N = 4000;
const rng = makeRng(2026);
const rows = [];

// por zona de exploração: ouro e XP médios por abate (jogador no nível médio da zona), itens por abate
for (const [zid, z] of Object.entries(ZONES)) {
  if (!z.mobs || !z.level) continue;
  const lvl = Math.round((z.level[0] + z.level[1]) / 2);
  const total = z.mobs.reduce((s, [, w]) => s + w, 0);
  let gold = 0, xp = 0, items = 0, vendor = 0;
  for (let i = 0; i < N; i++) {
    let r = rng.next() * total, id = z.mobs[0][0];
    for (const [m, w] of z.mobs) { if ((r -= w) <= 0) { id = m; break; } }
    const mob = { level: lvl, boss: false, elite: rng.chance(0.04), mobId: id };
    xp += mobXp(lvl, lvl, MOBS[id].xp * (mob.elite ? 3 : 1));
    for (const d of rollMobLoot(rng, mob, 'warrior')) { if (d.kind === 'gold') gold += d.amount; if (d.kind === 'item') { items++; vendor += d.item.value; } }
  }
  const need = xpToNext(lvl);
  rows.push({ zona: zid, nivel: lvl, ouroPorAbate: gold / N, xpPorAbate: xp / N, itensPorAbate: items / N, valorVendaPorAbate: vendor / N, abatesPorNivel: need / (xp / N), ouroPorNivel: (need / (xp / N)) * (gold / N + vendor / N * 0.5) });
}
console.log('FONTES — exploração (por abate, jogador no nível médio da zona; itens vendidos pela metade do valor)');
for (const r of rows) console.log(`  ${r.zona.padEnd(8)} nv ${String(r.nivel).padStart(2)} · ouro ${r.ouroPorAbate.toFixed(1).padStart(6)} · XP ${r.xpPorAbate.toFixed(1).padStart(6)} · itens ${r.itensPorAbate.toFixed(3)} · ${r.abatesPorNivel.toFixed(0).padStart(4)} abates por nível ≈ ${r.ouroPorNivel.toFixed(0)} ouro por nível`);

console.log('\nFONTES — cooperativo (vitória, 1 e 4 jogadores) e PvP');
for (const lvl of [8, 12, 20]) for (const crew of [1, 4]) {
  const plan = coopRewardPlan({ level: lvl, crew, wavesCleared: COOP_WAVES, bossDown: true });
  console.log(`  coop nv ${String(lvl).padStart(2)} × ${crew} jogador(es): ouro ${plan.gold} · XP ${plan.xp} (${((plan.xp / xpToNext(lvl)) * 100).toFixed(0)}% de um nível) · poções ${plan.potions}`);
}
for (const lvl of [10, 20]) console.log(`  PvP 1×1 nv ${lvl}: vitória ${40 + lvl * 8} ouro, derrota ${10 + lvl * 2}; XP ${Math.round(xpToNext(lvl) * 0.12)} / ${Math.round(xpToNext(lvl) * 0.04)}`);

console.log('\nDESTINOS (ralos de ouro)');
for (const lvl of [5, 15, 25]) console.log(`  nv ${String(lvl).padStart(2)}: poção ${PRICES.potion(lvl)} · essência ${PRICES.essence(lvl)} · prismática ${PRICES.prism(lvl)} · item na loja ≈ ${(generateItem(rng, lvl, { rarityId: 'rare' }).value * PRICES.itemMarkup)} (raro) · trocar de especialização ${150 + lvl * 25} · morte no PvE: -10% do ouro`);
console.log('  Ouro necessário para 1 essência ≈ abates:', rows.map((r) => `${r.zona}: ${(PRICES.essence(r.nivel) / (r.ouroPorAbate + r.valorVendaPorAbate * 0.5)).toFixed(0)}`).join(' · '));
console.log(`\nNível máximo ${MAX_LEVEL}. Itens: só entram por abates, chefes, baús, missões, cooperativo e prêmios de arena; saem por venda (50% do valor), conversão (inventário cheio).`);
