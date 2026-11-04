# Dificuldade, chefes, habilidades por nível e loot

Números medidos em 2026-11-02 com `node tools/boss-check.mjs --n 4` (simulação real: World + IA, passo fixo 1/60 s, sementes fixas, 4 classes × 4 sementes por célula, robô que usa skills, bebe poção abaixo de 45% de vida e esquiva 60% dos golpes telegrafados), `node tools/loot-check.mjs`, `node tools/waves-check.mjs --n 4` e `npm run balance`. Reproduzíveis.

## Perfis de equipamento do simulador
- normal: itens incomuns/raros do nível, aprimoramento +floor(nível/7), 5 poções, sem spirit.
- good: épicos, +min(8, floor(nível/4)), 8 poções, spirit raro evoluído.
- best: lendários +8, 10 poções, spirit lendário evoluído.

## Curva (data/mobs.js, aplicada em makeMobActor)
- Vida base `60 + 120·L^1.15`; poder `6 + 4.2·L^1.42`; defesa `3.4·L`; multiplicadores por mob/chefe sobre isso.
- Mobs comuns: vida ×1.15 e poder ×3.1 (só têm ataque básico). Elite: vida ×3.2, poder ×1.4, defesa ×1.15.
- Diferença de nível (LEVEL_GAP): acima de 2 níveis de diferença, o herói causa -7%/nível (mín. 35%) e leva +5%/nível (máx. ×1.5) contra mobs.
- Chefes: fases (<60% mais rápido/forte: vel ×1.15, ataque ×1.25; <30% fúria: vel ×1.3, ataque ×1.5, dano ×1.2), golpe em área telegrafado maior e mais frequente (raio 125/150/175, recarga 5/3.8/2.6 s; na fúria cai um segundo golpe ao lado). Cavaleiro Rubro invoca até 4 Geleias de Magma (a cada 14 s, da fase 2 em diante); somem com o chefe e não dão XP/loot.
- Elites usam o golpe em área só a partir da Planície; mobs comuns nunca.

## Chefes: vitória% (tempo mediano de vitória; xNN = tempo mediano até morrer)

    Carvalho Ancestral (treant, Nv 7)
      normal  Nv5:  44% 50s       Nv7:  69% 36s       Nv10: 100% 23s      Nv15: 100% 13s      Nv19: 100% 10s      Nv25: 100% 8s       Nv30: 100% 6s
      good    Nv5:  88% 33s       Nv7: 100% 25s       Nv10: 100% 16s      Nv15: 100% 10s      Nv19: 100% 7s       Nv25: 100% 5s       Nv30: 100% 4s
      best    Nv5: 100% 20s       Nv7: 100% 15s       Nv10: 100% 10s      Nv15: 100% 6s       Nv19: 100% 5s       Nv25: 100% 3s       Nv30: 100% 2s

    Colosso de Cristal (colossus, Nv 13)
      normal  Nv5:   0% x25s      Nv10:   0% x52s     Nv13:  13% 70s      Nv15:  63% 47s      Nv19: 100% 33s      Nv25: 100% 24s      Nv30: 100% 19s
      good    Nv5:   0% x88s      Nv10:  50% 53s      Nv13: 100% 35s      Nv15: 100% 29s      Nv19: 100% 21s      Nv25: 100% 15s      Nv30: 100% 12s
      best    Nv5:   0% x84s      Nv10: 100% 32s      Nv13: 100% 22s      Nv15: 100% 19s      Nv19: 100% 14s      Nv25: 100% 11s      Nv30: 100% 9s

    Guardião das Ruínas (guardian, Nv 21)
      normal  Nv5:   0% x5s       Nv10:   0% x15s     Nv15:   0% x53s     Nv19:   0% x49s     Nv21:   0% x44s     Nv25:  50% 50s      Nv30:  94% 36s
      good    Nv5:   0% x6s       Nv10:   0% x30s     Nv15:   6% 77s      Nv19:  88% 41s      Nv21: 100% 34s      Nv25: 100% 26s      Nv30: 100% 23s
      best    Nv5:   0% x15s      Nv10:   0% x101s    Nv15:  94% 48s      Nv19: 100% 26s      Nv21: 100% 23s      Nv25: 100% 21s      Nv30: 100% 17s

    Ancião Gélido (frostlord, Nv 26)
      normal  Nv5:   0% x5s       Nv10:   0% x5s      Nv15:   0% x25s     Nv19:   0% x44s     Nv25:   6% 55s      Nv26:  13% 67s      Nv30:  44% 42s
      good    Nv5:   0% x6s       Nv10:   0% x10s     Nv15:   0% x26s     Nv19:  19% 70s      Nv25: 100% 31s      Nv26: 100% 30s      Nv30: 100% 25s
      best    Nv5:   0% x10s      Nv10:   0% x79s     Nv15:  13% 139s     Nv19:  88% 47s      Nv25: 100% 23s      Nv26: 100% 23s      Nv30: 100% 20s

    Cavaleiro Rubro (infernoknight, Nv 31)
      normal  Nv5:   0% x5s       Nv10:   0% x5s      Nv15:   0% x5s      Nv19:   0% x6s      Nv25:   0% x55s     Nv30:   0% x76s
      good    Nv5:   0% x5s       Nv10:   0% x5s      Nv15:   0% x10s     Nv19:   0% x15s     Nv25:   0% x105s    Nv30:  56% 84s
      best    Nv5:   0% x5s       Nv10:   0% x15s     Nv15:   0% x141s    Nv19:   0% x156s    Nv25:  13% 125s     Nv30:  81% 69s

Leitura: herói normal com nível ≤ chefe−8 perde sempre; good no nível do chefe vence em 25–40 s (Treant/Colosso/Guardião/Ancião) com poções; o Cavaleiro Rubro (Nv 31) exige nível 30 + épico/lendário aprimorado (good Nv 30 ≈ 56%, best Nv 30 ≈ 81%; Nv 25 good 0%, best 13%; Nv ≤ 19 nunca). O Carvalho ficou mais fácil para o herói normal Nv 5–7 (44% / 69%; era 0% / 38%) porque o bônus de iniciante agora some mais devagar (ver "Rampa de iniciante").

## Mobs comuns (herói normal do mesmo nível, sem poção)
Medido pelo mesmo comando (`node tools/boss-check.mjs --only mobs`, 2026-11-03: perda média de vida, tempo, derrotas):

    MOBS COMUNS — herói normal do MESMO nível contra 1/2/3 mobs da zona: vida média perdida (%) e tempo para vencer; "L" = derrota
    forest   Nv4 x1: perde   3% da vida · 3s · derrotas 0%
    forest   Nv4 x2: perde   6% da vida · 4s · derrotas 0%
    forest   Nv4 x3: perde  11% da vida · 6s · derrotas 0%
    plains   Nv9 x1: perde  14% da vida · 4s · derrotas 0%
    plains   Nv9 x2: perde  21% da vida · 7s · derrotas 4%
    plains   Nv9 x3: perde  29% da vida · 10s · derrotas 15%
    ruins    Nv16 x1: perde  17% da vida · 6s · derrotas 0%
    ruins    Nv16 x2: perde  16% da vida · 9s · derrotas 10%
    ruins    Nv16 x3: perde  21% da vida · 12s · derrotas 27%
    glacier  Nv23 x1: perde  10% da vida · 5s · derrotas 0%
    glacier  Nv23 x2: perde  15% da vida · 8s · derrotas 10%
    glacier  Nv23 x3: perde  14% da vida · 11s · derrotas 17%
    ember    Nv28 x1: perde  15% da vida · 6s · derrotas 2%
    ember    Nv28 x2: perde  23% da vida · 11s · derrotas 13%

Resumo (2026-11-03): 1 mob custa 3–17% da vida (Bosque 3%, o resto 10–17%); 2 mobs 6–23%; 3 mobs 11–29% com 0–31% de derrotas (Cinzas Nv 28 x3: 31%, Ruínas Nv 16 x3: 27%).

## Habilidades por nível
Ataque básico no 1; s0 no 1, s1 no 5, s2 no 10 (`SKILL_UNLOCK` em data/skills.js; `core/unlocks.js`). `World.castSkill` ignora intenções de skill bloqueada (jogador, servidor e rival). O PvP abre no nível 10 (`PVP_MIN_LEVEL`), exatamente quando a terceira habilidade é liberada: toda partida usa as 3 (teste "G10" em tests/core.test.js; `npm run balance` roda no nível 10 com as 3).

## Aparição do último chefe e reaparição
Não reaparece por tempo. Contador "Ritual" (`world.bossProgress` = `{have, need, cool, omen, alive}`): mob comum vale 1, elite 4; ao chegar em 40 o chefe surge após 3 s de aviso. Depois da metade, cada elite tem chance crescente (6% × nº de elites, máx. 50%) de adiantar. Ao morrer: **recarga de 1200 s** (tempo absoluto: corre mesmo fora da zona) e contador zerado. A missão `cavaleiro_rubro` ativa libera uma primeira aparição. Configurável em `BOSS_SPAWN` (data/mobs.js).

**Chefes de zona** reaparecem 420 s (Carvalho), 540 s (Colosso), 720 s (Guardião) e 900 s (Ancião) depois de morrer, mesmo recriando o mundo. Abates repetidos na janela de 30 min dão metade e depois um quarto da chance de item (`BOSS_REPEAT`). Acampamentos voltam 300 s depois do último morto (`CAMP_RESPAWN`; era 150 s); mini-chefes (elite maior) a cada 600 s (`miniboss.respawn` em data/zones.js). Eventos: `boss_warn {stage: 'omen'|'arrive', name, x, y}`, `phase {actor, phase}` (fase 3 = "Enfurecido!").

## Rampa de iniciante (2026-11-02)
Dois mecanismos; ambos somem até o nível 10 para não tocar nos duelos:
- Herói: `ROOKIE` em core/stats.js, +360 vida e +12 poder no nível 1, caindo linearmente até 0 no nível 10. Clérigo: `rookie: 3` em data/classes.js (multiplica os dois; ataque lento e sem escudo antes do nível 5). Antes: +240 / +36 até o nível 9, sem reforço do Clérigo.
- Mob não-chefe: poder × (0,95 + 0,01·(nível−1)) (`MOB_CURVE.early`; era 0,6 + 0,08·(nível−1)) e vida sem corte (`earlyHp` era 0,8 + 0,05·(nível−1)).

Perda média de vida contra 1 mob do Bosque do mesmo nível (lobo/geleia/cogumelo), 4 classes, sem poção; entre colchetes guerreiro/mago/arqueiro/clérigo:

    Nível   kit ANTES              kit DEPOIS             incomum ANTES   incomum DEPOIS
    1        0% [1/0/0/0]           1% [1/0/0/1]           0%              0% [1/0/0/0]
    2        1% [2/0/0/2]           3% [6/1/1/4]           1%              1% [2/0/0/2]
    3        4% [6/1/1/9]           7% [13/1/2/11]         1%              2% [4/0/0/4]
    4       11% [16/2/2/23]        12% [21/2/5/20]         4% [5/0/1/8]    4% [8/0/1/8]
    5       10% [16/2/2/21]         9% [20/3/3/11]         2%              2% [5/1/0/0]
    6       17% [27/3/4/35]        15% [27/5/4/24]         3%              3% [7/1/0/2]

Vitória% contra 2 lobos do mesmo nível, kit inicial, sem poção (`node tools/boss-check.mjs --only early`, 20 sementes):

    Nível        Guerreiro   Mago   Arqueiro   Clérigo
    4 ANTES        100       100       93        43
    4 DEPOIS        75        95       90       100
    5 ANTES         65       100       95         0
    5 DEPOIS        70        95      100        95

1 lobo: 100% em todas as células (meta ≥ 80%). 2 lobos ≥ 60% até o nível 5 em todas as classes; o Guerreiro cai a 38% no nível 6 sem equipamento (a meta vai só até o 5). Limite da medição: o robô mantém Mago e Arqueiro à distância e eles quase não perdem vida, então a média das 4 classes fica abaixo do alvo de 8–14% (kit) e 5–9% (incomum); só Guerreiro e Clérigo chegam perto (kit 11–29%, incomum 5–8% nos níveis 4–6). O Guerreiro iniciante ficou um pouco mais fraco (menos poder de iniciante), o Clérigo bem mais forte; Mago e Arqueiro só mudam pela rampa dos mobs.

## Loot
Pesos por fonte [comum, incomum, raro, épico, lendário] (core/loot.js `LOOT_SOURCES`): mob 67/26/6.4/0.55/0.05 (14% de chance de item), elite 34/40/21.5/4/0.5 (70%, 1–2 itens), chefe 0/20/50/26/4 (2–3 itens). Surpresa: 1,5% de subir 1–2 raridades. Pity (`char.pity`): peso de épico +1,5% por item sem épico (garantido em 120 itens), lendário +0,4% por item (garantido em 600). Atributo base varia ±15%.

Medido agora com `node tools/loot-check.mjs`:


    SEM pity (servidor atual): 10000 abates (684 elites), 1952 itens
      common      1093  55.99% dos itens
      uncommon     586  30.02% dos itens
      rare         235  12.04% dos itens
      epic          33  1.69% dos itens
      legendary      5  0.26% dos itens
      por hora (300 abates/h): 0.99 épico · 0.15 lendário · maior seca sem épico+: 187 itens

    COM pity (jogo offline): 10000 abates (676 elites), 1972 itens
      common      1090  55.27% dos itens
      uncommon     579  29.36% dos itens
      rare         249  12.63% dos itens
      epic          47  2.38% dos itens
      legendary      7  0.35% dos itens
      por hora (300 abates/h): 1.41 épico · 0.21 lendário · maior seca sem épico+: 106 itens

    Cavaleiro Rubro: 1239 exclusivos em 2000 abates (1 a cada 1.61), pior seca 2 abates

(Premissa: 300 abates/h. O servidor de zona ainda não passa `pity` a `rollMobLoot`: sem pity lá, ~1 épico/h.)

XP por hora de exploração (`node tools/economy.mjs`, 300 abates/h, jogador no nível médio da zona): Bosque Nv 4 ≈ 5,3 níveis/h (57 abates por nível); Planície Nv 9 ≈ 2,6; Ruínas Nv 16 ≈ 1,5; Geleira Nv 23 ≈ 0,9; Cinzas Nv 28 ≈ 0,8. PvP 1×1 ≈ 0,5 nível/h; coop 8–12% de um nível por partida (~4 min).

## Exclusivo do Cavaleiro Rubro
Espada/Cajado/Arco/Maça Opalina (60%, da classe do jogador) ou Couraça de Ópalo (40%); 75% épico / 25% lendário (nome "Radiante"); atributos base ×1.3 mais crítico+vel. de ataque (arma) ou VIT+vel. de movimento (armadura); `opal: true`. Chance por abate 30% +20% por abate sem drop (garantido no 5º); sem pity (servidor) 35%. Ícone: o do tipo do item (sem arte própria; ver pendencias.md).

## Arena das Ondas (solo) e cooperativo
Medido com `node tools/waves-check.mjs --n 4` (World + IA reais, robô de `boss-check`, herói perfil normal, 4 classes; coop com classes mistas, 16 execuções por célula). Composição das ondas em `core/economy.js` (`WAVES`, `soloWaveSpec`, `coopWaveSpec`, `waveBoss`), usada por `main.js`, `server/coop.js` e pelo simulador (`--tune '{"coop":{...}}'` experimenta valores sem editar código).

Medido agora (`node tools/waves-check.mjs --n 4`):

    SOLO — ondas vencidas (mediana [mín–máx]) até cair (teto 25), perfil normal; 16 execuções por célula
      Nv5   mediana 8 [5–9]  (war 6, mag 9, arc 9, cle 8)
      Nv10  mediana 7 [4–9]  (war 6, mag 9, arc 9, cle 6)
      Nv15  mediana 6 [3–9]  (war 5, mag 9, arc 9, cle 6)
      Nv20  mediana 7 [2–9]  (war 4, mag 9, arc 9, cle 6)
      Nv30  mediana 9 [3–19]  (war 6, mag 11, arc 9, cle 6)

    COOP — vitória% (5 ondas + chefe) e ondas médias vencidas; grupos de classes mistas, perfil normal; 16 execuções por célula
      Nv5   1j:  63% (ondas 4.6)   2j: 100% (ondas 5.0)   4j: 100% (ondas 5.0)
      Nv10  1j:  13% (ondas 4.1)   2j:  38% (ondas 4.4)   4j:  94% (ondas 4.9)
      Nv15  1j:   0% (ondas 3.9)   2j:  44% (ondas 4.4)   4j: 100% (ondas 5.0)
      Nv20  1j:  19% (ondas 4.0)   2j:  38% (ondas 4.4)   4j:  94% (ondas 4.9)
      Nv30  1j:   0% (ondas 3.9)   2j:  56% (ondas 4.6)   4j:  94% (ondas 4.9)

Composição: mobs = 1 + floor(0.3·n), +1 nível a cada 3 ondas, elite a cada 5 ondas 3 níveis abaixo, cura de 50% entre ondas, chefe pela faixa de nível (nunca o Rubro). Coop: 5 ondas + chefe, +1 mob por jogador extra, vida dos mobs +35% por jogador extra, elite só com 3+ jogadores, 1 jogador enfrenta o chefe da faixa anterior. Antes da recalibragem (2+n mobs juntos, +20% de vida entre ondas, chefe sorteado inclusive o Rubro): solo mediana 1–3 ondas; coop 0% quase sempre.
- Recompensas (`COOP`): XP bruto da vitória vem das ondas reais (`estimatePoolXp`) + 6% do nível pelo chefe: ≈ 12% de um nível no Nv8, 10% no Nv12, 8% no Nv20 (≈ 4 min por partida); ouro 266 no Nv12.
- Pendência: melhorar o robô corpo a corpo (ai.js) ou o Guerreiro/Clérigo contra grupos mistos; o Nv20+ solo sem equipamento melhor que "normal" não derruba o chefe da onda 10.

## Duelos (npm run balance, equipamento incomum, 30 duelos por par; meta 45–55% e 20–40 s)
Nível 10:
    mage            37%        -      20%      77%
    archer          40%      80%        -      50%
    cleric          67%      27%      70%        -
    warrior    52% · 14 s
    mage       44% · 29 s  <- fora da meta
    archer     57% · 29 s  <- fora da meta
    cleric     54% · 23 s
Nível 20:
    mage            57%        -       0%      80%
    archer          30%      83%        -      23%
    cleric          73%      30%      67%        -
    warrior    50% · 16 s
    mage       46% · 36 s
    archer     46% · 30 s
    cleric     57% · 27 s  <- fora da meta
Nível 30:
    mage            50%        -       7%      60%
    archer          27%      80%        -      38%
    cleric          77%      50%      73%        -
    warrior    43% · 20 s  <- fora da meta
    mage       39% · 40 s  <- fora da meta
    archer     48% · 35 s
    cleric     67% · 34 s  <- fora da meta

Não mudou nesta rodada (o bônus de iniciante é 0 no nível 10). Fora da meta, pendente: Nv10 Mago 44% / Arqueiro 57%; Nv20 Clérigo 57%; Nv30 Guerreiro 43%, Mago 39% (40 s), Clérigo 67%.

## Rodada G4/G9 (2026-11-02)
- Vida do Guardião das Ruínas 12→9 e do Ancião Gélido 11→8,5 (`data/mobs.js`); missões `guardiao_das_ruinas` Nv 16→22 e `anciao_gelido` Nv 22→27.
- Medido com `node tools/boss-check.mjs --n 4 --only boss`: Guardião, good no Nv 21: 100% em 47→36 s; best 34→24 s; normal Nv ≤15 segue 0%. Ancião, good no Nv 26: 100% em 40→31 s; best 30→23 s; normal Nv ≤19 segue 0%. Cavaleiro Rubro inalterado (good Nv 30: 44% em 95 s; best Nv 30: 81%).
- Item opalino: atributos ×1,5 (era ×1,3) e roubo de vida (+4% arma, +3% armadura): pontuação +29–31% sobre o lendário comum (era +10–12%).
- Baús: chance de item `min(0,8; 0,15×tier)` e sorte `0,25×tier` (ver `economia.md`).


## Exploits avaliados (2026-11-02)
- Acampamentos: uma elite (70% de item, 4% de épico) + grupo a cada 150 s rendia ~24 elites/h por acampamento, perto de 1,3 épico/h parado num ponto (o farm normal rende ~1/h). Corrigido: `CAMP_RESPAWN = 300` em data/mobs.js (teste "G10" em tests/core.test.js). Os baús dos acampamentos já têm recarga própria (`CHEST_COOLDOWN_MS`).
- Mini-chefe (elite com 4–5× de vida, `zones.js › miniboss.respawn`, era 240 s): ~15 elites/h só dele, ≈ 0,9 épico/h. Corrigido: `respawn = 600` em todas as zonas.
- O Alfa da Matilha do Bosque está em nível 8 numa zona 1–6 (LEVEL_GAP o torna intratável abaixo do nível 6, o que protege o iniciante).

## Rodada de duelos (2026-11-03, `npm run balance -- --level N --n 100`)
Ajustes em dados: Arqueiro (ataque básico 0,7 → 0,6; Tiro Perfurante 2,3 → 2,0; Chuva 0,55 → 0,5; crescimento de Agilidade 1,6 → 1,9; Tempestade de Flechas 1,0 → 2,0 por rajada), Mago (HP base 110 → 150; Inteligência base 10 → 12; crescimento de Int 2,65 → 3,2; Piromante 3,3 → 3,0; Meteoro 12 → 19), Clérigo (crescimento Int 3,4 → 3,5 e Vit 2,8 → 2,7; alcance do ataque 68 → 76; Guardião: Luz Sagrada com dano 1,5; Intervenção cura 55% → 40%), Guerreiro (crescimento de Força 3,0 → 2,9).

| Nível | Guerreiro | Mago | Arqueiro | Clérigo |
|---|---|---|---|---|
| 10 antes | 48% | 37% | 63% | 45% |
| 10 depois | 47% | 53% | 47% | 45% |
| 20 antes | 54% | 48% | 61% | 33% |
| 20 depois | 46% | 53% | 48% | 45% (40–45% conforme a semente) |
| 30 com Maestria antes | 50% | 37% | 49% | 49% |
| 30 com Maestria depois | 50% | 46% | 47% | 51% |

Duelos de 14 a 28 s (abaixo de 20 s só o Guerreiro e o Arqueiro com Maestria). Início (`node tools/boss-check.mjs --only early`): contra 2 lobos do mesmo nível o Clérigo vence 100% (perde 64% da vida no Nv 4); Guerreiro 80% no Nv 4 (perde 80%), Arqueiro 90%.

### Rodada de duelos 2 (2026-11-03): durabilidade em nível alto e Clérigo
Mudanças: vida +12 por nível acima do 4 (`core/stats.js`; início do jogo intacto, nível 4 = antes); Guerreiro Força 2,9 → 3,0 por nível; Colosso: investida 1,2 → 1,0 e impacto 1,8 → 1,2; Tempestade de Flechas 2,0 → 1,9 por rajada; Meteoro 19 → 21; Clérigo Int 3,5 → 3,65, Luz Sagrada cura 18% → 16%, Julgamento 2,4 → 2,6. Testado e descartado: defesa por Vit (favorece o Clérigo e prejudica o Arqueiro), vida base de Mago/Arqueiro, recarga do Tiro Perfurante e da Nova de Gelo (não mexem no ciclo Mago × Arqueiro).

| Nível | Guerreiro | Mago | Arqueiro | Clérigo |
|---|---|---|---|---|
| 20 antes | 46% · 14 s | 53% · 26 s | 48% · 25 s | 45% · 19 s |
| 20 depois | 45% · 16 s | 55% · 29 s | 47% · 28 s | 46% · 22 s |
| 30 Maestria antes | 50% · 14 s | 46% · 19 s | 47% · 14 s | 51% · 26 s |
| 30 Maestria depois | 45% · 17 s | 44% · 23 s | 43% · 18 s | 53% · 30 s |

Pendente: Guerreiro ainda abaixo de 20 s (mata Mago/Arqueiro rápido) e ciclos Mago × Clérigo (89%) e Mago × Arqueiro (14%) no Nv 20 seguem; o Guerreiro perde 7% para o Clérigo no Nv 30. Início (`boss-check --only early`, 2 lobos Nv 4): Guerreiro 80% (igual), Clérigo 100% (igual, perde 64% da vida), Arqueiro 90%. PvE: chefes e ondas praticamente iguais (coop 4j Nv20 sobe de 88% para 100%).

### Rodada de duelos 3 (2026-11-03): IA do rival e PVP_DAMAGE (item 12 das pendências)
Mudanças (só PvP; mobs, chefes e ondas usam `mobIntent`, que não foi tocado):
- `game/ai.js` (`rivalIntent`): o robô de Mago/Arqueiro passa a **mirar à frente** do alvo que anda (velocidade por média móvel dos deslocamentos; tempo de voo = distância / velocidade do projétil; fração `LEAD = 0,4`). Sem antecipação os projéteis lentos do Mago erravam o alvo que desvia lateralmente (acertava ~11 tiros por duelo contra ~37 do Arqueiro).
- `game/sim.js`: `PVP_DAMAGE` 0,32 → 0,28 (duelos mais longos: Guerreiro/Arqueiro Nv 30 com Maestria saem de 17–18 s para 19–22 s).
- Testes em `tests/core.test.js` (mira à frente; `PVP_DAMAGE` só entre heróis).

Medido com `node tools/balance.mjs --level N --n 100` (Nv 30 Maestria: `--mastery`). Antes → depois (média da classe · duração média):

| Nível | Guerreiro | Mago | Arqueiro | Clérigo |
|---|---|---|---|---|
| 10 | 46% · 13 s → 42% · 15 s | 53% · 25 s → 49% · 26 s | 49% · 26 s → 44% · 26 s | 49% · 18 s → 52% · 21 s |
| 20 | 45% · 16 s → 38% · 18 s | 55% · 29 s → 49% · 31 s | 47% · 28 s → 50% · 29 s | 46% · 22 s → 53% · 27 s |
| 30 | 35% · 19 s → 38% · 21 s | 46% · 35 s → 45% · 38 s | 54% · 31 s → 59% · 32 s | 47% · 28 s → 54% · 34 s |
| 30 Maestria | 45% · 17 s → 42% · 19 s | 44% · 23 s → 43% · 27 s | 43% · 18 s → 53% · 22 s | 53% · 30 s → 51% · 34 s |

Resultado honesto: **durações melhoraram** (todas entre 18 e 38 s; só o Guerreiro fica em 18–19 s nos Nv 20 e 30 Maestria) e a média das classes no Nv 30 Maestria ficou mais próxima de 50% (Arqueiro 43 → 53%), mas o **Guerreiro caiu** (38–42%) e **o ciclo de pares continua** (Guerreiro × Clérigo 87–97% para o Clérigo, Mago × Arqueiro 0–9% para o Arqueiro, Mago × Clérigo 63–82% para o Mago): é o triângulo/ciclo Guerreiro > Arqueiro > Mago > Clérigo > Guerreiro, que vem do kit (Clérigo cura/escudo contra burst; Arqueiro com rajadas em área e Rolamento contra o Mago), não só da IA.
Testado e descartado (medido em 4 níveis × 40 duelos; nota = desvio médio de 50% e nº de células fora de 25–75%): limite de recuo (kiting) do Mago/Arqueiro por tempo (2–8 s de recuo, 0,6–2,5 s parado) — derruba Mago e Arqueiro para 22–40% e faz o Guerreiro dominar (59–69%); recuo limitado só contra alvo corpo a corpo — melhora Mago × Clérigo (90 → 42–52%) mas leva Guerreiro × Arqueiro a 92–98%; `LEAD` 0,8–1 — Guerreiro/Clérigo passam de 57–63%; velocidade do projétil do Mago (480/440 → 620/580) e recarga do Teleporte (6 → 9 s) — Mago × Arqueiro continua em 0–20%; Arqueiro com ataque básico 0,6 → 0,5 — idem. Início/PvE: `boss-check --only early` igual ao anterior (2 lobos Nv 4: Guerreiro 80%, Mago 97%, Arqueiro 90%, Clérigo 100%); `npm test` 430/430.
Pendente: o ciclo Mago × Arqueiro e Guerreiro × Clérigo pede mudança de kit/dados (decisão de design), por exemplo habilidade de controle do Mago contra o Arqueiro ou menos cura do Clérigo contra burst; não feito para não mexer no PvE.

## Escudo e bloqueio passivo (2026-11-03)
Guerreiro e Clérigo duelam com escudo incomum (`npm run balance`; `NOSHIELD=1` mede sem escudo). Médias da classe sem → com escudo (n=80–100): Nv 10 Guerreiro 43→46, Clérigo 50→60; Nv 20 Guerreiro 37→41, Mago 47→43, Arqueiro 48→44, Clérigo 51→60; Nv 30 sem grandes mudanças no Guerreiro. Ajustes feitos para não estourar o PvP: escudo sem afixos (o afixo de atributo principal dava ~+20 pontos ao Clérigo), defesa/vida pequenas, bloqueio em duelo entre heróis com 10% da chance (`BLOCK.pvpMul`) e sem recuo. **Pendente:** o Clérigo com escudo ainda fica ~+8 pontos acima da meta em duelo (os escudos entram só em PvE no jogo real por enquanto; ajustar kit/cura do Clérigo é decisão de design). PvE: bloqueio de 20–40% × −60% de dano e recuo de 0,4 s nos mobs corpo a corpo; o início do jogo (Guerreiro sem escudo vs 2 lobos Nv 4) não muda, pois o personagem novo não tem escudo. `boss-check` e `waves-check` rodados: sem escudo equipado nos bots, resultados iguais.

## Berserker sem escudo (2026-11-03)
Decisão do dono: o Berserker não usa escudo (`noOffhand` em `data/specs.js`) e deve bater mais forte em dano físico que o Paladino. Ajustes (`data/specs.js`): ataque básico +12%, Golpe Giratório 290%→300% (recarga 3,6→3,5s), Investida 220%→240%, dano com pouca vida até +70% (era +50%), poder +3% (era +12%: o ganho agora vem de habilidades e ataque básico; +12% de poder estourava o duelo, 43%→58%), defesa -3% (era -4%). Paladino: roubo de vida 3%→2% (mantém defesa +8%, bloqueio +8 e Grito/Investida de grupo).
Duelo `npm run balance -- --n 60` (Berserker sem escudo vs Paladino com escudo incomum), Berserker/Paladino: antes (Berserker COM escudo) Nv15 52/56 · Nv20 46/57 · Nv25 40/49 · Nv30 41/49; depois Nv15 56/54 · Nv20 51/57 · Nv25 52/49 · Nv30 43/48. Nv30 do Guerreiro já era o ponto fraco antes (limitação conhecida). Abaixo do Nv15 não há spec: inalterado.

## Kits próprios das especializações (2026-11-03)
As 8 especializações trocaram os ajustes de números por **3 habilidades + 1 Maestria só delas** (`public/src/data/kits.js`; tabela em `docs/gameplay/sistemas.md`). Abaixo do nível 15 nada mudou (kit base da classe).

**Duelos** (`npm run balance`, equipamento incomum; a ferramenta alterna as 2 especializações de cada classe pela semente, então a linha da classe é a média das duas):
- Nv20 (`--level 20 --n 60`): Guerreiro 51% · Mago 52% · Arqueiro 50% · Clérigo 46% (todas na meta 45–55%, duelos de 15–24 s). Por especialização: Paladino 56, Berserker 47, Arcano 49, Bruxo 55, Franco-atirador 47, Pistoleiro 53, Guardião 56, Inquisidor 35.
- Nv30 com Maestria (`--level 30 --mastery --n 40`): Guerreiro 51% · Mago 48% · Arqueiro 47% · Clérigo 53% (todas na meta, 15–25 s). Por especialização: Paladino 45, Berserker 57, Arcano 52, Bruxo 43, Franco-atirador 55, Pistoleiro 38, Guardião 60, Inquisidor 47.
- Fora da meta por especialização: o Inquisidor (35% no Nv20) e o Pistoleiro (38% no Nv30) ainda ficam abaixo; Guardião/Inquisidor se enfrentam e um empurra o outro (confronto de mesma classe soma zero). Ruído com n=40–60: cerca de ±6 pontos. Ajuste futuro: só em `data/kits.js` (mult/recarga) e `mods` de `data/specs.js`.
- Cuidado ao mexer em `mods.stats` de uma spec: `tests/core.test.js` (pareamento por poder, ±20%) mede o poder do rival com spec; o Inquisidor com +12% de vida e +8% de defesa estourou para 22,7%.

**Chefes** (`node tools/boss-check.mjs --n 4 --only boss`, comparado com o código anterior rodado igual): sem piora de dificuldade para o jogador — os chefes ficaram um pouco **mais fáceis** em níveis 15–26 por causa dos kits (ex.: Guardião das Ruínas, herói normal Nv19: 13% → 38% de vitória; Ancião Gélido normal Nv25: 38% → 69%; Colosso Nv15 normal: igual, 100%). O Cavaleiro Rubro ficou igual (good Nv30 94% → 94%; best Nv25 75% → 81%). Se quiser recuperar a dificuldade intermediária, o botão é a vida dos chefes em `data/mobs.js`, não os kits (os kits foram calibrados para o duelo, onde o dano ao herói é reduzido por `PVP_DAMAGE`). `waves-check`: não existe ferramenta com esse nome no repositório; o solo das Ondas não foi remedido.

## Recalibragem após os kits próprios (2026-11-04)
Duelos: `npm run balance -- --level 20 --n 60` e `--level 30 --n 60 --mastery` (a especialização alterna pela semente: as specs de índice 0 só enfrentam specs de índice 0 e as de índice 1 só as de índice 1, então mexer em uma spec desloca as outras do mesmo grupo; ruído ~±4 pontos).

    Spec (vitória%)         Nv20 antes   Nv20 depois   Nv30+Maestria antes   Nv30+Maestria depois
    Inquisidor                   35           50              49                    54
    Pistoleiro                   53           50              42                    46
    Berserker                    47           49              62                    53
    Bruxo                        55           51              46                    49
    Guardião                     56           47              61                    59
    Paladino                     56           58              48                    51
    Arcano                       49           52              51                    51
    Franco-atirador              47           48              56                    50

Mudanças só em `data/kits.js` e `mods` de `data/specs.js` (sem vida/defesa, para não estourar o teste de pareamento por poder): Inquisidor (Julgamento recarga 4→3,4 s e dano 480→550%; Chama recarga 6,5→5,5 s e 420→460%; Veredito 1200→1500%; `powerMul` 1,14→1,16 e roubo de vida 0,10→0,12); Pistoleiro (Rajada 62→66%, Saraivada 240→440%); Berserker (Machadada 270→300%, Salto 260→280%, Ira de Brasa -25%/+25% vel. → +12%/+15%, roubo 6→4%); Bruxo (Chuva de Almas 280→420%); Arcano (Cometa 1800→1600%); Franco-atirador (Tiro Letal 2800→2400%); Guardião (Luz Curativa 15→14%, Palavra de Salvação 32→30% de cura; Escudo Reforçado -18→-14% de dano; Intervenção Celestial cura 30→22%, escudo 20→15%, -30→-25%). Observação: sem `--mastery` no Nv30 o Berserker cai a ~30% (a Ira de Brasa é a maior parte do ganho dele).

### Chefes intermediários (vitória%, `node tools/boss-check.mjs --n 4 --only boss`, 16 execuções por célula)
Ajuste em `data/mobs.js`: Guardião vida ×9→×20, ataque ×1,7→×2,0; Ancião Gélido vida ×8,5→×21, ataque ×1,9→×2,3 (os números "antigos" abaixo são os da tabela de 2026-11-02, medidos com os kits da classe).

    Guardião das Ruínas      antigo    com kits (antes)   agora
    normal Nv19                 0          38             13
    normal Nv25                50            100                 44
    normal Nv30                94            100                100
    good   Nv19                88            100                 94
    good   Nv15                 6             63                 19

    Ancião Gélido            antigo    com kits (antes)   agora
    normal Nv25                 6             56                 19
    normal Nv26                13             81                 13
    normal Nv30                44            100                 44
    good   Nv19                19             81                 13
    best   Nv19                88            100                 88

Também ficaram mais fáceis com os kits e NÃO foram tocados: Carvalho (normal Nv7 94%, era 69%), Colosso (normal Nv13 19%, era 13%; good Nv10 88%, era 50%) e o Cavaleiro Rubro (good Nv30 100%, era 56%; best Nv25 88%, era 13%; normal Nv30 6%). Início do jogo intacto (Carvalho/lobos). `tests/core.test.js` G4 e o digest de `ruins` em `tests/zone-determinism.test.js` foram atualizados (só `ruins` mudou; forest e plains iguais).
Carvalho, Colosso e Cavaleiro Rubro recalibrados depois (2026-11-04, `data/mobs.js`; `BOSS_SPAWN` e ritual intactos): Carvalho vida ×9→×10, ataque ×1,5→×1,55; Colosso vida ×10→×13, ataque ×1,6→×2,0; Cavaleiro Rubro vida ×16→×25, ataque ×3,2→×5,3 (tabela por chefe; 16 execuções por célula).

    Chefe / célula               antigo   com kits   agora
    Carvalho normal Nv7             69        94        75
    Carvalho normal Nv5             44        50        44
    Carvalho good   Nv5             88       100        94
    Colosso  good   Nv10            50        88        50
    Colosso  normal Nv13            13        19         6
    Colosso  normal Nv15            63        94        75
    Colosso  good   Nv13           100       100       100
    Cavaleiro good  Nv30            56       100        50
    Cavaleiro best  Nv30            81       100        81
    Cavaleiro best  Nv25            13        88        25
    Cavaleiro normal Nv30            0         6         0
    Cavaleiro good  Nv25             0        25         0

Início do jogo intacto (Guerreiro vs 2 lobos Nv4: 80%). `tests/core.test.js` G4 (hp/atk) e os digests de `forest` e `plains` em `tests/zone-determinism.test.js` foram atualizados (`ruins` igual).

### Berserker sem Maestria no Nv30 (2026-11-04)
Só dados: `specs.js` (powerMul 1,03→1,05; ataque básico ×1,12→×1,20) e `kits.js` (Ira de Brasa +12%/+15% vel. → +8%/+10%). `npm run balance -- --n 60`: Nv30 sem Maestria 27%→40%, com Maestria 47–53%→57%, Nv20 49%→57% (o ganho do Nv30 vem junto com o do Nv20; vida e defesa intactas). Meta de 45% sem Maestria não atingida sem estourar o Nv20.
