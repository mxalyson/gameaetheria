// Morte em zona de farm: pontos de retorno (Pedras de Retorno) e Amuleto da Fênix. Regras puras, sem DOM, usadas pelo jogo offline,
// pela instância do servidor (server/zone.js) e pelas transações (server/tx.js). Dados das pedras: data/zones.js (`checkpoints`).
import { ZONES } from '../data/zones.js';

export const PHOENIX = {
  name: 'Amuleto da Fênix',
  price: 800,        // ouro (Mercadora Lia e Mercador do Porto)
  max: 20,           // pilha máxima no documento (`phoenix`)
  goldLoss: 0.10,    // fração do ouro carregado perdida ao cair (regra que já existia: −10%)
  xpLoss: 0.10,      // fração do XP do NÍVEL ATUAL perdida ao cair (nunca desce de nível)
  reach: 80,         // px para tocar a pedra (o servidor confere a 130)
  below: 46,         // o herói renasce logo abaixo da pedra (ela tem colisão)
};

// Só zonas de farm (com monstros, não seguras, fora da masmorra) têm penalidade de morte; arenas e a Cripta não.
export const hasDeathPenalty = (zoneId) => { const z = ZONES[zoneId]; return !!(z && z.mobs && !z.safe && !z.dungeon); };

export const checkpointsOf = (zoneId) => ZONES[zoneId]?.checkpoints ?? [];
export const stoneAt = (zoneId, x, y) => checkpointsOf(zoneId).find((s) => s.x === x && s.y === y) ?? null;

// Grava o ponto no personagem (muda `c`). `stoneId` precisa existir na zona. Devolve a pedra ou null.
export function setCheckpoint(c, zoneId, stoneId) {
  const s = checkpointsOf(zoneId).find((q) => q.id === stoneId);
  if (!s) return null;
  c.checkpoint = { zone: zoneId, x: s.x, y: s.y };
  return s;
}

// Onde o herói renasce na zona: na pedra salva DESTA zona, senão em `fallback` (a entrada). Nunca uma pedra de outra zona.
export function respawnPoint(c, zoneId, fallback) {
  const cp = c?.checkpoint;
  if (cp && cp.zone === zoneId && stoneAt(zoneId, cp.x, cp.y)) return { x: cp.x, y: cp.y + PHOENIX.below, saved: true };
  return { ...fallback, saved: false };
}

// Aplica a queda ao documento (muda `c`): com Amuleto, consome 1 e não perde nada; sem, perde ouro e XP do nível atual.
export function applyDeath(c) {
  if ((c.phoenix ?? 0) > 0) { c.phoenix--; return { saved: true, gold: 0, xp: 0 }; }
  const gold = Math.floor(c.gold * PHOENIX.goldLoss), xp = Math.floor((c.xp ?? 0) * PHOENIX.xpLoss);
  c.gold -= gold; c.xp = (c.xp ?? 0) - xp;
  return { saved: false, gold, xp };
}
