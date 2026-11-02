// Terreno em BLOCOS sob demanda. Um mapa de 4600×2800 pré-renderizado inteiro custaria 49 MiB de canvas (e o cache antigo guardava um por zona
// visitada: 5 zonas de farm = ~250 MiB). Aqui o terreno é cortado em blocos de 1024×1024 desenhados quando entram na vista, num cache LRU com teto de
// memória: o custo deixa de depender do tamanho do mapa. Zonas pequenas (Vila, arenas) continuam num canvas só.
// Só memória e ordem de desenho: o conteúdo de cada bloco vem de `build`, que desenha a MESMA coisa que o canvas inteiro (mesma semente), recortada.
export const TILE = 1024;
const PAD = 2; // sobreposição entre blocos: evita fresta de 1 px na costura quando o zoom não é inteiro
export const BUDGET_MIB = 36; // teto do cache de terreno (≈ 9 blocos); a vista nunca precisa de mais de 6–9
const MIB = 1048576;
const WHOLE_MAX = 14 * MIB; // abaixo disto o mapa inteiro vale um canvas só (Vila 8,4 MiB, arena grande 13 MiB)

// Memória do terreno de uma zona: mapa inteiro (zonas pequenas) ou o pior caso de blocos visíveis. Usado pelos testes e pelo relatório.
export function groundBudget(zone, viewW = 1534, viewH = 709) {
  const whole = zone.w * zone.h * 4;
  if (whole <= WHOLE_MAX) return { mode: 'whole', bytes: whole };
  const tileBytes = (TILE + PAD * 2) ** 2 * 4;
  const cols = Math.min(Math.ceil(zone.w / TILE), Math.ceil(viewW / TILE) + 1), rows = Math.min(Math.ceil(zone.h / TILE), Math.ceil(viewH / TILE) + 1);
  const visible = cols * rows; // vista no pior alinhamento
  return { mode: 'tiles', tileBytes, visible, bytes: Math.min(visible + 3, Math.floor((BUDGET_MIB * MIB) / tileBytes)) * tileBytes };
}

export class GroundCache {
  // build(world, ox, oy, w, h) -> canvas w×h com o terreno do retângulo [ox, ox+w) × [oy, oy+h) em coordenadas do mundo
  constructor(build) { this.build = build; this.map = new Map(); this.bytes = 0; this.frame = 0; this.t0 = 0; this.built = 0; this.idle = new Set(); this.stats = { built: 0, deferred: 0, maxMs: 0 }; }

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
    }
    e.used = hint; return e;
  }

  // Desenha o terreno que aparece em [x0,x1]×[y0,y1] (mundo). `rdy` muda quando chegam texturas/atlas (invalida só o que já existia).
  draw(g, world, x0, y0, x1, y1, rdy = 0) {
    const z = world.zone, f = ++this.frame;
    this.t0 = performance.now(); this.built = 0;
    if (z.w * z.h * 4 <= WHOLE_MAX) {
      const e = this.get(world.zoneId + ':all', () => this.build(world, 0, 0, z.w, z.h), z.w * z.h * 4, rdy, f);
      g.drawImage(e.cv, 0, 0);
      this.trim(f); return;
    }
    const c0 = Math.max(0, Math.floor(x0 / TILE)), c1 = Math.min(Math.ceil(z.w / TILE) - 1, Math.floor(x1 / TILE));
    const r0 = Math.max(0, Math.floor(y0 / TILE)), r1 = Math.min(Math.ceil(z.h / TILE) - 1, Math.floor(y1 / TILE));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.tile(g, world, c, r, rdy, f);
    // pré-aquece UM bloco vizinho por vez, em ociosidade (requestIdleCallback; sem ele, no máximo um por quadro e só se sobrar orçamento):
    // o custo de construção sai do caminho do quadro em vez de travar ao cruzar a borda
    const pc = [c0 - 1, c1 + 1], pr = [r0 - 1, r1 + 1];
    outer: for (let r = pr[0]; r <= pr[1]; r++) for (let c = pc[0]; c <= pc[1]; c++) {
      if (c < 0 || r < 0 || c * TILE >= z.w || r * TILE >= z.h || (c >= c0 && c <= c1 && r >= r0 && r <= r1)) continue;
      if (this.bytes + (TILE + PAD * 2) ** 2 * 4 > BUDGET_MIB * MIB) break outer; // sem folga no teto: não pré-aquece (evita construir e expulsar a cada quadro)
      const key = `${world.zoneId}:${c},${r}`;
      if (this.map.has(key)) continue;
      if (typeof requestIdleCallback === 'function') {
        if (this.idle.size < 1 && !this.idle.has(key)) {
          this.idle.add(key);
          requestIdleCallback((dl) => {
            this.idle.delete(key);
            if (this.map.has(key) || this.frame - f > 120 || (dl.timeRemaining() < 12 && !dl.didTimeout)) return; // sem folga ou vista já longe: o próximo quadro tenta de novo
            this.get(key, () => this.make(world, c, r), (TILE + PAD * 2) ** 2 * 4, rdy, this.frame - 0.5);
          }, { timeout: 1500 });
        }
      } else if (this.canBuild()) this.get(key, () => this.make(world, c, r), (TILE + PAD * 2) ** 2 * 4, rdy, f - 0.5);
      break outer;
    }
    this.trim(f);
  }

  make(world, c, r) {
    const ox = c * TILE - PAD, oy = r * TILE - PAD;
    return this.build(world, ox, oy, TILE + PAD * 2, TILE + PAD * 2);
  }

  tile(g, world, c, r, rdy, f) {
    const e = this.get(`${world.zoneId}:${c},${r}`, () => this.make(world, c, r), (TILE + PAD * 2) ** 2 * 4, rdy, f, true);
    if (e) g.drawImage(e.cv, c * TILE - PAD, r * TILE - PAD);
    else { g.fillStyle = world.zone.palette.ground; g.fillRect(c * TILE - PAD, r * TILE - PAD, TILE + PAD * 2, TILE + PAD * 2); } // chão liso por 1–3 quadros, até o bloco ficar pronto
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
