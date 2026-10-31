# Sistemas de jogo
Controles: WASD move, mouse mira, clique ataca, 1/2/3 habilidades; I/C/P abrem inventário, personagem, spirits.

| Sistema | Onde | Estado |
|---|---|---|
| Classes e habilidades (3×3) | data/classes.js, data/skills.js | implementado e testado (cada skill/status em tests/combat.test.js); equilíbrio medido com npm run balance |
| Especializações (nível 15, 2 por classe) | data/specs.js, core/specs.js | implementado e testado; ajustam habilidades existentes; 1ª escolha grátis |
| Combate (melee, projétil, AoE, dash, buff, stun, slow, escudo) | game/sim.js | implementado e testado; passo fixo 60 Hz; eventos hit/heal/swing/status/cast/death; Clérigo cura/protege aliados próximos |
| Mobs, chefes e IA | data/mobs.js, game/ai.js | implementado; não validado em jogo |
| Loot, raridades, equipamento | core/loot.js, data/items.js | implementado e testado (unitário) |
| Progressão (nível máx. 30) e spirits | core/progression.js | implementado e testado (unitário) |
| Grande Arena por times 1×1/2×2/4×4 (ponto de controle), poder (PWR), pareamento por poder, PvP no nível 10; ondas PvE | main.js, core/match.js, core/power.js, core/rival.js | implementado e testado; não validado com humanos nem no celular |

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
