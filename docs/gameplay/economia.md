# Economia de Aetheria — fontes e destinos (P8)
Atualizado em 2026-10-31. Os números abaixo saem de `npm run economy` (`tools/economy.mjs`), que simula as **regras reais do código** (4 000 abates por zona com o RNG do jogo). **É análise de regras, não telemetria de jogadores**: o ritmo real depende de como as pessoas jogam.

## Princípios
1. **Ouro e itens só entram por fontes conhecidas** (abaixo) e **saem por ralos conhecidos**. Nenhuma recompensa nova entra sem ser colocada nesta tabela.
2. **Sem pay-to-win**: não existe moeda real, loja de dinheiro real nem vantagem de combate à venda.
3. O que o servidor já decide (arena real, cooperativo) usa **tetos** em `core/economy.js`; o PvE de exploração (calculado no cliente) é limitado por plausibilidade (`server/plausible.js`).

## Fontes
| Fonte | Ouro | XP | Itens | Quem decide |
|---|---|---|---|---|
| Abates na exploração | `rng(nível×2+1 … nível×4+3)` × (chefe ×8, elite ×3) | `(12 + nível×6) × fator` | 14% (elite 60%, chefe 100%) | cliente (com limites) |
| Baús (5 por zona + acampamentos, tier 1 a 3,8) | `rng(6…12 × nível) × tier` | — | `min(80%; 15% × tier)`, sorte `0,25 × tier` (G1: ≈ 1–3 épico+/h varrendo as zonas; era 6–18/h) | cliente (recarga de 10 min, limitada) |
| Missões | fixo por missão (60 a 1 200) | fixo (0 a 2 500) | até 1 item raro/épico | cliente, **objetivos de PvP/cooperativo só pelo servidor** |
| Arena real (1×1, 2×2, 4×4) | vitória `40 + nível×8` (×1,2 / ×1,6), derrota `10 + nível×2` | 6% / 2% do nível (× mesmo fator); sem teto por hora (decisão do dono); 0 se o mesmo adversário aparece pela 3ª vez seguida em 30 min (G3; era 12% / 4%) | 35% de um item na arena offline | **servidor** |
| Cooperativo (5 ondas + chefe) | ondas × 0,5 + `4 × nível` do chefe (derrota paga 60%) | **teto de 30% de um nível** (+10% por jogador extra) | itens do chefe (rolados no servidor), 3 poções | **servidor** |
| Venda de itens | 50% do valor na Vila (`sellValue` em `shop.js`); 60% na loja do Porto (`harborSellValue`) | — | — | cliente |

## Destinos (ralos de ouro)
| Ralo | Custo |
|---|---|
| Poção de vida | `15 + nível×3` |
| Essência de spirit (selvagem / prismática) | `250 + nível×20` / `1 500 + nível×60` |
| Itens da loja (até raro) | valor × 6 (`itemMarkup`, G2; era × 4); 1 épico de destaque por nível a valor × 25 (`featuredMarkup`); estoque determinístico por (personagem, nível, criação): recarregar a página não o refaz; item comprado sai do estoque |
| Trocar de especialização (a 1ª é grátis) | `150 + nível×25` |
| **Aprimoramento no Ferreiro** (loja): +1 a +8, +8% dos atributos base por nível, sem risco de perder o item | `60 + nível×15 × (1 + 0,25×raridade) × n^1,6` (n = próximo nível), ×0,6 nos passos +6..+8 (G10; 6 lendários +8: 543 mil → ≈ 396 mil de ouro); a venda **não** devolve o ouro gasto |
| Morte no PvE | −10% do ouro |
| Itens extras com a mochila cheia | viram ouro (nada some, mas a mochila é o limite: 30) |

## Números (regras reais, `npm run economy`)
```
FONTES — exploração (por abate, jogador no nível médio da zona; itens vendidos pela metade do valor)
  forest   nv  4 · ouro   15.1 · XP   36.4 · itens 0.159 ·   14 abates por nível ≈ 239 ouro por nível
  plains   nv  9 · ouro   31.7 · XP   84.0 · itens 0.156 ·   22 abates por nível ≈ 753 ouro por nível
  ruins    nv 16 · ouro   54.0 · XP  143.0 · itens 0.162 ·   31 abates por nível ≈ 1834 ouro por nível

FONTES — cooperativo (vitória, 1 e 4 jogadores) e PvP
  coop nv  8 × 1 jogador(es): ouro 190 · XP 452 (30% de um nível) · poções 3
  coop nv  8 × 4 jogador(es): ouro 190 · XP 587 (39% de um nível) · poções 3
  coop nv 12 × 1 jogador(es): ouro 266 · XP 847 (30% de um nível) · poções 3
  coop nv 12 × 4 jogador(es): ouro 266 · XP 1101 (39% de um nível) · poções 3
  coop nv 20 × 1 jogador(es): ouro 418 · XP 1870 (30% de um nível) · poções 3
  coop nv 20 × 4 jogador(es): ouro 418 · XP 1931 (31% de um nível) · poções 3
  PvP 1×1 nv 10: vitória 120 ouro, derrota 30; XP 255 / 85
  PvP 1×1 nv 20: vitória 200 ouro, derrota 50; XP 748 / 249

DESTINOS (ralos de ouro)
  nv  5: poção 30 · essência 350 · prismática 1800 · item na loja ≈ 140 (raro) · trocar de especialização 275 · morte no PvE: -10% do ouro
  nv 15: poção 60 · essência 550 · prismática 2400 · item na loja ≈ 344 (raro) · trocar de especialização 525 · morte no PvE: -10% do ouro
  nv 25: poção 90 · essência 750 · prismática 3000 · item na loja ≈ 548 (raro) · trocar de especialização 775 · morte no PvE: -10% do ouro
  Ouro necessário para 1 essência ≈ abates: forest: 19 · plains: 12 · ruins: 10

Nível máximo 30. Itens: só entram por abates, chefes, baús, missões, cooperativo e prêmios de arena; saem por venda (50% do valor), conversão (inventário cheio).
```

```
APRIMORAMENTO (ferreiro): ouro por item vestido, +0 → +8, e quantos abates isso equivale
  forest (item raro nv 4): 1º nível 150 · tudo até +8 9488 ouro ≈ 560 abates · 6 peças ≈ 3361 abates
  plains (item raro nv 9): 1º nível 263 · tudo até +8 20748 ouro ≈ 593 abates · 6 peças ≈ 3555 abates
  ruins (item raro nv 16): 1º nível 420 · tudo até +8 36513 ouro ≈ 614 abates · 6 peças ≈ 3684 abates
```

## Rodada de balanceamento (G1–G13, 2026-11-02)
- Baús (`tools/chest-check.mjs`, 48 baús/h): épico+/h Bosque 6,3→0,9, Planície 8,3→1,3, Ruínas 10,9→1,6, Cume 13,9→2,0, Cinzas 18,5→2,8; lendário/h Cinzas 6,0→0,5.
- Loja: raro custa valor×6 (≈ 210 / 516 / 822 ouro no nv 5/15/25, era 140 / 344 / 548); o épico de destaque custa valor×25 (nv 20 ≈ 3,7 mil ouro ≈ 9 min de renda). Sem lendário na loja.
- Venda: Vila de Lúmen 50% do valor (`sellValue`, `PRICES.sellRate` em `shop.js`); loja do Porto de Marfim 60% (`harborSellValue`, `HARBOR.sellRate`). A UI mostra o preço real via `game.sellPrice(it)` (escolhe a loja pela âncora aberta) e a venda em lote soma o mesmo valor. Conferido no código em 2026-11-03: o código já paga 50%/60% (a nota antiga de "100%" estava obsoleta).
- PvP (`npm run economy`): XP/h nv 20 de 71 149 → 22 231 com o teto por hora (≈ 0,5 nível/h contra 1,6); o teto por hora foi REMOVIDO por decisão do dono (2026-11-02), então hoje vale a % de 6%/2% sem teto (conferir com `npm run economy`). Contadores nas chaves `pvpFoe`, `pvpFoeN`, `pvpFoeMin` de `stats` (todas em `SERVER_STATS`; minutos, não ms, para caber no limite de 1e8 do savedoc). O servidor deve passar `foeId` (e opcionalmente `now`) a `applyMatchResult`; sem `foeId` vale só a %. Só o último adversário é lembrado (alternar entre dois adversários escapa do limite de repetição; sem teto por hora, nada mais cobre isso).
- Ferreiro: 6 lendários nv 30 +8 de 543 mil → 396 mil de ouro (carreira ≈ 440 mil). Opalino: +10–12% → +29–31% de pontuação sobre o lendário comum (`tools/opal-check.mjs`).

## Leitura (honesta)
- **Ralo de fim de jogo (novo):** o Ferreiro custa ≈ 600 abates por peça até +8 em qualquer zona (≈ 3 500 para 6 peças). É um ralo **grande de propósito** (jogo de longo prazo) e **não foi testado com jogadores**: os números são ajustáveis em `core/enhance.js`. O servidor recusa item novo já aprimorado e saltos de mais de 10 níveis entre gravações (`plausible.js`); o ouro gasto **não** é conferido pelo servidor (PvE de exploração ainda é do cliente).
- **Ritmo de exploração:** 14 abates por nível no Bosque, 22 na Planície, 31 nas Ruínas. Uma essência selvagem custa ≈ 19 / 12 / 10 abates (Bosque / Planície / Ruínas): barato demais para ser um ralo forte no fim do jogo. Ralo de fim de jogo: o aprimoramento (abaixo).
- **Cooperativo (corrigido nesta fase):** antes uma vitória dava ≈ 75% de um nível de XP e ouro generoso; agora ≈ **30% de um nível** (teto), e ouro moderado (≈ 8 abates da Planície em ouro; XP menor que um nível de farm).
- **Arena:** o ouro por vitória (≈ 120 em nv 10) equivale a ≈ 4 abates da Planície; o rating é o prêmio principal.
- **Não existe ainda:** mercado entre jogadores, leilão, comércio direto (decidido: **não** implementar antes de existir telemetria — é onde duplicação e inflação nascem).
- **Risco conhecido:** o PvE de exploração (ouro/XP/loot) é calculado no cliente; os limites do servidor impedem saltos absurdos, mas **não** impedem alguém de "farmar mais rápido" dentro do teto. A correção estrutural é PvE de exploração no servidor.

## Atualização 2026-11-04 (pedido do dono)
- **Arena não dá XP.** `PVP_XP` = 0 (vitória e derrota): a arena paga rating, ouro e prêmio; a Arena das Ondas offline não paga XP por abate (só `mode === 'explore'`). As seções de XP de PvP acima ficam como histórico. O cooperativo (servidor) segue pagando XP (≤ 30% do nível) — não alterado.
- **Barra de XP mantida** (150·n^1,9: nível 20 = 44,5k; 29 = 90k, pedido do dono). Para o farm do 20+ não ser penoso, o XP por abate sobe com o nível do mob: `mobXpRamp` = 1 + 0,28 por nível acima do 15 (nível 20 ×2,4; 25 ×3,8; 29 ×4,9). Abates por nível: nível 20 ≈ 140, 25 ≈ 110, 29 ≈ 100 (antes ~350). `server/plausible.js` usa o mesmo fator no orçamento de XP por abate.
