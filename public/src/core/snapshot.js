// Snapshots COMPACTOS e por DELTA (protocolo v4): o que não muda (nome, classe, nível, vida máxima, tipo do monstro) vai uma vez só, em
// `match_found` / `n`; cada snapshot leva só as entidades que mudaram (tuplas curtas); a cada KEYFRAME_EVERY snapshots (e quando alguém
// reconecta) vai um quadro-chave completo. WebSocket entrega em ordem e sem perda, então deltas são seguros. Este arquivo é o DECODIFICADOR
// (cliente e testes); o codificador está em server/snapshot.js. O decodificador devolve o mesmo formato "completo" que os consumidores já usavam.
export const F = { DEAD: 1, MOVING: 2, SWING: 4, STUN: 8, OFFLINE: 16 };
export const KEYFRAME_EVERY = 20; // snapshots (≈ 1 s a 20 Hz)

export class SnapshotDecoder {
  constructor() { this.actors = new Map(); this.mobs = new Map(); this.you = null; }

  // `match_found`: estáticos dos jogadores (id, team, name, classId, level, maxHp, bot)
  init(m) {
    this.you = m.you; this.actors.clear(); this.mobs.clear();
    for (const p of m.players) this.actors.set(p.id, { id: p.id, team: p.team, name: p.name, classId: p.classId, level: p.level, maxHp: p.maxHp, bot: !!p.bot, x: 0, y: 0, hp: p.maxHp, facing: 0, dead: false, moving: false, swing: false, stun: false, shield: 0, online: true });
    return this;
  }

  apply(msg) {
    const key = msg.k === 1;
    // exploração: jogadores entram e saem durante a sala (`pj` = estáticos de quem entrou/está, `pl` = quem saiu)
    for (const p of msg.pj ?? []) if (!this.actors.has(p.id)) this.actors.set(p.id, { id: p.id, team: 1, name: p.name, classId: p.classId, level: p.level, maxHp: p.maxHp, bot: false, x: 0, y: 0, hp: p.maxHp, facing: 0, dead: false, moving: false, swing: false, stun: false, shield: 0, online: true });
    for (const id of msg.pl ?? []) this.actors.delete(id);
    if (key) { for (const id of this.mobs.keys()) this.mobs.set(id, { ...this.mobs.get(id), _seen: false }); }
    for (const t of msg.a ?? []) {
      const a = this.actors.get(t[0]); if (!a) continue;
      a.x = t[1]; a.y = t[2]; a.hp = t[3]; a.facing = t[4] / 100;
      a.dead = !!(t[5] & F.DEAD); a.moving = !!(t[5] & F.MOVING); a.swing = !!(t[5] & F.SWING); a.stun = !!(t[5] & F.STUN); a.online = !(t[5] & F.OFFLINE);
      a.shield = t[6] ?? 0;
    }
    for (const n of msg.n ?? []) this.mobs.set(n.id, { id: n.id, mob: n.mob, level: n.level, boss: !!n.boss, elite: !!n.elite, miniboss: !!n.mb, name: n.nm, r: n.r, summoned: !!n.su, camp: n.cp, maxHp: n.maxHp, x: 0, y: 0, hp: n.maxHp, facing: 0, dead: false, moving: false, swing: false, _seen: true });
    for (const t of msg.m ?? []) {
      const m = this.mobs.get(t[0]); if (!m) continue;
      m.x = t[1]; m.y = t[2]; m.hp = t[3]; m.facing = t[4] / 100;
      m.dead = !!(t[5] & F.DEAD); m.moving = !!(t[5] & F.MOVING); m.swing = !!(t[5] & F.SWING); m._seen = true;
    }
    for (const id of msg.g ?? []) this.mobs.delete(id);
    if (key) for (const [id, m] of this.mobs) if (!m._seen) this.mobs.delete(id);
    const actors = [...this.actors.values()];
    // só o próprio jogador recebe velocidade e recargas (o resto da tela não precisa)
    const mine = this.actors.get(this.you);
    if (mine && msg.me) { mine.spd = msg.me.spd; mine.cds = { basic: msg.me.c[0], s0: msg.me.c[1], s1: msg.me.c[2], s2: msg.me.c[3] }; }
    const out = { ...msg, actors: actors.map((a) => ({ ...a })) };
    delete out.a; delete out.m; delete out.n; delete out.g; delete out.pj; delete out.pl;
    out.mobs = [...this.mobs.values()].map(({ _seen, ...m }) => ({ ...m })); // vazio nas partidas sem monstros
    return out;
  }
}
