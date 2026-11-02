import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Todo módulo de public/src e server/ (menos os que dependem do DOM no topo ou sobem servidor) carrega em Node sem erro nem aviso.
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
const SKIP = /[\\/](main|no-zoom|start|start-poc)\.js$/; // main.js e no-zoom.js usam document; start*.js abrem portas

test('módulos carregam em Node sem exceção e sem avisos de processo', async () => {
  const warns = []; const on = (w) => warns.push(w.message); process.on('warning', on);
  const bad = [];
  for (const f of [...walk('public/src'), ...walk('server')].filter((f) => !SKIP.test(f))) {
    try { await import(pathToFileURL(resolve(f)).href); } catch (e) { bad.push(`${f}: ${String(e.message).split('\n')[0]}`); }
  }
  process.off('warning', on);
  assert.deepEqual(bad, []);
  assert.deepEqual(warns, []);
});
