// Servidor com contas (P5): API HTTP + WebSocket autoritativo + banco SQLite. `npm run server`.
// Configuração por variáveis de ambiente (nenhum segredo fica no código nem no frontend; GOOGLE_CLIENT_ID é público por natureza):
//   DB_PATH (padrão data/aetheria.db) · API_PORT (5176) · GAME_PORT (5175) · HOST (127.0.0.1)
//   ALLOWED_ORIGINS (lista separada por vírgula; padrão http://localhost:5174) · GOOGLE_CLIENT_ID (opcional) · GAME_URL (wss://… público do jogo) · TRUST_PROXY=1 atrás de proxy
//   P11.3: STRICT_PVE=1 (recusa salvamentos que aumentem XP/ouro/itens/abates; só o servidor de zona e as transações rendem)
//   P10: METRICS_TOKEN (≥ 16 caracteres; liga GET /metrics) · LOG_LEVEL (debug|info|warn|error) · SHUTDOWN_GRACE_MS (3000) · MAX_PER_IP (20)
// Rotas de operação na porta da API: /healthz (vivo), /readyz (pronto), /metrics (com token). Logs são linhas JSON.
// Em produção: coloque atrás de um proxy com TLS (HTTPS/WSS) — este processo fala HTTP/WS simples.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb } from './db.js';
import { createApi } from './api.js';
import { createGameServer } from './game-server.js';
import { readConfig, makeLogger, createOps, gracefulShutdown } from './ops.js';

let cfg;
try { cfg = readConfig(process.env); } catch (e) { console.error('Configuração inválida:', e.message); process.exit(2); }
const log = makeLogger(undefined, cfg.logLevel);
for (const w of cfg.warnings) log.warn('configuração', { aviso: w });

mkdirSync(dirname(cfg.dbPath), { recursive: true });
const db = openDb(cfg.dbPath);
const gameUrl = cfg.gameUrl || `ws://${cfg.host}:${cfg.gamePort}`; // URL que o NAVEGADOR usa para o WebSocket (em produção: wss://…)
const strictPve = process.env.STRICT_PVE === '1'; // P11.3: recusa ganhos de PvE vindos do cliente (ver server/plausible.js); opcional até o cliente migrar tudo
const api = createApi(db, { googleClientId: cfg.googleClientId, origins: cfg.origins, trustProxy: cfg.trustProxy, gameUrl, strictPve });
const game = createGameServer({ port: cfg.gamePort, host: cfg.host, db, allowedOrigins: cfg.origins, trustProxy: cfg.trustProxy, maxPerIp: cfg.maxPerIp });
const ops = createOps({ db, game, metricsToken: cfg.metricsToken });
const http = api.server((req, res) => { if (!ops.handler(req, res)) res.writeHead(404).end(); });
http.listen(cfg.apiPort, cfg.host, () => log.info('API iniciada', { host: cfg.host, porta: cfg.apiPort, origens: cfg.origins, metricas: !!cfg.metricsToken }));
game.ready.then(() => log.info('servidor de jogo iniciado', { host: cfg.host, porta: game.port, banco: cfg.dbPath, google: !!cfg.googleClientId }));
setInterval(() => db.purgeSessions(), 3600_000).unref();

let closing = false;
const stop = async (sig) => {
  if (closing) return; closing = true;
  log.info('sinal recebido', { sinal: sig });
  try { await gracefulShutdown({ ops, game, httpServer: http, db, log, graceMs: cfg.shutdownGraceMs }); process.exit(0); } catch (e) { log.error('falha ao desligar', { erro: String(e) }); process.exit(1); }
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('uncaughtException', (e) => { log.error('exceção não tratada', { erro: e?.stack ?? String(e) }); stop('uncaughtException'); });
process.on('unhandledRejection', (e) => log.error('promessa rejeitada', { erro: String(e?.stack ?? e) }));
