// Guarda de memória de canvas (2026-11-05). O Safari (iPhone/iPad, inclusive Chrome no iOS) tem um teto de memória para canvas: passando dele,
// getContext('2d') devolve null EM SILÊNCIO e o desenho seguinte quebra. No jogo isso aparecia como blocos de chão lisos/pretos e monstros
// invisíveis (só a etiqueta "Nv 3"), porque o bloco do terreno e o atlas recolorido do monstro não conseguiam ser criados.
// Aqui só detectamos e avisamos quem se inscreveu (main.js libera caches e baixa a resolução); o desenho segue como antes.
const subs = [];
let fails = 0, lastCall = -Infinity;

export const onCanvasPressure = (fn) => { subs.push(fn); };
export const canvasFails = () => fails;

// Reporta uma falha (chamado pelo getContext envolvido ou por quem detectar canvas recusado). No máximo 1 aviso a cada 3 s.
export function reportCanvasFailure(now = (globalThis.performance?.now?.() ?? Date.now())) {
  fails++;
  if (now - lastCall < 3000) return false;
  lastCall = now;
  for (const fn of subs) { try { fn(fails); } catch { /* quem reage não pode derrubar o desenho */ } }
  return true;
}

export function installCanvasGuard() {
  const P = globalThis.HTMLCanvasElement?.prototype;
  if (!P || P.__aetheriaGuard) return;
  const orig = P.getContext;
  P.getContext = function (type, ...rest) {
    const ctx = orig.call(this, type, ...rest);
    if (!ctx && type === '2d' && this.width > 0 && this.height > 0) reportCanvasFailure();
    return ctx;
  };
  P.__aetheriaGuard = true;
}

// Teste em Node: zera o estado.
export function _resetGuard() { fails = 0; lastCall = -Infinity; subs.length = 0; }
