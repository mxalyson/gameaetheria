# 0003 — Manter o estilo visual atual do jogo
Data: 2026-10-30. Status: decisão do usuário.

Contexto: o briefing pedia "diorama de fantasia em miniatura + RPG anime isométrico". As Fases 3 e 4 criaram um protótipo isométrico (`/vale.html`, `public/src/render/vale.js`, `public/src/game/iso-hero.js`).

Decisão: o usuário avaliou o protótipo, não gostou do estilo e prefere o visual que o jogo já tem (top-down 2D, pastel limpo, desenhado proceduralmente em `renderer.js`).

Consequências:
- O estilo atual é a referência; melhorias evoluem esse estilo.
- O protótipo do Vale fica no repositório (commits 19598a2 e 41553c7) apenas como experimento isolado; não está ligado ao jogo. Remoção só com autorização.
- A skill `aetheria-art-direction` e `docs/art-direction/direcao-de-arte.md` descrevem a meta antiga e precisam ser revisados com o usuário.
