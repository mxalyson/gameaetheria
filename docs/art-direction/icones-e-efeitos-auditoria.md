# Ícones, habilidades e efeitos — auditoria, estrutura e prévia (para aprovar)
2026-11-01 · Resposta ao briefing "Sistema visual de ícones e habilidades". **Nada foi alterado no jogo real.** Prévia: `/labs/skill-icons/index.html` (laboratório novo; nada sobrescrito).

## 1. Auditoria (o que existe hoje)
| Item | Estado |
|---|---|
| Habilidades reais | 12, em `data/skills.js`: **os nomes do briefing batem exatamente** (Golpe Giratório, Investida, Grito de Guerra · Bola de Fogo, Nova de Gelo, Teleporte · Chuva de Flechas, Tiro Perfurante, Rolamento · Luz Sagrada, Escudo Divino, Julgamento). Cada uma tem `cd`, `kind` (`aoe_self`, `dash`, `buff`, `projectile`, `blink`, `ground_aoe`), `color` e `desc`. Especializações (nível 15) só ajustam parâmetros (`core/specs.js`). |
| Ícones | **emojis** em `SKILLS[x].icon` (🌀 ⚡ 📯 🔥 ❄️ 💫 🌧️ 🎯 💨 ☀️ 🛡️ ⚖️). Usados em `ui/ui.js` (barra, tooltip, seleção de classe) e `touch.js` (botões de toque). Sem moldura, sem arte. |
| Barra de habilidades | existe: 3 slots + básico/poção/🏠/spirit, recarga por "cortina", número de recarga no toque, tooltip com nome/descrição/recarga. Teclas 1/2/3 aparecem no modo teclado; no modo toque (padrão, decisão 0016) são botões. |
| Efeitos no jogo real (`render/renderer.js`) | só **`ring`** (anel), **`slash`** (arco), projétil (esfera com gradiente; flecha = traço), área tracejada, telégrafo, partículas e números de dano. **Não há efeito próprio por habilidade**: o evento `cast` do servidor só desenha anel/rajada na cor da skill (`main.js` `netEvent`). |
| Laboratório | `public/labs/iso-poc/src/vfx.js` já tem efeitos por habilidade em perspectiva isométrica (`swing, nova, shout, dash, aura, blink, rain, pray, cast, muzzle, impact`) mapeados nas 12 skills reais (`HERO_ACTIONS`); **só visual, estado puro e testável**. Serve de base, mas precisa de port para o plano 2D do jogo atual. |
| Multiplayer | eventos `hit/heal/swing/cast/status/death/telegraph` já vêm do servidor e o cliente só desenha (regra preservada). Marcador de time (losango aliado / quadrado inimigo) e barras de vida já existem. |

## 2. Estrutura proposta (adaptada ao repositório; o jogo só serve `public/`)
```
public/assets/
  icons/skills/    12 ícones (SVG provisório → PNG/WebP 128×128 final) + skills.atlas.webp (1 requisição)
  icons/classes/   4 emblemas de classe (retrato do HUD e seleção)
  icons/status/    buff · cura · dano · controle · escudo · lentidão · atordoamento · queimadura (forma + cor)
  vfx/skills/      sprites de efeito (rastros, impactos, runas) — só onde procedural não bastar
  ui/              molduras, medalhões, barras (derivado da B1)
public/src/render/skill-icons.js   carrega o atlas, devolve <canvas>/CSS por skill (1 só lugar)
public/src/render/skill-vfx.js     mapa skill → efeito Canvas 2D, dirigido pelos eventos reais (`cast`, `hit`, `heal`, `status`)
data/skills.js                     ganha só `iconId` (a mecânica NÃO muda); `icon` (emoji) fica como reserva
```
Regras: tudo cacheado pelo service worker (arte pesada = cache primeiro); nada em `core/`, `game/`; ícones em atlas único para não pesar a memória (orçamento atual de textura: 48,8 MiB com 4 heróis na qualidade média).

## 3. Prévia visual (o que você vai ver)
12 ícones com **moldura e paleta por classe** (Guerreiro aço/vermelho, Mago índigo/violeta, Arqueiro esmeralda, Clérigo ouro/marfim), legibilidade a **64 e 48 px**, **recarga radial com número**, estado indisponível e **tooltip**; categorias **dano/cura/buff/controle** diferenciadas por **cor + forma** (acessível). Prévia gerada por SVG desenhado à mão.

## 4. Limites honestos (leia antes de aprovar)
- **A prévia NÃO alcança a qualidade das suas referências** (ícones pintados com luz, textura e profundidade). SVG por código dá silhueta forte, paleta e moldura coerentes, mas não ilustração rica. Isso é o teto do que eu produzo sozinho.
- Caminho para a qualidade das referências: **(a)** você gera as 12 ilustrações num gerador (as suas referências parecem do Gemini) seguindo o prompt-guia abaixo e eu integro (moldura, atlas, recarga, efeitos); **(b)** artista humano; **(c)** eu ligo o `nano-banana-pro` se você fornecer uma chave de API. Qualquer arte gerada: **registrar origem e licença** em `docs/CREDITOS.md`.
- Seu medo do "padrão seco de IA": o remédio é **moldura, paleta e luz feitas por nós** (consistência) + **ilustração central curada** por quem gerar (descartar o que sai genérico). O sistema abaixo garante consistência mesmo com ilustrações de fontes diferentes.
- Os **efeitos por habilidade** (partículas, ondas, rastros, auras, escudos, raios) não estão na prévia; entram na etapa 3 com o `vfx.js` do laboratório como base. Não medi desempenho ainda.
- Nada de mecânica muda; os testes `npm test` (212) e e2e rodarão a cada etapa.

## 5. Prompt-guia para gerar as ilustrações (uma por habilidade)
Base comum: *"ícone de habilidade de RPG mobile, ilustração central de [ELEMENTO], vista frontal, iluminação dramática de cima à esquerda com contraluz frio, sombras em violeta (nunca preto), silhueta marcante legível em 48 px, estilo anime fantasy HD pintado à mão, sem texto, sem moldura, fundo escuro suave, quadrado 1024×1024"* + por classe: Guerreiro (vermelho, aço, laranja) · Mago (azul, violeta, energia arcana) · Arqueiro (verde, esmeralda, vento) · Clérigo (dourado, branco, luz sagrada). **Sem moldura no prompt**: a moldura é nossa (consistência).

## 6. Etapa 1 — ícones no jogo real (2026-11-01) — implementada e testada
- 12 ícones das habilidades reais + poção em `public/assets/icons/{skills,status}/*.webp` (256×256, ≈ 250 KB no total), recortados das folhas do proprietário (`tools/skill-icons-from-sheets.py`). Código novo: `render/skill-icons.js`; a UI (`ui.js`), o toque (`touch.js`), o tooltip e a seleção de classe usam a arte; **a mecânica não mudou**. A recarga radial (`.cd` cônico) e o número já existiam e passaram a cobrir o ícone; ícone escurecido em recarga, cinza sem poções.
- Testes: `tests/skill-icons.test.js` (12 habilidades com arquivo, sem repetição, tamanho) e `tests/e2e/skill-icons.spec.js` (6: 4 classes no toque, teclado com tooltip, seleção de classe). Falta rodar a suíte completa e medir desempenho.
- **Pendências visuais:** (1) **moldura do Mago inconsistente** (Bola de Fogo bronze, Nova de Gelo gelo, Teleporte roxo) — pedir ao proprietário para regenerar as duas com moldura roxa; (2) o botão de **ataque básico** ainda usa o emoji da classe (precisa de arte); (3) **Rolamento** e **Tiro Perfurante** vieram do segundo lote e conferem; (4) licença/origem das folhas a confirmar. Próxima: etapa 2 (efeitos por habilidade).

## 7. Ajustes após a etapa 1 (2026-11-01)
- **Moldura do Mago unificada:** Bola de Fogo e Nova de Gelo tiveram só o **aro recolorido para roxo** (hue), igual ao do Teleporte (`tools/skill-icons-from-sheets.py`, função `purple_frame`); o miolo da arte não mudou.
- **Tamanho no celular (pedido do proprietário):** o painel do minimapa saiu: só o **minimapa pequeno** (104×70, 88×58 ou 76×50 conforme a altura) e os **ícones do menu numa fileira sempre visível** ao lado dele; sem nome da zona (continua no aviso de entrada). Botões de habilidade/poção ≈ 42–50 px e conjunto de toque menor em telas baixas. **O desenho final dessa área fica para a B1/B5** (decisão do proprietário). Medido: painel de 170×194 → minimapa 104×70; conjunto de toque 156 px de altura em 274 px de tela.
- Ainda sem arte: **botão de ataque básico** (usa o emoji da classe) — pedir 4 ícones ao proprietário (um por classe, mesma moldura da classe).

## 8. Etapa 2 — efeitos por habilidade (2026-11-01) — implementada e testada no navegador
- **Módulo novo** `render/skill-vfx.js` (Canvas 2D, sem dependência): 12 efeitos, um por habilidade real — Golpe Giratório (lâminas em giro), Investida (rastro de avanço + onda no início), Grito de Guerra (ondas sonoras à frente + aura de brasas pela duração do buff), Bola de Fogo (clarão + projétil com cauda de chamas), Nova de Gelo (estilhaços e disco gélido), Teleporte (implosão na origem, chegada e rastro entre os pontos), Chuva de Flechas (anel rúnico + flechas que caem e impactam na área), Tiro Perfurante (linha de luz + flecha com rastro), Rolamento (rastro de vento + folhas), Luz Sagrada (raios solares + partículas subindo), Escudo Divino (bolha dourada pela duração do escudo) e Julgamento (raio sagrado + projétil estrelado).
- **Só apresentação, ligado aos eventos reais:** no jogo local o evento `cast` da simulação chama `spawnSkillVfx`; no online o mesmo evento **confirmado pelo servidor** (`netEvent` 'cast') faz o mesmo; os 3 projéteis são reconhecidos pelas propriedades que a simulação já dá (`explode`, `pierce`, `stun`). Nada decide dano, alcance ou resultado; o projétil cosmético do online passou a copiar essas propriedades do projétil real (campo visual). `game/sim.js` não foi alterado.
- **Lição de cor (medida):** a primeira versão usava brilho aditivo e, sobre o chão **claro** do jogo, tudo virava branco (Nova de Gelo e Luz Sagrada viravam estrelas brancas). Trocado para desenho **opaco**: cor saturada + contorno escuro + núcleo claro (capturas em `docs/art-direction/capturas/efeitos-no-jogo-real.png`).
- **Desempenho (CPU do Chromium sem GPU, só tempo de JS, sem ler pixels):** desenho médio 1,73 ms sem efeitos → 1,77 ms com 8 efeitos ao mesmo tempo (+0,04 ms). Teto de 22 efeitos simultâneos; qualidade baixa reduz detalhes (menos flechas, raios e partículas). **Não medido no celular** (aparelho desconectado): falta rodar `tools/android-measure.mjs` com os efeitos.
- **Testes:** `tests/skill-vfx.test.js` (3: os 12 mapeamentos, nenhum NaN no ciclo de vida inteiro com contexto 2D de mentira, descarte e teto) e `tests/e2e/skill-vfx.spec.js` (5: as 12 habilidades no jogo real geram o efeito certo sem erro e a recarga continua sendo aplicada pela simulação; custo de desenho). Laboratório: `/labs/skill-vfx/index.html` (usa o módulo real).
- **Limites:** os efeitos são vetoriais (sem partículas texturizadas pintadas); o impacto ao acertar (hit) ainda é o antigo; não há efeitos de status (lentidão, atordoamento, queimadura) nem de cura em aliados além do anel já existente; não testados com 2+ jogadores reais no online (só a ligação pelo evento do servidor).
