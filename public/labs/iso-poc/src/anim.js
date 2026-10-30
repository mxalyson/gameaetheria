// Animação (módulo puro): clipes e escolha do clipe a partir do ESTADO da simulação. Nenhuma regra de jogo aqui:
// a animação só reage ao que a simulação já decidiu (movendo, atacando, lançando, ferido, morto).
export const MAGE_CLIPS = {
  idle: { frames: 6, fps: 8, loop: true },
  walk: { frames: 8, fps: 12, loop: true },
  attack: { frames: 6, fps: 16, loop: false, release: 3 }, // `release` = quadro em que o projétil sai do cajado
  skill: { frames: 8, fps: 14, loop: false, release: 4 },
  hit: { frames: 3, fps: 12, loop: false },
};
export const SLIME_CLIPS = {
  idle: { frames: 6, fps: 6, loop: true },
  move: { frames: 6, fps: 9, loop: true },
  attack: { frames: 6, fps: 12, loop: false, release: 3 },
  hit: { frames: 3, fps: 12, loop: false },
  death: { frames: 8, fps: 10, loop: false },
};

export class Animator {
  constructor(clips, start = 'idle') { this.clips = clips; this.name = start; this.t = 0; this.done = false; }
  get clip() { return this.clips[this.name]; }
  get frame() {
    const c = this.clip, f = Math.floor(this.t * c.fps);
    return c.loop ? f % c.frames : Math.min(f, c.frames - 1);
  }
  get finished() { return !this.clip.loop && this.t * this.clip.fps >= this.clip.frames; }
  // Chega a `release` (quadro do disparo) exatamente uma vez por execução do clipe.
  get released() { const r = this.clip.release; return r != null && this.frame >= r; }
  play(name, restart = false) { if (this.name !== name || restart) { this.name = name; this.t = 0; } }
  update(dt) { this.t += dt; }
}

// Decide o clipe. Prioridade: morte > ferido > ação em andamento (ataque/skill) > mover > parado.
// signals: { dead, moving, hurt, attackStart, skillStart }  (os "Start" valem por um quadro: borda de subida)
export function chooseClip(anim, { dead, moving, hurt, attackStart, skillStart }, names = { move: 'walk', attack: 'attack', skill: 'skill', death: null }) {
  // A morte é definitiva para a animação: só um `anim.play('idle', true)` explícito (renascer) sai dela.
  if (names.death && anim.name === names.death) return;
  if (dead && names.death) return anim.play(names.death);
  if (dead) return;
  const acting = (anim.name === names.attack || anim.name === names.skill) && !anim.finished;
  if (skillStart && names.skill) return anim.play(names.skill, true);
  if (attackStart) return anim.play(names.attack, true);
  if (hurt && anim.name !== 'hit' && !acting) return anim.play('hit', true);
  if (anim.name === 'hit' && !anim.finished) return;
  if (acting) return;
  anim.play(moving ? names.move : 'idle');
}
