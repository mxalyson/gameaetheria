# 0011 — Multiplayer no jogo real e cooperativo no servidor (P7)
Data: 2026-10-31 · Status: **implementado e testado localmente** (servidor + jogo real em navegadores). Não publicado. Visual: **o atual do jogo** (decisão de manter por fases; ver 0007) — a arena online usa o mesmo renderer, os mesmos heróis (originais ou, com `?visual=miniatura`, os miniatura) e os mesmos monstros.

## O que existe agora
| Parte | Onde | Resumo |
|---|---|---|
| Cliente de rede | `public/src/net/client.js` | uma conexão WebSocket por personagem; envia **só intenções**; reconecta com token |
| Modo `net` do jogo | `public/src/main.js` (`enterNetMatch`, `netStep`, `updateNet`, `netEvent`) | monta um `World` **só de desenho**, preenchido pelos snapshots; interpola 100 ms no passado; prediz só o movimento do próprio jogador; efeitos (texto de dano, golpe, anéis, partículas, aviso de chefe) nascem de **eventos confirmados** |
| Interface | painéis **Arena** (seção "Jogadores reais") e **Grupo** (tecla G) | fila 1×1/2×2/4×4 e cooperativo; convidar por nome, aceitar/recusar, expulsar, sair; faixa de placar/onda |
| Sala cooperativa | `server/coop.js` | **PvE autoritativo**: 5 ondas (chefe na 5ª) com a mesma simulação; 1–4 jogadores; mais jogadores = mais monstros e mais vida; quem cai volta na onda seguinte com 50%; XP, ouro e **loot** decididos pelo servidor |
| Recompensa coop | `core/rewards.js: applyCoopResult` | ouro de ondas, XP repartido (+15% por jogador extra), itens do chefe com **ids do servidor**; inventário cheio → ouro; poções; transação idempotente `coop:<partida>:<personagem>` |
| Fila cooperativa | `server/hub.js` | agrupa nível parecido (±8); começa com 4 jogadores ou após 6 s |
| Marcador de time | `render/renderer.js` (`drawBars`) | losango azul = aliado, quadrado vermelho = adversário (**não depende só da cor**), nome e nível acima da barra |
| Eventos novos | `game/sim.js`, `game/ai.js`, `server/wire.js` | `cast` traz direção e ponto-alvo; `telegraph` do chefe vira evento (o cliente desenha o aviso de perigo) |

## Regras de segurança desta etapa
- O navegador **nunca** informa dano, posição final, vida, XP, ouro ou loot. Mensagens como `damage` são recusadas (teste e2e no jogo real).
- Durante uma partida a gravação na nuvem do cliente fica **pausada**; antes de entrar na fila o cliente grava o que tem, e ao sair **adota o personagem oficial** do servidor (com as recompensas). Isso evita que um `PUT` antigo sobrescreva a recompensa.
- Quem abandona uma partida cooperativa **não recebe nada e não é punido**; no PvP continua valendo a regra de abandono da decisão 0010.

## Limites conhecidos
1. **Projéteis são só desenho no cliente** (o servidor simula o dano, mas não os envia): o tiro visual pode não coincidir com o tiro real; o dano mostrado é sempre o do servidor.
2. **Balanceamento do cooperativo não foi feito**: no teste, 1 mago nível 12 recebeu ≈ +2 100 XP e ≈ +435 de ouro numa vitória (valores vindos de `mobXp` e da fórmula de ondas do cliente) — **provavelmente generoso demais**; precisa de passagem de balanceamento (P8).
3. O cooperativo usa a **Arena das Ondas** (cenário repetido); as zonas de exploração (Bosque etc.) **não** têm servidor: o PvE de exploração continua sendo calculado no cliente com limites de plausibilidade (decisão 0009).
4. Sem chat, amigos persistentes, guildas; sem reconexão de **grupo** após o prazo; sem tela de "revanche".
5. Testado só com **bots de teste e navegadores locais**; nada de rede real, latência ou carga.
