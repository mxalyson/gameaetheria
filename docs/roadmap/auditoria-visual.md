# Auditoria visual (2026-11-02)

Método: Playwright, celular em paisagem 844×390, deviceScaleFactor 2, toque, `/?api=` (offline), `window.game` para teleportar, subir de nível, abrir painéis e gerar itens (incl. `generateOpalItem`). Heróis testados: Mago, Guerreiro, Clérigo. Capturas em `docs/art-direction/auditoria/` (171 arquivos, 193 MB: NÃO versionar; ver V22). Specs temporários apagados. Nenhum código do jogo foi alterado.

Status: **validado por inspeção visual** (olhei as capturas). Desempenho: **medido** em Chromium por CPU (pessimista; não vale para celular real).

## Resumo
1. Nenhum erro de console/pageerror nos 3 percursos (só aviso do Service Worker bloqueado pelo Playwright).
2. A identidade geral está coerente: HUD pintado (madeira/metal), títulos em Cinzel, ícones de habilidade pintados, mapas novos com rio, ponte, lagoas, acampamento e baú pintados.
3. Os problemas mais graves estão nos painéis: o painel de Personagem corta os botões +5/Máx (só +1 aparece), o painel de Spirits/Diário espreme texto em colunas estreitas.
4. Os botões do menu superior têm 36×36 px (< 44 px), contra a decisão mobile-first.
5. A barra de chefe/alvo sobrepõe o retrato à barra de XP do jogador, e o retrato aparece escuro/cortado (e o Cavaleiro Rubro usa o retrato do Guardião das Ruínas).
6. Dicas ainda citam teclas ("[E] ABRIR BAÚ", "[E] CONVERSAR") apesar da decisão 0016.
7. O rio de Brasas/Ruínas é uma faixa lilás translúcida, fora da paleta (deveria ser lava).
8. Monstros/chefes 3D fotografados (Colosso, Cavaleiro Rubro, Ancião Gélido, ponte) aparecem borrados e tingidos de cor chapada ao lado da UI nítida.
9. Desempenho: média 1–3 ms por draw; picos isolados de 100–270 ms na primeira entrada em cada mapa (carga de textura) e média 9 ms com o Colosso na Planície.
10. Item opalino não tem aparência própria no inventário (moldura/ícone iguais aos épicos comuns).

## Achados

| id | local | descrição | gravidade | captura | correção sugerida |
|---|---|---|---|---|---|
| V1 | Painel Personagem, Atributos | Linhas de atributo estouram a largura: só o botão "+1" aparece, "+5" e "Máx" ficam cortados/inalcançáveis; o valor "44.4" encosta no botão | alta | 61-personagem-atributos.png | Quebrar a linha em 2 (nome/valor em cima, botões +1/+5/Máx embaixo) ou usar `flex-wrap` com botões ≥ 44 px |
| V2 | Menu superior (6 botões toggle) e botão tela cheia | Alvos de 36×36 px, abaixo de 44 px | alta | 05-hud-forest-nivel10.png (medido via DOM) | Subir os medalhões para 44–48 px (ou aumentar a área de toque com padding invisível) |
| V3 | Barra de alvo/chefe | O retrato circular (≈ 44 px) invade a ponta da barra de XP e o frasco; a barra vermelha corre por baixo do HUD do jogador | alta | 27-forest-chefe-luta.png, 26-forest-chefe-chegada.png | Reposicionar a barra de chefe abaixo do HUD (x ≥ 450) ou centralizada sem encostar no bloco do jogador |
| V4 | Retrato do chefe/alvo | Retrato quase todo preto, mostrando só um pedaço inferior do desenho (Carvalho, Colosso, Elite Lobo); Cavaleiro Rubro (Brasas) usa o mesmo retrato do Guardião das Ruínas | alta | 27-forest-chefe-luta.png, 27-ember-chefe-luta.png, 27-ruins-chefe-luta.png | Recortar o retrato pelo rosto/centro do sprite e criar entrada própria do Cavaleiro Rubro |
| V5 | Dica de interação | Textos "[E] ABRIR BAÚ" e "[E] CONVERSAR" citam tecla em modo toque (decisão 0016) | média | 44-forest-bau-fechado.png, 41-vila-smith.png | Trocar por "Abrir baú"/"Conversar" sem tecla quando o modo for toque |
| V6 | Botão de interação (toque) | Disco amarelo chapado com balão branco, sem moldura ornamentada; destoa dos outros botões pintados | média | 41-vila-smith.png | Pintar o botão no mesmo estilo dos medalhões (moldura de metal + ícone) |
| V7 | Painéis Spirits (com Evoluir) | Texto do spirit espremido em coluna de 1 palavra por linha ("Água · / Cura · Nv / 10 ·"), descrição cortada atrás do botão "Evoluir" ("periodicame…") | alta | 63-spirits-evoluir.png | Deixar os botões embaixo do bloco (largura total) e dar `min-width` ao texto |
| V8 | Painel Diário (missão ativa) | Card de missão com texto em coluna estreita ao lado de "Abandonar", causa quebra em 1 palavra/linha e corte | média | 64-diario-missao.png | Empilhar: texto largo e botão "Abandonar" na linha abaixo |
| V9 | Todos os painéis | Painéis ocupam só ≈ 340 px dos 844 px de largura e rolam muito (altura 390); Personagem/Mapa/Opções mostram menos de 40% do conteúdo | média | 10-painel-character.png, 10-painel-map.png | Em paisagem, usar layout em 2 colunas e painel mais largo (≈ 70% da tela) |
| V10 | Toast de zona vs painéis | O toast "Vila de Lúmen · Zona segura" fica por cima do título do painel ("PERSO…", "INVEN…") se abrir o painel logo após entrar | média | 10-painel-character.png, 10-painel-inventory.png | Ocultar/encurtar o toast ao abrir um painel ou subir o painel (z-index acima do toast) |
| V11 | Toast de zona vs barra de chefe | O toast em fade se sobrepõe ao nome do chefe ("Bosque Verdejante" por trás de "Elite: Lobo Cinzento"), texto sobreposto | baixa | 30-vfx-warrior-s0.png, 49-ember-ritual-fim-1.png | Esconder toast de zona quando a barra de alvo estiver visível |
| V12 | Loja: aba Ferreiro | Ao tocar no Ferreiro Brok abre-se a loja com título "Mercadora Lia" (a seção do Ferreiro só é rolada) | média | 10-painel-shop_smith.png | Trocar o título do painel para "Ferreiro Brok" quando o alvo for `shop:smith`, ou separar o painel |
| V13 | Mapa de Brasas e Ruínas | O "rio" aparece como faixa lilás translúcida em cima do piso marrom/cinza, fora da paleta e sem leitura de lava/água; parece um retângulo translúcido antigo | alta | 21-ember-ponto2.png, 28-ember-ritual-23-40.png, 22-ruins-minichefe.png | Pintar o rio de Brasas com lava (laranja emissiva) e o das Ruínas com água escura, com margem opaca |
| V14 | Planície | Rio em pastel lavanda com borda clara semitransparente, parece outro estilo do rio do Bosque (azul vivo) | baixa | 25-plains-mob-ataca-0.png | Igualar saturação do rio ao do Bosque ou dar tom próprio coerente com a paleta da zona |
| V15 | Ponte (Bosque e Gelo) | Ponte 3D aparece borrada (textura ampliada) e com elipse de sombra escura chapada; contrasta com o chão nítido | média | 21-forest-ponto1.png, 27-glacier-chefe-luta.png | Renderizar a ponte em resolução maior ou refazê-la pintada e suavizar a sombra |
| V16 | Chefes 3D (Colosso, Cavaleiro Rubro, Ancião Gélido, Carvalho) | Aparecem borrados e com tingimento de cor chapada (roxo, laranja, azul); parecem silhuetas, enquanto heróis e NPCs são nítidos | média | 27-plains-chefe-luta.png, 27-ember-chefe-luta.png, 27-glacier-chefe-luta.png | Aumentar resolução do atlas dos chefes e trocar o tingimento por paleta pintada |
| V17 | Telégrafo de ataque do chefe | Círculo vermelho de contorno fino + preenchimento translúcido (estilo de código antigo, sem textura pintada) | média | 27-forest-chefe-luta.png, 27-ruins-chefe-luta.png | Pintar o telégrafo com runas/gradiente no estilo do resto dos efeitos |
| V18 | Ritual (Brasas) | Ao final do ritual aparecem faixas laranja/amarelas diagonais no canto inferior esquerdo da tela (aparência de erro de gradiente); pílula "Ritual N/40" é escura e simples frente ao HUD ornamentado | média | 49-ember-ritual-fim-1.png, 49-ember-ritual-fim-3.png | Verificar o efeito de raios do `omen` (clip/limites) e dar moldura de metal à pílula do ritual |
| V19 | Habilidades em Brasas | Os 3 botões de habilidade aparecem acinzentados com um X vermelho em alguns quadros de Brasas (estado não explicado na tela) | baixa | 21-ember-ponto2.png | Confirmar o que causa o estado (silêncio/sem alvo?) e mostrar uma legenda ou ícone coerente |
| V20 | Baú saqueado | O baú "saqueado" é o mesmo sprite do baú fechado; só o rótulo muda ("VAZIO POR ENQUANTO") | média | 46-forest-bau-saqueado.png vs 44-forest-bau-fechado.png | Desenhar uma variante aberta/vazia (tampa levantada ou escurecida) |
| V21 | Etiquetas de mobs nos cantos | Nomes de mobs distantes ficam cortados/atrás de HUD e botões ("GOLEM ANCES…", "ESPECTRO"); etiquetas sobrepostas entre si em grupos ("Nv 52 ELITE LOBO CINZENTO") | média | 25-plains-mob-ataca-2.png, 47-forest-acampamento.png, 21-ember-ponto2.png | Esconder etiquetas sob a área do HUD e agrupar/afastar etiquetas muito próximas |
| V22 | Pasta de capturas | 171 PNGs somam 193 MB; não devem ir ao Git | média | docs/art-direction/auditoria/ | Adicionar a pasta ao `.gitignore` ou reduzir para poucas capturas-chave |
| V23 | Vila, rótulo de portal | O rótulo "Bosque Verdejante · Nv 1-6" é cortado pela borda direita; o portal fica atrás dos botões de habilidade | baixa | 06-vila-spawn.png, 08-vila-portal-0-forest.png | Centralizar o rótulo no portal com limite de tela e afastar o portal dos botões |
| V24 | Item opalino | O item opalino usa o ícone e a moldura roxa de um épico comum; só o nome ("Cajado Opalino") e o tooltip o distinguem | média | 10-painel-inventory.png, 11-tooltip-item-10.png | Dar moldura/brilho opalino próprio (arco-íris leve) em `itemCell` quando `it.opal` |
| V25 | Tooltip de item | Nome do item em Nunito (corpo) e não em Cinzel; ponto solto "· vale" antes do preço; cobre o botão de fechar do painel | baixa | 11-tooltip-item-10.png, 11-tooltip-item-4.png | Usar Cinzel no nome, remover o "·" inicial e posicionar o tooltip sem cobrir o X |
| V26 | Nunito nos painéis | Nomes de classe, de spirit e de missão ("Guerreiro", "Ondina", "Primeiros Passos") em Nunito bold entre títulos Cinzel | baixa | 63-spirits-evoluir.png, 64-diario-missao.png, 61-personagem-atributos.png | Padronizar subtítulos de cartão em Cinzel |
| V27 | Inventário | O nível do item (número) se sobrepõe ao canto inferior do ícone, ilegível sobre armas claras | baixa | 10-painel-inventory.png | Colocar o nível em uma plaquinha escura no canto |
| V28 | Mobs e legibilidade | Mobs comuns ficam com ≈ 25–35 px de altura em CSS (pequenos para toque/mira) e quase não se distinguem do chão na Planície/Gelo | baixa | 25-plains-mob-ataca-0.png, 21-glacier-ponto2.png | Aumentar escala dos mobs comuns ~15% e acrescentar contorno/sombra |
| V29 | Gelo: cenário | Chão do mapa quase vazio e de baixo contraste (manchas cinza espalhadas) em grandes áreas | baixa | 21-glacier-ponto2.png | Acrescentar variação de gelo/neve (rachaduras, montes) e props maiores |
| V30 | Pop-in e carga | Picos de 100–270 ms no primeiro quadro após entrar em cada mapa (carga de textura) e pico de 105 ms no spawn do Colosso | média | _log.json (perf) | Pré-carregar atlas do mapa e do chefe durante o toast/portal |

## Desempenho (draw, ms por quadro; CPU, pessimista)

| situação | quadros | média | p95 | máx | > 16 ms |
|---|---|---|---|---|---|
| Bosque, passeando | 697 | 2,50 | 2,1 | 269,7 | 6 |
| Bosque, perto de mob | 153 | 1,32 | 1,9 | 4,0 | 0 |
| Bosque, chefe | 213 | 2,78 | 2,0 | 217,0 | 2 |
| Planície, passeando | 673 | 2,88 | 2,2 | 221,8 | 6 |
| Planície, perto de mob | 200 | 1,49 | 3,0 | 17,2 | 1 |
| Planície, chefe (Colosso) | 184 | 9,01 | 12,0 | 105,2 | 2 |
| Ruínas, passeando | 670 | 1,85 | 1,9 | 134,3 | 5 |
| Ruínas, perto de mob | 153 | 1,06 | 1,8 | 5,3 | 0 |
| Ruínas, chefe | 226 | 1,03 | 1,8 | 3,2 | 0 |
| Gelo, passeando | 712 | 1,87 | 1,8 | 108,2 | 7 |
| Gelo, perto de mob | 147 | 1,25 | 2,1 | 10,0 | 0 |
| Gelo, chefe | 230 | 1,83 | 7,1 | 84,1 | 2 |
| Brasas, passeando | 576 | 1,96 | 2,0 | 111,8 | 5 |
| Brasas, perto de mob | 136 | 1,68 | 2,2 | 64,4 | 1 |
| Brasas, chefe | 194 | 1,05 | 1,6 | 3,5 | 0 |

Os picos > 16 ms coincidem com a entrada no mapa (carga) e com o spawn do chefe; o Colosso na Planície custa em média 9 ms (acima dos outros chefes, ≤ 3 ms exceto Gelo p95 7 ms). Medição sem GPU: confirmar em aparelho real.

## O que está BOM
- Título e criação de classe: Cinzel dourado, botões de madeira/metal, cartões de classe com retrato, ícones pintados das habilidades e níveis de liberação (Nv 1/5/10); sem emoji nesses lugares.
- HUD completo: retrato, frascos de HP/XP, medalhões, mini-mapa circular, botão de ataque e habilidades pintados; cadeado "Nv 5/Nv 10" legível e habilidades liberam corretamente aos níveis 5 e 10.
- Vila: NPCs pintados com nome em Cinzel e marcador "!", poço, cercas, bancos, lampiões, chão de grama; Ferreiro Brok presente.
- Mapas novos: lagoas com vitórias-régias, rio, ponte, árvores, troncos, acampamento com baú e cercas, mini-chefe com barra própria, baús pintados com brilho de interação.
- Painéis de Loja e Arena/Sábia: moldura, retratos dos NPCs, botões de preço em madeira/ouro; Pergaminho de teletransporte e seção do Ferreiro aparecem.
- Tooltip de item com comparação, cor por raridade e item opalino com nome e bônus corretos.
- Efeitos de habilidade (anel do Guerreiro, escudo do Clérigo, chuva de flechas do Arqueiro) aparecem e são coerentes.
- Nenhum erro de console durante todos os percursos.

## Não coberto
- Janelas de combate real com HP baixo (vinheta), fila online/lobby, e `?visual=original`.
- Modo arena PvP/ondas (não capturado), spirits além de Ondina e evolução concluída.
- Animação dos mobs: as 3 capturas seguidas por mapa existem (`24-*`/`25-*`), mas os mobs são pequenos e eu só olhei 2 mapas; a animação NÃO foi validada (sem diff de pixels).
