// Montarias (dados). Desenho aprovado em docs/roadmap/montaria.md; decisão 0018. Sem DOM, sem regras: as regras ficam em core/mounts.js e game/sim.js.
// Montaria é do PERSONAGEM (doc.mounts / doc.mount). Não há compra por ouro: só missão, Apito de Montaria (chefes/baús/Cripta) e conquista.
export const MOUNT_MUL = 1.5;          // +50% de velocidade; SUBSTITUI o correr (RUN_MUL), nunca soma
export const MOUNT_COMBAT_GRACE = 3;   // s fora de combate para montar e para continuar montado (igual ao correr)
export const MOUNT_MIN_LEVEL = 15;     // montar (e usar o Apito) só a partir do nível 15 (pedido do dono, 2026-11-06)
export const MOUNT_AUTO_DELAY = 1.5;   // s andando fora de combate até "Montar automático" montar (opção do aparelho, padrão desligada)

// `how`: texto de como obter. `source`: quest | whistle | achievement (o Apito só concede as de `whistle`).
// O código de rede é o índice + 1 em MOUNT_IDS (0 = sem montaria): a ORDEM desta lista é protocolo, só acrescente no fim.
export const MOUNTS = {
  wolf: { id: 'wolf', name: 'Lobo Cinzento', rarity: 'rare', source: 'quest', desc: 'Cinza, lobo da antiga guarda da fronteira. Rápido e leal; corre colado ao chão.', how: 'Missão "A Matilha da Estrada" com a Guarda Ren (nível 15).' },
  horse: { id: 'horse', name: 'Corcel Prateado', rarity: 'epic', source: 'whistle', desc: 'Corcel de crina de luar. Galopa sem cansar pelas estradas de Aetheria.', how: 'Apito de Montaria (raro: cai de chefes e do chefe da Cripta; usa a partir do nível 15).' },
  gryphon: { id: 'gryphon', name: 'Grifo Dourado', rarity: 'legendary', source: 'whistle', desc: 'Grifo de penas de ouro. Voo só de enfeite: não atravessa muros nem árvores.', how: 'Conquista "Veterano" (nível 20) ou Apito de Montaria.' },
};
export const MOUNT_IDS = Object.keys(MOUNTS);
export const WHISTLE_MOUNTS = MOUNT_IDS.filter((id) => MOUNTS[id].source === 'whistle' || MOUNTS[id].source === 'achievement'); // o que o Apito pode conceder (uma por tipo)

// Apito de Montaria: contador no personagem (doc.whistles), como poções e pergaminhos. O ícone é provisório (pendência de arte A11 em docs/roadmap/depende-do-dono.md).
export const WHISTLE = {
  id: 'mount_whistle', name: 'Apito de Montaria', rarity: 'epic', icon: 'assets/icons/item/res-scroll.webp', max: 20,
  desc: 'Ao usar, chama uma montaria que você ainda não tem (uma de cada tipo).',
  // Queda: chefes e chefe da Cripta têm `boss` base + `step` por chefe abatido sem Apito (azar acumulado), garantido ao atingir `cap`; baú tem chance fixa por nível do baú.
  // 2026-11-06: era 5% + 2,5%/chefe (garantido em 38) e 1,2% por baú — fácil demais; agora 2% + 1%/chefe, garantido em 80, e baú não dá mais
  boss: { base: 0.02, step: 0.01, cap: 80 }, chest: 0,
};

// Textos de recusa (a interface só mostra; quem decide é core/mounts.js mountProblem).
export const MOUNT_REASONS = {
  none: 'Você ainda não tem uma montaria.', level: 'Montaria só a partir do nível 15.', zone: 'Não dá para montar aqui.', combat: 'Fora de combate por 3 s para montar.', dead: 'Você está caído.', stun: 'Você está atordoado.',
};
