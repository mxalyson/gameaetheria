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

import { asset, ASSET_V } from '../public/src/assets-version.js';

test('asset(): anexa ?v= uma vez e respeita query existente', () => {
  assert.equal(asset('assets/ui/x.webp'), `assets/ui/x.webp?v=${ASSET_V}`);
  assert.equal(asset('assets/ui/x.webp?v=9'), 'assets/ui/x.webp?v=9');
});

test('B13: todo src="assets/ de ui.js e touch.js passa pelo helper asset() (nunca caminho cru)', () => {
  for (const f of ['public/src/ui/ui.js', 'public/src/touch.js']) {
    const text = readFileSync(f, 'utf8');
    assert.ok(/import \{ asset \} from/.test(text), `${f} importa o helper`);
    const raw = text.split('\n').flatMap((l, i) => (/src="assets\//.test(l) ? [`${f}:${i + 1}`] : []));
    assert.deepEqual(raw, []);
    const rawSign = text.split('\n').flatMap((l, i) => (l.includes('src="${src}"') ? [`${f}:${i + 1}`] : []));
    assert.deepEqual(rawSign, [], 'sign() usa asset(src)');
  }
});

test('ASSET_V e a VERSION do service worker andam juntas (tools/bump-assets.mjs escreve as duas)', () => {
  const sw = readFileSync('public/sw.js', 'utf8');
  assert.match(sw, new RegExp(`const VERSION = 'aetheria-${ASSET_V}'`));
});
