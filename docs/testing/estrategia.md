# Testes
- Unitários: `npm test` — 160 testes (RNG, stats, loot, progressão, dano, Elo, rival, arena por times, poder, **combate: determinismo, eventos, skills, status, Clérigo em grupo** em `tests/combat.test.js`). Última execução (2026-10-31, após P1): 160 passam.
- E2E: `npm run test:e2e` — 64 testes. Última execução completa (após P6): 63 passaram e 1 oscilou sob carga (`mobile.spec.js` botões do celular emulado; passou sozinho 2 de 2).
- Equilíbrio: `npm run balance -- --level N --n 30` (duelos reais classe×classe; meta 45–55% de vitórias e 20–40 s).

- E2E do Vale (`tests/e2e/vale.spec.js`): carrega `/vale.html`, espera 60 quadros, confere que o canvas não está em branco e que não há erros de console. Desempenho medido no Chromium headless sem GPU: cerca de 11 ms de desenho por quadro (22 ms antes de cachear os tiles). Não medido em GPU real nem em celular.

- Celular (`tests/e2e/mobile.spec.js`, emulação 844×390 com toque): interface de toque, cabe na tela sem sobreposição, joystick, ataque/skill/poção com multitoque e auto-mira, painéis e opções (escala/qualidade, persistência), item em 2 toques, aviso de rotação, telas de título e criação. Unitários novos: `tests/touch.test.js` (joystick, mira, preferências). Totais na última rodada: 31 unitários e 13 no navegador, todos passando.
  Limite: é emulação do Chrome, NÃO um aparelho real; desempenho em celular não medido.

- PoC isométrico: `tests/iso-poc.test.js` (8 unitários: projeção ida e volta em 2:1 e 30°, 8 setores de direção, profundidade, câmera, animação) e `tests/e2e/iso-poc.spec.js` (7: carga com simulação real, 8 direções, ataque e Bola de Fogo reais com dano da simulação, morte com fantasma, ordem de profundidade, formato de atlas PNG+JSON, câmera e 2:1×30°). Última rodada: **39 unitários e 20 no navegador**, estáveis em 3 execuções seguidas.
- Desempenho (`npm run perf:poc`, `tests/perf/`): FPS reais na GPU; resultado arquivado em `docs/roadmap/iso-poc/perf-poc.json`. Lição: testes que dependem de tempo fixo oscilam quando o FPS cai (a simulação roda mais devagar que o relógio com passo máximo de 5 por quadro); esperar o **efeito** em vez de um tempo.

Rede/segurança (P4): `tests/net.test.js` (17: protocolo, sala, movimento, anti-trapaça, cooldown, replay, limites, reconexão, determinismo) e `tests/e2e/net-poc.spec.js` (2 navegadores reais).
Contas/API (P5): `tests/accounts.test.js` (16: senha, cadastro, login, bloqueio, sessão, recuperação, Google com chave de teste, personagens, importar, nuvem, CORS, limites, operação idempotente), `tests/net-auth.test.js` (7: WebSocket autenticado, personagem do banco, recompensas gravadas uma vez, abandono) e `tests/e2e/online.spec.js` (6: conta obrigatória, cadastro→nuvem→recarregar, salvamento falso recusado, importar save local, Google, modo offline).
Lobby/salas (P6): `tests/lobby.test.js` (16: grupos e convites, fila 2×2/4×4, grupo no mesmo time, bots, rating e poder, isolamento, ponto de controle, tempo, reconexão, nomes) e `tests/e2e/net-poc.spec.js` (1×1 em 2 navegadores e 2×2 com grupo em 4 navegadores). Ajudantes: `tests/helpers/net.js`.
Salvamento: `tests/save.test.js` (migração, validação, trapaça, XSS) e `tests/e2e/save.spec.js` (save antigo, corrompido, backup, importar).

Lacunas (após P1): telégrafo de chefe, colisões em detalhe, ondas, loja, UI e desempenho multiplayer ainda não têm teste automatizado; não há testes de rede, segurança nem carga.

Hook de teste: `window.game`.
