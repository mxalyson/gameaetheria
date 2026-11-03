import { SKILLS } from '../data/skills.js';
import { INVENTORY_SIZE } from '../data/items.js';
import { CLASSES } from '../data/classes.js';
import { SPECS, SPEC_LEVEL, SEAL_PRICE, SEAL_MAX, SPEC_ALIASES } from '../data/specs.js';

export { SPEC_LEVEL, SEAL_PRICE, SEAL_MAX, SPEC_ALIASES };

const cache = new Map();

// Habilidade com os ajustes da especialização aplicados (a mesma função serve ao servidor, à IA e à interface).
export function skillOf(classId, spec, skillId) {
  const base = SKILLS[skillId];
  const mod = spec ? SPECS[classId]?.[spec]?.skills?.[skillId] : null;
  if (!mod) return base;
  const key = `${classId}:${spec}:${skillId}`;
  let s = cache.get(key);
  if (!s) {
    s = { ...base, ...mod };
    if (base.buff && mod.buff) s.buff = { ...base.buff, ...mod.buff };
    cache.set(key, s);
  }
  return s;
}

export const specsOf = (classId) => SPECS[classId] ?? {};
export const specInfo = (classId, spec) => SPECS[classId]?.[spec] ?? null;
export const normSpec = (spec) => SPEC_ALIASES[spec] ?? spec; // id antigo -> id atual

// A especialização só vale a partir do nível SPEC_LEVEL.
export const activeSpec = (char) => (char.level >= SPEC_LEVEL && specInfo(char.classId, char.spec) ? char.spec : null);

// Ataque básico do herói com os ajustes da especialização (cacheado: o sim chama a cada ataque).
const basics = new Map();
export function basicOf(classId, spec) {
  const base = CLASSES[classId].basic, mod = spec ? SPECS[classId]?.[spec]?.mods?.basic : null;
  if (!mod) return base;
  const key = classId + ':' + spec;
  let b = basics.get(key);
  if (!b) { b = { ...base, ...mod }; basics.set(key, b); }
  return b;
}

// Bônus de dano de quem luta com pouca vida (Berserker): cresce linearmente de `below` da vida até 0. Sem alocação.
export function lowHpBonus(a) {
  const lh = a.spec ? SPECS[a.classId]?.[a.spec]?.mods?.lowHp : null;
  if (!lh || !(a.maxHp > 0)) return 0;
  const r = a.hp / a.maxHp;
  return r >= lh.below ? 0 : lh.max * Math.min(1, (lh.below - r) / lh.below);
}

// ---- Reespecialização paga ----
// Primeira escolha é grátis; trocar exige 1 Selo de Reespecialização (char.seals), comprado do Mestre de Classe por SEAL_PRICE de ouro.
// `specChanges` conta as trocas pagas (histórico simples). O servidor usa estas mesmas funções sobre o documento oficial (server/tx.js).
export const sealsOf = (char) => char.seals ?? 0;
export const needsSeal = (char) => !!specInfo(char.classId, char.spec); // já tem especialização válida: a próxima escolha custa um Selo

export function chooseSpec(char, spec) {
  if (char.level < SPEC_LEVEL) return { ok: false, reason: `Disponível a partir do nível ${SPEC_LEVEL}.` };
  if (!specInfo(char.classId, spec)) return { ok: false, reason: 'Especialização inválida.' };
  // a escolha exige a Prova do Mestre da sua classe (praça dos mestres na Vila); saves que já tinham spec a mantêm (savedoc), mas trocar também exige a prova
  if (char.quests?.done?.prova_do_mestre == null) return { ok: false, reason: 'Conclua a Prova do Mestre da sua classe na Vila.' };
  if (char.spec === spec) return { ok: false, reason: 'Você já tem esta especialização.' };
  // sem escudo (Berserker): o escudo equipado volta para a mochila; mochila cheia bloqueia a troca (nada é gasto nem perdido)
  const dropShield = !!SPECS[char.classId][spec].noOffhand && !!char.equipment?.offhand;
  if (dropShield && char.inventory.length >= INVENTORY_SIZE) return { ok: false, reason: 'Mochila cheia: abra espaço para guardar o escudo antes de virar Berserker.' };
  const paid = needsSeal(char);
  if (dropShield) { char.inventory.push(char.equipment.offhand); delete char.equipment.offhand; }
  if (paid) {
    if (sealsOf(char) < 1) return { ok: false, reason: 'Trocar de especialização exige um Selo de Reespecialização (o Mestre de Classe vende).' };
    char.seals = sealsOf(char) - 1;
    char.specChanges = (char.specChanges ?? 0) + 1;
  }
  char.spec = spec;
  return dropShield ? { ok: true, paid, seals: sealsOf(char), shieldStored: true } : { ok: true, paid, seals: sealsOf(char) };
}

export function buySeal(char) {
  if (char.level < SPEC_LEVEL) return { ok: false, reason: `O Selo só é vendido a partir do nível ${SPEC_LEVEL}.` };
  if (sealsOf(char) >= SEAL_MAX) return { ok: false, reason: `Você já carrega o máximo de Selos (${SEAL_MAX}).` };
  if (char.gold < SEAL_PRICE) return { ok: false, reason: `Faltam ${SEAL_PRICE - char.gold} de ouro.` };
  char.gold -= SEAL_PRICE;
  char.seals = sealsOf(char) + 1;
  return { ok: true, price: SEAL_PRICE, seals: char.seals };
}
