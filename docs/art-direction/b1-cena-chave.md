# B1 — cena-chave e kit de interface para toque (proposta para aprovar)
2026-11-01 · Fase B1 (ADR 0007) com a decisão mobile-first (0016). **Só laboratório**: `/labs/b1-ui/index.html` (captura do jogo real + interface nova por cima). Nada disso está no jogo (isso é a B5).

## Como evitar o "visual seco e feio de IA" (preocupação do proprietário)
1. **Nenhuma imagem de gerador entra no jogo final.** Gerador só para explorar humor/composição, sempre descartável.
2. **A cena-chave é o próprio jogo** (heróis em miniatura com personalidade, mundo, luz) + interface desenhada à mão em **SVG/CSS**, com regras fixas (abaixo). Interface não é personagem: desenhar molduras e glifos em código é permitido (regra 0006 é só para personagens).
3. **Regras que dão "mão de autor"**: um molde único (medalhão); traço de largura constante; ouro só para o que importa; ornamento só nos cantos e na ponta da barra (nunca por tudo); uma única luz (topo-esquerda); anel de "eco" como motivo repetido (recarga, botão de ataque, cantos).
4. **Ícones finais de habilidade, logo e key art pintada**: precisam de **artista** (briefing abaixo). Os glifos atuais são **provisórios** e eu os marco assim.

## O que a prova mostra (`/labs/b1-ui/`)
| Peça | Decisão |
|---|---|
| Cartão do herói | vidro azul-noite com filete dourado; retrato em medalhão com a cor da classe; nível em selo dourado; vida segmentada com ponta dourada; XP fina |
| Ouro | pílula de vidro com moeda |
| Minimapa | moldura com cantos ornamentados e plaqueta da zona; 6 medalhões de menu (mochila, herói, spirits, diário, mapa, opções) |
| Ação (polegar direito) | ataque grande em carmim com **anéis de eco**; 3 habilidades em medalhão; **recarga em arco** com número; "pronta" pulsa em ouro; poção com contador e 🏠 menores |
| Joystick | anel fantasma translúcido + botão claro com aro dourado |
Respeita `prefers-reduced-motion`. Alvos de toque ≥ 44 px (os medalhões do menu têm 29 px visíveis; a área tocável deve ser expandida na B5).

## Briefing para o artista (quando houver)
- **Ícones de habilidade** (12 = 4 classes × 3) + 6 de menu + ataque/poção/casa: 128×128 px, fundo transparente, silhueta legível a 40 px, ouro `#FFCF4A` como acento, sombras em violeta (nunca preto), sem contorno preto duro; estilo "miniatura de Summoners War + anime" coerente com os heróis (`docs/art-direction/personagens-miniatura.md`).
- **Logo** "Aetheria — Arena dos Ecos" (horizontal e quadrado), com o motivo de anéis.
- **Key art** da Vila de Lúmen (paisagem, 2400×1080) só depois de aprovadas as referências.

## Pendente / não validado
Referências do proprietário (3 a 6) ainda não recebidas; glifos provisórios; sem medição de desempenho (filtros `backdrop-filter` e `drop-shadow` em celular fraco precisam ser medidos na B5); painéis (inventário, personagem, loja) ainda não redesenhados para toque.
