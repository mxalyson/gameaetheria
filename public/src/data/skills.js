// Habilidades são dados; o simulador interpreta pelo campo `kind`.
export const SKILLS = {
  whirlwind: { name: 'Golpe Giratório', icon: '🌀', cd: 5, kind: 'aoe_self', radius: 110, mult: 1.7, color: '#ffb199',
    desc: 'Gira a lâmina, ferindo todos ao redor.' },
  charge: { name: 'Investida', icon: '⚡', cd: 7, kind: 'dash', dist: 240, speed: 900, mult: 1.5, stun: 1.2, color: '#ffd27a',
    desc: 'Avança até o cursor, atordoando quem atingir.' },
  warcry: { name: 'Grito de Guerra', icon: '📯', cd: 14, kind: 'buff', dur: 6, buff: { dmg: 0.35, dr: 0.25 }, color: '#ff8a65',
    desc: '+35% de dano e -25% de dano recebido por 6s.' },

  fireball: { name: 'Bola de Fogo', icon: '🔥', cd: 3.5, kind: 'projectile', speed: 440, range: 600, mult: 1.8, explode: 80, radius: 11, color: '#ff8a3d',
    desc: 'Projétil que explode em área.' },
  frostnova: { name: 'Nova de Gelo', icon: '❄️', cd: 8, kind: 'aoe_self', radius: 150, mult: 1.0, slow: 0.5, slowDur: 3, color: '#9fe3ff',
    desc: 'Explosão gélida que fere e desacelera em 50%.' },
  blink: { name: 'Teleporte', icon: '💫', cd: 6, kind: 'blink', dist: 260, color: '#c7b8ff',
    desc: 'Teleporta na direção do cursor.' },

  rain: { name: 'Chuva de Flechas', icon: '🌧️', cd: 8, kind: 'ground_aoe', range: 450, radius: 100, mult: 0.55, ticks: 6, interval: 0.35, color: '#c8e68a',
    desc: 'Bombardeia a área do cursor várias vezes.' },
  pierce: { name: 'Tiro Perfurante', icon: '🎯', cd: 5, kind: 'projectile', speed: 820, range: 700, mult: 2.3, pierce: true, radius: 6, color: '#eaffb0',
    desc: 'Flecha que atravessa todos os inimigos.' },
  roll: { name: 'Rolamento', icon: '💨', cd: 4, kind: 'dash', dist: 200, speed: 1000, mult: 0, invuln: true, color: '#e0f0ff',
    desc: 'Esquiva rápida, invulnerável durante o movimento.' },

  holylight: { name: 'Luz Sagrada', icon: '☀️', cd: 8, kind: 'aoe_self', radius: 130, mult: 1.1, heal: 0.22, color: '#fff2a8',
    desc: 'Cura 22% da vida e fere inimigos próximos.' },
  divineshield: { name: 'Escudo Divino', icon: '🛡️', cd: 15, kind: 'buff', dur: 6, buff: { shieldPct: 0.35 }, color: '#ffe9a0',
    desc: 'Escudo que absorve dano igual a 35% da vida máxima.' },
  judgement: { name: 'Julgamento', icon: '⚖️', cd: 6, kind: 'projectile', speed: 560, range: 560, mult: 2.2, stun: 1.5, radius: 9, color: '#fff6c2',
    desc: 'Raio sagrado que atordoa por 1s.' },
};
