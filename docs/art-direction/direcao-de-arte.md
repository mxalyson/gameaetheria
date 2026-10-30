# Direção de arte
Referência aprovada: o estilo atual do jogo (top-down 2D, pastel limpo, procedural em Canvas 2D). Ver `docs/decisions/0003-estilo-visual-atual.md`. O diorama isométrico (protótipo `/vale.html`) foi rejeitado.

## Cenário rico (pacote A, 2026-10-30)
Ativado por zona em `data/zones.js` (`scenery`, `atmosphere`); código em `render/scenery.js` e `game/layout.js`.
- **Bosque Verdejante:** trilha de terra sinuosa entre os portais, 3 lagoas com colisão (vitórias-régias, juncos, brilho e ondas), 4 variações de árvore (redonda, alta, dupla, dourada) com tom individual, tocos, troncos caídos, samambaias, cogumelos, clareiras, raios de sol, pólen e folhas caindo.
- **Ruínas Sombrias:** estrada de lajes até o Guardião, áreas de lajes rachadas, musgo, círculos rúnicos pulsantes, braseiros com luz, estátuas com olhos brilhantes, pedras rúnicas, árvores mortas, entulho, névoa e partículas roxas. Paleta do chão mais escura para dar contraste.
- **Planície de Cristal:** trilha clara de pedra pálida, 2 lagoas cristalinas, árvores de flor rosa, flores luminosas, capim alto, geodos brilhantes, poeira de cristal no chão, raios de luz e partículas azuladas.
- **Vila de Lúmen:** lanternas ao longo dos caminhos, 3 bancos na praça, canteiros de flores na frente de cada casa, caixas perto da mercadora, placa junto ao portal, calçamento de pedrinhas e pétalas ao vento.
- **Arenas:** só uma atmosfera discreta (vinheta roxa e poeira dourada); o chão e o layout não mudaram.
Limites: os efeitos de luz e névoa são sobrepostos em 2D (não há iluminação real); colisão das lagoas é aproximada por círculos; avaliação visual feita só em capturas 1280×720.
