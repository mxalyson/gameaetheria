# 0013 — Otimização, segurança e testes de carga (P9)
Data: 2026-10-31 · Status: **implementado e medido localmente**. Todas as medições são de **uma máquina de desenvolvimento Windows** (cliente e servidor competindo pela mesma CPU, sem rede real): **não são promessas de capacidade**.

## 1. Banda: snapshots compactos por delta (protocolo v4)
- **Antes (v3):** ≈ 2,3 KB por snapshot 4×4 ⇒ **≈ 45 KB/s por jogador** a 20 Hz (alvo: < 20).
- **Agora:** os dados que não mudam (nome, classe, nível, vida máxima, tipo de monstro) vão **uma vez** (`match_found` / `n`); cada snapshot leva só as entidades que mudaram (tuplas `[id, x, y, hp, direção, bandeiras, escudo]`); velocidade e recargas só ao dono; **quadro-chave completo** a cada 20 snapshots e a quem reconecta. Código: `core/snapshot.js` (decodificador), `server/snapshot.js` (codificador).
- **Medido:** **≈ 410–435 B por snapshot ⇒ ≈ 8,1–8,5 KB/s por jogador** (redução ≈ 82%), 4×4 de IA em luta, média real incluindo eventos e quadros-chave. Com clientes reais no teste de carga: 462–485 B, ≈ 9,1–9,3 KB/s.
- **Garantias testadas** (`tests/snapshot.test.js`): o estado decodificado no cliente **bate com o do servidor** a cada snapshot de 30 s de partida (posição ±0,06, vida, morte), inclusive após quadro-chave e **reconexão**; monstros que nascem/somem; entradas hostis no decodificador não quebram.
- **Limite:** continua JSON (sem compressão nem formato binário). Há folga para reduzir mais se necessário.

## 2. CPU do servidor
- **O que mudou (sem alterar regra de jogo; os testes de determinismo seguem passando):** compactação de buffs no lugar (antes: um array novo por ator por tick), listas reaproveitadas em `separate()`, `filter` de atores/projéteis/áreas/avisos só quando há algo a remover, `updateVisuals` pulado sem visuais, contagem direta no `judge()`.
- **Efeito medido:** média ≈ 1,43 → 1,31–1,41 ms/tick com 40 salas (≈ 6%); p95 3,1 → 2,9 ms. **Os picos (p99 ≈ 7–9 ms; máximo 20–30 ms) não sumiram**: parte é coleta de lixo (Mark-Compact de 5–8 ms medido com `--trace-gc`) e parte é aquecimento do JIT no início. **Pendente:** perfil com `--cpu-prof` em carga longa e reuso de objetos (tuplas/intenções).
- **`npm run bench:net`** (somente simulação + montagem de snapshot, bots, sem rede), 30 s:

| Salas 4×4 | Atores | CPU média/tick | p99 | Ticks acima de 16,7 ms | Núcleo usado |
|---|---|---|---|---|---|
| 10 | 80 | 0,42 ms | 3,6 ms | 1 de 1800 (0,06%) | ≈ 3% |
| 40 | 320 | 1,33 ms | 7,9 ms | 1 de 1800 (0,06%) | ≈ 8% |
| 100 | 800 | 3,11 ms | 14,4 ms | 11 de 1800 (0,61%) | ≈ 19% |

## 3. Teste de carga com clientes WebSocket reais (`npm run load`)
O servidor roda no processo medido; os clientes (convidados que enfileiram 4×4, andam, atacam e repetem) rodam em processos filhos.

| Clientes | Salas | Snapshots/s por cliente | KB/s por cliente | RTT p50 / p99 | CPU do servidor | RSS | Atraso do laço (máx.) |
|---|---|---|---|---|---|---|---|
| 16 | 2 | 19,1 | 8,6 | 0,7 / 95* ms | ≈ 6% | 75 MB | 28 ms |
| 64 | 8 | 19,7 | 9,2 | 1,8 / 13 ms | ≈ 14% | 85 MB | 31 ms |
| 160 | 20 | 19,7 | 9,3 | 2,2 / 31 ms | ≈ 26% | 104 MB | 70 ms |
| 400 | 50 | 19,3 | 9,1 | 9,9 / **274 ms** | ≈ 48% | 146 MB | **162 ms** |

\* o p99 de 16 clientes vem do primeiro ping, durante a abertura das conexões. Nenhuma conexão caiu, nenhuma mensagem foi recusada e **nenhum erro** ocorreu em nenhuma execução.
**Leitura honesta:** até ~160 clientes por processo a latência de fila fica baixa; com **400** o p99 já passa de 270 ms e o laço de eventos chega a 162 ms — **degradação visível**. Parte disso é a máquina de teste (clientes disputando CPU) e a granularidade do relógio do Windows (~15,6 ms no `setInterval`; por isso o p50 do laço aparece ≈ 13–16 ms). Conclusão prática, **válida para esta máquina**: planejar **≈ 150–250 jogadores por processo** e escalar com vários processos/máquinas (a sala não depende de outras salas). Não testado: rede real, perda de pacotes, TLS, banco de dados sob carga.

## 4. Segurança
| Defesa nova | Onde | Teste |
|---|---|---|
| Limite de conexões por IP (20) e total (2 000); recusa com código 1013 | `server/game-server.js` | `tests/security.test.js` |
| Conexão que não se identifica em 10 s é derrubada | idem | idem |
| Conexão derrubada não é mais processada nem registrada de novo (evita lixo no log) | idem | idem |
| **Auditoria de abuso** (`ws_abuse`: IP, conta, motivo) para inundação, erros em excesso, sessão/token falsos | idem + `server/db.js` | idem |
| Cabeçalhos da API: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, CSP `default-src 'none'` | `server/api.js` | idem |
| **Varredura de segredos** nos arquivos versionados (`npm run security:scan`) | `tools/security-scan.mjs` | idem |

**Verificado por teste (e sem encontrar falha):** fuzz do protocolo com 30 000 entradas aleatórias (nunca lança exceção; o que passa é limpo e limitado); fuzz do **servidor vivo** com 6 000 mensagens hostis enquanto uma partida real segue (nenhuma exceção não tratada, partida intacta); injeção de SQL em e-mail/senha/nome/ids (tabelas intactas); poluição de protótipo; erros sem rastros de pilha nem caminhos; travessia de caminho no servidor estático (9 variações codificadas); `npm audit`: **0 vulnerabilidades**.
**Não coberto:** TLS/WSS (exige proxy), ataques de rede volumétricos (DDoS), engenharia social, abuso de contas em massa (sem CAPTCHA), dependências futuras, revisão por terceiros, teste de invasão profissional.

## 5. O que NÃO foi feito nesta fase
- **Canvas 2D × PixiJS:** a prova de conceito comparável de renderização **não foi feita** (exige instalar o PixiJS e medir em GPU/celular real). A decisão 0001 (Canvas 2D) segue valendo; o custo de desenho de 8–50 atores no cliente **não** foi medido nesta rodada.
- **Medição em celular real**, e **otimização de memória de texturas** (planejadas para a fase de Android, P10).
- **Compressão/formato binário** de snapshots e **perfil de CPU em carga longa** (ver seção 2).
