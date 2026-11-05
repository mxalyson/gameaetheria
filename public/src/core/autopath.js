// Guia de missões e auto-viagem: regras PURAS (sem DOM nem canvas), testadas em tests/autopath.test.js.
//  1) alvo da missão (NPC, chefe, área de monstros, baú...) a partir do documento do personagem e dos dados de zona;
//  2) rota entre zonas (WORLD_ROUTE + portais);
//  3) grade de navegação sobre os obstáculos do layout (rios com pontes, árvores, casas) e A* com suavização do caminho.
// O jogo só entrega o caminho como INTENÇÃO de movimento (mx, my), igual ao joystick: nada de teleporte, a colisão da simulação continua valendo.
import { ZONES, WORLD_ROUTE } from '../data/zones.js';
import { QUESTS } from '../data/quests.js';
import { isComplete, questGiverId, chestReady, masterNpcId, mentorSeen } from './journal.js';
import { mentorsOfClass } from '../data/mentors.js';

export const NAV_CELL = 32;     // lado da célula da grade (px do mundo)
export const NAV_CLEARANCE = 24; // folga em volta dos obstáculos: raio do herói (15) + margem
export const ARRIVE = { npc: 58, chest: 46, area: 110, boss: 140, portal: 14, spot: 60 }; // distância (px) em que a viagem para

const FARM = ['forest', 'plains', 'ruins', 'glacier', 'ember'];
const hypot = Math.hypot;

// ---------------------------------------------------------------- alvos de missão
// Zona onde fica um NPC (cidades). null se não existir.
export function npcZone(npcId) {
  for (const [id, z] of Object.entries(ZONES)) if (z.npcs?.some((n) => n.id === npcId)) return id;
  return null;
}
const npcTarget = (npcId, why) => {
  const zone = npcZone(npcId); if (!zone) return null;
  const n = ZONES[zone].npcs.find((x) => x.id === npcId);
  return { kind: 'npc', zone, x: n.x, y: n.y, reach: ARRIVE.npc, npcId, label: n.name, why };
};
const resolveRole = (doc, role) => (role === 'master' ? masterNpcId(doc.classId) : role);

// Zona de caça apropriada ao nível (a atual, se o nível couber nela; senão a mais forte que o nível já alcança).
export function farmZoneForLevel(level, here = null) {
  const fits = (id) => ZONES[id].level[0] <= level + 1 && level <= Math.max(ZONES[id].level[1], ZONES[id].scale ? 30 : 0);
  if (here && FARM.includes(here) && fits(here)) return here;
  let best = 'forest';
  for (const id of FARM) if (ZONES[id].level[0] <= level) best = id;
  return best;
}

// Zona de caça que tem o monstro `mobId` (soltos ou em acampamento): a atual, senão a de nível mais próximo do do herói. null se nenhuma tem.
export function zoneWithMob(mobId, level, here = null) {
  const has = (id) => (ZONES[id].mobs ?? []).some(([m]) => m === mobId) || (ZONES[id].camps ?? []).some((c) => [...c.mobs, ...(c.elites ?? [])].some(([m]) => m === mobId));
  if (here && FARM.includes(here) && has(here)) return here;
  const mid = (id) => (ZONES[id].level[0] + ZONES[id].level[1]) / 2;
  return FARM.filter(has).sort((a, b) => Math.abs(mid(a) - level) - Math.abs(mid(b) - level))[0] ?? null;
}

// Centro da área onde vivem os monstros pedidos: o acampamento que mais os tem; sem acampamento, o meio do mapa (lá nascem os soltos).
export function mobArea(zoneId, mobId = 'any') {
  const z = ZONES[zoneId];
  let best = null, bn = 0;
  for (const c of z.camps ?? []) {
    if (c.glade) continue;
    const n = [...c.mobs, ...(c.elites ?? [])].reduce((t, [id, k]) => t + (mobId === 'any' || id === mobId ? k : 0), 0);
    if (n > bn) { bn = n; best = c; }
  }
  if (mobId !== 'any' && !best && !(z.mobs ?? []).some(([id]) => id === mobId)) return null;
  if (best && mobId !== 'any') return { x: best.x, y: best.y };
  const mid = z.h / 2;
  return { x: Math.round(z.w * 0.4), y: Math.round(mid) };
}

const bossZone = (mobId) => Object.entries(ZONES).find(([, z]) => z.boss?.id === mobId)?.[0] ?? null;

// Alvo da missão `qid` para o personagem `doc`. ctx: { zoneId, x, y } (onde o herói está, para escolher o baú mais perto).
// Devolve { kind, zone, x, y, reach, label, why, ... } ou { kind:'none', why } quando o objetivo não tem lugar (nível, habilidade...).
export function questTarget(doc, qid, ctx = {}) {
  const q = QUESTS[qid];
  if (!q) return null;
  const active = doc.quests?.active?.[qid];
  if (!active) return npcTarget(questGiverId(doc, q), 'Falar com o NPC da missão') ?? { kind: 'none', why: 'Falar com o NPC da missão' };
  if (isComplete(doc, qid)) return npcTarget(resolveRole(doc, q.turnIn ?? q.giver), 'Entregar a missão') ?? { kind: 'none', why: 'Entregar a missão' };
  const i = q.objectives.findIndex((o, k) => (active.p[k] ?? 0) < (o.count ?? 1));
  const o = q.objectives[i];
  const none = (why) => ({ kind: 'none', why: why ?? o.label });
  const area = (zone, mob, label) => {
    const a = mobArea(zone, mob);
    return a ? { kind: 'area', zone, x: a.x, y: a.y, reach: ARRIVE.area, label, why: o.label } : none();
  };
  switch (o.type) {
    case 'kill': {
      const zone = o.zone !== 'any' ? o.zone : o.mob === 'any' ? farmZoneForLevel(doc.level, ctx.zoneId) : zoneWithMob(o.mob, doc.level, ctx.zoneId);
      if (!zone) return none();
      return area(zone, o.mob, `Caçar em ${ZONES[zone].name}`);
    }
    case 'spiritKill': return area(farmZoneForLevel(doc.level, ctx.zoneId), 'any', 'Caçar com o spirit');
    case 'boss': {
      const zone = bossZone(o.mob); if (!zone) return none();
      const b = ZONES[zone].boss;
      return { kind: 'boss', zone, x: b.x, y: b.y, reach: ARRIVE.boss, label: `Chefe de ${ZONES[zone].name}`, why: o.label };
    }
    case 'miniboss': {
      const zone = o.zone && o.zone !== 'any' && ZONES[o.zone]?.miniboss ? o.zone : ZONES[ctx.zoneId]?.miniboss ? ctx.zoneId : FARM.filter((id) => ZONES[id].miniboss && ZONES[id].level[0] <= doc.level).pop() ?? 'forest';
      const m = ZONES[zone].miniboss;
      return { kind: 'boss', zone, x: m.x, y: m.y, reach: ARRIVE.boss, label: m.name, why: o.label };
    }
    case 'chest': {
      const zone = o.zone === 'any' ? farmZoneForLevel(doc.level, ctx.zoneId) : o.zone;
      const list = (ZONES[zone].chests ?? []).filter((c) => chestReady(doc, c.id));
      const from = ctx.zoneId === zone && ctx.x != null ? ctx : { x: 0, y: ZONES[zone].h / 2 };
      const c = (list.length ? list : ZONES[zone].chests ?? []).slice().sort((a, b) => hypot(a.x - from.x, a.y - from.y) - hypot(b.x - from.x, b.y - from.y))[0];
      return c ? { kind: 'chest', zone, x: c.x, y: c.y, reach: ARRIVE.chest, label: 'Baú', chestId: c.id, why: o.label } : none();
    }
    case 'spirit': case 'spiritStage': return npcTarget('sage', o.label) ?? none();
    case 'upgrade': return npcTarget('smith', o.label) ?? none();
    case 'bank': return npcTarget('banker', o.label) ?? none();
    case 'daily': return npcTarget('hunter', o.label) ?? none();
    case 'pvp': case 'coop': return npcTarget('arena', o.label) ?? none();
    case 'friendlyDuel': return npcTarget('duelist', o.label) ?? none();
    case 'talk': {
      const mine = mentorsOfClass(doc.classId).filter((m) => !mentorSeen(doc, m.id));
      return (mine.length ? npcTarget(mine[0].id, o.label) : null) ?? none();
    }
    default: return none(o.label); // level, skillUse, teleport, crypt: sem lugar fixo
  }
}

// Linha curta do rastreador: "Nome · objetivo 2/5". Devolve { name, text, done } (ou null sem missão).
export function trackerText(doc, qid) {
  const q = QUESTS[qid], a = doc.quests?.active?.[qid];
  if (!q) return null;
  if (!a) return { name: q.name, text: 'Falar com o NPC da missão', done: false };
  if (isComplete(doc, qid)) return { name: q.name, text: 'Entregue a missão', done: true };
  const i = q.objectives.findIndex((o, k) => (a.p[k] ?? 0) < (o.count ?? 1));
  const o = q.objectives[i];
  return { name: q.name, text: `${o.label} (${a.p[i] ?? 0}/${o.count ?? 1})`, done: false };
}

// Missão rastreada: a escolhida (se ainda ativa); senão a primeira pronta para entregar; senão a primeira ativa. null sem missões.
export function pickTracked(doc, chosen = null) {
  const ids = Object.keys(doc.quests?.active ?? {}).filter((id) => QUESTS[id]);
  if (chosen && ids.includes(chosen)) return chosen;
  return ids.find((id) => isComplete(doc, id)) ?? ids[0] ?? null;
}

// ---------------------------------------------------------------- rota entre zonas
// Lista de zonas de `from` até `to` (inclusive) seguindo WORLD_ROUTE; a Cripta sai pela Vila. null se alguma não está na rota.
export function zoneRoute(from, to) {
  const norm = (id) => (id === 'crypt' ? 'town' : id);
  const a = WORLD_ROUTE.indexOf(norm(from)), b = WORLD_ROUTE.indexOf(norm(to));
  if (a < 0 || b < 0) return null;
  const out = [];
  for (let i = a; i !== b; i += a < b ? 1 : -1) out.push(WORLD_ROUTE[i]);
  out.push(WORLD_ROUTE[b]);
  if (from === 'crypt') out.unshift('crypt');
  return out;
}

// Para onde andar agora, dada a zona atual e o alvo: o ponto do alvo (mesma zona) ou o portal rumo à zona seguinte da rota.
// Devolve { x, y, reach, portal: bool, nextZone, hops } ou null (sem rota).
export function guideGoal(target, zoneId) {
  if (!target || target.kind === 'none') return null;
  if (target.zone === zoneId) return { x: target.x, y: target.y, reach: target.reach, portal: false, nextZone: null, hops: 0 };
  const route = zoneRoute(zoneId, target.zone);
  if (!route || route.length < 2) return null;
  const next = route[1], p = ZONES[zoneId]?.portals?.find((q) => q.to === next);
  if (!p) return null;
  return { x: p.x, y: p.y, reach: ARRIVE.portal, portal: true, nextZone: next, hops: route.length - 1 };
}

// ---------------------------------------------------------------- grade de navegação e A*
const navCache = new Map();

// Grade de células livres para o herói (true = bloqueada). `layout.obstacles`: círculos {x,y,r} e retângulos {x,y,w,h}, os mesmos da colisão.
export function buildNavGrid(zoneId, zone, layout, clearance = NAV_CLEARANCE, cell = NAV_CELL) {
  const key = `${zoneId}:${cell}:${clearance}`;
  const hit = navCache.get(key);
  if (hit && hit.layout === layout) return hit.grid;
  const cols = Math.ceil(zone.w / cell), rows = Math.ceil(zone.h / cell);
  const blocked = new Uint8Array(cols * rows);
  const cx = (i) => (i + 0.5) * cell;
  for (const o of layout.obstacles) {
    const x0 = o.w ? o.x - clearance : o.x - o.r - clearance, x1 = o.w ? o.x + o.w + clearance : o.x + o.r + clearance;
    const y0 = o.w ? o.y - clearance : o.y - o.r - clearance, y1 = o.w ? o.y + o.h + clearance : o.y + o.r + clearance;
    const i0 = Math.max(0, Math.floor(x0 / cell)), i1 = Math.min(cols - 1, Math.floor(x1 / cell));
    const j0 = Math.max(0, Math.floor(y0 / cell)), j1 = Math.min(rows - 1, Math.floor(y1 / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = cx(i), py = cx(j);
      let bad;
      if (o.w) { const nx = Math.max(o.x, Math.min(o.x + o.w, px)), ny = Math.max(o.y, Math.min(o.y + o.h, py)); bad = hypot(px - nx, py - ny) < clearance; }
      else bad = hypot(px - o.x, py - o.y) < o.r + clearance;
      if (bad) blocked[j * cols + i] = 1;
    }
  }
  // borda do mapa (o herói não passa de r..w-r) e arena circular
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const px = cx(i), py = cx(j);
    if (px < 16 || py < 16 || px > zone.w - 16 || py > zone.h - 16) blocked[j * cols + i] = 1;
    else if (zone.circle && hypot(px - zone.w / 2, py - zone.h / 2) > zone.radius - 20) blocked[j * cols + i] = 1;
  }
  const grid = { cell, cols, rows, blocked, w: zone.w, h: zone.h };
  navCache.set(key, { layout, grid });
  return grid;
}

const cellOf = (g, x, y) => ({ i: Math.max(0, Math.min(g.cols - 1, Math.floor(x / g.cell))), j: Math.max(0, Math.min(g.rows - 1, Math.floor(y / g.cell))) });
const isBlockedAt = (g, x, y) => { const { i, j } = cellOf(g, x, y); return g.blocked[j * g.cols + i] === 1; };

// Célula livre mais próxima do ponto (espiral); null se a grade inteira estiver bloqueada num raio de 12 células.
function nearestFree(g, x, y) {
  const c = cellOf(g, x, y);
  if (!g.blocked[c.j * g.cols + c.i]) return c;
  for (let r = 1; r <= 12; r++) {
    let best = null, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = c.i + di, j = c.j + dj;
      if (i < 0 || j < 0 || i >= g.cols || j >= g.rows || g.blocked[j * g.cols + i]) continue;
      const d = hypot((i + 0.5) * g.cell - x, (j + 0.5) * g.cell - y);
      if (d < bd) { bd = d; best = { i, j }; }
    }
    if (best) return best;
  }
  return null;
}

// Linha reta livre entre dois pontos (amostrada a cada ~10 px nas células)?
export function lineFree(g, ax, ay, bx, by) {
  const d = hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / 10));
  for (let k = 0; k <= n; k++) if (isBlockedAt(g, ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n)) return false;
  return true;
}

// A* 8 direções (sem cortar quina) com heap binário; devolve [{x,y}] do 1º passo até o destino, suavizado; [] se já está lá; null se não há caminho.
export function findPath(g, from, to, maxNodes = 40000) {
  const s = nearestFree(g, from.x, from.y), t = nearestFree(g, to.x, to.y);
  if (!s || !t) return null;
  if (lineFree(g, from.x, from.y, to.x, to.y) && !isBlockedAt(g, to.x, to.y)) return [{ x: to.x, y: to.y }];
  const N = g.cols * g.rows, gs = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = []; // [f, idx]
  const push = (f, idx) => { heap.push([f, idx]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let l = 2 * k + 1, r = l + 1, m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const h = (i, j) => { const dx = Math.abs(i - t.i), dy = Math.abs(j - t.j); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
  const si = s.j * g.cols + s.i, ti = t.j * g.cols + t.i;
  gs[si] = 0; push(h(s.i, s.j), si);
  let seen = 0, found = false;
  while (heap.length && seen++ < maxNodes) {
    const [, cur] = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === ti) { found = true; break; }
    const ci = cur % g.cols, cj = (cur / g.cols) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= g.cols || nj >= g.rows) continue;
      const n = nj * g.cols + ni;
      if (g.blocked[n] || closed[n]) continue;
      if (di && dj && (g.blocked[cj * g.cols + ni] || g.blocked[nj * g.cols + ci])) continue; // diagonal não corta quina
      const ng = gs[cur] + (di && dj ? Math.SQRT2 : 1);
      if (ng < gs[n]) { gs[n] = ng; prev[n] = cur; push(ng + h(ni, nj), n); }
    }
  }
  if (!found) return null;
  const pts = [];
  for (let c = ti; c !== -1; c = prev[c]) pts.push({ x: ((c % g.cols) + 0.5) * g.cell, y: (((c / g.cols) | 0) + 0.5) * g.cell });
  pts.reverse();
  pts[pts.length - 1] = isBlockedAt(g, to.x, to.y) ? pts[pts.length - 1] : { x: to.x, y: to.y };
  // puxa o fio: do ponto atual salta para o ponto mais distante ainda visível em linha reta
  const out = [];
  let a = { x: from.x, y: from.y }, k = 0;
  while (k < pts.length) {
    let far = k;
    for (let m = pts.length - 1; m > k; m--) if (lineFree(g, a.x, a.y, pts[m].x, pts[m].y)) { far = m; break; }
    out.push(pts[far]); a = pts[far]; k = far + 1;
  }
  return out;
}

// Movimento unitário rumo ao próximo ponto do caminho (consome os pontos já alcançados). Devolve { mx, my, left } ou null sem caminho.
export function followPath(path, pos, reach = 22) {
  while (path.length > 1 && hypot(path[0].x - pos.x, path[0].y - pos.y) < reach) path.shift();
  const p = path[0];
  if (!p) return null;
  const d = hypot(p.x - pos.x, p.y - pos.y);
  if (path.length === 1 && d < reach) { path.shift(); return null; }
  return { mx: (p.x - pos.x) / (d || 1), my: (p.y - pos.y) / (d || 1), left: path.length };
}

// Comprimento restante do caminho a partir de `pos` (para a distância mostrada): reta até o 1º ponto + segmentos.
export function pathLength(path, pos) {
  if (!path?.length) return 0;
  let d = hypot(path[0].x - pos.x, path[0].y - pos.y);
  for (let i = 1; i < path.length; i++) d += hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return d;
}

// Regra de pausa da auto-viagem (pura). Ser atacado/estar em combate NÃO pausa: o herói segue andando e atravessa os mobs.
// Pausa só por: toque/ataque manual, travado 3 vezes, vida baixa (< 30%, a menos que o jogador já tenha mandado continuar).
// Atordoado não pausa: o herói só não anda enquanto dura (`stunned` → 'stun' = espera sem aviso e retoma sozinha).
export const AUTO_LOW_HP = 0.3;
export function autoPauseReason({ manual = false, hpFrac = 1, stunned = false, blocked = false, ignoreLow = false } = {}) {
  if (manual) return 'manual';
  if (blocked) return 'blocked';
  if (!ignoreLow && hpFrac < AUTO_LOW_HP) return 'lowhp';
  if (stunned) return 'stun';
  return null;
}
