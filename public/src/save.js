// Persistência local (localStorage). O oficial no multiplayer será o servidor (ver docs/roadmap/auditoria-p0-e-plano-multiplayer.md);
// aqui o documento do personagem é versionado, validado e protegido contra corrupção (backup + recuperação) e pode ser exportado/importado.
import { parseSave, exportSave as buildExport } from './core/savedoc.js';

const KEY = 'aetheria_save_v1'; // o nome da chave não muda: a versão do formato fica DENTRO do documento
const BACKUP_KEY = 'aetheria_save_v1_backup';
const CORRUPT_KEY = 'aetheria_save_v1_corrupt';
const BACKUP_EVERY_MS = 5 * 60 * 1000;

let lastBackup = 0;
let info = null; // avisos do último carregamento, consumidos uma vez por takeLoadInfo()

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const sandbox = () => typeof window !== 'undefined' && !!window.TESTE; // modo ?teste=: nada do save é lido nem escrito
const write = (k, v) => { if (sandbox()) return false; try { localStorage.setItem(k, v); return true; } catch { return false; } };

export function loadChar() {
  if (sandbox()) return null;
  const raw = read(KEY);
  if (!raw) return null;
  const r = parseSave(raw);
  if (r.ok) {
    if (r.migratedFrom || r.warnings.length) {
      write(BACKUP_KEY, raw); // guarda o original antes de reescrever migrado/corrigido
      write(KEY, JSON.stringify(r.char));
      info = { migratedFrom: r.migratedFrom, warnings: r.warnings };
    }
    return r.char;
  }
  write(CORRUPT_KEY, raw); // nunca perde o texto original: fica guardado para análise/recuperação manual
  const bk = read(BACKUP_KEY);
  if (bk) {
    const b = parseSave(bk);
    if (b.ok) { write(KEY, JSON.stringify(b.char)); info = { recovered: true, reason: r.reason, warnings: b.warnings }; return b.char; }
  }
  info = { error: r.reason };
  return null;
}

export function takeLoadInfo() { const i = info; info = null; return i; }

// Devolve false se o aparelho recusou gravar (armazenamento cheio/bloqueado): quem chama avisa o jogador em vez de perder progresso calado.
export function saveChar(char) {
  if (sandbox()) return true;
  const now = Date.now();
  if (now - lastBackup > BACKUP_EVERY_MS) {
    const cur = read(KEY);
    if (cur) { write(BACKUP_KEY, cur); lastBackup = now; }
  }
  return write(KEY, JSON.stringify(char));
}

export { parseSave, buildExport as exportSave };
