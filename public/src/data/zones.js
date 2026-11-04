import { CRYPT_GEOM as CG, CRYPT } from './crypt.js';
// Mundo leve: uma vila central + 3 regiões de farm em sequência + arenas.
// Nível dos mobs cresce de oeste para leste dentro de cada região.
const ARENA = {
  w: 1100, h: 1100, circle: true, radius: 500, noLeash: true,
  palette: { ground: '#ead9b0', ground2: '#e0cd9f', outside: '#2d2a36', ring: '#b9a37a' },
  pillars: [{ x: 330, y: 330 }, { x: 770, y: 330 }, { x: 330, y: 770 }, { x: 770, y: 770 }],
  decor: { trees: 0, rocks: 0, bushes: 0, flowers: 0 },
  atmosphere: { tint: 'rgba(255,214,150,0.04)', edge: 'rgba(18,10,36,0.50)', motes: { n: 18, color: '255,226,150', drift: 3, rise: 8 } },
};

// Zonas de farm: 4600×2800 (antes 2800×1900), mais longas no eixo leste-oeste. Portais nas bordas, na altura do meio.
// O terreno é desenhado em blocos sob demanda (render/ground-tiles.js), então o tamanho do mapa não custa memória.
export const FARM_W = 4600, FARM_H = 2800, FARM_MID = 1400, FARM_ENTRY = 110;
const FARM_EAST = FARM_W - 40, FARM_EAST_IN = FARM_W - FARM_ENTRY; // portal leste e ponto de chegada vindo de lá

// Ordem do mapa-múndi (painel do mapa e teletransporte).
export const WORLD_ROUTE = ['town', 'forest', 'plains', 'harbor', 'ruins', 'glacier', 'ember'];
// Posição de cada zona no mapa-múndi (coordenadas 0-100, x → leste, y → sul). O Porto fica no meio da rota, entre a Planície e as Ruínas.
export const WORLD_NODES = {
  town: { x: 14, y: 36 }, forest: { x: 34, y: 36 }, plains: { x: 53, y: 50 }, harbor: { x: 63, y: 66 },
  ruins: { x: 72, y: 36 }, glacier: { x: 86, y: 54 }, ember: { x: 94, y: 30 },
  // Masmorra (fora de WORLD_ROUTE: não é parada de viagem; tem entrada própria no painel do mapa). Ligada às Ruínas.
  crypt: { x: 78, y: 84 },
};
// Cidades neutras (`hub`): zona segura sem monstros. Ficam sempre longe uma da outra (nunca duas coladas): a Vila no começo, o Porto no meio da rota.
export const isHub = (id) => !!ZONES[id]?.hub;
// Custo de viagem em pergaminhos de teletransporte (comprados da Mercadora Lia): só a Vila é de graça; o Porto e as zonas de farm custam 1
// (e exigem já ter pisado lá: `visited`).
export const teleportCost = (id) => (id === 'town' ? 0 : 1);
// Porto: portais nas bordas oeste/leste, na altura da rua principal (a mesma da praça), como os das zonas de farm no meio do mapa.
export const HARBOR_W = 2400, HARBOR_H = 1700, HARBOR_MID = 780;
const HARBOR_EAST = HARBOR_W - 40, HARBOR_EAST_IN = HARBOR_W - FARM_ENTRY;

export const ZONES = {
  town: {
    name: 'Vila de Lúmen', w: 1700, h: 1300, safe: true, hub: true, border: true, spawn: { x: 850, y: 720 },
    palette: { ground: '#a9d9a0', ground2: '#9dcf94', outside: '#5c8a58', path: '#eadfc4', path2: '#f3ead6' },
    treeColors: ['#4f9a5e', '#63b06f', '#83c98a'],
    flowerColors: ['#fff6a8', '#ffb3c7', '#ffffff', '#c7b3ff', '#ffcf99'],
    decor: { trees: 22, rocks: 6, bushes: 16, flowers: 140 },
    // Cenário rico: lanternas nos caminhos, bancos na praça, canteiros, caixas e placa (ver render/scenery.js).
    scenery: {
      kind: 'town', beds: true, noTrail: true, // a trilha automática cortaria a vila; as ruas são `paths`
      along: [['lantern', 240, 64, 11, 0.5]],
      fixed: [['bench', 645, 620, 22, 0.5], ['bench', 705, 765, 22, 0.5], ['bench', 995, 765, 22, 0.5],
        ['crates', 505, 615, 14, 0.8], ['signpost', 1575, 690, 16, 0.5],
        ['well', 1010, 890, 18, 0.6], ['fence', 440, 1040, 22, 0.4], ['fence', 540, 1040, 22, 0.4], ['fence', 1170, 1160, 22, 0.4], ['fence', 1270, 1160, 22, 0.4]],
    },
    atmosphere: {
      tint: 'rgba(255,226,170,0.06)', edge: 'rgba(28,46,40,0.30)', rays: 0.04,
      motes: { n: 22, color: '255,240,190', drift: 5, rise: 4 },
      leaves: { n: 6, colors: ['#f2a2b8', '#ffd27a', '#9fd48a'] },
    },
    paths: [[850, 620, 1700, 620], [850, 620, 850, 1080], [850, 620, 620, 520], [850, 620, 1080, 520]],
    plaza: { x: 850, y: 620, r: 170 },
    fountain: { x: 850, y: 620 },
    houses: [
      { x: 380, y: 300, w: 190, h: 130, roof: '#d97a6a' },
      { x: 1120, y: 300, w: 200, h: 130, roof: '#6a8fd9' },
      { x: 360, y: 880, w: 180, h: 120, roof: '#8fbf6a' },
      { x: 1160, y: 900, w: 180, h: 120, roof: '#d9b36a' },
    ],
    npcs: [
      { id: 'merchant', name: 'Mercadora Lia', x: 600, y: 560, color: '#f2a35c', accent: '#ffe2c0', role: 'shop' },
      { id: 'arena', name: 'Mestre Doran', x: 1100, y: 560, color: '#c95858', accent: '#f6d0b0', role: 'arena' },
      { id: 'sage', name: 'Sábia Yun', x: 850, y: 900, color: '#62b6dc', accent: '#dff3ff', role: 'spirit' },
      { id: 'guard', name: 'Guarda Ren', x: 1380, y: 720, color: '#7a8fb0', accent: '#e4ecff', role: 'quest' },
      { id: 'herbalist', name: 'Herbalista Mel', x: 540, y: 720, color: '#6fae5c', accent: '#e8ffd9', role: 'quest' },
      { id: 'smith', name: 'Ferreiro Brok', x: 700, y: 940, color: '#8a6a4a', accent: '#f0d8b8', role: 'smith' },
      // Praça dos Mestres de Classe: lado a lado (facilita o multiplayer). Cada um só ensina a própria classe; ver core/journal.js masterNpcId.
      { id: 'master_warrior', name: 'Mestre Guerreiro', x: 900, y: 1060, color: '#e0635a', accent: '#f4c7a1', role: 'master' },
      { id: 'master_mage', name: 'Mestre Mago', x: 1015, y: 1060, color: '#6a7cf0', accent: '#d5dbff', role: 'master' },
      { id: 'master_archer', name: 'Mestra Arqueira', x: 1130, y: 1060, color: '#4fae7a', accent: '#d6f2c2', role: 'master' },
      { id: 'master_cleric', name: 'Mestre Clérigo', x: 1245, y: 1070, color: '#e8c25a', accent: '#fff3c0', role: 'master' },
    ],
    portals: [{ x: 1650, y: 620, to: 'forest', tx: 110, ty: FARM_MID, label: 'Bosque Verdejante · Nv 1-6' }],
  },

  forest: {
    name: 'Bosque Verdejante', w: FARM_W, h: FARM_H, border: true, level: [1, 6],
    mobs: [['slime', 5], ['wolf', 3], ['shroom', 3]], count: 40, hostile: 0.5, // zona de nível baixo: boa parte dos mobs só revida
    boss: { id: 'treant', level: 7, x: 3950, y: 700 },
    // Baús: abrem com E, recarregam em 10 min (ver core/journal.js). Posições conferidas contra o layout (tests/journal.test.js).
    // Os baús dos acampamentos (`camps[].chest`) entram aqui no fim do arquivo.
    chests: [{ id: 'forest:1', x: 700, y: 800, tier: 1 }, { id: 'forest:2', x: 1050, y: 1950, tier: 1 }, { id: 'forest:3', x: 2300, y: 1550, tier: 1 }, { id: 'forest:4', x: 2250, y: 2350, tier: 1.3 }, { id: 'forest:5', x: 3600, y: 1900, tier: 1.3 }],
    // Rios sinuosos norte-sul com pontes (ver game/layout.js): `bridges` são as alturas (y) das pontes; a 1ª é por onde passa a trilha.
    // Pontes da mesma margem ficam a meio comprimento de onda (wl/2) uma da outra, onde o rio é reto. Rios da mesma zona nunca se cruzam.
    rivers: [{ x: 1500, amp: 120, wl: 1400, w: 150, bridges: [1400, 2100] }, { x: 3000, amp: 120, wl: 1400, w: 150, bridges: [1000, 1700] }],
    // Acampamentos (4–6 monstros fixos + 1 elite em volta de um baú de tier maior) e clareiras de elite (sem baú, só perigo). Ver campSpawns() em game/layout.js.
    camps: [
      { id: 'forest:c1', x: 900, y: 2150, r: 150, mobs: [['slime', 3], ['wolf', 2]], elites: [['wolf', 1]], chest: 1.8 },
      { id: 'forest:c2', x: 2250, y: 520, r: 150, mobs: [['wolf', 2], ['shroom', 3]], elites: [['shroom', 1]], chest: 2 },
      { id: 'forest:c3', x: 3750, y: 2250, r: 160, mobs: [['wolf', 3], ['shroom', 2]], elites: [['wolf', 1]], chest: 2.4 },
      { id: 'forest:g1', x: 1000, y: 600, r: 140, glade: true, mobs: [['slime', 2]], elites: [['wolf', 2]] },
    ],
    // Lore coletável: tocar na peça (perto da trilha) mostra o texto; 1 bit por zona em stats.lore (core/journal.js LORE_ZONES).
    lore: [{ id: 'forest', kind: 'signpost', x: 480, y: 1474, name: 'Placa do Bosque', text: 'Aqui jaz o Carvalho. Cresceu em silêncio. Não o acorde.' }],
    miniboss: { id: 'wolf', name: 'Alfa da Matilha', level: 8, x: 2500, y: 2150, hpMul: 5, powerMul: 1.5, sizeMul: 1.7, respawn: 600 },
    palette: { ground: '#93cc8b', ground2: '#86c07f', outside: '#4f7a4c' },
    treeColors: ['#3f8a52', '#55a464', '#79c283'],
    flowerColors: ['#fff6a8', '#ffb3c7', '#ffffff', '#c7b3ff'],
    decor: { trees: 200, rocks: 44, bushes: 72, flowers: 480 },
    // Cenário rico (ver render/scenery.js): trilha, lagoas, variedade de árvores e luz de floresta.
    scenery: {
      kind: 'forest', ponds: 5, trailAmp: 260, accent: ['#cf9c4a', '#dcb165', '#ecd08e'],
      extras: [['stump', 34, 14, 20, 0.6], ['log', 22, 14, 20, 0], ['fern', 110, 12, 18, 0], ['mushrooms', 38, 9, 13, 0]],
    },
    atmosphere: {
      tint: 'rgba(255,222,150,0.07)', edge: 'rgba(12,44,34,0.34)', rays: 0.05,
      motes: { n: 34, color: '255,240,170', drift: 6, rise: 5 },
      leaves: { n: 12, colors: ['#e0a840', '#c9783a', '#8fc062'] },
    },
    portals: [
      { x: 40, y: FARM_MID, to: 'town', tx: 1560, ty: 620, label: 'Vila de Lúmen' },
      { x: FARM_EAST, y: FARM_MID, to: 'plains', tx: FARM_ENTRY, ty: FARM_MID, label: 'Planície de Cristal · Nv 6-12' },
    ],
  },

  plains: {
    name: 'Planície de Cristal', w: FARM_W, h: FARM_H, border: true, level: [6, 12],
    mobs: [['crystalwolf', 4], ['golem', 3], ['wisp', 3]], count: 44, hostile: 0.8,
    boss: { id: 'colossus', level: 13, x: 3900, y: 2050 },
    chests: [{ id: 'plains:1', x: 800, y: 1000, tier: 1.2 }, { id: 'plains:2', x: 2200, y: 950, tier: 1.2 }, { id: 'plains:3', x: 1000, y: 2000, tier: 1.2 }, { id: 'plains:4', x: 3400, y: 1250, tier: 1.5 }, { id: 'plains:5', x: 2700, y: 2450, tier: 1.5 }],
    rivers: [{ x: 1400, amp: 120, wl: 1400, w: 150, bridges: [1100, 1800] }, { x: 3100, amp: 120, wl: 1400, w: 150, bridges: [1800, 1100] }],
    camps: [
      { id: 'plains:c1', x: 800, y: 560, r: 150, mobs: [['crystalwolf', 3], ['wisp', 2]], elites: [['golem', 1]], chest: 2.2 },
      { id: 'plains:c2', x: 2300, y: 2300, r: 150, mobs: [['golem', 2], ['wisp', 3]], elites: [['crystalwolf', 1]], chest: 2.4 },
      { id: 'plains:c3', x: 3650, y: 760, r: 160, mobs: [['crystalwolf', 2], ['golem', 2], ['wisp', 1]], elites: [['golem', 1]], chest: 2.8 },
      { id: 'plains:g1', x: 2300, y: 560, r: 140, glade: true, mobs: [['wisp', 2]], elites: [['crystalwolf', 2]] },
    ],
    // Lore coletável: tocar na peça (perto da trilha) mostra o texto; 1 bit por zona em stats.lore (core/journal.js LORE_ZONES).
    lore: [{ id: 'plains', kind: 'signpost', x: 703, y: 1536, name: 'Placa da Planície', text: 'Cada cristal guarda uma lembrança. Alguns, um nome.' }],
    miniboss: { id: 'golem', name: 'Golem Ancestral', level: 13, x: 2350, y: 1950, hpMul: 4, powerMul: 1.4, sizeMul: 1.6, respawn: 600 },
    palette: { ground: '#cfe2b2', ground2: '#c2d8a2', outside: '#6f7f5a' },
    treeColors: ['#6f9f6a', '#86b77c', '#a8d39a'],
    rockType: 'crystal',
    flowerColors: ['#ffffff', '#d8c8ff', '#b8e8ff'],
    decor: { trees: 96, rocks: 82, bushes: 48, flowers: 380 },
    // Cenário rico: trilha clara, lagoas cristalinas, árvores de flor rosa, flores luminosas e geodos.
    scenery: {
      kind: 'plains', ponds: 4, trailAmp: 240, accent: ['#e59bb9', '#f1b8d0', '#fcd9e6'],
      extras: [['glowflower', 150, 8, 12, 0], ['tallgrass', 170, 14, 22, 0], ['geode', 28, 16, 24, 0.7], ['mushrooms', 20, 9, 13, 0]],
    },
    atmosphere: {
      tint: 'rgba(170,230,255,0.06)', edge: 'rgba(16,48,70,0.32)', rays: 0.045,
      motes: { n: 40, color: '190,235,255', drift: 5, rise: 7 },
    },
    portals: [
      { x: 40, y: FARM_MID, to: 'forest', tx: FARM_EAST_IN, ty: FARM_MID, label: 'Bosque Verdejante' },
      { x: FARM_EAST, y: FARM_MID, to: 'harbor', tx: FARM_ENTRY, ty: HARBOR_MID, label: 'Porto de Marfim · cidade neutra' },
    ],
  },

  ruins: {
    name: 'Ruínas Sombrias', w: FARM_W, h: FARM_H, border: true, level: [12, 20], scale: true,
    mobs: [['wraith', 3], ['knight', 3], ['gargoyle', 3]], count: 46, hostile: 0.85,
    boss: { id: 'guardian', level: 21, x: 4000, y: FARM_MID },
    chests: [{ id: 'ruins:1', x: 700, y: 900, tier: 1.5 }, { id: 'ruins:2', x: 1100, y: 2150, tier: 1.5 }, { id: 'ruins:3', x: 2300, y: 800, tier: 1.5 }, { id: 'ruins:4', x: 2700, y: 2100, tier: 2 }, { id: 'ruins:5', x: 3500, y: 700, tier: 2 }],
    rivers: [{ x: 1500, amp: 120, wl: 1400, w: 150, bridges: [1400, 2100] }, { x: 3000, amp: 120, wl: 1400, w: 150, bridges: [1900, 1200] }],
    camps: [
      { id: 'ruins:c1', x: 900, y: 2300, r: 150, mobs: [['knight', 2], ['wraith', 2], ['gargoyle', 1]], elites: [['gargoyle', 1]], chest: 2.2 },
      { id: 'ruins:c2', x: 2250, y: 520, r: 150, mobs: [['wraith', 3], ['knight', 2]], elites: [['knight', 1]], chest: 2.6 },
      { id: 'ruins:c3', x: 3600, y: 2250, r: 160, mobs: [['gargoyle', 3], ['wraith', 2]], elites: [['knight', 1]], chest: 3 },
      { id: 'ruins:g1', x: 700, y: 560, r: 140, glade: true, mobs: [['wraith', 2]], elites: [['knight', 2]] },
      { id: 'ruins:g2', x: 2300, y: 2300, r: 140, glade: true, mobs: [['gargoyle', 2]], elites: [['wraith', 2]] },
    ],
    // Lore coletável: tocar na peça (perto da trilha) mostra o texto; 1 bit por zona em stats.lore (core/journal.js LORE_ZONES).
    lore: [{ id: 'ruins', kind: 'statue', x: 690, y: 1413, name: 'Estátua das Ruínas', text: 'Fomos muitos. Restou o guarda, que não sabe que acabou. Abaixo, o rei não repousa.' }],
    miniboss: { id: 'knight', name: 'Capitão Caído', level: 20, x: 2300, y: 1500, hpMul: 4, powerMul: 1.4, sizeMul: 1.5, respawn: 600 },
    palette: { ground: '#8d89ac', ground2: '#837fa4', outside: '#2b2840' },
    treeColors: ['#46565f', '#587077', '#789098'],
    treeType: 'pine', rockType: 'pillar',
    flowerColors: ['#c9b6ff', '#9f8fd6', '#e6dcff'],
    decor: { trees: 62, rocks: 96, bushes: 24, flowers: 210 },
    // Cenário rico: estrada de lajes até o Guardião, círculos rúnicos, braseiros, estátuas e névoa.
    scenery: {
      kind: 'ruins', runes: 6, trailAmp: 200, trailToBoss: true, // a estrada vai até o Guardião (o portal leste fica atrás dele)
      // estátuas guardando a entrada e a subida ao Guardião (aparecem logo, em vez de só 5 espalhadas numa zona enorme)
      fixed: [['statue', 330, 1240, 28, 0.9], ['statue', 330, 1560, 28, 0.9], ['statue', 3780, 1210, 30, 0.9], ['statue', 3780, 1590, 30, 0.9]],
      extras: [['rubble', 72, 16, 26, 0], ['brazier', 22, 14, 16, 0.9], ['statue', 12, 22, 28, 0.9], ['deadtree', 20, 26, 34, 0.5], ['runestone', 14, 22, 28, 0.6]],
    },
    atmosphere: {
      tint: 'rgba(110,100,190,0.05)', edge: 'rgba(8,6,28,0.60)',
      fog: { n: 8, color: '205,200,238', alpha: 0.09 },
      motes: { n: 28, color: '170,150,255', drift: 4, rise: 9 },
    },
    portals: [
      { x: 40, y: FARM_MID, to: 'harbor', tx: HARBOR_EAST_IN, ty: HARBOR_MID, label: 'Porto de Marfim · cidade neutra' },
      { x: FARM_EAST, y: FARM_MID, to: 'glacier', tx: FARM_ENTRY, ty: FARM_MID, label: 'Cume Gélido · Nv 20-25' },
    ],
  },

  // Porto de Marfim: cidade neutra no meio da rota (Planície → Porto → Ruínas; portal oeste e leste, nunca colado à Vila). Areia clara e lajes,
  // canal com ponte de madeira, baías, casas em arco em volta da praça do mercado. Serviços (roles): bank, board, harborshop, duel. Sem monstros.
  harbor: {
    name: 'Porto de Marfim', w: HARBOR_W, h: HARBOR_H, safe: true, hub: true, border: true, spawn: { x: 1500, y: 920 },
    palette: { ground: '#e9d9b4', ground2: '#e0cda1', outside: '#4d7384', path: '#f1e6cc', path2: '#f8f0dd' },
    treeColors: ['#e59bb9', '#f1b8d0', '#fcd9e6'],
    flowerColors: ['#fff6e0', '#ffd0b0', '#ffb38a', '#cfe8f2', '#ffffff'],
    decor: { trees: 12, rocks: 8, bushes: 12, flowers: 90 },
    scenery: {
      kind: 'harbor', noTrail: true,
      // duas baías a oeste do canal (água de lago com margem de areia molhada)
      fixedPonds: [{ x: 400, y: 360, rx: 250, ry: 150, rot: 0.1 }, { x: 420, y: 1330, rx: 250, ry: 140, rot: -0.1 }],
      boats: [[0, 330, 390, 0], [1, 520, 330, 1], [0, 470, 1350, 2]], // [0 bote|1 veleiro, x, y da quilha, vista 0..2]: na água das baías (render/props-art.js)
      // caixotes e barris (arte do Meshy): [0 barris|1..4 caixotes, x, y da base, vista 0..1]; poucos grupos junto às baías, à Capitã e ao mercado, longe das ruas
      props: [[0, 610, 868, 0], [2, 445, 872, 1], [1, 250, 592, 0], [3, 305, 612, 1], [0, 650, 565, 1], [4, 232, 1172, 0], [0, 612, 1200, 0], [4, 1262, 988, 1], [2, 1402, 1004, 0]],
      along: [['lantern', 230, 64, 11, 0.5]],
      fixed: [['signpost', 250, 690, 16, 0.5], ['well', 1620, 840, 18, 0.6],
        ['fence', 1980, 690, 22, 0.4], ['fence', 2090, 690, 22, 0.4], ['fence', 1980, 870, 22, 0.4], ['fence', 2090, 870, 22, 0.4]], // ringue do duelo amistoso
    },
    atmosphere: {
      tint: 'rgba(255,214,150,0.08)', edge: 'rgba(50,40,30,0.28)', rays: 0.05,
      fog: { n: 5, color: '255,236,210', alpha: 0.07 },
      motes: { n: 20, color: '255,236,190', drift: 5, rise: 3 },
    },
    // Canal norte-sul com uma ponte de madeira na rua oeste (ver game/layout.js › rivers).
    rivers: [{ x: 900, amp: 50, wl: 1700, w: 160, bridges: [780] }],
    paths: [[1500, 260, 1500, 780], [1500, 780, 1500, 1560], [40, HARBOR_MID, HARBOR_EAST, HARBOR_MID]], // rua principal de ponta a ponta (portal a portal)
    plaza: { x: 1500, y: 780, r: 170 },
    // mercado em arco (sul) e flancos da entrada (norte) em volta da praça
    houses: [
      // `art` = modelo da casa em render/nature-sprites.js › SET.harbor (0 telhado, 1 grande, 2 palha, 3 varanda)
      { x: 1077, y: 486, w: 190, h: 130, roof: '#e08a5a', art: 1 }, { x: 1733, y: 486, w: 190, h: 130, roof: '#d9b36a', art: 0 },
      { x: 1059, y: 915, w: 190, h: 130, roof: '#c9604a', art: 2 }, { x: 1751, y: 915, w: 190, h: 130, roof: '#8fb7c9', art: 3 },
      { x: 1205, y: 1061, w: 190, h: 130, roof: '#d98a8a', art: 0 }, { x: 1605, y: 1061, w: 190, h: 130, roof: '#e6c27a', art: 2 },
    ],
    npcs: [
      { id: 'banker', name: 'Banqueiro Octávio', x: 1320, y: 690, color: '#6a7fb0', accent: '#e6ecff', role: 'bank' },
      { id: 'hunter', name: 'Mestra de Caça Vesna', x: 1690, y: 690, color: '#a8683a', accent: '#ffe4c4', role: 'board' },
      { id: 'dealer', name: 'Mercador Bartolomeu', x: 1330, y: 910, color: '#c28a3a', accent: '#fff0c8', role: 'harborshop' },
      { id: 'duelist', name: 'Duelista Kael', x: 2050, y: 780, color: '#b8484e', accent: '#ffd8d0', role: 'duel' },
      { id: 'captain', name: 'Capitã Maré', x: 520, y: 780, color: '#3f8aa8', accent: '#d8f2ff', role: 'quest' },
      // Praça dos Mestres de Estilo (fileira em zigue-zague ao norte da praça, dois a dois por classe: os nomes ficam em alturas diferentes e não se sobrepõem; a rua central fica livre): mentores das 8 especializações (data/mentors.js); a rua central fica livre
      { id: 'mentor_paladin', name: 'Sir Aurelion, Paladino', x: 1045, y: 330, color: '#d9b44a', accent: '#fff2c4', role: 'mentor' },
      { id: 'mentor_berserker', name: 'Grumak, Berserker', x: 1175, y: 395, color: '#b5483a', accent: '#ffd9c4', role: 'mentor' },
      { id: 'mentor_arcane', name: 'Maga Velyra, Arcana', x: 1305, y: 330, color: '#8d6cf0', accent: '#e6dcff', role: 'mentor' },
      { id: 'mentor_warlock', name: 'Morvain, Bruxo', x: 1435, y: 395, color: '#6b3f9a', accent: '#e2c8ff', role: 'mentor' },
      { id: 'mentor_sniper', name: 'Lyra, Franco-atiradora', x: 1565, y: 330, color: '#4f9a6a', accent: '#d8f5c8', role: 'mentor' },
      { id: 'mentor_gunslinger', name: 'Dom Cálix, Pistoleiro', x: 1695, y: 395, color: '#a87a3a', accent: '#ffe6b8', role: 'mentor' },
      { id: 'mentor_guardian', name: 'Irmã Aurora, Sentinela', x: 1825, y: 330, color: '#e8d58a', accent: '#fffbe0', role: 'mentor' },
      { id: 'mentor_inquisitor', name: 'Inquisidor Valdor', x: 1955, y: 395, color: '#9a3a4a', accent: '#ffd2d8', role: 'mentor' },
    ],
    // Serviços do Porto: NPC que presta cada um (a UI de cada painel é do agente de UI; ver docs/gameplay/porto.md).
    services: { bank: 'banker', board: 'hunter', shop: 'dealer', recycle: 'dealer', duel: 'duelist' },
    // Duelo amistoso: entrada para o PvP 1×1 SEM rating (não mexe no Elo, não dá XP de PvP).
    arenaFriendly: { npc: 'duelist', mode: '1v1', rated: false, label: 'Duelo Amistoso' },
    // Oeste volta à Planície; leste segue às Ruínas. Chegada a 110 px da borda, como nas zonas de farm.
    portals: [
      { x: 40, y: HARBOR_MID, to: 'plains', tx: FARM_EAST_IN, ty: FARM_MID, label: 'Planície de Cristal' },
      { x: HARBOR_EAST, y: HARBOR_MID, to: 'ruins', tx: FARM_ENTRY, ty: FARM_MID, label: 'Ruínas Sombrias · Nv 12-20+' },
    ],
  },

  arena: { ...ARENA, name: 'Arena de Lúmen — Duelo' },
  // Arena grande por times (1×1, 2×2, 4×4): ponto de controle no centro, pilares como cobertura contra projéteis.
  arena_team: {
    ...ARENA, name: 'Grande Arena dos Ecos', w: 1800, h: 1800, radius: 820,
    objective: { x: 900, y: 900, r: 140 },
    spawns: { south: 1480, north: 320 },
    pillars: [
      { x: 640, y: 640 }, { x: 1160, y: 640 }, { x: 640, y: 1160 }, { x: 1160, y: 1160 },
      { x: 900, y: 520 }, { x: 900, y: 1280 }, { x: 520, y: 900 }, { x: 1280, y: 900 },
    ],
    palette: { ...ARENA.palette, ground: '#e3d3ad', ground2: '#d8c79d', ring: '#a98f63' },
  },
  waves: { ...ARENA, name: 'Arena das Ondas', palette: { ...ARENA.palette, ground: '#d9cfe8', ground2: '#cdc1df', ring: '#9d8fbf' } },
};

// ---- Mapas de fim de jogo: mesmas criaturas pintadas, recoloridas (data/mobs.js › MOBS_EXTRA). `look` = qual cenário em sprites usar.
ZONES.glacier = {
  // `look` = conjunto de sprites de cenário (render/nature-sprites.js › SET): o Cume tem o seu (pinheiros, cristais de gelo, pedras claras).
  name: 'Cume Gélido', w: FARM_W, h: FARM_H, border: true, level: [20, 25], look: 'glacier',
  mobs: [['frostslime', 4], ['frostwolf', 3], ['icewisp', 3]], count: 44, hostile: 0.8,
  boss: { id: 'frostlord', level: 26, x: 3950, y: 850 },
  chests: [{ id: 'glacier:1', x: 760, y: 1000, tier: 1.8 }, { id: 'glacier:2', x: 1050, y: 2150, tier: 1.8 }, { id: 'glacier:3', x: 2250, y: 1000, tier: 1.8 }, { id: 'glacier:4', x: 2800, y: 2350, tier: 2.2 }, { id: 'glacier:5', x: 3500, y: 1850, tier: 2.2 }],
  // rio congelado: gelo sobre a água (pontes de madeira geladas)
  rivers: [{ x: 1450, amp: 120, wl: 1400, w: 150, bridges: [1300, 2000] }, { x: 3050, amp: 120, wl: 1400, w: 150, bridges: [900, 1600] }],
  camps: [
    { id: 'glacier:c1', x: 850, y: 600, r: 150, mobs: [['frostwolf', 2], ['frostslime', 2], ['icewisp', 1]], elites: [['icewisp', 1]], chest: 2.6 },
    { id: 'glacier:c2', x: 2250, y: 2300, r: 150, mobs: [['frostwolf', 3], ['icewisp', 2]], elites: [['frostwolf', 1]], chest: 3 },
    { id: 'glacier:c3', x: 3750, y: 2150, r: 160, mobs: [['frostslime', 3], ['frostwolf', 2]], elites: [['frostwolf', 1]], chest: 3.4 },
    { id: 'glacier:g1', x: 2250, y: 500, r: 140, glade: true, mobs: [['icewisp', 2]], elites: [['frostwolf', 2]] },
  ],
  // Lore coletável: tocar na peça (perto da trilha) mostra o texto; 1 bit por zona em stats.lore (core/journal.js LORE_ZONES).
  lore: [{ id: 'glacier', kind: 'signpost', x: 554, y: 1309, name: 'Placa do Cume', text: 'A neve cobre. Não apaga.' }],
  miniboss: { id: 'frostwolf', name: 'Alfa da Geada', level: 25, x: 2400, y: 1950, hpMul: 4.5, powerMul: 1.4, sizeMul: 1.7, respawn: 600 },
  palette: { ground: '#dfeaf2', ground2: '#d2e0ea', outside: '#4c6178' },
  treeColors: ['#5b8a9a', '#7fb0bf', '#a9d3df'], rockType: 'crystal',
  flowerColors: ['#ffffff', '#cfe9ff', '#b8d8ff'],
  decor: { trees: 96, rocks: 84, bushes: 0, flowers: 280 },
  scenery: { kind: 'glacier', ponds: 5, trailAmp: 230, accent: ['#9fd0ff', '#c4e3ff', '#e6f3ff'], extras: [['geode', 40, 16, 24, 0.7], ['rubble', 50, 16, 26, 0], ['deadtree', 18, 26, 34, 0.5]] },
  atmosphere: { tint: 'rgba(150,200,255,0.20)', edge: 'rgba(14,34,64,0.38)', rays: 0.03, motes: { n: 46, color: '225,242,255', drift: 5, rise: -5 } },
  portals: [
    { x: 40, y: FARM_MID, to: 'ruins', tx: FARM_EAST_IN, ty: FARM_MID, label: 'Ruínas Sombrias' },
    { x: FARM_EAST, y: FARM_MID, to: 'ember', tx: FARM_ENTRY, ty: FARM_MID, label: 'Cinzas Ardentes · Nv 25-30' },
  ],
};
ZONES.ember = {
  name: 'Cinzas Ardentes', w: FARM_W, h: FARM_H, border: true, level: [25, 30], look: 'ember',
  mobs: [['magmaslime', 4], ['emberwolf', 3], ['cinderwraith', 3]], count: 46, hostile: 1,
  boss: { id: 'infernoknight', level: 31, x: 4000, y: FARM_MID },
  chests: [{ id: 'ember:1', x: 740, y: 900, tier: 2.2 }, { id: 'ember:2', x: 1100, y: 2150, tier: 2.2 }, { id: 'ember:3', x: 2300, y: 850, tier: 2.2 }, { id: 'ember:4', x: 2700, y: 2150, tier: 2.8 }, { id: 'ember:5', x: 3500, y: 700, tier: 2.8 }],
  // rios de lava com pontes de pedra
  rivers: [{ x: 1500, amp: 120, wl: 1400, w: 150, bridges: [1400, 2100] }, { x: 3000, amp: 120, wl: 1400, w: 150, bridges: [1900, 1200] }],
  camps: [
    { id: 'ember:c1', x: 900, y: 2300, r: 150, mobs: [['emberwolf', 2], ['magmaslime', 2], ['cinderwraith', 1]], elites: [['cinderwraith', 1]], chest: 3 },
    { id: 'ember:c2', x: 2250, y: 520, r: 150, mobs: [['magmaslime', 3], ['emberwolf', 2]], elites: [['emberwolf', 1]], chest: 3.4 },
    { id: 'ember:c3', x: 3600, y: 2250, r: 160, mobs: [['cinderwraith', 3], ['emberwolf', 2]], elites: [['magmaslime', 1]], chest: 3.8 },
    { id: 'ember:g1', x: 700, y: 560, r: 140, glade: true, mobs: [['magmaslime', 2]], elites: [['emberwolf', 2]] },
    { id: 'ember:g2', x: 2300, y: 2300, r: 140, glade: true, mobs: [['emberwolf', 2]], elites: [['cinderwraith', 2]] },
  ],
  // Lore coletável: tocar na peça (perto da trilha) mostra o texto; 1 bit por zona em stats.lore (core/journal.js LORE_ZONES).
  lore: [{ id: 'ember', kind: 'statue', x: 576, y: 1342, name: 'Estátua das Cinzas', text: 'O fogo lembra mais do que a pedra.' }],
  miniboss: { id: 'emberwolf', name: 'Cão do Inferno', level: 30, x: 2300, y: 1500, hpMul: 4.5, powerMul: 1.4, sizeMul: 1.7, respawn: 600 },
  palette: { ground: '#8a6a60', ground2: '#7e6056', outside: '#2a1612' },
  treeColors: ['#5a4038', '#6e4e44', '#86645a'], treeType: 'pine', rockType: 'pillar',
  flowerColors: ['#ffb070', '#ff8a4a', '#ffd9a0'],
  decor: { trees: 58, rocks: 96, bushes: 0, flowers: 160 },
  scenery: { kind: 'ember', runes: 6, trailAmp: 200,
    fixed: [['statue', 330, 1240, 28, 0.9], ['statue', 330, 1560, 28, 0.9], ['statue', 3780, 1210, 30, 0.9], ['statue', 3780, 1590, 30, 0.9]],
    extras: [['rubble', 70, 16, 26, 0], ['brazier', 34, 14, 16, 0.9], ['deadtree', 40, 26, 34, 0.5], ['runestone', 14, 22, 28, 0.6]] },
  atmosphere: { tint: 'rgba(255,110,50,0.20)', edge: 'rgba(40,6,2,0.62)', fog: { n: 8, color: '255,170,130', alpha: 0.08 }, motes: { n: 40, color: '255,170,90', drift: 4, rise: 14 } },
  portals: [{ x: 40, y: FARM_MID, to: 'glacier', tx: FARM_EAST_IN, ty: FARM_MID, label: 'Cume Gélido' }],
};

// ---- Cripta dos Ecos: masmorra por instância (decisão 0017; dados em data/crypt.js). Sem mobs/boss: quem povoa e conduz é server/crypt.js,
// então nenhum portal, teletransporte ou ZoneRoom comum a alcança (só a mensagem crypt_enter do mapa). Layout determinístico: muros com porta em game/layout.js.
ZONES.crypt = {
  name: CRYPT.name, w: CG.w, h: CG.h, dungeon: true, fixedLight: true, noLeash: true, level: CRYPT.recommended, spawn: { x: CG.starts[0], y: CG.mid },
  preload: [...new Set([...CRYPT.rooms.flatMap((r) => [...r.waves.flat(), ...r.elites].map((x) => x[0])), CRYPT.boss.id, 'echoshade'])],
  walls: CG.walls.map((x) => ({ x, w: CG.wallW, gap: CG.door })),
  sarcophagi: [[760, 190, 0.2], [1900, 175, 0.8], [2250, 835, 0.3], [3300, 830, 0.7], [4640, 165, 0.4], [4640, 850, 0.9]], // sarcófagos (x, y da base, espelhado se v>0.5); fora das portas e do centro
  palette: { ground: '#4b4766', ground2: '#423e5c', outside: '#12101c', path: '#5a5578', path2: '#524e70' },
  treeColors: ['#46565f'], flowerColors: ['#9fe0e8'],
  decor: { trees: 0, rocks: 0, bushes: 0, flowers: 0 },
  scenery: { kind: 'ruins', noTrail: true, groundTex: 'crypt' }, // groundTex: piso de runas pintado nas salas (render/scenery.js)
  atmosphere: { tint: 'rgba(80,200,220,0.07)', edge: 'rgba(6,4,20,0.65)', fog: { n: 6, color: '160,220,235', alpha: 0.08 }, motes: { n: 30, color: '130,230,240', drift: 3, rise: 10 } },
  portals: [{ x: CG.exit.x, y: CG.exit.y, to: 'town', tx: 850, ty: 790, label: 'Vila de Lúmen' }],
};

// Pedras de Retorno (ponto de renascimento): 2 por zona de farm, uma perto da entrada oeste e outra no meio do mapa, entre os dois rios (core/phoenix.js).
// Tocar grava `char.checkpoint`; ao cair o herói renasce na última pedra da zona (ou na entrada). Posições conferidas contra o layout em tests/checkpoint.test.js.
for (const id of ['forest', 'plains', 'ruins', 'glacier', 'ember']) {
  ZONES[id].checkpoints = [{ id: id + ':cp1', x: 330, y: FARM_MID - 170, name: 'Pedra de Retorno' }, { id: id + ':cp2', x: 2250, y: FARM_MID + 20, name: 'Pedra de Retorno' }];
}

// Baús dos acampamentos: o centro de cada acampamento com `chest` (tier) vira um baú da zona (ids `<zona>:c<n>`), igual aos demais.
for (const z of Object.values(ZONES)) {
  for (const c of z.camps ?? []) if (c.chest) (z.chests ??= []).push({ id: c.id, x: c.x, y: c.y, tier: c.chest, camp: c.id });
}
