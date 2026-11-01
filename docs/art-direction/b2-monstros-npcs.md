# B2 — Monstros e NPCs no visual novo
2026-11-02 · Fase B2 da decisão 0007. Objetivo: trocar o desenho por código dos 12 monstros (3 chefes) e dos NPCs por arte pintada em 3D fotografada, igual ao cenário e aos heróis. A simulação (`core/`, `game/`, `data/`) **não muda**: o renderer só troca a "pele".

## 1. Método (decidido; avise se quiser outro)
| | Heróis (já feito) | **Monstros e NPCs (B2)** |
|---|---|---|
| Modelo | GLB do Meshy + esqueleto no Blender + clipes (idle, walk, attack, skill, hit) | **GLB do Meshy sem esqueleto** (basta o "Image to 3D"; sem auto-rig) |
| Vistas | 8 direções × clipes (atlas pesado, ~20 MiB por herói) | **8 direções estáticas** por criatura (~0,5 MiB cada, 128–170 px) |
| Animação | quadros pré-renderizados | **procedural 2D**: balanço ao andar, esmagar-e-esticar, avanço no golpe, tombo ao morrer (já existe `deathPose`), flash ao apanhar |
| Custo | alto (Blender) | **baixo**: do GLB ao jogo em minutos |
Limite honesto: um monstro sem esqueleto "desliza e balança"; **não** tem pernas se movendo. Funciona bem para geleia, cogumelo, fogo-fátuo, espectro, golem e árvore; é o ponto mais fraco nos lobos e nos cavaleiros. Se isso incomodar, a segunda etapa é rigar só esses (lobos, cavaleiros, gárgula) como os heróis.

Orçamento de textura (lição medida: passar de ~10 MiB decodificados no total derrubou o desempenho): 12 monstros × 8 vistas × ~140×170 px ≈ 9 MiB de atlas se todos fossem carregados juntos; por isso cada zona carrega **só os monstros dela** (3 comuns + chefe ≈ 3 MiB).

## 2. O que você gera (um monstro = um arquivo GLB)
**Passo 1 — imagem de conceito** (qualquer gerador de imagem; use a mesma linha dos spirits e dos heróis).
**Passo 2 — Meshy: "Image to 3D"** com a imagem; modelo **Lite/Standard**, textura ligada, **sem rig**. Baixe o **GLB** e me envie (ou salve em `public/labs/iso-poc/art-local/meshy-mobs/` — pasta fora do Git). Nome do arquivo: o do `id` abaixo (ex.: `slime.glb`).
**Regras da imagem de conceito (todas):**
- Corpo inteiro, **pose neutra em pé/flutuando, de frente (3/4 leve), olhando para a câmera**, sem acessórios soltos pelo chão e **sem pedestal/base** (o Meshy cola o objeto no chão: peça "no ground, no base").
- Fundo liso verde **#00ff00** (ou cinza claro) e **uma criatura só**.
- Estilo: **miniatura de fantasia pintada à mão**, cabeça grande/corpo curto (chibi), olhos grandes e simpáticos nos monstros comuns (o jogo é "luminoso", não macabro), contorno escuro fino, luz do alto-esquerda, cores saturadas porém suaves. Os chefes são **maiores e mais imponentes**, mas no mesmo estilo.
- Negativo: realistic, horror, gore, text, frame, ground, shadow, multiple characters, photo, 3D render.

Prefixo (cole antes de cada descrição):
> Cute chibi fantasy monster for a mobile RPG, single creature, full body, standing in a neutral pose facing the camera slightly three-quarter, big head and short body, hand-painted stylized game art, thin dark outline, bright saturated but soft colors, soft top-left lighting, plain pure green background (#00ff00), no ground, no base, no shadow, no text, 1024x1024.

### 2.1 Monstros (as cores do jogo entre parênteses; tamanho = raio de colisão)
| id | Nome | Zona | Papel | Descrição para o prompt |
|---|---|---|---|---|
| `slime` | Geleia (#7fd6a4, 15) | Bosque | comum, corpo a corpo | a round jelly slime, translucent mint-green, glossy highlight, two big sparkly eyes, a tiny leaf on top, smiling |
| `wolf` | Lobo Cinzento (#a3abbd, 16) | Bosque | comum, rápido | a small grey wolf cub-like monster, fluffy silver-grey fur, big amber eyes, pointy ears, bushy tail, slightly grumpy but cute, four legs, standing |
| `shroom` | Cogumelo Esporento (#e98b8b, 15) | Bosque | comum, à distância (cospe esporos) | a walking mushroom creature, round pink-red cap with cream spots, small cream body with stubby legs, sleepy-eyed, tiny spores floating |
| `treant` | Carvalho Ancestral (#7a9a5a, 42) | Bosque | **CHEFE** | an ancient oak tree guardian, mossy gnarled trunk body with a stern wise face, thick branch arms, glowing amber eyes, leafy crown, roots as feet, much bigger than the others |
| `crystalwolf` | Lobo de Cristal (#b9c7f0, 17) | Planície | comum, rápido | a crystal wolf, pale lavender-blue fur with translucent crystal shards on its back and tail, glowing icy eyes, cute fierce |
| `golem` | Golem de Quartzo (#c9b8f0, 21) | Planície | comum, resistente | a stout quartz golem, stacked rounded lavender crystal rock body, small glowing core on the chest, stubby arms, tiny glowing eyes |
| `wisp` | Fogo-fátuo (#9ee8ff, 13) | Planície | comum, à distância | a floating will-o-wisp, a flame-shaped cyan-white spirit with a cute face and two tiny tails of light, no legs, floating |
| `colossus` | Colosso de Cristal (#a98bf0, 46) | Planície | **CHEFE** | a giant crystal colossus, huge purple-violet crystal golem with big shoulders, glowing pink-white crystal core, crystal spikes on back, carved runes, imposing but chibi proportions |
| `wraith` | Espectro (#b6a6d8, 15) | Ruínas | comum, à distância | a cute wraith ghost, hooded violet-grey robe fading to wisps instead of legs, glowing pale eyes under the hood, floating, small lantern-like hands |
| `knight` | Cavaleiro Caído (#8c93a8, 18) | Ruínas | comum, resistente | a fallen knight, hollow dented steel armor with a cracked helmet, glowing blue eyes inside the visor, tattered cape, rusty sword and small shield, chibi proportions |
| `gargoyle` | Gárgula (#8a8f9e, 18) | Ruínas | comum, rápida | a stone gargoyle, grey carved stone body, small bat wings, short horns, fangs, glowing orange eyes, crouching but standing |
| `guardian` | Guardião das Ruínas (#6f6890, 44) | Ruínas | **CHEFE** | a colossal ruin guardian, giant knight statue made of violet-grey stone with moss and vines, huge shield and greatsword, glowing violet runes, hollow glowing eyes, imposing but chibi proportions |

Evoluções: os **Elites** do jogo (`Elite: …`) são o mesmo modelo com o brilho/ tamanho maiores; **não** precisam de arte nova.

### 2.2 NPCs (hoje usam os heróis em miniatura recoloridos; passam a ter corpo próprio)
Mesmas regras, mas **personagem humano chibi em pé, de frente, braços relaxados** (sem pose de combate), com o mesmo rosto do retrato já gerado (anexe o retrato ao pedir!). NPC não anda: precisa de **1 vista** (de frente) + espelhada; opcional 3/4.
| id | Nome | Descrição |
|---|---|---|
| `merchant` | Mercadora Lia | young woman, long orange braided hair, leather apron over cream blouse, large satchel and a small hanging scale |
| `arena` | Mestre Doran | older man, short grey beard and swept-back grey hair, red-and-bronze plate armor, arms crossed, scarred, stern |
| `sage` | Sábia Yun | woman with long dark-blue hair and round glasses, tall blue pointed hat with stars, blue robe with silver runes, holding a small glowing orb |
| `guard` | Guarda Ren | young guard, steel helmet with open visor, steel chest armor and dark-blue cloak, spear planted beside him |
| `herbalist` | Herbalista Mel | elderly woman, dark-green hood with a wreath of twigs and small flowers, soft green halo of leaves, patched tunic, herb pouches |
| `smith` | Ferreiro | burly man with a black bandana and thick beard, leather vest and soot-stained apron, big hammer on the shoulder |

Prefixo dos NPCs:
> Cute chibi fantasy village NPC for a mobile RPG, single character, full body, standing relaxed facing the camera, big head and small body, hand-painted stylized game art, thin dark outline, bright saturated soft colors, soft top-left lighting, plain pure green background (#00ff00), no ground, no base, no shadow, no text, 1024x1024.

## 3. O que eu faço depois que o GLB chegar (sem você)
1. **Fotografar 8 direções** com a câmera isométrica de 40° (`tools/mob-bake.mjs`): escala e âncora iguais em todas as vistas, base no chão.
2. **Atlas por criatura** (`public/assets/mobs/<id>.webp` + `.json`, 8 vistas em grade 4×2, ~130–170 px).
3. **`render/mob-sprites.js`** (como `hero-sprites.js`): escolhe a vista por `a.facing`, anima por código (balanço ao andar, avanço no golpe, flash ao apanhar, tombo ao morrer), carrega **só o que a zona usa**; sem o arquivo, **volta ao desenho antigo**; interruptor `?monstros=original`.
4. Ajusto o tamanho (`a.r × fator`) por criatura e ligo o **chefe** na barra do chefe (retrato) e os **NPCs** no lugar dos heróis recoloridos.
5. Testes (unitário do atlas/limites de memória, e2e de desenho e de console), captura de cada criatura em jogo, créditos (Meshy, CC BY 4.0) e commit/push.

## 4. Ordem sugerida (valida o método em **um** caso antes de produzir tudo)
1. **`slime`** (o mais simples) — valida o método de ponta a ponta.
2. **`treant`** (chefe do Bosque) — valida escala e peso de textura de um chefe.
3. O resto do Bosque (`wolf`, `shroom`), depois Planície, depois Ruínas, depois NPCs.
Mande 1 e 2 primeiro; eu devolvo capturas no jogo e só então você gera o resto.

## 5. Limites desta fase
- Sem esqueleto: nada de pernas/braços animados; a sensação de movimento é balanço e deslize.
- Projéteis e efeitos dos monstros (esporos, fogo-fátuo) continuam procedurais.
- Origem/licença da arte gerada: **a confirmar** (Meshy CC BY 4.0 para os GLB; imagens de conceito conforme o gerador).
