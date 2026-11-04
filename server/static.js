// Arquivos estáticos do jogo (public/), sem dependências. Usado por server.js (desenvolvimento) e pelo modo de porta única de server/start.js
// (publicação: um endereço serve o jogo, a API e o WebSocket).
// headExtra: HTML inserido no <head> do index.html (ex.: <meta name="aetheria-api" content="same-origin">, que liga o modo online no cliente).
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

export const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.mjs': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// cache: 'none' (desenvolvimento: sempre lê do disco, sem cache) | 'prod' (arte com ?v= imutável por 1 ano; o resto revalida)
export function createStatic(root, { headExtra = '', cache = 'none' } = {}) {
  return async function serveStatic(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    let url, urlPath;
    try { url = new URL(req.url, 'http://x'); urlPath = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end('bad request'); return; } // B26: % inválido não derruba o Node
    const rel = normalize(urlPath === '/' ? '/index.html' : urlPath).replace(/^[\\/]+/, '');
    const file = join(root, rel);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      let data = await readFile(file);
      if (headExtra && rel === 'index.html') data = Buffer.from(data.toString('utf8').replace('<head>', '<head>\n  ' + headExtra));
      const ver = url.searchParams.has('v');
      const cc = cache === 'none' ? 'no-store' : ver ? 'public, max-age=31536000, immutable' : 'no-cache';
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': cc, 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404).end('not found');
    }
  };
}
