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

// 'auto' escolhe pelo aparelho: celular/tablet (toque) começa em qualidade média; computador, alta.
export function resolveQuality(prefs, coarse) {
  return prefs.quality === 'auto' ? (coarse ? 'medium' : 'high') : prefs.quality;
}
