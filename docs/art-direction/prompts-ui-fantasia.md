# Prompts para a interface em estilo de jogo de fantasia (peças pintadas)
2026-11-01 · O kit v1 (`/labs/b1-ui/kit.html`) ficou "com cara de página de site": retângulos lisos, linha fina, degradê suave, emoji. Jogo de fantasia usa **material** (pedra, madeira, metal, couro, pergaminho), **silhueta recortada**, **bisel grosso**, **gemas**, **entalhes**. Isso precisa ser **pintado**; eu integro a peça (recorte em 9 fatias, atlas, estados).

## Regras para o gerador (valem para todos os prompts)
- **Um prompt = uma peça**, em arquivo separado. Não peça a tela inteira montada para usar no jogo (só para referência).
- **Fundo liso e uniforme** (cinza-chumbo `#2a2a2a` ou verde-chroma) ou transparente; **vista frontal reta**, sem perspectiva e sem sombra projetada fora da peça.
- **Centro vazio** nas molduras (para eu colocar o conteúdo); **simétrica** nas molduras de painel (para eu esticar sem deformar).
- **Sem texto, sem letras, sem números, sem personagens** dentro da peça.
- Estilo único para tudo: *"anime fantasy HD pintado à mão, acabamento de jogo mobile premium, bisel grosso, luz de cima à esquerda, sombras em violeta, contornos escuros de 2–3 px, materiais com textura (pedra lascada, bronze batido, madeira entalhada, couro costurado), ouro quente nos detalhes importantes, gemas lapidadas brilhantes, runas entalhadas sutis"*.
- **Evite** (negativo): *"flat design, UI de site, gradiente liso, retângulo perfeito, linhas finas, vetorial minimalista, neon, vidro/glassmorphism, ícones de emoji, texto, marca d'água"*.
- Tamanho: **1536×1024** (peças largas) ou **1024×1024** (quadradas). Gere 4 variações e escolha a mais coerente com os ícones de habilidade já aprovados.

## Prompt 0 — folha de conceito (SÓ referência de estilo, não vai para o jogo)
> Conceito de interface de jogo mobile de RPG de fantasia, tela horizontal 16:9, cena de vila medieval fofa ao fundo (miniaturas anime). Interface por cima toda **pintada em materiais**: cartão do herói em moldura de bronze batido com gemas, barra de vida como um vidro de poção dentro de uma calha de metal, medalhão de nível dourado, minimapa dentro de uma moldura redonda de pedra com bússola e runas, fileira de botões redondos de menu como selos de bronze e ouro, 3 botões grandes de habilidade em molduras ornamentadas de classes diferentes e um botão de ataque grande em forma de escudo/emblema, painel de inventário como **laje de pedra entalhada com cantos de metal e couro**, botões como placas de madeira com bordas de ouro. Sem texto. [bloco de estilo] [negativo]

## Prompt 1 — painel grande (inventário, personagem, loja) — peça mais importante
> Moldura de painel de interface de RPG de fantasia, **vista frontal reta, simétrica, centro completamente vazio e liso (cor de pedra azul-noite escura uniforme)**, borda grossa de **pedra entalhada com acabamento em bronze e ouro**, quatro cantos com ornamento de metal e **gema em losango**, runas sutis gravadas na borda, uma faixa de título arredondada no topo (vazia, sem texto) com pequenas asas de metal nas pontas, parafusos/rebites nos cantos. [bloco de estilo] [negativo]
Variações a pedir depois, mesmo prompt trocando o material: **madeira entalhada com couro** (loja) e **pergaminho com borda de metal** (diário/missões).

## Prompt 2 — botões (3 estados em 3 arquivos)
> Botão retangular de RPG de fantasia em forma de **placa de metal e madeira** com cantos chanfrados, **vista frontal reta, vazio no centro (sem texto)**, [ESTADO]. Estados: (a) **normal**: placa de bronze com filete de ouro e pequenas gemas nas pontas; (b) **pressionado**: mesma placa mais escura, afundada, sem brilho; (c) **desativado**: mesma placa em cinza fosco, sem ouro. Também uma versão **principal em ouro polido** (botão de confirmação). [bloco de estilo] [negativo]

## Prompt 3 — barras (vida, XP, chefe)
> Calha horizontal comprida de interface de RPG de fantasia, **vazia**, em **metal batido e ouro** com extremidades em forma de **cabeça de dragão/escudo** e uma gema na ponta, vidro escuro no centro para receber o líquido de vida, marcações de divisão gravadas, **vista frontal reta, sem texto**. Versões: vida (calha larga), XP (calha fina) e chefe (calha larga com crânio/chifres no centro da extremidade). [bloco de estilo] [negativo]

## Prompt 4 — minimapa
> Moldura **redonda** de minimapa de RPG de fantasia, **vista frontal reta, centro vazio e liso**, aro de **pedra e bronze** com **bússola** (pontos cardeais como pequenos entalhes, sem letras) nas quatro direções, gema no topo, runas sutis, parafusos. Uma versão **retangular de cantos arredondados** com os mesmos acabamentos. [bloco de estilo] [negativo]

## Prompt 5 — medalhão de botão redondo (menu, poção, voltar à vila)
> Selo/medalhão **redondo** vazio de botão de RPG de fantasia, **vista frontal reta**, aro grosso de **bronze batido com filete de ouro**, bisel interno e **disco central liso escuro** (para eu colocar o ícone), pequena gema no topo; três estados: normal, pressionado e desativado. [bloco de estilo] [negativo]

## Prompt 6 — tooltip, aviso e diálogo
> (a) **Balão de dica**: pequeno painel de **pergaminho escuro com borda de metal** e uma seta; (b) **faixa de aviso**: fita horizontal de **couro e ouro** com as pontas recortadas em "V", vazia no centro; (c) **caixa de diálogo de personagem**: painel largo de **madeira entalhada** com um **retrato circular vazio** em moldura de ouro à esquerda. Tudo **vazio, sem texto, vista frontal reta, simétrico**. [bloco de estilo] [negativo]

## Prompt 7 — célula de item por raridade (5 arquivos)
> Quadrado de **inventário** de RPG de fantasia, vazio, **vista frontal reta**, moldura de metal com bisel e **brilho de raridade**: comum (ferro simples), incomum (verde com folhas), raro (azul com cristais), épico (roxo com runas luminosas), lendário (ouro com chamas/asas e brilho forte). Centro liso escuro. [bloco de estilo] [negativo]

## Como eu uso o que você gerar
1. Você me manda os arquivos (um por peça) e a ferramenta/prompt usados (registro em `docs/CREDITOS.md`).
2. Eu recorto, tiro o fundo e converto cada moldura em **9 fatias** (`border-image`) para esticar sem distorcer, monto um **atlas** e aplico no kit do laboratório; você aprova antes da B5.
3. Só então a B5 troca as telas reais. Conteúdo (texto, números, ícones) continua sendo código; só a "pele" é pintada.

## Dica para ficar menos "de site"
Peça sempre **assimetria controlada** (ornamento diferente no topo e na base), **espessura de borda ≥ 10% do lado menor**, **uma cor de destaque por tela** (ouro) e **texturas visíveis**. Se a primeira saída vier lisa, acrescente: *"textura de pedra com rachaduras e riscos de uso, bronze com arranhões e oxidação nas bordas, madeira com veios e pregos"*.
