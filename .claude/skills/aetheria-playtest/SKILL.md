---
name: aetheria-playtest
description: Como testar Aetheria: testes unitários, e2e com Playwright, verificação de console e desempenho.
---
1. `npm test` (núcleo e simulação, node:test).
2. `npm run test:e2e` (Playwright; sobe server.js na porta 5174; hook de teste: `window.game`).
3. Para exploração manual, use o navegador embutido em http://localhost:5174 e leia o console.
4. Novas mecânicas: adicionar teste em tests/core.test.js (regra) e/ou tests/e2e (fluxo).
5. Relate por item: implementado / testado / validado / pendente / com falha, com o comando executado.
Erros de fontes do Google são ignorados no smoke test (recurso externo).
