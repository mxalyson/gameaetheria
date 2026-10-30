# Aetheria — Migração para a visão Isométrica HD Anime Fantasy
**Fase 0 — Diagnóstico técnico e plano de execução**
Data: 30/10/2026 · Estado do código: commit `70699d2` · Autor: Claude (Fase 0, somente leitura e medições)

> Esta fase **não alterou** renderer, simulação, saves nem dependências. Só criou documentação e um backup.
> Legenda de evidência: **[MEDIDO]** número obtido nesta sessão · **[LIDO]** confirmado no código · **[ANÁLISE]** raciocínio meu, não medido · **[NÃO VERIFICADO]** depende de algo que não testei.

---

## 1. Resumo executivo

1. **A simulação não precisa mudar para a isometria.** `sim.js`, `ai.js`, `layout.js` e todo `core/` trabalham exclusivamente no plano do mundo (x, y), com ângulos por `atan2` nesse plano. A câmera isométrica pode ser uma *projeção de visualização* do mesmo plano. [LIDO]
2. **A mudança é grande, mas concentrada**: `renderer.js` (894 linhas), `scenery.js` (572) e três pontos de entrada de coordenadas de tela (`main.js`, `input.js`, `touch.js`). [LIDO]
3. **O maior risco não é técnico, é artístico.** Spritesheets HD anime em 8 direções com animações consistentes não são algo que eu consiga produzir por código no nível pedido. Preciso de uma decisão sua sobre o caminho de produção de arte antes da Fase 2 (seção 9). [ANÁLISE]
4. **Memória de texturas é o gargalo escondido**: um conjunto completo 8 direções em HD passa de ~200 MiB. Exige orçamento e carregamento por zona (seção 8). [ANÁLISE com contas mostradas]
5. **Canvas 2D não está descartado.** Numa GPU Intel UHD (a deste PC), uma cena isométrica sintética com 300 sprites + sombras + partículas rodou a 58 FPS em 720p e 45 FPS em 1080p, sem nenhuma otimização. PixiJS provavelmente rende mais, mas **não medi** (não instalei nada). Recomendo decidir por número, com uma prova de conceito dos dois (seção 7).
6. **Estado inicial é saudável**: 31/31 testes unitários e 13/13 no navegador passando; Git limpo; backup novo criado.

---

## 2. Estado atual e proteção do projeto

### 2.1 Verificações feitas [MEDIDO / LIDO]
| Item | Resultado |
|---|---|
| Branch / último commit | `master` / `70699d2` |
| `git status` | limpo, exceto o arquivo **não rastreado e não criado por mim**: `Novo(a) Documento de Texto.txt` (intocado) |
| Stash | vazio |
| Backup antigo | `H:\aetheria-backups\aetheria-pre-fase1-20261030.zip` íntegro (27 entradas), **mas só cobre o estado anterior à Fase 1** |
| **Backup novo** | `H:\aetheria-backups\aetheria-pre-isometrico-20261030.zip` (316.906 bytes, 96 entradas, inclui `.git`, exclui `node_modules`, `test-results` e o arquivo solto) |
| `npm test` | **31 de 31** passando (≈0,8 s) |
| `npm run test` | é o mesmo comando de `npm test` neste `package.json` (não existe script `test` separado). O de navegador é `npm run test:e2e` |
| `npm run test:e2e` | **13 de 13** passando (≈1,1 min) |
| Tag de segurança | `pre-isometrico-20261030` criada no commit `70699d2` (ver 12) |

Observação: os números do plano (25 unitários e 6 de navegador) eram da auditoria anterior. O estado atual é **31 e 13**, porque desde então foram adicionados testes de layout, toque e protótipo.

### 2.2 Protótipo Vale de Auren (rejeitado) [LIDO]
Rastreado pelo Git (5 arquivos): `public/vale.html`, `public/src/render/vale.js`, `public/src/game/iso-hero.js`, `tests/e2e/vale.spec.js`, `tests/iso-hero.test.js`.
- Não é importado por `main.js`. ✔
- **Acoplamento a vigiar:** `vale.js` importa `shade` de `renderer.js`. Se o renderer for reescrito e esse export sumir, o protótipo arquivado quebra (e 4 testes de navegador + 6 unitários com ele). Regra proposta: manter o export ou copiar a função para dentro do protótipo **com sua autorização**.
- Hoje seus testes rodam junto da suíte principal. Proposta de arquivamento (não executada): ver seção 11.

### 2.3 Divergência de nomes de documentação
O plano cita `docs/art/`. O projeto tem `docs/art-direction/`. Proponho manter `docs/art-direction/` como oficial (evita quebrar links) e **você decide** se prefere renomear.

---

## 3. Arquitetura atual relevante para a isometria [LIDO]

```
Entrada (teclado/mouse/toque)  ->  intenção {mx,my,aimX,aimY,attack,cast}
        |                                   (coordenadas de MUNDO)
        v
World.update(dt, intents)  [sim.js + ai.js + layout.js]   <- só plano x,y
        |  estado: actors, projectiles, areas, telegraphs, drops, fx, particles, texts
        v
Renderer.draw(world, cam, view)   [renderer.js + scenery.js]  <- único que conhece a tela
```

Pontos de contato com coordenadas de tela (tudo o que precisa mudar):

| Arquivo | Onde | O que faz hoje |
|---|---|---|
| `main.js` | `step()` | mira = `mouse + cam` (soma simples) |
| `main.js` | `frame()`/`enterZone()` | `renderer.camera()`, suavização linear da câmera, câmera da tela de título |
| `input.js` | listeners de mouse | guarda `clientX/Y` (tela) |
| `touch.js` / `touch-logic.js` | joystick | converte arrasto de tela **direto** em `mx,my` do mundo (isso passa a exigir conversão) |
| `renderer.js` | `camera()`, `draw()`, `drawMinimap()`, `resize()` | tudo; 28 funções de desenho |
| `scenery.js` | chão, decoração, atmosfera | desenho top-down específico |
| `ui/ui.js` | tooltips | usa `clientX/Y` de eventos DOM (não depende do mundo) |

Fora do renderer, **nenhum** arquivo de simulação lê câmera, largura ou altura de tela.

### 3.1 O que é e não é reaproveitável
| Reaproveitável como está | Precisa ser refeito |
|---|---|
| `core/*`, `data/*`, `sim.js`, `ai.js`, `layout.js` (posições e colisões) | `renderer.js` (desenho de heróis, monstros, decoração, projéteis, barras) |
| Save (`char` em JSON), UI em DOM, loja, inventário | `scenery.js` (pintura de chão e objetos top-down) |
| Controles de toque, preferências, qualidade gráfica (já entregues) | Câmera, conversão de coordenadas, minimapa |
| Atmosfera em tela (tom, vinheta, nevoa, partículas flutuantes) | Ordenação de profundidade e ocultação de objetos |
| Geração determinística de layout (trilhas, lagoas, extras) | Arte de todos os personagens, monstros, spirits, NPCs |

---

## 4. Como a isometria entra sem tocar na simulação

### 4.1 Projeção
O mundo continua um plano (x, y). A tela é uma projeção afim desse plano:

```
sx = (x - y) * A * zoom        sy = (x + y) * B * zoom        (A, B definem o ângulo)
```
- **2:1 (dimétrica)**: `B = A/2` (ângulo ≈ 26,57°). Matemática simples, padrão em jogos 2D isométricos.
- **30° (isométrica "técnica")**: `B = A * 0,577`. Mais "real", razão largura:altura ≈ 1,73:1.
O ângulo deve ser **um parâmetro** (`ISO_TILT`) para comparar visualmente no protótipo. Recomendo 2:1 como ponto de partida. **Decisão sua** após ver as duas capturas.

Consequências diretas [ANÁLISE]:
- A zona retangular vira um **losango** na tela. Limites de câmera, anel de árvores e minimapa precisam ser repensados.
- Círculos de colisão e alcance (raios de skill, telegraphs, anéis) viram **elipses** na tela. Isso é correto e esperado.
- Um objeto de 1 unidade andando em x ou y desloca 1,12× mais pixels na horizontal que na vertical (efeito natural da projeção).

### 4.2 Estratégia de duas camadas (a ideia que mais reaproveita código)
1. **Camada de plano do chão:** tudo que "deita no chão" (chão pintado, anéis de skill, telegraphs, áreas, decais, círculos de aviso, sombras) é desenhado com `ctx.setTransform` da projeção. O código de desenho atual desses elementos (círculos, arcos) quase não muda.
2. **Camada de billboards:** sprites de personagens, monstros, árvores e construções são desenhados **sem** transformação, ancorados no ponto projetado dos pés (pivô).
Isso separa o que é "geometria do chão" do que é "arte vertical".

### 4.3 Entrada: conversão de coordenadas (fora da simulação)
- `screenToWorld(px, py)` (inverso da projeção, no plano do chão) para a mira do mouse.
- `screenDirToWorld(dx, dy)` para WASD e joystick. **Decisão sua:** WASD relativo à **tela** ("W sobe na tela", padrão em ARPGs isométricos; no mundo é a diagonal `(-1,-1)`) ou relativo aos **eixos do mundo**. Recomendo relativo à tela; é o que a Vale já fazia.
- Direção do sprite: projetar o vetor de `facing` e escolher 1 de 8 setores. (`worldAngle -> screenAngle -> setor`.) Função pura, testável em Node.
- **Risco de mira com o mouse:** o cursor sobre o *tronco* de um monstro aponta, no chão, um ponto **atrás** dele (o sprite é alto). Mitigação: teste de acerto no retângulo do sprite para escolher o alvo e mirar nos pés; cone de assistência de mira.

### 4.4 Profundidade e ocultação
- Hoje: itens ordenados só por `y`. [LIDO]
- Isométrico: chave `x + y` para pontos; **objetos com pegada (casas, pilares) exigem ordenação por retângulo de base** (regra de "A está atrás de B se A.maxX ≤ B.minX ou A.maxY ≤ B.minY"). Objetos grandes podem precisar ser fatiados.
- As casas são retângulos alinhados aos eixos do mundo: viram **caixas isométricas** naturalmente. [ANÁLISE]
- Ocultação: generalizar a lógica `behind` atual das árvores (transparência quando o jogador está atrás) para teste de sobreposição em tela.
- Teste automatizado: cenas sintéticas com ordem conhecida (jogador antes/depois de árvore, casa, pilar).

### 4.5 Elevação (altura)
A simulação é **plana** (não há eixo z). Dois caminhos:
- **A. Elevação só visual** (penhascos nas bordas, platôs decorativos). Não mexe em gameplay. Recomendado.
- **B. Elevação com regra** (degraus, quedas, rampas). Exige novo eixo e colisões na simulação. Fora deste plano, a menos que você peça.

### 4.6 Câmera
Seguimento suave (hoje: interpolação linear fixa `dt*8`), antecipação na direção do movimento, zoom configurável (preferência salva), limites pelo losango da zona (foco limitado ao retângulo do mundo, com margem), título com câmera automática. Funções puras (`followStep`, `clampFocus`) testáveis em Node.

### 4.7 Minimapa
Sugestão: manter **vista de cima** no minimapa (legibilidade) e colocar o losango como opção. **Decisão sua.**

### 4.8 Efeitos visuais dentro da simulação
`World` guarda `fx`, `particles` e `texts` e os atualiza (`updateVisuals`). É apresentação dentro da simulação. [LIDO]
Para a nova direção convém um **sistema de efeitos separado**, alimentado pelos eventos da simulação, com eixo vertical (`z`) próprio para faíscas subindo. Isso **é uma refatoração**, com risco médio. Plano: manter como está no protótipo e migrar na Fase de combate, com testes.

### 4.9 Sincronia entre animação e dano (ponto crítico)
Hoje o dano é aplicado **no instante do comando** (`sim.js`), e a animação só acompanha. [LIDO]
Seu critério pede "nenhum dano visualmente desconectado do golpe". Opções:
- **(a) Dado `hitAt` por ataque/skill** (ms até o impacto), com a simulação resolvendo o dano nesse instante. Muda o *tempo* do jogo (atraso pequeno) e exige testes novos e cancelamento por atordoamento. Recomendado para o jogador.
- **(b) Só visual:** atrasar números, flash e partículas até o frame de impacto. A barra de vida já caiu no comando (diferença de ~100–200 ms).
**Decisão sua**, na fase de combate. Não alterarei números de balanceamento sem proposta.

---

## 5. Sistemas afetados (matriz)
| Sistema | Impacto | Observação |
|---|---|---|
| Combate (regras, alcance, arcos) | **Nenhum** na regra | Geometria permanece no plano. Visual vira elipse. |
| IA | **Nenhum** | Só coordenadas de mundo. |
| Colisões e navegação | **Nenhum** | Círculos e retângulos do mundo. |
| Layout/decoração | **Nenhum** nos dados | A arte dos objetos é refeita. |
| Mira (mouse/toque) | **Alto** | Inverso da projeção + seleção de alvo. |
| Movimento (WASD/joystick) | **Médio** | Conversão tela→mundo. |
| Habilidades (dash, blink, projéteis) | **Baixo** | Rastros e anéis desenhados no plano projetado. |
| Portais e limites de zona | **Médio** | Zona vira losango; câmera e margem. |
| Minimapa | **Médio** | Decisão de vista. |
| HUD/UI em DOM | **Baixo** | Ancorada à tela, independente da câmera. Textos flutuantes passam a usar a projeção. |
| Toque/Android | **Médio** | Joystick precisa da conversão; auto-mira usa mundo (já ok). |
| Save | **Nenhum** | Nova aparência/equipamento visível só com plano de migração. |
| Multiplayer (futuro) | **Positivo** | Simulação segue desacoplada da câmera. |

---

## 6. Dependências entre módulos propostas (alvo)
Módulos **puros** (testáveis em Node, sem DOM): `iso.js` (projeção, profundidade, setor de direção), `camera.js` (seguir, suavizar, limitar), `anim.js` (estado do ator → clipe/quadro), `input-map.js` (tela→mundo).
Módulos com DOM/canvas: backend de desenho, carregador de atlas, efeitos, UI.
Regra do plano respeitada: **nenhuma regra de gameplay dentro de sprites ou componentes visuais.**

---

## 7. Avaliação técnica: Canvas 2D × PixiJS

### 7.1 Medições [MEDIDO] — máquina de desenvolvimento
Hardware de teste: GPU **Intel UHD Graphics (integrada)**, Chromium com ANGLE/Direct3D11. Por padrão o Chromium do Playwright usa **renderização por software** (SwiftShader), o que dá números muito piores; os meus testes anteriores de desempenho foram nesse modo, ou seja, **pessimistas**.

Cena sintética: chão 2800×1900 com transformação afim isométrica, N sprites (spritesheet 8 quadros) com sombra elíptica, ordenação por profundidade, 300 partículas aditivas. FPS reais em laço de animação:

| Resolução | Quadro | 100 sprites | 300 sprites | 600 sprites |
|---|---|---|---|---|
| 1280×720 | 128 px | 75,7 | 58,0 | 34,8 |
| 1920×1080 | 128 px | 59,6 | 44,8 | 28,4 |
| 1920×1080 (DPR 2) | 128 px | 52,4 | 42,8 | 29,8 |
| 1920×1080 | 192 px | 45,0 | 47,4 | 34,5 |

Ressalvas: uma execução por célula (ruído visível: 192 px/100 sprites ficou abaixo de 300); cena sintética (sem lógica de jogo, sem troca de atlas); o chão é um bitmap único redesenhado todo quadro (otimizável com *chunks*); em software, as mesmas cenas ficaram em 10–265 ms por quadro.
Simulação pura (Node) [MEDIDO]: 25 atores 0,36 ms · 91 atores 1,5 ms · 188 atores 3,1 ms · 394 atores 8,3 ms por passo (crescimento acima do linear).

### 7.2 Comparação
| Critério | Canvas 2D (atual) | PixiJS |
|---|---|---|
| Qualidade de sprites | Boa; escala suave com `imageSmoothingQuality`; risco de borrão se escalar mal | Equivalente (texturas na GPU); mipmaps/filtros mais controlados [NÃO VERIFICADO] |
| Camadas / ordenação | Manual (ordenar e desenhar) | Contêineres e z-ordem prontos; ordenação isométrica ainda é nossa |
| Partículas | Custo alto com muitos arcos/blend aditivo [MEDIDO indiretamente] | Em geral muito melhor com lotes (batching) [NÃO VERIFICADO aqui] |
| Iluminação | Sobreposição em Canvas (camada escura com "buracos") | Filtros/shaders (mais poderoso e barato) [NÃO VERIFICADO] |
| Desempenho | 45–58 FPS em UHD integrada com 300 sprites (sem otimizar) | Esperado maior teto; **não medido** |
| Manutenção | Zero dependências, tudo nosso | Dependência externa; API própria; atualizações |
| Integração | Já integrado | Novo backend + migração de texto/efeitos; UI em DOM não muda |
| Risco | Teto de desempenho em partículas/luz | Mudança grande de infraestrutura; Android depende de WebGL |

### 7.3 Recomendação
1. **Protótipo (Fase 1) com uma interface de backend de desenho** (`drawSprite`, `drawGroundPlane`, `drawGlow`...) implementada **primeiro em Canvas 2D**, sem instalar nada.
2. **Prova de conceito de PixiJS isolada** (pasta `public/labs/` ou similar, com `npm install` só ali, **mediante sua aprovação explícita**), rodando a **mesma cena**, para comparar FPS e qualidade lado a lado.
3. **Critério de decisão (proposto, a confirmar):** a meta é **60 FPS em 1080p na Intel UHD com ≈150 sprites e ≈200 partículas, e ≥30 FPS no pior caso (≈600 sprites)**. Se o Canvas 2D otimizado (chunks do chão, sprites de brilho no lugar de arcos, *culling*) atingir a meta, **fica Canvas 2D**. Caso contrário, PixiJS.
Não migro para PixiJS automaticamente.

---

## 8. Pipeline de sprites: proposta e orçamento de memória

### 8.1 Convenções propostas (a validar no personagem de referência)
| Item | Proposta |
|---|---|
| Direções | 8 (N, NE, L, SE, S, SO, O, NO). Opção de **5 desenhadas + 3 espelhadas** para metade do custo (exige personagem simétrico ou arma ajustada) |
| Direção frontal padrão | **Sul** (para baixo na tela) |
| Pivô | centro dos pés, na base do quadro (ex.: `x = largura/2`, `y = altura - 8`) |
| Resolução de referência | personagem ≈ 110–130 px de altura em zoom 1 |
| Quadro | 160×160 px (heróis), 128×128 px (monstros comuns), maiores para chefes |
| Formato | PNG com alfa não pré-multiplicado, atlas por classe/espécie + `.json` de metadados (quadros, FPS, pivô, âncoras de arma/magia) |
| Nomes | `hero_mage/walk/dir_se/0003.png` ou atlas `hero_mage.png` + `hero_mage.json` |
| Âncoras | pontos nomeados por quadro: `hand_r`, `staff_tip`, `head`, `feet` (para efeitos saírem do lugar certo) |

### 8.2 Contas de memória [ANÁLISE; aritmética mostrada]
RGBA = 4 bytes por pixel. Quadro 160×160 = 25.600 px = **100 KiB**. Quadro 128×128 = 16.384 px = **64 KiB**.
- Mago, 60 quadros por direção (idle 6, walk 8, run 8, attack 8, skill 10, dodge 6, hit 4, death 10) × 8 direções = 480 quadros × 100 KiB ≈ **47 MiB**; com 5 direções + espelho: 300 quadros ≈ **29 MiB**.
- 4 classes (espelhado) ≈ **117 MiB**.
- 9 espécies de monstro × (34 quadros × 5 direções) × 64 KiB ≈ **95 MiB** (sem chefes).
- Total sem chefes, NPCs, spirits e cenário ≈ **>210 MiB**. Em GPU integrada com memória compartilhada e em celulares, é pesado.
Mitigações: carregar só os monstros da zona atual (≈3 espécies ≈ 32 MiB), recortar bordas transparentes no atlas, reduzir quadros (walk 6), 4 direções + espelho para monstros, orçamento fixo (proposto: **≤150 MiB de texturas simultâneas**).
Atlas grandes têm limite de tamanho por textura (típico 4096–8192 px; varia por aparelho) [NÃO VERIFICADO].

---

## 9. Produção de arte: o ponto que exige sua decisão

Você pediu sprites originais com qualidade **anime HD**. Preciso ser direto sobre o que consigo e não consigo:

| Caminho | O que é | Prós | Contras / limite honesto |
|---|---|---|---|
| **A. Sprites gerados por código** (desenho vetorial em camadas, "assado" em spritesheet) | Eu escrevo o gerador. Dá para ter 8 direções e animações consistentes. | Controle total, sem custo externo, licença própria, reprodutível | Nível visual: **estilizado/vetorial** (como a figura do Vale, só que melhor). **Não** chegará a "anime HD de ilustrador". Rosto e cabelo são o ponto mais difícil. |
| **B. Imagens por IA** (você já tem as skills `nano-banana-pro`, `fal-ai`, `openrouter-img`) | Gerar conceito ou quadros | Visual rico rápido para **conceito** | Consistência entre 8 direções e entre quadros de animação costuma ser ruim; exige limpeza manual; precisa de chave de API e custo; **licença de uso comercial do que é gerado varia por provedor [NÃO VERIFICADO]**; não uso credenciais sem sua autorização |
| **C. Modelo 3D renderizado em sprites** (Blender) | Modelar/rigar um personagem e renderizar 8 direções × animações em sprites | Consistência perfeita entre direções; animações reaproveitáveis | Blender não está instalado; modelagem e rig são trabalho pesado; modelos de terceiros/IA e animações (ex.: Mixamo) exigem checar licença [NÃO VERIFICADO]. **Contraria ressalvas anteriores sobre 3D**, mas aqui o 3D só vira sprite, o motor continua 2D. |
| **D. Artista ou pacote licenciado** | Contratar ilustrador/animador ou comprar assets com licença comercial | Maior qualidade possível | Custo e prazo; integração do pipeline por mim |

Recomendação: **Fase 1 usa o caminho A como "andaime técnico"** para validar câmera, profundidade, animação, atlas e desempenho (arte-agnóstico). Em paralelo, um **teste de viabilidade de arte** (um único personagem, um caminho de cada vez) para você escolher o caminho definitivo **antes** da Fase 2. Não declaro nenhum sprite "HD anime aprovado" sem sua aprovação visual.

---

## 10. Plano do protótipo visual (Fase 1) — proposta, não executada

**Localização:** `public/labs/iso-poc/` (pasta isolada; **não importada** por `main.js`).
**Uso do jogo real (somente leitura):** o protótipo importa `World`, `makeHeroActor`, `makeMobActor` e `CLASSES` para provar que a simulação existente alimenta a visão isométrica **sem modificá-la**.
**Entregas (as 13 do seu plano):**
1. Cenário isométrico com chão, profundidade e perspectiva; 2. vegetação e elementos ambientais; 3. Mago anime fantasy (caminho A como andaime); 4. idle; 5. caminhada; 6. movimento em 8 direções (WASD relativo à tela); 7. um inimigo (monstro real do jogo); 8. animação de ataque; 9. uma habilidade mágica (Bola de Fogo real); 10. partículas e impacto; 11. HUD básica de vida e skills; 12. câmera acompanhando; 13. comparação 2:1 × 30° e Canvas 2D × (PixiJS, se aprovado).
**Critérios de aceitação:** executa localmente; movimento funciona; animações reais; leitura isométrica convincente; ataque e habilidade funcionam **com a simulação real**; zero erros no console; documentação da tecnologia; comparação visual e técnica; medição de FPS na Intel UHD (com GPU habilitada) e em software.
**Testes:** unitários para `iso.js`, `camera.js`, `input-map.js`, `anim.js` (puros); navegador para profundidade, mira e FPS.
**Tempo estimado:** [ANÁLISE] médio (≈1–2 semanas de trabalho focado), dependente da arte do andaime.

---

## 11. Arquivamento do protótipo Vale (proposta, aguardando aprovação)
Hoje o Vale está espalhado em 5 arquivos e roda nos testes principais. Proposta que preserva histórico e permite recuperar:
1. `git mv public/vale.html archive/vale-de-auren/vale.html` (idem os demais), mantendo histórico do Git.
2. Ajustar os imports internos e criar `archive/vale-de-auren/README.md` ("protótipo rejeitado em 30/10/2026; não integrar").
3. Excluir `archive/` da suíte principal (configuração de testes), e rodá-lo só sob comando explícito.
4. Tag Git `vale-de-auren-arquivado`.
**Não executo sem sua autorização.** Alternativa: deixar como está, só documentado.

---

## 12. Riscos
| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| R1 | Arte HD anime em 8 direções não alcançada por código | **Alto** | Decisão de caminho (seção 9) antes da Fase 2; andaime separado da arte final |
| R2 | Memória de texturas >200 MiB | Alto | Orçamento, 5 direções + espelho, carga por zona |
| R3 | Canvas 2D insuficiente com luz/partículas em UHD | Médio | Meta numérica; otimizações; PoC PixiJS |
| R4 | Mira imprecisa com mouse (sprites altos) | Médio | Seleção por retângulo + assistência |
| R5 | Ordenação de profundidade com objetos grandes | Médio | Regra de pegada, fatiamento, testes sintéticos |
| R6 | Dano desconectado da animação | Médio | `hitAt` (decisão na fase de combate) |
| R7 | Efeitos dentro da simulação | Médio | Sistema de efeitos separado, migração com testes |
| R8 | Quebra do protótipo Vale por mudança no renderer | Baixo | Manter/copiar `shade`; testes já cobrem |
| R9 | Perder o trabalho de cenário top-down recém-feito | Baixo (aceito) | Layout (dados) é reaproveitado; só a pintura é refeita |
| R10 | Tempo de produção de arte ser o gargalo | **Alto** | Fases por personagem; Mago como referência antes de replicar |
| R11 | Save/compatibilidade | Baixo | Isometria não altera o save; aparência futura com migração |

## 13. Estratégia de migração e rollback
**Migração em estrangulamento (strangler):** durante a transição, o renderer atual (top-down) continua o padrão; o novo vive em `labs/` e depois atrás de uma preferência de desenvolvimento (`view: topdown | iso`). Isso é uma **ajuda técnica temporária**, não "misturar estilos" num mesmo quadro. Só com sua aprovação (Fase 3) o iso vira padrão; o top-down só é removido com autorização.
Ordem: (1) módulos puros + testes → (2) protótipo isolado → (3) personagem de referência → (4) integração no jogo atrás de preferência → (5) combate/efeitos → (6) demais classes e monstros → (7) cenário por zona → (8) padrão e remoção do legado (com autorização).

**Rollback:**
- Tag Git `pre-isometrico-20261030` (commit `70699d2`) e backup `H:\aetheria-backups\aetheria-pre-isometrico-20261030.zip`.
- Um commit por fase; nada de `reset --hard`/`clean`; reverter com `git revert` ou voltar à tag.
- Simulação intocada nesta migração ⇒ rollback visual não afeta saves.
- Testes de regressão da simulação (`tests/core.test.js` etc.) devem passar **antes e depois** de cada fase.

## 14. Decisões que preciso de você
1. **Caminho de arte** (seção 9): A (código), B (IA), C (3D→sprite), D (artista/pacote) ou combinação.
2. **Ângulo**: 2:1 ou 30° (decidir vendo as capturas do protótipo; ambos serão implementados atrás de um parâmetro).
3. **WASD/joystick** relativos à tela (recomendado) ou ao mundo.
4. **Autorizar `npm install pixi.js` somente dentro de `public/labs/`** para a prova de conceito (hoje: **não instalado**).
5. **Minimapa**: manter vista de cima (recomendado) ou losango.
6. **Elevação**: só visual (recomendado) ou com regras.
7. **Sincronia dano×animação**: `hitAt` na simulação (recomendado) ou só visual.
8. **Arquivar o Vale** em `archive/` (seção 11) ou deixar como está.
9. **`docs/art/`** ou manter `docs/art-direction/`.
10. **Meta de desempenho** (seção 7.3): confirmar ou ajustar.

## 15. Anexo: medições brutas [MEDIDO]
- Simulação (Node, bosque, jogador atacando e andando): atores / mediana / p95 / máx (ms): 25 / 0,363 / 1,136 / 6,479 · 91 / 1,474 / 2,445 / 13,330 · 188 / 3,110 / 3,596 / 5,501 · 394 / 8,339 / 11,277 / 25,774.
- Renderizadores detectados: software = ANGLE/Vulkan **SwiftShader**; GPU = ANGLE **Intel(R) UHD Graphics (0x9A78) Direct3D11**.
- Comparação de uma cena de 400 sprites 128 px em 720p: software 45 ms/quadro; Intel UHD 20,2 ms/quadro (com leitura de pixels forçando sincronia, o que superestima).
- Não medidos: PixiJS; memória real de texturas; aparelhos móveis; GPU dedicada.

---

## 16. Atualização pós-PoC (30/10/2026)
Resultados completos: `docs/roadmap/iso-poc-report.md`. O que muda neste plano:
- **Seção 1, item 5 e seção 7 (Canvas × PixiJS):** o Canvas 2D foi medido na GPU Intel UHD e atingiu a meta em 1080p (75 FPS em uso; 64 FPS com 120 monstros; 39–46 FPS em 4K). PixiJS continua **não medido**; a recomendação passa a ser **adiar** o PoC de PixiJS (decisão 0005, em proposta).
- **Nova regra de desempenho:** `imageSmoothingQuality = 'low'` sempre. Com `high`/`medium` o desempenho cai ~14×.
- **Seção 4.9 (sincronia animação × dano):** o PoC provou que dá para sincronizar sem alterar a simulação (o comando vai à simulação no quadro de disparo da animação). Isso é um atraso de gameplay; o desenho definitivo é um dado `hitAt` por ataque/skill na simulação, com testes. **Os monstros ainda não têm isso.**
- **Seção 4.8 (efeitos):** o PoC leu `fx`, `particles`, `projectiles` e `texts` direto do `World` sem problemas; a separação de efeitos continua recomendada para a fase de combate, não é bloqueio.
- **Novo achado:** a simulação remove o monstro 0,6 s após a morte; o renderer precisa de "fantasmas" para animações de morte mais longas (implementado e testado no PoC).
- **Seção 8 (memória de texturas):** confirmada na prática (Mago ≈60 MiB a 1,5×, ≈107 MiB a 2×); o custo cresce com o quadrado da resolução.
- **Seção 9 (arte):** o caminho A (código) **não** atingiu "anime HD" para heróis; serve de andaime e para criaturas simples. Decisão de arte continua em aberto e é o maior risco.
- **Seção 14 (decisões):** itens 1 (arte), 2 (ângulo), 4 (PixiJS) e 7 (`hitAt`) têm agora evidências; ver seção 10 do relatório do PoC.

