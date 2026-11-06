// Missões (dados). Cada objetivo tem um `type`:
//   kill  {mob:'any'|id, zone:'any'|id}   boss {mob:'any'|id}   chest {zone:'any'|id}   spirit (ter N spirits)   level (alcançar o nível N)
//   pvp {mode:'any'|1v1|2v2|4v4}   coop   ← estes dois são do SERVIDOR (só o servidor soma progresso; o cliente não consegue marcá-los)
//   miniboss {zone?} (abater mini-chefe; com `zone`, só o daquele mapa)   skillUse {skill:'signature'|'any'}   spiritKill {spirit:id} (abates com aquele spirit ativo)
//   talk {count} (conversar com os mentores de especialização da própria classe, no Porto: bits em stats.mentors, core/journal.js; o servidor conta)
//   teleport (usar o teletransporte do mapa)   upgrade (aprimorar um equipamento no Ferreiro)   spiritStage (ter N spirits evoluídos, forma 2)
// Cânone do arco final: 3 guardiões originais (Carvalho, Colosso, Guardião) e 2 reflexos (Ancião Gélido = gelo, Cavaleiro Rubro = brasa). `text.done` pode ser lista de falas (epílogo).
// Cânone da Cripta: o Soberano dos Ecos é o rei das Ruínas, preso como eco entre os seus; o Guardião das Ruínas era o último guarda, posto à porta dele e nunca dispensado.
// O "primeiro eco" do epílogo é outra coisa (a voz original de que os três guardiões eram pedaços). Glossário completo: docs/roadmap/auditoria-historia-2.md.
// `giver` = NPC que oferece (e recebe a entrega, salvo `turnIn`). `after` = missão exigida antes. Recompensa: ouro, xp (×2,5 depois da curva de XP mais lenta), potions, items [{rarity}].
export const QUESTS = {
  primeiros_passos: {
    id: 'primeiros_passos', name: 'Primeiros Passos', giver: 'guard', level: 1, after: null,
    text: { offer: 'O bosque ao leste anda inquieto. Mostre que sabe se virar: cinco criaturas do Bosque Verdejante.', progress: 'Ainda restam criaturas no bosque. Siga o portal a leste.', done: 'Feito. A vila dorme melhor. Tome, é por conta da guarda.' },
    objectives: [{ type: 'kill', mob: 'any', zone: 'forest', count: 5, label: 'Derrote 5 criaturas do Bosque Verdejante' }],
    reward: { gold: 60, xp: 220 },
  },
  caca_aos_lobos: {
    id: 'caca_aos_lobos', name: 'Caça aos Lobos', giver: 'guard', level: 2, after: 'primeiros_passos',
    text: { offer: 'Lobos cinzentos atacam viajantes. Reduza o bando: seis lobos. Dois juntos já são perigo: beba uma poção (🧪) e use suas habilidades.', progress: 'Os lobos ainda rondam. Não os enfrente cercado: poção na mão e habilidade pronta.', done: 'O bando se dispersou. Fugiam de algo no fundo do bosque, não de nós. Fique atento.' },
    objectives: [{ type: 'kill', mob: 'wolf', zone: 'any', count: 6, label: 'Derrote 6 Lobos Cinzentos' }],
    reward: { gold: 90, xp: 380 },
  },
  ervas_do_bosque: {
    id: 'ervas_do_bosque', name: 'Ervas do Bosque', giver: 'herbalist', level: 2, after: null,
    text: { offer: 'Querido, preciso de ervas raras, e elas crescem junto de baús abandonados no Bosque. Abra dois para mim? Chegue perto e toque no botão de interagir.', progress: 'Os baús brilham entre as árvores do Bosque. Dois, querido, e leve poções.', done: 'Exatamente o que eu precisava! Leve estas poções. Estranho: as ervas crescem em roda, como se algo antigo as tivesse plantado.' },
    objectives: [{ type: 'chest', zone: 'forest', count: 2, label: 'Abra 2 baús no Bosque Verdejante' }],
    reward: { gold: 80, xp: 300, potions: 3 },
  },
  primeiro_spirit: {
    id: 'primeiro_spirit', name: 'Companhia de Luz', giver: 'sage', level: 3, after: null,
    text: { offer: 'Spirits são ecos da natureza, e escolhem quem os escuta. Reúna dois: compre uma Essência Selvagem comigo ou ache uma em combate.', progress: 'Falta um eco. Tenho Essência Selvagem aqui, ao alcance do seu ouro.', done: 'Dois ecos caminham com você. Crescem com o seu nível e, no nível 10 deles, podem evoluir: abra 🔮 e veja.' },
    objectives: [{ type: 'spirit', count: 2, label: 'Tenha 2 spirits' }],
    reward: { gold: 120, xp: 400 },
  },
  // Bosque mais longo (2026-11-05): o herói chegava ao Carvalho (Nv 7) no nível 4–5 e, depois dele, a próxima missão já era na Planície.
  // Agora: Lobos → Cogumelos → Acampamentos → Carvalho → Alfa da Matilha → Planície; e a Herbalista tem as Geleias depois das Ervas.
  cogumelos_esporentos: {
    id: 'cogumelos_esporentos', name: 'Esporos no Vento', giver: 'guard', level: 3, after: 'caca_aos_lobos',
    text: { offer: 'Os cogumelos do bosque andam soltando esporos na estrada: quem respira fica tonto dias. Derrube oito Cogumelos Esporentos.', progress: 'Os Cogumelos Esporentos crescem nos acampamentos do bosque. Não fique parado na nuvem de esporos.', done: 'O ar já está mais limpo. Esses cogumelos só brotam assim perto de raízes muito velhas. Alguma coisa embaixo do bosque está acordando.' },
    objectives: [{ type: 'kill', mob: 'shroom', zone: 'forest', count: 8, label: 'Derrote 8 Cogumelos Esporentos' }],
    reward: { gold: 110, xp: 520, potions: 2 },
  },
  acampamentos_do_bosque: {
    id: 'acampamentos_do_bosque', name: 'Acampamentos do Bosque', giver: 'guard', level: 4, after: 'cogumelos_esporentos',
    text: { offer: 'As criaturas se juntam em acampamentos, e alguns têm guardas mais fortes. Limpe a área: doze criaturas do bosque e abra um dos baús deles. Ganhe força antes de ir ao fundo do bosque.', progress: 'Os acampamentos ficam espalhados pelo Bosque Verdejante. Vá com calma: os guardas batem forte.', done: 'Agora sim você está pronto para o que mora no fundo do bosque. Só não vá com pressa.' },
    objectives: [{ type: 'kill', mob: 'any', zone: 'forest', count: 12, label: 'Derrote 12 criaturas do Bosque Verdejante' }, { type: 'chest', zone: 'forest', count: 1, label: 'Abra 1 baú no Bosque Verdejante' }],
    reward: { gold: 150, xp: 700, potions: 2, items: [{ rarity: 'uncommon' }] },
  },
  geleias_da_herbalista: {
    id: 'geleias_da_herbalista', name: 'Geleia para Poções', giver: 'herbalist', level: 3, after: 'ervas_do_bosque',
    text: { offer: 'As ervas sozinhas não seguram a poção, querido. A Geleia do bosque dá o ponto certo. Traga a geleia de dez delas?', progress: 'As Geleias pulam pelo Bosque Verdejante, perto da entrada. Dez, querido.', done: 'Que maravilha, que consistência! Leve estas poções, são da fornada nova.' },
    objectives: [{ type: 'kill', mob: 'slime', zone: 'forest', count: 10, label: 'Derrote 10 Geleias' }],
    reward: { gold: 90, xp: 450, potions: 3 },
  },
  carvalho_ancestral: {
    id: 'carvalho_ancestral', name: 'O Carvalho Ancestral', giver: 'guard', level: 5, after: 'acampamentos_do_bosque',
    text: { offer: 'Há um carvalho antigo no fundo do bosque, e ele despertou. Leve poções e fuja se precisar: raízes não perdoam. Derrube-o antes que cheguem à vila.', progress: 'O Carvalho Ancestral fica no extremo leste do bosque. Leve poções.', done: 'Ele caiu sussurrando: "não sou o primeiro". Leve essa frase à Sábia Yun. Tome esta peça.' },
    objectives: [{ type: 'boss', mob: 'treant', count: 1, label: 'Derrote o Carvalho Ancestral' }],
    reward: { gold: 200, xp: 750, items: [{ rarity: 'rare' }] },
  },
  alfa_da_matilha: {
    id: 'alfa_da_matilha', name: 'O Alfa da Matilha', giver: 'guard', level: 6, after: 'carvalho_ancestral',
    text: { offer: 'Com o Carvalho caído, o líder dos lobos ficou sem o que temia e agora caça na clareira do sul do bosque. Derrube o Alfa da Matilha. É forte: leve poções e chame alguém se puder.', progress: 'O Alfa da Matilha ronda o sul do Bosque Verdejante. Ele volta depois de um tempo se você recuar.', done: 'Sem o Alfa, a matilha se espalha e a estrada fica segura. Agora a Planície de Cristal te espera.' },
    objectives: [{ type: 'miniboss', mob: 'any', zone: 'forest', count: 1, label: 'Derrote o Alfa da Matilha (mini-chefe do Bosque)' }],
    reward: { gold: 260, xp: 1100, potions: 2, items: [{ rarity: 'rare' }] },
  },
  cristais_vivos: {
    id: 'cristais_vivos', name: 'Cristais Vivos', giver: 'guard', level: 6, after: 'alfa_da_matilha',
    text: { offer: 'Depois do bosque, a Planície de Cristal. As pedras andam por lá. Abata doze criaturas.', progress: 'A Planície de Cristal é logo depois do bosque. Siga o portal.', done: 'Doze a menos. A rota agradece. Mas pedra não anda sozinha: algo as chama, do coração da planície.' },
    objectives: [{ type: 'kill', mob: 'any', zone: 'plains', count: 12, label: 'Derrote 12 criaturas da Planície de Cristal' }],
    reward: { gold: 250, xp: 1500 },
  },
  // Planície mais longa (2026-11-05): antes eram só Cristais Vivos e o Colosso (Nv 13) logo no nível 8. Agora a Guarda leva até o Golem Ancestral
  // e o Colosso fica para o fim; Herbalista, Sábia, Ferreiro e Mercadora têm missões paralelas na Planície.
  lobos_de_cristal: {
    id: 'lobos_de_cristal', name: 'Uivo de Vidro', giver: 'guard', level: 7, after: 'cristais_vivos',
    text: { offer: 'Na planície os lobos têm pele de cristal e dentes que cortam escudo. Vêm em bando para cima de quem anda sozinho. Derrube dez Lobos de Cristal.', progress: 'Os Lobos de Cristal correm pela Planície em bando. Não deixe que te cerquem.', done: 'Dez. Os lobos daqui não fogem de nada: são feitos do mesmo cristal que anda sozinho. Alguém os chama.' },
    objectives: [{ type: 'kill', mob: 'crystalwolf', zone: 'plains', count: 10, label: 'Derrote 10 Lobos de Cristal' }],
    reward: { gold: 280, xp: 1700, potions: 2 },
  },
  acampamentos_de_cristal: {
    id: 'acampamentos_de_cristal', name: 'Acampamentos de Cristal', giver: 'guard', level: 8, after: 'lobos_de_cristal',
    text: { offer: 'As criaturas da planície se juntam em volta de pedras que brilham, como sentinelas. Desfaça esses acampamentos: quinze criaturas e um dos baús que guardam.', progress: 'Os acampamentos brilham longe na Planície. Quinze criaturas e um baú.', done: 'Os acampamentos caíram. No maior deles havia um golem velho, coberto de musgo de cristal, que não se mexeu. Ainda.' },
    objectives: [{ type: 'kill', mob: 'any', zone: 'plains', count: 15, label: 'Derrote 15 criaturas da Planície de Cristal' }, { type: 'chest', zone: 'plains', count: 1, label: 'Abra 1 baú na Planície de Cristal' }],
    reward: { gold: 320, xp: 1900, potions: 2, items: [{ rarity: 'uncommon' }] },
  },
  golem_ancestral: {
    id: 'golem_ancestral', name: 'O Golem Ancestral', giver: 'guard', level: 10, after: 'acampamentos_de_cristal',
    text: { offer: 'O golem velho acordou. Ele guarda o caminho até o coração da planície, onde mora o Colosso. Derrube o Golem Ancestral: é lento, mas cada golpe dele derruba uma casa. Leve poções.', progress: 'O Golem Ancestral fica no sul da Planície de Cristal. Golpeie e saia da frente.', done: 'O caminho para o Colosso está aberto. A Herbalista Mel quer falar com você sobre o núcleo dele.' },
    objectives: [{ type: 'miniboss', mob: 'any', zone: 'plains', count: 1, label: 'Derrote o Golem Ancestral (mini-chefe da Planície)' }],
    reward: { gold: 450, xp: 2600, potions: 2, items: [{ rarity: 'rare' }] },
  },
  fogos_fatuos: {
    id: 'fogos_fatuos', name: 'Luz que Engana', giver: 'herbalist', level: 7, after: 'cristais_vivos',
    text: { offer: 'Os Fogos-fátuos da planície levam viajantes para longe da trilha, querido. E a luz deles, presa num frasco, faz um tônico ótimo. Apague dez para mim?', progress: 'Os Fogos-fátuos flutuam pela Planície de Cristal. Dez, querido, e não siga a luz deles.', done: 'Que brilho bonito no frasco! Leve estas poções, já com o tônico novo.' },
    objectives: [{ type: 'kill', mob: 'wisp', zone: 'plains', count: 10, label: 'Derrote 10 Fogos-fátuos' }],
    reward: { gold: 240, xp: 1600, potions: 3 },
  },
  quartzo_da_forja: {
    id: 'quartzo_da_forja', name: 'Quartzo para a Forja', giver: 'smith', level: 8, after: 'fogo_de_forja',
    text: { offer: 'Quartzo de golem endurece o aço como nada. Derrube oito Golens de Quartzo na planície. Eu cuido do resto.', progress: 'Os Golens de Quartzo andam devagar pela Planície. Oito.', done: 'Isto é quartzo bom. Uma peça para você. Volte para aprimorar.' },
    objectives: [{ type: 'kill', mob: 'golem', zone: 'plains', count: 8, label: 'Derrote 8 Golens de Quartzo' }],
    reward: { gold: 300, xp: 1800, items: [{ rarity: 'uncommon' }] },
  },
  ecos_de_cristal: {
    id: 'ecos_de_cristal', name: 'O Canto do Cristal', giver: 'sage', level: 9, after: 'carvalho_ancestral',
    text: { offer: '"Não sou o primeiro", disse o Carvalho. Na planície, os cristais cantam a mesma nota. Abra dois baús de lá e derrube doze criaturas: quero saber o que elas guardam.', progress: 'Dois baús e doze criaturas na Planície de Cristal. Escute o canto enquanto isso.', done: 'A mesma nota, sim. O Carvalho e os cristais são pedaços de uma voz só. Ainda não sei de quem.' },
    objectives: [{ type: 'chest', zone: 'plains', count: 2, label: 'Abra 2 baús na Planície de Cristal' }, { type: 'kill', mob: 'any', zone: 'plains', count: 12, label: 'Derrote 12 criaturas da Planície de Cristal' }],
    reward: { gold: 300, xp: 2000, items: [{ rarity: 'uncommon' }] },
  },
  rota_das_caravanas: {
    id: 'rota_das_caravanas', name: 'Rota das Caravanas', giver: 'merchant', level: 10, after: 'pergaminho_de_cortesia',
    text: { offer: 'Minhas caravanas para o Porto passam pela planície, freguês, e voltam sem metade da carga. Limpe a estrada: vinte criaturas da Planície de Cristal. Pago bem.', progress: 'A rota corta a Planície de Cristal inteira. Vinte criaturas.', done: 'A caravana chegou inteira! Tome o combinado. E a próxima vez que for ao Porto, diga que vai em meu nome.' },
    objectives: [{ type: 'kill', mob: 'any', zone: 'plains', count: 20, label: 'Derrote 20 criaturas da Planície de Cristal' }],
    reward: { gold: 500, xp: 2200, potions: 2 },
  },
  coracao_de_cristal: {
    id: 'coracao_de_cristal', name: 'Coração de Cristal', giver: 'herbalist', level: 11, after: 'golem_ancestral',
    text: { offer: 'O núcleo do Colosso de Cristal, moído, rende as melhores poções que conheço. Derrube-o e me traga os cacos: a vila lhe deve um favor.', progress: 'O Colosso fica no coração da planície.', done: 'O núcleo canta baixinho, do mesmo jeito que o Carvalho cantava. Fique com esta recompensa, querido.' },
    objectives: [{ type: 'boss', mob: 'colossus', count: 1, label: 'Derrote o Colosso de Cristal' }],
    reward: { gold: 400, xp: 2250, items: [{ rarity: 'rare' }], potions: 3 },
  },
  coragem_na_arena: {
    id: 'coragem_na_arena', name: 'Coragem na Arena', giver: 'arena', level: 10, after: null,
    text: { offer: 'Ah, a glória! Quem treina só contra monstros jamais conhece o próprio limite. Vença uma partida contra jogadores reais (1×1, 2×2 ou 4×4) e a plateia cantará seu nome!', progress: 'A Grande Arena o espera, herói! Entre na fila contra jogadores reais. Assistirei de camarote.', done: 'Magnífico! Uma vitória limpa, digna de balada! A arena se curva a você.' },
    objectives: [{ type: 'pvp', mode: 'any', count: 1, label: 'Vença 1 partida de arena contra jogadores reais' }],
    reward: { gold: 300, xp: 1250 },
  },
  equipe_de_ecos: {
    id: 'equipe_de_ecos', name: 'Equipe de Ecos', giver: 'arena', level: 10, after: null,
    text: { offer: 'Nenhum herói canta sozinho, meu caro! Complete o desafio cooperativo, com ondas e chefe, ao lado de um grupo.', progress: 'A fila Cooperativa o aguarda no painel da arena. Reúna seu coro!', done: 'Que espetáculo de equipe! É isso que mantém Lúmen de pé.' },
    objectives: [{ type: 'coop', count: 1, label: 'Vença 1 desafio cooperativo' }],
    reward: { gold: 350, xp: 1500, items: [{ rarity: 'rare' }] },
  },
  ruinas_sombrias: {
    id: 'ruinas_sombrias', name: 'Sombras nas Ruínas', giver: 'guard', level: 12, after: 'coracao_de_cristal',
    text: { offer: 'Espectros vindos das Ruínas Sombrias rondam a estrada. Vá até lá e abata quinze deles e de seus aliados.', progress: 'As Ruínas Sombrias ficam depois do Porto de Marfim, a leste da Planície de Cristal.', done: 'As ruínas ficaram quietas. Os espectros usavam armaduras de guardas antigos. Alguém os pôs ali de vigia e esqueceu de mandá-los parar.' },
    objectives: [{ type: 'kill', mob: 'any', zone: 'ruins', count: 15, label: 'Derrote 15 criaturas das Ruínas Sombrias' }],
    reward: { gold: 600, xp: 3500 },
  },
  // Montaria inicial (decisão 0018): a Guarda Ren entrega o Lobo Cinzento "Cinza", da antiga guarda de fronteira. `mount` na recompensa é lido por core/mounts.js (derivedMounts).
  matilha_da_estrada: {
    id: 'matilha_da_estrada', name: 'A Matilha da Estrada', giver: 'gryphon', level: 15, after: 'coracao_de_cristal',
    text: { offer: 'Hum. Você cresceu, pequeno herói. Eu guardo as montarias desta vila desde antes do primeiro eco. Os lobos da antiga patrulha voltaram a ser selvagens e caçam nas estradas. Reduza o bando: doze lobos. Uma delas, Cinza, ainda lembra do cheiro de gente. Prove que não a teme e ela será sua.', progress: 'Doze lobos nas estradas. Sem se deixar cercar. Eu sinto daqui quando a matilha recua.', done: 'Doze. A matilha entendeu. Cinza veio sozinha até o meu ninho e escolheu você. Monte fora de combate, pelo botão ou com dois toques em si. Montaria não luta: se alguém a ferir, ela se solta. Cuide dela, e um dia talvez eu deixe você voar comigo.' },
    objectives: [{ type: 'kill', mob: 'wolf', zone: 'any', count: 12, label: 'Derrote 12 Lobos Cinzentos' }],
    reward: { gold: 400, xp: 2500, mount: 'wolf' },
  },
  guardiao_das_ruinas: {
    id: 'guardiao_das_ruinas', name: 'O Guardião Esquecido', giver: 'guard', level: 22, after: 'ruinas_sombrias',
    text: { offer: 'O Guardião das Ruínas protege algo que não devia existir: a Sábia Yun fala de uma cripta sob o chão dele. Derrube-o e abra o caminho a leste.', progress: 'O Guardião fica no coração das ruínas.', done: 'Ele não lutava para nos matar. Lutava para nos manter longe da cripta. Parecia esperar quem o dispensasse do posto. Seu nome será lembrado.' },
    objectives: [{ type: 'boss', mob: 'guardian', count: 1, label: 'Derrote o Guardião das Ruínas' }],
    reward: { gold: 1200, xp: 6250, items: [{ rarity: 'epic' }] },
  },
  rumo_ao_topo: {
    id: 'rumo_ao_topo', name: 'Rumo ao Topo', giver: 'herbalist', level: 10, after: null,
    text: { offer: 'Querido, cada região tem uma flor que só abre para quem não desiste. Alcance o nível 20 e traga a flor que cresce entre as Ruínas, num baú esquecido.', progress: 'Continue evoluindo: missões, chefes e arena dão experiência.', done: 'Você chegou longe! As flores abriram para você. Esta bolsa é por sua perseverança.' },
    objectives: [{ type: 'level', count: 20, label: 'Alcance o nível 20' }, { type: 'chest', zone: 'ruins', count: 1, label: 'Abra um baú nas Ruínas Sombrias (a flor está lá)' }],
    reward: { gold: 800, xp: 0, items: [{ rarity: 'epic' }] },
  },
  // ---- Tutoriais dos comerciantes (Lia e Brok) ----
  pergaminho_de_cortesia: {
    id: 'pergaminho_de_cortesia', name: 'Pergaminho de Cortesia', giver: 'merchant', level: 3, after: null,
    text: { offer: 'Cortesia da casa, freguês: estando fora da vila, abra o mapa pelo menu e viaje de volta para cá. Voltar à vila não custa nada. Depois me diga se não é prático.', progress: 'Vá a um lugar fora da vila, abra o mapa pelo menu e toque em Viajar até a Vila. É de graça.', done: 'Viu como é prático? Quando precisar ir mais longe, pergaminhos estão sempre na minha loja.' },
    objectives: [{ type: 'teleport', count: 1, label: 'Use 1 teletransporte pelo mapa' }],
    reward: { gold: 80, xp: 300, potions: 2 },
  },
  fogo_de_forja: {
    id: 'fogo_de_forja', name: 'Fogo de Forja', giver: 'smith', level: 5, after: null,
    text: { offer: 'Metal sem fogo é só pedra. Traga uma peça e aprimore comigo. Uma vez. Depois você entende.', progress: 'Escolha uma peça e aprimore. Custa ouro.', done: 'Bom aço. Bateu, dobrou, não quebrou. Volte.' },
    objectives: [{ type: 'upgrade', count: 1, label: 'Aprimore 1 equipamento com o Ferreiro' }],
    reward: { gold: 100, xp: 450, potions: 1 },
  },
  martelo_do_guardiao: {
    id: 'martelo_do_guardiao', name: 'Martelo do Guardião', giver: 'smith', level: 18, after: 'ruinas_sombrias',
    text: { offer: 'O Guardião das Ruínas empunha um martelo antigo, dizem. Os baús de lá guardam restos de armas iguais. Abra três. Traga o que achar.', progress: 'Baús nas Ruínas Sombrias. Três.', done: 'Restos de aço antigo. Fundi o que deu. Fique com isto.' },
    objectives: [{ type: 'chest', zone: 'ruins', count: 3, label: 'Abra 3 baús nas Ruínas Sombrias' }],
    reward: { gold: 900, xp: 4500, items: [{ rarity: 'rare' }] },
  },
  // ---- Arco final: "Os Ecos Partidos" (Cume Gélido e Cinzas Ardentes) ----
  cume_gelido: {
    id: 'cume_gelido', name: 'O Silêncio da Geada', giver: 'guard', level: 23, after: 'guardiao_das_ruinas',
    text: { offer: 'Com o Guardião caído, a passagem a leste se abriu: o Cume Gélido. Dizem que as criaturas de lá são cópias geladas das nossas. Abata vinte.', progress: 'O Cume Gélido fica a leste das Ruínas Sombrias. Leve poções.', done: 'Cópias geladas das nossas criaturas. Eco de eco. A Sábia Yun vai querer saber.' },
    objectives: [{ type: 'kill', mob: 'any', zone: 'glacier', count: 20, label: 'Derrote 20 criaturas do Cume Gélido' }],
    reward: { gold: 1500, xp: 14000, potions: 3 },
  },
  anciao_gelido: {
    id: 'anciao_gelido', name: 'O Ancião Gélido', giver: 'sage', level: 27, after: 'cume_gelido',
    text: { offer: 'Os spirits sussurram: um reflexo do Carvalho, partido e congelado, prende os ecos do Cume. Só a derrota dele os liberta.', progress: 'O Ancião fica no fundo do Cume Gélido, a nordeste.', done: 'Senti o eco se soltar. O frio não era dele, era do que veio antes. E há outro reflexo, mais ao leste, ardendo…' },
    objectives: [{ type: 'boss', mob: 'frostlord', count: 1, label: 'Derrote o Ancião Gélido' }],
    reward: { gold: 2200, xp: 20000, items: [{ rarity: 'epic' }] },
  },
  cinzas_ardentes: {
    id: 'cinzas_ardentes', name: 'Cinzas que Ainda Queimam', giver: 'guard', level: 28, after: 'anciao_gelido',
    text: { offer: 'Além do Cume, o chão arde: as Cinzas Ardentes. Criaturas de brasa cercam o lugar. Abata vinte e cinco antes que desçam à vila.', progress: 'As Cinzas Ardentes ficam a leste do Cume Gélido.', done: 'Você voltou chamuscado, mas inteiro. Isso basta.' },
    objectives: [{ type: 'kill', mob: 'any', zone: 'ember', count: 25, label: 'Derrote 25 criaturas das Cinzas Ardentes' }],
    reward: { gold: 3000, xp: 26000, potions: 5 },
  },
  cavaleiro_rubro: {
    id: 'cavaleiro_rubro', name: 'O Cavaleiro Rubro', giver: 'arena', level: 29, after: 'cinzas_ardentes',
    text: { offer: 'Ó, o Rubro! Luta como o Guardião lutava, mas em brasa. Só desperta quando as Cinzas se alimentam de sangue: derrote quarenta criaturas por lá e o chão estremecerá!', progress: 'Derrote quarenta criaturas nas Cinzas: o contador "Ritual" mostra quanto falta, e o chão estremece quando o Rubro desperta!', done: 'Ouvi o chão tremer daqui. Um duelo desses vale uma canção na arena.' },
    objectives: [{ type: 'boss', mob: 'infernoknight', count: 1, label: 'Derrote o Cavaleiro Rubro' }],
    reward: { gold: 4500, xp: 38000, items: [{ rarity: 'legendary' }] },
  },
  ecos_unidos: {
    id: 'ecos_unidos', name: 'Os Ecos Unidos', giver: 'sage', level: 30, after: 'cavaleiro_rubro',
    text: {
      offer: 'Três guardiões e dois reflexos: o gelo e a brasa foram o eco tentando se juntar de novo. Hoje todos repousam. Evolua um spirit (cada elemento tem uma missão minha) e volte: quero lhe mostrar o que sobrou.',
      progress: 'Evolua um spirit e volte a mim: peça a missão do elemento dele a mim mesma, cumpra-a e use Evoluir no painel de Spirits. O último capítulo espera.',
      done: ['Aqui jaz o primeiro eco, inteiro de novo. A vila dorme; os spirits ao seu lado carregam um pouco dele.', 'Você era o último capítulo, herói. A partir de hoje, o eco tem voz, e é a sua.', 'Mas toda estrada tem outra volta. Sob as Ruínas, os ecos presos ainda sussurram. E um viajante de capa violeta, que tece ecos, chegou ao Porto e pergunta por você.'],
    },
    objectives: [{ type: 'level', count: 30, label: 'Alcance o nível 30' }, { type: 'spiritStage', count: 1, label: 'Tenha 1 spirit evoluído (forma 2)' }],
    reward: { gold: 8000, xp: 0, potions: 10, items: [{ rarity: 'legendary' }] },
  },
};

// ---- Mestres de Classe (praça dos mestres na Vila) ----
// `giver: 'master'` = o mestre da CLASSE do jogador (npc `master_<classId>`, ver core/journal.js masterNpcId); as quatro praças têm a mesma missão.
// skillUse {skill:'signature'|'any'}: usos da habilidade assinatura (a 1ª da classe) ou de qualquer habilidade. miniboss: abates de mini-chefes.
Object.assign(QUESTS, {
  prova_do_mestre: {
    id: 'prova_do_mestre', name: 'Prova do Mestre', giver: 'master', level: 14, after: null,
    text: { offer: 'Quem ensina a si mesmo tem um tolo por mestre. Prove-se: um mini-chefe e dez usos da assinatura. E ouça os dois mentores da sua classe, na Praça dos Mestres de Estilo do Porto de Marfim. Então escolha o seu estilo.', progress: 'Um mini-chefe, dez usos da assinatura e a conversa com os dois mentores da sua classe, na Praça dos Mestres de Estilo (Porto de Marfim).', done: 'Está feito. Seu estilo agora tem nome e caminho. Abra o painel do personagem e escolha a especialização, com orgulho.' },
    objectives: [{ type: 'miniboss', mob: 'any', count: 1, label: 'Derrote 1 mini-chefe' }, { type: 'skillUse', skill: 'signature', count: 10, label: 'Use a habilidade assinatura 10 vezes' }, { type: 'talk', count: 2, label: 'Converse com os 2 mentores da sua classe (Porto de Marfim)' }],
    reward: { gold: 500, xp: 3000, potions: 3 },
  },
  maestria: {
    id: 'maestria', name: 'Maestria', giver: 'master', level: 25, after: 'prova_do_mestre',
    text: { offer: 'Poucos chegam até aqui. Domínio de verdade é repetição sem pressa: derrube três chefes e use suas habilidades cinquenta vezes. Entrego o que merece quem o faz.', progress: 'Três chefes e cinquenta habilidades. A maestria não tem pressa.', done: 'Mestre, então. Este vigor é seu para sempre, e o título também. E há mais: ensino-lhe agora a técnica final da sua classe, no quarto botão. Gaste-a com sabedoria.' },
    objectives: [{ type: 'boss', mob: 'any', count: 3, label: 'Derrote 3 chefes' }, { type: 'skillUse', skill: 'any', count: 50, label: 'Use habilidades 50 vezes' }],
    reward: { gold: 2000, xp: 12000, items: [{ rarity: 'epic' }] }, // + bônus permanente de maestria (core/stats.js MASTERY), o título e a 4ª habilidade (slot s3, core/unlocks.js)
  },
});

// ---- Evolução do spirit (Sábia Yun): uma missão por elemento; só então evolveSpirit (core/progression.js) funciona ----
// `spirit` = { type, level }: exige ter um spirit desse tipo no nível indicado para aceitar. spiritKill: abates feitos COM um spirit ativo desse tipo.
const EVO = [
  ['ember', 'Fagulha', 'Fogo', 'fogo', 'A chama só cresce onde há com o que queimar.'],
  ['undine', 'Ondina', 'Água', 'agua', 'A maré só sobe depois de muita onda.'],
  ['terra', 'Rochedo', 'Terra', 'terra', 'A rocha só endurece sob peso.'],
  ['zephyr', 'Zéfiro', 'Vento', 'vento', 'O vento só ganha corpo correndo longe.'],
];
for (const [type, name, element, key, line] of EVO) {
  const id = 'evolucao_do_spirit_' + key;
  QUESTS[id] = {
    id, name: `Evolução: ${name}`, giver: 'sage', level: 10, after: null, spirit: { type, level: 10 },
    text: {
      offer: `${line} Com ${name} ao seu lado, derrote 40 criaturas e abra 2 baús. Ele aprende o que você vive.`,
      progress: `Mantenha ${name} como seu spirit ativo (🔮) ao derrotar criaturas, e abra os baús que encontrar.`,
      done: `${name} brilha diferente agora. Ele está pronto: abra 🔮 e evolua-o.`,
    },
    objectives: [{ type: 'spiritKill', spirit: type, count: 40, label: `Derrote 40 criaturas com ${name} (${element}) ativo` }, { type: 'chest', zone: 'any', count: 2, label: 'Abra 2 baús' }],
    reward: { gold: 300, xp: 1500 },
  };
}
// ---- Porto de Marfim (hub entre a Planície e as Ruínas): Capitã Maré, Bartolomeu e Kael. Objetivos novos: bank (guardar item), daily (entregar contrato),
// friendlyDuel (vencer duelo amistoso; só offline, ver core/journal.js OFFLINE_TYPES). ----
Object.assign(QUESTS, {
  porto_chegada: {
    id: 'porto_chegada', name: 'Cofre de Marfim', giver: 'captain', level: 10, after: null,
    text: { offer: 'Você chegou ao Porto, e carregando metade de uma loja nas costas. Fale com o banqueiro Octávio e guarde um item no cofre. Mochila leve, passo leve.', progress: 'Octávio fica perto da praça. Entregue um item a ele e volte.', done: 'Cofre aberto, mochila respirando. Assim se faz, marujo. O porto é seu.' },
    objectives: [{ type: 'bank', count: 1, label: 'Guarde 1 item no banco do Porto' }],
    reward: { gold: 150, xp: 900, potions: 2 },
  },
  porto_contrato: {
    id: 'porto_contrato', name: 'Palavra de Contrato', giver: 'captain', level: 10, after: 'porto_chegada',
    text: { offer: 'Vesna pendura contratos no quadro toda manhã. Cumpra um e entregue a ela. Quem paga em dia, navega em paz.', progress: 'O Quadro de Contratos fica com a Mestra de Caça Vesna. Cumpra um contrato e entregue.', done: 'Contrato entregue, nome limpo no cais. Volte quando quiser mais trabalho.' },
    objectives: [{ type: 'daily', count: 1, label: 'Entregue 1 contrato do Quadro' }],
    reward: { gold: 250, xp: 1400, potions: 2 },
  },
  porto_carga: {
    id: 'porto_carga', name: 'Cargas Perdidas', giver: 'captain', level: 12, after: 'porto_chegada',
    text: { offer: 'Três carroças sumiram na estrada: duas na Planície, uma nas Ruínas. Algo carrega as caixas embora. Derrote oito criaturas na Planície e sete nas Ruínas, e as cargas voltam para o cais.', progress: 'Oito criaturas na Planície de Cristal e sete nas Ruínas Sombrias. O porto fica no meio das duas.', done: 'Caixas de volta ao cais, só um pouco mordidas. Você ganhou o seu frete.' },
    objectives: [{ type: 'kill', mob: 'any', zone: 'plains', count: 8, label: 'Derrote 8 criaturas da Planície de Cristal' }, { type: 'kill', mob: 'any', zone: 'ruins', count: 7, label: 'Derrote 7 criaturas das Ruínas Sombrias' }],
    reward: { gold: 700, xp: 3200, potions: 3 },
  },
  porto_eco_no_cais: {
    id: 'porto_eco_no_cais', name: 'Eco no Cais', giver: 'captain', level: 14, after: 'porto_carga',
    text: { offer: 'Os marujos juram ouvir sussurros no cais de madrugada, e não é o mar. Vêm de baixo das Ruínas. Derrube doze criaturas de lá e veja se o barulho cede.', progress: 'Doze criaturas nas Ruínas Sombrias, a leste do Porto. O sussurro vem de lá.', done: 'Cedeu, mas não parou. Os ecos presos sussurram sob as Ruínas, e o Guardião vigia a porta deles. Quando estiver forte, fale com a Sábia Yun: ela conhece a cripta.' },
    objectives: [{ type: 'kill', mob: 'any', zone: 'ruins', count: 12, label: 'Derrote 12 criaturas das Ruínas Sombrias' }],
    reward: { gold: 800, xp: 3800, potions: 3 },
  },
  porto_gelo: {
    id: 'porto_gelo', name: 'Carga de Gelo', giver: 'dealer', level: 22, after: 'porto_chegada',
    text: { offer: 'Gelo do Cume vale ouro no verão. Abra três baús no Cume Gélido e traga o que sobrar das cargas congeladas. Divido o lucro, e a palavra é de comerciante.', progress: 'Três baús no Cume Gélido, a leste das Ruínas. Leve poções e um bom casaco.', done: 'Frio de verdade, mercadoria de verdade. Aqui está a sua parte, e mais um pouco.' },
    objectives: [{ type: 'chest', zone: 'glacier', count: 3, label: 'Abra 3 baús no Cume Gélido' }],
    reward: { gold: 1600, xp: 11000, items: [{ rarity: 'rare' }] },
  },
  porto_duelo: {
    id: 'porto_duelo', name: 'Duelo de Cais', giver: 'duelist', level: 10, after: null,
    text: { offer: 'Sem Elo, sem rancor. Vença um duelo amistoso no meu ringue e eu pago a rodada. Ranking é coisa da Grande Arena, lá em Lúmen; aqui é só aço.', progress: 'O ringue fica aqui ao lado. Fale comigo para aceitar o duelo amistoso.', done: 'Aço limpo e aperto de mão. Boa luta, herói.' },
    objectives: [{ type: 'friendlyDuel', count: 1, label: 'Vença 1 duelo amistoso' }],
    reward: { gold: 300, xp: 1600, potions: 2 },
  },
});

// ---- Cadeia do Porto, Nv 20-28: "Maré de Ecos" (Capitã Maré quer um barco no mar de novo). Reusa só objetivos existentes; `turnIn` = entrega em outro NPC (recado).
// Cânone respeitado: Marfim é terra neutra e os barcos estão parados porque as estradas têm ecos demais; os ecos presos sussurram sob as Ruínas (porto_eco_no_cais);
// a Yun é quem liga o sussurro ao Cume; o Ancião Gélido e o Rubro seguem sendo os reflexos (missões deles, Nv 27+). XP até 36000: abaixo do teto de plausibilidade (MAX_QUEST_XP). ----
Object.assign(QUESTS, {
  porto_rota_livre: {
    id: 'porto_rota_livre', name: 'Rota Livre', giver: 'captain', level: 20, after: 'porto_eco_no_cais',
    text: { offer: 'Barco sem estrada não carrega nada. Os cavaleiros e espectros das Ruínas fecham a rota leste: abata dez de cada e eu tiro a primeira carta de rota da gaveta.', progress: 'Dez Cavaleiros Caídos e dez Espectros nas Ruínas Sombrias, a leste do Porto. Leve poções.', done: 'A estrada respira de novo. Ainda não é frota, mas é um começo. Tome, é frete adiantado.' },
    objectives: [{ type: 'kill', mob: 'knight', zone: 'ruins', count: 10, label: 'Derrote 10 Cavaleiros Caídos nas Ruínas Sombrias' }, { type: 'kill', mob: 'wraith', zone: 'ruins', count: 10, label: 'Derrote 10 Espectros nas Ruínas Sombrias' }],
    reward: { gold: 1000, xp: 12000, potions: 3 },
  },
  porto_cartas_de_mare: {
    id: 'porto_cartas_de_mare', name: 'Cartas de Maré', giver: 'banker', level: 21, after: 'porto_rota_livre',
    text: { offer: 'A Capitã precisa de cartas náuticas antigas, e o senhor sabe onde papel velho sobrevive: em baús das Ruínas. Abra dois e depois guarde uma carta no meu cofre. Papel precisa de cuidado.', progress: 'Dois baús nas Ruínas Sombrias e um item guardado no banco do Porto. O papel não gosta de umidade, nem de pressa.', done: 'Admirável. As cartas citam um ponto onde o mar sussurra, como o cais. Alguém deveria mostrá-las à Sábia Yun. O senhor conhece a Capitã.' },
    objectives: [{ type: 'chest', zone: 'ruins', count: 2, label: 'Abra 2 baús nas Ruínas Sombrias' }, { type: 'bank', count: 1, label: 'Guarde 1 item no banco do Porto' }],
    reward: { gold: 1100, xp: 14000, items: [{ rarity: 'rare' }] },
  },
  porto_contratos_de_vesna: {
    id: 'porto_contratos_de_vesna', name: 'Nome no Quadro', giver: 'hunter', level: 22, after: 'porto_cartas_de_mare',
    text: { offer: 'Quem escolta barco precisa de nome no meu quadro. Entregue dois contratos e derrube um mini-chefe, e cada contrato ainda rende uma Chave de Eco. Mostre que a estrada é sua.', progress: 'Dois contratos entregues no Quadro e um mini-chefe abatido. Cada contrato rende uma Chave de Eco para a Cripta.', done: 'Nome limpo e escrito em letra grande. A Capitã vai gostar de saber que alguém de confiança fez a ronda.' },
    objectives: [{ type: 'daily', count: 2, label: 'Entregue 2 contratos do Quadro' }, { type: 'miniboss', mob: 'any', count: 1, label: 'Derrote 1 mini-chefe' }],
    reward: { gold: 1300, xp: 16000, potions: 3 },
  },
  porto_recado_da_sabia: {
    id: 'porto_recado_da_sabia', name: 'Recado para a Sábia', giver: 'captain', turnIn: 'sage', level: 22, after: 'porto_contratos_de_vesna',
    text: { offer: 'As cartas de Octávio falam de um sussurro que corre pela costa. Só uma pessoa decifra isso: leve-as à Sábia Yun, na Vila de Lúmen. Pode usar o mapa, se já passou por lá.', progress: 'Leve as cartas de maré à Sábia Yun, na Vila de Lúmen. O mapa viaja de graça de volta à vila.', done: ['Marés e ecos sobem e descem juntos. O sussurro do cais corre para o leste, pelo Cume Gélido.', 'Diga à Capitã que a rota segue a geada. Os ecos de lá são cópias, e quem copia deixa rastro.'] },
    objectives: [{ type: 'level', count: 22, label: 'Leve as cartas de maré à Sábia Yun, na Vila de Lúmen' }],
    reward: { gold: 600, xp: 8000, potions: 2 },
  },
  porto_aco_na_geada: {
    id: 'porto_aco_na_geada', name: 'Aço na Geada', giver: 'duelist', level: 23, after: 'porto_recado_da_sabia',
    text: { offer: 'Se a rota segue a geada, a geada tem dentes. Treino não é medo: ganhe um duelo amistoso no meu ringue e depois cace doze lobos da geada no Cume. Aço aprende em lugares frios.', progress: 'Um duelo amistoso no ringue do Porto e doze Lobos da Geada no Cume Gélido, a leste das Ruínas.', done: 'Ringue e gelo, duas escolas. Aperto de mão, herói. A Capitã já pergunta por você.' },
    objectives: [{ type: 'friendlyDuel', count: 1, label: 'Vença 1 duelo amistoso' }, { type: 'kill', mob: 'frostwolf', zone: 'glacier', count: 12, label: 'Derrote 12 Lobos da Geada no Cume Gélido' }],
    reward: { gold: 1500, xp: 20000, items: [{ rarity: 'rare' }] },
  },
  porto_geada_nas_velas: {
    id: 'porto_geada_nas_velas', name: 'Geada nas Velas', giver: 'dealer', level: 25, after: 'porto_aco_na_geada',
    text: { offer: 'Vela com geada não enfuna, freguês. O frio do Cume desce até o cais e os fogos-fátuos glaciais são os primeiros a chegar. Doze deles e doze geleias gélidas, e eu garanto o seu desconto.', progress: 'Doze Fogos-fátuos Glaciais e doze Geleias Gélidas no Cume Gélido. Leve poções e um bom casaco.', done: 'Velas secas, livro de contas feliz. Desconto de freguês garantido, e a minha palavra é de comerciante.' },
    objectives: [{ type: 'kill', mob: 'icewisp', zone: 'glacier', count: 12, label: 'Derrote 12 Fogos-fátuos Glaciais no Cume Gélido' }, { type: 'kill', mob: 'frostslime', zone: 'glacier', count: 12, label: 'Derrote 12 Geleias Gélidas no Cume Gélido' }],
    reward: { gold: 1800, xp: 26000, potions: 3 },
  },
  porto_brasa_no_horizonte: {
    id: 'porto_brasa_no_horizonte', name: 'Brasa no Horizonte', giver: 'captain', level: 27, after: 'porto_geada_nas_velas',
    text: { offer: 'À noite, o céu a leste fica vermelho. Se o gelo era cópia, o que arde é o quê? Vá até as Cinzas Ardentes e abata doze lobos de brasa e dez espectros de cinzas. Volte com a resposta.', progress: 'Doze Lobos de Brasa e dez Espectros de Cinzas nas Cinzas Ardentes, a leste do Cume. O chão queima: leve poções.', done: 'Cópias de fogo, como a geada. O eco tenta se juntar de novo e erra a conta. Ainda não sei o que fazer, mas agora sei onde olhar.' },
    objectives: [{ type: 'kill', mob: 'emberwolf', zone: 'ember', count: 12, label: 'Derrote 12 Lobos de Brasa nas Cinzas Ardentes' }, { type: 'kill', mob: 'cinderwraith', zone: 'ember', count: 10, label: 'Derrote 10 Espectros de Cinzas nas Cinzas Ardentes' }],
    reward: { gold: 2200, xp: 32000, potions: 4 },
  },
  porto_primeiro_barco: {
    id: 'porto_primeiro_barco', name: 'O Primeiro Barco', giver: 'captain', level: 28, after: 'porto_brasa_no_horizonte',
    text: { offer: 'Um barco só zarpa se a estrada o deixar chegar ao cais. Derrube o Cão do Inferno, o mini-chefe das Cinzas, e traga a carga de dois baús de lá. Se voltar inteiro, eu solto as amarras.', progress: 'Um mini-chefe das Cinzas Ardentes (o Cão do Inferno) e dois baús de lá. Depois, volte ao cais.', done: 'Amarras soltas. Um barco só: as estradas ainda têm ecos demais para uma frota. Mas um barco só já é rota. O Porto nunca esqueceu quem o fez. Obrigada, herói.' },
    objectives: [{ type: 'miniboss', mob: 'any', count: 1, label: 'Derrote 1 mini-chefe (o Cão do Inferno, nas Cinzas)' }, { type: 'chest', zone: 'ember', count: 2, label: 'Abra 2 baús nas Cinzas Ardentes' }],
    reward: { gold: 3500, xp: 36000, potions: 5, items: [{ rarity: 'epic' }] },
  },
});

// ---- Cripta dos Ecos (masmorra por instância, decisão 0017): a Yun apresenta a masmorra; o objetivo `crypt` só o servidor soma ----
Object.assign(QUESTS, {
  cripta_dos_ecos: {
    id: 'cripta_dos_ecos', name: 'A Cripta dos Ecos', giver: 'sage', level: 22, after: 'guardiao_das_ruinas',
    text: {
      offer: 'Sob as Ruínas dorme uma cripta onde os ecos presos têm um rei: o Soberano dos Ecos, que nunca quis repousar. O Guardião caiu e a porta dele se abriu. Entre pelo mapa, com até três aliados.',
      progress: 'A entrada fica no mapa, ligada às Ruínas: quatro salas, e a última guarda o Soberano. Uma entrada grátis a cada vinte minutos; um contrato do Porto rende uma Chave de Eco, que pula a espera.',
      done: 'Calado, enfim. Era isso que o Guardião guardava. Os fragmentos que ele deixou servem ao Ferreiro Brok: ele forja o eco em aço. Mas os ecos de lá sempre voltam.',
    },
    objectives: [{ type: 'crypt', count: 1, label: 'Derrote o Soberano dos Ecos na Cripta' }],
    reward: { gold: 1400, xp: 7000, potions: 3, items: [{ rarity: 'epic' }] },
  },
});

// Missão de evolução de cada tipo de spirit (core/progression.js, core/journal.js spiritEvoStatus).
export const SPIRIT_EVO_QUEST = Object.fromEntries(EVO.map(([type, , , key]) => [type, 'evolucao_do_spirit_' + key]));

