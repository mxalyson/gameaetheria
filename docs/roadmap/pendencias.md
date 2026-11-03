# Pendências para revisão do proprietário
Lista viva: o que ficou sem fazer, sem validar ou dependente de você. Atualizada ao fim da P10 (2026-10-31). Marque `[x]` quando resolver.

## Estado em 2026-11-02 (resumo)
**Feito hoje:** monstros (12) e NPCs (5) pintados e animados; evolução e regras do spirit; atributos em lote; mobs passivos/hostis; XP mais lento; teletransporte por pergaminho; mapas Cume Gélido e Cinzas Ardentes; história "Os Ecos Partidos"; portais com pilares e redemoinho.
**Próximo (sem o Místico):** cenário próprio dos mapas novos; ferreiro como NPC; retrato do chefe na barra; teletransporte online; calibrar XP/farm com jogadores; sobras de fonte/retângulo (mandar capturas).
**Depende de você:** servidor HTTPS/domínio, Google Client ID, conta Google Play + aparelho Android, medir em celular real, confirmar licença das imagens de IA e da folha com marca d'água.

## Auditoria de 2026-11-02 (visual, jogabilidade, bugs, história)
Relatórios completos com tabelas e correções sugeridas: `auditoria-visual.md` (V1–V30), `auditoria-jogabilidade.md` (G1–G13), `auditoria-bugs.md` (B1–B30), `auditoria-historia.md` (S1–S20). Capturas em `docs/art-direction/auditoria/` (fora do Git, 193 MB). **Nada abaixo foi corrigido ainda.** Ordem sugerida:

### P0 — segurança e jogo quebrado (corrigir antes de publicar)
- [x] **B1** `zone_enter` aceita `from` falso: nível 1 entra nas Cinzas sem pergaminho (server/hub.js:284-293). **B2** save forjado aceita `scrolls=99`, `visited`, `pity`, `opal` e itens absurdos (server/plausible.js, core/savedoc.js): limitar atributos por nível/raridade e ignorar `opal/pity/scrolls/visited` vindos do cliente. **B4** `session.char` nunca relido do banco (equipamento/atributos desatualizados nas salas).  ✔ corrigido em 2026-11-02 (ver commit); falta conferir em celular real
- [x] **B3** Não dá para abrir baú no celular (botão de interagir só fala com NPC; `useChest` só pela tecla E): 40 baús inalcançáveis. **S8/V** dicas "[E] abrir baú", "[E] conversar", "(H)", "tecla G" contra a decisão 0016.  ✔ corrigido em 2026-11-02 (ver commit); falta conferir em celular real
- [x] **V1** Botões +5/Máx de atributo cortados no painel Personagem (quebrar linha, ≥ 44 px). **V2** botões do menu com 36 px (subir para 44–48). **V7** painel de Spirits com Evoluir espreme o texto. **V3/V4** barra do chefe invade o HUD; retrato escuro/cortado; Cavaleiro Rubro usa o retrato do Guardião. **V13** rio das Cinzas/Ruínas é faixa lilás translúcida.  ✔ corrigido em 2026-11-02 (ver commit); falta conferir em celular real
- [x] **G1** baús dão loot demais (18 épicos/h nas Cinzas): `luck = 0,25·tier`, chance de item `min(0,8; 0,15·tier)`. **G2** loja vende épico/lendário a 1 min de renda e refaz o estoque ao recarregar a página (persistir nível+semente, só até raro, `itemMarkup` 6). **G3** XP de PvP sem teto (vitória 6%, derrota 2%, limite por hora, anti-troca). **G4** chefes 3 e 4 viram parede: reduzir vida 25% e subir nível das missões (corrigir junto com G1/G2).  ✔ corrigido em 2026-11-02 (ver commit); falta conferir em celular real

### Depois das correções P0 (2026-11-02)
- [x] Entrada falsa por portal, save forjado, equipamento desatualizado, desligamento limpo, exceção em sala, baú no celular, dicas sem tecla, botões de atributo, menu 44 px, spirits, barra/retrato do chefe, rios, loot dos baús, loja, venda 50%, XP de PvP, chefes 3 e 4, opalino e Ferreiro. Unitários 284/284; e2e 102/102; capturas p0-* conferidas (docs/art-direction/auditoria, fora do Git).
- [x] Cosméticos: botão Evoluir em uma linha, linha do Pergaminho legível ("Pergaminho de Viagem"), título do Brok sem repetição, retrato do Cavaleiro Rubro clareado pela luminosidade do sprite, teste de `pickBossTarget`. ✔ 2026-11-02. Sobra: botão da casa online só verificado por código (touch.js); o botão de interagir anima e `locator.tap()` do Playwright dá timeout (usar `touchscreen.tap` por coordenada).
- [ ] Risco: limites novos de XP/nível do servidor (`levelJump` 2, `xpFreeLevels` 1,5) podem reverter progresso de uma sessão longa sem gravar (aba suspensa). Gravação a cada 8 s limita a perda.
- [x] Brilho animado da lava: já existe em `drawGroundLife` (pulso aditivo nos trechos visíveis).

### Depois do P1 (2026-11-02)
- [x] Bugs B5, B6, B7, B10, B11, B13, B14, B17, B18; história S1–S4, S5–S7, S9, S10, S12, S13, S15, S16, S19, S20; jogabilidade G5, G6/G7, G11, G12; visual V5–V30 (exceto o que depende de arte). Unitários 301/301; e2e 100–102 de 102 (1–4 testes oscilam por carga, passam isolados).
- [ ] **Pico de entrada no Bosque** (400–510 ms nos primeiros quadros em CPU, também na 2ª visita): investigar populate/blocos com GPU (`node tools/perf-tiles.mjs`).
- [ ] Medalhão de interagir cobre o rótulo "Toque para conversar" quando o herói fica fora do centro; etiqueta "Nv 31 · Cavaleiro Rubro" parcialmente atrás do menu; no epílogo da Yun a recompensa e o botão "Entregar" ficam abaixo da dobra.
- [ ] S17 lore coletável (placas/estátuas tocáveis) exige objeto interativo no mapa; passos do onboarding "pulso no Ren" não feitos; evento `teleport` online não conta para a missão da Lia (emitir ao receber `zone_joined` de teleporte).
- [ ] Mob desconhecido vindo do servidor lança exceção a cada quadro (guard esconde): `if (!MOBS[sm.mob]) continue` em `updateNet`.
- [ ] Imagens estáticas do HTML (`<img src>` em ui.js/touch.js: ícones, retratos) sem `?v=`; subir `GROUND_V` junto com o `VERSION` do sw.js ao mudar texturas.
- [ ] Clérigo ainda perde para 2 lobos nível 4 sem poção (43% de vitória); Bosque ficou fácil para quem tem equipamento incomum (rampa em `data/mobs.js`).
- [ ] `docs/gameplay/dificuldade.md` ficou desatualizada (tabela de mobs comuns, recarga do ritual 1200 s, respawn de chefes 420–900 s).
- [ ] Rubro tint retocado (vermelho mais profundo) sem captura; B15, B19–B30 (baixa gravidade) não feitos; arte: ponte reta longa, baú aberto, adornos do Cume, retrato do Rubro, emojis 📍⚔️🔒🏆 em painéis de mapa/diário.

### Depois da rodada final (2026-11-02)
- [x] Feito nesta rodada: B15, B19–B30 (parte), mob desconhecido, evento de teletransporte online, `asset()`/`ASSET_V`/`bump-assets.mjs`, S11, S14, S17 (5 placas/estátuas de lore + conquista Leitor de Ecos), rótulos presos à área livre, rodapé fixo no diálogo, emojis de mapa/diário, pulso no Ren, carimbos do terreno 1× por zona (pico do Bosque 400–510 → 191 ms; 2ª entrada 58 ms), Clérigo e rampa de iniciante, acampamentos 300 s, mini-chefes 600 s, `dificuldade.md` atualizado. Unitários 320/320; e2e 101/102 → spec `zona-online` atualizado (regra B15): sem falhas restantes.
- [x] **Decisão do dono (2026-11-02): "sim, é perigo"** — 2 lobos nível 4 juntos podem matar o herói iniciante; balanço mantido. A Ren avisa na missão `caca_aos_lobos` (poção e habilidade). Detalhe original: no jogo real (sem modo deus, kit inicial, nível 4, só ataque segurado) as 4 classes morrem para 2 lobos nível 4 juntos (3–6 s) e o Guerreiro perde ~60% da vida para 1 lobo; o simulador (com skills) dá 95–100%. A rampa garante 1×1, não 2×1. Ajustar `MOB_CURVE.early`/`rookie` ou aceitar como "lobos juntos são perigo" e ensinar a usar poção/skill.
- [ ] Emojis ainda em ui.js: 🔥 (Cinzas no mapa), ⚡ 🌊 🌐 no painel da Arena; cadeado/troféu pintados (hoje chave/pergaminho substituem).
- [ ] Epílogo da Yun em 667×375: área de texto curta e retrato cortado no oval; rótulo do Ren sob o botão de ataque no canto extremo; placa de lore pequena/fina; teste automatizado do empilhamento de rótulos (`drawPrompt`).
- [ ] O 1º bloco do terreno por zona ainda leva 35–85 ms (`paintNatureGround`/rios/seixos refazem o mapa inteiro por bloco, só recortados): passar `bounds` a `paintGroundScenery`; pré-aquecer o layout do Bosque na Vila (70–87 ms a frio).
- [ ] Ritual do chefe final invisível no HUD da instância online (exige protocolo); mini-chefes/acampamentos online só testados em Node.
- [ ] Exports sem uso (tools/dead-code.mjs): `ACHIEVEMENT_IDS`, `QUEST_IDS`, `BOSS_MOBS`, `natureReady`, `spriteNames`, `prepareProps`, `clearChar`; `url(assets/...)`/imagens do HTML já com `?v=` via bump-assets.
- [x] Duelos (2026-11-03, n=100): Nv10 47/53/47/45, Nv20 46/53/48/45, Nv30 com Maestria 50/46/47/51 (Guerreiro/Mago/Arqueiro/Clérigo); sobra Clérigo Nv20 em 45% (borda) e duelos do Guerreiro/Arqueiro < 20 s. Ver dificuldade.md.
- [ ] Tudo segue **sem teste em celular real e sem GPU**; comparar os efeitos de habilidade do laboratório isométrico (depende de o dono dizer quais).

### P1 — importantes
- [ ] **B5** `frame()` sem try/finally (uma exceção congela o jogo). **B6** reconexão infinita com token vencido. **B7** soft-lock com sala cheia. **B8** `flushAll()` nunca chamado (perde até 10 s de recompensa). **B9** exceção numa sala derruba o servidor. **B10** `cloud.attach` desfaz a pausa na instância. **B11** mobs travam na margem do rio e morrem a tiros (IA/colisão no rio). **B12** botão de spec mostra `${COIN}` literal. **B13** atlas com JSON novo e imagem velha pelo service worker. **B14** chefe reaparece na hora ao reentrar (e o log mente). **B16** sem botão de voltar à vila por toque na instância online. **B17** drops no chão nunca expiram. **B18** `separate()` O(n²) custa 35% da sala do servidor.
- [ ] **S1/S2/S3/S4** história: fechar o cânone (3 guardiões + 2 reflexos), epílogo de `ecos_unidos`, pistas de lore nos níveis 1–19, introdução narrativa do ritual; **S7/S9/S10** missões da Lia e do Brok, falas condicionais, onboarding de 6 passos.
- [x] **G5** (respawn 420–900 s + BOSS_REPEAT), **G6/G7** (Clérigo vence 2 lobos Nv4 100%, perde 64% da vida), **G9/G10** (PLUS_BONUS 0,08, +6..+8 com 60% do custo, opalino ×1,5). Falta calibrar com jogadores.
- [ ] V5, V6, V8–V12, V14–V21, V23–V30 (ver tabela visual): baú saqueado igual ao fechado, item opalino sem moldura, painel do Ferreiro com título "Mercadora Lia", faixas laranja ao fim do ritual, chefes/ponte borrados.

### P2 — melhorias
- [x] S5/S6/S11–S20 feitos (S18: Rumo ao Topo exige também um baú nas Ruínas). Pendente só B-itens restantes e G13 (venda 100% × doc 50%).
- [ ] Primeira entrada em cada mapa dá picos de 100–270 ms (blocos de terreno); medir com GPU (`npm run perf:poc`) e num celular real.
- [ ] Comparar os efeitos de habilidade do laboratório isométrico com os do jogo (pedido do proprietário): precisa dizer quais habilidades.

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
- [ ] Exploração PvE: **instâncias solo/grupo feitas (P11.1 a P11.4 e P11.6, 2026-11-03)**: baú, poção, spirit, loja, ferreiro, banco, contratos e missões são transações do servidor (`server/tx.js`); `plausible.js` tem o modo estrito (`STRICT_PVE=1`, DESLIGADO por padrão); pico de CPU −20% com resultado idêntico (teste de digest). **Falta:** ligar o modo estrito por padrão (migrar libertar/comprar/evoluir spirit, reciclar e a exploração local de contingência), equipamento e atributos dentro da instância, proximidade a NPC, e2e dos diálogos pelo servidor, picos do 1º tick e carga longa (`docs/decisions/0015-exploracao-no-servidor-instancias.md`).
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

## Cenário em sprites (pacote Quaternius, CC0)
- [x] 31 sprites no Bosque, Planície (arbustos e capim) e Ruínas (árvores retorcidas e mortas). Interruptor `?cenario=original`.
- [ ] Você aprovar o estilo (ou pedir ajustes de cor/tamanho/densidade); usar flores, trevos, pedrinhas e pedras de trilha no chão; balanço ao vento; sombras próprias; medir no celular.

## Chão em sprites + texturas (2026-11-02)
- [x] Atlas de chão (flores, trevos, pedrinhas, pedras de trilha) carimbado no terreno do Bosque e da Planície; pedrinhas nas Ruínas.
- [ ] Gerar com IA as texturas de chão, caminhos e água e as peças 3D que faltam: `docs/art-direction/prompts-cenario.md` (origem/licença a confirmar).
- [x] Teste `mobile › joystick` instável: a tela "Preparando seu herói" (`#hero-loading`) cobre o jogo até o atlas carregar e engole o toque; o teste agora espera ela sumir (14/14 passam). Possível melhoria de UX: deixar a tela cobrir só enquanto o herói não está pronto, o que já é o caso.

## B5 parte 2 — painéis pintados (2026-11-02)
- [x] Moldura em 9 fatias nos painéis (inventário, personagem, spirits, diário, loja, etc.), botões pintados (normal/pressionado/principal/desativado), botão de fechar em medalhão, células com moldura de raridade (comum=0, incomum=1, raro=4, épico=6, lendário=5), dica pintada e faixa de arena, emblema da classe no painel do personagem. Só CSS (+1 linha em `ui.js`); marcação e ações iguais.
- [ ] Ainda emoji/provisório: ícones de itens e spirits, retrato pintado por classe (hoje o emblema do ataque), diálogos de NPC com `dialog.webp`, barra do chefe, tela de título e criação de personagem; conferir loja/ferreiro/arena em celular real.

## B5 parte 2b (2026-11-02)
- [x] Criação de personagem (moldura, emblemas das classes), diálogo de NPC (peça `dialog.webp`), barra do chefe (plaqueta + trilho dourado, mais baixa no toque para não cobrir os medalhões); corrigido o retângulo translúcido atrás dos vidros de vida/mana (era `backdrop-filter` do HUD antigo; teste de regressão).
- [x] Oval do diálogo com emblema provisório (moeda, espada, escudo/cruz, spirit); resultado de partida com a moldura pintada.
- [ ] Retrato pintado de NPC no oval (substitui o emblema); ícones de itens/spirits e retratos de classe: prompts em `docs/art-direction/prompts-icones-itens.md`.

## Ícones de equipamento (2026-11-02)
- [x] 9 ícones pintados (espada, cajado, arco, maça, elmo, armadura, botas, anel, amuleto) no inventário, loja, ferreiro e painel do personagem (vazios em cinza); emoji só se a imagem faltar.
- [ ] Faltam: poções, essência, moeda, baú, chave, pergaminho, minério (B); spirits (C); retratos de classe e NPC (D, E). Ícone próprio por faixa de qualidade (hoje o mesmo desenho por tipo).

## Consumíveis pintados (2026-11-02)
- [x] Moeda e poção de vida pintadas nos painéis, no HUD de ouro, no inventário e na loja (`res-*.webp`). Também recortados e prontos, **ainda sem uso**: poção de mana, essência, baú, chave, pergaminho, minério (`public/assets/icons/item/res-*.webp`).
- [ ] Usar a essência na loja/spirits, o baú no mundo (hoje desenhado por código) e o pergaminho no diário; trocar os emojis restantes em logs e avisos de texto; spirits (C) e retratos (D, E).

## Spirits pintados (2026-11-02)
- [x] Forma 1 dos 4 spirits no painel, na lista do sábio, no HUD e no mundo (companheiro flutuante, com balanço leve); sem a imagem vale o desenho antigo. `render/spirit-sprites.js`.
- [x] **Evolução de spirits (ideia do proprietário, não aprovada):** forma 2 já recortada (`spirit-*-2.webp`) e o ovo (`spirit-egg.webp`), sem mecânica. Proposta a escrever antes de mexer em `core/`: nível mínimo, custo em essência/ouro, bônus de poder, versão do documento do personagem e do servidor, teste em `tests/core.test.js`, nota em `docs/gameplay/economia.md`.  ✔ feito em 2026-11-02: evolução no nível 10 por ouro, forma 2 (+50% de poder)
- [ ] Ovo na loja do sábio ao comprar essência; halo amarelo-esverdeado da Fagulha evoluída (limpar se for usar).

## Adiados por decisão do proprietário (2026-11-02) — "deixe salvo para depois"
- [ ] **Criação do Místico** (5º herói: conceito, 3D, atlas, kit de habilidades, ícones).
- [x] **Evolução de spirits** (forma 2 já recortada; falta a mecânica e a proposta de regras).  ✔ idem
- [ ] **Rodada de balanceamento e progressão** (o jogo "acaba" em ~20 min: nível 20 e fim do conteúdo): balanço entre classes, evoluções, dificuldade, **melhorar e dificultar o farm** (XP/ouro/drop por zona, curva de nível até 30, chefes e dificuldade escalável). Ferramentas já existentes: `npm run balance`, `npm run economy`, `docs/gameplay/economia.md`. Medir o tempo até o nível 20/30 antes e depois.

## Retratos pintados (2026-11-02)
- [x] Bustos das 4 classes no cartão do herói, painel do personagem e criação; dos NPCs no oval do diálogo (mercadora, Doran, sábia, guarda, herbalista; o ferreiro está recortado em `npc-smith.webp`, mas o painel do ferreiro não tem diálogo próprio, ficou sem uso).
- [ ] Retrato do Místico (junto com a criação dele); NPCs novos futuros; retrato de monstros/chefes na barra do chefe (B2).

## Texturas de chão e água (2026-11-02)
- [x] Grama, lajes, trilhas e água pintadas no Bosque, na Planície e nas Ruínas (interruptor `?chao=original`).
- [ ] Vila de Lúmen (a textura gerada repete em padrão visível: pedir outra com pedras espalhadas sem aglomerado), margem de lago com a faixa `shore`, água animada por cima, arenas, peças 3D que faltam (cerejeira rosa, cristais, ruínas, casas), medir no celular real.

## Adiados: o que ficou de fora do chão (2026-11-02) — "guarde para depois"
- [x] **Vila de Lúmen:** textura de chão nova (a gerada repete em padrão visível); pedir com pedrinhas espalhadas, sem aglomerados.  ✔ a Vila agora usa o chão de grama do Bosque; a textura de pedras fica guardada
- [ ] **Margem de lago:** usar a faixa `docs/art-direction/fontes-cenario/chao-shore.jpg` (guardada, sem uso).
- [ ] **Água animada** por cima da textura dos lagos.
- [x] **Peças 3D do Meshy** (casas, ruínas, estátuas, cristais, cerejeiras) fotografadas e ligadas na Vila, Planície, Ruínas e Bosque. Poço, ponte, cercas e arcos inteiros ficaram FORA do atlas (sem uso) para poupar memória de textura; refazer com `node tools/glb-bake.mjs 170 && python tools/meshy-pack.py` (editar a lista KEEP).
- [ ] Medir chão, cenário e efeitos no celular real.

## Cenário do Meshy (2026-11-02)
- [x] Vila: 4 casas (uma por canto), lanternas, placa, árvores/pedras/arbustos do Bosque; Planície: cerejeiras e cristais; Ruínas: pilares com hera, arco partido, estátuas (cavaleiro e coruja), pedras; Bosque: toco e tronco.
- [ ] Poço, ponte, cercas e arcos inteiros pedem pontos fixos no layout (`data/zones.js` › `scenery.fixed`): é mudança em `game/`, decidir com o proprietário. Decor das Ruínas ainda tem braseiros, runestones e árvores mortas do desenho antigo/Quaternius.
- [ ] Os sprites do Meshy são 3D-realistas (texturas pintadas) e os personagens/monstros/UI são mais "cartoon": avaliar harmonia no celular e, se preciso, suavizar a saturação.
- **Lição de desempenho (medida):** com um segundo atlas de 1024×2048 (8 MB decodificados) o desenho do Bosque foi de ~1 ms para ~6 ms por quadro, mesmo sem usar os sprites novos (estouro do orçamento de textura do Chromium em CPU). Com o atlas do Meshy em 1024×1024 (peças a 170 px) voltou a ~1 ms. O teste unitário limita a soma dos atlas a 10 MiB decodificados. Medir no celular real continua pendente.

## B2 — monstros e NPCs (2026-11-02)
- [x] Pipeline pronto e validado com uma criatura de teste: `tools/mob-bake.mjs` (8 direções, grade 4×2, janela e âncora iguais), `render/mob-sprites.js` (vista pela direção, animação por código, carga por zona, `?monstros=original`), índice `assets/mobs/index.json`, testes unitários e e2e (fixture em `tests/fixtures`). **Nenhum monstro pintado está no jogo ainda** (índice vazio): os monstros seguem no desenho antigo até chegar a arte.
- [x] **Você gerar os GLB** pela ordem de `docs/art-direction/b2-monstros-npcs.md` (1º `slime`, 2º `treant`; depois o resto e os 6 NPCs). Com eles: bake, ajuste de tamanho (`ART` em `mob-sprites.js`), captura no jogo, créditos.  ✔ GLB de 12 monstros + 5 NPCs entregues e no jogo
- [x] NPCs pintados: falta o módulo `npc-sprites` (1 vista de frente + espelho) no lugar dos heróis recoloridos; retrato do chefe na barra do chefe.  ✔ módulo `npc-sprites` feito; retrato do chefe na barra segue pendente
- [ ] Decidir se lobos, cavaleiros e gárgula merecem esqueleto (como os heróis) quando o método sem esqueleto se mostrar fraco neles.

## Ajustes de visual (2026-11-02, feedback do proprietário)
- [x] Faixa da arena ("1×1 — começa em 3", "Lute!") sobrepunha o nome do rival (barra do chefe/rival): desceu para baixo da barra.
- [x] Sobras do estilo antigo: avisos (toasts), ouro/pontos e linhas do log trocados pelas molduras pintadas e pela fonte Cinzel.
- [x] Estátuas do Meshy (cavaleiro e coruja) maiores e mais numerosas nas Ruínas: 4 fixas guardando a entrada e a subida ao Guardião + 5 espalhadas (o baú ruins:2 andou 60 px para não encostar numa estátua).
- [x] Retratos dos NPCs enquadrados no oval do diálogo.
- [ ] Ainda pode haver sobras antigas que não identifiquei sem captura (log do PvP, textos sobre o chão: nomes, números de dano; painéis de rede/grupo); o proprietário vai apontar com capturas.
- [x] **NPCs no mundo ainda são os heróis em miniatura recoloridos** (`NPC_LOOK` em `renderer.js`), não os personagens dos retratos. Para ficarem fiéis aos retratos: gerar corpo inteiro a partir de cada retrato (prompts em `b2-monstros-npcs.md` §2.2), GLB no Meshy e módulo `npc-sprites`.  ✔ NPCs pintados no mundo (Lia, Doran, Yun, Ren, Mel)

## Rodada de jogabilidade (2026-11-02)
- [x] Atributos em lote (+1/+5/Máx e "Distribuir automático"); janela não pisca mais ao clicar (rolagem preservada, animação só ao abrir).
- [x] Spirit só ataca se o dono atacou ou apanhou (últimos 3 s). Evolução do spirit: nível 10 + ouro, forma 2 (+50% poder).
- [x] Agressividade por zona (`zone.hostile`) e por espécie (`MOBS.temper`): Bosque ~metade passiva, Planície 80%, Ruínas todos; passivo revida ao apanhar.
- [x] Farm: curva de XP 150·n^1,9 (≈6× o total até o nível 20), mobs +20% de vida e +12% de dano, elite 7% (XP ×4). **Falta calibrar com jogadores** (meta: nível 20 em ~2 h).
- [x] Teletransporte (painel do mapa; mapas visitados; Vila grátis, outros 20 × nível mínimo; fora de combate). **Online ainda não** (o servidor confere cada portal: precisa de mensagem nova validada).
- [x] Dois mapas novos, Cume Gélido (Nv 20-25) e Cinzas Ardentes (Nv 25-30), com as criaturas pintadas recoloridas (`MOBS_EXTRA`, recolor ao carregar). Os dois bosses são o Carvalho e o Guardião recoloridos. Cenário reaproveitado (`look`) e névoa/tom de cor próprios; **sem arte própria de chão/árvores**.
- [x] História: arco "Os Ecos Partidos" (5 missões: Cume Gélido, Ancião Gélido, Cinzas Ardentes, Cavaleiro Rubro, Ecos Unidos).
- [x] NPCs pintados (Lia, Doran, Yun, Ren) a partir da folha 3D de frente; o **ferreiro** e o **golem** já estão recortados (golem com resíduo de sombra) mas ainda sem uso; **herbalista sem arte 3D** (segue o herói recolorido). Folha de 8 direções do golem/NPCs enviada pelo proprietário **não chegou como arquivo**.
- [x] Golem de Quartzo (monstro) com as 8 direções; arte própria de cenário para os mapas novos; Místico; melhorar o gráfico dos personagens.  ✔ Golem feito; falta cenário próprio dos mapas novos, Místico e gráfico dos personagens

## Agente A — animação de mobs, ícones, objetos do mundo e interface (2026-11-02)
- [x] Mobs pesados em `stomp` (golem, colosso, guardião, carvalho), aéreos em `float` (fogo-fátuo, espectro) e `prowl` (cavaleiro, gárgula); golpe em 3 tempos por código (antecipação, golpe, recuperação). **Validado só por captura do atlas; ver em jogo em celular.**
- [x] Ícone de voltar à vila pintado (medalhão + casa 3D) e ícones de zona no mapa (`tools/ui-icon-from-atlas.py`).
- [ ] **Falta arte de brasa/vulcão** para o ícone da zona Cinzas Ardentes (fica o emoji 🔥) e uma **árvore verde** para o Bosque (o ícone usa a cerejeira rosa do atlas). Prompts em `docs/art-direction/prompts-cenario.md` (seção E).
- [x] Baú pintado no mundo (fechado, brilho dourado). [ ] **Falta o baú ABERTO**: o saqueado é o mesmo sprite escurecido. Os outros objetos por código sem arte pronta: fonte da praça, banco, caixas/barris, canteiro de flores, braseiro das Ruínas, flor luminosa, juncos (prompts na seção E). Poço, ponte e cerca existem só como conceito 2D na folha de aldeia (`acessorios/41587e19…jpg`): precisam virar 3D (Meshy) para entrar.
- [x] Retrato do chefe na barra do chefe (vista frontal do sprite). [x] Ferreiro Brok na Vila (NPC pintado; abre a loja já rolada até o aprimoramento).

## Mapas grandes, rios com pontes, acampamentos (2026-11-02)
- [x] **Zonas de farm 4600×2800** (antes 2800×1900): Bosque, Planície, Ruínas, Cume Gélido e Cinzas Ardentes; portais em y=1400 nas bordas, chefe no fim do mapa, mobs ~2× (40–46), baús espalhados (5 comuns + os dos acampamentos). Implementado e testado (`tests/layout.test.js`).
- [x] **Terreno em blocos** (`render/ground-tiles.js`): teto de 36 MiB de canvas para qualquer mapa (o mapa inteiro seriam 49 MiB; o cache antigo guardava um canvas por zona visitada). **Falta ligar no `renderer.js`** (mudança de ~12 linhas, no relatório) e medir quadro/tempo de construção de bloco no celular real.
- [x] **Rios sinuosos com 2 pontes cada** (`zones.js › rivers`, `layout.js`): colisão só de movimento (magias atravessam), lacuna nas pontes, trilha passa pela 1ª ponte; testado por busca em grade (sem as pontes o chefe fica isolado).
- [ ] **Ponte 3D própria.** A ponte atual é a versão de reserva: faixa de tábuas/lajes pintada sobre as texturas de chão (`sand-dirt`, `slabs`) + sombra + vigas, com postes (`m_lamp` / braseiro) e guarda-corpo (`m_log` / `m_slab`) já em sprites. O `Cozy_Medieval_Village` do Meshy **traz ponte, poço e cercas** numa só malha: peças nº 0, 8, 10 e 11 da divisão por partes conectadas (nº 0 ~0,30×0,28×0,27 = poço?, nº 8 ~0,26×0,16×0,31 = ponte?, nº 10 e 11 = painéis de cerca?). Confirmar a olho: `node tools/glb-bake.mjs 170` (precisa do servidor) e abrir `test-results/glb-bake/Cozy_Medieval_Village_{0,8,10,11}.png`; se forem essas peças, acrescentar a `KEEP` de `tools/meshy-pack.py` (`'Cozy_Medieval_Village_8': 'bridge'`, etc.), rodar o pack e trocar `paintBridges` (scenery.js) por `drawNatureNamed(g, 'm_bridge', ...)` no terreno. **Se nenhuma for ponte**, gerar uma no Meshy: prompt pronto em `docs/art-direction/prompts-cenario.md › seção F`.
- [x] **Acampamentos e clareiras** em dados (`zones.js › camps`): 3–4 acampamentos (4–6 mobs fixos + 1 elite em volta de baú de tier maior) e 1–2 clareiras de elite (2 elites, sem baú, anel vermelho no chão) por zona. Posições em `campSpawns(zoneId, playerLevel)` (layout.js), testadas. **Falta a sim criar os mobs** (código no relatório): `World.populate` e `updateSpawns` (mobs de acampamento não contam no `count` e renascem por acampamento).
- [x] **Mini-chefe** por zona (`zones.js › miniboss`, `minibossSpawn(zoneId)`): mob existente com multiplicadores (`hpMul`, `powerMul`, `sizeMul`) e renascimento de 240 s. **Falta a sim** aplicar os multiplicadores e o nome (código no relatório).
- [x] **Cume Gélido e Cinzas Ardentes com cenário próprio**: conjuntos de sprites `glacier` (pinheiros, árvores secas, cristais como gelo, pedras claras; chão de neve = textura da Planície com tom branco-azulado; rio congelado) e `ember` (pilares, estátuas, braseiros, árvores queimadas; chão de basalto = lajes escurecidas com rachaduras de lava; **rios de lava** animados). É arranjo de arte existente com tom por cima: **arte própria pede os prompts da seção E** de `prompts-cenario.md` (neve/gelo e basalto/lava).
- [ ] Minimapa: desenhar os rios (hoje aparecem só como pontilhado de obstáculos). Trecho pronto no relatório.
- [ ] `main.js` linha ~841 usa `{ x: 110, y: 950 }` como entrada padrão de zona sem `spawn`: agora a entrada das zonas de farm é y=1400.
- [ ] E2E (`tests/e2e/*.spec.js`) que teletransportam para `(300, 950)` no Bosque seguem válidos (950 é terra firme), mas não passam mais por cima do portal; conferir quando rodarem.
- [ ] Balanceamento: mobs 2× e mapa 1,6× mais comprido mudam o ritmo de XP/hora e o tempo de percurso. Calibrar com jogadores.
- [ ] Itens de Ópalo (exclusivos do Cavaleiro Rubro) usam o ícone do tipo (espada/cajado/arco/maça/armadura); falta arte opalescente própria e destaque visual (cor do nome) na mochila.
- [ ] `server/zone.js` e `server/coop.js` chamam `rollMobLoot` sem `pity` e sem `bossState` no World: pity e ritual do último chefe valem só offline; no servidor o ritual reinicia por instância e `boss_warn`/`phase` não são repassados ao cliente (server/wire.js).
- [ ] História (S17): lore coletável (placas/estátuas tocáveis por zona, ≤160 caracteres; textos em docs/roadmap/auditoria-historia.md) exige objeto interativo no mapa (layout.js/renderer): não feito. Também pendente: evento `teleport` online (hub), pulso visual no Ren no primeiro minuto e e2e que confira a fala do Doran offline (agora a 1ª conversa da sessão abre o diálogo).
- [ ] UI: mostrar "Ritual N/40" com `world.bossProgress`; XP de esbirros de chefe ainda é concedido pelo servidor de zona (server/zone.js não checa `summoned`).
- [x] **Porto de Marfim: interface dos serviços** (2026-11-02): painéis `bank` (grade 40 + mochila ao lado, toque guarda/retira), `board` (3 contratos com progresso, recompensa, Entregar e tempo até o próximo dia UTC), loja `shop:harbor` ("Mercador do Porto", estoque do dia com `price`, venda a 60%), duelo amistoso `arena:friendly` (offline: 1×1 contra rival de IA, sem Elo/ouro/XP, volta ao Porto; online: toast "só na jornada solo"), `talk()`/`dialog-service` ligados por `SERVICE_OF_ROLE`/`openService` e o diálogo usa `serviceFor`. E2E em `tests/e2e/harbor.spec.js`.
- [ ] **Porto, o que sobrou:** regra do duelo amistoso no SERVIDOR (partida sem Elo/XP) para liberar online; teletransporte online para o Porto (hoje só por portal); retratos pintados dos NPCs do Porto (usam o emblema genérico); ícone de zona do Porto já existe (`zone-harbor.webp`), mapa real já usa `WORLD_ROUTE`.
- [x] Itens por classe: célula avermelhada com o nome da classe e linha "Apenas para X" no tooltip (vermelha se `canEquip` falha). Evolução de spirit: o painel usa `spiritEvoStatus` (texto/progresso da missão; botão Evoluir só com a missão feita e ouro). Diário usa `questGiverId` (mestre da classe). `TIPS.spirit` e o texto de `ecos_unidos` citam a missão do elemento.
- [x] **Dia e noite ligado ao jogo:** dia e noite sempre ligados (a opção "sempre dia" foi removida em 2026-11-03); bônus noturno (aggro ×1,1; XP, ouro e chance de item ×1,15) via `World({ night: true })` + `world.nightMods` (cliente: relógio de parede; `server/zone.js`: relógio do servidor), só em zonas com ciclo; padrão sem `night` para simulações/testes não dependerem da hora. "Sempre dia" muda só a aparência, o bônus segue o relógio. Testes em `tests/harbor.test.js`.
- [ ] Dia e noite: capturas e medição de quadro no celular real; avisar o jogador de que é noite (ícone/lua no HUD).
- [x] Ouro morto no `drawDrop` removido; textos de ouro/poção do log e dos toasts trocaram o emoji por "ouro" (o texto flutuante no canvas já era só "+N" dourado). [ ] Moeda pintada no texto flutuante do canvas (opcional).
- [x] **Dia e noite** ligado (ver acima). Arte que falta no Porto: `prompts-cenario.md › seção H`.

- NPCs próprios do Porto de Marfim (banker, hunter, dealer, duelist, captain): hoje usam a arte pintada dos NPCs da vila com tinta leve (`NPC_ALIAS` em render/npc-sprites.js). Dependem de arte nova (prompts em docs/art-direction/prompts-cenario.md, seção H/NPCs). Mestres de classe usam o quadro de frente do atlas do herói (`tools/npc-from-heroes.py`), resolução do atlas ~1,9x ampliada; arte HD dedicada é melhoria futura.

## Escala automática e HUD compacto (2026-11-03, pedido do dono: iPhone 874×402)
- [x] `prefs.scale` agora começa em `'auto'`: `autoScale` = min(vw/1024, vh/480), piso 70%, teto 100% (874×402 → 84%; ≥ 700 px de altura → 100%); manual 70–150% e botão "Auto" em Opções; prefs antigas mantêm o valor. Reaplica ao girar/redimensionar.
- [x] HUD: alvos de toque do menu (40 px) e poção (46 px) em tamanho físico fixo; minimapa ≤ 360 px de altura mantém 104 px físicos; avisos menores. Medir no aparelho real.
- [ ] Os dois e2e de preferências/altura curta foram atualizados para o novo padrão; `mobile.spec` "painéis cabem" é lento sob carga (passa isolado).

## Habilidade de Maestria (4ª habilidade, s3)
- [x] 4 habilidades (data/skills.js), desbloqueio nível 25 + missão `maestria` (core/unlocks.js), simulação, IA do rival, protocolo (cast 0..3), snapshot (cds s3), toque, barra, VFX, toast "Nova habilidade", testes.
- [ ] **Ícones próprios** das 4 habilidades dependem de arte nova (hoje: recolor dourado provisório de charge/fireball/rain/holylight via `tools/skill-icon-gold.py`); prompts em `docs/art-direction/prompts-icones-itens.md › seção F`.
- [ ] Servidor de zona: `p.actor.mastery` só atualiza no próximo lote (`syncLevel`); se a missão for entregue pela API com o jogador já na zona, a s3 vale após o próximo flush ou ao reentrar. Salas 1x1/coop leem o documento ao iniciar.
- [ ] Escolha de classe (ui.js `cc-skills`) ainda lista só as 3 habilidades; mostrar a Maestria com "Nv 25 + missão". Validar no celular o botão `sk3` (style.css) e o cadeado "Nv 25 / Maestria"; e2e da barra com 4 botões não rodado.


## Robustez (2026-11-03)
- [x] `frame()` com try/finally e `guard()`; reconexão para com token vencido (`authLost` volta ao login); mob desconhecido ignorado em `updateNet`; teleport online conta via `fireTeleportEvent`; `zone_teleport` único em `protocol.js`.
- [x] Sala cheia: a recusa do portal agora espera 4 s (`portalCd`) em vez de reenviar o pedido a cada quadro.
- [x] Salvar ao esconder/fechar a página (`pagehide` + `visibilitychange` no cliente; o `flushAll()` do servidor já roda no desligamento e a sala grava ao sair).
- [ ] B28: ritual do chefe no HUD online exige incluir `ritual` no snapshot/`zone_joined` (mudança de protocolo); não feito.
- [ ] Duelo amistoso sem Elo/ouro/XP exige novo modo/flag no servidor e na fila; não feito.

## Rodada 2026-11-03 (fechamento)
- [x] Ritual do chefe no HUD online (`rt` no snapshot); duelo amistoso no servidor (`queue.friendly`); G13 (venda 50% Vila / 60% Porto: era só a doc); rótulos do medalhão/chefe/Ren, epílogo da Yun em 667×375, placa de lore maior; teste de `stackLabels`.
- [ ] Não reproduzido: rótulo cobrindo "Toque para conversar" (tratado por prevenção). Conferir no iPhone.
- [ ] Missão `porto_duelo` segue só offline (`OFFLINE_TYPES`). Sem e2e no navegador para o HUD do ritual online e o duelo amistoso online.
- [ ] Reescrita da linha de B15/B19–B30 e G11–G13 perdeu detalhes: conferir `auditoria-bugs.md`/`auditoria-jogabilidade.md`.
- [ ] O que depende do dono: ver `docs/roadmap/depende-do-dono.md`.

## Rodada 2026-11-03 (grande)
- [x] P11.3/P11.4/P11.6 (transações do servidor `tx`, poção/spirit/baú na instância, otimização com digest determinístico); e2e do ritual online e do duelo amistoso online; 9 exports mortos removidos (restam `ACHIEVEMENT_IDS`, `QUEST_IDS`, `BOSS_MOBS`, `ARMOR_TYPES` em `data/`).
- [ ] `STRICT_PVE` (plausible.js) segue DESLIGADO: ainda há ganhos locais (libertar/comprar/evoluir spirit, reciclar, exploração de contingência). Ligar só depois de virarem transação.
- [ ] Servidor sem checagem de proximidade ao NPC; objetivos `visit`, `teleport`, `lore`, `spiritStage` ainda somados pelo cliente.
- [ ] Duelos: Guerreiro/Arqueiro Nv30 duram 17–18 s (meta 20–40); ciclos Mago×Clérigo 89% e Mago×Arqueiro 14% parecem vir da IA (kiting), não dos números.
- [ ] NÃO feitos por não haver como validar aqui ou por exigirem decisão: PostgreSQL (sem servidor Postgres nesta máquina; exige dependência nova), snapshots binários/compressão, Canvas 2D × PixiJS (decisão 0001 vale), Docker (Dockerfile/compose existem, nunca construídos: sem Docker instalado), SIGTERM real no Linux, rede real, CAPTCHA.
