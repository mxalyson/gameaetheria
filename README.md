# Aetheria — Arena dos Ecos

RPG de arena para navegador (JavaScript puro, Canvas 2D, sem dependências de runtime): classes (Guerreiro, Mago, Arqueiro, Clérigo), itens por raridade, spirits, PvE (bosques, chefes, ondas) e PvP contra rival.

## Jogar
- **Online (celular ou PC):** https://mxalyson.github.io/gameaetheria/ (disponível depois de ativar o GitHub Pages: *Settings → Pages → Source: GitHub Actions*). Em paisagem, com controles de toque.
- **No PC:** `npm start` e abra http://localhost:5174/
- O progresso fica salvo no **navegador do aparelho** (não sincroniza entre aparelhos ainda).

## Laboratório de arte (não faz parte do jogo)
`/labs/iso-poc/index.html` — protótipo isométrico com os heróis em miniatura. Os arquivos de arte gerada ficam fora do Git por padrão; sem eles o laboratório mostra só o mago de referência.

## Desenvolvimento
- `npm test` (unitários) · `npm run test:e2e` (Playwright) · `npm run perf:poc` (FPS na GPU)
- Decisões e roteiro: `docs/decisions/`, `docs/roadmap/`, `docs/art-direction/`; avaliação rápida: `docs/AVALIACAO-HOJE.md`.

## Créditos
Personagens em miniatura: modelos e conceitos gerados com **Meshy** (CC BY 4.0). Detalhes e licenças das ferramentas: `docs/CREDITOS.md`.
