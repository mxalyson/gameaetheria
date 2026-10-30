// Projeção isométrica (módulo puro, sem DOM). O mundo do jogo continua um plano (x, y); a tela é uma projeção afim dele:
//   sx = (x - y) * scale        sy = (x + y) * scale * tilt - z * scale
// tilt 0.5 = dimétrica 2:1 (≈26,6°); tilt 0.5774 = isométrica "técnica" de 30° (largura:altura ≈ 1,73:1).
export const TILT_2_1 = 0.5;
export const TILT_30 = Math.tan(Math.PI / 6);

export function makeIso({ tilt = TILT_2_1, scale = 1 } = {}) {
  return {
    tilt, scale,
    // z = altura em pixels de tela acima do chão (não faz parte da simulação, que é plana).
    toScreen(x, y, z = 0) { return { x: (x - y) * scale, y: (x + y) * scale * tilt - z * scale }; },
    // Inverso, para um ponto do chão (z = altura em que o ponto de tela está, ex.: tronco do monstro).
    toWorld(sx, sy, z = 0) {
      const u = sx / scale, v = (sy + z * scale) / (scale * tilt);
      return { x: (u + v) / 2, y: (v - u) / 2 };
    },
    // Matriz para ctx.transform(a, b, c, d, e, f): desenha o "plano do chão" (anéis, áreas, chão pintado) já projetado.
    matrix() { return [scale, scale * tilt, -scale, scale * tilt]; },
  };
}

// Direção na tela (ex.: joystick/WASD, "W = para cima na tela") -> direção no mundo, normalizada.
export function screenDirToWorld(dx, dy, tilt = TILT_2_1) {
  const u = dx, v = dy / tilt;
  const wx = (u + v) / 2, wy = (v - u) / 2, len = Math.hypot(wx, wy);
  return len > 1e-9 ? { x: wx / len, y: wy / len } : { x: 0, y: 0 };
}

// Direção no mundo -> vetor na tela (sem normalizar).
export function worldDirToScreen(wx, wy, tilt = TILT_2_1) { return { x: wx - wy, y: (wx + wy) * tilt }; }

// 8 setores de sprite: 0=S (frente, para baixo na tela), 1=SE, 2=L, 3=NE, 4=N, 5=NO, 6=O, 7=SO.
export const SECTORS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
export function dirSector(wx, wy, tilt = TILT_2_1) {
  const s = worldDirToScreen(wx, wy, tilt);
  if (Math.abs(s.x) < 1e-9 && Math.abs(s.y) < 1e-9) return 0;
  const ang = Math.atan2(s.x, s.y); // 0 = para baixo; cresce em direção à direita da tela
  return ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
}
// Ângulo de `facing` do jogo (atan2 no plano do mundo) -> setor.
export const facingSector = (facing, tilt = TILT_2_1) => dirSector(Math.cos(facing), Math.sin(facing), tilt);

// Ordenação por profundidade. Pontos: chave x + y. Objetos com pegada (casas, pilares): usar o canto mais à frente.
export const depthKey = (x, y) => x + y;
export const footprintDepth = (box) => box.maxX + box.maxY;
// Regra clássica: A está atrás de B se não há sobreposição e A termina antes de B começar em x ou em y.
export const isBehind = (a, b) => a.maxX <= b.minX || a.maxY <= b.minY;
export function sortByDepth(items) { return items.sort((p, q) => p.depth - q.depth || p.x - q.x); }
