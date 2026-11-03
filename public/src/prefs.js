// Preferências do aparelho (escala da interface, qualidade gráfica, tipo de controle).
// Ficam separadas do personagem salvo: valem para o aparelho, não para o herói.
const KEY = 'aetheria_prefs_v1';

export const SCALE_MIN = 70;
export const SCALE_MAX = 150;
export const SCALE_STEP = 10;
export const QUALITIES = ['auto', 'high', 'medium', 'low'];
export const CONTROLS = ['auto', 'touch', 'keyboard'];
export const DAYNIGHTS = ['auto', 'day'];
const DEFAULTS = { scale: 'auto', quality: 'auto', controls: 'auto', daynight: 'auto' };

// Escala automática da interface (%): acompanha a viewport (referência 1024×480 pt, piso 70%, teto 100%).
// Celular deitado (iPhone 874×402) cai para ~84%; tela de 700 px de altura ou mais fica em 100%. O tamanho manual (70–150%) continua nas Opções.
export const AUTO_MIN = 70, AUTO_MAX = 100;
export function autoScale(w = globalThis.innerWidth ?? 1024, h = globalThis.innerHeight ?? 480) {
  const k = Math.min(w / 1024, h / 480);
  return Math.max(AUTO_MIN, Math.min(AUTO_MAX, Math.round(k * 100)));
}
export const resolveScale = (prefs, w, h) => (prefs.scale === 'auto' ? autoScale(w, h) : prefs.scale);

const clean = (p) => ({
  scale: p.scale === 'auto' ? 'auto' : Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.round(Number(p.scale) / SCALE_STEP) * SCALE_STEP || DEFAULTS.scale)),
  quality: QUALITIES.includes(p.quality) ? p.quality : DEFAULTS.quality,
  controls: CONTROLS.includes(p.controls) ? p.controls : DEFAULTS.controls,
  daynight: DAYNIGHTS.includes(p.daynight) ? p.daynight : DEFAULTS.daynight,
});

export function loadPrefs() {
  try { return clean({ ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }); } catch { return { ...DEFAULTS }; }
}

export function savePrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* armazenamento indisponível */ }
}

// arg: "scale:auto", "scale:+10", "scale:-10", "quality:low", "controls:touch", "daynight:day"
export function changePref(prefs, arg, w, h) {
  const [key, val] = arg.split(':');
  const next = { ...prefs };
  if (key === 'scale' && val === 'auto') next.scale = 'auto';
  else if (key === 'scale') next.scale = resolveScale(prefs, w, h) + (val.startsWith('+') || val.startsWith('-') ? Number(val) : Number(val) - resolveScale(prefs, w, h));
  else if (key === 'quality' || key === 'controls' || key === 'daynight') next[key] = val;
  return clean(next);
}

// 'auto' escolhe pelo aparelho: computador e celulares/tablets potentes (iPhone recente, Android topo: ≥ 6 núcleos e, se o aparelho informar, > 4 GB) usam alta;
// os fracos começam em média. Antes todo toque caía em "média" (resolução do canvas 1,5× e texturas a 75%): num iPhone de tela 3× tudo saía borrado.
export function deviceTier() {
  try {
    // iPhone/iPad (inclusive Chrome no iOS, que é WebKit): o WebKit não informa deviceMemory e pode informar poucos núcleos; todo iPhone de tela 3× (XS em diante) aguenta 'alta'
    const ua = navigator.userAgent ?? '', ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios && (devicePixelRatio || 1) >= 2.5) return 'high';
    const cores = navigator.hardwareConcurrency ?? 4, mem = navigator.deviceMemory;
    return cores <= 4 || (mem && mem <= 4) ? 'medium' : 'high';
  } catch { return 'medium'; }
}
export function resolveQuality(prefs, coarse) {
  return prefs.quality === 'auto' ? (coarse ? deviceTier() : 'high') : prefs.quality;
}
