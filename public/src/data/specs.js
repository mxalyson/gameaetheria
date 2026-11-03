// Especializações (nível 15): duas por classe, uma defensiva/de sustentação e outra ofensiva. Só AJUSTAM o que a classe já tem
// (nenhuma habilidade nova, nenhuma removida, nenhuma arma nova). `skills[id]` é mesclado sobre `data/skills.js`; `buff` é mesclado campo a campo.
// `desc` substitui o texto da habilidade nas dicas (os números mudam); `name`/`icon`/`color` podem renomear a habilidade para combinar com o estilo.
// `mods` (opcional) mexe nos atributos de combate: stats { hpMul, powerMul, defMul, critAdd, critMultAdd, lifesteal, block, moveMul }, basic (ataque básico:
// cd, range, mult, speed) e lowHp { below, max } (dano extra que cresce de `below` da vida até 0). Quem interpreta: core/stats.js, core/specs.js e game/sim.js.
export const SPEC_LEVEL = 15;

// Reespecialização (decisão do dono): a PRIMEIRA escolha é grátis; trocar depois consome 1 Selo de Reespecialização, vendido pelo Mestre de Classe.
export const SEAL_PRICE = 15000;
export const SEAL_MAX = 9; // máximo carregado

// Ids antigos (saves, documentos do servidor) -> ids atuais. Aplicado em core/savedoc.js (validate) e no plausible.
export const SPEC_ALIASES = {
  bastion: 'paladin', executioner: 'berserker', pyromancer: 'arcane', cryomancer: 'warlock', marksman: 'sniper', hunter: 'gunslinger',
};

// Campos de habilidade que uma especialização pode acrescentar além dos que já existem em data/skills.js (o teste confere).
export const SKILL_EXTRA_FIELDS = ['pierce', 'burn', 'stun', 'volley', 'spread', 'allyBuff', 'aegis'];

export const SPECS = {
  warrior: {
    paladin: {
      name: 'Paladino', icon: '🛡️', desc: 'Defensor do grupo: Grito de Guerra longo que protege aliados, mais bloqueio e cura leve; Investida curta que ampara.',
      skills: {
        warcry: { dur: 12, buff: { dmg: 0.15, dr: 0.28 }, allyBuff: 300, desc: '+15% de dano e -28% de dano recebido por 12s, também para aliados num raio de 300.' },
        charge: { dist: 200, cd: 5, mult: 1.1, stun: 1.0, aegis: { range: 260, shield: 0.12 }, desc: 'Avanço curto que atordoa e dá escudo de 12% da vida a aliados num raio de 260.' },
      },
      mods: { stats: { defMul: 1.08, powerMul: 1.02, block: 8, lifesteal: 0.03 } },
    },
    berserker: {
      name: 'Berserker', icon: '🪓', desc: 'Fúria ofensiva: Golpe Giratório e Investida muito mais fortes; quanto menos vida, mais dano. Defesa menor.',
      skills: {
        whirlwind: { mult: 2.9, radius: 120, cd: 3.6, desc: 'Gira a lâmina com força total, ferindo todos ao redor.' },
        charge: { mult: 2.2, cd: 6.5, desc: 'Avança até o cursor com golpe pesado, atordoando quem atingir.' },
      },
      mods: { stats: { powerMul: 1.12, defMul: 0.96 }, lowHp: { below: 0.5, max: 0.5 } },
    },
  },
  mage: {
    arcane: {
      name: 'Arcano', icon: '💠', desc: 'Controle e precisão: projétil arcano rápido que perfura, Nova Arcana que atordoa e Teleporte mais longo e frequente.',
      skills: {
        fireball: { name: 'Projétil Arcano', icon: '✨', color: '#b79cff', pierce: true, explode: 0, speed: 760, range: 720, mult: 3.0, cd: 3.0, radius: 9, desc: 'Projétil arcano veloz de longo alcance que atravessa os inimigos.' },
        frostnova: { name: 'Nova Arcana', icon: '💠', color: '#c7a8ff', radius: 150, mult: 1.1, slow: 0, stun: 1.2, cd: 9, desc: 'Onda arcana ao redor que fere e atordoa por 1,2s.' },
        blink: { cd: 4.5, dist: 320, desc: 'Teleporta na direção do cursor, mais longe e recarrega em 4,5s.' },
      },
      mods: { stats: { critAdd: 5 } },
    },
    warlock: {
      name: 'Bruxo', icon: '☠️', desc: 'Dano ao longo do tempo: maldições que queimam e envenenam, e a vida do alvo alimenta a sua. Mais frágil.',
      skills: {
        fireball: { name: 'Praga Ardente', icon: '☠️', color: '#9ae06a', mult: 1.0, explode: 60, burn: { dur: 6, every: 0.5, mult: 0.6 }, desc: 'Projétil maldito que fere e queima o alvo por 6s (45% a cada 0,5s).' },
        frostnova: { name: 'Névoa Pestilenta', icon: '☣️', color: '#7fcf6a', radius: 160, mult: 0.6, slow: 0.3, slowDur: 3, burn: { dur: 6, every: 0.5, mult: 0.5 }, desc: 'Nuvem venenosa ao redor: fere, desacelera em 30% e envenena por 6s.' },
      },
      mods: { stats: { hpMul: 0.9, powerMul: 1.09, lifesteal: 0.07 } },
    },
  },
  archer: {
    sniper: {
      name: 'Franco-atirador', icon: '🎯', desc: 'Um tiro por vez: ataque básico lento e de longo alcance, crítico alto e Tiro Perfurante devastador.',
      skills: {
        pierce: { mult: 3.0, range: 900, speed: 1000, cd: 5.5, desc: 'Flecha potente e de longuíssimo alcance que atravessa todos os inimigos.' },
        roll: { cd: 5, desc: 'Esquiva rápida, invulnerável durante o movimento. Recarrega em 5s.' },
      },
      mods: { stats: { critAdd: 8, critMultAdd: 0.2 }, basic: { cd: 0.8, range: 700, mult: 0.85, speed: 900 } },
    },
    gunslinger: {
      name: 'Pistoleiro', icon: '💥', desc: 'Besta de repetição: disparos rápidos de curto e médio alcance, rajadas e Rolamento mais rápido.',
      skills: {
        pierce: { name: 'Rajada', icon: '💥', mult: 0.85, range: 480, speed: 800, cd: 4.5, pierce: false, volley: 3, spread: 0.18, desc: 'Rajada de 3 virotes em leque, curto e médio alcance.' },
        roll: { cd: 3, dist: 230, desc: 'Esquiva rápida e longa, invulnerável durante o movimento. Recarrega em 3s.' },
      },
      mods: { basic: { cd: 0.36, range: 430, mult: 0.56, speed: 780 } },
    },
  },
  cleric: {
    guardian: {
      name: 'Guardião', icon: '🛡️', desc: 'Protetor do grupo: o Escudo Divino dura mais, alcança aliados mais longe e protege quase tanto quanto você.',
      skills: {
        divineshield: { dur: 8, cd: 15, allyShield: 0.95, allyRange: 340, desc: 'Escudo de 28% da vida máxima por 8s; o aliado mais próximo (até 340) recebe 95% dele.' },
        holylight: { allyHeal: 1.0, mult: 1.7, desc: 'Cura 18% da vida (aliados próximos recebem o mesmo) e fere inimigos próximos.' },
      },
    },
    inquisitor: {
      name: 'Inquisidor', icon: '⚖️', desc: 'Dano sagrado: o Julgamento acerta de mais longe e atordoa por mais tempo; a Luz Sagrada fere muito mais.',
      skills: {
        judgement: { mult: 3.5, range: 680, stun: 1.8, desc: 'Raio sagrado de longo alcance que atordoa por 1,8s.' },
        holylight: { mult: 1.9, desc: 'Cura 18% da vida e fere duramente os inimigos próximos.' },
      },
      mods: { stats: { powerMul: 1.12 } },
    },
  },
};
