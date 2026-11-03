// Cliente de rede do jogo real (multiplayer): uma conexão WebSocket com o servidor autoritativo (protocolo v3).
// Só envia INTENÇÕES (mover/mirar/atacar/skill) e comandos de lobby; tudo que chega (estado, dano, recompensa) vem do servidor.
import { PROTOCOL_VERSION } from '../core/protocol.js';

// Recusas após as quais reconectar nunca vai funcionar: o jogador precisa de novo login/token.
export const AUTH_LOST = ['bad_token', 'bad_session', 'auth_required'];

export class NetClient {
  // h: { welcome, party, invite, queue, matchFound, snap, reward, matchEnd, notice, reject, close }
  constructor({ url, session, characterId, handlers = {} }) {
    Object.assign(this, { url, session, characterId, h: handlers, ws: null, token: null, connected: false, joined: false, seq: 0, closing: false, rtt: 0 });
    this.party = null; this.invites = []; this.queue = null; this.match = null; this.notes = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.closing = false;
      const ws = this.ws = new WebSocket(this.url);
      let first = true;
      ws.onopen = () => {
        this.connected = true;
        ws.send(JSON.stringify({ v: PROTOCOL_VERSION, t: 'hello', session: this.session, characterId: this.characterId, token: this.token }));
      };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'welcome' && first) { first = false; resolve(m); }
        if (m.t === 'reject' && AUTH_LOST.includes(m.code)) this.dead = true; // token/sessão vencidos: reconectar só repete a recusa
        if (m.t === 'reject' && first && ['bad_session', 'bad_character', 'already_online', 'auth_required', 'bad_token'].includes(m.code)) { first = false; reject(new Error(m.code)); }
        this.onMessage(m);
      };
      ws.onerror = () => { if (first) { first = false; reject(new Error('network')); } };
      ws.onclose = () => {
        this.connected = false;
        if (this.closing) return;
        if (this.dead) { this.token = null; this.joined = false; this.h.authLost?.(); return; }
        if (this.token) setTimeout(() => { if (!this.closing && this.ws === ws) this.reconnect(); }, this.retryDelay()); // volta com o token: mantém grupo e partida
        this.h.close?.();
      };
    });
  }
  // Recuo exponencial: 1, 2, 4, 8… até 60 s (zera ao reconectar). Evita martelar o servidor com token vencido.
  retryDelay() { const d = Math.min(60, 2 ** (this.tries ?? 0)) * 1000; this.tries = (this.tries ?? 0) + 1; return d; }
  reconnect() {
    this.connect().then(() => { this.tries = 0; }).catch(() => {
      if (this.closing || this.dead) return;
      setTimeout(() => { if (!this.closing && !this.dead) this.reconnect(); }, this.retryDelay());
    });
  }

  onMessage(m) {
    switch (m.t) {
      case 'welcome': this.joined = true; this.token = m.token; this.name = m.name; this.h.welcome?.(m); break;
      case 'party': this.party = m.id ? m : null; this.h.party?.(this.party, m); break;
      case 'invite': this.invites.push({ partyId: m.partyId, from: m.from }); this.h.invite?.(m); break;
      case 'queue': this.queue = m.state === 'cancelled' ? null : { mode: m.mode, waited: m.waited ?? 0 }; this.h.queue?.(this.queue, m); break;
      case 'match_found': this.queue = null; this.match = m; this.h.matchFound?.(m); break;
      case 'snap': this.h.snap?.(m); break;
      case 'reward': this.h.reward?.(m); break;
      case 'match_end': this.match = null; this.h.matchEnd?.(m); break;
      case 'zone_joined': this.queue = null; this.match = m; this.h.zoneJoined?.(m); break;
      case 'zone_reward': this.h.zoneReward?.(m); break;
      case 'zone_exit': this.match = null; this.h.zoneExit?.(m); break;
      case 'notice': this.notes.push(m); this.h.notice?.(m); break;
      case 'reject': this.h.reject?.(m); break;
      case 'pong': this.rtt = Math.round(performance.now() - m.ts); break;
    }
  }

  send(o) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, ...o })); }
  queueFor(mode, friendly = false) { this.send(friendly ? { t: 'queue', mode, friendly: true } : { t: 'queue', mode }); }
  cancelQueue() { this.send({ t: 'queue_cancel' }); }
  invite(name) { this.send({ t: 'party_invite', name }); }
  accept(partyId) { this.invites = this.invites.filter((i) => i.partyId !== partyId); this.send({ t: 'party_accept', partyId }); }
  decline(partyId) { this.invites = this.invites.filter((i) => i.partyId !== partyId); this.send({ t: 'party_decline', partyId }); }
  leaveParty() { this.send({ t: 'party_leave' }); }
  kick(name) { this.send({ t: 'party_kick', name }); }
  sendInput(i) { this.send({ t: 'input', seq: ++this.seq, mx: i.mx, my: i.my, aimX: i.aimX, aimY: i.aimY, attack: !!i.attack, cast: i.cast ?? null }); }
  ping() { this.send({ t: 'ping', ts: performance.now() }); }
  close() { this.closing = true; this.ws?.close(); this.connected = false; this.joined = false; this.token = null; }
}
