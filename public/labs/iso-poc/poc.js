// PoC isométrico (Fase 1). Isolado: não é importado por main.js. Usa a SIMULAÇÃO REAL do jogo em modo somente leitura
// (World, makeHeroActor, makeMobActor, regras de dano e skills) e só troca a camada visual por uma projeção isométrica.
import { World, makeHeroActor, makeMobActor } from '../../src/game/sim.js';
import { newCharacter } from '../../src/core/progression.js';
import { makeRng } from '../../src/core/rng.js';
import { CLASSES } from '../../src/data/classes.js';
import { SKILLS } from '../../src/data/skills.js';
import { makeIso, TILT_2_1, TILT_30, screenDirToWorld, facingSector, dirSector, sortByDepth } from './src/iso.js';
import { followStep, clampFocus, clampZoom } from './src/camera.js';
import { Animator, chooseClip, MAGE_CLIPS, SLIME_CLIPS } from './src/anim.js';
import { bakeAtlas, loadAtlas, drawFrame, atlasMiB } from './src/atlas.js';
import { drawMage, MAGE_FRAME, MAGE_PIVOT } from './src/sprites/rig-mage.js';
import { drawSlime, SLIME_FRAME, SLIME_PIVOT } from './src/sprites/rig-slime.js';
import { bakeOak, bakePine, bakeBush, bakeRock, bakeTuft, bakeFlower, drawSprite, glowSprite } from './src/props.js';
import { bakeGround } from './src/ground.js';
import { deathPose, hurtPulse, DEATH } from './src/death.js';
import { HERO_FX, HERO_ACTIONS, spawnVfx, stepVfx, drawVfx, drawVfxGround } from './src/vfx.js';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const params = new URLSearchParams(location.search);
const cfg = {
  tilt: params.get('tilt') === '30' ? TILT_30 : TILT_2_1,
  zoom: clampZoom(Number(params.get('zoom') ?? 1)),
  bake: Number(params.get('bake') ?? 1.5),
  dpr: Number(params.get('dpr') ?? Math.min(2, devicePixelRatio || 1)),
  mobs: Number(params.get('mobs') ?? 10),
  // ATENÇÃO (medido na Intel UHD): imageSmoothingQuality 'high' ou 'medium' derruba o jogo de ~84 para ~10 FPS em 1080p.
  // 'low' (bilinear) é o único viável; a nitidez vem de assar os sprites em resolução maior (bake), não do filtro.
  smooth: params.get('smooth') ?? 'low',
  off: new Set((params.get('off') ?? '').split(',').filter(Boolean)), // desliga partes do desenho para medir o custo de cada uma
  // ?hero=paladino|aprendiz|franco|sacerdote troca SÓ o visual do herói pelo atlas de miniatura (art-local/atlas-rig/, fora do Git).
  // A simulação continua sendo a do Mago (classe do jogo); `hsize` ajusta o tamanho do sprite (o quadro dos atlas é 128 lógico).
  hero: ['paladino', 'aprendiz', 'franco', 'sacerdote'].includes(params.get('hero')) ? params.get('hero') : null,
  hsize: Number(params.get('hsize') ?? 1.3),
  heroDir: params.get('herodir') ?? 'atlas-rig', // 'atlas' = versão com animação rígida (sem esqueleto)
};
const FIXED = 1 / 60;

const canvas = $('view'), g = canvas.getContext('2d');
let W = 0, H = 0;
function resize() {
  W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * cfg.dpr); canvas.height = Math.round(H * cfg.dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
}
addEventListener('resize', resize);

// ---------- estado ----------
// Classe REAL do jogo (data/classes.js) de cada herói: as skills 1-3, o ataque básico e a simulação são as dela. Só o visual muda.
const CLASS_BY_HERO = { paladino: 'warrior', aprendiz: 'mage', franco: 'archer', sacerdote: 'cleric' };
let cls = CLASSES.mage, SK = [];
let world, player, cam, iso, ground, mageAtlas, slimeAtlas, heroAtlas = null, heroClips = null;
const art = { oaks: [], pines: [], bushes: [], rocks: [], tufts: [], flowers: new Map() };
const decor = [];
const anims = new Map(), ghosts = [];
const vfx = []; // efeitos visuais dos heróis em miniatura (só desenho; a simulação não os conhece)
const keys = new Set(), mouse = { x: 0, y: 0, down: false };
let ox = 0, oy = 0, acc = 0, last = 0;
let pending = null, lastMoveDir = { x: 1, y: 1 }, vel = { x: 0, y: 0 }, prevPos = { x: 0, y: 0 }, respawnT = 0, reviveT = 0;
const stats = { fps: 0, simMs: 0, renderMs: 0, sprites: 0, particles: 0, projectiles: 0, actors: 0, atlasMiB: 0, propsMiB: 0, frames: 0 };
const poc = { keys, mouse, ready: false, stats, cfg, debugOrder: false, lastOrder: [], get world() { return world; }, get atlases() { return { mage: mageAtlas, slime: slimeAtlas, hero: heroAtlas }; }, get decor() { return decor; }, aimPoint: () => aimPoint(), startAction: (k, i) => startAction(k, i), get player() { return player; }, get iso() { return iso; }, get cam() { return cam; }, anims, vfx, holdVfx: false, spawnVfx: (k, o) => spawnVfx(vfx, k, o), HERO_FX };
window.poc = poc;

// ---------- montagem ----------
async function boot() {
  resize();
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  const t0 = performance.now();
  if (cfg.hero) {
    try {
      const base = `./art-local/${cfg.heroDir}/${cfg.hero}/`;
      const meta = await (await fetch(`${base}${cfg.hero}.json`)).json();
      heroAtlas = await loadAtlas(meta, Object.fromEntries(Object.keys(meta.clips).map((c) => [c, `${base}${c}.png`])));
      heroClips = meta.clips;
    } catch (e) { console.warn('atlas do herói indisponível, usando o mago:', e.message); cfg.hero = null; }
  }
  cls = CLASSES[cfg.hero ? CLASS_BY_HERO[cfg.hero] : 'mage'];
  buildHud();
  $('hp-name').textContent = `Aren · ${cls.name} Nv 8`;
  $('help-skills').textContent = cls.skills.map((k) => SKILLS[k].name).join(' / ');
  mageAtlas = bakeAtlas({ name: 'mage', frame: MAGE_FRAME, pivot: MAGE_PIVOT, clips: MAGE_CLIPS, draw: drawMage, scale: cfg.bake });
  slimeAtlas = bakeAtlas({ name: 'slime', frame: SLIME_FRAME, pivot: SLIME_PIVOT, clips: SLIME_CLIPS, draw: drawSlime, scale: cfg.bake });
  for (let v = 0; v < 4; v++) art.oaks.push(bakeOak(v, 3 + v));
  for (let v = 0; v < 2; v++) art.pines.push(bakePine(v, 5 + v));
  for (let v = 0; v < 3; v++) { art.bushes.push(bakeBush(v, 9 + v)); art.rocks.push(bakeRock(v, 11 + v)); art.tufts.push(bakeTuft(v)); }

  world = new World('forest', { seed: 11 });
  const rng = makeRng(7);
  const char = newCharacter('Aren', cls.id, rng); char.level = 8;
  player = world.add(makeHeroActor(char, 700, 950));
  cam = { x: player.x, y: player.y }; prevPos = { x: player.x, y: player.y };
  for (let i = 0; i < cfg.mobs; i++) spawnSlime();
  buildDecor();
  ground = bakeGround(world);
  iso = makeIso({ tilt: cfg.tilt, scale: cfg.zoom }); // o 1º passo da simulação já usa a projeção (mira); sem isto, um 1º quadro lento quebrava com iso indefinido
  const props = [...art.oaks, ...art.pines, ...art.bushes, ...art.rocks, ...art.tufts, ...art.flowers.values()];
  stats.atlasMiB = +(((heroAtlas ?? mageAtlas).bytes + slimeAtlas.bytes) / 1048576).toFixed(1);
  stats.propsMiB = +(props.reduce((s, p) => s + p.bytes, 0) / 1048576 + (ground.width * ground.height * 4) / 1048576).toFixed(1);
  stats.bakeMs = Math.round(performance.now() - t0);
  poc.ready = true;
  $('loading').remove();
  last = performance.now();
  requestAnimationFrame(frame);
}

function spawnSlime() {
  const pt = world.freePoint([player], 300);
  if (!pt) return;
  const m = world.add(makeMobActor('slime', 3, pt.x, pt.y));
  return m;
}

function buildDecor() {
  const pick = (arr, v) => arr[Math.floor(v * arr.length) % arr.length];
  for (const d of world.layout.decor) {
    let spr = null, size = 1, sh = 0;
    switch (d.type) {
      case 'tree': spr = pick(art.oaks, d.v); size = (d.s / 34) * 0.62; sh = d.s * 0.8; break;
      case 'pine': spr = pick(art.pines, d.v); size = (d.s / 34) * 0.62; sh = d.s * 0.65; break;
      case 'bush': spr = pick(art.bushes, d.v); size = d.s / 15; sh = d.s * 0.8; break;
      case 'rock': spr = pick(art.rocks, d.v); size = d.s / 16; sh = d.s * 0.8; break;
      case 'stump': spr = art.rocks[2]; size = d.s / 24; sh = d.s * 0.6; break;
      case 'fern': case 'mushrooms': spr = pick(art.tufts, d.v); size = d.s / 14; break;
      default: continue; // tipos que a Vila/Ruínas usam ainda não têm arte neste PoC
    }
    decor.push({ kind: d.type, spr, size, x: d.x, y: d.y, depth: d.x + d.y, sh });
  }
  for (const d of world.layout.ground) {
    let spr;
    if (d.type === 'flower') { if (!art.flowers.has(d.color)) art.flowers.set(d.color, bakeFlower(d.color)); spr = art.flowers.get(d.color); } else spr = art.tufts[Math.floor(d.x * 7 + d.y) % 3];
    decor.push({ kind: d.type, spr, size: (d.s ?? 1) * 0.95, x: d.x, y: d.y, depth: d.x + d.y, sh: 0 });
  }
}

// ---------- entrada ----------
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (!keys.has(k)) {
    if (k === 't') cfg.tilt = cfg.tilt === TILT_2_1 ? TILT_30 : TILT_2_1;
    if (k === '+' || k === '=') cfg.zoom = clampZoom(cfg.zoom * 1.1);
    if (k === '-') cfg.zoom = clampZoom(cfg.zoom / 1.1);
    if (['1', '2', '3'].includes(k)) startAction('skill', Number(k) - 1);
    if (k === ' ') e.preventDefault();
  }
  keys.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); mouse.down = false; });
canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY; startAction('attack'); } }); // por evento: um clique rápido nunca se perde em FPS baixo
addEventListener('mouseup', () => { mouse.down = false; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cfg.zoom = clampZoom(cfg.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Mira: se o cursor está sobre o sprite de um inimigo, mira nos PÉS dele (corrige o ponto "atrás" que o tronco alto causaria).
function aimPoint() {
  for (const a of world.actors) {
    if (a.kind !== 'mob' || a.dead) continue;
    const s = iso.toScreen(a.x, a.y), sx = s.x + ox, sy = s.y + oy, z = cfg.zoom;
    if (Math.abs(mouse.x - sx) < 34 * z && mouse.y > sy - 64 * z && mouse.y < sy + 10 * z) return { x: a.x, y: a.y, onEnemy: true };
  }
  const w = iso.toWorld(mouse.x - ox, mouse.y - oy);
  return { x: w.x, y: w.y, onEnemy: false };
}
function moveDir() {
  const dx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const dy = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
  return dx || dy ? screenDirToWorld(dx, dy, cfg.tilt) : { x: 0, y: 0 };
}

// Ação do jogador: a ANIMAÇÃO começa na hora e o comando só vai para a simulação no quadro de disparo do clipe.
// Assim projétil, dano e recarga acontecem junto do golpe visual, sem alterar a simulação (ver doc, decisão "hitAt").
function startAction(kind, idx = 0) {
  if (!player || player.dead || pending) return;
  const st = anims.get(player.id);
  if (!st) return;
  if (kind === 'skill') { if (player.cds['s' + idx] > 0) return; } else if (player.cds.basic > 0) return;
  // skills de movimento (Investida, Rolamento: kind 'dash' em data/skills.js) usam o clipe próprio 'dash', se o atlas tiver
  const isDash = kind === 'skill' && SKILLS[cls.skills[idx]]?.kind === 'dash' && heroClips?.dash;
  const clip = kind === 'skill' ? (isDash ? 'dash' : 'skill') : 'attack';
  st.anim.play(clip, true);
  const c = (heroClips ?? MAGE_CLIPS)[clip];
  pending = { kind, idx, at: performance.now() / 1000 + c.release / c.fps };
}

// ---------- simulação (passo fixo) ----------
function simStep() {
  const md = moveDir();
  if (md.x || md.y) lastMoveDir = md;
  const aim = aimPoint();
  const intent = { mx: md.x, my: md.y, aimX: aim.x, aimY: aim.y, attack: false, cast: null };
  if (pending && performance.now() / 1000 >= pending.at) {
    if (pending.kind === 'skill') intent.cast = pending.idx; else intent.attack = true;
    if (cfg.hero) spawnActionVfx(pending, aim);
    pending = null;
  }
  const t0 = performance.now();
  world.update(FIXED, { [player.id]: intent });
  stats.simMs += (performance.now() - t0 - stats.simMs) * 0.05;
  for (const e of world.events) if (e.type === 'cast') casts.add(e.actor.id);
  world.events.length = 0;
}
const casts = new Set();
// Efeito visual da ação (golpe ou skill) na cor da skill real; só desenho, nasce no quadro de disparo.
function spawnActionVfx(pk, aim) {
  const f = HERO_FX[cfg.hero], isSkill = pk.kind === 'skill', sk = isSkill ? SKILLS[cls.skills[pk.idx]] : null;
  const kind = HERO_ACTIONS[cfg.hero][isSkill ? pk.idx + 1 : 0];
  const ang = Math.atan2(aim.y - player.y, aim.x - player.x);
  let x = player.x, y = player.y, len = sk?.dist ?? 200;
  if (kind === 'rain') { const d = Math.min(Math.hypot(aim.x - player.x, aim.y - player.y), sk.range); x = player.x + Math.cos(ang) * d; y = player.y + Math.sin(ang) * d; }
  spawnVfx(vfx, kind, { x, y, ang, big: isSkill, color: sk?.color ?? f.color, core: f.core, r: sk?.radius ?? 100, len, life: kind === 'rain' ? sk.ticks * sk.interval + 0.5 : undefined });
}

function gameLogic(dt) {
  if (player.dead) { reviveT += dt; if (reviveT > (cfg.hero ? DEATH.total + 0.15 : 2.2)) { if (cfg.hero) spawnVfx(vfx, 'aura', { x: player.x, y: player.y, color: '#9dffd8', core: '#ffffff' }); player.dead = false; player.deadT = 0; player.hp = player.maxHp; reviveT = 0; anims.get(player.id)?.anim.play('idle', true); } }
  if (!pending && !player.dead && (mouse.down)) startAction('attack');
  const alive = world.actors.filter((a) => a.kind === 'mob' && !a.dead).length;
  respawnT += dt;
  if (alive < Math.ceil(cfg.mobs / 2) && respawnT > 1.2) { respawnT = 0; spawnSlime(); }
}

// ---------- animação a partir do estado da simulação ----------
function stateFor(a) {
  let st = anims.get(a.id);
  if (!st) {
    st = a.kind === 'player'
      ? { atlas: heroAtlas ?? mageAtlas, anim: new Animator(heroClips ?? MAGE_CLIPS), names: { move: 'walk', attack: 'attack', skill: 'skill', dash: heroClips?.dash ? 'dash' : null, death: null }, view: 0, prevSwing: 0, prevFlash: 0, size: heroAtlas ? cfg.hsize : 1, a }
      : { atlas: slimeAtlas, anim: new Animator(SLIME_CLIPS), names: { move: 'move', attack: 'attack', skill: null, death: 'death' }, view: 0, prevSwing: 0, prevFlash: 0, size: 1, a };
    anims.set(a.id, st);
  }
  return st;
}
function updateAnim(a, st, dt, seen) {
  seen.add(a.id);
  const sw = a.swing > st.prevSwing + 1e-4, flash = a.hitFlash > 0 && st.prevFlash <= 0;
  st.prevSwing = a.swing; st.prevFlash = a.hitFlash;
  const isPlayer = a.kind === 'player';
  const sig = { dead: a.dead, moving: a.moving, hurt: flash, attackStart: !isPlayer && sw && !casts.has(a.id), skillStart: false };
  // jogador: a ação foi iniciada localmente (startAction); aqui só cuidamos de andar/parar/ferido/morte
  if (cfg.hero && !isPlayer && flash) { const f = HERO_FX[cfg.hero]; spawnVfx(vfx, 'impact', { x: a.x, y: a.y, z: 26, color: f.color, core: f.core }); }
  if (cfg.hero && isPlayer) { // morte e dano do herói: sem texturas novas (ver src/death.js)
    if (a.dead) { if (!st.deadT) { st.anim.play('hit', true); st.dust = false; st.soul = false; } st.deadT = (st.deadT ?? 0) + dt; } else st.deadT = 0;
    if (flash && !a.dead) { st.hurtT = 0; const f = HERO_FX[cfg.hero]; spawnVfx(vfx, 'impact', { x: a.x, y: a.y, z: 30, color: '#ff6a6a', core: '#ffffff' }); } else if (st.hurtT !== undefined) st.hurtT += dt;
  }
  chooseClip(st.anim, sig, st.names);
  st.anim.update(dt);
  if (isPlayer && st.anim.finished && (st.anim.name === 'attack' || st.anim.name === 'skill' || st.anim.name === 'dash')) st.anim.play(a.moving ? 'walk' : 'idle', true);
  const acting = st.anim.name === 'attack' || st.anim.name === 'skill' || st.anim.name === 'dash';
  if (!isPlayer) st.view = facingSector(a.facing, cfg.tilt);
  else if (acting) st.view = facingSector(a.facing, cfg.tilt); // lançando: olha para a mira
  else if (a.moving) st.view = dirSector(lastMoveDir.x, lastMoveDir.y, cfg.tilt); // andando: olha para onde anda
}

// ---------- desenho ----------
function drawEntity(it) {
  const s = iso.toScreen(it.x, it.y), x = s.x + ox, y = s.y + oy;
  if (it.sprite) { drawSprite(g, it.sprite, x, y, it.size * cfg.zoom); return; }
  const st = it.st;
  if (cfg.hero && st.deadT > 0 && it.kind === 'player') { // morto: o sprite tomba em torno dos pés, amassa e esmaece
    const side = st.view >= 1 && st.view <= 3 ? -1 : 1, P = deathPose(st.deadT, side), z = cfg.zoom * st.size;
    if (P.impact && !st.dust) { st.dust = true; spawnVfx(vfx, 'nova', { x: it.x, y: it.y, color: '#d9d2c0', core: '#ffffff', r: 46, life: 0.4 }); spawnVfx(vfx, 'impact', { x: it.x, y: it.y, z: 8, color: '#d9d2c0', core: '#ffffff' }); }
    if (st.deadT > DEATH.recoil + DEATH.fall + DEATH.lie && !st.soul) { st.soul = true; spawnVfx(vfx, 'pray', { x: it.x, y: it.y, color: HERO_FX[cfg.hero].color, core: HERO_FX[cfg.hero].core }); }
    g.save(); g.translate(x, y); g.rotate(P.rot); g.scale(1, P.squash); g.globalAlpha = P.alpha;
    drawFrame(g, st.atlas, st.anim.name, st.view, st.anim.frame, 0, 0, z, 1);
    g.restore();
    return;
  }
  drawFrame(g, st.atlas, st.anim.name, st.view, st.anim.frame, x, y, st.size * cfg.zoom, it.alpha ?? 1);
}

function render(dt, now) {
  const t0 = performance.now();
  iso = makeIso({ tilt: cfg.tilt, scale: cfg.zoom });
  const cs = iso.toScreen(cam.x, cam.y);
  ox = W / 2 - cs.x; oy = H / 2 - cs.y;
  const z = world.zone;
  g.setTransform(cfg.dpr, 0, 0, cfg.dpr, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = cfg.smooth;
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1d2d3d'); bg.addColorStop(1, '#101a26'); g.fillStyle = bg; g.fillRect(0, 0, W, H);

  // chão projetado (plano) + borda com espessura para dar profundidade
  if (!cfg.off.has('ground')) { g.save(); g.translate(ox, oy); g.transform(...iso.matrix(), 0, 0); g.drawImage(ground, 0, 0); g.restore(); }
  const Wc = iso.toScreen(0, z.h), Sc = iso.toScreen(z.w, z.h), Ec = iso.toScreen(z.w, 0), th = 46 * cfg.zoom;
  for (const [a, b, c1, c2] of [[Wc, Sc, '#7a5a3c', '#3b2a22'], [Sc, Ec, '#5e4430', '#2c1f1a']]) {
    const gr = g.createLinearGradient(0, a.y + oy, 0, a.y + oy + th); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    g.beginPath(); g.moveTo(a.x + ox, a.y + oy); g.lineTo(b.x + ox, b.y + oy); g.lineTo(b.x + ox, b.y + oy + th); g.lineTo(a.x + ox, a.y + oy + th); g.closePath(); g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.stroke();
  }

  // ---- lista de desenho: cenário visível + atores + fantasmas (monstros mortos cuja animação ainda não terminou) ----
  const m = 340 * cfg.zoom, items = [];
  const vis = (wx, wy) => { const s = iso.toScreen(wx, wy); const sx = s.x + ox, sy = s.y + oy; return sx > -m && sx < W + m && sy > -m && sy < H + m * 0.6; };
  for (const d of decor) if (vis(d.x, d.y)) items.push({ kind: d.kind, x: d.x, y: d.y, depth: d.depth, sprite: d.spr, size: d.size, sh: d.sh });
  const seen = new Set();
  for (const a of world.actors) {
    if (a.kind === 'spirit') continue;
    const st = stateFor(a);
    updateAnim(a, st, dt, seen);
    st.lastPos = { x: a.x, y: a.y };
    if (vis(a.x, a.y)) items.push({ kind: a.kind, id: a.id, x: a.x, y: a.y, depth: a.x + a.y, st, r: a.r });
  }
  for (const [id, st] of anims) {
    if (seen.has(id)) continue;
    if (st.anim.name === 'death' && !st.anim.finished && st.lastPos) { st.anim.update(dt); items.push({ kind: 'ghost', id, x: st.lastPos.x, y: st.lastPos.y, depth: st.lastPos.x + st.lastPos.y, st, r: 14 }); }
    else if (st.anim.name === 'death' && st.anim.finished && st.lastPos) { st.fade = (st.fade ?? 1) - dt * 2; if (st.fade > 0) items.push({ kind: 'ghost', id, x: st.lastPos.x, y: st.lastPos.y, depth: st.lastPos.x + st.lastPos.y, st, r: 14, alpha: st.fade }); else anims.delete(id); }
    else anims.delete(id);
  }
  casts.clear();
  sortByDepth(items);
  if (poc.debugOrder) poc.lastOrder = items.map((i) => ({ kind: i.kind, id: i.id, x: i.x, y: i.y, depth: i.depth }));

  // ---- plano do chão: sombras e efeitos de área, tudo no sistema de coordenadas do mundo ----
  g.save(); g.translate(ox, oy); g.transform(...iso.matrix(), 0, 0);
  for (const it of items) {
    const R = it.sh ?? (it.r ? it.r * 1.15 : 0);
    if (!R) continue;
    g.beginPath(); g.ellipse(it.x + R * 0.35, it.y + R * 0.1, R, R * 0.85, 0, 0, TAU); g.fillStyle = it.kind === 'tree' || it.kind === 'pine' ? 'rgba(10,30,30,0.28)' : 'rgba(10,30,30,0.32)'; g.fill();
  }
  for (const f of world.fx) {
    const k = f.t / f.life;
    if (f.type === 'ring') {
      const r = f.r * (0.25 + 0.75 * Math.sqrt(k));
      const gr = g.createRadialGradient(f.x, f.y, r * 0.55, f.x, f.y, r); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, f.color + 'aa');
      g.globalAlpha = 1 - k; g.beginPath(); g.arc(f.x, f.y, r, 0, TAU); g.fillStyle = gr; g.fill();
      g.lineWidth = 5 * (1 - k) + 1; g.strokeStyle = f.color; g.stroke(); g.globalAlpha = 1;
    } else if (f.type === 'slash') {
      g.globalAlpha = (1 - k) * 0.55; g.beginPath(); g.moveTo(f.x, f.y); g.arc(f.x, f.y, f.r, f.ang - f.arc / 2, f.ang + f.arc / 2); g.closePath(); g.fillStyle = f.color; g.fill(); g.globalAlpha = 1;
    }
  }
  if (cfg.hero) drawVfxGround(g, vfx);
  g.restore();

  // ---- sprites em pé, de trás para a frente ----
  if (!cfg.off.has('sprites')) for (const it of items) drawEntity(it);
  stats.sprites = items.length;
  if (cfg.hero) { if (!poc.holdVfx) stepVfx(vfx, dt); drawVfx({ g, glow: glowSprite, sprite: drawSprite, iso, ox, oy, zoom: cfg.zoom }, vfx); }

  // ---- projéteis, partículas e textos (acima de tudo) ----
  g.globalCompositeOperation = 'lighter';
  for (const p of world.projectiles) {
    if (p.dead) continue;
    const s = iso.toScreen(p.x, p.y, 38), x = s.x + ox, y = s.y + oy, R = (p.radius + 6) * cfg.zoom;
    const pc = p.color;
    drawSprite(g, glowSprite(pc), x, y, R * 0.07 * 4, 0.9);
    drawSprite(g, glowSprite(pc), x, y, R * 0.07 * 2, 1);
    drawSprite(g, glowSprite('#fff4d8'), x, y, R * 0.07 * 0.9, 0.85);
  }
  for (const p of world.particles) {
    if (p.streak) continue;
    const k = p.life / p.max, s = iso.toScreen(p.x, p.y, 16 + (1 - k) * 26), x = s.x + ox, y = s.y + oy;
    drawSprite(g, glowSprite(p.color), x, y, Math.max(0.12, p.size * 0.075) * cfg.zoom * (0.6 + k * 0.6), Math.min(1, k * 1.4));
  }
  // luzes ambiente flutuando (vagalumes)
  for (let i = 0; i < (cfg.off.has('fly') ? 0 : 26); i++) {
    const a = i * 2.399, wx = cam.x + Math.cos(a * 3 + now * 0.00007 * (1 + (i % 4))) * 520, wy = cam.y + Math.sin(a * 2 + now * 0.00006 * (1 + (i % 3))) * 380;
    const s = iso.toScreen(wx, wy, 24 + 30 * Math.sin(now * 0.0011 + i)), tw = 0.35 + 0.65 * Math.max(0, Math.sin(now * 0.002 + i * 1.7));
    drawSprite(g, glowSprite(i % 3 ? '#f3ffb0' : '#9ff3ff'), s.x + ox, s.y + oy, 0.2 * cfg.zoom, tw);
  }
  g.globalCompositeOperation = 'source-over';
  stats.particles = world.particles.length; stats.projectiles = world.projectiles.length; stats.actors = world.actors.length;
  for (const t of world.texts) {
    const y0 = t.y + 38 * t.t, s = iso.toScreen(t.x, y0, 78), k = t.t / t.life;
    g.save(); g.translate(s.x + ox, s.y + oy - k * 34 * cfg.zoom); g.globalAlpha = 1 - Math.max(0, (k - 0.6) / 0.4);
    const pop = k < 0.12 ? 1 + (0.12 - k) * 4 : 1; g.scale(pop, pop);
    g.font = `800 ${Math.round(t.size * cfg.zoom)}px Nunito, system-ui, sans-serif`; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = 'rgba(20,20,40,0.85)'; g.strokeText(t.text, 0, 0);
    g.fillStyle = t.color; g.fillText(t.text, 0, 0); g.restore();
  }

  // ---- classificação de cor e vinheta (em tela) ----
  if (!cfg.off.has('grade')) {
  const warm = g.createLinearGradient(0, 0, W, H); warm.addColorStop(0, 'rgba(255,214,150,0.10)'); warm.addColorStop(0.55, 'rgba(255,200,150,0)'); warm.addColorStop(1, 'rgba(20,40,110,0.20)');
  g.fillStyle = warm; g.fillRect(0, 0, W, H);
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.78); vg.addColorStop(0, 'rgba(6,14,20,0)'); vg.addColorStop(1, 'rgba(6,14,20,0.5)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  if (cfg.hero) { // dano recebido e morte: vinheta vermelha
    const ps = anims.get(player.id), k = Math.max(ps?.hurtT !== undefined ? hurtPulse(ps.hurtT) : 0, ps?.deadT > 0 ? Math.min(0.6, ps.deadT * 1.2) : 0);
    if (k > 0.01) { const rg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72); rg.addColorStop(0, 'rgba(200,20,30,0)'); rg.addColorStop(1, `rgba(200,20,30,${(0.55 * k).toFixed(3)})`); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
  }
  stats.renderMs += (performance.now() - t0 - stats.renderMs) * 0.05;
}

// ---------- HUD (DOM) ----------
function buildHud() {
  SK = [{ id: 'basic', key: 'Clique', icon: cls.icon, name: 'Ataque' }, ...cls.skills.map((s, i) => ({ id: 's' + i, key: String(i + 1), icon: SKILLS[s].icon, name: SKILLS[s].name, cd: SKILLS[s].cd }))];
  $('hud-skills').innerHTML = SK.map((s) => `<div class="slot" id="sl-${s.id}"><span class="ic">${s.icon}</span><span class="key">${s.key}</span><i class="cd"></i><b class="cdt"></b></div>`).join('');
}
function updateHud() {
  const p = player;
  $('hp-fill').style.width = `${(100 * Math.max(0, p.hp)) / p.maxHp}%`;
  $('hp-text').textContent = `${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`;
  const max = { basic: cls.basic.cd / p.stats.atkSpeed };
  cls.skills.forEach((s, i) => { max['s' + i] = SKILLS[s].cd; });
  for (const s of SK) {
    const cd = p.cds[s.id] ?? 0, el = $('sl-' + s.id);
    el.style.setProperty('--p', cd > 0 ? Math.min(1, cd / max[s.id]).toFixed(3) : '0');
    el.querySelector('.cdt').textContent = cd > 0.05 && s.id !== 'basic' ? cd.toFixed(cd < 1 ? 1 : 0) : '';
  }
  $('hud-stats').innerHTML = `FPS <b>${stats.fps.toFixed(0)}</b> · simulação <b>${stats.simMs.toFixed(2)} ms</b> · desenho <b>${stats.renderMs.toFixed(2)} ms</b><br>`
    + `sprites <b>${stats.sprites}</b> · atores <b>${stats.actors}</b> · partículas <b>${stats.particles}</b> · projéteis <b>${stats.projectiles}</b><br>`
    + `texturas <b>${stats.atlasMiB} MiB</b> (heróis/monstros) + <b>${stats.propsMiB} MiB</b> (cenário) · assado em <b>${stats.bakeMs} ms</b><br>`
    + `projeção <b>${cfg.tilt === TILT_2_1 ? '2:1' : '30°'}</b> · zoom <b>${cfg.zoom.toFixed(2)}×</b> · DPR <b>${cfg.dpr}</b> · bake <b>${cfg.bake}×</b>`;
}

// ---------- laço ----------
let hudT = 0, fpsAcc = 0, fpsN = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  fpsAcc += dt; fpsN++; if (fpsAcc >= 0.5) { stats.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  gameLogic(dt);
  acc += dt;
  let steps = 0;
  while (acc >= FIXED && steps < 5) { simStep(); acc -= FIXED; steps++; }
  if (steps === 5) acc = 0;
  // velocidade do jogador para a antecipação da câmera
  vel.x += ((player.x - prevPos.x) / Math.max(dt, 1e-3) - vel.x) * Math.min(1, dt * 10); vel.y += ((player.y - prevPos.y) / Math.max(dt, 1e-3) - vel.y) * Math.min(1, dt * 10);
  prevPos = { x: player.x, y: player.y };
  followStep(cam, player, vel, dt); clampFocus(cam, world.zone, 360);
  render(dt, now);
  stats.frames++;
  hudT += dt; if (hudT > 0.1) { hudT = 0; updateHud(); }
  requestAnimationFrame(frame);
}

boot();
