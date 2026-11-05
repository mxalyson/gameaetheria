// Operação (P10): saúde, métricas, logs estruturados, validação do ambiente e desligamento limpo.
// /healthz = o processo responde (liveness); /readyz = banco e servidor de jogo prontos (readiness);
// /metrics = números do servidor, só com METRICS_TOKEN (Authorization: Bearer …); sem token configurado a rota não existe.
import { timingSafeEqual } from 'node:crypto';

export function makeLogger(write = (line) => process.stdout.write(line + '\n'), level = 'info') {
  const order = { debug: 0, info: 1, warn: 2, error: 3 };
  const min = order[level] ?? 1;
  const log = (lvl, msg, fields = {}) => { if (order[lvl] >= min) write(JSON.stringify({ t: new Date().toISOString(), level: lvl, msg, ...fields })); };
  return { debug: (m, f) => log('debug', m, f), info: (m, f) => log('info', m, f), warn: (m, f) => log('warn', m, f), error: (m, f) => log('error', m, f) };
}

const int = (v, name, min, max, def) => {
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} inválido: "${v}" (esperado inteiro de ${min} a ${max})`);
  return n;
};

// Valida e normaliza as variáveis de ambiente; erro claro ANTES de abrir portas (em vez de falhar no meio da partida).
// Modo de PORTA ÚNICA (publicação): com PORT definido, um só servidor HTTP entrega o jogo (public/), a API (/api), a operação (/healthz…)
// e o WebSocket (/ws). PUBLIC_URL (ex.: https://aetheria.duckdns.org) vira a origem permitida padrão. Serviços de hospedagem definem PORT sozinhos.
export function readConfig(env = process.env) {
  const port = int(env.PORT, 'PORT', 1, 65535, null);
  const publicUrl = (env.PUBLIC_URL || '').replace(/\/+$/, '') || null;
  const cfg = {
    port, single: port != null, publicUrl,
    dbPath: env.DB_PATH || 'data/aetheria.db',
    host: env.HOST || '127.0.0.1',
    apiPort: int(env.API_PORT, 'API_PORT', 1, 65535, 5176),
    gamePort: int(env.GAME_PORT, 'GAME_PORT', 1, 65535, 5175),
    maxPerIp: int(env.MAX_PER_IP, 'MAX_PER_IP', 1, 10000, 20),
    origins: (env.ALLOWED_ORIGINS || (port != null ? [publicUrl, `http://localhost:${port}`, `http://127.0.0.1:${port}`].filter(Boolean).join(',') : 'http://localhost:5174')).split(',').map((s) => s.trim()).filter(Boolean),
    googleClientId: env.GOOGLE_CLIENT_ID || null,
    gameUrl: env.GAME_URL || (port != null ? '/ws' : null), // porta única: caminho relativo; o navegador monta ws(s)://<mesmo endereço>/ws
    trustProxy: env.TRUST_PROXY === '1',
    metricsToken: env.METRICS_TOKEN || null,
    logLevel: env.LOG_LEVEL || 'info',
    shutdownGraceMs: int(env.SHUTDOWN_GRACE_MS, 'SHUTDOWN_GRACE_MS', 0, 60000, 3000),
  };
  if (publicUrl && !/^https?:\/\/[^\s/]+$/.test(publicUrl)) throw new Error(`PUBLIC_URL inválida "${publicUrl}" (use https://host, sem caminho)`);
  if (!cfg.single && cfg.apiPort === cfg.gamePort) throw new Error('API_PORT e GAME_PORT não podem ser iguais');
  for (const o of cfg.origins) if (!/^https?:\/\/[^\s/]+$/.test(o) || o.endsWith('/')) throw new Error(`ALLOWED_ORIGINS: origem inválida "${o}" (use esquema://host[:porta], sem barra final)`);
  if (cfg.metricsToken && cfg.metricsToken.length < 16) throw new Error('METRICS_TOKEN muito curto (mínimo 16 caracteres)');
  if (!['debug', 'info', 'warn', 'error'].includes(cfg.logLevel)) throw new Error(`LOG_LEVEL inválido: "${cfg.logLevel}"`);
  const publicHost = !['127.0.0.1', 'localhost', '::1'].includes(cfg.host);
  cfg.warnings = [];
  if (cfg.single) { if (publicHost && !publicUrl?.startsWith('https://')) cfg.warnings.push('porta única sem PUBLIC_URL https://: senhas e sessões trafegariam sem TLS; use HTTPS (proxy/Caddy ou o próprio serviço de hospedagem)'); }
  else if (publicHost && !cfg.gameUrl) cfg.warnings.push('HOST público sem GAME_URL: o navegador receberá uma URL ws:// sem TLS');
  if (!cfg.single && publicHost && cfg.gameUrl && !cfg.gameUrl.startsWith('wss://')) cfg.warnings.push('GAME_URL não usa wss://: coloque um proxy com TLS na frente');
  if (cfg.origins.some((o) => o.startsWith('http://') && !/localhost|127\.0\.0\.1/.test(o))) cfg.warnings.push('ALLOWED_ORIGINS contém origem http:// que não é local');
  return cfg;
}

const sameToken = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

// Retorna um handler (req,res) → true se tratou a rota. Plugar como `extra` de api.server().
export function createOps({ db, game, metricsToken = null, startedAt = Date.now(), version = '0.1.0' }) {
  const sendJson = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
  let draining = false;
  const ready = () => {
    if (draining) return { ok: false, reason: 'draining' };
    try { db.raw.prepare('SELECT 1').get(); } catch { return { ok: false, reason: 'db' }; }
    if (!game.port) return { ok: false, reason: 'game' };
    return { ok: true };
  };
  const metrics = () => {
    const mem = process.memoryUsage();
    return {
      version, uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      connections: game.wss.clients.size, rooms: game.hub.rooms.size,
      sessions: game.hub.sessions?.size ?? null, queued: game.hub.queue?.length ?? null,
      ...game.stats, rssMB: Math.round(mem.rss / 1048576), heapMB: Math.round(mem.heapUsed / 1048576),
    };
  };
  function handler(req, res) {
    const path = new URL(req.url, 'http://x').pathname;
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    if (path === '/healthz') { sendJson(res, 200, { ok: true }); return true; }
    if (path === '/readyz') { const r = ready(); sendJson(res, r.ok ? 200 : 503, r); return true; }
    if (path === '/metrics' && metricsToken) {
      const got = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
      if (!sameToken(got, metricsToken)) { sendJson(res, 401, { error: 'unauthorized' }); return true; }
      sendJson(res, 200, metrics()); return true;
    }
    return false;
  }
  return { handler, metrics, ready, setDraining: () => { draining = true; } };
}

// Desligamento limpo: para de aceitar (readyz=503), avisa os clientes, espera um instante e fecha tudo.
export async function gracefulShutdown({ ops, game, httpServer, db, log, graceMs = 3000 }) {
  ops.setDraining();
  log.info('desligando', { conexoes: game.wss.clients.size, salas: game.hub.rooms.size });
  for (const c of game.wss.clients) { try { if (c.readyState === 1) c.send(JSON.stringify({ v: 4, t: 'notice', code: 'server_closing', retryMs: 5000 })); } catch { /* conexão já caiu */ } }
  await new Promise((r) => setTimeout(r, graceMs));
  try { game.hub.flushAll(); } catch (e) { log.error('falha ao gravar salas', { erro: String(e) }); } // recompensas pendentes das instâncias
  await game.close();
  await new Promise((r) => httpServer.close(r));
  try { db.close?.(); } catch { /* ok */ }
  log.info('desligado');
}

// IP do cliente atrás do proxy de confiança: o ÚLTIMO valor de X-Forwarded-For é o que o nosso proxy acrescenta; os anteriores vêm do
// próprio cliente (forjáveis) e, se usados, deixavam burlar o limite de tentativas de login trocando o cabeçalho a cada pedido.
export const clientIp = (xff) => String(xff ?? '').split(',').map((s) => s.trim()).filter(Boolean).pop() ?? '';
