# Porto de Marfim e ciclo de dia e noite

Estado em 2026-11-02. **Implementado e testado**: dados, lógica pura e layout (`tests/layout.test.js`, `tests/harbor.test.js`). **Pendente**: interface dos serviços e ligação do bônus noturno na sim. **Não validado**: o visual no navegador (nenhuma captura feita nesta rodada).

## Porto de Marfim (`ZONES.harbor`)
- Cidade neutra no MEIO da rota: **Vila → Bosque → Planície → Porto → Ruínas → Cume → Cinzas**. Segura, sem monstros, 2400×1700, `hub: true`. **Sem ligação com a Vila** (nunca duas cidades coladas): portal **oeste** (40,780) volta à Planície (chegada 4490,1400 lá); portal **leste** (2360,780) segue às Ruínas (chegada 110,1400). Entradas a 110 px da borda, na altura da rua principal (y 780, a da praça; o meio exato seria 850). Planície→Porto e Ruínas→Porto são os portais antigos Planície↔Ruínas.
- Visual próprio (`scenery.kind: 'harbor'`): chão de areia clara (`sand-plains` com tom quente), ruas de lajes (`slabs`), canal norte-sul com **ponte de madeira** (`m_bridge`) na rua oeste, duas baías (`water-lake`), 6 casas Meshy em arco em volta da praça, cerejeiras na moldura, poço, lampiões, cercas do ringue, placa. Névoa leve e partículas quentes.
- Alcançável a pé (testado por busca em grade): o lado oeste do canal só se alcança pela ponte.
- Mapa-múndi: `WORLD_ROUTE` inclui `harbor` (depois da Vila); `WORLD_NODES = { id: {x,y} }` (0 a 100) em `data/zones.js`. Porto em (63,66), entre a Planície (53,50) e as Ruínas (72,36). `teleportCost`: só a Vila é grátis; o **Porto custa 1 pergaminho** e só vale se `visited`. Saves antigos: `visited.ruins` implica `visited.harbor` (`core/savedoc.js`).

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
- Dia e noite sempre ligados (2026-11-03: a opção "sempre dia" foi removida a pedido do dono).
- Bônus de risco (**ainda não ligado à sim**): `NIGHT = { aggroMul: 1.1, rewardMul: 1.15 }` em `data/mobs.js` e `nightMods(hora)` em `core/daycycle.js`. Para ligar: na sim ou no servidor, `const m = nightMods(hourFromMs(Date.now()))`, e usar `aggro * m.aggroMul` e `XP/ouro/drop * m.rewardMul` só em zonas com `zoneHasCycle(zone)`. No servidor de zona, usar o relógio do servidor (não o do cliente).

## Missões do Porto (`data/quests.js`)
| Id | Giver | Objetivo | Nível |
|---|---|---|---|
| `porto_chegada` Cofre de Marfim | Capitã Maré | `bank`: guardar 1 item | 10 |
| `porto_contrato` Palavra de Contrato | Capitã Maré | `daily`: entregar 1 contrato | 10 (após chegada) |
| `porto_carga` Cargas Perdidas | Capitã Maré | matar 8 na Planície + 7 nas Ruínas | 12 |
| `porto_eco_no_cais` Eco no Cais | Capitã Maré | matar 12 nas Ruínas; revela os ecos presos sob as Ruínas (Guardião e Cripta) | 14 (após Cargas Perdidas) |
| `porto_gelo` Carga de Gelo | Bartolomeu | abrir 3 baús no Cume | 22 |
| `porto_duelo` Duelo de Cais | Kael | `friendlyDuel`: vencer 1 amistoso (**só offline**, `OFFLINE_TYPES`) | 10 |
### Cadeia "Maré de Ecos" (Nv 20-28, 2026-11-04) — implementada e testada (`tests/journal.test.js`, 5 testes); não validada jogando nem no celular
Capitã Maré quer um barco no mar de novo. Cânone: Marfim é neutra, os barcos param por causa dos ecos nas estradas; a Yun liga o sussurro ao Cume; o gelo e a brasa são "cópias" (os reflexos seguem nas missões de Ren/Yun/Doran, Nv 27+). Cada etapa exige a anterior (`after`); só objetivos já existentes (sem tipo novo). Valores de XP já considerando que o dono acha o upar lento aqui (cada etapa vale cerca de 20-45% de um nível no Nv 20-28, soma ~164 mil); o teto continua o da missão mais cara da campanha (38 mil, `MAX_QUEST_XP`), conferido em teste.
| Id | Giver (entrega) | Onde / objetivo | Nível | Recompensa |
|---|---|---|---|---|
| `porto_rota_livre` Rota Livre | Capitã Maré | Ruínas: 10 Cavaleiros Caídos + 10 Espectros (após Eco no Cais) | 20 | 1000 ouro, 12000 XP, 3 poções |
| `porto_cartas_de_mare` Cartas de Maré | Octávio | 2 baús nas Ruínas + guardar 1 item no banco | 21 | 1100 ouro, 14000 XP, 1 raro |
| `porto_contratos_de_vesna` Nome no Quadro | Vesna | entregar 2 contratos + 1 mini-chefe | 22 | 1300 ouro, 16000 XP, 3 poções |
| `porto_recado_da_sabia` Recado para a Sábia | Capitã (entrega na Yun, Vila) | recado: já nasce completo; só entregar (`turnIn: 'sage'`) | 22 | 600 ouro, 8000 XP, 2 poções |
| `porto_aco_na_geada` Aço na Geada | Kael | 1 duelo amistoso + 12 Lobos da Geada no Cume | 23 | 1500 ouro, 20000 XP, 1 raro |
| `porto_geada_nas_velas` Geada nas Velas | Bartolomeu | Cume: 12 Fogos-fátuos Glaciais + 12 Geleias Gélidas | 25 | 1800 ouro, 26000 XP, 3 poções |
| `porto_brasa_no_horizonte` Brasa no Horizonte | Capitã Maré | Cinzas: 12 Lobos de Brasa + 10 Espectros de Cinzas | 27 | 2200 ouro, 32000 XP, 4 poções |
| `porto_primeiro_barco` O Primeiro Barco | Capitã Maré | 1 mini-chefe (o das Cinzas) + 2 baús nas Cinzas | 28 | 3500 ouro, 36000 XP, 5 poções, 1 épico |
Conquista **Primeiro Barco** (título "Amarra do Cais") ao concluir a última. Falas novas de Capitã, Octávio, Vesna, Kael, Bartolomeu e Yun após cada etapa (`data/dialogs.js`). Retratos: nenhum novo (os NPCs já existem). Pendência: o objetivo `miniboss` aceita qualquer mini-chefe (o texto aponta o das Cinzas, mas não o exige).

Contadores novos em `stats`: `deposits`, `contracts`, `friendlyWins`, `harborVisits` (em `STAT_KEYS_PROGRESS`; o servidor limita o salto). Conquistas: **Marinheiro** (chegar ao Porto) e **Cliente do Cais** (5 contratos). Eventos que o jogo emite: `bank` (após depósito), `friendlyDuel` (vitória), `visit` (ao entrar no Porto); `daily` sai de `claimDaily`.

## Utilidades (`shop.js`)
- `harborPrice('potion'|'scroll', nível)`: −15% (`HARBOR.discount`). A UI do Mercador deve usá-lo.
- `recycle(char, [3 ids])`: 3 itens comuns da mochila viram 1 raro da classe (determinístico). Sem UI ainda (Bartolomeu, `services.recycle`).

## Servidor
Cidade neutra não tem sala: portal Planície/Ruínas→Porto faz `zone_exit { to: 'harbor', x, y }` e o servidor guarda `s.hubAt`; de lá `zone_enter` (portal leste/oeste) entra na zona vizinha. Teletransporte ao Porto (`zone_teleport`) cobra 1 pergaminho e responde com o mesmo `zone_exit`. `markVisited` grava o Porto.
