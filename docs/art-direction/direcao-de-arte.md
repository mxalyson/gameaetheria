# Direção de arte
Alvo: FANTASY MINIATURE DIORAMA + ANIME ISOMETRIC RPG, em Canvas 2D.

**Estado atual (honesto):** o renderer é top-down 2D em estilo pastel limpo; **ainda não** é isométrico nem diorama. Isso é a meta, não o que existe.

Meta: maquete viva (bordas de terra/rocha, altura, sombras), vegetação variada, ruínas e cristais, luz atmosférica; heróis anime com silhueta por classe; sem chibi, sem cenário vazio, sem UI genérica.

Regra: validar em UM cenário/personagem antes de replicar. Legibilidade de combate vem primeiro.

## Protótipo do Vale de Auren (Fase 3)
Página separada: `/vale.html` (`public/src/render/vale.js`), sem ligação com o jogo. Projeção isométrica 2:1 real, altura em degraus, luz vinda da esquerda.
Contém: terreno em camadas (grama, terra, rocha), rio com cachoeiras e queda pela borda, ruínas em platô com altar rúnico, ponte, 4 cristais, árvores (pinheiro/carvalho), arbustos, rochas, flores, partículas e névoa, e uma figura de herói para escala.
Limites conhecidos: o herói é só uma figura estática de escala (sem rig nem andar); os degraus do rio ficam discretos; terreno é gerado por fórmula, ainda sem editor de mapa; nada disso está integrado ao jogo.
Decisão tomada: isometria real (não ilusão de altura). Integrar ao renderer principal exige trocar a lógica de câmera, picking do mouse e ordenação, e fica para aprovação à parte.
