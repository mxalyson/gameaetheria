// Sala de EXPLORAÇÃO (PvE autoritativo, P11): uma instância de zona (Bosque, Planície ou Ruínas) para 1 jogador ou um grupo (até 4).
// Mesma simulação do jogo (World com mobs, respawn e chefe). O servidor decide movimento, dano, morte, XP, ouro e loot; o cliente só
// envia intenções. Recompensas acumulam por jogador e são gravadas em lote numa operação idempotente (a cada FLUSH_EVERY s, ao sair e ao fechar).
// Mesma interface das outras salas (o Hub trata todas igual). Loot é individual: cada membro rola o seu (classe própria → arma certa).
import { randomBytes } from 'node:crypto';
import { World, makeHeroActor, makeSpiritActor, PICK_R, PICK_DELAY } from '../public/src/game/sim.js';
import { INVENTORY_SIZE } from '../public/src/data/items.js';
import { makeRng } from '../public/src/core/rng.js';
import { mobXp, createSpirit, xpToNext, MAX_LEVEL } from '../public/src/core/progression.js';
import { rollMobLoot } from '../public/src/core/loot.js';
import { MOUNT_MUL } from '../public/src/data/mounts.js';
import { applyZoneBatch } from '../public/src/core/rewards.js';
import { MOBS, XP_MULT } from '../public/src/data/mobs.js';
import { RARITY } from '../public/src/data/items.js';
import { ZONES } from '../public/src/data/zones.js';
import { TICK_DT, SNAPSHOT_EVERY, PROTOCOL_VERSION } from '../public/src/core/protocol.js';
import { POTION_HEAL, POTION_COOLDOWN } from './tx.js';
import { respawnPoint, hasDeathPenalty } from '../public/src/core/phoenix.js';
import { wire } from './wire.js';
import { DeltaEncoder, actorTuple, mobTuple, mobStatic } from './snapshot.js';

export const FLUSH_EVERY = 10;   // s entre gravações de recompensas
export const RESPAWN_MIN = 1.5;  // s mínimos caído antes do botão de renascer valer (a animação de queda termina)
export const RESPAWN_AFTER = 4;  // s morto até renascer na entrada da zona
const SHARE_RADIUS = 900;        // quem está longe do abate não ganha nada dele
const r1 = (n) => Math.round(n * 10) / 10;
const idle = () => ({ mx: 0, my: 0, aimX: 0, aimY: 0, attack: false, cast: null });
const emptyBatch = () => ({ xp: 0, gold: 0, potions: 0, whistles: 0, items: [], essences: [], kills: [], skills: [], deaths: 0, frags: 0, crypt: false });

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
    this.world = new World(zoneId, { seed, visuals: false, bossState: this.bossState, night: true });
    this.populated = false;
    this.state = 'fight'; this.countdown = 0; this.winner = 0; this.reason = null; this.closed = false;
    this.clock = 0; this.tick = 0; this.events = []; this.enc = new DeltaEncoder();
    this.players = new Map();
    this.joined = []; this.left = []; this.flushSeq = 0; this.flushT = FLUSH_EVERY; this.dropSeq = 0;
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
    this.spawnSpirit(p);
    session.room = this; session.player = p;
    this.joined.push(p);
    return p;
  }

  // Spirit ativo do documento como ator da sala (ataca, busca e dá o bônus de velocidade do Zéfiro, igual ao jogo). Troca de spirit = chamar de novo.
  spawnSpirit(p) {
    const w = this.world, c = p.session?.char;
    w.actors = w.actors.filter((a) => !(a.kind === 'spirit' && a.owner === p.actor.id));
    const sp = c?.spirits?.find((x) => x.id === c.activeSpirit);
    p.actor.speedMul = sp?.type === 'zephyr' ? 1.12 : 1;
    if (sp) w.add(makeSpiritActor(sp, p.actor));
  }

  // Poção: pode usar? (vivo, vida incompleta, recarga). Devolve o código de recusa ou null. O débito da poção é feito pela transação (server/tx.js).
  potionProblem(p) {
    if (p.left || p.actor.dead) return 'dead';
    if (p.actor.hp >= p.actor.maxHp) return 'full';
    if (this.clock < (p.potionAt ?? -Infinity) + POTION_COOLDOWN) return 'cooldown';
    return null;
  }
  // Depois de uma transação aplicada com sucesso: efeitos na simulação (cura da poção, spirit novo, nível/atributos do documento novo).
  afterTx(p, m, doc) {
    if (p.session) p.session.char = doc;
    if (m.op === 'potion') { p.potionAt = this.clock; this.world.heal(p.actor, p.actor.maxHp * POTION_HEAL); }
    else if (m.op === 'spirit_set') this.spawnSpirit(p);
    this.syncLevel(p, doc);
  }

  input(session, m) {
    const p = session.player;
    if (!p || p.left) return;
    if (m.seq <= p.lastSeq) { this.send.stats.staleInputs++; return; }
    p.lastSeq = m.seq;
    if (m.pick != null) p.actor.spiritPick = m.pick; // máscara do que o spirit busca (game/sim.js spiritWants); vale por jogador
    p.input = { mx: m.mx, my: m.my, aimX: m.aimX, aimY: m.aimY, attack: m.attack, cast: m.cast ?? p.input.cast, run: m.run === true, mount: m.mount ?? p.input.mount }; // mount: pedido de montar/desmontar, entregue uma vez só (como cast); quem decide é World.applyIntent
  }
  dropped(session) { const p = session.player; if (p && !p.left) { p.dropT = this.clock; p.input = idle(); } }
  resumed(session) { const p = session.player; if (p && !p.left) p.dropT = null; }

  step() {
    this.tick++; this.clock += TICK_DT;
    for (const p of this.players.values()) {
      if (!p.left && p.session && !p.session.ws && p.dropT != null && this.clock - p.dropT > this.reconnectSec) this.leave(p, 'timeout');
    }
    const intents = {};
    let ref = null; // primeiro jogador vivo (referência dos respawns), sem montar arrays
    for (const p of this.players.values()) {
      if (p.left) continue;
      intents[p.actor.id] = p.actor.dead ? { mx: 0, my: 0 } : { ...p.input };
      p.input.cast = null; p.input.mount = undefined;
      if (!ref && !p.actor.dead) ref = p.actor;
    }
    if (ref) this.world.updateSpawns(TICK_DT, ref);
    this.world.update(TICK_DT, intents);
    const evs = this.world.events;
    for (let i = 0; i < evs.length; i++) { const ev = evs[i];
      if (ev.type === 'death' && ev.actor.kind === 'mob') this.onMobKilled(ev.actor);
      else if (ev.type === 'death' && ev.actor.kind === 'player') this.onPlayerDeath(ev.actor);
      else if (ev.type === 'cast' && ev.actor.kind === 'player') this.players.get(ev.actor.id)?.pend.skills.push(ev.skill); // Prova do Mestre / Maestria (skillUse)
      const w = wire(ev); if (w) this.events.push(w);
    }
    evs.length = 0;
    this.afterEvents?.(); // gancho das subclasses (server/crypt.js: ondas, portões e fim da masmorra)
    for (const p of this.players.values()) {
      if (p.left) continue;
      const a = p.actor;
      if (a.dead) { if (p.deadAt != null && this.clock - p.deadAt >= RESPAWN_AFTER) this.respawn(p); continue; }
      // regeneração fora de combate (mesma do jogo offline)
      if (this.world.time - a.lastCombat > 5) this.world.heal(a, a.maxHp * 0.03 * TICK_DT, true);
      this.collectDrops(p);
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
    // Zona de farm: a queda é cobrada AGORA (Amuleto da Fênix consome 1 e evita a perda); o resumo vai ao cliente em zone_reward. Arenas e Cripta: sem penalidade.
    if (hasDeathPenalty(this.zoneId)) this.flush(p);
  }
  // Pedido do jogador para renascer já: só depois de RESPAWN_MIN s caído (a penalidade já foi cobrada na queda) e nunca na Cripta (lá vale o ciclo da masmorra).
  respawnNow(p) {
    if (!p || p.left || !p.actor.dead || p.deadAt == null || this.zoneId === 'crypt') return;
    if (this.clock - p.deadAt >= RESPAWN_MIN) this.respawn(p);
  }
  respawn(p) {
    const a = p.actor;
    a.dead = false; a.deadT = 0; a.hp = Math.round(a.maxHp * 0.5); a.stunT = 0; a.buffs = [];
    const rp = respawnPoint(p.session?.char, this.zoneId, p.entry); // última Pedra de Retorno desta zona; sem ela, a entrada
    a.x = rp.x; a.y = rp.y; p.deadAt = null;
    this.events.push({ e: 'revive', actor: a.id });
  }

  // ---- recompensas: o servidor sorteia tudo ----
  onMobKilled(m) {
    const M = MOBS[m.mobId];
    if (m.summoned) return; // esbirros de chefe: sem XP, loot NEM abate (nem missão/conquista), igual ao jogo offline (main.js onMobKilled)
    const rm = this.world.nightMods?.rewardMul ?? 1; // bônus noturno (relógio do servidor), só em zonas com ciclo
    const mul = M.xp * (m.boss ? XP_MULT.boss : m.elite ? XP_MULT.elite : 1) * rm;
    for (const p of this.alive()) {
      const a = p.actor;
      if (Math.hypot(a.x - m.x, a.y - m.y) > SHARE_RADIUS) continue;
      const xp = Math.round(mobXp(m.level, a.level, mul));
      p.pend.xp += xp;
      p.pend.kills.push({ mobId: m.mobId, boss: !!m.boss, mini: !!m.miniboss, spiritType: this.spiritTypeOf(p) });
      // igual ao jogo offline: ouro direto na bolsa (com o "+N" na hora); item, poção e essência CAEM no chão para o dono pegar (ou o spirit buscar)
      let gold = 0;
      for (const d of rollMobLoot(this.rng, m, p.classId, p.pity, rm)) {
        if (d.kind === 'gold') { p.pend.gold += d.amount; gold += d.amount; }
        else if (d.kind === 'whistle') p.pend.whistles += d.amount; // Apito de Montaria (contador, não cai no chão)
        else this.dropFor(p, m, d);
      }
      this.sendTo(p, { t: 'zone_loot', gold, xp }); // aviso imediato (a gravação no banco continua em lote, a cada FLUSH_EVERY s)
      if (this.wouldLevel(p)) this.flush(p); // subiu de nível: grava já (vida cheia, pontos e o aviso "Nível N!" na hora, como no offline)
    }
  }
  sendTo(p, msg) { if (p.session?.ws && p.session.player === p) this.send.to(p.session, msg); }
  // o XP pendente completa o nível do documento oficial?
  wouldLevel(p) { const c = p.session?.char; return !!c && c.level < MAX_LEVEL && (c.xp ?? 0) + p.pend.xp >= xpToNext(c.level); }

  // ---- drops no chão (com dono): o mesmo World.drops do jogo; expiram em DROP_LIFE e o spirit do dono busca (game/sim.js) ----
  dropFor(p, m, loot) {
    const id = 'd' + (++this.dropSeq).toString(36);
    const r = this.rng, d = { ...loot, id, owner: p.actor.id, x: m.x + r.range(-26, 26), y: m.y + r.range(-18, 18), vx: 0, vy: 0, t: 0 };
    if (d.kind === 'item') d.item = { ...d.item, id: 'i' + randomBytes(9).toString('base64url') };
    this.world.drops.push(d);
    this.sendTo(p, { t: 'zone_drop', id, kind: d.kind, x: Math.round(d.x), y: Math.round(d.y), amount: d.amount, item: d.item ? { name: d.item.name, rarity: d.item.rarity, opal: !!d.item.opal, slot: d.item.slot, classId: d.item.classId, weaponType: d.item.weaponType, level: d.item.level } : undefined });
  }
  // coleta do dono: passou por cima (PICK_R, depois de PICK_DELAY s) ou o spirit trouxe. Mochila cheia: o item fica no chão com aviso (como no offline);
  // trazido pelo spirit com a mochila cheia vira ouro (também como no offline).
  collectDrops(p) {
    const a = p.actor, w = this.world;
    let changed = false;
    for (const d of w.drops) {
      if (d.owner !== a.id || d.taken) continue;
      if (!d.fetched && (d.t < PICK_DELAY || Math.hypot(d.x - a.x, d.y - a.y) > PICK_R)) continue;
      const out = { t: 'zone_pickup', id: d.id, kind: d.kind };
      if (d.kind === 'item') {
        const full = (p.session?.char?.inventory?.length ?? 0) + p.pend.items.length >= INVENTORY_SIZE;
        if (full && !d.fetched) { if (!d.warned) { d.warned = true; this.sendTo(p, { t: 'zone_full' }); } continue; }
        if (full) { p.pend.gold += d.item.value ?? 0; out.gold = d.item.value ?? 0; } else p.pend.items.push(d.item);
        out.item = { name: d.item.name, rarity: d.item.rarity, opal: !!d.item.opal };
      } else if (d.kind === 'potion') { p.pend.potions += d.amount; out.amount = d.amount; }
      else if (d.kind === 'essence') { p.pend.essences.push(createSpirit(this.rng, { luck: d.luck, level: Math.max(1, a.level - 2) })); }
      d.taken = true; changed = true;
      this.sendTo(p, out);
    }
    if (changed) w.drops = w.drops.filter((d) => !d.taken);
  }

  // Tipo do spirit ativo do personagem (a sala de zona não tem o ator do spirit; vale o do documento): conta para a missão de evolução.
  spiritTypeOf(p) { const c = p.session?.char; return c?.spirits?.find((s) => s.id === c.activeSpirit)?.type; }

  // Grava o lote pendente do jogador (operação idempotente). Devolve o resumo ou null.
  flush(p) {
    const b = p.pend;
    if (!p.charId || !this.db || !(b.xp || b.gold || b.potions || b.whistles || b.items.length || b.essences.length || b.kills.length || b.skills.length || b.deaths || b.frags || b.crypt)) return null;
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
      n.xp += b.xp; n.gold += b.gold; n.potions += b.potions; n.whistles += b.whistles; n.deaths += b.deaths; n.frags += b.frags; n.crypt = n.crypt || b.crypt;
      n.items.unshift(...b.items); n.essences.unshift(...b.essences); n.kills.unshift(...b.kills); n.skills.unshift(...b.skills);
      try { this.db.audit('zone_reward_error', { accountId: p.accountId, detail: e.message }); } catch { /* sem auditoria */ }
      return null;
    }
  }
  // documento novo (nível, Maestria, equipamento, atributos): o ator recalcula tudo NA HORA e recupera a vida só se subiu de nível (como onLevelUp do jogo).
  // Chamado no lote de recompensas e em afterTx (qualquer transação aplicada com o jogador na sala: equip/alloc/entrega de missão).
  syncLevel(p, doc) {
    const fresh = makeHeroActor(doc, p.actor.x, p.actor.y, 'player', 1);
    const levelUp = fresh.level !== p.actor.level;
    Object.assign(p.actor, { level: fresh.level, spec: fresh.spec, mastery: fresh.mastery, mounts: fresh.mounts, mountId: fresh.mountId, stats: fresh.stats, maxHp: fresh.maxHp, hp: levelUp ? fresh.maxHp : Math.min(p.actor.hp, fresh.maxHp) });
  }

  leave(p, reason = 'left') {
    if (p.left) return;
    this.flush(p);
    p.left = true;
    this.world.actors = this.world.actors.filter((a) => a !== p.actor && !(a.kind === 'spirit' && a.owner === p.actor.id));
    this.world.drops = this.world.drops.filter((d) => d.owner !== p.actor.id); // como no offline: sair da zona deixa para trás o que ficou no chão
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
    return JSON.stringify({ spd: Math.round(a.stats.moveSpeed * a.speedMul * (a.mounted ? MOUNT_MUL : 1) * (a.slowT > 0 ? 1 - a.slowAmt : 1)), c: [r1(a.cds.basic), r1(a.cds.s0), r1(a.cds.s1), r1(a.cds.s2), r1(a.cds.s3 ?? 0)] });
  }
  frameFor(commit) {
    const tuples = [...this.players.values()].filter((p) => !p.left).map((p) => actorTuple(p.actor, !!p.session?.ws));
    const ms = this.mobs().filter((m) => !m.dead || m.deadT < 0.6);
    const byId = (this._msById ??= new Map()); byId.clear(); // reutilizado: o estático só é montado para monstros novos (frame chama por id)
    for (const m of ms) byId.set(m.id, m);
    return this.enc.frame(tuples, ms.map(mobTuple), (id) => { const m = byId.get(id); return m ? mobStatic(m) : undefined; }, { commit, forceKey: !commit });
  }
  // Ritual do chefe final para o HUD: [abates, necessário, recarga em minutos, presságio 0|1, chefe vivo 0|1]; null se a zona não tem ritual.
  // Vai só quando muda (e em todo quadro-chave): a recarga é em minutos inteiros, então são poucos envios.
  ritualTuple() {
    const r = this.world.bossProgress;
    return r ? [r.have, r.need, Math.ceil(r.cool / 60), r.omen ? 1 : 0, r.alive ? 1 : 0] : null;
  }
  broadcast() {
    const f = this.frameFor(true);
    const ev = this.events; this.events = [];
    const extra = {};
    const rt = this.ritualTuple(), rts = rt?.join(',');
    if (rt && (f.k === 1 || rts !== this.lastRt)) extra.rt = rt;
    this.lastRt = rts;
    const hud = this.hudTuple?.(), hs = hud?.join(',');
    if (hud && (f.k === 1 || hs !== this.lastHud)) extra.cr = hud;
    this.lastHud = hs;
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
    const f = this.frameFor(false), rt = this.ritualTuple(), hud = this.hudTuple?.();
    this.send.raw(session, JSON.stringify({ ...this.meta(), ...f, ...(rt ? { rt } : {}), ...(hud ? { cr: hud } : {}), pj: this.statics([...this.players.values()].filter((q) => !q.left)), events: [] }).slice(0, -1) + `,"ack":${p.lastSeq},"me":${this.meJson(p)}}`);
  }
}
