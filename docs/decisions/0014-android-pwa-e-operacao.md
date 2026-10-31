# 0014 — Preparação para Android (PWA) e operação do servidor (P10)
Data: 2026-10-31 · Status: **implementado e testado no navegador desktop/Node**; empacotamento Android e Docker **não validados**.

## Decisões
1. **PWA primeiro, empacotador depois.** O jogo já é web; ícones PNG, manifesto e service worker deixam instalar e abrir offline sem dependência nova. TWA (Bubblewrap, Apache-2.0) é o próximo passo se o PWA se provar bom em aparelho; Capacitor (MIT) só se for preciso WebView próprio. Nenhum foi instalado. Detalhes: `docs/roadmap/android.md`.
2. **Canvas 2D mantido** (decisão 0001). A prova de conceito Canvas × PixiJS segue **pendente**: não há dado de aparelho que a justifique ainda.
3. **Memória de textura por qualidade:** escala 1 / 0,75 / 0,5 aplicada ao carregar (`createImageBitmap` com redimensionamento), limitada por `deviceMemory`; `?texscale=` força. 4 heróis: 86,8 / 48,8 / 21,7 MiB. Orçamento de 64 MiB é **suposição**.
4. **Service worker "stale-while-revalidate"** só para o mesmo site; não intercepta API/WebSocket/outras origens nem `/labs/`. Subir `VERSION` em `public/sw.js` invalida o cache. Os testes e2e padrão bloqueiam o SW (`serviceWorkers: 'block'`) para não misturar cache entre testes; só `pwa.spec.js` o liga.
5. **Operação:** `readConfig` valida o ambiente; `/healthz`, `/readyz`, `/metrics` (token), logs JSON, desligamento limpo com aviso aos clientes, restauração de backup com salvaguardas.

## Medições (esta máquina; não são promessas)
- `draw()` 844×390, CPU headless: 9,0 / 9,5 / 11,4 ms médios com 8 / 25 / 50 atores.
- Testes novos: 4 unitários (`ops.test.js`), e2e `texture-budget` (2), `pwa` (2), `draw-cost` (1).

## Riscos aceitos / pendências
SW pode servir arquivos antigos até a próxima visita (aceitável; versão do cache controla). Sem HTTPS não há instalação nem SW fora de `localhost`. Sem aparelho real não há FPS/memória de celular. Docker não testado. Sem alertas/agregação de logs.
