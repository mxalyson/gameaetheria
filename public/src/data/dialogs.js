// Falas dos NPCs (dados). `greet`: quando não há missão a oferecer, entregar ou acompanhar; `service`: botão do serviço do NPC (painel que abre).
// `greet` é uma lista de { when, text }: vale a primeira entrada que bate (core/journal.js greetFor); a última, sem `when`, é o padrão.
// Condições de `when`: level, bossKills, bossKillsMax, done (missão concluída), offline. Voz: Ren seco, Mel afetuosa, Doran teatral, Yun enigmática, Lia esperta, Brok poucas palavras.
export const DIALOGS = {
  merchant: { greet: [
    { when: { level: 20 }, text: 'Cliente de nível alto! Só ouro de verdade, por favor. Poções, essências e pergaminhos, como sempre.' },
    { text: 'Bem-vindo à loja de Lúmen! Poções, essências e equipamentos de segunda mão, tudo com preço justo.' },
  ], service: { label: 'Abrir a loja', panel: 'shop' } },
  arena: { greet: [
    { when: { done: 'cavaleiro_rubro' }, text: 'Dizem que o Rubro esperou a gente. Arena é isso, esperar. E você, herói, não faz ninguém esperar.' },
    { when: { offline: true }, text: 'Sem rede, o palco da Grande Arena fica às escuras! As Ondas continuam de pé: treine lá, e volte quando houver adversários de verdade!' },
    { text: 'Ah, a arena! Ela guarda os ecos de todos que lutaram aqui. Suba ao palco e prove seu valor!' },
  ], service: { label: 'Entrar na arena', panel: 'arena' } },
  sage: { greet: [
    { when: { done: 'ecos_unidos' }, text: 'Os ecos repousam, mas eu ainda os ouço, bem baixinho. Escolha bem quem caminha ao seu lado.' },
    { when: { done: 'anciao_gelido' }, text: 'O frio não era dele. Era do que veio antes. Os spirits ainda estremecem quando falo disso.' },
    { when: { bossKills: 1 }, text: 'Ouço o Carvalho em você, quase um sussurro. Spirits são ecos da natureza: escolha bem quem caminha ao seu lado.' },
    { text: 'Spirits são ecos da natureza. Escolha bem quem caminha ao seu lado.' },
  ], service: { label: 'Falar de spirits', panel: 'sage' } },
  guard: { greet: [
    { when: { done: 'cavaleiro_rubro' }, text: 'Cinzas apagadas, estrada livre. Por enquanto.' },
    { when: { done: 'guardiao_das_ruinas' }, text: 'O Guardião caiu e as ruínas ficaram quietas demais. Fique atento.' },
    { when: { bossKillsMax: 0 }, text: 'Se o bosque te assustar, volte. Sem vergonha. No mapa, os lugares já visitados oferecem teletransporte.' },
    { text: 'A vila está calma por enquanto. Volte quando houver mais perigo à vista. No mapa, os lugares já visitados oferecem teletransporte.' },
  ], service: null },
  smith: { greet: [
    { when: { level: 25 }, text: 'Seu aço está cansado. O meu fogo, não. Traga.' },
    { text: 'Metal bom lembra de quem o forjou. Traga o que veste. Eu deixo mais forte. Ouro, preço justo.' },
  ], service: { label: 'Aprimorar equipamento', panel: 'shop:smith' } },
  herbalist: { greet: [
    { when: { done: 'coracao_de_cristal' }, text: 'Ainda cheiro cristal nas suas botas. Sente-se, querido, tenho chá. E se achar baús pelo caminho, abra-os.' },
    { text: 'As ervas do bosque não colhem sozinhas. Se encontrar baús pelo caminho, abra-os: nunca se sabe o que guardam.' },
  ], service: null },
};

// Dicas de onboarding (cada uma 1× por personagem; bits em core/journal.js TIP_BITS). [título, texto]
export const TIPS = {
  forest: ['Bosque Verdejante', 'Ataque as criaturas e use as habilidades; as que têm cadeado liberam com o nível.'],
  chest: ['Primeiro baú', 'Equipe o melhor item pela mochila (🎒). Vale abrir todos os baús que encontrar.'],
  level: ['Pontos de atributo', 'Abra o personagem (🧙) e distribua os pontos para ficar mais forte.'],
  skill: ['Habilidade nova', 'Ela já está num dos botões de habilidade. As ainda bloqueadas mostram o nível em que liberam.'],
  spirit: ['Seu spirit', 'Spirits crescem com você. No nível 10 deles, evolua em 🔮 para ganhar mais poder.'],
  boss: ['Primeiro chefe', 'O mapa leva você a lugares já visitados. Pergaminhos de viagem são vendidos pela Mercadora Lia.'],
  ritual: ['Cinzas Ardentes', 'Aqui o chefe desperta pelo "Ritual N/40": cada criatura derrotada enche o contador, e o chão estremece ao completar.'],
};
