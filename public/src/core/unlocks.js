// Aprendizado das habilidades por nível (funções puras: o simulador, a IA, o servidor e a interface usam as mesmas).
import { CLASSES } from '../data/classes.js';
import { SKILL_UNLOCK } from '../data/skills.js';
import { SPECS, SPEC_LEVEL } from '../data/specs.js';

export const MASTERY_IDX = 3; // slot s3: habilidade de Maestria (nível 25 + missão `maestria`)

// Nível em que o slot idx (0..3) é liberado.
export const skillUnlockLevel = (idx) => SKILL_UNLOCK[idx] ?? 1;

// Kit da especialização (data/kits.js), ou null: sem spec / spec desconhecida usa o kit base da classe.
export const kitOf = (classId, spec) => (spec ? SPECS[classId]?.[spec]?.kit ?? null : null);
// Especialização que vale para quem tem `.level` e `.spec` (abaixo do nível 15 nunca vale: a spec salva não conta).
export const kitSpec = (o) => ((o?.level ?? SPEC_LEVEL) >= SPEC_LEVEL ? o?.spec ?? null : null);

// Id da habilidade do slot idx da classe (0..2 = kit; 3 = Maestria). Com `spec` válida o slot vem do kit PRÓPRIO da especialização.
export function skillIdAt(classId, idx, spec = null) {
  const kit = kitOf(classId, spec);
  if (kit) return idx === MASTERY_IDX ? kit.mastery : kit.skills[idx];
  return idx === MASTERY_IDX ? CLASSES[classId]?.mastery : CLASSES[classId]?.skills[idx];
}
// Os 4 ids (s0..s3) de quem tem classId/level/spec (personagem ou ator).
export const kitIds = (o) => [0, 1, 2, 3].map((i) => skillIdAt(o.classId, i, kitSpec(o)));

// A Maestria vale para o documento do personagem (quests.done.maestria) e para o ator (flag `mastery`, copiada na criação).
const masteryDone = (o) => !!o && (o.mastery === true || o.quests?.done?.maestria != null);

// levelOrChar: personagem/ator (com `.level`; o slot de Maestria também exige a missão) ou só o nível (número: o slot s3 nunca conta como liberado, pois falta saber da missão).
export function isSkillUnlocked(levelOrChar, idx) {
  const num = typeof levelOrChar === 'number';
  if ((num ? levelOrChar : levelOrChar?.level ?? 1) < skillUnlockLevel(idx)) return false;
  return idx !== MASTERY_IDX || (!num && masteryDone(levelOrChar));
}

// Ids das habilidades já aprendidas, na ordem dos slots (do kit da especialização, se houver).
export const unlockedSkills = (char) => [0, 1, 2, 3].filter((i) => isSkillUnlocked(char, i)).map((i) => skillIdAt(char.classId, i, kitSpec(char)));

// Habilidades liberadas só por nível ao passar de `from` para `to` (para o aviso de "Nova habilidade"); a Maestria avisa ao concluir a missão (masteryUnlock).
export function newlyUnlocked(classId, from, to) {
  return CLASSES[classId].skills.map((id, idx) => ({ id, idx, level: skillUnlockLevel(idx) })).filter((s) => s.level > from && s.level <= to);
}

// Habilidade de Maestria da classe (ou da especialização) para o aviso ao concluir a missão.
export const masteryUnlock = (classId, spec = null) => ({ id: skillIdAt(classId, MASTERY_IDX, spec), idx: MASTERY_IDX, level: skillUnlockLevel(MASTERY_IDX) });
