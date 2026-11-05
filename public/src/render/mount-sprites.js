// Montarias (lobo, cavalo, grifo): arte pintada do dono recortada por tools/mount-sheet.py (public/assets/mounts/<id>.webp + .json; 2 resoluções).
// Só apresentação: lê a.mounted / a.mountId / a.moving do ator e nunca altera a simulação. Carregamento sob demanda (como vfx-kit/mob-sprites).
// v1: só 2 lados visuais (direita; esquerda = espelho). Para cima/baixo a mesma imagem ganha leve achatamento e inclinação (limite registrado em docs/art-direction/montarias-pipeline.md).
// Ordem de desenho do ator montado: drawMountBack (sombra + montaria) -> herói levantado por mountLift -> drawMountFront (refaz só a parte da montaria abaixo da sela, por cima das pernas do herói: ele fica "sentado dentro" da sela).
import { asset } from '../assets-version.js';

export const MOUNT_IDS = ['wolf', 'horse', 'gryphon'];
// largura do quadro no mundo (px lógicos; o herói tem ~80 de altura), perna do herói que desce abaixo do quadril (`hip`), fallback de altura da sela antes do json chegar
const DEF = {
  wolf: { w: 124, hip: 20, clip: 0 },
  horse: { w: 118, hip: 12, clip: 0 },
  gryphon: { w: 138, hip: 14, clip: 0, hover: 7 },
};
export const stats = { drawn: 0, loaded: 0, texBytes: 0, evicted: 0 };
const TAU = Math.PI * 2;

const cache = new Map();          // id -> { id, tag, state, img, meta, used }  (no máx. 2: a do jogador local e a dos vizinhos)
const states = new WeakMap();     // ator -> estado de animação
const FRAME_ORDER = [2, 0, 1];    // posição p do bater de asas: 0 fechada, 1 aberta, 2 erguida (índices dos quadros do json: 0 aberta, 1 erguida, 2 fechada)

const isMounted = (a) => !!(a && a.mounted && DEF[a.mountId]);

function start(id, tag) {
  const e = { id, tag, state: 'loading', img: null, meta: null, used: 0 };
  cache.set(id, e);
  if (typeof Image === 'undefined' || typeof fetch === 'undefined') { e.state = 'error'; return e; } // Node/sem DOM: nada a carregar
  const url = asset(`assets/mounts/${id}${tag === 'lo' ? '-lo' : ''}.webp`); // com ?v= (o service worker serve arte do cache)
  Promise.all([
    fetch(asset(`assets/mounts/${id}.json`)).then((r) => r.json()),
    // a imagem fica decodificada uma vez (é o cache); sem pré-multiplicar nada além do que o navegador faz
    new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }),
  ]).then(([meta, img]) => {
    e.meta = meta; e.img = img; e.state = 'ready'; stats.loaded++; stats.texBytes += img.naturalWidth * img.naturalHeight * 4;
  }).catch(() => { e.state = 'error'; }); // sem arte a montaria só não aparece (o herói segue de pé)
  return e;
}
function release(e) { if (e.state === 'ready') stats.texBytes -= e.img.naturalWidth * e.img.naturalHeight * 4; e.img = null; }

// Entrada do cache para (id, qualidade); null se já há 2 montarias em uso agora (a 3ª não é desenhada na v1).
function entry(id, q, t) {
  const tag = q === 0 ? 'lo' : 'hi';
  let e = cache.get(id);
  if (e && e.tag !== tag && e.state !== 'loading') { release(e); cache.delete(id); e = undefined; } // qualidade mudou: recarrega a outra resolução
  if (!e) {
    if (cache.size >= 2) { // abre vaga: tira a que está parada há mais tempo (e não foi usada no último segundo)
      let old = null;
      for (const o of cache.values()) if (t - o.used > 1 && o.state !== 'loading' && (!old || o.used < old.used)) old = o;
      if (!old) return null;
      release(old); cache.delete(old.id); stats.evicted++;
    }
    e = start(id, tag);
  }
  e.used = t;
  return e;
}

// Pré-carrega a montaria (opcional, ex.: ao montar) sem desenhar.
export function preloadMount(id, q = 2, t = 0) { if (DEF[id]) entry(id, q, t); }
export function mountReady(id) { return cache.get(id)?.state === 'ready'; }

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function stateOf(a, t) {
  let s = states.get(a);
  if (!s) {
    s = { lastT: t, px: a.x, py: a.y, v: 0, ma: 0, gait: 0, flap: 0, side: 1, vy: 0, face: a.facing ?? 0, seed: ((a.x * 12.9898 + a.y * 78.233) % 6.28 + 6.28) % 6.28,
      lift: 0, base: 0, bounce: 0, float: 0, pitch: 0, sx: 1, sy: 1, p: 0, ready: false };
    states.set(a, s);
  }
  return s;
}

// Altura (px do mundo) que o herói sobe para sentar na sela, SEM o balanço do passo (usada para subir nome e barra de vida sem tremer).
export function mountBaseLift(a) {
  if (!isMounted(a)) return 0;
  const s = states.get(a);
  return s?.ready ? s.base : 0; // montaria ainda carregando: o herói fica no chão (não levita sem ela)
}
// Deslocamento (px, para cima) do herói neste quadro: sela + balanço do passo/voo sincronizado com a montaria. Chame depois de drawMountBack.
export function mountLift(a) {
  if (!isMounted(a)) return 0;
  const s = states.get(a);
  return s?.ready ? s.lift : 0;
}

// Atualiza o estado do quadro (uma vez por ator/quadro, em drawMountBack): velocidade real, passada, bater de asas, balanço.
function update(a, t, e) {
  const d = DEF[a.mountId], m = e.meta, s = stateOf(a, t);
  const dt = clamp(t - s.lastT, 0, 0.1); s.lastT = t;
  const mdx = a.x - s.px, mdy = a.y - s.py; s.px = a.x; s.py = a.y;
  if (dt > 0) { const inst = Math.min(900, Math.hypot(mdx, mdy) / dt); s.v += (inst - s.v) * Math.min(1, dt * 10); }
  const mov = !!a.moving && !a.dead;
  if (mov && Math.hypot(mdx, mdy) > 0.3) s.face = Math.atan2(mdy, mdx); else if (!mov && a.facing != null) s.face = a.facing;
  const cx = Math.cos(s.face);
  if (Math.abs(cx) > 0.3) s.side = cx > 0 ? 1 : -1;
  s.vy += (Math.sin(s.face) * (mov ? 1 : 0) - s.vy) * Math.min(1, dt * 8);
  s.ma += ((mov ? 1 : 0) - s.ma) * Math.min(1, dt * 7); // 0 parado .. 1 correndo (suaviza o começo/fim da passada)
  const ma = s.ma, vk = clamp(s.v / 300, 0, 1.6); // 300 px/s ~ galope de referência
  const H = d.w / m.aspect, seatUp = (m.feet[1] - m.seat[1]) * H;
  s.base = seatUp - d.hip;
  s.p = 0;
  if (a.mountId === 'gryphon') {
    // voo: bater de asas mais rápido ao se mover, sempre assimétrico (sobe rápido, desce devagar); o corpo acompanha com um leve quicar
    s.flap += dt * (0.85 + ma * (1.5 + vk * 1.2)) * TAU;
    const w = Math.pow(0.5 + 0.5 * Math.sin(s.flap + s.seed), 1.35);
    s.p = w * (1.15 + 0.85 * ma);
    s.float = d.hover + 1.6 * Math.sin(t * 1.6 + s.seed) + ma * 1.8 * Math.cos(s.flap + s.seed);
    s.bounce = s.float;
    s.pitch = (-0.025 * ma - 0.015 * Math.cos(s.flap + s.seed)) * s.side;
    s.sx = 1 + 0.01 * Math.sin(s.flap * 0.5); s.sy = 1 + 0.012 * Math.sin(t * 1.9 + s.seed);
  } else {
    s.gait += dt * (1.7 + vk * 2.6) * TAU * ma;
    // passo em duas batidas: salto principal + contrabatida menor (galope), nunca senoide pura
    const ph = s.gait + s.seed, stride = Math.abs(Math.sin(ph)) ** 0.75 + 0.22 * Math.sin(2 * ph + 0.6);
    const breath = Math.sin(t * 2.1 + s.seed);
    s.bounce = ma * (2.2 + 3.4 * vk) * stride;
    s.pitch = (ma * 0.055 * Math.sin(ph - 0.9) + (1 - ma) * 0.004 * breath) * s.side;
    s.sy = 1 + ma * 0.035 * Math.cos(2 * ph) + (1 - ma) * 0.016 * breath;
    s.sx = 1 - ma * 0.018 * Math.cos(2 * ph) - (1 - ma) * 0.006 * breath;
    s.float = 0;
  }
  // para cima/baixo no isométrico (v1: só 2 lados): leve achatamento horizontal e queda de inclinação
  const vyA = Math.abs(s.vy);
  s.sx *= 1 - 0.1 * vyA; s.pitch += 0.03 * s.vy * s.side;
  s.lift = s.base + s.bounce * (a.mountId === 'gryphon' ? 1 : 0.9);
  s.ready = true;
  return s;
}

// Sombra + montaria atrás do herói. `feetY` = chão do ator (a.y + 12). Nada é alocado aqui dentro.
export function drawMountBack(g, a, t, q, feetY) {
  if (!isMounted(a)) return;
  const e = entry(a.mountId, q, t);
  if (!e || e.state !== 'ready') { const s0 = states.get(a); if (s0) s0.ready = false; return; } // sem montaria desenhada o herói não levita
  const d = DEF[a.mountId], m = e.meta, s = update(a, t, e);
  const W = d.w, H = W / m.aspect, cw = e.img.naturalWidth / m.frames, ch = e.img.naturalHeight;
  const high = a.mountId === 'gryphon' ? s.float : 0;
  // sombra no chão (do grifo: menor e mais fraca quanto mais alto ele voa)
  const k = 1 - clamp(high / 40, 0, 0.4);
  g.fillStyle = `rgba(24,28,34,${(0.3 * k).toFixed(3)})`;
  g.beginPath(); g.ellipse(a.x + (m.shadow[0] - m.seat[0]) * W * s.side, feetY + 1, m.shadow[2] * W * k * 1.08, Math.max(5, m.shadow[3] * H * 1.9) * k, 0, 0, TAU); g.fill();
  g.save();
  g.translate(a.x, feetY - (a.mountId === 'gryphon' ? s.float : s.bounce));
  g.rotate(s.pitch);
  g.scale(s.side * s.sx, s.sy);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
  const dx = -m.seat[0] * W, dy = -m.feet[1] * H;
  if (m.frames === 3) { // bater de asas: quadro p e o vizinho em fusão (fecha -> abre -> ergue)
    const i0 = clamp(Math.floor(s.p), 0, 1), f = s.p - i0, sm = clamp((f - 0.4) / 0.25, 0, 1); // troca de quadro quase seca (fusão curta): fusão longa deixava asa "fantasma"
    g.drawImage(e.img, FRAME_ORDER[i0] * cw, 0, cw, ch, dx, dy, W, H);
    if (sm > 0.02) { g.globalAlpha = sm; g.drawImage(e.img, FRAME_ORDER[i0 + 1] * cw, 0, cw, ch, dx, dy, W, H); g.globalAlpha = 1; }
  } else g.drawImage(e.img, 0, 0, cw, ch, dx, dy, W, H);
  g.restore();
  stats.drawn++;
}

// Depois do herói: refaz só a parte da montaria abaixo da linha da sela, cobrindo as pernas dele (assim ele "senta" na sela, não paira à frente).
export function drawMountFront(g, a, t, q, feetY) {
  if (!isMounted(a)) return;
  const e = cache.get(a.mountId), s = states.get(a);
  if (!e || e.state !== 'ready' || !s?.ready) return;
  const d = DEF[a.mountId], m = e.meta, W = d.w, H = W / m.aspect, cw = e.img.naturalWidth / m.frames, ch = e.img.naturalHeight;
  g.save();
  g.translate(a.x, feetY - (a.mountId === 'gryphon' ? s.float : s.bounce));
  g.rotate(s.pitch);
  g.scale(s.side * s.sx, s.sy);
  const dx = -m.seat[0] * W, dy = -m.feet[1] * H, seatY = (m.seat[1] - m.feet[1]) * H + d.clip;
  g.beginPath(); g.rect(-W, seatY, 2 * W, H); g.clip();
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
  if (m.frames === 3) {
    const i0 = clamp(Math.floor(s.p), 0, 1), f = s.p - i0, sm = clamp((f - 0.4) / 0.25, 0, 1); // troca de quadro quase seca (fusão curta): fusão longa deixava asa "fantasma"
    g.drawImage(e.img, FRAME_ORDER[i0] * cw, 0, cw, ch, dx, dy, W, H);
    if (sm > 0.02) { g.globalAlpha = sm; g.drawImage(e.img, FRAME_ORDER[i0 + 1] * cw, 0, cw, ch, dx, dy, W, H); g.globalAlpha = 1; }
  } else g.drawImage(e.img, 0, 0, cw, ch, dx, dy, W, H);
  g.restore();
}

export const _test = { DEF, cache, FRAME_ORDER };
