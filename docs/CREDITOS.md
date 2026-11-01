# Créditos — Aetheria: Arena dos Ecos
Atualizado em 2026-10-31. A licença CC BY 4.0 exige atribuição: este texto deve aparecer nos créditos do jogo quando os personagens entrarem nele.

## Texto para a tela de créditos
> **Personagens em miniatura** — modelos 3D e imagens de conceito gerados com **Meshy** (meshy.ai), licença **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/). Direção de arte, pós-processamento, rig e animação: equipe Aetheria.

## Ferramentas e bibliotecas (não aparecem para o jogador; registro de origem)
| Item | Uso | Licença | Origem |
|---|---|---|---|
| Meshy (Free) | imagens de conceito, modelos 3D Lite dos 4 heróis | CC BY 4.0 (saídas, confirmado pelo proprietário) | meshy.ai |
| three.js r170 | renderizar os modelos em sprites (só laboratório) | MIT | npm `three@0.170.0` |
| meshoptimizer 0.22 | reduzir a malha antes do auto-rig (só laboratório) | MIT | npm `meshoptimizer@0.22.0` |
| Blender 4.2.23 LTS | rig e animação procedural (só ferramenta) | GPL (o programa; a saída é do autor) | download.blender.org, SHA-256 conferido |
| Mixamo | tentado e **não usado** (auto-rig falhou) | — | — |

## Pendências de crédito
- Conferir os termos do Meshy ao publicar (podem mudar); guardar captura da página de cada modelo.
- Místico: classe futura, ainda sem arte.
- A tela de créditos no jogo real ainda não existe (a integração do visual isométrico está adiada); por ora o crédito aparece no canto do PoC (`public/labs/iso-poc/index.html`) e aqui.

## Fontes
- **Cinzel** e **Nunito** (Google Fonts), licença SIL Open Font License 1.1; arquivos locais em `public/fonts/` (o jogo não depende mais de recurso externo para a tipografia).

## Ícones de habilidades (arte gerada)
- 12 ícones de habilidades + ícone da poção em `public/assets/icons/`, recortados de duas folhas **geradas por IA** fornecidas pelo proprietário (originais em `docs/art-direction/fontes-icones/`; recorte reproduzível com `tools/skill-icons-from-sheets.py`). Ferramenta/gerador, prompt e termos de uso: **a confirmar com o proprietário** antes de publicar (a proteção de direitos autorais de arte gerada por IA é incerta). Uso atual: desenvolvimento e testes locais.

## Interface pintada (arte gerada)
- Moldura de painel de pedra com cantos de bronze, gemas e plaqueta com asas (`public/assets/ui/panel-9.webp`, `plaque.webp`) e a folha de conceito do HUD (`docs/art-direction/fontes-ui/`): imagens **geradas por IA** fornecidas pelo proprietário a partir dos prompts de `docs/art-direction/prompts-ui-fantasia.md`; recorte reproduzível com `tools/ui-frame-from-sheet.py`. Ferramenta, prompt exato e termos de uso: **a confirmar com o proprietário** antes de publicar.
- Peças de interface pintadas (botões, cartão do herói, barras de poção, minimapa redondo, medalhão): folhas em `docs/art-direction/fontes-ui/`, recortadas com `tools/ui-pieces-from-sheets.py` para `public/assets/ui/*.webp`. Origem, prompt e termos de uso: **a confirmar com o proprietário**.
- Segunda leva de peças pintadas (dica, faixa de aviso, diálogo, 7 molduras de raridade, **4 emblemas de ataque básico** em `public/assets/icons/attack/` e **7 ícones de menu** em `public/assets/icons/menu/`): folhas em `docs/art-direction/fontes-ui/`, mesmo recorte (`tools/ui-pieces-from-sheets.py`). Origem, prompt e termos: **a confirmar com o proprietário**. Os emblemas de ataque já estão no jogo real; os de menu e as raridades estão só no laboratório (B5).

## Cenário em sprites (modelos 3D de terceiros)
- **Stylized Nature MegaKit [Standard]**, de **Quaternius** (https://quaternius.com), licença **CC0 1.0** (domínio público; crédito não é exigido, mas registrado por cortesia: "Models by @Quaternius"). 31 modelos (árvores comuns, pinheiros, árvores retorcidas e mortas, arbustos, samambaia, plantas, cogumelos, capim, pedras) **fotografados** em sprites 2D por `tools/nature-bake.mjs` (câmera ortográfica a 40°) e empacotados por `tools/nature-pack.py` em `public/assets/nature/atlas.webp` (88 KB). Os modelos e as texturas originais (41 MB) ficam em `public/labs/iso-poc/art-local/nature/` (fora do Git); só o atlas vai ao jogo. Ajustes nossos: cores de vértice ignoradas (guardam dados de vento) e folhagem recolorida em tom vivo.

## Ícones de equipamento (arte gerada por IA)
Espada, cajado, arco, maça, elmo, armadura, botas, anel e amuleto (`public/assets/icons/item/`), recortados das folhas em `docs/art-direction/fontes-icones/` por `tools/item-icons-from-sheets.py`. **Origem/licença: a confirmar** (gerador e termos de uso a registrar pelo proprietário).

## Spirits (arte gerada por IA)
Fagulha, Ondina, Rochedo, Zéfiro (forma 1 e forma evoluída) e o ovo (`public/assets/icons/spirit/`), recortados de imagens guardadas em `docs/art-direction/fontes-icones/` por `tools/spirit-icons-from-images.py`. **Origem/licença: a confirmar.**
