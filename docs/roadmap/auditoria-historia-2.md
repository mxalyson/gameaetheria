# Auditoria de coerência narrativa 2 (2026-11-04)
Feita por leitura de código e dados (quests, dialogs, mentors, achievements, zones, mobs, crypt, journal, docs do Porto/Cripta/sistemas). Textos corrigidos nos dados; nada validado jogando (só testes). Continua `docs/roadmap/auditoria-historia.md` (2026-11-02).
Estado: **implementado e testado** (`tests/journal.test.js`, 36 testes, e `tests/e2e/quests.spec.js`); **não validado em celular**; **pendências** abaixo.

## 1. O arco hoje (Nv 1 a 30+ e Cripta)
| Nv | Onde | NPC | Missão | O que revela |
|---|---|---|---|---|
| 1 | Vila/Bosque | Ren | Primeiros Passos | O bosque anda inquieto |
| 2 | Bosque | Ren | Caça aos Lobos | Os lobos fugiam de algo no fundo do bosque |
| 2 | Bosque | Mel | Ervas do Bosque | Ervas crescem em roda, plantadas por algo antigo |
| 3 | Vila | Yun | Companhia de Luz | Spirits são ecos (mansos) da natureza |
| 3 | Vila | Lia | Pergaminho de Cortesia | Tutorial do mapa |
| 4 | Bosque | Ren | O Carvalho Ancestral | Chefe 1. "Não sou o primeiro" |
| 5 | Vila | Brok | Fogo de Forja | Tutorial do Ferreiro |
| 6 | Planície | Ren | Cristais Vivos | Algo chama as pedras do coração da planície |
| 8 | Planície | Mel | Coração de Cristal | Chefe 2 (Colosso). O núcleo canta como o Carvalho |
| 10 | Vila | Yun | Evolução (4 elementos) | Tutorial de evolução |
| 10 | Vila | Doran | Coragem na Arena, Equipe de Ecos | PvP e cooperativo (só com servidor) |
| 10 a 12 | Porto | Capitã, Kael | Cofre de Marfim, Palavra de Contrato, Cargas Perdidas, Duelo de Cais | Porto neutro; tutorial de banco, contratos e duelo |
| 12 | Ruínas | Ren | Sombras nas Ruínas | Espectros são guardas antigos; alguém os pôs de vigia e esqueceu de dispensá-los |
| 14 | Vila (+ Porto) | Mestre de Classe | Prova do Mestre | Escolha de estilo; conversa com os 2 mentores do Porto |
| 18 | Ruínas | Brok | Martelo do Guardião | Restos de aço antigo nos baús |
| 14 | Porto | Capitã | Eco no Cais | Os ecos presos sussurram sob as Ruínas (nova) |
| 22 | Ruínas | Ren | O Guardião Esquecido | Chefe 3. Guardava a cripta; esperava ser dispensado |
| 22 | Ruínas (mapa) | Yun | A Cripta dos Ecos | Depois do Guardião: Soberano dos Ecos, rei dos ecos presos (era Nv 20) |
| 22 | Porto | Bartolomeu | Carga de Gelo | Comércio |
| 23 | Cume | Ren | O Silêncio da Geada | Criaturas-cópia: eco de eco |
| 25 | Vila | Mestre de Classe | Maestria | 4ª habilidade |
| 27 | Cume | Yun | O Ancião Gélido | Reflexo do Carvalho; "há outro reflexo, ardendo" |
| 28 | Cinzas | Ren | Cinzas que Ainda Queimam | Criaturas de brasa |
| 29 | Cinzas | Doran | O Cavaleiro Rubro | Reflexo do Guardião, em brasa; ritual de 40 abates |
| 30 | Vila | Yun | Os Ecos Unidos | Epílogo: "o primeiro eco, inteiro de novo"; os ecos presos da Cripta ainda sussurram |
| 30+ | Cripta, Porto | Yun, Brok, Vesna | Cripta repetível, contratos, Forja do Eco | Fim de jogo sem história nova |

**Veredito (honesto).** O esqueleto é bom e agora fecha: começo com pistas leves (Nv 1 a 8), clímax claro (Nv 27 a 30: dois reflexos e o epílogo) e um epílogo que aponta para conteúdo que existe. Mas a história é contada **só em falas de caixa**, sem cena, e quem pula os diálogos não a vê. Buracos que restam: (a) entre o Nv 12 e o Nv 22 o fio principal sumia [parcialmente resolvido: `porto_eco_no_cais`, Nv 14]; o Porto e os 8 mentores são "cidade de serviços" com tutoriais, sem enredo próprio; (b) [resolvido em 2026-11-04] a Cripta agora abre só depois do Guardião (Nv 22); (c) o Colosso não tem reflexo (3 originais, 2 reflexos: aceitável, mas ninguém explica por quê); (d) [resolvido em 2026-11-04 para Cripta, especialização e Amuleto] o jogador não era avisado por nenhum aviso automático, só se falar com os NPCs certos. Antes desta rodada a Cripta e o Porto contradiziam o arco; agora se encaixam por texto. "Casando tudo": sim no texto e nos dados; falta apresentação (cena, placa, retrato) para o jogador sentir.

## 2. Cânone fechado (glossário)
- **Eco**: o que fica quando algo vivo (criatura, lugar, guerreiro) não repousa. **Spirits** são ecos mansos da natureza, que escolhem companhia. A **Grande Arena dos Ecos** guarda os ecos de quem lutou. Criaturas recoloridas (Cume, Cinzas, Cripta) são "eco de eco".
- **Guardiões** (3 formas originais): Carvalho Ancestral (natureza), Colosso de Cristal (pedra), Guardião das Ruínas (memória/vigia). **Reflexos** (2): Ancião Gélido (gelo; reflexo do Carvalho) e Cavaleiro Rubro (brasa; reflexo do Guardião). Os reflexos são o eco tentando se juntar de novo. O Colosso não tem reflexo.
- **Primeiro eco**: a voz original de que os três guardiões eram pedaços ("não sou o primeiro", "inteiro de novo"). **Não** é o Soberano.
- **Soberano dos Ecos**: o rei das Ruínas ("Fomos muitos"), preso como eco entre os seus; nunca quis repousar. Seus súditos são os cavaleiros, as gárgulas e as sombras de eco da Cripta. Foi ele quem pôs os espectros de vigia e "esqueceu de mandá-los parar".
- **Guardião das Ruínas**: o último guarda do rei, posto à porta da **Cripta dos Ecos** e nunca dispensado ("lutava para nos manter longe", "esperava quem o dispensasse"). É "algo que não devia existir" o que ele guardava. A Cripta recupera o fôlego em vinte minutos porque os ecos presos sempre voltam.
- **Porto de Marfim**: terra neutra no meio da rota (nem os ecos passam do portão), por isso comércio, banco e as escolas de estilo se instalaram ali. Os barcos estão parados porque as estradas têm ecos demais.
- **Mestres de Classe** (Vila) ensinam o ofício, a Prova e a Maestria; **mentores** (Porto, Praça dos Mestres de Estilo) ensinam o estilo. Cada mentor tem uma frase de ligação com os ecos: Aurelion "ecos quebram quem luta só"; Grumak "eco não sangra"; Velyra "todo eco segue um padrão"; Morvain "o frio do eco"; Lyra "um eco só ouve o próprio nome"; Dom Cálix "eco também cai com pólvora"; Aurora "ecos nascem de quem caiu sozinho"; Valdor "todo eco é um réu que recusa repousar". Berserker não fala de escudo; Inquisidor (sentença) e Guardiã (cuidado) são os dois lados do Clérigo.
- **Forja do Eco / Chave de Eco**: Brok forja eco em aço (40 fragmentos a arma, 60 a armadura, mais ouro; uma de cada); a Chave de Eco vem de cada contrato do Porto (Vesna) e pula a espera da Cripta. Fragmentos não entram no cofre; peças forjadas sim (Octávio).
- **Pedra de Retorno**: guarda o eco de quem a tocou; se o herói cair no mapa, acorda nela. **Amuleto da Fênix** (Lia, Mercador do Porto): guarda o eco e paga a queda no lugar do herói, sem perder ouro nem XP.
- **Místico** (5º herói): não existe como classe, mas há uma promessa em aberto (epílogo e Capitã: "viajante de capa violeta, que tece ecos"). Entra depois.
- **Sentinela**: nome exibido da especialização `guardian` do Clérigo (não confundir com o chefe Guardião das Ruínas).

## 3. O que foi corrigido (só texto/dados; sem mecânica nem números)
- **Cripta e Soberano** (`cripta_dos_ecos`, Yun): oferta apresenta o Soberano como rei dos ecos presos e liga o Guardião à porta; progresso explica entrada grátis a cada 20 min e a Chave de Eco por contrato; fim fecha com "era isso que o Guardião guardava" e "os ecos de lá sempre voltam". Yun offline (Nv 20+) explica que a Cripta só abre com o mar conectado.
- **Guardião** (`guardiao_das_ruinas`): oferta cita a cripta; fala final responde ao "do quê?" ("manter longe da cripta"; "esperar quem o dispensasse"). Fecha a promessa da auditoria 1.
- **Epílogo** (`ecos_unidos`, 3ª linha): "novo sussurro na neve" (nunca pago) virou "sob as Ruínas, os ecos presos ainda sussurram" (aponta para a Cripta, que existe).
- **Ruínas (placa de lore)**: "Restou o guarda, que não sabe que acabou. Abaixo, o rei não repousa."
- **Definição de eco**: fala padrão da Yun ("Eco é o que fica quando algo não repousa…").
- **Forja do Eco** (Brok): três falas novas (Nv 20, Nv 25, Cripta feita) com os números da receita; tom curto. `martelo_do_guardiao` não trata mais o Guardião vivo como morto.
- **Porto**: Capitã explica a neutralidade e a praça dos mestres; fala padrão sem "último eco"; Vesna explica a Chave de Eco; Octávio explica que fragmentos não vão ao cofre; Kael e `porto_duelo` não dizem mais "só na jornada solo" (o duelo roda online, o servidor conta).
- **Mentores**: 5 falas descreviam habilidades antigas (antes dos kits); agora citam o kit atual (`tests/journal.test.js` impede a regressão). Os 8 ganharam a frase de ligação com os ecos. Grumak fala sempre rude; o Berserker não menciona escudo.
- **Pedra de Retorno e Amuleto**: Ren (Nv baixo) e a dica do Bosque explicam a pedra; toast da pedra e do Amuleto (`main.js`, só texto) falam em "guardar o eco"; Lia apresenta o Amuleto.
- **Tom**: Ren mais seco (`cume_gelido`, `cristais_vivos`), Mel afetuosa em `rumo_ao_topo`, Doran teatral no progresso do Rubro. `pergaminho_de_cortesia` agora funciona de fato (viajar à Vila de graça, de fora dela).
- **Conquista**: "Voz da Cripta" (repetia "Voz dos Ecos") virou "Silêncio da Cripta", título "Calador de Ecos".
- **Testes**: filtro de textos mais rígido (teclas WASD/(E)/(M)/(J), "undefined/NaN/null", "sempre dia", abas Comprar/Vender, botão de defesa, pontuação final); mentores citam o kit e os ecos; cânone da Cripta/Forja/Chave/Pedra/Amuleto presente nos diálogos; conquistas sem nome ou título repetido. Rodados: journal (36), core (81), ui-panels (15), layout (24), modules-load (1), harbor (15), assets-version (6), checkpoint (10), e2e `quests.spec.js` (4). Nenhuma suíte inteira.
- Verificado e **sem ocorrência** nos dados: citação de teclas, "Sempre dia", abas Comprar/Vender, botão de defesa.

## 4. Decisões do dono (todas aprovadas em 2026-11-04) e o que foi implementado
1. **Soberano dos Ecos = rei das Ruínas** (distinto do "primeiro eco"). **Decidido e implementado (texto):** conferido em `cripta_dos_ecos`, falas da Yun/Brok, placa das Ruínas e glossário acima; teste em `tests/journal.test.js`.
2. **Ordem Cripta x Guardião.** **Decidido e implementado:** `cripta_dos_ecos` agora é `level: 22, after: 'guardiao_das_ruinas'`; a entrada (`core/echo.js cryptEntryCheck`, conferida de novo em `server/hub.js`), o nó e o cartão do mapa e a Forja pedem nível 22 + Guardião derrubado (`data/crypt.js`: `minLevel: 22`, `recommended: [22, 30]`, `needQuest`). **Migração:** quem já limpou a Cripta (`cryptClears`), fez a missão ou já entrou (`echo.entry`) mantém o acesso sem nível 22 nem missão (`cryptLegacy`); missões ativas continuam válidas. Testes: journal, ui-panels, zone (servidor).
3. **Nome "Guardião" repetido.** **Decidido e implementado:** a especialização do Clérigo agora se chama **Sentinela** (só o nome exibido: specs, mentor Irmã Aurora, fala do mentor, docs); o id `guardian` (atlas, aura, kits, saves, rede) não mudou. O chefe segue "Guardião das Ruínas".
4. **Místico.** **Decidido e implementado (só a promessa):** a 3ª fala do epílogo (`ecos_unidos`) e a fala da Capitã Maré depois dele dizem que um viajante de capa violeta, que tece ecos, chegou ao Porto e pergunta pelo herói. Sem NPC, classe nem arte; o Místico entra depois (`pendencias.md`).
5. **Fio do Nv 12 ao 22.** **Decidido e implementado:** uma missão, `porto_eco_no_cais` ("Eco no Cais", Capitã Maré, Nv 14, após `porto_carga`): derrotar 12 criaturas das Ruínas; revela que os ecos presos sussurram sob as Ruínas e aponta o Guardião e a Yun/Cripta. Recompensa 800 ouro, 3800 XP, 3 poções. Teste em `tests/journal.test.js`.
6. **Aviso automático** (1× por personagem; fila; só em exploração, sem painel aberto, fora de combate, 1 a cada 6 s): `crypt` (Cripta liberada), `spec` (Nv 15 sem especialização) e `phoenix` (queda em zona de farm sem Amuleto). Bits 7, 8 e 9 de `TIP_BITS` (`core/journal.js`), textos em `TIPS` (`data/dialogs.js`), disparo em `main.js` (`autoTip`/`pumpTips`). O servidor já une os bits de dicas (`FLAG_STATS`), sem mudança. **Testado em node; não validado em celular.**

## 5. O que o jogador ainda não entende
- Cripta: agora há aviso automático ao liberar; a Yun e o cartão do mapa seguem explicando. Nada diz que ela exige o servidor (só a fala offline da Yun).
- Especializações: a Prova do Mestre manda ir à Praça dos Mestres de Estilo (Porto) mas não diz onde ela fica no Porto; a Capitã aponta "a praça ao norte" só depois do `porto_chegada`.
- Amuleto e Pedras: agora têm fala/toast, mas nenhum aviso quando o jogador cai pela primeira vez sem eles.
- Colosso sem reflexo, e por que o gelo é "reflexo do Carvalho" (Yun diz uma vez, no Nv 27).
- Documentação defasada: `docs/gameplay/sistemas.md` abre com "WASD/mouse" e `CLAUDE.md` cita "grupos na tecla G", contra a decisão 0016. Não alterei (CLAUDE.md é do dono).

## 6. Depende de arte
- Soberano dos Ecos com arte própria (hoje Guardião recolorido; prompts A8 em `depende-do-dono.md`).
- Ícone do nó da Cripta e arte dos itens Eco.
- Placa/estátua tocável da Pedra de Retorno com o texto de lore (hoje o lore está em falas e no toast; a lore tocável é 1 peça por zona de farm em `LORE_ZONES`).
- Retratos próprios dos 8 mentores e dos NPCs do Porto (hoje reaproveitam rostos e o herói em miniatura).
- Cena/ilustração do epílogo; Místico (A7).
