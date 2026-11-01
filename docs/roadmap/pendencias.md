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
- [ ] **Evolução de spirits (ideia do proprietário, não aprovada):** forma 2 já recortada (`spirit-*-2.webp`) e o ovo (`spirit-egg.webp`), sem mecânica. Proposta a escrever antes de mexer em `core/`: nível mínimo, custo em essência/ouro, bônus de poder, versão do documento do personagem e do servidor, teste em `tests/core.test.js`, nota em `docs/gameplay/economia.md`.
- [ ] Ovo na loja do sábio ao comprar essência; halo amarelo-esverdeado da Fagulha evoluída (limpar se for usar).

## Adiados por decisão do proprietário (2026-11-02) — "deixe salvo para depois"
- [ ] **Criação do Místico** (5º herói: conceito, 3D, atlas, kit de habilidades, ícones).
- [ ] **Evolução de spirits** (forma 2 já recortada; falta a mecânica e a proposta de regras).
- [ ] **Rodada de balanceamento e progressão** (o jogo "acaba" em ~20 min: nível 20 e fim do conteúdo): balanço entre classes, evoluções, dificuldade, **melhorar e dificultar o farm** (XP/ouro/drop por zona, curva de nível até 30, chefes e dificuldade escalável). Ferramentas já existentes: `npm run balance`, `npm run economy`, `docs/gameplay/economia.md`. Medir o tempo até o nível 20/30 antes e depois.

## Retratos pintados (2026-11-02)
- [x] Bustos das 4 classes no cartão do herói, painel do personagem e criação; dos NPCs no oval do diálogo (mercadora, Doran, sábia, guarda, herbalista; o ferreiro está recortado em `npc-smith.webp`, mas o painel do ferreiro não tem diálogo próprio, ficou sem uso).
- [ ] Retrato do Místico (junto com a criação dele); NPCs novos futuros; retrato de monstros/chefes na barra do chefe (B2).

## Texturas de chão e água (2026-11-02)
- [x] Grama, lajes, trilhas e água pintadas no Bosque, na Planície e nas Ruínas (interruptor `?chao=original`).
- [ ] Vila de Lúmen (a textura gerada repete em padrão visível: pedir outra com pedras espalhadas sem aglomerado), margem de lago com a faixa `shore`, água animada por cima, arenas, peças 3D que faltam (cerejeira rosa, cristais, ruínas, casas), medir no celular real.

## Adiados: o que ficou de fora do chão (2026-11-02) — "guarde para depois"
- [ ] **Vila de Lúmen:** textura de chão nova (a gerada repete em padrão visível); pedir com pedrinhas espalhadas, sem aglomerados.
- [ ] **Margem de lago:** usar a faixa `docs/art-direction/fontes-cenario/chao-shore.jpg` (guardada, sem uso).
- [ ] **Água animada** por cima da textura dos lagos.
- [x] **Peças 3D do Meshy** (casas, ruínas, estátuas, cristais, cerejeiras) fotografadas e ligadas na Vila, Planície, Ruínas e Bosque. Poço, ponte, cercas e arcos inteiros ficaram FORA do atlas (sem uso) para poupar memória de textura; refazer com `node tools/glb-bake.mjs 170 && python tools/meshy-pack.py` (editar a lista KEEP).
- [ ] Medir chão, cenário e efeitos no celular real.

## Cenário do Meshy (2026-11-02)
- [x] Vila: 4 casas (uma por canto), lanternas, placa, árvores/pedras/arbustos do Bosque; Planície: cerejeiras e cristais; Ruínas: pilares com hera, arco partido, estátuas (cavaleiro e coruja), pedras; Bosque: toco e tronco.
- [ ] Poço, ponte, cercas e arcos inteiros pedem pontos fixos no layout (`data/zones.js` › `scenery.fixed`): é mudança em `game/`, decidir com o proprietário. Decor das Ruínas ainda tem braseiros, runestones e árvores mortas do desenho antigo/Quaternius.
- [ ] Os sprites do Meshy são 3D-realistas (texturas pintadas) e os personagens/monstros/UI são mais "cartoon": avaliar harmonia no celular e, se preciso, suavizar a saturação.
- **Lição de desempenho (medida):** com um segundo atlas de 1024×2048 (8 MB decodificados) o desenho do Bosque foi de ~1 ms para ~6 ms por quadro, mesmo sem usar os sprites novos (estouro do orçamento de textura do Chromium em CPU). Com o atlas do Meshy em 1024×1024 (peças a 170 px) voltou a ~1 ms. O teste unitário limita a soma dos atlas a 10 MiB decodificados. Medir no celular real continua pendente.
