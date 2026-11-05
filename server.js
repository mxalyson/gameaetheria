// Servidor estático mínimo (sem dependências), para desenvolvimento: `npm start`.
// Publicação (jogo + contas + multiplayer num só endereço): `PORT=8080 npm run server` (server/start.js, modo de porta única).
import http from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStatic } from './server/static.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const PORT = Number(process.env.PORT) || 5174;

http.createServer(createStatic(ROOT)).listen(PORT, () => console.log(`Aetheria rodando em http://localhost:${PORT}`));
