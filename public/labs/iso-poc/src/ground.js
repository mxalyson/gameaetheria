// Chão da zona, pintado UMA vez em coordenadas do mundo (1 px = 1 unidade) e depois projetado com a matriz isométrica.
// O que "deita no chão" fica aqui; tudo que tem altura (árvores, personagens) é sprite em pé, em outra camada.
import { makeRng, hashString } from '../../../src/core/rng.js';
const TAU = Math.PI * 2;

function smooth(g, pts) {
  g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  const l = pts[pts.length - 1]; g.lineTo(l.x, l.y);
}

export function bakeGround(world) {
  const z = world.zone, L = world.layout;
  const rng = makeRng(hashString(world.zoneId + ':iso-ground'));
  const cv = document.createElement('canvas'); cv.width = z.w; cv.height = z.h;
  const g = cv.getContext('2d');
  const base = g.createLinearGradient(0, 0, z.w, z.h); base.addColorStop(0, '#6fc470'); base.addColorStop(0.5, '#5bb26a'); base.addColorStop(1, '#4a9b66');
  g.fillStyle = base; g.fillRect(0, 0, z.w, z.h);
  // manchas largas de cor (relevo de luz e sombra do terreno)
  const tones = ['rgba(210,240,120,0.30)', 'rgba(40,120,110,0.28)', 'rgba(250,230,140,0.18)', 'rgba(30,90,80,0.22)', 'rgba(150,220,150,0.25)'];
  for (let i = 0; i < 160; i++) {
    const x = rng.range(0, z.w), y = rng.range(0, z.h), r = rng.range(80, 300), gr = g.createRadialGradient(x, y, 0, x, y, r), c = rng.pick(tones);
    gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // trilha de terra com bordas macias
  if (L.trail?.length > 1) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [w, c] of [[110, 'rgba(60,45,20,0.20)'], [84, '#a9884f'], [66, '#cba869'], [40, '#e0c383']]) { g.strokeStyle = c; g.lineWidth = w; smooth(g, L.trail); g.stroke(); }
    for (let i = 0; i < 700; i++) { const p = L.trail[Math.floor(rng.range(0, L.trail.length))], a = rng.range(0, TAU), d = rng.range(0, 40); g.fillStyle = rng.chance(0.5) ? 'rgba(110,80,40,0.45)' : 'rgba(255,240,200,0.4)'; g.beginPath(); g.ellipse(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, rng.range(1.5, 4), rng.range(1, 2.4), rng.range(0, 3), 0, TAU); g.fill(); }
  }
  // lagoas
  for (const p of L.ponds ?? []) {
    g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
    g.fillStyle = 'rgba(30,80,50,0.35)'; g.beginPath(); g.ellipse(0, 4, p.rx + 24, p.ry + 22, 0, 0, TAU); g.fill();
    g.fillStyle = '#e1d6a6'; g.beginPath(); g.ellipse(0, 2, p.rx + 12, p.ry + 10, 0, 0, TAU); g.fill();
    const w = g.createRadialGradient(-p.rx * 0.3, -p.ry * 0.4, 4, 0, 0, p.rx); w.addColorStop(0, '#8fe6f2'); w.addColorStop(0.55, '#3fb0d4'); w.addColorStop(1, '#1d6f9a');
    g.fillStyle = w; g.beginPath(); g.ellipse(0, 0, p.rx, p.ry, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.ellipse(-p.rx * 0.12, -p.ry * 0.12, p.rx * 0.68, p.ry * 0.62, 0, 0.2, 2.2); g.stroke();
    g.restore();
  }
  // pontilhado fino de grama (textura)
  for (let i = 0; i < 9000; i++) {
    const x = rng.range(0, z.w), y = rng.range(0, z.h), len = rng.range(3, 7);
    g.strokeStyle = rng.chance(0.5) ? 'rgba(220,255,150,0.22)' : 'rgba(20,80,60,0.20)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng.range(-2, 2), y - len); g.stroke();
  }
  // escurece as bordas da zona (profundidade e leitura do limite do mapa)
  const edge = 220;
  for (const [x0, y0, x1, y1, w, h] of [[0, 0, edge, 0, edge, z.h], [z.w, 0, z.w - edge, 0, edge, z.h], [0, 0, 0, edge, z.w, edge], [0, z.h, 0, z.h - edge, z.w, edge]]) {
    const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(10,40,40,0.55)'); gr.addColorStop(1, 'rgba(10,40,40,0)');
    g.fillStyle = gr; g.fillRect(x1 < x0 ? z.w - edge : 0, y1 < y0 ? z.h - edge : 0, w, h);
  }
  return cv;
}
