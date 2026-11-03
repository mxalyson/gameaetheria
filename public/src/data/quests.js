// Missões (dados). Cada objetivo tem um `type`:
//   kill  {mob:'any'|id, zone:'any'|id}   boss {mob:'any'|id}   chest {zone:'any'|id}   spirit (ter N spirits)   level (alcançar o nível N)
//   pvp {mode:'any'|1v1|2v2|4v4}   coop   ← estes dois são do SERVIDOR (só o servidor soma progresso; o cliente não consegue marcá-los)
//   miniboss (abater mini-chefe)   skillUse {skill:'signature'|'any'}   spiritKill {spirit:id} (abates com aquele spirit ativo)
//   teleport (usar o teletransporte do mapa)   upgrade (aprimorar um equipamento no Ferreiro)   spiritStage (ter N spirits evoluídos, forma 2)
// Cânone do arco final: 3 guardiões originais (Carvalho, Colosso, Guardião) e 2 reflexos (Ancião Gélido = gelo, Cavaleiro Rubro = brasa). `text.done` pode ser lista de falas (epílogo).
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
  carvalho_ancestral: {
    id: 'carvalho_ancestral', name: 'O Carvalho Ancestral', giver: 'guard', level: 4, after: 'caca_aos_lobos',
    text: { offer: 'Há um carvalho antigo no fundo do bosque, e ele despertou. Leve poções e fuja se precisar: raízes não perdoam. Derrube-o antes que cheguem à vila.', progress: 'O Carvalho Ancestral fica no extremo leste do bosque. Leve poções.', done: 'Ele caiu sussurrando: "não sou o primeiro". Leve essa frase à Sábia Yun. Tome esta peça.' },
    objectives: [{ type: 'boss', mob: 'treant', count: 1, label: 'Derrote o Carvalho Ancestral' }],
    reward: { gold: 200, xp: 750, items: [{ rarity: 'rare' }] },
  },
  cristais_vivos: {
    id: 'cristais_vivos', name: 'Cristais Vivos', giver: 'guard', level: 6, after: 'carvalho_ancestral',
    text: { offer: 'Depois do bosque, a Planície de Cristal. As pedras andam por lá. Abata doze criaturas.', progress: 'A Planície de Cristal é logo depois do bosque. Siga o portal.', done: 'Doze a menos. A rota comercial agradece. Mas pedra não anda sozinha: algo as chama, lá do coração da planície.' },
    objectives: [{ type: 'kill', mob: 'any', zone: 'plains', count: 12, label: 'Derrote 12 criaturas da Planície de Cristal' }],
    reward: { gold: 250, xp: 1500 },
  },
  coracao_de_cristal: {
    id: 'coracao_de_cristal', name: 'Coração de Cristal', giver: 'herbalist', level: 8, after: 'cristais_vivos',
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
  guardiao_das_ruinas: {
    id: 'guardiao_das_ruinas', name: 'O Guardião Esquecido', giver: 'guard', level: 22, after: 'ruinas_sombrias',
    text: { offer: 'O Guardião das Ruínas protege algo que não devia existir. Derrube-o e descubra o quê.', progress: 'O Guardião fica no coração das ruínas.', done: 'Ele não lutava para nos matar. Lutava para nos manter longe. Do quê? Não sei. Parecia esperar alguém. Que seu nome seja lembrado.' },
    objectives: [{ type: 'boss', mob: 'guardian', count: 1, label: 'Derrote o Guardião das Ruínas' }],
    reward: { gold: 1200, xp: 6250, items: [{ rarity: 'epic' }] },
  },
  rumo_ao_topo: {
    id: 'rumo_ao_topo', name: 'Rumo ao Topo', giver: 'herbalist', level: 10, after: null,
    text: { offer: 'Cada região tem uma flor que só abre para quem não desiste. Alcance o nível 20 e traga a flor que cresce entre as Ruínas, num baú esquecido.', progress: 'Continue evoluindo: missões, chefes e arena dão experiência.', done: 'Você chegou longe! As flores abriram para você. Esta bolsa é por sua perseverança.' },
    objectives: [{ type: 'level', count: 20, label: 'Alcance o nível 20' }, { type: 'chest', zone: 'ruins', count: 1, label: 'Abra um baú nas Ruínas Sombrias (a flor está lá)' }],
    reward: { gold: 800, xp: 0, items: [{ rarity: 'epic' }] },
  },
  // ---- Tutoriais dos comerciantes (Lia e Brok) ----
  pergaminho_de_cortesia: {
    id: 'pergaminho_de_cortesia', name: 'Pergaminho de Cortesia', giver: 'merchant', level: 3, after: null,
    text: { offer: 'Cortesia da casa, freguês: abra o mapa pelo menu e viaje a um lugar já visitado. Voltar à vila não custa nada. Depois me diga se não é prático.', progress: 'É só abrir o mapa pelo menu e tocar em Viajar. A Vila é de graça.', done: 'Viu como é prático? Quando precisar ir mais longe, pergaminhos estão sempre na minha loja.' },
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
    text: { offer: 'O Guardião das Ruínas tinha um martelo, dizem. Os baús de lá guardam restos dele. Abra três. Traga o que achar.', progress: 'Baús nas Ruínas Sombrias. Três.', done: 'Restos do martelo. Fundi o que deu. Fique com isto.' },
    objectives: [{ type: 'chest', zone: 'ruins', count: 3, label: 'Abra 3 baús nas Ruínas Sombrias' }],
    reward: { gold: 900, xp: 4500, items: [{ rarity: 'rare' }] },
  },
  // ---- Arco final: "Os Ecos Partidos" (Cume Gélido e Cinzas Ardentes) ----
  cume_gelido: {
    id: 'cume_gelido', name: 'O Silêncio da Geada', giver: 'guard', level: 23, after: 'guardiao_das_ruinas',
    text: { offer: 'Com o Guardião caído, a passagem a leste se abriu: o Cume Gélido. Dizem que as criaturas de lá são cópias geladas das nossas. Abata vinte.', progress: 'O Cume Gélido fica a leste das Ruínas Sombrias. Leve poções.', done: 'Cópias, eco de ecos... A Sábia Yun vai querer saber disso.' },
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
    text: { offer: 'Ó, o Rubro! Luta como o Guardião lutava, mas em brasa. Só desperta quando as Cinzas se alimentam de sangue: derrote quarenta criaturas por lá e o chão estremecerá!', progress: 'Se ele tombar e voltar a dormir, derrote quarenta criaturas nas Cinzas: o contador "Ritual" mostra quanto falta.', done: 'Ouvi o chão tremer daqui. Um duelo desses vale uma canção na arena.' },
    objectives: [{ type: 'boss', mob: 'infernoknight', count: 1, label: 'Derrote o Cavaleiro Rubro' }],
    reward: { gold: 4500, xp: 38000, items: [{ rarity: 'legendary' }] },
  },
  ecos_unidos: {
    id: 'ecos_unidos', name: 'Os Ecos Unidos', giver: 'sage', level: 30, after: 'cavaleiro_rubro',
    text: {
      offer: 'Três guardiões e dois reflexos: o gelo e a brasa foram o eco tentando se juntar de novo. Hoje todos repousam. Evolua um spirit (cada elemento tem uma missão minha) e volte: quero lhe mostrar o que sobrou.',
      progress: 'Evolua um spirit e volte a mim: peça a missão do elemento dele a mim mesma, cumpra-a e use Evoluir no painel de Spirits. O último capítulo espera.',
      done: ['Aqui jaz o primeiro eco, inteiro de novo. A vila dorme; os spirits ao seu lado carregam um pouco dele.', 'Você era o último capítulo, herói. A partir de hoje, o eco tem voz, e é a sua.', 'Mas toda estrada tem outra volta. Ouça: já há um novo sussurro na neve.'],
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
    text: { offer: 'Quem ensina a si mesmo tem um tolo por mestre. Prove-se: derrube um mini-chefe e mostre domínio da sua habilidade assinatura, dez vezes. Então falaremos de especialização.', progress: 'Um mini-chefe e dez usos da habilidade assinatura. Sem atalhos.', done: 'Está feito. Seu estilo agora tem nome e caminho. Abra o painel do personagem e escolha a especialização, com orgulho.' },
    objectives: [{ type: 'miniboss', mob: 'any', count: 1, label: 'Derrote 1 mini-chefe' }, { type: 'skillUse', skill: 'signature', count: 10, label: 'Use a habilidade assinatura 10 vezes' }],
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
  porto_gelo: {
    id: 'porto_gelo', name: 'Carga de Gelo', giver: 'dealer', level: 22, after: 'porto_chegada',
    text: { offer: 'Gelo do Cume vale ouro no verão. Abra três baús no Cume Gélido e traga o que sobrar das cargas congeladas. Divido o lucro, e a palavra é de comerciante.', progress: 'Três baús no Cume Gélido, a leste das Ruínas. Leve poções e um bom casaco.', done: 'Frio de verdade, mercadoria de verdade. Aqui está a sua parte, e mais um pouco.' },
    objectives: [{ type: 'chest', zone: 'glacier', count: 3, label: 'Abra 3 baús no Cume Gélido' }],
    reward: { gold: 1600, xp: 11000, items: [{ rarity: 'rare' }] },
  },
  porto_duelo: {
    id: 'porto_duelo', name: 'Duelo de Cais', giver: 'duelist', level: 10, after: null,
    text: { offer: 'Sem Elo, sem rancor. Vença um duelo amistoso no meu ringue e eu pago a rodada. Só funciona na jornada solo: o mar conectado tem a Grande Arena.', progress: 'O ringue fica aqui ao lado. Fale comigo para aceitar o duelo amistoso.', done: 'Aço limpo e aperto de mão. Boa luta, herói.' },
    objectives: [{ type: 'friendlyDuel', count: 1, label: 'Vença 1 duelo amistoso' }],
    reward: { gold: 300, xp: 1600, potions: 2 },
  },
});

// ---- Cripta dos Ecos (masmorra por instância, decisão 0017): a Yun apresenta a masmorra; o objetivo `crypt` só o servidor soma ----
Object.assign(QUESTS, {
  cripta_dos_ecos: {
    id: 'cripta_dos_ecos', name: 'A Cripta dos Ecos', giver: 'sage', level: 20, after: 'ruinas_sombrias',
    text: {
      offer: 'Sob as Ruínas dorme uma cripta onde os ecos se prendem a si mesmos. Abra o mapa, entre com até três aliados e silencie o Soberano dos Ecos.',
      progress: 'A entrada fica no mapa, ligada às Ruínas: quatro salas, e a última guarda o Soberano. Uma entrada a cada vinte minutos.',
      done: 'Calado, enfim. Os fragmentos que ele guardava servem ao Ferreiro Brok: ele sabe forjar o eco em aço.',
    },
    objectives: [{ type: 'crypt', count: 1, label: 'Derrote o Soberano dos Ecos na Cripta' }],
    reward: { gold: 1400, xp: 7000, potions: 3, items: [{ rarity: 'epic' }] },
  },
});

// Missão de evolução de cada tipo de spirit (core/progression.js, core/journal.js spiritEvoStatus).
export const SPIRIT_EVO_QUEST = Object.fromEntries(EVO.map(([type, , , key]) => [type, 'evolucao_do_spirit_' + key]));

