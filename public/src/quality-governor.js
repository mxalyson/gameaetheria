// Governador de qualidade gráfica (modo 'auto'): lógica PURA, sem DOM nem leitura de pixels.
// Mede o FPS médio numa janela e, se ficar bem abaixo do limite, rebaixa um nível de EFEITOS (alta → média → baixa: partículas, atmosfera, sombras).
// Nunca mexe na RESOLUÇÃO (dprCap) nem na arte HD: isso deixava a Vila borrada logo na abertura. Nunca sobe de volta no mesmo uso (evita oscilar).
// Ignora os primeiros GRACE_SEC após abrir o jogo, trocar de zona ou carregar atlas (a abertura é pesada e não representa o jogo).
export const ORDER = ['low', 'medium', 'high'];
export const FPS_LIMIT = 20;     // abaixo disso (média da janela) rebaixa
export const WINDOW_SEC = 10;    // janela de medição
export const GRACE_SEC = 15;     // carência após abrir/trocar de zona/carregar atlas
export const SETTLE_SEC = 2;     // após rebaixar, ignora o tempo de assentar (resize do canvas, recarga de texturas)
export const MAX_GAP = 0.5;      // quadros mais longos que isso são pausa (aba oculta, retrato): não contam

export class QualityGovernor {
  constructor({ limit = FPS_LIMIT, windowSec = WINDOW_SEC, settleSec = SETTLE_SEC, graceSec = GRACE_SEC } = {}) {
    Object.assign(this, { limit, windowSec, settleSec, graceSec });
    this.graceLeft = graceSec; // ao abrir já começa em carência
    this.noticed = false;      // o aviso 'Qualidade ajustada' sai só 1 vez por sessão
    this.cap = 'high'; // teto atual; só desce
    this.reset();
  }
  reset() { this.t = 0; this.n = 0; this.settle = 0; }
  // Reinicia a carência (troca de zona, atlas carregando): zera a janela e ignora os próximos `sec` segundos.
  grace(sec = this.graceSec) { this.graceLeft = Math.max(this.graceLeft, sec); this.t = 0; this.n = 0; }
  // true na 1ª chamada após um rebaixamento (decide o toast); depois sempre false.
  shouldNotify() { if (this.noticed) return false; this.noticed = true; return true; }
  // Teto aplicado sobre o nível escolhido pelo aparelho: nunca devolve algo acima do cap.
  apply(level) { return ORDER.indexOf(level) <= ORDER.indexOf(this.cap) ? level : this.cap; }
  // dt = segundos REAIS do quadro (sem o teto de 0,05 do loop). `active` falso (manual, título) zera a janela.
  // Devolve o novo nível quando rebaixou, senão null.
  update(dt, active = true, current = this.cap) {
    if (!active || !(dt > 0) || dt > MAX_GAP) { this.t = 0; this.n = 0; return null; }
    if (this.graceLeft > 0) { this.graceLeft -= dt; return null; }
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
