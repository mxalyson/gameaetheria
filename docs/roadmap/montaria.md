# Montaria — desenho aprovado e sistema implementado

## Status por parte (2026-11-05, decisão 0018)
| Parte | Estado |
|---|---|
| Dados (`data/mounts.js`), regras (`core/mounts.js`) | **implementado e testado** (Node) |
| Simulação: velocidade 1,5× (não soma com o correr), desmontar em combate/ataque/skill/dano/queda/atordoamento/zona | **implementado e testado** |
| Documento (`mounts`, `mount`, `whistles`), migração, plausibilidade, importação | **implementado e testado** |
| Servidor: intenção `mount`, transações `mount_use_whistle`/`mount_set`, snapshot (bit + código), Apito no lote da zona e da Cripta | **implementado e testado** (unidade/protocolo; sem teste de ponta a ponta com WebSocket real) |
| Missão `matilha_da_estrada` (Lobo), conquista Veterano (Grifo), Apito (chefes, baús, Cripta) | **implementado e testado** |
| UI de toque: botão Montar/Desmontar, toque duplo no herói, "Montar automático", painel Personagem, auto-viagem | **implementado**; lógica pura testada; **não testado no navegador/e2e nem em aparelho real** |
| Arte das montarias e do herói montado | **fora deste trabalho** (outro agente, `render/`); contrato: `a.mounted`, `a.mountId` |
| Ícone do Apito e do botão | **provisório (emoji/ícone reaproveitado)**: pendência A11 |
| Validado no iPhone/Android | **pendente** |

Texto de desenho original abaixo (mantido como referência).

O correr (+30%, sem botão) já existe (`docs/gameplay/sistemas.md`); a montaria é o degrau seguinte de mobilidade.

## Como obter
- **Missão de cadeia** na Vila (NPC estábulo/guarda de rota) no nível 12 que entrega a primeira montaria (lobo cinzento); as demais por **item** (Apito de Montaria, raridade rara/épica) vindo de chefes, Cripta e baús, e uma por conquista. Montarias são do **personagem** (lista no documento v3, campo aditivo `mounts: []` e `mount: id|null`).
- Sem loja de ouro para a mais rápida (evita compra direta de vantagem).

## Como usar (toque, sem tecla)
- Botão **"Montar"** no menu (e/ou toque duplo no próprio herói). Opção "montar automático": ao andar fora de combate por 1,5 s o herói monta sozinho (desligável nas opções).
- **+50% de velocidade** (substitui o correr, não soma), **somente fora de combate** e fora de PvP.
- **Desmonta** ao atacar, usar habilidade, tomar dano, entrar em combate (3 s, igual ao correr), entrar em instância (Cripta/arena/ondas) ou ao interagir com NPC/baú. Montado: sem habilidades, só o botão de desmontar e o de interagir.
- Nunca em arena PvP, Ondas ou Cripta (equilíbrio), como o correr.

## Servidor autoritativo
- Cliente envia intenção aditiva `mount: true/false` (como `run`); o servidor confere posse (`mounts` do documento), zona permitida (`RUN_ZONES`) e `lastCombat >= 3 s`, e só então seta `actor.mounted`. Velocidade: `RUN_MUL` vira `MOUNT_MUL = 1.5` em `World.applyIntent`; o snapshot ganha um bit `mounted` (protocolo aditivo, v4 compatível) para os outros jogadores desenharem. Teste node: velocidade, desmontar em combate/instância, posse inválida recusada.
- Limite de velocidade percebida: `moveSpeed * speedMul * 1.5` é o teto que qualquer plausibilidade futura deve usar.

## Arte necessária (custo de textura)
- Um **atlas animado por montaria** com o herói montado em **8 direções**, cada direção com ciclo de galope de 6 quadros (+ 1 parado): 8 × 7 = 56 quadros por montaria. Herói montado difere por classe (4 classes + especializações vestem a mesma silhueta; usar herói em camada separada sobre a montaria: atlas da montaria sem cavaleiro + o sprite do herói sentado reaproveitado, evitando 4× arte).
- Orçamento: quadro de 192×192 px a 512 px de lado de célula equivale a ~0,14 MiB descodificado cada (192·192·4); 56 quadros ≈ **8 MiB por montaria** (≈ 2 MiB com atlas a 96 px/células reduzidas e `quality` baixa). Meta: **no máximo 2 montarias carregadas ao mesmo tempo** (a do jogador e a dos vizinhos, carregamento sob demanda como `loadVfxKit`), medido com `npm run texture:budget`.
- Montarias iniciais: **lobo**, **cavalo**, **gryphon** (voo cosmético, sem atravessar paredes).
- Prompts de arte (Meshy/IA) em `docs/roadmap/depende-do-dono.md` (A10).

## Ordem sugerida
1. Dados + protocolo + servidor (sem arte: usa o herói com fumaça de corrida). 2. Missão e item. 3. Arte do lobo (validar o padrão em UM caso) e depois as demais.
