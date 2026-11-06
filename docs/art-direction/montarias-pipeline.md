# Montarias: pipeline de arte (v1 2D de reserva + v2 3D em 8 direções)

Status (2026-11-05): **v2 3D em 8 direções implementada e testada** (testes por arquivo, capturas no Chromium de desktop 844×390 DPR 3; custo medido em CPU/swiftshader). **NÃO validada em iPhone/Android reais.** A arte 2D v1 (2 lados) continua no repositório como reserva automática (carrega junto; é usada enquanto a 3D não chegou ou se faltar).

## v2: atlas 3D em 8 direções (Meshy → `tools/mount-bake.mjs`)
- GLB do dono (fora do Git, `public/labs/iso-poc/art-local/meshy-cenario/`): `mount-frostpack-scout.glb` (lobo, 1 peça), `mount-royal-companions.glb` (2 peças: **índice 0 = cavalo branco**, índice 1 = grifo de asas abertas, **não usado**; o cavalo olha 45° fora de +Z, corrigido com `--yaw=45`), `mount-gryphon-rising.glb` (grifo de asas erguidas = Grifo Dourado), `mount-gryphon-saddle.glb` (grifo de asas dobradas: **reserva, não usado**).
- Comandos usados (rodar na raiz; depois `node tools/bump-assets.mjs`):
  - v3 (2026-11-06, passada nova "trot v2" em `labs/nature/glb.html`: pernas em pêndulo a partir do quadril, pares diagonais sem cortar a barriga, cabeça acena, cauda com atraso; mais quadros):
  - `node tools/mount-bake.mjs meshy-cenario/mount-frostpack-scout.glb wolf -1 trot 10 176 40 --idle --saddle=0,0.68,0.0`
  - `node tools/mount-bake.mjs meshy-cenario/mount-royal-companions.glb horse 0 trot 10 176 40 --idle --yaw=45 --saddle=0,0.7,0`
  - `node tools/mount-bake.mjs meshy-cenario/mount-gryphon-rising.glb gryphon -1 flap 12 176 40 --saddle=0,0.44,0.1`
  - Se o Playwright do projeto não achar o navegador: `PW_CHROMIUM=/caminho/do/chrome node tools/mount-bake.mjs ...`. Os GLB do Meshy NÃO têm esqueleto nem animação (estátua): a passada é sempre deformação por código.
- `tools/mount-bake.mjs` reaproveita `public/labs/nature/glb.html` (`bakeAnim`; acrescentados `--idle`, `track`, `yawParts` e o estilo `flap`) mas grava em `public/assets/mounts/<id>-3d.webp` (alta), `<id>-3d-lo.webp` (baixa, ~112 px no maior lado) e `<id>-3d.json`; **não toca em `public/assets/mobs` nem no índice de mobs**.
- Layout: linha = direção (0 S, 1 SE, 2 L, 3 NE, 4 N, 5 NO, 6 O, 7 SO, para onde a montaria olha; mesma numeração do herói, `viewFromFacing`), coluna = quadro. Lobo/cavalo: 6 quadros de trote + 1 quadro parado SEM deformação (índice 6); grifo: 8 quadros de bater de asas (as asas giram em torno do ombro, corpo sobe na batida), sem quadro parado (paira batendo asas mais devagar). Mesma janela e âncora em todas as vistas, recorte justo comum.
- json: `frames`, `idle`, `cols`, `rows` = 8, `feet` (âncora no chão), `shadow`, `saddle[8]` (sela no quadro parado/0, por vista) e `saddleF[8][quadros]` (sela projetada em CADA vista e quadro, a partir do ponto 3D passado por deformação), tudo em fração da célula. O ponto 3D da sela (`--saddle=fx,fy,fz`, fração da caixa do modelo) foi achado olhando a sobreposição do marcador nas 8 vistas.
- No jogo: a vista vem de `viewFromFacing`-igual (andando = direção do deslocamento real; parado = `a.facing`), quadro do ciclo pela velocidade real (ciclos/s), com leve variação; o herói senta na sela da vista/quadro atual (`mountLift` usa `saddleF`; a montaria é desenhada com a sela sobre `a.x`); `drawMountFront` refaz a montaria abaixo da linha da sela por cima das pernas do herói. Grifo: flutua (seno) e a sombra encolhe.
- Textura medida (`node tools/texture-budget.mjs`, 3D + reserva 2D): lobo 5,7 / cavalo 5,1 / grifo 5,4 MiB na alta; 2,5 / 2,7 / 3,1 na baixa; pior par em cache 11,0 MiB (alta). Células: lobo 168×152, cavalo 153×150, grifo ≈144×132 (x quadros x 8 vistas).
- Limites conhecidos: o quadro "parado" do lobo é a pose de corrida original do Meshy (não há pose de pé); a deformação é por vértice (sem esqueleto): as pernas do cavalo/lobo trocam de lugar mas o trote é simples; as asas do grifo giram rígidas e esticam um pouco na base; o herói não tem pose "sentado" (pose parada elevada, pernas escondidas pela frente da montaria); a barra da capa dos magos é cortada na linha da sela. Variantes futuras: Corcel/Grifo extra (peça 1 de `royal-companions`) e grifo de asas dobradas (`gryphon-saddle`) como montaria planadora.

## v1: arte 2D de reserva (2 lados)
## Fonte e recorte
- Fonte: `docs/art-direction/fontes-montarias/montarias-folha-1.jpg` (2000×1116, fundo branco liso com sombra; lobo, cavalo, grifo em 3 poses de asas, todos olhando para a direita em 3/4). Referências limpas em `fontes-montarias/para-meshy/`.
- `python tools/mount-sheet.py [--preview pasta]` (determinístico; Pillow + numpy + scipy; depois `node tools/bump-assets.mjs`):
  1. recorta cada montaria por caixa; apaga (branco) a ponta de asa do grifo que invade o cavalo; o lobo termina acima da asa do grifo vizinho;
  2. fundo + sombra do chão = pixels claros e pouco saturados ligados à borda (o contorno escuro da arte barra o vazamento); buracos fechados (entre pernas, cauda, crina) saem se forem grandes e quase brancos;
  3. borda sem halo: o alfa vem da máscara erodida 1 px e suavizada; a COR das bordas e dos pixels transparentes vem do pixel interno mais próximo (nunca branco); WebP lossless (sem pré-multiplicar);
  4. grifo: os 3 quadros (asas abertas, erguidas, fechadas) são alinhados pelo corpo (garras/peito) num quadro comum.
- Saída em `public/assets/mounts/`: `<id>.webp` (alta, ~256 px no maior lado), `<id>-lo.webp` (baixa, ~160) e `<id>.json` (quadros, aspecto e âncoras em FRAÇÃO do quadro: `feet`, `seat`, `shadow`). Âncoras medidas à mão na folha (constantes `ANCH` no script).

## No jogo (`render/mount-sprites.js`)
- Lê só `a.mounted` / `a.mountId` / `a.moving` (qualquer ator, inclusive outros jogadores). Carrega sob demanda; no máximo 2 montarias em cache (a do jogador e a dos vizinhos; a 3ª distinta não é desenhada).
- Ordem: `drawMountBack` (sombra + montaria) → herói elevado por `mountLift(a)` na pose parada → `drawMountFront` (refaz a montaria abaixo da sela por cima das pernas, o herói "senta"). Nome/barra sobem por `mountBaseLift`.
- Animação por parâmetros: passo em duas batidas ligado à velocidade REAL (quicar + inclinar + esticar), respiração parado; grifo bate asas pelos 3 quadros (assimétrico, mais rápido ao se mover), flutua ~7 px e a sombra encolhe com a altura. Poeira de corrida reaproveita `drawRunDust`.
- Qualidade 0 usa `-lo`; 1 e 2 usam a imagem cheia.

## Custo (medido em `node tools/texture-budget.mjs`)
Decodificado: lobo 0,2 MiB, cavalo 0,2 MiB, grifo 0,7 MiB (3 quadros) na alta; 0,1 / 0,1 / 0,3 na baixa. Pior par carregado: 1,0 MiB (alta). Muito abaixo da meta de 8 MiB por montaria do plano de 8 direções.

## Limitações v1 (histórico; resolvidas pela v2 quando a arte 3D carrega)
- Só 2 lados: direita e espelho. Andando para cima/baixo a imagem é a mesma, levemente achatada e inclinada; o herói sentado usa as 8 vistas dele, a montaria não. Lobo e cavalo têm UM quadro (as pernas não alternam de verdade; a sensação de galope vem de quicar/inclinar).
- O herói não tem pose "sentado" própria: usa a pose parada, elevada, com as pernas escondidas pela frente da montaria.
- O recorte é de IA (JPEG): contornos suaves, sem arte para trás da montaria.

## Caminho para 8 direções reais (HISTÓRICO: feito na v2 acima)
Meshy (image-to-3D a partir de `para-meshy/`) → GLB de cada montaria → `tools/mob-bake.mjs` (assar 8 direções, ciclo de galope/voo de 6 quadros + parado) → trocar o desenho por atlas no mesmo módulo (o contrato `drawMountBack/mountLift` não muda). Registrado em `docs/roadmap/depende-do-dono.md` (A11).
