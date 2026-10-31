// Teste de carga do servidor de jogo com CLIENTES WEBSOCKET REAIS (processos separados), partidas reais e relógio real.
// Uso: npm run load -- --clients 160 --seconds 30 [--mode 4v4] [--procs 2]
// O servidor roda neste processo (medimos o CPU e a memória DELE e o atraso do laço de eventos); os clientes rodam em processos filhos.
// É uma MEDIÇÃO nesta máquina (cliente e servidor competem pela mesma CPU) — não uma promessa de capacidade em produção.
import { spawn } from 'node:child_process';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createGameServer } from '../server/game-server.js';
import { PROTOCOL_VERSION } from '../public/src/core/protocol.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const CLIENTS = Number(arg('clients', 64)), SECONDS = Number(arg('seconds', 30)), MODE = arg('mode', '4v4'), PROCS = Math.max(1, Number(arg('procs', CLIENTS > 120 ? 2 : 1)));
if (PROTOCOL_VERSION !== 4) { console.error('load-clients.mjs usa o protocolo v4; ajuste V em tools/load-clients.mjs'); process.exit(1); }

const srv = createGameServer({ port: 0, seed: 7, maxMsgPerSec: 200, reconnectSec: 5, maxPerIp: 100000, maxConnections: 100000 }); // todos os clientes vêm de 127.0.0.1
await srv.ready;
const loop = monitorEventLoopDelay({ resolution: 5 }); loop.enable();
const cpu0 = process.cpuUsage(), t0 = performance.now();
const clientsFile = fileURLToPath(new URL('./load-clients.mjs', import.meta.url));
const per = Math.ceil(CLIENTS / PROCS);
const results = await Promise.all(Array.from({ length: PROCS }, (_, i) => new Promise((resolve) => {
  const n = Math.min(per, CLIENTS - i * per);
  const child = spawn(process.execPath, [clientsFile, String(srv.port), String(n), String(SECONDS), MODE, String(i)], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = ''; child.stdout.on('data', (d) => { out += d; });
  child.on('close', () => { try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch { resolve({ error: out }); } });
})));
const wall = (performance.now() - t0) / 1000, cpu = process.cpuUsage(cpu0);
loop.disable();

const sum = (k) => results.reduce((s, r) => s + (r[k] ?? 0), 0);
const rooms = srv.hub.rooms.size, mem = process.memoryUsage();
const snaps = sum('snaps'), bytes = sum('bytes'), conns = sum('welcomed');
const cpuPct = ((cpu.user + cpu.system) / 1e6 / wall) * 100;
const rtt = (k) => Math.max(...results.map((r) => r[k] ?? 0));
console.log(`Carga: ${CLIENTS} clientes (${PROCS} proc.) · modo ${MODE} · ${SECONDS}s · partidas iniciadas ${sum('matches')} · salas ativas no fim ${rooms}`);
console.log(`Conectados ${sum('connected')}/${CLIENTS} · entraram no lobby ${conns} · recusas ${sum('rejects')} · quedas ${sum('closes')} · erros ${sum('errors')}`);
console.log(`Snapshots: ${snaps} (${(snaps / Math.max(1, conns) / wall).toFixed(1)}/s por cliente; ideal ≈ 20 enquanto em partida) · média ${(bytes / Math.max(1, snaps)).toFixed(0)} B · ≈ ${(bytes / Math.max(1, conns) / wall / 1024).toFixed(1)} KB/s por cliente`);
console.log(`RTT de ping (ms): p50 ${rtt('rttP50').toFixed(1)} · p95 ${rtt('rttP95').toFixed(1)} · p99 ${rtt('rttP99').toFixed(1)} · máx ${rtt('rttMax').toFixed(1)}   (mesma máquina: mede fila do servidor, não rede)`);
console.log(`Servidor: CPU ≈ ${cpuPct.toFixed(0)}% de um núcleo · atraso do laço de eventos p50 ${(loop.percentile(50) / 1e6).toFixed(1)} ms · p99 ${(loop.percentile(99) / 1e6).toFixed(1)} ms · máx ${(loop.max / 1e6).toFixed(1)} ms · RSS ${(mem.rss / 1048576).toFixed(0)} MB · heap ${(mem.heapUsed / 1048576).toFixed(0)} MB`);
await srv.close();
process.exit(0);
