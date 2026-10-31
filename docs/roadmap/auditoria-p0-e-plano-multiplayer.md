# Aetheria — Auditoria P0 e plano para RPG multiplayer
2026-10-31 · Status: **diagnóstico e proposta — nada aqui foi implementado nem aprovado.** Aguardando sua aprovação para iniciar a primeira fase.

> Como ler. **[MEDIDO]** rodei o comando/medição nesta sessão · **[LIDO]** vi no código · **[HIPÓTESE]** estimativa minha, ainda sem medição · **[NÃO VERIFICADO]** não consegui conferir (ex.: versão/licença atual de uma biblioteca; não pesquisei na web nesta rodada). Nenhum teste aqui é declarado "aprovado" sem ter sido executado; os números de teste abaixo vêm da última execução completa feita nesta sessão (unitários e e2e depois do commit 8ec867a).

---

## 1. Estado do repositório e proteção do projeto
- `git status`: **limpo** na `main` (44 commits; HEAD `8ec867a`, já enviado ao GitHub). Pontos de restauração: qualquer commit; o último estado "só jogo original" é anterior a `4d4a58a` (visual opcional). Backup de mudanças estruturais continua em `H:\aetheria-backups` (regra do CLAUDE.md). [MEDIDO]
- Tamanho do repositório ≈ 267 MB em disco (inclui `node_modules`, `test-results`, artes locais); o que vai ao Git inclui ~15 MB de atlas dos 4 heróis (CC BY 4.0). [MEDIDO]
- Dependências: **zero em runtime**; só `@playwright/test` em desenvolvimento. [LIDO, `package.json`]
- Nenhum arquivo de produção será alterado até você aprovar a fase.

## 2. Diagnóstico da arquitetura (confrontando docs × código)

### 2.1 Tamanho e estrutura [MEDIDO, `wc -l`]
| Área | Linhas | Observação |
|---|---|---|
| `core/` (regras puras) | 383 | combate, stats, loot, progressão, rival, rng, **match, power** |
| `data/` | 287 | classes, skills, mobs, itens, spirits, zonas |
| `game/` (sim, ai, layout, iso-hero) | 964 | `sim.js` ≈ 560 |
| `render/` | 2 486 | `renderer.js` ≈ 900 · cenário, sprites de herói |
| `ui/` | 455 | HUD e painéis em `innerHTML` |
| `main.js` | 693 | **a classe `Game` concentra loop, regras de economia, loja, loot, arena, ondas, save** |
| Testes | 8 arquivos unitários + 7 e2e (~1 500 linhas) | |

### 2.2 O que a documentação diz × o que o código faz (divergências)
| Documento | Afirma | Realidade |
|---|---|---|
| `docs/testing/estrategia.md` | 11 unitários e 1 e2e | **65 unitários e 47 e2e** (última execução); o documento está **desatualizado** |
| `docs/gameplay/sistemas.md` | "PvP com rival e Elo; ondas" e Vale de Auren como protótipo ativo | agora há **Grande Arena por times** (1×1/2×2/4×4); o Vale está arquivado (`vale.html`, `game/iso-hero.js`, `render/vale.js` ainda existem e têm testes) |
| `docs/architecture/overview.md` | `core/` e `game/` "sem efeitos colaterais" | `game/sim.js` mistura **estado de jogo e de apresentação** (partículas, textos flutuantes, `fx`) e usa `Math.random()` — ver 2.4 |
| `CLAUDE.md` | ~"Salvamento atual por localStorage" | correto; **sem validação de esquema** (ver seção 6) |

### 2.3 Pontos de acoplamento relevantes para multiplayer [LIDO]
1. **`Game` (main.js) é a "autoridade" de tudo**: ouro (`c.gold +=` em ~12 lugares), XP, loot, loja, poções, recompensa de arena. Nenhuma dessas regras está em `core/` como função transacional.
2. **`World` guarda referências de objetos**: projéteis e áreas têm `src: <ator>`; eventos carregam `actor`; `Set` em projéteis. Isso **não serializa** como snapshot sem uma camada de conversão.
3. **Passo de tempo variável**: `dt = min(0.05, delta)` no loop do cliente. Para servidor autoritativo é preciso **passo fixo** (ex.: 1/30 s).
4. **Apresentação dentro da simulação**: `particles`, `texts`, `fx`, `bob = Math.random()`, `Math.random()` em `updateProjectiles`/`updateAreas`/`burst`. As ocorrências de `Math.random` em `game/sim.js` são **só visuais** (partículas, balanço do spirit) [LIDO], então não alteram dano — mas impedem rodar a mesma simulação idêntica em dois lugares e inflam a memória no servidor.
5. **IDs de item e entidade** (`core/loot.js uid()` usa `Date.now()` + `Math.random()`): ok para cliente, **inaceitável como identidade de item em servidor** (precisa de ID gerado e registrado no servidor).
6. **`window.game`** exposto globalmente (hook de teste) — inofensivo localmente, deve sumir no build de produção.
7. **UI com `innerHTML`**: 10 usos em `ui.js`; o nome do personagem é escapado na tela de título (`ui.js:58`, `esc()`) e entra como texto no HUD (`ui.js:147`), **mas** `main.js:135` o envia a `toast()`, que usa `innerHTML` (`Bem-vindo, ${char.name}!`) **sem escape**. Hoje é "auto-XSS" (o nome vem do próprio jogador/`localStorage`); com nomes de **outros jogadores** viraria XSS armazenado. [LIDO — a confirmar com teste antes de corrigir]
8. **`save.js`** persiste o objeto `char` inteiro sem validação (`JSON.parse` direto); `version: 1` existe no personagem, mas **não há migração**. [LIDO]

### 2.4 Determinismo da simulação
- Gameplay usa RNG de semente (`core/rng.js`; `World.rng`). Dano e crítico dependem do `rng` do mundo. Teste "dano é determinístico pela semente" existe. [MEDIDO — passa]
- O que falta: **passo fixo** e **separar RNG visual**. Hoje dois clientes com a mesma semente e `dt` diferentes divergem (colisões, alcance de projétil, `frozen`).

### 2.5 Desempenho e memória
- Canvas 2D mede **58–73 FPS em 1080p** no laboratório (Intel UHD integrada, GPU Direct3D11) e 29–36 FPS em canvas 4K; **a regra `imageSmoothingQuality = 'low'`** é obrigatória (com `high`, ~14× mais lento). [MEDIDO em rodadas anteriores; arquivado em `docs/roadmap/iso-poc/`]
- Textura: ≈ 24 MiB por herói (≈ 16–20 recortado); slime ≈ 32 MiB; cena do laboratório 72–76 MiB. **Em celular real a memória de GPU nunca foi medida.** [MEDIDO no PC; celular NÃO VERIFICADO]
- Celular **emulado** (Pixel 7, CPU 4× mais lenta): 55–67 FPS. [MEDIDO; emulação ≠ aparelho]
- `World` usa buscas lineares (`actors.filter/find`, `nearestEnemy` por ator, `separate()` O(n²)); documentado como "limitação conhecida". Com 4×4 (8 heróis + 8 spirits) funciona; **com 50–100 entidades é [HIPÓTESE] o primeiro gargalo de CPU** — precisa ser medido (seção 10).
- Alocações em `draw()`: poucas (`renderer.js` 2, `scenery.js` 3 usos de `.filter/.map/spread`); `hero-sprites.js` 0. Bom ponto de partida. [LIDO]

### 2.6 Sistemas duplicados ou incompletos
| Item | Situação |
|---|---|
| Efeitos de skill (`labs/iso-poc/src/vfx.js`) × `World.fx/particles` do jogo real | **duplicado**: o visual novo de skills só existe no laboratório; o jogo real ainda usa o antigo |
| Barra de skills restilizada | só no laboratório |
| `game/iso-hero.js` + `render/vale.js` | protótipo arquivado (Vale de Auren rejeitado), mantido por regra; custa manutenção de teste |
| Hero sprites (`render/hero-sprites.js`) | **opt-in** (`?visual=miniatura`) — jogo real continua com os heróis antigos por padrão |
| Missões, diálogos de NPC, baús, eventos | **não existem** (NPCs só abrem painéis) |
| Equipamento visível no personagem | não existe |
| Especialização de classe | não existe |

## 3. Matriz de status por recurso
Legenda: **I** implementado · **T** testado (automático) · **V** validado (jogado/visto/medido em condição real) · **P** parcial · **—** pendente · **F** com falha conhecida.

| Recurso | Status | Evidência / lacuna |
|---|---|---|
| 4 classes, 3 skills cada | I, T (parcial) | testes cobrem golpe giratório, básico, bola de fogo; **sem teste por skill nem por status (stun/slow/buff/escudo)** |
| Combate melee/projétil/AoE/dash/buff | I, T parcial | simulador `npm run balance` roda duelos reais [MEDIDO] |
| Equilíbrio entre classes | **P** | nível 5: 57/54/44/35% · nível 10: 54/52/48/39% · nível 20: 39/46/56/41% (Guerreiro/Mago/Arqueiro/Clérigo) [MEDIDO]; meta 45–55% **não atingida** |
| Duração de duelo | **F** | 10–27 s vs meta 20–40 s [MEDIDO] |
| Mobs, chefes, telégrafos | I | telegraph de chefe existe (`updateTelegraphs`); **sem teste automatizado**, não validado em jogo |
| Loot/raridade/inventário | I, T | testes unitários de loot |
| Spirits | I, T | |
| Progressão nível 30 | I, T | curva `60·n^1,55` [LIDO]; **sem análise de ritmo** |
| Grande Arena por times | I, T | 6 e2e + unitários; **não validada** com humanos nem no celular |
| Poder (PWR) e pareamento | I, T | `core/power.js`, `generateRivalForPower` |
| Salvamento | I | localStorage, sem esquema, sem migração, **sem teste** |
| Celular (toque) | I, T (emulado) | `mobile.spec.js` 7 testes; **não validado em aparelho real** |
| Zoom/minimapa no celular | I, T (emulado) | |
| Visual miniatura (4 heróis) | I (opt-in), T | atlas aprovados por você; resto do mundo no estilo antigo |
| Jogo online (GitHub Pages) | I, V parcial | estático; **sem servidor** |
| Multiplayer real | **—** | nenhuma linha de rede |
| Contas / persistência online | **—** | |
| Missões, diálogos, masmorras, mapa-múndi | **—** | |
| Segurança (cliente confiável) | **F** (por desenho) | todo valor é calculado e guardado no cliente |

## 4. Gameplay — evoluir as quatro classes (sem nova classe, sem remover skills)
Dados atuais [LIDO, `data/classes.js`, `data/skills.js`]. Papéis propostos e **o que medi**:

| Classe | Papel | Básico | Skills (cd) | Medido (duelo) | Problema | Proposta (apenas ajustar/escolher) |
|---|---|---|---|---|---|---|
| **Guerreiro** | linha de frente, controle | corpo a corpo 0,5 s | Giratório 5 s · Investida 7 s (stun 1,2 s) · Grito 14 s (+35% dano, −25% recebido) | 39–57% | cai nos níveis altos; duelo curtíssimo (10–13 s) | **especializações (nível 15):** *Bastião* (Grito dura mais e reduz mais dano; Investida recarrega menos) × *Carrasco* (Giratório causa mais; Investida marca o alvo para dano extra) |
| **Mago** | dano em área, burst | projétil 0,7 s | Bola de Fogo 3,5 s · Nova de Gelo 8 s (slow 50%) · Teleporte 6 s | 46–55% | contra-jogo extremo vs Arqueiro/Clérigo | *Piromante* (Bola de Fogo maior raio/dano; Teleporte deixa rastro de fogo) × *Criomante* (Nova de Gelo maior e congela brevemente; menos dano direto) |
| **Arqueiro** | dano à distância, mobilidade | projétil 0,5 s, mult 0,62 | Chuva 8 s · Tiro Perfurante 5 s · Rolamento 4 s | 44–67% (variou muito com o nível) | escala demais com Agi (velocidade de ataque) | *Atirador* (Perfurante mais forte e mais longo; Rolamento recarrega mais) × *Caçador* (Chuva mais longa e ralentiza; mais dano contra chefes) |
| **Clérigo** | cura, suporte, dano sagrado | corpo a corpo 0,7 s | Luz Sagrada 8 s (cura 22%) · Escudo 15 s · Julgamento 6 s (stun 1,5 s) | 35–46% (baixo em todos os níveis) | sem cura em **aliados** (só em si), fraco solo | *Guardião* (Escudo pode ser lançado em aliado; dura mais) × *Inquisidor* (Julgamento maior dano e alcance; Luz Sagrada fere mais) |

Princípios: **especialização modifica parâmetros das skills existentes** (dados em `data/`), não cria skills. Para a cura/escudo em aliado é preciso **alvo de aliado** no sim (mudança de regra → teste obrigatório). Ponto crítico para multiplayer: em grupo, o Clérigo hoje **não beneficia ninguém além de si** — isso precisa ser resolvido antes de qualquer sala cooperativa.

Como saber que funcionou: `npm run balance` dentro de 45–55% por classe em níveis 5/10/20 **e** duelos de 20–40 s; testes por skill/status; nada removido.

## 5. Combate para multiplayer competitivo
Hoje o `World.update(dt, intents)` já recebe **intenções** (`mx,my,aimX,aimY,attack,cast`) — **ótimo ponto de partida** [LIDO]. O que falta:

| Necessidade | Por quê | Arquivo(s) | Risco | Teste | Sucesso |
|---|---|---|---|---|---|
| **Passo fixo** (ex.: 30 Hz) com acumulador | resultado idêntico no servidor e nos testes | `main.js` (loop), `sim.js` | médio: muda sensação (compensar com interpolação visual) | simulação 2× com dt diferentes dá mesmo estado | snapshot idêntico bit a bit |
| **Eventos de combate explícitos** (`hit`, `cast`, `death`, `status`) | VFX/animação disparam **após** o evento confirmado; o desenho nunca decide dano | `sim.js` (`events` já existe para `death`) | baixo | teste lê eventos de um duelo e confere sequência | efeitos usam só eventos |
| **Separar apresentação** (`particles`, `texts`, `fx`) em camada própria do cliente, alimentada por eventos | servidor não carrega partículas; regra do CLAUDE.md "visual consome estado" | `sim.js` → novo `render/effects.js` | médio (muitas chamadas `burst`) | e2e visual sem regressão; perf medida | `sim.js` sem `particles` |
| **Estados/status como dados** (stun, slow, buff, escudo, invulnerabilidade com duração e origem) | validar interrupções e evitar duplicação | `sim.js`, `data/skills.js` | médio | teste por status | todos os status listáveis em um snapshot |
| **Cooldown e ativação no servidor** (já existe `cds`) | impedir cast duplicado/spam | `sim.js` | baixo | teste: 2 intenções no mesmo tick = 1 efeito | só 1 efeito |
| **Telégrafos de chefe** com tempo real | indicadores de perigo | `ai.js`, `sim.js` | baixo | teste: dano só após o tempo do telégrafo | idem |
| **Respawn/invulnerabilidade pós-morte** | arena 4×4 e PvE em grupo | `sim.js` | baixo | teste | |
| **Hitboxes** documentadas (círculo/arco/linha) | consistência cliente–servidor | `sim.js`, `data/` | baixo | testes de borda | |

## 6. Arquitetura proposta de servidor
### 6.1 Comparação (custo, complexidade, compatibilidade, manutenção)
Não instalei nada. Pontos abaixo são conhecimento geral; **confirmar versões, licenças e manutenção atuais antes de decidir** [NÃO VERIFICADO].

| Opção | Prós | Contras | Encaixe com o código atual |
|---|---|---|---|
| **`ws` + código próprio** (Node, WebSocket) | menor dependência; controle total; **reusa `core/` e `game/sim.js` como estão** (JS puro) | você escreve salas, reconexão, filtro de área, serialização | **excelente**: `World.update(dt, intents)` roda no servidor sem mudar a regra |
| **Colyseus** | salas, matchmaking, estado sincronizado e reconexão prontos | impõe modelo de estado próprio (schemas); a sim atual guarda objetos com referências e teria de ser adaptada; mais uma camada para dominar | médio; ganha tempo em salas, perde em fidelidade com a sim atual |
| **Socket.IO** | reconexão e fallback prontos | overhead e protocolo próprio; menos adequado a snapshots binários | médio |

**Recomendação:** começar com **`ws` + mensagens JSON versionadas** (`{v:1,t:'input',…}`) no PoC (P4) para validar a sim autoritativa com o **mínimo** de dependência; reavaliar Colyseus depois do PoC, **com dados**, se a lógica de salas/matchmaking crescer demais. Critério de decisão: quantas linhas de "infra de sala" o PoC exigiu e se a sim cabe num schema.

### 6.2 Modelo
```
Cliente (Canvas)                     Servidor Node (autoritativo)
 intenções @ 20–30 Hz  ── WSS ──▶   valida (rate, schema, versão, sessão)
 predição local do próprio ator      World.update(dt fixo, intents)  [core+game compartilhados]
 interpolação dos demais ◀── snapshots (20 Hz, só entidades próximas)
 efeitos a partir de eventos         eventos: hit/cast/death/status/loot (confirmados)
```
- **Servidor decide:** posição válida (velocidade máx., colisão), ataques/skills (cooldown, alcance), dano, vida, morte, loot, XP, ouro, inventário, resultado/ranking. O cliente **só envia intenção**.
- **Mensagens:** `hello{v,token}`, `input{seq,mx,my,aim,attack,cast}`, `ping`; servidor: `welcome`, `snapshot{tick,ents}`, `events[]`, `reject{code}`. Versão de protocolo obrigatória; versão incompatível = recusa limpa.
- **Latência:** predição só do movimento do **próprio** jogador (reconcilia por `seq`); inimigos/outros jogadores interpolados 100 ms atrás; golpes e dano **só confirmados** pelo servidor.
- **Tick:** começar em **20 Hz** de snapshot e 30 Hz de simulação; **medir** custo de CPU e banda antes de fixar [HIPÓTESE]. Orçamento inicial de banda a medir: < 20 KB/s por jogador.
- **Salas (ordem):** (1) *sala experimental 2 jogadores + combate simples*; (2) arena 1×1; (3) arena 2×2 e 4×4 (já existentes offline); (4) vila social; (5) exploração PvE em grupo; (6) masmorra instanciada; (7) chefe cooperativo. **Não** implementar todas juntas. A arena 3×3 do seu pedido encaixa entre 2×2 e 4×4 — hoje o modo é parametrizado em `MODES` (`core/match.js`), então é só dado + teste.
- **Reconexão:** sessão guarda o ator por 30–60 s ([HIPÓTESE]); o cliente reenvia `hello` com token e recebe snapshot completo.

## 7. Contas, personagens e persistência
- **Separar:** conta (login), personagem (documento), sessão (token efêmero), preferências locais (`prefs.js` — continuam no aparelho).
- **Banco:** relacional (PostgreSQL ou SQLite para o PoC) com tabelas `accounts`, `characters(doc JSONB, version)`, `inventory_ops` (registro de operações), `matches`. Serviço gerenciado (ex.: Supabase) é uma opção; **comparar com hospedar o próprio Node + Postgres** — planos gratuitos têm pausa de inatividade e limites que variam entre fontes [NÃO VERIFICADO nas páginas oficiais].
- **Documento do personagem versionado:** `char.version` já existe (=1). Criar `migrate(char)` por versão (v1→v2…) com teste de cada passo; importar o save atual do `localStorage` **uma única vez** na criação da conta (servidor valida e normaliza; itens recebem IDs novos do servidor).
- **Integridade:** toda recompensa é uma **transação** no servidor (`grant{xp,gold,item}` com ID de operação idempotente); inventário validado no servidor; log de operações importantes; backup periódico.
- **Antes de contas (P3):** salvamento **versionado e validado no cliente** (esquema + migração + teste + exportar/importar) — vale por si só e prepara a importação.

## 8. Segurança e anti-cheat (resumo do modelo de ameaça)
| Ameaça | Hoje | Mitigação planejada |
|---|---|---|
| Editar `localStorage` (ouro/itens/nível) | trivial | save oficial no servidor; cliente só mostra |
| Enviar dano/loot falso | possível (sim no cliente) | cliente envia só intenção; servidor calcula |
| Velocidade/teleporte | possível | servidor integra movimento; limite de velocidade e colisão |
| Spam de skill / replay | — | cooldown no servidor; `seq` monotônico por sessão; rejeitar duplicatas |
| Mensagem inválida / enorme | — | schema, tamanho máximo, rate limit por conexão e por tipo |
| XSS via nome | `main.js:135` → `toast()` com `innerHTML` sem escape (a confirmar) | escapar sempre; whitelist de caracteres no servidor |
| Duplicação de item | — | IDs de item do servidor + operações idempotentes |
| Segredos no frontend | nenhum hoje | segredos só no servidor (`.env` fora do Git); WSS/TLS |
| Isolamento de salas | — | cada sala com seu `World`; mensagens validadas contra a sala da sessão |
| Logs de suspeitos | — | registrar `reject` e picos de taxa |

Testes de segurança previstos: fuzz de mensagens, replay, rate limit, velocidade impossível, cooldown, duplicação de recompensa.

## 9. Plano visual para multiplayer (Isometric HD Anime Fantasy)
Nada de formas geométricas para personagens (decisão 0006); estilo único (0004/0007), sem misturar com o pastel antigo.

| Elemento | Plano | Observação |
|---|---|---|
| Reconhecer classe sem depender de cor | **silhueta** própria por classe (arma/postura), **ícone de classe** no nameplate, e **marcador de time por forma** (losango = aliado, círculo vazado = inimigo) + cor | cor sozinha reprovaria em daltonismo |
| Nameplate | nome · nível · barra de vida (mana quando houver) · ícone de classe · coroa (líder do grupo) · realce de alvo | limitar a N placas por tela; só nome do alvo/aliados quando houver muita gente |
| Efeitos de skill | migrar `vfx.js` (lab) para `render/`, disparados por **eventos confirmados**; **orçamento de partículas** por qualidade | custa medir; celular corta pela metade |
| Equipamento visível | **camadas por slot** (arma, escudo, elmo, capa) assadas no pipeline Blender→atlas, alinhadas aos 8 ângulos×clips; raridade = brilho/tint | começar por **arma** e **elmo**; cuidado com memória de textura |
| Monstros/NPCs/chefes | pipeline: conceito → modelo → render → atlas → integração → validação; **cada monstro**: idle/walk/attack/hit/death (+ especiais de chefe) | fase B2; é a maior fatia de arte |
| Cenário | chão, vegetação, água, ruínas e iluminação no mesmo estilo; **uma zona por vez**, com identidade própria | fase B3 |
| UI | HUD com personalidade; **sem emojis como ícone definitivo** (hoje a UI inteira usa emojis → pendente) | depende do como-produzir arte fina (**decisão sua**) |
| Câmera isométrica no jogo real | fase B4; só depois de B2/B3 aprovadas | a sim não muda |

**Limite honesto:** os 4 heróis estão aprovados em atlas; **não há** ainda monstros, cenário, UI e equipamentos no mesmo padrão. Isso não se resolve por código — exige produção de arte (você ainda não decidiu **como** produzir a arte fina).

## 10. Análise de escalabilidade e plano de otimização
**Escalabilidade [HIPÓTESES a medir]:** (a) CPU do servidor por sala = custo de `World.update` × 30 Hz; hoje há buscas O(n²) em `separate()` e `nearestEnemy`; (b) banda por jogador = tamanho do snapshot × 20 Hz; (c) memória por sala; (d) um processo Node = um núcleo — salas distribuídas por processo/worker. Não afirmo capacidade de "X jogadores": o plano é **medir** salas de 2, 8 (4×4), 20, 30 jogadores e 50/100 entidades totais e só então definir limites.

**Plano de otimização (em ordem de custo/benefício):**
1. **Medir antes** (harness de simulação em Node sem DOM: tempo por tick em 10/20/30 jogadores + 50/100 entidades).
2. **Grade espacial** (spatial hash) no `World` para `nearestEnemy`, colisão de projétil e `separate()`.
3. **Snapshots por interesse** (só entidades dentro de um raio) e delta/quantização.
4. **Cliente:** culling (já há `vis`), pooling de partículas, limite de efeitos por qualidade, redução de animação para distantes, atlas recortado, carregamento sob demanda por classe (já existe `preloadHero`).
5. **Canvas 2D × PixiJS:** **só por PoC comparável** (mesma cena, mesmas métricas: FPS, tempo de quadro, CPU, GPU, memória, texturas, operações de desenho, nº de atores/efeitos, custo de animação, carga de recursos); decisão 0001 segue valendo até lá. Cenários: 10/20/30 jogadores, 50/100 entidades, combate com muitos efeitos — **cenários de teste, não promessa**.
6. **Celular real:** medir memória/FPS num aparelho Android (o único dado de GPU móvel que falta).

## 11. Qualidade dos testes
| Camada | Existe | Lacuna |
|---|---|---|
| Unitários (`npm test`) | 65 passam [MEDIDO] | skills individuais, status, telégrafo de chefe, save/migração, loja, ondas |
| E2E (Playwright) | 47 passam na última execução completa [MEDIDO] | **2–3 testes do laboratório oscilam sob carga e passam sozinhos** (observado nesta sessão; é flutuação conhecida, não corrigida) |
| Rede | — | **não existe**: precisa de testes com 2 clientes, latência simulada, mensagens inválidas |
| Segurança | — | fuzz/replay/rate limit |
| Carga | — | harness de simulação + clientes sintéticos |
| Desempenho | `tests/perf` (GPU) | só laboratório; sem cenário multiplayer |
| Equilíbrio | `npm run balance` | meta ainda não atingida |

## 12. Roadmap com dependências
```
P0 Auditoria ──▶ P1 Classes+combate estável ──┬──▶ P3 Save versionado ──▶ P4 PoC servidor (2 jogadores)
                                              │                              │
                                              └──▶ P2 Identidade visual (lab)│
                                                         ▼                    ▼
                                         B2/B3 (monstros, cenário)     P5 Contas+persistência
                                                                              ▼
                                                                    P6 Salas/grupos ──▶ P7 Arena+coop ──▶ P8 Mundo/missões ──▶ P9 Segurança+carga ──▶ P10 Android
```
- **P1 antes de P4:** sem passo fixo, eventos e sim limpa, o servidor autoritativo herdaria dívida (e divergência).
- **P2 pode ocorrer em paralelo** (arte) mas **bloqueia** B2–B5 (decisão sobre como produzir arte).
- **P3 antes de P5:** o importador do save precisa de esquema e migração.
- Cada fase termina com **relatório e aprovação** (regra do projeto) e **commit separado**.

## 13. Primeira fase recomendada: **P1 — estabilidade das quatro classes e do combate (escopo enxuto)**
**Por que:** é o pré-requisito técnico do servidor e resolve o que já está medido como ruim (classes fora do equilíbrio, duelos curtos, Clérigo sem cura em aliados).

**Objetivo.** Deixar a simulação **determinística, orientada a eventos e testável**, e as 4 classes dentro de uma meta de equilíbrio medida — sem mudar visual nem criar sistema novo.

**Entregas (nesta ordem, cada uma com teste):**
1. **Passo fixo** (30 Hz) no `Game.loop` e no simulador; teste: mesma semente em dt diferentes ⇒ mesmo estado. *Arquivos:* `main.js`, `game/sim.js`, `tools/balance.mjs`, `tests/core.test.js`.
2. **Eventos de combate** (`hit`, `cast`, `status`, `death`) emitidos pelo `World`; VFX atuais passam a consumi-los. *Arquivos:* `game/sim.js`, `render/renderer.js`. Teste: sequência de eventos em duelo fixo.
3. **RNG visual separado** (`Math.random` → gerador visual) e remoção de `particles/texts/fx` do núcleo para uma camada do cliente. *Arquivos:* `game/sim.js`, novo `render/effects.js`. Teste: dois mundos com visuais diferentes têm o mesmo estado de jogo.
4. **Testes por skill e por status** (stun, slow, buff, escudo, invulnerabilidade, cooldown duplo). *Arquivo:* `tests/core.test.js` (ou `tests/skills.test.js`).
5. **Equilíbrio** até 45–55% em níveis 5/10/20 e duelo 20–40 s; documentar na tabela do roteiro. *Arquivos:* `data/classes.js`, `data/skills.js`.
6. **Alvo aliado** para cura/escudo do Clérigo (mudança de regra com teste). *Arquivos:* `game/sim.js`, `data/skills.js`, `game/ai.js`.
7. **Atualizar documentos desatualizados** (`docs/testing/estrategia.md`, `docs/gameplay/sistemas.md`, `docs/architecture/overview.md`).

**Fora desta fase:** especializações de classe (propostas na seção 4, entram em P1.5 se você aprovar), rede, contas, arte.

**Riscos:** (a) passo fixo muda a "sensação" do jogo → compensar com interpolação visual do cliente; (b) tirar partículas da sim toca muitas linhas do `sim.js` → um agente por arquivo, testes antes; (c) equilíbrio é iterativo e pode exceder o prazo → limitar a 3 rodadas de ajuste e relatar.

**Critérios de aceitação:** `npm test` e `npm run test:e2e` verdes (executados e reportados com número); `npm run balance` com as 4 classes em 45–55% nos níveis 5/10/20; teste de determinismo passando; nenhuma habilidade removida; jogo abre sem erros de console; **medir** o custo por frame antes/depois (regra do projeto).

**Como saberemos que funcionou:** relatório com os números do simulador, contagem de testes e comparação de FPS; commit separado para cada entrega.

## 14. O que preciso de você para aprovar
1. Aprovar P1 como **primeira fase** (ou indicar outra).
2. Aprovar especializações como P1.5 (ou adiar).
3. Servidor: aprovar **`ws` + código próprio** no PoC (P4) e reavaliar Colyseus depois (ou pedir pesquisa antes).
4. Conta: **obrigatória ou opcional**, e método de login (e-mail ou Google).
5. Arte fina (UI sem emojis, monstros, cenário): **como produzir** (gerador pago, artista, licenciada) — isso bloqueia B2–B5.
6. Arena **3×3**: incluir já nos modos (é só dado + teste), ou manter 1×1/2×2/4×4?

---
## Atualização — P3 concluída (2026-10-31): salvamento versionado e validado
- **Implementado e testado:** `core/savedoc.js` (versão do documento = **2**, migração v1→v2 por passos, validação/normalização com lista branca, contabilidade de pontos de atributo, limites de ouro/nível/itens, itens inválidos/duplicados/fora de slot removidos, nome sem HTML); `save.js` (backup automático a cada 5 min e antes de migrar, original corrompido guardado em `aetheria_save_v1_corrupt`, recuperação pelo backup, aviso ao jogador); **Exportar/Importar** (Opções e tela de título); `main.js:135` agora escapa o nome (o ponto de XSS da seção 2.3 item 7 foi fechado).
- **Testes:** 12 unitários (`tests/save.test.js`) e 5 e2e (`tests/e2e/save.spec.js`: save antigo migra, corrompido não derruba, recuperação por backup, trapaça limitada e sem XSS, exportar/importar).
- **O que isto NÃO é:** validação no cliente **não impede trapaça** (o jogador controla o navegador). Ela protege contra corrupção/versões e é o **molde do validador do servidor** (P5), que será a autoridade. Exportar/importar sem assinatura permite que o jogador edite o arquivo: dentro dos limites acima, o servidor terá de revalidar na importação para a conta.
- **Importação para a conta (P5):** o servidor receberá este mesmo documento, reaplicará `migrate`+`validate` e atribuirá IDs novos a itens.

---
## Atualização — P4 concluída (2026-10-31): servidor autoritativo com dois jogadores (prova de conceito)
- **Implementado e testado:** servidor `ws` (decisão **0008**, dependência avaliada: MIT, sem dependências, 0 vulnerabilidades, versão fixada); protocolo v1 versionado; sala de duelo com 2 jogadores reais; simulação real em passo fixo (60 Hz) com snapshots a 20 Hz; cliente de laboratório com interpolação e predição suave; reconexão por token; abandono = derrota.
- **Critérios de aceitação da PoC:** dois clientes na mesma sala ✔ · cada um vê o outro ✔ · movimento sincronizado ✔ · ataques validados pelo servidor (cooldown, alcance) ✔ · dano e morte sincronizados ✔ · desconexão/reconexão ✔ · dano/loot falsificado pelo cliente recusado ✔ (`damage`/`pos`/`gold` → `bad_message`, estado inalterado). **Recompensas persistidas: NÃO** (sem contas; é a P5).
- **Testes executados:** 118 unitários (17 de rede/segurança) e 57 e2e (1 com dois navegadores reais). Documentação: `docs/architecture/servidor-poc.md`.
- **Não medido / não validado:** latência e perda de pacotes reais, banda por jogador, custo de CPU por sala, mais de 2 jogadores, WSS. **Nenhum número de capacidade é afirmado.** Próxima medição prevista: harness de carga (P9).
- **Achados durante a PoC:** (1) golpes empurram o alvo (4 px por golpe) e um atacante de corpo a corpo que só avança acaba empurrando o alvo contra a borda da arena, onde os dois se sobrepõem; (2) a mira do cliente precisa seguir o alvo — o servidor usa a mira enviada; (3) eventos finais só saem no próximo snapshot (o servidor precisa continuar em tick após o fim da partida).

---
## Atualização — P5 concluída (2026-10-31): contas, personagens e persistência online
- **Implementado e testado (local):** `server/db.js` (SQLite embutido), `server/auth.js` (e-mail/senha com scrypt, sessões opacas com hash, códigos de recuperação, bloqueio, **Google com verificação de ID token RS256**), `server/api.js` (cadastro/login/recuperação, até 4 personagens por conta, importar save local, salvar na nuvem com revisão otimista e plausibilidade, auditoria), WebSocket autenticado com personagem do banco e **recompensas transacionais e idempotentes**; cliente do jogo com login, lista de personagens, importação do save local e sincronização (`public/src/online.js`); **conta obrigatória quando há API**.
- **Decisão e limites:** `docs/decisions/0009-contas-persistencia-e-login.md` (leia a seção "Limites honestos").
- **Testes executados:** 142 unitários (16 de contas/API, 7 de WebSocket autenticado, 1 novo de robustez do pareamento) e 63 e2e (6 de modo online). Resultado da última execução completa: ver relatório da P5.
- **Não validado:** servidor publicado, HTTPS/WSS, Google real (precisa de um *client id* do proprietário), carga, recuperação de desastre, PvE autoritativo (o progresso de PvE segue sendo calculado no cliente, com limites de plausibilidade).
- **Defeito real encontrado e corrigido durante a P5:** a ordem de pagamento das recompensas alterava o rating do perdedor (985 em vez de 984); agora os ratings "de antes" são congelados. Também melhorei o pareamento por poder (piso de poder do rival mais baixo; antes, 5/1280 combinações fugiam de ±15%).

---
## Atualização — P6 concluída (2026-10-31): salas, grupos e sincronização multiplayer
- **Implementado e testado (local):** `Hub` (sessões, grupos com convites, fila, matchmaking por rating **e** poder, relógio fixo), `MatchRoom` (1×1, 2×2 e 4×4 com ponto de controle, bots que completam vagas ou assumem quem abandona, recompensas por modo idempotentes), protocolo **v3**, laboratório com lobby/grupo/fila e visual de times (forma + cor). Decisão **0010**.
- **Testes executados:** 160 unitários (16 novos de lobby, 17 de rede, 9 de contas autenticadas) e 64 e2e (2 em navegadores reais: 1×1 e grupo + 2×2 com 4 navegadores). Última execução completa: 63 passaram e 1 oscilou sob carga (teste do celular emulado; passou sozinho).
- **Medido (esta máquina):** snapshot 4×4 ≈ 2,3 KB (≈ 45 KB/s por jogador a 20 Hz — **acima do alvo**); CPU de 40 salas 4×4 (320 atores de IA) ≈ 1,6 ms por tick, com picos de 25–36 ms (GC/JIT) acima do tick de 16,7 ms. **Nada disso foi medido com rede ou jogadores reais.**
- **Defeitos/lacunas encontrados e tratados:** (1) abandono na contagem punia o time inteiro → agora cancela a partida sem punir; (2) o desertor poderia ser premiado se seu time vencesse com um bot no lugar → agora conta derrota; (3) o rating do adversário usava ratings já atualizados → ratings "de antes".
- **Não feito:** ligar o **jogo real** (renderer) ao servidor de salas — é a **P7** (arena PvP e conteúdo cooperativo no cliente principal); chat; amigos; guildas; otimização de banda; investigação dos picos de CPU.

---
## Atualização — P7 concluída (2026-10-31): arena PvP e conteúdo cooperativo no jogo real
- **Implementado e testado (local):** o jogo real (modo online) joga partidas 1×1/2×2/4×4 contra jogadores reais e **cooperativo** (5 ondas + chefe, PvE **autoritativo** no servidor, com XP, ouro e loot decididos e gravados lá); painel de grupo (tecla G), fila pelo painel da Arena, marcador de time por forma (losango/quadrado), nome e nível, aviso de perigo do chefe por evento. Decisão **0011**.
- **Testes executados:** 169 unitários (9 novos de cooperativo) e 68 e2e (4 novos no **jogo real**: 1×1 em dois navegadores, grupo + 2×2 em quatro, cooperativo até o chefe, servidor indisponível). Última execução completa: 67 passaram e 1 oscilou (laboratório; passou sozinho). Capturas de tela da arena e do cooperativo conferidas.
- **Defeitos encontrados e corrigidos na P7:** (1) a recompensa chegava antes do snapshot "over" e era sobrescrita por "Calculando…" (corrida); (2) o teste de perseguição travava nos pilares (a IA já os contornava; o cliente de teste não).
- **Limites:** projéteis do cliente são só visuais; **cooperativo ainda sem balanceamento** (recompensa provavelmente generosa); zonas de exploração continuam sem servidor; sem chat, amigos, guildas; nada medido em rede real ou com carga.

---
## Atualização — P8 concluída (2026-10-31): mundo, missões e progressão ampliada
- **Implementado e testado (local):** documento do personagem **v3** (missões, contadores, conquistas, título, baús); **12 missões** em dados com diálogos de NPC (2 NPCs novos), **16 conquistas** com títulos, **baús** (4 por zona), **mapa-múndi** (M) e **diário** (J); progresso de arena/cooperativo e conquistas **do servidor**; plausibilidade do salvamento estendida; **economia documentada** (`docs/gameplay/economia.md`, `npm run economy`) e **cooperativo rebalanceado** (XP ≤ 30% de um nível). Decisão **0012**.
- **Testes executados:** 179 unitários (10 novos de diário/plausibilidade) e 72 e2e (3 novos de missões no jogo real + verificações de missão de arena no online). Todos passaram na última execução completa.
- **Defeito encontrado na própria fase:** a recompensa de XP do cooperativo era ≈ 75% de um nível (generosa demais) — corrigida com tetos e testada.
- **Limites:** PvE de exploração segue calculado no cliente (com tetos); sem mercado/leilão (decidido); sem ralos de fim de jogo (aprimoramento de equipamento); sem eventos mundiais, masmorras instanciadas, áreas secretas nem novas zonas; NPCs e baús novos usam arte provisória do estilo atual.
