// `npm run online`: o SEU PC vira o servidor do jogo (contas, até 3 personagens, multiplayer e chat), sem configurar nada.
// Abre na rede de casa (Wi-Fi): quem estiver na mesma rede joga em http://<IP do PC>:8080. Para amigos fora de casa, use um túnel com HTTPS
// (Cloudflare) e passe o endereço dele em PUBLIC_URL (docs/deploy/publicar-gratis.md, opção B). O banco fica em data/aetheria.db neste PC.
// Qualquer variável já definida (PORT, PUBLIC_URL, ALLOWED_ORIGINS, DB_PATH…) continua valendo.
import { networkInterfaces } from 'node:os';

const port = process.env.PORT || '8080';
// IPv4 da rede local (Wi-Fi/cabo), sem as interfaces internas
const lan = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
process.env.PORT = port;
process.env.HOST ??= '0.0.0.0'; // aceita conexões de outros aparelhos da rede (o Windows pode perguntar se libera o Node no firewall: permita em "Redes privadas")
if (process.env.PUBLIC_URL) process.env.TRUST_PROXY ??= '1'; // com túnel/proxy na frente, o IP real vem no X-Forwarded-For
process.env.ALLOWED_ORIGINS ??= [process.env.PUBLIC_URL, `http://localhost:${port}`, `http://127.0.0.1:${port}`, ...lan.map((ip) => `http://${ip}:${port}`)].filter(Boolean).join(',');

console.log('\n  Aetheria online neste PC');
console.log(`  Neste PC:              http://localhost:${port}`);
for (const ip of lan) console.log(`  Celulares no mesmo Wi-Fi: http://${ip}:${port}`);
if (process.env.PUBLIC_URL) console.log(`  Pela internet:         ${process.env.PUBLIC_URL}`);
else console.log('  Pela internet: rode um túnel (cloudflared) e reinicie com PUBLIC_URL=<endereço https do túnel>');
console.log('  Para parar: Ctrl+C. Contas e personagens ficam em data/aetheria.db.\n');

await import('./start.js');
