# Montarias: pipeline de arte (v1)

Status: **implementado e testado em teste automatizado de arquivos; validado visualmente só no Chromium de desktop (844×390, DPR 3 emulado). NÃO validado em iPhone/Android reais.** Só 2 lados visuais.

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

## Limitações v1 (honestidade)
- Só 2 lados: direita e espelho. Andando para cima/baixo a imagem é a mesma, levemente achatada e inclinada; o herói sentado usa as 8 vistas dele, a montaria não. Lobo e cavalo têm UM quadro (as pernas não alternam de verdade; a sensação de galope vem de quicar/inclinar).
- O herói não tem pose "sentado" própria: usa a pose parada, elevada, com as pernas escondidas pela frente da montaria.
- O recorte é de IA (JPEG): contornos suaves, sem arte para trás da montaria.

## Caminho para 8 direções reais
Meshy (image-to-3D a partir de `para-meshy/`) → GLB de cada montaria → `tools/mob-bake.mjs` (assar 8 direções, ciclo de galope/voo de 6 quadros + parado) → trocar o desenho por atlas no mesmo módulo (o contrato `drawMountBack/mountLift` não muda). Registrado em `docs/roadmap/depende-do-dono.md` (A11).
