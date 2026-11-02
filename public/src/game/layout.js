// Gera decoração e colisões de cada zona de forma determinística (mesma semente
// para todos os clientes — necessário para o multiplayer).
import { makeRng, hashString } from '../core/rng.js';
import { ZONES } from '../data/zones.js';

const cache = {};
const TAU = Math.PI * 2;

// ---- rios e pontes ----
// Rio sinuoso norte-sul: x(y) = x0 + amp·sin(2π·y/wl + ph). `ph` põe a 1ª ponte num extremo da curva (tangente vertical),
// então a ponte é sempre horizontal e a lacuna nos obstáculos é um retângulo simples (a sim só conhece círculos e retângulos).
export const riverX = (rv, y) => rv.x + rv.amp * Math.sin((TAU * y) / rv.wl + rv.ph);

function buildRivers(z) {
  return (z.rivers ?? []).map((r) => {
    const rv = { ...r, ph: Math.PI / 2 - (TAU * r.bridges[0]) / r.wl, pts: [], bridges: [] };
    for (let y = -60; y <= z.h + 60; y += 24) rv.pts.push({ x: riverX(rv, y), y });
    rv.bridges = r.bridges.map((by) => ({ x: riverX(rv, by), y: by, hw: r.bridgeHalf ?? 62, len: r.w + 150 }));
    return rv;
  });
}

// O ponto está na água (a menos de `m` da margem)? Pontes não contam: quem chama decide.
export function nearRiver(rv, x, y, m = 0) {
  if (Math.abs(x - rv.x) > rv.amp + rv.w / 2 + m + 6) return false;
  for (let i = 0; i < rv.pts.length - 1; i++) if (segDist(x, y, rv.pts[i].x, rv.pts[i].y, rv.pts[i + 1].x, rv.pts[i + 1].y) < rv.w / 2 + m) return true;
  return false;
}

// Decoração de acampamento por tipo de cenário (só tipos que o renderer já desenha).
const CAMP_DECOR = {
  forest: ['stump', 'fence', 'mushrooms', 'log', 'fence'], plains: ['geode', 'fence', 'mushrooms', 'tallgrass'], ruins: ['brazier', 'rubble', 'brazier', 'rubble'],
  glacier: ['geode', 'rubble', 'geode', 'deadtree'], ember: ['brazier', 'rubble', 'brazier', 'deadtree'],
};
// Peças da ponte: postes nos cantos e guarda-corpo ao longo das duas bordas (madeira nos climas vivos, pedra nas ruínas).
const BRIDGE_DECOR = { ruins: ['brazier', 'rubble', 16, 16], ember: ['brazier', 'rubble', 16, 16] };

export function buildLayout(zoneId) {
  if (cache[zoneId]) return cache[zoneId];
  const z = ZONES[zoneId];
  const rng = makeRng(hashString(zoneId));
  const decor = [];
  const obstacles = [];
  const ground = [];
  const trail = [], ponds = [], runes = [];
  const pathSegs = [...(z.paths ?? [])];
  const rivers = buildRivers(z);
  const wet = (x, y, m) => rivers.some((rv) => nearRiver(rv, x, y, m));

  const keepOut = [
    ...(z.portals ?? []).map((p) => ({ x: p.x, y: p.y, r: 170 })),
    ...(z.portals ?? []).map((p) => ({ x: p.tx, y: p.ty, r: 90 })),
    ...(z.npcs ?? []).map((n) => ({ x: n.x, y: n.y, r: 80 })),
    ...(z.spawn ? [{ ...z.spawn, r: 120 }] : []),
    ...(z.boss ? [{ x: z.boss.x, y: z.boss.y, r: 220 }] : []),
    ...(z.plaza ? [z.plaza] : []),
    ...(z.chests ?? []).map((c) => ({ x: c.x, y: c.y, r: 50 })),
    ...(z.camps ?? []).map((c) => ({ x: c.x, y: c.y, r: c.r })),
    ...(z.miniboss ? [{ x: z.miniboss.x, y: z.miniboss.y, r: 120 }] : []),
    ...rivers.flatMap((rv) => rv.bridges.map((b) => ({ x: b.x, y: b.y, r: 130 }))),
  ];
  const onPath = (x, y, r) => pathSegs.some(([x1, y1, x2, y2]) => segDist(x, y, x1, y1, x2, y2) < 40 + r);
  const free = (x, y, r) =>
    keepOut.every((k) => Math.hypot(x - k.x, y - k.y) > k.r + r) &&
    !onPath(x, y, r) &&
    !wet(x, y, r + 14) &&
    obstacles.every((o) => (o.w
      ? !(x > o.x - r - 10 && x < o.x + o.w + r + 10 && y > o.y - r - 30 && y < o.y + o.h + r + 10)
      : Math.hypot(x - o.x, y - o.y) > o.r + r + 18));

  // Água: círculos ao longo do eixo do rio (só movimento: sem `block`, projéteis e magias passam por cima). Em cada ponte fica uma lacuna
  // de 2·hw de largura, com dois retângulos nos ombros para o rio não "vazar" pelos lados da ponte.
  for (const rv of rivers) {
    const rc = (rv.w / 2) * 0.92;
    for (let i = 0; i < rv.pts.length; i += 2) {
      const p = rv.pts[i];
      if (p.y < -rc || p.y > z.h + rc || rv.bridges.some((b) => Math.abs(p.y - b.y) < b.hw + rc)) continue;
      obstacles.push({ x: p.x, y: p.y, r: rc });
    }
    for (const b of rv.bridges) {
      obstacles.push({ x: b.x - rv.w / 2, y: b.y + b.hw, w: rv.w, h: rc });
      obstacles.push({ x: b.x - rv.w / 2, y: b.y - b.hw - rc, w: rv.w, h: rc });
    }
  }

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
      // A trilha passa pela 1ª ponte de cada rio: pontos de controle 190 antes e depois, em linha reta (sem ondulação) para atravessar na horizontal.
      const amp = sc.trailAmp ?? 230, ctrl = [a];
      for (const rv of [...rivers].sort((p, q) => p.x - q.x)) { const bg = rv.bridges[0]; ctrl.push({ x: bg.x - 190, y: bg.y }, { x: bg.x + 190, y: bg.y }); }
      ctrl.push(b);
      for (let k = 0; k < ctrl.length - 1; k++) {
        const P = ctrl[k], Q = ctrl[k + 1], straight = k % 2 === 1;
        const n = Math.ceil(Math.hypot(Q.x - P.x, Q.y - P.y) / 110), ph = srng.range(0, 6.28);
        for (let i = k ? 1 : 0; i <= n; i++) {
          const u = i / n;
          const y = P.y + (Q.y - P.y) * u + (straight ? 0 : Math.sin(u * 6.28 * 1.5 + ph) * amp * Math.sin(u * Math.PI));
          trail.push({ x: P.x + (Q.x - P.x) * u, y: Math.max(160, Math.min(z.h - 160, y)) });
        }
      }
      for (let i = 0; i < trail.length - 1; i++) pathSegs.push([trail[i].x, trail[i].y, trail[i + 1].x, trail[i + 1].y]);
    }
    const clear = (x, y, r) => keepOut.every((k) => Math.hypot(x - k.x, y - k.y) > k.r + r)
      && !wet(x, y, r + 40)
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
      const s = rng.range(30, 44), v = rng.next();
      if (wet(x, y, 20)) return; // o rio atravessa a moldura: sem árvore dentro d'água
      decor.push({ type, x, y, s, v });
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
  // Lore coletável (placa ou estátua tocável, ver touch-logic.js interactTarget): pequeno obstáculo, com área livre em volta antes da vegetação.
  for (const l of z.lore ?? []) {
    const s = l.kind === 'statue' ? 28 : 16, collR = l.kind === 'statue' ? 0.9 : 0.5;
    keepOut.push({ x: l.x, y: l.y, r: 55 });
    decor.push({ type: l.kind, x: l.x, y: l.y, s, v: srng.next() });
    obstacles.push({ x: l.x, y: l.y, r: s * collR, block: true });
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
    if (!inside(x, y, 20) || wet(x, y, 14)) continue;
    ground.push({ type: rng.chance(0.55) ? 'flower' : 'tuft', x, y, color: rng.pick(z.flowerColors ?? ['#fff']), s: rng.range(0.8, 1.3) });
  }

  // Pontes: postes nos quatro cantos e guarda-corpo nas duas bordas (a faixa de tábuas é pintada no terreno, ver render/scenery.js).
  const bridges = [];
  const [bPost, bRail, bPostS, bRailS] = BRIDGE_DECOR[sc?.kind] ?? ['lantern', 'log', 11, 22];
  for (const rv of rivers) {
    for (const b of rv.bridges) {
      bridges.push({ x: b.x, y: b.y, hw: b.hw, len: b.len, w: rv.w });
      for (const side of [-1, 1]) {
        const y = b.y + side * (b.hw + 2);
        for (const dx of [-0.5, 0.5]) decor.push({ type: bPost, x: b.x + dx * (b.len - 24), y, s: bPostS, v: srng.next() });
        for (const dx of [-0.26, 0.26]) decor.push({ type: bRail, x: b.x + dx * b.len, y, s: bRailS, v: srng.next() });
      }
    }
  }

  // Acampamentos e clareiras: pegadas de objetos em volta do centro (sem colisão) e a lista para o terreno pintar a marca no chão.
  const camps = [];
  for (const c of z.camps ?? []) {
    camps.push({ id: c.id, x: c.x, y: c.y, r: c.r, glade: !!c.glade });
    const kit = CAMP_DECOR[sc?.kind] ?? CAMP_DECOR.forest;
    kit.forEach((type, i) => {
      const a = (i / kit.length) * TAU + srng.range(0, 0.6), d = c.r * srng.range(0.78, 0.95), s = type === 'brazier' ? 16 : srng.range(14, 22);
      decor.push({ type, x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d * 0.8, s, v: srng.next() });
    });
  }

  return (cache[zoneId] = { decor, obstacles, ground, trail, ponds, runes, rivers, bridges, camps });
}

// Posições dos monstros dos acampamentos (determinísticas: mesma zona, mesmo resultado), prontas para a sim criar.
// Nível: igual ao dos monstros soltos naquele x (mais forte a leste) +1, elites +2. `playerLevel` só importa em zonas `scale` (Ruínas, Cinzas).
export function campSpawns(zoneId, playerLevel = 1) {
  const z = ZONES[zoneId];
  if (!z?.camps?.length) return [];
  const { obstacles } = buildLayout(zoneId);
  const rng = makeRng(hashString(zoneId + ':camps'));
  const hi = z.scale ? Math.max(z.level[1], Math.min(30, playerLevel)) : z.level[1];
  const blocked = (x, y) => obstacles.some((o) => (o.w ? x > o.x - 30 && x < o.x + o.w + 30 && y > o.y - 30 && y < o.y + o.h + 30 : Math.hypot(x - o.x, y - o.y) < o.r + 26));
  const out = [];
  for (const c of z.camps) {
    const list = [];
    for (const [mobId, n] of c.mobs) for (let i = 0; i < n; i++) list.push({ mobId, elite: false });
    for (const [mobId, n] of c.elites ?? []) for (let i = 0; i < n; i++) list.push({ mobId, elite: true });
    const base = z.level[0] + (hi - z.level[0]) * (c.x / z.w);
    list.forEach((m, i) => {
      let x = c.x, y = c.y;
      for (let t = 0; t < 14; t++) {
        const ang = (i / list.length) * TAU + rng.range(-0.35, 0.35), d = c.r * rng.range(0.3, 0.7);
        x = c.x + Math.cos(ang) * d; y = c.y + Math.sin(ang) * d;
        if (!blocked(x, y)) break;
      }
      out.push({ camp: c.id, mobId: m.mobId, level: Math.max(1, Math.round(base + (m.elite ? 2 : 1))), x, y, elite: m.elite, hostile: true, glade: !!c.glade });
    });
  }
  return out;
}

// Mini-chefe da zona (um mob existente, mais forte e maior): { mobId, name, level, x, y, elite, miniboss, hpMul, powerMul, sizeMul, respawn } ou null.
export function minibossSpawn(zoneId) {
  const m = ZONES[zoneId]?.miniboss;
  return m ? { mobId: m.id, name: m.name, level: m.level, x: m.x, y: m.y, elite: true, miniboss: true, hpMul: m.hpMul ?? 4, powerMul: m.powerMul ?? 1.4, sizeMul: m.sizeMul ?? 1.5, respawn: m.respawn ?? 240 } : null;
}

export function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
