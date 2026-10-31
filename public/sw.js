// Service worker (P10): o jogo abre sem rede depois da primeira visita.
// Estratégia: "stale-while-revalidate" para arquivos do mesmo site (responde do cache e atualiza em segundo plano);
// nada de WebSocket, API ou outras origens (login/salvamento na nuvem passam direto). Subir VERSION invalida o cache antigo.
const VERSION = 'aetheria-v1';

self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(VERSION).then((c) => c.addAll(['./', 'index.html', 'style.css', 'manifest.webmanifest', 'icon.svg']))); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/labs/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    const net = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || new Response('offline', { status: 503 });
  })());
});
