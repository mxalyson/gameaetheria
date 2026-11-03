import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { SET } from '../public/src/render/nature-sprites.js';
import { ZONES } from '../public/src/data/zones.js';

// Cenário em sprites: todo sprite usado existe no atlas, o atlas é leve e os tipos mapeados são tipos que o layout realmente gera.
const atlas = JSON.parse(readFileSync('public/assets/nature/atlas.json', 'utf8'));
const meshy = JSON.parse(readFileSync('public/assets/nature/meshy.json', 'utf8')); // peças do Meshy (nomes com prefixo m_)
const find = (n) => (n.startsWith('m_') ? [meshy.sprites[n.slice(2)], meshy.size] : [atlas.sprites[n], atlas.size]);
test('todo sprite citado nas zonas existe no atlas, com tamanho e âncora válidos', () => {
  for (const [zone, tipos] of Object.entries(SET)) {
    assert.ok(ZONES[zone], 'zona ' + zone);
    for (const [tipo, cfg] of Object.entries(tipos)) {
      assert.ok(cfg.v.length > 0 && (cfg.h || cfg.w || cfg.house) && (cfg.ref ?? 0) >= 0 && ((cfg.ref ?? 0) > 0 || cfg.house || cfg.v.every((n) => n.startsWith('m_'))), zone + '/' + tipo);
      for (const n of cfg.v) {
        const [sp, size] = find(n); assert.ok(sp, 'falta no atlas: ' + n);
        assert.ok(sp.w > 4 && sp.h > 4 && sp.ax >= 0 && sp.ax <= sp.w && sp.ay >= 0 && sp.ay <= sp.h && sp.ppm > 0 && sp.x + sp.w <= size[0] && sp.y + sp.h <= size[1], 'medidas de ' + n);
      }
    }
  }
});
test('atlas leves (cabem na memória de qualquer celular): arquivos < 200 KB e área decodificada < 6 MiB cada; juntos < 10 MiB (passar disso fez o desenho do Bosque custar 5× mais)', () => {
  assert.ok(statSync('public/assets/nature/atlas.webp').size < 200_000 && statSync('public/assets/nature/meshy.webp').size < 200_000);
  assert.ok(atlas.size[0] * atlas.size[1] * 4 < 6 * 1048576, 'atlas grande demais: ' + atlas.size);
  assert.ok(meshy.size[0] * meshy.size[1] * 4 < 6 * 1048576, 'atlas do Meshy grande demais: ' + meshy.size);
  assert.ok((atlas.size[0] * atlas.size[1] + meshy.size[0] * meshy.size[1]) * 4 < 10 * 1048576);
});
test('poço, cercas e ponte do Meshy existem no atlas e a Vila e as zonas vivas os usam', () => {
  for (const n of ['well', 'fence_1', 'fence_2', 'bridge']) assert.ok(meshy.sprites[n], 'falta m_' + n);
  assert.ok(SET.town.well && SET.town.fence);
  for (const z of ['forest', 'plains', 'glacier']) assert.ok(SET[z].fence, 'cerca em ' + z);
});

// V30: entrar num mapa não pode construir todos os blocos de terreno no mesmo quadro (picos de 100–270 ms); o resto vem nos quadros seguintes (chão liso por 1–3 quadros).
import { GroundCache } from '../public/src/render/ground-tiles.js';
test('terreno em blocos: no máximo ~um bloco novo por quadro, sem buracos depois', () => {
  const spin = (ms) => { const t = performance.now(); while (performance.now() - t < ms); };
  const gc = new GroundCache(() => { spin(12); return { width: 1, height: 1 }; });
  const world = { zoneId: 'z', zone: { w: 4600, h: 2800, palette: { ground: '#000' } } };
  let flat = 0, imgs = 0;
  const g = { drawImage() { imgs++; }, fillRect() { flat++; }, set fillStyle(v) {} };
  gc.draw(g, world, 0, 0, 2100, 1100, 0); // vista 3×2 blocos
  assert.ok(gc.stats.built <= 2, 'construiu demais no 1º quadro: ' + gc.stats.built);
  assert.ok(flat >= 1, 'blocos pendentes devem sair como chão liso');
  for (let i = 0; i < 8; i++) gc.draw(g, world, 0, 0, 2100, 1100, 0);
  flat = 0; imgs = 0; gc.draw(g, world, 0, 0, 2100, 1100, 0);
  assert.equal(flat, 0, 'todos os blocos visíveis prontos após alguns quadros');
  assert.equal(imgs, 6);
});

// Carimbos do chão: a faixa por bloco vem de busca binária no y (não varre o mapa inteiro) e é equivalente ao filtro completo
import { stampSlice } from '../public/src/render/nature-sprites.js';
test('stampSlice devolve exatamente os carimbos que podem tocar o bloco', () => {
  const list = Array.from({ length: 2000 }, (_, i) => ({ x: (i * 37) % 4600, y: (i * 1.4) % 2800 })).sort((a, b) => a.y - b.y);
  list.maxH = 60;
  for (const b of [{ x0: 0, y0: 0, x1: 1030, y1: 1030 }, { x0: 1022, y0: 1022, x1: 2052, y1: 2052 }, { x0: 0, y0: 2040, x1: 1030, y1: 2800 }]) {
    const [lo, hi] = stampSlice(list, b);
    const want = list.filter((it) => it.y >= b.y0 && it.y <= b.y1 + 60);
    assert.deepEqual(list.slice(lo, hi), want);
  }
  assert.deepEqual(stampSlice(list, null), [0, list.length]);
});

// Etiquetas presas à área livre da tela (sem DOM): fora dos botões de toque, do menu e das bordas
import { safeBoxScreen } from '../public/src/render/safe-box.js';
test('safeBoxScreen: rótulo sai de baixo dos botões de toque, do menu e da borda', () => {
  const vw = 844, vh = 390, hud = [[0, 0, 240, 130], [vw - 150, 0, vw, 140], [vw - 540, 0, vw, 60], [vw - 280, vh - 250, vw, vh]];
  const out = { x: 0, y: 0 };
  const hit = (r, sw, sh) => r.x + sw / 2 > hud[3][0] && r.x - sw / 2 < hud[3][2] && r.y + sh > hud[3][1] && r.y < hud[3][3];
  safeBoxScreen(800, 330, 150, 22, vw, vh, hud, out); // herói no canto inferior direito
  assert.equal(hit(out, 150, 22), false);
  safeBoxScreen(700, 20, 140, 14, vw, vh, hud, out); // etiqueta atrás do menu desce
  assert.ok(out.y >= 60);
  safeBoxScreen(-50, 380, 100, 22, vw, vh, [], out); // fora da tela: preso às bordas
  assert.ok(out.x >= 54 && out.y <= vh - 26);
  safeBoxScreen(400, 200, 100, 22, vw, vh, hud, out); // livre: não mexe
  assert.deepEqual([out.x, out.y], [400, 200]);
});

// Terreno na escala do dispositivo (celular 3×): o teto de memória vale em todas as escalas e a escala só sobe com blocos menores.
import { groundBudget as gb, quantScale, TILE_BY_SCALE, BUDGET_MIB as BUD } from '../public/src/render/ground-tiles.js';
import { ZONES as ZN } from '../public/src/data/zones.js';
test('terreno: escala de bloco 1/1,5/2 respeita o teto de memória na vista do celular (1135×522) e a quantização', () => {
  const MIB = 1048576;
  assert.deepEqual([0.55, 1.2, 1.5, 1.7, 2, 2.9].map(quantScale), [1, 1, 1.5, 1.5, 2, 2]);
  for (const s of [1, 1.5, 2]) {
    assert.ok(Number.isInteger(TILE_BY_SCALE[s] * s) && Number.isInteger(2 * s), `lados em pixels inteiros na escala ${s}`);
    for (const [id, z] of Object.entries(ZN)) {
      const b = gb(z, 1135, 522, s);
      assert.ok(b.bytes <= BUD * MIB, `${id} @${s}: ${(b.bytes / MIB).toFixed(1)} MiB`);
    }
  }
});
