# Testes
- Unitários: `npm test`, 11 testes (RNG, stats, loot, progressão, dano, Elo, spirit, rival, simulação básica). Status: passando.
- E2E: `npm run test:e2e`, 1 teste de fumaça (criar personagem, andar, sem erros de console). Status: passando.

- E2E do Vale (`tests/e2e/vale.spec.js`): carrega `/vale.html`, espera 60 quadros, confere que o canvas não está em branco e que não há erros de console. Desempenho medido no Chromium headless sem GPU: cerca de 11 ms de desenho por quadro (22 ms antes de cachear os tiles). Não medido em GPU real nem em celular.

- Celular (`tests/e2e/mobile.spec.js`, emulação 844×390 com toque): interface de toque, cabe na tela sem sobreposição, joystick, ataque/skill/poção com multitoque e auto-mira, painéis e opções (escala/qualidade, persistência), item em 2 toques, aviso de rotação, telas de título e criação. Unitários novos: `tests/touch.test.js` (joystick, mira, preferências). Totais na última rodada: 31 unitários e 13 no navegador, todos passando.
  Limite: é emulação do Chrome, NÃO um aparelho real; desempenho em celular não medido.

Lacunas: habilidades, esquiva, colisões, chefes, PvP, ondas, UI e desempenho não têm teste automatizado.

Hook de teste: `window.game`.
