# Pendências para revisão do proprietário
Lista viva: o que ficou sem fazer, sem validar ou dependente de você. Atualizada ao fim da P10 (2026-10-31). Marque `[x]` quando resolver.

## Depende de você (eu não consigo fazer sozinho)
- [ ] Publicar um servidor com **HTTPS/WSS** e domínio (hoje o GitHub Pages fica offline: não há servidor).
- [ ] **Google Client ID** do Google Cloud para o domínio do jogo (login Google nunca foi testado com o Google real).
- [ ] Conta de desenvolvedor **Google Play**, chaves de assinatura (guardar fora do Git) e um **aparelho Android** para medir.
- [ ] Aprovar a P10 e decidir quando enviar P9/P10 ao GitHub (último push: 9d013fd).
- [ ] Decidir o envio das fases de arte B2–B5 (monstros/NPCs, cenário, câmera no jogo real, telas) e o Místico (5º herói pendente de atlas).

## Não validado (sem ferramenta ou aparelho nesta máquina)
- [ ] Empacotamento Android (TWA/Capacitor): sem SDK/Java/adb.
- [ ] Dockerfile/docker-compose: nunca construídos.
- [ ] FPS, memória e toque em **celular real**; orçamento de 64 MiB de textura é suposição.
- [ ] `SIGTERM` real no Linux (só a função de desligamento foi testada).
- [ ] Rede real: perda de pacotes, latência, TLS.

## Técnico pendente
- [ ] Prova de conceito **Canvas 2D × PixiJS** (decisão 0001 segue valendo).
- [ ] Exploração PvE ainda é calculada no cliente (servidor só aplica limites de plausibilidade). **Decidido: instâncias solo/grupo. P11.1 (servidor) e P11.2 (cliente) feitas; faltam P11.3 a P11.6 (`docs/decisions/0015-exploracao-no-servidor-instancias.md`).**
- [ ] Rodar `docs/roadmap/teste-android.md` no seu aparelho e me trazer FPS/RAM.
- [x] Heróis em miniatura viraram o padrão (jogo e app instalado); `?visual=original` volta ao antigo. Monstros/NPCs/cenário seguem no visual antigo (fases B2–B5).
- [ ] Picos de coleta de lixo no servidor (perfil `--cpu-prof` em carga longa; reuso de objetos).
- [ ] Snapshots ainda em JSON (sem binário/compressão).
- [ ] Escala além de um processo: SQLite é de um processo (→ PostgreSQL), sem balanceamento entre servidores.
- [ ] Alertas, agregação de logs, agendamento de backup e teste de restauração em máquina limpa.
- [ ] Sem CAPTCHA/anti-abuso de contas em massa; sem teste de invasão por terceiros.
- [x] Sumidouro de ouro de fim de jogo: Ferreiro (aprimoramento +1…+8) — **falta calibrar com jogadores** (≈ 600 abates por peça).
- [ ] Economia: co-op end-game (recompensas além do nível 20) e eventuais outros ralos (taxas, cosméticos).
- [ ] Teste oscilante sob carga: `iso-poc.spec.js` (laboratório; Bola de Fogo, Aprendiz/Franco) e `mobile` "botões" — passam sozinhos.
- [x] Fonte local (Cinzel/Nunito em `public/fonts`, OFL).

## Mobile-first (decisão 0016)
- [ ] Medir toque e desempenho em aparelho real (emulador/celular via adb).
- [ ] Painéis e loja com alvos de toque maiores e menu superior redesenhado (fase B1).
- [x] Medição em celular de topo (Galaxy S23): 60 FPS em todos os cenários (ver `docs/roadmap/android.md`).
- [ ] **Medir um celular médio/fraco** (o risco real) e testar sessão longa (aquecimento). Liberar espaço no `C:` (≈ 2 GB livres).
- [ ] Rebaixar a qualidade sozinho quando o FPS cair; o canvas nunca deve ler pixels (cai para CPU).
- [ ] **Teste e2e `online-match.spec.js` "grupo no jogo real" (4 janelas) trava nesta máquina desde 2026-11-01**: a 3ª e a 4ª janela do Chromium do Playwright não terminam de carregar (`goto` > 15 s) enquanto as duas primeiras rodam o jogo. Passava antes (81/81 e 76/80 de manhã); **falha também com o código anterior aos ícones**, com servidor próprio do Playwright e sem processos órfãos, CPU ociosa e disco liberado, então **não é regressão do código**; causa não identificada (suspeita: Chromium sem GPU compartilhando o processo gráfico entre janelas). Os outros 4 testes do arquivo passam.

## Efeitos e ícones (briefing de ícones/habilidades)
- [x] Etapa 1: ícones das 12 habilidades + poção no jogo real. [x] Etapa 2: 12 efeitos por habilidade.
- [ ] Medir os efeitos num celular real (`tools/android-measure.mjs`).
- [ ] Ícones do **ataque básico** das 4 classes (adiado a pedido do proprietário) e efeitos de impacto/status (lentidão, atordoamento, queimadura, cura em aliados).
- [ ] Origem/licença das folhas de ícones geradas (CREDITOS.md).
- [x] Etapa 3 (categorias, indisponível, crítico/absorção/cura). [ ] Efeito/evento de **esquiva** (exige evento novo na simulação: decidir) e arte pintada de status.

## B1 (identidade e interface)
- [x] Identidade v1 (`docs/art-direction/identidade-visual-v1.md`) + tokens (`public/ui-tokens.css`, ainda não carregado) + kit de componentes (`/labs/b1-ui/kit.html`).
- [ ] **Aprovar** pilares (luminoso, artesanal, misterioso) e a assinatura (ouro + gema em losango + eco).
- [ ] Gerar a arte que falta (`docs/art-direction/briefing-icones-ui.md`): ataque básico ×4, menu ×7, emblemas, raridades, status, logo, key art.
- [ ] B5: migrar as telas reais para o kit (só após aprovação).
- [x] Peças pintadas recebidas e recortadas: painel (9 fatias), botões ×4, cartão do herói, barras de poção (vazio/vida/mana), minimapa redondo, medalhão ×3 → `/labs/b1-ui/hud.html` (HUD completo) e `/labs/b1-ui/kit.html`.
- [ ] **Reenviar 4 folhas que não foram gravadas como arquivo** (só apareceram na conversa): tooltip/faixa/diálogo, 7 molduras de raridade, 4 ataques básicos, 7 ícones de menu.
- [ ] B5: aplicar o HUD pintado no jogo real (retrato real do herói, ícones de menu e ataque pintados), com medição de desempenho.
- [x] 4 folhas reenviadas e recortadas (21 peças). **Ataque básico das 4 classes já está no jogo real** (botão de toque e barra do teclado).
- [ ] B5: aplicar no jogo real os ícones de menu pintados, raridades (7 molduras: comum=0, incomum=1, raro=4, épico=6, lendário=5; 2 e 3 sobram), dica/faixa/diálogo, cartão do herói, barras de poção e minimapa de runas. Falta o **retrato do herói** (hoje emoji no laboratório).
