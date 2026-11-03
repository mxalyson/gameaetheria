// Cripta dos Ecos (masmorra por instância, decisão 0017): dados puros. Sem DOM nem regras: quem lê são data/zones.js (layout), server/crypt.js
// (sala autoritativa), core/echo.js (entrada, fragmentos, forja) e a interface do mapa. Ajuste números AQUI.
//
// Geometria: corredor leste-oeste de 4 salas (3 de ondas curtas + a do chefe), separadas por muros com uma porta de 120 px no meio.
// O servidor segura os heróis antes do muro enquanto a sala não for limpa (server/crypt.js, `gateX`).
export const CRYPT_GEOM = {
  w: 5400, h: 1000, mid: 500,
  walls: [1300, 2700, 4100], wallW: 80, door: [440, 560],
  starts: [200, 1450, 2850, 4260],          // ponto de chegada (e de renascimento) de cada sala
  bossAt: { x: 4850, y: 500 },
  exit: { x: 60, y: 500 },                   // portal de volta à Vila
  roomX: [[330, 1200], [1520, 2600], [2920, 4000], [4400, 5280]], // faixa onde as criaturas nascem em cada sala
};

export const CRYPT = {
  id: 'crypt', name: 'Cripta dos Ecos',
  minLevel: 20, recommended: [20, 30], maxPlayers: 4,
  needVisited: 'ruins',                      // a entrada só abre para quem já chegou às Ruínas Sombrias
  cooldownSec: 20 * 60,                      // 1 entrada grátis a cada 20 min por personagem (hora do servidor)
  keyMax: 5,                                 // Chave de Eco: pula a espera; vem dos contratos do Porto (1 por contrato entregue)
  maxDeaths: 3,                              // quedas por herói; na 4ª ele é levado para fora (o grupo inteiro caído = fracasso)
  introSec: 5, restSec: 3, exitSec: 90,      // espera antes da 1ª onda · pausa entre ondas · tempo para sair depois do chefe
  hpPerExtra: 0.55, atkPerExtra: 0.12,       // vida e dano dos monstros por herói a mais além do primeiro
  // Ondas curtas de cada sala (`elites` entram na última onda). Níveis: do herói (20–30) + `lvlPlus` da sala.
  rooms: [
    { lvlPlus: 0, waves: [[['echoknight', 2], ['echoshade', 2]], [['echoshade', 3], ['echoknight', 2]]], elites: [] },
    { lvlPlus: 1, waves: [[['echoknight', 3], ['echoshade', 2]], [['echobrute', 2], ['echoshade', 3]]], elites: [['echobrute', 1]] },
    { lvlPlus: 2, waves: [[['echobrute', 2], ['echoknight', 3]], [['echoshade', 4], ['echobrute', 2]]], elites: [['echoknight', 1], ['echobrute', 1]] },
  ],
  boss: { id: 'echolord', lvlPlus: 3 },
  // Fragmento de Eco (material só da masmorra): por sala limpa e pelo chefe, sorteado por herói; limite no documento.
  frags: { room: [[2, 3], [2, 4], [3, 4]], boss: [8, 12], cap: 999 },
  itemChance: 0.2,                           // chance (por herói) do chefe soltar direto um item Eco da própria classe
  itemWeaponShare: 0.5,
};

// Receitas do Ferreiro Brok (1 de cada por personagem; `server/tx.js` op `craft`).
export const ECHO_RECIPES = {
  eco_weapon: { id: 'eco_weapon', slot: 'weapon', frags: 40, gold: 2500, label: 'Arma do Eco' },
  eco_armor: { id: 'eco_armor', slot: 'armor', frags: 60, gold: 4000, label: 'Armadura do Eco' },
};

// Nomes dos itens Eco (arte própria depois: ver docs/roadmap/depende-do-dono.md). Arma por tipo; armadura por classe.
export const ECHO_NAMES = {
  weapon: { sword: 'Lâmina do Eco', staff: 'Cajado do Eco', bow: 'Arco do Eco', mace: 'Martelo do Eco' },
  armor: { warrior: 'Couraça do Eco', mage: 'Manto do Eco', archer: 'Gibão do Eco', cleric: 'Hábito do Eco' },
};
// Multiplicador dos atributos base do item Eco e bônus fixos por espaço (estilo do ópalo, um degrau abaixo).
export const ECHO_ITEM = { statMul: 1.35, weapon: { crit: 5, atkSpeed: 6 }, armor: { moveSpeed: 4, lifesteal: 2 }, vitPerLevel: 0.5 };
