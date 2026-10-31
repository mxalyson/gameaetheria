// Cliente de laboratório do servidor autoritativo (P4). Envia só intenções; desenha o que o servidor confirma.
// Interpolação dos outros jogadores (100 ms no passado) e predição suave do próprio movimento (corrigida pelo servidor).
// Marcadores simples de depuração — NÃO é arte do jogo.
import { PROTOCOL_VERSION } from '../../src/core/protocol.js';

const $ = (id) => document.getElementById(id);
const cv = $('c'), g = cv.getContext('2d');
const q = new URLSearchParams(location.search);
const DEFAULT_URL = q.get('server') || `ws://${location.hostname || '127.0.0.1'}:5175`;
const COLORS = { warrior: '#e0635a', mage: '#6a7cf0', archer: '#4fae7a', cleric: '#e8c25a' };
const INITIAL = { warrior: 'G', mage: 'M', archer: 'A', cleric: 'C' };
const INTERP_MS = 100;

$('name').value = q.get('name') || 'Jogador' + Math.floor(Math.random() * 90 + 10);
$('cls').value = q.get('class') || 'warrior';
$('url').value = DEFAULT_URL;

const net = window.net = {
  ws: null, connected: false, me: null, slot: 0, token: null, arena: null, state: 'desconectado', countdown: 0, winner: 0,
  snaps: [], last: null, ack: 0, rtt: 0, events: [], floaters: [], rejects: [], pred: null, seq: 0,
  input: { mx: 0, my: 0, aimX: 0, aimY: 0, attack: false, cast: null },
  setInput(i) { Object.assign(net.input, i); },
  sendRaw(t) { net.ws?.send(t); },
};

function setStatus(t) { $('status').textContent = t; net.status = t; }

function connect() {
  const url = $('url').value;
  open(url, null);
}

function open(url, token) {
  net.ws?.close();
  const ws = net.ws = new WebSocket(url);
  setStatus('conectando…');
  ws.onopen = () => {
    net.connected = true; setStatus('conectado');
    ws.send(JSON.stringify({ v: PROTOCOL_VERSION, t: 'hello', name: $('name').value, classId: $('cls').value, token }));
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'welcome') { net.me = m.you; net.slot = m.slot; net.token = m.token; net.arena = m.arena; setStatus(`você é o jogador ${m.slot}`); }
    else if (m.t === 'snap') onSnap(m);
    else if (m.t === 'pong') net.rtt = Math.round(performance.now() - m.ts);
    else if (m.t === 'reject') { net.rejects.push(m.code); setStatus('recusado: ' + m.code); }
  };
  ws.onclose = () => {
    net.connected = false;
    if (net.token) { setStatus('reconectando…'); setTimeout(() => net.ws === ws && open(url, net.token), 800); } // tenta voltar com o token
    else setStatus('desconectado');
  };
}

function onSnap(m) {
  m.at = performance.now();
  net.snaps.push(m); if (net.snaps.length > 30) net.snaps.shift();
  net.last = m; net.state = m.state; net.countdown = m.countdown; net.winner = m.winner; net.ack = m.ack;
  for (const e of m.events) {
    net.events.push(e); if (net.events.length > 200) net.events.shift();
    if (e.e === 'hit') {
      const t = m.actors.find((a) => a.id === e.target);
      if (t) net.floaters.push({ x: t.x, y: t.y - 30, text: e.absorbed ? 'absorvido' : String(e.amount), crit: e.crit, t0: m.at });
    }
  }
  // reconciliação suave da predição: aproxima da posição do servidor; se divergir muito, "teleporta"
  const mine = m.actors.find((a) => a.id === net.me);
  if (mine) {
    if (!net.pred || Math.hypot(net.pred.x - mine.x, net.pred.y - mine.y) > 120 || mine.dead) net.pred = { x: mine.x, y: mine.y };
    net.srv = mine;
  }
}

// ---------- entrada ----------
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  const k = e.key.toLowerCase(); keys.add(k);
  if (['1', '2', '3'].includes(k)) net.input.cast = Number(k) - 1;
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
cv.addEventListener('mousedown', () => { net.input.attack = true; });
addEventListener('mouseup', () => { net.input.attack = false; });
const mouse = { x: 0, y: 0 };
cv.addEventListener('mousemove', (e) => { const r = cv.getBoundingClientRect(); mouse.x = (e.clientX - r.left) * cv.width / r.width; mouse.y = (e.clientY - r.top) * cv.height / r.height; });

const scale = () => (net.arena ? Math.min(cv.width, cv.height) / net.arena.w : 0.65);
const toWorld = (sx, sy) => ({ x: sx / scale(), y: sy / scale() });

let useKeys = true; // testes automatizados desligam o teclado e usam net.setInput
net.manual = () => { useKeys = false; };

// envia a 30 Hz
setInterval(() => {
  if (!net.connected || net.me == null || net.ws.readyState !== 1) return;
  const i = net.input;
  if (useKeys) {
    i.mx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    i.my = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0);
    const w = toWorld(mouse.x, mouse.y); i.aimX = w.x; i.aimY = w.y;
  }
  net.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, t: 'input', seq: ++net.seq, mx: i.mx, my: i.my, aimX: i.aimX, aimY: i.aimY, attack: !!i.attack, cast: i.cast }));
  i.cast = null; // clique de skill vale uma vez
}, 1000 / 30);
setInterval(() => { if (net.connected && net.ws.readyState === 1) net.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, t: 'ping', ts: performance.now() })); }, 1000);

// ---------- desenho ----------
function interpolated(now) {
  // estado dos OUTROS: duas snapshots em volta de (agora - INTERP_MS)
  const t = now - INTERP_MS, s = net.snaps;
  if (s.length < 2) return net.last?.actors ?? [];
  let a = s[0], b = s[1];
  for (let i = 0; i < s.length - 1; i++) { if (s[i].at <= t && t <= s[i + 1].at) { a = s[i]; b = s[i + 1]; break; } if (t > s[i + 1].at) { a = s[i]; b = s[i + 1]; } }
  const k = Math.max(0, Math.min(1, b.at === a.at ? 1 : (t - a.at) / (b.at - a.at)));
  return b.actors.map((bb) => {
    const aa = a.actors.find((x) => x.id === bb.id) ?? bb;
    return { ...bb, x: aa.x + (bb.x - aa.x) * k, y: aa.y + (bb.y - aa.y) * k };
  });
}

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  // predição do próprio movimento (só andar) + correção suave
  if (net.pred && net.srv && !net.srv.dead && net.state === 'fight') {
    const i = net.input, len = Math.hypot(i.mx, i.my);
    if (len > 0.01) { net.pred.x += (i.mx / len) * net.srv.spd * dt; net.pred.y += (i.my / len) * net.srv.spd * dt; }
    net.pred.x += (net.srv.x - net.pred.x) * 0.12; net.pred.y += (net.srv.y - net.pred.y) * 0.12;
  } else if (net.pred && net.srv) { net.pred.x = net.srv.x; net.pred.y = net.srv.y; }

  const s = scale();
  g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#1a2036'; g.fillRect(0, 0, cv.width, cv.height);
  if (net.arena) {
    g.fillStyle = '#2c3556'; g.beginPath(); g.arc(net.arena.w / 2 * s, net.arena.h / 2 * s, net.arena.radius * s, 0, 7); g.fill();
    g.strokeStyle = '#4a5686'; g.lineWidth = 3; g.stroke();
  }
  for (const a of interpolated(now)) {
    const mine = a.id === net.me;
    const x = (mine && net.pred ? net.pred.x : a.x) * s, y = (mine && net.pred ? net.pred.y : a.y) * s;
    g.globalAlpha = a.dead ? 0.35 : a.online ? 1 : 0.5;
    g.fillStyle = COLORS[a.classId] ?? '#999'; g.beginPath(); g.arc(x, y, 15 * s * 1.6, 0, 7); g.fill();
    g.lineWidth = mine ? 4 : 2; g.strokeStyle = a.slot === 1 ? '#6fb8ff' : '#ff6b6b'; g.stroke();
    g.fillStyle = '#111'; g.font = `700 ${14}px system-ui`; g.textAlign = 'center'; g.fillText(INITIAL[a.classId] ?? '?', x, y + 5);
    if (a.swing) { g.strokeStyle = '#fff'; g.beginPath(); g.arc(x, y, 34, a.facing - 0.9, a.facing + 0.9); g.stroke(); }
    if (a.stun) { g.fillStyle = '#ffe9a0'; g.fillText('✦', x, y - 28); }
    g.fillStyle = '#0008'; g.fillRect(x - 24, y - 30, 48, 6);
    g.fillStyle = a.slot === 1 ? '#6fb8ff' : '#ff6b6b'; g.fillRect(x - 24, y - 30, 48 * Math.max(0, a.hp) / a.maxHp, 6);
    g.fillStyle = '#f3e8c8'; g.font = '12px system-ui'; g.fillText(`${a.name}${a.online ? '' : ' (off)'}`, x, y - 36);
    g.globalAlpha = 1;
  }
  for (const f of net.floaters) {
    const age = (now - f.t0) / 900; if (age > 1) continue;
    g.fillStyle = f.crit ? '#ffd166' : '#fff'; g.font = `800 ${f.crit ? 20 : 15}px system-ui`; g.textAlign = 'center';
    g.fillText(f.text, f.x * s, (f.y - age * 40) * s);
  }
  net.floaters = net.floaters.filter((f) => now - f.t0 < 900);
  let banner = '';
  if (net.state === 'waiting') banner = 'Aguardando o outro jogador…';
  else if (net.state === 'countdown') banner = `Começa em ${Math.ceil(net.countdown)}`;
  else if (net.state === 'over') banner = net.winner === net.slot ? 'VITÓRIA!' : 'Derrota';
  if (banner) { g.fillStyle = '#f3e8c8'; g.font = '800 34px system-ui'; g.textAlign = 'center'; g.fillText(banner, cv.width / 2, 70); }
  g.fillStyle = '#9aa3b8'; g.font = '12px system-ui'; g.textAlign = 'left';
  g.fillText(`ping ${net.rtt} ms · tick ${net.last?.tick ?? '-'} · estado ${net.state}`, 10, cv.height - 10);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

$('go').onclick = connect;
if (q.get('auto') === '1') connect();
