# Testes
- Unitários: `npm test` — 89 testes (RNG, stats, loot, progressão, dano, Elo, rival, arena por times, poder, **combate: determinismo, eventos, skills, status, Clérigo em grupo** em `tests/combat.test.js`). Última execução (2026-10-31, após P1): 89 passam.
- E2E: `npm run test:e2e` — 51 testes. Última execução completa (após P1.5): 51 passam. Na execução anterior, 1 teste do celular emulado oscilou sob carga (passou 3/3 sozinho). Testes do laboratório e do celular emulado podem oscilar quando o PC está ocupado.
- Equilíbrio: `npm run balance -- --level N --n 30` (duelos reais classe×classe; meta 45–55% de vitórias e 20–40 s).

- E2E do Vale (`tests/e2e/vale.spec.js`): carrega `/vale.html`, espera 60 quadros, confere que o canvas não está em branco e que não há erros de console. Desempenho medido no Chromium headless sem GPU: cerca de 11 ms de desenho por quadro (22 ms antes de cachear os tiles). Não medido em GPU real nem em celular.

- Celular (`tests/e2e/mobile.spec.js`, emulação 844×390 com toque): interface de toque, cabe na tela sem sobreposição, joystick, ataque/skill/poção com multitoque e auto-mira, painéis e opções (escala/qualidade, persistência), item em 2 toques, aviso de rotação, telas de título e criação. Unitários novos: `tests/touch.test.js` (joystick, mira, preferências). Totais na última rodada: 31 unitários e 13 no navegador, todos passando.
  Limite: é emulação do Chrome, NÃO um aparelho real; desempenho em celular não medido.

- PoC isométrico: `tests/iso-poc.test.js` (8 unitários: projeção ida e volta em 2:1 e 30°, 8 setores de direção, profundidade, câmera, animação) e `tests/e2e/iso-poc.spec.js` (7: carga com simulação real, 8 direções, ataque e Bola de Fogo reais com dano da simulação, morte com fantasma, ordem de profundidade, formato de atlas PNG+JSON, câmera e 2:1×30°). Última rodada: **39 unitários e 20 no navegador**, estáveis em 3 execuções seguidas.
- Desempenho (`npm run perf:poc`, `tests/perf/`): FPS reais na GPU; resultado arquivado em `docs/roadmap/iso-poc/perf-poc.json`. Lição: testes que dependem de tempo fixo oscilam quando o FPS cai (a simulação roda mais devagar que o relógio com passo máximo de 5 por quadro); esperar o **efeito** em vez de um tempo.

Lacunas (após P1): telégrafo de chefe, colisões em detalhe, ondas, loja, save/migração, UI e desempenho multiplayer ainda não têm teste automatizado; não há testes de rede, segurança nem carga.

Hook de teste: `window.game`.
