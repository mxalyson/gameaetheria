// Clientes sintéticos do teste de carga (processo separado do servidor). Uso interno de tools/load-test.mjs.
// Cada cliente é um convidado: entra, enfileira, joga partidas (anda ao acaso, ataca, usa skills) e repete. Mede snapshots, bytes e RTT.
import WebSocket from 'ws';

const [port, count, seconds, mode, startIdx] = process.argv.slice(2);
const N = Number(count), DUR = Number(seconds) * 1000, V = 4; // PROTOCOL_VERSION (conferido no teste de carga)
const classes = ['warrior', 'mage', 'archer', 'cleric'];
const stats = { clients: N, connected: 0, welcomed: 0, matches: 0, snaps: 0, bytes: 0, rejects: 0, closes: 0, rtt: [], errors: 0 };

function client(i) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  let inMatch = false, seq = 0, mx = 0, my = 0, timer = null, pinger = null;
  const send = (o) => { if (ws.readyState === 1) ws.send(JSON.stringify({ v: V, ...o })); };
  ws.on('open', () => { stats.connected++; send({ t: 'hello', name: `L${startIdx}_${i}`, classId: classes[i % 4] }); });
  ws.on('message', (d) => {
    const raw = d.toString(); let m;
    try { m = JSON.parse(raw); } catch { stats.errors++; return; }
    if (m.t === 'welcome') { stats.welcomed++; send({ t: 'queue', mode }); pinger = setInterval(() => send({ t: 'ping', ts: performance.now() }), 1000); }
    else if (m.t === 'match_found') {
      stats.matches++; inMatch = true; seq = 0;
      timer = setInterval(() => {
        if (Math.random() < 0.06) { mx = Math.floor(Math.random() * 3) - 1; my = Math.floor(Math.random() * 3) - 1; }
        send({ t: 'input', seq: ++seq, mx, my, aimX: 900 + Math.random() * 200 - 100, aimY: 900 + Math.random() * 200 - 100, attack: Math.random() < 0.7, cast: Math.random() < 0.03 ? Math.floor(Math.random() * 3) : null });
      }, 33);
    } else if (m.t === 'snap') { stats.snaps++; stats.bytes += raw.length; }
    else if (m.t === 'pong') stats.rtt.push(performance.now() - m.ts);
    else if (m.t === 'match_end') { inMatch = false; clearInterval(timer); send({ t: 'queue', mode }); }
    else if (m.t === 'reject') stats.rejects++;
  });
  ws.on('close', () => { stats.closes++; clearInterval(timer); clearInterval(pinger); void inMatch; });
  ws.on('error', () => { stats.errors++; });
  return ws;
}

const sockets = [];
for (let i = 0; i < N; i++) sockets.push(client(i));
setTimeout(() => {
  stats.rtt.sort((a, b) => a - b);
  const p = (q) => stats.rtt[Math.min(stats.rtt.length - 1, Math.floor(stats.rtt.length * q))] ?? null;
  console.log(JSON.stringify({ ...stats, rtt: undefined, rttP50: p(0.5), rttP95: p(0.95), rttP99: p(0.99), rttMax: stats.rtt.at(-1) ?? null, rttSamples: stats.rtt.length }));
  for (const s of sockets) s.terminate();
  process.exit(0);
}, DUR);
