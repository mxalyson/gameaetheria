# Porto de Marfim e ciclo de dia e noite

Estado em 2026-11-02. **Implementado e testado**: dados, lógica pura e layout (`tests/layout.test.js`, `tests/harbor.test.js`). **Pendente**: interface dos serviços e ligação do bônus noturno na sim. **Não validado**: o visual no navegador (nenhuma captura feita nesta rodada).

## Porto de Marfim (`ZONES.harbor`)
- Cidade neutra nº 2: segura, sem monstros, 2400×1700, `hub: true` (viagem grátis; entra em `visited` ao pisar nela). Ligada só à Vila: **portal sul da Vila** (850,1250) leva ao porto (1500,110); **portal norte do porto** (1500,40) leva à Vila (850,1180).
- Visual próprio (`scenery.kind: 'harbor'`): chão de areia clara (`sand-plains` com tom quente), ruas de lajes (`slabs`), canal norte-sul com **ponte de madeira** (`m_bridge`) na rua oeste, duas baías (`water-lake`), 6 casas Meshy em arco em volta da praça, cerejeiras na moldura, poço, lampiões, cercas do ringue, placa. Névoa leve e partículas quentes.
- Alcançável a pé (testado por busca em grade): o lado oeste do canal só se alcança pela ponte.
- Mapa-múndi: `WORLD_ROUTE` inclui `harbor` (depois da Vila); `WORLD_NODES = { id: {x,y} }` (0 a 100) em `data/zones.js`. Porto em (14,72), abaixo da Vila (14,36). `isHub(id)` e `teleportCost` (cidades são de graça).

## Serviços (NPCs com `role` novo; `DIALOGS[id].service.panel` diz o painel)
| NPC (`id`) | `role` | `service.panel` | Dados e lógica prontos |
|---|---|---|---|
| Banqueiro Octávio (`banker`) | `bank` | `bank` | `core/bank.js`: `depositItem(char, itemId)`, `withdrawItem(char, itemId)`, `bankFree`, `BANK_SIZE = 40`; `char.bank`; validado em `core/savedoc.js`, contado em `server/plausible.js` e reidentificado em `server/api.js` |
| Mestra de Caça Vesna (`hunter`) | `board` | `board` | `core/journal.js`: `dailyBoard(char, dayUTC())`, `claimDaily(char, id)`, `dailyProgressOf`, `dailyComplete`; estado em `char.daily` |
| Mercador Bartolomeu (`dealer`) | `harborshop` | `shop:harbor` | `shop.js`: `buildShopStock(char, { harbor: true })` (= `buildHarborStock`), `HARBOR`, `harborSellValue` |
| Duelista Kael (`duelist`) | `duel` | `arena:friendly` | `ZONES.harbor.arenaFriendly = { npc, mode: '1v1', rated: false }` (só dado) |
| Capitã Maré (`captain`) | `quest` | nenhum | só fala (condicional por missões) |

### Contratos diários
3 por dia UTC, sorteados por semente do dia (`hashString('board|' + dia)`), zonas elegíveis pelo nível: (1) derrote N de um monstro específico (8 a 14), (2) derrote N criaturas de uma zona (15 a 25), (3) abra 2 ou 3 baús. O progresso soma sozinho em `recordEvent` (abates sem chefe e baús); não há "aceitar". Recompensa: ouro, XP e poções (XP ≈ 35% do XP dos abates, para caber no orçamento de XP do servidor). A virada do dia zera `char.daily`; o servidor não deixa desfazer a entrega do dia nem usar dia futuro.

### Loja do Porto
Estoque rotativo diário (semente = personagem + nível + dia UTC): 6 itens, de incomum a **épico** (nunca lendário), 2 deles épicos "do dia". Preços próprios: itens comuns ×5,2 (Vila ×6), épicos ×30 (Vila ×25); o porto paga **60%** na venda (Vila 50%). Mesma convenção do destaque da Vila: `value` já vem inflado, `baseValue` é o real (restaurado pela compra em `main.js`), `price` é o preço final em ouro.

## Dia e noite
- Regra pura: `core/daycycle.js` (`dayPhase(hora)`, `isNight(hora)`, `nightMods(hora)`, `hourFromMs`, `parseHora`, `zoneHasCycle`). 12 min reais por dia (30 s por "hora"): aurora 5,5 a 7 (45 s), dia 7 a 21 (7 min), entardecer 21 a 22,5 (45 s), noite 22,5 a 5,5 (3,5 min). Relógio de parede: todos veem a mesma hora. `?hora=22` (ou `setHora(22)` no console; `setHora(null)` volta ao relógio) fixa a hora.
- Desenho: `render/sky.js › drawDayNight`, chamado uma vez em `renderer.draw` (antes das barras e nomes). Véu de cor por hora (aurora laranja, entardecer rosado, noite azul-marinho com vinheta; Ruínas e Cume mais escuros), buracos de luz no véu em volta do herói (lanterna), lampiões, braseiros e portais (brilho aditivo), vaga-lumes e estrelas à noite, rio de lava e brasas mais vivos nas Cinzas. Arenas (círculo) têm luz fixa. Qualidade baixa: só um retângulo e o halo do herói; média: sem estrelas e com menos vaga-lumes.
- Opção "Dia e noite: automático / sempre dia": `setDayNightMode('auto' | 'day')` de `render/sky.js` (salva em `localStorage`, chave `aetheria_daynight`).
- Bônus de risco (**ainda não ligado à sim**): `NIGHT = { aggroMul: 1.1, rewardMul: 1.15 }` em `data/mobs.js` e `nightMods(hora)` em `core/daycycle.js`. Para ligar: na sim ou no servidor, `const m = nightMods(hourFromMs(Date.now()))`, e usar `aggro * m.aggroMul` e `XP/ouro/drop * m.rewardMul` só em zonas com `zoneHasCycle(zone)`. No servidor de zona, usar o relógio do servidor (não o do cliente).
