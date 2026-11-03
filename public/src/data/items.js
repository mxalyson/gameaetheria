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
// Equipamento por CLASSE (todos os espaços, não só a arma): o item nasce com `classId` e só essa classe o equipa.
// Armadura por tipo: Guerreiro = placas (pesada), Arqueiro = couro, Mago e Clérigo = tecido (cada um com o próprio conjunto de nomes).
export const ARMOR_TYPES = { warrior: 'Placas', archer: 'Couro', mage: 'Tecido', cleric: 'Tecido' };
// Nome base por classe, espaço e tier (nível do item / 8). Ícone: o do tipo/espaço (sem arte própria por classe ainda).
export const GEAR_NAMES = {
  warrior: {
    helm: ['Capacete de Ferro', 'Elmo de Aço', 'Elmo de Batalha', 'Elmo do Campeão'],
    armor: ['Peitoral de Ferro', 'Cota de Malha', 'Armadura de Placas', 'Couraça do Campeão'],
    boots: ['Botas de Ferro', 'Grevas de Aço', 'Grevas de Batalha', 'Grevas do Campeão'],
    ring: ['Anel de Ferro', 'Anel de Guerra', 'Anel de Bronze Real', 'Anel do Vanguardista'],
    amulet: ['Medalhão de Ferro', 'Insígnia de Guerra', 'Brasão de Aço', 'Colar do Comandante'],
  },
  mage: {
    helm: ['Capuz de Aprendiz', 'Chapéu Arcano', 'Capuz Estelar', 'Coroa Prismática'],
    armor: ['Túnica de Aprendiz', 'Manto Arcano', 'Manto Estelar', 'Veste Prismática'],
    boots: ['Sandálias de Seda', 'Botas Arcanas', 'Botas Estelares', 'Sapatilhas Prismáticas'],
    ring: ['Anel de Cristal', 'Anel Arcano', 'Anel Estelar', 'Anel Prismático'],
    amulet: ['Pingente de Cristal', 'Orbe Arcano', 'Amuleto Estelar', 'Talismã Prismático'],
  },
  archer: {
    helm: ['Capuz de Couro', 'Chapéu de Caçador', 'Capuz de Patrulheiro', 'Capuz do Falcão'],
    armor: ['Colete de Couro', 'Gibão de Couro', 'Gibão de Patrulheiro', 'Couro do Falcão'],
    boots: ['Botas de Couro', 'Botas de Caçador', 'Botas de Patrulheiro', 'Botas Aladas'],
    ring: ['Anel de Osso', 'Anel de Caçador', 'Anel de Prata Verde', 'Anel do Falcão'],
    amulet: ['Colar de Penas', 'Colar de Presas', 'Amuleto de Jade', 'Talismã do Falcão'],
  },
  cleric: {
    helm: ['Touca Sagrada', 'Capelo Bento', 'Mitra Sagrada', 'Halo Solar'],
    armor: ['Túnica Sagrada', 'Hábito Bento', 'Vestes Sagradas', 'Vestes Solares'],
    boots: ['Sandálias Sagradas', 'Sandálias Bentas', 'Botas Sagradas', 'Sandálias Solares'],
    ring: ['Anel Sagrado', 'Anel Bento', 'Anel de Ouro Sagrado', 'Anel Solar'],
    amulet: ['Símbolo Sagrado', 'Relicário Bento', 'Amuleto Sagrado', 'Sol de Ouro'],
  },
};
// Itens exclusivos do último chefe (Cavaleiro Rubro): tema ópalo. Ícone = o do tipo (sem arte própria ainda; ver docs/roadmap/pendencias.md).
export const OPAL_NAMES = { sword: 'Espada Opalina', staff: 'Cajado Opalino', bow: 'Arco Opalino', mace: 'Maça Opalina', armor: 'Couraça de Ópalo' };

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
