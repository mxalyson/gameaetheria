# Pipeline de sprites (proposta validada no PoC isométrico)
Estado: formato **testado** no PoC; convenções **propostas** para aprovação. Código: `public/labs/iso-poc/src/atlas.js`.

## 1. Formato do atlas (igual para arte "assada" por código e para arte de artista)
Um atlas por personagem/espécie, com **uma folha de imagem por clipe** e um JSON de metadados.

```json
{
  "name": "mage",
  "frame": { "w": 160, "h": 176 },      // tamanho LÓGICO de um quadro (a textura tem frame × scale pixels)
  "pivot": { "x": 80, "y": 158 },       // centro dos PÉS, em unidades lógicas
  "scale": 1.5,                         // resolução da textura em relação ao tamanho lógico
  "views": 8,
  "clips": {
    "idle":   { "frames": 6, "fps": 8,  "loop": true,  "release": null },
    "walk":   { "frames": 8, "fps": 12, "loop": true,  "release": null },
    "attack": { "frames": 6, "fps": 16, "loop": false, "release": 3 },
    "skill":  { "frames": 8, "fps": 14, "loop": false, "release": 4 },
    "hit":    { "frames": 3, "fps": 12, "loop": false, "release": null }
  }
}
```
- **Folha do clipe** (`mage_walk.png`): colunas = quadros (0..frames-1), linhas = 8 direções, nesta ordem: `0 S, 1 SE, 2 L, 3 NE, 4 N, 5 NO, 6 O, 7 SO` (S = de frente para a câmera, para baixo na tela).
- `release` = quadro em que o golpe "sai" (projétil, impacto). Base da sincronia animação × simulação.
- Carregar: `loadAtlas(meta, { idle: 'mage_idle.png', ... })`. **Teste automático**: um PNG exportado do atlas assado e recarregado desenha igual ao original (diferença < 1/255 por canal).

## 2. Convenções propostas
| Item | Proposta |
|---|---|
| Direções | 8, desenhadas (sem espelhar), para manter a mão da arma e a assimetria |
| Frente | Sul |
| Pivô | centro dos pés; o renderer posiciona o pivô no ponto projetado do ator |
| Altura do herói | alvo 180–250 px lógicos a zoom 1 para o rosto ser legível (hoje ≈130 px) |
| Margem | deixar folga no topo para efeitos (brilho do cajado, chapéu): o Mago precisou subir de 160 para 176 px de altura |
| Formato | PNG, alfa **não** pré-multiplicado, sem fundo |
| Nomes | `<personagem>_<clipe>.png` + `<personagem>.json` |
| Âncoras (futuro) | pontos nomeados por quadro (`hand_r`, `staff_tip`, `head`) para efeitos saírem do lugar certo |
| Filtro de desenho | `imageSmoothingQuality = 'low'` **sempre** (ver abaixo) |

## 3. Orçamento de memória [MEDIDO no PoC]
RGBA = 4 bytes/pixel; textura de um quadro = (frame × scale)² × 4.
| Conjunto | Resolução | Memória |
|---|---|---|
| Mago (31 quadros × 8 direções) | 1,5× | ≈ 60 MiB |
| Mago | 2× | ≈ 107 MiB |
| Mago | 3× | ≈ 240 MiB (218 MiB medidos com quadro de 160 px; ajustado para 176 px) |
| Geleia (29 quadros × 8 direções, quadro 128) | 1,5× | ≈ 33 MiB |
| Chão da zona 2800×1900 | — | ≈ 20 MiB |
O custo cresce com o **quadrado** da resolução. Com 4 classes e ~9 espécies, a 1,5× passa de 300 MiB se tudo ficar carregado. Mitigações: carregar só o que a zona usa (≈3 espécies), recortar margens transparentes no atlas [PENDENTE], 4 direções + espelho para criaturas simétricas, orçamento fixo (proposto: ≤150 MiB simultâneos).

## 4. Regra de desempenho descoberta no PoC
`ctx.imageSmoothingQuality = 'high'` ou `'medium'` derruba o desenho de sprites de **~84 para ~10 FPS** em 1080p numa GPU Intel UHD (14× mais lento). **Usar `'low'`.** A nitidez vem de assar em resolução maior (`scale`), não do filtro. Também: nunca medir desempenho com o Chromium padrão do Playwright (renderiza por CPU); usar `npm run perf:poc` (GPU).

## 5. Checklist de qualidade de um sprite novo
1. As 8 direções do mesmo quadro têm o mesmo tamanho e o mesmo pivô (sem "pulo" entre direções).
2. Sem tremor entre quadros consecutivos (pés ancorados).
3. Arma/cajado na mão correta em todas as direções.
4. Legível em tamanho real **e** a 1,6× de zoom, em fundo claro e escuro.
5. Margens suficientes para efeitos; nada cortado na borda do quadro.
6. Origem e **licença comercial** documentadas (arquivo `LICENSE`/nota no JSON).
7. Aparece certo no visualizador: `public/labs/iso-poc/sheet.html?who=mage&clips=idle,walk&zoom=1.5`.
