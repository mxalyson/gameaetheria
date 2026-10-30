// Fichas de design dos 5 personagens (originais). Cada ficha descreve cores, cabelo, roupa, acessórios e arma;
// o desenho é feito por rig-chibi.js. Estilo: miniatura/caricato (cabeça grande, corpo pequeno, contorno grosso, brilho vítreo).
// Cores: [claro, base, escuro] para o sombreamento em 3 tons.
export const DESIGNS = {
  apprentice: {
    id: 'apprentice', name: 'Aprendiz Arcano', role: 'Mago iniciante · dano mágico à distância',
    colors: { skin: ['#fff3ea', '#ffd9c4', '#f0a99a'], hair: ['#f6edff', '#c9adff', '#8a66da'], eye: ['#b9fff4', '#2fd6c8', '#137c8d'], primary: ['#8f88ff', '#5b53dc', '#332f94'], secondary: ['#fff8ea', '#f3e1c0', '#cdb089'], trim: ['#fff0a6', '#ffcf4a', '#c98f12'], accent: '#43e0cf', outline: '#2a2260' },
    hair: 'bob', headgear: 'slouch_hat', outfit: 'robe', back: 'scarf_cape', weapon: 'wand_book', motion: 'cast', glasses: true, shoulders: 0,
    notes: 'Estudante exagerado: chapéu enorme e mole com remendo de estrela, óculos redondos, cachecol-capa curto e um livro de feitiços que flutua ao redor. Magia ciano e dourada.',
    skills: ['Rajada de Runas (projétil)', 'Nova de Tinta Arcana (área)', 'Salto de Página (teleporte curto)'],
  },
  sniper: {
    id: 'sniper', name: 'Franco-atirador', role: 'Alcance longo · dano concentrado',
    colors: { skin: ['#fff0e2', '#fdd3b0', '#e59f7c'], hair: ['#f4c18a', '#c97a3a', '#7d4521'], eye: ['#fff0a8', '#ffb53d', '#b5651a'], primary: ['#a9de72', '#5fa84e', '#35703f'], secondary: ['#e6b27a', '#ad6f3d', '#6e4023'], trim: ['#ffd39a', '#e8883a', '#a44d14'], accent: '#ff8a3d', outline: '#2c2a1a' },
    hair: 'ponytail', headgear: 'scout_cap', outfit: 'poncho', back: 'poncho_pack', weapon: 'rifle', motion: 'shoot', glasses: false, shoulders: 6,
    notes: 'Batedor esperto: boné com óculos de mira erguidos, poncho verde-musgo, mochila com cobertor, rabo de cavalo e um rifle comprido de luneta de latão e cristal. Detalhes laranja-cobre.',
    skills: ['Tiro Perfurante (projétil)', 'Disparo Sentinela (carga e alcance)', 'Armadilha de Cristal (área)'],
  },
  paladin: {
    id: 'paladin', name: 'Paladino', role: 'Linha de frente · defesa e golpes sagrados',
    colors: { skin: ['#fff1e6', '#ffd6bd', '#ea9f87'], hair: ['#fff6bd', '#ffd45a', '#c58a14'], eye: ['#cfe9ff', '#58a8ff', '#2358a8'], primary: ['#ffffff', '#dde5f4', '#98a6c6'], secondary: ['#8fb2ff', '#4478e0', '#27428f'], trim: ['#fff0a6', '#ffcf4a', '#c98f12'], accent: '#ffd45a', outline: '#232a4d' },
    hair: 'spiky', headgear: 'winged_helm', outfit: 'armor', back: 'cape', weapon: 'sword_shield', motion: 'slash', glasses: false, shoulders: 10,
    notes: 'Cavaleiro rechonchudo: elmo alado com pluma azul, ombreiras enormes, escudo redondo com sol, capa azul e uma espada curta e larga. Prata, azul-real e ouro.',
    skills: ['Golpe Solar (área frontal)', 'Muralha de Luz (escudo)', 'Investida Sagrada (avanço)'],
  },
  priest: {
    id: 'priest', name: 'Sacerdote', role: 'Suporte · cura e proteção',
    colors: { skin: ['#fff4ec', '#ffddca', '#f0ab9c'], hair: ['#ffffff', '#e1eaff', '#a6b8e6'], eye: ['#ffd6e6', '#ff8fb8', '#c2457f'], primary: ['#ffffff', '#f7f0e3', '#d6c7a6'], secondary: ['#c4f7e8', '#6fd6bd', '#3a9488'], trim: ['#fff0a6', '#ffcf4a', '#c98f12'], accent: '#7dffd8', outline: '#3b4a52' },
    hair: 'braids', headgear: 'halo_mitre', outfit: 'vestment', back: 'stole', weapon: 'staff_bell', motion: 'pray', glasses: false, shoulders: 5,
    notes: 'Clérigo doce: mitra alta e macia com auréola flutuante, tranças compridas com laços, veste branca com estola menta e sol dourado, cajado com sino e lanterna. Luz verde-água e dourada.',
    skills: ['Luz Restauradora (cura em área)', 'Bênção do Sino (escudo)', 'Julgamento Brando (atordoa)'],
  },
  mystic: {
    id: 'mystic', name: 'Místico', role: 'Invocador e controle · talismãs e espíritos',
    colors: { skin: ['#fff0f0', '#ffd8d8', '#e89ab0'], hair: ['#ffffff', '#ebe9ff', '#aaa6e6'], eye: ['#fff2a8', '#ffd23d', '#c28a12'], primary: ['#b48cff', '#6e44d8', '#3b2090'], secondary: ['#ff8296', '#da3f5c', '#8f1f3a'], trim: ['#fff0a6', '#ffcf4a', '#c98f12'], accent: '#ff6b8a', outline: '#2b1a46' },
    hair: 'twin_tails', headgear: 'fox_mask', outfit: 'kimono', back: 'sleeves', weapon: 'talismans', motion: 'throw', glasses: false, shoulders: 0,
    notes: 'Enigmático e travesso: meia máscara de raposa branca no lado da cabeça, marcas faciais vermelhas, maria-chiquinhas brancas com sinos, quimono roxo com obi carmesim e talismãs de papel flutuando. Roxo, carmesim e ouro.',
    skills: ['Chuva de Talismãs (projéteis)', 'Selo de Espírito (prende e atordoa)', 'Chamado da Raposa (invocação)'],
  },
};
export const DESIGN_ORDER = ['apprentice', 'sniper', 'paladin', 'priest', 'mystic'];
