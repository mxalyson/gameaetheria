// Codificador de snapshots por delta (ver public/src/core/snapshot.js). Uma instância por sala.
// frame(): recebe as entidades como tuplas e devolve { a, m, n, g, k } só com o que mudou desde o snapshot anterior (ou tudo, no quadro-chave).
import { F, KEYFRAME_EVERY } from '../public/src/core/snapshot.js';

const r1 = (n) => Math.round(n * 10) / 10;
export const actorTuple = (a, online, extra = 0) => [a.id, r1(a.x), r1(a.y), Math.round(a.hp), Math.round(a.facing * 100),
  (a.dead ? F.DEAD : 0) | (a.moving ? F.MOVING : 0) | (a.swing > 0 ? F.SWING : 0) | (a.stunT > 0 ? F.STUN : 0) | (online ? 0 : F.OFFLINE) | extra, Math.round(a.shield)];
export const mobTuple = (m) => [m.id, r1(m.x), r1(m.y), Math.round(m.hp), Math.round(m.facing * 100), (m.dead ? F.DEAD : 0) | (m.moving ? F.MOVING : 0) | (m.swing > 0 ? F.SWING : 0)];
// Marcas extras (mini-chefe, esbirro, acampamento) só entram quando existem; o nome vai uma vez só, no estático.
export const mobStatic = (m) => {
  const s = { id: m.id, mob: m.mobId, level: m.level, boss: !!m.boss, elite: !!m.elite, maxHp: m.maxHp };
  if (m.miniboss) { s.mb = 1; s.nm = m.name; s.r = Math.round(m.r); }
  if (m.summoned) s.su = 1;
  if (m.camp) s.cp = m.camp;
  return s;
};

export class DeltaEncoder {
  constructor() { this.prevA = new Map(); this.prevM = new Map(); this.known = new Set(); this.count = 0; }

  // commit=false gera um quadro-chave SEM alterar o estado do codificador (usado para quem reconecta no meio da partida)
  frame(actorTuples, mobTuples = [], mobStatics = new Map(), { commit = true, forceKey = false } = {}) {
    const key = forceKey || this.count % KEYFRAME_EVERY === 0;
    const pick = (list, prev) => list.filter((t) => key || prev.get(t[0]) !== t.join(','));
    const a = pick(actorTuples, this.prevA), m = pick(mobTuples, this.prevM);
    const alive = new Set(mobTuples.map((t) => t[0]));
    const n = [...alive].filter((id) => forceKey && !commit ? true : !this.known.has(id)).map((id) => mobStatics.get(id)).filter(Boolean);
    const g = commit ? [...this.known].filter((id) => !alive.has(id)) : [];
    if (commit) {
      for (const t of actorTuples) this.prevA.set(t[0], t.join(','));
      for (const t of mobTuples) this.prevM.set(t[0], t.join(','));
      for (const id of g) { this.known.delete(id); this.prevM.delete(id); }
      for (const id of alive) this.known.add(id);
      this.count++;
    }
    const out = { k: key ? 1 : 0, a };
    if (mobTuples.length || g.length || n.length || this.known.size) { out.m = m; if (n.length) out.n = n; if (g.length) out.g = g; }
    return out;
  }
}
