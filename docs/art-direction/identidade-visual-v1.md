`# Identidade visual — v1 (B1) — para aprovar
`2026-11-01 · Substitui o rascunho v0 (`identidade-visual-v0.md`, "ouro + eco"). Agora é **extraída do que já foi aprovado**: os 12 ícones de habilidade (molduras e paletas por classe), os heróis em miniatura e os efeitos. Prova viva: `/labs/b1-ui/kit.html` (componentes) e `/labs/b1-ui/index.html` (cena-chave). Tokens: `public/ui-tokens.css` (**ainda não carregado pelo jogo**; a B5 migra as telas). Nada do jogo real foi alterado nesta fase.
`
`## 1. Três pilares (decidem qualquer dúvida de arte) — *a confirmar com o proprietário*
`1. **Luminoso**: dia limpo e quente, cores saturadas e legíveis ao ar livre numa tela de celular (o chão do jogo é claro; efeitos e UI precisam de contorno escuro, não de brilho aditivo — lição medida na etapa 2).
`2. **Artesanal**: nada liso ou genérico; molduras com bisel, gemas e rebites, pedra e metal com textura; cada classe tem material próprio.
`3. **Misterioso**: o que é importante tem **ouro e runas**; segredos se revelam por brilho (portais, baús, runas), nunca por susto.
`
`## 2. Assinatura e motivos
`- **Ouro** = importante/valioso (botão principal, filete dos painéis, selo de nível, moeda). **Eco** (anéis concêntricos) = recarga, ataque, cantos de painel, transições.
`- **Gema em losango dourado** nos cantos dos painéis (e no topo das molduras de classe): marca registrada repetida.
`- **Runas** nas lajes de fundo (sutis, só em painéis grandes e telas de título).
`
`## 3. Material por classe (molduras dos ícones aprovados)
`| Classe | Material | Cores (token) | Realce |
`|---|---|---|---|
`| Guerreiro | bronze e brasa | `--warrior` #84543c · claro #c98a5a · escuro #4a2a18 | laranja `#ff6a2a` |
`| Mago | metal arcano e runas | `--mage` #6a4cc8 · claro #b79bff · escuro #2a1860 | violeta `#7a4dff` |
`| Arqueiro | madeira e folhas | `--archer` #3f8f3f · claro #8fd07a · escuro #1a4a24 | verde `#7bdc4a` |
`| Clérigo | ouro polido | `--cleric` #d9a82e · claro #fff0a6 · escuro #8a5d08 | dourado `#ffcf4a` |
`Regra: **a moldura de uma classe nunca muda** entre ícones (o Mago foi corrigido na etapa 1). Ilustração central escura, luz de topo-esquerda, sombras em violeta.
`
`## 4. Interface (kit v1)
`- **Laje de pedra** azul-noite (`#2a2f45 → #11142a`) com filete dourado duplo e gemas nos cantos; título em Cinzel com sombra; botão de fechar em medalhão.
`- **Botões:** principal dourado (texto escuro), secundário em vidro azul com filete dourado, perigo vermelho, desativado cinza; **altura ≥ 44 px**.
`- **Barras:** vida segmentada (verde) com aro dourado escuro, XP fina (azul), chefe vermelha; número centrado com contorno.
`- **Células de item:** moldura por raridade com brilho crescente (comum sem brilho → lendário pulsando; respeita `prefers-reduced-motion`).
`- **Categorias de habilidade:** cor **e forma** (dano ■, cura ●, reforço ▲, controle ◆), implementadas no jogo na etapa 3.
`- **Tipografia:** Cinzel (títulos/avisos), Nunito (texto, números de dano em 800); **mínimo 12 px**; fontes locais (OFL).
`
`## 5. O que falta de arte (depende de gerador ou artista; briefing em `briefing-icones-ui.md`)
`Ícones do menu (mochila, personagem, spirits, diário, mapa, grupo, opções), emblemas das 4 classes, **ataque básico ×4**, gemas de raridade, ícones de status, **logo** e a **cena-chave pintada**. Hoje esses itens usam **emojis/glifos provisórios** (marcados como tal).
`
`## 6. Como entra no jogo (B5, só com aprovação)
`Carregar `ui-tokens.css`, trocar `style.css`/`ui.js` por estes componentes mantendo `data-action` e a lógica, redesenhar HUD/minimapa/menu (hoje provisórios) e os painéis (inventário, personagem, loja, arena, spirits, diálogos) com alvos de toque ≥ 44 px. Medir desempenho (sombras e filtros em celular fraco) antes e depois.
`
`## 7. Limites desta versão
`É um **kit em HTML/CSS no laboratório**, não o jogo. Não medi desempenho dos efeitos de vidro/sombra em celular real. Os pilares e a assinatura aguardam sua aprovação; a fase B5 também.
`
`## 8. B5 — HUD pintado no jogo real (2026-11-01) — implementado e testado no navegador
`- **No jogo:** cartão do herói (moldura de bronze com 4 gemas; retrato = emblema da classe, provisório), **vidros de poção** (vida vermelha, XP azul, líquido proporcional por \`--v\`; escudo como filete dourado), **minimapa redondo de runas** (radar de ~700 unidades centrado no jogador, só desenho), **medalhões de menu pintados** (mochila, personagem, spirits, diário, mapa, grupo, opções) e ataque básico por classe. Ids, \`data-action\` e a lógica de \`updateHud\` não mudaram. Assets em \`public/assets/ui\` e \`public/assets/icons\` (≈ 0,5 MB das peças do HUD, reduzidas para 3× a tela do celular); recorte reproduzível: \`tools/ui-pieces-from-sheets.py\`.
`- **Tamanho no celular:** o cartão e o minimapa seguem variáveis (\`--card-w\`, \`--map\`) por altura de tela (de 150/124 px a 100/96 px); menu em fileira ao lado do minimapa no toque e sob ele no teclado.
`- **Testes:** os de celular, ícones, efeitos, missões, salvamento, PWA e orçamento de textura (37 e2e) e os unitários passam. **Não medido em celular real.** Pendentes: retrato pintado por classe; painéis internos (inventário, loja, personagem) ainda no estilo antigo (a moldura em 9 fatias e os botões pintados estão prontos no kit); cartão com nome/nível improvisados (nome sobre a moldura, nível em pílula dourada).

## 9. B5 parte 2 — painéis pintados no jogo real (2026-11-02) — implementado e testado no navegador
Painéis com a moldura de pedra e bronze em 9 fatias (`panel-9.webp`), botões pintados, medalhão de fechar, células por raridade, dica e faixa; capturas em `capturas/painel-*.png`. Só estilo (`style.css`, bloco "PAINÉIS PINTADOS"). Testes de celular, missões, ferreiro, especialização, salvamento, ícones e online passam (45/45 e2e rodados; 221 unitários). **Não medido em celular real.** Pendente: ícones de itens/spirits pintados, retrato por classe, diálogo de NPC com a peça pintada.
