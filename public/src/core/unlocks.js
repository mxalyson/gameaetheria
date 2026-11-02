// Aprendizado das habilidades por nível (funções puras: o simulador, a IA, o servidor e a interface usam as mesmas).
import { CLASSES } from '../data/classes.js';
import { SKILL_UNLOCK } from '../data/skills.js';

// Nível em que o slot idx (0..2) é liberado.
export const skillUnlockLevel = (idx) => SKILL_UNLOCK[idx] ?? 1;

// level: número ou personagem/ator com `.level`.
export const isSkillUnlocked = (levelOrChar, idx) => (typeof levelOrChar === 'number' ? levelOrChar : levelOrChar?.level ?? 1) >= skillUnlockLevel(idx);

// Ids das habilidades já aprendidas, na ordem dos slots.
export const unlockedSkills = (char) => CLASSES[char.classId].skills.filter((_, i) => isSkillUnlocked(char, i));

// Habilidades liberadas ao passar de `from` para `to` (para o aviso de "Nova habilidade").
export function newlyUnlocked(classId, from, to) {
  return CLASSES[classId].skills.map((id, idx) => ({ id, idx, level: skillUnlockLevel(idx) })).filter((s) => s.level > from && s.level <= to);
}
