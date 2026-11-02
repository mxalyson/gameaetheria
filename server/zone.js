// Sala de EXPLORAÇÃO (PvE autoritativo, P11): uma instância de zona (Bosque, Planície ou Ruínas) para 1 jogador ou um grupo (até 4).
// Mesma simulação do jogo (World com mobs, respawn e chefe). O servidor decide movimento, dano, morte, XP, ouro e loot; o cliente só
// envia intenções. Recompensas acumulam por jogador e são gravadas em lote numa operação idempotente (a cada FLUSH_EVERY s, ao sair e ao fechar).
// Mesma interface das outras salas (o Hub trata todas igual). Loot é individual: cada membro rola o seu (classe própria → arma certa).
import { randomBytes } from 'node:crypto';
import { World, makeHeroActor } from '../public/src/game/sim.js';
import { makeRng } from '../public/src/core/rng.js';
import { mobXp, createSpirit } from '../public/src/core/progression.js';
import { rollMobLoot } from '../public/src/core/loot.js';
import { applyZoneBatch } from '../public/src/core/rewards.js';
import { MOBS } from '../public/src/data/mobs.js';
import { ZONES } from '../public/src/data/zones.js';
import { TICK_DT, SNAPSHOT_EVERY, PROTOCOL_VERSION } from '../public/src/core/protocol.js';
import { wire } from './wire.js';
import { DeltaEncoder, actorTuple, mobTuple, mobStatic } from './snapshot.js';

export const FLUSH_EVERY = 10;   // s entre gravações de recompensas
export const RESPAWN_AFTER = 4;  // s morto até renascer na entrada da zona
const SHARE_RADIUS = 900;        // quem está longe do abate não ganha nada dele
const r1 = (n) => Math.round(n * 10) / 10;
const idle = () => ({ mx: 0, my: 0, aimX: 0, aimY: 0, attack: false, cast: null });
const emptyBatch = () => ({ xp: 0, gold: 0, potions: 0, items: [], essences: [], kills: [], deaths: 0 });

// Ponto de entrada numa zona vindo de `from` (o portal de lá aponta para cá). null = portal inexistente (movimento ilegal).
export function entryPoint(zoneId, from) {
  const p = ZONES[from]?.portals?.find((q) => q.to === zoneId);
  return p ? { x: p.tx, y: p.ty } : null;
}

export class ZoneRoom {
  constructor({ id, key, zoneId, seed, db = null, reconnectSec = 30, send, onPortal = null }) {
    Object.assign(this, { id, key, zoneId, mode: 'zone', db, reconnectSec, send, onPortal });
    this.matchId = randomBytes(9).toString('base64url');
    this.rng = makeRng(seed);
    this.bossState = {}; // ritual e recarga do chefe valem para a instância inteira (sobrevivem enquanto houver gente)
    this.world = new World(zoneId, { seed, visuals: false, bossState: this.bossState });
    this.populated = false;
    this.state = 'fight'; this.countdown = 0; this.winner = 0; this.reason = null; this.closed = false;
    this.clock = 0; this.tick = 0; this.events = []; this.enc = new DeltaEncoder();
    this.players = new Map();
    this.joined = []; this.left = []; this.flushSeq = 0; this.flushT = FLUSH_EVERY;
    this.bytes = 0;
  }

  humans() { return [...this.players.values()].filter((p) => !p.left && p.session); }
  mobs() { return this.world.actors.filter((a) => a.kind === 'mob'); }
  alive() { return [...this.players.values()].filter((p) => !p.left && !p.actor.dead); }
  get size() { return this.humans().length; }

  // entra um jogador; `at` = ponto de entrada. Devolve o registro do jogador.
  join(session, at) {
    const actor = this.world.add(makeHeroActor(session.char, at.x, at.y, 'player', 1));
    if (!this.populated) { this.world.populate(session.char.level); this.populated = true; }
    const p = { actor, team: 1, session, bot: false, left: false, charId: session.charId ?? null, accountId: session.accountId ?? null,
      name: session.name, classId: session.char.classId, lastSeq: -1, input: idle(), dropT: null, slot: 1, entry: { ...at }, deadAt: null, portalCd: 1, pend: emptyBatch(), pity: { epic: 0, legendary: 0, opal: 0, ...(session.char.pity ?? {}) } }; // pity: azar acumulado do personagem (loot.js); o servidor grava de volta no lote
    this.players.set(actor.id, p);
    session.room = this; session.player = p;
    this.joined.push(p);
    return p;
  }

  input(session, m) {
    const p = session.player;
    if (!p || p.left) return;
    if (m.seq <= p.lastSeq) { this.send.stats.staleInputs++; return; }
    p.lastSeq = m.seq;
    p.input = { mx: m.mx, my: m.my, aimX: m.aimX, aimY: m.aimY, attack: m.attack, cast: m.cast ?? p.input.cast };
  }
  dropped(session) { const p = session.player; if (p && !p.left) { p.dropT = this.clock; p.input = idle(); } }
  resumed(session) { const p = session.player; if (p && !p.left) p.dropT = null; }

  step() {
    this.tick++; this.clock += TICK_DT;
    for (const p of this.players.values()) {
      if (!p.left && p.session && !p.session.ws && p.dropT != null && this.clock - p.dropT > this.reconnectSec) this.leave(p, 'timeout');
    }
    const intents = {};
    for (const p of this.players.values()) {
      if (p.left) continue;
      intents[p.actor.id] = p.actor.dead ? { mx: 0, my: 0 } : { ...p.input };
      p.input.cast = null;
    }
    const ref = this.alive()[0]?.actor;
    if (ref) this.world.updateSpawns(TICK_DT, ref);
    this.world.update(TICK_DT, intents);
    for (const ev of this.world.events.splice(0)) {
      if (ev.type === 'death' && ev.actor.kind === 'mob') this.onMobKilled(ev.actor);
      else if (ev.type === 'death' && ev.actor.kind === 'player') this.onPlayerDeath(ev.actor);
      const w = wire(ev); if (w) this.events.push(w);
    }
    for (const p of this.players.values()) {
      if (p.left) continue;
      const a = p.actor;
      if (a.dead) { if (p.deadAt != null && this.clock - p.deadAt >= RESPAWN_AFTER) this.respawn(p); continue; }
      // regeneração fora de combate (mesma do jogo offline)
      if (this.world.time - a.lastCombat > 5) this.world.heal(a, a.maxHp * 0.03 * TICK_DT, true);
      p.portalCd = Math.max(0, p.portalCd - TICK_DT);
      if (p.portalCd <= 0 && this.onPortal) {
        for (const pt of this.world.zone.portals ?? []) if (Math.hypot(pt.x - a.x, pt.y - a.y) < 50) { this.onPortal(p, pt); break; }
      }
    }
    this.flushT -= TICK_DT;
    if (this.flushT <= 0) { this.flushT = FLUSH_EVERY; for (const p of this.players.values()) this.flush(p); }
    if (this.tick % SNAPSHOT_EVERY === 0) this.broadcast();
    if (!this.humans().length && !this.players.size) this.closed = true;
  }

  onPlayerDeath(actor) {
    const p = this.players.get(actor.id);
    if (!p || p.left) return;
    p.deadAt = this.clock; p.pend.deaths++;
  }
  respawn(p) {
    const a = p.actor;
    a.dead = false; a.deadT = 0; a.hp = Math.round(a.maxHp * 0.5); a.stunT = 0; a.buffs = []; a.x = p.entry.x; a.y = p.entry.y; p.deadAt = null;
    this.events.push({ e: 'revive', actor: a.id });
  }

  // ---- recompensas: o servidor sorteia tudo ----
  onMobKilled(m) {
    const M = MOBS[m.mobId];
    const mul = M.xp * (m.boss ? 10 : m.elite ? 3 : 1);
    for (const p of this.alive()) {
      const a = p.actor;
      if (Math.hypot(a.x - m.x, a.y - m.y) > SHARE_RADIUS) continue;
      if (!m.summoned) p.pend.xp += mobXp(m.level, a.level, mul); // esbirros de chefe não dão XP nem loot
      p.pend.kills.push({ mobId: m.mobId, boss: !!m.boss });
      for (const d of rollMobLoot(this.rng, m, p.classId, p.pity)) {
        if (d.kind === 'gold') p.pend.gold += d.amount;
        else if (d.kind === 'potion') p.pend.potions += d.amount;
        else if (d.kind === 'item') p.pend.items.push({ ...d.item, id: 'i' + randomBytes(9).toString('base64url') });
        else if (d.kind === 'essence') p.pend.essences.push(createSpirit(this.rng, { luck: d.luck, level: Math.max(1, a.level - 2) }));
      }
    }
  }

  // Grava o lote pendente do jogador (operação idempotente). Devolve o resumo ou null.
  flush(p) {
    const b = p.pend;
    if (!p.charId || !this.db || !(b.xp || b.gold || b.potions || b.items.length || b.essences.length || b.kills.length || b.deaths)) return null;
    b.pity = { ...p.pity }; p.pend = emptyBatch();
    const opId = `zone:${this.matchId}:${p.charId}:${++this.flushSeq}`;
    try {
      const out = this.db.applyOperation(opId, p.charId, 'zone', (doc) => applyZoneBatch(doc, { ...b, zoneId: this.zoneId }));
      if (out.duplicate) return null;
      if (p.session) p.session.char = out.doc;
      this.syncLevel(p, out.doc); // equipamento/atributos gravados pela API desde a entrada valem a partir daqui
      this.db.audit('zone_reward', { accountId: p.accountId, detail: JSON.stringify({ room: this.matchId, char: p.charId, zone: this.zoneId, ...out.summary }) });
      if (p.session?.ws && p.session.player === p) this.send.to(p.session, { t: 'zone_reward', ...out.summary, gold_total: out.doc.gold, xp_total: out.doc.xp });
      return out.summary;
    } catch (e) {
      // a operação reverteu (nada foi gravado): devolve o lote ao pendente para a próxima tentativa, em vez de perder a recompensa
      const n = p.pend;
      n.xp += b.xp; n.gold += b.gold; n.potions += b.potions; n.deaths += b.deaths;
      n.items.unshift(...b.items); n.essences.unshift(...b.essences); n.kills.unshift(...b.kills);
      try { this.db.audit('zone_reward_error', { accountId: p.accountId, detail: e.message }); } catch { /* sem auditoria */ }
      return null;
    }
  }
  // subiu de nível no servidor: o ator recalcula atributos e recupera a vida (como onLevelUp do jogo)
  syncLevel(p, doc) {
    const fresh = makeHeroActor(doc, p.actor.x, p.actor.y, 'player', 1);
    const levelUp = fresh.level !== p.actor.level;
    Object.assign(p.actor, { level: fresh.level, stats: fresh.stats, maxHp: fresh.maxHp, hp: levelUp ? fresh.maxHp : Math.min(p.actor.hp, fresh.maxHp) });
  }

  leave(p, reason = 'left') {
    if (p.left) return;
    this.flush(p);
    p.left = true;
    this.world.actors = this.world.actors.filter((a) => a !== p.actor);
    this.left.push(p.actor.id);
    if (p.session) { p.session.room = null; p.session.player = null; }
    this.events.push({ e: 'left', actor: p.actor.id });
    void reason;
    this.players.delete(p.actor.id);
  }
  // para o Hub: fechar a sala (desligamento do servidor) grava tudo
  flushAll() { for (const p of this.players.values()) this.flush(p); }

  // ---- snapshots (compactos e por delta) ----
  meta() {
    return { v: PROTOCOL_VERSION, t: 'snap', room: this.id, mode: 'zone', zone: this.zoneId, tick: this.tick, state: 'fight', countdown: 0, winner: 0, reason: null };
  }
  statics(list) { return list.map((p) => ({ id: p.actor.id, name: p.name, classId: p.classId, level: p.actor.level, maxHp: p.actor.maxHp })); }
  meJson(p) {
    const a = p.actor;
    return JSON.stringify({ spd: Math.round(a.stats.moveSpeed * a.speedMul * (a.slowT > 0 ? 1 - a.slowAmt : 1)), c: [r1(a.cds.basic), r1(a.cds.s0), r1(a.cds.s1), r1(a.cds.s2)] });
  }
  frameFor(commit) {
    const tuples = [...this.players.values()].filter((p) => !p.left).map((p) => actorTuple(p.actor, !!p.session?.ws));
    const ms = this.mobs().filter((m) => !m.dead || m.deadT < 0.6);
    return this.enc.frame(tuples, ms.map(mobTuple), new Map(ms.map((m) => [m.id, mobStatic(m)])), { commit, forceKey: !commit });
  }
  broadcast() {
    const f = this.frameFor(true);
    const ev = this.events; this.events = [];
    const extra = {};
    if (this.joined.length) extra.pj = this.statics(this.joined);
    if (this.left.length) extra.pl = this.left;
    this.joined = []; this.left = [];
    const head = JSON.stringify({ ...this.meta(), ...f, ...extra, events: ev }).slice(0, -1);
    for (const p of this.humans()) {
      if (!(p.session.ws && p.session.player === p)) continue;
      const msg = head + `,"ack":${p.lastSeq},"me":${this.meJson(p)}}`;
      this.bytes = msg.length;
      this.send.raw(p.session, msg);
    }
  }
  // quem entra/reconecta recebe um quadro-chave completo + todos os jogadores da sala (`pj` completo é idempotente no decodificador)
  sendKeyframe(session) {
    const p = session.player;
    if (!p) return;
    const f = this.frameFor(false);
    this.send.raw(session, JSON.stringify({ ...this.meta(), ...f, pj: this.statics([...this.players.values()].filter((q) => !q.left)), events: [] }).slice(0, -1) + `,"ack":${p.lastSeq},"me":${this.meJson(p)}}`);
  }
}
