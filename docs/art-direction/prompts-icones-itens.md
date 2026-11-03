# Prompts: ícones de itens, spirits e retratos (opção 2 do B5)
2026-11-02 · Mesmo gerador e mesmo estilo dos painéis e dos ícones de habilidade. **Origem e licença da arte gerada: a confirmar** (registrar em `docs/CREDITOS.md`). Hoje esses itens aparecem como emoji (🗡️ 🪖 🥋 👢 💍 📿 🧪 e esferas coloridas para os spirits).

## Regras para TODOS (iguais às dos ícones de habilidade aprovados)
- **Estilo:** pintura digital de fantasia, traço limpo, cores saturadas e luminosas, bisel e brilho suaves, "joia de RPG de celular" (Summoners War + anime). Nada fotográfico, nada de pixel art, nada de render 3D plástico.
- **Enquadramento:** **um objeto por imagem**, centralizado, ocupando ~80% da tela, ligeiramente inclinado (3/4), **fundo liso verde-chroma (#00ff00) ou branco puro** para recorte limpo. **Sem moldura, sem texto, sem número, sem sombra projetada no chão.** A moldura de raridade já existe no jogo (`rarity-N.webp`) e vai por trás.
- **Luz:** alto-esquerda; contorno escuro fino (~3 px) para ler em celular pequeno (o ícone aparece com 40–54 px).
- **Silhueta legível:** deve ser reconhecível em 40 px; poucos detalhes grandes em vez de muitos pequenos.
- **Tamanho:** 1024×1024 (reduzo para 128–256 px).
- **Negativo (todos):** frame, border, text, numbers, watermark, logo, background scenery, floor shadow, hands, characters, photo, 3D render, blurry, extra objects.

Prefixo comum (cole antes de cada item):
> Hand-painted stylized fantasy RPG item icon, single object centered, three-quarter view, bright saturated colors, soft bevel and glossy highlights, thin dark outline, light from top-left, plain pure green background (#00ff00), no frame, no text, no shadow on floor, 1024x1024.

---
## A. Equipamentos (9 imagens; a raridade muda só a moldura, o objeto é o mesmo por tipo)
Cada tipo em **3 níveis de qualidade** reaproveita o mesmo desenho (tom mais simples → mais ornamentado). Peça primeiro a versão base; depois, se gostar, peço variações.

| Arquivo | Objeto | Detalhe |
|---|---|---|
| `item-sword.png` | Espada de um gume, guarda curta | aço claro, cabo de couro, pomo de bronze |
| `item-staff.png` | Cajado de mago | madeira retorcida, orbe azul-violeta luminoso no topo |
| `item-bow.png` | Arco longo com corda | madeira clara com folhas gravadas, corda fina |
| `item-mace.png` | Maça de clérigo | cabo dourado, cabeça redonda com sol/cruz gravado |
| `item-helm.png` | Elmo de guerreiro | aço, viseira aberta, pluma curta vermelha |
| `item-armor.png` | Peitoral | placas de aço com bordas bronze e gema no centro |
| `item-boots.png` | Par de botas | couro marrom, cano alto, fivelas de bronze |
| `item-ring.png` | Anel | ouro com gema azul facetada, brilho suave |
| `item-amulet.png` | Amuleto | corrente fina e medalhão de ouro com runa e gema |

Exemplo completo (espada):
> Hand-painted stylized fantasy RPG item icon, single object centered, three-quarter view, a single-edged steel sword with a short crossguard, leather-wrapped hilt and bronze pommel, bright saturated colors, soft bevel and glossy highlights, thin dark outline, light from top-left, plain pure green background (#00ff00), no frame, no text, no shadow on floor, 1024x1024.

## B. Consumíveis e recursos (peças que o jogo já usa)
| Arquivo | Objeto |
|---|---|
| `potion-health.png` | frasco redondo de rolha, líquido **vermelho** brilhante (combina com o vidro de vida do HUD) |
| `potion-mana.png` | o mesmo frasco, líquido **azul** |
| `essence.png` | cristal/gota de essência cintilante violeta (usada para especializar e evoluir) |
| `gold-coin.png` | moeda de ouro com marca de eco (anéis concêntricos) |
| `chest.png` | baú de madeira com reforço de bronze, tampa fechada (o baú de missão) |
| `key.png` | chave antiga de bronze com gema |
| `scroll.png` | pergaminho enrolado com selo de cera vermelha (missões/diário) |
| `ore.png` | pedra de minério azulada com veios dourados (ferreiro) |

## C. Spirits (4 tipos + ovo; o jogo hoje mostra uma esfera)
Criaturinhas **chibi** flutuantes (como espíritos companheiros), corpo de elemento, olhos grandes e simpáticos, sem braços/pernas realistas; ~1,5 cabeça de altura. A moldura de raridade vai por trás. Peça **retrato de corpo inteiro e uma versão de rosto** (rosto serve para a lista).
- `spirit-ember.png` — **Fagulha** (Fogo): chama viva laranja/amarela com olhinhos, pequenas brasas ao redor.
- `spirit-undine.png` — **Ondina** (Água): gota/ondina azul-clara translúcida, cabelo de água, pérola no peito.
- `spirit-terra.png` — **Rochedo** (Terra): pedrinha musgosa marrom-dourada com cristais pequenos, expressão sonolenta.
- `spirit-zephyr.png` — **Zéfiro** (Vento): redemoinho verde-menta com folhinhas girando e cauda de nuvem.
- `spirit-egg.png` — **ovo** de spirit: ovo cinza-pérola com rachadura brilhante e símbolo de eco.
> Prompt-base: "cute chibi elemental spirit mascot, [descrição], big friendly eyes, floating, glossy hand-painted fantasy game art, thin dark outline, light from top-left, plain pure green background (#00ff00), no text, 1024x1024."

## D. Retratos das 4 classes (cartão do herói e painel do personagem; hoje é o emblema do ataque)
Busto em círculo, **rosto 3/4**, estilo anime-fantasia, expressão decidida; **mesmo visual dos heróis em miniatura** (use as imagens de `conceitos-meshy` e dos atlas como referência; anexe-as ao pedir!). Fundo liso verde (#00ff00), sem moldura; eu recorto em círculo e coloco no cartão.
- Guerreiro: elmo aberto com pluma vermelha, cicatriz leve, ombreira de bronze.
- Mago: capuz/chapéu azul-violeta, olhos brilhantes, runas flutuando.
- Arqueiro: capuz verde, cabelo preso, pena na gola.
- Clérigo: touca/capuz branco e dourado, símbolo solar no peito, olhar sereno.
> Prompt-base: "anime fantasy RPG character bust portrait, 3/4 view, [classe], hand-painted, clean lineart, saturated luminous colors, same style as the attached reference miniature, plain pure green background (#00ff00), no frame, no text, 1024x1024."

## E. Retratos de NPC (o diálogo pintado tem um **oval** à esquerda esperando o rosto)
Guarda Ren (guarda de elmo cinza), Mestre Doran (veterano de armadura vermelha), Herbalista Mel (senhora de capuz verde e halo de folhas), Mercadora Lia (jovem ruiva de avental), Sábia Yun (maga de chapéu azul pontudo), Ferreiro. Busto 3/4, mesmo estilo da seção D, fundo verde.

## F. Habilidades de Maestria (4 ícones, 256x256, moldura dourada de "mestre")
Hoje são recolores provisórios dos ícones existentes (`tools/skill-icon-gold.py`). Estilo dos 12 ícones atuais, quadrado arredondado com moldura dourada ornamentada, fundo escuro com brilho.
- Fúria do Colosso (Guerreiro): punho/armadura colossal em brasa golpeando o chão, onda de choque dourada.
- Meteoro Arcano (Mago): meteoro arcano em chamas violeta-laranja caindo, círculo rúnico no chão.
- Tempestade de Flechas Ardentes (Arqueiro): dezenas de flechas em chamas caindo em chuva diagonal.
- Intervenção Divina (Clérigo): coluna de luz dourada descendo sobre mãos em prece, asas translúcidas.
> Prompt-base: "game skill icon, rounded square, ornate gold master frame, [descrição], hand-painted anime fantasy, saturated luminous colors, dark vignette background, no text"

## Como me devolver
Mande as imagens (ou salve em `docs/art-direction/fontes-icones/`). Eu recorto o fundo, reduzo para o peso de celular (WebP, ≤ 256 px), monto um **atlas de itens** e troco os emojis por imagem (se uma imagem faltar, o jogo volta ao emoji daquele item), mantendo a moldura de raridade por trás. A ordem de prioridade que sugiro: **A (equipamentos) → B (poção, essência, moeda) → C (spirits) → D/E (retratos)**.
