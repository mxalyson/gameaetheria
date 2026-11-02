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
  // Conquistas da história: `quest` = missão concluída (min 1) em vez de contador. O servidor as recalcula pelo mesmo caminho (checkAchievements).
  { id: 'primeiro_sussurro', name: 'Primeiro Sussurro', desc: 'Derrube o Carvalho Ancestral e ouça suas últimas palavras.', quest: 'carvalho_ancestral', min: 1, title: 'Ouvinte de Sussurros' },
  { id: 'dono_do_gelo', name: 'Dono do Gelo', desc: 'Liberte o Ancião Gélido no Cume.', quest: 'anciao_gelido', min: 1, title: 'Dono do Gelo' },
  { id: 'brasa_adormecida', name: 'Brasa Adormecida', desc: 'Apague o Cavaleiro Rubro nas Cinzas Ardentes.', quest: 'cavaleiro_rubro', min: 1, title: 'Brasa Adormecida' },
  { id: 'viajante', name: 'Viajante', desc: 'Use o teletransporte do mapa 5 vezes.', stat: 'teleports', min: 5, title: 'Viajante' },
  { id: 'mao_de_ferro', name: 'Mão de Ferro', desc: 'Aprimore equipamentos 10 vezes com o Ferreiro.', stat: 'upgrades', min: 10, title: 'Mão de Ferro' },
  { id: 'voz_dos_ecos', name: 'Voz dos Ecos', desc: 'Conclua o arco final: Os Ecos Unidos.', quest: 'ecos_unidos', min: 1, title: 'Voz dos Ecos' },
];
export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);
export const ACH = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
// Contadores do personagem. `SERVER_STATS` só o servidor altera (vêm de partidas decididas lá).
export const STAT_KEYS_PROGRESS = ['kills', 'bossKills', 'chests', 'quests', 'pvpWins', 'pvpGames', 'coopClears', 'pvpHour', 'pvpHourN', 'pvpFoe', 'pvpFoeN', 'pvpFoeMin', 'teleports', 'upgrades', 'tips'];
// `tips` não é contador: é uma máscara de bits (dicas já mostradas, core/journal.js TIP_BITS); o servidor une os bits em vez de limitar o salto.
export const FLAG_STATS = ['tips'];
export const SERVER_STATS = ['pvpWins', 'pvpGames', 'coopClears', 'pvpHour', 'pvpHourN', 'pvpFoe', 'pvpFoeN', 'pvpFoeMin']; // os 5 últimos limitam o XP de PvP (core/rewards.js)
