// Especializações (nível 15): duas por classe. Só AJUSTAM parâmetros das habilidades que a classe já tem
// (nenhuma habilidade nova, nenhuma removida). `skills[id]` é mesclado sobre `data/skills.js`; `buff` é mesclado campo a campo.
// `desc` substitui o texto da habilidade nas dicas (os números mudam).
export const SPEC_LEVEL = 15;

export const SPECS = {
  warrior: {
    bastion: {
      name: 'Bastião', icon: '🛡️', desc: 'Resistência e proteção: o Grito de Guerra dura mais e protege muito; a Investida recarrega mais rápido.',
      skills: {
        warcry: { dur: 9, buff: { dmg: 0.2, dr: 0.32 }, desc: '+20% de dano e -32% de dano recebido por 9s.' },
        charge: { cd: 5.5, mult: 1.2, desc: 'Avança até o cursor, atordoando quem atingir. Recarrega em 5,5s.' },
      },
    },
    executioner: {
      name: 'Carrasco', icon: '🪓', desc: 'Dano em área e finalização: o Golpe Giratório e a Investida batem muito mais forte.',
      skills: {
        whirlwind: { mult: 2.9, radius: 120, desc: 'Gira a lâmina com força total, ferindo todos ao redor.' },
        charge: { mult: 2.2, cd: 6.5, desc: 'Avança até o cursor com golpe pesado, atordoando quem atingir.' },
      },
    },
  },
  mage: {
    pyromancer: {
      name: 'Piromante', icon: '🔥', desc: 'Explosão de dano: a Bola de Fogo é maior e muito mais forte, porém recarrega mais devagar.',
      skills: {
        fireball: { mult: 3.3, explode: 115, cd: 4.0, desc: 'Projétil que explode em área grande, com dano elevado.' },
      },
    },
    cryomancer: {
      name: 'Criomante', icon: '❄️', desc: 'Controle de área: a Nova de Gelo é maior, fere mais e congela por mais tempo.',
      skills: {
        frostnova: { radius: 185, mult: 1.9, slow: 0.65, slowDur: 4, cd: 7, desc: 'Explosão gélida ampla que fere e desacelera em 65% por 4s.' },
        fireball: { mult: 1.7, desc: 'Projétil que explode em área.' },
      },
    },
  },
  archer: {
    marksman: {
      name: 'Atirador', icon: '🎯', desc: 'Precisão: o Tiro Perfurante vai mais longe e bate mais forte; o Rolamento recarrega mais devagar.',
      skills: {
        pierce: { mult: 2.9, range: 820, cd: 5.5, desc: 'Flecha potente e de longo alcance que atravessa todos os inimigos.' },
        roll: { cd: 5, desc: 'Esquiva rápida, invulnerável durante o movimento. Recarrega em 5s.' },
      },
    },
    hunter: {
      name: 'Caçador', icon: '🌧️', desc: 'Área e mobilidade: a Chuva de Flechas dura mais e cobre mais chão; o Rolamento recarrega mais rápido.',
      skills: {
        rain: { ticks: 8, radius: 125, mult: 0.45, cd: 7, desc: 'Bombardeia uma área ampla do cursor por mais tempo.' },
        roll: { cd: 4, desc: 'Esquiva rápida, invulnerável durante o movimento. Recarrega em 4s.' },
      },
    },
  },
  cleric: {
    guardian: {
      name: 'Guardião', icon: '🛡️', desc: 'Protetor do grupo: o Escudo Divino dura mais, alcança aliados mais longe e protege quase tanto quanto você.',
      skills: {
        divineshield: { dur: 8, cd: 15, allyShield: 0.95, allyRange: 340, desc: 'Escudo de 28% da vida máxima por 8s; o aliado mais próximo (até 340) recebe 95% dele.' },
        holylight: { allyHeal: 1.0, desc: 'Cura 18% da vida (aliados próximos recebem o mesmo) e fere inimigos próximos.' },
      },
    },
    inquisitor: {
      name: 'Inquisidor', icon: '⚖️', desc: 'Dano sagrado: o Julgamento acerta de mais longe e atordoa por mais tempo; a Luz Sagrada fere muito mais.',
      skills: {
        judgement: { mult: 3.0, range: 680, stun: 1.8, desc: 'Raio sagrado de longo alcance que atordoa por 1,8s.' },
        holylight: { mult: 1.6, desc: 'Cura 18% da vida e fere duramente os inimigos próximos.' },
      },
    },
  },
};
