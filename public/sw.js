// Service worker (P10): o jogo abre sem rede depois da primeira visita.
// Código (HTML/JS/CSS/manifesto): REDE PRIMEIRO, ignorando o cache HTTP do servidor (o GitHub Pages manda max-age=600, o que deixava versões velhas por 10 min),
// e cai no cache só se estiver offline. Arte pesada (PNG, fontes, SVG): cache primeiro e atualiza em segundo plano.
// Nada de WebSocket, API ou outras origens (login/salvamento na nuvem passam direto). Subir VERSION invalida o cache antigo.
const VERSION = 'aetheria-v3';
const HEAVY = /\.(png|ttf|woff2?|svg|jpg|webp)$/i;

self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(VERSION).then((c) => c.addAll(['./', 'index.html', 'style.css', 'fonts/fonts.css', 'manifest.webmanifest', 'icon.svg']))); });
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
    const fresh = () => fetch(req, { cache: 'no-cache' }).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
    if (HEAVY.test(url.pathname) && hit) { e.waitUntil(fresh()); return hit; }
    return (await fresh()) || hit || new Response('offline', { status: 503 });
  })());
});
