# Arquitetura
Fluxo por frame (`main.js`): input → intenções → `World.update(dt)` (sim + ai) → eventos → `Renderer.draw` → `UI.updateHud`.
- `core/` e `data/`: regras e dados, sem efeitos colaterais.
- `game/sim.js`: `World` guarda atores, projéteis, áreas, telegraphs, drops, partículas e textos. Atores: `player`, `rival`, `mob`, `spirit`.
- `game/ai.js`: mob (idle/chase/return, ranged vs melee, golpe telegrafado de chefe) e rival produzem intenções.
- `render/renderer.js`: ordena por Y, desenha sombras, atores, projéteis (blend `lighter`), barras e textos; chão cacheado por zona.
- Futuro multiplayer: `server.js` hospedaria `core/` + `game/` de forma autoritativa; `save.js` viraria chamada ao servidor.

Limitação conhecida: buscas lineares em `World.actors` (filter/find); reavaliar com muitos atores.
