// Gera decoração e colisões de cada zona de forma determinística (mesma semente
// para todos os clientes — necessário para o multiplayer).
import { makeRng, hashString } from '../core/rng.js';
import { ZONES } from '../data/zones.js';

const cache = {};

export function buildLayout(zoneId) {
  if (cache[zoneId]) return cache[zoneId];
  const z = ZONES[zoneId];
  const rng = makeRng(hashString(zoneId));
  const decor = [];
  const obstacles = [];
  const ground = [];
  const trail = [], ponds = [], runes = [];
  const pathSegs = [...(z.paths ?? [])];

  const keepOut = [
    ...(z.portals ?? []).map((p) => ({ x: p.x, y: p.y, r: 170 })),
    ...(z.portals ?? []).map((p) => ({ x: p.tx, y: p.ty, r: 90 })),
    ...(z.npcs ?? []).map((n) => ({ x: n.x, y: n.y, r: 80 })),
    ...(z.spawn ? [{ ...z.spawn, r: 120 }] : []),
    ...(z.boss ? [{ x: z.boss.x, y: z.boss.y, r: 220 }] : []),
    ...(z.plaza ? [z.plaza] : []),
  ];
  const onPath = (x, y, r) => pathSegs.some(([x1, y1, x2, y2]) => segDist(x, y, x1, y1, x2, y2) < 40 + r);
  const free = (x, y, r) =>
    keepOut.every((k) => Math.hypot(x - k.x, y - k.y) > k.r + r) &&
    !onPath(x, y, r) &&
    obstacles.every((o) => (o.w
      ? !(x > o.x - r - 10 && x < o.x + o.w + r + 10 && y > o.y - r - 30 && y < o.y + o.h + r + 10)
      : Math.hypot(x - o.x, y - o.y) > o.r + r + 18));

  for (const h of z.houses ?? []) {
    decor.push({ type: 'house', ...h, y: h.y + h.h, top: h.y });
    obstacles.push({ x: h.x, y: h.y, w: h.w, h: h.h });
  }
  if (z.fountain) {
    decor.push({ type: 'fountain', x: z.fountain.x, y: z.fountain.y });
    obstacles.push({ x: z.fountain.x, y: z.fountain.y, r: 58 });
  }
  for (const p of z.pillars ?? []) {
    decor.push({ type: 'pillar', x: p.x, y: p.y, s: 30, v: 0.9 });
    obstacles.push({ x: p.x, y: p.y, r: 28, block: true });
  }

  // Cenário rico (opt-in por zona). Usa uma semente própria: não altera o sorteio das demais zonas.
  const sc = z.scenery;
  const srng = makeRng(hashString(zoneId + ':scenery'));
  if (sc) {
    const [pa, pb] = z.portals ?? [];
    const a = pa ? { x: pa.x + 70, y: pa.y } : null;
    const b = pb && !sc.trailToBoss ? { x: pb.x - 70, y: pb.y } : z.boss ? { x: z.boss.x - 130, y: z.boss.y } : null;
    if (a && b) {
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 110), ph = srng.range(0, 6.28), amp = sc.trailAmp ?? 230;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const y = a.y + (b.y - a.y) * u + Math.sin(u * 6.28 * 1.5 + ph) * amp * Math.sin(u * Math.PI);
        trail.push({ x: a.x + (b.x - a.x) * u, y: Math.max(160, Math.min(z.h - 160, y)) });
      }
      for (let i = 0; i < trail.length - 1; i++) pathSegs.push([trail[i].x, trail[i].y, trail[i + 1].x, trail[i + 1].y]);
    }
    const clear = (x, y, r) => keepOut.every((k) => Math.hypot(x - k.x, y - k.y) > k.r + r)
      && pathSegs.every(([x1, y1, x2, y2]) => segDist(x, y, x1, y1, x2, y2) > r + 50)
      && ponds.every((p) => Math.hypot(x - p.x, y - p.y) > p.rx + r + 40)
      && runes.every((p) => Math.hypot(x - p.x, y - p.y) > p.r + r + 40);
    for (let i = 0, tries = 0; i < (sc.ponds ?? 0) && tries < 200; tries++) {
      const rx = srng.range(90, 150), ry = srng.range(55, 85), x = srng.range(260, z.w - 260), y = srng.range(260, z.h - 260);
      if (!clear(x, y, rx)) continue;
      const rot = srng.range(-0.4, 0.4);
      ponds.push({ x, y, rx, ry, rot });
      for (const u of [-0.55, 0, 0.55]) obstacles.push({ x: x + Math.cos(rot) * rx * u, y: y + Math.sin(rot) * rx * u, r: ry * 0.95 });
      for (let k = 0; k < 7; k++) {
        const ang = srng.range(0, 6.28);
        decor.push({ type: 'reeds', x: x + Math.cos(ang) * (rx + 6), y: y + Math.sin(ang) * (ry + 6) + 6, s: srng.range(9, 14), v: srng.next() });
      }
      i++;
    }
    for (let i = 0, tries = 0; i < (sc.runes ?? 0) && tries < 200; tries++) {
      const r = srng.range(95, 135), x = srng.range(300, z.w - 300), y = srng.range(300, z.h - 300);
      if (!clear(x, y, r)) continue;
      runes.push({ x, y, r });
      keepOut.push({ x, y, r: r * 0.9 });
      i++;
    }
  }

  const inside = (x, y, m) => !z.circle || Math.hypot(x - z.w / 2, y - z.h / 2) < z.radius - m;

  // Moldura de árvores nas bordas do mapa.
  if (z.border) {
    const type = z.treeType ?? 'tree';
    const ring = (x, y) => {
      const s = rng.range(30, 44);
      decor.push({ type, x, y, s, v: rng.next() });
      obstacles.push({ x, y, r: s * 0.45, block: true });
    };
    for (let x = 0; x <= z.w; x += rng.range(55, 80)) {
      ring(x + rng.range(-10, 10), rng.range(-8, 18));
      ring(x + rng.range(-10, 10), z.h - rng.range(-8, 18));
    }
    // Deixa uma abertura na moldura onde há portal.
    const nearPortal = (west, y) => (z.portals ?? []).some((p) => (west ? p.x < 100 : p.x > z.w - 100) && Math.abs(p.y - y) < 120);
    for (let y = 60; y <= z.h - 60; y += rng.range(55, 80)) {
      if (!nearPortal(true, y)) ring(rng.range(-8, 18), y);
      if (!nearPortal(false, y)) ring(z.w - rng.range(-8, 18), y);
    }
  }

  const place = (type, count, sMin, sMax, collR) => {
    for (let i = 0, tries = 0; i < count && tries < count * 40; tries++) {
      const x = rng.range(70, z.w - 70);
      const y = rng.range(70, z.h - 70);
      const s = rng.range(sMin, sMax);
      if (!inside(x, y, 60) || !free(x, y, s * Math.max(collR, 0.5))) continue;
      decor.push({ type, x, y, s, v: rng.next() });
      if (collR) obstacles.push({ x, y, r: s * collR, block: true });
      i++;
    }
  };
  // Objetos ao longo dos caminhos (ex.: lanternas), alternando os lados. Vêm antes da vegetação para ela os contornar.
  for (const [type, step, off, s, collR] of sc?.along ?? []) {
    for (const [x1, y1, x2, y2] of z.paths ?? []) {
      const len = Math.hypot(x2 - x1, y2 - y1), nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
      for (let d = z.plaza ? z.plaza.r + 35 : step * 0.6; d < len - 40; d += step) {
        for (const side of [1, -1]) {
          const x = x1 + (x2 - x1) * d / len + nx * off * side, y = y1 + (y2 - y1) * d / len + ny * off * side;
          if (!free(x, y, s)) continue;
          decor.push({ type, x, y, s, v: srng.next() });
          if (collR) obstacles.push({ x, y, r: s * collR, block: true });
        }
      }
    }
  }
  // Objetos em posições fixas e canteiros na frente das casas.
  for (const [type, x, y, s, collR] of sc?.fixed ?? []) {
    decor.push({ type, x, y, s, v: srng.next() });
    if (collR) obstacles.push({ x, y, r: s * collR, block: true });
  }
  if (sc?.beds) for (const h of z.houses ?? []) for (const bx of [h.x + 38, h.x + h.w - 38]) { decor.push({ type: 'flowerbed', x: bx, y: h.y + h.h + 30, s: 20, v: srng.next() }); obstacles.push({ x: bx, y: h.y + h.h + 30, r: 20 }); }

  place(z.treeType ?? 'tree', z.decor.trees, 28, 42, 0.45);
  const rockType = z.rockType ?? 'rock';
  place(rockType, z.decor.rocks, rockType === 'pillar' ? 22 : 12, rockType === 'pillar' ? 30 : 22, rockType === 'pillar' ? 0.95 : 0.85);
  place('bush', z.decor.bushes, 12, 18, 0);

  // Detalhes extras (stump, log, fern, ...) com colisão opcional.
  for (const [type, count, sMin, sMax, collR] of sc?.extras ?? []) {
    for (let i = 0, tries = 0; i < count && tries < count * 40; tries++) {
      const x = srng.range(80, z.w - 80), y = srng.range(80, z.h - 80), s = srng.range(sMin, sMax);
      if (!inside(x, y, 60) || !free(x, y, s * Math.max(collR, 0.8))) continue;
      decor.push({ type, x, y, s, v: srng.next() });
      if (collR) obstacles.push({ x, y, r: s * collR, block: true });
      i++;
    }
  }

  for (let i = 0; i < z.decor.flowers; i++) {
    const x = rng.range(20, z.w - 20), y = rng.range(20, z.h - 20);
    if (!inside(x, y, 20)) continue;
    ground.push({ type: rng.chance(0.55) ? 'flower' : 'tuft', x, y, color: rng.pick(z.flowerColors ?? ['#fff']), s: rng.range(0.8, 1.3) });
  }

  return (cache[zoneId] = { decor, obstacles, ground, trail, ponds, runes });
}

export function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
