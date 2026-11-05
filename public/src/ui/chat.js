// Chat online (2026-11-04): caixa com canais Global e Grupo, aviso rápido das últimas mensagens com a caixa fechada e silenciar jogador.
// Fica FORA da camada de painéis (ui.js refaz os painéis com innerHTML; o texto que o jogador digita seria apagado). Tudo que vem da rede
// entra por textContent: nome e mensagem de outro jogador nunca viram HTML.
import { ChatLog, CHAT_REJECT, CHAT_KEEP, FEED_SHOW, FEED_MS } from './chat-log.js';
import { CHAT_MAX } from '../core/protocol.js';
import { CLASSES } from '../data/classes.js';

const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } } };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export class ChatBox {
  // send(ch, text) → envia ao servidor (false se desconectado); me() → nome do próprio jogador (para destacar e não contar como não lida)
  constructor({ send, me = () => null }) {
    this.send = send; this.me = me;
    this.log = new ChatLog(store);
    this.ch = 'global';
    this.inParty = false;
    this.build();
  }

  build() {
    const box = this.box = el('div', 'chat-box hidden'); box.id = 'chat';
    const head = el('div', 'chat-head');
    this.tabs = { global: el('button', 'chat-tab on', 'Global'), party: el('button', 'chat-tab', 'Grupo') };
    for (const [ch, b] of Object.entries(this.tabs)) { b.type = 'button'; b.addEventListener('click', () => this.setChannel(ch)); head.append(b); }
    this.tabs.party.disabled = true; // sem grupo até o servidor dizer o contrário (mensagem `party`)
    this.muteInfo = el('button', 'chat-mutes hidden'); this.muteInfo.type = 'button';
    this.muteInfo.addEventListener('click', () => { if (confirm('Voltar a mostrar todos os jogadores silenciados?')) { this.log.clearMutes(); this.renderList(); } });
    const x = el('button', 'chat-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Fechar chat'); x.addEventListener('click', () => this.close());
    head.append(this.muteInfo, x);
    this.list = el('ul', 'chat-list');
    this.list.addEventListener('click', (e) => { // tocar no nome: silenciar (ou voltar a mostrar)
      const n = e.target.closest?.('.chat-from')?.dataset.name;
      if (!n || n === this.me()) return;
      if (this.log.isMuted(n) || confirm(`Silenciar ${n}? As mensagens dele não aparecerão mais neste aparelho.`)) { this.log.toggleMute(n); this.renderList(); }
    });
    const form = el('form', 'chat-form');
    const input = this.input = el('input', 'chat-input');
    Object.assign(input, { type: 'text', maxLength: CHAT_MAX, placeholder: 'Escreva uma mensagem…', autocomplete: 'off', enterKeyHint: 'send' });
    input.setAttribute('aria-label', 'Mensagem do chat');
    const go = el('button', 'btn small primary', 'Enviar'); go.type = 'submit';
    form.append(input, go);
    form.addEventListener('submit', (e) => { e.preventDefault(); this.submit(); });
    this.hint = el('div', 'chat-hint hidden');
    box.append(head, this.list, this.hint, form);
    this.feed = el('div', 'chat-feed'); this.feed.id = 'chat-feed';
    document.body.append(box, this.feed);
  }

  get isOpen() { return !this.box.classList.contains('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }
  open() {
    this.box.classList.remove('hidden'); this.feed.replaceChildren();
    this.log.setOpen(true); this.updateBadge(); this.renderList();
    if (!matchMedia('(pointer: coarse)').matches) this.input.focus(); // no celular não abre o teclado sozinho (cobriria a tela)
  }
  close() { this.box.classList.add('hidden'); this.log.setOpen(false); this.input.blur(); }
  setParty(v) {
    this.inParty = !!v;
    this.tabs.party.disabled = !this.inParty;
    if (!this.inParty && this.ch === 'party') this.setChannel('global');
  }
  setChannel(ch) {
    if (ch === 'party' && !this.inParty) return;
    this.ch = ch;
    for (const [k, b] of Object.entries(this.tabs)) b.classList.toggle('on', k === ch);
    this.renderList();
  }

  submit() {
    const text = this.input.value.trim();
    if (!text) return;
    if (this.send(this.ch, text) === false) return this.flash('Sem conexão com o servidor de partidas.');
    this.input.value = '';
  }
  // Recusa do servidor: true se era do chat (quem chama não mostra outro aviso).
  rejected(code) { const t = CHAT_REJECT[code]; if (!t) return false; this.flash(t); return true; }
  flash(text) {
    this.hint.textContent = text; this.hint.classList.remove('hidden');
    clearTimeout(this.hintT); this.hintT = setTimeout(() => this.hint.classList.add('hidden'), 4000);
    if (!this.isOpen) this.toFeed({ ch: 'global', from: '', text, at: Date.now(), system: true });
  }

  add(m) {
    const mine = m.from === this.me();
    if (!this.log.add(m, { mine })) return;
    if (this.isOpen) {
      if (m.ch === this.ch) { this.list.append(this.line(m)); while (this.list.children.length > CHAT_KEEP) this.list.firstChild.remove(); this.scroll(); }
    } else this.toFeed(m);
    this.updateBadge();
  }
  history(list) { this.log.history(list); if (this.isOpen) this.renderList(); }
  clear() { this.log.list = { global: [], party: [] }; this.log.unread = 0; this.list.replaceChildren(); this.feed.replaceChildren(); this.updateBadge(); this.close(); }

  line(m) {
    const li = el('li', 'chat-line' + (m.ch === 'party' ? ' party' : '') + (m.from === this.me() ? ' mine' : ''));
    li.append(el('span', 'chat-time', hhmm(m.at ?? Date.now())));
    if (m.from) {
      const from = el('span', 'chat-from', m.from);
      from.dataset.name = m.from;
      from.style.color = CLASSES[m.cls]?.color ?? '';
      from.title = m.from === this.me() ? '' : 'Tocar para silenciar';
      if (m.lv) li.append(el('span', 'chat-lv', `Nv ${m.lv}`));
      li.append(from);
    }
    li.append(el('span', 'chat-text', m.text));
    return li;
  }
  renderList() {
    this.list.replaceChildren(...this.log.list[this.ch].map((m) => this.line(m)));
    const n = this.log.muted.size;
    this.muteInfo.textContent = `${n} silenciado${n > 1 ? 's' : ''}`;
    this.muteInfo.classList.toggle('hidden', n === 0);
    this.scroll();
  }
  scroll() { this.list.scrollTop = this.list.scrollHeight; }
  // Aviso rápido no canto (caixa fechada): até FEED_SHOW linhas, cada uma some depois de FEED_MS.
  toFeed(m) {
    const li = this.line(m);
    if (m.system) li.classList.add('system');
    this.feed.append(li);
    while (this.feed.children.length > FEED_SHOW) this.feed.firstChild.remove();
    setTimeout(() => { li.classList.add('out'); setTimeout(() => li.remove(), 600); }, FEED_MS);
  }
  updateBadge() {
    const b = document.getElementById('chat-btn');
    if (!b) return;
    const n = this.log.unread;
    b.dataset.count = n > 9 ? '9+' : n ? String(n) : '';
  }
}
