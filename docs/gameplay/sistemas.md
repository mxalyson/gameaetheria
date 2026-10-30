# Sistemas de jogo
Controles: WASD move, mouse mira, clique ataca, 1/2/3 habilidades; I/C/P abrem inventário, personagem, spirits.

| Sistema | Onde | Estado |
|---|---|---|
| Classes e habilidades (3×3) | data/classes.js, data/skills.js | implementado; só regras de dano/nível testadas |
| Combate (melee, projétil, AoE, dash, buff, stun, slow) | game/sim.js | implementado; o teste cobre apenas matar um mob |
| Mobs, chefes e IA | data/mobs.js, game/ai.js | implementado; não validado em jogo |
| Loot, raridades, equipamento | core/loot.js, data/items.js | implementado e testado (unitário) |
| Progressão (nível máx. 30) e spirits | core/progression.js | implementado e testado (unitário) |
| PvP com rival e Elo; ondas PvE | main.js, core/rival.js | implementado; não validado em jogo |

Critérios de aceitação por mecânica serão definidos com o `gameplay-level-designer` antes de cada mudança.

## Herói jogável no Vale de Auren (Fase 4, protótipo)
Página `/vale.html`; lógica em `public/src/game/iso-hero.js` (sem DOM), desenho em `public/src/render/vale.js`.
Reaproveita regras reais: Guerreiro (`data/classes.js`), `computeStats`, `computeHit`, ataque básico (alcance 74 px, arco 1,8 rad, cd 0,6 s) e Golpe Giratório (raio 110 px, mult 1,7, cd 5 s). Escala: 1 tile = 64 px do jogo atual.
Controles: WASD (eixos isométricos: W sobe na tela), mouse mira, clique ataca, 1 = Golpe Giratório.
| Item | Estado |
|---|---|
| Movimento com colisão (água, degraus >1, árvores, ruínas, ponte) | testado (unitário e e2e) |
| Ataque básico e habilidade com dano real contra alvo de treino | testado (unitário e e2e) |
| Poses: parado, andar, ataque, giro; vista de costas | implementado; validado só por captura de tela |
| Inimigo com IA, vida, dano recebido, esquiva | pendente (Fase 5) |
| Câmera que segue o herói | pendente (hoje o diorama inteiro cabe na tela e o herói fica pequeno) |
| Integração ao jogo principal | pendente, exige decisão à parte |
