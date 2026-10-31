# Aetheria — Arena dos Ecos

RPG de arena para navegador: classes (Guerreiro, Mago, Arqueiro, Clérigo), itens por raridade, spirits, PvE (bosques, chefes, ondas) e PvP contra rival com Elo. JavaScript puro (módulos ES), **Canvas 2D**, zero dependências de runtime. (O briefing o chamava de "Projeto Arcana"; o nome no código e na UI é Aetheria.)

## Decisões fixas
- **Motor: Canvas 2D próprio.** Babylon.js/3D/GLB/Blender foram recusados (ver `docs/decisions/0001-manter-canvas-2d.md`). Não reintroduzir sem autorização do usuário.
- **Direção de arte: ISOMETRIC HD ANIME FANTASY** (decisão 0004, do proprietário). Câmera isométrica real; personagens anime fantasy HD; produção híbrida (sprites originais + efeitos/ambiente procedurais); prioridade em personagens, animações e combate; PC primeiro, Android depois. O estilo pastel top-down anterior (0003) é histórico e **não é a direção definitiva**; o Vale de Auren foi rejeitado e fica arquivado (não importar em `main.js`, não apagar, não reaproveitar visual automaticamente). Não reverter essas decisões sem nova aprovação.
- **Motor de renderização:** Canvas 2D segue válido (0001) até a decisão Canvas 2D × PixiJS por prova de conceito. Plano e riscos em `docs/roadmap/isometric-migration.md`. A simulação (`core/`, `data/`, `game/`) não deve ser alterada pela migração visual; a renderização consome o estado, não controla regras.
- **Visual inteiro isométrico, em fases B1–B5** (decisão 0007, do proprietário): identidade+UI → monstros/NPCs → cenário → câmera no jogo real → telas. O jogo real (`public/src/`) só é tocado quando uma fase disser isso e for aprovada; rascunho da identidade em `docs/art-direction/identidade-visual-v0.md`.
- Trabalho em fases; ao fim de cada fase, relatar e aguardar aprovação.

## Laboratório isométrico (isolado, não faz parte do jogo)
`public/labs/iso-poc/` é a prova de conceito da direção visual isométrica (decisão 0004). **Nada em `public/src/` importa essa pasta.** Usa a simulação real em modo somente leitura. Relatório: `docs/roadmap/iso-poc-report.md`; formato de sprites: `docs/art-direction/pipeline-sprites.md`; backend de renderização: decisão 0005 (**proposta**, não aprovada). Regra de desempenho medida: `imageSmoothingQuality = 'low'` (com `high`/`medium` o Canvas fica ~14× mais lento). O visual de herói por código **não** atingiu o padrão "HD anime": não tratar como arte final.

## Comandos
- `npm start` — servidor estático em http://localhost:5174 (`server.js`)
- `npm test` — testes unitários do núcleo/simulação (`node:test`, `tests/*.test.js`)
- `npm run perf:poc` — mede FPS reais do PoC isométrico com GPU (Direct3D11); grava `test-results/perf-poc.json`. Não usar o Chromium padrão do Playwright para medir desempenho (renderiza por CPU).
- `npm run test:e2e` — Playwright (`tests/e2e`); sobe o servidor sozinho; o jogo expõe `window.game`. `tests/e2e/mobile.spec.js` emula celular em paisagem (844×390) com toque real via protocolo do Chrome.

## Arquitetura (`public/src`)
- `core/` — regras puras: combate, stats, loot, progressão, rival, RNG com semente. Sem DOM.
- `data/` — dados declarativos: classes, skills, mobs, itens, spirits, zonas.
- `game/` — `sim.js` (World: atores, projéteis, áreas, drops), `ai.js` (intenções de mobs/rival), `layout.js` (decoração e colisões determinísticas por zona). Sem DOM nem canvas.
- `render/renderer.js` — única camada que desenha (funções `draw*`). Procedural, sem imagens.
- `ui/ui.js` + `style.css` — HUD e painéis em DOM, ações via `data-action`.
- `touch.js` + `touch-logic.js` — controles de toque (joystick, botões, auto-mira); a lógica pura fica em `touch-logic.js` (testada em Node). `prefs.js` — opções do aparelho (escala da UI, qualidade, tipo de controle), salvas à parte do personagem.
- `main.js` — classe `Game`: loop, modos (`title | explore | pvp | waves | ended`), ações da UI. `input.js`, `save.js` (localStorage `aetheria_save_v1`), `shop.js`.
- Princípio: simulação por "intenções" (as mesmas que um cliente enviaria a um servidor) para permitir multiplayer autoritativo no futuro. Manter determinismo (RNG com semente) e não vazar DOM para `core/`, `data/`, `game/`.

## Zonas
Vila de Lúmen (segura) → Bosque Verdejante (Nv 1-6, chefe Carvalho Ancestral) → Planície de Cristal (Nv 6-12, Colosso de Cristal) → Ruínas Sombrias (Nv 12-20, Guardião das Ruínas); Arena de Lúmen (duelo) e Arena das Ondas (PvE). Nível máximo 30.

## Padrões de código
- Seguir o estilo existente: ES modules, 2 espaços, aspas simples, comentários curtos em português explicando o "porquê".
- Mudanças de regra em `core/` ou `game/` exigem teste em `tests/core.test.js`.
- Preferir ajustar `data/*.js` a criar sistemas novos. Poucos sistemas completos > muitos superficiais.
- Sem dependências de runtime novas sem justificativa. Preservar funcionalidades existentes; não apagar sem autorização.

## Arte e desempenho
- Toda arte é desenhada no renderer; validar o padrão visual em UM caso antes de produzir em massa. Sem placeholders permanentes, UI não genérica. **Personagens jogáveis: miniatura/caricato (Summoners War + anime) e arte real, nunca formas geométricas desenhadas por código** (decisão 0006; pipeline em `docs/art-direction/personagens-miniatura.md`). Arte gerada/licenciada fica em `public/labs/iso-poc/art-local/` (fora do Git) até a licença ser confirmada.
- Medir o custo por frame antes/depois de mudanças visuais; evitar alocações dentro de `draw()`; usar cache offscreen (ex.: `buildGround`) para o que é estático.
- A fonte vem do Google Fonts (recurso externo): preferir arquivo local ao evoluir.

## Agentes (`.claude/agents`) e skills (`.claude/skills`)
`game-director` (prioridades, identidade) · `render-engineer` (renderer.js) · `art-animator` (personagens, criaturas, cenários, animação procedural) · `gameplay-level-designer` (combate, balanceamento, zonas) · `qa-tester` (testes). Skills: `aetheria-art-direction`, `aetheria-playtest`. Um agente por área; evitar edições conflitantes no mesmo arquivo.

## Qualidade e honestidade de status
Classificar sempre: **implementado / testado / validado / pendente / com falha**. Nunca dizer que algo passa sem rodar o comando. Uma imagem de conceito não é asset; um desenho estático não é personagem animado.

## Segurança e processo
- Git ativo (histórico desde a Fase 1); commitar por fase. Backup antes de mudanças estruturais (`H:\aetheria-backups`).
- Sem deploy/publicação sem autorização. Nunca expor tokens/chaves; não ler `.env` de outros projetos.
- Instalar ferramentas só após verificar a origem. Licenças de assets externos devem ser checadas e registradas.
- Servidor local sem autenticação: usar apenas em localhost.
