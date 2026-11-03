// temper: fração da chance de nascer hostil (0 = sempre passivo, só revida; padrão 1). hp/atk/def são multiplicadores sobre a curva por nível (ver makeMobActor).
export const MOBS = {
  slime: { name: 'Geleia', shape: 'slime', color: '#7fd6a4', temper: 0, hp: 0.75, atk: 0.7, speed: 85, range: 30, cd: 1.1, size: 15, aggro: 200, xp: 0.8 },
  wolf: { name: 'Lobo Cinzento', shape: 'wolf', color: '#a3abbd', hp: 0.9, atk: 1.0, speed: 150, range: 34, cd: 0.9, size: 16, aggro: 280, xp: 1 },
  shroom: { name: 'Cogumelo Esporento', shape: 'shroom', color: '#e98b8b', temper: 0.6, hp: 0.9, atk: 0.85, speed: 70, kind: 'ranged', range: 260, projSpeed: 280, projColor: '#f4c2e0', cd: 1.8, size: 15, aggro: 300, xp: 1.1 },
  treant: { name: 'Carvalho Ancestral', shape: 'treant', color: '#7a9a5a', hp: 9, atk: 1.5, speed: 70, range: 60, cd: 1.4, size: 42, aggro: 420, xp: 1, boss: true },

  crystalwolf: { name: 'Lobo de Cristal', shape: 'wolf', color: '#b9c7f0', hp: 1, atk: 1.05, speed: 160, range: 34, cd: 0.85, size: 17, aggro: 300, xp: 1.05 },
  golem: { name: 'Golem de Quartzo', shape: 'golem', color: '#c9b8f0', temper: 0.5, hp: 1.6, atk: 1.2, speed: 65, range: 40, cd: 1.5, size: 21, aggro: 240, xp: 1.4, def: 1.6 },
  wisp: { name: 'Fogo-fátuo', shape: 'wisp', color: '#9ee8ff', hp: 0.7, atk: 1, speed: 110, kind: 'ranged', range: 300, projSpeed: 340, projColor: '#bff3ff', cd: 1.6, size: 13, aggro: 320, xp: 1.1 },
  colossus: { name: 'Colosso de Cristal', shape: 'golem', color: '#a98bf0', hp: 10, atk: 1.6, speed: 60, range: 66, cd: 1.6, size: 46, aggro: 420, xp: 1, boss: true, def: 1.5 },

  wraith: { name: 'Espectro', shape: 'wraith', color: '#b6a6d8', hp: 0.85, atk: 1.1, speed: 120, kind: 'ranged', range: 280, projSpeed: 330, projColor: '#d7c6ff', cd: 1.5, size: 15, aggro: 320, xp: 1.15 },
  knight: { name: 'Cavaleiro Caído', shape: 'knight', color: '#8c93a8', hp: 1.4, atk: 1.25, speed: 105, range: 40, cd: 1.1, size: 18, aggro: 280, xp: 1.3, def: 1.3 },
  gargoyle: { name: 'Gárgula', shape: 'golem', color: '#8a8f9e', hp: 1.3, atk: 1.15, speed: 125, range: 38, cd: 1.0, size: 18, aggro: 300, xp: 1.25 },
  guardian: { name: 'Guardião das Ruínas', shape: 'knight', color: '#6f6890', hp: 9, atk: 1.7, speed: 85, range: 70, cd: 1.3, size: 44, aggro: 450, xp: 1, boss: true, def: 1.4 },
};


// Variantes recoloridas: `art` é a criatura pintada de base e `tint` o ajuste de cor aplicado uma vez ao carregar (render/mob-sprites.js).
export const MOBS_EXTRA = {
  frostslime: { name: 'Geleia Gélida', art: 'slime', tint: { hue: 70, sat: 1.1, bri: 1.2 }, shape: 'slime', color: '#9fd8ff', temper: 0.3, hp: 1.0, atk: 0.8, speed: 90, range: 30, cd: 1.1, size: 15, aggro: 220, xp: 0.9 },
  frostwolf: { name: 'Lobo da Geada', art: 'wolf', tint: { mul: [0.82, 1.0, 1.3], bri: 1.3 }, shape: 'wolf', color: '#cfe6ff', hp: 1.1, atk: 1.1, speed: 160, range: 34, cd: 0.85, size: 17, aggro: 300, xp: 1.1 },
  icewisp: { name: 'Fogo-fátuo Glacial', art: 'wisp', tint: { sat: 0.35, bri: 1.25, mul: [0.95, 1.0, 1.1] }, shape: 'wisp', color: '#e8f6ff', hp: 0.8, atk: 1.05, speed: 115, kind: 'ranged', range: 300, projSpeed: 340, projColor: '#e0f4ff', cd: 1.5, size: 13, aggro: 320, xp: 1.2 },
  frostlord: { name: 'Ancião Gélido', art: 'treant', tint: { hue: 150, sat: 0.55, bri: 1.35, mul: [0.9, 1.0, 1.25] }, shape: 'treant', color: '#8fc7ff', hp: 8.5, atk: 1.9, speed: 70, range: 60, cd: 1.3, size: 44, aggro: 440, xp: 1, boss: true },
  magmaslime: { name: 'Geleia de Magma', art: 'slime', tint: { hue: -115, sat: 1.4, bri: 1.1 }, shape: 'slime', color: '#ff8a4a', temper: 0.6, hp: 1.1, atk: 0.9, speed: 95, range: 30, cd: 1.0, size: 16, aggro: 240, xp: 1.0 },
  emberwolf: { name: 'Lobo de Brasa', art: 'wolf', tint: { mul: [1.5, 0.85, 0.55], bri: 1.05 }, shape: 'wolf', color: '#ff7a4a', hp: 1.2, atk: 1.25, speed: 170, range: 34, cd: 0.8, size: 17, aggro: 320, xp: 1.2 },
  cinderwraith: { name: 'Espectro de Cinzas', art: 'wraith', tint: { hue: 140, sat: 1.4, bri: 1.05 }, shape: 'wraith', color: '#ffb066', hp: 1.0, atk: 1.3, speed: 125, kind: 'ranged', range: 290, projSpeed: 340, projColor: '#ffb066', cd: 1.35, size: 15, aggro: 330, xp: 1.25 },
  infernoknight: { name: 'Cavaleiro Rubro', art: 'guardian', tint: { mul: [1.4, 0.55, 0.6], sat: 1.25, bri: 0.95 }, shape: 'knight', color: '#e0553a', hp: 16, atk: 3.2, speed: 90, range: 70, cd: 1.2, size: 46, aggro: 460, xp: 1, boss: true, def: 1.5 },
};
Object.assign(MOBS, MOBS_EXTRA);

export const NORMAL_MOBS = Object.keys(MOBS).filter((id) => !MOBS[id].boss);

// ---- Curva de dificuldade (medida com tools/boss-check.mjs; números em docs/gameplay/dificuldade.md) ----
// Base por nível do mob; hp/atk/def de cada MOBS são multiplicadores sobre ela. Calibrada contra a curva de poder do herói
// (core/stats.js + itens + Ferreiro): um mob comum do seu nível custa vida, 2+ juntos ameaçam, chefes pedem nível + equipamento aprimorado.
// B20: multiplicador de XP de elite/chefe, único para o jogo offline e o servidor.
export const XP_MULT = { elite: 3, boss: 10 };
export const MOB_CURVE = {
  hp: (lv) => 60 + 120 * lv ** 1.15,
  power: (lv) => 6 + 4.2 * lv ** 1.42,
  def: (lv) => lv * 3.4,
  elite: { hp: 3.2, atk: 1.4, def: 1.15 },
  // Mobs comuns só têm o ataque básico (sem golpe em área): compensam com mais dano base. Chefes usam a curva pura + mecânica.
  common: { hp: 1.15, atk: 3.1 },
  // Rampa de início (G6/G7): mobs não-chefe de nível baixo têm menos dano e vida, para o kit inicial das 4 classes vencer o mob do mesmo nível sem poção (sobe até 1 no nível 6).
  early: (lv) => Math.min(1, 0.95 + 0.01 * (lv - 1)),
  earlyHp: () => 1,
};

// Diferença de nível (mob - herói) acima de `free` níveis: o herói causa menos dano ao mob e leva mais dano dele. Impede pular zonas só com equipamento.
export const LEVEL_GAP = { free: 2, dealt: 0.07, minDealt: 0.35, taken: 0.05, maxTaken: 1.5 };

// Mecânica dos chefes (lida por game/ai.js): fases por % de vida, golpe em área telegrafado e, opcionalmente, invocações.
// slam: raio, multiplicador, recarga (s) e aviso (s) por fase [1, 2 (<60%), 3 (<30%, enrage)]. A fase 3 solta dois golpes.
export const BOSS_PHASES = {
  default: {
    p2: 0.6, p3: 0.3,
    speed: [1, 1.15, 1.3], atkSpeed: [1, 1.25, 1.5], power: [1, 1, 1.2],
    slam: { r: [125, 150, 175], mult: [1.8, 2.1, 2.4], cd: [5, 3.8, 2.6], delay: [1.1, 1.0, 0.9] },
  },
  // Último chefe: invoca esbirros pequenos a partir da fase 2.
  infernoknight: { summon: { mobId: 'magmaslime', every: 14, count: 2, max: 4, levelMinus: 9 } },
};

// Reaparição dos chefes (por id de mob). Padrão: volta `respawn` s depois de morrer.
// ritual: o chefe NÃO aparece sozinho; um contador enche com os abates da zona (elite vale `eliteWeight`) e, ao chegar em `need`, ele surge
// (antes disso, cada elite abatida depois de metade do contador tem chance crescente de adiantar). Depois de morrer, `cooldown` s de jogo antes de um novo ciclo.
export const BOSS_REPEAT = { window: 1800, mul: 0.5, floor: 0.25 };
// Acampamentos (elite + grupo) voltam depois do último morto; 150 s dava ~1,3 épico/h só de elites parado num acampamento (o farm normal rende ~1/h).
export const CAMP_RESPAWN = 300;
// Bônus de risco da noite (core/daycycle.js › nightMods): mobs enxergam 10% mais longe (aggro) e dão +15% de XP/drops. Só ao ar livre.
export const NIGHT = { aggroMul: 1.1, rewardMul: 1.15 };
export const BOSS_SPAWN = {
  // G5: reaparição longa (7–15 min) + abates repetidos do mesmo chefe em `repeatWindow` s valem `repeatMul` da chance de item a cada vez (World.onMobDeath).
  default: { respawn: 420 },
  treant: { respawn: 420 },
  colossus: { respawn: 540 },
  guardian: { respawn: 720 },
  frostlord: { respawn: 900 },
  // cooldown corre no relógio real (bossState.coolUntil), mesmo fora da zona.
  infernoknight: { ritual: { need: 40, eliteWeight: 4, earlyAt: 0.5, earlyChance: 0.06, omen: 3 }, cooldown: 1200 },
};
