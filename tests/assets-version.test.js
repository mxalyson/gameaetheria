import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NetClient, AUTH_LOST } from '../public/src/net/client.js';

// B13: todo carregamento de .webp feito por código (new Image().src / fetch) precisa de ?v= — o service worker serve .webp do cache primeiro.
function walk(d) { return readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; }); }

test('B13: src de Image/fetch de .webp em public/src sempre leva ?v=', () => {
  const bad = [];
  for (const f of walk('public/src')) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/(\bi|img|image)\.src\s*=|fetch\(/.test(line) && /\.webp/.test(line) && !/\.webp\?v=/.test(line)) bad.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('B6: recuo exponencial de reconexão sobe até 60 s e bad_token é fatal', () => {
  const c = new NetClient({ url: 'ws://x', session: 's', characterId: 1 });
  const d = Array.from({ length: 9 }, () => c.retryDelay());
  assert.deepEqual(d, [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
  assert.ok(AUTH_LOST.includes('bad_token'));
});
