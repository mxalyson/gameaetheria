// Lógica pura (sem DOM) para prender etiquetas à área livre da tela; usada por renderer.js e testada em Node
// Prende uma caixa (x = centro, y = topo, em unidades do mundo) dentro da tela e fora das áreas da interface; devolve em SAFE.x/SAFE.y.
export function safeBoxScreen(sx, sy, sw, sh, vw, vh, hud, out) {
  sx = Math.max(sw / 2 + 4, Math.min(vw - sw / 2 - 4, sx));
  sy = Math.max(4, Math.min(vh - sh - 4, sy));
  for (let pass = 0; pass < 2 && hud; pass++) {
    for (const [x0, y0, x1, y1] of hud) {
      if (sx + sw / 2 <= x0 || sx - sw / 2 >= x1 || sy + sh <= y0 || sy >= y1) continue;
      if ((y0 + y1) / 2 < vh / 2) sy = Math.min(vh - sh - 4, y1 + 2); // faixa no alto (cartão, minimapa, menu): desce
      else if (x0 > vw / 2) sx = Math.max(sw / 2 + 4, x0 - sw / 2 - 4); // botões no canto: sai para a esquerda
      else sy = Math.max(4, y0 - sh - 2);
    }
  }
  out.x = sx; out.y = sy;
  return out;
}
