// Habilidades são dados; o simulador interpreta pelo campo `kind`.
export const SKILLS = {
  whirlwind: { name: 'Golpe Giratório', icon: '🌀', cd: 4, kind: 'aoe_self', radius: 110, mult: 2.0, color: '#ffb199',
    desc: 'Gira a lâmina, ferindo todos ao redor.' },
  charge: { name: 'Investida', icon: '⚡', cd: 6, kind: 'dash', dist: 280, speed: 900, mult: 1.5, stun: 1.2, color: '#ffd27a',
    desc: 'Avança até o cursor, atordoando quem atingir.' },
  warcry: { name: 'Grito de Guerra', icon: '📯', cd: 14, kind: 'buff', dur: 6, buff: { dmg: 0.35, dr: 0.25 }, color: '#ff8a65',
    desc: '+35% de dano e -25% de dano recebido por 6s.' },

  fireball: { name: 'Bola de Fogo', icon: '🔥', cd: 3.5, kind: 'projectile', speed: 440, range: 600, mult: 2.0, explode: 80, radius: 11, color: '#ff8a3d',
    desc: 'Projétil que explode em área.' },
  frostnova: { name: 'Nova de Gelo', icon: '❄️', cd: 8, kind: 'aoe_self', radius: 150, mult: 1.0, slow: 0.5, slowDur: 3, color: '#9fe3ff',
    desc: 'Explosão gélida que fere e desacelera em 50%.' },
  blink: { name: 'Teleporte', icon: '💫', cd: 6, kind: 'blink', dist: 260, color: '#c7b8ff',
    desc: 'Teleporta na direção do cursor.' },

  rain: { name: 'Chuva de Flechas', icon: '🌧️', cd: 8, kind: 'ground_aoe', range: 450, radius: 100, mult: 0.5, ticks: 6, interval: 0.35, color: '#c8e68a',
    desc: 'Bombardeia a área do cursor várias vezes.' },
  pierce: { name: 'Tiro Perfurante', icon: '🎯', cd: 5, kind: 'projectile', speed: 820, range: 700, mult: 2.0, pierce: true, radius: 6, color: '#eaffb0',
    desc: 'Flecha que atravessa todos os inimigos.' },
  roll: { name: 'Rolamento', icon: '💨', cd: 4, kind: 'dash', dist: 200, speed: 1000, mult: 0, invuln: true, color: '#e0f0ff',
    desc: 'Esquiva rápida, invulnerável durante o movimento.' },

  holylight: { name: 'Luz Sagrada', icon: '☀️', cd: 8, kind: 'aoe_self', radius: 130, mult: 1.1, heal: 0.16, allyHeal: 0.7, color: '#fff2a8',
    desc: 'Cura 16% da vida (aliados próximos recebem 70% disso) e fere inimigos próximos.' },
  divineshield: { name: 'Escudo Divino', icon: '🛡️', cd: 15, kind: 'buff', dur: 6, buff: { shieldPct: 0.28 }, allyShield: 0.6, allyRange: 260, color: '#ffe9a0',
    desc: 'Escudo de 28% da vida máxima; o aliado mais próximo (até 260) recebe 60% dele.' },
  judgement: { name: 'Julgamento', icon: '⚖️', cd: 6, kind: 'projectile', speed: 560, range: 560, mult: 2.6, stun: 1.5, radius: 9, color: '#fff6c2',
    desc: 'Raio sagrado que atordoa por 1s.' },

  // ---- Habilidades de Maestria (slot s3): nível 25 + missão `maestria` concluída. Recarga longa (35-45 s), efeito decisivo. `vfxLife` = duração do efeito visual (render/skill-vfx.js).
  colossus: { name: 'Fúria do Colosso', icon: '🗿', cd: 40, kind: 'dash', dist: 300, speed: 1000, mult: 1.0, stun: 0.6, slam: { radius: 150, mult: 1.2, stun: 0.8 }, buff: { dmg: 0.2 }, dur: 6, color: '#ffb23d', vfxLife: 6.6,
    desc: 'Investida devastadora: ao chegar, o impacto em área (raio 150) causa 180% de dano e atordoa por 0,8s (a investida já fere e atordoa 0,6s). +20% de dano por 6s.' },
  meteor: { name: 'Meteoro Arcano', icon: '☄️', cd: 40, kind: 'meteor', range: 520, radius: 170, delay: 1.0, mult: 21.0, stun: 1.0, burn: { dur: 4, every: 0.5, mult: 0.7 }, color: '#ff7a2e', vfxLife: 1.9,
    desc: 'Marca uma área enorme no cursor; após 1s um meteoro cai, causando 2100% de dano, atordoando por 1s e queimando por 4s (70% a cada 0,5s).' },
  arrowstorm: { name: 'Tempestade de Flechas Ardentes', icon: '🔥', cd: 35, kind: 'ground_aoe', range: 520, radius: 160, mult: 1.9, ticks: 12, interval: 0.25, slow: 0.4, slowDur: 1, color: '#ff9a3d', vfxLife: 3.4,
    desc: 'Por 3s, uma chuva ampla de flechas em chamas cai na área do cursor (12 rajadas de 190%) e desacelera os atingidos em 40%.' },
  intervention: { name: 'Intervenção Divina', icon: '🙏', cd: 45, kind: 'divine', radius: 320, heal: 0.4, allyHeal: 0.8, shieldPct: 0.3, dur: 5, color: '#fff2a8', vfxLife: 1.4, castStunned: true,
    desc: 'Remove atordoamento e lentidão, cura 40% da vida e dá escudo de 30% por 5s (aliados num raio de 320 recebem 80%). Pode ser usada atordoado.' },
};

// Nível em que cada slot de habilidade (s0, s1, s2) é aprendido; o ataque básico existe desde o nível 1. A especialização continua no nível 15 (data/specs.js).
// O 4º slot (s3, Maestria) abre no nível 25 E depois da missão `maestria` do mestre da classe (core/unlocks.js).
export const SKILL_UNLOCK = [1, 5, 10, 25];
