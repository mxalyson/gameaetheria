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

### 10.1 Primeiro ajuste de equilíbrio (2026-10-31)
- **Mudado em `data/`:** Guerreiro (vida base 150, crescimento Força 3,0 / Vit 3,2, ataque 0,5 s, mult 1,05, Investida atordoa 1,2 s); Mago (vida 110, Int 2,6, Vit 1,9, Bola de Fogo 1,8×); Arqueiro (vida 80, Agi 1,8, flecha 0,62×); Clérigo (vida 140, Int 3,4, Vit 2,8, Julgamento 2,2× e atordoa 1,5 s).
- **Resultado (taxa média de vitória, 30 duelos por par):** nível 5: 57/54/44/35% (Guerreiro/Mago/Arqueiro/Clérigo); nível 10: 54/52/48/39%; nível 20: 39/46/56/41%. Antes (nível 10): 23/62/98/19%. Melhorou muito, mas **ainda não está 45–55% em todos os níveis**: o Clérigo fica baixo e o Guerreiro cai no nível 20. Duelos: 10–27 s (meta 20–40 s; o Guerreiro ainda é rápido demais).
- Há contra-jogos claros (Arqueiro vence Mago ~90%; Mago vence Clérigo ~87%): aceitável no PvP com times (papéis), mas a meta individual segue pendente. O piloto é a IA do rival, não um jogador humano.

### 10.2 Grande Arena por times — camada A (2026-10-31)
- **Implementado e testado:** zona `arena_team` (1800×1800, 8 pilares de cobertura, ponto de controle central); modos **1×1, 2×2 e 4×4** com aliados e inimigos bots (classes distintas primeiro); `core/match.js` (pontos por segundo com o ponto só seu, 100 pontos vencem, eliminação, fim por tempo com desempate por vida, **rating por modo**: 1×1 usa o campo antigo `arena.rating`); IA do rival vai ao ponto quando o inimigo está longe e contorna pilares; PvP **travado abaixo do nível 10**; painel da arena mostra poder e os 3 modos; anéis do ponto no mundo e no minimapa; aliados em azul, inimigos em vermelho; câmera segue um aliado vivo quando você cai.
- **Testes:** 64 unitários e 46 e2e passam (`tests/e2e/arena-times.spec.js`: travado no nível 9, 3 modos no 10, partidas 1v1/2v2/4v4 até o fim, rating separado). **Não validado:** divertimento e equilíbrio com jogadores reais; partidas só com o jogador parado (o time bot decide).
- **Limitação conhecida:** o pareamento por poder ainda é só **informativo** (o log mostra seu poder e a média inimiga); os inimigos são gerados por nível/rating e podem ficar bem mais fortes que um personagem sem pontos distribuídos (medi 325 × 771 num teste artificial). Falta gerar o time inimigo mirando o PWR do jogador (`matchOk`).
- **Pendente (camada A):** bênçãos de time, poço de cura, zona que encolhe, reaparecimento no 4×4, mira/skills de apoio dos aliados (cura em aliado), teste no celular.

### 10.3 Pareamento por poder (2026-10-31)
- **Implementado e testado:** `generateRivalForPower` (`core/rival.js`) busca a "força" do rival (pontos distribuídos, nível/raridade do equipamento, spirit) até o PWR dele chegar perto do seu. Em `startMatch`, aliados e inimigos nascem com poder ≈ o seu (±5% sorteado por bot); o log mostra os números. Teste unitário: rivais dentro de ±12% do alvo (níveis 10, 15, 25, as 4 classes); e2e: ±15% nos modos 2×2 e 4×4.
- **Efeito:** um personagem com pontos por distribuir, ou equipamento fraco, enfrenta bots equivalentes (antes: 325 × 771). Em contrapartida, **"poder alto" já não garante vitória contra bots**; a habilidade e a composição de time decidem. Quando houver jogadores reais (camada B), troca-se o gerador por busca de adversário (`matchOk`).

### 10.4 P1 — estabilidade de combate e classes (2026-10-31)
- **Feito e testado:** passo fixo de 60 Hz (FIXED_DT em main.js); eventos de combate; visuais com RNG próprio e desligáveis; 17 testes novos (determinismo com Math.random bloqueado, skills, status, cooldown, morte, Clérigo em grupo); Luz Sagrada cura aliados (70%) e Escudo Divino protege o aliado mais próximo (60%); PvP entre heróis com dano ×0,32 (era ×0,45).
- **Equilíbrio (taxa média de vitória, 30 duelos/par; Guerreiro/Mago/Arqueiro/Clérigo):** nível 5: 51/52/43/46% · **nível 10: 52/49/49/50%** · nível 20: 41/39/59/46%. Duelos de 14–38 s. **Dentro da meta no nível 10; fora no nível 5 (Arqueiro) e 20 (Guerreiro, Mago, Arqueiro); Guerreiro ainda duela < 20 s.** Limite de 3 rodadas de ajuste atingido; o resto fica para P1.5 (junto com as especializações).

### 10.5 P1.5 — especializações de classe (2026-10-31)
- **Implementado e testado:** `data/specs.js` + `core/specs.js`. Nível **15**; **2 por classe** (Guerreiro: Bastião/Carrasco · Mago: Piromante/Criomante · Arqueiro: Atirador/Caçador · Clérigo: Guardião/Inquisidor). Só **ajustam parâmetros** de habilidades que a classe já tem (nenhuma nova, nenhuma removida; o teste confere campo a campo). Primeira escolha **grátis**; trocar custa ouro (150 + 25×nível). Painel do personagem mostra as duas opções; dicas, recarga na barra, IA dos bots e simulação usam a habilidade especializada; rivais/aliados de nível 15+ vêm com especialização.
- **Testes:** 89 unitários (8 novos em `tests/specs.test.js`) e 51 e2e (3 novos em `tests/e2e/especializacao.spec.js`) passam.
- **Equilíbrio medido (taxa média de vitória; Guerreiro/Mago/Arqueiro/Clérigo; passo fixo 60 Hz):** nível 5: 58/60/48/44% · nível 10: 50/46/56/51% · **nível 20 (as duas especializações alternadas): 50/46/49/46%**. Por especialização no nível 20: índice 0 (Bastião/Piromante/Atirador/Guardião) 50/48/52/47%; índice 1 (Carrasco/Criomante/Caçador/Inquisidor) 43/48/53/52%. **Nível 20 na meta; nível 10 quase (Arqueiro 56%); nível 5 fora (Guerreiro 58, Mago 60, Clérigo 44).** Duelos 14–37 s; o do Guerreiro continua < 20 s. Limite de 3 rodadas na especialização + 1 correção de regressão; nível 5 fica como pendência.
- **Correção encontrada pela captura de tela:** o crescimento fracionário mostrava "Vitalidade 48.1999999…" no painel; atributos agora têm 1 casa decimal (com teste).

### 10.6 P3 — salvamento versionado (2026-10-31)
- Documento do personagem na **versão 2** (ratings por modo e especialização), migração a partir de saves v1 e saves sem versão, validação com lista branca, backup e recuperação, exportar/importar. Detalhes e limites (validação local não é anti-trapaça) em `docs/roadmap/auditoria-p0-e-plano-multiplayer.md` (atualização P3).
- **Testes:** 101 unitários e 56 e2e passam (última execução completa).

### 10.7 P4 — servidor autoritativo (PoC), 2026-10-31
- `ws` + protocolo JSON v1 + sala de duelo para 2 jogadores reais com a simulação do jogo; detalhes, limites e como rodar em `docs/architecture/servidor-poc.md` e decisão 0008. **118 unitários e 57 e2e passam.** Sem contas/persistência (P5); sem teste de carga ou rede real.

### 10.8 P5 — contas e persistência (2026-10-31)
- Conta obrigatória (login por e-mail/senha e Google), até 4 personagens por conta, nuvem com revisão e plausibilidade, recompensas de duelo gravadas pelo servidor. **142 unitários e 63 e2e** (ver relatório). Detalhes e limites: decisão 0009.
