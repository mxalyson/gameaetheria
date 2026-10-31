# Roteiro e portfólio — o que é necessário e essencial
2026-10-31. Resposta ao pedido do proprietário (celular, mapas, balanceamento e evolução, contas, sprites/armamento, arena 1×1/2×2/4×4, skills, PvP por nível e poder). Status geral: **proposta (pendente de aprovação)** — só o item 0 já foi implementado.

> **Sobre as inspirações.** A pesquisa web desta rodada foi rasa (buscas padrão devolveram wikis e fóruns, sem documentação oficial de design). Abaixo, o que veio de fonte está marcado com a fonte; o restante é **conhecimento geral de gênero, a verificar**. Referências são para entender *mecânicas*, não para copiar arte, nomes ou textos.

## 0. Celular: tela encolhendo e minimapa — status
| Item | Status |
|---|---|
| Zoom/pinça do navegador (dois dedos = joystick + botão virava gesto de zoom) | **implementado** (`touch-action: none`, `src/no-zoom.js`); **testado** no Chrome emulado; **não validado** em celular real (Safari/iPhone tem gestos próprios, cobertos só por ouvintes) |
| Minimapa sumia em telas ≤ 340 px de altura | **implementado** (agora 84×56 px, nunca escondido); **testado** (`tests/e2e/mobile-curto.spec.js`, 863×330) |
| Regressão em `mobile.spec.js` (CSS duplicado) | **corrigida**; os 8 testes de celular passam |

## 1. Arena grande com 1×1, 2×2 e 4×4 — o essencial
**Hoje:** uma arena de duelo contra "eco" gerado (`rival.js`), Elo simples (`eloDelta`), ondas PvE. Sem multiplayer: os "rivais" são fantasmas gerados.

**Princípio:** o modo existe em 3 camadas, cada uma útil sozinha.
1. **Camada A — offline (fantasmas/bots), sem servidor.** Arena maior, partidas 1×1, 2×2, 4×4 contra times de "ecos" (bots com IA existente em `ai.js`). Aliados também são bots. Prova a diversão e o equilíbrio sem infraestrutura.
2. **Camada B — assíncrono.** Seu personagem (snapshot) vira "eco" no time de outros jogadores, como em arenas de Summoners War/Idle Heroes (*padrão de gênero, a verificar*). Exige contas + banco, **não** tempo real.
3. **Camada C — tempo real.** Servidor autoritativo (a simulação já usa "intenções" e RNG com semente: pensada para isso). Só depois de A e B.

**Estratégia (o que torna 2×2/4×4 mais que "bater mais forte"):**
- **Papéis por classe** já existentes: Guerreiro (linha de frente/atordoa), Mago (dano em área), Arqueiro (dano à distância), Clérigo (cura/escudo). Time sem cura ou sem linha de frente deve sentir.
- **Objetivo além de matar:** ponto de controle central (captura por tempo) e/ou relíquia; vencer por pontos *ou* eliminação. Evita fuga e "corrida de DPS".
- **Mapa da arena com decisão:** coberturas que bloqueiam projétil, poço de cura que reaparece, zona que encolhe no fim (empate impossível).
- **Pré-partida:** escolher 1 de 3 "bênçãos" de time (ex.: +vel. movimento, +cura recebida, +dano em chefe de arena) — escolha rápida, sem inflar números.
- **Reaparecimento limitado em 4×4** (ex.: 1 vida extra com atraso) para não punir demais o erro.
- Mortes e recarga de skill já existem na simulação; **o que é novo:** times (`team` no ator), objetivo, mapa, e um modo de partida (`mode: 1v1|2v2|4v4`).

**Referências de gênero (mecânica, não cópia):** arenas por times do WoW (ratings **separados por tamanho de time** — fonte: [Arena rating, Warcraft Wiki](https://warcraft.wiki.gg/wiki/Arena_rating)); MOBAs de celular com partidas curtas (Mobile Legends ~10 min, *dado de listagem, a verificar*); Summoners War (arena em grau/pontos de vitória — [wiki fã](https://summonerswar.fandom.com/wiki/World_Arena); regras de pontos *não* confirmadas na fonte).

## 2. PvP por nível e por poder — o essencial
**Desbloqueio:** PvP só a partir do **nível 10** (proposta; ajustável em `data/`). Antes: PvE + ondas. Motivo: o jogador já tem as 3 skills, 3+ itens e sabe o básico.

**Dois números, dois propósitos** (padrão de gênero; um fórum de Mechabellum descreve a mesma separação — [thread](https://steamcommunity.com/app/669330/discussions/0/4632610823217470225), *opinião de jogadores, não documento oficial*):
- **Poder (PWR)** — visível, mede *quão forte é o personagem* (nível + atributos + equipamento + spirits). Serve para **liberar conteúdo** e para mostrar progresso.
- **Rating (Elo/Glicko)** — mede *quão bem você joga*. Serve para **escolher adversários**. **Um rating por modo** (1×1, 2×2, 4×4).

**Fórmula inicial de poder (proposta, calibrar com simulação):**
```
PWR = 10·(vida/10 + ataque·1,5 + defesa·1,2 + crítico% + velocidade)·mult_nível  + Σ itemScore(equipado) + Σ spiritPower
```
Usa funções que **já existem**: `computeStats`, `itemScore` (`core/stats.js`), `spiritPower` (`core/progression.js`). O peso de cada termo sai do método de balanceamento (item 3), não de palpite.

**Pareamento:** buscar oponente com `rating ± janela` **e** `PWR ± 15%`; a janela abre com o tempo de espera (±50 → ±200). Em 2×2/4×4, o time é pareado pela **média** de rating e pela **diferença máxima** dentro do time. Sem oponente? Eco (bot) do mesmo nível — a fila nunca trava.

**Anti-"smurf/overgear":** em PvP, **normalizar parcialmente** os atributos (ex.: teto de bônus de equipamento = 120% do esperado para o nível). O equipamento ajuda, não decide.

## 3. Método de balanceamento + evolução completa
### 3.1 Método (essencial: sem isto qualquer número é chute)
1. **Curvas separadas:** XP por nível, *poder do jogador* por nível e *dificuldade dos monstros* por nível; a diferença entre as duas últimas é o "desafio". (Prática comum — resumo em guias como [Stray Spark](https://www.strayspark.studio/blog/rpg-stat-systems-character-progression-design); fonte secundária.) O jogo hoje usa `xpToNext = 60·nível^1,55` (`core/progression.js`) — expoente 1,5 é o ponto de partida citado nas fontes; **validar nível 1, meio e teto**.
2. **Simulador em Node** (sem navegador): usa `game/sim.js` com RNG de semente, roda *N* lutas classe × classe × nível × equipamento e imprime taxa de vitória, TTK (tempo para matar), dano por segundo. **Meta de equilíbrio:** nenhuma classe com taxa de vitória fora de **45–55%** no mesmo PWR; TTK médio 1×1 entre 20 e 40 s (a calibrar).
3. **Telemetria local** (opt-in): onde o jogador morre, tempo por nível, ouro por hora. Mortes concentradas em um nível = curva errada (mesma fonte acima).
4. **Teste obrigatório:** cada mudança de regra em `core/`/`game/` ganha teste em `tests/core.test.js` (já é regra do projeto) e o simulador roda em `npm run balance` (novo).

### 3.2 Evolução (o "sistema completo")
| Camada | Existe | Falta |
|---|---|---|
| Nível 1–30, 5 pontos/nível | sim | curva e teto revisados pelo simulador |
| Equipamento por raridade, 6 slots | sim | aprimoramento (+1…+10), sockets/gemas, conjuntos (2/4 peças), **aparência no sprite** (item 5) |
| Spirits | sim | evolução de estrela/despertar |
| Classe | 4 fixas | **especialização no nível 15** (2 ramos por classe), 3ª skill alternativa; Místico = classe futura |
| Habilidades | 3 fixas | árvore curta (2 melhorias por skill) |
| Fim de jogo | — | dificuldade "Eco" (+nível dos monstros), prestígio opcional |
Prioridade: **equipamento (aprimorar + conjuntos) → especialização → árvore → fim de jogo.**

## 4. Contas e salvamento na nuvem — o essencial
- **Hoje:** `localStorage` (`aetheria_save_v1`), 1 slot, sem nuvem.
- **Passo 1 (sem servidor próprio):** exportar/importar save (arquivo/código) + **migração por versão** (`save.js` já tem `version`). Entrega valor em 1 dia e protege contra perda.
- **Passo 2 (conta):** backend gerenciado. Duas opções comuns: **Supabase** (banco relacional, auth pronta; plano grátis com pausa de projeto inativo) ou **Firebase** (Firestore por documento; cobrança por leitura/gravação). Números de plano grátis variam entre fontes ([comparativo](https://www.getmonetizely.com/articles/supabase-vs-firebase-which-baas-pricing-model-actually-saves-you-money-2cc4f)) — **conferir nas páginas oficiais antes de decidir**. Recomendação inicial: Supabase (save é um JSON versionado por personagem).
- **Regras:** login por e-mail/código ou Google (decisão sua); **servidor valida** o que importa (ouro, XP, drops) quando houver PvP assíncrono — salvar só o cliente permite trapaça. Sem senha em texto, sem chaves no repositório.
- **Decisão sua:** exigir conta para jogar, ou conta opcional (convidado local + "vincular conta")? **Recomendo opcional**: reduz atrito.

## 5. Sprites, armamento e acessórios — o essencial
- **Hoje:** os 4 heróis têm atlas único; **o item equipado não aparece**. Equipamentos só mudam números.
- **Caminho viável** (mantém a regra "arte real, sem formas por código"): camadas de **sobreposição por slot** (arma, escudo/mão secundária, elmo, capa, asa/aura) assadas no mesmo pipeline (Blender → three.js → atlas) como *peças separadas alinhadas aos 8 ângulos × clips*. Custo: cada peça = novo atlas pequeno; começar com **arma** (3–4 tipos por classe × 3 raridades por cor/brilho) e **elmo**.
- **Raridade visível:** cor + brilho/partícula (cinza → verde → azul → roxo → dourado) via *shader/tint* no desenho, sem nova arte por raridade.
- **Risco:** memória de textura no celular (já ≈ 24 MiB por herói); camadas extras devem ser **recortadas e compartilhar a folha** quando possível.
- **Decisão sua:** como produzir a arte fina (ícones, molduras, cenário): gerador pago, artista, ou licenciada. Sem isso a identidade não sai do rascunho.

## 6. Visual das skills (efeitos) no jogo real — o essencial
- **Hoje:** efeitos (`vfx.js`) e a barra de skills restilizada **só existem no laboratório**; o jogo real ainda mostra o visual antigo (é o que você notou).
- **Plano:** mover `vfx.js` para `public/src/render/`, adaptar a projeção (top-down agora: `{x, y−z}`), disparar por eventos de `world.events` (`cast`) e por transição de `swing`, cache de brilhos pré-renderizados; **barra de skills** nova no HUD (ícone, recarga radial, dica ao passar o mouse/segurar). Atrás do mesmo interruptor `?visual=miniatura` até aprovação.
- **Medir antes/depois** custo por frame (regra do projeto); no celular, qualidade "baixa" corta partículas pela metade.

## 7. Mapas: visual de fantasia e conteúdo — o essencial
- **Visual:** parte da fase **B3** (cenário). Antes disso, ganhos baratos: iluminação por zona, partículas ambientais, sombras suaves, variação de chão — sem prometer o isométrico final.
- **Conteúdo** (editável em `data/zones.js` e `layout.js`): +2–3 zonas (costa/porto, caverna com pouca luz), **pontos de interesse** (baús, altares, eventos), mini-chefes, **missões** (hoje inexistentes) e NPCs com diálogo, mapa-múndi ligando as zonas. **Prioridade:** missões + pontos de interesse → zonas novas → clima/dia-noite (só visual).

## 8. Ordem sugerida (cada fase termina em relatório e aprovação)
| # | Fase | Entrega | Depende de |
|---|---|---|---|
| 1 | Celular + base de balanceamento | zoom/minimapa (feito), simulador `npm run balance`, fórmula de PWR | — |
| 2 | Arena camada A (offline) | arena grande, 1×1/2×2/4×4 com bots, objetivo, PvP liberado nível 10, pareamento por PWR+rating local | 1 |
| 3 | Evolução | aprimoramento, conjuntos, especialização | 1 |
| 4 | Skills e armas no visual novo | VFX + barra no jogo real, arma visível no herói | decisão de arte (item 5) |
| 5 | Conta e nuvem | export/import → conta (Supabase) | decisão sua |
| 6 | Arena camadas B/C | eco assíncrono → tempo real | 5 |
| 7 | Mapas | missões, POIs, zonas novas, cenário (B3) | 3 |

## 9. O que preciso de você
1. Aprovar (ou cortar) a ordem acima.
2. **Nível de liberação do PvP** (proposta: 10) e se 4×4 entra já na fase 2 ou depois.
3. Conta **obrigatória ou opcional**; e-mail ou Google.
4. **Como produzir a arte fina** (item 5) e jogos de referência *seus* (a pesquisa web foi limitada).
5. Teste no seu celular real: o zoom parou? o minimapa aparece? FPS?

## 10. Andamento da Fase 1 (2026-10-31, após aprovação)
- **Implementado e testado:** `core/power.js` (`playerPower`, `PVP_MIN_LEVEL = 10`, `pvpUnlocked`, `matchOk`) com teste em `tests/core.test.js` (62 unitários passam); simulador `npm run balance` (`tools/balance.mjs`, usa a simulação real e o `rivalIntent` como piloto dos dois lados).
- **Primeira medição (nível 10, 30 duelos por par, equipamento incomum):** Arqueiro 98%, Mago 62%, Guerreiro 23%, Clérigo 19% de vitórias; duelos de 9–15 s (meta: 20–40 s). **Fora da meta em todas as classes.** Ressalva: o piloto é a IA do rival (que mantém distância com ranged), então parte do viés é da IA, não só dos números das classes.
- **Pendente:** ajustar `data/classes.js`/`skills.js` e a IA até 45–55%, subir o tempo do duelo, e só então ligar o PvP ao PWR/pareamento no jogo (nada disso está ligado ao jogo ainda).
