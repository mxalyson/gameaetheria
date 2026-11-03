// Cenário "rico" (opt-in por zona: z.scenery / z.atmosphere). Mesmo estilo pastel procedural do jogo,
// com terreno variado, árvores e detalhes diversos e atmosfera (luz, névoa, partículas) por zona.
// Só desenha: posições e colisões vêm de game/layout.js (determinístico).
const TAU = Math.PI * 2;

// ---------- utilidades ----------
const toneCache = new Map();
export function tone(hex, amt) {
  const k = hex + amt;
  let v = toneCache.get(k);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  v = '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((c) => c.toString(16).padStart(2, '0')).join('');
  toneCache.set(k, v);
  return v;
}
const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); };
const ellipse = (g, x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); };
const hash = (i, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const mod = (a, n) => ((a % n) + n) % n;

function blob(g, x, y, r, rng) {
  const n = 12, pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU, k = r * rng.range(0.7, 1.15); pts.push([x + Math.cos(a) * k, y + Math.sin(a) * k * 0.8]); }
  g.beginPath();
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  g.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const m = mid(pts[i], pts[(i + 1) % n]); g.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
  g.closePath();
}

function smoothPath(g, pts) {
  g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  const l = pts[pts.length - 1]; g.lineTo(l.x, l.y);
}

// ---------- estilos de terreno por tipo de zona ----------
const STYLE = {
  forest: {
    blobs: [['#b4a46c', 0.30], ['#6aa06a', 0.28], ['#b9dd9b', 0.38], ['#8a7a52', 0.16]], glade: '255,248,200',
    trail: [[92, 'rgba(110,86,52,0.20)'], [70, '#bfa573'], [54, '#d4bb88'], [30, '#dcc595']], specks: ['#a58d5e', '#e8d6a8'],
    shore: ['rgba(70,110,60,0.35)', '#d9cf9f', '#b9a876'], water: ['#79cbe8', '#4c9fcb'],
  },
  plains: {
    blobs: [['#b7e0c9', 0.34], ['#e6f0b5', 0.36], ['#bfe3f0', 0.26], ['#a8c98a', 0.20]], glade: '225,250,255',
    trail: [[92, 'rgba(90,110,130,0.16)'], [70, '#c3cfd6'], [54, '#dce5e9'], [30, '#eef3f4']], specks: ['#a5b2bb', '#ffffff'],
    shore: ['rgba(60,110,150,0.45)', '#dde9e4', '#b7cdc6'], water: ['#7fd6ee', '#3fa8dc'], // V14: margem clara esverdeada e água azul na saturação do Bosque (antes lavanda)
  },
  town: {
    blobs: [['#c9e2a4', 0.34], ['#86c27f', 0.24], ['#e6dca8', 0.20]], glade: '255,248,210',
    trail: [], specks: ['#a79d78', '#efe4c0'], shore: [], water: [],
  },
  // Porto de Marfim: areia clara, margem de areia molhada, água de baía (a textura de lago cobre quando carregou)
  harbor: {
    blobs: [['#f2e4bd', 0.34], ['#e6d2a2', 0.26], ['#f7eed0', 0.30], ['#d9c28f', 0.16]], glade: '255,240,205',
    trail: [], specks: ['#b8a272', '#fff3d2'],
    shore: ['#b9a273', '#e3d4a8', '#cdb98a'], water: ['#8fdbe8', '#3f9fc4'], // margem de areia molhada OPACA (sem faixa translúcida)
  },
  // Cume Gélido: neve, trilha de gelo batido, lagos congelados
  glacier: {
    blobs: [['#f4f9fd', 0.40], ['#c9deef', 0.30], ['#b3cfe6', 0.22], ['#ffffff', 0.30]], glade: '235,248,255',
    trail: [[92, 'rgba(70,100,140,0.18)'], [70, '#a9c3d8'], [54, '#cfe0ee'], [30, '#e8f2f9']], specks: ['#8fb0c8', '#ffffff'],
    shore: ['rgba(110,150,190,0.30)', '#f4f9fd', '#cfe2f0'], water: ['#b4e4f5', '#7fc4e8'],
  },
  // margens dos rios (só as cores de margem/água; o chão dessas zonas é pintado por paintRuinsGround)
  ruins: { shore: ['#14102a', '#4a4666', '#6f6b8d'], water: ['#2a2458', '#1b1838'] }, // margem de pedra opaca
  ember: { shore: ['rgba(10,0,0,0.5)', '#2a1410', '#4a2016'], water: ['#ff7a1e', '#b8381a'] },
};

// ---------- chão: camadas extras assadas no cache do terreno ----------
import { trailPattern, waterPattern, groundTexReady, groundExtra } from './ground-textures.js';
import { bridgeArtReady, drawBridgeSprite, hideBridgeRails } from './nature-sprites.js';

// `streets` (renderer.js) desenha praça e ruas ANTES dos rios e pontes: depois deles a rua cobria a água e a ponte pintada.
// `bounds` {x0,y0,x1,y1} (opcional) = bloco sendo pintado: pula só os DESENHOS fora dele; o rng é consumido igual, então o resultado no bloco é idêntico.
const inb = (b, x, y, m = 24) => !b || (x > b.x0 - m && x < b.x1 + m && y > b.y0 - m && y < b.y1 + m);
export function paintGroundScenery(g, world, rng, streets, bounds) {
  const z = world.zone, L = world.layout, P = z.palette, sc = z.scenery;
  if (sc.kind === 'ruins' || sc.kind === 'ember') paintRuinsGround(g, world, rng);
  else paintNatureGround(g, world, rng, STYLE[sc.kind] ?? STYLE.forest, bounds);
  if (sc.kind === 'plains') paintCrystalDust(g, z, rng, bounds);
  if (sc.kind === 'town' || sc.kind === 'harbor') paintTownCobbles(g, z, rng, bounds);
  if (sc.kind === 'ember') paintLavaCracks(g, z, rng);
  // Seixos soltos para quebrar áreas lisas.
  for (let i = 0; i < Math.round(z.w * z.h / 40000); i++) {
    const x = rng.range(30, z.w - 30), y = rng.range(30, z.h - 30);
    const rx = rng.range(2, 4.5), ry = rng.range(1.5, 3);
    if (!inb(bounds, x, y)) continue;
    g.fillStyle = tone(P.ground2, -0.1); ellipse(g, x, y, rx, ry); g.fill();
    g.fillStyle = tone(P.ground, 0.07); ellipse(g, x - 0.8, y - 0.8, 1.4, 0.9); g.fill();
  }
  // Rios, marcas de acampamento e, por cima, as pontes (o terreno é desenhado em blocos: tudo aqui é por coordenada de mundo).
  streets?.();
  if (sc.groundTex === 'crypt') paintCryptRunes(g, z);
  paintRivers(g, world, rng);
  paintCamps(g, world);
  paintBridges(g, world);
  void L;
}

// Cripta dos Ecos: piso de runas pintado (arte do dono) no centro de cada sala; o resto do chão são as lajes das Ruínas.
function paintCryptRunes(g, z) {
  const im = groundExtra('crypt-runes'); if (!im) return;
  const w = 420, h = w * im.height / im.width, cx = [765, 2060, 3460, 4850];
  for (const x of cx) g.drawImage(im, x - w / 2, z.h / 2 - h / 2 + 20, w, h);
}

const riverPath = (g, pts) => { g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y); };

// Rios: margem em três camadas, água (textura pintada quando carregou), e acabamento por clima — gelo no Cume, lava nas Cinzas, água turva nas Ruínas.
function paintRivers(g, world, rng) {
  const rivers = world.layout.rivers, kind = world.zone.scenery.kind;
  if (!rivers?.length) return;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const S = STYLE[kind] ?? STYLE.forest;
  for (const rv of rivers) {
    const w = rv.w, pts = rv.pts, stroke = (lw, style) => { g.lineWidth = lw; g.strokeStyle = style; riverPath(g, pts); g.stroke(); };
    if (kind === 'ember') { // lava: crosta escura, brasa, núcleo incandescente
      // margem de basalto escura e OPACA (nada de faixa translúcida), depois brasa -> núcleo incandescente
      stroke(w + 54, '#140806'); stroke(w + 34, '#241210'); stroke(w + 16, '#3a1a12');
      stroke(w + 4, '#7a2412'); stroke(w, '#c8421a'); stroke(w * 0.74, '#ff6a1e'); stroke(w * 0.46, '#ff9a30'); stroke(w * 0.2, '#ffd27a'); stroke(w * 0.07, '#fff0c0');
      g.globalAlpha = 0.55; g.strokeStyle = '#ffb347'; g.lineWidth = 3; g.setLineDash([26, 40]); riverPath(g, pts); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; // rachaduras de brasa na correnteza
      continue;
    }
    stroke(w + 50, S.shore[0]); stroke(w + 30, S.shore[1]); stroke(w + 12, S.shore[2]);
    const water = waterPattern(g, kind);
    if (water) stroke(w, water);
    else { const gr = g.createLinearGradient(rv.x - w / 2, 0, rv.x + w / 2, 0); gr.addColorStop(0, S.water[0]); gr.addColorStop(1, S.water[1]); stroke(w, gr); }
    if (kind === 'glacier') { stroke(w - 8, 'rgba(236,248,255,0.55)'); stroke(w * 0.5, 'rgba(255,255,255,0.28)'); } // gelo por cima da água
    else if (kind === 'ruins') { stroke(w, '#1b1838'); stroke(w * 0.78, '#262150'); stroke(w * 0.36, 'rgba(120,150,210,0.22)'); } // água escura e opaca, com um brilho frio no meio
    else { if (kind === 'plains') stroke(w, 'rgba(30,140,220,0.40)'); stroke(w * 0.5, 'rgba(255,255,255,0.10)'); } // planície: azul por cima da textura de cristal, que é lavanda (V14)
    // margem: pedrinhas claras e junco/espuma ao longo das duas bordas (determinístico, mesmo rng do terreno)
    g.fillStyle = kind === 'glacier' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.45)';
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i], side = rng.chance(0.5) ? 1 : -1;
      ellipse(g, p.x + side * (w / 2 + rng.range(-2, 6)), p.y + rng.range(-8, 8), rng.range(2, 5), rng.range(1.2, 2.6)); g.fill();
    }
  }
}

// Marca no chão: acampamento = terra batida com anel de pedras; clareira de elite = mancha avermelhada com anel rúnico (aviso de perigo).
function paintCamps(g, world) {
  const camps = world.layout.camps, kind = world.zone.scenery.kind;
  if (!camps?.length) return;
  for (const c of camps) {
    if (c.glade) {
      const gr = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
      gr.addColorStop(0, 'rgba(170,40,70,0.30)'); gr.addColorStop(0.75, 'rgba(120,30,60,0.16)'); gr.addColorStop(1, 'rgba(120,30,60,0)');
      g.fillStyle = gr; g.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
      g.strokeStyle = 'rgba(220,80,100,0.55)'; g.lineWidth = 2.5; g.setLineDash([14, 10]);
      g.save(); g.translate(c.x, c.y); g.scale(1, 0.85); circle(g, 0, 0, c.r * 0.82); g.stroke(); g.restore(); g.setLineDash([]);
    } else {
      const sand = trailPattern(g, kind);
      g.fillStyle = 'rgba(40,28,16,0.22)'; ellipse(g, c.x, c.y + 4, c.r * 0.46, c.r * 0.38); g.fill();
      g.fillStyle = sand ?? '#bfa573'; ellipse(g, c.x, c.y, c.r * 0.42, c.r * 0.34); g.fill();
      g.strokeStyle = 'rgba(60,40,20,0.35)'; g.lineWidth = 2; ellipse(g, c.x, c.y, c.r * 0.42, c.r * 0.34); g.stroke();
    }
  }
}

// Pontes: sombra na água, tábuas (madeira) ou lajes (ruínas, cinzas) sobre a textura de trilha da zona, vigas nas bordas.
// Pontes de madeira: sprite do Meshy (nature-sprites.js); o desenho por código abaixo só vale para as de pedra (ainda sem arte) e para ?cenario=original.
function paintBridges(g, world) {
  const bridges = world.layout.bridges, kind = world.zone.scenery.kind;
  if (!bridges?.length) return;
  const stone = kind === 'ruins' || kind === 'ember', pat = trailPattern(g, kind);
  const art = !stone && bridgeArtReady();
  if (art) hideBridgeRails(world);
  for (const b of bridges) {
    if (art) { drawBridgeSprite(g, b); continue; }
    const x0 = b.x - b.len / 2, y0 = b.y - b.hw, h = b.hw * 2;
    g.fillStyle = 'rgba(8,16,36,0.30)'; g.fillRect(x0 + 8, y0 + 12, b.len, h);
    g.fillStyle = stone ? '#6f6b8d' : '#8a5f38'; g.fillRect(x0, y0, b.len, h);
    if (pat) { g.globalAlpha = stone ? 0.8 : 0.4; g.fillStyle = pat; g.fillRect(x0, y0, b.len, h); g.globalAlpha = 1; }
    g.lineWidth = 1.6;
    if (stone) {
      g.strokeStyle = 'rgba(30,24,60,0.45)';
      for (let x = x0 + 34; x < x0 + b.len - 10; x += 36) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + h); g.stroke(); }
      g.beginPath(); g.moveTo(x0, b.y); g.lineTo(x0 + b.len, b.y); g.stroke();
    } else {
      for (let x = x0 + 18; x < x0 + b.len - 6; x += 18) {
        g.strokeStyle = 'rgba(48,26,10,0.55)'; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + h); g.stroke();
        g.strokeStyle = 'rgba(255,226,170,0.20)'; g.beginPath(); g.moveTo(x + 1.5, y0); g.lineTo(x + 1.5, y0 + h); g.stroke();
      }
    }
    for (const yy of [y0 - 5, y0 + h - 7]) { // vigas
      g.fillStyle = stone ? '#55507a' : '#5f4026'; g.fillRect(x0 - 4, yy, b.len + 8, 12);
      g.fillStyle = stone ? '#8d89ab' : '#8a6038'; g.fillRect(x0 - 4, yy, b.len + 8, 4);
    }
  }
}

// Cinzas Ardentes: rachaduras de lava no basalto.
function paintLavaCracks(g, z, rng) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  const cracks = [];
  for (let i = 0; i < Math.round(z.w * z.h / 90000); i++) {
    let x = rng.range(0, z.w), y = rng.range(0, z.h); const pts = [[x, y]];
    for (let k = 0; k < 5; k++) { x += rng.range(-30, 30); y += rng.range(6, 28); pts.push([x, y]); }
    cracks.push(pts);
  }
  for (const [lw, c] of [[7, 'rgba(255,90,20,0.16)'], [3.2, 'rgba(255,120,40,0.55)'], [1.3, 'rgba(255,220,140,0.85)']]) {
    g.lineWidth = lw; g.strokeStyle = c;
    for (const pts of cracks) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); g.stroke(); }
  }
}

// Cume Gélido (V29): o chão era quase liso. Placas de gelo mais escuras, montes de neve com sombra e rachaduras, tudo determinístico (hash, sem mexer na sequência do rng do terreno).
function paintIceDetail(g, z) {
  const area = z.w * z.h;
  for (let i = 0, n = Math.round(area / 150000); i < n; i++) { // placas de gelo azulado com brilho
    const x = hash(i, 11) * z.w, y = hash(i, 12) * z.h, rx = 70 + hash(i, 13) * 150, ry = rx * (0.4 + hash(i, 14) * 0.3), rot = (hash(i, 15) - 0.5) * 0.6;
    g.fillStyle = 'rgba(120,165,205,0.26)'; ellipse(g, x, y, rx, ry, rot); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; ellipse(g, x - rx * 0.12, y - ry * 0.18, rx * 0.7, ry * 0.55, rot); g.fill();
  }
  for (let i = 0, n = Math.round(area / 110000); i < n; i++) { // montes de neve: sombra azul embaixo, topo branco
    const x = hash(i, 21) * z.w, y = hash(i, 22) * z.h, rx = 26 + hash(i, 23) * 54, ry = rx * 0.5;
    g.fillStyle = 'rgba(110,150,190,0.38)'; ellipse(g, x + rx * 0.12, y + ry * 0.28, rx, ry); g.fill();
    const gr = g.createRadialGradient(x - rx * 0.2, y - ry * 0.4, 1, x, y, rx); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#dcebf6');
    g.fillStyle = gr; ellipse(g, x, y, rx * 0.92, ry * 0.88); g.fill();
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0, n = Math.round(area / 90000); i < n; i++) { // rachaduras
    let x = hash(i, 31) * z.w, y = hash(i, 32) * z.h, a = hash(i, 33) * TAU;
    const pts = [[x, y]]; for (let k = 0; k < 5; k++) { a += (hash(i, 40 + k) - 0.5) * 1.3; x += Math.cos(a) * (18 + hash(i, 50 + k) * 26); y += Math.sin(a) * (18 + hash(i, 60 + k) * 26) * 0.7; pts.push([x, y]); }
    for (const [dx, dy, col, lw] of [[0, 0, 'rgba(70,110,160,0.55)', 1.8], [1.2, 1.2, 'rgba(255,255,255,0.7)', 1]]) {
      g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); pts.forEach(([px, py], j) => (j ? g.lineTo(px + dx, py + dy) : g.moveTo(px + dx, py + dy))); g.stroke();
    }
  }
}

function paintNatureGround(g, world, rng, S, bounds) {
  const z = world.zone, L = world.layout;
  const blobs = S.blobs;
  for (let i = 0; i < Math.round(z.w * z.h / 80000); i++) {
    const [c, a] = rng.pick(blobs);
    g.globalAlpha = groundTexReady() ? a * 0.3 : a; g.fillStyle = c;
    blob(g, rng.range(0, z.w), rng.range(0, z.h), rng.range(60, 190), rng); g.fill();
  }
  g.globalAlpha = 1;
  // Clareiras: luz no chão.
  for (let i = 0; i < 6; i++) {
    const x = rng.range(250, z.w - 250), y = rng.range(250, z.h - 250), r = rng.range(120, 220);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${S.glade},0.30)`); gr.addColorStop(1, `rgba(${S.glade},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (z.scenery.kind === 'glacier') paintIceDetail(g, z);
  // Trilha de terra batida.
  if (L.trail.length > 1) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const sand = trailPattern(g, world.zone.scenery.kind);
    for (const [w, c] of S.trail) {
      if (sand && w === 30) continue;
      g.strokeStyle = sand && w === 54 ? sand : c; g.lineWidth = sand && w === 54 ? 58 : w; smoothPath(g, L.trail); g.stroke();
    }
    for (let i = 0; i < L.trail.length * 5; i++) {
      const p = L.trail[Math.floor(rng.range(0, L.trail.length))], a = rng.range(0, TAU), d = rng.range(18, 44);
      g.fillStyle = rng.chance(0.5) ? S.specks[0] : S.specks[1];
      const sx = p.x + Math.cos(a) * d, sy = p.y + Math.sin(a) * d, sw = rng.range(1.5, 3.5), sh = rng.range(1, 2.2);
      if (inb(bounds, sx, sy)) { ellipse(g, sx, sy, sw, sh); g.fill(); }
    }
  }
  // Lagoas com margem, água em duas cores e vitórias-régias.
  for (const p of L.ponds) {
    g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
    g.fillStyle = S.shore[0]; ellipse(g, 0, 6, p.rx + 26, p.ry + 24); g.fill();
    g.fillStyle = S.shore[1]; ellipse(g, 0, 3, p.rx + 14, p.ry + 12); g.fill();
    g.fillStyle = S.shore[2]; ellipse(g, 0, 4, p.rx + 5, p.ry + 5); g.fill();
    const gr = g.createLinearGradient(0, -p.ry, 0, p.ry);
    gr.addColorStop(0, S.water[0]); gr.addColorStop(1, S.water[1]);
    g.fillStyle = waterPattern(g, z.scenery.kind) ?? gr; ellipse(g, 0, 0, p.rx, p.ry); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.22)'; ellipse(g, -p.rx * 0.25, -p.ry * 0.35, p.rx * 0.5, p.ry * 0.22); g.fill();
    for (let i = 0; i < (z.scenery.kind === 'harbor' ? 0 : 5); i++) { // baía do porto: água limpa, sem vitórias-régias
      const a = rng.range(0, TAU), d = rng.range(0.15, 0.7), x = Math.cos(a) * p.rx * d, y = Math.sin(a) * p.ry * d, r = rng.range(8, 13);
      g.fillStyle = '#58a85a'; ellipse(g, x, y, r, r * 0.6); g.fill();
      g.fillStyle = '#4a9550'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r, y - r * 0.2); g.lineTo(x + r, y + r * 0.2); g.closePath(); g.fill();
      if (i % 2 === 0) { g.fillStyle = '#ffb3d1'; circle(g, x - 1, y - 1, 3); g.fill(); g.fillStyle = '#fff3a0'; circle(g, x - 1, y - 1, 1.2); g.fill(); }
    }
    g.restore();
  }
}

// Planície: poeira de cristal (brilhos de quatro pontas) espalhada pelo chão.
function paintCrystalDust(g, z, rng, bounds) {
  for (let i = 0; i < Math.round(z.w * z.h / 26000); i++) {
    const x = rng.range(20, z.w - 20), y = rng.range(20, z.h - 20), r = rng.range(2.5, 5.5);
    g.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.75)' : 'rgba(170,225,255,0.65)';
    if (!inb(bounds, x, y)) continue;
    g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.28, y - r * 0.28); g.lineTo(x + r, y); g.lineTo(x + r * 0.28, y + r * 0.28);
    g.lineTo(x, y + r); g.lineTo(x - r * 0.28, y + r * 0.28); g.lineTo(x - r, y); g.lineTo(x - r * 0.28, y - r * 0.28); g.closePath(); g.fill();
  }
}

// Vila: pedrinhas de calçamento ao longo dos caminhos e da praça.
function paintTownCobbles(g, z, rng, bounds) {
  const stone = () => { g.fillStyle = rng.chance(0.5) ? 'rgba(150,130,100,0.35)' : 'rgba(255,255,255,0.35)'; };
  for (const [x1, y1, x2, y2] of z.paths ?? []) {
    const len = Math.hypot(x2 - x1, y2 - y1), nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
    for (let i = 0; i < len / 7; i++) {
      const u = rng.next(), off = rng.range(-28, 28);
      stone();
      const cx = x1 + (x2 - x1) * u + nx * off, cy = y1 + (y2 - y1) * u + ny * off, ca = rng.range(2.5, 5), cb = rng.range(1.8, 3.2), cr = rng.range(0, 3);
      if (inb(bounds, cx, cy)) { ellipse(g, cx, cy, ca, cb, cr); g.fill(); }
    }
  }
  if (z.plaza) for (let i = 0; i < 160; i++) {
    const a = rng.range(0, TAU), d = Math.sqrt(rng.next()) * (z.plaza.r - 18);
    stone();
    const cx = z.plaza.x + Math.cos(a) * d, cy = z.plaza.y + Math.sin(a) * d, ca = rng.range(2.5, 5), cb = rng.range(1.8, 3.2), cr = rng.range(0, 3);
    if (inb(bounds, cx, cy)) { ellipse(g, cx, cy, ca, cb, cr); g.fill(); }
  }
}

function paintRuinsGround(g, world, rng) {
  const z = world.zone, L = world.layout;
  // Lajes rachadas em manchas irregulares.
  for (let i = 0; i < (groundTexReady() ? 0 : Math.round(z.w * z.h / 120000)); i++) {
    const x = rng.range(80, z.w - 80), y = rng.range(80, z.h - 80), r = rng.range(90, 210);
    g.save(); blob(g, x, y, r, rng); g.clip();
    g.fillStyle = 'rgba(90,86,120,0.28)'; g.fillRect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
    const sw = 58, sh = 40;
    for (let yy = y - r * 1.2, row = 0; yy < y + r * 1.2; yy += sh, row++) {
      for (let xx = x - r * 1.2 + (row % 2) * (sw / 2); xx < x + r * 1.2; xx += sw) {
        g.fillStyle = rng.chance(0.25) ? 'rgba(210,205,235,0.18)' : rng.chance(0.3) ? 'rgba(40,36,70,0.12)' : 'rgba(0,0,0,0)';
        g.fillRect(xx + 1, yy + 1, sw - 2, sh - 2);
        g.strokeStyle = 'rgba(40,36,70,0.28)'; g.lineWidth = 1.5; g.strokeRect(xx, yy, sw, sh);
      }
    }
    g.restore();
  }
  // Trilha de lajes até o guardião.
  if (L.trail.length > 1) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const slabs = trailPattern(g, 'ruins');
    for (const [w, c] of [[96, 'rgba(25,20,50,0.28)'], [76, '#6f6b8d'], [62, '#8d89ab'], [50, '#9a96b8']]) {
      if (slabs && w === 50) continue;
      g.strokeStyle = slabs && w === 62 ? slabs : c; g.lineWidth = w; smoothPath(g, L.trail); g.stroke();
    }
    g.strokeStyle = 'rgba(40,36,70,0.35)'; g.lineWidth = 1.5;
    for (let i = 0; i < L.trail.length - 1; i++) {
      const a = L.trail[i], b = L.trail[i + 1], ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
      for (let u = 0; u < 1; u += 0.5) {
        const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
        g.beginPath(); g.moveTo(x - Math.cos(ang) * 25, y - Math.sin(ang) * 25); g.lineTo(x + Math.cos(ang) * 25, y + Math.sin(ang) * 25); g.stroke();
      }
    }
  }
  // Musgo e rachaduras.
  for (let i = 0; i < (world.zone.scenery.kind === 'ember' ? 0 : 40); i++) {
    g.globalAlpha = 0.3; g.fillStyle = '#6f9a84';
    blob(g, rng.range(0, z.w), rng.range(0, z.h), rng.range(25, 70), rng); g.fill();
  }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(30,26,60,0.4)'; g.lineWidth = 1.6; g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    let x = rng.range(0, z.w), y = rng.range(0, z.h);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += rng.range(-18, 18); y += rng.range(4, 18); g.lineTo(x, y); }
    g.stroke();
  }
  // Círculos rúnicos (a luz pulsante é desenhada à parte, a cada quadro).
  for (const r of L.runes) {
    g.save(); g.translate(r.x, r.y);
    g.strokeStyle = 'rgba(30,24,70,0.55)'; g.lineWidth = 5; circle(g, 0, 0, r.r); g.stroke();
    g.strokeStyle = 'rgba(190,170,255,0.55)'; g.lineWidth = 2; circle(g, 0, 0, r.r); g.stroke(); circle(g, 0, 0, r.r * 0.72); g.stroke();
    g.beginPath();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, r0 = r.r * 0.78, r1 = r.r * 0.94; g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.9); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1 * 0.9); }
    g.stroke();
    g.beginPath();
    for (let i = 0; i <= 5; i++) { const a = ((i * 2) % 5) / 5 * TAU - Math.PI / 2; const x = Math.cos(a) * r.r * 0.6, y = Math.sin(a) * r.r * 0.6; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    g.restore();
  }
}

// ---------- efeitos por quadro, no mundo (sob os atores) ----------
export function drawGroundLife(g, world, t, vis) {
  const L = world.layout;
  for (const p of L.ponds) {
    if (!vis(p.x, p.y)) continue;
    g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const u = (t * 0.22 + i / 3 + p.x * 0.001) % 1;
      g.globalAlpha = 0.6 * (1 - u);
      ellipse(g, Math.sin(i * 2.3 + p.y) * p.rx * 0.35, Math.cos(i * 1.7) * p.ry * 0.3, p.rx * 0.08 + u * p.rx * 0.22, p.ry * 0.05 + u * p.ry * 0.16); g.stroke();
    }
    g.globalAlpha = 1; g.fillStyle = '#fff';
    for (let i = 0; i < 6; i++) {
      const tw = Math.max(0, Math.sin(t * 2.2 + i * 1.9 + p.x));
      if (tw < 0.6) continue;
      g.globalAlpha = tw; ellipse(g, Math.cos(i * 2.1) * p.rx * 0.6, Math.sin(i * 3.7) * p.ry * 0.55, 3, 1); g.fill();
    }
    g.globalAlpha = 1; g.restore();
  }
  // Rios: brilho/ondulação por quadro só nos trechos visíveis (poucos pontos); lava pulsa em aditivo.
  const kind = world.zone.scenery?.kind;
  for (const rv of L.rivers ?? []) {
    for (let i = 0; i < rv.pts.length; i += 3) {
      const p = rv.pts[i];
      if (!vis(p.x, p.y)) continue;
      if (kind === 'ember') {
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + i * 0.9);
        g.globalCompositeOperation = 'lighter';
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, rv.w * 0.9);
        gr.addColorStop(0, `rgba(255,140,50,${0.16 + pulse * 0.14})`); gr.addColorStop(1, 'rgba(255,100,30,0)');
        g.fillStyle = gr; g.fillRect(p.x - rv.w, p.y - rv.w, rv.w * 2, rv.w * 2);
        g.fillStyle = `rgba(255,220,140,${0.4 * pulse})`; circle(g, p.x + Math.sin(i * 2.1 + t) * rv.w * 0.25, p.y + Math.cos(i * 1.3) * 10, 2.2); g.fill();
        g.globalCompositeOperation = 'source-over';
      } else {
        const tw = Math.max(0, Math.sin(t * 1.8 + i * 1.7));
        if (tw < 0.4) continue;
        g.fillStyle = `rgba(255,255,255,${0.55 * tw})`;
        ellipse(g, p.x + Math.sin(i * 3.1) * rv.w * 0.3, p.y + Math.cos(i * 2.3 + t * 0.6) * 6, 7 + tw * 4, 1.4); g.fill();
      }
    }
  }
  // Clareiras de elite: o anel pulsa de leve (aviso).
  for (const c of L.camps ?? []) {
    if (!c.glade || !vis(c.x, c.y)) continue;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2 + c.x * 0.01);
    g.strokeStyle = `rgba(255,90,110,${0.12 + pulse * 0.2})`; g.lineWidth = 3;
    g.save(); g.translate(c.x, c.y); g.scale(1, 0.85); circle(g, 0, 0, c.r * (0.84 + pulse * 0.05)); g.stroke(); g.restore();
  }
  if (L.runes.length) {
    g.globalCompositeOperation = 'lighter';
    for (const r of L.runes) {
      if (!vis(r.x, r.y)) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.6 + r.x * 0.01);
      g.strokeStyle = `rgba(170,140,255,${0.25 + pulse * 0.4})`; g.lineWidth = 3;
      g.save(); g.translate(r.x, r.y); g.scale(1, 0.9); circle(g, 0, 0, r.r * 0.72); g.stroke(); g.restore();
      const gr = g.createRadialGradient(r.x, r.y, 0, r.x, r.y, r.r);
      gr.addColorStop(0, `rgba(150,120,255,${0.10 + pulse * 0.1})`); gr.addColorStop(1, 'rgba(150,120,255,0)');
      g.fillStyle = gr; g.fillRect(r.x - r.r, r.y - r.r, r.r * 2, r.r * 2);
    }
    g.globalCompositeOperation = 'source-over';
  }
}

// ---------- árvores com variedade ----------
export function drawTreeRich(g, d, t, z, player) {
  const v = d.v, s = d.s;
  const variant = v < 0.4 ? 0 : v < 0.68 ? 1 : v < 0.86 ? 2 : 3;
  const jit = (((v * 97) % 1) - 0.5) * 0.14;
  const base = variant === 3 && z.scenery.accent ? z.scenery.accent : z.treeColors;
  const [c0, c1, c2] = base.map((c) => tone(c, jit));
  const behind = player && Math.abs(player.x - d.x) < s && player.y < d.y && player.y > d.y - s * 2.4;
  const th = variant === 1 ? 22 : 16;
  g.fillStyle = '#7a5a40'; g.fillRect(d.x - 4, d.y - th, 8, th);
  g.fillStyle = '#5f4430'; g.fillRect(d.x + 1, d.y - th, 3, th);
  g.globalAlpha = behind ? 0.45 : 1;
  const sway = Math.sin(t * 0.8 + v * 10) * 1.2;
  const clump = (cx, cy, r, col) => {
    g.fillStyle = col; circle(g, cx, cy, r); g.fill();
    for (let k = 0; k < 6; k++) { const a = k * 1.05 + v * 6; circle(g, cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.86, r * 0.22); g.fill(); }
  };
  if (variant === 1) {
    const cy = d.y - s * 1.45;
    g.fillStyle = tone(c0, -0.1); ellipse(g, d.x + sway + s * 0.1, cy + s * 0.1, s * 0.7, s * 1.25); g.fill();
    g.fillStyle = c0; ellipse(g, d.x + sway, cy, s * 0.68, s * 1.2); g.fill();
    g.fillStyle = c1; ellipse(g, d.x + sway - s * 0.14, cy - s * 0.12, s * 0.5, s * 0.95); g.fill();
    g.fillStyle = c2; ellipse(g, d.x + sway - s * 0.3, cy - s * 0.55, s * 0.2, s * 0.4); g.fill();
  } else if (variant === 2) {
    clump(d.x - s * 0.5 + sway, d.y - s * 0.85, s * 0.72, tone(c0, -0.06));
    clump(d.x + s * 0.5 + sway, d.y - s * 1.0, s * 0.78, c0);
    clump(d.x + sway, d.y - s * 1.35, s * 0.68, c1);
    g.fillStyle = c2; circle(g, d.x - s * 0.2 + sway, d.y - s * 1.55, s * 0.26); g.fill();
  } else {
    g.fillStyle = tone(c0, -0.1); circle(g, d.x + s * 0.12 + sway, d.y - s * 0.8, s); g.fill();
    clump(d.x + sway, d.y - s * 0.95, s, c0);
    g.fillStyle = c1; circle(g, d.x - s * 0.12 + sway, d.y - s * 1.05, s * 0.78); g.fill();
    g.fillStyle = c2; circle(g, d.x - s * 0.32 + sway, d.y - s * 1.28, s * 0.38); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let k = 0; k < 4; k++) { ellipse(g, d.x - s * (0.15 + hash(v * 9, k) * 0.5) + sway, d.y - s * (0.9 + hash(v * 9, k + 4) * 0.7), 2.4, 1.4, 0.5); g.fill(); }
  g.globalAlpha = 1;
}

export function drawPineRich(g, d, t, z, player) {
  const v = d.v, s = d.s * (0.9 + v * 0.3);
  const jit = (((v * 97) % 1) - 0.5) * 0.12;
  const [c0, c1, c2] = z.treeColors.map((c) => tone(c, jit));
  const behind = player && Math.abs(player.x - d.x) < s * 0.8 && player.y < d.y && player.y > d.y - s * 2.6;
  g.fillStyle = '#5a4535'; g.fillRect(d.x - 3, d.y - 12, 6, 12);
  g.globalAlpha = behind ? 0.45 : 1;
  const sway = Math.sin(t * 0.7 + v * 8) * 1.3, tiers = v > 0.5 ? 4 : 3;
  for (let i = 0; i < tiers; i++) {
    const w = s * (1 - i * 0.2), y0 = d.y - 8 - i * s * 0.5, top = y0 - s * 0.95, cx = d.x + sway * (i / tiers);
    g.fillStyle = i % 2 ? c1 : c0;
    g.beginPath(); g.moveTo(cx - w, y0);
    for (let k = 1; k <= 4; k++) g.lineTo(cx - w + (w * 2 * k) / 4, y0 + (k % 2 ? 5 : -1));
    g.lineTo(cx, top); g.closePath(); g.fill();
    g.fillStyle = tone(i % 2 ? c1 : c0, -0.1);
    g.beginPath(); g.moveTo(cx, top); g.lineTo(cx + w, y0); g.lineTo(cx + w * 0.2, y0 + 4); g.closePath(); g.fill();
    g.fillStyle = c2; g.beginPath(); g.moveTo(cx, top); g.lineTo(cx - w * 0.42, y0 - s * 0.35); g.lineTo(cx - w * 0.1, y0 - s * 0.4); g.closePath(); g.fill();
  }
  g.globalAlpha = 1;
}

// ---------- sombras dos novos objetos (true = tratado) ----------
export function sceneryShadow(g, o) {
  switch (o.type) {
    case 'stump': ellipse(g, o.x + 5, o.y + 2, o.s * 0.8, o.s * 0.3); g.fill(); return true;
    case 'log': ellipse(g, o.x + 4, o.y + 6, o.s * 1.2, o.s * 0.3); g.fill(); return true;
    case 'rubble': ellipse(g, o.x + 3, o.y + 3, o.s * 0.9, o.s * 0.3); g.fill(); return true;
    case 'brazier': case 'runestone': ellipse(g, o.x + 5, o.y + 3, o.s * 0.7, o.s * 0.26); g.fill(); return true;
    case 'statue': ellipse(g, o.x + 10, o.y + 4, o.s * 0.9, o.s * 0.32); g.fill(); return true;
    case 'deadtree': ellipse(g, o.x + 8, o.y + 3, o.s * 0.8, o.s * 0.28); g.fill(); return true;
    case 'lantern': case 'signpost': ellipse(g, o.x + 4, o.y + 2, o.s * 0.8, o.s * 0.28); g.fill(); return true;
    case 'bench': ellipse(g, o.x + 4, o.y + 4, o.s * 1.2, o.s * 0.34); g.fill(); return true;
    case 'crates': ellipse(g, o.x + 4, o.y + 4, o.s * 1.4, o.s * 0.4); g.fill(); return true;
    case 'geode': ellipse(g, o.x + 4, o.y + 3, o.s * 0.9, o.s * 0.3); g.fill(); return true;
    default: return false;
  }
}

// ---------- novos objetos ----------
export function drawSceneryDecor(g, d, t) {
  const s = d.s, v = d.v;
  switch (d.type) {
    case 'stump': {
      g.fillStyle = '#7d5c3f'; g.fillRect(d.x - s * 0.7, d.y - s * 0.7, s * 1.4, s * 0.7);
      g.fillStyle = '#5f4430'; g.fillRect(d.x + s * 0.2, d.y - s * 0.7, s * 0.5, s * 0.7);
      g.fillStyle = '#c9a373'; ellipse(g, d.x, d.y - s * 0.7, s * 0.7, s * 0.28); g.fill();
      g.strokeStyle = '#a07e52'; g.lineWidth = 1; ellipse(g, d.x, d.y - s * 0.7, s * 0.4, s * 0.15); g.stroke();
      g.fillStyle = '#6aa564'; ellipse(g, d.x - s * 0.5, d.y - s * 0.72, s * 0.22, s * 0.1); g.fill();
      break;
    }
    case 'log': {
      g.fillStyle = '#7d5c3f'; g.fillRect(d.x - s * 1.2, d.y - s * 0.55, s * 2.4, s * 0.55);
      g.fillStyle = '#5f4430'; g.fillRect(d.x - s * 1.2, d.y - s * 0.2, s * 2.4, s * 0.2);
      g.fillStyle = '#c9a373'; ellipse(g, d.x + s * 1.2, d.y - s * 0.28, s * 0.14, s * 0.28); g.fill();
      g.fillStyle = '#6aa564'; ellipse(g, d.x - s * 0.3, d.y - s * 0.56, s * 0.7, s * 0.12); g.fill();
      break;
    }
    case 'fern': {
      g.strokeStyle = '#4f9a58'; g.lineWidth = 2; g.lineCap = 'round';
      const sw = Math.sin(t * 1.1 + v * 9) * 1.5;
      for (let i = -3; i <= 3; i++) {
        const a = i * 0.34, len = s * (1.1 - Math.abs(i) * 0.1);
        const ex = d.x + Math.sin(a) * len + sw, ey = d.y - Math.cos(a) * len * 0.9;
        g.beginPath(); g.moveTo(d.x, d.y); g.quadraticCurveTo(d.x + Math.sin(a) * len * 0.4, d.y - len * 0.7, ex, ey); g.stroke();
        g.strokeStyle = i % 2 ? '#5fb066' : '#4f9a58'; g.lineWidth = 1;
        for (let k = 1; k < 4; k++) { const px = d.x + (ex - d.x) * k / 4, py = d.y + (ey - d.y) * k / 4; g.beginPath(); g.moveTo(px, py); g.lineTo(px - 4, py + 2); g.moveTo(px, py); g.lineTo(px + 4, py + 2); g.stroke(); }
        g.lineWidth = 2;
      }
      break;
    }
    case 'mushrooms': {
      for (let i = 0; i < 3; i++) {
        const x = d.x + (i - 1) * s * 0.9, h = s * (0.7 + (i === 1 ? 0.4 : 0)), r = s * (0.5 + (i === 1 ? 0.2 : 0));
        g.fillStyle = '#f2e6d0'; g.fillRect(x - 1.8, d.y - h, 3.6, h);
        g.fillStyle = i === 1 ? '#e0585c' : '#e98b8b'; ellipse(g, x, d.y - h, r, r * 0.65); g.fill();
        g.fillStyle = '#fff'; circle(g, x - r * 0.3, d.y - h - r * 0.15, 1.6); g.fill(); circle(g, x + r * 0.35, d.y - h - r * 0.05, 1.2); g.fill();
      }
      break;
    }
    case 'reeds': {
      for (let i = -2; i <= 2; i++) {
        const sw = Math.sin(t * 1.3 + i + v * 7) * 2.5, h = s * (1.6 + (i % 2) * 0.5);
        g.strokeStyle = '#5da05b'; g.lineWidth = 1.8;
        g.beginPath(); g.moveTo(d.x + i * 4, d.y); g.quadraticCurveTo(d.x + i * 4 + sw * 0.4, d.y - h * 0.6, d.x + i * 4 + sw, d.y - h); g.stroke();
        if (i % 2 === 0) { g.fillStyle = '#7a5535'; ellipse(g, d.x + i * 4 + sw, d.y - h, 2, 5, sw * 0.05); g.fill(); }
      }
      break;
    }
    case 'lantern': {
      const fl = 0.85 + Math.sin(t * 3 + v * 20) * 0.1;
      g.fillStyle = '#4a4258'; g.fillRect(d.x - 2, d.y - s * 3.4, 4, s * 3.4);
      g.fillRect(d.x - 5, d.y - 3, 10, 3);
      g.strokeStyle = '#4a4258'; g.lineWidth = 2; g.beginPath(); g.moveTo(d.x, d.y - s * 3.4); g.quadraticCurveTo(d.x + 6, d.y - s * 3.8, d.x + 10, d.y - s * 3.2); g.stroke();
      g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(d.x + 10, d.y - s * 3, 2, d.x + 10, d.y - s * 3, 72 * fl);
      gr.addColorStop(0, 'rgba(255,205,120,0.24)'); gr.addColorStop(1, 'rgba(255,190,100,0)');
      g.fillStyle = gr; g.fillRect(d.x - 90, d.y - s * 3 - 100, 200, 200);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#ffe9a8'; g.fillRect(d.x + 6, d.y - s * 3.2 - 1, 8, 10);
      g.strokeStyle = '#4a4258'; g.lineWidth = 1.5; g.strokeRect(d.x + 6, d.y - s * 3.2 - 1, 8, 10);
      break;
    }
    case 'bench': {
      g.fillStyle = '#6e4d34'; g.fillRect(d.x - s * 1.1, d.y - s * 0.4, 3, s * 0.4); g.fillRect(d.x + s * 1.1 - 3, d.y - s * 0.4, 3, s * 0.4);
      g.fillStyle = '#a77b52'; g.fillRect(d.x - s * 1.2, d.y - s * 0.55, s * 2.4, s * 0.2);
      g.fillStyle = '#8c6544'; g.fillRect(d.x - s * 1.2, d.y - s * 0.38, s * 2.4, 3);
      g.fillStyle = '#a77b52'; g.fillRect(d.x - s * 1.2, d.y - s * 1.0, s * 2.4, s * 0.16); g.fillRect(d.x - s * 1.2, d.y - s * 0.78, s * 2.4, s * 0.16);
      g.fillStyle = '#6e4d34'; g.fillRect(d.x - s * 1.15, d.y - s * 1.0, 3, s * 0.45); g.fillRect(d.x + s * 1.15 - 3, d.y - s * 1.0, 3, s * 0.45);
      break;
    }
    case 'crates': {
      g.fillStyle = '#b98a58'; g.fillRect(d.x - s * 1.0, d.y - s * 0.9, s * 0.95, s * 0.9);
      g.fillStyle = '#9a6c3f'; g.fillRect(d.x - s * 1.0, d.y - s * 0.5, s * 0.95, 3);
      g.strokeStyle = '#6e4a2a'; g.lineWidth = 1.5; g.strokeRect(d.x - s * 1.0, d.y - s * 0.9, s * 0.95, s * 0.9);
      g.fillStyle = '#c9985f'; g.fillRect(d.x + s * 0.1, d.y - s * 1.2, s * 0.9, s * 1.2);
      g.strokeStyle = '#6e4a2a'; g.strokeRect(d.x + s * 0.1, d.y - s * 1.2, s * 0.9, s * 1.2);
      g.beginPath(); g.moveTo(d.x + s * 0.1, d.y - s * 1.2); g.lineTo(d.x + s * 1.0, d.y); g.stroke();
      g.fillStyle = '#7d5a3a'; ellipse(g, d.x - s * 0.15, d.y - s * 1.0, s * 0.35, s * 0.15); g.fill();
      break;
    }
    case 'flowerbed': {
      g.fillStyle = '#7a5a40'; g.beginPath(); g.roundRect(d.x - s * 1.1, d.y - s * 0.5, s * 2.2, s * 0.7, 6); g.fill();
      g.fillStyle = '#5f4430'; g.beginPath(); g.roundRect(d.x - s, d.y - s * 0.42, s * 2, s * 0.5, 4); g.fill();
      const cols = ['#ff9db8', '#fff1a8', '#ffffff', '#c7b3ff', '#ffb27a'];
      for (let i = 0; i < 9; i++) {
        const x = d.x + (i - 4) * s * 0.23, sw = Math.sin(t * 1.4 + i + v * 8) * 1.2, y = d.y - s * 0.55 - (i % 3) * 3;
        g.strokeStyle = '#4f9a58'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, d.y - s * 0.3); g.lineTo(x + sw, y); g.stroke();
        g.fillStyle = cols[(i + Math.floor(v * 5)) % 5]; circle(g, x + sw, y - 1, 3.2); g.fill();
        g.fillStyle = '#ffd34d'; circle(g, x + sw, y - 1, 1.2); g.fill();
      }
      break;
    }
    case 'signpost': {
      g.fillStyle = '#6e4d34'; g.fillRect(d.x - 3, d.y - s * 2.6, 6, s * 2.6);
      g.fillStyle = '#b98a58'; g.beginPath(); g.moveTo(d.x - 4, d.y - s * 2.5); g.lineTo(d.x + s * 1.5, d.y - s * 2.5); g.lineTo(d.x + s * 1.9, d.y - s * 2.15); g.lineTo(d.x + s * 1.5, d.y - s * 1.8); g.lineTo(d.x - 4, d.y - s * 1.8); g.closePath(); g.fill();
      g.fillStyle = '#9a6c3f'; g.beginPath(); g.moveTo(d.x + 4, d.y - s * 1.65); g.lineTo(d.x - s * 1.3, d.y - s * 1.65); g.lineTo(d.x - s * 1.7, d.y - s * 1.35); g.lineTo(d.x - s * 1.3, d.y - s * 1.05); g.lineTo(d.x + 4, d.y - s * 1.05); g.closePath(); g.fill();
      g.strokeStyle = '#6e4a2a'; g.lineWidth = 1; g.beginPath(); g.moveTo(d.x + 3, d.y - s * 2.15); g.lineTo(d.x + s * 1.3, d.y - s * 2.15); g.moveTo(d.x - 3, d.y - s * 1.35); g.lineTo(d.x - s * 1.1, d.y - s * 1.35); g.stroke();
      break;
    }
    case 'glowflower': {
      const p = 0.55 + 0.45 * Math.sin(t * 1.8 + v * 12), sw = Math.sin(t * 1.2 + v * 6) * 1.5;
      const col = v < 0.5 ? '150,235,255' : '255,170,230';
      g.strokeStyle = '#6fb88a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(d.x, d.y); g.quadraticCurveTo(d.x + sw, d.y - s * 0.7, d.x + sw * 1.4, d.y - s * 1.3); g.stroke();
      g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(d.x + sw * 1.4, d.y - s * 1.3, 0, d.x + sw * 1.4, d.y - s * 1.3, 22);
      gr.addColorStop(0, `rgba(${col},${0.5 * p})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(d.x + sw * 1.4 - 22, d.y - s * 1.3 - 22, 44, 44);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = `rgba(${col},0.95)`; circle(g, d.x + sw * 1.4, d.y - s * 1.3, 3.4); g.fill();
      g.fillStyle = '#fff'; circle(g, d.x + sw * 1.4 - 0.8, d.y - s * 1.3 - 0.8, 1.2); g.fill();
      break;
    }
    case 'tallgrass': {
      g.lineCap = 'round';
      for (let i = -3; i <= 3; i++) {
        const sw = Math.sin(t * 1.3 + i * 0.7 + v * 9) * 3, h = s * (0.9 + ((i + 3) % 3) * 0.25);
        g.strokeStyle = i % 2 ? '#7fc58a' : '#9fd89a'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(d.x + i * 3, d.y); g.quadraticCurveTo(d.x + i * 3 + sw * 0.4, d.y - h * 0.6, d.x + i * 4 + sw, d.y - h); g.stroke();
      }
      break;
    }
    case 'geode': {
      g.fillStyle = '#8e8aa6';
      g.beginPath(); g.moveTo(d.x - s, d.y); g.lineTo(d.x - s * 0.8, d.y - s * 0.7); g.lineTo(d.x - s * 0.2, d.y - s * 1.0); g.lineTo(d.x + s * 0.7, d.y - s * 0.8); g.lineTo(d.x + s, d.y); g.closePath(); g.fill();
      g.fillStyle = '#6f6b88'; g.beginPath(); g.moveTo(d.x + s * 0.2, d.y - s * 0.95); g.lineTo(d.x + s * 0.7, d.y - s * 0.8); g.lineTo(d.x + s, d.y); g.lineTo(d.x + s * 0.2, d.y); g.closePath(); g.fill();
      const p = 0.6 + 0.4 * Math.sin(t * 2 + v * 9);
      g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(d.x - s * 0.1, d.y - s * 0.55, 0, d.x - s * 0.1, d.y - s * 0.55, s * 1.2);
      gr.addColorStop(0, `rgba(170,150,255,${0.3 * p})`); gr.addColorStop(1, 'rgba(170,150,255,0)');
      g.fillStyle = gr; g.fillRect(d.x - s * 1.4, d.y - s * 1.8, s * 2.8, s * 2.4);
      g.globalCompositeOperation = 'source-over';
      for (const [ox, h, c] of [[-0.35, 0.55, '#c9b8ff'], [0, 0.75, '#e0d4ff'], [0.3, 0.5, '#a9d7ff']]) {
        g.fillStyle = c; g.beginPath(); g.moveTo(d.x + (ox - 0.12) * s, d.y - s * 0.45); g.lineTo(d.x + ox * s, d.y - s * (0.45 + h)); g.lineTo(d.x + (ox + 0.12) * s, d.y - s * 0.45); g.closePath(); g.fill();
      }
      break;
    }
    case 'rubble': {
      [[-0.6, 0, 0.55, '#8e8aa4'], [0.3, 0.1, 0.7, '#a29eb8'], [-0.1, -0.35, 0.5, '#b4b0c8'], [0.75, -0.1, 0.38, '#8e8aa4']].forEach(([ox, oy, r, c]) => {
        g.fillStyle = c; g.beginPath();
        g.moveTo(d.x + (ox - r) * s, d.y + oy * s); g.lineTo(d.x + (ox - r * 0.5) * s, d.y + (oy - r * 0.9) * s);
        g.lineTo(d.x + (ox + r * 0.6) * s, d.y + (oy - r * 0.7) * s); g.lineTo(d.x + (ox + r) * s, d.y + oy * s); g.closePath(); g.fill();
      });
      g.fillStyle = 'rgba(100,150,120,0.5)'; ellipse(g, d.x - s * 0.2, d.y - s * 0.02, s * 0.5, s * 0.1); g.fill();
      break;
    }
    case 'brazier': {
      const fl = Math.sin(t * 9 + v * 20) * 0.5 + Math.sin(t * 14 + v * 7) * 0.3;
      g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(d.x, d.y - 30, 4, d.x, d.y - 30, 120 + fl * 10);
      gr.addColorStop(0, `rgba(255,170,90,${0.30 + fl * 0.06})`); gr.addColorStop(1, 'rgba(255,140,60,0)');
      g.fillStyle = gr; g.fillRect(d.x - 135, d.y - 165, 270, 270);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#4a4660'; g.fillRect(d.x - 3, d.y - 20, 6, 20);
      g.fillStyle = '#5d5876'; g.beginPath(); g.moveTo(d.x - 14, d.y - 34); g.lineTo(d.x + 14, d.y - 34); g.lineTo(d.x + 8, d.y - 20); g.lineTo(d.x - 8, d.y - 20); g.closePath(); g.fill();
      g.fillStyle = '#ff7a3a'; g.beginPath(); g.moveTo(d.x - 9, d.y - 34); g.quadraticCurveTo(d.x - 6 + fl * 3, d.y - 50, d.x + fl * 4, d.y - 62 - fl * 4); g.quadraticCurveTo(d.x + 8, d.y - 48, d.x + 9, d.y - 34); g.closePath(); g.fill();
      g.fillStyle = '#ffd36a'; g.beginPath(); g.moveTo(d.x - 5, d.y - 34); g.quadraticCurveTo(d.x - 2, d.y - 44, d.x + fl * 2, d.y - 52); g.quadraticCurveTo(d.x + 5, d.y - 42, d.x + 5, d.y - 34); g.closePath(); g.fill();
      break;
    }
    case 'statue': {
      g.fillStyle = '#7b7792'; g.fillRect(d.x - s * 0.6, d.y - s * 0.5, s * 1.2, s * 0.5);
      g.fillStyle = '#6a6681'; g.fillRect(d.x + s * 0.1, d.y - s * 0.5, s * 0.5, s * 0.5);
      const grd = g.createLinearGradient(d.x - s * 0.5, 0, d.x + s * 0.5, 0);
      grd.addColorStop(0, '#c4c0d6'); grd.addColorStop(1, '#8d89a6');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(d.x - s * 0.5, d.y - s * 0.5); g.lineTo(d.x - s * 0.35, d.y - s * 1.7); g.lineTo(d.x, d.y - s * 2.1); g.lineTo(d.x + s * 0.35, d.y - s * 1.7); g.lineTo(d.x + s * 0.5, d.y - s * 0.5); g.closePath(); g.fill();
      g.fillStyle = '#5f5b78'; g.beginPath(); g.moveTo(d.x - s * 0.22, d.y - s * 1.75); g.lineTo(d.x, d.y - s * 2.1); g.lineTo(d.x + s * 0.22, d.y - s * 1.75); g.lineTo(d.x, d.y - s * 1.5); g.closePath(); g.fill();
      const p = 0.5 + 0.5 * Math.sin(t * 2 + v * 9);
      g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(150,235,255,${0.5 + p * 0.5})`;
      circle(g, d.x - s * 0.07, d.y - s * 1.78, 1.8); g.fill(); circle(g, d.x + s * 0.07, d.y - s * 1.78, 1.8); g.fill();
      g.globalCompositeOperation = 'source-over';
      break;
    }
    case 'deadtree': {
      g.strokeStyle = '#4d4552'; g.lineCap = 'round';
      const br = (x, y, len, ang, w, depth) => {
        const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
        g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
        if (depth > 0) { br(ex, ey, len * 0.7, ang - 0.5, w * 0.65, depth - 1); br(ex, ey, len * 0.65, ang + 0.55, w * 0.65, depth - 1); }
      };
      br(d.x, d.y, s * 1.1, -Math.PI / 2 + (v - 0.5) * 0.3, 6, 3);
      break;
    }
    case 'runestone': {
      g.fillStyle = '#7a7692';
      g.beginPath(); g.moveTo(d.x - s * 0.5, d.y); g.lineTo(d.x - s * 0.42, d.y - s * 1.5); g.lineTo(d.x, d.y - s * 1.8); g.lineTo(d.x + s * 0.45, d.y - s * 1.45); g.lineTo(d.x + s * 0.5, d.y); g.closePath(); g.fill();
      g.fillStyle = '#9a96b4'; g.beginPath(); g.moveTo(d.x - s * 0.5, d.y); g.lineTo(d.x - s * 0.42, d.y - s * 1.5); g.lineTo(d.x - s * 0.05, d.y - s * 1.7); g.lineTo(d.x - s * 0.1, d.y); g.closePath(); g.fill();
      const p = 0.55 + 0.45 * Math.sin(t * 1.7 + v * 8);
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(170,140,255,${0.5 + p * 0.5})`; g.lineWidth = 2;
      g.beginPath(); g.moveTo(d.x, d.y - s * 1.35); g.lineTo(d.x, d.y - s * 0.45); g.moveTo(d.x - s * 0.2, d.y - s * 1.0); g.lineTo(d.x + s * 0.2, d.y - s * 1.2); g.moveTo(d.x - s * 0.2, d.y - s * 0.7); g.lineTo(d.x + s * 0.2, d.y - s * 0.9); g.stroke();
      const gr = g.createRadialGradient(d.x, d.y - s * 0.9, 2, d.x, d.y - s * 0.9, s * 1.5);
      gr.addColorStop(0, `rgba(160,130,255,${0.18 * p})`); gr.addColorStop(1, 'rgba(160,130,255,0)');
      g.fillStyle = gr; g.fillRect(d.x - s * 1.5, d.y - s * 2.4, s * 3, s * 3);
      g.globalCompositeOperation = 'source-over';
      break;
    }
  }
}

// ---------- atmosfera em espaço de tela ----------
// q: qualidade 0 (baixa) a 2 (alta). Baixa corta névoa, raios e folhas; média corta os raios e reduz partículas.
export function drawAtmosphere(g, z, cam, vw, vh, t, q = 2) {
  const a = z.atmosphere;
  if (!a) return;
  if (a.tint) { g.fillStyle = a.tint; g.fillRect(0, 0, vw, vh); }
  if (a.rays && q >= 2) {
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = vw * (0.05 + i * 0.27) + Math.sin(t * 0.15 + i * 2) * 26 - cam.x * 0.03, len = vh * 0.9, w = 60 + i * 22;
      const gr = g.createLinearGradient(x, 0, x + len * 0.45, len);
      gr.addColorStop(0, `rgba(255,236,170,${a.rays * (0.7 + 0.3 * Math.sin(t * 0.5 + i))})`); gr.addColorStop(1, 'rgba(255,236,170,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w, 0); g.lineTo(x + len * 0.45 + w * 1.6, len); g.lineTo(x + len * 0.45 - w * 0.4, len); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
  if (a.fog && q >= 1) {
    for (let i = 0; i < Math.ceil(a.fog.n * (q >= 2 ? 1 : 0.6)); i++) {
      const wx = mod(hash(i, 1) * z.w + t * (6 + (i % 3) * 5), z.w + 600) - 300, wy = z.h * (0.1 + hash(i, 2) * 0.8) + Math.sin(t * 0.12 + i) * 50;
      const r = 240 + (i % 4) * 70, sx = wx - cam.x, sy = wy - cam.y;
      if (sx < -r || sx > vw + r || sy < -r || sy > vh + r) continue;
      const gr = g.createRadialGradient(sx, sy, 0, sx, sy, r);
      gr.addColorStop(0, `rgba(${a.fog.color},${a.fog.alpha})`); gr.addColorStop(1, `rgba(${a.fog.color},0)`);
      g.fillStyle = gr; g.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
  }
  if (a.motes) {
    const m = a.motes;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < Math.ceil(m.n * [0.3, 0.6, 1][q]); i++) {
      const u = hash(i, 3), w = hash(i, 4);
      const x = mod(u * (vw + 200) + Math.sin(t * 0.5 + i) * 20 - cam.x * 0.35 + t * m.drift * (0.5 + w), vw + 200) - 100;
      const y = mod(w * (vh + 200) - t * m.rise * (0.3 + u) - cam.y * 0.35, vh + 200) - 100;
      const tw = 0.35 + 0.65 * Math.max(0, Math.sin(t * (1 + w * 2) + i * 3));
      g.fillStyle = `rgba(${m.color},${0.18 * tw})`; circle(g, x, y, 6 + w * 3); g.fill();
      g.fillStyle = `rgba(${m.color},${0.8 * tw})`; circle(g, x, y, 1.6 + w * 0.8); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
  if (a.leaves && q >= 1) {
    for (let i = 0; i < a.leaves.n; i++) {
      const u = hash(i, 5), w = hash(i, 6);
      const x = mod(u * (vw + 120) + Math.sin(t * 0.8 + i * 2) * 40 - cam.x * 0.5, vw + 120) - 60;
      const y = mod(w * (vh + 80) + t * (22 + u * 22), vh + 80) - 40;
      g.save(); g.translate(x, y); g.rotate(t * (0.8 + w) + i);
      g.fillStyle = a.leaves.colors[i % a.leaves.colors.length]; g.globalAlpha = 0.85;
      ellipse(g, 0, 0, 5, 2.4); g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
  }
}
