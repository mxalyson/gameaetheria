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

---
# Decisão do proprietário (2026-10-31): **opção A** — zonas de exploração como salas persistentes do servidor
Plano proposto (P11), em sub-fases, cada uma com relatório e aprovação. **Nada implementado ainda.**

## Princípios
- Mesma simulação (`game/sim.js`, `ai.js`, `layout.js`) rodando no servidor: o cliente envia só **intenções** e recebe snapshots por delta (protocolo v4 já existe). Sem mudar regras de combate.
- **Vila de Lúmen** continua local no cliente (segura, sem combate): NPCs, loja, ferreiro. Mas **ouro/itens/aprimoramento passam a ser transações do servidor** (senão a trapaça só muda de lugar) — ver P11.4.
- O servidor passa a ser dono de: abates, XP, ouro, loot, baús, progresso de missões e morte no PvE.
- Offline (GitHub Pages / sem `?api`) segue como hoje: PvE local. O modo online é o autoritativo.

## Sub-fases
| Fase | Entrega | Critério de aceite |
|---|---|---|
| **P11.1 — Sala de zona** | `ZoneRoom` no servidor: um `World` por zona (Bosque, Planície, Ruínas) com mobs, respawn e chefe, vários jogadores na mesma instância; entrar/sair pelo portal; snapshots por delta; teto de jogadores por instância (abre outra ao encher) | 2+ jogadores veem os mesmos monstros; determinismo e testes de sala; CPU/jogador medida |
| **P11.2 — Combate e morte no servidor** | skills/ataques, dano, morte e renascimento (−10% ouro) decididos no servidor; cliente só desenha e prevê o movimento próprio | trapaça de dano/posição recusada (testes como no PvP); latência de ataque medida |
| **P11.3 — Recompensas** | XP, ouro, loot (RNG do servidor), chefes e **baús** só no servidor; saves na nuvem passam a aceitar esses campos **apenas** via operações do servidor | cliente editado não consegue subir ouro/XP/itens; `plausible.js` deixa de limitar o PvE (passa a recusar) |
| **P11.4 — Transações de economia** | compra/venda de itens e poções, essência, **aprimoramento**, respec e distribuição de pontos como operações idempotentes no servidor (tabela `operations` já existe) | ouro nunca negativo, sem duplicação (testes de repetição/concorrência) |
| **P11.5 — Missões e NPCs** | objetivos de abate/entrega verificados no servidor; diálogos continuam em dados | missões não completam por edição de save |
| **P11.6 — Carga e segurança** | teste de carga com N jogadores por zona; fuzz das novas mensagens; auditoria; limites | números medidos e documentados; sem exceções |

## Custos e riscos (honestos)
- **Grande**: cada fase é do tamanho de uma P6/P7. Estimo 5–6 fases de trabalho para ter tudo.
- **Sensação de controle:** movimento de exploração com latência real; precisa de previsão no cliente (já usada no PvP) e será medido.
- **Capacidade:** zonas persistentes mantêm mobs ativos o tempo todo; hibernar zonas vazias é obrigatório. Meta: custo por jogador na zona ≤ o do PvP 4×4 (≈ 0,4 ms/tick por sala pequena nas medições atuais).
- **Compatibilidade:** personagens existentes migram sem perda; o salvamento na nuvem passa a recusar ganhos de PvE vindos do cliente (mudança de versão do documento ou de regras do servidor).
- **Fica para depois:** chat, comércio entre jogadores, guildas, mundo contínuo sem portais (continua por zonas).
- **Não valida** o desempenho em celular real; só o servidor.

## Decisões que preciso de você antes de começar a P11.1
1. Tamanho máximo por instância de zona (sugestão: **16 jogadores**; abre nova instância ao encher)?
2. Em zona compartilhada, o que acontece com loot e abates? (sugestão: **loot individual** — cada um vê/pega o seu — e abate conta para quem causou dano relevante, para não haver briga por drop)
3. PvP aberto na exploração? (sugestão: **não**; PvP só nas arenas)
