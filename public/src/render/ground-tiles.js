// Terreno em BLOCOS sob demanda. Um mapa de 4600×2800 pré-renderizado inteiro custaria 49 MiB de canvas (e o cache antigo guardava um por zona
// visitada: 5 zonas de farm = ~250 MiB). Aqui o terreno é cortado em blocos de 1024×1024 desenhados quando entram na vista, num cache LRU com teto de
// memória: o custo deixa de depender do tamanho do mapa. Zonas pequenas (Vila, arenas) continuam num canvas só.
// Só memória e ordem de desenho: o conteúdo de cada bloco vem de `build`, que desenha a MESMA coisa que o canvas inteiro (mesma semente), recortada.
export const TILE = 1024; // lado do bloco (unidades do mundo) na escala 1
// Escala de pixels do bloco (pixels de bloco por unidade do mundo). Em celular de tela 3x o mundo aparece a ~2 px de tela por unidade; com blocos a 1 px/unidade o terreno
// era AMPLIADO 2-3x (mole). Escala 1,5 ou 2 re-renderiza tudo que e vetorial/carimbado (trilhas, pedrinhas, flores, rios) na resolucao do aparelho. O lado do bloco em unidades
// diminui na mesma proporcao (pixels por bloco ~650^2 em vez de 1030^2) para o teto de memoria valer; os lados dao pixels inteiros (sem fresta).
export const TILE_BY_SCALE = { 1: 1024, 1.5: 432, 2: 320 };
export const quantScale = (s) => (s < 1.25 ? 1 : s < 1.75 ? 1.5 : 2); // alvo = min(zoom x dpr, 2)
const PAD = 2; // sobreposição entre blocos: evita fresta de 1 px na costura quando o zoom não é inteiro
export const BUDGET_MIB = 36; // teto "mole" (B29): ≈ 9 blocos para expulsar e pré-aquecer; a vista atual nunca é expulsa, então telas ultrawide (≥ 12 blocos visíveis) passam de 36 MiB (~50-60), sem thrash
const MIB = 1048576;
const PERF = typeof location !== 'undefined' && /[?&]perf=1/.test(location.search); // ?perf=1: registra no console o custo de cada bloco de terreno
const WHOLE_MAX = 14 * MIB; // abaixo disto o mapa inteiro vale um canvas só (Vila 8,4 MiB, arena grande 13 MiB)

// Memória do terreno de uma zona: mapa inteiro (zonas pequenas) ou o pior caso de blocos visíveis. Usado pelos testes e pelo relatório.
// viewW/viewH em unidades do mundo; `scale` = escala de pixels dos blocos (1, 1,5 ou 2).
export function groundBudget(zone, viewW = 1534, viewH = 709, scale = 1) {
  const whole = Math.ceil(zone.w * scale) * Math.ceil(zone.h * scale) * 4;
  if (whole <= WHOLE_MAX) return { mode: 'whole', bytes: whole };
  const T = TILE_BY_SCALE[scale] ?? TILE, tileBytes = Math.ceil((T + PAD * 2) * scale) ** 2 * 4;
  const cols = Math.min(Math.ceil(zone.w / T), Math.ceil(viewW / T) + 1), rows = Math.min(Math.ceil(zone.h / T), Math.ceil(viewH / T) + 1);
  const visible = cols * rows; // vista no pior alinhamento
  return { mode: 'tiles', tileBytes, visible, bytes: Math.min(visible + 3, Math.floor((BUDGET_MIB * MIB) / tileBytes)) * tileBytes };
}

export class GroundCache {
  // build(world, ox, oy, w, h) -> canvas w×h com o terreno do retângulo [ox, ox+w) × [oy, oy+h) em coordenadas do mundo
  constructor(build) { this.build = build; this.scale = 1; this.T = TILE; this.map = new Map(); this.bytes = 0; this.frame = 0; this.t0 = 0; this.built = 0; this.idle = new Set(); this.stats = { built: 0, deferred: 0, maxMs: 0 }; }

  // Muda a escala de pixels dos blocos (renderer.resize). Descarta o cache: os blocos antigos têm outra resolução.
  setScale(s) { s = TILE_BY_SCALE[s] ? s : 1; if (s === this.scale) return; this.clear(); this.scale = s; this.T = TILE_BY_SCALE[s]; }
  tileBytes() { return Math.ceil((this.T + PAD * 2) * this.scale) ** 2 * 4; }

  // Orçamento de construção por quadro (V30): o 1º bloco do quadro sempre pode ser feito; os seguintes só se ainda couber ~6 ms.
  // Antes, entrar num mapa construía 4+ blocos de 1030² no MESMO quadro (picos de 100–270 ms); agora o resto vem nos quadros seguintes.
  canBuild() { return this.built === 0 || performance.now() - this.t0 < 6; }

  // `soft` = pode devolver null (bloco ainda por construir: o chamador desenha o chão liso no lugar). Bloco velho (atlas novo chegou) segue visível até ser refeito.
  get(key, mk, bytes, rdy, hint, soft = false) {
    let e = this.map.get(key);
    if (e && e.rdy < rdy) { // chegou um atlas de chão: refaz (um por quadro; enquanto isso vale o bloco antigo)
      if (soft && !this.canBuild()) { this.stats.deferred++; e.used = hint; return e; }
      this.bytes -= e.bytes; this.map.delete(key); e.cv.width = e.cv.height = 0; e = null;
    }
    if (!e) {
      if (soft && !this.canBuild()) { this.stats.deferred++; return null; }
      const a = performance.now(); e = { cv: mk(), bytes, rdy, used: 0 }; this.map.set(key, e); this.bytes += bytes;
      this.built++; this.stats.built++; this.stats.maxMs = Math.max(this.stats.maxMs, performance.now() - a);
      if (PERF) console.log(`[perf] bloco ${key}: ${(performance.now() - a).toFixed(1)} ms`);
    }
    e.used = hint; return e;
  }

  // Desenha o terreno que aparece em [x0,x1]×[y0,y1] (mundo). `rdy` muda quando chegam texturas/atlas (invalida só o que já existia).
  draw(g, world, x0, y0, x1, y1, rdy = 0) {
    const z = world.zone, f = ++this.frame;
    this.t0 = performance.now(); this.built = 0;
    const sc = this.scale, T = this.T, wholeBytes = Math.ceil(z.w * sc) * Math.ceil(z.h * sc) * 4;
    if (wholeBytes <= WHOLE_MAX) {
      const e = this.get(world.zoneId + ':all', () => this.build(world, 0, 0, z.w, z.h, sc), wholeBytes, rdy, f);
      g.drawImage(e.cv, 0, 0, e.cv.width / sc, e.cv.height / sc);
      this.trim(f); return;
    }
    const c0 = Math.max(0, Math.floor(x0 / T)), c1 = Math.min(Math.ceil(z.w / T) - 1, Math.floor(x1 / T));
    const r0 = Math.max(0, Math.floor(y0 / T)), r1 = Math.min(Math.ceil(z.h / T) - 1, Math.floor(y1 / T));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.tile(g, world, c, r, rdy, f);
    // pré-aquece UM bloco vizinho por vez, em ociosidade (requestIdleCallback; sem ele, no máximo um por quadro e só se sobrar orçamento):
    // o custo de construção sai do caminho do quadro em vez de travar ao cruzar a borda
    const pc = [c0 - 1, c1 + 1], pr = [r0 - 1, r1 + 1];
    outer: for (let r = pr[0]; r <= pr[1]; r++) for (let c = pc[0]; c <= pc[1]; c++) {
      if (c < 0 || r < 0 || c * T >= z.w || r * T >= z.h || (c >= c0 && c <= c1 && r >= r0 && r <= r1)) continue;
      if (this.bytes + this.tileBytes() > BUDGET_MIB * MIB) break outer; // sem folga no teto: não pré-aquece (evita construir e expulsar a cada quadro)
      const key = `${world.zoneId}:${c},${r}`;
      if (this.map.has(key)) continue;
      if (typeof requestIdleCallback === 'function') {
        if (this.idle.size < 1 && !this.idle.has(key)) {
          this.idle.add(key);
          requestIdleCallback((dl) => {
            this.idle.delete(key);
            if (this.map.has(key) || this.frame - f > 120 || (dl.timeRemaining() < 12 && !dl.didTimeout)) return; // sem folga ou vista já longe: o próximo quadro tenta de novo
            this.get(key, () => this.make(world, c, r), this.tileBytes(), rdy, this.frame - 0.5);
          }, { timeout: 1500 });
        }
      } else if (this.canBuild()) this.get(key, () => this.make(world, c, r), this.tileBytes(), rdy, f - 0.5);
      break outer;
    }
    this.trim(f);
  }

  make(world, c, r) {
    const ox = c * this.T - PAD, oy = r * this.T - PAD;
    return this.build(world, ox, oy, this.T + PAD * 2, this.T + PAD * 2, this.scale);
  }

  tile(g, world, c, r, rdy, f) {
    const e = this.get(`${world.zoneId}:${c},${r}`, () => this.make(world, c, r), this.tileBytes(), rdy, f, true);
    const T = this.T, sc = this.scale;
    if (e) g.drawImage(e.cv, c * T - PAD, r * T - PAD, e.cv.width / sc, e.cv.height / sc);
    else { g.fillStyle = world.zone.palette.ground; g.fillRect(c * T - PAD, r * T - PAD, T + PAD * 2, T + PAD * 2); } // chão liso por 1–3 quadros, até o bloco ficar pronto
  }

  // expulsa os blocos menos usados (nunca os do quadro atual) até caber no teto
  trim(f) {
    if (this.bytes <= BUDGET_MIB * MIB) return;
    const old = [...this.map.entries()].filter(([, e]) => e.used < f).sort((a, b) => a[1].used - b[1].used);
    for (const [k, e] of old) {
      if (this.bytes <= BUDGET_MIB * MIB) break;
      this.map.delete(k); this.bytes -= e.bytes; e.cv.width = e.cv.height = 0; // libera o bitmap já
    }
  }

  clear() { for (const e of this.map.values()) e.cv.width = e.cv.height = 0; this.map.clear(); this.bytes = 0; }
}
