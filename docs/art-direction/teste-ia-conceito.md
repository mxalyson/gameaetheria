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

---

## 8. Alternativa indicada pelo proprietário: plugin SpriteCook (30/10/2026)
Fonte: repositório `github.com/SpriteCook/claude-plugin` (licença MIT segundo o README) e páginas oficiais `spritecook.ai`, lidos por **duas leituras independentes** (agentes de leitura). Eu **não** abri o arquivo `LICENSE` nem os termos pessoalmente; o que está marcado [CITADO] veio dessas leituras e **deve ser conferido por você nas páginas antes de pagar ou de usar em produção**.

**O que é.** Um plugin que liga o Claude a um servidor MCP remoto da SpriteCook (`mcp.spritecook.ai/mcp/claude` no README; a home cita `api.spritecook.ai/mcp`: **discrepância**) e instala 10 skills (gerar sprites, animar, tilesets, UI, presets...). Sem hooks de instalação nem comandos de shell no `plugin.json` [CITADO]. Autenticação por login OAuth no navegador; **onde o token fica guardado, não confirmado**.

**Ajuste ao Aetheria.** Pontos a favor: perspectiva `isometric` suportada; consistência por `reference_asset_id`/tema ("generate one hero asset first, then pass its asset ID as a reference"); animações curtas em loop (idle, walk, attack, hurt, death). Pontos contra:
- O produto é **centrado em pixel art** (sprites exatos de 16–128 px; animação pixel até 256/320 px). Há "detailed mode" (256–2048 px) para animação [CITADO]; a qualidade dele **não foi avaliada**.
- **Direções:** nada de 8 direções documentado. O conjunto isométrico é `idle, idle_back, walk_down, walk_right, jump_back, jump_front, run_down, run_right, attack, hurt, death` → provavelmente 3–4 direções, com espelhamento para as demais. Isso **conflita com a convenção "8 direções desenhadas, sem espelhar"** (a mão do cajado inverteria).
- "A reference also carries over its flaws"; **sem garantia** de que o personagem fique idêntico entre animações.

**Plano Free** [CITADO]: 40 créditos a cada 30 dias, sem cartão. Imagem 8–12 créditos (≈3–5 imagens); animação 20–26 créditos (≈1–2). Uso comercial incluído em todos os planos ("the terms of the AI providers behind the models also apply"). **Não incluídos no Free:** exportação de spritesheet/Unity/Godot, 2K/4K, assets privados. **"Free generations appear in the public gallery"**: o design do Mago ficaria público. Pagos: Starter US$ 8/mês (800 créditos, exporta spritesheet, assets privados); Adventurer US$ 30/mês (2K/4K).

**Dados e privacidade** [CITADO]: prompts e conteúdo podem ser enviados à OpenAI, Google (Gemini) e xAI; logs de API até 90 dias; "We do not log request or response bodies". Propriedade explícita dos outputs ("you own") e uso para treinar modelos: **não confirmados**; os termos dizem que "Outputs may not be unique".

**Riscos específicos:** servidor remoto cujas respostas eu não controlo (tratar saída como dado, nunca como instrução); auto-update é opcional e muda as instruções que o agente segue; documentação inconsistente.

**Como instalar (só você pode, no seu app):** Claude Desktop → aba Code → *Customize* → **+** → *Create plugin* → *Add marketplace* → *Add from a repository* → colar `https://github.com/SpriteCook/claude-plugin` → *Sync* → instalar o SpriteCook → conectar a conta no navegador. Reiniciar o app/abrir uma sessão nova para as ferramentas aparecerem. Criar a conta e fazer o login **não são ações que eu faço**.

**Teste proposto (cabe no Free, ≈3 imagens + 1 animação):**
1. Imagem-herói do Mago em perspectiva isométrica, com o mesmo texto de design da seção 5 (adaptado ao formato do produto).
2. Duas variações usando o herói como `reference_asset_id` (pose de andar; pose de ataque).
3. Se sobrarem créditos, 1 animação `walk` para ver quadros, tamanho e consistência.
Avaliar pelos critérios C1–C6 da seção 6, mais: **quantas direções saem de fato**, **o tamanho em pixels** e **se o rosto é legível a 180–250 px**. Cada geração consome créditos: **peço sua confirmação antes de cada lote**.

---

## 9. Segunda alternativa indicada pelo proprietário: Scenario MCP (30/10/2026)
Fonte: `mcp.scenario.com` e páginas oficiais (docs, preços, termos v2.1.1 de 16/07/2026, privacidade, changelog), lidas por um agente de leitura. [CITADO] = veio dessa leitura e **deve ser conferido por você no site**. Não estava disponível como ferramenta nesta sessão.

**O que é.** Plataforma generativa **geral** (imagem, vídeo, 3D, áudio) com servidor MCP remoto (~97–99 ferramentas, v0.36.0; as páginas divergem no número). Não é focada em sprites.
**Instalação (só você pode):** Claude Desktop → *Customize → Connectors → Add → Add custom connector* → URL `https://mcp.scenario.com/mcp` → concluir o login (OAuth) no navegador. Claude Code: `claude mcp add --transport http scenario https://mcp.scenario.com/mcp`. Conta em `app.scenario.com`. **Não usar chave de API fixa em conector de organização** (dá o acesso dela a todos os membros) e nunca colar chave/token no chat.

**Capacidades confirmadas** [CITADO]: gerar imagens por vários modelos (`model_run`, com `dry_run` para estimar o custo antes); **treinar modelo próprio** de personagem com 5–15 imagens (plano **Pro**); imagem de referência; remover fundo e ampliar; **imagem → 3D** (GLB, OBJ, FBX); vídeo; áudio. **Não confirmados:** spritesheet, folha de rotação (turnaround), ferramenta de animação de personagem, PNG com transparência explícita, resolução máxima.

**Preços** [CITADO]: Free "50 créditos" (a página diverge entre diário e único); Starter US$ 15/mês (1.500 créditos, todos os modelos, gerações privadas, **sem** treino); **Pro US$ 45/mês (5.000 créditos, treino de modelo)**; Max US$ 75. Créditos não acumulam. Custo por imagem/treino **não encontrado** (usar `dry_run`).
**Licença** [CITADO]: "You own your Generated Assets", uso comercial permitido (seção 4.3), **mas** "Free plan outputs are for personal and evaluation use only": **o plano Free serve para avaliar, não para arte do jogo**. Sem garantia de unicidade nem de direito autoral (4.5). Termos 4.6 permitem usar seu conteúdo para melhorar a IA nos planos comuns, enquanto o rodapé diz "No data reuse" (**contradição**). Dados processados em servidores nos EUA.

## 10. Comparação das três opções
| | Scenario | SpriteCook | API direta (Gemini/OpenRouter) |
|---|---|---|---|
| Foco | geral (imagem, 3D, vídeo) | **pixel art** e sprites | imagem |
| Consistência do personagem | **treino de modelo próprio** (Pro) + referência | referência/tema, sem garantia | só referência na imagem |
| Direções/animação | não confirmado | 3–4 direções, animações curtas | nenhuma |
| 3D (caminho C) | **sim** (imagem → GLB) | não | não |
| Free serve para o jogo? | **não** (só avaliação) | sim (mas pública e sem spritesheet) | depende do provedor |
| Custo para um teste sério | Starter US$ 15 / Pro US$ 45 | Free (≈3–5 imagens) ou US$ 8 | ≈ US$ 0,5 por 6 imagens |
| Pior risco | termos de dados contraditórios | foco pixel, sem 8 direções | sem chave configurada |

**Leitura honesta:** nenhuma das três promete "sprites HD anime em 8 direções prontos". O **Scenario** é a mais promissora para **fixar a identidade do Mago** (modelo treinado) e abre o caminho **imagem → 3D → renderizar as 8 direções**, que é a forma de obter consistência perfeita; **mas** não confirmei qualidade do 3D para personagem anime nem animação/rig, e o Blender não está instalado. O **SpriteCook** tende a servir melhor a criaturas e a estilo mais simples. A **API direta** é a mais barata para um teste de conceito.
**Sugestão de ordem:** (1) Scenario no plano Free **só para avaliar** o conceito do Mago e a consistência entre vistas; (2) se o conceito agradar, decidir entre Starter/Pro para treino e 3D; (3) SpriteCook para criaturas, depois.

---

## 11. Terceira alternativa indicada pelo proprietário: Meshy (3D por IA), 30/10/2026
Fonte: página oficial de preços `meshy.ai/pt-BR/pricing`, **lida por mim diretamente** (não por agente). O workspace (`meshy.ai/workspace`) foi aberto no navegador embutido e **não estava logado** ("Entrar" / "Inscreva-se grátis"); entrar ou criar conta é ação do proprietário.

**O que é.** Caixa de ferramentas de IA para criar **modelos 3D** a partir de texto ou imagem, com texturização, **rigging e biblioteca de animações**. Encaixa no **caminho C** do relatório (3D → renderizar 8 direções → sprites), que dá consistência perfeita entre direções.

**Plano Free (lido na página):**
- 100 créditos/mês (redefinem no dia 1, 00:00 UTC), "até 10" gerações de ativos por mês, 1 tarefa por vez, prioridade baixa.
- Inclui **Imagem→3D, Texto→3D, Texturização por IA, Rigging e animação** (biblioteca de **20** animações no Free; "mais de 500" nos pagos).
- **Não** inclui: Imagem multivista→3D, Texto→Imagem, Remesh, edição de textura, API, retenção de ativos, ativos privados.
- Downloads: **10 por mês, só do modelo "Meshy 6 Lite"** (qualidade menor).
- **Licença: CC BY 4.0** (exige atribuição ao Meshy). FAQ: no Free você "também é bem-vindo para vender", pedindo crédito ao Meshy. Planos pagos: ativos **privados e de propriedade do cliente**.
- Formatos de download: FBX, OBJ, USDZ, GLB, STL, BLEND.
**Pagos:** Starter (250 créditos/mês, 25 gerações, 20 downloads, ativos privados), Pro (1.000 créditos, API), Premium (3.000), Studio (5.500). Preço em reais: a página mostra moeda BRL, mas o valor não veio no texto lido.

**Limites e riscos honestos (a validar com o teste):**
- Qualidade do 3D de **personagem anime** (rosto, mãos, mangas): **não verificada**. Costuma ser o ponto fraco de 3D por IA.
- O Free baixa só o "Lite" e só 10 vezes por mês.
- Para virar sprites ainda faltam **ferramentas**: renderizar o GLB em 8 direções exige Blender (não instalado) ou um renderizador (por exemplo three.js, que seria uma dependência a aprovar; **não instalada**).
- Atribuição obrigatória (CC BY 4.0) enquanto o plano for Free; pagar muda a licença.
- A versão com rigging/animação do Free tem só 20 animações prontas; ataque de mago específico pode não existir.

**Teste proposto (cabe no Free, ≈1–3 gerações):**
1. **Texto→3D** do Mago (sem enviar imagem), com o design original da seção 5, estilo estilizado/anime, pose em T ou A.
2. Se o resultado servir como base, **rigging + 1 animação de andar e 1 idle** da biblioteca.
3. Baixar **1 GLB** (conta como 1 dos 10 downloads) e avaliar: silhueta, rosto, mãos, materiais, deformação ao animar.
Critérios: os mesmos C1–C6 da seção 6, mais **qualidade do rig** e **peso do modelo**. Subir uma imagem de referência (por exemplo o Mago do PoC) para Imagem→3D é um **envio a serviço externo e só com seu OK separado**.
