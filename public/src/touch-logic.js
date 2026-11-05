// Lógica pura dos controles de toque (sem DOM): joystick, escolha de alvo e de mira.
// Separada de touch.js para poder ser testada em Node.

export const STICK_RADIUS = 56; // px de arrasto para o joystick chegar ao máximo
export const DEADZONE = 0.18;   // fração do raio ignorada (tremor do dedo)
export const AUTO_AIM_RANGE = 620; // px do jogo
export const DRAG_AIM_MIN = 26;    // px de arrasto para um botão de skill virar "mirar na mão"

export const RUN_EDGE = 0.9;   // fração do raio do joystick: acima disso o dedo está na borda externa
export const RUN_HOLD_S = 0.25; // tempo na borda para ativar o correr
export const RUN_KEEP = 0.5;    // depois de ativo, continua correndo enquanto o dedo passar de metade do raio

// Correr: `st` = { t, on }; raw = deslocamento/raio (0..1+, sem zona morta); dt em segundos. Sem botão: soltar o joystick zera.
export function stepRun(st, raw, dt) {
  if (raw > RUN_EDGE) st.t += dt; else if (!(st.on && raw > RUN_KEEP)) st.t = 0;
  st.on = st.on ? raw > RUN_KEEP : st.t >= RUN_HOLD_S;
  if (!st.on && raw <= RUN_EDGE) st.t = 0;
  return st.on;
}

const len = (x, y) => Math.hypot(x, y);

export const HOLD_MS = 400; // segurar um botão de skill por este tempo (parado) abre a explicação em vez de conjurar

// O toque virou "segurar para explicar"? elapsed em ms desde o toque; moved = distância (px do jogo) que o dedo andou.
// Arrastar além do limite de mira é mirar na mão, não segurar.
export const isHold = (elapsed, moved = 0, ms = HOLD_MS, min = DRAG_AIM_MIN) => elapsed >= ms && moved < min;

// dx, dy: deslocamento do dedo a partir do ponto onde tocou. Devolve direção (0..1) e a posição do botão do joystick.
export function stickVector(dx, dy, radius = STICK_RADIUS, dead = DEADZONE) {
  const d = len(dx, dy);
  if (d < 1e-6) return { x: 0, y: 0, mag: 0, knobX: 0, knobY: 0, raw: 0 };
  const k = Math.min(d, radius);
  const knobX = (dx / d) * k, knobY = (dy / d) * k;
  const raw = k / radius;
  const mag = raw < dead ? 0 : Math.min(1, (raw - dead) / (1 - dead));
  return { x: mag ? (dx / d) * mag : 0, y: mag ? (dy / d) * mag : 0, mag, knobX, knobY, raw };
}

export function nearestTarget(player, enemies, maxR = AUTO_AIM_RANGE) {
  let best = null, bd = maxR;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = len(e.x - player.x, e.y - player.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// mode 'enemy': mira no alvo mais próximo (ou na direção arrastada). mode 'move': para esquivas/teleportes,
// mira para onde o jogador está andando. Sem alvo nem movimento, olha na direção em que está virado.
export function pickAim({ player, enemies = [], move, override = null, mode = 'enemy', reach = 260 }) {
  const facing = { x: Math.cos(player.facing ?? 0), y: Math.sin(player.facing ?? 0) };
  const dirAim = (v) => ({ x: player.x + v.x * reach, y: player.y + v.y * reach });
  if (override) return dirAim(override);
  const moving = move && len(move.x, move.y) > 0.01;
  if (mode === 'move') return dirAim(moving ? move : facing);
  const t = nearestTarget(player, enemies);
  if (t) return { x: t.x, y: t.y };
  return dirAim(moving ? move : facing);
}

// Skills de deslocamento (esquiva, teleporte) seguem o movimento; as demais, o alvo.
export function aimModeFor(skill) {
  if (!skill) return 'enemy';
  // recuo (back) e salto (jump) miram o inimigo: o recuo foge dele e o salto cai em cima dele
  return skill.kind === 'blink' || (skill.kind === 'dash' && skill.invuln && !skill.back && !skill.jump) ? 'move' : 'enemy';
}

// Direção (vetor unitário) do arrasto de um botão de skill, ou null se foi só um toque.
export function dragAim(dx, dy, min = DRAG_AIM_MIN) {
  const d = len(dx, dy);
  return d >= min ? { x: dx / d, y: dy / d } : null;
}

// Alvo do botão de interagir: NPC (raio 80) tem prioridade; senão baú (raio 70). Devolve {kind, ref} ou null.
// 'opened' (opcional) é o conjunto de baús já abertos: o alvo continua valendo (o jogo avisa que está vazio).
// Prioridade NPC > baú > lore (placa/estátua de zona, raio 80).
export const NPC_REACH = 80, CHEST_REACH = 70, LORE_REACH = 80, CHECKPOINT_REACH = 80;
export function interactTarget(player, world) {
  const zone = world?.zone;
  if (!player || !zone) return null;
  const npc = (zone.npcs ?? []).find((n) => len(n.x - player.x, n.y - player.y) < NPC_REACH);
  if (npc) return { kind: 'npc', ref: npc };
  const chest = (zone.chests ?? []).find((c) => len(c.x - player.x, c.y - player.y) < CHEST_REACH);
  if (chest) return { kind: 'chest', ref: chest };
  const cp = (zone.checkpoints ?? []).find((c) => len(c.x - player.x, c.y - player.y) < CHECKPOINT_REACH);
  if (cp) return { kind: 'checkpoint', ref: cp };
  const lore = (zone.lore ?? []).find((l) => len(l.x - player.x, l.y - player.y) < LORE_REACH);
  return lore ? { kind: 'lore', ref: lore } : null;
}

// ---------- geometria dos botões de toque (canto inferior direito) ----------
// Tudo em px do "contêiner" #tbtns (sem escala): x = distância da borda DIREITA, y = da borda de BAIXO (centros). O contêiner todo é
// escalado por --tb (= máx(ui, .8)) com origem no canto, então as razões entre distâncias não mudam com a escala da interface.
// Regra: a distância entre os centros de QUALQUER par >= GAP × (r1 + r2). Dois anéis em volta do ataque:
//  anel 1 (raio 84, passo 45°): s0 à esquerda, s1 na diagonal, s2 em cima; anel 2 (raio 150): Maestria (s3) entre s1 e s2;
//  poção à esquerda de s0; interagir (baú/NPC/pedra) acima da poção, à esquerda do arco.
export const TB_GAP = 1.15, TB_MIN_SCALE = 0.8, TB_RIGHT = 10, TB_BOTTOM = 8;
export const TB_R = { atk: 44, sk: 25, mastery: 27, pot: 25, act: 30, mnt: 28 }; // raios (px do contêiner)
const RING1 = 84, RING2 = 150, STEP = Math.PI / 4;
export const TB_SIZE = { w: 236, h: 214 }; // contêiner (cabe a Maestria no anel 2 e a poção/interagir à esquerda)

// ângulo: 0 = esquerda do ataque, cresce para cima (PI/2 = em cima)
const polar = (cx, cy, R, a) => ({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });

export function skillLayout(vw, vh, ui = 1, { right = 0, bottom = 0 } = {}) {
  const scale = Math.max(ui, TB_MIN_SCALE);
  const A = { x: TB_R.atk, y: TB_R.atk, r: TB_R.atk };
  const items = {
    atk: A,
    s0: { ...polar(A.x, A.y, RING1, 0), r: TB_R.sk },
    s1: { ...polar(A.x, A.y, RING1, STEP), r: TB_R.sk },
    s2: { ...polar(A.x, A.y, RING1, STEP * 2), r: TB_R.sk },
    s3: { ...polar(A.x, A.y, RING2, STEP * 1.5), r: TB_R.mastery },
  };
  items.pot = { x: items.s0.x + 62, y: A.y, r: TB_R.pot };
  items.act = { x: items.pot.x, y: items.pot.y + 66, r: TB_R.act };
  items.mnt = { x: items.act.x, y: items.act.y + 68, r: TB_R.mnt }; // Montar/Desmontar: acima de "interagir", só aparece com montaria possuída em zona permitida
  const ox = TB_RIGHT + right, oy = TB_BOTTOM + bottom; // folga da borda (incl. área segura)
  for (const k of Object.keys(items)) {
    const it = items[k];
    it.x = Math.round(it.x * 10) / 10; it.y = Math.round(it.y * 10) / 10;
    it.d = it.r * 2;
    it.sx = vw - ox - it.x * scale; it.sy = vh - oy - it.y * scale; it.sr = it.r * scale; // centro e raio na tela
  }
  return { scale, w: TB_SIZE.w, h: TB_SIZE.h, items };
}

// Toque/tecla de habilidade que chega num quadro sem tick fixo (telas de 90/120 Hz rodam o tick de 1/60 s a cada 1,5–2 quadros):
// guarda o pedido COM a mira do momento do toque e o reaplica até um tick consumi-lo; sem isso o pedido sumia (~50% dos toques a 120 Hz).
// hold: { cast, aimX, aimY } | null. Devolve o novo hold; a intenção recebe cast/mira guardados quando não traz um pedido novo.
export function carryCast(hold, intent) {
  if (!intent) return null;
  if (intent.cast != null) return { cast: intent.cast, aimX: intent.aimX, aimY: intent.aimY };
  if (hold) { intent.cast = hold.cast; intent.aimX = hold.aimX; intent.aimY = hold.aimY; }
  return hold;
}

// ---------- montaria (decisão 0018) ----------
// "Montar automático" (opção do aparelho, padrão desligada): andar fora de combate por `delay` s monta sozinho. st = { t, hold }: `hold` = o jogador desmontou à mão e não quer montar de novo
// até parar de andar (o toque no botão vale mais que a opção). Devolve true no quadro em que deve pedir para montar.
export function stepAutoMount(st, { enabled, moving, ok, mounted }, dt, delay = 1.5) {
  if (!moving) { st.t = 0; st.hold = false; return false; }
  if (!enabled || !ok || mounted || st.hold) { st.t = 0; return false; }
  st.t += dt;
  if (st.t < delay) return false;
  st.t = 0;
  return true;
}
// Toque duplo no herói: dois toques a até `ms` ms um do outro, perto um do outro (px) e o último sobre o herói (raio `r`, px de tela).
export function isHeroDoubleTap(prev, tap, hero, { ms = 350, gap = 44, r = 64 } = {}) {
  if (!prev || !tap || !hero) return false;
  return tap.t - prev.t <= ms && Math.hypot(tap.x - prev.x, tap.y - prev.y) <= gap && Math.hypot(tap.x - hero.x, tap.y - hero.y) <= r;
}
