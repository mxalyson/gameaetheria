// Modo online (contas na nuvem). Ligado quando há uma URL de API (?api=…, guardada no aparelho, ou API_DEFAULT abaixo).
// Com a API ligada a conta é OBRIGATÓRIA: não há como jogar sem entrar. Sem API (como no GitHub Pages hoje), o jogo continua offline.
// O token de sessão fica no localStorage deste aparelho; nenhum segredo vive no código do navegador.
const API_DEFAULT = ''; // preencher quando houver servidor publicado (ex.: https://api.exemplo.com)
const KEY_API = 'aetheria_api', KEY_SESSION = 'aetheria_session';

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

export function apiUrl() {
  const q = new URLSearchParams(location.search).get('api');
  if (q !== null) lsSet(KEY_API, q || null); // ?api= (vazio) desliga o modo online neste aparelho
  return (q ?? lsGet(KEY_API) ?? API_DEFAULT).replace(/\/+$/, '');
}

export class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }

export class Online {
  constructor(base) {
    this.base = base;
    this.token = lsGet(KEY_SESSION);
    this.config = null;
  }
  get hasSession() { return !!this.token; }
  setToken(t) { this.token = t; lsSet(KEY_SESSION, t); }

  async req(method, path, body, { keepalive = false } = {}) {
    let res;
    try {
      res = await fetch(this.base + path, {
        method, keepalive,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch { throw new ApiError(0, 'network', 'Sem conexão com o servidor.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && this.token && path !== '/api/login') this.setToken(null); // sessão expirou: volta ao login
      throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'Erro no servidor.');
    }
    return data;
  }

  async loadConfig() { return (this.config ??= await this.req('GET', '/api/config')); }
  async register(email, password) { const r = await this.req('POST', '/api/register', { email, password }); this.setToken(r.token); return r; }
  async login(email, password) { const r = await this.req('POST', '/api/login', { email, password }); this.setToken(r.token); return r; }
  async google(idToken) { const r = await this.req('POST', '/api/google', { idToken }); this.setToken(r.token); return r; }
  recover(email, code, newPassword) { return this.req('POST', '/api/recover', { email, code, newPassword }); }
  async logout() { try { await this.req('POST', '/api/logout', {}); } catch { /* já saiu */ } this.setToken(null); }
  me() { return this.req('GET', '/api/me'); }
  createCharacter(name, classId) { return this.req('POST', '/api/characters', { name, classId }); }
  importCharacter(save) { return this.req('POST', '/api/characters/import', { save }); }
  getCharacter(id) { return this.req('GET', `/api/characters/${id}`); }
  deleteCharacter(id) { return this.req('DELETE', `/api/characters/${id}`); }
  saveCharacter(id, doc, rev, opts) { return this.req('PUT', `/api/characters/${id}`, { doc, rev }, opts); }
}

// Salvamento na nuvem do personagem em jogo: agrupa gravações (no máx. 1 a cada `every` ms), nunca envia duas ao mesmo tempo
// e trata revisão velha / recusa de plausibilidade recarregando o oficial do servidor.
export class CloudSave {
  constructor(online, { every = 8000, onSync, onReject } = {}) {
    Object.assign(this, { online, every, onSync, onReject, charId: null, rev: 0, dirty: false, busy: false, last: 0, getDoc: null });
  }
  // paused: dentro da instância o servidor é o dono do personagem; um attach de renovação NÃO pode religar a gravação.
  attach(charId, rev, getDoc, { paused = false } = {}) { Object.assign(this, { charId, rev, getDoc, dirty: false, busy: false, last: Date.now(), paused }); }
  detach() { this.charId = null; this.getDoc = null; this.dirty = false; this.paused = false; }
  markDirty() { this.dirty = true; }
  tick(now = Date.now()) { if (this.paused) return; if (this.dirty && !this.busy && this.charId != null && now - this.last >= this.every) return this.flush(); }
  async flush({ keepalive = false } = {}) {
    if (this.charId == null || this.busy) return false;
    this.busy = true; this.dirty = false; this.last = Date.now();
    const id = this.charId;
    try {
      const r = await this.online.saveCharacter(id, this.getDoc(), this.rev, { keepalive });
      if (this.charId === id) { this.rev = r.rev; this.onSync?.(r.character); }
      return true;
    } catch (e) {
      if (e.status === 409 || e.status === 422) {
        try { const fresh = await this.online.getCharacter(id); if (this.charId === id) { this.rev = fresh.rev; this.onReject?.(fresh.character, e); } } catch { /* tenta no próximo ciclo */ }
      } else this.dirty = true; // sem rede: tenta de novo
      return false;
    } finally { this.busy = false; }
  }
}
