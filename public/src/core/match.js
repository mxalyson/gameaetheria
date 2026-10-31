// Regras puras das partidas de arena por times (1×1, 2×2, 4×4). Sem DOM: o cliente de hoje e o servidor de amanhã usam o mesmo código.
// Vence quem eliminar o outro time, chegar a SCORE_TARGET pontos segurando o ponto de controle, ou liderar quando o tempo acaba.

export const MODES = {
  '1v1': { size: 1, label: '1×1', limit: 120 },
  '2v2': { size: 2, label: '2×2', limit: 150 },
  '4v4': { size: 4, label: '4×4', limit: 180 },
};
export const SCORE_TARGET = 100;
export const CAPTURE_RATE = 2; // pontos por segundo com o ponto só seu (50 s para vencer sozinho)

export function newMatch(mode) {
  const m = MODES[mode];
  if (!m) throw new Error('modo inválido: ' + mode);
  return { mode, size: m.size, limit: m.limit, time: 0, score: { 1: 0, 2: 0 }, owner: 0 };
}

// in1/in2: quantos vivos de cada time estão dentro do ponto. Disputado (ambos) não pontua.
export function controlTick(m, dt, in1, in2) {
  m.time += dt;
  if (in1 > 0 && in2 === 0) { m.owner = 1; m.score[1] += CAPTURE_RATE * dt; }
  else if (in2 > 0 && in1 === 0) { m.owner = 2; m.score[2] += CAPTURE_RATE * dt; }
  return m;
}

// 0 = segue; 1 / 2 = time vencedor; 3 = empate. `hp1`/`hp2` (vida somada) desempata no fim do tempo.
export function matchWinner(m, alive1, alive2, hp1 = 0, hp2 = 0) {
  if (alive1 === 0 && alive2 === 0) return 3;
  if (alive2 === 0) return 1;
  if (alive1 === 0) return 2;
  if (m.score[1] >= SCORE_TARGET) return 1;
  if (m.score[2] >= SCORE_TARGET) return 2;
  if (m.time >= m.limit) {
    if (m.score[1] !== m.score[2]) return m.score[1] > m.score[2] ? 1 : 2;
    return hp1 === hp2 ? 3 : hp1 > hp2 ? 1 : 2;
  }
  return 0;
}

// Um rating por modo (padrão de arenas por times): 1×1 usa o `arena.rating` antigo, para não perder saves existentes.
export function getRating(char, mode) {
  return mode === '1v1' ? char.arena.rating : (char.arena.ratings?.[mode] ?? 1000);
}
export function setRating(char, mode, value) {
  if (mode === '1v1') { char.arena.rating = value; return; }
  char.arena.ratings = { ...(char.arena.ratings ?? {}), [mode]: value };
}

// Posições iniciais: time 1 ao sul, time 2 ao norte, em linha (centro x = cx).
export function spawnSlots(team, size, cx, southY, northY, gap = 90) {
  const y = team === 1 ? southY : northY;
  return Array.from({ length: size }, (_, i) => ({ x: cx + (i - (size - 1) / 2) * gap, y }));
}
