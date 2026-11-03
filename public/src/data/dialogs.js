// Falas dos NPCs (dados). `greet`: quando não há missão a oferecer, entregar ou acompanhar; `service`: botão do serviço do NPC (painel que abre).
// `greet` é uma lista de { when, text }: vale a primeira entrada que bate (core/journal.js greetFor); a última, sem `when`, é o padrão.
// Condições de `when`: classId, notClassId, level, bossKills, bossKillsMax, done (missão concluída), offline. Voz: Ren seco, Mel afetuosa, Doran teatral, Yun enigmática, Lia esperta, Brok poucas palavras.
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
  master_warrior: { greet: [
    { when: { classId: 'warrior', done: 'maestria' }, text: 'Mestre do aço, e ainda de pé. Poucos chegam aqui. Sinta orgulho, e mantenha a guarda alta.' },
    { when: { classId: 'warrior', done: 'prova_do_mestre' }, text: 'A prova ficou para trás. Agora é domínio: a Maestria espera, no nível 25. Escolha a sua especialização com calma.' },
    { when: { classId: 'warrior' }, text: 'O aço ensina quem aguenta o golpe. Você tem ombros para isso. Quando estiver pronto, prove-se.' },
    { text: 'Sou mestre do aço. Não ensino a sua arte, mas respeito quem a pratica. Procure o mestre da sua classe, ao meu lado.' },
  ], service: { label: 'Escolher especialização', panel: 'character', classId: 'warrior' } },
  master_mage: { greet: [
    { when: { classId: 'mage', done: 'maestria' }, text: 'Dominou a arte arcana. O silêncio da biblioteca agora lhe pertence.' },
    { when: { classId: 'mage', done: 'prova_do_mestre' }, text: 'A prova ficou para trás. Agora é domínio: a Maestria espera, no nível 25. Escolha a sua especialização com calma.' },
    { when: { classId: 'mage' }, text: 'A magia pede disciplina antes de poder. Volte quando tiver ambos.' },
    { text: 'Domino o arcano, não a sua arte. Meu colega de classe lhe ensinará. Está logo ao lado.' },
  ], service: { label: 'Escolher especialização', panel: 'character', classId: 'mage' } },
  master_archer: { greet: [
    { when: { classId: 'archer', done: 'maestria' }, text: 'Sua mira já não treme. Poucos chegam a esse ponto. Guarde a flecha para o que importa.' },
    { when: { classId: 'archer', done: 'prova_do_mestre' }, text: 'A prova ficou para trás. Agora é domínio: a Maestria espera, no nível 25. Escolha a sua especialização com calma.' },
    { when: { classId: 'archer' }, text: 'O arco ensina paciência. A pressa erra o alvo. Quando estiver firme, venha provar.' },
    { text: 'Ensino apenas o arco. A sua arte tem outro mestre, aqui ao lado. Vá, sem pressa.' },
  ], service: { label: 'Escolher especialização', panel: 'character', classId: 'archer' } },
  master_cleric: { greet: [
    { when: { classId: 'cleric', done: 'maestria' }, text: 'Sua fé virou ofício. Fico em paz sabendo que alguém assim guarda a vila.' },
    { when: { classId: 'cleric', done: 'prova_do_mestre' }, text: 'A prova ficou para trás. Agora é domínio: a Maestria espera, no nível 25. Escolha a sua especialização com calma.' },
    { when: { classId: 'cleric' }, text: 'A fé sem prática é só palavra. Quando tiver ambas, apresente-se.' },
    { text: 'Ensino a fé sagrada, e a sua é outra. O mestre da sua classe espera ao lado. Vá em paz.' },
  ], service: { label: 'Escolher especialização', panel: 'character', classId: 'cleric' } },
  herbalist: { greet: [
    { when: { done: 'coracao_de_cristal' }, text: 'Ainda cheiro cristal nas suas botas. Sente-se, querido, tenho chá. E se achar baús pelo caminho, abra-os.' },
    { text: 'As ervas do bosque não colhem sozinhas. Se encontrar baús pelo caminho, abra-os: nunca se sabe o que guardam.' },
  ], service: null },
  // ---- Porto de Marfim (zona `harbor`): `service.panel` é o painel que a UI deve abrir (ver docs/gameplay/porto.md) ----
  banker: { greet: [
    { when: { done: 'porto_chegada' }, text: 'O primeiro item no cofre é sempre o mais difícil de largar. Os outros, o senhor guarda de olhos fechados.' },
    { when: { level: 20 }, text: 'Um cliente de peso! Seu cofre tem 40 vagas e ninguém além de você tem a chave. Nem eu, juro.' },
    { text: 'Banco de Marfim: guardo o que a mochila não aguenta. Quarenta vagas, sem juros e sem perguntas.' },
  ], service: { label: 'Abrir o banco', panel: 'bank' } },
  hunter: { greet: [
    { when: { done: 'porto_contrato' }, text: 'Seu nome já circula no quadro. Gosto de quem entrega no prazo. Hoje tem contrato novo.' },
    { when: { bossKills: 1 }, text: 'Já derrubou um chefe, é? Ótimo. O quadro muda todo dia: três contratos, pagamento na entrega.' },
    { text: 'O Quadro de Contratos renova toda manhã. Caça, baús, nada que um iniciante não aguente. Volte amanhã por mais.' },
  ], service: { label: 'Ver contratos de hoje', panel: 'board' } },
  dealer: { greet: [
    { when: { done: 'porto_gelo' }, text: 'O gelo do Cume rendeu bem. Poção e pergaminho com desconto de freguês, e troco itens comuns por um raro. Pergunte.' },
    { when: { level: 20 }, text: 'Mercadoria de navio, nível de gente grande. O estoque gira todo dia: o que sumiu hoje, só volta por sorte.' },
    { text: 'Do cais para a sua mochila! Estoque novo todo dia, preço de porto. Hoje tem até peça épica, se eu não vender antes.' },
  ], service: { label: 'Ver o estoque do dia', panel: 'shop:harbor' } },
  duelist: { greet: [
    { when: { offline: false }, text: 'Com o mar conectado, a Grande Arena de Doran tem adversários de carne e osso. O duelo amistoso, por ora, é só na jornada solo!' },
    { when: { done: 'porto_duelo' }, text: 'Lembro do seu golpe de cais. Quando quiser outra rodada, o ringue está de pé.' },
    { text: 'Duelo amistoso: sem pontos, sem rancor, só aço. Ninguém perde Elo no meu ringue. Aceita?' },
  ], service: { label: 'Duelo amistoso 1×1', panel: 'arena:friendly' } },
  captain: { greet: [
    { when: { done: 'ecos_unidos' }, text: 'A maré mudou depois do que fez. Os barcos voltaram a cantar. Obrigada, herói.' },
    { when: { done: 'porto_carga' }, text: 'As cargas voltaram e o cais respira. Eu devia lhe dar um navio. Por ora, aceite meu agradecimento.' },
    { when: { done: 'porto_chegada' }, text: 'Entre a Planície e as Ruínas, é aqui que todo mundo faz escala. Tem trabalho no cais, se quiser.' },
    { text: 'Os barcos estão parados desde o último eco. Mas o porto vive: loja, banco e quadro, tudo à mão. Boa caça.' },
  ], service: null },
};

// Dicas de onboarding (cada uma 1× por personagem; bits em core/journal.js TIP_BITS). [título, texto]
export const TIPS = {
  forest: ['Bosque Verdejante', 'Ataque as criaturas e use as habilidades; as que têm cadeado liberam com o nível.'],
  chest: ['Primeiro baú', 'O item novo já está na mochila: abra a Mochila no menu e equipe o melhor. Vale abrir todos os baús que encontrar.'],
  level: ['Pontos de atributo', 'Abra Personagem no menu e distribua os pontos para ficar mais forte.'],
  skill: ['Habilidade nova', 'Ela já está num dos botões de habilidade. As ainda bloqueadas mostram o nível em que liberam.'],
  spirit: ['Seu spirit', 'Spirits crescem com você. Para evoluir, faça a missão do elemento dele com a Sábia Yun (no nível 10 do spirit) e depois use Evoluir em Spirits.'],
  boss: ['Primeiro chefe', 'O mapa leva você a lugares já visitados. Pergaminhos de viagem são vendidos pela Mercadora Lia.'],
  ritual: ['Cinzas Ardentes', 'Aqui o chefe desperta pelo "Ritual N/40": cada criatura derrotada enche o contador, e o chão estremece ao completar.'],
};
