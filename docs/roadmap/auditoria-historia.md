# Auditoria da história e das missões (2026-11-02)
Feita por leitura de código (quests, dialogs, zones, mobs, achievements, ui, main). Nada foi validado em jogo. Gravidade: alta / média / baixa.

## Resumo
1. A espinha existe: "eco" une spirit, arena, coop, conquistas e o arco final.
2. A narrativa só começa no nível 20 (Cume Gélido). Do 1 ao 19 são 11 missões de "mate N" ou "derrote o chefe", sem lore.
3. Furo no arco "Ecos Partidos": Yun fala em 3 guardiões, mas o jogador derrota 5 chefes (o Colosso fica sem papel).
4. Duas promessas sem pagamento: "o Guardião protege algo que não devia existir" e "quero lhe mostrar o que sobrou". O final é só "alcance o nível 30".
5. O Cavaleiro Rubro (ritual de 40 abates) não tem introdução narrativa nem explicação do contador.
6. Lia (mercadora) e Brok (ferreiro) não têm missão. Mel tem 3 missões sem fio condutor.
7. Cada NPC tem uma única fala fixa; não muda com o progresso.
8. Violação da decisão 0016 (mobile-first): texto de missão cita "tecla E"; UI online cita "(H)" e "tecla G".
9. Onboarding fraco: 3 linhas de log; não explica missão, habilidades por nível, spirit/evolução, pergaminho, Ferreiro nem ritual.
10. Conquistas e títulos genéricos, nenhum ligado à história.

## Achados
| ID | Onde | Problema | Grav. | Correção sugerida |
|---|---|---|---|---|
| S1 | quests (`ecos_unidos`, `anciao_gelido`, `cavaleiro_rubro`) | Contagem de guardiões não fecha (3 falados, 5 derrotados) | Alta | Cânone: 3 formas originais (Carvalho, Colosso, Guardião) e 2 reflexos (gelo, brasa). Yun: "Três guardiões e dois reflexos: o gelo e a brasa foram o eco tentando se juntar de novo. Hoje todos repousam." |
| S2 | quests (`guardiao_das_ruinas`, `ecos_unidos`) | Promessas sem pagamento; clímax é só "nível 30" | Alta | Transformar `ecos_unidos` em epílogo curto com cena/título "Voz dos Ecos" ("Aqui jaz o primeiro eco, inteiro de novo… Você é o último capítulo.") |
| S3 | quests nv 1–19 | Nenhuma pista do arco antes do nível 20 | Alta | Uma pista por zona nas falas `done` (Carvalho: "não sou o primeiro"; Colosso: "o núcleo ainda canta"; Guardião: "ele nos esperava") |
| S4 | quests `cavaleiro_rubro`, main (toast), HUD | Ritual sem introdução; contador "Ritual N/40" aparece sem contexto | Alta | Doran: "O Rubro só desperta quando as Cinzas se alimentam de sangue. Derrote quarenta criaturas por lá e o chão vai estremecer." + toast ao entrar em `ember` |
| S5 | quests `coracao_de_cristal` | Herbalista pede para matar um chefe sem motivo | Média | Motivo: o núcleo do Colosso vira pó das poções; ou mover o giver para Ren |
| S6 | quests `rumo_ao_topo` | "Alcance o nível 20" é grind sem história | Média | Trocar por colheita narrativa (uma flor por zona) ou reescrever a fala |
| S7 | dialogs/quests | Lia e Brok sem missão e com 1 fala | Alta | Missões tutoriais: Lia "Pergaminho de Cortesia" (usar 1 teletransporte), Brok "Fogo de Forja" (aprimorar 1 item), Brok "Martelo do Guardião" (nv 18) |
| S8 | quests `ervas_do_bosque`; main (~398, ~428) | Cita teclas (E, H, G) contra a decisão 0016 | Alta | Reescrever sem tecla ("toque no baú"; "botão 🏠"; "botão 👥") |
| S9 | dialogs | Uma fala fixa por NPC | Alta | `greet` vira lista `{when, text}` por chefes mortos / missão concluída / nível; `panel_dialog` precisa aceitar |
| S10 | main (~206–214) | Onboarding só no personagem novo, 3 linhas de log | Alta | Onboarding de 6 passos (abaixo) |
| S11 | quests `primeiro_spirit` | Texto diz comprar essência com a Yun: conferir se a Yun vende | Média | Verificar; se não vende, trocar o texto |
| S12 | quests (`ecos_unidos`, `cume_gelido`) | Textos > ~220 caracteres para celular | Média | Encurtar (propostas no relatório original) |
| S13 | quests `cavaleiro_rubro` done | Tom heroico genérico; Doran "viu de longe" | Baixa | "Ouvi o chão tremer daqui. Um duelo desses vale uma canção na arena." |
| S14 | geral | Mistura acidental de tons (MMO × oráculo) | Baixa | Guia de voz por NPC: Ren seco, Mel afetuosa, Doran teatral, Yun enigmática, Lia esperta, Brok poucas palavras |
| S15 | quests `ruinas_sombrias` | "à noite": não há ciclo dia/noite | Baixa | "Espectros saem das Ruínas e rondam a estrada." |
| S16 | achievements | Nenhuma conquista ligada à história | Média | 6 conquistas narrativas (Primeiro Sussurro, Dono do Gelo, Brasa Adormecida, Viajante, Mão de Ferro, Voz dos Ecos); exigem contadores e testes no servidor |
| S17 | geral | Sem lore coletável | Média | Uma placa/estátua tocável por zona (≤160 caracteres) |
| S18 | quests `rumo_ao_topo`, `ecos_unidos` | Missões "alcance nível X" sem objetivo de jogo (a do final completa na hora no nível 30) | Média | Encadear um segundo objetivo (falar com a Yun no local da cena; ter 1 spirit evoluído) |
| S19 | quests coop/pvp | Só o servidor conta; offline o Doran fica sem missão até o nv 28 | Média | Fala do Doran para o modo offline |
| S20 | ui (~592) | Diário lista 4 NPCs fixos | Baixa | Gerar a lista dos givers de `QUESTS` |

## O que está bom
Conceito de "eco" espalhado; cadeia linear sem missão impossível e níveis coerentes com as zonas; mobs recoloridos reforçam o tema "cópias"; Ancião Gélido = Carvalho congelado e Cavaleiro Rubro = Guardião em brasa são bons ganchos; `done/offer/progress/more` dão feedback; nomes de NPCs e chefes consistentes e acentuados; recompensas escalam bem; mini-chefes com nomes evocativos; o toast "O chão estremece…" é um bom momento.

## Onboarding proposto (6 passos, primeiros 30 min)
1. 0–1 min: pulso no Ren ("toque em 💬"); o portal só depois da primeira missão.
2. 1–4 min: dica no Bosque (atacar, habilidades); habilidades bloqueadas com "Libera no Nv N".
3. 4–8 min: primeiro nível e primeiro baú ("pontos de atributo: abra 🧙"; "equipe o melhor pela 🎒").
4. 8–12 min: `primeiro_spirit` explica spirit e evolução em 2 falas.
5. 12–20 min: missões da Lia (pergaminho) e do Brok (forja).
6. 20–30 min: Ren avisa do Carvalho ("beba poções e fuja se precisar"); o mapa apresenta o teletransporte após o primeiro chefe; o ritual só aparece no nv 25.

## Textos propostos
- Pistas (`done`): Carvalho (Ren) "Ele caiu sussurrando: 'não sou o primeiro'. Leve essa frase à Sábia Yun."; Colosso (Mel) "O núcleo canta baixinho, do mesmo jeito que o Carvalho cantava."; Guardião (Ren) "Ele não lutava para nos matar. Lutava para nos manter longe. Do quê? Não sei."
- Falas por situação: Ren sem chefes "Se o bosque te assustar, volte."; Mel após Colosso "Ainda cheiro cristal nas suas botas. Sente-se, tenho chá."; Doran nv ≥ 28 "Dizem que o Rubro esperou a gente. Arena é isso, esperar."; Yun após Ancião "O frio não era dele. Era do que veio antes."; Lia nv ≥ 20 "Cliente de nível alto! Só ouro de verdade, por favor."; Brok nv ≥ 25 "Seu aço está cansado. O meu fogo, não."
- Lore coletável: Bosque "Aqui jaz o Carvalho. Cresceu em silêncio. Não o acorde."; Planície "Cada cristal guarda uma lembrança. Alguns, um nome."; Ruínas "Fomos muitos. Restou o guarda. Ele ainda não sabe que acabou."; Cume "A neve cobre. Não apaga."; Cinzas "O fogo lembra mais do que a pedra."
- Epílogo: 3 linhas sobre a Vila ao entardecer: "Os ecos repousam. A vila dorme. Mas toda estrada tem outra volta."

## Riscos
Novos tipos de objetivo (`teleport`, `upgrade`) e novas conquistas tocam `core/journal.js` e o servidor: exigem testes em `tests/core.test.js` e `tests/journal.test.js`. `greet` condicional muda o formato de `DIALOGS`. Verificar: ciclo dia/noite (S15) e se a Yun vende essência (S11).
