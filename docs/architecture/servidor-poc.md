# Servidor autoritativo — prova de conceito (P4)
Status: **implementado e testado** (rede e dois navegadores); **não validado** em rede real (internet, latência, perda de pacotes) nem com carga. Escopo: **uma sala de duelo com dois jogadores reais**.

## Como rodar
```bash
npm start            # jogo e laboratório em http://localhost:5174
npm run server:poc   # servidor autoritativo em ws://127.0.0.1:5175
```
Abra **duas abas** em `http://localhost:5174/labs/net-poc/index.html` (escolha nome e classe, "Entrar"). WASD move, mouse mira, clique ataca, 1/2/3 habilidades. Os marcadores são de depuração, **não** arte do jogo.

## Arquivos
| Arquivo | Papel |
|---|---|
| `public/src/core/protocol.js` | versão do protocolo, validação de mensagens do cliente (lista branca), `RateLimiter`, constantes de tick |
| `server/game-server.js` | `createGameServer()`: sala, simulação em passo fixo (60 Hz), snapshots (20 Hz), reconexão, batimento, limites |
| `server/start-poc.js` | inicia o servidor (`GAME_PORT`, `ALLOWED_ORIGINS` opcionais) |
| `public/labs/net-poc/` | cliente de laboratório: intenções a 30 Hz, interpolação (100 ms), predição suave do próprio movimento |
| `tests/net.test.js` | 17 testes de rede/segurança (sem navegador, passo manual determinístico) |
| `tests/e2e/net-poc.spec.js` | 2 navegadores reais no mesmo servidor |

## Protocolo v1 (JSON `{v, t, …}`)
Cliente → servidor: `hello{name,classId,token?}` · `input{seq,mx,my,aimX,aimY,attack,cast}` · `ping{ts}`.
Servidor → cliente: `welcome{you,slot,token,arena,tickHz,…}` · `snap{tick,state,countdown,winner,ack,actors[],events[]}` · `pong` · `reject{code}`.
Eventos nos snapshots: `hit`, `heal`, `swing`, `cast`, `status`, `death`, `fight`, `result`.
**O cliente nunca envia dano, posição, vida, ouro ou loot**; `damage`, `pos`, `gold`… são recusados como `bad_message`.

## Autoridade
O servidor roda `World` (mesma simulação do jogo, `visuals:false`) e decide: movimento (direção normalizada × velocidade do personagem, com colisão), ataques e habilidades (alcance, **cooldown**, atordoamento), dano, vida, morte e resultado. O personagem é **gerado pelo servidor** (nível 10, equipamento incomum); o cliente só escolhe nome e classe.
Ciclo da sala: `waiting` → `countdown` (3 s) → `fight` → `over` (5 s) → recomeça. Queda de conexão: a vaga é reservada por 30 s (token de reconexão); depois, derrota por abandono.

## Defesas implementadas (e testadas)
Validação de esquema e versão · tamanho máximo · limite de taxa por conexão · limite de erros · `seq` monotônico (replay/ordem) · token aleatório de 144 bits por sessão (`crypto.randomBytes`) · sala cheia · origem opcional · batimento (ping/pong, derruba conexões mortas) · nome sem HTML · determinismo (mesma semente + mesmas entradas = mesmo resultado).

## Limites e riscos conhecidos
- **Sem contas nem persistência**: nada é salvo; XP/loot/ouro não existem nesta PoC (P5).
- **Predição só de movimento**; correção por aproximação suave, **não** reconciliação por reexecução de entradas (P6).
- Um processo, uma sala, tick por `setInterval` (jitter do Node); sem teste de carga nem de rede com perda/latência.
- `ws://` sem TLS (o servidor escuta só em `127.0.0.1`); em produção, WSS atrás de proxy.
- O `token` de reconexão viaja no `welcome`; em produção virá da autenticação da conta.

## Com contas (P5)
`npm run server` (`server/start.js`) liga o mesmo servidor com banco: o `hello` passa a ser `{session, characterId}` (protocolo **v2**); o servidor carrega o personagem **do banco** (o cliente não envia atributos), recusa convidados e grava as recompensas do duelo (ouro, XP, rating, vitória/derrota) numa transação idempotente por `matchId`+personagem. Mensagem nova: `reward`. Contas, API e limites: decisão 0009 e `docs/roadmap/auditoria-p0-e-plano-multiplayer.md`.
