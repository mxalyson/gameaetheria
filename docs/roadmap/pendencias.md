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
