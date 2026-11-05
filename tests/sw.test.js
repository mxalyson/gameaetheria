import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Roda o public/sw.js de verdade num contexto falso (cache, fetch e timers simulados) para conferir a estratégia de cache.
function loadSw({ scope = 'https://x.dev/', network } = {}) {
  const store = new Map(), handlers = {}, fetched = [];
  const cache = {
    match: async (req, o = {}) => store.get(o.ignoreSearch ? req.url.split('?')[0] : req.url) ?? (o.ignoreSearch ? [...store].find(([k]) => k.split('?')[0] === req.url.split('?')[0])?.[1] : undefined),
    put: async (req, res) => { store.set(req.url, res); },
    addAll: async () => {},
  };
  const resp = (body, ok = true) => ({ ok, body, clone() { return this; } });
  const ctx = {
    self: { location: { href: scope + 'sw.js', origin: new URL(scope).origin }, registration: { scope }, skipWaiting() {}, clients: { claim: async () => {} },
      addEventListener: (t, fn) => { handlers[t] = fn; } },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: (req, opts) => { fetched.push({ url: req.url, opts }); return network(req, resp); },
    Response: class { constructor(body, o) { this.body = body; this.status = o?.status; } },
    URL, Set, Promise, setTimeout, clearTimeout,
  };
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), ctx);
  // raw: a resposta (promessa) separada do trabalho em segundo plano (waitUntil)
  const raw = (url, mode = 'cors') => {
    let p = null; const waits = [];
    handlers.fetch({ request: { url, method: 'GET', mode }, respondWith: (x) => { p = x; }, waitUntil: (x) => waits.push(x) });
    return { p, bg: async () => { await p; await Promise.all(waits); } };
  };
  const request = async (url, mode) => { const { p, bg } = raw(url, mode); if (!p) return null; const r = await p; await bg(); return r; };
  return { request, raw, store, fetched, resp };
}

test('sw: arte com ?v= é imutável — depois de no cache, nunca baixa de novo', async () => {
  const sw = loadSw({ network: async (req, resp) => resp('img') });
  const u = 'https://x.dev/assets/ui/a.webp?v=abc';
  assert.equal((await sw.request(u)).body, 'img');
  assert.equal(sw.fetched.length, 1);
  for (let i = 0; i < 3; i++) await sw.request(u);
  assert.equal(sw.fetched.length, 1, 'sem downloads em segundo plano para arte versionada');
  await sw.request('https://x.dev/assets/props/chest.json?v=abc');
  await sw.request('https://x.dev/assets/props/chest.json?v=abc');
  assert.equal(sw.fetched.length, 2, 'JSON de atlas versionado também é imutável');
});

test('sw: arte sem ?v= vem do cache e atualiza em segundo plano só uma vez', async () => {
  const sw = loadSw({ network: async (req, resp) => resp('v' + sw.fetched.length) });
  const u = 'https://x.dev/icons/apple-touch-icon.png';
  await sw.request(u); // baixa e guarda
  assert.equal((await sw.request(u)).body, 'v1', 'resposta vem do cache');
  await sw.request(u); await sw.request(u);
  assert.equal(sw.fetched.length, 2, 'uma atualização em segundo plano, não uma por uso');
});

test('sw: código é rede primeiro; offline cai no cache; rede lenta usa o cache sem travar', async () => {
  let mode = 'ok';
  const sw = loadSw({ network: (req, resp) => mode === 'ok' ? Promise.resolve(resp('novo')) : mode === 'off' ? Promise.reject(new Error('off')) : new Promise((r) => setTimeout(() => r(resp('tarde')), 3500)) });
  const u = 'https://x.dev/src/main.js';
  assert.equal((await sw.request(u)).body, 'novo');
  mode = 'off';
  assert.equal((await sw.request(u)).body, 'novo', 'sem rede: usa a cópia');
  mode = 'slow'; // rede responde em 3,5 s: o jogo recebe a cópia em ~3 s e a resposta atrasada atualiza o cache depois
  const t0 = Date.now();
  const { p, bg } = sw.raw(u);
  const got = await p, dt = Date.now() - t0;
  assert.equal(got.body, 'novo', 'usou a cópia do cache');
  assert.ok(dt >= 2900 && dt < 3400, `respondeu no tempo limite (${dt} ms), sem esperar a rede`);
  await bg();
  assert.equal(sw.store.get(u).body, 'tarde', 'a resposta atrasada atualiza o cache para a próxima visita');
});

test('sw: laboratórios, outras origens e POST passam direto, também com o jogo numa subpasta', async () => {
  const sw = loadSw({ scope: 'https://u.github.io/gameaetheria/', network: async (req, resp) => resp('x') });
  assert.equal(await sw.request('https://u.github.io/gameaetheria/labs/iso-poc/index.html'), null);
  assert.equal(await sw.request('https://outra.com/a.js'), null);
  assert.ok(await sw.request('https://u.github.io/gameaetheria/src/main.js'), 'o jogo na subpasta é atendido');
});
