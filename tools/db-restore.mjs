// Restaura um backup: `node tools/db-restore.mjs data/backups/aetheria-….db [destino]` (padrão DB_PATH ou data/aetheria.db).
// Segurança: confere integridade do backup, recusa se o servidor parece ligado (arquivo -wal ativo não vazio) e guarda cópia do banco atual antes de substituir.
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, statSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

export function restore(src, dest) {
  if (!src || !existsSync(src)) throw new Error('backup não encontrado: ' + src);
  const chk = new DatabaseSync(src, { readOnly: true });
  try {
    const r = chk.prepare('PRAGMA integrity_check').get();
    if (Object.values(r)[0] !== 'ok') throw new Error('backup corrompido: ' + JSON.stringify(r));
    chk.prepare('SELECT count(*) AS n FROM accounts').get(); // é um banco do Aetheria?
  } finally { chk.close(); }
  if (existsSync(dest + '-wal') && statSync(dest + '-wal').size > 0) throw new Error('o banco de destino parece em uso (arquivo -wal ativo): desligue o servidor antes de restaurar');
  mkdirSync(dirname(dest), { recursive: true });
  let previous = null;
  if (existsSync(dest)) { previous = dest + '.antes-da-restauracao-' + new Date().toISOString().replace(/[:.]/g, '-'); copyFileSync(dest, previous); }
  for (const ext of ['-wal', '-shm']) rmSync(dest + ext, { force: true });
  copyFileSync(src, dest);
  return { dest, previous };
}

if (import.meta.url === new URL(process.argv[1], 'file:///').href || process.argv[1]?.endsWith('db-restore.mjs')) {
  try {
    const r = restore(process.argv[2], process.argv[3] || process.env.DB_PATH || 'data/aetheria.db');
    console.log('Restaurado em', r.dest, r.previous ? `(cópia anterior: ${r.previous})` : '');
  } catch (e) { console.error('Falhou:', e.message); process.exit(1); }
}
