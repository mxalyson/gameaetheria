export const STAT_KEYS = ['str', 'agi', 'int', 'vit'];
export const STAT_NAMES = { str: 'Força', agi: 'Agilidade', int: 'Inteligência', vit: 'Vitalidade' };

// basic: ataque básico (botão esquerdo). skills: teclas 1, 2, 3.
export const CLASSES = {
  warrior: {
    id: 'warrior', name: 'Guerreiro', icon: '⚔️', color: '#e0635a', accent: '#f4c7a1',
    desc: 'Linha de frente. Muita vida e defesa, golpes corpo a corpo em área.',
    primary: 'str', base: { str: 9, agi: 4, int: 2, vit: 9 }, growth: { str: 2, agi: 1, int: 0, vit: 2 },
    hpBase: 120, weapon: 'sword',
    basic: { kind: 'melee', range: 74, arc: 1.8, cd: 0.6, mult: 1.0, color: '#ffe1d0' },
    skills: ['whirlwind', 'charge', 'warcry'],
  },
  mage: {
    id: 'mage', name: 'Mago', icon: '🔮', color: '#6a7cf0', accent: '#d5dbff',
    desc: 'Magia arcana à distância. Frágil, mas devastador em área.',
    primary: 'int', base: { str: 2, agi: 4, int: 10, vit: 6 }, growth: { str: 0, agi: 1, int: 3, vit: 1 },
    hpBase: 85, weapon: 'staff',
    basic: { kind: 'projectile', speed: 480, range: 520, cd: 0.7, mult: 1.0, color: '#a9b8ff', radius: 7 },
    skills: ['fireball', 'frostnova', 'blink'],
  },
  archer: {
    id: 'archer', name: 'Arqueiro', icon: '🏹', color: '#4fae7a', accent: '#d6f2c2',
    desc: 'Ataques rápidos de longo alcance e grande mobilidade.',
    primary: 'agi', base: { str: 3, agi: 10, int: 3, vit: 6 }, growth: { str: 0, agi: 3, int: 0, vit: 1 },
    hpBase: 90, weapon: 'bow',
    basic: { kind: 'projectile', speed: 700, range: 560, cd: 0.5, mult: 0.85, color: '#eaffc0', radius: 4 },
    skills: ['rain', 'pierce', 'roll'],
  },
  cleric: {
    id: 'cleric', name: 'Clérigo', icon: '✨', color: '#e8c25a', accent: '#fff4cf',
    desc: 'Guerreiro sagrado: cura, escudos e controle. Difícil de derrubar.',
    primary: 'int', base: { str: 5, agi: 3, int: 7, vit: 9 }, growth: { str: 1, agi: 0, int: 2, vit: 2 },
    hpBase: 110, weapon: 'mace',
    basic: { kind: 'melee', range: 68, arc: 1.5, cd: 0.7, mult: 1.05, color: '#fff3b0' },
    skills: ['holylight', 'divineshield', 'judgement'],
  },
};
