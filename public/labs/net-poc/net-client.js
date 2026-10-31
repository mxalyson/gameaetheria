// Cliente de laboratório do servidor autoritativo (P4–P6): lobby (fila, grupo, convites) + partida 1×1/2×2/4×4.
// Envia só intenções; desenha o que o servidor confirma. Interpolação dos outros jogadores (100 ms no passado) e predição suave do próprio
// movimento. Marcadores simples de depuração — NÃO é arte do jogo.
import { PROTOCOL_VERSION } from '../../src/core/protocol.js';

const $ = (id) => document.getElementById(id);
const cv = $('c'), g = cv.getContext('2d');
const q = new URLSearchParams(location.search);
const COLORS = { warrior: '#e0635a', mage: '#6a7cf0', archer: '#4fae7a', cleric: '#e8c25a' };
const INITIAL = { warrior: 'G', mage: 'M', archer: 'A', cleric: 'C' };
const TEAM = { 1: '#6fb8ff', 2: '#ff6b6b' };
const INTERP_MS = 100;

$('name').value = q.get('name') || 'Jogador' + Math.floor(Math.random() * 90 + 10);
$('cls').value = q.get('class') || 'warrior';
$('url').value = q.get('server') || `ws://${location.hostname || '127.0.0.1'}:5175`;

const net = window.net = {
  ws: null, connected: false, joined: false, token: null, name: null, status: 'desconectado',
  me: null, team: 0, mode: null, room: null, arena: null, objective: null, players: [],
  state: 'lobby', countdown: 0, winner: 0, reason: null, matchInfo: null,
  party: null, invites: [], queue: null, notes: [], rejects: [], reward: null,
  snaps: [], last: null, ack: 0, rtt: 0, events: [], floaters: [], pred: null, srv: null, seq: 0,
  input: { mx: 0, my: 0, aimX: 0, aimY: 0, attack: false, cast: null },
  setInput(i) { Object.assign(net.input, i); },
  sendRaw(t) { net.ws?.send(t); },
  send(o) { if (net.ws?.readyState === 1) net.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, ...o })); },
};
const setStatus = (t) => { $('status').textContent = t; net.status = t; };
const note = (t) => { net.notes.push(t); if (net.notes.length > 20) net.notes.shift(); $('notes').textContent = t; };

function connect() { open(null); }
function open(token) {
  net.ws?.close();
  const ws = net.ws = new WebSocket($('url').value);
  setStatus('conectando…');
  ws.onopen = () => {
    net.connected = true; setStatus('conectado');
    const msg = { v: PROTOCOL_VERSION, t: 'hello', name: $('name').value, classId: $('cls').value, token };
    if (q.get('session')) Object.assign(msg, { session: q.get('session'), characterId: Number(q.get('char')) }, { name: undefined, classId: undefined }); // jogador com conta
    ws.send(JSON.stringify(msg));
  };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onclose = () => {
    net.connected = false;
    if (net.token) { setStatus('reconectando…'); setTimeout(() => net.ws === ws && open(net.token), 800); } // volta com o token (mantém sala e grupo)
    else setStatus('desconectado');
  };
}

function onMessage(m) {
  switch (m.t) {
    case 'welcome': net.joined = true; net.token = m.token; net.name = m.name; setStatus(`${m.name} — no lobby`); break;
    case 'snap': onSnap(m); break;
    case 'pong': net.rtt = Math.round(performance.now() - m.ts); break;
    case 'reject': net.rejects.push(m.code); setStatus('recusado: ' + m.code); note('Recusado: ' + m.code + (m.minLevel ? ` (nível ${m.minLevel})` : '')); break;
    case 'queue': net.queue = m.state === 'cancelled' ? null : { mode: m.mode, waited: m.waited ?? 0 }; renderLobby(); break;
    case 'party': net.party = m.id ? m : null; renderLobby(); break;
    case 'invite': net.invites.push({ partyId: m.partyId, from: m.from }); renderLobby(); break;
    case 'notice': note(m.code + (m.name ? ': ' + m.name : '')); break;
    case 'match_found':
      Object.assign(net, { me: m.you, team: m.team, mode: m.mode, room: m.room, arena: m.arena, objective: m.objective, players: m.players, state: 'countdown', queue: null, snaps: [], pred: null, srv: null, seq: 0, reward: null });
      setStatus(`partida ${m.mode} — time ${m.team}`); renderLobby(); break;
    case 'match_end': net.state = 'lobby'; net.me = null; net.room = null; net.matchInfo = null; setStatus(`${net.name} — no lobby`); renderLobby(); break;
    case 'reward': net.reward = m; note(`${m.won ? 'Vitória' : m.result === 'draw' ? 'Empate' : 'Derrota'}: +${m.gold} ouro, +${m.xp} XP, rating ${m.ratingDelta >= 0 ? '+' : ''}${m.ratingDelta}`); break;
  }
}

function onSnap(m) {
  m.at = performance.now();
  net.snaps.push(m); if (net.snaps.length > 30) net.snaps.shift();
  Object.assign(net, { last: m, state: m.state, countdown: m.countdown, winner: m.winner, reason: m.reason, ack: m.ack, matchInfo: m.match });
  for (const e of m.events) {
    net.events.push(e); if (net.events.length > 300) net.events.shift();
    if (e.e === 'hit') { const t = m.actors.find((a) => a.id === e.target); if (t) net.floaters.push({ x: t.x, y: t.y - 30, text: e.absorbed ? 'absorvido' : String(e.amount), crit: e.crit, t0: m.at }); }
  }
  const mine = m.actors.find((a) => a.id === net.me);
  if (mine) {
    if (!net.pred || Math.hypot(net.pred.x - mine.x, net.pred.y - mine.y) > 120 || mine.dead) net.pred = { x: mine.x, y: mine.y };
    net.srv = mine;
  }
}

function renderLobby() {
  const p = net.party;
  $('party').textContent = p ? `Grupo (líder ${p.leader}): ` + p.members.map((x) => `${x.name}${x.online ? '' : ' (off)'}`).join(', ') : (net.queue ? `Na fila ${net.queue.mode}… ${net.queue.waited}s` : 'Sem grupo.');
  if (p && net.queue) $('party').textContent += ` · fila ${net.queue.mode}`;
  const box = $('invites'); box.textContent = '';
  for (const inv of net.invites) {
    const s = document.createElement('span'); s.textContent = `${inv.from} convidou você `;
    const ok = document.createElement('button'); ok.textContent = 'Aceitar'; ok.onclick = () => { net.send({ t: 'party_accept', partyId: inv.partyId }); net.invites = net.invites.filter((x) => x !== inv); renderLobby(); };
    const no = document.createElement('button'); no.textContent = 'Recusar'; no.style.background = '#6a2c2c'; no.onclick = () => { net.send({ t: 'party_decline', partyId: inv.partyId }); net.invites = net.invites.filter((x) => x !== inv); renderLobby(); };
    s.append(ok, no); box.append(s);
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
const scale = () => (net.arena ? Math.min(cv.width, cv.height) / net.arena.w : 0.4);
let useKeys = true; // testes automatizados desligam o teclado e usam net.setInput
net.manual = () => { useKeys = false; };

setInterval(() => {
  if (!net.connected || net.me == null || net.ws.readyState !== 1) return;
  const i = net.input;
  if (useKeys) {
    i.mx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    i.my = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0);
    i.aimX = mouse.x / scale(); i.aimY = mouse.y / scale();
  }
  net.send({ t: 'input', seq: ++net.seq, mx: i.mx, my: i.my, aimX: i.aimX, aimY: i.aimY, attack: !!i.attack, cast: i.cast });
  i.cast = null;
}, 1000 / 30);
setInterval(() => { net.send({ t: 'ping', ts: performance.now() }); }, 1000);

// ---------- desenho ----------
function interpolated(now) {
  const t = now - INTERP_MS, s = net.snaps;
  if (s.length < 2) return net.last?.actors ?? [];
  let a = s[0], b = s[1];
  for (let i = 0; i < s.length - 1; i++) { if (s[i].at <= t && t <= s[i + 1].at) { a = s[i]; b = s[i + 1]; break; } if (t > s[i + 1].at) { a = s[i]; b = s[i + 1]; } }
  const k = Math.max(0, Math.min(1, b.at === a.at ? 1 : (t - a.at) / (b.at - a.at)));
  return b.actors.map((bb) => { const aa = a.actors.find((x) => x.id === bb.id) ?? bb; return { ...bb, x: aa.x + (bb.x - aa.x) * k, y: aa.y + (bb.y - aa.y) * k }; });
}

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (net.pred && net.srv && !net.srv.dead && net.state === 'fight') {
    const i = net.input, len = Math.hypot(i.mx, i.my);
    if (len > 0.01) { net.pred.x += (i.mx / len) * net.srv.spd * dt; net.pred.y += (i.my / len) * net.srv.spd * dt; }
    net.pred.x += (net.srv.x - net.pred.x) * 0.12; net.pred.y += (net.srv.y - net.pred.y) * 0.12;
  } else if (net.pred && net.srv) { net.pred.x = net.srv.x; net.pred.y = net.srv.y; }

  const s = scale();
  g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#1a2036'; g.fillRect(0, 0, cv.width, cv.height);
  if (net.arena && net.state !== 'lobby') {
    g.fillStyle = '#2c3556'; g.beginPath(); g.arc(net.arena.w / 2 * s, net.arena.h / 2 * s, net.arena.radius * s, 0, 7); g.fill();
    g.strokeStyle = '#4a5686'; g.lineWidth = 3; g.stroke();
    const ob = net.objective, own = net.matchInfo?.owner ?? 0;
    if (ob) { g.strokeStyle = own ? TEAM[own] : '#ffe296'; g.lineWidth = 4; g.setLineDash([10, 8]); g.beginPath(); g.arc(ob.x * s, ob.y * s, ob.r * s, 0, 7); g.stroke(); g.setLineDash([]); }
    for (const a of interpolated(now)) {
      const mine = a.id === net.me;
      const x = (mine && net.pred ? net.pred.x : a.x) * s, y = (mine && net.pred ? net.pred.y : a.y) * s, r = 15 * s * 1.7;
      g.globalAlpha = a.dead ? 0.35 : a.online ? 1 : 0.5;
      g.fillStyle = COLORS[a.classId] ?? '#999'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.lineWidth = mine ? 4 : 2; g.strokeStyle = TEAM[a.team]; g.stroke();
      // forma do marcador de time (não depende só da cor): losango = seu time, quadrado = adversário
      g.fillStyle = TEAM[a.team]; g.beginPath();
      if (a.team === net.team) { g.moveTo(x, y - r - 12); g.lineTo(x + 5, y - r - 6); g.lineTo(x, y - r); g.lineTo(x - 5, y - r - 6); g.closePath(); } else g.rect(x - 4, y - r - 11, 8, 8);
      g.fill();
      g.fillStyle = '#111'; g.font = '700 13px system-ui'; g.textAlign = 'center'; g.fillText(INITIAL[a.classId] ?? '?', x, y + 5);
      if (a.swing) { g.strokeStyle = '#fff'; g.beginPath(); g.arc(x, y, r + 8, a.facing - 0.9, a.facing + 0.9); g.stroke(); }
      if (a.stun) { g.fillStyle = '#ffe9a0'; g.fillText('✦', x, y - r - 16); }
      g.fillStyle = '#0008'; g.fillRect(x - 20, y - r - 24, 40, 5);
      g.fillStyle = TEAM[a.team]; g.fillRect(x - 20, y - r - 24, 40 * Math.max(0, a.hp) / a.maxHp, 5);
      g.fillStyle = '#f3e8c8'; g.font = '11px system-ui'; g.fillText(`${a.name}${a.bot ? ' (bot)' : ''}${a.online ? '' : ' (off)'}`, x, y - r - 28);
      g.globalAlpha = 1;
    }
    for (const f of net.floaters) {
      const age = (now - f.t0) / 900; if (age > 1) continue;
      g.fillStyle = f.crit ? '#ffd166' : '#fff'; g.font = `800 ${f.crit ? 18 : 14}px system-ui`; g.textAlign = 'center';
      g.fillText(f.text, f.x * s, (f.y - age * 40) * s);
    }
    net.floaters = net.floaters.filter((f) => now - f.t0 < 900);
  }
  let banner = '';
  if (net.state === 'lobby') banner = net.queue ? `Procurando partida ${net.queue.mode}…` : 'Lobby — escolha um modo na fila';
  else if (net.state === 'countdown') banner = `Começa em ${Math.ceil(net.countdown)}`;
  else if (net.state === 'over') banner = net.winner === 3 ? 'Empate' : net.winner === net.team ? 'VITÓRIA!' : 'Derrota';
  else if (net.state === 'fight' && net.matchInfo) banner = `${net.matchInfo.score[1]} × ${net.matchInfo.score[2]}  ·  ${net.matchInfo.left}s`;
  if (banner) { g.fillStyle = '#f3e8c8'; g.font = '800 30px system-ui'; g.textAlign = 'center'; g.fillText(banner, cv.width / 2, net.state === 'lobby' ? cv.height / 2 : 44); }
  g.fillStyle = '#9aa3b8'; g.font = '12px system-ui'; g.textAlign = 'left';
  g.fillText(`ping ${net.rtt} ms · tick ${net.last?.tick ?? '-'} · estado ${net.state}${net.mode ? ' · ' + net.mode : ''}`, 10, cv.height - 10);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

$('go').onclick = connect;
for (const b of document.querySelectorAll('[data-q]')) b.onclick = () => net.send({ t: 'queue', mode: b.dataset.q });
$('qcancel').onclick = () => net.send({ t: 'queue_cancel' });
$('invite').onclick = () => { const n = $('inv').value.trim(); if (n) net.send({ t: 'party_invite', name: n }); };
$('pleave').onclick = () => net.send({ t: 'party_leave' });
if (q.get('auto') === '1') connect();
