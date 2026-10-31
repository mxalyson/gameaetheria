# PvE de exploração no servidor — proposta (precisa de decisão)
Status: **proposta, nada implementado.** Hoje: arena real e cooperativo são decididos no servidor; a exploração (Bosque/Planície/Ruínas) roda no navegador e o servidor só aplica limites de plausibilidade (`server/plausible.js`).

## Por que importa
O cliente calcula XP, ouro, loot e abates; um trapaceiro pode "farmar" dentro do teto e gastar o ouro (ex.: aprimoramento) sem limite real. Para um jogo com progressão e economia compartilhadas, a exploração precisa de um dono confiável.

## Opções
| Opção | O que é | Custo | Ganho |
|---|---|---|---|
| **A. Exploração como sala do servidor** | cada zona vira uma sala `World` no servidor (como o co-op), cliente só envia intenções e desenha snapshots | **alto**: zonas persistentes com muitos jogadores, mobs, respawn, baús, NPCs/missões no servidor, latência no movimento de exploração | trapaça de PvE praticamente eliminada; abre MMO leve |
| **B. Sessões de exploração por instância** | ao sair da vila, o servidor cria uma instância pequena (1–4 jogadores) da zona, decide abates/loot; vila continua local | **médio-alto**: reaproveita `CoopRoom`; muda a sensação de mundo aberto compartilhado | boa proteção, escopo controlado |
| **C. Auditoria estatística** | cliente continua calculando, mas envia um registro de abates com a semente do RNG e o servidor reexecuta/confere por amostragem | **médio**: o RNG já é determinístico, mas o jogo depende de entrada contínua; reexecução fiel é difícil | detecta trapaça grosseira, não impede |
| **D. Só limites mais apertados** | taxa máxima de ouro/XP por minuto por zona e nível | **baixo** | reduz o dano, não resolve |

## Recomendação
**D agora (barato) e B depois**, junto de uma decisão sua sobre como o mundo deve ser (compartilhado ou instanciado). A é o mundo "MMO" completo e só vale depois de haver jogadores.
Para decidir: o jogo é cooperativo em pequenos grupos (B) ou um mundo compartilhado grande (A)?
