// Câmera (módulo puro). A câmera vive no MUNDO (foco em x, y) e não conhece pixels.
export const ZOOM_MIN = 0.6, ZOOM_MAX = 2.0;
export const clampZoom = (z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

// Segue o alvo com suavização independente da taxa de quadros (1 - e^(-k dt)) e antecipação na direção do movimento.
export function followStep(cam, target, vel, dt, { stiffness = 6, lookahead = 0.3, maxLook = 140 } = {}) {
  let lx = vel.x * lookahead, ly = vel.y * lookahead;
  const m = Math.hypot(lx, ly);
  if (m > maxLook) { lx *= maxLook / m; ly *= maxLook / m; }
  const k = 1 - Math.exp(-stiffness * dt);
  cam.x += (target.x + lx - cam.x) * k;
  cam.y += (target.y + ly - cam.y) * k;
  return cam;
}

// Limita o foco ao retângulo do mundo (margem em unidades do mundo), para a câmera não mostrar só vazio.
export function clampFocus(cam, zone, margin = 0) {
  cam.x = Math.max(margin, Math.min(zone.w - margin, cam.x));
  cam.y = Math.max(margin, Math.min(zone.h - margin, cam.y));
  return cam;
}
