// Conquistas (dados). `stat` = contador do personagem (doc.stats[stat]) ou 'level'/'quests'; `min` = valor para ganhar.
// Conquistas dão um TÍTULO opcional (escolhido no diário). O servidor recalcula tudo a partir dos contadores: o cliente não "se concede" conquistas.
export const ACHIEVEMENTS = [
  { id: 'primeiro_sangue', name: 'Primeiro Sangue', desc: 'Derrote 1 criatura.', stat: 'kills', min: 1, title: 'o Novato' },
  { id: 'cacador', name: 'Caçador', desc: 'Derrote 100 criaturas.', stat: 'kills', min: 100, title: 'Caçador' },
  { id: 'exterminador', name: 'Exterminador', desc: 'Derrote 1000 criaturas.', stat: 'kills', min: 1000, title: 'o Exterminador' },
  { id: 'quebra_chefes', name: 'Quebra-Chefes', desc: 'Derrote 1 chefe.', stat: 'bossKills', min: 1, title: 'Quebra-Chefes' },
  { id: 'terror_dos_chefes', name: 'Terror dos Chefes', desc: 'Derrote 10 chefes.', stat: 'bossKills', min: 10, title: 'Terror dos Chefes' },
  { id: 'explorador', name: 'Explorador', desc: 'Abra 10 baús.', stat: 'chests', min: 10, title: 'Explorador' },
  { id: 'saqueador', name: 'Saqueador', desc: 'Abra 50 baús.', stat: 'chests', min: 50, title: 'o Saqueador' },
  { id: 'aventureiro', name: 'Aventureiro', desc: 'Alcance o nível 10.', stat: 'level', min: 10, title: 'Aventureiro' },
  { id: 'veterano', name: 'Veterano', desc: 'Alcance o nível 20.', stat: 'level', min: 20, title: 'Veterano' },
  { id: 'lenda', name: 'Lenda de Aetheria', desc: 'Alcance o nível 30.', stat: 'level', min: 30, title: 'Lenda de Aetheria' },
  { id: 'recadeiro', name: 'Recadeiro', desc: 'Complete 5 missões.', stat: 'quests', min: 5, title: 'Recadeiro' },
  { id: 'heroi_da_vila', name: 'Herói da Vila', desc: 'Complete 10 missões.', stat: 'quests', min: 10, title: 'Herói da Vila' },
  { id: 'duelista', name: 'Duelista', desc: 'Vença 5 partidas de arena contra jogadores reais.', stat: 'pvpWins', min: 5, title: 'Duelista' },
  { id: 'campeao', name: 'Campeão da Arena', desc: 'Vença 25 partidas de arena contra jogadores reais.', stat: 'pvpWins', min: 25, title: 'Campeão da Arena' },
  { id: 'camarada', name: 'Camarada', desc: 'Vença 1 desafio cooperativo.', stat: 'coopClears', min: 1, title: 'Camarada' },
  { id: 'lider_de_ecos', name: 'Líder de Ecos', desc: 'Vença 5 desafios cooperativos.', stat: 'coopClears', min: 5, title: 'Líder de Ecos' },
];
export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);
export const ACH = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
// Contadores do personagem. `SERVER_STATS` só o servidor altera (vêm de partidas decididas lá).
export const STAT_KEYS_PROGRESS = ['kills', 'bossKills', 'chests', 'quests', 'pvpWins', 'pvpGames', 'coopClears'];
export const SERVER_STATS = ['pvpWins', 'pvpGames', 'coopClears'];
