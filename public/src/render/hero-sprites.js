// Heróis em miniatura no jogo real (visual novo, OPCIONAL e desligado por padrão).
// Liga com ?visual=miniatura na URL (fica salvo no aparelho); ?visual=original volta ao visual antigo.
// Usa os atlas prontos (PNG + JSON, 8 direções, esqueleto): public/labs/iso-poc/art-local/atlas-rig/<herói>/ — mesmo formato do laboratório.
// Só desenho: lê o estado do ator (parado/andando/golpe/skill/dano/morte/dash) e não altera a simulação.
import { deathPose } from './hero-death.js';

const KEY = 'aetheria_visual';
const CLASS_TO_HERO = { warrior: 'paladino', mage: 'aprendiz', archer: 'franco', cleric: 'sacerdote' };
const BASE = new URL('../../labs/iso-poc/art-local/atlas-rig/', import.meta.url).href;
export const SIZE = 0.9;             // escala do quadro (128 lógico): ≈ 80 px de altura no jogo (o herói antigo tinha ~48)
const FEET_Y = 12;                    // os pés do herói antigo ficam em a.y + 12
export const stats = { drawn: 0, loaded: 0 };

let enabled = null;
export function heroSpritesEnabled() {
  if (enabled !== null) return enabled;
  try {
    const q = new URLSearchParams(location.search).get('visual');
    if (q === 'miniatura' || q === 'original') localStorage.setItem(KEY, q);
    enabled = (q ?? localStorage.getItem(KEY)) === 'miniatura';
  } catch { enabled = false; }
  if (enabled) window.heroSprites = stats; // gancho de teste/diagnóstico
  return enabled;
}

const atlases = new Map();            // id -> { state, meta, sheets }
function load(id) {
  const at = { state: 'loading', meta: null, sheets: {} };
  atlases.set(id, at);
  (async () => {
    try {
      const meta = await (await fetch(`${BASE}${id}/${id}.json`)).json();
      for (const name of Object.keys(meta.clips)) {
        const img = new Image(); img.src = `${BASE}${id}/${name}.png`; await img.decode();
        at.sheets[name] = img;
      }
      at.meta = meta; at.state = 'ready'; stats.loaded++;
    } catch (e) { at.state = 'error'; console.warn('herói em miniatura indisponível:', id, e.message); }
  })();
  return at;
}

// Direção (8 vistas: 0 S, 1 SE, 2 L, 3 NE, 4 N, 5 NO, 6 O, 7 SO) a partir do ângulo de visão no plano do jogo (y para baixo).
export function viewFromFacing(face) {
  const phi = Math.atan2(Math.cos(face), Math.sin(face)); // S = 0, L = π/2, N = π, O = -π/2
  return (((Math.round(phi / (Math.PI / 4)) % 8) + 8) % 8);
}

const ACTING = new Set(['attack', 'skill', 'dash', 'hit']);
const states = new WeakMap();

// Desenha o herói `a` com o atlas da sua classe. Retorna false se ainda não dá (carregando/erro): o chamador usa o visual antigo.
export function drawHeroSprite(g, a, t) {
  const id = CLASS_TO_HERO[a.classId];
  if (!id) return false;
  const at = atlases.get(id) ?? load(id);
  if (at.state !== 'ready') return false;
  const { meta, sheets } = at, clips = meta.clips;
  let st = states.get(a);
  if (!st) { st = { clip: 'idle', el: 0, lastT: t, prevSwing: 0, prevHit: 0 }; states.set(a, st); }
  const dt = Math.max(0, Math.min(0.1, t - st.lastT)); st.lastT = t;

  const restart = (name) => { if (clips[name]) { st.clip = name; st.el = 0; } };
  const finished = () => { const c = clips[st.clip]; return !c.loop && st.el * c.fps >= c.frames; };
  if (a.dead) {
    if (st.clip !== 'hit') restart('hit');
  } else {
    const acting = ACTING.has(st.clip) && !finished();
    if (a.dash && st.clip !== 'dash') restart('dash');
    else if (a.swing > st.prevSwing + 1e-4 && !a.dash) restart(Math.abs(a.swing - 0.3) < 0.02 ? 'skill' : 'attack'); // golpe básico 0,25 s; skill 0,3 s (sim.js)
    else if (a.hitFlash > 0 && st.prevHit <= 0 && !acting) restart('hit');
    else if (!acting) { const want = a.moving ? 'walk' : 'idle'; if (st.clip !== want) restart(want); }
  }
  st.prevSwing = a.swing; st.prevHit = a.hitFlash;
  st.el += dt;
  const c = clips[st.clip];
  const f = c.loop ? Math.floor(st.el * c.fps) % c.frames : Math.min(Math.floor(st.el * c.fps), c.frames - 1);
  const view = viewFromFacing(a.facing ?? Math.PI / 2);

  const sheet = sheets[st.clip], rows = meta.rows ?? meta.views, cw = sheet.width / c.frames, ch = sheet.height / rows;
  const flip = meta.mirror && view > 4, row = flip ? meta.views - view : view;
  const x = a.x, y = a.y + FEET_Y, k = SIZE;
  g.save();
  g.translate(x, y);
  if (a.dead) { // morto: tomba em torno dos pés, amassa e esmaece (sem textura nova)
    const P = deathPose(a.deadT ?? 0, view >= 1 && view <= 3 ? -1 : 1);
    g.rotate(P.rot); g.scale(1, P.squash); g.globalAlpha *= P.alpha;
  }
  if (flip) g.scale(-1, 1);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
  g.drawImage(sheet, f * cw, row * ch, cw, ch, -meta.pivot.x * k, -meta.pivot.y * k, meta.frame.w * k, meta.frame.h * k);
  g.restore();
  stats.drawn++;
  return true;
}

heroSpritesEnabled(); // lê ?visual= já no carregamento (salva a escolha mesmo antes do primeiro herói ser desenhado)
