// Atlas de sprites. Mesmo formato para arte "assada" por código e para PNG + JSON feito por artista:
//   meta = { name, frame: {w, h}, pivot: {x, y}, scale, views: 8, clips: { nome: { frames, fps, loop, release, sheet } } }
// Cada clipe é uma folha: colunas = quadros, linhas = 8 direções (0=S, 1=SE, 2=L, 3=NE, 4=N, 5=NO, 6=O, 7=SO).
// `frame` e `pivot` estão em unidades LÓGICAS; a textura real tem `scale` vezes essa resolução (nitidez em telas HiDPI/zoom).
export const VIEWS = 8;

// draw(g, { view, yaw, clip, frame, frames, t }) desenha em unidades lógicas (frame.w × frame.h), pivô já no lugar.
export function bakeAtlas({ name, frame, pivot, clips, scale = 1.5, supersample = 2, draw, onProgress }) {
  const meta = { name, frame, pivot, scale, views: VIEWS, clips: {} };
  const sheets = {};
  const cw = Math.round(frame.w * scale), ch = Math.round(frame.h * scale);
  const ss = Math.round(cw * supersample);
  const tmp = document.createElement('canvas'); tmp.width = ss; tmp.height = Math.round(ch * supersample);
  const tg = tmp.getContext('2d');
  let bytes = 0;
  for (const [cname, c] of Object.entries(clips)) {
    const sheet = document.createElement('canvas');
    sheet.width = cw * c.frames; sheet.height = ch * VIEWS;
    const sg = sheet.getContext('2d');
    sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = 'high';
    for (let view = 0; view < VIEWS; view++) {
      for (let f = 0; f < c.frames; f++) {
        tg.setTransform(1, 0, 0, 1, 0, 0);
        tg.clearRect(0, 0, tmp.width, tmp.height);
        const k = (tmp.width / frame.w);
        tg.setTransform(k, 0, 0, k, 0, 0);
        draw(tg, { view, yaw: (view * Math.PI) / 4, clip: cname, frame: f, frames: c.frames, t: f / c.frames });
        sg.drawImage(tmp, 0, 0, tmp.width, tmp.height, f * cw, view * ch, cw, ch);
      }
    }
    sheets[cname] = sheet;
    bytes += sheet.width * sheet.height * 4;
    meta.clips[cname] = { frames: c.frames, fps: c.fps, loop: !!c.loop, release: c.release ?? null };
    onProgress?.(cname);
  }
  return { meta, sheets, bytes };
}

// Atlas vindo de arquivo (PNG + JSON): mesmo formato, uma imagem por clipe. Permite trocar a arte sem mexer no jogo.
export async function loadAtlas(meta, urls) {
  const sheets = {};
  let bytes = 0;
  for (const cname of Object.keys(meta.clips)) {
    const img = new Image(); img.src = urls[cname];
    await img.decode();
    sheets[cname] = img; bytes += img.naturalWidth * img.naturalHeight * 4;
  }
  return { meta, sheets, bytes };
}

// Desenha um quadro. (x, y) = posição dos PÉS na tela (já projetada). `size` multiplica o tamanho lógico.
export function drawFrame(g, atlas, clip, view, frame, x, y, size = 1, alpha = 1) {
  const { meta, sheets } = atlas, c = meta.clips[clip];
  if (!c) return;
  const sheet = sheets[clip];
  const rows = meta.rows ?? meta.views; // `mirror`: a folha guarda só 5 direções (S,SE,L,NE,N); O/SO/NO são o espelho de L/SE/NE
  const cw = sheet.width / c.frames, ch = sheet.height / rows;
  const f = Math.max(0, Math.min(c.frames - 1, frame));
  const flip = meta.mirror && view > 4, row = flip ? meta.views - view : view;
  if (alpha !== 1) g.globalAlpha = alpha;
  if (flip) {
    g.save(); g.translate(x, y); g.scale(-1, 1);
    g.drawImage(sheet, f * cw, row * ch, cw, ch, -meta.pivot.x * size, -meta.pivot.y * size, meta.frame.w * size, meta.frame.h * size);
    g.restore();
  } else g.drawImage(sheet, f * cw, row * ch, cw, ch, x - meta.pivot.x * size, y - meta.pivot.y * size, meta.frame.w * size, meta.frame.h * size);
  if (alpha !== 1) g.globalAlpha = 1;
}

export const atlasMiB = (a) => +(a.bytes / 1048576).toFixed(1);
