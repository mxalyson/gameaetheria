# O que depende do dono (prompts e passos prontos)
2026-11-04 · Lista viva: só o que NÃO existe ainda no repositório (conferido em `public/assets`, `public/labs/iso-poc/art-local/atlas-rig` e `git log`). Texto anterior completo: `depende-do-dono-historico.md`.
Regras de estilo comuns: pintura digital de fantasia luminosa "pintada à mão" (mesmo mundo dos heróis em miniatura, Summoners War + anime), luz do alto-esquerda, fundo liso, sem texto. Origem/licença do que entrar vai para `docs/CREDITOS.md`. Formatos que funcionaram: **ícones em folha de 4 com moldura dourada** (eu recorto); **GLB do Meshy isolado, pose A** (eu asso em sprite com `tools/mob-bake.mjs` ou atlas de herói); **folhas de efeitos branco-sobre-preto** (escala de cinza, fundo preto liso).

## Pendente de arte (ordem de prioridade)

### A1. NPCs do Porto com arte própria (hoje alias recolorido)
- **Onde o jogo lê:** `render/npc-sprites.js` (`NPC_ALIAS`: banker→sage, hunter→guard, dealer→merchant, duelist→arena, captain→guard, com `tint`). Com arte, entro em `NPC_ART`, gero `assets/npcs/<id>.webp` + `.json` e o alias some.
- **Arquivos esperados:** `banker`, `hunter`, `dealer`, `duelist`, `captain` (um GLB Meshy cada; eu recorto de frente).
- **Formato:** GLB Meshy isolado, pose A, chibi, fundo liso.
- **Prompt-base:** *"chibi fantasy NPC, anime style, big head, hand-painted, full body, standing neutral pose, plain background"* +
  - **Banqueiro Octávio** (`banker`): homem baixo e rechonchudo, colete azul-marinho com botões dourados, monóculo, chaveiro enorme na cintura, chapéu alto de seda.
  - **Mestra de Caça Vesna** (`hunter`): mulher alta de capa verde-musgo com capuz, arco curto nas costas, aljava, cicatriz no queixo.
  - **Mercador Bartolomeu** (`dealer`): homem sorridente de colete laranja, bolsas e mochila cheia de mercadorias, chapéu de pena.
  - **Duelista Kael** (`duelist`): espadachim magro de casaco vermelho, florete, bigode fino, luva branca.
  - **Capitã Maré** (`captain`): mulher de casaco azul-petróleo com dragonas douradas, chapéu de capitão, âncora no cinto.

### A2. Místico (5º herói) + 2 especializações + ícones
- **Estado:** só a promessa em texto (epílogo `ecos_unidos` e Capitã). Não há classe, NPC, atlas nem ícones. Especializações propostas: `docs/gameplay/sistemas.md` › Místico (Tecelão de Ecos e Ceifador de Ecos).
- **Entrega:** (a) herói base GLB Meshy, pose A; (b) duas variantes Nv25 (uma por especialização), mesma silhueta; (c) ícones de habilidade 512×512 em folha de 4 com moldura dourada (kit base + 3 por especialização + Maestria; eu listo os ids quando o kit existir); (d) ícone do ataque básico (aro como os `atk-*`); (e) retrato de busto 512×512.
- **Prompts:** herói: *"chibi fantasy mystic hero, anime style, flowing violet and teal robes, floating glowing sigils, staff with a hanging lantern, hand-painted, full body, standing neutral pose, A-pose"*. Tecelão de Ecos: *"... refined elite version, weaver of echoes, translucent teal threads and spectral companions orbiting, violet-gold robe"*. Ceifador de Ecos: *"... refined elite version, reaper of echoes, dark violet cloak, scythe-like lantern staff, pale teal glow"*.
- Depois eu faço atlas, kit e ligo no `heroLook`.

### A3. Soberano dos Ecos com arte final e mais clara
- **Estado:** `assets/mobs/echolord_p1` e `echolord_p2` existem (alta resolução, 4 quadros), mas o modelo é escuro; hoje o jogo levanta o brilho em `render/mob-sprites.js` (`LIFT`/`RIM`). Precisa modelo novo, claro, para ler bem sobre o piso escuro da Cripta.
- **Entrega:** dois GLB Meshy (pose A): fase 1 (golpe pesado no chão) e fase 2 (braços erguidos, invocando). Eu reasso em `echolord_p1/p2` com `tools/mob-bake.mjs`.
- **Prompt:** *"chibi fantasy boss, spectral king of echoes, tall armored lich knight with a cracked crystal crown, light pearl-white and teal armor with bright glowing violet runes, floating crystal shards orbiting him, hovering ghostly cape, menacing, hand-painted, stylized miniature, bright even lighting, plain light background, full body"*.

### A4. Ícone do nó da Cripta (128 px)
- **Arquivo:** `public/assets/icons/ui/zone-crypt.webp` (128×128, fundo transparente). **Onde lê:** `ui/ui.js` (`ZONE_ART` + `zoneIcon('crypt')`; hoje cai no emoji 🕯️ porque `crypt` não está em `ZONE_ART`; eu acrescento ao ligar).
- **Prompt:** *"fantasy game map node icon, stone crypt portal with glowing turquoise runes, hand-painted, ornate gold frame, centered, transparent background"* (mesmo desenho dos `zone-*`).

### A5. Ícones de zona em 128 px
- **Arquivos:** refazer `assets/icons/ui/zone-town|forest|plains|ruins|glacier|ember|harbor.webp` (hoje 64×64, macios em tela 3×; `ember` e `harbor` são recortes tingidos). Mesmo desenho, 128×128. **Formato:** folha de 4 + folha de 3, moldura dourada, fundo transparente.

### A6. Baú aberto, cadeado e troféu
- `assets/props/chest-open.webp` (mesmo estilo e tamanho do `chest.webp`, 160×143 ou maior; tampa levantada, vazio, brilho dourado leve). **Prompt:** *"same hand-painted fantasy treasure chest, lid open, empty, faint golden glow, transparent background, same angle as the closed one"*.
- `assets/icons/ui/lock.webp` e `trophy.webp` (128×128, ícone dourado, fundo transparente). Hoje: cadeado usa `res-key.webp` e troféu usa `menu-journal.webp` (`ui/ui.js`, `LOCK`/`TROPHY`), com emoji de reserva.

### A7. Placa/arte da Pedra de Retorno
- Hoje a Pedra é `m_boulder` do kit de natureza (`nature-sprites.js`, `SET.*.runestone`) e a lore está só em falas e toast. **Entrega:** ícone 128×128 `assets/icons/ui/runestone.webp` + peça de cenário (GLB Meshy, pose A) `runestone`: pedra rúnica com brilho turquesa suave e um espaço para placa de texto. **Prompt:** *"stylized hand-painted fantasy waystone, standing runestone with glowing turquoise runes and a small wooden plaque, chibi miniature diorama style, game asset, single object, plain background"*.

### A8. Retratos dos mentores e dos NPCs do Porto
- Hoje os 8 mentores reaproveitam o quadro do herói Nv25 (`npc-from-heroes.py`) e os NPCs do Porto usam o rosto dos alias. **Arquivos:** `assets/portraits/npc-<id>.webp` (512×512, busto, fundo transparente) para `banker, hunter, dealer, duelist, captain` e `mentor-<id>.webp` para `paladin, berserker, arcane, warlock, sniper, gunslinger, guardian, inquisitor`. **Formato:** folha de 4, mesmo estilo dos `npc-*.webp` existentes.
- **Prompt-base:** *"bust portrait of a chibi anime fantasy NPC, {descrição}, painted game portrait like Summoners War, head and shoulders, transparent background"* (descrições do A1 e dos mentores em `data/mentors.js`).

### A9. Adornos do Cume Gélido (3 peças)
- **Estado:** o Cume usa o kit de natureza (`SET.glacier`, pinheiros e cristais). Não há pilar, estátua nem tocha de gelo. **Entrega:** 3 GLB Meshy isolados, pose A: `glacier_pillar` (pilar de gelo rachado), `glacier_statue` (estátua coberta de neve), `glacier_torch` (tocha de gelo azul). Eu integro em `nature-sprites.js`. **Prompt-base:** *"stylized hand-painted fantasy ice prop, chibi miniature diorama style, soft saturated colors, game asset, single object, plain background"* + descrição.

### A10. Peças restantes do Porto de Marfim (opcional)
- Já há barcos, caixas e barris; faltam `harbor_pier` (píer reto de madeira, ~4 tábuas de largura), `harbor_lighthouse` (farol baixo de pedra clara com lanterna) e `harbor_net` (rede de pesca pendurada). **Formato:** GLB Meshy isolado, pose A; integro em `SET.harbor`. **Prompt-base:** *"stylized hand-painted fantasy harbor prop, chibi miniature diorama style, warm ivory sand and weathered pale wood, soft saturated colors, clean shapes, game asset, single object, plain background"*.

### A11. Montarias (lobo, cavalo, gryphon), só depois da decisão D1
- **Estado:** só desenho (`docs/roadmap/montaria.md`); nenhum arquivo. **Formato:** por montaria, atlas **8 direções × 7 quadros** (6 de galope/voo + 1 parado), fundo transparente, **sem cavaleiro**, âncora nos cascos/patas, estilo miniatura dos heróis. Mais: ícone de **sela vazia** 256×256 e **Apito de Montaria** (item épico).
- **Prompts:** (1) Lobo: *"chibi anime fantasy gray wolf mount, saddle with leather straps and small blue cloth, big expressive eyes, fluffy tail, painted miniature style like Summoners War, isometric 3/4 view, transparent background, galloping pose, no rider"*. (2) Cavalo: *"chibi anime fantasy white horse mount with golden saddle and flowing mane, big glossy eyes, painted miniature style, isometric 3/4 view, transparent background, trotting pose, no rider"*. (3) Gryphon: *"chibi anime fantasy gryphon mount, eagle head and lion body, golden-brown feathers, saddle, wings half-open for gliding, painted miniature style, isometric 3/4 view, transparent background, no rider"* (asas em 3 posições).

### A12. Cena/ilustração do epílogo
- **Estado:** não existe; o epílogo (`ecos_unidos`) é só texto. **Entrega:** 1 ilustração 1280×720 (WebP) `assets/ui/epilogue.webp`, que eu mostro no diálogo/tela final. **Prompt:** *"painted fantasy key art, four chibi heroes (warrior, mage, archer, cleric) standing together on a snowy ridge at dawn, glowing teal echoes drifting upward like fireflies, a distant figure in a violet cape watching from the harbor below, hand-painted, Summoners War + anime, wide cinematic composition, no text"*.

### A13. Efeitos de VFX que ainda são procedurais (opcional)
- Folhas 1–3 entregues (49 sprites). Faltam folhas para: vento (`wind`), folhas (`leaf0..1`), pedras (`shard0..1`), cruz, bolha, fitas (`ribbon0..1`), brasas (`ember0..1`), brilho (`glow`), anel (`ring`); mais raios (ideais 5–6, com vertical/bifurcado), cristais de gelo soltos, fumaça tóxica verde, cortes em meia-lua (mais variações), arco de energia/projétil e círculos de runa extras (2 hoje).
- **Formato:** folha branco-sobre-preto em escala de cinza (`docs/art-direction/fontes-vfx/vfx-folha-N.jpg`; eu rodo `python tools/vfx-sheet.py` e `node tools/bump-assets.mjs`). **Prompts:** *"sprite sheet, N frames of {efeito}, painterly anime game VFX, soft glowing white-hot core fading to dark edges, grayscale only, black background, no text"*; para vento: *"curved wind streaks"*; para brasas: *"floating embers with glow"*; para folhas: *"drifting leaves"*; para pedras: *"angular rock shards"*.

### A14. Retratos PINTADOS das especializações (opcional)
- **Estado:** `assets/portraits/spec-<id>.webp` existem como **renders 3D** (`node tools/spec-portraits.mjs`; ainda não commitados), para os 8 ids. Só vale pedir arte se quiser pintura no lugar. **Entrega:** PNG 512×512, fundo transparente, `spec-<id>.png` (paladin, berserker, arcane, warlock, sniper, gunslinger, guardian, inquisitor), busto, mesma moldura e luz dos `class-*.webp`; eu converto para webp e rodo `node tools/bump-assets.mjs`.
- **Prompts (busto, anime chibi pintado, fundo transparente):** Paladino: *"blond hair, golden winged helmet with white plume, radiant white and gold plate armor with sun emblem, calm determined look"*. Berserker: *"crimson horned full helm with glowing orange eyes, red armor with lava-like cracks and spikes, fierce"*. Arcano: *"short dark purple hair, violet eyes, high-collar purple and gold robe with runic trim, serene"*. Bruxo: *"dark green hood with glowing green runes, pale face with glowing green eyes, small horn, eerie, brighten the face for dark UI"*. Franco-atirador: *"teal hood pulled back, orange hair, teal eyes, teal leather cloak with white trim, focused"*. Pistoleiro: *"messy brown hair under a brown feathered hat, confident smirk, leather jacket with straps and quiver"*. Sentinela: *"long pale blonde hair, golden tiara, white and gold robe, large white feathered wings behind the shoulders, gentle but firm"*. Inquisidor: *"voluminous orange hair in a bun, teal eyes, purple and red ornate coat with gold crossed straps, stern"*. Todos: *"bust portrait of a chibi anime {classe}, ..., painted game portrait like Summoners War, head and shoulders, transparent background"*.

### A15. Itens e spirits restantes, folhas perdidas (opcional)
- Ícones de itens e spirits que faltam: `docs/art-direction/prompts-icones-itens.md` (Ópalo sem arte opalescente própria; variante de escudo do Clérigo `shield-<raridade>-cleric.webp`, ainda não usada pelo código: avise para ligar).
- 4 folhas que só apareceram na conversa (tooltip/faixa/diálogo, 7 molduras de raridade, 4 ataques básicos, 7 ícones de menu): reenviar como arquivo (hoje os arquivos de `assets/ui` e `icons/menu` já existem; só reenvie se quiser a fonte original).
- Mestres de classe em maior resolução (renders de 1024 px de altura; hoje 125 px no atlas).
- Criaturas da Cripta próprias (opcional): *"chibi spectral sentinel, teal glowing armor shell, hollow helm"*, *"chibi runic gargoyle, blue stone with glowing runes"*, *"chibi echo wraith, teal translucent robe, floating lantern"* (hoje recoloridos; `data/mobs.js` `art`/`tint`).

### A16. Ícone do Drenar Vida do Bruxo (opcional)
- `assets/icons/skills/wl_drain.webp` existe e ficou com fios vermelhos **por escolha do dono**. Só substitua se quiser versão verde tóxica: ícone 512×512 moldura dourada, *"a hand draining glowing toxic-green life threads"*.

## Já entregue e integrado

| Item | Arquivo(s) | Commit / data |
|---|---|---|
| Retrato do Cavaleiro Rubro (antiga A3) | `assets/portraits/boss-rubro.webp` (lido em `render/mob-sprites.js`, `PAINTED_PORTRAIT`) | c8418f9, 2026-11-03 |
| Ícones de Maestria (A4) | `assets/icons/skills/colossus|meteor|arrowstorm|intervention.webp` | bf1ea8f, 2026-11-03 |
| Ícones dos 32 kits (A4b) | `assets/icons/skills/pal_*, bsk_*, arc_*, wl_*, sn_*, gs_*, gd_*, inq_*` (Paladino em alta resolução) | 871d96f, cdf7a49, 7f7e8da, 2026-11-04 |
| Ataque básico das 4 classes (A5) | `assets/icons/attack/atk-archer|cleric|mage|warrior.webp` (arte do dono dentro do aro) | cdf7a49, b9ec81c, 2026-11-04 |
| Escudos por raridade (A6b) | `assets/icons/item/shield-{common..legendary}.webp` | c8418f9, 2026-11-03 |
| Peças da Cripta (portões, pilares, sarcófagos, piso) | `assets/props/crypt_part0..5` | 2b56938, 2026-11-03 |
| Barcos, caixas e barris do Porto | `assets/props/harbor_boat0..1`, `harbor_crate0..4` | 2b56938, 2026-11-03 |
| Soberano dos Ecos (versão escura, alta resolução) | `assets/mobs/echolord_p1/p2` | 2b56938, 24e966b, 2026-11-03 |
| Itens Eco (armas, armaduras, Fragmento, Chave) | `assets/icons/item/eco-*`, `res-eco-fragment`, `res-eco-key` | 7aeb394, 2026-11-03 |
| VFX folhas 1–3 (49 sprites) | `assets/vfx/vfx.webp` + `vfx.json` | 5032ab2, 2026-11-03 |
| Heróis Nv25 das 8 especializações | `public/labs/iso-poc/art-local/atlas-rig/*_nv25` (Paladino é `paladin_nv25` do `chibi_heroes.glb`), ligados em `render/hero-sprites.js` | 6f19544, 4fe33f5, 2026-11-03 |
| Mentores das 8 especializações (NPCs pintados, quadro do herói Nv25) | `assets/npcs/mentor_*.webp` | 31afd18, 2026-11-03 |
| Mestres de classe, Vila (NPCs pintados) | `assets/npcs/master_*`, `merchant`, `arena`, `sage`, `guard`, `herbalist`, `smith` | anteriores (2026-11-01) |
| Retratos das especializações (renders 3D; A11 antiga virou A14, opcional) | `assets/portraits/spec-*.webp` | ainda sem commit (working tree) |

## Decisões suas
- **D1. Aprovar o desenho da montaria** (`docs/roadmap/montaria.md`): +50% velocidade fora de combate, desmonta ao atacar/dano, nunca em PvP/Ondas/Cripta, missão no Nv 12 (lobo), demais por item/conquista. Sem aprovação não peço arte (A11) nem implemento.
- **D2. Rebalanceamentos pendentes:** balanço do início mantido (lobos Nv 4 são perigo, decidido 2026-11-02); balanceamento por jogador da Cripta (duração 8–14 min) ainda em aberto (`pendencias.md` item 15); duelos classe×classe: rodar `npm run balance` depois dos kits novos e dizer se aceita fora de 45–55%.
- **D3. Perguntas abertas de `auditoria-historia-2.md` §5** (as decisões da §4 já foram aprovadas e implementadas): (a) dizer onde fica a Praça dos Mestres de Estilo na Prova do Mestre; (b) aviso ao primeiro tombo sem Amuleto/Pedra (existe só `phoenix` na zona de farm); (c) dizer ao jogador que a Cripta exige o servidor (só a Yun offline avisa); (d) explicar por que o gelo é "reflexo do Carvalho" antes do Nv 27; (e) `CLAUDE.md` e `docs/gameplay/sistemas.md` ainda citam WASD/tecla G (decisão 0016): autorizar a correção.
- **D4. Pilares/assinatura visual** (`docs/art-direction/identidade-visual-v1.md`), estilo do cenário Quaternius/Meshy, licença das imagens de IA e origem das folhas de ícones (registrar em `docs/CREDITOS.md`).
- **D5. Prioridade:** Místico (A2) antes ou depois de NPCs do Porto (A1)?

## Contas, aparelho e servidor
1. **Servidor público com HTTPS/WSS e domínio** (hoje o GitHub Pages fica offline sem servidor). Opções: VPS pequena + Caddy (HTTPS automático) rodando `npm run server`. Eu preparo Dockerfile/compose quando você escolher o provedor.
2. **Google Client ID** (Google Cloud → OAuth cliente Web, origens do domínio) → variável `GOOGLE_CLIENT_ID`. Nunca me mande o segredo por chat.
3. **Google Play:** conta de desenvolvedor, chaves de assinatura guardadas fora do Git, um aparelho Android com depuração USB. Depois: TWA/Capacitor (`docs/roadmap/android.md`).
4. **Medição em aparelho real:** rodar `docs/roadmap/teste-android.md` e me trazer FPS/RAM; no iPhone, abrir com `?fps=1` se existir, ou descrever travadas. Testar também um celular médio/fraco e sessão longa (aquecimento). Validar em celular o que só foi testado em node (avisos automáticos da Cripta/especialização/Amuleto, HUD de toque sem sobreposição, Cripta no navegador).
5. **Rede real:** testar com 2 aparelhos em redes diferentes (perda/latência/TLS).
6. **Teste de invasão e anti-abuso de contas** (CAPTCHA): só por terceiros / quando houver servidor público.
