// Simulador de dificuldade: heróis das 4 classes contra chefes e mobs comuns, com a simulação REAL (World + IA), sem navegador.
// Uso: node tools/boss-check.mjs [--n 4] [--dodge 0.6] [--only boss|mobs] [--json]
// O "jogador" é um robô razoável: usa o mesmo cérebro do rival (skills quando fazem sentido), toma poção abaixo de 45% de vida
// (35% da vida máx., recarga de 8 s, como no jogo) e foge de golpes telegrafados em `--dodge` (fração) das vezes.
import { makeRng } from '../public/src/core/rng.js';
import { newCharacter, POINTS_PER_LEVEL, createSpirit } from '../public/src/core/progression.js';
import { generateItem } from '../public/src/core/loot.js';
import { CLASSES } from '../public/src/data/classes.js';
import { SLOTS } from '../public/src/data/items.js';
import { MOBS } from '../public/src/data/mobs.js';
import { ZONES } from '../public/src/data/zones.js';
import { World, makeHeroActor, makeMobActor, makeSpiritActor } from '../public/src/game/sim.js';
import { rivalIntent } from '../public/src/game/ai.js';
import { specsOf, SPEC_LEVEL } from '../public/src/core/specs.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('n', 4)), DODGE = Number(arg('dodge', 0.6)), ONLY = arg('only', ''), DT = 1 / 60, MAXT = 240;
const JSON_OUT = process.argv.includes('--json');

// Perfis de equipamento plausíveis por nível: raridade típica e aprimoramento (+N) que o ouro do nível costuma pagar.
export const PROFILES = {
  // normal: tudo que caiu no caminho (incomum/raro misturado), ferreiro pouco usado, sem spirit relevante
  normal: { rarities: ['uncommon', 'rare'], plus: (l) => Math.floor(l / 7), potions: 5, spirit: null },
  // bom: épicos, aprimorados, spirit raro evoluído
  good: { rarities: ['epic'], plus: (l) => Math.min(8, Math.floor(l / 4)), potions: 8, spirit: { rarity: 'rare', evolved: true } },
  // melhor: lendários +8 e spirit lendário evoluído
  best: { rarities: ['legendary'], plus: () => 8, potions: 10, spirit: { rarity: 'legendary', evolved: true } },
};

export function buildHero(classId, level, profileId, seed) {
  const P = PROFILES[profileId], rng = makeRng(seed);
  const c = newCharacter('Bot', classId, rng);
  c.level = level;
  if (level >= SPEC_LEVEL) { const ids = Object.keys(specsOf(classId)); c.spec = ids[seed % ids.length]; }
  const cls = CLASSES[classId], pts = POINTS_PER_LEVEL * (level - 1);
  c.alloc[cls.primary] += Math.round(pts * 0.6); c.alloc.vit += Math.round(pts * 0.3); c.alloc.agi += pts - Math.round(pts * 0.6) - Math.round(pts * 0.3);
  for (const slot of SLOTS) {
    const it = generateItem(rng, level, { classId, slot, weaponType: slot === 'weapon' ? cls.weapon : undefined, rarityId: P.rarities[(seed + slot.length) % P.rarities.length] });
    if (P.plus(level) > 0) it.plus = P.plus(level);
    c.equipment[slot] = it;
  }
  c.potions = P.potions;
  if (P.spirit) {
    const sp = createSpirit(rng, { type: ['ember', 'terra', 'undine', 'zephyr'][seed % 4], rarity: P.spirit.rarity, level: Math.min(level, 30) });
    if (P.spirit.evolved && sp.level >= 10) sp.stage = 2;
    c.spirits = [sp]; c.activeSpirit = sp.id;
  }
  return c;
}

// Luta de um herói contra uma lista de inimigos [{ mobId, level, elite }]. Devolve { win, t, hpLeft, potionsUsed }.
export function fight(char, foes, seed, { zoneId = 'arena', dodge = DODGE, maxT = MAXT } = {}) {
  const w = new World(zoneId, { seed, visuals: false });
  const rng = makeRng(seed ^ 0xabcdef);
  const hero = w.add(makeHeroActor(char, 550, 840, 'player', 1));
  const sp = char.spirits?.find((s) => s.id === char.activeSpirit);
  if (sp) w.add(makeSpiritActor(sp, hero));
  foes.forEach((f, i) => {
    const m = w.add(makeMobActor(f.mobId, f.level, 550 + (i - (foes.length - 1) / 2) * 60, 540, { elite: !!f.elite, hostile: true }));
    m.ai.target = hero.id; m.ai.state = 'chase';
  });
  let potions = char.potions ?? 0, potCd = 0, t = 0, used = 0;
  const decided = new Map(); // telegrafo -> vai esquivar?
  while (t < maxT && !hero.dead && w.actors.some((a) => a.kind === 'mob' && !a.dead)) {
    const it = rivalIntent(hero, w, DT) ?? { mx: 0, my: 0, aimX: hero.x, aimY: hero.y };
    // esquiva: depois de ~0,35 s de reação, sai de dentro do golpe marcado
    for (const tg of w.telegraphs) {
      if (!decided.has(tg)) decided.set(tg, rng.chance(dodge));
      const d = Math.hypot(hero.x - tg.x, hero.y - tg.y);
      if (decided.get(tg) && tg.t >= 0.35 && d < tg.r + hero.r + 25) { it.mx = hero.x - tg.x || 1; it.my = hero.y - tg.y; it.spd = 1; break; }
    }
    potCd = Math.max(0, potCd - DT);
    if (potions > 0 && potCd <= 0 && hero.hp < hero.maxHp * 0.45) { potions--; used++; potCd = 8; w.heal(hero, hero.maxHp * 0.35); }
    w.update(DT, { [hero.id]: it });
    t += DT;
    if (w.events.length) w.events.length = 0;
  }
  const alive = w.actors.filter((a) => a.kind === 'mob' && !a.dead).length;
  return { win: !hero.dead && alive === 0, t, hpLeft: hero.dead ? 0 : hero.hp / hero.maxHp, potionsUsed: used };
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const BOSSES = [['treant', 7], ['colossus', 13], ['guardian', 21], ['frostlord', 26], ['infernoknight', 31]];
const LEVELS = [5, 10, 15, 19, 25, 30];
const CLASS_IDS = Object.keys(CLASSES);

export function bossRow(bossId, bossLevel, level, profileId) {
  let wins = 0, tw = [], tl = [], pots = 0, runs = 0;
  for (const c of CLASS_IDS) for (let s = 0; s < N; s++) {
    const r = fight(buildHero(c, level, profileId, 11 + s * 7), [{ mobId: bossId, level: bossLevel }], 100 + s);
    runs++; pots += r.potionsUsed;
    if (r.win) { wins++; tw.push(r.t); } else tl.push(r.t);
  }
  return { wins, runs, pct: Math.round((100 * wins) / runs), tWin: Math.round(median(tw)), tLose: Math.round(median(tl)), pots: (pots / runs).toFixed(1) };
}

const out = { bosses: [], mobs: [] };
const isMain = /boss-check\.mjs$/.test(process.argv[1] ?? ''); // importado por outro script (ex.: testes), não roda a tabela
if (isMain) {
if (ONLY !== 'mobs') {
  console.log(`CHEFES — vitória% (mediana do tempo de vitória / de derrota em s), ${CLASS_IDS.length} classes × ${N} sementes por célula, esquiva ${DODGE}`);
  for (const [bid, bl] of BOSSES) {
    console.log(`\n${MOBS[bid].name} (${bid}, Nv ${bl})`);
    const levels = [...new Set([...LEVELS, Math.min(30, bl)])].sort((a, b) => a - b);
    for (const p of Object.keys(PROFILES)) {
      const cells = levels.map((l) => {
        const r = bossRow(bid, bl, l, p);
        out.bosses.push({ boss: bid, bossLevel: bl, level: l, profile: p, ...r });
        return `Nv${l}: ${String(r.pct).padStart(3)}% ${r.pct ? `${r.tWin}s` : `x${r.tLose}s`}`.padEnd(19);
      });
      console.log(`  ${p.padEnd(7)} ${cells.join(' ')}`);
    }
  }
}
if (ONLY !== 'boss') {
  console.log(`\nMOBS COMUNS — herói normal do MESMO nível contra 1/2/3 mobs da zona: vida média perdida (%) e tempo para vencer; "L" = derrota`);
  for (const [zid, z] of Object.entries(ZONES)) {
    if (!z.mobs) continue;
    const lvl = Math.round((z.level[0] + z.level[1]) / 2);
    for (const k of [1, 2, 3]) {
      const lost = [], ts = [];
      let losses = 0, runs = 0;
      for (const c of CLASS_IDS) for (let s = 0; s < N; s++) for (const [mobId] of z.mobs) {
        const r = fight(buildHero(c, lvl, 'normal', 21 + s * 5), Array.from({ length: k }, () => ({ mobId, level: lvl })), 300 + s, { maxT: 120 });
        runs++; if (!r.win) losses++; else { lost.push(100 * (1 - r.hpLeft)); ts.push(r.t); }
      }
      out.mobs.push({ zone: zid, level: lvl, count: k, lostPct: Math.round(lost.reduce((a, b) => a + b, 0) / (lost.length || 1)), t: Math.round(median(ts)), lossPct: Math.round((100 * losses) / runs) });
      const o = out.mobs.at(-1);
      console.log(`  ${zid.padEnd(8)} Nv${lvl} x${k}: perde ${String(o.lostPct).padStart(3)}% da vida · ${o.t}s · derrotas ${o.lossPct}%`);
    }
  }
}
if (JSON_OUT) console.log(JSON.stringify(out));
}
