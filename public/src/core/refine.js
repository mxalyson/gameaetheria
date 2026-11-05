// Ferreiro Brok, além do aprimoramento: Lapidação (troca UM atributo extra sorteado por outro sorteado) e Ressonância (leva o Eco ao nível atual).
// Nada se escolhe: o jogador paga e a sorte decide qual linha sai e o que entra (pode piorar). Funções puras sobre o documento; o servidor aplica (server/tx.js).
import { RARITY } from '../data/items.js';
import { ECHO_ITEM, ECHO_RECIPES } from '../data/crypt.js';
import { affixPool, rollAffixValue, generateEchoItem, OPAL } from './loot.js';
import { findGear } from './enhance.js';
import { echoFrags, ensureEcho } from './echo.js';

// Base de cada espaço (o que NÃO é afixo). A arma nova traz também o implícito (principal da classe), que fica fora de `affix`.
const BASE_KEYS = { weapon: ['atk'], armor: ['def', 'hp'], helm: ['def'], boots: ['def'], offhand: ['def', 'hp', 'block'], ring: [], amulet: [] };

// Afixos do item. Item novo grava `affix`; item antigo (sem o campo) tem os afixos deduzidos: tudo que não é base do espaço.
// Opala/Eco antigos têm bônus fixos misturados nos atributos: sem `affix` não dá para separar, então não lapidam.
export function affixesOf(it) {
  if (it?.affix) return it.affix;
  if (!it || it.opal || it.eco || it.slot === 'offhand') return {};
  const base = BASE_KEYS[it.slot] ?? [];
  return Object.fromEntries(Object.entries(it.stats ?? {}).filter(([k]) => !base.includes(k)));
}

export const REFINE = { base: 80, perLevel: 20, rarityStep: 0.3, growth: 0.25, growthCap: 3, specialMul: 2 };
// Custo da próxima lapidação: cresce com nível e raridade, e +25% a cada lapidação no mesmo item (até ×3). Opala/Eco custam o dobro.
export function refineCost(it) {
  const r = RARITY[it.rarity]?.index ?? 0;
  const grow = Math.min(REFINE.growthCap, 1 + REFINE.growth * (it.rerolls ?? 0));
  return Math.round((REFINE.base + it.level * REFINE.perLevel * (1 + r * REFINE.rarityStep)) * grow * (it.opal || it.eco ? REFINE.specialMul : 1));
}
export const canRefine = (it) => it?.kind === 'gear' && Object.keys(affixesOf(it)).length > 0;

// Lapidação: sorteia UMA linha de atributo extra e a troca por um afixo sorteado do conjunto normal (pode repetir o mesmo, com outro valor; pode vir de outra classe). Muda o documento.
export function refine(char, id, rng) {
  const it = findGear(char, id);
  if (!it || it.kind !== 'gear') return { ok: false, reason: 'Item não encontrado.' };
  const aff = { ...affixesOf(it) };
  const keys = Object.keys(aff);
  if (!keys.length) return { ok: false, reason: 'Este item não tem atributos extras para lapidar.' };
  const cost = refineCost(it);
  if (char.gold < cost) return { ok: false, reason: `Faltam ${cost - char.gold} de ouro.` };
  const out = keys[Math.floor(rng.next() * keys.length)], outV = aff[out];
  const stats = { ...it.stats };
  stats[out] = (stats[out] ?? 0) - outV;
  if (stats[out] <= 0) delete stats[out];
  delete aff[out];
  // sem repetir os outros afixos nem o que a base já tem (vida/defesa podem somar, como no sorteio original)
  const pool = affixPool(it.slot, stats).filter((a) => !(a.stat in aff)); // vida/defesa da base podem somar, mas nunca duas linhas iguais
  if (!pool.length) return { ok: false, reason: 'Nada para sortear neste item.' };
  const a = pool[Math.floor(rng.next() * pool.length)];
  const mul = it.opal ? OPAL.statMul : it.eco ? ECHO_ITEM.statMul : 1;
  const v = Math.max(1, Math.round(rollAffixValue(rng, a, it.level, RARITY[it.rarity]) * mul));
  stats[a.stat] = (stats[a.stat] ?? 0) + v;
  aff[a.stat] = v;
  char.gold -= cost;
  it.stats = stats; it.affix = aff; it.rerolls = (it.rerolls ?? 0) + 1;
  return { ok: true, cost, out: { stat: out, v: outV }, in: { stat: a.stat, v }, name: it.name };
}

// Ressonância do Eco: refaz a peça Eco no nível ATUAL do personagem (novo sorteio), mantendo o aprimoramento (+N). Fragmentos + ouro.
export const RESONANCE = { frags: 25, goldShare: 0.5 };
export const resonanceCost = (it) => ({ frags: RESONANCE.frags, gold: Math.round((it.slot === 'weapon' ? ECHO_RECIPES.eco_weapon : ECHO_RECIPES.eco_armor).gold * RESONANCE.goldShare) });
export function resonate(char, id, rng) {
  const it = findGear(char, id);
  if (!it || !it.eco) return { ok: false, reason: 'Só peças do Eco ressoam.' };
  if (char.level <= it.level) return { ok: false, reason: 'O Eco já está no seu nível.' };
  const c = resonanceCost(it);
  if (echoFrags(char) < c.frags) return { ok: false, reason: `Faltam fragmentos: ${c.frags} necessários (você tem ${echoFrags(char)}).` };
  if (char.gold < c.gold) return { ok: false, reason: 'Ouro insuficiente.' };
  const fresh = generateEchoItem(rng, Math.max(1, char.level), char.classId, it.slot);
  ensureEcho(char).frags -= c.frags;
  char.gold -= c.gold;
  const from = it.level;
  Object.assign(it, { name: fresh.name, level: fresh.level, reqLevel: fresh.reqLevel, stats: fresh.stats, affix: fresh.affix, value: fresh.value, weaponType: fresh.weaponType });
  delete it.rerolls; // peça nova: a lapidação volta ao preço inicial
  return { ok: true, frags: c.frags, gold: c.gold, from, to: it.level, name: it.name };
}
