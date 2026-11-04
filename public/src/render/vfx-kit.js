// Kit de sprites de efeito (VFX): atlas public/assets/vfx/vfx.webp + vfx.json, gerados por tools/vfx-kit.py (ou arte do dono, mesmo formato).
// Cada sprite guarda INTENSIDADE (cinza) + alfa; aqui ele é pintado com uma rampa de cor por paleta (borda escura -> cor -> clara -> branco no núcleo)
// e guardado em um canvas pequeno (cache por sprite x paleta, criado só no primeiro uso). Carregamento sob demanda (loadVfxKit); só apresentação.
import { asset } from '../assets-version.js';

export const NAMES = ['glow', 'ring', 'shock', 'flame0', 'flame1', 'flame2', 'flame3', 'ember0', 'ember1', 'spark', 'star8', 'burst', 'rays',
  'crystal0', 'crystal1', 'crystal2', 'flake', 'bolt0', 'bolt1', 'bolt2', 'ribbon0', 'ribbon1', 'wind', 'leaf0', 'leaf1', 'smoke0', 'smoke1', 'smoke2',
  'wisp0', 'wisp1', 'shard0', 'shard1', 'cross', 'bubble', 'rune0', 'rune1', 'slash0', 'slash1'];
export const SP = {}; NAMES.forEach((n, i) => { SP[n] = i; });

// paletas: [borda escura, cor, clara]; o núcleo (intensidade > 0,8) vai ao branco
const PAL_DEF = {
  fire: ['#781908', '#ff6e1e', '#ffc85a'], ember: ['#420505', '#e0241a', '#ff9a5a'], ice: ['#143c82', '#46bef0', '#c8f5ff'], violet: ['#3c1982', '#9664ff', '#e1cdff'],
  toxic: ['#14500f', '#6ed746', '#d2ff96'], turq: ['#08504e', '#1fd6c4', '#b4fff0'], amber: ['#6e3a04', '#ffa81e', '#ffe090'], gold: ['#8c5005', '#ffbe32', '#fff0aa'],
  holy: ['#a0782a', '#ffe9a0', '#ffffff'], violamber: ['#4b1d7a', '#ffb02e', '#fff0c0'], leaf: ['#0f5a1e', '#46c24e', '#d4ff9a'], smoke: ['#23232c', '#7c7c8c', '#d4d4e0'],
  stone: ['#2a1c12', '#8a6a4a', '#e0c8a0'], dust: ['#4a4030', '#a89a78', '#e8dcc0'],
};
export const PL = {}; export const PAL_NAMES = Object.keys(PAL_DEF); PAL_NAMES.forEach((n, i) => { PL[n] = i; });
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const PALS = PAL_NAMES.map((n) => PAL_DEF[n].flatMap(hex));

const st = { ready: false, loading: false, W: 0, H: 0, data: null, meta: null, fake: false };
const cache = new Array(PAL_NAMES.length * NAMES.length).fill(null);

export const vfxKitReady = () => st.ready;

export function loadVfxKit() {
  if (st.ready || st.loading || typeof document === 'undefined') return;
  st.loading = true;
  const url = asset('assets/vfx/vfx.webp');
  Promise.all([
    new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }),
    fetch(asset('assets/vfx/vfx.json')).then((r) => r.json()),
  ]).then(([img, json]) => {
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(img, 0, 0);
    st.W = img.width; st.H = img.height; st.data = c.getImageData(0, 0, st.W, st.H).data; st.meta = NAMES.map((n) => json.sprites[n] ?? null);
    st.ready = true;
  }).catch(() => { st.loading = false; }); // sem o kit os efeitos simplesmente não aparecem (nunca quebra o jogo)
}

// Só para testes em Node: kit de mentira (cada sprite é um objeto com a forma certa).
export function useFakeKit() { st.ready = true; st.fake = true; }

const FAKE = { cv: {}, w: 64, h: 64, ax: 32, ay: 32 };
// Devolve { cv, w, h, ax, ay } (âncora em px da célula) ou null enquanto o kit não carregou.
export function sprite(id, pal) {
  if (!st.ready) return null;
  if (st.fake) return FAKE;
  const key = pal * NAMES.length + id;
  return cache[key] ?? (cache[key] = make(id, pal));
}

function make(id, pal) {
  const m = st.meta[id]; if (!m) return null;
  const [x, y, w, h, ax, ay] = m;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'), im = c.createImageData(w, h), d = im.data, P = PALS[pal], src = st.data, W = st.W;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const s = ((y + j) * W + x + i) * 4, o = (j * w + i) * 4, t = src[s] / 255; let r, g, b;
    if (t < 0.45) { const u = t / 0.45; r = P[0] + (P[3] - P[0]) * u; g = P[1] + (P[4] - P[1]) * u; b = P[2] + (P[5] - P[2]) * u; }
    else if (t < 0.8) { const u = (t - 0.45) / 0.35; r = P[3] + (P[6] - P[3]) * u; g = P[4] + (P[7] - P[4]) * u; b = P[5] + (P[8] - P[5]) * u; }
    else { const u = (t - 0.8) / 0.2; r = P[6] + (255 - P[6]) * u; g = P[7] + (255 - P[7]) * u; b = P[8] + (255 - P[8]) * u; }
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = src[s + 3];
  }
  c.putImageData(im, 0, 0);
  return { cv, w, h, ax, ay };
}

// Pré-aquecimento: pinta os sprites mais usados de uma paleta UM por quadro (evita engasgo no primeiro uso de cada paleta)
const CORE = ['glow', 'burst', 'shock', 'rune0', 'rune1', 'star8', 'spark', 'flame0', 'flame1', 'flame2', 'flame3', 'ribbon0', 'ring', 'slash0'].map((n) => SP[n]);
const wq = [], warmed = new Set();
export function warm(pal) {
  if (!st.ready || st.fake || warmed.has(pal)) return;
  warmed.add(pal); for (const id of CORE) if (!cache[pal * NAMES.length + id]) wq.push(pal * NAMES.length + id);
}
export function warmStep() {
  const k = wq.pop();
  if (k !== undefined && !cache[k]) cache[k] = make(k % NAMES.length, (k / NAMES.length) | 0);
}

// memória decodificada do atlas (bytes) + o que já foi pintado em cache (para o relatório de orçamento)
export function vfxKitBytes() {
  let n = st.W * st.H * 4;
  for (const s of cache) if (s) n += s.w * s.h * 4;
  return n;
}
