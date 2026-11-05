// Simulação do mundo: não toca no DOM nem no canvas. Recebe "intenções" por ator
// (mover, mirar, atacar, usar habilidade) — exatamente o que um cliente enviaria
// ao servidor no multiplayer — e produz estado + eventos.
import { makeRng } from '../core/rng.js';
import { computeHit } from '../core/combat.js';
import { computeStats, hasMastery } from '../core/stats.js';
import { spiritPower } from '../core/progression.js';
import { CLASSES } from '../data/classes.js';
import { skillOf, activeSpec, basicOf, lowHpBonus } from '../core/specs.js';
import { MOBS, MOB_CURVE, LEVEL_GAP, BOSS_SPAWN, BOSS_REPEAT, CAMP_RESPAWN } from '../data/mobs.js';
import { isSkillUnlocked, skillIdAt } from '../core/unlocks.js';
import { ZONES } from '../data/zones.js';
import { SPIRITS } from '../data/spirits.js';
import { RARITY } from '../data/items.js';
import { buildLayout, campSpawns, minibossSpawn } from './layout.js';
import { mobIntent, rivalIntent } from './ai.js';
import { blockChance, inFrontArc, BLOCK } from '../core/block.js';
import { nightMods, hourFromMs, zoneHasCycle } from '../core/daycycle.js';
import { MOUNT_MUL } from '../data/mounts.js';
import { ownedMounts, activeMount, mountProblem } from '../core/mounts.js';

const DAY_MODS = { aggroMul: 1, rewardMul: 1 };

const TAU = Math.PI * 2;
// Spirit coletor: fora de combate busca o drop mais próximo (até `range` px do dono) e o traz; `hand` = distância em que entrega ao dono.
export const SPIRIT_FETCH = { range: 260, speed: 320, grab: 16, hand: 30 };
// Máscara do que o spirit busca (opção do dono): bits 0-4 = raridade do item (comum..lendário), 5 = poções, 6 = essências. Padrão: tudo.
export const SPIRIT_PICK_ALL = 0b1111111;
export function spiritWants(mask, d) {
  if (d.kind === 'item') return ((mask >> (RARITY[d.item?.rarity]?.index ?? 0)) & 1) === 1;
  if (d.kind === 'potion') return ((mask >> 5) & 1) === 1;
  if (d.kind === 'essence') return ((mask >> 6) & 1) === 1;
  return true;
}
export const PICK_R = 44, PICK_DELAY = 0.4; // coleta de drop: distância (px) e tempo mínimo no chão (s) — iguais no jogo offline e no servidor
export const DROP_LIFE = 120, DROP_BLINK = 10, DROP_MAX = 120; // drops no chão: vida (s), piscar final (s) e teto por mundo
export const RUN_MUL = 1.3, RUN_COMBAT_GRACE = 3; // correr (sprint): +30% fora de combate (docs/gameplay/sistemas.md)
export const RUN_ZONES = new Set(['town', 'forest', 'plains', 'harbor', 'ruins', 'glacier', 'ember']); // nunca arena PvP, ondas nem Cripta (equilíbrio do PvP)
export const PVP_DAMAGE = 0.28; // duelos entre heróis mais longos e táticos (medido com npm run balance; 0,32 deixava Guerreiro/Arqueiro Nv30 com Maestria em 17–18 s)
let nextId = 1;

export const angDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

function baseActor(extra) {
  return {
    shield: 0, shieldT: 0, buffs: [], slowT: 0, slowAmt: 0, stunT: 0, dash: null,
    facing: Math.PI / 2, swing: 0, hitFlash: 0, lastDamaged: -99, lastCombat: -99,
    dead: false, deadT: 0, moving: false, walk: 0, speedMul: 1, ...extra,
  };
}

export function makeHeroActor(char, x, y, kind = 'player', team = 1) {
  const st = computeStats(char);
  return baseActor({
    kind, team, name: char.name, classId: char.classId, level: char.level, spec: activeSpec(char), x, y, r: 15,
    stats: st, hp: st.maxHp, maxHp: st.maxHp, cds: { basic: 0, s0: 0, s1: 0, s2: 0, s3: 0 },
    mastery: hasMastery(char), // Maestria concluída: libera a habilidade s3 (nível 25 + missão); o servidor lê isto do documento
    mounts: ownedMounts(char), mountId: activeMount(char), mounted: false, // montarias: posse e escolhida vêm do documento; `mounted` só muda em applyIntent (game/sim.js) e vai no snapshot
  });
}

export function makeMobActor(mobId, level, x, y, { elite = false, hostile = true, summoned = false } = {}) {
  const m = MOBS[mobId];
  const E = MOB_CURVE.elite;
  const C = m.boss ? { hp: 1, atk: 1 } : MOB_CURVE.common;
  const hp = Math.round(MOB_CURVE.hp(level) * m.hp * C.hp * (m.boss ? 1 : MOB_CURVE.earlyHp(level)) * (elite ? E.hp : 1));
  const power = MOB_CURVE.power(level) * m.atk * C.atk * (m.boss ? 1 : MOB_CURVE.early(level)) * (elite ? E.atk : 1);
  return baseActor({
    kind: 'mob', team: 2, mobId, name: (elite ? 'Elite: ' : '') + m.name, level, boss: !!m.boss, elite, summoned: summoned || undefined,
    x, y, r: m.size * (elite ? 1.3 : 1),
    stats: { power, def: MOB_CURVE.def(level) * (m.def ?? 1) * (elite ? E.def : 1), crit: 5, critMult: 1.5, maxHp: hp, moveSpeed: m.speed, atkSpeed: 1, lifesteal: 0 },
    hp, maxHp: hp, cds: { basic: 0.5, slam: 4, summon: 8 }, phase: 1, base: { power, moveSpeed: m.speed }, // base: valores da fase 1 (as fases do chefe multiplicam sobre eles)
    home: { x, y }, hostile, ai: { state: 'idle', t: 0, tx: x, ty: y, target: null },
  });
}

export function makeSpiritActor(sp, owner) {
  return baseActor({
    kind: 'spirit', team: owner.team, owner: owner.id, spiritType: sp.type, rarity: sp.rarity, level: sp.level, stage: sp.stage ?? 1,
    name: SPIRITS[sp.type].name, untargetable: true, x: owner.x - 20, y: owner.y - 10, r: 8, hp: 1, maxHp: 1,
    stats: { power: spiritPower(sp), crit: 5, critMult: 1.5, lifesteal: 0, def: 0 },
    cds: { basic: 1, s0: 1.5 }, bob: 0,
  });
}

// Ordenação de inteiros distintos por inserção (listas curtas: dezenas). Sem comparador/closure por chamada; mesmo resultado de sort((p, q) => p - q).
function sortInts(v) {
  for (let i = 1; i < v.length; i++) {
    const x = v[i]; let j = i - 1;
    while (j >= 0 && v[j] > x) { v[j + 1] = v[j]; j--; }
    v[j + 1] = x;
  }
}
const cellOf = (v, max, C) => Math.max(0, Math.min(max - 1, Math.floor(v / C)));

export class World {
  // visuals:false (servidor, simulador de balanceamento): nada de partículas/textos/efeitos é criado — só estado de jogo e eventos.
  // bossState: objeto de quem chama que sobrevive à troca de mundo (contador do ritual e recarga do chefe) — sem ele, cada visita recomeça.
  // clock: relógio absoluto em s (injetável nos testes) para recargas que sobrevivem à recriação do mundo (bossState.coolUntil / respawnUntil).
  constructor(zoneId, { seed, visuals = true, bossState, clock, night = false } = {}) {
    this.bossState = bossState ?? {};
    this.clock = clock ?? (() => Date.now() / 1000);
    this.visuals = visuals;
    // night: liga o bônus de risco noturno (aggro e recompensa); fica desligado por padrão para simulações/testes não dependerem da hora real. world.nightMods pode ser fixado nos testes.
    this.night = night;
    this.nightT = 0;
    this.nightMods = DAY_MODS;
    this.zoneId = zoneId;
    this.zone = ZONES[zoneId];
    this.layout = buildLayout(zoneId);
    this.actors = [];
    this.projectiles = [];
    this.areas = [];
    this.telegraphs = [];
    this.queue = []; // ações adiadas (mira do franco-atirador, rajadas em sequência): { t, src, fn }
    this.drops = [];
    this.spiritPick = SPIRIT_PICK_ALL; // o que o spirit busca (máscara; ver spiritWants)
    this.fx = [];
    this.particles = [];
    this.texts = [];
    this.events = [];
    this.time = 0;
    this.frozen = 0;
    this.respawnT = 0;
    this.bossT = 0;
    this.rng = makeRng(seed ?? (Date.now() & 0x7fffffff));
    this.vrng = makeRng(((seed ?? 1) ^ 0x5bd1e995) >>> 0); // RNG só dos efeitos visuais: nunca consome o sorteio do gameplay
  }

  add(a) { a.id = nextId++; if (a.kind === 'spirit') a.bob = (a.id % 7) * 1.3; this.actors.push(a); return a; }
  byId(id) { return this.actors.find((a) => a.id === id); }
  enemiesOf(a) { return this.actors.filter((o) => o.team !== a.team && !o.dead && !o.untargetable); }
  // Aliados vivos (heróis/rivais do mesmo time, sem o próprio ator nem spirits), opcionalmente dentro de um raio.
  alliesOf(a, maxR = Infinity) {
    return this.actors.filter((o) => o !== a && o.team === a.team && !o.dead && o.kind !== 'spirit' && o.kind !== 'mob' && Math.hypot(o.x - a.x, o.y - a.y) <= maxR);
  }
  nearestEnemy(a, maxR = Infinity) {
    let best = null, bd = maxR;
    for (const o of this.actors) {
      if (o.team === a.team || o.dead || o.untargetable) continue;
      const d = Math.hypot(o.x - a.x, o.y - a.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  buffVal(a, key) { let v = 0; for (const b of a.buffs) v += b[key] ?? 0; return v; }

  // ---------- população ----------
  populate(playerLevel) {
    if (!this.zone.mobs) return;
    for (let i = 0; i < this.zone.count; i++) this.spawnRandomMob(playerLevel);
    this.spawnCamps(playerLevel);
    this.spawnMiniboss();
  }

  // Acampamentos fixos (zones.js › camps); `only` = refaz um só acampamento.
  spawnCamps(playerLevel, only = null) {
    for (const s of campSpawns(this.zoneId, playerLevel)) {
      if (only && s.camp !== only) continue;
      const a = this.add(makeMobActor(s.mobId, s.level, s.x, s.y, { elite: s.elite, hostile: s.hostile }));
      a.camp = s.camp;
    }
  }

  // Mini-chefe: mob existente, mais forte e maior (elite já dá vida ×3, dano ×1,3 e raio ×1,3; o resto se ajusta aqui).
  spawnMiniboss() {
    const m = minibossSpawn(this.zoneId); if (!m) return;
    const a = makeMobActor(m.mobId, m.level, m.x, m.y, { elite: true, hostile: true });
    a.miniboss = true; a.name = m.name; a.r = MOBS[m.mobId].size * m.sizeMul;
    a.stats.maxHp = a.maxHp = Math.round(a.maxHp * m.hpMul / 3); a.hp = a.maxHp;
    a.stats.power *= m.powerMul / 1.3;
    this.add(a);
  }

  freePoint(avoid = [], minDist = 0) {
    const z = this.zone;
    for (let i = 0; i < 60; i++) {
      const x = this.rng.range(120, z.w - 120), y = this.rng.range(120, z.h - 120);
      if (this.layout.obstacles.some((o) => (o.w ? x > o.x - 40 && x < o.x + o.w + 40 && y > o.y - 40 && y < o.y + o.h + 40 : Math.hypot(x - o.x, y - o.y) < o.r + 30))) continue;
      if ((z.portals ?? []).some((p) => Math.hypot(x - p.x, y - p.y) < 260 || Math.hypot(x - p.tx, y - p.ty) < 260)) continue;
      if (avoid.some((a) => Math.hypot(x - a.x, y - a.y) < minDist)) continue;
      return { x, y };
    }
    return null;
  }

  spawnRandomMob(playerLevel, avoid = []) {
    const z = this.zone;
    const pt = this.freePoint(avoid, 520);
    if (!pt) return null;
    const id = this.rng.weighted(z.mobs);
    const hi = z.scale ? Math.max(z.level[1], Math.min(30, playerLevel)) : z.level[1];
    // Mais forte quanto mais a leste.
    const lvl = Math.round(z.level[0] + (hi - z.level[0]) * (pt.x / z.w) + this.rng.range(-0.6, 0.6));
    // Agressividade: cada mob nasce hostil (ataca ao ver o jogador) ou passivo (só revida) conforme a zona e a índole da espécie; sorteio por posição, sem gastar o RNG.
    const roll = (Math.abs(Math.round(pt.x * 7 + pt.y * 13)) % 100) / 100;
    const hostile = roll < (z.hostile ?? 1) * (MOBS[id].temper ?? 1);
    return this.add(makeMobActor(id, Math.max(1, lvl), pt.x, pt.y, { elite: this.rng.chance(0.07), hostile }));
  }

  updateSpawns(dt, player) {
    const z = this.zone;
    if (!z.mobs) return;
    const alive = this.actors.filter((a) => a.kind === 'mob' && !a.dead && !a.boss && !a.camp && !a.miniboss && !a.summoned).length;
    this.respawnT -= dt;
    if (alive < z.count && this.respawnT <= 0) {
      this.spawnRandomMob(player.level, [player]);
      this.respawnT = 3;
    }
    this.campT ??= {};
    for (const c of z.camps ?? []) { // o acampamento todo volta CAMP_RESPAWN s depois do último morto
      if (this.actors.some((a) => a.camp === c.id && !a.dead)) { this.campT[c.id] = 0; continue; }
      this.campT[c.id] = (this.campT[c.id] ?? 0) + dt;
      if (this.campT[c.id] > CAMP_RESPAWN) { this.actors = this.actors.filter((a) => a.camp !== c.id); this.spawnCamps(player.level, c.id); this.campT[c.id] = 0; }
    }
    if (z.miniboss && !this.actors.some((a) => a.miniboss && !a.dead)) {
      this.miniT = (this.miniT ?? z.miniboss.respawn) - dt;
      if (this.miniT <= 0) { this.spawnMiniboss(); this.miniT = z.miniboss.respawn; }
    }
    if (z.boss && !this.actors.some((a) => a.boss && !a.dead)) {
      const cfg = BOSS_SPAWN[z.boss.id] ?? BOSS_SPAWN.default, st = this.bossState;
      if (cfg.ritual) {
        st.cool = this.coolLeft(st, dt);
        if (st.omenT > 0 && (st.omenT -= dt) <= 0) { st.omenT = 0; this.spawnBoss(true); }
        else if (!st.omenT && st.cool <= 0 && (st.go || (st.progress ?? 0) >= cfg.ritual.need)) {
          st.omenT = cfg.ritual.omen; st.go = false; st.progress = 0;
          this.events.push({ type: 'boss_warn', stage: 'omen', mobId: z.boss.id, name: MOBS[z.boss.id].name, x: z.boss.x, y: z.boss.y, t: this.time });
          this.events.push({ type: 'telegraph', x: z.boss.x, y: z.boss.y, r: 220, delay: cfg.ritual.omen, color: MOBS[z.boss.id].color });
        }
      } else {
        this.bossT -= dt;
        if (this.bossT <= 0 && this.clock() >= (this.bossState.respawnUntil ?? 0)) { this.spawnBoss(false); this.bossT = cfg.respawn; }
      }
    }
  }

  spawnBoss(announce) {
    const b = this.zone.boss;
    const m = this.add(makeMobActor(b.id, b.level, b.x, b.y));
    if (announce) this.events.push({ type: 'boss_warn', stage: 'arrive', mobId: b.id, name: MOBS[b.id].name, x: b.x, y: b.y, t: this.time });
    return m;
  }

  // Progresso do ritual do chefe da zona para a interface ("Ritual 23/40"); null se o chefe reaparece por tempo.
  get bossProgress() {
    const id = this.zone.boss?.id, cfg = id && BOSS_SPAWN[id];
    if (!cfg?.ritual) return null;
    const st = this.bossState;
    return { have: Math.min(cfg.ritual.need, Math.floor(st.progress ?? 0)), need: cfg.ritual.need, cool: Math.ceil(this.coolLeft(st)), omen: (st.omenT ?? 0) > 0, alive: this.actors.some((a) => a.boss && !a.dead) };
  }

  // Recarga restante do ritual (s). Com `coolUntil` (relógio absoluto) corre mesmo fora da zona; sem ele (estado antigo), cai para o contador por tick (`dt`).
  coolLeft(st, dt = 0) {
    if (st.coolUntil != null) return Math.max(0, st.coolUntil - this.clock());
    return Math.max(0, (st.cool ?? 0) - dt);
  }

  // Abate de chefe: guarda o horário (relógio absoluto) e reduz o loot de abates repetidos do mesmo chefe em 30 min (t.lootMul lido por rollMobLoot).
  noteBossKill(t, cfg, st) {
    const now = this.clock(), R = BOSS_REPEAT;
    const recent = (st.kills ?? []).filter((x) => now - x < R.window);
    t.lootMul = Math.max(R.floor, R.mul ** recent.length);
    recent.push(now);
    st.kills = recent;
    if (!cfg.ritual) st.respawnUntil = now + cfg.respawn;
  }

  // Abate de mob comum/elite alimenta o ritual; a morte do chefe inicia a recarga.
  onMobDeath(t) {
    const id = this.zone.boss?.id, cfg = id && BOSS_SPAWN[id], st = this.bossState;
    if (t.boss && !t.summoned) this.noteBossKill(t, cfg ?? BOSS_SPAWN.default, st);
    if (!cfg?.ritual || t.summoned) return;
    if (t.boss) { st.cool = cfg.cooldown; st.coolUntil = this.clock() + cfg.cooldown; st.progress = 0; st.elites = 0; return; }
    if (st.omenT > 0 || this.actors.some((a) => a.boss && !a.dead)) return;
    const R = cfg.ritual, cooling = this.coolLeft(st) > 0;
    // durante a recarga o contador já anda (nada se perde), mas para em need-1: o chefe só surge quando a recarga acaba
    st.progress = Math.min(cooling ? R.need - 1 : R.need, (st.progress ?? 0) + (t.elite ? R.eliteWeight : 1));
    if (t.elite && !cooling) {
      st.elites = (st.elites ?? 0) + 1;
      if (st.progress >= R.need * R.earlyAt && this.rng.chance(Math.min(0.5, R.earlyChance * st.elites))) st.go = true;
    }
  }

  // ---------- loop ----------
  update(dt, intents = {}) {
    if (this.night && (this.nightT -= dt) <= 0) { this.nightT = 5; this.nightMods = zoneHasCycle(this.zone) ? nightMods(hourFromMs(this.clock() * 1000)) : DAY_MODS; }
    this.time += dt;
    if (this.frozen > 0) { this.frozen -= dt; this.updateVisuals(dt); return; }
    let prune = false;
    for (const a of this.actors) {
      if (a.dead) { a.deadT += dt; if (a.deadT > 0.6 && a.kind !== 'player') prune = true; continue; }
      this.tickTimers(a, dt);
      if (a.kind === 'spirit') { this.updateSpirit(a, dt); continue; }
      const intent = intents[a.id] ?? (a.kind === 'mob' ? mobIntent(a, this, dt) : a.kind === 'rival' ? rivalIntent(a, this, dt) : null);
      if (intent) this.applyIntent(a, intent, dt);
    }
    this.separate();
    this.updateProjectiles(dt);
    this.updateAreas(dt);
    this.updateQueue(dt);
    this.updateTelegraphs(dt);
    if (prune) this.actors = this.actors.filter((a) => !(a.dead && a.deadT > 0.6 && a.kind !== 'player'));
    this.updateVisuals(dt);
    if (this.events.length > 2000) this.events.splice(0, this.events.length - 2000);
  }

  tickTimers(a, dt) {
    for (const k in a.cds) a.cds[k] = Math.max(0, a.cds[k] - dt);
    const bs = a.buffs; // compactação no lugar: sem alocar um array novo por ator por tick
    if (bs.length) { let w = 0; for (let i = 0; i < bs.length; i++) { const b = bs[i]; if ((b.t -= dt) > 0) bs[w++] = b; } bs.length = w; }
    if (a.shieldT > 0) { a.shieldT -= dt; if (a.shieldT <= 0) a.shield = 0; }
    a.slowT = Math.max(0, a.slowT - dt);
    a.stunT = Math.max(0, a.stunT - dt);
    if (a.markT > 0) { a.markT -= dt; if (a.markT <= 0) a.markAmt = 0; } // Marca (Martelo Sagrado, Marca da Pena...)
    if (a.chg) for (const k in a.chg) { // Rolamento Duplo: janela da 2ª esquiva; sem usar, a recarga cheia começa quando a janela fecha
      const c = a.chg[k];
      if (c && (c.t -= dt) <= 0) { a.cds[k] = Math.max(a.cds[k], c.cd); a.chg[k] = null; }
    }
    const bn = a.burn;
    if (bn) { // queimadura do Meteoro Arcano
      bn.t -= dt; bn.next -= dt;
      if (bn.next <= 0) { bn.next += bn.every; this.damage(bn.src, a, bn.mult, { dot: true }); }
      if (bn.t <= 0 || a.dead) a.burn = null;
    }
    a.hitFlash = Math.max(0, a.hitFlash - dt);
    a.swing = Math.max(0, a.swing - dt);
  }

  // Montaria (docs/roadmap/montaria.md, decisão 0018). `it.mount` = pedido (true monta, false desmonta, ausente mantém). Montar exige posse, zona de farm (RUN_ZONES), fora de combate (3 s) e sem atacar/conjurar;
  // desmonta sozinho ao atacar, conjurar, tomar/causar dano (lastCombat), cair, ser atordoado ou sair da zona permitida. Devolve true se o quadro deve IGNORAR ataque/skill (tocar neles só desmonta).
  stepMount(a, it) {
    if (a.kind !== 'player') return false;
    const acting = !!it.attack || it.cast != null;
    if (a.mounted && (acting || a.dead || a.stunT > 0 || !RUN_ZONES.has(this.zoneId) || this.time - a.lastCombat < RUN_COMBAT_GRACE)) { a.mounted = false; this.events.push({ type: 'dismount', actor: a }); return acting; }
    if (it.mount === false) a.mounted = false;
    else if (it.mount === true && !a.mounted && !acting) {
      const why = mountProblem(a, { zoneOk: RUN_ZONES.has(this.zoneId), time: this.time });
      if (why) a.mountDenied = why; else { a.mounted = true; a.mountDenied = null; }
    }
    return false;
  }

  applyIntent(a, it, dt) {
    if (this.stepMount(a, it)) it = { ...it, attack: false, cast: null }; // montado: tocar em ataque/habilidade só desmonta, sem ação
    if (a.stunT > 0) {
      a.moving = false;
      // só a Intervenção Divina (`castStunned`) rompe o atordoamento: remove o efeito e é lançada na hora
      if (it.cast === 3 && a.cds.s3 <= 0 && isSkillUnlocked(a, 3) && skillOf(a.classId, a.spec, skillIdAt(a.classId, 3, a.spec)).castStunned) this.castSkill(a, 3, it.aimX ?? a.x, it.aimY ?? a.y);
      return;
    }
    if (a.dash) { this.stepDash(a, dt); return; }
    if (it.aimX != null) a.facing = Math.atan2(it.aimY - a.y, it.aimX - a.x);
    let mx = it.mx ?? 0, my = it.my ?? 0;
    const len = Math.hypot(mx, my);
    if (len > 0.01) {
      mx /= len; my /= len;
      // Correr: só em zonas de farm/cidade/instância PvE, fora de combate (3 s) e sem atacar/conjurar neste quadro; o servidor ignora o pedido do cliente se algo disso falhar
      a.running = !a.mounted && it.run === true && a.kind === 'player' && RUN_ZONES.has(this.zoneId) && !it.attack && it.cast == null && this.time - a.lastCombat >= RUN_COMBAT_GRACE; // montado: a montaria SUBSTITUI o correr (não acumula)
      const sp = a.stats.moveSpeed * a.speedMul * (a.mounted ? MOUNT_MUL : a.running ? RUN_MUL : 1) * (it.spd ?? 1) * (a.slowT > 0 ? 1 - a.slowAmt : 1) * (a.buffs.length ? 1 + this.buffVal(a, 'move') : 1);
      this.moveActor(a, mx * sp * dt, my * sp * dt);
      a.moving = true;
      a.walk += dt * sp / 28;
      a.stillT = 0;
    } else { a.moving = false; a.running = false; a.stillT = (a.stillT ?? 0) + dt; } // parado encarando: bônus de bloqueio do escudo
    if (it.attack && a.cds.basic <= 0) this.basicAttack(a, it.aimX, it.aimY);
    if (it.cast != null) this.castSkill(a, it.cast, it.aimX, it.aimY);
  }

  // ---------- movimento / colisão ----------
  moveActor(a, dx, dy) { a.x += dx; a.y += dy; this.collide(a); }

  collide(a) {
    const z = this.zone;
    if (z.circle) {
      const cx = z.w / 2, cy = z.h / 2, R = z.radius - a.r;
      const d = Math.hypot(a.x - cx, a.y - cy);
      if (d > R) { a.x = cx + (a.x - cx) / d * R; a.y = cy + (a.y - cy) / d * R; }
    } else {
      a.x = Math.max(a.r, Math.min(z.w - a.r, a.x));
      a.y = Math.max(a.r, Math.min(z.h - a.r, a.y));
    }
    // grade espacial: só os obstáculos perto do ator (zonas têm centenas; a busca linear custava ~55% do servidor de exploração). Mesma ordem de resolução.
    for (const o of this.nearObstacles(a)) {
      if (o.w) {
        const cx = Math.max(o.x, Math.min(o.x + o.w, a.x)), cy = Math.max(o.y, Math.min(o.y + o.h, a.y));
        const dx = a.x - cx, dy = a.y - cy, d = Math.hypot(dx, dy);
        if (d < a.r) {
          if (d > 0.001) { a.x = cx + dx / d * a.r; a.y = cy + dy / d * a.r; }
          else a.y = o.y + o.h + a.r;
        }
      } else {
        const dx = a.x - o.x, dy = a.y - o.y, d = Math.hypot(dx, dy), min = o.r + a.r;
        if (d < min && d > 0.001) { a.x = o.x + dx / d * min; a.y = o.y + dy / d * min; }
      }
    }
  }

  nearObstacles(a) {
    const L = this.layout;
    const obs = L.obstacles;
    if (obs.length < 24) return obs;
    let g = L.grid;
    if (!g) { // constrói uma vez por layout (o layout é compartilhado entre mundos da mesma zona)
      const C = 128, cols = Math.ceil(this.zone.w / C) + 1, rows = Math.ceil(this.zone.h / C) + 1, cells = Array.from({ length: cols * rows }, () => []);
      obs.forEach((o, i) => {
        const x0 = o.w ? o.x : o.x - o.r, x1 = o.w ? o.x + o.w : o.x + o.r, y0 = o.w ? o.y : o.y - o.r, y1 = o.w ? o.y + o.h : o.y + o.r;
        for (let cy = Math.max(0, Math.floor(y0 / C)); cy <= Math.min(rows - 1, Math.floor(y1 / C)); cy++) for (let cx = Math.max(0, Math.floor(x0 / C)); cx <= Math.min(cols - 1, Math.floor(x1 / C)); cx++) cells[cy * cols + cx].push(i);
      });
      g = L.grid = { C, cols, rows, cells, out: [], seen: new Int32Array(obs.length), stamp: 0 };
    }
    const m = a.r * 2 + 2; // o ator pode ser empurrado até ~a.r por um obstáculo: consulta com folga
    const cx0 = Math.max(0, Math.floor((a.x - m) / g.C)), cx1 = Math.min(g.cols - 1, Math.floor((a.x + m) / g.C));
    const cy0 = Math.max(0, Math.floor((a.y - m) / g.C)), cy1 = Math.min(g.rows - 1, Math.floor((a.y + m) / g.C));
    const ids = (g.ids ??= []); ids.length = 0;
    let st = ++g.stamp;
    if (st > 0x7ffffff0) { g.seen.fill(0); g.stamp = st = 1; } // B30: Int32Array não pode estourar; recomeça com a lista limpa
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) for (const i of g.cells[cy * g.cols + cx]) if (g.seen[i] !== st) { g.seen[i] = st; ids.push(i); }
    sortInts(ids); // ordem crescente = a da busca linear (índices únicos: qualquer ordenação dá o mesmo resultado)
    const out = g.out; out.length = 0;
    for (const i of ids) out.push(obs[i]);
    return out;
  }

  // Empurra atores sobrepostos. Poucos atores: todos os pares. Muitos: grade de células de 128 px (maior diâmetro ~120), só vizinhos,
  // visitados em ordem crescente de índice — mesmo resultado do todos-contra-todos (testado), sem o custo O(n²).
  separate() {
    const list = (this._sep ??= []);
    list.length = 0;
    for (const a of this.actors) if (!a.dead && a.kind !== 'spirit') list.push(a);
    const n = list.length;
    if (n < 24) {
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) this.pushApart(list[i], list[j]);
      return;
    }
    const C = 128, cols = Math.ceil(this.zone.w / C) + 2, rows = Math.ceil(this.zone.h / C) + 2;
    let g = this._sepGrid;
    if (!g || g.cols !== cols || g.rows !== rows) g = this._sepGrid = { cols, rows, head: new Int32Array(cols * rows), next: new Int32Array(64), cand: [] };
    if (g.next.length < n) g.next = new Int32Array(n * 2);
    g.head.fill(-1);
    for (let i = n - 1; i >= 0; i--) { // inserção de trás para frente: cada lista fica em ordem crescente de índice
      const k = cellOf(list[i].y, rows, C) * cols + cellOf(list[i].x, cols, C);
      g.next[i] = g.head[k]; g.head[k] = i;
    }
    const cand = g.cand;
    for (let i = 0; i < n; i++) {
      const a = list[i], cx = cellOf(a.x, cols, C), cy = cellOf(a.y, rows, C);
      cand.length = 0;
      for (let yy = Math.max(0, cy - 1); yy <= Math.min(rows - 1, cy + 1); yy++) {
        for (let xx = Math.max(0, cx - 1); xx <= Math.min(cols - 1, cx + 1); xx++) {
          for (let j = g.head[yy * cols + xx]; j !== -1; j = g.next[j]) if (j > i) cand.push(j);
        }
      }
      if (cand.length > 1) sortInts(cand);
      for (let c = 0; c < cand.length; c++) this.pushApart(a, list[cand[c]]);
    }
  }

  pushApart(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
    if (d < min && d > 0.001) {
      const push = (min - d) / 2, nx = dx / d, ny = dy / d;
      const wa = a.boss ? 0.1 : 1, wb = b.boss ? 0.1 : 1;
      a.x -= nx * push * wa; a.y -= ny * push * wa;
      b.x += nx * push * wb; b.y += ny * push * wb;
    }
  }

  // ---------- ataques ----------
  basicSpec(a) {
    if (a.kind !== 'mob') return a.spec ? basicOf(a.classId, a.spec) : CLASSES[a.classId].basic; // com os ajustes da especialização (Franco-atirador/Pistoleiro)
    const m = MOBS[a.mobId];
    return m.kind === 'ranged'
      ? { kind: 'projectile', speed: m.projSpeed, range: m.range + 60, cd: m.cd, mult: 1, color: m.projColor, radius: a.boss ? 10 : 6 }
      : { kind: 'melee', range: m.range, arc: 1.7, cd: m.cd, mult: 1, color: '#ffffff' };
  }

  basicAttack(a, ax, ay) {
    const b = this.basicSpec(a);
    a.cds.basic = b.cd / ((a.stats.atkSpeed || 1) * (a.buffs.length ? 1 + this.buffVal(a, 'as') : 1));
    a.swing = 0.25;
    a.lastCombat = this.time;
    const ang = Math.atan2(ay - a.y, ax - a.x);
    a.facing = ang;
    this.events.push({ type: 'swing', actor: a, ang, t: this.time });
    if (b.kind === 'melee') {
      this.addFx({ type: 'slash', x: a.x, y: a.y, ang, arc: b.arc, r: b.range + (a.kind === 'mob' ? a.r * 0.5 : 0), t: 0, life: 0.2, color: b.color });
      for (const e of this.enemiesOf(a)) {
        const d = Math.hypot(e.x - a.x, e.y - a.y);
        if (d <= b.range + e.r + (a.kind === 'mob' ? a.r * 0.5 : 0) && Math.abs(angDiff(Math.atan2(e.y - a.y, e.x - a.x), ang)) <= b.arc / 2 + 0.25) {
          this.damage(a, e, b.mult);
        }
      }
    } else {
      this.spawnProjectile(a, ang, b);
    }
  }

  spawnProjectile(a, ang, spec, from = a) { // from: origem do tiro (o espectro do Pacto Sombrio atira da posição dele, com o dano do dono)
    const off = from === a ? a.r + 4 : 6;
    this.projectiles.push({
      x: from.x + Math.cos(ang) * off, y: from.y + Math.sin(ang) * off,
      vx: Math.cos(ang) * spec.speed, vy: Math.sin(ang) * spec.speed, ang,
      team: a.team, src: a, mult: spec.mult, radius: spec.radius ?? 6, color: spec.color ?? '#fff',
      range: spec.range ?? 500, traveled: 0, pierce: !!spec.pierce, explode: spec.explode ?? 0,
      stun: spec.stun ?? 0, burn: spec.burn ?? null, mark: spec.mark ?? null, hit: new Set(), dead: false, only: spec.only ?? null, // only: acerta só este alvo (tiro de spirit não machuca quem está no caminho)
    });
  }

  castSkill(a, idx, ax, ay) {
    const key = 's' + idx;
    if (a.cds[key] > 0 || a.dash) return false;
    if (!isSkillUnlocked(a, idx)) return false; // habilidade ainda não aprendida (a de Maestria exige nível 25 + missão): a intenção é ignorada (vale para cliente, servidor e rival)
    const id = skillIdAt(a.classId, idx, a.spec); // o kit da especialização (nível 15+) ocupa os slots
    if (!id) return false;
    const s = skillOf(a.classId, a.spec, id); // com os ajustes da especialização
    if (s.cost?.hp) { // habilidade que custa vida (Frenesi, Pacto Sombrio): nunca mata quem a usa
      const pay = a.maxHp * s.cost.hp;
      if (a.hp <= pay + 1) return false;
      a.hp -= pay;
      this.addText({ x: a.x, y: a.y - a.r - 14, t: 0, life: 0.9, text: '-' + Math.round(pay), size: 15, color: '#ff6b6b' });
    }
    a.cds[key] = s.cd;
    if (s.twice) { // duas cargas (Rolamento Duplo): a 1ª recarrega em "gap"; a 2ª (dentro da janela) inicia a recarga cheia
      const c = (a.chg ??= {});
      if (c[key] && c[key].t > 0) c[key] = null;
      else { c[key] = { t: s.twice.window, cd: s.cd }; a.cds[key] = s.twice.gap; }
    }
    a.swing = 0.3;
    a.lastCombat = this.time;
    const ang = Math.atan2(ay - a.y, ax - a.x);
    const cos = Math.cos(ang), sin = Math.sin(ang);
    a.facing = ang;
    let castTarget = null; // ground_aoe: onde a área cai (o cliente desenha o efeito no mesmo ponto)
    switch (s.kind) {
      case 'aoe_self':
        this.addFx({ type: 'ring', x: a.x, y: a.y, r: s.radius, color: s.color, t: 0, life: 0.45 });
        for (const e of this.enemiesOf(a)) {
          if (Math.hypot(e.x - a.x, e.y - a.y) <= s.radius + e.r) { this.damage(a, e, s.mult, { slow: s.slow, slowDur: s.slowDur, stun: s.stun }); if (s.burn) this.applyBurn(a, e, s.burn); if (s.mark) this.applyMark(e, s.mark); }
        }
        if (s.heal) {
          this.heal(a, a.maxHp * s.heal);
          if (s.allyHeal) for (const al of this.alliesOf(a, s.radius)) this.heal(al, al.maxHp * s.heal * s.allyHeal);
        }
        this.burst(a.x, a.y, s.color, 22, 220);
        break;
      case 'dash': {
        const dir = s.back ? -1 : 1; // Recuo Tático: impulso para trás
        const dist = s.jump ? Math.max(90, Math.min(s.dist, Math.hypot(ax - a.x, ay - a.y))) : s.dist; // Salto Brutal: cai no cursor (até o alcance)
        a.dash = { vx: cos * s.speed * dir, vy: sin * s.speed * dir, t: dist / s.speed, mult: s.mult, stun: s.stun, hit: new Set(), invuln: !!s.invuln, color: s.color, slam: s.slam ?? null, knock: s.knock ?? 0 };
        if (s.aegis) for (const al of this.alliesOf(a, s.aegis.range)) { // Investida do Paladino: escudo curto para aliados por perto
          al.shield = Math.max(al.shield, al.maxHp * s.aegis.shield); al.shieldT = Math.max(al.shieldT, 4);
          this.events.push({ type: 'status', actor: al, kind: 'shield', dur: 4, skill: id, from: a, t: this.time });
        }
        if (s.buff) { // Fúria do Colosso: o reforço de dano dura desde o lançamento
          a.buffs.push({ id, t: s.dur, ...s.buff });
          this.events.push({ type: 'status', actor: a, kind: 'buff', dur: s.dur, skill: id, t: this.time });
        }
        break;
      }
      case 'meteor': { // área telegrafada: o impacto cai depois de `delay` s e queima (resolvido em updateTelegraphs)
        const d = Math.min(s.range, Math.hypot(ax - a.x, ay - a.y));
        castTarget = { x: a.x + cos * d, y: a.y + sin * d };
        this.telegraphs.push({ x: castTarget.x, y: castTarget.y, r: s.radius, t: 0, delay: s.delay, src: a, mult: s.mult, color: s.color, stun: s.stun, burn: s.burn ?? null, mark: s.mark ?? null, slow: s.slow, slowDur: s.slowDur, always: true });
        this.events.push({ type: 'telegraph', x: castTarget.x, y: castTarget.y, r: s.radius, delay: s.delay, color: s.color });
        break;
      }
      case 'divine': { // cura grande + escudo em quem está perto e remove atordoamento/lentidão (em PvE só o herói)
        const who = [a, ...this.alliesOf(a, s.radius)];
        for (const t of who) {
          const self = t === a;
          t.stunT = 0; t.slowT = 0;
          this.heal(t, t.maxHp * s.heal * (self ? 1 : s.allyHeal));
          if (s.shieldPct) {
            t.shield = Math.max(t.shield, t.maxHp * s.shieldPct * (self ? 1 : s.allyHeal)); t.shieldT = Math.max(t.shieldT, s.dur);
            this.events.push({ type: 'status', actor: t, kind: 'shield', dur: s.dur, skill: id, t: this.time });
          }
          if (s.buff) t.buffs.push({ id, t: s.dur, ...s.buff }); // Intervenção Celestial: -50% de dano por "dur"
          if (!self) this.addFx({ type: 'ring', x: t.x, y: t.y, r: 50, color: s.color, t: 0, life: 0.6, follow: t });
        }
        this.addFx({ type: 'ring', x: a.x, y: a.y, r: s.radius, color: s.color, t: 0, life: 0.7 });
        this.burst(a.x, a.y, s.color, 30, 240);
        if (s.mult) for (const e of this.enemiesOf(a)) if (Math.hypot(e.x - a.x, e.y - a.y) <= s.radius + e.r) this.damage(a, e, s.mult, s.stun ? { stun: s.stun } : undefined);
        break;
      }
      case 'buff':
        a.buffs.push({ id, t: s.dur, ...s.buff });
        if (s.buff.shieldPct) { a.shield = a.maxHp * s.buff.shieldPct; a.shieldT = s.dur; }
        this.events.push({ type: 'status', actor: a, kind: s.buff.shieldPct ? 'shield' : 'buff', dur: s.dur, skill: id, t: this.time });
        if (s.allyBuff) for (const al of this.alliesOf(a, s.allyBuff)) { // Grito do Paladino: o reforço também vale para aliados por perto
          al.buffs.push({ id, t: s.dur, ...s.buff });
          this.events.push({ type: 'status', actor: al, kind: 'buff', dur: s.dur, skill: id, from: a, t: this.time });
        }
        if (s.allyShield) {
          let best = null, bd = s.allyRange;
          for (const al of this.alliesOf(a, s.allyRange)) { const d = Math.hypot(al.x - a.x, al.y - a.y); if (d <= bd) { bd = d; best = al; } }
          if (best) {
            best.shield = Math.max(best.shield, best.maxHp * s.buff.shieldPct * s.allyShield); best.shieldT = s.dur;
            this.events.push({ type: 'status', actor: best, kind: 'shield', dur: s.dur, skill: id, from: a, t: this.time });
            this.addFx({ type: 'ring', x: best.x, y: best.y, r: 50, color: s.color, t: 0, life: 0.5, follow: best });
          }
        }
        if (s.groupShield) for (const al of this.alliesOf(a, s.groupShield.range)) { // Escudo Divino Reforçado: todos os aliados por perto
          al.shield = Math.max(al.shield, al.maxHp * s.buff.shieldPct * s.groupShield.pct); al.shieldT = Math.max(al.shieldT, s.dur);
          this.events.push({ type: 'status', actor: al, kind: 'shield', dur: s.dur, skill: id, from: a, t: this.time });
          this.addFx({ type: 'ring', x: al.x, y: al.y, r: 50, color: s.color, t: 0, life: 0.5, follow: al });
        }
        this.addFx({ type: 'ring', x: a.x, y: a.y, r: 60, color: s.color, t: 0, life: 0.5, follow: a });
        this.burst(a.x, a.y, s.color, 16, 120);
        break;
      case 'projectile': {
        const fire = () => {
          if (s.volley > 1) { // rajada em leque (Pistoleiro)
            for (let i = 0; i < s.volley; i++) this.spawnProjectile(a, ang + (i - (s.volley - 1) / 2) * (s.spread ?? 0.15), s);
          } else this.spawnProjectile(a, ang, s);
        };
        if (s.windup) { // mira carregada (Franco-atirador): anda devagar enquanto mira; atordoamento cancela o tiro
          a.slowT = Math.max(a.slowT, s.windup); a.slowAmt = Math.max(a.slowAmt, 0.6);
          this.queue.push({ t: s.windup, src: a, fn: fire });
        } else fire();
        for (let w = 1; w < (s.waves ?? 1); w++) this.queue.push({ t: w * s.waveEvery, src: a, fn: fire }); // Saraivada: rajadas em sequência
        break;
      }
      case 'ground_aoe': {
        const d = Math.min(s.range, Math.hypot(ax - a.x, ay - a.y));
        castTarget = { x: a.x + cos * d, y: a.y + sin * d };
        this.areas.push({ x: a.x + cos * d, y: a.y + sin * d, r: s.radius, ticks: s.ticks, interval: s.interval, next: 0.2, src: a, mult: s.mult, color: s.color, t: 0, slow: s.slow, slowDur: s.slowDur, leech: s.leech });
        break;
      }
      case 'cone': { // golpe em leque à frente (Machadada em Arco, Chama Purificadora)
        this.addFx({ type: 'slash', x: a.x, y: a.y, ang, arc: s.arc, r: s.range, t: 0, life: 0.28, color: s.color });
        this.burst(a.x + cos * s.range * 0.6, a.y + sin * s.range * 0.6, s.color, 16, 200);
        for (const e of this.enemiesOf(a)) {
          if (Math.hypot(e.x - a.x, e.y - a.y) <= s.range + e.r && Math.abs(angDiff(Math.atan2(e.y - a.y, e.x - a.x), ang)) <= s.arc / 2 + 0.15) {
            this.damage(a, e, s.mult, { stun: s.stun });
            if (s.burn && !e.dead) this.applyBurn(a, e, s.burn);
            if (s.mark && !e.dead) this.applyMark(e, s.mark);
          }
        }
        break;
      }
      case 'channel': // Drenar Vida: canaliza no inimigo mais próximo e devolve parte do dano como vida
        this.areas.push({ kind: 'channel', x: a.x, y: a.y, r: s.range, ticks: s.ticks, interval: s.interval, next: 0.15, src: a, follow: a, mult: s.mult, color: s.color, t: 0, leech: s.leech });
        break;
      case 'summon': // Pacto Sombrio: espectros que orbitam o dono e atiram no inimigo mais próximo
        this.areas.push({ kind: 'summon', x: a.x, y: a.y, r: s.range, ticks: Math.round(s.dur / s.interval), interval: s.interval, next: 0.3, src: a, follow: a, count: s.count ?? 1, spec: s, mult: s.mult, color: s.color, t: 0 });
        this.addFx({ type: 'ring', x: a.x, y: a.y, r: 70, color: s.color, t: 0, life: 0.6, follow: a });
        this.burst(a.x, a.y, s.color, 20, 170);
        break;
      case 'trap': { // Armadilha de Gelo: zona no chão; quem entra fica preso (uma vez por inimigo) e depois lento
        const d = Math.min(s.range, Math.hypot(ax - a.x, ay - a.y));
        castTarget = { x: a.x + cos * d, y: a.y + sin * d };
        this.areas.push({ kind: 'trap', x: castTarget.x, y: castTarget.y, r: s.radius, ticks: Math.round(s.dur / s.interval), interval: s.interval, next: 0.1, src: a, mult: s.mult, color: s.color, t: 0, slow: s.slow, slowDur: s.slowDur, rootStun: s.rootStun, once: new Set() });
        this.addFx({ type: 'ring', x: castTarget.x, y: castTarget.y, r: s.radius, color: s.color, t: 0, life: 0.5 });
        break;
      }
      case 'zone': // Santuário do Sol: zona fixa que cura e protege aliados e queima inimigos
        castTarget = { x: a.x, y: a.y };
        this.areas.push({ kind: 'zone', x: a.x, y: a.y, r: s.radius, ticks: Math.round(s.dur / s.interval), interval: s.interval, next: 0.1, src: a, mult: s.mult, color: s.color, t: 0, zone: s.zone, zoneDur: s.interval * 1.6, zid: nextId++ });
        this.addFx({ type: 'ring', x: a.x, y: a.y, r: s.radius, color: s.color, t: 0, life: 0.7 });
        this.burst(a.x, a.y, s.color, 26, 220);
        break;
      case 'blink': {
        const d = Math.min(s.dist, Math.hypot(ax - a.x, ay - a.y));
        if (s.leave) { // Passo Fase: mina arcana no ponto de origem
          const L = s.leave;
          this.telegraphs.push({ x: a.x, y: a.y, r: L.radius, t: 0, delay: L.delay, src: a, mult: L.mult, color: s.color, stun: L.stun, burn: null, always: false });
          this.events.push({ type: 'telegraph', x: a.x, y: a.y, r: L.radius, delay: L.delay, color: s.color });
        }
        this.burst(a.x, a.y, s.color, 18, 160);
        a.x += cos * d; a.y += sin * d;
        this.collide(a);
        this.burst(a.x, a.y, s.color, 18, 160);
        break;
      }
    }
    this.events.push({ type: 'cast', actor: a, skill: id, t: this.time, ang, ...(castTarget ? { tx: castTarget.x, ty: castTarget.y } : {}) });
    return true;
  }

  stepDash(a, dt) {
    const d = a.dash;
    const step = Math.min(dt, d.t);
    this.moveActor(a, d.vx * step, d.vy * step);
    d.t -= dt;
    a.moving = true;
    if (d.mult > 0) {
      for (const e of this.enemiesOf(a)) {
        if (!d.hit.has(e.id) && Math.hypot(e.x - a.x, e.y - a.y) < a.r + e.r + 14) {
          d.hit.add(e.id);
          this.damage(a, e, d.mult, { stun: d.stun });
          if (d.knock && !e.boss && !e.dead) { // Investida do Escudo: empurra no sentido da investida
            const sp = Math.hypot(d.vx, d.vy) || 1;
            this.moveActor(e, d.vx / sp * d.knock, d.vy / sp * d.knock);
          }
        }
      }
    }
    if (this.particles.length < 700) this.addParticle({ x: a.x, y: a.y, vx: 0, vy: 0, life: 0.3, max: 0.3, color: d.color, size: 7 });
    if (d.t <= 0) {
      a.dash = null;
      const sl = d.slam;
      if (sl) { // Fúria do Colosso: impacto em área ao chegar
        this.addFx({ type: 'ring', x: a.x, y: a.y, r: sl.radius, color: d.color, t: 0, life: 0.5 });
        this.burst(a.x, a.y, d.color, 30, 260);
        for (const e of this.enemiesOf(a)) if (Math.hypot(e.x - a.x, e.y - a.y) <= sl.radius + e.r) { this.damage(a, e, sl.mult, { stun: sl.stun }); if (sl.burn && !e.dead) this.applyBurn(a, e, sl.burn); }
      }
    }
  }

  // ---------- dano / cura ----------
  damage(src, t, mult, opts = {}) {
    if (!t || t.dead || t.untargetable || t.dash?.invuln) return 0;
    if (t.buffs.length && this.buffVal(t, 'imm') > 0) return 0; // bloqueio total (Investida do Escudo)
    let blocked = false;
    if (t.markT > 0 && !opts.reflect) mult *= 1 + t.markAmt; // alvo marcado recebe mais dano de qualquer fonte
    // Duelos entre heróis ficam mais longos e táticos.
    if (t.kind === 'player' || t.kind === 'rival') {
      if (src.kind === 'player' || src.kind === 'rival' || src.kind === 'spirit') mult *= PVP_DAMAGE;
    }
    // Diferença de nível contra mobs: herói muito abaixo do mob bate mais fraco e apanha mais.
    if (t.kind === 'mob' && src.kind !== 'mob') {
      const sl = src.kind === 'spirit' ? this.byId(src.owner)?.level ?? t.level : src.level ?? t.level;
      const gap = t.level - sl - LEVEL_GAP.free;
      if (gap > 0) mult *= Math.max(LEVEL_GAP.minDealt, 1 - LEVEL_GAP.dealt * gap);
    } else if (src.kind === 'mob' && t.level != null && t.kind !== 'mob') {
      const gap = src.level - t.level - LEVEL_GAP.free;
      if (gap > 0) mult *= Math.min(LEVEL_GAP.maxTaken, 1 + LEVEL_GAP.taken * gap);
    }
    // Bloqueio passivo do escudo (core/block.js): golpe/projétil vindo da frente pode ser reduzido; só sorteia quem tem escudo (não altera a sequência do RNG dos demais).
    if (t.stats.block > 0 && !opts.dot && src !== t && inFrontArc(t.facing, t.x, t.y, src.x, src.y) && this.rng.next() < blockChance(t.stats, t.stillT) * (src.kind === 'mob' ? 1 : BLOCK.pvpMul)) {
      mult *= 1 - BLOCK.reduce;
      blocked = true;
    }
    const critBuff = src.buffs.length ? this.buffVal(src, 'crit') : 0; // Recuo Tático: crítico garantido no próximo golpe
    const res = opts.flat != null ? { amount: Math.max(1, Math.round(opts.flat)), crit: false } : computeHit(this.rng, // flat: dano fixo (reflexo de Aura/Barreira)
      { power: src.stats.power, crit: src.stats.crit + critBuff, critMult: src.stats.critMult, dmgBonus: this.buffVal(src, 'dmg') + lowHpBonus(src) },
      { def: t.stats.def, dr: this.buffVal(t, 'dr') }, mult);
    if (critBuff > 0 && !opts.dot) src.buffs = src.buffs.filter((b) => !b.once);
    let amt = res.amount;
    if (t.shield > 0) { const ab = Math.min(t.shield, amt); t.shield -= ab; amt -= ab; }
    t.hp -= amt;
    t.hitFlash = 0.12;
    t.lastDamaged = this.time;
    t.lastCombat = this.time;
    src.lastCombat = this.time;
    if (src.kind === 'player' || src.kind === 'rival') { src.lastDealt = this.time; src.lastTarget = t.id; } // o spirit só ataca se o dono atacou ou foi atacado (não conta o dano do próprio spirit)
    if (t.kind === 'player' || t.kind === 'rival') t.lastAttacker = src.id;
    const ls = (src.stats.lifesteal || 0) + (src.buffs.length ? this.buffVal(src, 'ls') : 0);
    if (ls > 0 && !src.dead && !opts.reflect) this.heal(src, res.amount * ls, true);
    if (opts.stun) t.stunT = Math.max(t.stunT, t.boss ? opts.stun * 0.3 : opts.stun);
    if (opts.slow) { t.slowT = opts.slowDur; t.slowAmt = t.boss ? opts.slow * 0.5 : opts.slow; }
    if (!t.boss) {
      const ang = Math.atan2(t.y - src.y, t.x - src.x);
      this.moveActor(t, Math.cos(ang) * 4, Math.sin(ang) * 4);
    }
    const hurtsPlayer = t.kind === 'player';
    this.events.push({ type: 'hit', src, target: t, amount: res.amount, absorbed: amt === 0, crit: res.crit, blocked, t: this.time });
    if (blocked) this.events.push({ type: 'block', actor: t, src, t: this.time });
    if (opts.stun) this.events.push({ type: 'status', actor: t, kind: 'stun', dur: t.stunT, t: this.time });
    if (opts.slow) this.events.push({ type: 'status', actor: t, kind: 'slow', dur: opts.slowDur, t: this.time });
    this.addText({
      x: t.x + this.vrng.range(-8, 8), y: t.y - t.r - 12, t: 0, life: 0.9,
      text: blocked ? 'Bloqueou ' + res.amount : amt === 0 ? 'absorvido' : String(res.amount), size: res.crit ? 21 : 15,
      color: amt === 0 ? '#ffe9a0' : hurtsPlayer ? '#ff6b6b' : res.crit ? '#ffd166' : '#ffffff',
    });
    this.burst(t.x, t.y, hurtsPlayer ? '#ff8080' : '#ffffff', res.crit ? 10 : 5, 140);

    const killer = src.kind === 'spirit' ? this.byId(src.owner) ?? src : src;
    // o tiro do spirit não puxa o mob para cima do dono
    if (t.ai && killer && !killer.dead && src.kind !== 'spirit') { t.ai.target = killer.id; if (t.ai.state !== 'return') t.ai.state = 'chase'; }
    if (t.hp <= 0) {
      t.hp = 0;
      t.dead = true;
      t.mounted = false; // caiu: desmonta (renascer volta a pé)
      t.deadT = 0;
      t.dash = null;
      this.burst(t.x, t.y, t.kind === 'mob' ? MOBS[t.mobId].color : '#ffffff', 26, 220);
      this.events.push({ type: 'death', actor: t, killer });
      if (t.kind === 'mob') this.onMobDeath(t);
      if (t.boss) for (const a of this.actors) if (a.summonedBy === t.id && !a.dead) { a.hp = 0; a.dead = true; a.deadT = 0; a.dash = null; } // os esbirros morrem com o chefe (sem evento: nada de XP/loot)
      if (t.burn?.spread) this.spreadBurn(t); // Maldição: a praga salta para os vizinhos
    } else if (!opts.reflect && !opts.dot && src !== t && t.buffs.length) {
      const rf = this.buffVal(t, 'reflect'); // Aura de Bastião / Barreira Arcana: devolve parte do dano ao agressor
      if (rf > 0 && !src.dead && src.kind !== 'spirit') this.damage(t, src, 0, { flat: res.amount * rf, reflect: true });
    }
    return res.amount;
  }

  heal(a, amount, quiet = false) {
    const before = a.hp;
    a.hp = Math.min(a.maxHp, a.hp + amount);
    const got = Math.round(a.hp - before);
    if (got >= 1) this.events.push({ type: 'heal', actor: a, amount: got, t: this.time });
    if (!quiet && got >= 1) this.addText({ x: a.x, y: a.y - a.r - 14, t: 0, life: 0.9, text: '+' + got, size: 15, color: '#7dff9b' });
    return got;
  }

  // ---------- projéteis / áreas ----------
  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.traveled += Math.hypot(p.vx, p.vy) * dt;
      if (this.visuals && this.particles.length < 700 && this.vrng.next() < 0.7) {
        this.addParticle({ x: p.x, y: p.y, vx: (this.vrng.next() - 0.5) * 30, vy: (this.vrng.next() - 0.5) * 30, life: 0.25, max: 0.25, color: p.color, size: p.radius * 0.7 });
      }
      let done = p.traveled >= p.range;
      for (const e of this.actors) {
        if (done || e.dead || e.untargetable || e.team === p.team || p.hit.has(e.id) || (p.only != null && e.id !== p.only)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.radius) {
          p.hit.add(e.id);
          if (p.explode) { done = true; break; }
          this.damage(p.src, e, p.mult, { stun: p.stun });
          if (p.burn) this.applyBurn(p.src, e, p.burn);
          if (p.mark && !e.dead) this.applyMark(e, p.mark);
          if (!p.pierce) done = true;
        }
      }
      if (!done && !p.pierce) {
        // obstáculos com `block`: círculos (árvores, pilares) e retângulos (muros e sarcófagos da Cripta; antes o teste só via círculos e o tiro atravessava o muro)
        const q = (this._pq ??= { x: 0, y: 0, r: 0 }), h = p.radius * 0.5;
        q.x = p.x; q.y = p.y; q.r = p.radius;
        for (const o of this.nearObstacles(q)) {
          if (!o.block) continue;
          if (o.w ? p.x > o.x - h && p.x < o.x + o.w + h && p.y > o.y - h && p.y < o.y + o.h + h : Math.hypot(o.x - p.x, o.y - p.y) < o.r + h) { done = true; break; }
        }
      }
      if (done) {
        p.dead = true;
        if (p.explode) this.explode(p);
        else this.burst(p.x, p.y, p.color, 5, 90);
      }
    }
    if (this.projectiles.some((p) => p.dead)) this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  explode(p) {
    this.addFx({ type: 'ring', x: p.x, y: p.y, r: p.explode, color: p.color, t: 0, life: 0.35 });
    this.burst(p.x, p.y, p.color, 24, 240);
    for (const e of this.actors) {
      if (e.dead || e.untargetable || e.team === p.team) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) <= p.explode + e.r) { this.damage(p.src, e, p.mult); if (p.burn) this.applyBurn(p.src, e, p.burn); }
    }
  }

  // Dano periódico (queimadura/veneno): renova, não acumula; o mesmo estado do Meteoro Arcano (`a.burn`).
  applyBurn(src, e, burn) {
    if (e.dead || e.untargetable) return;
    e.burn = { t: burn.dur, every: burn.every, next: burn.every, mult: burn.mult, src, spread: burn.spread ?? 0 };
    this.events.push({ type: 'status', actor: e, kind: 'burn', dur: burn.dur, t: this.time });
  }

  // Marca: o alvo recebe +taken de dano por dur s (renova, não acumula).
  applyMark(e, mark) {
    if (e.dead || e.untargetable) return;
    const keep = e.markT > 0 ? e.markAmt ?? 0 : 0;
    e.markT = mark.dur; e.markAmt = Math.max(keep, mark.taken);
    this.events.push({ type: 'status', actor: e, kind: 'mark', dur: mark.dur, t: this.time });
  }

  // Maldição do Bruxo: ao morrer amaldiçoado, a praga passa (sem encadear de novo) aos 2 inimigos mais próximos dentro do raio.
  spreadBurn(t) {
    const b = t.burn, near = [];
    for (const e of this.enemiesOf(b.src)) { const d = Math.hypot(e.x - t.x, e.y - t.y); if (e !== t && d <= b.spread + e.r) near.push([d, e]); }
    near.sort((p, q) => p[0] - q[0]);
    for (const [, e] of near.slice(0, 2)) {
      e.burn = { t: Math.max(1, b.t), every: b.every, next: b.every, mult: b.mult, src: b.src, spread: 0 };
      this.events.push({ type: 'status', actor: e, kind: 'burn', dur: b.t, t: this.time });
      this.burst(e.x, e.y, '#9ae06a', 10, 120);
    }
  }

  // Ações adiadas (mira, rajadas): somem se quem as começou morreu ou foi atordoado.
  updateQueue(dt) {
    if (!this.queue.length) return;
    const q = this.queue;
    this.queue = [];
    for (const it of q) {
      it.t -= dt;
      if (it.t > 0) { this.queue.push(it); continue; }
      if (!it.src.dead && it.src.stunT <= 0) it.fn();
    }
  }

  updateAreas(dt) {
    for (const ar of this.areas) {
      ar.t += dt;
      ar.next -= dt;
      if (ar.follow) { // canalização e espectros acompanham o dono; morrer ou ser atordoado (canal) encerra
        ar.x = ar.follow.x; ar.y = ar.follow.y;
        if (ar.follow.dead || (ar.kind === 'channel' && ar.follow.stunT > 0)) { ar.ticks = 0; ar.next = -1; continue; }
      }
      if (ar.next <= 0 && ar.ticks > 0) {
        ar.ticks--;
        ar.next = ar.interval;
        if (ar.kind === 'channel') { // Drenar Vida: o inimigo mais próximo dentro do alcance
          const e = this.nearestEnemy(ar.src, ar.r);
          ar.vt = e; // só apresentação: o fio do Drenar Vida liga o herói a este alvo (render/skill-vfx.js)
          if (e) {
            const got = this.damage(ar.src, e, ar.mult);
            if (got > 0 && !ar.src.dead) this.heal(ar.src, got * ar.leech, true);
            this.addFx({ type: 'ring', x: e.x, y: e.y, r: 34, color: ar.color, t: 0, life: 0.3, follow: e });
            this.burst(e.x, e.y, ar.color, 6, 120);
          }
          continue;
        }
        if (ar.kind === 'summon') { // Pacto Sombrio: cada espectro atira no inimigo mais próximo
          for (let k = 0; k < ar.count; k++) {
            const ang0 = ar.t * 2.2 + k * (TAU / ar.count), sx = ar.x + Math.cos(ang0) * 46, sy = ar.y + Math.sin(ang0) * 30 - 24;
            const e = this.nearestEnemy({ x: sx, y: sy, team: ar.src.team }, ar.r);
            if (!e) continue;
            this.spawnProjectile(ar.src, Math.atan2(e.y - sy, e.x - sx), ar.spec, { x: sx, y: sy });
          }
          continue;
        }
        if (ar.kind === 'zone') { // Santuário do Sol: aliados dentro (inclusive o dono) curam e ganham redução de dano renovada a cada tick
          for (const al of this.actors) {
            if (al.dead || al.team !== ar.src.team || (al.kind !== 'player' && al.kind !== 'rival') || Math.hypot(al.x - ar.x, al.y - ar.y) > ar.r + al.r) continue;
            this.heal(al, al.maxHp * ar.zone.heal, true);
            const b = al.buffs.find((x) => x.zid === ar.zid);
            if (b) b.t = ar.zoneDur; else al.buffs.push({ id: 'zone', zid: ar.zid, t: ar.zoneDur, dr: ar.zone.dr });
          }
        }
        for (const e of this.actors) {
          if (e.dead || e.untargetable || e.team === ar.src.team) continue;
          if (Math.hypot(e.x - ar.x, e.y - ar.y) <= ar.r + e.r) {
            let opts = ar.slow ? { slow: ar.slow, slowDur: ar.slowDur } : undefined;
            if (ar.rootStun && !ar.once.has(e.id)) { ar.once.add(e.id); opts = { ...opts, stun: ar.rootStun }; } // Armadilha: prende uma vez por inimigo
            const got = this.damage(ar.src, e, ar.mult, opts);
            if (ar.leech && got > 0 && !ar.src.dead) this.heal(ar.src, got * ar.leech, true); // Chuva de Almas
          }
        }
        for (let i = 0; this.visuals && i < 8; i++) {
          const ang = this.vrng.next() * TAU, d = this.vrng.next() * ar.r;
          this.addParticle({ x: ar.x + Math.cos(ang) * d, y: ar.y + Math.sin(ang) * d - 30, vx: 0, vy: 260, life: 0.15, max: 0.15, color: ar.color, size: 3, streak: true });
        }
      }
    }
    if (this.areas.length) this.areas = this.areas.filter((ar) => ar.ticks > 0 || ar.next > -0.3);
  }

  updateTelegraphs(dt) {
    for (const tg of this.telegraphs) {
      tg.t += dt;
      if (tg.t >= tg.delay && !tg.done) {
        tg.done = true;
        if (!tg.src.dead || tg.always) { // `always`: o meteoro do herói cai mesmo que ele morra no meio
          this.addFx({ type: 'ring', x: tg.x, y: tg.y, r: tg.r, color: tg.color, t: 0, life: 0.4 });
          this.burst(tg.x, tg.y, tg.color, 30, 260);
          for (const e of this.enemiesOf(tg.src)) {
            if (Math.hypot(e.x - tg.x, e.y - tg.y) <= tg.r + e.r) {
              this.damage(tg.src, e, tg.mult, { stun: tg.stun ?? 0.5, slow: tg.slow, slowDur: tg.slowDur });
              if (tg.mark && !e.dead) this.applyMark(e, tg.mark);
              if (tg.burn && !e.dead) { // queimadura: dano periódico (renova, não acumula)
                e.burn = { t: tg.burn.dur, every: tg.burn.every, next: tg.burn.every, mult: tg.burn.mult, src: tg.src };
                this.events.push({ type: 'status', actor: e, kind: 'burn', dur: tg.burn.dur, t: this.time });
              }
            }
          }
        }
      }
    }
    if (this.telegraphs.length) this.telegraphs = this.telegraphs.filter((tg) => !tg.done);
  }

  // Esbirros do chefe: nascem ao redor dele, mais fracos (nível menor), limitados por `max`; não dão XP nem loot e somem quando o chefe morre.
  summonMinions(boss, tgt, sm) {
    const alive = this.actors.filter((a) => a.summonedBy === boss.id && !a.dead).length;
    for (let k = 0; k < sm.count && alive + k < sm.max; k++) {
      const ang = this.rng.next() * TAU;
      const e = this.add(makeMobActor(sm.mobId, Math.max(1, boss.level - sm.levelMinus), boss.x + Math.cos(ang) * (boss.r + 40), boss.y + Math.sin(ang) * (boss.r + 40), { hostile: true, summoned: true }));
      e.summonedBy = boss.id; e.ai.target = tgt.id; e.ai.state = 'chase';
      this.burst(e.x, e.y, MOBS[boss.mobId].color, 12, 160);
    }
  }

  // ---------- spirits ----------
  // Coleta (sem Math.random: o mais próximo ganha, empate pela ordem do array): busca → pega (d.carried) → entrega ao dono (d.fetched + evento
  // `pickup`; quem tem a mochila — main.js collectDrops — dá o item). Só heróis; em combate o spirit larga tudo e volta a seguir o dono.
  updateSpiritFetch(s, o, dt) {
    const F = SPIRIT_FETCH;
    const step = (x, y) => { const d = Math.hypot(x - s.x, y - s.y), m = Math.min(d, F.speed * dt); if (d > 0) { s.x += (x - s.x) / d * m; s.y += (y - s.y) / d * m; } };
    if (o.kind !== 'player' || this.spiritEngaged(o)) {
      if (s.carry) s.carry.carried = false;
      s.carry = s.fetch = null;
      return false;
    }
    if (s.carry) {
      const d = s.carry;
      if (d.taken || !this.drops.includes(d)) { s.carry = null; return false; }
      if (Math.hypot(o.x - s.x, o.y - s.y) <= F.hand) {
        d.carried = false; d.fetched = true; s.carry = null;
        this.events.push({ type: 'pickup', drop: d, spirit: s, actor: o, t: this.time });
        return false;
      }
      step(o.x, o.y); d.x = s.x; d.y = s.y;
      return true;
    }
    let d = s.fetch;
    if (d && (d.taken || d.carried || d.fetched || !this.drops.includes(d) || !spiritWants(this.spiritPick, d))) d = s.fetch = null;
    if (!d) {
      let best = Infinity;
      for (const c of this.drops) {
        if (c.taken || c.carried || c.fetched || c.kind === 'gold' || !spiritWants(o.spiritPick ?? this.spiritPick, c) || c.t < PICK_DELAY || (c.owner != null && c.owner !== o.id) || Math.hypot(c.x - o.x, c.y - o.y) > F.range) continue; // online: só o drop do próprio dono
        const dd = Math.hypot(c.x - s.x, c.y - s.y);
        if (dd < best) { best = dd; d = c; }
      }
      if (!d) return false;
      s.fetch = d;
    }
    if (Math.hypot(d.x - s.x, d.y - s.y) <= F.grab) { d.carried = true; s.carry = d; s.fetch = null; return true; }
    step(d.x, d.y);
    return true;
  }
  // O spirit não ataca sozinho: só quando o dono bateu em alguém ou apanhou nos últimos 3 s.
  spiritEngaged(o) { return (o.lastDealt ?? -99) > this.time - 3 || (o.lastDamaged ?? -99) > this.time - 3; }
  updateSpirit(s, dt) {
    const o = this.byId(s.owner);
    if (!o || o.dead) { s.hidden = true; return; }
    s.hidden = false;
    s.bob += dt;
    if (!this.updateSpiritFetch(s, o, dt)) {
      const side = s.team === 1 ? -1 : 1;
      const tx = o.x - Math.cos(o.facing) * 26 + Math.cos(o.facing + Math.PI / 2) * 20 * side;
      const ty = o.y - Math.sin(o.facing) * 26 + Math.sin(o.facing + Math.PI / 2) * 20 * side - 14;
      const k = Math.min(1, dt * 6);
      s.x += (tx - s.x) * k;
      s.y += (ty - s.y) * k;
    }
    const color = SPIRITS[s.spiritType].color;
    // Alvos do spirit: só quem o dono acertou por último, quem está batendo no dono ou quem o persegue (nunca os mobs que estão só passando).
    const foes = (range, from = s) => this.enemiesOf(s).filter((e) => Math.hypot(e.x - from.x, e.y - from.y) <= range + e.r && (e.id === o.lastTarget || e.id === o.lastAttacker || e.ai?.target === o.id || (!e.ai && this.spiritEngaged(o))));
    const shoot = (mult, cd, range = 380) => {
      if (!this.spiritEngaged(o)) return;
      let e = null, bd = Infinity;
      for (const f of foes(range)) { const d = Math.hypot(f.x - s.x, f.y - s.y); if (d < bd) { bd = d; e = f; } }
      if (!e) return;
      this.spawnProjectile(s, Math.atan2(e.y - s.y, e.x - s.x), { speed: 460, mult, radius: 5, color, range: range + 40, only: e.id });
      s.cds.s0 = cd;
    };
    switch (s.spiritType) {
      case 'ember':
        if (s.cds.s0 <= 0) shoot(1, 1.2);
        break;
      case 'undine':
        if (s.cds.basic <= 0 && o.hp < o.maxHp) {
          this.heal(o, s.stats.power * 1.6);
          this.addFx({ type: 'ring', x: o.x, y: o.y, r: 40, color, t: 0, life: 0.4, follow: o });
          s.cds.basic = 4;
        }
        if (s.cds.s0 <= 0) shoot(0.5, 2);
        break;
      case 'terra':
        if (s.cds.basic <= 0 && o.lastDamaged > this.time - 2) {
          o.shield = Math.min(o.maxHp * 0.3, o.shield + s.stats.power * 3);
          o.shieldT = 6;
          this.addFx({ type: 'ring', x: o.x, y: o.y, r: 34, color, t: 0, life: 0.4, follow: o });
          s.cds.basic = 9;
        }
        if (s.cds.s0 <= 0) {
          const near = this.spiritEngaged(o) ? foes(95, o) : [];
          if (near.length) {
            this.addFx({ type: 'ring', x: o.x, y: o.y, r: 95, color, t: 0, life: 0.35 });
            for (const e of near) this.damage(s, e, 1);
            s.cds.s0 = 3;
          }
        }
        break;
      case 'zephyr':
        if (s.cds.s0 <= 0) shoot(0.45, 0.55, 340);
        break;
    }
  }

  // ---------- visuais (sem efeito na lógica) ----------
  addFx(f) { if (this.visuals) this.fx.push(f); }
  addText(t) { if (this.visuals) this.texts.push(t); }
  addParticle(p) { if (this.visuals) this.particles.push(p); }
  burst(x, y, color, n, speed) {
    for (let i = 0; this.visuals && i < n && this.particles.length < 800; i++) {
      const ang = this.vrng.next() * TAU, sp = speed * (0.3 + this.vrng.next() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0.45, max: 0.45, color, size: 2 + this.vrng.next() * 3 });
    }
  }

  updateVisuals(dt) {
    if (!this.visuals && !this.drops.length) return; // servidor: nada de efeitos para atualizar
    for (const f of this.fx) { f.t += dt; if (f.follow) { f.x = f.follow.x; f.y = f.follow.y; } }
    this.fx = this.fx.filter((f) => f.t < f.life);
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (!p.streak) { p.vx *= 0.9; p.vy *= 0.9; }
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) { t.t += dt; t.y -= 38 * dt; }
    this.texts = this.texts.filter((t) => t.t < t.life);
    for (const d of this.drops) {
      d.t += dt;
      if (d.t < 0.35) { d.x += d.vx * dt; d.y += d.vy * dt; }
    }
    // Drops expiram (o renderer pisca nos últimos DROP_BLINK s a partir de d.t) e há um teto: descarta os mais antigos.
    if (this.drops.length > DROP_MAX || this.drops.some((d) => d.t >= DROP_LIFE)) {
      this.drops = this.drops.filter((d) => d.t < DROP_LIFE);
      if (this.drops.length > DROP_MAX) this.drops.splice(0, this.drops.length - DROP_MAX);
    }
  }
}
