// Governador de qualidade gráfica (modo 'auto'): lógica PURA, sem DOM nem leitura de pixels.
// Mede o FPS médio numa janela de alguns segundos e, se ficar abaixo do limite, rebaixa um nível (alta → média → baixa).
// Nunca sobe de volta no mesmo uso: evita oscilar (cada troca de qualidade redimensiona o canvas, o que custa um quadro lento).
export const ORDER = ['low', 'medium', 'high'];
export const FPS_LIMIT = 28;     // abaixo disso (média da janela) rebaixa
export const WINDOW_SEC = 4;     // janela de medição
export const SETTLE_SEC = 2;     // após rebaixar, ignora o tempo de assentar (resize do canvas, recarga de texturas)
export const MAX_GAP = 0.5;      // quadros mais longos que isso são pausa (aba oculta, retrato): não contam

export class QualityGovernor {
  constructor({ limit = FPS_LIMIT, windowSec = WINDOW_SEC, settleSec = SETTLE_SEC } = {}) {
    Object.assign(this, { limit, windowSec, settleSec });
    this.cap = 'high'; // teto atual; só desce
    this.reset();
  }
  reset() { this.t = 0; this.n = 0; this.settle = 0; }
  // Teto aplicado sobre o nível escolhido pelo aparelho: nunca devolve algo acima do cap.
  apply(level) { return ORDER.indexOf(level) <= ORDER.indexOf(this.cap) ? level : this.cap; }
  // dt = segundos REAIS do quadro (sem o teto de 0,05 do loop). `active` falso (manual, título) zera a janela.
  // Devolve o novo nível quando rebaixou, senão null.
  update(dt, active = true, current = this.cap) {
    if (!active || !(dt > 0) || dt > MAX_GAP) { this.t = 0; this.n = 0; return null; }
    if (this.settle > 0) { this.settle -= dt; return null; }
    this.t += dt; this.n++;
    if (this.t < this.windowSec) return null;
    const fps = this.n / this.t;
    this.t = 0; this.n = 0;
    const i = ORDER.indexOf(this.apply(current));
    if (fps >= this.limit || i <= 0) return null;
    this.cap = ORDER[i - 1];
    this.settle = this.settleSec;
    return this.cap;
  }
}
