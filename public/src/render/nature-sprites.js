// Cenário em SPRITES: árvores, pinheiros, pedras, arbustos, samambaias, cogumelos e capim fotografados de modelos 3D do "Stylized Nature MegaKit"
// (Quaternius, licença CC0) por tools/nature-bake.mjs → atlas único public/assets/nature/atlas.webp (88 KB, ~4 MB descomprimido).
// SÓ DESENHO: posição, tamanho (`d.s`) e colisão continuam vindo de game/layout.js; sem o atlas (ou com ?cenario=original) o desenho antigo por código segue valendo.
const KEY = 'aetheria_cenario';
let atlas = null, meta = null, loading = null, on = null;
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
    bush: { w: 2.7, ref: 1.9, v: ['Bush_Common', 'Bush_Common_Flowers'] },
    fern: { w: 3.0, ref: 9, v: ['Fern_1', 'Plant_1', 'Fern_1'] },
    mushrooms: { w: 1.9, ref: 0.9, v: ['Mushroom_Common', 'Mushroom_Laetiporus'] },
  },
  plains: {
    bush: { w: 2.7, ref: 1.9, v: ['Bush_Common_Flowers', 'Bush_Common'] },
    tallgrass: { h: 1.5, ref: 1.9, v: ['Grass_Common_Tall', 'Grass_Wispy_Tall', 'Grass_Common_Short'] },
    mushrooms: { w: 1.9, ref: 0.9, v: ['Mushroom_Common', 'Mushroom_Laetiporus'] },
  },
  ruins: {
    pine: { h: 3.2, ref: 17, v: P('TwistedTree', 1, 3), behind: true }, // árvores retorcidas de folhagem outonal: combinam com o crepúsculo das Ruínas
    deadtree: { h: 3.3, ref: 11, v: P('DeadTree', 1, 3), behind: true },
  },
};
let zoneSet = null;
export function setNatureZone(zoneId) { zoneSet = atlas ? SET[zoneId] ?? null : null; }

// Desenha a decoração `d` como sprite; devolve true se tratou (senão o chamador usa o desenho antigo).
export function drawNature(g, d, player) {
  const cfg = zoneSet?.[d.type];
  if (!cfg) return false;
  const name = cfg.v[Math.min(cfg.v.length - 1, Math.floor(d.v * cfg.v.length))], sp = meta[name];
  if (!sp) return false;
  // tamanho: pela altura (árvores, capim) ou pela largura (pedras, arbustos...), relativo ao tamanho típico do tipo para as variantes terem proporção própria
  const k = cfg.h ? (d.s * cfg.h * (sp.my / cfg.ref)) / sp.h : (d.s * cfg.w * (sp.mx / cfg.ref)) / sp.w;
  const w = sp.w * k, h = sp.h * k, x = d.x - sp.ax * k, y = d.y - sp.ay * k;
  let fade = false;
  if (cfg.behind && player) fade = Math.abs(player.x - d.x) < w * 0.35 && player.y < d.y && player.y > d.y - h * 0.9; // o herói atrás da copa a deixa translúcida
  if (fade) g.globalAlpha = 0.45;
  g.drawImage(atlas, sp.x, sp.y, sp.w, sp.h, x, y, w, h); stats.drawn++;
  if (fade) g.globalAlpha = 1;
  return true;
}
