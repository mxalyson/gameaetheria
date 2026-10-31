// Ajudantes dos testes de rede: cliente WebSocket de teste, atalhos de mensagens e uma "perseguição" que contorna pilares.
import WebSocket from 'ws';
import { PROTOCOL_VERSION } from '../../public/src/core/protocol.js';
import { SnapshotDecoder } from '../../public/src/core/snapshot.js';

export { PROTOCOL_VERSION };

export function connect(srv) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    const c = { ws, msgs: [], closed: null, waiters: [], dec: new SnapshotDecoder(), snapBytes: 0, snapCount: 0 };
    ws.on('message', (d) => {
      const raw = d.toString(); let m = JSON.parse(raw);
      if (m.t === 'match_found') c.dec.init(m); // estáticos dos jogadores; os snapshots seguintes são deltas
      else if (m.t === 'snap') { c.snapBytes += raw.length; c.snapCount++; m = c.dec.apply(m); }
      c.msgs.push(m); c.waiters = c.waiters.filter((w) => !w(m));
    });
    ws.on('close', (code) => { c.closed = code; c.waiters = c.waiters.filter((w) => !w(null)); });
    ws.on('open', () => resolve(c));
    ws.on('error', reject);
    c.send = (o) => ws.send(JSON.stringify({ v: PROTOCOL_VERSION, ...o }));
    c.raw = (t) => ws.send(t);
    c.waitFor = (pred, ms = 8000) => new Promise((res, rej) => {
      const found = c.msgs.find(pred); if (found) return res(found);
      const to = setTimeout(() => rej(new Error('timeout esperando mensagem')), ms);
      c.waiters.push((m) => { if (m && pred(m)) { clearTimeout(to); res(m); return true; } return false; });
    });
    c.waitClose = (ms = 8000) => new Promise((res, rej) => { if (c.closed != null) return res(c.closed); const to = setTimeout(() => rej(new Error('timeout esperando fechar')), ms); c.waiters.push((m) => { if (m === null) { clearTimeout(to); res(c.closed); return true; } return false; }); });
    // garante que o servidor já processou tudo o que enviamos antes (mensagens chegam em ordem)
    c.sync = async () => { const ts = Math.random(); c.send({ t: 'ping', ts }); await c.waitFor((m) => m.t === 'pong' && m.ts === ts); };
    c.last = (t) => [...c.msgs].reverse().find((m) => m.t === t);
    c.all = (t) => c.msgs.filter((m) => m.t === t);
  });
}

export const hello = (name, classId, extra = {}) => ({ t: 'hello', name, classId, ...extra });
export const input = (seq, mx, my, extra = {}) => ({ t: 'input', seq, mx, my, aimX: 550, aimY: 260, attack: false, cast: null, ...extra });
export const closeAll = async (srv, ...cs) => { for (const c of cs) c.ws.terminate(); await srv.close(); };

// Persegue `target` com o jogador `me` (cliente `c`), contornando pilares, e ataca sem parar até `until()` ser verdadeiro.
// O estado do servidor é lido direto (é teste); só INTENÇÕES vão pela rede, e só quando a direção muda.
export async function chase(srv, c, me, target, until, { maxTicks = 60 * 120, seq = { n: 1000 } } = {}) {
  const pillars = srv.room.world.layout.obstacles.filter((o) => o.block);
  let last = '';
  for (let g = 0; g < maxTicks && !until(); g++) {
    srv.step(1);
    if (target.dead || me.dead) break;
    const dx = target.x - me.x, dy = target.y - me.y, d = Math.hypot(dx, dy) || 1;
    let mx = dx / d, my = dy / d;
    for (const o of pillars) {
      const ox = o.x - me.x, oy = o.y - me.y, od = Math.hypot(ox, oy);
      if (od < 110 && (ox * mx + oy * my) / od > 0.5) { const side = mx * oy - my * ox > 0 ? -1 : 1; const sx = -my * side * 1.6, sy = mx * side * 1.6; mx += sx; my += sy; break; }
    }
    const q = (v) => (Math.abs(v) < 0.35 ? 0 : Math.sign(v));
    const stop = d <= 58;
    const key = `${stop ? 0 : q(mx)},${stop ? 0 : q(my)}`;
    if (key !== last) {
      last = key;
      const [qx, qy] = key.split(',').map(Number);
      c.send(input(seq.n++, qx, qy, { attack: true, aimX: target.x, aimY: target.y }));
      await c.sync();
    } else if (g % 40 === 0) { c.send(input(seq.n++, ...key.split(',').map(Number), { attack: true, aimX: target.x, aimY: target.y })); await c.sync(); } // renova a mira
  }
}
