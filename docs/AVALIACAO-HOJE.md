# Como avaliar o jogo hoje
Atualizado em 2026-10-31. O jogo **real** não foi alterado pelo trabalho de arte desta semana (tudo o que é novo está no laboratório isométrico, que **não** faz parte do jogo). Duas coisas para olhar:

## 0) Online, sem o PC (GitHub Pages — ativo desde 2026-10-31)
- **Jogo:** https://mxalyson.github.io/gameaetheria/ · **Laboratório com os heróis:** https://mxalyson.github.io/gameaetheria/labs/iso-poc/index.html
- Abra no celular em **paisagem**; "Adicionar à tela inicial" instala como app. O progresso fica salvo **só naquele aparelho**.
- A versão online é a do último  (repositório https://github.com/mxalyson/gameaetheria, branch ); atualizar = commit + push (o Pages republica em ~1–2 min).
- Verificado em navegador emulado de celular (844×390, toque): vila carrega, personagem criado, HUD visível, sem erros nem arquivos 404. **Não testado em celular de verdade.**

## 1) O jogo real (é isto que vale como "o jogo")
1. No terminal, na pasta `H:\aetheria`: `npm start`
2. Abra **http://localhost:5174/** no Chrome (PC). Para ver como celular: F12 → ícone de celular → 844×390 (paisagem).
3. Fluxo: **Novo personagem** → escolha a classe (Guerreiro, Mago, Arqueiro, Clérigo) → nome → entrar na **Vila de Lúmen**.
- Controles: **WASD** mover · **mouse** mira · **clique** ataque · **1 2 3** habilidades · **E** conversar · **I** inventário · **C** personagem · **P** spirits · **Q** poção · **H** voltar à vila.
- Portais da vila: leste → Bosque Verdejante (Nv 1–6) → Planície de Cristal (Nv 6–12) → Ruínas Sombrias (Nv 12–20). Cada zona tem um chefe. **Mestre Doran** abre a Arena (duelo e ondas), **Mercadora Lia** é a loja, **Sábia Yun** cuida dos spirits.
- O progresso salva sozinho no navegador (localStorage). Para recomeçar do zero: F12 → Application → Local Storage → apague `aetheria_save_v1` (não verifiquei se o menu ⚙️ tem essa opção).
- Capturas de tela do estado atual: `H:\aetheria-extras\medicoes-e-capturas\jogo-atual\` (título, criação, vila, inventário, personagem, bosque).

**O que avaliar (sugestão de roteiro de 15 min):** criar uma classe → andar pela vila → falar com os 3 NPCs → ir ao Bosque → matar monstros e ver loot/XP → equipar um item → usar as 3 habilidades → enfrentar o chefe → voltar com **H** → abrir Arena. Anote: o que é confuso, o que é lento, o que é feio, o que falta.

## 2) O laboratório isométrico (prova de arte; não é o jogo)
- Com o servidor ligado: **http://localhost:5174/labs/iso-poc/index.html** — no topo há um **seletor de herói**:
  - Mago (desenhado por código — o "antigo") · **Paladino** (Guerreiro, corpo a corpo) · **Aprendiz Arcano** (Mago) · **Franco-atirador** (Arqueiro) · **Sacerdote** (Clérigo).
  - Os heróis em miniatura só aparecem se a pasta `public/labs/iso-poc/art-local/` existir (ela não vai para o Git); nesta máquina ela existe.
- Controles do laboratório: WASD, clique, 1-3, roda do mouse (zoom), **T** alterna 2:1 / 30°, **M** liga/desliga a atmosfera (feixes de luz, névoa, sombras violeta — o tom "luminoso com mistério").
- **Testar o Sacerdote:** escolha "Sacerdote — Clérigo" no seletor. Ele ataca com a maça (corpo a corpo); **1** Luz Sagrada (cura 22% e fere em volta — coluna de luz), **2** Escudo Divino (bolha), **3** Julgamento (raio que atordoa). Para ver a cura, deixe os slimes baterem nele antes (o dano aparece na barra de vida).
- **Passe o mouse sobre cada habilidade** (barra de baixo): aparece o nome, o que ela faz de verdade e a recarga. Ao usar uma skill, o nome dela sobe sobre a cabeça do herói; buffs ativos (Grito de Guerra, Escudo Divino) aparecem como etiqueta com o tempo restante, abaixo da barra de vida.
- Paladino (Guerreiro): **1** Golpe Giratório (onda ao redor), **2** Investida (avança até o cursor e atordoa), **3** Grito de Guerra (**buff**: +35% de dano e −25% de dano recebido por 6 s; não é um ataque — por isso não machuca ninguém).
- Para ver a **morte** do herói: deixe-se matar por vários slimes (`?mobs=40` na URL acelera). Ele tomba, esmaece e renasce.

## O que está decidido e o que não está
- **Fase 2 (levar o visual isométrico para o jogo real): adiada** por decisão do proprietário. Nada disso entra no jogo agora.
- Pendentes: Android (adiado), servidor/multiplayer, mapa/NPCs/equipamentos/saves/evolução, identidade visual própria — ver `docs/roadmap/proximos-sistemas.md`.
- Créditos dos personagens: `docs/CREDITOS.md`.
