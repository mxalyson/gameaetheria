// Montarias (lobo, cavalo, grifo). Arte principal: modelos 3D do Meshy assados em 8 DIREÇÕES x quadros de ciclo por tools/mount-bake.mjs
// (public/assets/mounts/<id>-3d.webp + -3d-lo.webp + -3d.json; linha = direção, coluna = quadro). Enquanto a 3D não chegou (ou não existe) cai na arte 2D antiga
// (<id>.webp, 2 lados, recortada por tools/mount-sheet.py), que continua no repositório como reserva.
// Só apresentação: lê a.mounted / a.mountId / a.moving / a.facing do ator e nunca altera a simulação. Carregamento sob demanda (como vfx-kit/mob-sprites).
// Ordem de desenho do ator montado: drawMountBack (sombra + montaria) -> herói levantado por mountLift -> drawMountFront (refaz só a parte da montaria abaixo da sela, por cima das pernas do herói: ele fica "sentado dentro" da sela).
// A montaria é desenhada com a SELA da vista atual sobre a.x (o herói senta onde o json marca a sela em cada direção).
import { asset } from '../assets-version.js';

export const MOUNT_IDS = ['wolf', 'horse', 'gryphon'];
// w = largura da célula 3D no mundo (px lógicos; o herói tem ~80 de altura); hip = perna do herói que desce abaixo do quadril (entra na montaria);
// hover = altura de voo (grifo); w2d/hip2d = valores da arte 2D antiga (reserva)
const DEF = {
  wolf: { w: 142, hip: 18, hover: 0, w2d: 124, hip2d: 20 },
  horse: { w: 126, hip: 12, hover: 0, w2d: 118, hip2d: 12 },
  gryphon: { w: 168, hip: 14, hover: 9, w2d: 138, hip2d: 14 },
};
export const stats = { drawn: 0, loaded: 0, texBytes: 0, evicted: 0 };
const TAU = Math.PI * 2;

const cache = new Map();          // id -> { id, tag, d3, d2, used }  (no máx. 2: a do jogador local e a dos vizinhos)
const states = new WeakMap();     // ator -> estado de animação
const FRAME_ORDER = [2, 0, 1];    // arte 2D do grifo: posição p do bater de asas: 0 fechada, 1 aberta, 2 erguida (índices dos quadros do json: 0 aberta, 1 erguida, 2 fechada)

const isMounted = (a) => !!(a && a.mounted && DEF[a.mountId]);
// mesma regra de hero-sprites/mob-sprites: S = 0, SE = 1, L = 2, NE = 3, N = 4, NO = 5, O = 6, SO = 7 (cópia local: este módulo não importa o do herói)
const viewOf = (face) => (((Math.round(Math.atan2(Math.cos(face), Math.sin(face)) / (Math.PI / 4)) % 8) + 8) % 8);

// Carrega json + imagem de uma camada de arte (3D ou 2D). `layer` guarda o estado; sem arte ela vira 'error' e a outra (ou nada) é usada.
function loadLayer(layer, jsonUrl, imgUrl) {
  if (typeof Image === 'undefined' || typeof fetch === 'undefined') { layer.state = 'error'; return; } // Node/sem DOM: nada a carregar
  Promise.all([
    fetch(jsonUrl).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }),
    // a imagem fica decodificada uma vez (é o cache); sem pré-multiplicar nada além do que o navegador faz
    new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = imgUrl; }),
  ]).then(([meta, img]) => {
    layer.meta = meta; layer.img = img; layer.state = 'ready'; stats.loaded++; stats.texBytes += img.naturalWidth * img.naturalHeight * 4;
  }).catch(() => { layer.state = 'error'; }); // sem arte a montaria só não aparece (o herói segue de pé)
}
function start(id, tag) {
  const e = { id, tag, d3: { state: 'loading', img: null, meta: null }, d2: { state: 'loading', img: null, meta: null }, used: 0 };
  cache.set(id, e);
  const lo = tag === 'lo' ? '-lo' : '';
  loadLayer(e.d3, asset(`assets/mounts/${id}-3d.json`), asset(`assets/mounts/${id}-3d${lo}.webp`)); // com ?v= (o service worker serve arte do cache)
  loadLayer(e.d2, asset(`assets/mounts/${id}.json`), asset(`assets/mounts/${id}${lo}.webp`));
  return e;
}
function release(e) {
  for (const l of [e.d3, e.d2]) { if (l.state === 'ready') stats.texBytes -= l.img.naturalWidth * l.img.naturalHeight * 4; l.img = null; }
}
const busy = (e) => e.d3.state === 'loading' || e.d2.state === 'loading';

// Entrada do cache para (id, qualidade); null se já há 2 montarias em uso agora (a 3ª não é desenhada).
function entry(id, q, t) {
  const tag = q === 0 ? 'lo' : 'hi';
  let e = cache.get(id);
  if (e && e.tag !== tag && !busy(e)) { release(e); cache.delete(id); e = undefined; } // qualidade mudou: recarrega a outra resolução
  if (!e) {
    if (cache.size >= 2) { // abre vaga: tira a que está parada há mais tempo (e não foi usada no último segundo)
      let old = null;
      for (const o of cache.values()) if (t - o.used > 1 && !busy(o) && (!old || o.used < old.used)) old = o;
      if (!old) return null;
      release(old); cache.delete(old.id); stats.evicted++;
    }
    e = start(id, tag);
  }
  e.used = t;
  return e;
}
// Qual arte desenhar agora: '3d' se pronta; senão a 2D antiga se pronta; senão nada (carregando ou sem arte).
const artOf = (e) => (e.d3.state === 'ready' ? '3d' : e.d2.state === 'ready' ? '2d' : null);

// Pré-carrega a montaria (opcional, ex.: ao montar) sem desenhar.
export function preloadMount(id, q = 2, t = 0) { if (DEF[id]) entry(id, q, t); }
export function mountReady(id) { const e = cache.get(id); return !!e && artOf(e) !== null; }
export function mountArt(id) { const e = cache.get(id); return e ? artOf(e) : null; } // '3d' | '2d' | null (diagnóstico/testes)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function stateOf(a, t) {
  let s = states.get(a);
  if (!s) {
    s = { lastT: t, px: a.x, py: a.y, v: 0, ma: 0, gait: 0, flap: 0, side: 1, vy: 0, face: a.facing ?? 0, seed: ((a.x * 12.9898 + a.y * 78.233) % 6.28 + 6.28) % 6.28,
      lift: 0, base: 0, bounce: 0, float: 0, pitch: 0, sx: 1, sy: 1, p: 0, view: 0, fr: 0, art: null, ready: false };
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

// Movimento comum às duas artes: velocidade real, direção, suavização do começo/fim da passada. Uma vez por ator/quadro (em drawMountBack).
function motion(a, t, s) {
  const dt = clamp(t - s.lastT, 0, 0.1); s.lastT = t;
  const mdx = a.x - s.px, mdy = a.y - s.py; s.px = a.x; s.py = a.y;
  if (dt > 0) { const inst = Math.min(900, Math.hypot(mdx, mdy) / dt); s.v += (inst - s.v) * Math.min(1, dt * 10); }
  const mov = !!a.moving && !a.dead;
  if (mov && Math.hypot(mdx, mdy) > 0.3) s.face = Math.atan2(mdy, mdx); else if (!mov && a.facing != null) s.face = a.facing; // mesma regra do herói: andando, vira para onde anda
  s.ma += ((mov ? 1 : 0) - s.ma) * Math.min(1, dt * 7); // 0 parado .. 1 correndo (suaviza o começo/fim da passada)
  return dt;
}

// ---- arte 3D (8 direções) ----
// Quadro, balanço e levantamento do herói. A sela da vista/quadro atual (fração da célula) diz onde ele senta.
function update3d(a, t, e) {
  const d = DEF[a.mountId], m = e.d3.meta, s = stateOf(a, t), dt = motion(a, t, s), ma = s.ma, vk = clamp(s.v / 300, 0, 1.6); // 300 px/s ~ galope de referência
  const cw = e.d3.img.naturalWidth / m.cols, ch = e.d3.img.naturalHeight / 8;
  const H = d.w * ch / cw;
  const view = viewOf(s.face), n = m.frames;
  s.view = view; s.art = '3d';
  s.side = 1; s.pitch = 0;
  let fr;
  if (a.mountId === 'gryphon') {
    // voo: bate asas sempre (mais rápido ao se mover); o corpo flutua com uma leve oscilação própria
    s.flap += dt * (0.9 + ma * (1.1 + vk * 0.9)) * TAU;
    fr = Math.floor((((s.flap + s.seed) / TAU) % 1 + 1) % 1 * n) % n;
    s.float = d.hover + 1.5 * Math.sin(t * 1.6 + s.seed) + ma * 1.4 * Math.cos(s.flap + s.seed);
    s.bounce = s.float;
    s.sy = 1 + 0.008 * Math.sin(t * 1.9 + s.seed); s.sx = 1;
  } else {
    // passada ligada à velocidade REAL (ciclos/s) com leve variação; parado: quadro sem deformação (se houver) com respiração
    s.gait += dt * (1.15 + vk * 1.6) * (1 + 0.07 * Math.sin(t * 1.3 + s.seed)) * TAU * ma;
    const ph = s.gait + s.seed, stride = Math.abs(Math.sin(ph)) ** 0.75 + 0.22 * Math.sin(2 * ph + 0.6), breath = Math.sin(t * 2.1 + s.seed);
    fr = ma > 0.3 || !m.idle ? Math.floor((((s.gait / TAU) % 1) + 1) % 1 * n) % n : n; // n = índice do quadro parado
    s.bounce = ma * (0.8 + 1.5 * vk) * stride; // o ciclo assado já traz o balanço; aqui só um resto para não ficar rígido
    s.sy = 1 + (1 - ma) * 0.014 * breath; s.sx = 1 - (1 - ma) * 0.005 * breath;
    s.float = 0;
  }
  s.fr = fr;
  const sdl = (m.saddleF[view][fr] ?? m.saddle[view]), sd0 = m.saddle[view];
  s.sdx = sdl[0]; s.sdy = sdl[1];
  s.base = (m.feet[1] - sd0[1]) * H - d.hip;                        // altura estável (nome/barra)
  s.lift = (m.feet[1] - sdl[1]) * H * s.sy - d.hip + s.bounce;       // altura deste quadro (herói acompanha o balanço)
  s.ready = true;
  return s;
}

// ---- arte 2D antiga (reserva, 2 lados) ----
function update2d(a, t, e) {
  const d = DEF[a.mountId], m = e.d2.meta, s = stateOf(a, t), dt = motion(a, t, s);
  s.art = '2d';
  const cx = Math.cos(s.face);
  if (Math.abs(cx) > 0.3) s.side = cx > 0 ? 1 : -1;
  const mov = !!a.moving && !a.dead;
  s.vy += (Math.sin(s.face) * (mov ? 1 : 0) - s.vy) * Math.min(1, dt * 8);
  const ma = s.ma, vk = clamp(s.v / 300, 0, 1.6);
  const H = d.w2d / m.aspect, seatUp = (m.feet[1] - m.seat[1]) * H;
  s.base = seatUp - d.hip2d;
  s.p = 0;
  if (a.mountId === 'gryphon') {
    s.flap += dt * (0.85 + ma * (1.5 + vk * 1.2)) * TAU;
    const w = Math.pow(0.5 + 0.5 * Math.sin(s.flap + s.seed), 1.35);
    s.p = w * (1.15 + 0.85 * ma);
    s.float = d.hover + 1.6 * Math.sin(t * 1.6 + s.seed) + ma * 1.8 * Math.cos(s.flap + s.seed);
    s.bounce = s.float;
    s.pitch = (-0.025 * ma - 0.015 * Math.cos(s.flap + s.seed)) * s.side;
    s.sx = 1 + 0.01 * Math.sin(s.flap * 0.5); s.sy = 1 + 0.012 * Math.sin(t * 1.9 + s.seed);
  } else {
    s.gait += dt * (1.7 + vk * 2.6) * TAU * ma;
    const ph = s.gait + s.seed, stride = Math.abs(Math.sin(ph)) ** 0.75 + 0.22 * Math.sin(2 * ph + 0.6), breath = Math.sin(t * 2.1 + s.seed);
    s.bounce = ma * (2.2 + 3.4 * vk) * stride;
    s.pitch = (ma * 0.055 * Math.sin(ph - 0.9) + (1 - ma) * 0.004 * breath) * s.side;
    s.sy = 1 + ma * 0.035 * Math.cos(2 * ph) + (1 - ma) * 0.016 * breath;
    s.sx = 1 - ma * 0.018 * Math.cos(2 * ph) - (1 - ma) * 0.006 * breath;
    s.float = 0;
  }
  const vyA = Math.abs(s.vy);
  s.sx *= 1 - 0.1 * vyA; s.pitch += 0.03 * s.vy * s.side;
  s.lift = s.base + s.bounce * (a.mountId === 'gryphon' ? 1 : 0.9);
  s.ready = true;
  return s;
}

// Recorte 3D: quadro fr, vista view, na posição (dx,dy) com tamanho W x H (no sistema local já transladado ao pé).
function blit3d(g, img, m, s, W, H, dx, dy) {
  const cw = img.naturalWidth / m.cols, ch = img.naturalHeight / 8;
  g.drawImage(img, s.fr * cw, s.view * ch, cw, ch, dx, dy, W, H);
}
function blit2d(g, e, m, s, W, H, dx, dy) {
  const img = e.d2.img, cw = img.naturalWidth / m.frames, ch = img.naturalHeight;
  if (m.frames === 3) { // bater de asas: quadro p e o vizinho em fusão (fecha -> abre -> ergue)
    const i0 = clamp(Math.floor(s.p), 0, 1), f = s.p - i0, sm = clamp((f - 0.4) / 0.25, 0, 1); // troca de quadro quase seca (fusão curta): fusão longa deixava asa "fantasma"
    g.drawImage(img, FRAME_ORDER[i0] * cw, 0, cw, ch, dx, dy, W, H);
    if (sm > 0.02) { g.globalAlpha = sm; g.drawImage(img, FRAME_ORDER[i0 + 1] * cw, 0, cw, ch, dx, dy, W, H); g.globalAlpha = 1; }
  } else g.drawImage(img, 0, 0, cw, ch, dx, dy, W, H);
}

// Sombra + montaria atrás do herói. `feetY` = chão do ator (a.y + 12). Nada é alocado aqui dentro.
export function drawMountBack(g, a, t, q, feetY) {
  if (!isMounted(a)) return;
  const e = entry(a.mountId, q, t), art = e ? artOf(e) : null;
  if (!art) { const s0 = states.get(a); if (s0) s0.ready = false; return; } // sem montaria desenhada o herói não levita
  const d = DEF[a.mountId];
  if (art === '3d') {
    const m = e.d3.meta, s = update3d(a, t, e), W = d.w, H = W * (e.d3.img.naturalHeight / 8) / (e.d3.img.naturalWidth / m.cols);
    const high = a.mountId === 'gryphon' ? s.float : 0, k = 1 - clamp(high / 40, 0, 0.4); // sombra do grifo: menor e mais fraca quanto mais alto ele voa
    const sdx = s.sdx, feetDx = (m.feet[0] - sdx) * W, wide = 0.72 + 0.28 * Math.abs(Math.sin(s.view * Math.PI / 4)); // mais larga de lado, mais estreita de frente/trás
    g.fillStyle = `rgba(24,28,34,${(0.3 * k).toFixed(3)})`;
    g.beginPath(); g.ellipse(a.x + feetDx, feetY + 1, m.shadow[2] * W * k * wide * 1.1, Math.max(5, m.shadow[3] * H * 1.1) * k, 0, 0, TAU); g.fill();
    g.save();
    g.translate(a.x, feetY - s.bounce);
    g.scale(s.sx, s.sy);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
    blit3d(g, e.d3.img, m, s, W, H, -sdx * W, -m.feet[1] * H);
    g.restore();
  } else {
    const m = e.d2.meta, s = update2d(a, t, e), W = d.w2d, H = W / m.aspect;
    const high = a.mountId === 'gryphon' ? s.float : 0, k = 1 - clamp(high / 40, 0, 0.4);
    g.fillStyle = `rgba(24,28,34,${(0.3 * k).toFixed(3)})`;
    g.beginPath(); g.ellipse(a.x + (m.shadow[0] - m.seat[0]) * W * s.side, feetY + 1, m.shadow[2] * W * k * 1.08, Math.max(5, m.shadow[3] * H * 1.9) * k, 0, 0, TAU); g.fill();
    g.save();
    g.translate(a.x, feetY - (a.mountId === 'gryphon' ? s.float : s.bounce));
    g.rotate(s.pitch);
    g.scale(s.side * s.sx, s.sy);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
    blit2d(g, e, m, s, W, H, -m.seat[0] * W, -m.feet[1] * H);
    g.restore();
  }
  stats.drawn++;
}

// Depois do herói: refaz só a parte da montaria abaixo da linha da sela, cobrindo as pernas dele (assim ele "senta" na sela, não paira à frente).
export function drawMountFront(g, a, t, q, feetY) {
  if (!isMounted(a)) return;
  const e = cache.get(a.mountId), s = states.get(a);
  if (!e || !s?.ready) return;
  const art = artOf(e), d = DEF[a.mountId];
  if (art !== s.art) return; // a arte trocou (3D acabou de chegar) neste quadro: só no próximo desenho
  g.save();
  if (art === '3d') {
    const m = e.d3.meta, W = d.w, H = W * (e.d3.img.naturalHeight / 8) / (e.d3.img.naturalWidth / m.cols);
    g.translate(a.x, feetY - s.bounce);
    g.scale(s.sx, s.sy);
    const seatY = (s.sdy - m.feet[1]) * H; // linha da sela (local, acima do pé = negativo)
    g.beginPath(); g.rect(-W, seatY, 2 * W, H); g.clip();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
    blit3d(g, e.d3.img, m, s, W, H, -s.sdx * W, -m.feet[1] * H);
  } else {
    const m = e.d2.meta, W = d.w2d, H = W / m.aspect;
    g.translate(a.x, feetY - (a.mountId === 'gryphon' ? s.float : s.bounce));
    g.rotate(s.pitch);
    g.scale(s.side * s.sx, s.sy);
    g.beginPath(); g.rect(-W, (m.seat[1] - m.feet[1]) * H, 2 * W, H); g.clip();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
    blit2d(g, e, m, s, W, H, -m.seat[0] * W, -m.feet[1] * H);
  }
  g.restore();
}

export const _test = { DEF, cache, FRAME_ORDER, viewOf };
