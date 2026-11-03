// Tudo é desenhado proceduralmente (sem imagens), num estilo pastel limpo.
// Trocar por sprites no futuro = trocar apenas as funções draw* deste arquivo.
import { safeBoxScreen } from './safe-box.js';
import { heroSpritesEnabled, drawHeroSprite } from './hero-sprites.js';
import { drawSkillVfx, drawSkillProjectile, trackActors } from './skill-vfx.js';
import { drawMobSprite, mobSpritesEnabled, prepareMobs } from './mob-sprites.js';
import { drawChestSprite } from './prop-sprites.js';
import { GroundCache, quantScale } from './ground-tiles.js';
import { loadGroundTextures, groundTexReady, fillGroundTexture } from './ground-textures.js';
import { drawSpiritSprite, preloadSpirits } from './spirit-sprites.js';
import { drawNpcSprite, preloadNpcs, npcTop } from './npc-sprites.js';
import { drawDayNight } from './sky.js';
import { loadNature, setNatureZone, drawNature, stampGround, groundReady, hasNatureSprite, drawNatureNamed } from './nature-sprites.js';
import { CLASSES } from '../data/classes.js';
import { MOBS } from '../data/mobs.js';
import { SPIRITS } from '../data/spirits.js';
import { RARITY } from '../data/items.js';
import { DROP_LIFE, DROP_BLINK } from '../game/sim.js'; // só as constantes (o drop some sozinho em DROP_LIFE s e pisca antes)
import { makeRng, hashString } from '../core/rng.js';
import { paintGroundScenery, drawGroundLife, drawAtmosphere, drawTreeRich, drawPineRich, drawSceneryDecor, sceneryShadow } from './scenery.js';

const TAU = Math.PI * 2;
const SKIN = '#f3d2b3';
const NPC_LOOK = { shop: 'archer', arena: 'warrior', spirit: 'mage', guard: 'warrior', herbalist: 'cleric', master_warrior: 'warrior', master_mage: 'mage', master_archer: 'archer', master_cleric: 'cleric', bank: 'mage', board: 'archer', harborshop: 'archer', duel: 'warrior', quest: 'warrior' }; // roles do Porto de Marfim (sem arte própria ainda)

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((c) => c.toString(16).padStart(2, '0')).join('');
}
const ellipse = (g, x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); };
const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); };

export class Renderer {
  constructor(canvas) {
    this.c = canvas;
    loadNature(); preloadSpirits(); preloadNpcs(); loadGroundTextures(); // atlas do cenário em sprites (assíncrono: até carregar, vale o desenho antigo)
    this.g = canvas.getContext('2d');
    this.groundCache = new GroundCache((w, ox, oy, tw, th, s) => buildGround(w, ox, oy, tw, th, s)); // terreno em blocos (mapas de 4600×2800 não cabem num canvas só no celular)
    this.dprCap = 2;
    this.quality = 2; // 0 baixa, 1 média, 2 alta
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(this.dprCap, devicePixelRatio || 1);
    this.vw = innerWidth;
    this.vh = innerHeight;
    // Celular: a tela é pequena, então o mundo é desenhado menor para caber ~980×520 unidades (antes, 1 unidade = 1 px:
    // num celular deitado via-se só ~650×320 do mundo e tudo parecia gigante). No PC (tela grande) o zoom fica 1.
    this.zoom = Math.max(0.55, Math.min(1, this.vw / 980, this.vh / 520));
    this.ww = this.vw / this.zoom; // tamanho da vista em unidades do MUNDO
    this.wh = this.vh / this.zoom;
    this.c.width = Math.round(this.vw * this.dpr);
    this.c.height = Math.round(this.vh * this.dpr);
    this.vignettes = {};
    this.groundCache.setScale(quantScale(Math.min(this.zoom * this.dpr, 2))); // terreno na resolução da tela (celular 3×: 2 px por unidade do mundo), não ampliado de 1 px
    // áreas cobertas pela interface (px de tela): cartão do herói/ouro, minimapa, fileira de menu e botões de toque. Etiquetas de monstros sob elas não são desenhadas (V21)
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1, vw = this.vw, vh = this.vh;
    // as áreas seguras do iPhone (entalhe/barra inicial) deslocam o HUD: somam-se aos recuos
    const { l: sal, r: sar, t: sat, b: sab } = safeInsets();
    this.hud = [[0, 0, 240 * u + sal, 130 * u + sat], [vw - 150 * u - sar, 0, vw, 140 * u + sat], [vw - 540 * u - sar, 0, vw, 60 * u + sat], [vw - 280 * u - sar, vh - 250 * u - sab, vw, vh]];
    this.labels = [];
  }

  // Qualidade gráfica: limita a resolução e corta efeitos de atmosfera mais caros (para celulares).
  setQuality(level) {
    this.quality = { low: 0, medium: 1, high: 2 }[level] ?? 2;
    this.dprCap = [1, 2, 3][this.quality]; // alta usa a densidade real da tela (iPhone = 3×); antes o teto de 2 deixava o celular borrado
    this.resize();
  }

  camera(world, focus) {
    const z = world.zone;
    const clamp = (v, size, view) => (size <= view ? (size - view) / 2 : Math.max(0, Math.min(size - view, v)));
    return { x: clamp(focus.x - this.ww / 2, z.w, this.ww), y: clamp(focus.y - this.wh / 2, z.h, this.wh) };
  }

  draw(world, cam, view = {}) {
    const g = this.g, z = world.zone, t = world.time;
    setNatureZone(world.zone.look ?? world.zoneId); if (this.mobZone !== world.zoneId) { this.mobZone = world.zoneId; prepareMobs(world.zone); };
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = z.palette.outside;
    g.fillRect(0, 0, this.vw, this.vh);
    g.save();
    g.scale(this.zoom, this.zoom);
    g.translate(-Math.round(cam.x), -Math.round(cam.y));
    const rdy = (groundReady() ? 1 : 0) + (groundTexReady() ? 2 : 0); // o atlas de chão carrega depois do 1º quadro: refaz os blocos uma vez quando ele chega
    this.groundCache.draw(g, world, cam.x - 8, cam.y - 8, cam.x + this.ww + 8, cam.y + this.wh + 8, rdy);

    const x0 = cam.x - 120, y0 = cam.y - 120, x1 = cam.x + this.ww + 120, y1 = cam.y + this.wh + 200;
    const vis = (x, y) => x > x0 && x < x1 && y > y0 && y < y1;
    if (z.scenery) drawGroundLife(g, world, t, vis);

    for (const p of z.portals ?? []) if (vis(p.x, p.y)) drawPortal(g, p, t, cam.x + 10, cam.x + this.ww - 10);
    if (world.objective) drawObjective(g, world.objective, t);
    for (const ar of world.areas) drawArea(g, ar, t);
    for (const tg of world.telegraphs) drawTelegraph(g, tg, t);

    const items = [];
    for (const d of world.layout.decor) if (d.type === 'house' || vis(d.x, d.y)) items.push({ y: d.y, k: 'decor', o: d });
    for (const n of z.npcs ?? []) if (vis(n.x, n.y)) items.push({ y: n.y, k: 'npc', o: n });
    for (const c of z.chests ?? []) if (vis(c.x, c.y)) items.push({ y: c.y, k: 'chest', o: c });
    for (const a of world.actors) if (!a.hidden && vis(a.x, a.y)) items.push({ y: a.y + (a.kind === 'spirit' ? 26 : 0), k: 'actor', o: a });
    for (const d of world.drops) if (vis(d.x, d.y)) items.push({ y: d.y - 4, k: 'drop', o: d });
    items.sort((a, b) => a.y - b.y);

    g.fillStyle = 'rgba(30,40,40,0.18)';
    for (const it of items) drawShadow(g, it);

    const player = view.player;
    for (const it of items) {
      const o = it.o;
      if (it.k === 'decor') drawDecor(g, o, t, z, player);
      else if (it.k === 'npc') { if (!drawNpcSprite(g, o, t)) drawHero(g, { ...o, facing: Math.PI / 2, walk: 0, id: o.x }, NPC_LOOK[o.id] ?? NPC_LOOK[o.role], t, o.color, o.accent); }
      else if (it.k === 'chest') drawChest(g, o, !view.chestsOpen?.has(o.id), t);
      else if (it.k === 'drop') drawDrop(g, o, t);
      else if (o.kind === 'mob') drawMob(g, o, t);
      else if (o.kind === 'spirit') drawSpirit(g, o, t);
      else drawActorHero(g, o, t);
    }

    g.globalCompositeOperation = 'lighter';
    for (const p of world.projectiles) { if (!drawSkillProjectile(g, p, t)) drawProjectile(g, p); }
    for (const p of world.particles) {
      const a = Math.max(0, p.life / p.max);
      g.globalAlpha = a;
      g.fillStyle = p.color;
      if (p.streak) g.fillRect(p.x - 1, p.y - 10, 2, 14);
      else { circle(g, p.x, p.y, p.size * (0.5 + a * 0.5)); g.fill(); }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    for (const f of world.fx) drawFx(g, f);
    drawSkillVfx(g, world, this.quality === 0); // efeitos próprios das 12 habilidades (só apresentação)
    trackActors(world);
    drawDayNight(g, world, cam, this.ww, this.wh, this.zoom, view.player, this.quality); // dia e noite (render/sky.js): ar da hora, luzes e halo do herói; barras e nomes ficam por cima

    // Barras e nomes por cima de tudo.
    this.labels.length = 0;
    const hud = this.hud, zm = this.zoom;
    PROMPTS.length = 0; SAFE.cx = cam.x; SAFE.cy = cam.y; SAFE.zm = zm; SAFE.vw = this.vw; SAFE.vh = this.vh; SAFE.hud = hud;
    const covered = (a) => { const sx = (a.x - cam.x) * zm, sy = (a.y - cam.y) * zm - 40 * zm; for (const [x0, y0, x1, y1] of hud) if (sx > x0 && sx < x1 && sy > y0 && sy < y1) return true; return false; };
    for (const a of world.actors) if (!a.dead && !a.hidden && vis(a.x, a.y) && (a === player || a.kind !== 'mob' || a.boss || !covered(a))) drawBars(g, a, a === player, this.labels);
    for (const n of z.npcs ?? []) if (vis(n.x, n.y)) drawNpcTag(g, n, view.nearNpc === n.id, t, view.questMarks?.[n.id], view.guideNpc === n.id);
    for (const c of z.chests ?? []) if (vis(c.x, c.y) && view.nearChest === c.id) drawPrompt(g, c.x, c.y + 26, view.chestsOpen?.has(c.id) ? 'Vazio por enquanto' : 'Toque para abrir');
    for (const tx of world.texts) {
      const a = 1 - Math.max(0, (tx.t - tx.life * 0.6) / (tx.life * 0.4));
      g.globalAlpha = a;
      g.font = `800 ${tx.size}px Nunito, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = 3.5;
      g.strokeStyle = 'rgba(20,20,35,0.75)';
      const s = tx.t < 0.12 ? 1 + (0.12 - tx.t) * 4 : 1;
      g.save(); g.translate(tx.x, tx.y); g.scale(s, s);
      g.strokeText(tx.text, 0, 0);
      g.fillStyle = tx.color;
      g.fillText(tx.text, 0, 0);
      g.restore();
    }
    g.globalAlpha = 1;
    g.restore();

    g.save(); g.scale(this.zoom, this.zoom); drawAtmosphere(g, z, cam, this.ww, this.wh, t, this.quality); g.restore();
    let vignette = this.vignettes[world.zoneId];
    if (!vignette) {
      const v = document.createElement('canvas');
      v.width = this.vw; v.height = this.vh;
      const vg = v.getContext('2d');
      const grd = vg.createRadialGradient(this.vw / 2, this.vh / 2, Math.min(this.vw, this.vh) * 0.35, this.vw / 2, this.vh / 2, Math.max(this.vw, this.vh) * 0.75);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, z.atmosphere?.edge ?? 'rgba(10,15,30,0.38)');
      vg.fillStyle = grd;
      vg.fillRect(0, 0, this.vw, this.vh);
      vignette = this.vignettes[world.zoneId] = v;
    }
    g.drawImage(vignette, 0, 0, this.vw, this.vh);
    if (view.lowHp) {
      g.fillStyle = `rgba(200,30,40,${0.12 + Math.sin(t * 5) * 0.06})`;
      g.fillRect(0, 0, this.vw, this.vh);
    }
  }

  drawMinimap(canvas, world, player) {
    const g = canvas.getContext('2d'), z = world.zone;
    const W = canvas.width, H = canvas.height;
    const round = W === H && !!player; // canvas quadrado = minimapa redondo (anel pintado): radar centrado no jogador, ~700 unidades de raio
    const R = Math.min(700, Math.max(z.w, z.h) / 2);
    const s = round ? W / 2 / R : Math.min(W / z.w, H / z.h), ox = round ? W / 2 - player.x * s : (W - z.w * s) / 2, oy = round ? H / 2 - player.y * s : (H - z.h * s) / 2;
    g.clearRect(0, 0, W, H);
    if (round) { g.save(); g.beginPath(); g.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); g.clip(); g.fillStyle = 'rgba(24,34,48,0.9)'; g.fillRect(0, 0, W, H); }
    g.fillStyle = z.palette.ground;
    if (z.circle) { circle(g, ox + z.w * s / 2, oy + z.h * s / 2, z.radius * s); g.fill(); }
    else g.fillRect(ox, oy, z.w * s, z.h * s);
    g.fillStyle = 'rgba(40,60,50,0.35)';
    for (const rv of world.layout.rivers ?? []) { g.strokeStyle = z.scenery?.kind === 'ember' ? 'rgba(255,110,40,0.85)' : 'rgba(110,190,235,0.85)'; g.lineWidth = Math.max(2, rv.w * s); g.beginPath(); rv.pts.forEach((p, i) => (i ? g.lineTo(ox + p.x * s, oy + p.y * s) : g.moveTo(ox + p.x * s, oy + p.y * s))); g.stroke(); }
    for (const o of world.layout.obstacles) {
      if (o.w) g.fillRect(ox + o.x * s, oy + o.y * s, o.w * s, o.h * s);
      else { circle(g, ox + o.x * s, oy + o.y * s, Math.max(1, o.r * s)); g.fill(); }
    }
    if (world.objective) { const ob = world.objective; g.strokeStyle = ob.owner === 1 ? '#6fb8ff' : ob.owner === 2 ? '#ff6b6b' : '#ffe296'; g.lineWidth = 2; circle(g, ox + ob.x * s, oy + ob.y * s, Math.max(3, ob.r * s)); g.stroke(); }
    for (const p of z.portals ?? []) { g.fillStyle = '#b48cff'; circle(g, ox + p.x * s, oy + p.y * s, 4); g.fill(); }
    for (const n of z.npcs ?? []) { g.fillStyle = '#ffd34d'; circle(g, ox + n.x * s, oy + n.y * s, 3); g.fill(); }
    for (const a of world.actors) {
      if (a.dead || a.kind === 'spirit' || a === player) continue;
      g.fillStyle = a.boss ? '#ff3b3b' : a.kind === 'rival' ? (a.team === 1 ? '#6fb8ff' : '#ff6b6b') : '#e05555';
      circle(g, ox + a.x * s, oy + a.y * s, a.boss ? 4 : 1.8); g.fill();
    }
    if (player) {
      g.fillStyle = '#ffffff'; g.strokeStyle = '#223'; g.lineWidth = 1.5;
      circle(g, ox + player.x * s, oy + player.y * s, 3.5); g.fill(); g.stroke();
    }
    if (round) g.restore();
  }
}

// Áreas seguras (px) lidas por uma sonda: var(--sal) com env() não resolve em getPropertyValue, mas em padding calculado sim.
let probe = null;
function safeInsets() {
  try {
    if (!probe) { probe = document.createElement('div'); probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:var(--sat,0px) var(--sar,0px) var(--sab,0px) var(--sal,0px)'; document.body.appendChild(probe); }
    const cs = getComputedStyle(probe);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  } catch { return { t: 0, r: 0, b: 0, l: 0 }; }
}

// ---------------- chão ----------------
function buildGround(world, ox = 0, oy = 0, tw = world.zone.w, th = world.zone.h, s = 1) {
  const z = world.zone, L = world.layout;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(tw * s); cv.height = Math.ceil(th * s);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; // o bloco é feito uma vez e guardado: a melhor reamostragem das texturas de chão sai de graça
  if (s !== 1) g.scale(s, s); // tudo abaixo desenha em unidades do mundo; os pixels do bloco acompanham a tela
  if (ox || oy || tw !== z.w || th !== z.h) { g.translate(-ox, -oy); g.beginPath(); g.rect(ox, oy, tw, th); g.clip(); } // bloco: desenha em coordenadas de mundo
  const rng = makeRng(hashString(world.zoneId + ':ground'));
  const P = z.palette;

  g.fillStyle = z.circle ? P.outside : P.ground;
  g.fillRect(0, 0, z.w, z.h);
  if (z.circle) {
    const cx = z.w / 2, cy = z.h / 2;
    const grd = g.createRadialGradient(cx, cy, 40, cx, cy, z.radius);
    grd.addColorStop(0, shade(P.ground, 0.04));
    grd.addColorStop(1, P.ground2);
    g.fillStyle = grd;
    circle(g, cx, cy, z.radius); g.fill();
    g.strokeStyle = shade(P.ground2, -0.06); g.lineWidth = 3;
    for (const r of [120, 260, 400]) { circle(g, cx, cy, r); g.stroke(); }
    g.save(); g.translate(cx, cy);
    for (let i = 0; i < 8; i++) { g.rotate(TAU / 8); g.beginPath(); g.moveTo(120, 0); g.lineTo(400, 0); g.stroke(); }
    g.restore();
    g.lineWidth = 26; g.strokeStyle = P.ring;
    circle(g, cx, cy, z.radius + 13); g.stroke();
    g.lineWidth = 2; g.strokeStyle = shade(P.ring, -0.15);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * z.radius, cy + Math.sin(a) * z.radius);
      g.lineTo(cx + Math.cos(a) * (z.radius + 26), cy + Math.sin(a) * (z.radius + 26));
      g.stroke();
    }
    return cv;
  }

  const textured = !!z.scenery && fillGroundTexture(g, z.scenery.kind, z.w, z.h); // grama/lajes pintadas no lugar das manchas por código
  const patches = textured ? 0 : Math.round((z.w * z.h) / 30000);
  for (let i = 0; i < patches; i++) {
    const x = rng.range(0, z.w), y = rng.range(0, z.h), r = rng.range(70, 260);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const c = rng.chance(0.7) ? P.ground2 : shade(P.ground, 0.05);
    grd.addColorStop(0, c + 'cc');
    grd.addColorStop(1, c + '00');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  if (z.scenery) paintGroundScenery(g, world, rng);

  if (z.plaza) {
    g.fillStyle = P.path; circle(g, z.plaza.x, z.plaza.y, z.plaza.r); g.fill();
    g.fillStyle = P.path2; circle(g, z.plaza.x, z.plaza.y, z.plaza.r - 12); g.fill();
    g.strokeStyle = shade(P.path, -0.06); g.lineWidth = 2;
    for (let r = 100; r < z.plaza.r - 12; r += 30) { circle(g, z.plaza.x, z.plaza.y, r); g.stroke(); }
  }
  g.lineCap = 'round';
  for (const [w, c] of [[64, P.path], [48, P.path2]]) {
    if (!c) continue;
    g.strokeStyle = c; g.lineWidth = w;
    for (const [ax, ay, bx, by] of z.paths ?? []) { g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
  }

  const stamped = stampGround(g, world, rng, { x0: ox, y0: oy, x1: ox + tw, y1: oy + th }); // flores, trevos, pedrinhas e pedras de trilha em sprites (atlas de chão)
  const tuft = shade(P.ground, -0.12);
  for (const d of stamped ? [] : L.ground) {
    if (d.type === 'flower') {
      g.fillStyle = d.color;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        circle(g, d.x + Math.cos(a) * 2.6 * d.s, d.y + Math.sin(a) * 2.6 * d.s, 2 * d.s); g.fill();
      }
      g.fillStyle = '#ffd34d'; circle(g, d.x, d.y, 1.5 * d.s); g.fill();
    } else {
      g.strokeStyle = tuft; g.lineWidth = 1.6;
      for (let i = -1; i <= 1; i++) {
        g.beginPath(); g.moveTo(d.x + i * 3, d.y); g.lineTo(d.x + i * 5, d.y - 7 * d.s); g.stroke();
      }
    }
  }
  return cv;
}

// ---------------- sombras ----------------
function drawShadow(g, it) {
  const o = it.o;
  if (it.k === 'actor') {
    if (o.kind === 'spirit') { ellipse(g, o.x, o.y + 26, 7, 3); g.fill(); return; }
    ellipse(g, o.x, o.y + o.r * 0.8, o.r * 0.95, o.r * 0.38); g.fill();
    if (o.kind === 'mob') { ellipse(g, o.x, o.y + o.r * 0.82, o.r * 1.15, o.r * 0.44); g.fill(); } // mobs: base mais escura, destaca do chão (V28)
  } else if (it.k === 'npc') { ellipse(g, o.x, o.y + 12, 14, 5); g.fill(); }
  else if (it.k === 'drop') { ellipse(g, o.x, o.y + 4, 7, 3); g.fill(); }
  else if (o.type === 'tree' || o.type === 'pine') { ellipse(g, o.x + 8, o.y + 2, o.s * 0.85, o.s * 0.32); g.fill(); }
  else if (o.type === 'rock' || o.type === 'crystal' || o.type === 'bush' || o.type === 'pillar') { ellipse(g, o.x + 4, o.y + o.s * 0.35, o.s * 0.9, o.s * 0.3); g.fill(); }
  else if (o.type === 'house') { if (hasNatureSprite(o)) ellipse(g, o.x + o.w / 2, o.y - 2, o.w * 0.56, 11); else g.fillRect(o.x + 8, o.y - 6, o.w, 14); }
  else sceneryShadow(g, o);
}

// ---------------- decoração ----------------
function drawDecor(g, d, t, z, player) {
  if (drawNature(g, d, player)) return; // cenário em sprites (modelos 3D fotografados); sem atlas, ou em tipos não cobertos, segue o desenho antigo abaixo
  switch (d.type) {
    case 'tree': {
      if (z.scenery) { drawTreeRich(g, d, t, z, player); break; }
      const [c0, c1, c2] = z.treeColors;
      g.fillStyle = '#7a5a40';
      g.fillRect(d.x - 4, d.y - 16, 8, 16);
      const behind = player && Math.abs(player.x - d.x) < d.s && player.y < d.y && player.y > d.y - d.s * 2.2;
      g.globalAlpha = behind ? 0.45 : 1;
      const sway = Math.sin(t * 0.8 + d.v * 10) * 1.2;
      g.fillStyle = c0; circle(g, d.x + sway, d.y - d.s * 0.95, d.s); g.fill();
      g.fillStyle = c1; circle(g, d.x - d.s * 0.12 + sway, d.y - d.s * 1.05, d.s * 0.78); g.fill();
      g.fillStyle = c2; circle(g, d.x - d.s * 0.32 + sway, d.y - d.s * 1.28, d.s * 0.38); g.fill();
      g.globalAlpha = 1;
      break;
    }
    case 'pine': {
      if (z.scenery) { drawPineRich(g, d, t, z, player); break; }
      const [c0, c1, c2] = z.treeColors;
      g.fillStyle = '#5a4535';
      g.fillRect(d.x - 3, d.y - 12, 6, 12);
      const behind = player && Math.abs(player.x - d.x) < d.s * 0.8 && player.y < d.y && player.y > d.y - d.s * 2.4;
      g.globalAlpha = behind ? 0.45 : 1;
      [[c0, 0, 1], [c1, 0.55, 0.78], [c2, 1.05, 0.52]].forEach(([c, off, w]) => {
        g.fillStyle = c;
        g.beginPath();
        g.moveTo(d.x - d.s * w, d.y - 8 - off * d.s);
        g.lineTo(d.x + d.s * w, d.y - 8 - off * d.s);
        g.lineTo(d.x, d.y - 8 - off * d.s - d.s * 1.1);
        g.closePath(); g.fill();
      });
      g.globalAlpha = 1;
      break;
    }
    case 'rock': {
      g.fillStyle = '#9aa1a9';
      ellipse(g, d.x, d.y, d.s, d.s * 0.72); g.fill();
      g.fillStyle = '#b9bfc6';
      ellipse(g, d.x - d.s * 0.2, d.y - d.s * 0.2, d.s * 0.65, d.s * 0.42); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      ellipse(g, d.x - d.s * 0.35, d.y - d.s * 0.35, d.s * 0.22, d.s * 0.12); g.fill();
      break;
    }
    case 'crystal': {
      const cols = ['#b9a7f0', '#9fc8f5', '#d4c4ff'];
      const shards = [[-0.45, 0.8, -0.25], [0, 1.25, 0], [0.45, 0.9, 0.25]];
      shards.forEach(([ox, h, tilt], i) => {
        g.save();
        g.translate(d.x + ox * d.s, d.y);
        g.rotate(tilt);
        const w = d.s * 0.32, H = d.s * h * 1.4;
        g.fillStyle = cols[(i + Math.floor(d.v * 3)) % 3];
        g.beginPath(); g.moveTo(-w, 0); g.lineTo(-w, -H * 0.75); g.lineTo(0, -H); g.lineTo(w, -H * 0.75); g.lineTo(w, 0); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.45)';
        g.beginPath(); g.moveTo(-w * 0.6, -2); g.lineTo(-w * 0.6, -H * 0.72); g.lineTo(0, -H * 0.95); g.lineTo(0, -2); g.closePath(); g.fill();
        g.restore();
      });
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(180,160,255,${0.12 + Math.sin(t * 2 + d.v * 9) * 0.06})`;
      circle(g, d.x, d.y - d.s * 0.8, d.s * 1.2); g.fill();
      g.globalCompositeOperation = 'source-over';
      break;
    }
    case 'pillar': {
      const broken = d.v < 0.45, H = d.s * (broken ? 1.1 : 2.1), w = d.s * 0.62;
      g.fillStyle = '#8f8ba0';
      ellipse(g, d.x, d.y, d.s * 0.85, d.s * 0.4); g.fill();
      const grd = g.createLinearGradient(d.x - w, 0, d.x + w, 0);
      grd.addColorStop(0, '#d7d3e2'); grd.addColorStop(0.6, '#bdb8cc'); grd.addColorStop(1, '#9893ab');
      g.fillStyle = grd;
      g.fillRect(d.x - w, d.y - H, w * 2, H);
      g.strokeStyle = 'rgba(80,75,100,0.25)'; g.lineWidth = 1.5;
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(d.x + i * w * 0.5, d.y - H + 4); g.lineTo(d.x + i * w * 0.5, d.y - 2); g.stroke(); }
      g.fillStyle = '#e4e0ec';
      if (broken) {
        g.beginPath(); g.moveTo(d.x - w, d.y - H); g.lineTo(d.x - w * 0.3, d.y - H - 6); g.lineTo(d.x + w * 0.2, d.y - H + 3); g.lineTo(d.x + w, d.y - H - 4); g.lineTo(d.x + w, d.y - H + 4); g.lineTo(d.x - w, d.y - H + 4); g.closePath(); g.fill();
      } else {
        g.fillRect(d.x - w * 1.25, d.y - H - 8, w * 2.5, 10);
      }
      break;
    }
    case 'bush': {
      const c = z.treeColors;
      [[-0.5, 0, 0.7, c[0]], [0.5, 0, 0.7, c[0]], [0, -0.35, 0.8, c[1]], [-0.2, -0.55, 0.35, c[2]]].forEach(([ox, oy, r, col]) => {
        g.fillStyle = col; circle(g, d.x + ox * d.s, d.y + oy * d.s, r * d.s); g.fill();
      });
      if (d.v > 0.6) {
        g.fillStyle = '#ff6f7d';
        for (let i = 0; i < 3; i++) { circle(g, d.x + (i - 1) * d.s * 0.4, d.y - d.s * 0.2 + (i % 2) * 4, 2.2); g.fill(); }
      }
      break;
    }
    case 'house': {
      const { x, top, w, h, roof } = d;
      const wallTop = top + h * 0.42;
      g.fillStyle = '#f4e8d2';
      g.fillRect(x, wallTop, w, top + h - wallTop);
      g.fillStyle = '#e2d3b8';
      g.fillRect(x, top + h - 8, w, 8);
      g.fillStyle = '#8a6448';
      g.fillRect(x + w / 2 - 14, top + h - 46, 28, 46);
      g.fillStyle = '#f2c96b'; circle(g, x + w / 2 + 8, top + h - 22, 2.5); g.fill();
      g.fillStyle = '#9fd3ee';
      for (const wx of [x + 22, x + w - 52]) {
        g.fillRect(wx, wallTop + 16, 30, 24);
        g.fillStyle = '#ffffff88'; g.fillRect(wx + 3, wallTop + 19, 10, 8); g.fillStyle = '#9fd3ee';
      }
      g.fillStyle = roof;
      g.beginPath();
      g.moveTo(x - 14, wallTop + 6); g.lineTo(x + w + 14, wallTop + 6);
      g.lineTo(x + w - 6, top - 18); g.lineTo(x + 6, top - 18); g.closePath(); g.fill();
      g.fillStyle = shade(roof, 0.12);
      g.fillRect(x + 6, top - 18, w - 12, 10);
      g.strokeStyle = shade(roof, -0.12); g.lineWidth = 2;
      for (let yy = top; yy < wallTop; yy += 14) { g.beginPath(); g.moveTo(x - 4, yy); g.lineTo(x + w + 4, yy); g.stroke(); }
      g.fillStyle = '#b9a58c';
      g.fillRect(x + w - 44, top - 34, 18, 26);
      break;
    }
    case 'fountain': {
      g.fillStyle = '#d6cfc0'; circle(g, d.x, d.y, 60); g.fill();
      g.fillStyle = '#c4bcab'; circle(g, d.x, d.y + 4, 52); g.fill();
      g.fillStyle = '#7cc6e8'; circle(g, d.x, d.y, 46); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const r = ((t * 18 + i * 15) % 45) + 4;
        g.globalAlpha = 1 - r / 49;
        circle(g, d.x, d.y, r); g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = '#e8e2d4'; circle(g, d.x, d.y - 6, 11); g.fill();
      g.fillStyle = 'rgba(200,235,255,0.85)';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + t;
        circle(g, d.x + Math.cos(a) * 14, d.y - 14 + Math.sin(a) * 6 - Math.abs(Math.sin(t * 3 + i)) * 6, 2.5); g.fill();
      }
      break;
    }
    default: drawSceneryDecor(g, d, t);
  }
}

// ---------------- personagens ----------------
function drawActorHero(g, a, t) {
  const cls = CLASSES[a.classId];
  g.save();
  if (a.dead) { g.globalAlpha = Math.max(0.25, 1 - a.deadT); }
  if (a.dash?.invuln) g.globalAlpha = 0.55;
  // visual novo (opcional, ?visual=miniatura): sprite do herói em miniatura; se ainda não carregou, cai no desenho antigo
  const r = heroSpritesEnabled() ? drawHeroSprite(g, a, t) : false;
  if (r === false) drawHero(g, a, a.classId, t, cls.color, cls.accent); // 'wait' = carregando: não desenha (a tela de carregamento cobre)
  g.restore();
  drawStatus(g, a, t);
}

function drawHero(g, a, look, t, color, accent) {
  const moving = a.moving;
  const bob = moving ? -Math.abs(Math.sin(a.walk)) * 2.2 : Math.sin(t * 2.2 + (a.id ?? 0)) * 0.7;
  const face = a.facing ?? Math.PI / 2;
  const fx = Math.cos(face), fy = Math.sin(face);
  const behind = fy < -0.25;
  g.save();
  g.translate(a.x, a.y);
  const step = moving ? Math.sin(a.walk) * 3.5 : 0;
  g.fillStyle = '#5b4a44';
  ellipse(g, -5, 12 + step * 0.4, 4, 3); g.fill();
  ellipse(g, 5, 12 - step * 0.4, 4, 3); g.fill();
  g.translate(0, bob);

  if (behind) drawWeapon(g, a, look, fx, fy);
  const grd = g.createLinearGradient(0, -6, 0, 14);
  grd.addColorStop(0, shade(color, 0.08));
  grd.addColorStop(1, shade(color, -0.12));
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(-9, -5); g.quadraticCurveTo(0, -9, 9, -5);
  g.lineTo(12, 11); g.quadraticCurveTo(0, 15, -12, 11);
  g.closePath(); g.fill();
  g.fillStyle = accent;
  g.fillRect(-10, 3, 20, 3);
  g.fillStyle = SKIN;
  circle(g, -11 + (fx < 0 ? fx * 2 : 0), 2, 3.4); g.fill();
  circle(g, 11 + (fx > 0 ? fx * 2 : 0), 2, 3.4); g.fill();

  drawHead(g, look, color, accent, fx, fy, behind, t);
  if (!behind) drawWeapon(g, a, look, fx, fy);
  if (a.hitFlash > 0) {
    g.globalAlpha = Math.min(0.7, a.hitFlash * 6);
    g.fillStyle = '#ffffff';
    circle(g, 0, -4, 15); g.fill();
    g.globalAlpha = 1;
  }
  g.restore();
}

function drawHead(g, look, color, accent, fx, fy, behind, t) {
  const hy = -14;
  if (look === 'archer') { g.fillStyle = shade(color, -0.05); circle(g, 0, hy - 1, 11); g.fill(); }
  if (look === 'cleric') { g.fillStyle = '#fbf7ee'; circle(g, 0, hy - 1, 10.5); g.fill(); }
  g.fillStyle = SKIN;
  circle(g, 0, hy, look === 'archer' || look === 'cleric' ? 7.5 : 8.5); g.fill();
  if (!behind) {
    g.fillStyle = '#2d2a38';
    const ex = fx * 3, ey = Math.max(0, fy) * 1.5;
    circle(g, -3 + ex, hy + 1 + ey, 1.4); g.fill();
    circle(g, 3 + ex, hy + 1 + ey, 1.4); g.fill();
    g.fillStyle = 'rgba(255,140,140,0.35)';
    circle(g, -5 + ex, hy + 4, 1.8); g.fill();
    circle(g, 5 + ex, hy + 4, 1.8); g.fill();
  } else if (look !== 'archer' && look !== 'cleric') {
    g.fillStyle = '#6b4a3a';
    circle(g, 0, hy - 1, 8); g.fill();
  }
  switch (look) {
    case 'warrior':
      g.fillStyle = '#c2c9d3';
      g.beginPath(); g.arc(0, hy - 1, 9.2, Math.PI, 0); g.closePath(); g.fill();
      g.fillStyle = '#a3abb7'; g.fillRect(-9.5, hy - 2, 19, 3);
      g.fillStyle = color;
      g.beginPath(); g.moveTo(-2, hy - 10); g.quadraticCurveTo(4, hy - 20, 9, hy - 12); g.quadraticCurveTo(4, hy - 13, 2, hy - 9); g.closePath(); g.fill();
      break;
    case 'mage':
      g.fillStyle = shade(color, -0.1);
      ellipse(g, 0, hy - 6, 13, 4); g.fill();
      g.fillStyle = color;
      g.beginPath(); g.moveTo(-8, hy - 7); g.quadraticCurveTo(0, hy - 30, 9, hy - 28); g.quadraticCurveTo(3, hy - 22, 8, hy - 7); g.closePath(); g.fill();
      g.fillStyle = '#ffe58a';
      circle(g, 9, hy - 28, 2.4); g.fill();
      break;
    case 'cleric':
      g.strokeStyle = `rgba(255,220,110,${0.75 + Math.sin(t * 3) * 0.2})`; g.lineWidth = 2;
      ellipse(g, 0, hy - 14, 8, 2.6); g.stroke();
      break;
    case 'archer':
      g.fillStyle = accent;
      g.beginPath(); g.moveTo(-8, hy - 6); g.lineTo(-13, hy - 14); g.lineTo(-5, hy - 9); g.closePath(); g.fill();
      break;
  }
}

function drawWeapon(g, a, look, fx, fy) {
  const melee = look === 'warrior' || look === 'cleric';
  let ang = Math.atan2(fy, fx);
  if (a.swing > 0 && melee) ang += (a.swing / 0.25 - 0.5) * 2.4;
  const pull = a.swing > 0 && !melee ? a.swing * 10 : 0;
  g.save();
  g.translate(fx * 10, fy * 5 + 1);
  g.rotate(ang);
  switch (look) {
    case 'warrior':
      g.fillStyle = '#6b4a35'; g.fillRect(0, -1.5, 7, 3);
      g.fillStyle = '#d4a944'; g.fillRect(6, -5, 3, 10);
      g.fillStyle = '#e9eef6'; g.beginPath(); g.moveTo(9, -2.5); g.lineTo(28, -2); g.lineTo(32, 0); g.lineTo(28, 2); g.lineTo(9, 2.5); g.closePath(); g.fill();
      g.fillStyle = '#ffffff88'; g.fillRect(10, -1.5, 18, 1);
      break;
    case 'mage':
      g.fillStyle = '#7a5537'; g.fillRect(-6, -1.6, 30, 3.2);
      g.fillStyle = '#c9d4ff'; circle(g, 26, 0, 5); g.fill();
      g.fillStyle = '#ffffffaa'; circle(g, 25, -1.5, 2); g.fill();
      break;
    case 'archer':
      g.strokeStyle = '#8a5a35'; g.lineWidth = 3;
      g.beginPath(); g.arc(4 - pull * 0.2, 0, 13, -1.25, 1.25); g.stroke();
      g.strokeStyle = '#ffffffcc'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(4 + Math.cos(-1.25) * 13, Math.sin(-1.25) * 13); g.lineTo(-pull, 0); g.lineTo(4 + Math.cos(1.25) * 13, Math.sin(1.25) * 13); g.stroke();
      break;
    case 'cleric':
      g.fillStyle = '#7a5537'; g.fillRect(0, -1.6, 20, 3.2);
      g.fillStyle = '#d9dde6'; circle(g, 22, 0, 6); g.fill();
      g.fillStyle = '#f2c94c'; g.fillRect(19, -1.2, 6, 2.4);
      break;
  }
  g.restore();
}

function drawStatus(g, a, t) {
  if (a.shield > 0) {
    g.strokeStyle = `rgba(255,236,150,${0.6 + Math.sin(t * 6) * 0.2})`;
    g.fillStyle = 'rgba(255,236,150,0.12)';
    g.lineWidth = 2;
    circle(g, a.x, a.y - 4, a.r + 9); g.fill(); g.stroke();
  }
  if (a.buffs.some((b) => b.dmg)) {
    g.strokeStyle = `rgba(255,120,80,${0.5 + Math.sin(t * 8) * 0.25})`; g.lineWidth = 2;
    ellipse(g, a.x, a.y + a.r * 0.8, a.r + 6, (a.r + 6) * 0.4); g.stroke();
  }
  if (a.slowT > 0) {
    g.fillStyle = 'rgba(150,220,255,0.28)';
    circle(g, a.x, a.y - 2, a.r + 3); g.fill();
  }
  if (a.stunT > 0) {
    g.fillStyle = '#ffe066';
    for (let i = 0; i < 3; i++) {
      const ang = t * 5 + (i / 3) * TAU;
      circle(g, a.x + Math.cos(ang) * 11, a.y - a.r - 18 + Math.sin(ang) * 3, 2.6); g.fill();
    }
  }
}

// ---------------- mobs ----------------
function drawMob(g, a, t) {
  if (mobSpritesEnabled() && drawMobSprite(g, a, t)) { // criatura pintada (B2); sem arte ou ?monstros=original vale o desenho abaixo
    if (a.elite && !a.dead) { g.strokeStyle = `rgba(255,190,80,${0.5 + Math.sin(t * 4) * 0.25})`; g.lineWidth = 2; ellipse(g, a.x, a.y + a.r * 0.8, a.r + 4, (a.r + 4) * 0.4); g.stroke(); }
    drawStatus(g, a, t); return;
  }
  const M = MOBS[a.mobId], k = a.r / M.size, c = M.color;
  const fx = Math.cos(a.facing), fy = Math.sin(a.facing);
  g.save();
  if (a.dead) { g.globalAlpha = Math.max(0, 1 - a.deadT * 1.8); }
  g.translate(a.x, a.y);
  g.scale(k, k);
  const bob = Math.sin(t * 4 + a.id) * 1.2;
  const eyes = (y, sep = 4, r = 1.8, col = '#2a2333') => {
    g.fillStyle = col;
    circle(g, -sep + fx * 2.5, y + Math.max(0, fy) * 1.5, r); g.fill();
    circle(g, sep + fx * 2.5, y + Math.max(0, fy) * 1.5, r); g.fill();
  };
  // Pintados (assets/mobs, sem desenho por código): slime, wolf, shroom, treant, crystalwolf, wisp, wraith, knight, guardian. Sobra o golem (também gargoyle/colossus no código) até ter arte.
  switch (M.shape) {
    // slime: só existe pintado (assets/mobs/slime); o desenho antigo foi removido
  }
  if (a.hitFlash > 0) {
    g.globalAlpha = Math.min(0.65, a.hitFlash * 6);
    g.fillStyle = '#ffffff';
    circle(g, 0, -4, M.size * 1.05); g.fill();
  }
  g.restore();
  if (a.elite && !a.dead) {
    g.strokeStyle = `rgba(255,190,80,${0.5 + Math.sin(t * 4) * 0.25})`; g.lineWidth = 2;
    ellipse(g, a.x, a.y + a.r * 0.8, a.r + 4, (a.r + 4) * 0.4); g.stroke();
  }
  drawStatus(g, a, t);
}

// ---------------- spirits ----------------
function drawSpirit(g, s, t) {
  const S = SPIRITS[s.spiritType];
  const y = s.y + Math.sin(s.bob * 3) * 3;
  if (drawSpiritSprite(g, s, y, t)) return; // spirit pintado; sem a imagem vale o desenho antigo abaixo
  g.globalCompositeOperation = 'lighter';
  const grd = g.createRadialGradient(s.x, y, 1, s.x, y, 20);
  grd.addColorStop(0, S.glow + 'cc'); grd.addColorStop(1, S.color + '00');
  g.fillStyle = grd; circle(g, s.x, y, 20); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = S.color;
  switch (s.spiritType) {
    case 'ember':
      g.beginPath(); g.moveTo(s.x - 7, y + 3); g.quadraticCurveTo(s.x, y - 18 - Math.sin(t * 12) * 2, s.x + 7, y + 3); g.quadraticCurveTo(s.x, y + 10, s.x - 7, y + 3); g.fill();
      break;
    case 'undine':
      g.beginPath(); g.moveTo(s.x, y - 12); g.quadraticCurveTo(s.x + 9, y + 1, s.x, y + 7); g.quadraticCurveTo(s.x - 9, y + 1, s.x, y - 12); g.fill();
      break;
    case 'terra':
      g.beginPath(); g.roundRect(s.x - 7, y - 6, 14, 12, 4); g.fill();
      g.fillStyle = '#7fc46a'; ellipse(g, s.x + 3, y - 8, 4, 2); g.fill();
      break;
    case 'zephyr':
      circle(g, s.x, y, 7); g.fill();
      g.strokeStyle = S.glow; g.lineWidth = 2;
      g.beginPath(); g.arc(s.x, y, 11, t * 6, t * 6 + 2); g.stroke();
      g.beginPath(); g.arc(s.x, y, 11, t * 6 + 3.14, t * 6 + 5.14); g.stroke();
      break;
  }
  g.fillStyle = '#ffffff'; circle(g, s.x - 2.5, y - 1, 1.6); g.fill(); circle(g, s.x + 2.5, y - 1, 1.6); g.fill();
  g.fillStyle = '#20263a'; circle(g, s.x - 2.5, y - 0.6, 0.9); g.fill(); circle(g, s.x + 2.5, y - 0.6, 0.9); g.fill();
  const sp = t * 3 + s.id;
  g.fillStyle = S.glow;
  circle(g, s.x + Math.cos(sp) * 13, y + Math.sin(sp) * 5, 1.5); g.fill();
}

// ---------------- itens no chão ----------------
function drawDrop(g, d, t) {
  if (d.t >= DROP_LIFE - DROP_BLINK && Math.floor(d.t * 6) % 2) return; // some sozinho: pisca nos últimos segundos antes de expirar
  const y = d.y - 4 - Math.abs(Math.sin(t * 3 + d.x)) * 3;
  if (d.kind === 'gold') {
    g.fillStyle = '#e8b23a'; ellipse(g, d.x, y + 2, 6, 3); g.fill();
    g.fillStyle = '#ffd34d'; ellipse(g, d.x, y, 6, 3); g.fill();
    g.fillStyle = '#fff2b0'; ellipse(g, d.x - 2, y - 0.5, 2, 1); g.fill();
    return;
  }
  if (d.kind === 'potion') {
    g.fillStyle = '#f0e6e6'; g.fillRect(d.x - 2, y - 12, 4, 4);
    g.fillStyle = '#ff5a6e'; circle(g, d.x, y - 3, 6); g.fill();
    g.fillStyle = '#ffffff99'; circle(g, d.x - 2, y - 5, 1.8); g.fill();
    return;
  }
  const col = d.kind === 'essence' ? `hsl(${(t * 90) % 360},85%,70%)` : RARITY[d.item.rarity].color;
  const ri = d.kind === 'essence' ? 4 : RARITY[d.item.rarity].index;
  if (ri >= 2) {
    const grd = g.createLinearGradient(0, y - 70, 0, y);
    grd.addColorStop(0, col + '00'); grd.addColorStop(1, col + '88');
    g.fillStyle = d.kind === 'essence' ? 'rgba(255,255,255,0.25)' : grd;
    g.fillRect(d.x - 3, y - 70, 6, 70);
  }
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = d.kind === 'essence' ? 'rgba(220,200,255,0.35)' : col + '55';
  circle(g, d.x, y - 3, 12 + Math.sin(t * 4) * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = col;
  if (d.kind === 'essence') { circle(g, d.x, y - 4, 6); g.fill(); }
  else { g.beginPath(); g.moveTo(d.x, y - 12); g.lineTo(d.x + 6, y - 4); g.lineTo(d.x, y + 3); g.lineTo(d.x - 6, y - 4); g.closePath(); g.fill(); }
  g.fillStyle = '#ffffffaa'; circle(g, d.x - 1.5, y - 6, 1.6); g.fill();
}

// ---------------- efeitos ----------------
function drawProjectile(g, p) {
  const arrow = p.src.classId === 'archer' && p.src.kind !== 'spirit';
  if (arrow) {
    g.strokeStyle = p.color; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(p.x - Math.cos(p.ang) * 16, p.y - Math.sin(p.ang) * 16); g.lineTo(p.x, p.y); g.stroke();
    g.fillStyle = '#ffffff'; circle(g, p.x, p.y, 2); g.fill();
    return;
  }
  const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 2.2);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.35, p.color); grd.addColorStop(1, p.color + '00');
  g.fillStyle = grd; circle(g, p.x, p.y, p.radius * 2.2); g.fill();
}

function drawFx(g, f) {
  const k = f.t / f.life;
  g.globalAlpha = 1 - k;
  if (f.type === 'slash') {
    g.strokeStyle = f.color; g.lineWidth = 6 * (1 - k) + 1; g.lineCap = 'round';
    g.beginPath(); g.arc(f.x, f.y, f.r * (0.75 + k * 0.2), f.ang - f.arc / 2, f.ang + f.arc / 2); g.stroke();
  } else if (f.type === 'ring') {
    const r = f.r * (0.4 + k * 0.6);
    g.fillStyle = f.color + '33'; circle(g, f.x, f.y, r); g.fill();
    g.strokeStyle = f.color; g.lineWidth = 4 * (1 - k) + 1;
    circle(g, f.x, f.y, r); g.stroke();
  }
  g.globalAlpha = 1;
}

function drawArea(g, ar, t) {
  const fade = ar.ticks > 0 ? 1 : Math.max(0, 1 + ar.next / 0.3);
  g.globalAlpha = 0.85 * fade;
  g.fillStyle = ar.color + '30';
  circle(g, ar.x, ar.y, ar.r); g.fill();
  g.strokeStyle = ar.color; g.lineWidth = 2; g.setLineDash([8, 6]); g.lineDashOffset = -t * 30;
  circle(g, ar.x, ar.y, ar.r); g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 1;
}

// Telégrafo de golpe do chefe (V17): disco que esquenta do centro para a borda, anel de runas girando e preenchimento que cresce até o impacto.
function drawTelegraph(g, tg, t) {
  const k = Math.min(1, tg.t / tg.delay), r = tg.r, pulse = 0.75 + Math.sin(t * 10) * 0.25;
  g.save(); g.translate(tg.x, tg.y);
  let gr = g.createRadialGradient(0, 0, r * 0.15, 0, 0, r);
  gr.addColorStop(0, 'rgba(120,10,10,0.06)'); gr.addColorStop(0.75, 'rgba(210,40,30,0.2)'); gr.addColorStop(1, 'rgba(255,90,50,0.34)');
  g.fillStyle = gr; circle(g, 0, 0, r); g.fill();
  g.globalCompositeOperation = 'lighter';
  gr = g.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, r * k));
  gr.addColorStop(0, 'rgba(255,160,60,0.05)'); gr.addColorStop(1, `rgba(255,110,40,${0.3 + k * 0.25})`);
  g.fillStyle = gr; circle(g, 0, 0, Math.max(1, r * k)); g.fill();
  g.strokeStyle = `rgba(255,120,70,${0.55 * pulse})`; g.lineWidth = 3; circle(g, 0, 0, r); g.stroke();
  g.lineWidth = 2; g.strokeStyle = `rgba(255,190,110,${0.5 * pulse})`;
  g.setLineDash([r * 0.12, r * 0.09]); g.lineDashOffset = -t * r * 0.4; circle(g, 0, 0, r * 0.84); g.stroke();
  g.setLineDash([r * 0.05, r * 0.07]); g.lineDashOffset = t * r * 0.3; circle(g, 0, 0, r * 0.62); g.stroke(); g.setLineDash([]);
  g.fillStyle = `rgba(255,210,150,${0.7 * pulse})`; // 8 runas (losangos) no anel, girando devagar
  for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU + t * 0.5, x = Math.cos(an) * r * 0.92, y = Math.sin(an) * r * 0.92; g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 3, y); g.lineTo(x, y + 4); g.lineTo(x - 3, y); g.closePath(); g.fill(); }
  g.restore();
}

// Cor do portal pelo destino (borda clara, miolo, brilho).
const PORTAL_COL = { town: ['255,236,170', '255,200,90'], forest: ['190,255,190', '90,200,110'], plains: ['255,200,235', '190,140,255'], ruins: ['225,205,255', '140,100,255'], glacier: ['215,240,255', '110,180,255'], ember: ['255,220,170', '255,110,50'] };
// Portal: círculo de runas no chão, dois pilares de pedra e um redemoinho vertical de luz que sobe em fagulhas.
function drawPortal(g, p, t, minX = -1e9, maxX = 1e9) {
  const [hi, mid] = PORTAL_COL[p.to] ?? PORTAL_COL.ruins, pulse = 0.85 + Math.sin(t * 2.2) * 0.15;
  g.save(); g.translate(p.x, p.y);
  // runas no chão
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = `rgba(${mid},${0.35 * pulse})`; g.lineWidth = 2;
  g.beginPath(); g.ellipse(0, 6, 62, 24, 0, 0, TAU); g.stroke();
  g.beginPath(); g.ellipse(0, 6, 48, 18, 0, 0, TAU); g.stroke();
  g.fillStyle = `rgba(${hi},${0.6 * pulse})`;
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + t * 0.25; g.fillRect(Math.cos(a) * 55 - 1.5, 6 + Math.sin(a) * 21 - 1.5, 3, 3); }
  const gd = g.createRadialGradient(0, 4, 4, 0, 4, 66); gd.addColorStop(0, `rgba(${mid},0.45)`); gd.addColorStop(1, `rgba(${mid},0)`);
  g.fillStyle = gd; ellipse(g, 0, 6, 66, 26); g.fill();
  g.globalCompositeOperation = 'source-over';
  // pilar de trás-esquerda, redemoinho e pilar da frente-direita (o herói passa entre eles)
  drawNatureNamed(g, 'm_pillar_1', -40, 14, 84);
  g.globalCompositeOperation = 'lighter';
  const vg = g.createRadialGradient(0, -34, 4, 0, -34, 52); vg.addColorStop(0, `rgba(${hi},0.95)`); vg.addColorStop(0.45, `rgba(${mid},0.55)`); vg.addColorStop(1, `rgba(${mid},0)`);
  g.fillStyle = vg; ellipse(g, 0, -34, 30 * pulse, 50 * pulse); g.fill();
  g.lineWidth = 2.5;
  for (let i = 0; i < 5; i++) {
    const a = t * (1.2 + i * 0.35) + i * 1.3, rx = 8 + i * 4.5, ry = 18 + i * 7;
    g.strokeStyle = `rgba(${i % 2 ? hi : mid},${0.75 - i * 0.1})`;
    g.beginPath(); g.ellipse(0, -34, rx, ry, 0, a, a + 1.6); g.stroke();
  }
  // fagulhas subindo
  g.fillStyle = `rgba(${hi},0.9)`;
  for (let i = 0; i < 12; i++) { const u = (t * 0.35 + i / 12) % 1, x = Math.sin(i * 7.3 + t * 0.9) * (18 + u * 6); g.globalAlpha = 1 - u; g.fillRect(x - 1.5, 6 - u * 96, 3, 3); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  drawNatureNamed(g, 'm_pillar_2', 42, 18, 78, true);
  g.restore();
  g.font = '700 13px Cinzel, Nunito, serif';
  g.textAlign = 'center';
  const w = g.measureText(p.label).width + 18, lx = Math.max(minX + w / 2, Math.min(maxX - w / 2, p.x)); // etiqueta presa à tela (V23)
  g.fillStyle = 'rgba(24,16,8,0.78)';
  g.beginPath(); g.roundRect(lx - w / 2, p.y - 118, w, 22, 11); g.fill();
  g.fillStyle = '#efe6ff';
  g.fillText(p.label, lx, p.y - 102);
}

// ---------------- barras / nomes ----------------
// Ponto de controle da arena por times: anel que muda de cor com o dono (azul = seu time, vermelho = inimigo) e pulsa se disputado.
function drawObjective(g, ob, t) {
  const col = ob.owner === 1 ? '111,184,255' : ob.owner === 2 ? '255,107,107' : '255,226,150';
  const pulse = ob.contested ? 0.5 + 0.5 * Math.sin(t * 8) : 0.5;
  g.save();
  g.fillStyle = 'rgba(' + col + ',' + (0.12 + pulse * 0.08) + ')';
  circle(g, ob.x, ob.y, ob.r); g.fill();
  g.strokeStyle = 'rgba(' + col + ',0.85)'; g.lineWidth = 4; g.setLineDash([14, 10]); g.lineDashOffset = -t * 16;
  circle(g, ob.x, ob.y, ob.r); g.stroke();
  g.restore();
}

function drawBars(g, a, isPlayer, placed) {
  if (a.kind === 'spirit') return;
  const showMob = a.kind === 'mob' && (a.hp < a.maxHp || a.elite || a.boss);
  if (a.kind === 'mob' && !showMob) return;
  const w = a.kind === 'mob' ? Math.max(34, a.r * 2.2) : 38;
  const top = a.y - (a.kind === 'mob' ? a.r * (MOBS[a.mobId].shape === 'treant' ? 2.6 : 1.6) : 40) - 10;
  const x = a.x - w / 2;
  g.fillStyle = 'rgba(20,20,35,0.6)';
  g.beginPath(); g.roundRect(x - 1, top - 1, w + 2, 7, 3); g.fill();
  g.fillStyle = isPlayer ? '#5fd38a' : a.kind === 'rival' ? (a.team === 1 ? '#6fb8ff' : '#ff6b6b') : '#ff7a6b';
  g.beginPath(); g.roundRect(x, top, Math.max(0, w * a.hp / a.maxHp), 5, 2.5); g.fill();
  if (a.shield > 0) {
    g.fillStyle = '#ffe9a0';
    g.fillRect(x, top - 3, Math.min(w, w * a.shield / a.maxHp), 2);
  }
  // Marcador de time que NÃO depende só da cor (partidas online): losango = aliado, quadrado = adversário
  if (a.mark) {
    const mx = x - 9, my = top + 2.5;
    g.fillStyle = a.mark === 'ally' ? '#6fb8ff' : '#ff6b6b'; g.strokeStyle = 'rgba(20,20,35,0.8)'; g.lineWidth = 1.5;
    g.beginPath();
    if (a.mark === 'ally') { g.moveTo(mx, my - 5); g.lineTo(mx + 5, my); g.lineTo(mx, my + 5); g.lineTo(mx - 5, my); g.closePath(); } else g.rect(mx - 4, my - 4, 8, 8);
    g.fill(); g.stroke();
  }
  g.font = '800 11px Cinzel, Nunito, serif';
  g.textAlign = 'center';
  g.lineWidth = 3; g.strokeStyle = 'rgba(20,20,35,0.7)';
  let label = null;
  if (a.kind === 'rival') label = `${a.name} · Nv ${a.level}`;
  else if (a.kind === 'mob') label = `Nv ${a.level}${a.boss || a.elite ? ' · ' + a.name : ''}`;
  if (label) {
    // etiquetas coladas se afastam para cima (V21): até 3 degraus de 12 px; a posição fica registrada no quadro
    let ly = top - 4;
    if (placed) {
      const hw = g.measureText(label).width / 2 + 2;
      for (let n = 0; n < 3 && placed.some((q) => Math.abs(q.x - a.x) < q.hw + hw && Math.abs(q.y - ly) < 12); n++) ly -= 12;
      placed.push({ x: a.x, y: ly, hw });
    }
    const sp = safeBox(a.x, ly - 11, g.measureText(label).width + 6, 14); // etiqueta presa à tela e fora do menu
    const lx = sp.x; ly = sp.y + 11;
    g.strokeText(label, lx, ly);
    g.fillStyle = a.boss ? '#ffb4a8' : a.elite ? '#ffd27a' : a.kind === 'rival' && a.team === 1 ? '#bfe0ff' : '#ffffff';
    g.fillText(label, lx, ly);
  }
}

// Baú pintado (assets/props/chest.webp): brilha quando está pronto para abrir; saqueado fica escurecido.
function drawChest(g, c, ready, t) { drawChestSprite(g, c, ready, t); } // baú pintado (render/prop-sprites.js); o desenho por código foi removido

// Quadro atual da vista (câmera, zoom e áreas da interface) para prender etiquetas à área livre da tela
const SAFE = { cx: 0, cy: 0, zm: 1, vw: 0, vh: 0, hud: null, x: 0, y: 0 };
// Prende uma caixa (x = centro, y = topo, em unidades do mundo) dentro da tela e fora das áreas da interface; resultado em SAFE.x/SAFE.y
function safeBox(x, y, w, h) {
  const s = SAFE;
  if (!s.hud) { s.x = x; s.y = y; return s; }
  safeBoxScreen((x - s.cx) * s.zm, (y - s.cy) * s.zm, w * s.zm, h * s.zm, s.vw, s.vh, s.hud, s);
  s.x = s.cx + s.x / s.zm; s.y = s.cy + s.y / s.zm;
  return s;
}

const PROMPTS = [], PROMPT_OFF = [0, -24, 24, -48, 48]; // rótulos "Toque para…" já postos neste quadro (zerado em draw)
function drawPrompt(g, x, y, txt) {
  g.font = '800 13px Cinzel, Nunito, serif'; g.textAlign = 'center';
  const w = g.measureText(txt).width + 16;
  // nunca sob botões de toque nem fora da tela; dois rótulos (NPC e baú juntos) não se sobrepõem: tenta ao lado em degraus de 24 px
  const x0 = x, y0 = y;
  for (let n = 0; n < 5; n++) {
    const p = safeBox(x0, y0 + PROMPT_OFF[n], w, 22); x = p.x; y = p.y;
    if (!PROMPTS.some((q) => Math.abs(q.x - x) < (q.w + w) / 2 && Math.abs(q.y - y) < 24)) break;
  }
  PROMPTS.push({ x, y, w });
  g.fillStyle = 'rgba(24,16,8,0.82)'; g.beginPath(); g.roundRect(x - w / 2, y, w, 22, 11); g.fill();
  g.fillStyle = '#ffffff'; g.fillText(txt, x, y + 16);
}

function drawNpcTag(g, n, near, t, mark, guide) {
  g.font = '800 12px Cinzel, Nunito, serif';
  g.textAlign = 'center';
  g.lineWidth = 3; g.strokeStyle = 'rgba(20,20,35,0.7)';
  const top = mobSpritesEnabled() ? npcTop(n.id) : null, ny = top != null ? n.y + top - 6 : n.y - 44; // pintado: o nome fica logo acima da cabeça
  g.strokeText(n.name, n.x, ny);
  g.fillStyle = '#fff3c4';
  g.fillText(n.name, n.x, ny);
  const by = ny - 22 + Math.sin(t * 3) * 3;
  // marca de missão: '!' = tem missão para você, '?' = pronta para entregar, 'none' = nada a fazer (esconde); sem informação = '!' de serviço
  if (mark && mark !== 'none') { // sem informação = sem marca: o ❗ é só de missão (antes os NPCs de serviço também o mostravam)
    g.fillStyle = mark === 'ready' ? '#7dffb0' : '#ffd34d'; circle(g, n.x, by, 9); g.fill();
    g.fillStyle = '#5a3d00'; g.font = '900 13px Nunito, system-ui, sans-serif';
    g.fillText(mark === 'ready' ? '?' : '!', n.x, by + 5);
  }
  // Onboarding: pulso e seta sobre o guia enquanto a primeira missão não foi aceita
  if (guide && mark === 'offer') {
    const k = (t * 1.2) % 1;
    g.strokeStyle = `rgba(255,211,77,${0.8 * (1 - k)})`; g.lineWidth = 3;
    g.beginPath(); g.ellipse(n.x, n.y + 6, 22 + k * 30, 9 + k * 12, 0, 0, Math.PI * 2); g.stroke();
    const ay = by - 16 + Math.sin(t * 5) * 4;
    g.fillStyle = '#ffd34d'; g.strokeStyle = 'rgba(60,35,0,0.9)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(n.x, ay + 9); g.lineTo(n.x - 8, ay - 3); g.lineTo(n.x + 8, ay - 3); g.closePath(); g.stroke(); g.fill();
  }
  if (near) drawPrompt(g, n.x, n.y + 22, 'Toque para conversar'); // sem tecla no texto (decisão 0016, V5); presa à área livre
}
