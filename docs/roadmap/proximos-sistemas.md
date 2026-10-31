# Próximos sistemas — diagnóstico e plano
2026-10-31. Pedido do proprietário: ver **mapa, NPCs, equipamentos, salvamentos, evolução do personagem (e depois da classe)**, trocar o visual por uma **identidade própria e única**, e preparar **Android** e um **servidor**. Fase 2 isométrica: **ainda não**. Este texto separa o que o código atual JÁ tem do que falta. Status: **diagnóstico (pendente de aprovação)** — nada aqui foi implementado.

## 0. Situação do jogo real (lido no código e visto em capturas)
~2 500 linhas nos arquivos centrais (`main.js` 640, `renderer.js` 894, `ui.js` 452, `sim.js` 551). Sem erros de console nas capturas da vila, inventário, personagem e bosque. Visual atual: top-down pastel, desenhado por código.

| Área | O que já existe | O que falta / risco |
|---|---|---|
| **Mapa** | 4 zonas + 2 arenas; layout **determinístico** por zona (`layout.js`: trilha, lagoas, runas, cenário); minimapa; portais; chefe por zona; níveis 1–20 | Poucas zonas e nenhum "mundo" ligado (só portais); sem pontos de interesse, masmorras, ciclo dia/noite, clima; cenário igual para todos |
| **NPCs** | 3 na vila: Mercadora Lia (loja), Mestre Doran (arena), Sábia Yun (spirits); marcador "!" | **Sem diálogo, sem missões** (`quest` não existe no código), sem rotina, sem NPCs fora da vila |
| **Equipamentos** | 6 slots (arma, elmo, armadura, botas, anel, amuleto); raridades; loja; inventário; poções | Item sem aparência no personagem (o sprite não muda); sem encantamento/evolução de item, sem conjuntos, sem item de classe |
| **Salvamento** | `localStorage` (`aetheria_save_v1`): nome, classe, nível, XP, atributos, ouro, poções, equipamento, inventário, spirits, arena | Um único slot por navegador; sem nuvem; sem versionamento/migração (só `version`); fácil de perder/trapacear; **não serve a multiplayer** |
| **Evolução** | XP, nível máx. 30, 5 pontos por nível, spirits que sobem de nível | Sem **mudança de classe/especialização** nem árvore de habilidades; as 3 skills por classe são fixas; sem prestígio |
| **Visual** | Procedural, coerente, "fofo e limpo"; UI com fonte Google | Parece genérico; sem assinatura própria; personagens pouco legíveis e iguais entre classes; fonte externa |
| **Celular** | Controles de toque, auto-mira, paisagem, `manifest.webmanifest` (PWA) | Nunca medido em aparelho real; sem loja; sem build Android |
| **Servidor** | `server.js` estático; simulação por **intenções** (`mx,my,aim,attack,cast`), determinística, sem DOM — pensada para servidor autoritativo | Sem WebSocket, contas, banco, antitrapaça, sincronização |

## 1. Visual com identidade própria (decisão de direção, não só técnica)
- Já decidido (ADR 0004/0006): miniatura/caricato + anime fantasy, personagens de **arte real** (não formas geométricas), isométrico. O isométrico **fica para depois**; a identidade deve valer também no top-down atual.
- Sugestão de caminho, em ordem: (a) **guia de identidade** de 1 página (paleta de 6–8 cores, silhueta/proporção dos personagens, forma dos ícones, tipografia local, tom dos textos, "regra do brilho dourado" que já aparece nos efeitos); (b) **UI própria** (molduras, ícones, fonte local) — não depende do isométrico; (c) personagens e monstros no mesmo estilo dos 4 heróis; (d) cenário (árvores, casas, chão) com a mesma linguagem; (e) só então decidir isométrico.
- **Decisões suas:** nome/tema do mundo ("Ecos"?), referência de tom (fofo × sombrio), o que faz o jogo ser reconhecível em 1 screenshot.

### 1.1 O novo visual entra no jogo só nos personagens, ou inteiro? (pergunta de 2026-10-31)
Montagem real em `H:aetheria-extrasmedicoes-e-capturasmock-visual` (herói em miniatura por cima do bosque ATUAL): os personagens têm sombreado 3D, contorno e brilho; o mapa atual é vetorial chapado, pastel, sem sombra projetada nem textura. **Juntos, destoam** (parece um boneco colado num cenário de outro jogo).

| Opção | Como fica | Custo | Risco |
|---|---|---|---|
| **A. Só os personagens** (no mapa atual) | Heróis bonitos, mapa, monstros, NPCs e UI antigos | Baixo: um carregador de atlas no `renderer.js` (já existe a lógica no laboratório) | Estilo misturado; só serve como **teste interno** |
| **B. Visual inteiro, com isométrico** (o que o PoC mostra) | Personagens, monstros, NPCs, cenário, chão, UI e câmera no mesmo estilo | **Alto**: nova câmera/projeção, cenário e props com arte própria, monstros e NPCs na mesma linha de arte (Meshy → sprites), UI nova | Maior prazo; a simulação **não muda** (ela é só o plano x,y) |
| **C. Visual inteiro, sem isométrico** | Mesma linguagem de arte aplicada ao top-down atual | Médio-alto: tudo de B menos a câmera | Perde a profundidade do isométrico; fica mais barato e mais seguro no celular |

> **Decidido em 2026-10-31: opção B** (ADR 0007). Fases B1–B5 em `docs/decisions/0007-visual-inteiro-isometrico.md`; a fase B1 começou com o rascunho `docs/art-direction/identidade-visual-v0.md` e a página `/labs/iso-poc/identidade.html`.

**Recomendação:** o destino é B (ou C), nunca A em produção. Ordem: (1) guia de identidade + UI própria; (2) monstros e NPCs no mesmo pipeline dos heróis; (3) cenário e chão; (4) só então a câmera (isométrico ou não). Os 4 heróis já estão prontos e servem de padrão de qualidade. Nada disso começa antes da sua aprovação (Fase 2 segue adiada).

## 2. Mapa e mundo
1. Mapa-múndi ligando as zonas (portais com destino e nível recomendado) e **mais 2–3 zonas** com mecânica própria (ex.: costa/porto, caverna com luz limitada).
2. **Pontos de interesse** (baús, altares, eventos) usando o gerador determinístico já existente (`layout.js`).
3. **Ciclo dia/noite** e clima só como camada visual no início (sem mudar regras).
- Risco: conteúdo cresce mais rápido que a equipe; manter o princípio "ajustar `data/*.js` antes de criar sistemas".

## 3. NPCs e missões (hoje inexistentes)
1. Sistema de **diálogo** em dados (`data/npcs.js`: falas, condições, ações).
2. **Missões** simples: matar N, coletar item, entregar, explorar; recompensas (ouro, XP, item).
3. NPCs por zona e uma **história curta** (o que são os "Ecos"?).
- Requer decisões de roteiro. Em termos técnicos: estado de missão entra no save (ver 4).

## 4. Salvamento (precisa mudar antes do multiplayer)
1. **Versionar e migrar** o save (`version` → funções de migração), exportar/importar arquivo, 3 slots.
2. Separar **documento do personagem** (já é um objeto limpo) de **preferências do aparelho** (`prefs.js` já separa).
3. Contrato para o servidor: o documento do personagem vira o registro no banco; o cliente só envia intenções.

## 5. Evolução do personagem e da classe
1. Hoje: nível → 5 pontos de atributo. Falta: **especialização aos Nv 10/20** (ex.: Guerreiro → Paladino/Berserker; Mago → Elementalista/Arcanista; Clérigo → Sacerdote/Inquisidor) com 1–2 skills novas cada.
2. **Árvore de habilidades** simples (escolhas, não só números) e **Místico** como classe futura (invocação/talismãs), nova no `classes.js`.
3. Equipamento influenciando aparência (relacionado ao visual).
- Tudo em `data/` + testes em `tests/core.test.js` (regra do projeto).

## 6. Android (adiado, mas já planejar)
- Medir num aparelho real (FPS, calor, memória — o teste emulado deu folga de CPU, mas **GPU e memória não foram medidas**). Texturas dos heróis hoje ~24 MiB cada; o slime ~32 MiB (cortar).
- Opções de empacote: **PWA** (já há manifest) ou **Capacitor/TWA** para Play Store. Exige: ícones, tela cheia/paisagem, controles de toque revisados (existem), economia de memória, pausa em segundo plano, política de privacidade se houver conta.
- Depende de: salvamento na nuvem (4) e servidor (7), para o jogador não perder o progresso ao trocar de aparelho.

## 7. Servidor e multiplayer
- Base já boa: simulação pura por intenções, RNG com semente, sem DOM em `core/ data/ game/`.
- Etapas: (1) servidor Node com **WebSocket** rodando a mesma simulação; (2) contas simples + banco (SQLite → Postgres); (3) cliente envia intenções, recebe estado/eventos (interpolação); (4) salas (arena PvP e ondas cooperativas) antes de mundo aberto; (5) antitrapaça básica (validar tudo no servidor).
- Custos/decisões suas: onde hospedar, quem paga, **login** (e-mail? Google?), moderação/chat. Nada será publicado sem sua autorização.

## 8. Ordem proposta (cada item = fase com relatório e aprovação)
1. **Hoje:** você avalia o jogo real (`docs/AVALIACAO-HOJE.md`) e anota.
2. Guia de identidade visual + UI própria (não depende do isométrico).
3. Salvamento versionado + 3 slots (base de tudo).
4. NPCs com diálogo + 5–8 missões iniciais.
5. Especialização de classe (Nv 10) e Místico.
6. Mais zonas e pontos de interesse.
7. Servidor mínimo (WebSocket + conta + arena PvP).
8. Android real (medir → empacotar).
9. Só então: reavaliar Fase 2 isométrica.

## Pendências de arte já registradas
- Dash próprio (em andamento), Místico (arte e classe), Sacerdote (quadros da habilidade), tela de créditos (`docs/CREDITOS.md` pronto; falta a tela no jogo), peso das texturas.
