export const SLOTS = ['weapon', 'helm', 'armor', 'boots', 'ring', 'amulet'];
export const SLOT_NAMES = { weapon: 'Arma', helm: 'Elmo', armor: 'Armadura', boots: 'Botas', ring: 'Anel', amulet: 'Amuleto' };
export const SLOT_ICONS = { helm: '🪖', armor: '🥋', boots: '👢', ring: '💍', amulet: '📿' };

export const RARITIES = [
  { id: 'common', name: 'Comum', color: '#c9ccd3', affixes: 0, mul: 1.0, weight: 60 },
  { id: 'uncommon', name: 'Incomum', color: '#7bd88f', affixes: 1, mul: 1.15, weight: 26 },
  { id: 'rare', name: 'Raro', color: '#5fa8ff', affixes: 2, mul: 1.3, weight: 10 },
  { id: 'epic', name: 'Épico', color: '#b77cff', affixes: 3, mul: 1.5, weight: 3.5 },
  { id: 'legendary', name: 'Lendário', color: '#ffa53d', affixes: 4, mul: 1.8, weight: 0.5 },
];
export const RARITY = Object.fromEntries(RARITIES.map((r, i) => [r.id, { ...r, index: i }]));

export const WEAPON_TYPES = {
  sword: { name: 'Espada', classId: 'warrior', icon: '🗡️' },
  staff: { name: 'Cajado', classId: 'mage', icon: '🪄' },
  bow: { name: 'Arco', classId: 'archer', icon: '🏹' },
  mace: { name: 'Maça', classId: 'cleric', icon: '🔨' },
};

// Nome base por tier (nível do item / 8).
export const BASE_NAMES = {
  sword: ['Espada Curta', 'Lâmina de Ferro', 'Montante de Aço', 'Gládio Rúnico'],
  staff: ['Cajado de Carvalho', 'Bastão Arcano', 'Cetro Estelar', 'Cajado Prismático'],
  bow: ['Arco Curto', 'Arco Longo', 'Arco Élfico', 'Arco Lunar'],
  mace: ['Maça de Ferro', 'Martelo Sagrado', 'Maça Abençoada', 'Martelo Solar'],
  helm: ['Capuz', 'Elmo de Couro', 'Elmo de Aço', 'Coroa Rúnica'],
  armor: ['Túnica', 'Gibão de Couro', 'Cota de Malha', 'Armadura de Placas'],
  boots: ['Sandálias', 'Botas de Couro', 'Grevas de Aço', 'Botas Aladas'],
  ring: ['Anel de Cobre', 'Anel de Prata', 'Anel de Ouro', 'Anel Astral'],
  amulet: ['Pingente', 'Colar de Contas', 'Amuleto de Jade', 'Talismã Antigo'],
};
export const EPITHETS = ['da Aurora', 'do Lobo', 'das Marés', 'do Crepúsculo', 'da Tempestade', 'do Eco', 'da Brasa', 'do Orvalho', 'dos Ventos', 'da Lua Pálida'];

// per: escala por nível do item. flat: faixa fixa (porcentagens).
export const AFFIXES = [
  { stat: 'str', per: 0.55 },
  { stat: 'agi', per: 0.55 },
  { stat: 'int', per: 0.55 },
  { stat: 'vit', per: 0.55 },
  { stat: 'hp', per: 6 },
  { stat: 'def', per: 1.1 },
  { stat: 'crit', flat: [2, 6] },
  { stat: 'atkSpeed', flat: [3, 9] },
  { stat: 'moveSpeed', flat: [3, 8] },
  { stat: 'lifesteal', flat: [1, 4] },
];

export const STAT_LABELS = {
  atk: 'Ataque', def: 'Defesa', hp: 'Vida',
  str: 'Força', agi: 'Agilidade', int: 'Inteligência', vit: 'Vitalidade',
  crit: 'Crítico', atkSpeed: 'Vel. de Ataque', moveSpeed: 'Vel. de Movimento', lifesteal: 'Roubo de Vida',
};
export const PERCENT_STATS = new Set(['crit', 'atkSpeed', 'moveSpeed', 'lifesteal']);

export const INVENTORY_SIZE = 30;
