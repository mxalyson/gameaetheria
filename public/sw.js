// Service worker (P10): o jogo abre sem rede depois da primeira visita.
// Código (HTML/JS/CSS/manifesto): REDE PRIMEIRO, ignorando o cache HTTP do servidor (o GitHub Pages manda max-age=600, o que deixava versões velhas por 10 min);
// se a rede não responder em CODE_TIMEOUT_MS e houver cópia, usa o cache (rede ruim no celular não trava o carregamento) e a resposta da rede, quando chegar, atualiza o cache.
// Arte (PNG/WebP, fontes, SVG): cache primeiro. Com ?v=<hash> (tools/bump-assets.mjs) o arquivo é imutável: nunca baixa de novo (antes cada uso disparava um
// download em segundo plano, gastando dados móveis à toa). Sem ?v= atualiza em segundo plano, uma vez por arquivo enquanto este worker vive.
// Nada de WebSocket, API, outras origens nem laboratórios (login/salvamento na nuvem passam direto). Subir VERSION invalida o cache antigo.
const VERSION = 'aetheria-5c8c9f3f';
const HEAVY = /\.(png|ttf|woff2?|svg|jpe?g|webp|mp3|ogg)$/i;
const CODE_TIMEOUT_MS = 3000;
const refreshed = new Set(); // arte sem ?v= já atualizada nesta vida do worker

// Caminho relativo ao escopo do worker: funciona na raiz (localhost) e em subpasta (GitHub Pages /gameaetheria/).
const scopePath = () => new URL(self.registration?.scope ?? self.location.href).pathname.replace(/[^/]*$/, '');
const isLab = (url) => url.pathname.startsWith(scopePath() + 'labs/');
// Arte e JSON de atlas com ?v= são imutáveis (o hash muda quando o conteúdo muda).
const immutable = (url) => url.searchParams.has('v') && (HEAVY.test(url.pathname) || url.pathname.endsWith('.json'));

self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(VERSION).then((c) => c.addAll(['./', 'index.html', 'style.css', 'fonts/fonts.css', 'manifest.webmanifest', 'icon.svg']))); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function respond(e) {
  const req = e.request, url = new URL(req.url);
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
  const fetchAndStore = (opts) => fetch(req, opts).then((r) => { if (r.ok) e.waitUntil(cache.put(req, r.clone())); return r; }).catch(() => null);

  if (immutable(url)) return hit || (await fetchAndStore()) || new Response('offline', { status: 503 });
  if (HEAVY.test(url.pathname)) {
    if (hit) {
      if (!refreshed.has(req.url)) { refreshed.add(req.url); e.waitUntil(fetchAndStore({ cache: 'no-cache' })); }
      return hit;
    }
    return (await fetchAndStore()) || new Response('offline', { status: 503 });
  }
  // código: rede primeiro; com cópia em cache, espera no máximo CODE_TIMEOUT_MS
  const net = fetchAndStore({ cache: 'no-cache' });
  if (!hit) return (await net) || new Response('offline', { status: 503 });
  e.waitUntil(net); // a resposta atrasada ainda atualiza o cache para a próxima visita
  const timeout = new Promise((res) => setTimeout(() => res(null), CODE_TIMEOUT_MS));
  return (await Promise.race([net, timeout])) || hit;
}

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || isLab(url)) return;
  if (req.headers?.has?.('range')) return; // pedido por partes (música no <audio>): o navegador fala direto com o servidor; o cache guarda só respostas inteiras
  e.respondWith(respond(e));
});
