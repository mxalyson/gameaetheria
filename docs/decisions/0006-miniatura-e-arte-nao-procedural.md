# 0006 — Personagens em miniatura (caricato) e arte NÃO procedural
Data: 2026-10-30. Status: **decisão do proprietário** (pedido em chat). Substitui, para os personagens jogáveis, a regra "sem chibi" do CLAUDE.md. Não altera 0001, 0004 nem 0005.

## Contexto
O PoC (`docs/roadmap/iso-poc-report.md`) mostrou que heróis desenhados por código não atingem o padrão "HD anime". O proprietário pediu os personagens Aprendiz Arcano, Franco-atirador, Paladino, Sacerdote e Místico em **miniatura/caricato, estilo Summoners War + anime**, originais, detalhados, e **sem formas geométricas desenhadas por código**.

## Decisão
1. Estilo dos personagens: miniatura/caricato (cabeça grande, corpo pequeno, olhos grandes, contorno limpo, brilho). A direção geral 0004 (isométrico HD anime fantasy) continua.
2. Personagens **não são desenhados com primitivas de Canvas** (elipses/polígonos). Vêm de arte real: imagem de conceito → modelo 3D → render em sprites. O código só monta atlas, anima (transformações) e aplica efeitos (brilho, sombra, partículas).
3. Pipeline do laboratório: conceito 2D e GLB gerados no Meshy (conta do proprietário) → `tools/bake-atlas.mjs` (three.js, câmera ortográfica a 30°, 8 direções) → atlas PNG + JSON no formato de `src/atlas.js`.
4. Animação é de **corpo rígido** (balanço, pulo, inclinação, achatar/esticar em torno dos pés). Não há esqueleto; não há movimento de braços e pernas.
5. Mapeamento proposto (não aplicado ao jogo): Aprendiz≈Mago, Franco-atirador≈Arqueiro, Paladino≈Guerreiro, Sacerdote≈Clérigo (novo), Místico (novo).

## Consequências
- Nada em `public/src/` foi alterado; tudo está em `public/labs/iso-poc/` e `docs/`.
- `rig-chibi.js` (rig procedural) foi descartado por esta decisão e não entra no repositório.
- Arte gerada (GLB, atlas, renders) fica em `art-local/` (fora do Git) até a licença ser confirmada. Os conceitos 2D estão em `docs/art-direction/conceitos-meshy/`.
- **Licença:** o proprietário confirmou (2026-10-30) que as saídas do plano Free do Meshy são **CC BY 4.0**: uso permitido, inclusive comercial, **com atribuição** (créditos no jogo: modelos/conceitos gerados com Meshy, CC BY 4.0). Os termos do Meshy podem mudar; guardar uma captura da página do modelo ao publicar. Com a licença definida, atlas e conceitos podem ir ao Git com a atribuição registrada em `docs/art-direction/personagens-miniatura.md`.
- **Dependência de laboratório:** three.js r170 (MIT) em `public/labs/iso-poc/vendor/three/` — só para renderizar; sem dependência de runtime do jogo.
- **Peso medido:** 4 personagens × 5 clipes × 8 direções a 160 px = 96,8 MiB de textura (≈24 MiB cada), 3,6–4,4 MiB de PNG por personagem. Para celular será preciso reduzir (menos quadros, quadro menor, carregar só o necessário).
