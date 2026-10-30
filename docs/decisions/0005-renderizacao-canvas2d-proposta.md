# 0005 — Backend de renderização para a visão isométrica: Canvas 2D (PROPOSTA)
Data: 2026-10-30. Status: **PROPOSTA — aguardando aprovação do proprietário.** Não altera a 0001 (Canvas 2D segue válido).

## Contexto
O plano pedia avaliar Canvas 2D × PixiJS por prova de conceito. O PoC (`public/labs/iso-poc/`, relatório em `docs/roadmap/iso-poc-report.md`) mediu o Canvas 2D numa GPU Intel UHD integrada: 75 FPS em 1080p em uso, 64 FPS com 120 monstros, 39–46 FPS em canvas 4K. PixiJS **não foi medido** (instalação não autorizada).

## Proposta
1. Manter **Canvas 2D** como backend da visão isométrica, **desde que** `imageSmoothingQuality = 'low'` (com `'high'`/`'medium'` o desempenho cai ~14×).
2. Isolar o desenho de sprites atrás de poucas funções (`drawSprite`, `drawFrame`, `glowSprite`), para permitir trocar o backend depois.
3. Reabrir a decisão (e só então medir PixiJS, com instalação restrita a `public/labs/`) se o combate real exigir: ≥200 partículas aditivas simultâneas, iluminação dinâmica por shader, ou 4K a 60 FPS.
4. Meta de desempenho: 60 FPS em 1080p com ≈150 sprites e ≈200 partículas; ≥30 FPS no pior caso. Medir com `npm run perf:poc` (GPU), nunca com o Chromium padrão do Playwright.

## Consequências
- Sem nova dependência de runtime. Menor risco de migração.
- O teto de partículas e de luz dinâmica fica a validar no combate real (o PoC gera poucas partículas).
- Histórico preservado: 0001 (manter Canvas 2D) e 0004 (direção visual) continuam em vigor.
