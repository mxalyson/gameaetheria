// Sala da CRIPTA DOS ECOS (masmorra por instância, decisão 0017): uma ZoneRoom que conduz 3 salas de ondas curtas + a sala do chefe (2 fases, golpes com aviso).
// O servidor decide tudo: quando as ondas nascem, o portão de cada sala (os heróis ficam antes do muro até a sala ser limpa), as quedas (CRYPT.maxDeaths por herói),
// os Fragmentos de Eco, o item Eco do chefe e o fim. Recompensas acumulam em `p.pend` e gravam pelo mesmo lote idempotente da exploração (zone.js › flush).
// Instância por grupo (ou solo): a chave da sala é a de ZoneRoom (hub.js). Não há monstros fora da instância e nenhuma cidade ganha monstros.
import { randomBytes } from 'node:crypto';
import { ZoneRoom } from './zone.js';
import { CRYPT, CRYPT_GEOM as G } from '../public/src/data/crypt.js';
import { MOBS, XP_MULT } from '../public/src/data/mobs.js';
import { ZONES } from '../public/src/data/zones.js';
import { makeMobActor } from '../public/src/game/sim.js';
import { mobXp } from '../public/src/core/progression.js';
import { rollMobLoot, rollCryptFrags, rollEchoDrop } from '../public/src/core/loot.js';
import { TICK_DT } from '../public/src/core/protocol.js';

// Fases da masmorra (vão no HUD, `cr[3]`): espera inicial · luta da sala · pausa entre ondas · sala limpa (portão aberto) · chefe · vitória · (fracasso = todos fora)
export const PH = { INTRO: 0, FIGHT: 1, REST: 2, ADVANCE: 3, BOSS: 4, VICTORY: 5 };
const SHARE_RADIUS = 1400; // a masmorra é um corredor: quem está na sala divide o abate
const GATE_PAD = 18;       // o herói para antes do muro
const NEXT_AT = 80;        // x além do muro em que a sala seguinte começa (passou pela porta)
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 1);

export class CryptRoom extends ZoneRoom {
  constructor(opts) {
    super(opts);
    this.cr = { room: 0, wave: 0, phase: PH.INTRO, t: CRYPT.introSec, exitT: 0 };
    this.bossMob = null; this.lastCleared = -1;
    this.cleared = false; // true quando o chefe caiu (instância terminada: o hub não aceita mais entradas)
  }

  // ponto de chegada/renascimento da sala atual (a fila de heróis ao longo do corredor)
  checkpoint(i = this.players.size) { return { x: G.starts[this.cr.room], y: G.mid + ((i % 4) - 1.5) * 44 }; }
  join(session, at) { return super.join(session, this.checkpoint(this.players.size) ?? at); }

  // x máximo permitido AGORA: dentro da sala atual até ela ser limpa; com o portão aberto, até o muro da sala seguinte; no chefe, sem limite.
  gateX() {
    const { room, phase } = this.cr;
    if (phase === PH.BOSS || phase === PH.VICTORY) return Infinity;
    const wall = phase === PH.ADVANCE ? G.walls[room + 1] : G.walls[room];
    return wall == null ? Infinity : wall - GATE_PAD;
  }

  // ---- nascimento das ondas ----
  levelBase() { return Math.max(CRYPT.recommended[0], Math.min(CRYPT.recommended[1], Math.round(avg(this.alive().map((p) => p.actor.level))))); }
  scaled(m, crew) {
    const hp = Math.round(m.maxHp * (1 + CRYPT.hpPerExtra * (crew - 1)));
    m.hp = m.maxHp = m.stats.maxHp = hp;
    const k = 1 + CRYPT.atkPerExtra * (crew - 1);
    m.stats.power *= k; m.base.power *= k;
  }
  spawnWave(room, wave) {
    const R = CRYPT.rooms[room], w = this.world, humans = this.alive(), crew = Math.max(1, humans.length), lvl = this.levelBase() + R.lvlPlus;
    const list = [...R.waves[wave].map(([id, n]) => [id, n, false])];
    if (wave === R.waves.length - 1) for (const [id, n] of R.elites) list.push([id, n, true]);
    const [x0, x1] = G.roomX[room];
    for (const [id, n, elite] of list) {
      for (let i = 0; i < n; i++) {
        const x = this.rng.range(x0 + 180, x1), y = this.rng.range(170, 830);
        const m = w.add(makeMobActor(id, lvl, x, y, { elite, hostile: true }));
        m.crypt = true;
        this.scaled(m, crew);
        const t = humans[this.rng.int(0, humans.length - 1)];
        m.ai.target = t?.actor.id ?? null; m.ai.state = 'chase';
      }
    }
    this.cr.phase = PH.FIGHT; this.cr.wave = wave;
    this.events.push({ e: 'crypt', stage: 'wave', room: room + 1, wave: wave + 1, waves: R.waves.length });
  }
  spawnBoss() {
    const crew = Math.max(1, this.alive().length), m = this.world.add(makeMobActor(CRYPT.boss.id, this.levelBase() + CRYPT.boss.lvlPlus, G.bossAt.x, G.bossAt.y));
    m.crypt = true; this.scaled(m, crew);
    const t = this.alive()[0];
    m.ai.target = t?.actor.id ?? null; m.ai.state = 'chase';
    this.bossMob = m; this.cr.phase = PH.BOSS;
    this.events.push({ e: 'crypt', stage: 'boss' });
  }

  // ---- recompensas ----
  onMobKilled(m) {
    if (m.summoned) return; // esbirros do chefe não rendem nada
    const M = MOBS[m.mobId], mul = M.xp * (m.boss ? XP_MULT.boss : m.elite ? XP_MULT.elite : 1);
    for (const p of this.alive()) {
      const a = p.actor;
      if (Math.hypot(a.x - m.x, a.y - m.y) > SHARE_RADIUS) continue;
      p.pend.xp += mobXp(m.level, a.level, mul);
      p.pend.kills.push({ mobId: m.mobId, boss: !!m.boss, mini: false, spiritType: this.spiritTypeOf(p) });
      if (m.boss) { // o chefe paga como qualquer chefe (ouro + equipamento); os comuns só ouro: o prêmio da masmorra são os fragmentos
        for (const d of rollMobLoot(this.rng, m, p.classId, p.pity)) {
          if (d.kind === 'gold') p.pend.gold += d.amount;
          else if (d.kind === 'potion') p.pend.potions += d.amount;
          else if (d.kind === 'whistle') p.pend.whistles += d.amount; // Apito de Montaria (o chefe da Cripta também pode soltar)
          else if (d.kind === 'item') p.pend.items.push({ ...d.item, id: 'i' + randomBytes(9).toString('base64url') });
        }
      } else p.pend.gold += Math.round(this.rng.int(m.level * 2 + 1, m.level * 4 + 3) * (m.elite ? 3 : 1));
    }
  }
  present() { return [...this.players.values()].filter((p) => !p.left); } // quem está na instância (vivo ou caído): o prêmio da sala/chefe é de todos
  grantRoom(room) {
    for (const p of this.present()) p.pend.frags += rollCryptFrags(this.rng, 'room', room);
  }
  victory() {
    const c = this.cr;
    c.phase = PH.VICTORY; c.exitT = CRYPT.exitSec; this.cleared = true;
    for (const p of this.present()) {
      p.pend.frags += rollCryptFrags(this.rng, 'boss');
      p.pend.crypt = true; // conquista/missão: o servidor registra a vitória (core/rewards.js)
      const it = rollEchoDrop(this.rng, p.actor.level, p.classId);
      if (it) p.pend.items.push({ ...it, id: 'i' + randomBytes(9).toString('base64url') });
    }
    this.events.push({ e: 'crypt', stage: 'victory', exit: CRYPT.exitSec });
    for (const p of [...this.players.values()]) this.flush(p); // grava já (o resumo vai ao cliente em zone_reward)
  }

  // ---- máquina de estados (chamada por ZoneRoom.step depois dos eventos da simulação) ----
  afterEvents() {
    const c = this.cr, mobsAlive = () => this.mobs().some((m) => !m.dead);
    // portão: os heróis não passam do muro enquanto a sala não for limpa
    const lim = this.gateX();
    for (const p of this.players.values()) if (!p.left && !p.actor.dead && p.actor.x > lim) p.actor.x = lim;
    if (!this.alive().length && c.phase !== PH.VICTORY) return; // todos caídos: esperam renascer (ZoneRoom.respawn); a luta segue de onde parou
    switch (c.phase) {
      case PH.INTRO:
        if ((c.t -= TICK_DT) <= 0) this.spawnWave(c.room, 0);
        break;
      case PH.FIGHT:
        if (mobsAlive()) break;
        if (c.wave + 1 < CRYPT.rooms[c.room].waves.length) { c.phase = PH.REST; c.t = CRYPT.restSec; c.wave++; } // `wave` já aponta para a próxima
        else this.roomCleared();
        break;
      case PH.REST:
        if ((c.t -= TICK_DT) <= 0) this.spawnWave(c.room, c.wave);
        break;
      case PH.ADVANCE: {
        // passou pela porta (algum herói vivo além do muro): a próxima sala começa
        const door = G.walls[c.room] + G.wallW + NEXT_AT;
        if (this.alive().some((p) => p.actor.x >= door)) this.enterRoom(c.room + 1);
        break;
      }
      case PH.BOSS:
        if (this.bossMob?.dead) this.victory();
        break;
      case PH.VICTORY:
        if ((c.exitT -= TICK_DT) <= 0) for (const p of [...this.players.values()]) this.expel(p, 'done');
        break;
    }
  }
  roomCleared() {
    const c = this.cr;
    this.grantRoom(c.room);
    for (const p of this.alive()) this.world.heal(p.actor, p.actor.maxHp * 0.35);
    for (const p of this.players.values()) if (!p.left && p.actor.dead) this.revive(p); // quem caiu volta junto com o grupo
    c.phase = PH.ADVANCE;
    this.events.push({ e: 'crypt', stage: 'clear', room: c.room + 1, rooms: CRYPT.rooms.length + 1 });
  }
  enterRoom(n) {
    const c = this.cr;
    c.room = n; c.wave = 0;
    let i = 0;
    for (const p of this.players.values()) if (!p.left) p.entry = this.checkpoint(i++); // renascimento na sala nova
    if (n >= CRYPT.rooms.length) this.spawnBoss();
    else { c.phase = PH.INTRO; c.t = CRYPT.restSec; this.events.push({ e: 'crypt', stage: 'room', room: n + 1, rooms: CRYPT.rooms.length + 1 }); }
  }
  revive(p) {
    const a = p.actor;
    a.dead = false; a.deadT = 0; a.hp = Math.round(a.maxHp * 0.5); a.stunT = 0; a.buffs = []; p.deadAt = null;
    this.events.push({ e: 'revive', actor: a.id });
  }

  // ---- quedas: CRYPT.maxDeaths por herói; na seguinte ele sai da masmorra ----
  onPlayerDeath(actor) {
    super.onPlayerDeath(actor);
    const p = this.players.get(actor.id);
    if (p) p.cryptDeaths = (p.cryptDeaths ?? 0) + 1;
  }
  respawn(p) {
    if ((p.cryptDeaths ?? 0) > CRYPT.maxDeaths) return this.expel(p, 'lives');
    super.respawn(p);
  }
  // Leva o herói de volta à Vila (mesmo caminho do portal da saída: o hub grava o lote, tira da sala e manda zone_exit).
  expel(p, reason) {
    if (p.left) return;
    const exit = ZONES.crypt.portals[0];
    if (this.onPortal && p.session) this.onPortal(p, exit); else this.leave(p, reason);
  }

  // HUD: [sala 1..4, onda 1..n, ondas da sala, fase, criaturas vivas, segundos para sair (vitória)]
  hudTuple() {
    const c = this.cr, R = CRYPT.rooms[c.room];
    return [c.room + 1, c.wave + 1, R ? R.waves.length : 1, c.phase, this.mobs().filter((m) => !m.dead).length, Math.max(0, Math.ceil(c.exitT))];
  }
}
