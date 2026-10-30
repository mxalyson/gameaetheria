# Laboratório: PoC isométrico (Fase 1)
**Não faz parte do jogo.** Nada em `public/src/` importa esta pasta. Usa a simulação real do jogo em modo somente leitura.

- Rodar: `npm start` e abrir `http://localhost:5174/labs/iso-poc/index.html`
- Parâmetros: `?tilt=30` (isométrica de 30°; padrão 2:1) · `?zoom=1.5` · `?mobs=40` · `?dpr=2` · `?bake=1.5` (resolução dos sprites) · `?off=ground,sprites,fly,grade` (desliga partes para medir custo) · `?smooth=low|medium|high` (use `low`)
- Teclas: WASD mover (relativo à tela) · mouse mira · clique ataque · 1/2/3 Bola de Fogo, Nova de Gelo, Teleporte · roda ou `+`/`-` zoom · `T` alterna 2:1 e 30°
- Visualizador de sprites: `sheet.html?who=mage|slime&clips=idle,walk&views=0,2,4&zoom=1.5&bake=2`
- Testes: `tests/iso-poc.test.js` (puros) e `tests/e2e/iso-poc.spec.js` (navegador). Desempenho: `npm run perf:poc`.
- Relatório: `docs/roadmap/iso-poc-report.md` · Formato de sprites: `docs/art-direction/pipeline-sprites.md`

Limitações conhecidas: arte do Mago é um andaime por código (não é a arte final); só o Bosque; só a Geleia como inimigo; cenário limitado a árvores, arbustos, pedras, tufos, flores e lagoas; o ataque da Geleia mostra a animação depois do dano.
