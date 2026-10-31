# Personagens em miniatura — estado e pipeline (2026-10-30)
Decisão: `docs/decisions/0006-miniatura-e-arte-nao-procedural.md`. Fichas de design (briefing): `public/labs/iso-poc/src/sprites/designs.js`.

## Estado (honesto)
| Personagem | Conceito 2D | 3D | Render 8 dir. | Atlas (5 clipes) | Observação |
|---|---|---|---|---|---|
| Aprendiz Arcano | sim | sim (Lite, texturizado) | sim | sim | chapéu grande cobre parte do rosto |
| Franco-atirador | sim | sim | sim | sim | aba do boné esconde rosto a 30° |
| Paladino | sim | sim | sim | sim | o mais fiel ao conceito |
| Sacerdote | sim | sim (Lite) | sim | sim | cores mais brancas/douradas que o conceito (aceito pelo proprietário); pedestal removido por corte a 3,5% |
| Místico | **não** | **não** | **não** | **não** | pendente |

Classificação: **implementado e testado** (atlas e fichas, `tests/chibi-art.test.js`); **validado visualmente** apenas no viewer do laboratório (`atlas-view.html`); **não integrado ao jogo** (nenhum arquivo de `public/src/` mudou).

## Pipeline
1. Conceito 2D e GLB no Meshy (conta do proprietário). Baixar o GLB exige plano com download; o modelo em alta (1,3 M faces) não pôde ser baixado no Free, a versão **Lite** pôde.
2. Copiar o GLB para `public/labs/iso-poc/art-local/<id>.glb` (fora do Git).
3. `npm start` e `node public/labs/iso-poc/tools/bake-atlas.mjs <id> 160 [corte]` (GPU por padrão; `SOFTGL=1` usa software, ~1,2 s/quadro). Saída: `art-local/atlas/<id>/{idle,walk,attack,skill,hit}.png` + `<id>.json`.
4. Conferir em `http://localhost:5174/labs/iso-poc/atlas-view.html?clip=walk`.
- `render3d.mjs <id> <tamanho> [corte]` gera só as 8 vistas estáticas.
- Clipes: idle 6, walk 8, attack 6 (release 3), skill 8 (release 4), hit 3 — mesmos nomes de `anim.js`.

## No PoC isométrico (2026-10-30)
`http://localhost:5174/labs/iso-poc/index.html?hero=paladino|aprendiz|franco|sacerdote` troca só o **visual** do herói (a simulação segue sendo a do Mago: skills, dano e recarga reais). Opções: `hsize=1.3` (tamanho do sprite), `herodir=atlas` (animação rígida, sem esqueleto). Sem os arquivos de `art-local/`, volta ao mago desenhado.
- **Testado:** 4 testes e2e novos (`tests/e2e/iso-poc.spec.js`, "herói em miniatura"): atlas carregado, clipes, andar, golpe no quadro de disparo, sem erro de console. Suíte completa: 48 unitários + 24 e2e passando.
- **Visto no navegador:** Paladino, Franco e Sacerdote andando e o Paladino atacando (projétil sai), ~60 FPS no navegador embutido; texturas 56,8 MiB (herói 24,2 + slime 32,6).
- **FPS na GPU (Intel UHD 0x9A78, Direct3D11, sem vsync), 2026-10-30:** `HERO=<id> npx playwright test --config=tests/perf/playwright.config.js` (sem `HERO` = linha de base do mago). "Em uso" = andando e atacando/lançando sem parar, com efeitos. Uma rodada por configuração; a variação entre rodadas é de ~10-15%, então diferenças menores que isso não são conclusivas.
  | Cenário | Mago (base) | Paladino | Aprendiz | Franco | Sacerdote |
  |---|---|---|---|---|---|
  | 720p | 117 | 105 | 93 | 99 | 122 |
  | 1080p | 71 | 61 | 65 | 58 | 73 |
  | 1080p, 40 monstros | 57 | 64 | 68 | 64 | 72 |
  | 1080p, 120 monstros | 51 | 51 | 60 | 50 | 61 |
  | canvas 4K (DPR 2) | 33 | 32 | 36 | 30 | 29 |
  | 720p, 30° | 117 | 116 | 125 | 135 | 110 |
  | 720p, zoom 1,5 | 156 | 125 | 122 | 128 | 133 |
  Leitura: os heróis em miniatura ficam no mesmo patamar do mago desenhado; 1080p em uso fica em ~58-73 FPS (meta: 60) e o pior caso (canvas 4K) em ~29-36 FPS (meta: ≥30; o Sacerdote ficou 1 FPS abaixo, dentro da variação). Sem erros de console em nenhuma das 35 medições.
- **Estresse com as skills + celular emulado (2026-10-30)** — `tests/perf/poc-skills.spec.js`: golpe básico e as 3 skills sem parar (recargas zeradas só no teste), andando, 40 monstros, 6 s por herói. "Celular" = viewport 844×390, DPR 2, toque, CPU 1× e 4× mais lenta (a throttling foi conferida: um laço JS fica ~2,9× mais lento). **A GPU é a mesma Intel UHD do PC: isto NÃO é um celular real.**
  | Condição | Paladino | Aprendiz | Franco | Sacerdote |
  |---|---|---|---|---|
  | Desktop 1080p | 63 | 62 | 69 | 68 |
  | Celular emulado, CPU 1× | 106 | 96 | 115 | 95 |
  | Celular emulado, CPU 4× | 98 | 97 | 105 | 85 |
  - Pico de 3 a 5 efeitos vivos e até 77 partículas; desenho de 1,5 a 5 ms por quadro; sem erros de console.
  - Leitura: o custo de CPU/JS do PoC é baixo, mesmo 4× mais lento. **O que o celular real tende a limitar é a GPU e a memória, que esta emulação não reproduz.** Texturas totais da cena: **72 a 76 MiB** (herói ≈24, **slime ≈32**, cenário ≈20). O atlas do slime pesa mais que o do herói: é o primeiro candidato a corte. Alternativas já prontas: variante espelhada do herói (−37%).
  - **Pendente: medir num celular Android real** (FPS, temperatura e memória), antes de qualquer decisão de portar.
- **Classe real por herói (2026-10-30):** o jogo já tem 4 classes em `data/classes.js` (Guerreiro, Mago, Arqueiro, **Clérigo**). No PoC, `?hero=` escolhe a classe: Paladino = Guerreiro, Aprendiz = Mago, Franco-atirador = Arqueiro, Sacerdote = Clérigo. Ataque básico, skills 1-3, recargas, dano e HUD são os REAIS dessa classe (sem alterar `public/src/`). O Místico não tem classe no jogo (nova, a desenhar).
  | Herói | Básico | Skill 1 | Skill 2 | Skill 3 |
  |---|---|---|---|---|
  | Paladino (Guerreiro) | golpe de espada (corpo a corpo) | Golpe Giratório (onda) | Investida (rasto) | Grito de Guerra (aura) |
  | Aprendiz (Mago) | projétil | Bola de Fogo (magia) | Nova de Gelo (onda) | Teleporte (clarão) |
  | Franco (Arqueiro) | tiro | Chuva de Flechas (chuva na área) | Tiro Perfurante (tiro) | Rolamento (rasto) |
  | Sacerdote (Clérigo) | golpe de maça (corpo a corpo) | Luz Sagrada (coluna de luz) | Escudo Divino (aura/bolha) | Julgamento (raio) |
  As skills de `designs.js` ("Rajada de Runas", "Armadilha de Cristal"...) eram propostas anteriores e **não** foram usadas; vale a classe real do jogo.

## Efeitos dos golpes (PoC, 2026-10-30)
`public/labs/iso-poc/src/vfx.js` — só visual, procedural (os modelos não trazem efeitos), em camadas aditivas sobre o sprite; a simulação não os conhece.
| Herói | Estilo | Efeito no quadro de disparo |
|---|---|---|
| Paladino | `slash` | meia-lua dourada que varre à frente, com cauda e brilho na ponta |
| Aprendiz | `cast` | clarão ciano, anel de energia e fagulhas que se abrem e caem |
| Franco-atirador | `shoot` | clarão no cano, faíscas em leque e rastro do tiro |
| Sacerdote | `pray` | coluna de luz, anel no chão (no plano isométrico) e grãos de luz subindo |
- Habilidade (teclas 1-3) usa o mesmo estilo em versão maior ("big"); o dano ao inimigo ganha faíscas de impacto na cor do herói; o projétil real do Mago é pintado com a cor do herói.
- **Testado:** `tests/vfx.test.js` (4 unitários) e o e2e dos heróis confere que cada golpe cria o efeito do estilo certo. **Visto no navegador:** os 4 estilos + impacto, com a cena parada (`poc.holdVfx`, `poc.spawnVfx`). **Não validado:** o aspecto em movimento a 60 FPS (o navegador embutido rodou a ~10 FPS nesta medição) e o custo por frame.
- Limites: os projéteis são os da simulação (bola brilhante na cor da skill); não há efeito de morte nem de dano recebido pelo herói; Investida/Rolamento/Teleporte têm o rasto/clarão visual mas a animação do herói é a mesma de qualquer skill (não há clipe próprio de dash).

## Morte e dano do herói (PoC, 2026-10-30)
`src/death.js` (módulo puro) + `poc.js`. **Sem texturas novas** (os atlas não ganharam clipe de morte): o sprite real é transformado.
- **Dano recebido:** clipe `hit` (já existente, com clarão branco), faíscas vermelhas no herói e vinheta vermelha na tela (pulso de ~0,45 s).
- **Morte (2,5 s):** sobressalto, o herói tomba 90° em torno dos pés para trás (lado conforme a direção em que olha), amassa ao encostar, levanta poeira (onda cinza), fica deitado, esmaece e solta uma coluna de luz (a "alma"). A vinheta vermelha acompanha. Renasce com uma aura (o ciclo de renascimento é do PoC, `DEATH.total + 0,15 s`; o jogo real tem as próprias regras).
- **Testado:** `tests/death.test.js` (3 unitários) e um e2e (dano → clarão; morte → clipe `hit`, tempo de queda, renascimento sem erro). **Visto:** sequência de 6 instantes do Paladino e do Sacerdote capturada num navegador headless (inclinado aos 0,5 s, deitado aos 1,3 s, esmaecendo com a coluna de luz aos 2,2 s).
- **Limite:** é um tombo 2D de um sprite rígido, não uma animação de queda com esqueleto; de lado (leste/oeste) lê melhor que de frente/costas.

## Peso das texturas (medido, 2026-10-30)
| Versão | Paladino | Aprendiz | Franco | Sacerdote | Como gerar |
|---|---|---|---|---|---|
| Antes (quadro 160×160, 31 quadros, 8 direções) | 24,2 MiB | ≈24 | ≈24 | ≈24 | — |
| **atlas-rig** (quadro recortado, idle 4 + walk 6 quadros) | 20,3 | 17,2 | 20,3 | 16,0 | `RIG=1 node tools/bake-atlas.mjs <id> 160 0` |
| **atlas-rig-m** (+ só 5 direções; O/SO/NO são o espelho de L/SE/NE) | 12,7 | 10,8 | 12,7 | 10,0 | `RIG=1 MIRROR=1 node tools/bake-atlas.mjs <id> 160 0` e `?herodir=atlas-rig-m` |
- O espelho troca a mão da arma nas direções de oeste (a espada do Paladino vai para a outra mão). É decisão de arte/jogo, por isso `atlas-rig` continua o padrão.
- Ainda falta medir FPS oficial com GPU (`perf:poc`) e em celular.
- Corrigido de passagem: `poc.js` criava `iso` só no 1º desenho; um 1º quadro lento quebrava a mira com `iso` indefinido. Agora `iso` nasce no boot.

## Limites conhecidos
- Sem esqueleto: animação rígida, sem braços/pernas; efeitos (brilho, projétil) devem ser procedurais no jogo.
- Enquadramento por personagem: todos ocupam a mesma altura no quadro; o tamanho relativo no jogo terá de ser ajustado por `size`.
- Memória de textura é alta (≈24 MiB por personagem a 160 px); medir antes de integrar, especialmente no celular.
- **Licença: CC BY 4.0** (confirmada pelo proprietário). Atribuição obrigatória: "Personagens gerados com Meshy (CC BY 4.0)". Não esquecer nos créditos do jogo. A origem do "mago Meshy" anterior continua sem resposta.
- Sacerdote: o pedestal é removido com corte a 4% da altura que acompanha o modelo (`tools/bake-atlas.mjs sacerdote 160 0.04`).
- **Mixamo (tentado em 2026-10-30, com falha):** o Paladino foi aceito e carregou com textura (235 mil e depois 40 mil triângulos, via `tools/glb-to-obj.mjs <id> <corte> 40000` + meshoptimizer), mas o auto-rig falhou 3 vezes ("Unknown error while generating motion") e a tela voltou aos marcadores. Causa não identificada: a contagem de polígonos sozinha não explica. Hipóteses: pose fora de T/A, escudo e espada colados ao corpo, peças separadas.
- **Blender (4.2.23 LTS portátil, `H:\aetheria-tools\blender`, baixado de download.blender.org, SHA-256 conferido):** `tools/blender/rig_animate.py` cria esqueleto (a partir de pontos em `tools/blender/specs.json`, medidos na vista frontal de `probe.py`), pesos por cápsula, adereços rígidos e 5 clipes por FK; exporta `art-local/rigged/<id>.glb`. `RIG=1 node tools/bake-atlas.mjs <id> 160 0` gera `art-local/atlas-rig/<id>/`. **Implementado e testado (metadados); revisão visual: Paladino e Aprendiz aceitáveis, Franco com movimento sutil, Sacerdote com rasgos em partes finas (tranças, fitas, cajado) na habilidade.** Pontos de ajuste: pesos, amplitudes por personagem, adereços finos.
- (histórico) Pés e mãos só se movem com **esqueleto** (auto-rig + animações de personagem). Opções: Mixamo (grátis, login Adobe do proprietário, aceita FBX/OBJ) ou Animate do Meshy (créditos; download PRO). Ainda não feito.
- Skills listadas em `designs.js` são **propostas**, não implementadas.
