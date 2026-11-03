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

// Rótulos de NPC no mesmo quadro: ordena por x e, quando a caixa colide com uma já posta no mesmo degrau, sobe em degraus de `step` px (até `maxLevels`).
// boxes = [{ x (centro), w, y? (pés) }]; devolve a elevação (px, >= 0) de cada caixa na ordem de entrada. Só sobe se houver colisão em x (e em y próximos).
export function stackLabels(boxes, step = 14, maxLevels = 3, gap = 4) {
  const lift = boxes.map(() => 0), order = boxes.map((_, i) => i).sort((a, b) => boxes[a].x - boxes[b].x), placed = [];
  for (const i of order) {
    const b = boxes[i];
    let lv = 0;
    for (; lv < maxLevels; lv++) {
      const y = (b.y ?? 0) - lv * step;
      if (!placed.some((p) => Math.abs(p.x - b.x) < (p.w + b.w) / 2 + gap && Math.abs(p.y - y) < step - 1)) break;
    }
    lv = Math.min(lv, maxLevels);
    lift[i] = lv * step; placed.push({ x: b.x, w: b.w, y: (b.y ?? 0) - lv * step });
  }
  return lift;
}
