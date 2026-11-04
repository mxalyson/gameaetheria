// KITS DAS ESPECIALIZAÇÕES (nível 15+): cada especialização tem 3 habilidades + 1 de Maestria PRÓPRIAS (ligadas em data/specs.js › kit).
// Mesclado em SKILLS (data/skills.js): o id é único e o resto do jogo busca por id. `art` = arquivo de ícone existente mais parecido
// (ícones pintados novos são do dono: docs/roadmap/depende-do-dono.md). Campos novos interpretados por game/sim.js:
//  mark {dur,taken}: alvo recebe +taken de dano · burn {dur,every,mult,spread}: dano contínuo; spread = ao morrer passa a inimigos no raio
//  windup: mira antes de atirar · waves/waveEvery: rajadas em sequência · cone: range+arc · cost {hp}: custa vida
//  buff {dmg,dr,as,ls,move,reflect,imm,crit,once}: as = vel. de ataque, ls = roubo de vida, reflect = devolve dano, imm = imune, once = some após 1 golpe
//  kind channel (leech), trap, zone, summon: áreas que ficam no chão · back/jump/knock: impulsos · twice {window,gap}: duas cargas · leave: blink deixa mina
export const KIT_SKILLS = {
  // ---- Paladino (guerreiro sagrado, protetor do grupo)
  pal_hammer: { name: 'Martelo Sagrado', icon: '🔨',  cd: 4.5, kind: 'projectile', speed: 520, range: 440, mult: 2.5, radius: 13, stun: 0.8, mark: { dur: 5, taken: 0.15 }, color: '#ffe08a',
    desc: 'Arremessa um martelo de luz: fere, atordoa por 0,8s e marca o alvo (+15% de dano recebido por 5s).' },
  pal_aura: { name: 'Aura de Bastião', icon: '🔆',  cd: 14, kind: 'buff', dur: 8, buff: { dr: 0.2, reflect: 0.35 }, allyBuff: 300, color: '#ffd98a',
    desc: 'Por 8s você e os aliados num raio de 300 recebem -20% de dano e devolvem 35% do dano sofrido ao agressor.' },
  pal_rush: { name: 'Investida do Escudo', icon: '🛡️',  cd: 7, kind: 'dash', dist: 220, speed: 800, mult: 1.3, stun: 0.8, knock: 70, buff: { imm: 1 }, dur: 1, color: '#ffe9a0',
    desc: 'Avança com o escudo: empurra e atordoa quem atingir e bloqueia 100% do dano por 1s.' },
  pal_sanctuary: { name: 'Santuário do Sol', icon: '🌞',  cd: 40, kind: 'zone', radius: 210, dur: 6, interval: 0.5, mult: 0.45, zone: { heal: 0.03, dr: 0.45 }, color: '#fff2a8', vfxLife: 6.4,
    desc: 'Zona solar por 6s: você e os aliados dentro curam 3% da vida a cada 0,5s e sofrem -45% de dano; inimigos queimam.' },

  // ---- Berserker (duas mãos, sangramento, frenesi)
  bsk_leap: { name: 'Salto Brutal', icon: '🦘',  cd: 8, kind: 'dash', jump: true, dist: 320, speed: 1100, mult: 0, invuln: true, slam: { radius: 135, mult: 2.8, stun: 0.5, burn: { dur: 4, every: 0.5, mult: 0.25 } }, color: '#ff8a5a',
    desc: 'Salta até o cursor (invulnerável no ar) e esmaga a área: 280% de dano, atordoa 0,5s e causa sangramento por 4s.' },
  bsk_frenzy: { name: 'Frenesi', icon: '🩸',  cd: 14, kind: 'buff', dur: 6, buff: { as: 0.35, ls: 0.1, dmg: 0.05 }, cost: { hp: 0.1 }, color: '#ff5a4a',
    desc: 'Paga 10% da vida máxima: +35% de velocidade de ataque, +5% de dano e 10% de roubo de vida por 6s.' },
  bsk_cleave: { name: 'Machadada em Arco', icon: '🪓',  cd: 4.5, kind: 'cone', range: 150, arc: 2.4, mult: 3.0, burn: { dur: 4, every: 0.5, mult: 0.25 }, color: '#ffb199', vfxR: 150,
    desc: 'Golpe amplo à frente (cone de 140°): 300% de dano e sangramento por 4s.' },
  bsk_fury: { name: 'Ira de Brasa', icon: '🔥',  cd: 40, kind: 'buff', dur: 8, buff: { dmg: 0.08, as: 0.10, move: 0.15, ls: 0.04 }, color: '#ff7a2e', vfxLife: 8.4,
    desc: 'Vira uma fera em brasa por 8s: +8% de dano, +10% de velocidade de ataque, +15% de movimento e 4% de roubo de vida.' },

  // ---- Arcano (precisão, prisma, espaço)
  arc_prism: { name: 'Raio Prismático', icon: '🌈',  cd: 3.4, kind: 'projectile', speed: 1400, range: 720, mult: 2.1, pierce: true, radius: 14, color: '#c7a8ff',
    desc: 'Feixe prismático veloz que atravessa todos os inimigos numa linha longa.' },
  arc_barrier: { name: 'Barreira Arcana', icon: '🔮',  cd: 13, kind: 'buff', dur: 5, buff: { shieldPct: 0.3, reflect: 0.4 }, color: '#b79cff',
    desc: 'Escudo de 30% da vida por 5s que devolve 40% do dano sofrido ao agressor.' },
  arc_phase: { name: 'Passo Fase', icon: '🌀',  cd: 6, kind: 'blink', dist: 300, leave: { radius: 115, mult: 1.6, delay: 1.2, stun: 0.6 }, color: '#d5b8ff',
    desc: 'Teleporta na direção do cursor e deixa uma mina arcana na origem: explode após 1,2s (160% de dano, atordoa 0,6s).' },
  arc_comet: { name: 'Cometa Arcano', icon: '☄️',  cd: 34, kind: 'meteor', range: 560, radius: 135, delay: 1.0, mult: 16.0, stun: 0.8, slow: 0.4, slowDur: 3, color: '#b79cff', vfxLife: 1.7,
    desc: 'Um cometa cai no cursor após 1s: 1600% de dano, atordoa 0,8s e desacelera em 40% por 3s.' },

  // ---- Bruxo (dano ao longo do tempo, drenagem, pacto)
  wl_curse: { name: 'Maldição', icon: '💀',  cd: 4, kind: 'projectile', speed: 480, range: 540, mult: 0.9, radius: 11, burn: { dur: 7, every: 0.5, mult: 0.4, spread: 150 }, color: '#9ae06a',
    desc: 'Projétil maldito: dano contínuo por 7s; se o alvo morrer amaldiçoado, a praga salta para inimigos próximos.' },
  wl_drain: { name: 'Drenar Vida', icon: '🩸',  cd: 9, kind: 'channel', range: 270, ticks: 5, interval: 0.5, mult: 0.8, leech: 0.6, color: '#7fcf6a', vfxR: 120,
    desc: 'Canaliza por 2,5s no inimigo mais próximo: 80% de dano a cada 0,5s e devolve 60% do dano como vida. Quebra se for atordoado.' },
  wl_pact: { name: 'Pacto Sombrio', icon: '👻',  cd: 18, kind: 'summon', dur: 10, interval: 0.8, mult: 0.4, speed: 520, range: 460, radius: 6, count: 2, cost: { hp: 0.08 }, color: '#a8ff7a', vfxR: 110,
    desc: 'Paga 8% da vida e invoca 2 espectros por 10s: cada um dispara 40% de dano a cada 0,8s no inimigo mais próximo.' },
  wl_souls: { name: 'Chuva de Almas', icon: '☠️',  cd: 32, kind: 'ground_aoe', range: 540, radius: 190, mult: 4.2, ticks: 12, interval: 0.25, leech: 0.6, color: '#8fe05a', vfxLife: 3.4,
    desc: 'Almas caem por 3s na área do cursor (12 ondas de 420%) e devolvem 60% do dano como vida.' },

  // ---- Franco-atirador (um tiro por vez, armadilha, tiro letal)
  sn_aim: { name: 'Tiro Mira Perfeita', icon: '🎯',  cd: 6.5, kind: 'projectile', windup: 0.7, speed: 1500, range: 950, mult: 7.0, pierce: true, radius: 8, color: '#9ff0e0',
    desc: 'Mira por 0,7s (você anda mais devagar) e dispara um tiro enorme (700%) que atravessa todos os inimigos.' },
  sn_trap: { name: 'Armadilha de Gelo', icon: '🧊',  cd: 10, kind: 'trap', range: 400, radius: 95, dur: 6, interval: 0.5, mult: 0.2, rootStun: 1.6, slow: 0.6, slowDur: 0.8, color: '#9fe3ff', vfxLife: 6.4,
    desc: 'Instala uma zona gélida por 6s: quem pisar fica preso por 1,6s e depois desacelerado em 60%.' },
  sn_retreat: { name: 'Recuo Tático', icon: '💨',  cd: 6, kind: 'dash', back: true, dist: 240, speed: 1000, mult: 0, invuln: true, buff: { crit: 100, once: true }, dur: 5, color: '#cffff2',
    desc: 'Impulso rápido para trás (invulnerável); o próximo golpe é crítico garantido (até 5s).' },
  sn_lethal: { name: 'Tiro Letal', icon: '☠️',  cd: 32, kind: 'projectile', windup: 0.6, speed: 1700, range: 1000, mult: 24.0, pierce: true, radius: 10, stun: 0.5, color: '#7dffe6', vfxLife: 0.8,
    desc: 'Mira por 0,6s e dispara um tiro devastador (2400% de dano) que atravessa tudo e atordoa por 0,5s.' },

  // ---- Pistoleiro (rajadas, granada, esquiva dupla)
  gs_fan: { name: 'Rajada em Leque', icon: '💥',  cd: 4.5, kind: 'projectile', volley: 5, spread: 0.16, speed: 800, range: 470, mult: 0.66, radius: 5, color: '#ffd27a',
    desc: 'Dispara 5 virotes em leque (66% cada), forte de perto.' },
  gs_grenade: { name: 'Granada Explosiva', icon: '💣',  cd: 8, kind: 'meteor', range: 420, radius: 110, delay: 0.55, mult: 4.0, stun: 0.4, color: '#ffa63d', vfxLife: 1.0,
    desc: 'Arremessa uma granada no cursor: explode em 0,55s, 400% de dano em área e atordoa 0,4s.' },
  gs_roll2: { name: 'Rolamento Duplo', icon: '🌀',  cd: 4, kind: 'dash', dist: 230, speed: 1000, mult: 0, invuln: true, twice: { window: 2.2, gap: 0.3 }, color: '#ffe2b0',
    desc: 'Duas esquivas seguidas (invulneráveis): a segunda sai em 0,3s; a recarga de 4s só começa depois.' },
  gs_barrage: { name: 'Saraivada', icon: '🔫',  cd: 22, kind: 'projectile', volley: 5, spread: 0.12, waves: 5, waveEvery: 0.18, speed: 850, range: 520, mult: 4.4, radius: 5, color: '#ffb23d',
    desc: 'Cinco rajadas de 5 virotes em sequência (440% cada) na direção do cursor.' },

  // ---- Sentinela (id guardian; cura em grupo, proteção)
  gd_light: { name: 'Luz Curativa em Área', icon: '☀️',  cd: 8, kind: 'aoe_self', radius: 280, mult: 1.8, heal: 0.14, allyHeal: 1.0, color: '#fff7c2',
    desc: 'Onda de luz num raio de 280: cura 14% da vida de você e dos aliados e fere os inimigos (180%).' },
  gd_ward: { name: 'Escudo Divino Reforçado', icon: '🛡️',  cd: 15, kind: 'buff', dur: 8, buff: { shieldPct: 0.25, dr: 0.14 }, groupShield: { range: 360, pct: 0.9 }, color: '#fff0b0',
    desc: 'Escudo de 25% da vida e -14% de dano por 8s para você; TODOS os aliados num raio de 360 recebem 90% do escudo.' },
  gd_word: { name: 'Palavra de Salvação', icon: '📖',  cd: 22, kind: 'divine', radius: 320, heal: 0.3, allyHeal: 1.0, shieldPct: 0, mult: 2.0, stun: 0.8, dur: 0, color: '#fffbd0', vfxLife: 1.2,
    desc: 'Cura grande (30%) em você e nos aliados num raio de 320, remove atordoamento e lentidão e fere os inimigos (200%, atordoa 0,8s).' },
  gd_celestial: { name: 'Intervenção Celestial', icon: '👼',  cd: 45, kind: 'divine', radius: 340, heal: 0.22, allyHeal: 1.0, shieldPct: 0.15, dur: 5, buff: { dr: 0.25 }, mult: 1.5, color: '#fff2a8', vfxLife: 1.4, castStunned: true,
    desc: 'Pode ser usada atordoado: remove controles, cura 22% e dá escudo de 15% (-25% de dano por 5s) a você e aliados; fere os inimigos.' },

  // ---- Inquisidor (fogo sagrado, marca, veredito)
  inq_judge: { name: 'Julgamento Ardente', icon: '⚖️',  cd: 3.4, kind: 'projectile', speed: 560, range: 620, mult: 5.5, radius: 10, burn: { dur: 4, every: 0.5, mult: 0.45 }, color: '#ffb36b',
    desc: 'Raio sagrado em chamas: fere e queima o alvo por 4s.' },
  inq_mark: { name: 'Marca da Pena', icon: '🪶',  cd: 8, kind: 'projectile', speed: 720, range: 660, mult: 2.2, radius: 10, mark: { dur: 7, taken: 0.3 }, color: '#e8d0ff',
    desc: 'Marca o alvo por 7s: ele recebe +30% de dano de qualquer fonte (inclusive dos aliados).' },
  inq_flame: { name: 'Chama Purificadora', icon: '🔥',  cd: 5.5, kind: 'cone', range: 200, arc: 1.5, mult: 4.6, burn: { dur: 4, every: 0.5, mult: 0.4 }, color: '#ffc27a',
    desc: 'Leque de fogo sagrado à frente: 420% de dano e queimadura por 4s.' },
  inq_verdict: { name: 'Livro do Veredito', icon: '📕',  cd: 38, kind: 'meteor', range: 540, radius: 185, delay: 1.0, mult: 15.0, stun: 1.0, burn: { dur: 5, every: 0.5, mult: 0.5 }, mark: { dur: 8, taken: 0.25 }, color: '#ffb36b', vfxLife: 1.8,
    desc: 'Sentença numa área enorme após 1s: 1500% de dano, atordoa 1s, queima por 5s e marca (+25% de dano recebido por 8s).' },
};

// Kit de cada especialização: 3 habilidades (slots 1-3) + Maestria (slot 4). O slot 0 do ataque básico continua o da classe (+ mods.basic).
export const SPEC_KITS = {
  paladin: { skills: ['pal_hammer', 'pal_aura', 'pal_rush'], mastery: 'pal_sanctuary' },
  berserker: { skills: ['bsk_leap', 'bsk_frenzy', 'bsk_cleave'], mastery: 'bsk_fury' },
  arcane: { skills: ['arc_prism', 'arc_barrier', 'arc_phase'], mastery: 'arc_comet' },
  warlock: { skills: ['wl_curse', 'wl_drain', 'wl_pact'], mastery: 'wl_souls' },
  sniper: { skills: ['sn_aim', 'sn_trap', 'sn_retreat'], mastery: 'sn_lethal' },
  gunslinger: { skills: ['gs_fan', 'gs_grenade', 'gs_roll2'], mastery: 'gs_barrage' },
  guardian: { skills: ['gd_light', 'gd_ward', 'gd_word'], mastery: 'gd_celestial' },
  inquisitor: { skills: ['inq_judge', 'inq_mark', 'inq_flame'], mastery: 'inq_verdict' },
};
