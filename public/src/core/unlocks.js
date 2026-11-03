// Aprendizado das habilidades por nível (funções puras: o simulador, a IA, o servidor e a interface usam as mesmas).
import { CLASSES } from '../data/classes.js';
import { SKILL_UNLOCK } from '../data/skills.js';

export const MASTERY_IDX = 3; // slot s3: habilidade de Maestria (nível 25 + missão `maestria`)

// Nível em que o slot idx (0..3) é liberado.
export const skillUnlockLevel = (idx) => SKILL_UNLOCK[idx] ?? 1;

// Id da habilidade do slot idx da classe (0..2 = kit básico; 3 = Maestria).
export const skillIdAt = (classId, idx) => (idx === MASTERY_IDX ? CLASSES[classId]?.mastery : CLASSES[classId]?.skills[idx]);

// A Maestria vale para o documento do personagem (quests.done.maestria) e para o ator (flag `mastery`, copiada na criação).
const masteryDone = (o) => !!o && (o.mastery === true || o.quests?.done?.maestria != null);

// levelOrChar: personagem/ator (com `.level`; o slot de Maestria também exige a missão) ou só o nível (número: o slot s3 nunca conta como liberado, pois falta saber da missão).
export function isSkillUnlocked(levelOrChar, idx) {
  const num = typeof levelOrChar === 'number';
  if ((num ? levelOrChar : levelOrChar?.level ?? 1) < skillUnlockLevel(idx)) return false;
  return idx !== MASTERY_IDX || (!num && masteryDone(levelOrChar));
}

// Ids das habilidades já aprendidas, na ordem dos slots.
export const unlockedSkills = (char) => [0, 1, 2, 3].filter((i) => isSkillUnlocked(char, i)).map((i) => skillIdAt(char.classId, i));

// Habilidades liberadas só por nível ao passar de `from` para `to` (para o aviso de "Nova habilidade"); a Maestria avisa ao concluir a missão (masteryUnlock).
export function newlyUnlocked(classId, from, to) {
  return CLASSES[classId].skills.map((id, idx) => ({ id, idx, level: skillUnlockLevel(idx) })).filter((s) => s.level > from && s.level <= to);
}

// Habilidade de Maestria da classe (para o aviso ao concluir a missão).
export const masteryUnlock = (classId) => ({ id: CLASSES[classId].mastery, idx: MASTERY_IDX, level: skillUnlockLevel(MASTERY_IDX) });
