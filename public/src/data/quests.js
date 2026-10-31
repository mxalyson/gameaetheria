// Missões (dados). Cada objetivo tem um `type`:
//   kill  {mob:'any'|id, zone:'any'|id}   boss {mob:'any'|id}   chest {zone:'any'|id}   spirit (ter N spirits)   level (alcançar o nível N)
//   pvp {mode:'any'|1v1|2v2|4v4}   coop   ← estes dois são do SERVIDOR (só o servidor soma progresso; o cliente não consegue marcá-los)
// `giver` = NPC que oferece (e recebe a entrega, salvo `turnIn`). `after` = missão exigida antes. Recompensa: ouro, xp, potions, items [{rarity}].
export const QUESTS = {
  primeiros_passos: {
    id: 'primeiros_passos', name: 'Primeiros Passos', giver: 'guard', level: 1, after: null,
    text: { offer: 'Os bosques ao leste andam inquietos. Mostre que sabe se virar: derrote cinco criaturas do Bosque Verdejante.', progress: 'Ainda restam criaturas no bosque. Siga o portal a leste.', done: 'Bem feito! A vila dorme mais tranquila. Tome, é por conta da guarda.' },
    objectives: [{ type: 'kill', mob: 'any', zone: 'forest', count: 5, label: 'Derrote 5 criaturas do Bosque Verdejante' }],
    reward: { gold: 60, xp: 90 },
  },
  caca_aos_lobos: {
    id: 'caca_aos_lobos', name: 'Caça aos Lobos', giver: 'guard', level: 2, after: 'primeiros_passos',
    text: { offer: 'Os lobos cinzentos estão atacando viajantes. Reduza o bando: seis lobos.', progress: 'Os lobos ainda rondam. Cuidado com os ataques em grupo.', done: 'O bando se dispersou. Os viajantes agradecem.' },
    objectives: [{ type: 'kill', mob: 'wolf', zone: 'any', count: 6, label: 'Derrote 6 Lobos Cinzentos' }],
    reward: { gold: 90, xp: 150 },
  },
  ervas_do_bosque: {
    id: 'ervas_do_bosque', name: 'Ervas do Bosque', giver: 'herbalist', level: 2, after: null,
    text: { offer: 'Preciso de ervas raras, mas elas crescem junto de baús abandonados no Bosque. Abra dois deles para mim (tecla E perto do baú).', progress: 'Procure os baús no Bosque Verdejante: eles brilham entre as árvores.', done: 'Exatamente o que eu precisava! Leve estas poções.' },
    objectives: [{ type: 'chest', zone: 'forest', count: 2, label: 'Abra 2 baús no Bosque Verdejante' }],
    reward: { gold: 80, xp: 120, potions: 3 },
  },
  primeiro_spirit: {
    id: 'primeiro_spirit', name: 'Companhia de Luz', giver: 'sage', level: 3, after: null,
    text: { offer: 'Um spirit é um eco da natureza. Reúna ao seu lado ao menos dois deles: compre uma essência comigo ou ache uma em combate.', progress: 'Você ainda precisa de mais um spirit. Compre uma Essência Selvagem aqui.', done: 'Vejo que dois ecos caminham com você. Eles crescem junto com o seu nível.' },
    objectives: [{ type: 'spirit', count: 2, label: 'Tenha 2 spirits' }],
    reward: { gold: 120, xp: 160 },
  },
  carvalho_ancestral: {
    id: 'carvalho_ancestral', name: 'O Carvalho Ancestral', giver: 'guard', level: 4, after: 'caca_aos_lobos',
    text: { offer: 'Há um carvalho antigo no fundo do bosque, e ele despertou. Derrube-o antes que as raízes cheguem à vila.', progress: 'O Carvalho Ancestral fica no extremo leste do bosque. Leve poções.', done: 'Você derrubou o Carvalho! Esta peça é a menor das recompensas.' },
    objectives: [{ type: 'boss', mob: 'treant', count: 1, label: 'Derrote o Carvalho Ancestral' }],
    reward: { gold: 200, xp: 300, items: [{ rarity: 'rare' }] },
  },
  cristais_vivos: {
    id: 'cristais_vivos', name: 'Cristais Vivos', giver: 'guard', level: 6, after: 'carvalho_ancestral',
    text: { offer: 'Além do bosque fica a Planície de Cristal, onde as pedras caminham. Abata doze criaturas de lá.', progress: 'A Planície de Cristal é logo depois do bosque. Siga o portal.', done: 'Doze a menos! A rota comercial agradece.' },
    objectives: [{ type: 'kill', mob: 'any', zone: 'plains', count: 12, label: 'Derrote 12 criaturas da Planície de Cristal' }],
    reward: { gold: 250, xp: 600 },
  },
  coracao_de_cristal: {
    id: 'coracao_de_cristal', name: 'Coração de Cristal', giver: 'herbalist', level: 8, after: 'cristais_vivos',
    text: { offer: 'O Colosso de Cristal guarda um núcleo valioso. Derrote-o e a vila lhe deve um favor.', progress: 'O Colosso fica no coração da planície.', done: 'O núcleo brilha! Aceite esta recompensa.' },
    objectives: [{ type: 'boss', mob: 'colossus', count: 1, label: 'Derrote o Colosso de Cristal' }],
    reward: { gold: 400, xp: 900, items: [{ rarity: 'rare' }], potions: 3 },
  },
  coragem_na_arena: {
    id: 'coragem_na_arena', name: 'Coragem na Arena', giver: 'arena', level: 10, after: null,
    text: { offer: 'Quem treina só contra monstros nunca conhece o próprio limite. Vença uma partida de arena contra jogadores reais (1×1, 2×2 ou 4×4).', progress: 'Entre na fila da Grande Arena (jogadores reais). Eu fico de olho.', done: 'Uma vitória limpa! A arena respeita você.' },
    objectives: [{ type: 'pvp', mode: 'any', count: 1, label: 'Vença 1 partida de arena contra jogadores reais' }],
    reward: { gold: 300, xp: 500 },
  },
  equipe_de_ecos: {
    id: 'equipe_de_ecos', name: 'Equipe de Ecos', giver: 'arena', level: 10, after: null,
    text: { offer: 'Nenhum herói vence sozinho. Complete o desafio cooperativo (ondas e chefe) com um grupo.', progress: 'Procure a fila Cooperativa no painel da arena.', done: 'Trabalho em equipe! Isso é o que mantém Lúmen de pé.' },
    objectives: [{ type: 'coop', count: 1, label: 'Vença 1 desafio cooperativo' }],
    reward: { gold: 350, xp: 600, items: [{ rarity: 'rare' }] },
  },
  ruinas_sombrias: {
    id: 'ruinas_sombrias', name: 'Sombras nas Ruínas', giver: 'guard', level: 12, after: 'coracao_de_cristal',
    text: { offer: 'Espectros saem das Ruínas Sombrias à noite. Vá até lá e abata quinze deles e de seus aliados.', progress: 'As Ruínas Sombrias ficam além da Planície de Cristal.', done: 'As ruínas ficaram em silêncio por um tempo. Obrigado.' },
    objectives: [{ type: 'kill', mob: 'any', zone: 'ruins', count: 15, label: 'Derrote 15 criaturas das Ruínas Sombrias' }],
    reward: { gold: 600, xp: 1400 },
  },
  guardiao_das_ruinas: {
    id: 'guardiao_das_ruinas', name: 'O Guardião Esquecido', giver: 'guard', level: 16, after: 'ruinas_sombrias',
    text: { offer: 'O Guardião das Ruínas protege algo que não devia existir. Derrube-o.', progress: 'O Guardião fica no coração das ruínas.', done: 'Inacreditável. Que seu nome seja lembrado.' },
    objectives: [{ type: 'boss', mob: 'guardian', count: 1, label: 'Derrote o Guardião das Ruínas' }],
    reward: { gold: 1200, xp: 2500, items: [{ rarity: 'epic' }] },
  },
  rumo_ao_topo: {
    id: 'rumo_ao_topo', name: 'Rumo ao Topo', giver: 'herbalist', level: 10, after: null,
    text: { offer: 'Os verdadeiros aventureiros não param. Alcance o nível 20 e volte para me contar.', progress: 'Continue evoluindo: missões, chefes e arena dão experiência.', done: 'Você chegou longe! Esta bolsa é por sua perseverança.' },
    objectives: [{ type: 'level', count: 20, label: 'Alcance o nível 20' }],
    reward: { gold: 800, xp: 0, items: [{ rarity: 'epic' }] },
  },
};

export const QUEST_IDS = Object.keys(QUESTS);
