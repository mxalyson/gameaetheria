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
- **Não medido:** `npm run perf:poc` com o herói novo (a medição de FPS oficial ainda é só do mago).
- **Observação:** as skills 1-3 continuam as do Mago (Bola de Fogo, Nova de Gelo, Teleporte) com o rosto do herói escolhido; as skills de cada classe são propostas em `designs.js`, não implementadas.

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
