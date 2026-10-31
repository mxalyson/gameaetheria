# 0007 — Visual inteiro no estilo isométrico, em fases (opção B)
Data: 2026-10-31. Status: **decisão do proprietário** (escolheu "B: visual inteiro" entre A, B e C em `docs/roadmap/proximos-sistemas.md` §1.1). Confirma o destino da 0004; **não** libera ainda nenhuma mudança em `public/src/`.

## Decisão
- O destino do jogo é o **visual inteiro** na mesma linguagem de arte dos heróis em miniatura (0006) e com câmera **isométrica** (0004): personagens, monstros, NPCs, cenário, chão, UI e efeitos. Descartada a opção A ("só os personagens"), que misturaria estilos; a opção C (sem isométrico) fica como plano de recuo se o isométrico se mostrar caro demais.
- A **simulação** (`core/`, `data/`, `game/`) não muda por causa do visual: ela é só o plano x,y e continua a mesma.
- Trabalho em **fases com relatório e aprovação**, na ordem abaixo. O jogo real (`public/src/`) só é tocado quando uma fase disser isso e o proprietário aprovar.

## Fases
| Fase | Entrega | Onde |
|---|---|---|
| **B1** | Guia de identidade visual (paleta, formas, luz, tipografia, motivos) + UI própria (molduras, ícones, barras, fonte local) | `docs/art-direction/` e laboratório |
| **B2** | Monstros e NPCs no mesmo pipeline dos heróis (conceito → 3D → atlas) | laboratório |
| **B3** | Cenário e chão (árvores, casas, água, caminhos) com arte própria, **sem formas geométricas desenhadas por código** | laboratório |
| **B4** | Câmera isométrica no jogo real: projeção, ordem de desenho, mira e toque | `public/src/render` (primeira mudança no jogo real; precisa de backup e tag) |
| **B5** | Migração das telas (loja, inventário, personagem, arena, spirits) para a UI nova e tela de créditos | `public/src/ui` |

## Consequências
- Custo alto e longo: cada fase pede conteúdo novo (arte), não só código. Prazo realista só depois de B1 (quando se vê o tamanho do trabalho de B2/B3).
- Android e servidor seguem adiados e **dependem** de B4/B5 só para o visual; o salvamento versionado (`proximos-sistemas.md` §4) pode andar em paralelo.
- Riscos conhecidos: peso de textura (≈24 MiB por personagem; o atlas do slime é o maior), variação de estilo entre ferramentas de IA, licença do Meshy (CC BY 4.0, atribuição obrigatória: `docs/CREDITOS.md`).
- Continua valendo: personagens e, a partir de B3, também o cenário **não** são desenhados por formas geométricas em código (0006); efeitos (brilho, partículas) seguem procedurais.
