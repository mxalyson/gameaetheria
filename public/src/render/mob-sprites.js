// Monstros e chefes PINTADOS (B2): criaturas 3D do Meshy fotografadas em 8 direções (tools/mob-bake.mjs → assets/mobs/<id>.webp + .json), animadas por código
// (ciclo de quadros deformados no 3D quando o atlas é animado — `tools/mob-bake.mjs … hop|waddle|trot` —, senão balanço ao andar, respiração, avanço no golpe, flash ao apanhar, tombo ao morrer). SEM esqueleto: a criatura desliza e balança, não move pernas.
// Só desenho: nada aqui altera a simulação. Sem o arquivo da criatura (ou com ?monstros=original, que fica salvo) vale o desenho antigo do renderer.
import { viewFromFacing } from './hero-sprites.js';
import { deathPose } from './hero-death.js';

const KEY = 'aetheria_monstros';
let on = null, index = null, indexLoading = null;
const items = new Map(); // id -> { state: 'loading'|'ready'|'none', img, meta }
export const stats = { drawn: 0, loaded: 0 };

export function mobSpritesEnabled() {
  if (on !== null) return on;
  try {
    const q = new URLSearchParams(location.search).get('monstros');
    if (q === 'pintados' || q === 'original') localStorage.setItem(KEY, q);
    on = (q ?? localStorage.getItem(KEY) ?? 'pintados') === 'pintados';
  } catch { on = true; }
  return on;
}

// índice das criaturas que têm arte (evita pedir arquivos que não existem): assets/mobs/index.json = { ids: [...] }
function loadIndex() {
  if (indexLoading) return indexLoading;
  indexLoading = fetch('assets/mobs/index.json').then((r) => (r.ok ? r.json() : { ids: [] })).catch(() => ({ ids: [] })).then((j) => { index = new Set(j.ids ?? []); });
  return indexLoading;
}

// Quanto o desenho da célula (com margem) é mais alto que o raio de colisão da criatura; ajustável por criatura.
const ART = { default: { h: 3.4 }, slime: { h: 3.0 }, treant: { h: 5.2 }, wolf: { h: 3.1 }, crystalwolf: { h: 2.8 }, wisp: { h: 3.0 }, wraith: { h: 3.4 } };

function load(id) {
  let it = items.get(id);
  if (it) return it;
  it = { state: 'loading', img: null, meta: null }; items.set(id, it);
  loadIndex().then(async () => {
    if (!index.has(id)) { it.state = 'none'; return; }
    try {
      // o json vem primeiro: seu `v` (muda a cada bake) vai na URL da imagem, senão o service worker (cache primeiro p/ .webp) serve a imagem velha com o json novo
      const meta = await fetch(`assets/mobs/${id}.json`).then((r) => r.json());
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `assets/mobs/${id}.webp?v=${meta.v ?? 0}`; });
      if (img.naturalWidth !== meta.cell[0] * meta.cols || img.naturalHeight !== meta.cell[1] * meta.rows) { it.state = 'none'; return; } // imagem e medidas não combinam: desenho antigo em vez de sprite quebrado
      await img.decode?.(); it.meta = meta; it.img = img; it.state = 'ready'; stats.loaded++;
    } catch { it.state = 'none'; }
  });
  return it;
}
// carrega de antemão as criaturas da zona (chamado quando a zona muda)
export function prepareMobs(zone) { if (!mobSpritesEnabled()) return; for (const [id] of zone.mobs ?? []) load(id); if (zone.boss?.id) load(zone.boss.id); }

const lerp = (a, b, k) => a + (b - a) * k;
// Desenha o monstro `a` como sprite; devolve false se não há arte pronta (o chamador usa o desenho antigo).
export function drawMobSprite(g, a, t) {
  const it = load(a.mobId);
  if (it.state === 'loading') return true; // carregando: não desenha (senão o desenho antigo piscava antes do pintado)
  if (it.state !== 'ready') return false;
  const { meta, img } = it, [cw, ch] = meta.cell, art = ART[a.mobId] ?? ART.default;
  const view = viewFromFacing(a.facing ?? Math.PI / 2);
  const H = a.r * art.h, k = H / ch, W = cw * k;
  const ph = a.walk ?? 0;
  const moving = !!a.moving && !a.dead;
  const nf = meta.frames ?? 0; // atlas animado: o ciclo já traz o salto/andar; por código fica só o resto
  const bob = moving && !nf ? Math.abs(Math.sin(ph)) * H * 0.05 : 0;
  const sway = moving ? Math.sin(ph) * 0.045 : Math.sin(t * 1.6 + a.id) * 0.012;
  const squash = nf ? 1 : moving ? 1 + Math.sin(ph * 2) * 0.035 : 1 + Math.sin(t * 2.2 + a.id) * 0.018;
  let lunge = 0; if (a.swing > 0 && !a.dead) lunge = Math.sin((1 - Math.min(1, a.swing / 0.25)) * Math.PI) * H * 0.16; // avanço no golpe, na direção que olha
  const fx = Math.cos(a.facing ?? 0), fy = Math.sin(a.facing ?? 0) * 0.5;
  const footY = a.y + a.r * 0.8; // onde o desenho antigo apoiava a sombra
  g.save();
  g.translate(a.x + fx * lunge, footY + fy * lunge - bob);
  if (a.dead) { const P = deathPose(a.deadT ?? 0, view >= 1 && view <= 3 ? -1 : 1); g.rotate(P.rot); g.scale(1, P.squash); g.globalAlpha *= P.alpha; }
  g.rotate(sway); g.scale(1 / squash, squash);
  // quadro do ciclo: andando, segue a fase do passo; parado, um ciclo lento (a criatura nunca fica congelada)
  const fr = nf ? Math.floor((((moving ? ph / (2 * Math.PI) : t * 0.8 + a.id * 0.37) % 1) + 1) % 1 * nf) : 0;
  const sx = nf ? fr * cw : (view % 4) * cw, sy = nf ? view * ch : Math.floor(view / 4) * ch;
  g.drawImage(img, sx, sy, cw, ch, -meta.ax * k, -meta.ay * k, W, H);
  if (a.hitFlash > 0 && !a.dead) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(0.55, a.hitFlash * 5); g.drawImage(img, sx, sy, cw, ch, -meta.ax * k, -meta.ay * k, W, H); }
  g.restore(); stats.drawn++;
  return true;
}
