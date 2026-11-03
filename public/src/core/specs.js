import { SKILLS } from '../data/skills.js';
import { SPECS, SPEC_LEVEL } from '../data/specs.js';

export { SPEC_LEVEL };

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

// A especialização só vale a partir do nível SPEC_LEVEL.
export const activeSpec = (char) => (char.level >= SPEC_LEVEL && specInfo(char.classId, char.spec) ? char.spec : null);

// Primeira escolha é grátis; trocar depois custa ouro (cresce com o nível).
export const respecCost = (char) => (char.spec ? 150 + char.level * 25 : 0);

export function chooseSpec(char, spec) {
  if (char.level < SPEC_LEVEL) return { ok: false, reason: `Disponível a partir do nível ${SPEC_LEVEL}.` };
  if (!specInfo(char.classId, spec)) return { ok: false, reason: 'Especialização inválida.' };
  // a escolha exige a Prova do Mestre da sua classe (praça dos mestres na Vila); saves que já tinham spec a mantêm (savedoc), mas trocar também exige a prova
  if (char.quests?.done?.prova_do_mestre == null) return { ok: false, reason: 'Conclua a Prova do Mestre da sua classe na Vila.' };
  if (char.spec === spec) return { ok: false, reason: 'Você já tem esta especialização.' };
  const cost = respecCost(char);
  if (char.gold < cost) return { ok: false, reason: `Faltam ${cost - char.gold} de ouro.` };
  char.gold -= cost;
  char.spec = spec;
  return { ok: true, cost };
}
