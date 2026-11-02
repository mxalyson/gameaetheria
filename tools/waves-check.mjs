// Simulador da Arena das Ondas (solo) e do cooperativo (1-4 jogadores, 5 ondas + chefe), com a simulação REAL (World + IA).
// Uso: node tools/waves-check.mjs [--n 6] [--only solo|coop] [--profile normal|good] [--level 12]
// Usa os mesmos heróis-robô de tools/boss-check.mjs e a MESMA composição de ondas do jogo (core/economy.js: soloWaveSpec/coopWaveSpec).
import { makeRng } from '../public/src/core/rng.js';
import { World, makeHeroActor, makeMobActor, makeSpiritActor } from '../public/src/game/sim.js';
import { rivalIntent } from '../public/src/game/ai.js';
import { soloWaveSpec, coopWaveSpec, COOP_WAVES, WAVES } from '../public/src/core/economy.js';
import { buildHero } from './boss-check.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('n', 6)), ONLY = arg('only', ''), PROFILE = arg('profile', 'normal'), ONE_LEVEL = arg('level', '');
// --tune '{"solo":{"base":1},"coop":{"cap":10}}' sobrepõe WAVES só nesta execução (para experimentar)
const TUNE = JSON.parse(arg('tune', '{}'));
for (const k of Object.keys(TUNE)) Object.assign(WAVES[k], TUNE[k]);
const TRACE = process.argv.includes('--trace');
const DT = 1 / 60, DODGE = 0.6, WAVE_MAX_T = 150, CLASSES4 = ['warrior', 'mage', 'archer', 'cleric'];

// Simula uma sessão. mode 'solo' (ondas até cair, teto 25) ou 'coop' (5 ondas + chefe). Devolve { cleared, win }.
export function run(chars, seed, mode) {
  const w = new World('waves', { seed, visuals: false });
  const rng = makeRng(seed ^ 0x5bd1e995), drng = makeRng(seed ^ 0x77);
  const heroes = chars.map((c, i) => {
    const h = w.add(makeHeroActor(c, 550 + (i - (chars.length - 1) / 2) * 70, 560, 'player', 1));
    const sp = c.spirits?.find((s) => s.id === c.activeSpirit);
    if (sp) w.add(makeSpiritActor(sp, h));
    return { h, potions: c.potions ?? 0, potCd: 0 };
  });
  const avg = Math.max(1, Math.round(chars.reduce((s, c) => s + c.level, 0) / chars.length));
  const decided = new Map();
  const maxWave = mode === 'coop' ? COOP_WAVES : 25;
  let cleared = 0, win = false;
  for (let n = 1; n <= maxWave; n++) {
    // coop: caídos voltam com 50% a cada onda (como CoopRoom.revive)
    if (mode === 'coop') for (const x of heroes) if (x.h.dead) { x.h.dead = false; x.h.deadT = 0; x.h.hp = Math.round(x.h.maxHp * 0.5); x.h.buffs = []; x.h.stunT = 0; }
    const spec = mode === 'coop' ? coopWaveSpec(n, { avgLevel: avg, crew: chars.length }, rng) : soloWaveSpec(n, { level: avg }, rng);
    for (const f of spec.mobs) {
      const ang = rng.next() * Math.PI * 2;
      const m = w.add(makeMobActor(f.id, f.level, 550 + Math.cos(ang) * 430, 550 + Math.sin(ang) * 430, { elite: !!f.elite }));
      if (spec.hpMul !== 1) m.hp = m.maxHp = Math.round(m.maxHp * spec.hpMul);
      const live = heroes.filter((x) => !x.h.dead);
      m.ai.target = live[rng.int(0, live.length - 1)]?.h.id ?? null; m.ai.state = 'chase';
    }
    let t = 0;
    while (t < WAVE_MAX_T && heroes.some((x) => !x.h.dead) && w.actors.some((a) => a.kind === 'mob' && !a.dead)) {
      // monstros sem alvo vivo trocam para o jogador vivo mais próximo (como no servidor)
      for (const m of w.actors) {
        if (m.kind !== 'mob' || m.dead || (m.ai.target != null && !w.byId(m.ai.target)?.dead)) continue;
        let best = null, bd = Infinity;
        for (const x of heroes) if (!x.h.dead) { const d = Math.hypot(x.h.x - m.x, x.h.y - m.y); if (d < bd) { bd = d; best = x; } }
        m.ai.target = best?.h.id ?? null; m.ai.state = 'chase';
      }
      const intents = {};
      for (const x of heroes) {
        if (x.h.dead) continue;
        const it = rivalIntent(x.h, w, DT) ?? { mx: 0, my: 0, aimX: x.h.x, aimY: x.h.y };
        for (const tg of w.telegraphs) {
          if (!decided.has(tg)) decided.set(tg, drng.chance(DODGE));
          if (decided.get(tg) && tg.t >= 0.35 && Math.hypot(x.h.x - tg.x, x.h.y - tg.y) < tg.r + x.h.r + 25) { it.mx = x.h.x - tg.x || 1; it.my = x.h.y - tg.y; it.spd = 1; break; }
        }
        x.potCd = Math.max(0, x.potCd - DT);
        if (x.potions > 0 && x.potCd <= 0 && x.h.hp < x.h.maxHp * 0.45) { x.potions--; x.potCd = 8; w.heal(x.h, x.h.maxHp * 0.35); }
        intents[x.h.id] = it;
      }
      w.update(DT, intents); t += DT;
      if (w.events.length) w.events.length = 0;
    }
    if (TRACE) console.log(`    onda ${n} (${spec.mobs.map((m) => m.id).join(",")}) ${t.toFixed(0)}s hp ${heroes.map((x) => Math.round(100 * x.h.hp / x.h.maxHp) + "%/p" + x.potions).join(" ")}`);
    if (w.actors.some((a) => a.kind === 'mob' && !a.dead) || heroes.every((x) => x.h.dead)) break;
    cleared = n;
    if (n === maxWave) win = true;
    for (const x of heroes) if (!x.h.dead) w.heal(x.h, x.h.maxHp * WAVES[mode].restHeal);
  }
  return { cleared, win };
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const mixed = (level, k, seed, profile) => Array.from({ length: k }, (_, i) => buildHero(CLASSES4[(i + seed) % 4], level, profile, 11 + seed * 7 + i * 3));

if (/waves-check\.mjs$/.test(process.argv[1] ?? '')) {
  const levels = ONE_LEVEL ? [Number(ONE_LEVEL)] : [5, 10, 15, 20, 30];
  if (ONLY !== 'coop') {
    console.log(`SOLO — ondas vencidas (mediana [mín–máx]) até cair (teto 25), perfil ${PROFILE}; ${N * 4} execuções por célula`);
    for (const lv of levels) {
      const res = [], per = [];
      for (const c of CLASSES4) { const r = []; for (let s = 0; s < N; s++) r.push(run([buildHero(c, lv, PROFILE, 11 + s * 7)], 100 + s, 'solo').cleared); res.push(...r); per.push(c.slice(0, 3) + ' ' + median(r)); }
      console.log(`  Nv${String(lv).padEnd(3)} mediana ${median(res)} [${Math.min(...res)}–${Math.max(...res)}]  (${per.join(', ')})`);
    }
  }
  if (ONLY !== 'solo') {
    console.log(`\nCOOP — vitória% (5 ondas + chefe) e ondas médias vencidas; grupos de classes mistas, perfil ${PROFILE}; ${N * 4} execuções por célula`);
    for (const lv of levels) {
      const cells = [];
      for (const k of [1, 2, 4]) {
        let wins = 0, runs = 0, waves = 0;
        for (let s = 0; s < N * 4; s++) { const r = run(mixed(lv, k, s, PROFILE), 500 + s, 'coop'); runs++; waves += r.cleared; if (r.win) wins++; }
        cells.push(`${k}j: ${String(Math.round((100 * wins) / runs)).padStart(3)}% (ondas ${(waves / runs).toFixed(1)})`);
      }
      console.log(`  Nv${String(lv).padEnd(3)} ${cells.join('   ')}`);
    }
  }
}
