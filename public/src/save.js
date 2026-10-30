// Persistência local. No multiplayer, isto vira uma chamada ao servidor
// (o formato do objeto `char` já é o "documento" do personagem).
const KEY = 'aetheria_save_v1';

export function loadChar() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveChar(char) {
  try { localStorage.setItem(KEY, JSON.stringify(char)); } catch { /* armazenamento indisponível */ }
}

export function clearChar() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
