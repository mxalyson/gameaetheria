# Teste de viabilidade de arte por IA (conceito do Mago)
Estado: **preparado, NÃO executado** (falta chave de API e confirmação de gasto). Data: 30/10/2026.

## 1. Objetivo
Responder, com imagens na mão, se IA de imagem serve para os heróis de Aetheria e **até onde**: só conceito, ou também sprites. O PoC mostrou que arte por código não chega a "anime HD" (`docs/roadmap/iso-poc-report.md`, seção 5).

## 2. Situação verificada hoje [LIDO/MEDIDO]
- Skill a usar: **`nano-banana-pro`** (script `~/.claude/skills/nano-banana-pro/scripts/generate_image.py`). Inspecionei o código: só envia o prompt (e uma imagem de entrada, se eu passar) ao provedor escolhido e salva o PNG. Não envia mais nada.
- `fal-ai` **não** serve (é de OCR/visão). `openrouter-img` serve (outros modelos), mas é a mesma ideia.
- **Nenhuma chave configurada**: `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `FAL_KEY` ausentes do ambiente; não há `~/.env` nem `H:\aetheria\.env`.
- `uv` (usado pelas skills) não está instalado; **não é necessário**: o script roda com `python` direto (as bibliotecas `google-genai`, `python-dotenv` etc. já estão instaladas).
- O caminho `~/.agents/skills/...` citado na skill não existe; o real é `~/.claude/skills/...`.

## 3. O que preciso de você (nada disso eu faço por você)
1. **Criar a chave e colocá-la num arquivo `.env` seu**, por exemplo `C:\Users\alyso\.env`, com **uma** linha: `GEMINI_API_KEY=...` (Google AI Studio) **ou** `OPENROUTER_API_KEY=...` (OpenRouter). Eu **não leio** esse arquivo, não imprimo a chave e não a coloco em commits; o script a carrega sozinho.
2. **Escolher o provedor:** `gemini` (direto, preço por imagem a verificar na sua conta) ou `openrouter` (preços publicados na skill, abaixo).
3. **Confirmar o teto de gasto e o número de imagens** (proposta na seção 4).
4. Confirmar que posso enviar **só texto** (os prompts abaixo). Enviar uma imagem de referência (por exemplo, o Mago do PoC) para edição é outro envio a serviço externo e **só faço com seu OK separado**.

## 4. Orçamento proposto (teto)
Preços do OpenRouter segundo a tabela da skill (snapshot ago/2026, **a confirmar**; o campo `usage.cost` da resposta é a cobrança real): `flash` 1K ≈ US$ 0,067; `pro` 1K ≈ US$ 0,134.
| Uso | Imagens | Custo estimado |
|---|---|---|
| Rascunhos com modelo rápido (flash, 1K) | 4 | ≈ US$ 0,27 |
| Versão final de 1–2 melhores com modelo "pro" (1K) | 2 | ≈ US$ 0,27 |
| **Total previsto** | **6** | **≈ US$ 0,54** |
**Teto proposto: 8 imagens e US$ 1,00.** Se qualquer coisa passar disso, eu paro e pergunto. Não faço novas tentativas automáticas em loop.

## 5. Experimento (6 imagens)
Saída em `H:\aetheria\art-tests\ia-concept\` (pasta fora de `public/`, **ignorada pelo Git** até a licença ser verificada).
Prompts (em inglês, que costuma render melhor; o design é **original**, sem citar personagens ou jogos existentes):

1. **Conceito de frente** (flash, 1:1): *Full-body character concept art of a young fantasy mage for an isometric anime action RPG. Original design: tall indigo pointed wizard hat tilted slightly back so the face is fully visible, gold hat band with a small star charm, long lavender-silver hair with side locks and a teal ribbon, large expressive teal eyes, flowing indigo robe with a cream inner panel and gold trim, short cream cape, ornate wooden staff topped with a gold crescent holding a glowing teal crystal orb. Clean anime illustration, soft cel shading, crisp dark outline, standing neutral pose, front view, plain flat light-gray background, no text, no watermark, full body with generous margins.*
2. **Folha de rotação** (flash, 16:9): o mesmo texto + *Character turnaround sheet: front, three-quarter, side and back views in one row, identical proportions, colors and costume details in every view.*
3. **Estilo de sprite isométrico** (flash, 1:1): o mesmo personagem + *as a game sprite for an isometric action RPG with a 30-degree elevated camera, facing the lower-right, full body, large readable face under the hat brim, thick clean outline for readability at small size, flat background.*
4. **Variação de rosto legível** (flash, 1:1): igual à 3 com *close-up friendly proportions, head about one fifth of body height*.
5–6. **Melhor de 1–4 refeito com o modelo `pro`** (1K).

Comandos (exemplo; só depois da sua confirmação):
`python C:\Users\alyso\.claude\skills\nano-banana-pro\scripts\generate_image.py --prompt "..." --filename H:\aetheria\art-tests\ia-concept\01-frente.png --resolution 1K --aspect-ratio 1:1 --provider gemini`

## 6. Como vou avaliar (critérios objetivos, antes de ver as imagens)
| # | Critério | Passa se |
|---|---|---|
| C1 | Silhueta | reconhecível como mago (chapéu + cajado) reduzida a ~130 px de altura |
| C2 | Rosto legível | olhos e cabelo distinguíveis a 180–250 px de altura (reduzindo a imagem, como no jogo) |
| C3 | **Consistência entre vistas** (imagem 2) | mesmas cores, chapéu, cabelo, roupa e cajado em todas as vistas; conto as divergências |
| C4 | Fundo isolável | fundo chapado, dá para recortar sem restos |
| C5 | Direitos de uso | termos do provedor permitem uso **comercial** da imagem gerada [**a verificar na hora**, vale por provedor] |
| C6 | Caminho de produção | dá para derivar **animações em 8 direções** a partir disso, ou só serve de modelo para um artista/3D? |
**Regra de decisão:** se C3 falhar (esperado), IA fica restrita a **conceito**, e os sprites finais vêm de artista, de 3D → sprite ou de um pipeline que mantenha consistência. Eu **não** declaro nada aprovado; a avaliação visual final é sua.

## 7. Cuidados
- Nunca imprimir, registrar ou commitar a chave. Se aparecer em qualquer saída, parar e avisar.
- Imagens geradas ficam fora do Git e fora de `public/` até a licença (C5) ser confirmada.
- Registrar para cada imagem: provedor, modelo, resolução, prompt, data e custo.
