// Falas dos NPCs (dados). `greet`: quando não há missão a oferecer, entregar ou acompanhar; `service`: botão do serviço do NPC (painel que abre).
// `greet` é uma lista de { when, text }: vale a primeira entrada que bate (core/journal.js greetFor); a última, sem `when`, é o padrão.
// Condições de `when`: classId, notClassId, level, bossKills, bossKillsMax, done (missão concluída), offline. Voz: Ren seco, Mel afetuosa, Doran teatral, Yun enigmática, Lia esperta, Brok poucas palavras.
export const DIALOGS = {
  merchant: { greet: [
    { when: { level: 20 }, text: 'Cliente de nível alto! Só ouro de verdade, por favor. Poções, essências, pergaminhos e Amuleto da Fênix: ele guarda o seu eco e paga a queda por você.' },
    { text: 'Bem-vindo à loja de Lúmen! Poções, essências, pergaminhos e o Amuleto da Fênix: se você cair, ele guarda o seu eco e poupa seu ouro e XP.' },
  ], service: { label: 'Abrir a loja', panel: 'shop' } },
  arena: { greet: [
    { when: { done: 'cavaleiro_rubro' }, text: 'Dizem que o Rubro esperou a gente. Arena é isso, esperar. E você, herói, não faz ninguém esperar.' },
    { when: { offline: true }, text: 'Sem rede, o palco da Grande Arena fica às escuras! As Ondas continuam de pé: treine lá, e volte quando houver adversários de verdade!' },
    { text: 'Ah, a arena! Ela guarda os ecos de todos que lutaram aqui. Suba ao palco e prove seu valor!' },
  ], service: { label: 'Entrar na arena', panel: 'arena' } },
  sage: { greet: [
    { when: { done: 'cripta_dos_ecos' }, text: 'Você calou o Soberano, mas os ecos de lá não se apagam. Os fragmentos que trouxe rendem aço no Ferreiro. A Cripta recupera o fôlego em vinte minutos.' },
    { when: { done: 'ecos_unidos' }, text: 'Os ecos repousam, mas eu ainda os ouço, bem baixinho. Escolha bem quem caminha ao seu lado.' },
    { when: { level: 22, offline: true }, text: 'Sob as Ruínas há uma cripta onde os ecos presos têm um rei. Ela só se abre com o mar conectado. Volte quando houver rede, herói.' },
    { when: { done: 'porto_recado_da_sabia' }, text: 'As cartas de maré do Porto sussurram como os ecos. Marés e ecos sobem e descem juntos. A rota segue a geada.' },
    { when: { done: 'anciao_gelido' }, text: 'O frio não era dele. Era do que veio antes. Os spirits ainda estremecem quando falo disso.' },
    { when: { bossKills: 1 }, text: 'Ouço o Carvalho em você, quase um sussurro. Spirits são ecos da natureza: escolha bem quem caminha ao seu lado.' },
    { text: 'Eco é o que fica quando algo não repousa. Spirits são os ecos mansos da natureza. Escolha bem quem caminha ao seu lado.' },
  ], service: { label: 'Falar de spirits', panel: 'sage' } },
  guard: { greet: [
    { when: { done: 'cavaleiro_rubro' }, text: 'Cinzas apagadas, estrada livre. Por enquanto.' },
    { when: { done: 'guardiao_das_ruinas' }, text: 'O Guardião caiu e as ruínas ficaram quietas demais. Fique atento.' },
    { when: { done: 'matilha_da_estrada' }, text: 'Cinza gosta de você, dá para ver. Monte fora de combate; se alguém a ferir, ela se solta de você. Montaria não luta, herói.' },
    { when: { bossKillsMax: 0 }, text: 'Se o bosque te assustar, volte. Sem vergonha. Toque numa Pedra de Retorno: ela guarda o seu eco e, se você cair, acorda você ali.' },
    { text: 'A vila está calma por enquanto. Volte quando houver mais perigo à vista. No mapa, os lugares já visitados oferecem teletransporte.' },
  ], service: null },
  smith: { greet: [
    { when: { done: 'cripta_dos_ecos' }, text: 'Fragmentos de eco. Bom. Quarenta para a arma, sessenta para a armadura, mais ouro. Uma de cada. Aço que lembra não perdoa.' },
    { when: { level: 25 }, text: 'Seu aço está cansado. O meu fogo, não. E eco preso vira aço novo: fragmentos da Cripta, quarenta a arma, sessenta a armadura.' },
    { when: { level: 22 }, text: 'Metal bom lembra de quem o forjou. Eco preso também vira aço: fragmentos da Cripta, quarenta a arma, sessenta a armadura. Traga.' },
    { text: 'Metal bom lembra de quem o forjou. Traga o que veste. Eu deixo mais forte. Ouro, preço justo.' },
  ], service: { label: 'Aprimorar equipamento', panel: 'shop:smith' } },
  master_warrior: { greet: [
    { when: { classId: 'warrior', done: 'maestria' }, text: 'Mestre do aço, e ainda de pé. Poucos chegam aqui. Sinta orgulho, e mantenha a guarda alta.' },
    { when: { classId: 'warrior', done: 'prova_do_mestre' }, text: 'A prova ficou para trás. Agora é domínio: a Maestria espera, no nível 25. Escolha a sua especialização com calma.' },
    { when: { classId: 'warrior' }, text: 'O aço ensina quem aguenta o golpe. Você tem ombros para isso. Quando estiver pronto, prove-se.' },
    { text: 'Sou mestre do aço. Não ensino a sua arte, mas respeito quem a pratica. Procure o mestre da sua classe, ao meu lado.' },
  ], service: { label: 'Especialização e Selos', panel: 'character:master', classId: 'warrior' } },
  master_mage: { greet: [
    { when: { classId: 'mage', done: 'maestria' }, text: 'Dominou a arte arcana. O silêncio da biblioteca agora lhe pertence.' },
    { when: { classId: 'mage', done: 'prova_do_mestre' }, text: 'A prova ficou para trás. Agora é domínio: a Maestria espera, no nível 25. Escolha a sua especialização com calma.' },
    { when: { classId: 'mage' }, text: 'A magia pede disciplina antes de poder. Volte quando tiver ambos.' },
    { text: 'Domino o arcano, não a sua arte. Meu colega de classe lhe ensinará. Está logo ao lado.' },
  ], service: { label: 'Especialização e Selos', panel: 'character:master', classId: 'mage' } },
  master_archer: { greet: [
    { when: { classId: 'archer', done: 'maestria' }, text: 'Sua mira já não treme. Poucos chegam a esse ponto. Guarde a flecha para o que importa.' },
    { when: { classId: 'archer', done: 'prova_do_mestre' }, text: 'A prova ficou para trás. Agora é domínio: a Maestria espera, no nível 25. Escolha a sua especialização com calma.' },
    { when: { classId: 'archer' }, text: 'O arco ensina paciência. A pressa erra o alvo. Quando estiver firme, venha provar.' },
    { text: 'Ensino apenas o arco. A sua arte tem outro mestre, aqui ao lado. Vá, sem pressa.' },
  ], service: { label: 'Especialização e Selos', panel: 'character:master', classId: 'archer' } },
  master_cleric: { greet: [
    { when: { classId: 'cleric', done: 'maestria' }, text: 'Sua fé virou ofício. Fico em paz sabendo que alguém assim guarda a vila.' },
    { when: { classId: 'cleric', done: 'prova_do_mestre' }, text: 'A prova ficou para trás. Agora é domínio: a Maestria espera, no nível 25. Escolha a sua especialização com calma.' },
    { when: { classId: 'cleric' }, text: 'A fé sem prática é só palavra. Quando tiver ambas, apresente-se.' },
    { text: 'Ensino a fé sagrada, e a sua é outra. O mestre da sua classe espera ao lado. Vá em paz.' },
  ], service: { label: 'Especialização e Selos', panel: 'character:master', classId: 'cleric' } },
  herbalist: { greet: [
    { when: { done: 'coracao_de_cristal' }, text: 'Ainda cheiro cristal nas suas botas. Sente-se, querido, tenho chá. E se achar baús pelo caminho, abra-os.' },
    { text: 'As ervas do bosque não colhem sozinhas. Se encontrar baús pelo caminho, abra-os: nunca se sabe o que guardam.' },
  ], service: null },
  // ---- Mentores de especialização (Porto de Marfim, data/mentors.js): a fala explica a especialização; o painel do diálogo mostra as habilidades e o botão de escolha (ui.js) ----
  mentor_paladin: { greet: [
    { when: { classId: 'warrior' }, text: 'Escudo erguido, fé firme. O Paladino lança o Martelo Sagrado, ergue a Aura de Bastião sobre os aliados e avança com a Investida do Escudo. Ecos quebram quem luta só: seja muralha.' },
    { text: 'Sou Sir Aurelion, e carrego a muralha do grupo. O caminho do escudo é de guerreiros; o seu é outro, mas honro quem protege.' },
  ], service: null },
  mentor_berserker: { greet: [
    { when: { classId: 'warrior' }, text: 'Sem escudo, sem medo! Berserker fazer Salto Brutal, Frenesi, Machadada em Arco, tudo de duas mãos. Frenesi custar sangue, dar fúria. Eco não sangra. Grumak sangra e vence.' },
    { text: 'Grumak! Eu golpear forte, eu sangrar, eu vencer. Isso é caminho de guerreiro. Você ter outro? Tudo bem. Grumak respeita.' },
  ], service: null },
  mentor_arcane: { greet: [
    { when: { classId: 'mage' }, text: 'Precisão e controle, jovem. O Arcano dispara o Raio Prismático, ergue a Barreira Arcana e some no Passo Fase, deixando uma mina. Todo eco segue um padrão; eu o decifro.' },
    { text: 'Velyra, a serviço da trama arcana. A arte do controle é dos magos; a sua escola é outra, mas toda magia nasce do mesmo silêncio.' },
  ], service: null },
  mentor_warlock: { greet: [
    { when: { classId: 'mage' }, text: 'Ah, uma alma curiosa... O Bruxo vive do frio do eco: Maldição que salta de alvo em alvo, Drenar Vida e espectros do Pacto Sombrio. Não é para os de estômago fraco.' },
    { text: 'Morvain, às ordens das sombras. O caminho do frio é de magos. O seu é outro? Pois guarde os arrepios para si.' },
  ], service: null },
  mentor_sniper: { greet: [
    { when: { classId: 'archer' }, text: 'Respire, mire, solte. A Franco-atiradora prende o alvo na Armadilha de Gelo, recua com o Recuo Tático e acerta o Tiro Mira Perfeita. Um eco só ouve o próprio nome; a flecha chega antes.' },
    { text: 'Lyra. Sou do alcance, e o alcance é dos arqueiros. Seu caminho é outro; ainda assim, mire alto.' },
  ], service: null },
  mentor_gunslinger: { greet: [
    { when: { classId: 'archer' }, text: 'Rajada, granada e rolamento! O Pistoleiro dispara a besta de repetição em leque, joga explosivos e some num rolamento duplo. Eco também cai com pólvora, amigo! Tem fogo, tem estilo!' },
    { text: 'Dom Cálix, para servi-lo! Besta de repetição é coisa de arqueiro. Você segue outro caminho? Pois que seja com estilo!' },
  ], service: null },
  mentor_guardian: { greet: [
    { when: { classId: 'cleric' }, text: 'A luz cuida de quem fica ao lado. A Sentinela cura em área, protege todos com escudo e traz a Palavra de Salvação e a Intervenção Celestial. Ecos nascem de quem caiu sozinho. Ninguém cai.' },
    { text: 'Irmã Aurora, a serviço da luz. Esse caminho é de clérigos. O seu é outro, mas a luz alcança todos.' },
  ], service: null },
  mentor_inquisitor: { greet: [
    { when: { classId: 'cleric' }, text: 'A luz também sabe queimar. O Inquisidor julga, marca o culpado para sofrer mais dano e purifica com chama sagrada, até o Livro do Veredito. Todo eco é um réu que recusa repousar.' },
    { text: 'Valdor, inquisidor. A sentença sagrada é caminho de clérigos. O seu é outro? Que a sua consciência o julgue com justiça.' },
  ], service: null },
  // ---- Porto de Marfim (zona `harbor`): `service.panel` é o painel que a UI deve abrir (ver docs/gameplay/porto.md) ----
  banker: { greet: [
    { when: { done: 'cripta_dos_ecos' }, text: 'Fragmentos de eco o senhor carrega consigo: não entram no cofre. Peças forjadas com eles, sim. Aço que lembra também precisa dormir.' },
    { when: { done: 'porto_cartas_de_mare' }, text: 'As cartas de maré estão seguras no cofre, e a Capitã sabe onde achá-las. O senhor tem mão boa para papel velho.' },
    { when: { done: 'porto_chegada' }, text: 'O primeiro item no cofre é sempre o mais difícil de largar. Os outros, o senhor guarda de olhos fechados.' },
    { when: { level: 20 }, text: 'Um cliente de peso! Seu cofre tem 40 vagas e ninguém além de você tem a chave. Nem eu, juro.' },
    { text: 'Banco de Marfim: guardo o que a mochila não aguenta. Quarenta vagas, sem juros e sem perguntas.' },
  ], service: { label: 'Abrir o banco', panel: 'bank' } },
  hunter: { greet: [
    { when: { done: 'porto_contratos_de_vesna' }, text: 'Seu nome está em letra grande no quadro, e a Capitã sabe quem fez a ronda. Cada contrato entregue ainda rende uma Chave de Eco.' },
    { when: { done: 'porto_contrato' }, text: 'Seu nome já circula no quadro. Gosto de quem entrega no prazo. Hoje tem contrato novo, e cada um entregue rende uma Chave de Eco.' },
    { when: { bossKills: 1 }, text: 'Já derrubou um chefe, é? Ótimo. O quadro muda todo dia: três contratos, pagamento na entrega.' },
    { text: 'O Quadro renova toda manhã: caça, baús, nada que um iniciante não aguente. Cada contrato entregue rende uma Chave de Eco, que pula a espera da Cripta, sob as Ruínas.' },
  ], service: { label: 'Ver contratos de hoje', panel: 'board' } },
  dealer: { greet: [
    { when: { done: 'porto_geada_nas_velas' }, text: 'Velas secas e livro de contas feliz. Para quem limpou a geada do cais, o meu preço de freguês é de coração.' },
    { when: { done: 'porto_gelo' }, text: 'O gelo do Cume rendeu bem. Poção e pergaminho com desconto de freguês, e troco itens comuns por um raro. Pergunte.' },
    { when: { level: 20 }, text: 'Mercadoria de navio, nível de gente grande. O estoque gira todo dia: o que sumiu hoje, só volta por sorte.' },
    { text: 'Do cais para a sua mochila! Estoque novo todo dia, preço de porto. Hoje tem até peça épica, se eu não vender antes.' },
  ], service: { label: 'Ver o estoque do dia', panel: 'shop:harbor' } },
  duelist: { greet: [
    { when: { done: 'porto_aco_na_geada' }, text: 'Ringue e gelo: duas escolas, um herói. Quando a geada voltar a pedir aço, o meu ringue continua de pé.' },
    { when: { offline: false }, text: 'Com o mar conectado, o ringue chama duelistas de verdade. Sem Elo, sem rancor: ranking é da Grande Arena de Doran.' },
    { when: { done: 'porto_duelo' }, text: 'Lembro do seu golpe de cais. Quando quiser outra rodada, o ringue está de pé.' },
    { text: 'Duelo amistoso: sem pontos, sem rancor, só aço. Ninguém perde Elo no meu ringue. Aceita?' },
  ], service: { label: 'Duelo amistoso 1×1', panel: 'arena:friendly' } },
  captain: { greet: [
    { when: { done: 'ecos_unidos' }, text: 'A maré mudou depois do que fez. Chegou ao Porto um viajante de capa violeta, que tece ecos, e pergunta por você. Obrigada, herói.' },
    { when: { done: 'porto_primeiro_barco' }, text: 'Ouviu o apito? É o primeiro barco em muito tempo, e a rota é sua. Só um, mas o cais voltou a ter horário. Obrigada, herói.' },
    { when: { done: 'porto_brasa_no_horizonte' }, text: 'O céu vermelho a leste já não me assusta tanto: sei que é cópia. Falta provar que a estrada aguenta um barco.' },
    { when: { done: 'porto_rota_livre' }, text: 'A estrada leste está mais limpa. Octávio guarda cartas antigas, e a Mestra Vesna pede nomes de confiança. Passe por eles.' },
    { when: { done: 'porto_eco_no_cais' }, text: 'O sussurro sob as Ruínas não é problema de maré. Um dia, quando estiver forte, a Sábia Yun lhe mostra a cripta.' },
    { when: { done: 'porto_carga' }, text: 'As cargas voltaram e o cais respira. Eu devia lhe dar um navio. Por ora, aceite meu agradecimento.' },
    { when: { done: 'porto_chegada' }, text: 'Marfim é terra neutra: todo mundo faz escala, ninguém briga, e nem os ecos passam do portão. Por isso os mestres de estilo vieram: veja a praça ao norte. Tem trabalho no cais.' },
    { text: 'Os barcos não saem: as estradas têm ecos demais. Mas o porto vive, e é terra neutra: ninguém saca arma aqui. Loja, banco e quadro, tudo à mão. Boa caça.' },
  ], service: null },
};

// Dicas de onboarding (cada uma 1× por personagem; bits em core/journal.js TIP_BITS). [título, texto]
export const TIPS = {
  forest: ['Bosque Verdejante', 'Ataque as criaturas e use as habilidades; as com cadeado liberam com o nível. Toque numa Pedra de Retorno: se cair, você acorda nela.'],
  chest: ['Primeiro baú', 'O item novo já está na mochila: abra a Mochila no menu e equipe o melhor. Vale abrir todos os baús que encontrar.'],
  level: ['Pontos de atributo', 'Abra Personagem no menu e distribua os pontos para ficar mais forte.'],
  skill: ['Habilidade nova', 'Ela já está num dos botões de habilidade. As ainda bloqueadas mostram o nível em que liberam.'],
  spirit: ['Seu spirit', 'Spirits crescem com você. Para evoluir, faça a missão do elemento dele com a Sábia Yun (no nível 10 do spirit) e depois use Evoluir em Spirits.'],
  boss: ['Primeiro chefe', 'O mapa leva você a lugares já visitados. Pergaminhos de viagem são vendidos pela Mercadora Lia.'],
  crypt: ['Cripta dos Ecos', 'A Cripta dos Ecos está aberta: toque no nó dela no mapa.'],
  spec: ['Especialização', 'Fale com o Mestre da sua classe ou um mentor no Porto para escolher sua especialização.'],
  phoenix: ['Amuleto da Fênix', 'O Amuleto da Fênix evita a perda de ouro e XP; vende na Lia e no Porto.'],
  ritual: ['Cinzas Ardentes', 'Aqui o chefe desperta pelo "Ritual N/40": cada criatura derrotada enche o contador, e o chão estremece ao completar.'],
};
