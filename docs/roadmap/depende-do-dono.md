# O que depende do dono (prompts e passos prontos)
2026-11-03 · Tudo aqui eu não consigo fazer sozinho (arte nova, contas, aparelho real). Cada item diz o que me entregar e onde o jogo vai ler. Regras de estilo comuns: pintura digital de fantasia luminosa "pintada à mão" (mesmo mundo dos heróis em miniatura, Summoners War + anime), luz do alto-esquerda, fundo liso, sem texto. Origem/licença do que entrar vai para `docs/CREDITOS.md`.

## A. Arte (gerar e me enviar o arquivo)

### A1. Porto de Marfim: peças 3D (Meshy, GLB; eu asso em sprite com `tools/mob-bake.mjs`)
Prompt-base para todas: *"stylized hand-painted fantasy harbor prop, chibi miniature diorama style, warm ivory sand and weathered pale wood, soft saturated colors, clean shapes, game asset, single object, plain background"*
1. **Píer de madeira** (reto, ~4 tábuas de largura, postes de corda): `harbor_pier`
2. **Barco a remo** e **veleiro pequeno** (2 peças): `harbor_boat_1`, `harbor_boat_2`
3. **Barris e caixas empilhados** (2 peças): `harbor_crates`, `harbor_barrels`
4. **Farol baixo de pedra clara com lanterna** (alto, estreito): `harbor_lighthouse`
5. **Cordame/rede de pesca pendurada** (opcional): `harbor_net`
Entrega: os GLBs na conversa. Eu integro em `render/nature-sprites.js` (SET.harbor).

### A2. NPCs do Porto (Meshy, personagem chibi de pé, pose neutra, A-pose)
Prompt-base: *"chibi fantasy NPC, anime style, big head, hand-painted, full body, standing neutral pose, plain background"* + descrição:
- **Banqueiro Octávio:** homem baixo e rechonchudo, colete azul-marinho com botões dourados, monóculo, chaveiro enorme na cintura, chapéu alto de seda.
- **Mestra de Caça Vesna:** mulher alta de capa verde-musgo com capuz, arco curto nas costas, aljava, cicatriz no queixo.
- **Mercador Bartolomeu:** homem sorridente de colete laranja, bolsas e mochila cheia de mercadorias, chapéu de pena.
- **Duelista Kael:** espadachim magro de casaco vermelho, florete, bigode fino, luva branca.
- **Capitã Maré:** mulher de casaco azul-petróleo com dragonas douradas, chapéu de capitão, âncora no cinto.
Hoje usam sprites recoloridos da Yun/Ren/Lia/Doran; com estes GLBs eu gero `assets/npcs/<id>.webp` e o alias some.

### A3. Retrato do Cavaleiro Rubro (chefe das Cinzas) — Meshy ou imagem
*"armored red knight boss, burning ember armor, glowing cracks, horned helm, menacing, chibi stylized fantasy, hand-painted, bust portrait, plain dark background"* → `assets/portraits/boss-rubro.webp` (busto 512×512).

### A4. Ícones das 4 habilidades de Maestria (512×512 PNG, moldura dourada, fundo transparente)
Hoje são recolores dourados dos ícones antigos. Prompt: *"fantasy game skill icon, hand-painted, ornate gold frame, centered, glowing, dark transparent background"* +
- **Fúria do Colosso** (Guerreiro): punho de pedra cristalina batendo no chão, ondas de choque âmbar. → `assets/icons/skills/colossus.webp`
- **Meteoro Arcano** (Mago): meteoro roxo-alaranjado caindo com cauda de runas. → `meteor.webp`
- **Tempestade de Flechas Ardentes** (Arqueiro): chuva de flechas em chamas num céu de brasas. → `arrowstorm.webp`
- **Intervenção Divina** (Clérigo): mãos erguidas, coluna de luz dourada, asas translúcidas. → `intervention.webp`

### A5. Ícone do ataque básico das 4 classes (512×512, mesma moldura dos ícones de skill)
Espada curva (Guerreiro), orbe/cajado arcano (Mago), arco com flecha de luz (Arqueiro), maça sagrada com halo (Clérigo). → `assets/icons/skills/basic-<classe>.webp`

### A6. Peças do cenário e UI
- **Baú aberto** (mesmo estilo do `assets/props/chest.webp`, tampa levantada, vazio, brilho dourado leve): `props/chest-open.webp`
- **Adornos do Cume Gélido** (3 peças: pilar de gelo rachado, estátua coberta de neve, tocha de gelo azul): GLB Meshy.
- **Cadeado e troféu pintados** (ícones 128×128 ícone dourado): `assets/icons/ui/lock.webp`, `trophy.webp`
- **Ícones de zona em 128 px** (hoje 64 px, macios em tela 3×): redo de `assets/icons/ui/zone-*.webp`, mesmo desenho.
- **Mestres de classe em maior resolução:** se quiser, reenvie os GLBs/renders dos 4 heróis em 1024 px de altura (hoje 125 px no atlas).
- **Ícones de itens e spirits restantes**: usar `docs/art-direction/prompts-icones-itens.md`.
- **4 folhas que só apareceram na conversa** (tooltip/faixa/diálogo, 7 molduras de raridade, 4 ataques básicos, 7 ícones de menu): reenviar como arquivo.

### A7. Místico (5º herói)
Conceito: místico errante que tece "ecos" (invocações/controle). Prompt: *"chibi fantasy mystic hero, anime style, flowing violet and teal robes, floating glowing sigils, staff with a hanging lantern, hand-painted, full body, standing neutral pose"* → GLB Meshy; depois eu faço atlas, kit de habilidades e ícones.

## B. Decisões suas
- Aprovar pilares/assinatura visual (`docs/art-direction/identidade-visual-v1.md`).
- Dizer se ainda quer comparar efeitos do laboratório isométrico (você disse que era resolução; se o iPhone está nítido, posso fechar).
- Decidir o envio de B2–B5 e do Místico (prioridade).

## C. Contas, aparelho e servidor
1. **Servidor público com HTTPS/WSS e domínio** (hoje o GitHub Pages fica offline sem servidor). Opções: VPS pequena + Caddy (HTTPS automático) rodando `npm run server`. Eu preparo Dockerfile/compose quando você escolher o provedor.
2. **Google Client ID** (Google Cloud → OAuth cliente Web, origens do domínio) → variável `GOOGLE_CLIENT_ID`. Nunca me mande o segredo por chat.
3. **Google Play:** conta de desenvolvedor, chaves de assinatura guardadas fora do Git, um aparelho Android com depuração USB. Depois: TWA/Capacitor (`docs/roadmap/android.md`).
4. **Medição em aparelho real:** rodar `docs/roadmap/teste-android.md` e me trazer FPS/RAM; no iPhone, abrir com `?fps=1` se existir, ou me descrever travadas. Testar também um celular médio/fraco e sessão longa (aquecimento).
5. **Rede real:** testar com 2 aparelhos em redes diferentes (perda/latência/TLS).
6. **Teste de invasão e anti-abuso de contas** (CAPTCHA): só por terceiros / quando houver servidor público.
