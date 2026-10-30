// hp/atk/def são multiplicadores sobre a curva por nível (ver makeMobActor).
export const MOBS = {
  slime: { name: 'Geleia', shape: 'slime', color: '#7fd6a4', hp: 0.75, atk: 0.7, speed: 85, range: 30, cd: 1.1, size: 15, aggro: 200, xp: 0.8 },
  wolf: { name: 'Lobo Cinzento', shape: 'wolf', color: '#a3abbd', hp: 0.9, atk: 1.0, speed: 150, range: 34, cd: 0.9, size: 16, aggro: 280, xp: 1 },
  shroom: { name: 'Cogumelo Esporento', shape: 'shroom', color: '#e98b8b', hp: 0.9, atk: 0.85, speed: 70, kind: 'ranged', range: 260, projSpeed: 280, projColor: '#f4c2e0', cd: 1.8, size: 15, aggro: 300, xp: 1.1 },
  treant: { name: 'Carvalho Ancestral', shape: 'treant', color: '#7a9a5a', hp: 9, atk: 1.5, speed: 70, range: 60, cd: 1.4, size: 42, aggro: 420, xp: 1, boss: true },

  crystalwolf: { name: 'Lobo de Cristal', shape: 'wolf', color: '#b9c7f0', hp: 1, atk: 1.05, speed: 160, range: 34, cd: 0.85, size: 17, aggro: 300, xp: 1.05 },
  golem: { name: 'Golem de Quartzo', shape: 'golem', color: '#c9b8f0', hp: 1.6, atk: 1.2, speed: 65, range: 40, cd: 1.5, size: 21, aggro: 240, xp: 1.4, def: 1.6 },
  wisp: { name: 'Fogo-fátuo', shape: 'wisp', color: '#9ee8ff', hp: 0.7, atk: 1, speed: 110, kind: 'ranged', range: 300, projSpeed: 340, projColor: '#bff3ff', cd: 1.6, size: 13, aggro: 320, xp: 1.1 },
  colossus: { name: 'Colosso de Cristal', shape: 'golem', color: '#a98bf0', hp: 10, atk: 1.6, speed: 60, range: 66, cd: 1.6, size: 46, aggro: 420, xp: 1, boss: true, def: 1.5 },

  wraith: { name: 'Espectro', shape: 'wraith', color: '#b6a6d8', hp: 0.85, atk: 1.1, speed: 120, kind: 'ranged', range: 280, projSpeed: 330, projColor: '#d7c6ff', cd: 1.5, size: 15, aggro: 320, xp: 1.15 },
  knight: { name: 'Cavaleiro Caído', shape: 'knight', color: '#8c93a8', hp: 1.4, atk: 1.25, speed: 105, range: 40, cd: 1.1, size: 18, aggro: 280, xp: 1.3, def: 1.3 },
  gargoyle: { name: 'Gárgula', shape: 'golem', color: '#8a8f9e', hp: 1.3, atk: 1.15, speed: 125, range: 38, cd: 1.0, size: 18, aggro: 300, xp: 1.25 },
  guardian: { name: 'Guardião das Ruínas', shape: 'knight', color: '#6f6890', hp: 12, atk: 1.7, speed: 85, range: 70, cd: 1.3, size: 44, aggro: 450, xp: 1, boss: true, def: 1.4 },
};

export const NORMAL_MOBS = Object.keys(MOBS).filter((id) => !MOBS[id].boss);
export const BOSS_MOBS = Object.keys(MOBS).filter((id) => MOBS[id].boss);
