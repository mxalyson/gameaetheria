# Aetheria — Arena dos Ecos

RPG de arena para navegador: classes (Guerreiro, Mago, Arqueiro), itens por raridade, spirits, PvE (bosques, chefes, ondas) e PvP contra rival com Elo. JavaScript puro (módulos ES), **Canvas 2D**, zero dependências de runtime. (O briefing o chamava de "Projeto Arcana"; o nome no código e na UI é Aetheria.)

## Decisões fixas
- **Motor: Canvas 2D próprio.** Babylon.js/3D/GLB/Blender foram recusados (ver `docs/decisions/0001-manter-canvas-2d.md`). Não reintroduzir sem autorização do usuário.
- **Direção de arte: o estilo atual do jogo (top-down 2D, pastel limpo, procedural) é a referência aprovada pelo usuário.** O diorama isométrico do Vale de Auren foi testado nas Fases 3-4 e **rejeitado** (ver `docs/decisions/0003-estilo-visual-atual.md`). Melhorias visuais devem evoluir o estilo existente, não trocá-lo. A skill `aetheria-art-direction` ainda descreve a meta antiga e deve ser revisada antes de ser usada.
- Trabalho em fases; ao fim de cada fase, relatar e aguardar aprovação.

## Comandos
- `npm start` — servidor estático em http://localhost:5174 (`server.js`)
- `npm test` — testes unitários do núcleo/simulação (`node:test`, `tests/*.test.js`)
- `npm run test:e2e` — Playwright (`tests/e2e`); sobe o servidor sozinho; o jogo expõe `window.game`

## Arquitetura (`public/src`)
- `core/` — regras puras: combate, stats, loot, progressão, rival, RNG com semente. Sem DOM.
- `data/` — dados declarativos: classes, skills, mobs, itens, spirits, zonas.
- `game/` — `sim.js` (World: atores, projéteis, áreas, drops), `ai.js` (intenções de mobs/rival), `layout.js` (decoração e colisões determinísticas por zona). Sem DOM nem canvas.
- `render/renderer.js` — única camada que desenha (funções `draw*`). Procedural, sem imagens.
- `ui/ui.js` + `style.css` — HUD e painéis em DOM, ações via `data-action`.
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
- Toda arte é desenhada no renderer; validar o padrão visual em UM caso antes de produzir em massa. Sem placeholders permanentes, sem chibi, UI não genérica.
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
