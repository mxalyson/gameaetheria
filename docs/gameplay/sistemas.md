# Sistemas de jogo
Controles: WASD move, mouse mira, clique ataca, 1/2/3 habilidades e 4 (Maestria); I/C/P abrem inventário, personagem, spirits.

| Sistema | Onde | Estado |
|---|---|---|
| Classes e habilidades (3×3) | data/classes.js, data/skills.js | implementado e testado (cada skill/status em tests/combat.test.js); equilíbrio medido com npm run balance |
| Habilidade de Maestria (slot s3, 1 por classe) | data/skills.js (`colossus`, `meteor`, `arrowstorm`, `intervention`), `CLASSES[x].mastery`, core/unlocks.js, game/sim.js | implementado e testado (tests/core.test.js, tests/mastery.test.js). Libera no nível 25 **e** com a missão `maestria` concluída (`isSkillUnlocked(char|ator, 3)`; o ator guarda `mastery`). Recarga 35-45 s. Fúria do Colosso (dash 120% + impacto 150 px 180% + atordoa, +20% dano 6 s), Meteoro Arcano (aviso 1 s, 1900%, atordoa 1 s, queimadura 70% x8), Tempestade de Flechas Ardentes (3 s, 12 x 200%, lentidão 40%), Intervenção Divina (cura 40%, escudo 30%, remove atordoamento/lentidão, castável atordoado; aliados 80%). Balanço nv25 com Maestria: 42-58% (`node tools/balance.mjs --level 25 --mastery`); Cavaleiro Rubro nv30 com equipamento bom: 44% sem, 63% com (`tools/boss-check.mjs --mastery`). Ícones provisórios (recolor dourado, tools/skill-icon-gold.py) |
| Especializações (nível 15, 2 por classe) | data/specs.js, core/specs.js, core/stats.js (mods), game/sim.js | implementado e testado; ajustam habilidades e atributos; 1ª escolha grátis, trocar exige Selo (15.000 de ouro) |
| Combate (melee, projétil, AoE, dash, buff, stun, slow, escudo) | game/sim.js | implementado e testado; passo fixo 60 Hz; eventos hit/heal/swing/status/cast/death; Clérigo cura/protege aliados próximos |
| Mobs, chefes e IA | data/mobs.js, game/ai.js | implementado; não validado em jogo |
| Loot, raridades, equipamento | core/loot.js, data/items.js | implementado e testado (unitário) |
| Progressão (nível máx. 30) e spirits | core/progression.js | implementado e testado (unitário) |
| Grande Arena por times 1×1/2×2/4×4 (ponto de controle), poder (PWR), pareamento por poder, PvP no nível 10; ondas PvE | main.js, core/match.js, core/power.js, core/rival.js | implementado e testado; não validado com humanos nem no celular |

Critérios de aceitação por mecânica serão definidos com o `gameplay-level-designer` antes de cada mudança.

## Herói jogável no Vale de Auren (Fase 4, protótipo)
Página `/vale.html`; lógica em `public/src/game/iso-hero.js` (sem DOM), desenho em `public/src/render/vale.js`.
Reaproveita regras reais: Guerreiro (`data/classes.js`), `computeStats`, `computeHit`, ataque básico (alcance 74 px, arco 1,8 rad, cd 0,6 s) e Golpe Giratório (raio 110 px, mult 1,7, cd 5 s). Escala: 1 tile = 64 px do jogo atual.
Controles: WASD (eixos isométricos: W sobe na tela), mouse mira, clique ataca, 1 = Golpe Giratório.
| Item | Estado |
|---|---|
| Movimento com colisão (água, degraus >1, árvores, ruínas, ponte) | testado (unitário e e2e) |
| Ataque básico e habilidade com dano real contra alvo de treino | testado (unitário e e2e) |
| Poses: parado, andar, ataque, giro; vista de costas | implementado; validado só por captura de tela |
| Inimigo com IA, vida, dano recebido, esquiva | pendente (Fase 5) |
| Câmera que segue o herói | pendente (hoje o diorama inteiro cabe na tela e o herói fica pequeno) |
| Integração ao jogo principal | pendente, exige decisão à parte |

## Salvamento
Documento do personagem versionado (v2), validado e com backup; exportar/importar em Opções e na tela de título. Ver `core/savedoc.js`, `save.js`.

## Mundo e progressão (P8)
Missões (12), diálogos, baús, mapa (M), diário (J), conquistas e títulos: ver decisão 0012. Economia: `docs/gameplay/economia.md`.


## Rodada 2026-11-02 (equipamento por classe, spirit coletor, mestres)
- **Equipamento por classe:** todo item (arma, elmo, armadura, botas, anel, amuleto) tem `classId` e só a classe dele equipa (`canEquip`: "Apenas para Mago."). Armadura por tipo: Guerreiro placas, Arqueiro couro, Mago e Clérigo tecido (conjuntos de nomes distintos, `GEAR_NAMES`). Anel/amuleto sempre trazem o atributo principal da classe. Loot de mob/baú/loja/kit inicial usa sempre a classe do jogador. **Saves antigos:** item sem `classId` é carimbado com a classe do personagem dono em `validate` (equipado de outra classe é removido); armas antigas derivam a classe do tipo. API para a UI: `itemClassName(item)`, `reqClass(item)`, `itemClassId(item)` em `core/stats.js`.
- **Ouro** cai direto na mochila (texto flutuante "+N"); não existe mais drop de ouro no chão. O servidor já creditava no lote.
- **Spirit coletor** (`game/sim.js` `updateSpiritFetch`, `SPIRIT_FETCH`): fora de combate o spirit busca o drop mais próximo (até 260 px do dono, 320 px/s), traz ao herói e emite `pickup`; mochila cheia vira ouro. Só heróis; o ouro nunca é buscado.
- **Evolução do spirit** exige a missão do elemento com a Sábia Yun (`evolucao_do_spirit_fogo|agua|terra|vento`: 40 abates com o spirit ativo + 2 baús; spirit nível 10). `spiritEvoStatus(doc, sp)` (`core/journal.js`) descreve o estado para a UI.
- **Mestres de Classe** (Vila, fileira em y 950, x 950–1130): `prova_do_mestre` (nv 14; 1 mini-chefe + 10 usos da habilidade assinatura = 1ª da classe) libera a escolha de especialização; `maestria` (nv 25; 3 chefes + 50 habilidades) dá +4 atributo principal, +3 Vitalidade permanentes (`MASTERY`) e o título "Mestre". Objetivos novos: `miniboss`, `skillUse`, `spiritKill`. Arte própria dos mestres é pendência (hoje reutilizam o herói em miniatura da classe).
- **PvP** sem teto por hora (decisão do dono); resta só a regra do mesmo adversário 3x em 30 min.

## Escudo e bloqueio passivo (2026-11-03)
- **Slot `offhand` (Escudo)**: só Guerreiro e Clérigo (`SHIELD_CLASSES` em `data/items.js`; `canEquip` recusa as outras classes, o save remove escudo de classe sem escudo, o loot e a loja só sorteiam escudo para quem o usa). Stats: defesa, vida e **bloqueio %** por raridade (20/24/28/34/40). Faz parte de SLOTS, então Ferreiro (+N), banco, venda e `tx equip/unequip` já valem. `equipamento.offhand` é opcional no documento (sem mudança de versão do save).
- **Bloqueio** (sem botão, sem mudar de estado; `core/block.js` + `World.damage`): sem escudo equipado não há bloqueio. Com escudo, todo golpe/projétil vindo da frente (arco de 140 graus) sorteia (RNG da simulação) a chance do item; bloquear tira 60% do dano, mostra "Bloqueou N" e o brilho de absorção; o atacante NÃO é atordoado (removido a pedido do dono). Ficar parado 0,6 s ganha +10 pontos de chance. Dano contínuo (queimadura) ignora o bloqueio. Em duelo entre heróis a chance vale 15% (`BLOCK.pvpMul`) para não desequilibrar os duelos.
- Não há aviso de golpe (`windup`) nem aparo manual: foram descartados pela decisão do dono (bloqueio passivo).
- Servidor: `stats.block` vem do documento (computeStats); `itemCeiling` (plausible.js) conhece o escudo.

## Especializações e reespecialização paga (2026-11-03)
**Regra (decisão do dono).** No nível 15, depois da Prova do Mestre, a PRIMEIRA escolha é grátis. Trocar depois exige 1 **Selo de Reespecialização**, consumível vendido pelo Mestre de Classe da própria classe por **15.000 de ouro** (`SEAL_PRICE`; máximo 9 carregados). `char.seals` guarda os Selos e `char.specChanges` conta as trocas pagas (histórico simples); ambos entram no documento (`core/savedoc.js`). O botão do Selo só aparece no painel aberto pelo serviço do Mestre ("Especialização e Selos"); a troca pede confirmação do próprio jogo. Offline vale a mesma regra, localmente (`chooseSpec`/`buySeal` em `core/specs.js`).

**Servidor.** Transações `respec_buy` (compra o Selo) e `respec` (escolhe/troca; o Selo é conferido e gasto no documento oficial) em `server/tx.js`, listadas em `core/protocol.js`; só na Vila (nunca na instância nem no Porto). `server/plausible.js`: o salvamento do cliente só pode ir de "sem especialização" para uma válida (1ª escolha, com Prova e nível); qualquer troca vinda do cliente é recusada (`spec_forged`), e `seals`/`specChanges` são do servidor (o cliente nunca ganha Selo).

**Migração de saves.** bastion→paladin, executioner→berserker, pyromancer→arcane, cryomancer→warlock, marksman→sniper, hunter→gunslinger (`SPEC_ALIASES`, aplicada em `validate`, silenciosa). Clérigo manteve `guardian` e `inquisitor`. A aura mantém os 8 códigos de rede na mesma ordem (`core/aura.js`).

**As 8 especializações** (defensiva/sustentação primeiro, ofensiva depois; `mods` = ajustes de atributos de `data/specs.js`):

| Classe | Especialização | Papel e efeitos |
|---|---|---|
| Guerreiro | Paladino | Defensivo. Grito de Guerra dura 12s e também protege aliados num raio de 300 (+15% dano, -28% dano recebido); Investida curta (distância 200, recarga 5s) que dá escudo de 12% da vida a aliados próximos; +8% de defesa, +2% de poder, +8 de bloqueio (só com escudo), 2% de roubo de vida |
| Guerreiro | Berserker | Ofensivo, **sem escudo** (arma de duas mãos). Golpe Giratório (300%, raio 120, recarga 3,5s), Investida (240%, recarga 6,5s) e ataque básico (+12%) mais fortes; +3% de poder, -3% de defesa; dano extra de até +70% que cresce abaixo de 50% da vida. Não equipa escudo (`canEquip` recusa: "O Berserker luta sem escudo."); ao escolher a spec o escudo equipado volta à mochila (mochila cheia bloqueia a troca, sem gastar Selo); saves antigos migram o escudo para a mochila/banco (`savedoc`); o servidor recusa save com escudo equipado (`berserker_shield`). Voltar ao Paladino (ou outra spec) permite equipar de novo. Escudos continuam caindo para o Guerreiro |
| Mago | Arcano | Controle/precisão. Bola de Fogo vira Projétil Arcano (veloz, alcance 720, atravessa); Nova de Gelo vira Nova Arcana (atordoa 1,2s, sem lentidão); Teleporte com alcance 320 e recarga 4,5s; +5% de crítico. (O jogo não tem mana; "mais mana" ficou como alcance.) |
| Mago | Bruxo | Dano ao longo do tempo, frágil. Praga Ardente (queima 6s) e Névoa Pestilenta (veneno 6s, lentidão 30%); -10% de vida, +9% de poder, 7% de roubo de vida (os golpes periódicos também drenam) |
| Arqueiro | Franco-atirador | Um tiro por vez. Ataque básico lento (0,8s) e longo (700); Tiro Perfurante 300%, alcance 900; +8% de crítico e +0,2 de dano crítico |
| Arqueiro | Pistoleiro | Besta de repetição (só sabor; a classe segue com arco, sem arma nova). Ataque básico rápido (0,36s) e curto (430); o Tiro Perfurante vira Rajada de 3 virotes em leque; Rolamento recarrega em 3s e vai mais longe |
| Clérigo | Guardião | Sustentação (já existia): Escudo Divino 8s, aliado até 340 recebe 95%; Luz Sagrada cura os aliados por inteiro e fere 170% |
| Clérigo | Inquisidor | Dano sagrado (já existia): Julgamento 350%, alcance 680, atordoa 1,8s; Luz Sagrada 190%; +12% de poder |

Mecânica nova no simulador, toda orientada a dados: `mods.stats` (core/stats.js), `mods.basic` (ataque básico), `mods.lowHp`, e campos de habilidade `pierce`, `burn` (dano periódico, o mesmo estado da queimadura do Meteoro), `stun` em habilidades de área, `volley`/`spread` (leque), `allyBuff` e `aegis` (reforço/escudo a aliados). Determinismo preservado (nenhum uso novo do RNG de combate).

**Balanceamento medido:** `npm run balance -- --level 20 --n 60 --spec 0|1` e `--level 30 --mastery --n 40 --spec 0|1` (% de vitória por classe, meta 45–55%). A ferramenta usa o mesmo índice de especialização para todas as classes (0 = Paladino/Arcano/Franco-atirador/Guardião; 1 = Berserker/Bruxo/Pistoleiro/Inquisidor) e o ruído com n=40–60 é de cerca de ±6 pontos. O robô não dá escudo ao Berserker (`KEEPSHIELD=1` mede a regra antiga); o resumo traz uma linha por especialização (ex.: `warrior:berserker`). Medido (Berserker sem escudo vs Paladino com escudo incomum): Nv15 56%/54% · Nv20 51%/57% · Nv25 52%/49% (maestria) · Nv30 43%/48% (maestria) — Berserker/Paladino. Nv30 do Guerreiro já era baixo antes (41%/49%). Limitação conhecida: no solo das Ondas, Arcano e Franco-atirador (projétil que atravessa) ficam bem mais fortes no Nv30 (mediana de ondas do Mago 9→18).

### Clérigo (desenho já implementado, documentado)
- **Guardião** (sustentação/grupo): Escudo Divino mais longo, que alcança o aliado mais distante; Luz Sagrada cura os aliados por inteiro. Aura branco-dourada. Papel: aguentar o grupo no cooperativo e nas arenas 2x2/4x4.
- **Inquisidor** (dano sagrado): Julgamento mais forte, longo e com atordoamento maior; Luz Sagrada fere mais; mais poder. Aura violeta-âmbar com runas. Papel: controle de alvo único e finalização.

### Místico (5º herói, ainda não existe: proposta, só desenho)
Conceito: místico errante que tece "ecos" (invocações e controle). As habilidades-base e a arte do Místico precisam existir antes (`docs/roadmap/depende-do-dono.md`, A7). Ao existir, as duas especializações seguem o molde de `data/specs.js` (ajustam habilidades e `mods`, sem sistema novo):
- **Tecelão de Ecos** (suporte/controle). Efeitos: (1) Eco Protetor: o eco que o Místico deixa para trás dá escudo ao aliado mais próximo com parte do dano recebido; (2) Fio de Eco: lentidão e atordoamento duram mais e prendem dois alvos ao mesmo tempo; (3) Coro de Ecos: curas e escudos se repetem uma vez, com 40% de potência, 2s depois (temporizador, sem RNG).
- **Ceifador de Ecos** (dano). Efeitos: (1) Colheita: abater ou quebrar o escudo de um inimigo deixa um eco que explode e fere os próximos; (2) Ressonância: golpes seguidos no mesmo alvo empilham até 5 cargas de dano periódico (o mesmo `burn`); (3) Eco da Morte: com a vida abaixo de 35%, o próximo golpe causa +40% de dano (o mesmo `lowHp`).
- Aura sugerida (códigos de rede 9 e 10, acrescentados ao fim de `SPEC_ORDER`): Tecelão azul-turquesa com fios de luz; Ceifador violeta-escuro com fragmentos. Arte do herói e das variantes do Nv25: A7/A8 do `depende-do-dono.md`.
