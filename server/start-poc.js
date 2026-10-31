// Inicia o servidor autoritativo da prova de conceito (P4): `npm run server:poc`.
// Escuta só em 127.0.0.1 (sem autenticação ainda). Para testar com 2 navegadores: abra
// http://localhost:5174/labs/net-poc/index.html em duas abas (com `npm start` rodando).
import { createGameServer } from './game-server.js';

const port = Number(process.env.GAME_PORT) || 5175;
const origins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : null;
const srv = createGameServer({ port, allowedOrigins: origins });
srv.ready.then(() => console.log(`Servidor autoritativo (PoC) em ws://127.0.0.1:${srv.port}`));
