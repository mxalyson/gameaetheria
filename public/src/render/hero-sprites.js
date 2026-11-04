// Heróis em miniatura no jogo real (visual novo, OPCIONAL e desligado por padrão).
// Liga com ?visual=miniatura na URL (fica salvo no aparelho); ?visual=original volta ao visual antigo.
// Usa os atlas prontos (PNG + JSON, 8 direções, esqueleto): public/labs/iso-poc/art-local/atlas-rig/<herói>/ — mesmo formato do laboratório.
// Só desenho: lê o estado do ator (parado/andando/golpe/skill/dano/morte/dash) e não altera a simulação.
import { deathPose } from './hero-death.js';
import { loadPrefs, resolveQuality } from '../prefs.js';
import { auraTier, auraSpec } from '../core/aura.js';

const KEY = 'aetheria_visual';
const CLASS_TO_HERO = { warrior: 'paladino', mage: 'aprendiz', archer: 'franco', cleric: 'sacerdote' };
const BASE = new URL('../../labs/iso-poc/art-local/atlas-rig/', import.meta.url).href;
export const SIZE = 0.9;             // escala do quadro (128 lógico): ≈ 80 px de altura no jogo (o herói antigo tinha ~48)
const FEET_Y = 12;                    // os pés do herói antigo ficam em a.y + 12
// Visual de evolução de um personagem ou ator (arte do dono). tier 0 = comum, 1 = especialização (nv 15, aura), 2 = Maestria (nv 25, aura refinada).
// `atlasVariant` é o id do atlas de variante (pasta em atlas-rig/) quando existe arte para `classe:spec:tier`; senão undefined e vale o atlas da classe + aura (render/aura.js).
// Para acrescentar um herói de evolução: gerar o atlas (ver docs/art-direction/personagens-miniatura.md) e registrar aqui. Ver docs/art-direction/aura-evolucao.md.
const VARIANT_ATLASES = { // Maestria (Nv 25): arte do dono por especialização; carrega sob demanda, com fallback ao atlas da classe
  'warrior:paladin:2': 'paladin_nv25', 'warrior:berserker:2': 'berserker_nv25',
  'archer:sniper:2': 'sniper_nv25', 'archer:gunslinger:2': 'gunslinger_nv25',
  'mage:warlock:2': 'warlock_nv25', 'cleric:guardian:2': 'guardian_nv25',
  'mage:arcane:2': 'arcane_nv25', 'cleric:inquisitor:2': 'inquisitor_nv25', // chibi_heroes.glb do dono (rig v2)
};
export function heroLook(o) {
  const tier = auraTier(o), spec = tier ? auraSpec(o) : null;
  return { tier, spec, atlasVariant: spec ? VARIANT_ATLASES[`${o?.classId}:${spec}:${tier}`] : undefined };
}

export const VARIANT_TEX_K = 0.8;
export const stats = { drawn: 0, loaded: 0, texBytes: 0, texScale: 1 };

// Escala das texturas (memória de GPU): cada herói tem ≈ 20–24 MiB decodificados em resolução cheia (4 classes ≈ 87 MiB).
// Qualidade alta = 1; média (padrão em celular) = 0,75; baixa = 0,5. Aparelhos com pouca memória (deviceMemory ≤ 4 GB) nunca passam de 0,75 (≤ 2 GB: 0,5).
// O desenho usa proporções da própria folha (largura ÷ quadros), então folhas reduzidas funcionam sem mudar o resto. ?texscale=0.5 força um valor.
export function textureScale() {
  let q = 'high';
  try { q = resolveQuality(loadPrefs(), matchMedia('(pointer: coarse)').matches); } catch { /* sem prefs: alta */ }
  let k = q === 'low' ? 0.5 : q === 'medium' ? 0.75 : 1;
  const mem = typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined;
  if (mem && mem <= 2) k = Math.min(k, 0.5); else if (mem && mem <= 4) k = Math.min(k, 0.75);
  const force = Number(new URLSearchParams(location.search).get('texscale'));
  if (force >= 0.25 && force <= 1) k = force;
  return k;
}

let enabled = null;
export function heroSpritesEnabled() {
  if (enabled !== null) return enabled;
  if (typeof window !== 'undefined' && window.TESTE) { enabled = true; window.heroSprites = stats; return true; } // modo ?teste=: sempre o visual novo, sem tocar no aparelho
  try {
    const q = new URLSearchParams(location.search).get('visual');
    if (q === 'miniatura' || q === 'original') localStorage.setItem(KEY, q);
    enabled = (q ?? localStorage.getItem(KEY) ?? 'miniatura') === 'miniatura'; // padrão: miniatura; ?visual=original volta ao visual antigo
  } catch { enabled = false; }
  if (enabled) window.heroSprites = stats; // gancho de teste/diagnóstico
  return enabled;
}

const atlases = new Map();            // id -> { state, meta, sheets }
function load(id) {
  const at = { state: 'loading', meta: null, sheets: {}, promise: null };
  atlases.set(id, at);
  at.promise = (async () => {
    try {
      const meta = await (await fetch(`${BASE}${id}/${id}.json`)).json();
      for (const name of Object.keys(meta.clips)) {
        const img = new Image(); img.src = `${BASE}${id}/${name}.png`; await img.decode();
        const k0 = (stats.texScale = textureScale());
        const k = k0 < 1 && !Object.values(CLASS_TO_HERO).includes(id) ? k0 * VARIANT_TEX_K : k0; // variantes de evolução: um pouco menores em média/baixa (orçamento de memória; ver texture-budget)
        // reduz ao carregar: a imagem cheia é liberada e só a reduzida fica na memória de GPU
        const sheet = k < 1 ? await createImageBitmap(img, { resizeWidth: Math.round(img.naturalWidth * k), resizeHeight: Math.round(img.naturalHeight * k), resizeQuality: 'medium' }) : img;
        stats.texBytes += sheet.width * sheet.height * 4;
        at.sheets[name] = sheet;
      }
      at.meta = meta; at.state = 'ready'; stats.loaded++;
    } catch (e) { at.state = 'error'; console.warn('herói em miniatura indisponível:', id, e.message); }
  })();
  return at;
}

// Carrega o herói da classe antes de começar (a tela de carregamento espera por isto).
// Aceita o id da classe ou o personagem/ator (assim já carrega o visual de evolução, se houver).
export function preloadHero(who) {
  const classId = typeof who === 'string' ? who : who?.classId;
  const id = (typeof who === 'object' && heroLook(who).atlasVariant) || CLASS_TO_HERO[classId];
  if (!id) return Promise.resolve();
  const at = atlases.get(id) ?? load(id);
  // variante que falhar não trava a tela de carregamento: o desenho cai no atlas da classe
  return at.promise.then(() => (at.state === 'error' && CLASS_TO_HERO[classId] !== id ? preloadHero(classId) : undefined));
}

// Tela de carregamento por cima do jogo até o herói estar pronto (nunca mostra o desenho antigo no lugar dele).
export function showHeroLoading(promise) {
  let el = document.getElementById('hero-loading');
  if (!el) {
    el = document.createElement('div'); el.id = 'hero-loading';
    el.style.cssText = 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:radial-gradient(circle at 50% 40%,#2a2f5a,#141a2e 60%,#0d1122);color:#f3e8c8;font:800 15px Nunito,system-ui,sans-serif;letter-spacing:.04em;transition:opacity .3s';
    el.innerHTML = '<div style="text-align:center"><div style="width:54px;height:54px;margin:0 auto 14px;border-radius:50%;border:3px solid rgba(255,207,74,.25);border-top-color:#ffcf4a;animation:hl-spin 0.9s linear infinite"></div>Preparando seu herói…</div><style>@keyframes hl-spin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(el);
  }
  el.style.opacity = '1'; el.style.pointerEvents = 'auto';
  const done = () => { el.style.opacity = '0'; el.style.pointerEvents = 'none'; setTimeout(() => el.remove(), 320); };
  Promise.resolve(promise).then(done, done);
}

// Direção (8 vistas: 0 S, 1 SE, 2 L, 3 NE, 4 N, 5 NO, 6 O, 7 SO) a partir do ângulo de visão no plano do jogo (y para baixo).
export function viewFromFacing(face) {
  const phi = Math.atan2(Math.cos(face), Math.sin(face)); // S = 0, L = π/2, N = π, O = -π/2
  return (((Math.round(phi / (Math.PI / 4)) % 8) + 8) % 8);
}

const ACTING = new Set(['attack', 'skill', 'dash', 'hit']);
const states = new WeakMap();

// Desenha o herói `a` com o atlas da sua classe. Retorna true (desenhou), 'wait' (ainda carregando: não desenhar nada,
// para não "piscar" o desenho antigo) ou false (classe sem herói ou falha ao carregar: o chamador usa o visual antigo).
export function drawHeroSprite(g, a, t) {
  const base = CLASS_TO_HERO[a.classId];
  if (!base) return false;
  let at = null;
  const variant = a.spec ? heroLook(a).atlasVariant : undefined; // só quem tem especialização
  if (variant) { // visual de evolução sob demanda; enquanto carrega ou se faltar, usa o atlas base (nunca fica invisível)
    const v = atlases.get(variant) ?? load(variant);
    if (v.state === 'ready') at = v;
  }
  if (!at) {
    at = atlases.get(base) ?? load(base);
    if (at.state === 'loading') return 'wait';
    if (at.state !== 'ready') return false;
  }
  const { meta, sheets } = at, clips = meta.clips;
  let st = states.get(a);
  if (!st) { st = { clip: 'idle', el: 0, lastT: t, prevSwing: 0, prevHit: 0, px: a.x, py: a.y, moveFace: a.facing ?? Math.PI / 2 }; states.set(a, st); }
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
  const mdx = a.x - st.px, mdy = a.y - st.py; st.px = a.x; st.py = a.y;
  if (a.moving && Math.hypot(mdx, mdy) > 0.3) st.moveFace = Math.atan2(mdy, mdx);
  const acting = ACTING.has(st.clip) && st.clip !== 'hit' && !(clips[st.clip].loop) && st.el * c.fps < c.frames;
  const view = viewFromFacing(a.moving && !acting && !a.dead ? st.moveFace : (a.facing ?? Math.PI / 2));

  const sheet = sheets[st.clip], rows = meta.rows ?? meta.views, cw = sheet.width / c.frames, ch = sheet.height / rows;
  const flip = meta.mirror && view > 4, row = flip ? meta.views - view : view;
  const x = a.x, y = a.y + FEET_Y, k = SIZE * (meta.sizeMul ?? 1); // sizeMul: iguala a altura de atlas de variante à do herói base
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
