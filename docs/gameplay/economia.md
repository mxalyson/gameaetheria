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
| Baús (`forest`/`plains`/`ruins`, 4 por zona) | `rng(6…12 × nível) × tier` (tier 1 a 2) | — | 30% × tier | cliente (recarga de 10 min, limitada) |
| Missões | fixo por missão (60 a 1 200) | fixo (0 a 2 500) | até 1 item raro/épico | cliente, **objetivos de PvP/cooperativo só pelo servidor** |
| Arena real (1×1, 2×2, 4×4) | vitória `40 + nível×8` (×1,2 / ×1,6), derrota `10 + nível×2` | 12% / 4% do nível (× mesmo fator) | 35% de um item na arena offline | **servidor** |
| Cooperativo (5 ondas + chefe) | ondas × 0,5 + `4 × nível` do chefe (derrota paga 60%) | **teto de 30% de um nível** (+10% por jogador extra) | itens do chefe (rolados no servidor), 3 poções | **servidor** |
| Venda de itens | 50% do valor | — | — | cliente |

## Destinos (ralos de ouro)
| Ralo | Custo |
|---|---|
| Poção de vida | `15 + nível×3` |
| Essência de spirit (selvagem / prismática) | `250 + nível×20` / `1 500 + nível×60` |
| Itens da loja | valor × 4 (`itemMarkup`) |
| Trocar de especialização (a 1ª é grátis) | `150 + nível×25` |
| **Aprimoramento no Ferreiro** (loja): +1 a +8, +6% dos atributos base por nível, sem risco de perder o item | `60 + nível×15 × (1 + 0,25×raridade) × n^1,6` (n = próximo nível); a venda **não** devolve o ouro gasto |
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

## Leitura (honesta)
- **Ralo de fim de jogo (novo):** o Ferreiro custa ≈ 600 abates por peça até +8 em qualquer zona (≈ 3 500 para 6 peças). É um ralo **grande de propósito** (jogo de longo prazo) e **não foi testado com jogadores**: os números são ajustáveis em `core/enhance.js`. O servidor recusa item novo já aprimorado e saltos de mais de 10 níveis entre gravações (`plausible.js`); o ouro gasto **não** é conferido pelo servidor (PvE de exploração ainda é do cliente).
- **Ritmo de exploração:** 14 abates por nível no Bosque, 22 na Planície, 31 nas Ruínas. Uma essência selvagem custa ≈ 19 / 12 / 10 abates (Bosque / Planície / Ruínas): barato demais para ser um ralo forte no fim do jogo. Ralo de fim de jogo: o aprimoramento (abaixo).
- **Cooperativo (corrigido nesta fase):** antes uma vitória dava ≈ 75% de um nível de XP e ouro generoso; agora ≈ **30% de um nível** (teto), e ouro moderado (≈ 8 abates da Planície em ouro; XP menor que um nível de farm).
- **Arena:** o ouro por vitória (≈ 120 em nv 10) equivale a ≈ 4 abates da Planície; o rating é o prêmio principal.
- **Não existe ainda:** mercado entre jogadores, leilão, comércio direto (decidido: **não** implementar antes de existir telemetria — é onde duplicação e inflação nascem).
- **Risco conhecido:** o PvE de exploração (ouro/XP/loot) é calculado no cliente; os limites do servidor impedem saltos absurdos, mas **não** impedem alguém de "farmar mais rápido" dentro do teto. A correção estrutural é PvE de exploração no servidor.
