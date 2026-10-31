# Arquitetura
Fluxo por quadro (`main.js`): input → intenções → N ticks de **passo fixo (60 Hz)** de `World.update(FIXED_DT)` (sim + ai) → eventos → `Renderer.draw` → `UI.updateHud`. A simulação emite eventos (`hit`, `heal`, `swing`, `status`, `cast`, `death`); efeitos visuais usam um RNG próprio (`vrng`) e podem ser desligados (`new World(zona, { visuals: false })`: servidor, balanceamento, testes) sem mudar o resultado do jogo.
- `core/` e `data/`: regras e dados, sem efeitos colaterais.
- `game/sim.js`: `World` guarda atores, projéteis, áreas, telegraphs, drops, partículas e textos. Atores: `player`, `rival`, `mob`, `spirit`.
- `game/ai.js`: mob (idle/chase/return, ranged vs melee, golpe telegrafado de chefe) e rival produzem intenções.
- `render/renderer.js`: ordena por Y, desenha sombras, atores, projéteis (blend `lighter`), barras e textos; chão cacheado por zona.
- Futuro multiplayer: `server.js` hospedaria `core/` + `game/` de forma autoritativa; `save.js` viraria chamada ao servidor.

Limitação conhecida: buscas lineares em `World.actors` (filter/find); reavaliar com muitos atores.

Limitação conhecida (P1): `fx/particles/texts` ainda ficam em `World` (renderer e laboratório os leem); com `visuals:false` não são criados. Mover para uma camada só do cliente fica para quando o servidor existir.
