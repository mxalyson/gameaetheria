// Backup consistente do banco: `npm run db:backup` (usa VACUUM INTO, seguro com o servidor ligado).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';

const src = process.env.DB_PATH || 'data/aetheria.db';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('data/backups', { recursive: true });
const dest = `data/backups/aetheria-${stamp}.db`;
const db = new DatabaseSync(src);
db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
db.close();
console.log('Backup criado:', dest);
