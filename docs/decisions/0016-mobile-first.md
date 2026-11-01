# 0016 — Jogo pensado para celular (mobile-first) por enquanto
Data: 2026-10-31 · Status: **implementado e testado no navegador (toque emulado e mouse)**; **não validado em aparelho real**. Decisão do proprietário: por ora o jogo é para celular, não para PC com teclas.

## O que mudou
- **Toque é o padrão em qualquer tela** (`touch.js`): joystick à esquerda, ataque/3 habilidades/poção/🏠/💬 à direita. No PC os botões respondem ao mouse. Em Opções: "Toque (padrão)" ou "Teclado e mouse" (escolha explícita). O teclado continua funcionando como atalho extra quando o modo é teclado.
- **Sem dicas de teclado:** barra de teclas (LMB, 1, 2, 3, Q, H, P) some no modo toque; textos de tutorial, painéis, avisos e dicas deixaram de citar teclas (WASD, "tecla G", "(C)"…); passam a citar os botões (🧙 🎒 🔮 📖 🗺️ 👥 🧪 🏠).
- **Menu com botões para tudo que era tecla:** mochila, personagem, spirits, **diário** e **mapa** (novos), **grupo** (só com conta) e tela cheia (sempre visível).
- Já existiam: paisagem obrigatória em celular (aviso "gire o aparelho"), tela cheia + bloqueio de orientação, margens seguras (`env(safe-area-inset-*)`), manifesto `landscape`/`fullscreen`.

## Exceção de teste (documentada de propósito)
Navegador automatizado **sem toque emulado** (`navigator.webdriver` e sem `pointer: coarse`) usa o modo teclado quando as opções estão em "auto", para os ~80 testes e2e de teclado/mouse seguirem valendo. Com toque emulado ou com a opção "Toque" escolhida, o comportamento é o do jogador real. Testes: `tests/e2e/mobile-first.spec.js` (3).

## Limites
Sem medição em aparelho real; o menu superior direito ficou largo (7 botões) e pode precisar de redesenho na fase B1 (identidade + interface); painéis e lojas ainda são desenhados para mouse (alvos de toque pequenos em alguns); atalhos de teclado seguem ativos no modo toque (sem efeito para quem não tem teclado).
