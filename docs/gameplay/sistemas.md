# Sistemas de jogo
Controles: WASD move, mouse mira, clique ataca, 1/2/3 habilidades e 4 (Maestria); I/C/P abrem inventário, personagem, spirits.

| Sistema | Onde | Estado |
|---|---|---|
| Classes e habilidades (3×3) | data/classes.js, data/skills.js | implementado e testado (cada skill/status em tests/combat.test.js); equilíbrio medido com npm run balance |
| Habilidade de Maestria (slot s3, 1 por classe) | data/skills.js (`colossus`, `meteor`, `arrowstorm`, `intervention`), `CLASSES[x].mastery`, core/unlocks.js, game/sim.js | implementado e testado (tests/core.test.js, tests/mastery.test.js). Libera no nível 25 **e** com a missão `maestria` concluída (`isSkillUnlocked(char|ator, 3)`; o ator guarda `mastery`). Recarga 35-45 s. Fúria do Colosso (dash 120% + impacto 150 px 180% + atordoa, +20% dano 6 s), Meteoro Arcano (aviso 1 s, 1900%, atordoa 1 s, queimadura 70% x8), Tempestade de Flechas Ardentes (3 s, 12 x 200%, lentidão 40%), Intervenção Divina (cura 40%, escudo 30%, remove atordoamento/lentidão, castável atordoado; aliados 80%). Balanço nv25 com Maestria: 42-58% (`node tools/balance.mjs --level 25 --mastery`); Cavaleiro Rubro nv30 com equipamento bom: 44% sem, 63% com (`tools/boss-check.mjs --mastery`). Ícones provisórios (recolor dourado, tools/skill-icon-gold.py) |
| Especializações (nível 15, 2 por classe) | data/specs.js, core/specs.js | implementado e testado; ajustam habilidades existentes; 1ª escolha grátis |
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
