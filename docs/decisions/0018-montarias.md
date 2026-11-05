# 0018 — Montarias (lobo, cavalo, grifo)
Data: 2026-11-05 · Status: **parte de sistema implementada e testada em Node** (`tests/mounts.test.js`); **arte (render) feita por outro agente, não integrada/validada aqui**; **nada validado em aparelho real (iPhone/Android)**. Decisão do proprietário: implementar o desenho aprovado de `docs/roadmap/montaria.md`. (O número 0017 já é a Cripta dos Ecos.)

## O que ficou decidido
- **Regra:** +50% de velocidade (`MOUNT_MUL = 1.5`), substitui o correr; só fora de combate (3 s) e em `RUN_ZONES`; nunca em arena PvP, Ondas ou Cripta. Desmonta ao atacar, usar habilidade, tomar/causar dano, cair, ser atordoado, interagir (NPC/baú/placa) e ao sair da zona permitida. Montado, tocar em ataque/habilidade só desmonta, sem ação.
- **Posse no documento do personagem (campos aditivos, `SAVE_VERSION` continua 3):** `mounts` (lista), `mount` (ativa), `whistles` (Apitos), `pity.whistle` (só aparece quando > 0). `validate` mescla a lista salva com as montarias derivadas de missão e conquista (`core/mounts.js` `ownedMounts`); save antigo migra para vazio.
- **Como obter (sem compra por ouro):** missão `matilha_da_estrada` (Guarda Ren, nível 12) dá o Lobo Cinzento; Apito de Montaria (contador, não item de mochila) cai de chefes (5% + 2,5% por chefe sem Apito, garantido em 38), de baús (1,2% × tier) e do chefe da Cripta e concede Corcel ou Grifo ainda não possuído; conquista Veterano (nível 20) dá o Grifo.
- **Servidor autoritativo:** intenção aditiva `mount: true|false` em `input` (entregue uma vez só, como `cast`); `World.applyIntent`/`stepMount` decide. Transações `mount_use_whistle` (sorteio e débito no servidor) e `mount_set`. Snapshot: bit `F.MOUNTED = 32` no campo de flags e 9º elemento da tupla com o código da montaria (índice + 1 em `MOUNT_IDS`; ordem é protocolo); cliente antigo ignora. `server/plausible.js`: no modo estrito, aumentar `whistles` ou `mounts` fora de missão/conquista é recusado; no modo comum é desfeito; importar save zera.
- **Contrato com a arte:** o ator tem `a.mounted` (bool) e `a.mountId` ('wolf' | 'horse' | 'gryphon'), inclusive os outros jogadores (vindos do snapshot). Evento de simulação `dismount` (sem consumo obrigatório).

## Limites e pendências
- Ícone do Apito e o botão de montar usam emoji provisório; arte pendente em `docs/roadmap/depende-do-dono.md` (A11).
- Online, a recusa de montar (combate/zona) não gera aviso: o cliente só vê que `mounted` não virou verdadeiro (o relógio de combate do ator local não vem do servidor).
- Não medido: custo de rede do bit extra (esperado desprezível), comportamento em tela de 90/120 Hz do pedido de montar (usa o mesmo desenho do `cast`, mas sem teste e2e).
