# Android — preparação (P10)
Data: 2026-10-31 · Status: **preparado, NÃO testado em aparelho nem empacotado** (esta máquina não tem Android SDK, Java, adb nem Docker).

## O que já está pronto no jogo (testado no navegador desktop)
| Item | Estado | Onde / prova |
|---|---|---|
| Controles de toque (joystick, botões, auto-mira), paisagem 844×390 | implementado e testado (emulação de toque via protocolo do Chrome) | `touch.js`, `tests/e2e/mobile*.spec.js` |
| Manifesto PWA: ícones PNG 192/512/maskable, `fullscreen`, `landscape`, `id` | implementado e testado | `public/manifest.webmanifest`, `public/icons/`, `tests/e2e/pwa.spec.js` |
| Service worker: o jogo reabre **sem rede** depois da 1ª visita | implementado e testado (Chromium, offline simulado) | `public/sw.js`, `public/src/pwa.js`, `pwa.spec.js` |
| Memória de texturas adaptativa (escala 1 / 0,75 / 0,5 por qualidade e `deviceMemory`) | implementado e testado (valor medido no navegador bate com o calculado) | `render/hero-sprites.js`, `tools/texture-budget.mjs`, `texture-budget.spec.js` |
| Salvamento na nuvem + conta (funciona em qualquer WebView/navegador) | implementado e testado | P5 |

**Memória de texturas dos 4 heróis (RGBA decodificado):** 86,8 MiB (qualidade alta) · 48,8 MiB (média, padrão em celular) · 21,7 MiB (baixa). O orçamento de **64 MiB é uma suposição** minha (aparelhos de 3–4 GB de RAM), não uma medição: a alta fica acima dele e é por isso que celular usa a média por padrão. **Pendente:** validar em aparelho real quanto a GPU/WebView realmente aguenta.

**Custo de desenho (`tests/e2e/draw-cost.spec.js`):** 844×390, rasterização por **CPU** (Chromium headless, sem GPU): média ≈ 9 ms com 8 atores, ≈ 9,5 ms com 25 e ≈ 11,4 ms com 50 (p95 12 ms). É um cenário **pessimista e não equivale a um celular**: serve como referência de que o custo não explode com o número de atores (o custo base é o cenário). **Não há medição em celular.**

## Caminhos de empacotamento (comparação)
| Caminho | Licença (npm view, leitura) | Prós | Contras | Recomendação |
|---|---|---|---|---|
| **PWA instalável** (já pronto) | — | zero dependências; atualiza ao publicar; mesma base de código | exige **HTTPS** num domínio; sem Play Store; instalação via "Adicionar à tela inicial" | **Primeiro passo** (testar em aparelho real) |
| **TWA** (Trusted Web Activity) com Bubblewrap (`@bubblewrap/cli` 1.27.0, Apache-2.0) | Apache-2.0 | publica na Play Store usando o mesmo PWA, sem reescrever; usa o Chrome do aparelho (WebView moderno) | precisa de domínio HTTPS com `assetlinks.json`, conta Play, chave de assinatura, JDK + Android SDK | **Segundo passo**, se o PWA se provar bom no aparelho |
| **Capacitor** (`@capacitor/cli` 8.6.0, MIT) | MIT | WebView empacotado (funciona sem domínio), acesso a recursos nativos (vibração, orientação, insets) | projeto Android/Gradle para manter; mais uma dependência; ainda é WebView | Só se o TWA não bastar |
> Nada disso foi instalado. Antes de instalar qualquer um: checar origem, licença, vulnerabilidades (`npm audit`) e registrar em `docs/CREDITOS.md`.

## Bloqueios que dependem de você (não posso fazer sozinho)
1. **Servidor publicado com HTTPS/WSS** e domínio (a conta é obrigatória online; o GitHub Pages continua offline).
2. **Conta de desenvolvedor Google Play** (taxa única) e **chaves de assinatura** (geradas e guardadas por você; nunca no Git).
3. **Um aparelho Android** (ou emulador instalado) para medir FPS/memória/toque reais.
4. Se quiser login Google: **Client ID** do Google Cloud para o domínio do jogo.

## Checklist para a primeira validação em aparelho
- [ ] Servir por HTTPS (túnel/proxy de teste) e abrir no Chrome do Android; "Instalar app".
- [ ] Ver se o ícone/maskable, tela cheia e paisagem funcionam; abrir sem rede.
- [ ] Medir FPS em PvP 4×4 com qualidade média e baixa; anotar RAM (chrome://inspect).
- [ ] Conferir área segura (notch), bloqueio de rotação e botões de toque em telas de 5" a 7".
- [ ] Reconexão ao trocar Wi-Fi ↔ 4G (a sala segura o jogador por `reconnectSec`).
