import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { SET } from '../public/src/render/nature-sprites.js';
import { ZONES } from '../public/src/data/zones.js';

// Cenário em sprites: todo sprite usado existe no atlas, o atlas é leve e os tipos mapeados são tipos que o layout realmente gera.
const atlas = JSON.parse(readFileSync('public/assets/nature/atlas.json', 'utf8'));
test('todo sprite citado nas zonas existe no atlas, com tamanho e âncora válidos', () => {
  for (const [zone, tipos] of Object.entries(SET)) {
    assert.ok(ZONES[zone], 'zona ' + zone);
    for (const [tipo, cfg] of Object.entries(tipos)) {
      assert.ok(cfg.v.length > 0 && (cfg.h || cfg.w) && cfg.ref > 0, zone + '/' + tipo);
      for (const n of cfg.v) {
        const sp = atlas.sprites[n]; assert.ok(sp, 'falta no atlas: ' + n);
        assert.ok(sp.w > 4 && sp.h > 4 && sp.ax >= 0 && sp.ax <= sp.w && sp.ay >= 0 && sp.ay <= sp.h && sp.ppm > 0 && sp.x + sp.w <= atlas.size[0] && sp.y + sp.h <= atlas.size[1], 'medidas de ' + n);
      }
    }
  }
});
test('atlas leve (cabe na memória de qualquer celular): arquivo < 200 KB e área decodificada < 6 MiB', () => {
  assert.ok(statSync('public/assets/nature/atlas.webp').size < 200_000);
  assert.ok(atlas.size[0] * atlas.size[1] * 4 < 6 * 1048576, 'atlas grande demais: ' + atlas.size);
});
