// Monstros e chefes PINTADOS (B2): criaturas 3D do Meshy fotografadas em 8 direções (tools/mob-bake.mjs → assets/mobs/<id>.webp + .json), animadas por código
// (ciclo de quadros deformados no 3D quando o atlas é animado — `tools/mob-bake.mjs … hop|waddle|trot` —, senão balanço ao andar, respiração, avanço no golpe, flash ao apanhar, tombo ao morrer). SEM esqueleto: a criatura desliza e balança, não move pernas.
// Só desenho: nada aqui altera a simulação. Sem o arquivo da criatura (ou com ?monstros=original, que fica salvo) vale o desenho antigo do renderer.
import { viewFromFacing } from './hero-sprites.js';
import { deathPose } from './hero-death.js';
import { MOBS } from '../data/mobs.js';

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
const ART = { default: { h: 3.4 }, slime: { h: 3.0 }, treant: { h: 5.2 }, colossus: { h: 5.2 }, shroom: { h: 4.2 }, guardian: { h: 5.4 }, wolf: { h: 3.1 }, crystalwolf: { h: 2.8 }, wisp: { h: 3.0 }, wraith: { h: 3.4 } };

// Recolore uma vez ao carregar (hue em graus, sat/bri multiplicadores, mul = multiplicador por canal): as variantes de cor reaproveitam a arte da criatura de base.
function tint(img, t) {
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data, a = ((t.hue ?? 0) * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  const m = [0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928,
    0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.14, 0.072 - cs * 0.072 - sn * 0.283,
    0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072];
  const sat = t.sat ?? 1, bri = t.bri ?? 1, [mr, mg, mb] = t.mul ?? [1, 1, 1];
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    let r = p[i], gg = p[i + 1], b = p[i + 2];
    const r2 = m[0] * r + m[1] * gg + m[2] * b, g2 = m[3] * r + m[4] * gg + m[5] * b, b2 = m[6] * r + m[7] * gg + m[8] * b;
    const l = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
    p[i] = Math.max(0, Math.min(255, (l + (r2 - l) * sat) * mr * bri));
    p[i + 1] = Math.max(0, Math.min(255, (l + (g2 - l) * sat) * mg * bri));
    p[i + 2] = Math.max(0, Math.min(255, (l + (b2 - l) * sat) * mb * bri));
  }
  g.putImageData(d, 0, 0);
  return createImageBitmap ? createImageBitmap(c) : c; // bitmap (GPU) em vez de canvas de CPU
}

function load(id) {
  let it = items.get(id);
  if (it) return it;
  it = { state: 'loading', img: null, meta: null }; items.set(id, it);
  const V = MOBS[id], art = V?.art ?? id; // variante recolorida usa a arte de `art`
  loadIndex().then(async () => {
    if (!index.has(art)) { it.state = 'none'; return; }
    try {
      // o json vem primeiro: seu `v` (muda a cada bake) vai na URL da imagem, senão o service worker (cache primeiro p/ .webp) serve a imagem velha com o json novo
      const meta = await fetch(`assets/mobs/${art}.json`).then((r) => r.json());
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `assets/mobs/${art}.webp?v=${meta.v ?? 0}`; });
      if (img.naturalWidth !== meta.cell[0] * meta.cols || img.naturalHeight !== meta.cell[1] * meta.rows) { it.state = 'none'; return; } // imagem e medidas não combinam: desenho antigo em vez de sprite quebrado
      await img.decode?.(); it.meta = meta; it.img = V?.tint ? await tint(img, V.tint) : img; it.state = 'ready'; stats.loaded++;
    } catch { it.state = 'none'; }
  });
  return it;
}
// Retrato do chefe para a barra de vida: recorte do ROSTO/torso da vista frontal (célula 0,0 do atlas) já recolorido pelo mesmo tint() do sprite
// (it.img é a imagem tingida), clareado e enquadrado pela caixa dos pixels visíveis. Gera um PNG (data URL) uma vez por criatura; null enquanto o atlas não carregou ou sem arte.
const portraits = new Map();
export function mobPortrait(id) {
  if (!mobSpritesEnabled()) return null;
  const it = load(id); if (it.state !== 'ready') return null;
  if (portraits.has(id)) return portraits.get(id);
  let res = null;
  try {
    const [cw, ch] = it.meta.cell, S = 112;
    const tmp = document.createElement('canvas'); tmp.width = cw; tmp.height = ch;
    const tg = tmp.getContext('2d', { willReadFrequently: true }); tg.drawImage(it.img, 0, 0, cw, ch, 0, 0, cw, ch);
    const px = tg.getImageData(0, 0, cw, ch).data;
    let x0 = cw, x1 = 0, y0 = ch, y1 = 0, lum = 0, nl = 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const o = (y * cw + x) * 4; if (px[o + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; lum += 0.3 * px[o] + 0.59 * px[o + 1] + 0.11 * px[o + 2]; nl++; } }
    const bright = Math.max(1.1, Math.min(2.2, 105 / Math.max(20, lum / Math.max(1, nl)))); // clareia mais quanto mais escuro o sprite (o Cavaleiro Rubro saía quase ilegível)
    if (x1 > x0 && y1 > y0) {
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, side = Math.min(Math.max(bw, bh * 0.62) * 1.08, Math.max(bw, bh)); // alto da figura: rosto e tronco; larga: a figura inteira
      const cx = (x0 + x1) / 2, sx = cx - side / 2, sy = y0 - side * 0.04;
      const c = document.createElement('canvas'); c.width = S; c.height = S;
      const g = c.getContext('2d');
      const bg = g.createRadialGradient(S / 2, S * 0.4, 4, S / 2, S / 2, S * 0.72); bg.addColorStop(0, '#7a5a52'); bg.addColorStop(1, '#2e1a1e');
      g.fillStyle = bg; g.fillRect(0, 0, S, S);
      if ('filter' in g) g.filter = `brightness(${bright.toFixed(2)}) contrast(1.05)`; // sprites escuros viravam uma mancha preta
      g.drawImage(tmp, sx, sy, side, side, 0, 0, S, S);
      res = { url: c.toDataURL('image/png') };
    }
  } catch { res = null; }
  portraits.set(id, res);
  return res;
}
// carrega de antemão as criaturas da zona (chamado quando a zona muda)
export function prepareMobs(zone) { if (!mobSpritesEnabled()) return; for (const [id] of zone.mobs ?? []) load(id); if (zone.boss?.id) load(zone.boss.id); }

// pesados: o golpe é uma pancada (ergue e bate); aéreos: recolhem e arremetem; os demais agacham e dão o bote
const HEAVY = new Set(['golem', 'colossus', 'guardian', 'treant']), AIRY = new Set(['wisp', 'wraith']);
// Desenha o monstro `a` como sprite; devolve false se não há arte pronta (o chamador usa o desenho antigo).
export function drawMobSprite(g, a, t) {
  const it = load(a.mobId);
  if (it.state === 'loading') return true; // carregando: não desenha (senão o desenho antigo piscava antes do pintado)
  if (it.state !== 'ready') return false;
  const { meta, img } = it, [cw, ch] = meta.cell, art = ART[a.mobId] ?? ART[MOBS[a.mobId]?.art] ?? ART.default;
  const view = viewFromFacing(a.facing ?? Math.PI / 2);
  const H = a.r * art.h, k = H / ch, W = cw * k;
  const ph = a.walk ?? 0;
  const moving = !!a.moving && !a.dead;
  const nf = meta.frames ?? 0; // atlas animado: o ciclo já traz o salto/andar; por código fica só o resto
  const bob = moving && !nf ? Math.abs(Math.sin(ph)) * H * 0.05 : 0;
  const sway = moving ? Math.sin(ph) * 0.045 : Math.sin(t * 1.6 + a.id) * 0.012;
  const squash = nf ? 1 + Math.sin(t * 2 + a.id) * 0.01 : moving ? 1 + Math.sin(ph * 2) * 0.035 : 1 + Math.sin(t * 2.2 + a.id) * 0.018;
  // golpe em 3 tempos (swing conta de ~0.3 s até 0): antecipação (recua/agacha ou, nos pesados, ergue), golpe (avanço ou pancada) e recuperação
  const fx = Math.cos(a.facing ?? 0), fy = Math.sin(a.facing ?? 0) * 0.5;
  let lunge = 0, atkSy = 1, atkSx = 1, lean = 0;
  if (a.swing > 0 && !a.dead) {
    const p = 1 - Math.min(1, a.swing / 0.3), heavy = HEAVY.has(a.mobId) || HEAVY.has(MOBS[a.mobId]?.art), air = AIRY.has(a.mobId) || AIRY.has(MOBS[a.mobId]?.art);
    const wind = p < 0.22 ? p / 0.22 : 0, hit = p < 0.22 ? 0 : p < 0.5 ? (p - 0.22) / 0.28 : 0, rec = p < 0.5 ? 0 : (p - 0.5) / 0.5; // 0..1 em cada fase
    const out = Math.sin(hit * Math.PI / 2) * (1 - rec); // 0 -> 1 no golpe, volta a 0 na recuperação
    const sgn = fx >= 0 ? 1 : -1;
    if (heavy) { atkSy = 1 + 0.13 * wind - 0.2 * out; atkSx = 1 - 0.05 * wind + 0.12 * out; lunge = H * 0.07 * out; lean = sgn * (-0.05 * wind + 0.1 * out); } // ergue e bate no chão
    else if (air) { atkSy = 1 - 0.08 * wind + 0.1 * out; atkSx = 1 + 0.06 * wind - 0.06 * out; lunge = H * (-0.05 * wind + 0.2 * out); lean = sgn * 0.08 * out; } // recolhe e arremete
    else { atkSy = 1 - 0.14 * wind + 0.08 * out; atkSx = 1 + 0.08 * wind - 0.06 * out; lunge = H * (-0.07 * wind + 0.2 * out); lean = sgn * (-0.07 * wind + 0.14 * out); } // agacha, recua e bote
    if (rec > 0) { atkSy = 1 + (atkSy - 1) * (1 - rec); atkSx = 1 + (atkSx - 1) * (1 - rec); }
  }
  const footY = a.y + a.r * 0.8; // onde o desenho antigo apoiava a sombra
  g.save();
  g.translate(a.x + fx * lunge, footY + fy * lunge - bob);
  if (a.dead) { const P = deathPose(a.deadT ?? 0, view >= 1 && view <= 3 ? -1 : 1); g.rotate(P.rot); g.scale(1, P.squash); g.globalAlpha *= P.alpha; }
  g.rotate(sway + lean); g.scale(atkSx / squash, atkSy * squash);
  // quadro do ciclo: andando, segue a fase do passo; parado, um ciclo lento (a criatura nunca fica congelada)
  // o passo da simulação é lento nos pesados (velocidade/28 rad/s): o ciclo é acelerado para o balanço ficar visível; parado, ciclo lento próprio de cada tipo
  const kind = HEAVY.has(a.mobId) || HEAVY.has(MOBS[a.mobId]?.art) ? 0 : AIRY.has(a.mobId) || AIRY.has(MOBS[a.mobId]?.art) ? 2 : 1, rate = [1.7, 1.3, 1.1][kind], idle = [0.45, 0.7, 0.9][kind];
  const fr = nf ? Math.floor((((moving ? (ph * rate) / (2 * Math.PI) : t * idle + a.id * 0.37) % 1) + 1) % 1 * nf) : 0;
  const sx = nf ? fr * cw : (view % 4) * cw, sy = nf ? view * ch : Math.floor(view / 4) * ch;
  g.drawImage(img, sx, sy, cw, ch, -meta.ax * k, -meta.ay * k, W, H);
  if (a.hitFlash > 0 && !a.dead) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(0.55, a.hitFlash * 5); g.drawImage(img, sx, sy, cw, ch, -meta.ax * k, -meta.ay * k, W, H); }
  g.restore(); stats.drawn++;
  return true;
}
