// Servidor com contas (P5): API HTTP + WebSocket autoritativo + banco SQLite. `npm run server`.
// Configuração por variáveis de ambiente (nenhum segredo fica no código nem no frontend; GOOGLE_CLIENT_ID é público por natureza):
//   DB_PATH (padrão data/aetheria.db) · API_PORT (5176) · GAME_PORT (5175) · HOST (127.0.0.1)
//   ALLOWED_ORIGINS (lista separada por vírgula; padrão http://localhost:5174) · GOOGLE_CLIENT_ID (opcional) · TRUST_PROXY=1 atrás de proxy
// Em produção: coloque atrás de um proxy com TLS (HTTPS/WSS) — este processo fala HTTP/WS simples.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb } from './db.js';
import { createApi } from './api.js';
import { createGameServer } from './game-server.js';

const env = process.env;
const dbPath = env.DB_PATH || 'data/aetheria.db';
const host = env.HOST || '127.0.0.1';
const apiPort = Number(env.API_PORT) || 5176, gamePort = Number(env.GAME_PORT) || 5175;
const origins = (env.ALLOWED_ORIGINS || 'http://localhost:5174').split(',').map((s) => s.trim()).filter(Boolean);

mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
const api = createApi(db, { googleClientId: env.GOOGLE_CLIENT_ID || null, origins, trustProxy: env.TRUST_PROXY === '1' });
const http = api.server();
http.listen(apiPort, host, () => console.log(`API de contas em http://${host}:${apiPort}  (origens: ${origins.join(', ')})`));
const game = createGameServer({ port: gamePort, host, db, allowedOrigins: origins });
game.ready.then(() => console.log(`Servidor de jogo em ws://${host}:${game.port}  · banco: ${dbPath} · Google: ${env.GOOGLE_CLIENT_ID ? 'ligado' : 'desligado'}`));
setInterval(() => db.purgeSessions(), 3600_000).unref();
