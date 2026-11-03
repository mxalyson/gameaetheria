# Pendências (revisão de 2026-11-03)
Lista viva e curta. Histórico completo (98 itens abertos antes desta revisão): `pendencias-historico.md`. O que só o dono resolve: `depende-do-dono.md`. Status segue a regra do CLAUDE.md; "feito" abaixo só com evidência achada no repositório (nesta revisão não rodei testes: a evidência é leitura de código/commits).

## Abertas — posso fazer (ordem de prioridade)
1. **Migrar os ganhos locais restantes para transações do servidor e ligar `STRICT_PVE` por padrão** (libertar/comprar/evoluir spirit, reciclar, exploração de contingência; depois equipamento/atributos na instância, checagem de proximidade a NPC; objetivos `visit`, `teleport`, `lore`, `spiritStage` ainda somados pelo cliente). Hoje desligado: `server/plausible.js`, `server/start.js`. Decisão 0015.
2. **Texto desatualizado nas Opções**: `ui/ui.js:790` ainda cita "Sempre dia", opção removida em 2026-11-03.
3. **Qualidade automática em tempo de execução**: `prefs.quality: 'auto'` só usa `deviceTier()` (prefs.js); falta rebaixar sozinho quando o FPS cair e garantir que o canvas nunca leia pixels.
4. **Spirit/Maestria no servidor de zona**: `p.actor.mastery` só atualiza no próximo lote (`syncLevel`); entregar a missão com o jogador na zona atrasa a s3 (server/zone.js).
5. **Itens de Ópalo**: ícone do tipo comum; destaque de cor do nome na mochila (código/CSS; arte opalescente própria é do dono).
6. **Aviso de noite no HUD** (ícone/lua) e capturas do dia/noite.
7. **E2E**: `online-match.spec.js` "grupo no jogo real" (4 janelas) travando nesta máquina desde 2026-11-01 (causa não identificada; investigar); e2e da barra com 4 botões (Maestria) e do botão `sk3` não rodados; e2e do diálogo do Doran offline; estabilizar testes oscilantes sob carga (`iso-poc.spec.js`, `mobile` "botões", "painéis cabem").
8. **Missão `porto_duelo` online** (hoje só offline, `OFFLINE_TYPES`) e teletransporte online para o Porto.
9. **Servidor**: `server/zone.js` e `coop.js` já passam `pity`/`bossState` na zona, mas confirmar o repasse de `boss_warn`/`phase` em `server/wire.js`; `summoned` (esbirros de chefe) não é checado no XP do servidor de zona; risco de reverter progresso de aba suspensa pelos limites `levelJump`/`xpFreeLevels` (gravação a cada 8 s limita).
10. **Exports sem uso** (`tools/dead-code.mjs`): `ACHIEVEMENT_IDS`, `QUEST_IDS`, `BOSS_MOBS`, `ARMOR_TYPES`.
11. **Imagens do HTML e carga**: conferir cobertura do `?v=` (`tools/bump-assets.mjs`) e `GROUND_V` junto com `VERSION` do `sw.js`.
12. **Balanceamento a refinar** (dados em `data/`): Guerreiro/Arqueiro Nv30 duram 17–18 s (meta 20–40 s); Clérigo Nv20 em 45%; ciclos Mago×Clérigo 89% e Mago×Arqueiro 14% (provável IA de kiting em `game/ai.js`). Calibração real de XP/farm e do Ferreiro (≈ 600 abates por peça) precisa de jogadores.
13. **Técnico opcional**: picos de GC no servidor (`--cpu-prof`), snapshots binários/compressão, economia co-op de fim de jogo (ralos além do nível 20), efeito/evento de **esquiva** (exige evento novo na simulação: decisão de design), efeitos de impacto/status (lentidão, queimadura, cura em aliados; só `stunT` tem desenho), B16 (botão de voltar à vila por toque na instância online: o nó da Vila no mapa existe; conferir se basta), `main.js`/minimapa já ok.
14. **Documentação**: conferir `auditoria-bugs.md`/`auditoria-jogabilidade.md` (linha de B15/B19–B30 e G11–G13 foi resumida); `STRICT_PVE`/`zone.js` notas; créditos de licença das folhas de ícones em `CREDITOS.md` (texto; a confirmação é do dono).

## Abertas — dependem do dono (detalhe e prompts: `depende-do-dono.md`)
- Servidor público HTTPS/WSS + domínio; Google Client ID; conta Google Play + aparelho Android (TWA/Capacitor); decidir quando enviar ao GitHub.
- Medir em celular real (FPS, RAM, toque, aquecimento, celular médio/fraco, efeitos, chão/cenário/dia e noite, HUD compacto no iPhone 874×402); conferir o rótulo "Toque para conversar" no iPhone; `docs/roadmap/teste-android.md`.
- Rede real (2 aparelhos, TLS), teste de invasão, CAPTCHA/anti-abuso, alertas, agregação de logs, agendamento de backup e restauração em máquina limpa, PostgreSQL/escala (dependência nova), Docker e SIGTERM no Linux (sem ferramenta aqui).
- Arte nova: Místico (5º herói); ícones próprios das 4 habilidades de Maestria e do ataque básico fiel; baú aberto; adornos do Cume Gélido; ponte/poço/cercas 3D; brasa/vulcão e árvore verde para ícones de zona; cadeado/troféu; NPCs do Porto; retrato do Cavaleiro Rubro; ícones de itens/spirits restantes (poção de mana, essência, chave, pergaminho, minério, spirits, retratos de monstros); ovo na loja do sábio; margem de lago e água animada (decisão de usar `chao-shore.jpg`); textura da Vila; ícones de zona em 128 px.
- Decisões/aprovações: pilares e assinatura visual (`identidade-visual-v1.md`), estilo do cenário Quaternius/Meshy (harmonia 3D realista × cartoon), esqueleto para lobos/cavaleiros/gárgula, comparar efeitos do laboratório isométrico (o dono disse que era resolução; fechar se o iPhone está nítido), envio de B2–B5 (aplicar HUD pintado completo), licença das imagens de IA e da folha com marca d'água, origem das folhas de ícones.

## Fechadas desde a última revisão (evidência)
- Prova de conceito Canvas 2D × PixiJS: decidida; ver Descartadas.
- B1–B4, B5–B7, B10, B11, B13, B14, B17, B18, B15, B19–B30 (parte): linhas "Depois das correções P0/P1/rodada final" do histórico; commits `89aabdd`, `0c696c6`, `f5f6b38`; `frame()` com `guard()` e reconexão (`main.js`).
- B8: `flushAll()` chamado em `server/ops.js:90` e `server/hub.js:457/468`. B9: `try/catch` por sala em `server/hub.js:457` (`this.fail`). B12: nenhum `'${COIN}'` literal em `ui.js`.
- Pico de entrada no Bosque e 1º bloco do terreno: blocos por `bounds` (commit `89aabdd`, `render/ground-tiles.js`).
- Rótulos (medalhão, Ren, etiqueta do chefe), epílogo da Yun 667×375, placa de lore, teste de `stackLabels`, S17 (placas de lore), pulso no Ren: commit `2668b9a`.
- Mob desconhecido do servidor ignorado; evento `teleport` online; imagens com `?v=`: `tools/bump-assets.mjs`, `tests/assets-version.test.js`.
- Emojis do ui.js (⚡ 🌊 🌐 🔥): trocados por `sign()` com imagens pintadas, emoji só de reserva (`ui.js:80-82`).
- Ritual do chefe no HUD online (`rt`), "Ritual N/40", duelo amistoso no servidor (`queue.friendly`): commit `2668b9a`/`f5f6b38`; teste e2e do ritual e do duelo.
- `dificuldade.md` atualizada; duelos 45–55% na maioria; Clérigo/rampa inicial: commit `89aabdd`.
- Rios no minimapa: `renderer.js:211`. Entrada padrão da zona de farm: `FARM_ENTRY` em `data/zones.js` / `main.js:1003`.
- Escolha de classe lista a Maestria (`ui.js:226`); barra com 4ª habilidade `s3` (`ui.js:268`); ícones de ataque básico das 4 classes (`public/assets/icons/attack/atk-*.webp`).
- Painéis com alvos de toque maiores (V1/V2, commits `0c696c6`/`bf1ea8f`); ícones da barra de habilidades e rodada de balanceamento/progressão (`economia.md`, `dificuldade.md`).
- Retrato do chefe na barra, Ferreiro Brok como NPC, retrato do Ferreiro (`public/assets/portraits/npc-smith.webp`, commit `89aabdd`).
- Rubro tint, baú saqueado e demais visuais V5–V30 sem dependência de arte: histórico, rodada P1.

## Descartadas / obsoletas
- Prova de conceito **Canvas 2D × PixiJS**: já decidida; Canvas 2D mantido (`docs/decisions/0001-manter-canvas-2d.md`, `0005`, `docs/roadmap/iso-poc-report.md`, `isometric-migration.md`); o dono confirmou que foi realizada.
- Lobos nível 4 juntos matam o iniciante: decisão do dono "sim, é perigo" (2026-11-02); balanço mantido, aviso da Ren na missão `caca_aos_lobos`.
- Opção "sempre dia": removida (dia e noite sempre ligados, 2026-11-03).
- Itens de painéis "Ainda emoji/provisório" de B5 parte 2: absorvidos por arte nova do dono (acima).
- Teste e2e `online-match` "grupo no jogo real": registrado como não-regressão; segue na lista "posso fazer" apenas para investigar a causa.
