// Morte e dano do herói em miniatura SEM texturas novas: o sprite real tomba (rotação em torno dos pés), amassa e esmaece.
// Módulo puro (testável em Node). `t` em segundos desde a morte; `side` = ±1 (lado para onde tomba).
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeIn = (k) => k * k;

export const DEATH = { recoil: 0.14, fall: 0.5, lie: 1.0, fade: 0.9, total: 0.14 + 0.5 + 1.0 + 0.9 };

// Fases: 0..recoil = sobressalto (inclina para trás); depois tomba até 90° (acelera, com leve quique ao chegar); deitado; esmaece.
export function deathPose(t, side = 1) {
  const r = DEATH.recoil, f = DEATH.fall;
  let rot, squash, dy = 0;
  if (t < r) { rot = -side * 0.18 * easeOut(t / r); squash = 1 + 0.04 * (t / r); }
  else if (t < r + f) {
    const k = clamp01((t - r) / f);
    rot = -side * 0.18 + side * (Math.PI / 2 + 0.18) * easeIn(k);
    squash = 1;
    dy = 0;
  } else {
    const k = clamp01((t - r - f) / 0.18); // quique curto ao encostar no chão
    rot = side * Math.PI / 2 - side * 0.05 * Math.sin(k * Math.PI);
    squash = 1 - 0.1 * Math.sin(k * Math.PI);
  }
  const fadeStart = r + f + DEATH.lie;
  const alpha = t < fadeStart ? 1 : 1 - clamp01((t - fadeStart) / DEATH.fade);
  const impact = t >= r + f && t < r + f + 0.12; // instante em que levanta poeira
  return { rot, squash, dy, alpha, impact, done: t >= DEATH.total };
}

// Pulso de dano recebido (0..1): usado na vinheta vermelha e no clarão no herói.
export function hurtPulse(sinceHit) { return sinceHit < 0 ? 0 : Math.pow(clamp01(1 - sinceHit / 0.45), 1.6); }
