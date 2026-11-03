# 0017 — Masmorra "Cripta dos Ecos" (instância com entrada no mapa)
Data: 2026-11-03 · Status: **implementada e testada no servidor (node:test); cliente e visual NÃO validados em navegador; balanceamento medido só por simulação (ver "Critérios")**

## Decisão
Uma masmorra por instância (solo ou grupo de até 4) para conseguir um item que **não cai no mundo aberto**. Entrada num **nó do mapa-múndi** (ligado às Ruínas), não por portal físico nem por pergaminho. Nenhuma cidade ganha monstros: a masmorra é uma `ZoneRoom` própria (`server/crypt.js`, subclasse de `server/zone.js`), com mundo `World('crypt')` e layout determinístico. Reaproveita a infraestrutura de instâncias do ADR 0015 (mesmo snapshot por delta, mesmo lote de recompensas idempotente, mesma chave de sala por grupo/solo).

## Fluxo
1. **Mapa** (`ui/ui.js › cryptCard`): nó "Cripta dos Ecos" ligado às Ruínas. Travado (cadeado) até **nível 20** e **Ruínas visitadas**; mostra fragmentos, Chaves de Eco e o motivo da recusa. Botão "Entrar" → ação `crypt-enter` → `Game.enterCrypt()` grava a nuvem e envia `{ t: 'crypt_enter' }` (sem campos).
2. **Servidor** (`Hub.cryptEnter`) confere tudo no documento oficial: personagem/banco, fora de fila e de partida, **em cidade** (dentro de outra instância: `not_here`), nível, mapa visitado, instância do grupo ainda aberta (`crypt_over` se já foi vencida) e vaga (`room_full`). **Entrada = 1 grátis a cada 20 min por personagem** (`echo.entry`, hora do servidor) **ou 1 Chave de Eco** quando a espera ainda corre. Débito e carimbo vão numa operação idempotente (`crypt_entry`) antes de entrar. Cada membro do grupo paga a própria entrada e cai na mesma instância.
3. **Instância** (`CryptRoom`): corredor 5400×1000 com 4 salas separadas por muros com porta (`CRYPT_GEOM`, `game/layout.js › walls`). Salas 1–3: **2 ondas curtas** cada (a última com elites nas salas 2–3); o **portão** é do servidor: o herói não passa do muro até a sala ser limpa (`gateX`). Sala limpa: cura 35%, quem caiu volta, +fragmentos; passou pela porta, a sala seguinte começa. Sala 4: **Soberano dos Ecos** (`echolord`): golpes em área com aviso (`telegraph`, ~1,0–1,2 s), **fase 2 abaixo de 50%** (mais rápido, golpe maior e mais frequente, invoca Sombras do Eco). Sem enrage (3ª fase desligada por `p3: -1`).
4. **Quedas**: cada herói renasce na sala atual até `CRYPT.maxDeaths` (3) vezes; na 4ª queda sai da masmorra (lote gravado). Instância some quando o último herói sai.
5. **Fim**: ao cair o chefe a instância fica "vencida" (não aceita mais ninguém), grava o lote na hora e abre uma janela de `exitSec` (90 s) para sair (portal ou botão da Vila); depois todos são levados à Vila. **Saída por botão** a qualquer hora (mesmas regras de combate do botão da Vila).

## Escala e números (tudo em `data/crypt.js`)
- Nível dos monstros = nível médio do grupo preso a 20–30, +0/+1/+2 por sala, chefe +3. Por herói extra: vida ×(1+0,55) e dano ×(1+0,12) cumulativos por herói.
- Recompensa: XP e ouro normais por abate (elite ×3, chefe ×10 de XP), **sem equipamento dos comuns**; o chefe paga como qualquer chefe (ouro + 2–3 equipamentos) e ainda dá **Fragmentos de Eco**: 2–4 por sala limpa, 8–12 no chefe (por herói presente, vivo ou caído); **20% de chance (por herói)** de soltar direto um item Eco da própria classe (arma 50%, armadura 50%).
- **Fragmento de Eco**: material (`doc.echo.frags`, teto 999), só cai aqui. **Chave de Eco**: `doc.echo.keys` (teto 5), **+1 por contrato do Porto entregue** (`claimDaily`).
- **Item Eco** (`generateEchoItem`, `eco: true`): épico da classe, atributos base ×1,35 e bônus fixos (arma: crítico +5, vel. de ataque +6; armadura: vitalidade, vel. de movimento +4, roubo de vida +2). Um degrau abaixo do Ópalo. **Forja** (Ferreiro Brok, `tx craft`): `eco_weapon` 40 fragmentos + 2500 ouro; `eco_armor` 60 fragmentos + 4000 ouro; **1 de cada por personagem** (conta equipado, mochila e banco). Média de ~18 fragmentos por vitória: a arma sai em ~2–3 vitórias.
- **Missão** `cripta_dos_ecos` (Sábia Yun, nível 20, depois de "Sombras nas Ruínas"; objetivo `crypt`, só o servidor soma) e conquistas `cripta_vencida` e `cripta_veterana` (5 vitórias), contador `stats.cryptClears` (do servidor).

## Segurança (STRICT_PVE ligado)
- Fragmentos, chaves, `echo.entry`, item `eco` e `cryptClears` só mudam por: lote da sala (`applyZoneBatch`), `claimDaily` na transação do Porto, `crypt_entry` do hub e `craft`. `server/plausible.js`: save do cliente que **aumenta** fragmentos/chaves é recusado no modo estrito (`pve_echo`) e **clampado** ao valor oficial no modo não estrito; item `eco` novo vindo do cliente é `eco_forged`; `eco` de item existente não muda; save importado perde itens Eco e zera `echo`.
- `crypt_enter`/`craft` entram no protocolo com lista branca (sem campos extras). A zona `crypt` não tem `mobs`/`boss`/`hub`: `zone_enter`, `zone_teleport` e qualquer portal a recusam (`bad_message`).
- O portão e as quedas são do servidor; o cliente prevê o próprio movimento e leva um empurrão de volta se tentar passar do muro (ver "Provisório").

## Critérios de aceitação (mensuráveis)
| Critério | Meta | Estado |
|---|---|---|
| Fluxo completo (entrada → 3 salas → chefe → fragmentos → saída) e recusas (`crypt_level`, `crypt_locked`, `crypt_wait`, `crypt_over`) | passa em teste de servidor | **testado** (`tests/zone.test.js`) |
| Layout determinístico, portas livres, chegada/chefe/saída livres | igual em 2 cargas do módulo | **testado** (`tests/layout.test.js`) |
| Forja valida fragmentos/ouro/nível/mochila/duplicata e não aceita item Eco forjado | testes de `runTx` e `checkSave` | **testado** (`tests/tx.test.js`) |
| Missão só do servidor, conquistas, Chave por contrato | testes de journal | **testado** (`tests/journal.test.js`) |
| Duração de uma vitória solo (nível 25, equipamento bom) | 8–14 min | **pendente: medir com jogador** |
| Tempo para matar o Soberano (solo, perfil `good`) | 90–160 s | **simulado**: 98–99 s (Nv 22–25), 81 s (Nv 30) |
| Poções na luta do chefe (solo, `good`) | 1–3 | **simulado**: 1,4–1,9 (Nv 22–25) |

## Simulação (`tools/boss-check.mjs` › `bossRow('echolord', nívelDoChefe, nívelDoHerói, perfil)`, 4 classes × 4 sementes, esquiva 60%; só a luta do chefe, sem o desgaste das 3 salas)
Chefe ajustado de vida ×13/dano ×2,4 (fácil demais: `good` vencia 100% em 63 s com 0,9 poção) para **vida ×20, dano ×2,6**. Resultado final:

| Herói (equipamento) | Chefe | Vitória | Tempo p/ matar (mediana) | Poções usadas |
|---|---|---|---|---|
| Nv 22 `normal` (incomum/raro, ferreiro leve) | Nv 25 | 0% | derrota em ~67 s | 3,3 |
| Nv 22 `good` (épicos aprimorados, spirit raro evoluído) | Nv 25 | 94% | 98 s | 1,9 |
| Nv 22 `best` (lendários +8) | Nv 25 | 100% | 74 s | 0,8 |
| Nv 25 `normal` | Nv 28 | 0% | derrota em ~80 s | 3,5 |
| Nv 25 `good` | Nv 28 | 100% | 99 s | 1,4 |
| Nv 25 `best` | Nv 28 | 100% | 81 s | 0,5 |
| Nv 30 `normal` | Nv 30 | 13% | 126 s | 4,2 |
| Nv 30 `good` | Nv 30 | 100% | 81 s | 0,2 |

Leitura honesta: a masmorra pede **equipamento épico aprimorado (ou grupo)**; com equipamento comum/raro o chefe sozinho não cai (por isso as salas dão ouro/XP e o item Eco ajuda a fechar a lacuna). Meta de TTK 90–160 s: **cumprida só para `good` (~100 s)**; `best` mata em 70–80 s. As 3 salas ainda NÃO foram simuladas com robô (o teste de servidor só confere o fluxo): a duração total de 8–14 min é **estimativa, não medida**.

## Provisório / pendente
- **Chefe com arte provisória**: o Soberano dos Ecos usa o sprite do Guardião das Ruínas recolorido (`art: 'guardian'` + `tint`), e as criaturas usam espectro, cavaleiro e gárgula recoloridos. Prompts do chefe novo em `docs/roadmap/depende-do-dono.md` (A8). Nada é forma desenhada por código.
- **Ícone do nó** do mapa: emoji (🕯️) até haver `assets/icons/ui/zone-crypt.webp`; itens Eco usam o ícone do tipo e o nome (sem arte própria nem variação visual: "a variação visual vem depois").
- **Cenário**: muros com colunas/braseiros existentes e paleta própria; chão sem textura de masmorra. **Não olhado em navegador** nesta rodada.
- **Cliente**: sem previsão local do portão (o servidor empurra de volta); sem barra de chefe própria (a faixa de estado reaproveita o espaço do "Ritual"); sem teste e2e em navegador.
- Sem reconexão especial: quem cai da rede volta à instância dentro do prazo normal (30 s); passado isso sai (lote gravado).
- Sair no meio e voltar: se não restar ninguém na instância ela fecha e o progresso das salas se perde (a entrada já foi gasta).
- Segunda masmorra / dificuldades / ranking de tempo: fora do escopo.
