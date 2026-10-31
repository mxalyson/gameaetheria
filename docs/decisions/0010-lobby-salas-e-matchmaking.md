# 0010 — Lobby, grupos, salas por modo e matchmaking (P6)
Data: 2026-10-31 · Status: **implementado e testado localmente**; aprovado como parte do plano P0–P10 pelo proprietário (P6). Não publicado.

## Arquitetura
```
WebSocket (ws) ── game-server.js: validação (protocolo v3), limites, autenticação
        │
        └─ Hub (server/hub.js): sessões · grupos/convites · fila · matchmaking · salas · relógio fixo (60 Hz)
                └─ MatchRoom (server/room.js): 1 sala = 1 World (a MESMA simulação do jogo) + ponto de controle + bots + recompensas
```
Uma conexão por jogador faz tudo (lobby e partida). O `Hub` não conhece WebSocket e usa o relógio do servidor (`step()`), então cada regra é testável sem rede e sem esperar.

## Regras
| Tema | Regra |
|---|---|
| Modos | 1×1, 2×2, 4×4 (`core/match.js`), na `arena_team`; vitória por eliminação, 100 pontos no ponto de controle ou, ao fim do tempo, pontos → vida → empate |
| PvP | só a partir do **nível 10** (`pvp_locked`) |
| Fila | solo ou **grupo inteiro** (só o líder enfileira; grupo ≤ tamanho do time; todos online e com nível) |
| Pareamento | a entrada mais antiga é a semente; completa os dois times com grupos compatíveis em **rating** (±50 → ±400) e **poder** (±15% → ±50%), janelas abrindo linearmente em 40 s |
| Bots | depois de **20 s** na fila, as vagas vazias (nos dois times) são preenchidas com bots de classes distintas e **poder ≈ média dos humanos** (±5%); bots **não** recebem recompensa |
| Grupos | até 4; convidar por nome (expira em 60 s); aceitar/recusar; sair; expulsar (líder); líder passa ao próximo; grupo de 1 se desfaz; mudar o grupo com a fila ativa a cancela |
| Abandono | cair da conexão reserva a vaga por **30 s** (retoma pelo token, na mesma sala e grupo); passado o prazo um **bot assume** o personagem e quem saiu **conta como derrota** (mesmo que seu time vença). Sair **antes da largada** cancela a partida sem punir ninguém |
| Recompensas | por modo: rating **separado** (1×1 usa `arena.rating`; 2×2/4×4 em `arena.ratings`), ouro e XP como no cliente (×1,2 / ×1,6 em 2×2 / 4×4), gravadas numa transação **idempotente** (`match:<matchId>:<personagem>`); o rating do adversário é a média do time oposto **antes** do pagamento |
| Isolamento | cada sala tem seu `World`; o snapshot só vai aos humanos da própria sala; entrada de um jogador só mexe no ator dele |

## Medições (esta máquina; não são promessas)
- **Snapshot 4×4 (8 atores): ≈ 2,3 KB em JSON** ⇒ ≈ **45 KB/s por jogador a 20 Hz** — **acima do alvo inicial (< 20 KB/s)**. Caminhos de redução (P9): enviar `cds` só ao dono, quantizar/encurtar chaves, delta entre snapshots, formato binário.
- **CPU** (`npm run bench:net`, bots, sem rede): 1 sala 4×4 ≈ 0,15 ms/tick; 10 salas (80 atores) ≈ 0,9 ms/tick (≈ 5% de um núcleo); 40 salas (320 atores) ≈ 1,6 ms/tick (≈ 10%). **Picos** de p99 ≈ 9–12 ms e máximos de 25–36 ms ocorrem (coleta de lixo/aquecimento do JIT) e passam do tick de 16,7 ms: precisam de investigação em P9. Medição de 20 s, uma máquina de desenvolvimento, sem rede, sem banco.
- Banda e CPU **não** foram medidas com jogadores reais nem com rede real.

## Limites conhecidos
- Sala **única por partida**, sem persistência de sala; se o processo reiniciar, as partidas em curso se perdem (as recompensas já pagas ficam).
- O **cliente do jogo real não está ligado** a este servidor: só o laboratório `labs/net-poc` usa lobby/salas (arena multiplayer no jogo real = P7).
- Sem chat, sem lista de amigos, sem guildas, sem reconexão automática de **grupo** depois que o prazo vence.
- Matchmaking em memória de um processo (sem fila distribuída).
