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
