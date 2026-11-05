import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

// Montarias: arte 2D antiga (tools/mount-sheet.py, reserva) e arte 3D em 8 direções (tools/mount-bake.mjs): arquivos, json coerente, âncoras dentro do quadro, módulo carrega em Node sem DOM e não explode sem arte.
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

// ---- arte 3D: 8 direções x quadros de ciclo (tools/mount-bake.mjs) ----
const R3 = { wolf: { frames: 6, idle: true }, horse: { frames: 6, idle: true }, gryphon: { frames: 8, idle: false } };
const read3 = (id) => JSON.parse(readFileSync(`public/assets/mounts/${id}-3d.json`, 'utf8'));
const webpSize = (f) => { const b = readFileSync(f); if (b.toString('ascii', 12, 16) === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]; if (b.toString('ascii', 12, 16) === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; } return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]; };

test('montarias 3D: webp (alta e baixa) e json existem, com 8 vistas e os quadros do ciclo', () => {
  for (const [id, c] of Object.entries(R3)) {
    const m = read3(id), cols = c.frames + (c.idle ? 1 : 0);
    assert.equal(m.frames, c.frames, id); assert.equal(!!m.idle, c.idle, id); assert.equal(m.cols, cols, id); assert.equal(m.rows, 8, id);
    assert.equal(m.views.length, 8, id);
    for (const tag of ['hi', 'lo']) {
      const s = m.sizes[tag], f = `public/assets/mounts/${s.file}`;
      assert.ok(existsSync(f), s.file); assert.ok(statSync(f).size < 400_000, s.file + ' pesado demais');
      assert.deepEqual(webpSize(f), [s.w, s.h], s.file + ': dimensões do webp conferem com o json');
      assert.equal(s.w, s.cell[0] * cols, s.file); assert.equal(s.h, s.cell[1] * 8, s.file);
      assert.equal(s.bytes_decoded, s.w * s.h * 4);
    }
    const [cw, ch] = m.sizes.hi.cell;
    assert.ok(Math.max(cw, ch) >= 130 && Math.max(cw, ch) <= 200, id + ': célula alta ~160-190 px');
    assert.ok(Math.abs(m.aspect - cw / ch) < 0.01, id + ': aspecto');
    assert.ok(m.sizes.lo.bytes_decoded < m.sizes.hi.bytes_decoded, id);
  }
});

test('montarias 3D: orçamento de textura <= 8 MiB decodificados por montaria na alta (par em cache <= 16 MiB)', () => {
  let worstPair = [];
  for (const id of Object.keys(R3)) { const b = read3(id).sizes.hi.bytes_decoded; assert.ok(b <= 8 * 1048576, id + ' estourou 8 MiB'); worstPair.push(b); }
  worstPair = worstPair.sort((a, b) => b - a).slice(0, 2).reduce((x, y) => x + y, 0);
  assert.ok(worstPair <= 16 * 1048576);
});

test('montarias 3D: pés e sela dentro do quadro nas 8 vistas e em todos os quadros; sela acima dos pés', () => {
  for (const id of Object.keys(R3)) {
    const m = read3(id);
    assert.ok(inside(m.feet) && inside(m.shadow), id);
    assert.equal(m.saddle.length, 8, id); assert.equal(m.saddleF.length, 8, id);
    for (let v = 0; v < 8; v++) {
      assert.ok(inside(m.saddle[v]), `${id} vista ${v}: sela parada dentro do quadro`);
      assert.equal(m.saddleF[v].length, m.cols, `${id} vista ${v}: uma sela por quadro`);
      for (const p of m.saddleF[v]) { assert.ok(inside(p), `${id} vista ${v}: sela fora do quadro ${p}`); assert.ok(p[1] < m.feet[1], `${id} vista ${v}: sela acima do chão`); }
    }
    // de lado (L/O) a sela fica bem acima dos pés; ao virar a direção ela se mantém numa faixa estável (herói não pula ao virar)
    const ys = m.saddle.map((p) => m.feet[1] - p[1]);
    assert.ok(Math.min(...ys) > 0.1, id + ': sela bem acima do chão em todas as vistas');
    assert.ok(Math.max(...ys) - Math.min(...ys) < 0.25, id + ': altura da sela estável entre as vistas');
  }
});

test('montarias 3D: sela numa faixa plausível da célula (nem na borda nem nos pés)', () => {

  for (const id of Object.keys(R3)) assert.ok(read3(id).saddle.every(([x, y]) => x > 0.15 && x < 0.9 && y > 0.1 && y < 0.8), id);
});

test('mount-sprites: escolha da vista por direção (S=0, L=2, N=4, O=6) igual à do herói', async () => {
  const M = await import('../public/src/render/mount-sprites.js');
  const { viewFromFacing } = await import('../public/src/render/hero-sprites.js');
  for (let i = 0; i < 16; i++) { const f = (i / 16) * Math.PI * 2 - Math.PI; assert.equal(M._test.viewOf(f), viewFromFacing(f), 'ângulo ' + f); }
  assert.equal(M._test.viewOf(Math.PI / 2), 0); assert.equal(M._test.viewOf(0), 2); assert.equal(M._test.viewOf(-Math.PI / 2), 4); assert.equal(M._test.viewOf(Math.PI), 6);
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
