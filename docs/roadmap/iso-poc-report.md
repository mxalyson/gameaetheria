# PoC isométrico — Relatório de viabilidade (Fase 1)
Data: 30/10/2026 · Local: `public/labs/iso-poc/` · Estado: **aguardando sua aprovação** (nada aqui está aprovado por mim)

> Legenda: **[TESTADO]** teste automático passa · **[MEDIDO]** número medido · **[VISTO]** conferi em captura de tela · **[PENDENTE]** não feito · **[NÃO VERIFICADO]**.
> Fatos sobre arte: eu **não declaro aprovado** nenhum visual. A aprovação é sua.

## 1. Resumo (o que você precisa saber em 30 segundos)
1. **A migração isométrica é tecnicamente viável sem tocar na simulação.** O PoC usa o `World`, o Mago, as Geleias, as regras de dano e as skills **reais** do jogo, só com uma projeção isométrica por cima. Nenhum arquivo do jogo foi alterado. [TESTADO]
2. **O Canvas 2D aguenta com folga**, se (e só se) usarmos o filtro de imagem certo: na GPU Intel UHD integrada deste PC, **75 FPS em 1080p** em uso, **64 FPS com 120 monstros em tela**, 39–46 FPS num canvas 4K. [MEDIDO] Isso reduz a necessidade de PixiJS, mas **não medi PixiJS**.
3. **Descoberta que quase passou despercebida:** `imageSmoothingQuality = 'high'` (e `'medium'`) derruba o jogo de **~84 para ~10 FPS** em 1080p. Com `'low'` volta a 84. [MEDIDO] Isso vale para o renderer final.
4. **A arte feita por código NÃO atingiu "anime HD".** O Mago é um personagem vetorial estilizado consistente nas 8 direções, mas **o rosto não se lê no tamanho de jogo**. As Geleias ficaram boas. Veredito honesto na seção 5.
5. **O segundo caminho de arte (IA / 3D / artista) não foi testado**: exige chaves de API e custo, e eu não uso credenciais nem gasto sem sua autorização específica (seção 6).

## 2. O que foi construído
Pasta isolada `public/labs/iso-poc/` (não importada por `main.js`). Abra com `npm start` e `http://localhost:5174/labs/iso-poc/index.html`.

| # | Requisito do plano | Estado |
|---|---|---|
| 1 | Cenário isométrico | Implementado [VISTO] |
| 2 | Solo com profundidade e perspectiva | Chão pintado e projetado, sombras, borda de terra com espessura [VISTO] (a borda só aparece perto do limite do mapa, não conferida em captura) |
| 3 | Vegetação e ambiente | 4 carvalhos, pinheiros, arbustos, pedras, tufos, flores, lagoas, trilha, vagalumes [VISTO] |
| 4 | Personagem anime fantasy | **Parcial**: Mago estilizado por código; **não atinge** o padrão pedido (seção 5) |
| 5 | Animação de idle | Implementada [VISTO] |
| 6 | Animação de caminhada | Implementada [TESTADO] |
| 7 | Movimento em 8 direções | [TESTADO]: o setor do sprite e a direção na tela batem nas 8 direções |
| 8 | Um inimigo | Geleia **real** do Bosque, 5 clipes: parada, mover, atacar, dano, morte [VISTO] |
| 9 | Animação de ataque | [TESTADO]: clipe, quadro de disparo, dano real |
| 10 | Uma habilidade mágica | Bola de Fogo **real** (3,5 s de recarga, explosão em área) [TESTADO]. Nova de Gelo e Teleporte disparam pela simulação, mas só a Bola de Fogo tem teste |
| 11 | Partículas e impacto | Brilhos aditivos, explosão, rastro [VISTO]; sem teste automático |
| 12 | Interface básica de vida e skills | Barra de vida e skills com recarga (DOM) [VISTO] |
| 13 | Câmera acompanhando | [TESTADO]: suavização, antecipação, limites e zoom |
| — | Comparação 2:1 × 30° | Os dois implementados atrás de um parâmetro; capturas lado a lado (seção 7) |
| — | Comparação Canvas 2D × PixiJS | **Só o Canvas 2D foi medido** (seção 8) |

Módulos puros (testáveis em Node): `iso.js` (projeção, direção, profundidade), `camera.js`, `anim.js`. Sprites: `atlas.js`, `sprites/rig-mage.js`, `sprites/rig-slime.js`, `props.js`, `ground.js`.

## 3. Medições [MEDIDO]
Máquina: GPU **Intel UHD Graphics integrada**, Chromium com ANGLE/Direct3D11, **headless**, FPS **sem limite de vsync** (capacidade, não o que o monitor mostra). Arquivo bruto: `docs/roadmap/iso-poc/perf-poc.json`. Repetir: `npm run perf:poc`.

| Caso | Atores | Sprites | Parado (FPS) | Em uso (FPS) | Desenho (ms) | Simulação (ms) |
|---|---|---|---|---|---|---|
| 720p, 2:1 | 11 | 208 | 159 | 140 | 1,6 | 0,15–0,29 |
| 1080p, 2:1 | 11 | 299 | 81 | 75 | 2,2–2,9 | 0,5–0,6 |
| 1080p, 40 monstros | 41 | 317 | 81 | 74 | 2,5–2,9 | 0,7–0,8 |
| 1080p, 120 monstros | 121 | 372 | 70 | 64 | 2,9–4,1 | 1,9–2,0 |
| canvas 4K (1080p CSS × DPR 2) | 11 | 299 | 46 | 39 | 5,9–6,4 | 0,8–1,5 |
| 720p, 30° | 11 | 179 | 165 | 148 | 1,1–1,3 | 0,26 |
| 720p, zoom 1,5 | 11 | 133 | 169 | 155 | 1,2–1,3 | 0,26–0,31 |

"Em uso" = andando e lançando Bola de Fogo/Nova de Gelo continuamente. Zero erros de console em todos os casos.
**Meta proposta** (do relatório da Fase 0): 60 FPS em 1080p com ≈150 sprites e ≈200 partículas; ≥30 FPS no pior caso. **Atendida em 1080p; em 4K fica abaixo de 60.**

Limites desta medição: uma máquina só; headless; poucas partículas (o PoC gera 0–20 ao mesmo tempo, **não** estressei com 200); 600 sprites não medidos (máximo medido: 372); sem aparelho móvel; os números variam ±10–15% entre execuções.

Memória de texturas (calculada pelo próprio PoC): heróis e monstros **92,6 MiB** (Mago ≈60, Geleia ≈33, resolução 1,5×) + cenário **23,4 MiB** (chão ≈20 MiB + props ≈3 MiB). A 2× ou 3× (nitidez em tela HiDPI), o Mago sozinho chega a **107 MiB** (medido) e ≈**240 MiB** (218 MiB medidos com quadro de 160 px; ajustado para 176 px). Ver `docs/art-direction/pipeline-sprites.md`.

## 4. Achados técnicos que mudam o plano
1. **Filtro de imagem do Canvas** (seção 1, item 3). Regra para o renderer final: `imageSmoothingQuality = 'low'`; a nitidez vem de assar sprites em resolução maior, não do filtro. Medido: base 11 FPS → `low` 161 FPS (720p).
2. **A simulação remove o monstro 0,6 s depois da morte**, mas a animação de morte da Geleia dura 0,8 s. O renderer precisa de "fantasmas" para terminar a animação (já implementado e [TESTADO]). Qualquer animação de morte longa (chefes) depende disso.
3. **A IA tem "leash" que cura o monstro** quando ele se afasta de casa. Não é um defeito, é regra do jogo; mas afeta qualquer teste ou cena que mova monstros à mão.
4. **Entrada precisa ser guiada por evento**, não por varredura de quadro: com FPS baixo um clique rápido se perdia. Corrigido no PoC.
5. **Sincronia entre golpe e dano.** Hoje o dano é aplicado no instante do comando. No PoC o **comando só vai para a simulação no quadro de disparo da animação** (atraso de ~0,19 s no ataque e ~0,29 s na habilidade): a animação começa na hora, e projétil, dano e recarga acontecem juntos no golpe visual. [TESTADO] Isso funciona **sem alterar a simulação**, mas é um atraso de gameplay e deve virar um dado `hitAt` por ataque/skill (decisão sua, seção 10). Os monstros **ainda não** têm isso: o ataque da Geleia mostra a animação **depois** do dano, porque a IA decide dentro da simulação.
6. **Mira com mouse:** o cursor sobre o corpo de um monstro aponta, no chão, um ponto atrás dele. O PoC resolve testando o retângulo do sprite e mirando nos pés. [TESTADO indiretamente pelo ataque]
7. **A câmera com antecipação desloca o ponto do chão sob o cursor** enquanto se move (normal em ARPG); os testes precisam esperar a câmera assentar.
8. **Os testes por software enganam**: o Chromium do Playwright renderiza por CPU por padrão (≈4–10× mais lento). Medir desempenho só com `npm run perf:poc` (GPU).

## 5. Veredito de arte (caminho A: sprites gerados por código)
Imagens: `docs/roadmap/iso-poc/mago-direcoes.png`, `mago-ataque-habilidade.png`, `geleia-clipes.png`, `poc-720p-zoom1-6.jpg`, `poc-1080p-2x1.jpg`.

**O que funcionou**
- As **8 direções são consistentes entre si**: o corpo é descrito em 3D simplificado e rotacionado, então o cajado muda de mão corretamente e a cabeça/cabelo/capa acompanham. Sem tremores entre frames. [VISTO]
- A **Geleia** ficou boa e expressiva: agacha, salta, avança, pisca ao levar dano e derrete em poça; consistente nas 8 direções. [VISTO]
- O pipeline é **independente da arte**: atlas em PNG + JSON recarregado desenha igual ao atlas assado (diferença média < 1/255 por canal). [TESTADO] Uma arte de artista entra sem mexer no jogo.

**O que NÃO atingiu o padrão pedido (HD anime fantasy)**
- **No tamanho de jogo o rosto do Mago praticamente não aparece**: a aba do chapéu e o cabelo cobrem o rosto no ângulo isométrico. Com zoom 1,6× o personagem tem ≈215 px e ainda se lê como "manto roxo, chapéu e cajado", não como um personagem anime detalhado. [VISTO]
- Estilo **vetorial de contorno grosso**, longe de ilustração. Rosto e cabelo, os pontos mais difíceis por código, ficaram **estilizados demais**.
- O personagem de referência pediu "manto detalhado, rosto expressivo, silhueta reconhecível": a **silhueta** (chapéu pontudo + cajado com cristal) é reconhecível; **rosto expressivo e detalhe de materiais, não**.
- Defeitos que corrigi durante o teste: aba do chapéu cobrindo os olhos, cabeça de costas lisa, clarão de disparo em disco chapado, brilho cortado pela borda do quadro. Ainda sobram imperfeições (mãos e mangas no perfil).

**Conclusão:** o caminho A serve como **andaime técnico** (câmera, profundidade, animação, atlas, desempenho) e para **Geleias e criaturas simples**, mas **não deve ser a arte final dos heróis**. **Não declaro este visual aprovado.**

## 6. Segundo caminho de arte (teste de viabilidade): não executado
O teste paralelo combinado (um personagem por outro caminho) **não foi feito**, por estas razões:
- **IA de imagem (suas skills `nano-banana-pro`, `fal-ai`, `openrouter-img`):** exige chave de API e gera custo. Não uso credenciais nem gasto sem sua autorização específica. Além disso, a **licença comercial do que é gerado varia por provedor** [NÃO VERIFICADO].
- **3D → sprite (Blender):** Blender não está instalado; modelagem e rig são trabalho pesado; licenças de modelos e animações de terceiros precisam ser conferidas.
- **Artista/pacote:** decisão e custo seus.

**O que eu preciso para fazer o teste (se você escolher IA):** 1) autorizar o uso de **uma** das skills de imagem e qual; 2) um **teto de gasto** (por exemplo, até N imagens); 3) a chave já configurada por você (eu não a leio nem a imprimo); 4) confirmar que posso gerar **conceito** (1 personagem, 1 direção, pose neutra) e avaliar a qualidade juntos. Expectativa realista: a IA ajuda no **conceito**; consistência em 8 direções × quadros de animação é onde ela costuma falhar [NÃO VERIFICADO neste projeto].

## 7. Projeção: 2:1 × 30°
Capturas: `poc-720p-2x1.jpg` e `poc-720p-30graus.jpg`. Ambas funcionam; a de 30° mostra o chão um pouco mais "de cima" (menos compressão vertical). **Recomendação: 2:1** (matemática simples, aparência mais "de jogo isométrico"). O parâmetro é `?tilt=30`; tecla `T` alterna em tempo real. **A escolha é sua**, olhando as capturas.

## 8. Canvas 2D × PixiJS
- **Canvas 2D medido:** viável com folga acima (seção 3), inclusive em 1080p com 120 monstros.
- **PixiJS não medido** (sem instalação autorizada). Como o Canvas 2D atingiu a meta em 1080p, **minha recomendação é adiar o PoC de PixiJS** e só abri-lo se, no combate real, surgirem: muitas partículas aditivas simultâneas, iluminação dinâmica por *shader*, ou necessidade de 4K a 60 FPS. O PoC já tem uma costura simples (`drawSprite`, `drawFrame`, `glowSprite`) que facilitaria uma troca de backend.
- Se você quiser a comparação mesmo assim, preciso da autorização para `npm install pixi.js` **somente em `public/labs/`**.

## 9. Estado do repositório
- Criados: `public/labs/iso-poc/**`, `tests/iso-poc.test.js`, `tests/e2e/iso-poc.spec.js`, `tests/perf/**`, `docs/roadmap/iso-poc*`, `docs/art-direction/pipeline-sprites.md`.
- Modificado: `package.json` (só o script `perf:poc`) e documentação.
- **Nenhum arquivo do jogo foi alterado** (`public/src/**`, `index.html`, `server.js`). Nenhuma dependência instalada.
- Testes: **39/39 unitários** e **20/20 no navegador**, estáveis em 3 rodadas seguidas. O PoC tem 8 unitários (projeção, direção, câmera, profundidade, animação) e 7 de navegador (carga, 8 direções, ataque e Bola de Fogo reais, morte com fantasma, profundidade, formato de atlas, câmera e 2:1×30°).
- Arquivo fora do projeto criado por engano por mim: `H:\test-results\perf-poc.json` (2,4 KB; pasta `H:\test-results`). A remoção foi bloqueada pela segurança do sistema e **fica com você**; o script já foi corrigido para gravar dentro do projeto.

## 10. Decisões que preciso de você
1. **Arte:** o caminho A basta só para criaturas? Qual caminho para os heróis (IA para conceito, 3D→sprite, artista/pacote, ou combinação)? Autoriza o teste com IA (seção 6)?
2. **Projeção:** 2:1 ou 30°?
3. **Sincronia dano×animação:** adotar `hitAt` como dado (atraso real do dano, com testes) para jogador **e** monstros?
4. **Tamanho do herói:** para o rosto ser legível, o personagem precisa ter ≈180–250 px de altura (hoje ≈130 px a 720p). Aceita zoom padrão maior ou sprites maiores (mais memória)?
5. **PixiJS:** adiar (recomendado) ou medir?
6. **Aprovar ou rejeitar** este PoC como base técnica para a Fase 2 (personagem de referência), **independente** da arte.

## 11. Riscos novos
- Arte HD continua sendo o gargalo (risco R1 do plano). Memória a 2×/3× cresce 4×/9×.
- A sincronia por *buffering* no cliente não serve para multiplayer: lá, `hitAt` precisa estar na simulação.
- A medição de desempenho é de uma única máquina; falta Android real.
