# Identidade visual — rascunho v0 (para aprovar)
2026-10-31. Fase **B1** (ADR 0007). Tudo aqui é **proposta**, derivada do que já existe (os 4 heróis, os efeitos, a UI atual); nada foi aplicado ao jogo real. Pode ser aprovado, vetado ou ajustado item a item. A página `http://localhost:5174/labs/iso-poc/identidade.html` mostra a paleta, a UI e os heróis lado a lado.

## 1. Ideia central: "Ecos de ouro"
O jogo se chama *Arena dos Ecos*. O que une os 4 heróis já criados é o **ouro nos acabamentos** (estrela do chapéu, sol do escudo, estola, sinos, pluma) sobre uma cor-mãe de cada classe. Proposta de assinatura:
- **Ouro quente como "assinatura" de tudo que é importante** (herói, item raro, botão principal, título, brilho de habilidade).
- **O eco** como motivo gráfico: **anéis concêntricos** que se espalham (já aparecem nas ondas de choque, na prece e no teleporte). Usar em: seleção de alvo, cooldown das skills, transição de zona, ícone/logo, portais.
- **Luz de topo-esquerda, quente, com contraluz frio** (é a luz usada nos renders dos heróis): vale para tudo, inclusive cenário.

## 2. Tom (decisão sua) 
Proponho **"conto de fadas luminoso com um fundo de mistério"**: personagens fofos e legíveis (miniatura), mas mundo com profundidade e um tom épico leve (Summoners War + anime, como pedido). Alternativas: (a) **mais fofo** (cores mais claras, sem sombra pesada); (b) **mais sombrio** (noite permanente, contraste alto). Escolha antes de B2.

## 3. Paleta (proposta)
| Papel | Cor | Hex | Uso |
|---|---|---|---|
| Ouro eco (assinatura) | ⬤ | `#FFCF4A` (claro `#FFF0A6`, escuro `#C98F12`) | acabamentos, títulos, botão principal, brilho |
| Azul noite (fundo de UI) | ⬤ | `#141A2E` (vidro 88%) | painéis, barras |
| Violeta profundo | ⬤ | `#3B2090` | sombras frias, tinta de contorno |
| Marfim | ⬤ | `#F3E8C8` | texto de título, papel/pergaminho |
| Vida (verde-água) | ⬤ | `#5FD38A` | barra de vida, cura |
| Mana/XP (azul) | ⬤ | `#8FB4FF` | XP, magia |
| Perigo | ⬤ | `#FF6A6A` | dano recebido, alerta |
| Classes | Guerreiro `#4478E0` (azul-real) · Mago `#5B53DC` (índigo) · Arqueiro `#5FA84E` (verde-musgo) · Clérigo `#6FD6BD` (menta) · Místico (futuro) `#6E44D8` + carmesim `#DA3F5C` | | cor de classe em retrato, moldura e brilho |
| Raridades (mantidas) | comum `#C9CCD3` · incomum `#7BD88F` · raro `#5FA8FF` · épico `#B77CFF` · lendário `#FFA53D` | | já existem em `data/items.js`; o lendário passa a ter brilho dourado |
Regra: **no máximo 3 cores de destaque por tela**; ouro sempre significa "importante/valioso".

## 3.1 Formas e contorno
- **Cantos arredondados**, nada pontiagudo de UI; ícones com silhueta grande e simples (legíveis a 40 px no celular).
- **Contorno**: nos personagens, sombreado suave sem contorno preto duro; na UI, linha fina (1–2 px) em ouro escuro sobre vidro.
- **Proporção dos personagens**: cabeça ≈ 1/2 da altura (miniatura), olhos grandes e brilhantes, mãos e pés pequenos, adereço de assinatura grande (chapéu, escudo, cajado).
- **Monstros (B2)**: mesma proporção "boneco", com **um** traço de ouro/eco que mostre que pertencem ao mundo (olhos brilhantes, cristal, runa).

## 4. Luz e cor no mundo
- Luz principal topo-esquerda quente (`#FFF1DC`), contraluz frio (`#BCD4FF`), preenchimento suave. Sombra projetada curta, em violeta-azulado (nunca preto).
- Dia/noite como camada de cor (quente→frio) sem mudar regras; vaga-lumes e partículas douradas como "eco" do mundo (já existem no laboratório).

## 5. Tipografia (proposta; fonte local, sem Google)
- Hoje: **Cinzel** (títulos) + **Nunito** (corpo), ambas **OFL** (livres), carregadas do Google Fonts. Passo B1: **baixar os arquivos e servir localmente** (verificando a licença antes) — melhora privacidade, desempenho e funciona offline/no celular.
- Para identidade mais própria: manter Nunito no corpo (legibilidade) e trocar só o título por uma face display com personalidade (candidatas, a avaliar licença/aparência: *Marcellus*, *Cormorant SC*, *Fraunces*). **Nenhuma foi baixada ainda.**
- Números de dano: Nunito 800 com contorno escuro (já é assim).

## 6. UI própria (proposta visual)
- **Painel de vidro azul-noite** com filete interno dourado e **canto ornamentado** discreto (um "eco" nos cantos).
- **Barra de vida** segmentada com ponta dourada; **XP** fina abaixo.
- **Slots de habilidade**: moldura arredondada com cor da classe; **recarga em anel de eco** (anel que se fecha) em vez de cortina; **dica** com nome, descrição real e recarga (já implementado no laboratório).
- **Buffs**: etiquetas pequenas com ícone, nome e tempo.
- **Botão principal** dourado; secundário em vidro. Tudo com área de toque ≥ 44 px (celular).
- Ícones: um conjunto próprio (não emojis) — decisão de arte para B1/B5: gerados no pipeline dos personagens (conceito → refino) ou desenhados por artista.

## 7. O que o jogo real faria (B5, não agora)
Trocar `style.css` e `ui.js` pelos componentes acima, manter as ações (`data-action`) e a lógica. A tela de créditos entra aqui (`docs/CREDITOS.md`).

## 8. Perguntas abertas
1. **Tom** (§2): luminoso com mistério / mais fofo / mais sombrio?
2. O **ouro** como assinatura e o **eco** (anéis) como motivo: aprova?
3. **Fonte** de título: manter Cinzel (local) ou avaliar uma face nova?
4. **Ícones** próprios: por IA (mesmo pipeline) ou artista?
5. **Logo/nome** na tela de título: "Aetheria — Arena dos Ecos" mantém?
