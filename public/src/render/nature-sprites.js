// Cenário em SPRITES: árvores, pinheiros, pedras, arbustos, samambaias, cogumelos e capim fotografados de modelos 3D do "Stylized Nature MegaKit"
// (Quaternius, licença CC0) por tools/nature-bake.mjs → atlas único public/assets/nature/atlas.webp (88 KB, ~4 MB descomprimido).
// SÓ DESENHO: posição, tamanho (`d.s`) e colisão continuam vindo de game/layout.js; sem o atlas (ou com ?cenario=original) o desenho antigo por código segue valendo.
const KEY = 'aetheria_cenario';
let atlas = null, meta = null, loading = null, on = null;
let gAtlas = null, gMeta = null; // atlas de CHÃO (flores, trevos, pedrinhas, pedras de trilha): carimbado no cache do terreno, não a cada quadro
export const stats = { drawn: 0, sprites: 0 }; // diagnóstico/testes (window.natureStats)

export function natureEnabled() {
  if (on !== null) return on;
  try {
    const q = new URLSearchParams(location.search).get('cenario');
    if (q === 'natureza' || q === 'original') localStorage.setItem(KEY, q);
    on = (q ?? localStorage.getItem(KEY) ?? 'natureza') === 'natureza';
  } catch { on = true; }
  return on;
}

export function loadNature() {
  if (!natureEnabled() || loading) return loading;
  loading = (async () => {
    try {
      const [m, img] = await Promise.all([fetch('assets/nature/atlas.json').then((r) => r.json()), new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'assets/nature/atlas.webp'; })]);
      await img.decode?.();
      meta = m.sprites; atlas = img; stats.sprites = Object.keys(meta).length; window.natureStats = stats;
    } catch { atlas = null; } // sem atlas: fica o desenho antigo
    try {
      const [m, img] = await Promise.all([fetch('assets/nature/meshy.json').then((r) => r.json()), new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'assets/nature/meshy.webp'; })]);
      await img.decode?.();
      if (meta) for (const [k, v] of Object.entries(m.sprites)) meta['m_' + k] = { ...v, im: img }; // peças do Meshy (CC BY 4.0): casas, estátuas, ruínas, cerejeiras, cristais...
      stats.meshy = Object.keys(m.sprites).length;
    } catch { /* sem o atlas do Meshy: valem o Quaternius e o desenho antigo */ }
    try {
      const [m, img] = await Promise.all([fetch('assets/nature/ground.json').then((r) => r.json()), new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'assets/nature/ground.webp'; })]);
      await img.decode?.();
      gMeta = m.sprites; gAtlas = img;
    } catch { gAtlas = null; }
  })();
  return loading;
}
export const natureReady = () => !!atlas;
export const spriteNames = () => (meta ? Object.keys(meta) : []);

// que sprites cada tipo de decoração usa em cada zona (os que não estão aqui continuam no desenho antigo, ex.: árvores rosa e cristais da Planície)
const P = (n, a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(`${n}_${i}`); return o; };
export const SET = {
  forest: {
    tree: { h: 3.0, ref: 7.6, v: [...P('CommonTree', 1, 5), ...P('CommonTree', 1, 5), ...P('Pine', 1, 4)], behind: true },
    rock: { w: 2.9, ref: 3.2, v: P('Rock_Medium', 1, 3) },
    stump: { h: 2.0, ref: 0, v: ['m_stump'] },
    log: { w: 4.1, ref: 0, v: ['m_log'] },
    bush: { w: 2.7, ref: 1.9, v: ['Bush_Common', 'Bush_Common_Flowers'] },
    fern: { w: 3.0, ref: 9, v: ['Fern_1', 'Plant_1', 'Fern_1'] },
    mushrooms: { w: 1.9, ref: 0.9, v: ['Mushroom_Common', 'Mushroom_Laetiporus'] },
  },
  plains: {
    tree: { h: 3.4, ref: 0, v: ['m_cherry_1', 'm_cherry_2', 'm_cherry_3'], behind: true }, // cerejeiras no lugar das árvores rosa de código
    crystal: { h: 2.9, ref: 0, v: ['m_crystal_1', 'm_crystal_2', 'm_crystal_3', 'm_crystal_4', 'm_crystal_5'] },
    geode: { h: 2.2, ref: 0, v: ['m_crystal_3', 'm_crystal_1'] },
    bush: { w: 2.7, ref: 1.9, v: ['Bush_Common_Flowers', 'Bush_Common'] },
    tallgrass: { h: 1.5, ref: 1.9, v: ['Grass_Common_Tall', 'Grass_Wispy_Tall', 'Grass_Common_Short'] },
    mushrooms: { w: 1.9, ref: 0.9, v: ['Mushroom_Common', 'Mushroom_Laetiporus'] },
  },
  ruins: {
    pillar: { h: 4.4, ref: 0, v: ['m_pillar_1', 'm_pillar_2', 'm_pillar_1', 'm_pillar_2', 'm_arch_broken'], behind: true }, // pilares com hera; de vez em quando um arco partido
    statue: { h: 7.2, ref: 0, v: ['m_statue_knight', 'm_statue_owl'], behind: true }, // grandes: são o marco das Ruínas
    runestone: { w: 2.1, ref: 0, v: ['m_boulder'] },
    rubble: { w: 1.7, ref: 0, v: ['m_slab', 'm_boulder'] },
    pine: { h: 3.2, ref: 17, v: P('TwistedTree', 1, 3), behind: true }, // árvores retorcidas de folhagem outonal: combinam com o crepúsculo das Ruínas
    deadtree: { h: 3.3, ref: 11, v: P('DeadTree', 1, 3), behind: true },
  },
};
// vila: casas por canto (cada casa do layout ganha o seu desenho), lanternas e placa
export const HOUSE_SET = { town: { house: { house: true, v: ['m_house_tile', 'm_house_big', 'm_house_thatch', 'm_house_porch'], pick: (d) => (d.x < 850 ? 0 : 1) + (d.y < 600 ? 0 : 2) }, lantern: { h: 5.6, ref: 0, v: ['m_lamp'] }, signpost: { h: 5, ref: 0, v: ['m_sign'] } } };
Object.assign(SET, HOUSE_SET);
SET.town = { ...SET.town, tree: SET.forest.tree, rock: SET.forest.rock, bush: SET.forest.bush }; // a vila usa as mesmas árvores, pedras e arbustos do Bosque (um único estilo)
let zoneSet = null;
export function setNatureZone(zoneId) { zoneSet = atlas ? SET[zoneId] ?? null : null; }

// Desenha a decoração `d` como sprite; devolve true se tratou (senão o chamador usa o desenho antigo).
export function drawNature(g, d, player) {
  const cfg = zoneSet?.[d.type];
  if (!cfg) return false;
  const name = cfg.v[cfg.pick ? cfg.pick(d) : Math.min(cfg.v.length - 1, Math.floor((d.v ?? 0) * cfg.v.length))], sp = meta[name];
  if (!sp) return false;
  if (cfg.ref === 0 && !cfg._ref) { const vs = cfg.v.map((n) => meta[n]).filter(Boolean); cfg._ref = vs.reduce((a, b) => a + (cfg.h ? b.my : b.mx), 0) / vs.length; } // ref 0: tamanho médio das variantes (peças do Meshy vêm sem escala própria)
  // tamanho: pela altura (árvores, capim) ou pela largura (pedras, arbustos...), relativo ao tamanho típico do tipo para as variantes terem proporção própria
  const ref = cfg.ref || cfg._ref;
  const k = cfg.house ? (d.w * 1.08) / sp.w : cfg.h ? (d.s * cfg.h * (sp.my / ref)) / sp.h : (d.s * cfg.w * (sp.mx / ref)) / sp.w;
  const w = sp.w * k, h = sp.h * k, x = (cfg.house ? d.x + d.w / 2 : d.x) - sp.ax * k, y = d.y - sp.ay * k;
  let fade = false;
  if (cfg.behind && player) fade = Math.abs(player.x - d.x) < w * 0.35 && player.y < d.y && player.y > d.y - h * 0.9; // o herói atrás da copa a deixa translúcida
  if (fade) g.globalAlpha = 0.45;
  g.drawImage(sp.im ?? atlas, sp.x, sp.y, sp.w, sp.h, x, y, w, h); stats.drawn++;
  if (fade) g.globalAlpha = 1;
  return true;
}

// ---------------- chão: carimbos assados no cache do terreno ----------------
export const groundReady = () => !!gAtlas;
const G = (n, a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(`${n}_${i}`); return o; };
const PEB = [...G('Pebble_Round', 1, 5), ...G('Pebble_Square', 1, 6)];
// densidade = carimbos por 100 000 unidades² de chão; ppm = pixels do mundo por metro do modelo (flores altas ficam menores para não virarem arbustos)
const GROUND_SET = {
  forest: [
    { v: ['Clover_1', 'Clover_2'], n: 55, ppm: 15 }, { v: ['Grass_Wispy_Short'], n: 26, ppm: 14 },
    { v: ['Flower_3_Group', 'Flower_4_Group'], n: 3.5, ppm: 10, cluster: 3 }, { v: ['Flower_3_Single', 'Flower_4_Single'], n: 6, ppm: 8.5 },
    { v: ['Plant_7', 'Plant_7_Big'], n: 7, ppm: 18 }, { v: PEB, n: 20, ppm: 20 },
  ],
  plains: [
    { v: ['Clover_1', 'Clover_2'], n: 32, ppm: 15 }, { v: ['Grass_Wispy_Short'], n: 24, ppm: 14 },
    { v: ['Flower_3_Group', 'Flower_4_Group'], n: 7, ppm: 10, cluster: 4 }, { v: ['Flower_3_Single', 'Flower_4_Single'], n: 11, ppm: 8.5 },
    { v: G('Petal', 1, 5), n: 12, ppm: 12 }, { v: PEB, n: 10, ppm: 20 },
  ],
  ruins: [{ v: PEB, n: 40, ppm: 22 }, { v: ['Grass_Wispy_Short'], n: 6, ppm: 14 }, { v: ['Plant_7'], n: 4, ppm: 16 }],
};
const STONES = [...G('RockPath_Round_Small', 1, 3), ...G('RockPath_Square_Small', 1, 3)];
const BORDER = STONES; // só as pedras pequenas: as largas/finas pareciam pilhas de entulho
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, u = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - (ax + dx * u), py - (ay + dy * u));
};

// Carimba flores, trevos, capim, pedrinhas e as pedras da trilha no terreno. Devolve true quando cobriu o chão (o desenho vetorial de flores/tufos é então dispensado).
export function stampGround(g, world, rng) {
  const kind = world.zone.scenery?.kind, rules = GROUND_SET[kind];
  if (!gAtlas || !rules) return false;
  const z = world.zone, L = world.layout, trail = L.trail ?? [], ponds = L.ponds ?? [], paths = z.paths ?? [];
  const blocked = (x, y, m) => {
    for (const p of ponds) { const c = Math.cos(-p.rot), s = Math.sin(-p.rot), dx = x - p.x, dy = y - p.y, u = (dx * c - dy * s) / (p.rx + 34), v = (dx * s + dy * c) / (p.ry + 34); if (u * u + v * v < 1) return true; }
    for (let i = 0; i < trail.length - 1; i++) if (segDist(x, y, trail[i].x, trail[i].y, trail[i + 1].x, trail[i + 1].y) < m) return true;
    for (const [ax, ay, bx, by] of paths) if (segDist(x, y, ax, ay, bx, by) < m) return true;
    return false;
  };
  const list = [];
  const add = (name, x, y, ppm) => { const sp = gMeta[name]; if (sp) list.push({ sp, x, y, k: (ppm * rng.range(0.85, 1.2)) / sp.ppm, flip: rng.chance(0.5) }); };
  const area = (z.w * z.h) / 100000;
  for (const r of rules) {
    const count = Math.round(r.n * area);
    for (let i = 0; i < count; i++) {
      const cx = rng.range(40, z.w - 40), cy = rng.range(40, z.h - 40);
      if (blocked(cx, cy, 52)) continue;
      const m = r.cluster ? 1 + Math.floor(rng.range(0, r.cluster)) : 1; // flores nascem em grupos
      for (let j = 0; j < m; j++) {
        const x = cx + (j ? rng.range(-34, 34) : 0), y = cy + (j ? rng.range(-22, 22) : 0);
        if (!j || !blocked(x, y, 52)) add(r.v[Math.floor(rng.next() * r.v.length)], x, y, r.ppm);
      }
    }
  }
  // pedras da trilha: fileira irregular nas duas bordas (e uma ou outra no meio) ao longo do caminho de terra / lajes
  const half = kind === 'ruins' ? 52 : 34;
  for (let i = 0; i < trail.length - 1; i++) {
    const a = trail[i], b = trail[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    for (let d = rng.range(0, 30); d < len; d += rng.range(44, 90)) {
      const u = d / len, x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u, side = rng.chance(0.5) ? 1 : -1, off = side * (half + rng.range(-5, 9));
      add(BORDER[Math.floor(rng.next() * BORDER.length)], x + nx * off, y + ny * off, 16);
      if (rng.chance(0.1)) add(STONES[Math.floor(rng.next() * STONES.length)], x + nx * rng.range(-14, 14), y + ny * rng.range(-14, 14), 14);
    }
  }
  // margem das lagoas: pedrinhas e capim na beira
  for (const p of ponds) {
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    for (let i = 0; i < 26; i++) {
      const t = rng.range(0, Math.PI * 2), ex = Math.cos(t) * (p.rx + rng.range(10, 30)), ey = Math.sin(t) * (p.ry + rng.range(8, 26));
      add(rng.chance(0.55) ? PEB[Math.floor(rng.next() * PEB.length)] : 'Grass_Wispy_Short', p.x + ex * c - ey * s, p.y + ex * s + ey * c, 20);
    }
  }
  list.sort((a, b) => a.y - b.y);
  for (const it of list) {
    const { sp, k } = it, w = sp.w * k, h = sp.h * k;
    g.save(); g.translate(it.x, it.y); if (it.flip) g.scale(-1, 1);
    g.drawImage(gAtlas, sp.x, sp.y, sp.w, sp.h, -sp.ax * k, -sp.ay * k, w, h);
    g.restore();
  }
  stats.ground = list.length;
  return kind !== 'ruins'; // nas Ruínas ficam os tufos vetoriais
}

// A decoração `d` desta zona vira sprite? (as sombras de código dos desenhos antigos não servem para sprites)
export const hasNatureSprite = (d) => !!zoneSet?.[d.type];
