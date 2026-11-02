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

## E. Objetos do mundo que AINDA são desenhados por código (auditoria de 2026-11-02)
Já pintados e no jogo: casas, lampião (`m_lamp`), placa (`m_sign`), toco, tronco, cristais, pilares, arco, estátuas, pedras, árvores, **baú fechado** (`assets/props/chest.webp`, recorte da folha de itens). Faltam estes (uma imagem de conceito por peça, mesmo prompt-base da seção D; depois Meshy "Image to 3D" e me manda o GLB em `meshy-cenario/`):
| Peça | Onde aparece | Prompt (acrescente ao prompt-base) |
|---|---|---|
| **Baú ABERTO** (tampa levantada, ouro e brilho dentro) | todas as zonas, depois de saquear | `the same iron-banded dark-wood treasure chest as the closed one, lid open wide, glowing gold coins and a gem inside, soft warm glow` |
| **Fonte da praça** (bacia de pedra clara com água e jato no centro) | Vila de Lúmen (hoje círculos de código) | `a round white-stone town fountain, two tiers, clear blue water, a small water jet on top, moss on the base, fantasy village` |
| **Banco de praça** | Vila | `a rustic wooden park bench with iron legs, fantasy village` |
| **Caixas e barris** (pilha de 2-3) | Vila | `a small stack of wooden crates and one barrel with rope, fantasy market` |
| **Canteiro de flores** (caixa de madeira com flores) | Vila, frente das casas | `a wooden flower planter box full of colorful flowers and green leaves` |
| **Braseiro de pedra** (bacia de pedra com chama azul-violeta) | Ruínas | `a carved violet-grey stone brazier on a short pillar with a magical violet-blue flame, moss, ruins` |
| **Brasa / vulcão e gelo** (rocha de lava e cristal de gelo) | Cinzas Ardentes e Cume Gélido (ícones de zona, hoje emoji) | `a chunk of black volcanic rock with glowing orange lava cracks` e `a cluster of pale ice crystals with frost` |
| **Flor luminosa** (planta com flores azul-brilhantes) | Planície | `a small bush with glowing cyan bell flowers, magical, soft glow` |
| **Juncos de lagoa** | lagoas do Bosque | `a clump of green cattail reeds` |
| **Árvore verde do Bosque como ícone de zona** | mapa (hoje usa a cerejeira) | `a round green oak tree, hand-painted diorama miniature` |

## Como me devolver
Mande as imagens (ou salve em `docs/art-direction/fontes-cenario/`). Eu recorto, torno **sem emenda** quando faltar, reduzo para o peso de celular (WebP) e ligo no jogo com interruptor `?chao=original`, medindo antes e depois. Uma textura de chão por zona, carregada uma vez, não custa nada por quadro.

---
## E. Cume Gélido e Cinzas Ardentes — arte própria (2026-11-02)
Hoje o Cume Gélido usa a textura da Planície com um tom branco-azulado por cima e as Cinzas Ardentes usam as lajes das Ruínas escurecidas; os dois com as peças existentes (pinheiros, cristais, pilares...). Para ficarem de fato diferentes, as mesmas regras do início (pintura digital luminosa, luz do alto-esquerda, sem sombras nem objetos, contraste baixo, 1024×1024, **repete sem emenda**) valem para:

**E1. Neve — `snow.png`** (#dfeaf2)
> Seamless tileable top-down hand-painted fantasy snow ground, soft white and pale ice-blue (#dfeaf2), gentle wind-blown drifts, tiny glints of ice crystals, faint blue shadows in the dips, very low contrast, stylized anime fantasy game art, light from top-left, no objects, no footprints, no shadows, tiles perfectly with no visible seams, 1024x1024.

**E2. Gelo rachado — `ice-water.png`** (rio e lagos congelados)
> Seamless tileable top-down hand-painted frozen river ice, translucent pale cyan (#b4e4f5) with white frost cracks and trapped air bubbles, subtle depth blue underneath, smooth anime fantasy style, light from top-left, no objects, no snow piles, tiles perfectly with no visible seams, 1024x1024.

**E3. Basalto — `basalt.png`** (#8a6a60 → mais escuro, #3a2a28)
> Seamless tileable top-down hand-painted dark volcanic basalt floor, broken obsidian-grey and warm brown slabs (#4a3430), thin glowing orange cracks (#ff7a1e) sparsely spread, ash dust, very low contrast so characters stand out, stylized anime fantasy game art, light from top-left, no objects, no lava pools, tiles perfectly with no visible seams, 1024x1024.

**E4. Lava — `lava.png`** (rio de lava)
> Seamless tileable top-down hand-painted flowing lava surface, molten orange (#ff6a1e) and yellow (#ffb347) swirls with a dark cooling crust (#2a1410) forming thin plates, glowing, smooth stylized anime fantasy game art, light from top-left, no objects, no smoke, tiles perfectly with no visible seams, 1024x1024.

**Peças 3D** (mesmo fluxo da seção D, uma imagem por peça com o prompt-base):
7. **Árvore de neve** (pinheiro carregado de neve, 3 variações) e **cristal de gelo** azul-claro translúcido (3 tamanhos).
8. **Pedra de basalto com veios de brasa** (3 tamanhos), **árvore queimada** (tronco negro com brasas, 3 variações), **coluna de obsidiana quebrada com runas laranjas** (2).

## F. Ponte (e cerca) — só se o `Cozy_Medieval_Village` não tiver ponte aproveitável
Duas pontes, uma por clima. Vista isométrica 3/4, peça única, 4:1 (comprida), com os dois lados em escada para o chão; 150 u de largura útil, uma passagem de ~120 u.
> **Ponte de madeira:** "single short wooden plank bridge, isometric 3/4 view, hand-painted stylized fantasy diorama miniature, warm brown planks with rope-bound railings and two small lantern posts, bright saturated but soft colors, clean silhouette, soft top-left lighting, plain light-grey background, no ground, no water, no shadow, no text" — **comprimento 4×, largura 1×, altura baixa** (sem arco).
> **Ponte de pedra (Ruínas e Cinzas):** "single flat stone slab bridge, isometric 3/4 view, hand-painted stylized fantasy diorama miniature, weathered violet-grey slabs with moss and carved low parapets, one small iron brazier at each end, ..." (mesmo restante).
> **Cerca de madeira:** "single short wooden fence section, 3 posts and 2 rails, isometric 3/4 view, ..." (para marcar acampamentos).
Fotografar com `tools/glb-bake.mjs`, entrar no atlas `meshy.webp` como `m_bridge`, `m_bridge_stone`, `m_fence` (cuidado com o limite de atlas: `tests/nature.test.js`) e trocar `paintBridges` por sprites.

**Situação (2026-11-02):** o GLB da Vila trouxe poço (`m_well`, peça 0), ponte (`m_bridge`, peça 8) e duas cercas (`m_fence_1/2`, peças 10 e 11), já no atlas `meshy.webp`. A ponte do GLB é uma passarela curta e curva (≈1:1), não uma ponte longa: está esticada na travessia (aceitável, não ideal); o prompt de ponte de madeira acima (4:1, reta, sem arco) ainda vale se quiser uma melhor. **Ainda sem arte:** ponte de pedra (Ruínas/Cinzas, segue o desenho de código), barril, caixas (só há uma caixinha colada no poço), banco, fonte, canteiro, braseiro, baú aberto. Prompts na seção E. Refazer/ampliar: `node tools/glb-bake.mjs 220 40 <Conjunto> <pecas>` (ou `tools/glb-dirs.mjs` para escolher o giro) e `python tools/meshy-pack.py` (acrescenta ao atlas atual sem refotografar tudo).
