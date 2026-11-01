// Texturas de CHÃO pintadas (arte gerada, sem emenda; tools/ground-textures-from-images.py): grama do Bosque e da Planície, lajes das Ruínas, terra e lajes das trilhas, água dos lagos.
// Só entram no cache do terreno (buildGround, uma vez por zona): custo por quadro zero. Sem as imagens (ou com ?chao=original, que fica salvo no aparelho) vale o chão por código.
const KEY = 'aetheria_chao';
const NAMES = ['forest', 'plains', 'ruins', 'sand-dirt', 'sand-plains', 'slabs', 'water-lake', 'water-crystal'];
const imgs = new Map();
let on = null, ready = false, loading = null;

export function groundTexEnabled() {
  if (on !== null) return on;
  try {
    const q = new URLSearchParams(location.search).get('chao');
    if (q === 'texturas' || q === 'original') localStorage.setItem(KEY, q);
    on = (q ?? localStorage.getItem(KEY) ?? 'texturas') === 'texturas';
  } catch { on = true; }
  return on;
}

export function loadGroundTextures() {
  if (!groundTexEnabled() || loading) return loading;
  loading = Promise.all(NAMES.map((n) => new Promise((res) => {
    const i = new Image(); i.onload = () => { imgs.set(n, i); res(); }; i.onerror = () => res(); i.src = `assets/ground/${n}.webp`;
  }))).then(() => { ready = imgs.size === NAMES.length; });
  return loading;
}
export const groundTexReady = () => ready;

// cada tile cobre `scale` vezes o seu tamanho em pixels no mundo; sem emenda, então basta repetir
function pattern(g, name, scale) {
  const i = imgs.get(name); if (!ready || !i) return null;
  const p = g.createPattern(i, 'repeat'); p.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0])); return p;
}
const BASE = { forest: ['forest', 1.4], plains: ['plains', 1.4], ruins: ['ruins', 0.85] };
const SAND = { forest: ['sand-dirt', 1], plains: ['sand-plains', 1], ruins: ['slabs', 1] };
const WATER = { forest: ['water-lake', 1.3], plains: ['water-crystal', 1.3] };

// Preenche o terreno inteiro com a textura da zona; devolve true se coube.
export function fillGroundTexture(g, kind, w, h) {
  const b = BASE[kind]; const p = b && pattern(g, b[0], b[1]); if (!p) return false;
  g.fillStyle = p; g.fillRect(0, 0, w, h); return true;
}
export const trailPattern = (g, kind) => { const b = SAND[kind]; return b ? pattern(g, b[0], b[1]) : null; };
export const waterPattern = (g, kind) => { const b = WATER[kind]; return b ? pattern(g, b[0], b[1]) : null; };
