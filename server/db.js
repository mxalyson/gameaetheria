// Camada de persistência (SQLite embutido no Node: `node:sqlite`, sem dependência). Tudo passa por estas funções:
// trocar por PostgreSQL no futuro é mudar só este arquivo. Documento do personagem = JSON versionado (core/savedoc.js).
// Segredos nunca são guardados em claro: senhas = scrypt com sal; sessões e códigos de recuperação = SHA-256.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';

export const MAX_CHARACTERS = 4;
export const SESSION_TTL_MS = 14 * 24 * 3600 * 1000;
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const newToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

const SCHEMA = `
create table if not exists accounts (
  id integer primary key, email text unique, pw_hash text, google_sub text unique,
  created integer not null, failed integer not null default 0, locked_until integer not null default 0, disabled integer not null default 0
);
create table if not exists sessions (
  hash text primary key, account_id integer not null references accounts(id) on delete cascade, created integer not null, expires integer not null
);
create table if not exists recovery_codes (
  account_id integer not null references accounts(id) on delete cascade, hash text not null, used integer not null default 0, primary key (account_id, hash)
);
create table if not exists characters (
  id integer primary key, account_id integer not null references accounts(id), name text not null, class_id text not null,
  doc text not null, rev integer not null default 0, created integer not null, updated integer not null, deleted integer not null default 0
);
create unique index if not exists characters_name on characters(lower(name)) where deleted = 0;
create index if not exists characters_account on characters(account_id);
create table if not exists operations (
  op_id text primary key, character_id integer not null, kind text not null, payload text not null, created integer not null
);
create table if not exists audit (
  id integer primary key, ts integer not null, account_id integer, ip text, kind text not null, detail text
);
`;

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  const q = (sql) => db.prepare(sql);
  const S = {
    accByEmail: q('select * from accounts where email = ?'), accByGoogle: q('select * from accounts where google_sub = ?'), accById: q('select * from accounts where id = ?'),
    insAcc: q('insert into accounts (email, pw_hash, google_sub, created) values (?, ?, ?, ?)'),
    setPw: q('update accounts set pw_hash = ?, failed = 0, locked_until = 0 where id = ?'),
    setGoogle: q('update accounts set google_sub = ? where id = ?'),
    fail: q('update accounts set failed = failed + 1 where id = ?'), lock: q('update accounts set locked_until = ?, failed = 0 where id = ?'), okLogin: q('update accounts set failed = 0, locked_until = 0 where id = ?'),
    insSes: q('insert into sessions (hash, account_id, created, expires) values (?, ?, ?, ?)'),
    ses: q('select s.account_id, s.expires, a.disabled from sessions s join accounts a on a.id = s.account_id where s.hash = ?'),
    delSes: q('delete from sessions where hash = ?'), delSesAcc: q('delete from sessions where account_id = ?'), purge: q('delete from sessions where expires < ?'),
    insCode: q('insert or replace into recovery_codes (account_id, hash, used) values (?, ?, 0)'), delCodes: q('delete from recovery_codes where account_id = ?'),
    useCode: q('update recovery_codes set used = 1 where account_id = ? and hash = ? and used = 0'),
    listChars: q('select id, name, class_id, rev, updated, doc from characters where account_id = ? and deleted = 0 order by id'),
    countChars: q('select count(*) n from characters where account_id = ? and deleted = 0'),
    getChar: q('select * from characters where id = ? and deleted = 0'),
    insChar: q('insert into characters (account_id, name, class_id, doc, rev, created, updated) values (?, ?, ?, ?, 0, ?, ?)'),
    updChar: q('update characters set doc = ?, rev = rev + 1, updated = ? where id = ? and rev = ?'),
    updCharForce: q('update characters set doc = ?, rev = rev + 1, updated = ? where id = ?'),
    delChar: q('update characters set deleted = 1, updated = ? where id = ? and account_id = ?'),
    getOp: q('select op_id from operations where op_id = ?'), insOp: q('insert into operations (op_id, character_id, kind, payload, created) values (?, ?, ?, ?, ?)'),
    insAudit: q('insert into audit (ts, account_id, ip, kind, detail) values (?, ?, ?, ?, ?)'), audits: q('select * from audit where kind like ? order by id desc limit ?'),
  };
  const summary = (r) => { const d = JSON.parse(r.doc); return { id: r.id, name: r.name, classId: r.class_id, level: d.level, rev: r.rev, updated: r.updated, rating: d.arena?.rating ?? 1000 }; };
  const row = (r) => (r ? { ...r, doc: JSON.parse(r.doc) } : null);

  return {
    raw: db,
    close() { db.close(); },
    // ---- contas ----
    accountByEmail: (e) => S.accByEmail.get(e) ?? null,
    accountByGoogle: (s) => S.accByGoogle.get(s) ?? null,
    account: (id) => S.accById.get(id) ?? null,
    createAccount({ email = null, pwHash = null, googleSub = null }, now = Date.now()) { return Number(S.insAcc.run(email, pwHash, googleSub, now).lastInsertRowid); },
    setPassword(id, pwHash) { S.setPw.run(pwHash, id); S.delSesAcc.run(id); }, // trocar a senha encerra todas as sessões
    linkGoogle(id, sub) { S.setGoogle.run(sub, id); },
    registerFailure(id, now, { maxFails = 5, lockMs = 15 * 60 * 1000 } = {}) { S.fail.run(id); const a = S.accById.get(id); if (a.failed >= maxFails) S.lock.run(now + lockMs, id); },
    registerSuccess(id) { S.okLogin.run(id); },
    // ---- sessões ----
    createSession(accountId, now = Date.now(), ttl = SESSION_TTL_MS) { const t = newToken(); S.insSes.run(sha256(t), accountId, now, now + ttl); return t; },
    sessionAccount(token, now = Date.now()) {
      if (typeof token !== 'string' || token.length < 32 || token.length > 64) return null;
      const s = S.ses.get(sha256(token));
      if (!s || s.expires < now || s.disabled) return null;
      return S.accById.get(s.account_id);
    },
    deleteSession(token) { S.delSes.run(sha256(token)); },
    purgeSessions(now = Date.now()) { S.purge.run(now); },
    // ---- recuperação ----
    setRecoveryCodes(accountId, hashes) { S.delCodes.run(accountId); for (const h of hashes) S.insCode.run(accountId, h); },
    consumeRecoveryCode(accountId, hash) { return S.useCode.run(accountId, hash).changes === 1; },
    // ---- personagens ----
    listCharacters: (accountId) => S.listChars.all(accountId).map(summary),
    countCharacters: (accountId) => S.countChars.get(accountId).n,
    character: (id) => row(S.getChar.get(id)),
    ownedCharacter(accountId, id) { const c = row(S.getChar.get(id)); return c && c.account_id === accountId ? c : null; },
    createCharacter(accountId, name, classId, doc, now = Date.now()) { return Number(S.insChar.run(accountId, name, classId, JSON.stringify(doc), now, now).lastInsertRowid); },
    // salva com controle otimista de revisão: devolve a nova revisão ou null se alguém salvou antes
    saveCharacter(id, doc, expectedRev, now = Date.now()) { return S.updChar.run(JSON.stringify(doc), now, id, expectedRev).changes === 1 ? expectedRev + 1 : null; },
    deleteCharacter(accountId, id, now = Date.now()) { return S.delChar.run(now, id, accountId).changes === 1; },
    // ---- operações idempotentes (recompensas) ----
    // fn(doc) devolve o novo documento (ou lança). Uma mesma opId só é aplicada UMA vez, mesmo se chamada de novo (ex.: fim de partida duplicado).
    applyOperation(opId, charId, kind, fn, now = Date.now()) {
      db.exec('BEGIN IMMEDIATE');
      try {
        if (S.getOp.get(opId)) { db.exec('COMMIT'); return { duplicate: true }; }
        const c = row(S.getChar.get(charId));
        if (!c) throw new Error('personagem inexistente');
        const out = fn(c.doc);
        S.updCharForce.run(JSON.stringify(out.doc), now, charId);
        S.insOp.run(opId, charId, kind, JSON.stringify(out.summary ?? {}), now);
        db.exec('COMMIT');
        return { duplicate: false, summary: out.summary, doc: out.doc };
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    // ---- auditoria ----
    audit(kind, { accountId = null, ip = null, detail = null } = {}, now = Date.now()) { S.insAudit.run(now, accountId, ip, kind, detail == null ? null : String(detail).slice(0, 500)); },
    audits: (kind = '%', limit = 50) => S.audits.all(kind, limit),
  };
}
