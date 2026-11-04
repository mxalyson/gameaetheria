// Mentores de especialização: um NPC por especialização na Praça dos Mestres de Estilo (Porto de Marfim, data/zones.js harbor).
// Para ESCOLHER a especialização o jogador precisa ter conversado com os DOIS mentores da própria classe (objetivo `talk` da Prova do Mestre,
// data/quests.js); pode conversar com todos por curiosidade. A conversa grava um bit em `stats.mentors` (core/journal.js); o servidor conta (tx `mentor_talk`).
// A ordem define o bit (não reordenar: os bits ficam salvos no documento).
export const MENTORS = [
  { id: 'mentor_paladin', classId: 'warrior', spec: 'paladin', name: 'Sir Aurelion, Paladino', short: 'Sir Aurelion' },
  { id: 'mentor_berserker', classId: 'warrior', spec: 'berserker', name: 'Grumak, Berserker', short: 'Grumak' },
  { id: 'mentor_arcane', classId: 'mage', spec: 'arcane', name: 'Maga Velyra, Arcana', short: 'Velyra' },
  { id: 'mentor_warlock', classId: 'mage', spec: 'warlock', name: 'Morvain, Bruxo', short: 'Morvain' },
  { id: 'mentor_sniper', classId: 'archer', spec: 'sniper', name: 'Lyra, Franco-atiradora', short: 'Lyra' },
  { id: 'mentor_gunslinger', classId: 'archer', spec: 'gunslinger', name: 'Dom Cálix, Pistoleiro', short: 'Dom Cálix' },
  { id: 'mentor_guardian', classId: 'cleric', spec: 'guardian', name: 'Irmã Aurora, Guardiã', short: 'Irmã Aurora' },
  { id: 'mentor_inquisitor', classId: 'cleric', spec: 'inquisitor', name: 'Inquisidor Valdor', short: 'Valdor' },
];
export const MENTOR_BY_ID = Object.fromEntries(MENTORS.map((m, i) => [m.id, { ...m, bit: i }]));
export const mentorsOfClass = (classId) => MENTORS.filter((m) => m.classId === classId);
export const MENTOR_SQUARE = 'Praça dos Mestres de Estilo';
