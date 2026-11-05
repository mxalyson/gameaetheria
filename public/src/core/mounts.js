// Regras puras das montarias (sem DOM): posse, recusas de montar, Apito, queda do Apito e código de rede. Dados em data/mounts.js; velocidade e desmontar em game/sim.js.
import { MOUNTS, MOUNT_IDS, WHISTLE, WHISTLE_MOUNTS, MOUNT_COMBAT_GRACE } from '../data/mounts.js';
import { QUESTS } from '../data/quests.js';
import { ACHIEVEMENTS } from '../data/achievements.js';

// Montarias que o personagem GANHOU por missão ou conquista (derivadas: o cliente não "se concede" nenhuma; o servidor recalcula pelo mesmo caminho).
export function derivedMounts(doc) {
  const out = new Set();
  for (const id of Object.keys(doc?.quests?.done ?? {})) { const m = QUESTS[id]?.reward?.mount; if (m && MOUNTS[m]) out.add(m); }
  for (const a of ACHIEVEMENTS) if (a.mount && MOUNTS[a.mount] && doc?.achievements?.[a.id] != null) out.add(a.mount);
  return out;
}

// Todas as montarias possuídas (lista salva + derivadas), na ordem de MOUNT_IDS e sem repetir.
export function ownedMounts(doc) {
  const have = new Set(Array.isArray(doc?.mounts) ? doc.mounts.filter((m) => MOUNTS[m]) : []);
  for (const m of derivedMounts(doc)) have.add(m);
  return MOUNT_IDS.filter((id) => have.has(id));
}

// Montaria escolhida: a salva, se for sua; senão a primeira que tiver; senão null.
export function activeMount(doc) {
  const own = ownedMounts(doc);
  return own.includes(doc?.mount) ? doc.mount : (own[0] ?? null);
}

// Pode montar agora? Devolve o código de recusa (data/mounts.js MOUNT_REASONS) ou null. `a` = ator; `ctx.zoneOk` = zona permitida (RUN_ZONES), `ctx.time` = relógio do mundo.
export function mountProblem(a, { zoneOk, time }) {
  if (!a.mounts?.length || !a.mountId) return 'none';
  if (a.dead) return 'dead';
  if (a.stunT > 0) return 'stun';
  if (!zoneOk) return 'zone';
  if (time - a.lastCombat < MOUNT_COMBAT_GRACE) return 'combat';
  return null;
}

// Código compacto de rede: índice + 1 em MOUNT_IDS (0 = sem montaria).
export const mountCode = (id) => { const i = MOUNT_IDS.indexOf(id); return i < 0 ? 0 : i + 1; };
export const mountFromCode = (c) => MOUNT_IDS[c - 1] ?? null;

// Usar um Apito: gasta 1 e concede uma montaria de `WHISTLE_MOUNTS` que o personagem ainda não tem (sorteio com o RNG de quem decide: o servidor online). Altera `doc`.
export function useWhistle(doc, rng) {
  if ((doc.whistles ?? 0) < 1) return { ok: false, reason: 'Você não tem Apito de Montaria.' };
  const own = new Set(ownedMounts(doc)), free = WHISTLE_MOUNTS.filter((m) => !own.has(m));
  if (!free.length) return { ok: false, reason: 'Você já tem todas as montarias que o Apito chama.' };
  const mount = rng.pick(free);
  doc.whistles--;
  doc.mounts = ownedMounts({ ...doc, mounts: [...(doc.mounts ?? []), mount] });
  if (!doc.mount) doc.mount = mount;
  return { ok: true, mount, whistles: doc.whistles };
}

// Soma Apitos ao personagem (teto WHISTLE.max). Devolve quantos entraram de fato.
export function addWhistles(doc, n = 1) {
  const before = doc.whistles ?? 0;
  doc.whistles = Math.min(WHISTLE.max, before + n);
  return doc.whistles - before;
}

// Queda do Apito de um chefe: chance base + passo por chefe abatido sem queda (pity, objeto mutável { whistle }), garantida no teto. Sem pity (cooperativo, testes) não rola.
export function rollBossWhistle(rng, pity) {
  if (!pity) return false;
  const W = WHISTLE.boss, miss = pity.whistle ?? 0;
  const p = miss >= W.cap ? 1 : W.base + W.step * miss;
  if (rng.chance(p)) { pity.whistle = 0; return true; }
  pity.whistle = miss + 1;
  return false;
}
