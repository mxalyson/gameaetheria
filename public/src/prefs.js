// Preferências do aparelho (escala da interface, qualidade gráfica, tipo de controle).
// Ficam separadas do personagem salvo: valem para o aparelho, não para o herói.
const KEY = 'aetheria_prefs_v1';

export const SCALE_MIN = 70;
export const SCALE_MAX = 150;
export const SCALE_STEP = 10;
export const QUALITIES = ['auto', 'high', 'medium', 'low'];
export const CONTROLS = ['auto', 'touch', 'keyboard'];
const DEFAULTS = { scale: 100, quality: 'auto', controls: 'auto' };

const clean = (p) => ({
  scale: Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.round(Number(p.scale) / SCALE_STEP) * SCALE_STEP || DEFAULTS.scale)),
  quality: QUALITIES.includes(p.quality) ? p.quality : DEFAULTS.quality,
  controls: CONTROLS.includes(p.controls) ? p.controls : DEFAULTS.controls,
});

export function loadPrefs() {
  try { return clean({ ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }); } catch { return { ...DEFAULTS }; }
}

export function savePrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* armazenamento indisponível */ }
}

// arg: "scale:+10", "scale:-10", "quality:low", "controls:touch"
export function changePref(prefs, arg) {
  const [key, val] = arg.split(':');
  const next = { ...prefs };
  if (key === 'scale') next.scale = prefs.scale + (val.startsWith('+') || val.startsWith('-') ? Number(val) : Number(val) - prefs.scale);
  else if (key === 'quality' || key === 'controls') next[key] = val;
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
