// Codificador de snapshots por delta (ver public/src/core/snapshot.js). Uma instância por sala.
// frame(): recebe as entidades como tuplas e devolve { a, m, n, g, k } só com o que mudou desde o snapshot anterior (ou tudo, no quadro-chave).
import { F, KEYFRAME_EVERY } from '../public/src/core/snapshot.js';
import { lookCode } from '../public/src/core/aura.js';

const r1 = (n) => Math.round(n * 10) / 10;
// Tuplas são comparadas elemento a elemento com a anterior (guardada por referência: nunca é alterada depois); antes viravam texto a cada quadro.
const sameT = (a, b) => { if (!b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
// 8º elemento = aura de evolução (spec+tier, core/aura.js); só entra quando há aura, então o formato antigo continua válido.
export const actorTuple = (a, online, extra = 0) => {
  const t = [a.id, r1(a.x), r1(a.y), Math.round(a.hp), Math.round(a.facing * 100),
    (a.dead ? F.DEAD : 0) | (a.moving ? F.MOVING : 0) | (a.swing > 0 ? F.SWING : 0) | (a.stunT > 0 ? F.STUN : 0) | (online ? 0 : F.OFFLINE) | extra, Math.round(a.shield)];
  if (a.spec) { const lk = lookCode(a); if (lk) t.push(lk); }
  return t;
};
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
  // Sem alocar à toa (P11.6): sem texto por tupla (compara elemento a elemento) e laços simples no lugar de filter/map encadeados. Saída idêntica.
  // `mobStatics`: Map id -> estático, ou função id -> estático (só chamada para monstros novos: evita montar o estático de todos a cada quadro).
  frame(actorTuples, mobTuples = [], mobStatics = new Map(), { commit = true, forceKey = false } = {}) {
    const key = forceKey || this.count % KEYFRAME_EVERY === 0;
    const a = [], m = [];
    for (let i = 0; i < actorTuples.length; i++) if (key || !sameT(actorTuples[i], this.prevA.get(actorTuples[i][0]))) a.push(actorTuples[i]);
    for (let i = 0; i < mobTuples.length; i++) if (key || !sameT(mobTuples[i], this.prevM.get(mobTuples[i][0]))) m.push(mobTuples[i]);
    const alive = new Set();
    for (const t of mobTuples) alive.add(t[0]);
    const n = [];
    const fresh = forceKey && !commit;
    for (const id of alive) if (fresh || !this.known.has(id)) { const st = typeof mobStatics === 'function' ? mobStatics(id) : mobStatics.get(id); if (st) n.push(st); }
    const g = [];
    if (commit) for (const id of this.known) if (!alive.has(id)) g.push(id);
    if (commit) {
      for (let i = 0; i < actorTuples.length; i++) this.prevA.set(actorTuples[i][0], actorTuples[i]);
      for (let i = 0; i < mobTuples.length; i++) this.prevM.set(mobTuples[i][0], mobTuples[i]);
      for (const id of g) { this.known.delete(id); this.prevM.delete(id); }
      for (const id of alive) this.known.add(id);
      this.count++;
    }
    const out = { k: key ? 1 : 0, a };
    if (mobTuples.length || g.length || n.length || this.known.size) { out.m = m; if (n.length) out.n = n; if (g.length) out.g = g; }
    return out;
  }
}
