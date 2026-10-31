// Falas dos NPCs (dados). `greet`: quando não há missão a oferecer, entregar ou acompanhar; `service`: botão do serviço do NPC (painel que abre).
export const DIALOGS = {
  merchant: { greet: 'Bem-vindo à loja de Lúmen! Poções, essências e equipamentos de segunda mão — tudo com preço justo.', service: { label: 'Abrir a loja', panel: 'shop' } },
  arena: { greet: 'A arena guarda os ecos de todos que lutaram aqui. Prove seu valor!', service: { label: 'Entrar na arena', panel: 'arena' } },
  sage: { greet: 'Spirits são ecos da natureza. Escolha bem quem caminha ao seu lado.', service: { label: 'Falar de spirits', panel: 'sage' } },
  guard: { greet: 'A vila está calma por enquanto. Volte quando houver mais perigo à vista — e confira o mapa (M) antes de viajar.', service: null },
  herbalist: { greet: 'As ervas do bosque não colhem sozinhas. Se encontrar baús pelo caminho, abra-os: nunca se sabe o que guardam.', service: null },
};
