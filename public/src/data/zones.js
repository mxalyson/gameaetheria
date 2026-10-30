// Mundo leve: uma vila central + 3 regiões de farm em sequência + arenas.
// Nível dos mobs cresce de oeste para leste dentro de cada região.
const ARENA = {
  w: 1100, h: 1100, circle: true, radius: 500, noLeash: true,
  palette: { ground: '#ead9b0', ground2: '#e0cd9f', outside: '#2d2a36', ring: '#b9a37a' },
  pillars: [{ x: 330, y: 330 }, { x: 770, y: 330 }, { x: 330, y: 770 }, { x: 770, y: 770 }],
  decor: { trees: 0, rocks: 0, bushes: 0, flowers: 0 },
};

export const ZONES = {
  town: {
    name: 'Vila de Lúmen', w: 1700, h: 1300, safe: true, border: true, spawn: { x: 850, y: 720 },
    palette: { ground: '#a9d9a0', ground2: '#9dcf94', outside: '#5c8a58', path: '#eadfc4', path2: '#f3ead6' },
    treeColors: ['#4f9a5e', '#63b06f', '#83c98a'],
    flowerColors: ['#fff6a8', '#ffb3c7', '#ffffff', '#c7b3ff', '#ffcf99'],
    decor: { trees: 22, rocks: 6, bushes: 16, flowers: 140 },
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
    ],
    portals: [{ x: 1650, y: 620, to: 'forest', tx: 110, ty: 950, label: 'Bosque Verdejante · Nv 1-6' }],
  },

  forest: {
    name: 'Bosque Verdejante', w: 2800, h: 1900, border: true, level: [1, 6],
    mobs: [['slime', 5], ['wolf', 3], ['shroom', 3]], count: 24,
    boss: { id: 'treant', level: 7, x: 2250, y: 420 },
    palette: { ground: '#93cc8b', ground2: '#86c07f', outside: '#4f7a4c' },
    treeColors: ['#3f8a52', '#55a464', '#79c283'],
    flowerColors: ['#fff6a8', '#ffb3c7', '#ffffff', '#c7b3ff'],
    decor: { trees: 85, rocks: 18, bushes: 30, flowers: 200 },
    portals: [
      { x: 40, y: 950, to: 'town', tx: 1560, ty: 620, label: 'Vila de Lúmen' },
      { x: 2760, y: 950, to: 'plains', tx: 110, ty: 950, label: 'Planície de Cristal · Nv 6-12' },
    ],
  },

  plains: {
    name: 'Planície de Cristal', w: 2800, h: 1900, border: true, level: [6, 12],
    mobs: [['crystalwolf', 4], ['golem', 3], ['wisp', 3]], count: 26,
    boss: { id: 'colossus', level: 13, x: 2300, y: 1500 },
    palette: { ground: '#cfe2b2', ground2: '#c2d8a2', outside: '#6f7f5a' },
    treeColors: ['#6f9f6a', '#86b77c', '#a8d39a'],
    rockType: 'crystal',
    flowerColors: ['#ffffff', '#d8c8ff', '#b8e8ff'],
    decor: { trees: 40, rocks: 34, bushes: 20, flowers: 160 },
    portals: [
      { x: 40, y: 950, to: 'forest', tx: 2690, ty: 950, label: 'Bosque Verdejante' },
      { x: 2760, y: 950, to: 'ruins', tx: 110, ty: 950, label: 'Ruínas Sombrias · Nv 12-20+' },
    ],
  },

  ruins: {
    name: 'Ruínas Sombrias', w: 2800, h: 1900, border: true, level: [12, 20], scale: true,
    mobs: [['wraith', 3], ['knight', 3], ['gargoyle', 3]], count: 28,
    boss: { id: 'guardian', level: 21, x: 2350, y: 950 },
    palette: { ground: '#b7b4c6', ground2: '#aaa6bb', outside: '#3f3c4d' },
    treeColors: ['#4e5f63', '#5f7377', '#7a9094'],
    treeType: 'pine', rockType: 'pillar',
    flowerColors: ['#c9b6ff', '#9f8fd6', '#e6dcff'],
    decor: { trees: 26, rocks: 40, bushes: 10, flowers: 90 },
    portals: [{ x: 40, y: 950, to: 'plains', tx: 2690, ty: 950, label: 'Planície de Cristal' }],
  },

  arena: { ...ARENA, name: 'Arena de Lúmen — Duelo' },
  waves: { ...ARENA, name: 'Arena das Ondas', palette: { ...ARENA.palette, ground: '#d9cfe8', ground2: '#cdc1df', ring: '#9d8fbf' } },
};
