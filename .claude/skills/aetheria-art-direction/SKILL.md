---
name: aetheria-art-direction
description: Padrão visual de Aetheria (top-down 2D, pastel limpo, procedural em Canvas 2D). Use ao criar ou revisar qualquer visual do renderer.
---
Referência aprovada pelo usuário: o estilo ATUAL do jogo (visão de cima, paleta pastel, formas arredondadas, sombras suaves, HUD escura arredondada). O diorama isométrico foi testado e rejeitado (docs/decisions/0003).
Evoluir, não trocar: mais variedade, detalhe, atmosfera e legibilidade dentro desse estilo.
- Tudo desenhado proceduralmente em public/src/render (renderer.js; cenário rico em scenery.js, ativado por zona via z.scenery / z.atmosphere em data/zones.js).
- Posições e colisões vêm de game/layout.js (determinístico, sem DOM). O renderer só desenha.
- Legibilidade de combate vem primeiro: efeitos de atmosfera ficam atrás/sob os atores e com pouca opacidade.
- Cada zona tem identidade própria (paleta, vegetação, luz, partículas). Validar em UMA zona antes de replicar.
- Medir o custo por quadro e manter o chão em cache (buildGround); evitar alocações em draw().
Não: chibi, cenário vazio, formas primitivas como solução definitiva, brilho exagerado, UI genérica.
