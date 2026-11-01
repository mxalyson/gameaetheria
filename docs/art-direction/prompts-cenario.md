# Prompts de cenário (chão, água, trilhas e peças que faltam)
2026-11-02 · Para gerar com IA de imagem (o mesmo gerador usado nos painéis de interface). **Origem e licença da arte gerada: a confirmar** (registrar em `docs/CREDITOS.md` ao entrar). Os nomes de arquivo são os que o jogo vai ler.

## Regras que valem para TODOS os prompts
- **Estilo:** pintura digital de fantasia luminosa, "pintada à mão", traço limpo, cores saturadas porém suaves; o mesmo mundo dos painéis de interface e dos heróis em miniatura (Summoners War + anime). Nada fotográfico, nada de pixel art, nada de 3D com brilho plástico.
- **Luz:** vem do alto-esquerda, sempre. **Sem sombras projetadas, sem objetos soltos e sem personagens** nas texturas de chão: árvores, pedras e flores já são sprites separados e vão por cima.
- **Contraste baixo:** o chão é o fundo de tudo; heróis, monstros e efeitos precisam saltar da tela num celular ao sol. Pouca variação de tom, detalhes pequenos e espalhados.
- **Câmera:** vista de cima levemente inclinada (RPG isométrico), sem perspectiva forte e sem horizonte.
- **Formato:** PNG quadrado 1024×1024 (o jogo reduz). Texturas de chão **precisam repetir sem emenda**: peça "tile perfectly, no visible seams, edges match when repeated".
- **Negativo (todos):** text, watermark, logo, border, frame, vignette, characters, creatures, UI, perspective horizon, photo, 3D render, harsh shadows.

---
## A. Texturas de chão (por zona) — `public/assets/ground/<zona>.webp`
A cor-base atual de cada zona está entre parênteses: a textura deve ficar **perto** dela para o resto continuar combinando.

**A1. Bosque Verdejante — `forest.png`** (#93cc8b)
> Seamless tileable top-down hand-painted fantasy grass ground texture, bright fresh meadow green (#93cc8b), soft brush strokes of lighter and darker green, tiny clover leaves and fine grass blades barely visible, a few tiny pale-yellow specks, very low contrast, stylized anime fantasy game art, light from top-left, no shadows, no objects, tiles perfectly with no visible seams, 1024x1024.

**A2. Planície de Cristal — `plains.png`** (#cfe2b2)
> Seamless tileable top-down hand-painted fantasy meadow texture, pale mint-green and cream-yellow grass (#cfe2b2), dreamy crystalline atmosphere, tiny soft white and light-blue sparkles scattered sparsely, gentle brush strokes, very low contrast, stylized anime fantasy game art, light from top-left, no shadows, no objects, tiles perfectly with no visible seams, 1024x1024.

**A3. Ruínas Sombrias — `ruins.png`** (#8d89ac)
> Seamless tileable top-down hand-painted ancient ruined stone floor, large irregular flagstones in muted violet-grey (#8d89ac), thin dark cracks, moss in the gaps and faint carved rune scratches, subtle, very low contrast so characters stand out, mysterious twilight fantasy, stylized anime game art, light from top-left, no pillars, no object shadows, tiles perfectly with no visible seams, 1024x1024.

**A4. Vila de Lúmen — `town.png`** (#ead9b0)
> Seamless tileable top-down hand-painted fantasy village ground, warm sand-beige packed earth and small cobblestone patches (#ead9b0), tiny grass tufts in the gaps, cozy and sunny, very low contrast, stylized anime fantasy game art, light from top-left, no shadows, no objects, tiles perfectly with no visible seams, 1024x1024.

## B. Caminhos
**B1. Terra batida (Bosque e Planície) — `trail-dirt.png`**, faixa 1024×256 que repete na horizontal:
> Seamless horizontally tileable top-down strip of hand-painted fantasy dirt path, warm beige packed earth (#d4bb88) with soft worn edges blending into grass at top and bottom, tiny pebbles and footprints, stylized anime game art, light from top-left, no shadows, tiles left-to-right with no visible seams, 1024x256.

**B2. Lajes das Ruínas — `trail-slabs.png`**: mesmo formato (1024×256), lajes de pedra violeta-acinzentada (#9a96b8) com juntas e musgo.

## C. Água (o pacote não tem) — `public/assets/water/`
**C1. Lago — `water-lake.png`**, seamless 1024×1024:
> Seamless tileable top-down hand-painted fantasy water surface, clear turquoise-blue (#79cbe8 to #4c9fcb), soft stylized ripple lines and gentle highlights, a few tiny white sparkles, smooth anime fantasy style, light from top-left, no objects, no lily pads, no shore, tiles perfectly with no visible seams, 1024x1024.

**C2. Água da Planície — `water-crystal.png`** (#a5ecf2 → #6cc0e6): o mesmo, mais claro e leitoso, com brilhos de cristal.

**C3. Margem — `shore-strip.png`**, 1024×256, repete na horizontal:
> Seamless horizontally tileable top-down strip: clear turquoise water at the top fading to wet sand then to green grass at the bottom, soft foam line at the water edge, hand-painted stylized anime fantasy game art, light from top-left, no objects, tiles left-to-right with no seams, 1024x256.

**Como entra:** a água continua animada por código (ondulação e brilho); a textura substitui o degradê atual, e a margem usa por cima as pedrinhas e o capim do pacote (já carimbados).

## D. Peças 3D que o pacote não cobre
Seguem o caminho dos heróis: conceito → Meshy → fotografia 3D→2D → atlas. Uma imagem de conceito por peça (fundo liso claro, **vista isométrica 3/4**, uma peça só, silhueta limpa, miniatura de diorama pintada à mão):
1. **Cerejeira / árvore de flor rosa da Planície** (copa em nuvens rosa-claro, tronco torto), 3 variações.
2. **Cristais** (quartzo azul-claro e rosa translúcido), 4 tamanhos — substituem os cristais de código.
3. **Pilares e arcos quebrados das Ruínas** (pedra violeta-acinzentada, runas, musgo), 5 peças.
4. **Estátuas** das Ruínas (guerreiro encapuzado, coruja), 2.
5. **Casas da Vila** (telhado de palha/telha, madeira clara, janelas quentes), 4; mais **poço**, **barraca de mercado**, **lampião**, **placa**.
6. **Toco, tronco caído, ponte de madeira, cerca.**
> Prompt-base: "single [objeto], isometric 3/4 view, hand-painted stylized fantasy diorama miniature, bright saturated but soft colors, clean silhouette, soft top-left lighting, plain light-grey background, no ground, no shadow, no text".
> Alternativa sem IA: Quaternius tem pacotes CC0 de ruínas e de vilarejo; passam pelo mesmo fluxo de fotografia (`tools/nature-bake.mjs`).

## Como me devolver
Mande as imagens (ou salve em `docs/art-direction/fontes-cenario/`). Eu recorto, torno **sem emenda** quando faltar, reduzo para o peso de celular (WebP) e ligo no jogo com interruptor `?chao=original`, medindo antes e depois. Uma textura de chão por zona, carregada uma vez, não custa nada por quadro.
