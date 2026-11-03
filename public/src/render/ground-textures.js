// Texturas de CHÃO pintadas (arte gerada, sem emenda; tools/ground-textures-from-images.py): grama do Bosque e da Planície, lajes das Ruínas, terra e lajes das trilhas, água dos lagos.
// Só entram no cache do terreno (buildGround, uma vez por zona): custo por quadro zero. Sem as imagens (ou com ?chao=original, que fica salvo no aparelho) vale o chão por código.
import { ASSET_V } from '../assets-version.js';
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

// ?v= = hash do conteúdo de public/assets/** (ASSET_V, o mesmo da VERSION do sw.js): trocar uma textura muda o hash (tools/bump-assets.mjs) e invalida o cache sozinho
export function loadGroundTextures() {
  if (!groundTexEnabled() || loading) return loading;
  loading = Promise.all(NAMES.map((n) => new Promise((res) => {
    const i = new Image(); i.onload = () => { imgs.set(n, i); res(); }; i.onerror = () => res(); i.src = `assets/ground/${n}.webp?v=${ASSET_V}`;
  }))).then(() => { ready = imgs.size === NAMES.length; });
  return loading;
}
export const groundTexReady = () => ready;

// cada tile cobre `scale` vezes o seu tamanho em pixels no mundo; sem emenda, então basta repetir
function pattern(g, name, scale) {
  const i = imgs.get(name); if (!ready || !i) return null;
  const p = g.createPattern(i, 'repeat'); p.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0])); return p;
}
// Cume Gélido e Cinzas Ardentes reaproveitam as texturas da Planície e das Ruínas com um tom por cima (TINT) até chegar arte própria
// de neve/gelo e de basalto/brasa (prompts em docs/art-direction/prompts-cenario.md › seção E).
const BASE = { forest: ['forest', 1.4], plains: ['plains', 1.4], ruins: ['ruins', 0.85], town: ['forest', 1.4], glacier: ['plains', 1.4], ember: ['ruins', 0.85], harbor: ['sand-plains', 1.4] }; // porto: areia clara de chão
const SAND = { forest: ['sand-dirt', 1], plains: ['sand-plains', 1], ruins: ['slabs', 1], glacier: ['sand-plains', 1], ember: ['slabs', 1], harbor: ['slabs', 1] };
const WATER = { forest: ['water-lake', 1.3], plains: ['water-crystal', 1.3], glacier: ['water-crystal', 1.3], ruins: ['water-lake', 1.3], harbor: ['water-lake', 1.3] };
const TINT = { glacier: ['#e8f3fa', 0.66], ember: ['#2a100c', 0.6], harbor: ['#f3e2b4', 0.32] }; // porto: tom quente de areia por cima

// Preenche o terreno inteiro com a textura da zona; devolve true se coube.
export function fillGroundTexture(g, kind, w, h) {
  const b = BASE[kind]; const p = b && pattern(g, b[0], b[1]); if (!p) return false;
  g.fillStyle = p; g.fillRect(0, 0, w, h);
  const t = TINT[kind];
  if (t) { g.globalAlpha = t[1]; g.fillStyle = t[0]; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
  return true;
}
export const trailPattern = (g, kind) => { const b = SAND[kind]; return b ? pattern(g, b[0], b[1]) : null; };
export const waterPattern = (g, kind) => { const b = WATER[kind]; return b ? pattern(g, b[0], b[1]) : null; };
