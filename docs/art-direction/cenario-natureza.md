# Cenário em sprites — Stylized Nature MegaKit (Quaternius, CC0)
2026-11-02 · A pedido do proprietário ("use o que for necessário nessa pasta para contribuir com o mapa e a floresta"). Decisão de método: **fotografar** os modelos 3D em sprites 2D (como já fazemos com os heróis); **nenhum 3D roda no jogo** (decisão 0001 mantida).

## O que entrou
| Zona | Tipos que viram sprite | Origem |
|---|---|---|
| **Bosque Verdejante** | árvores (5 comuns, 2× mais frequentes que os 4 pinheiros), pedras (3), arbustos (2, um com flores), samambaias (Fern/Plant), cogumelos (2) | CommonTree_1–5, Pine_1–4, Rock_Medium_1–3, Bush_Common(+Flowers), Fern_1, Plant_1, Mushroom_Common/Laetiporus |
| **Planície de Cristal** | arbustos com flores, capim alto | Bush_Common_Flowers, Grass_Common_Tall/Wispy/Short, cogumelos |
| **Ruínas Sombrias** | árvores retorcidas de folhagem outonal vermelha (no lugar dos pinheiros de código) e árvores mortas | TwistedTree_1–3, DeadTree_1–3 |
Ficam no desenho antigo: árvores rosa e cristais da Planície, pilares das Ruínas, tocos, troncos, brasas, estátuas e tudo da Vila (o pacote não tem esses).

## Como funciona
- `tools/nature-bake.mjs` (Playwright + three.js do laboratório) fotografa cada modelo: câmera **ortográfica a 40°**, vista de frente, escala fixa em pixels por metro (teto de ~235 px por lado), âncora no pé do objeto. `tools/nature-pack.py` monta **um atlas** (`public/assets/nature/atlas.webp` + `atlas.json`, 1024×1024, 31 sprites, 88 KB; ~4 MB descomprimido).
- `render/nature-sprites.js` desenha o sprite no lugar do desenho por código usando o MESMO `x, y, s` do layout (posição, colisão e tamanho não mudaram). Árvores ficam translúcidas quando o herói está atrás. Sem atlas ou com `?cenario=original` (fica salvo no aparelho) vale o visual antigo; `?cenario=natureza` volta.
- **Ajustes de cor:** as cores de vértice do pacote guardam máscara de vento (davam copas vermelhas escuras); foram ignoradas e as folhas ganharam tom verde vivo; arbustos usam a textura verde (a original deles é outonal).

## Medido (esta máquina, CPU do Chromium, só tempo de JS)
Desenho do Bosque: **1,10 ms** com sprites contra **2,08 ms** com o desenho antigo (média; p95 1,8 contra 5,7 ms). Peso: atlas 88 KB. **Não medido em celular real.**

## Limites e próximos passos
- É um estilo diferente do pastel vetorial antigo (mais detalhe, copas finas): combina com os heróis em miniatura (também renderizados de 3D), mas **é decisão de arte sua** — o interruptor existe por isso. Ruins: o vermelho outonal é forte.
- Sem animação (balanço ao vento) nem sombra própria (a sombra antiga continua).
- Ainda não usados: flores em grupo (Flower_3/4), trevos, pedrinhas e **pedras de trilha** (RockPath_*), que serviriam para o caminho e o chão; as 68 peças do pacote gratuito incluem mais variações.
- Os modelos copiados (41 MB) ficam fora do Git (`art-local`); para refazer o atlas basta o pacote original.
