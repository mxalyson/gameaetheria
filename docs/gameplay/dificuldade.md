# Dificuldade, chefes, habilidades por nível e loot

Números medidos com `node tools/boss-check.mjs --n 6` (simulação real: World + IA, passo fixo 1/60 s, sementes fixas, 4 classes × 6 sementes por célula, robô que usa skills, bebe poção abaixo de 45% de vida e esquiva 60% dos golpes telegrafados) e `node tools/loot-check.mjs`. Reproduzíveis.

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
      normal  Nv5:   0% x42s      Nv7:  38% 36s       Nv10: 100% 25s      Nv15: 100% 15s      Nv19: 100% 11s      Nv25: 100% 8s       Nv30: 100% 6s      
      good    Nv5:  71% 36s       Nv7: 100% 26s       Nv10: 100% 16s      Nv15: 100% 10s      Nv19: 100% 7s       Nv25: 100% 5s       Nv30: 100% 4s      
      best    Nv5: 100% 22s       Nv7: 100% 16s       Nv10: 100% 11s      Nv15: 100% 6s       Nv19: 100% 5s       Nv25: 100% 4s       Nv30: 100% 3s      
    
    Colosso de Cristal (colossus, Nv 13)
      normal  Nv5:   0% x10s      Nv10:   0% x50s     Nv13:  13% 65s      Nv15:  46% 48s      Nv19: 100% 34s      Nv25: 100% 25s      Nv30: 100% 20s     
      good    Nv5:   0% x25s      Nv10:  50% 56s      Nv13: 100% 36s      Nv15: 100% 30s      Nv19: 100% 22s      Nv25: 100% 15s      Nv30: 100% 12s     
      best    Nv5:   0% x89s      Nv10: 100% 34s      Nv13: 100% 23s      Nv15: 100% 20s      Nv19: 100% 15s      Nv25: 100% 11s      Nv30: 100% 9s      
    
    Guardião das Ruínas (guardian, Nv 21)
      normal  Nv5:   0% x5s       Nv10:   0% x9s      Nv15:   0% x55s     Nv19:   0% x58s     Nv21:   0% x58s     Nv25:  21% 64s      Nv30:  92% 50s     
      good    Nv5:   0% x5s       Nv10:   0% x30s     Nv15:   4% 83s      Nv19:  79% 57s      Nv21: 100% 48s      Nv25: 100% 39s      Nv30: 100% 31s     
      best    Nv5:   0% x15s      Nv10:   0% x137s    Nv15:  88% 69s      Nv19: 100% 37s      Nv21: 100% 35s      Nv25: 100% 28s      Nv30: 100% 23s     
    
    Ancião Gélido (frostlord, Nv 26)
      normal  Nv5:   0% x5s       Nv10:   0% x5s      Nv15:   0% x25s     Nv19:   0% x62s     Nv25:   4% 87s      Nv26:   8% 66s      Nv30:  38% 62s     
      good    Nv5:   0% x5s       Nv10:   0% x10s     Nv15:   0% x25s     Nv19:   4% 99s      Nv25: 100% 42s      Nv26: 100% 40s      Nv30: 100% 33s     
      best    Nv5:   0% x6s       Nv10:   0% x111s    Nv15:  13% 171s     Nv19:  88% 63s      Nv25: 100% 31s      Nv26: 100% 30s      Nv30: 100% 26s     
    
    Cavaleiro Rubro (infernoknight, Nv 31)
      normal  Nv5:   0% x5s       Nv10:   0% x5s      Nv15:   0% x5s      Nv19:   0% x6s      Nv25:   0% x10s     Nv30:   0% x37s    
      good    Nv5:   0% x5s       Nv10:   0% x5s      Nv15:   0% x10s     Nv19:   0% x15s     Nv25:   0% x78s     Nv30:  46% 88s     
      best    Nv5:   0% x5s       Nv10:   0% x15s     Nv15:   0% x70s     Nv19:   0% x156s    Nv25:  33% 125s     Nv30:  88% 74s     

Leitura: herói normal com nível ≤ chefe−8 perde sempre (0% em todas as células); good no nível do chefe vence em 26–48 s (Treant/Colosso/Guardião/Ancião) com poções; o Cavaleiro Rubro (Nv 31) exige nível 30 + épico/lendário aprimorado: good Nv30 vence ~50% em ~87 s, best Nv30 ~91%; Nv25 good 0%, best ~38%; Nv ≤19 nunca. (Valores de n=8 para o último chefe: good Nv30 50%, best Nv30 91%, best Nv25 38%.)

## Mobs comuns (herói normal do mesmo nível, sem poção)
Solo: perde 9–18% da vida, 4–7 s para matar. 2 mobs: 16–24% e 1–19% de derrotas. 3 mobs: 21–31% e 6–36% de derrotas (Cinzas: 36%).

## Habilidades por nível
Ataque básico no 1; s0 no 1, s1 no 5, s2 no 10 (`SKILL_UNLOCK` em data/skills.js; `core/unlocks.js`). `World.castSkill` ignora intenções de skill bloqueada (jogador, servidor e rival).

## Aparição do último chefe
Não reaparece por tempo. Contador "Ritual" (`world.bossProgress` = `{have, need, cool, omen, alive}`): mob comum vale 1, elite 4; ao chegar em 40 o chefe surge após 3 s de aviso. Depois da metade, cada elite tem chance crescente (6% × nº de elites, máx. 50%) de adiantar. Ao morrer: recarga de 1500 s de jogo e contador zerado. A missão `cavaleiro_rubro` ativa libera uma primeira aparição. Configurável em `BOSS_SPAWN` (data/mobs.js); chefes iniciais mantêm respawn de 90–150 s. Eventos: `boss_warn {stage: 'omen'|'arrive', name, x, y}`, `phase {actor, phase}` (fase 3 = "Enfurecido!").

## Loot
Pesos por fonte [comum, incomum, raro, épico, lendário] (core/loot.js `LOOT_SOURCES`): mob 67/26/6.4/0.55/0.05 (14% de chance de item), elite 34/40/21.5/4/0.5 (70%, 1–2 itens), chefe 0/20/50/26/4 (2–3 itens). Surpresa: 1,5% de subir 1–2 raridades. Pity (`char.pity`): peso de épico +1,5% por item sem épico (garantido em 120 itens), lendário +0,4% por item (garantido em 600). Atributo base varia ±15%.

    
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
    
    Cavaleiro Rubro: 932 exclusivos em 2000 abates (1 a cada 2.15), pior seca 4 abates

(Premissa: 300 abates/h. O servidor de zona ainda não passa `pity` a `rollMobLoot` — sem pity lá: ~1 épico/h.)

## Exclusivo do Cavaleiro Rubro
Espada/Cajado/Arco/Maça Opalina (60%, da classe do jogador) ou Couraça de Ópalo (40%); 75% épico / 25% lendário (nome "Radiante"); atributos base ×1.3 mais crítico+vel. de ataque (arma) ou VIT+vel. de movimento (armadura); `opal: true`. Chance por abate 30% +20% por abate sem drop (garantido no 5º); sem pity (servidor) 35%. Ícone: o do tipo do item (sem arte própria; ver pendencias.md).
