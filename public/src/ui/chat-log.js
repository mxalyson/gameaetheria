// Estado do chat no cliente, sem DOM (testado em Node): mensagens por canal, jogadores silenciados (salvos no aparelho) e não lidas.
// O servidor decide remetente e texto (server/hub.js › chat); aqui só guardamos, filtramos e contamos.
export const CHAT_KEEP = 80;    // mensagens guardadas por canal
export const FEED_SHOW = 3;     // linhas do aviso rápido com o chat fechado
export const FEED_MS = 8000;    // tempo de cada linha no aviso rápido
const MUTE_KEY = 'aetheria_chat_mute';

export class ChatLog {
  constructor(store = null) {
    this.store = store; // { get(k), set(k, v) } — localStorage protegido; null nos testes
    this.list = { global: [], party: [] };
    this.unread = 0;
    this.open = false;
    let saved = [];
    try { saved = JSON.parse(store?.get(MUTE_KEY) ?? '[]'); } catch { saved = []; }
    this.muted = new Set(Array.isArray(saved) ? saved.filter((x) => typeof x === 'string').map((x) => x.toLowerCase()) : []);
  }
  isMuted(name) { return this.muted.has(String(name).toLowerCase()); }
  // Devolve true se a mensagem entrou (e deve aparecer); silenciado não entra nem conta como não lida.
  add(m, { mine = false } = {}) {
    if (!m || typeof m.text !== 'string' || !this.list[m.ch]) return false;
    if (this.isMuted(m.from)) return false;
    const arr = this.list[m.ch];
    arr.push(m);
    if (arr.length > CHAT_KEEP) arr.shift();
    if (!this.open && !mine) this.unread++;
    return true;
  }
  history(list) { for (const m of list ?? []) this.add({ ...m, ch: 'global' }, { mine: true }); } // histórico não acende o contador
  setOpen(v) { this.open = v; if (v) this.unread = 0; }
  toggleMute(name) {
    const k = String(name).toLowerCase();
    if (this.muted.has(k)) this.muted.delete(k);
    else {
      this.muted.add(k);
      for (const ch of Object.keys(this.list)) this.list[ch] = this.list[ch].filter((m) => String(m.from).toLowerCase() !== k); // some o que já estava na tela
    }
    try { this.store?.set(MUTE_KEY, JSON.stringify([...this.muted])); } catch { /* sem armazenamento */ }
    return this.muted.has(k);
  }
  clearMutes() { this.muted.clear(); try { this.store?.set(MUTE_KEY, '[]'); } catch { /* sem armazenamento */ } }
}

// Texto das recusas do servidor que interessam ao chat.
export const CHAT_REJECT = {
  chat_wait: 'Calma! Espere um pouco antes de mandar outra mensagem (ou não repita a mesma).',
  not_in_party: 'Você não está em um grupo. Use o canal Global ou crie um grupo.',
};
