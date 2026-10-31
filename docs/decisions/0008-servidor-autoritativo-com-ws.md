# 0008 — Servidor autoritativo com `ws` (prova de conceito P4)
Data: 2026-10-31 · Status: **aprovado pelo proprietário para a PoC (P4)**; a decisão "ws × Colyseus" para produção será **reavaliada com dados da PoC**.

## Contexto
O multiplayer real exige um servidor que execute a simulação (`core/` + `game/`, as mesmas do cliente) e decida posição, dano, vida e morte. O cliente só envia **intenções**.

## Decisão
Usar **`ws` 8.22.1** (WebSocket para Node) com mensagens JSON versionadas (`public/src/core/protocol.js`), em `server/`. Nenhum framework de salas por enquanto.

## Avaliação da dependência (feita antes de instalar)
| Critério | Resultado |
|---|---|
| Licença | **MIT** |
| Dependências próprias | **nenhuma** (as peers `bufferutil` e `utf-8-validate` são opcionais e **não** foram instaladas; `ws` usa o caminho em JS puro) |
| Mantenedor / origem | repositório `websockets/ws` (mantenedor `lpinca`), registro oficial do npm |
| Tamanho | ≈ 152 kB descompactado |
| Segurança | `npm audit --omit=dev`: **0 vulnerabilidades** (2026-10-31); versão fixada **exata** no `package.json` (`8.22.1`) e no `package-lock.json` |
| Alternativa sem dependência | implementar RFC 6455 à mão: mais código sensível a erro (framing, máscaras, fragmentação) — **descartado** |
| Colyseus / Socket.IO | adiados: modelo de estado/protocolo próprio; a simulação atual guarda referências de objetos. Reavaliar se a infra de salas crescer |

## Consequências
- Primeira **dependência de runtime** do projeto (antes: zero). O jogo no navegador continua sem dependências; só `server/` usa `ws`.
- O cliente nunca envia dano/posição/loot; tipos desconhecidos são recusados. Limites: mensagem ≤ 1 KB (e `maxPayload` 2 KB no `ws`), 120 msg/s por conexão, 5 erros por conexão, `seq` monotônico (replay ignorado), origem opcional por lista.
- **Não é produção:** sem contas (P5), personagem padrão gerado no servidor, uma sala, `ws://` local. WSS exige proxy TLS na implantação.
- Atualizações do `ws`: só após `npm audit` e testes de rede (`tests/net.test.js`).
