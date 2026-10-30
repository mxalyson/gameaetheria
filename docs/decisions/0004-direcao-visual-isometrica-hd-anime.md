# 0004 — Direção visual: Isometric HD Anime Fantasy
Data: 2026-10-30. Status: **decisão do proprietário do projeto**. Substitui a 0003 (mantida como histórico).

## Decisões aprovadas
1. Direção visual oficial: **Isometric HD Anime Fantasy**.
2. Câmera isométrica real (não top-down com cenário inclinado).
3. Personagens com acabamento anime fantasy HD.
4. Produção artística híbrida: sprites originais (heróis, monstros, chefes, NPCs, spirits, equipamentos importantes) + elementos procedurais (partículas, luz, efeitos, sombras, vegetação complementar, ambiente).
5. Prioridade inicial: personagens, animações e combate.
6. Plataforma inicial: PC/navegador. Android depois, com a versão PC estável.
7. O protótipo isométrico **Vale de Auren** (rejeitado) permanece arquivado e fora da implementação principal; não é reaproveitado automaticamente.
8. O jogo atual e seus sistemas são preservados sempre que tecnicamente possível.

## Contexto
A 0003 (30/10/2026) manteve o estilo pastel top-down depois que o protótipo Vale foi rejeitado. O proprietário revisou e definiu a nova direção acima. A 0001 (manter Canvas 2D) **continua válida** até a decisão sobre o motor de renderização (Canvas 2D × PixiJS), que depende de prova de conceito e aprovação.

## Consequências
- O estilo pastel top-down deixa de ser a direção definitiva. O renderer e o cenário atuais ficam como estado transitório até a migração aprovada.
- Não misturar o estilo antigo com o novo num mesmo quadro sem justificativa técnica e aprovação.
- O trabalho de toque/Android já entregue (controles, opções, qualidade) é independente do estilo e permanece; novo trabalho de Android só depois da versão PC estável.
- Plano técnico: `docs/roadmap/isometric-migration.md`. Pendências de decisão listadas na seção 14 desse documento.
