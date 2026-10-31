# 0012 — Missões, conquistas, baús, mapa e documento v3 (P8)
Data: 2026-10-31 · Status: **implementado e testado localmente**. Não publicado.

## O que entrou
| Parte | Onde | Resumo |
|---|---|---|
| Missões por dados | `data/quests.js`, `core/journal.js` | 12 missões encadeadas (Vila → Bosque → Planície → Ruínas, arena, cooperativo, spirits, nível). Objetivos: `kill`, `boss`, `chest`, `spirit`, `level`, `pvp`, `coop`. Máx. 5 ativas; entrega idempotente; item na mochila (ou ouro se cheia) |
| Diálogos | `data/dialogs.js`, painel `dialog` | NPC com missão a oferecer/entregar/acompanhar abre o diálogo; sem missão, abre o serviço direto (como antes). Marca `!` (oferece), `?` (entregar), nada (sem missão). Novos NPCs: **Guarda Ren** e **Herbalista Mel** (vila) |
| Baús | `data/zones.js` (`chests`), `core/journal.js` | 4 por zona de exploração (E para abrir), recarga de 10 min, ouro por nível × tier e chance de item |
| Mapa-múndi | painel `map` (tecla **M**) | zonas em sequência, níveis, chefes, quantos baús, onde você está |
| Diário | painel `journal` (tecla **J**) | missões ativas com progresso, contadores, conquistas e escolha de **título** |
| Conquistas | `data/achievements.js` | 16 conquistas por contador (abates, chefes, baús, nível, missões, vitórias de arena e cooperativo) com título opcional |
| Documento do personagem v3 | `core/savedoc.js` | `quests`, `stats`, `achievements`, `title`, `chests`; migração v2→v3; validação por lista branca |
| Economia | `core/economy.js`, `docs/gameplay/economia.md`, `npm run economy` | fontes/ralos documentados; **cooperativo rebalanceado** (XP ≤ 30% de um nível) |

## Autoridade (quem decide o quê)
- **Servidor decide:** vitórias/partidas de PvP e limpezas cooperativas (`stats.pvpWins/pvpGames/coopClears`), o progresso das missões `pvp`/`coop`, as **conquistas** (recalculadas a partir dos contadores a cada gravação) e o rating.
- **Cliente informa, servidor limita:** abates, chefes, baús, entregas de missão, ouro, XP, itens. O servidor recusa (`422`) e **restaura o último estado oficial** quando: conclui missão que não estava ativa, conclui missão de arena/cooperativo sem o servidor ter contado, soma mais de 400 em um contador, cria mais de 6 registros de baú, volta o relógio de um baú, ganha mais de 2 níveis ou ouro/itens absurdos por gravação.
- **Jogo offline:** as missões de arena/cooperativo reais **não são oferecidas** (impossíveis sem servidor); abates, baús e entregas funcionam normalmente.

## Limites honestos
1. O ritmo de PvE de exploração segue sendo calculado no cliente: os tetos impedem saltos, **não** impedem "farmar rápido demais" dentro deles.
2. O relógio do baú usa a hora do aparelho (offline pode ser adiantada); online, o servidor impede apenas que ela **volte** no tempo.
3. Novos NPCs/baús usam arte provisória do estilo atual (heróis de NPC e caixa desenhada por código) — **não** passam pelo pipeline de arte real (fases B2/B3).
4. Sem missões diárias, repetíveis, rastreador na tela nem marcador no minimapa; sem mapa interativo (é uma lista).
5. Nada disso foi jogado por pessoas: testes automatizados e capturas apenas.
