import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

// Montarias pintadas (tools/mount-sheet.py): arquivos, json coerente, âncoras dentro do quadro, módulo carrega em Node sem DOM e não explode sem arte.
const IDS = { wolf: 1, horse: 1, gryphon: 3 };
const read = (id) => JSON.parse(readFileSync(`public/assets/mounts/${id}.json`, 'utf8'));
const inside = ([x, y]) => x > 0 && x < 1 && y > 0 && y < 1;

test('montarias: webp (alta e baixa) e json existem, leves e com o número certo de quadros', () => {
  for (const [id, frames] of Object.entries(IDS)) {
    const m = read(id);
    assert.equal(m.frames, frames, id);
    for (const tag of ['hi', 'lo']) {
      const s = m.sizes[tag];
      assert.ok(existsSync(`public/assets/mounts/${s.file}`), s.file);
      assert.ok(statSync(`public/assets/mounts/${s.file}`).size < 300_000, s.file + ' pesado demais');
      assert.equal(s.bytes_decoded, s.w * s.h * 4 * frames);
    }
    assert.ok(Math.max(m.sizes.hi.w, m.sizes.hi.h) >= 240 && Math.max(m.sizes.hi.w, m.sizes.hi.h) <= 260, 'alta ~256 px');
    assert.ok(Math.max(m.sizes.lo.w, m.sizes.lo.h) >= 150 && Math.max(m.sizes.lo.w, m.sizes.lo.h) <= 165, 'baixa ~160 px');
    assert.ok(Math.abs(m.aspect - m.sizes.hi.w / m.sizes.hi.h) < 0.02, 'aspecto confere com a imagem');
  }
});

test('montarias: memória decodificada por montaria <= 8 MiB na alta (e menor na baixa)', () => {
  for (const id of Object.keys(IDS)) {
    const m = read(id);
    assert.ok(m.sizes.hi.bytes_decoded <= 8 * 1048576, id);
    assert.ok(m.sizes.lo.bytes_decoded < m.sizes.hi.bytes_decoded, id);
  }
});

test('montarias: âncoras (pés, sela, sombra) dentro do quadro e sela acima dos pés', () => {
  for (const id of Object.keys(IDS)) {
    const m = read(id);
    assert.ok(inside(m.feet) && inside(m.seat) && inside(m.shadow), id);
    assert.ok(m.seat[1] < m.feet[1] - 0.2, id + ': a sela fica bem acima do chão');
    assert.ok(m.shadow[2] > 0 && m.shadow[2] < 1 && m.shadow[3] > 0 && m.shadow[3] < 0.5, id + ': raios da sombra');
  }
});

test('mount-sprites carrega em Node sem DOM e desenha nada sem arte (sem erro)', async () => {
  const M = await import('../public/src/render/mount-sprites.js');
  assert.deepEqual(M.MOUNT_IDS, ['wolf', 'horse', 'gryphon']);
  const calls = [];
  const g = new Proxy({}, { get: (_, k) => (...a) => { calls.push(k); } });
  const a = { x: 10, y: 10, mounted: true, mountId: 'wolf', moving: true, facing: 0 };
  assert.equal(M.mountLift({ x: 0, y: 0 }), 0, 'sem montaria: 0');
  assert.equal(M.mountLift(a), 0, 'montaria ainda não carregada: herói no chão');
  M.drawMountBack(g, a, 1, 2, 22); M.drawMountFront(g, a, 1, 2, 22);
  assert.equal(calls.length, 0, 'nada desenhado sem imagem carregada');
  M.drawMountBack(g, { x: 0, y: 0, mounted: true, mountId: 'dragao' }, 1, 2, 12); // id desconhecido: ignora
  assert.equal(M.mountBaseLift({ mounted: false }), 0);
});

test('mount-sprites: no máximo 2 montarias distintas em cache', async () => {
  const M = await import('../public/src/render/mount-sprites.js');
  const g = new Proxy({}, { get: () => () => {} });
  for (const id of ['wolf', 'horse', 'gryphon']) M.drawMountBack(g, { x: 0, y: 0, mounted: true, mountId: id, moving: false }, 5, 2, 12);
  assert.ok(M._test.cache.size <= 2);
});
