// Lógica pura dos controles de toque (sem DOM): joystick, escolha de alvo e de mira.
// Separada de touch.js para poder ser testada em Node.

export const STICK_RADIUS = 56; // px de arrasto para o joystick chegar ao máximo
export const DEADZONE = 0.18;   // fração do raio ignorada (tremor do dedo)
export const AUTO_AIM_RANGE = 620; // px do jogo
export const DRAG_AIM_MIN = 26;    // px de arrasto para um botão de skill virar "mirar na mão"

const len = (x, y) => Math.hypot(x, y);

// dx, dy: deslocamento do dedo a partir do ponto onde tocou. Devolve direção (0..1) e a posição do botão do joystick.
export function stickVector(dx, dy, radius = STICK_RADIUS, dead = DEADZONE) {
  const d = len(dx, dy);
  if (d < 1e-6) return { x: 0, y: 0, mag: 0, knobX: 0, knobY: 0 };
  const k = Math.min(d, radius);
  const knobX = (dx / d) * k, knobY = (dy / d) * k;
  const raw = k / radius;
  const mag = raw < dead ? 0 : Math.min(1, (raw - dead) / (1 - dead));
  return { x: mag ? (dx / d) * mag : 0, y: mag ? (dy / d) * mag : 0, mag, knobX, knobY };
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
  return skill.kind === 'blink' || (skill.kind === 'dash' && skill.invuln) ? 'move' : 'enemy';
}

// Direção (vetor unitário) do arrasto de um botão de skill, ou null se foi só um toque.
export function dragAim(dx, dy, min = DRAG_AIM_MIN) {
  const d = len(dx, dy);
  return d >= min ? { x: dx / d, y: dy / d } : null;
}
