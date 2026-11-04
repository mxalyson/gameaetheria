// Especializações (nível 15): duas por classe, uma defensiva/de sustentação e outra ofensiva. Cada uma tem um KIT PRÓPRIO de habilidades (data/kits.js):
// 3 habilidades (slots 1-3) + 1 de Maestria (slot 4, nível 25 + missão) que SUBSTITUEM as da classe; o ataque básico continua o da classe com `mods.basic`.
// Antes do nível 15 (ou sem especialização) vale o kit base da classe (data/classes.js). Quem resolve qual habilidade ocupa cada slot: core/unlocks.js › skillIdAt.
// `kit` é preenchido no fim do arquivo a partir de SPEC_KITS. `desc` descreve o estilo (até 140 caracteres).
// `mods` (opcional) mexe nos atributos de combate: stats { hpMul, powerMul, defMul, critAdd, critMultAdd, lifesteal, block, moveMul }, basic (ataque básico:
// cd, range, mult, speed) e lowHp { below, max } (dano extra que cresce de `below` da vida até 0). Quem interpreta: core/stats.js, core/specs.js e game/sim.js.
// `noOffhand: true` (Berserker): não usa escudo; core/stats.js (canEquip/computeStats), core/specs.js (chooseSpec devolve o escudo à mochila) e core/savedoc.js aplicam.
import { SPEC_KITS } from './kits.js';

export const SPEC_LEVEL = 15;

// Reespecialização (decisão do dono): a PRIMEIRA escolha é grátis; trocar depois consome 1 Selo de Reespecialização, vendido pelo Mestre de Classe.
export const SEAL_PRICE = 15000;
export const SEAL_MAX = 9; // máximo carregado

// Ids antigos (saves, documentos do servidor) -> ids atuais. Aplicado em core/savedoc.js (validate) e no plausible.
export const SPEC_ALIASES = {
  bastion: 'paladin', executioner: 'berserker', pyromancer: 'arcane', cryomancer: 'warlock', marksman: 'sniper', hunter: 'gunslinger',
};

// Campos de habilidade ajustáveis por `skills[id]` (mecanismo antigo de modificação, mantido em core/specs.js › skillOf; hoje nenhuma spec o usa).
export const SKILL_EXTRA_FIELDS = ['pierce', 'burn', 'stun', 'volley', 'spread', 'allyBuff', 'aegis'];

export const SPECS = {
  warrior: {
    paladin: {
      name: 'Paladino', icon: '🛡️', color: '#ffd98a', desc: 'Defensor do grupo: martelo que atordoa e marca, aura que reflete dano, investida de escudo e zona solar.',
      mods: { stats: { defMul: 1.08, powerMul: 1.02, block: 8, lifesteal: 0.02 } },
    },
    berserker: {
      name: 'Berserker', icon: '🪓', color: '#ff7a2e', noOffhand: true, desc: 'Duas mãos, sem escudo: salto, frenesi e sangramento; quanto menos vida, mais dano. Sem bloqueio e com defesa menor.',
      mods: { stats: { powerMul: 1.05, defMul: 0.97 }, basic: { mult: 1.2 }, lowHp: { below: 0.5, max: 0.7 } },
    },
  },
  mage: {
    arcane: {
      name: 'Arcano', icon: '💠', color: '#b79cff', desc: 'Controle e precisão: raio prismático que perfura, barreira que reflete, passo com mina e cometa.',
      mods: { stats: { critAdd: 5 } },
    },
    warlock: {
      name: 'Bruxo', icon: '☠️', color: '#8fe05a', desc: 'Dano ao longo do tempo: maldição que se espalha, drenagem de vida, espectros e chuva de almas. Mais frágil.',
      mods: { stats: { hpMul: 0.9, powerMul: 1.12, lifesteal: 0.05 } },
    },
  },
  archer: {
    sniper: {
      name: 'Franco-atirador', icon: '🎯', color: '#7dffe6', desc: 'Um tiro por vez: mira perfeita, armadilha de gelo, recuo com crítico garantido e o Tiro Letal. Básico lento e longo.',
      mods: { stats: { critAdd: 8, critMultAdd: 0.2 }, basic: { cd: 0.8, range: 700, mult: 0.85, speed: 900 } },
    },
    gunslinger: {
      name: 'Pistoleiro', icon: '💥', color: '#ffb23d', desc: 'Besta de repetição: rajada em leque, granada explosiva, rolamento duplo e saraivada. Disparos rápidos de perto.',
      mods: { basic: { cd: 0.36, range: 430, mult: 0.56, speed: 780 } },
    },
  },
  cleric: {
    guardian: {
      name: 'Sentinela', icon: '🛡️', color: '#fff0b0', desc: 'Protetor do grupo: cura em área, escudo para todos os aliados, Palavra de Salvação e Intervenção Celestial.',
    },
    inquisitor: {
      name: 'Inquisidor', icon: '⚖️', color: '#ffb36b', desc: 'Dano sagrado: julgamento que queima, marca que amplia o dano, chama purificadora e o Livro do Veredito.',
      mods: { stats: { powerMul: 1.16, lifesteal: 0.12 } },
    },
  },
};

for (const cls of Object.values(SPECS)) for (const [id, sp] of Object.entries(cls)) sp.kit = SPEC_KITS[id];
