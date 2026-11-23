import { createHash, randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ACCOUNT_TAG_LIMIT, accountNameKey, formatAccountHandle, formatAccountTag, levelForExperience, normalizeAccountName } from '@freefall/shared';
import type { AccountProfile, AccountProgress, AccountUnlock, MissionHistoryEntry } from '@freefall/shared';

/** scrypt-Parameter: rund 16 MiB und einige zehn Millisekunden je Prüfung. */
const SCRYPT = { N: 16_384, r: 8, p: 1, keylen: 32, maxmem: 64 * 1024 * 1024 } as const;
/** Sitzungen verfallen nach 30 Tagen ohne Nutzung. */
export const SESSION_IDLE_MS = 30 * 24 * 3600_000;
/** `last_used_at` wird höchstens stündlich geschrieben. */
const SESSION_TOUCH_MS = 3600_000;

interface AccountRow { id: string; name: string; tag: number; created_at: number; experience: number }

const ACCOUNT_COLUMNS = 'id, name, tag, created_at, experience';

/** Ein abgeschlossener Einsatz in der Form, in der er gespeichert und gutgeschrieben wird. */
export interface MissionRecord {
  resultId: string;
  missionId: string;
  missionName: string;
  planetId?: string;
  difficultyId: string;
  outcome: MissionHistoryEntry['outcome'];
  primaryObjectivesCompleted: boolean;
  extractionMethod: string;
  objectivesCompleted: number;
  objectivesTotal: number;
  durationSeconds: number;
  balanceHash?: string;
  participants: { accountId: string; experience: number; extracted: boolean; kills: number }[];
}

/**
 * Migrationen in Reihenfolge. `PRAGMA user_version` hält die zuletzt angewandte Nummer.
 * Bestehende Einträge werden nie geändert, Änderungen kommen als neue Migration dazu.
 */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE accounts (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     name_key TEXT NOT NULL,
     tag INTEGER NOT NULL CHECK (tag BETWEEN 1 AND ${ACCOUNT_TAG_LIMIT}),
     created_at INTEGER NOT NULL,
     last_login_at INTEGER,
     UNIQUE (name_key, tag)
   ) STRICT;
   CREATE TABLE account_credentials (
     account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     secret TEXT NOT NULL,
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (account_id, kind)
   ) STRICT;
   CREATE TABLE account_sessions (
     token_hash TEXT PRIMARY KEY,
     account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     last_used_at INTEGER NOT NULL
   ) STRICT;
   CREATE INDEX account_sessions_account ON account_sessions(account_id);`,
  // 2: Einsatzabrechnung. Die Ergebnis-ID ist der Idempotenzschlüssel, die EP-Summe am Account ein Cache des Buchs.
  `ALTER TABLE accounts ADD COLUMN experience INTEGER NOT NULL DEFAULT 0;
   CREATE TABLE mission_results (
     result_id TEXT PRIMARY KEY,
     mission_id TEXT NOT NULL,
     mission_name TEXT NOT NULL,
     planet_id TEXT,
     difficulty_id TEXT NOT NULL,
     outcome TEXT NOT NULL,
     primary_completed INTEGER NOT NULL,
     extraction_method TEXT NOT NULL,
     objectives_completed INTEGER NOT NULL,
     objectives_total INTEGER NOT NULL,
     duration_seconds INTEGER NOT NULL,
     balance_hash TEXT,
     finished_at INTEGER NOT NULL
   ) STRICT;
   CREATE TABLE mission_participants (
     result_id TEXT NOT NULL REFERENCES mission_results(result_id) ON DELETE CASCADE,
     account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     extracted INTEGER NOT NULL,
     experience INTEGER NOT NULL,
     kills INTEGER NOT NULL,
     PRIMARY KEY (result_id, account_id)
   ) STRICT;
   CREATE INDEX mission_participants_account ON mission_participants(account_id);
   CREATE TABLE experience_ledger (
     id INTEGER PRIMARY KEY,
     account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     amount INTEGER NOT NULL,
     reason TEXT NOT NULL,
     source_id TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     UNIQUE (account_id, reason, source_id)
   ) STRICT;`,
  // 3: Freischaltungen. Die ID verweist auf das Register in shared/definitions/unlocks.ts.
  `CREATE TABLE account_unlocks (
     account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     unlock_id TEXT NOT NULL,
     kind TEXT NOT NULL,
     source TEXT NOT NULL,
     unlocked_at INTEGER NOT NULL,
     PRIMARY KEY (account_id, unlock_id)
   ) STRICT;`,
];

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFC'), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem },
      (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize('NFC'), Buffer.from(salt, 'base64'), expected.length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem }, (error, derived) => error ? reject(error) : resolve(derived));
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');

export class AccountStore {
  readonly db: DatabaseSync;
  private readonly now: () => number;
  /** Vergleichswert für unbekannte Accounts, damit die Antwortzeit nichts über die Existenz verrät. */
  private dummy?: Promise<string>;

  /** `path`: Datei der Datenbank oder `:memory:` für Tests. */
  constructor(path: string, now: () => number = Date.now) {
    this.now = now;
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;');
    if (path !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    this.migrate();
  }

  get schemaVersion(): number {
    return Number((this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  }

  private migrate(): void {
    const current = this.schemaVersion;
    if (current > MIGRATIONS.length) throw new Error(`Account-Datenbank hat Schema ${current}, der Server kennt nur ${MIGRATIONS.length}.`);
    for (let version = current; version < MIGRATIONS.length; version++) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(MIGRATIONS[version]);
        this.db.exec(`PRAGMA user_version = ${version + 1}`);
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
  }

  close(): void { if (this.db.isOpen) this.db.close(); }

  private profile(row: AccountRow): AccountProfile {
    const tag = formatAccountTag(row.tag);
    const experience = Number(row.experience ?? 0);
    return { id: row.id, name: row.name, tag, handle: formatAccountHandle(row.name, tag), level: levelForExperience(experience), experience,
      createdAt: row.created_at };
  }

  /** Legt einen Account mit freiem Tag an. `undefined`: Alle Tags dieses Namens sind vergeben. */
  async register(rawName: string, password: string): Promise<AccountProfile | undefined> {
    const name = normalizeAccountName(rawName);
    const key = accountNameKey(name);
    const secret = await hashPassword(password);
    const taken = new Set((this.db.prepare('SELECT tag FROM accounts WHERE name_key = ?').all(key) as { tag: number }[]).map(({ tag }) => tag));
    if (taken.size >= ACCOUNT_TAG_LIMIT) return undefined;
    const insert = this.db.prepare('INSERT INTO accounts (id, name, name_key, tag, created_at) VALUES (?, ?, ?, ?, ?)');
    const credential = this.db.prepare("INSERT INTO account_credentials (account_id, kind, secret, updated_at) VALUES (?, 'password', ?, ?)");
    for (let attempt = 0; attempt < 64; attempt++) {
      let tag = randomInt(1, ACCOUNT_TAG_LIMIT + 1);
      // Bei dicht belegten Namen nach dem Zufallsversuch den nächsten freien Tag nehmen.
      for (let step = 0; taken.has(tag) && step < ACCOUNT_TAG_LIMIT; step++) tag = tag % ACCOUNT_TAG_LIMIT + 1;
      if (taken.has(tag)) return undefined;
      const id = randomUUID();
      const now = this.now();
      this.db.exec('BEGIN IMMEDIATE');
      try {
        insert.run(id, name, key, tag, now);
        credential.run(id, secret, now);
        this.db.exec('COMMIT');
        return this.profile({ id, name, tag, created_at: now, experience: 0 });
      } catch (error) {
        this.db.exec('ROLLBACK');
        if (!String((error as Error).message).includes('UNIQUE')) throw error;
        taken.add(tag);
      }
    }
    return undefined;
  }

  find(name: string, tag: number): AccountProfile | undefined {
    const row = this.db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE name_key = ? AND tag = ?`)
      .get(accountNameKey(name), tag) as AccountRow | undefined;
    return row && this.profile(row);
  }

  byId(id: string): AccountProfile | undefined {
    const row = this.db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ?`).get(id) as AccountRow | undefined;
    return row && this.profile(row);
  }

  /** Prüft Name#Tag und Passwort. Unbekannte Accounts kosten dieselbe Hash-Zeit. */
  async verify(name: string, tag: number, password: string): Promise<AccountProfile | undefined> {
    const account = this.find(name, tag);
    const row = account && this.db.prepare("SELECT secret FROM account_credentials WHERE account_id = ? AND kind = 'password'")
      .get(account.id) as { secret: string } | undefined;
    if (!row) {
      this.dummy ??= hashPassword(randomBytes(12).toString('base64'));
      await verifyPassword(password, await this.dummy);
      return undefined;
    }
    if (!await verifyPassword(password, row.secret)) return undefined;
    this.db.prepare('UPDATE accounts SET last_login_at = ? WHERE id = ?').run(this.now(), account.id);
    return account;
  }

  async setPassword(accountId: string, password: string): Promise<void> {
    const secret = await hashPassword(password);
    this.db.prepare(`INSERT INTO account_credentials (account_id, kind, secret, updated_at) VALUES (?, 'password', ?, ?)
      ON CONFLICT (account_id, kind) DO UPDATE SET secret = excluded.secret, updated_at = excluded.updated_at`).run(accountId, secret, this.now());
  }

  /** Neues Sitzungstoken. Gespeichert wird nur sein SHA-256-Hash. */
  createSession(accountId: string): string {
    const token = randomBytes(32).toString('base64url');
    const now = this.now();
    this.db.prepare('INSERT INTO account_sessions (token_hash, account_id, created_at, last_used_at) VALUES (?, ?, ?, ?)')
      .run(tokenHash(token), accountId, now, now);
    return token;
  }

  /** Account zum Token, oder `undefined` für unbekannte und abgelaufene Sitzungen. */
  authenticate(token: unknown): AccountProfile | undefined {
    if (typeof token !== 'string' || token.length < 20 || token.length > 128) return undefined;
    const hash = tokenHash(token);
    const row = this.db.prepare(`SELECT a.id, a.name, a.tag, a.created_at, a.experience, s.last_used_at FROM account_sessions s
      JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ?`).get(hash) as (AccountRow & { last_used_at: number }) | undefined;
    if (!row) return undefined;
    const now = this.now();
    if (now - row.last_used_at > SESSION_IDLE_MS) {
      this.db.prepare('DELETE FROM account_sessions WHERE token_hash = ?').run(hash);
      return undefined;
    }
    if (now - row.last_used_at > SESSION_TOUCH_MS) this.db.prepare('UPDATE account_sessions SET last_used_at = ? WHERE token_hash = ?').run(now, hash);
    return this.profile(row);
  }

  /** Beendet alle Sitzungen außer der angegebenen. */
  revokeOtherSessions(accountId: string, keepToken: string): number {
    return Number(this.db.prepare('DELETE FROM account_sessions WHERE account_id = ? AND token_hash <> ?').run(accountId, tokenHash(keepToken)).changes);
  }

  /** Löscht den Account samt Sitzungen, Zugangsdaten, EP-Buch, Teilnahmen und Freischaltungen. */
  deleteAccount(accountId: string): boolean {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const deleted = Number(this.db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId).changes) > 0;
      // Einsätze ohne verbleibende Teilnehmer haben keinen Bezug mehr.
      this.db.exec('DELETE FROM mission_results WHERE result_id NOT IN (SELECT DISTINCT result_id FROM mission_participants)');
      this.db.exec('COMMIT');
      return deleted;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      throw error;
    }
  }

  unlocks(accountId: string): AccountUnlock[] {
    return (this.db.prepare('SELECT unlock_id, source, unlocked_at FROM account_unlocks WHERE account_id = ? ORDER BY unlocked_at, rowid')
      .all(accountId) as { unlock_id: string; source: AccountUnlock['source']; unlocked_at: number }[])
      .map(({ unlock_id, source, unlocked_at }) => ({ id: unlock_id, source, unlockedAt: unlocked_at }));
  }

  /** Schreibt Freischaltungen; bereits vorhandene bleiben unverändert. Liefert die neu vergebenen IDs. */
  grantUnlocks(accountId: string, unlocks: readonly { id: string; kind: string }[], source: AccountUnlock['source']): string[] {
    const insert = this.db.prepare(`INSERT OR IGNORE INTO account_unlocks (account_id, unlock_id, kind, source, unlocked_at) VALUES (?, ?, ?, ?, ?)`);
    const now = this.now();
    return unlocks.filter(({ id, kind }) => Number(insert.run(accountId, id, kind, source, now).changes) > 0).map(({ id }) => id);
  }

  /** Alle gespeicherten Daten eines Accounts ohne Geheimnisse (Passwort- und Token-Hashes). */
  exportAccount(accountId: string): Record<string, unknown> | undefined {
    const account = this.db.prepare('SELECT id, name, tag, created_at, last_login_at, experience FROM accounts WHERE id = ?').get(accountId) as
      (AccountRow & { last_login_at: number | null }) | undefined;
    if (!account) return undefined;
    const profile = this.profile(account);
    return {
      format: 'freefall-account-export', version: 1, exportedAt: new Date(this.now()).toISOString(),
      account: { ...profile, lastLoginAt: account.last_login_at },
      credentials: this.db.prepare('SELECT kind, updated_at AS updatedAt FROM account_credentials WHERE account_id = ?').all(accountId),
      sessions: this.db.prepare('SELECT created_at AS createdAt, last_used_at AS lastUsedAt FROM account_sessions WHERE account_id = ? ORDER BY created_at').all(accountId),
      experienceLedger: this.db.prepare('SELECT amount, reason, source_id AS sourceId, created_at AS createdAt FROM experience_ledger WHERE account_id = ? ORDER BY id').all(accountId),
      missions: this.missionHistory(accountId, Number.MAX_SAFE_INTEGER),
      unlocks: this.unlocks(accountId),
    };
  }

  revokeSession(token: string): void {
    this.db.prepare('DELETE FROM account_sessions WHERE token_hash = ?').run(tokenHash(token));
  }

  revokeSessions(accountId: string): number {
    return Number(this.db.prepare('DELETE FROM account_sessions WHERE account_id = ?').run(accountId).changes);
  }

  /**
   * Schreibt einen Einsatz und seine EP in einer Transaktion. Jede Ergebnis-ID wird genau einmal abgerechnet:
   * Ein zweiter Aufruf (Wiederholung nach Fehler, doppeltes Ereignis) ändert nichts und liefert `undefined`.
   */
  settleMission(record: MissionRecord): Map<string, AccountProgress> | undefined {
    const now = this.now();
    const progress = new Map<string, AccountProgress>();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const inserted = this.db.prepare(`INSERT OR IGNORE INTO mission_results (result_id, mission_id, mission_name, planet_id, difficulty_id,
        outcome, primary_completed, extraction_method, objectives_completed, objectives_total, duration_seconds, balance_hash, finished_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(record.resultId, record.missionId, record.missionName, record.planetId ?? null,
        record.difficultyId, record.outcome, record.primaryObjectivesCompleted ? 1 : 0, record.extractionMethod, record.objectivesCompleted,
        record.objectivesTotal, Math.round(record.durationSeconds), record.balanceHash ?? null, now);
      if (!Number(inserted.changes)) {
        this.db.exec('ROLLBACK');
        return undefined;
      }
      const participant = this.db.prepare(`INSERT OR IGNORE INTO mission_participants (result_id, account_id, extracted, experience, kills)
        VALUES (?, ?, ?, ?, ?)`);
      const ledger = this.db.prepare(`INSERT OR IGNORE INTO experience_ledger (account_id, amount, reason, source_id, created_at)
        VALUES (?, ?, 'mission', ?, ?)`);
      const before = this.db.prepare('SELECT experience FROM accounts WHERE id = ?');
      const add = this.db.prepare('UPDATE accounts SET experience = experience + ? WHERE id = ?');
      for (const { accountId, experience, extracted, kills } of record.participants) {
        const row = before.get(accountId) as { experience: number } | undefined;
        if (!row) continue; // Account inzwischen gelöscht.
        if (!Number(participant.run(record.resultId, accountId, extracted ? 1 : 0, Math.max(0, Math.round(experience)), Math.max(0, kills)).changes)) continue;
        const amount = Math.max(0, Math.round(experience));
        const credited = amount > 0 && Number(ledger.run(accountId, amount, record.resultId, now).changes) > 0;
        if (credited) add.run(amount, accountId);
        const total = Number(row.experience) + (credited ? amount : 0);
        progress.set(accountId, { resultId: record.resultId, gained: credited ? amount : 0, experience: total,
          level: levelForExperience(total), previousLevel: levelForExperience(Number(row.experience)) });
      }
      this.db.exec('COMMIT');
      return progress;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** Letzte Einsätze eines Accounts, neueste zuerst. */
  missionHistory(accountId: string, limit = 20): MissionHistoryEntry[] {
    const rows = this.db.prepare(`SELECT r.*, p.extracted, p.experience, p.kills FROM mission_participants p
      JOIN mission_results r ON r.result_id = p.result_id WHERE p.account_id = ?
      ORDER BY r.finished_at DESC, r.result_id DESC LIMIT ?`).all(accountId, Math.max(1, Math.floor(limit))) as Record<string, string | number | null>[];
    const squad = this.db.prepare(`SELECT a.name, a.tag FROM mission_participants p JOIN accounts a ON a.id = p.account_id
      WHERE p.result_id = ? AND p.account_id <> ? ORDER BY a.name_key, a.tag`);
    return rows.map((row) => ({
      resultId: String(row.result_id), finishedAt: Number(row.finished_at), missionId: String(row.mission_id), missionName: String(row.mission_name),
      ...(row.planet_id !== null && { planetId: String(row.planet_id) }), difficultyId: String(row.difficulty_id),
      outcome: String(row.outcome) as MissionHistoryEntry['outcome'], primaryObjectivesCompleted: row.primary_completed === 1,
      objectivesCompleted: Number(row.objectives_completed), objectivesTotal: Number(row.objectives_total),
      durationSeconds: Number(row.duration_seconds), extracted: row.extracted === 1, experience: Number(row.experience), kills: Number(row.kills),
      squad: (squad.all(row.result_id, accountId) as { name: string; tag: number }[]).map(({ name, tag }) => formatAccountHandle(name, tag)),
    }));
  }

  /** Abgleich des EP-Caches mit dem Buch (Admin-Werkzeug). Liefert die Zahl korrigierter Accounts. */
  reconcileExperience(): number {
    return Number(this.db.prepare(`UPDATE accounts SET experience = (SELECT COALESCE(SUM(amount), 0) FROM experience_ledger l WHERE l.account_id = accounts.id)
      WHERE experience <> (SELECT COALESCE(SUM(amount), 0) FROM experience_ledger l WHERE l.account_id = accounts.id)`).run().changes);
  }

  pruneSessions(): number {
    return Number(this.db.prepare('DELETE FROM account_sessions WHERE last_used_at < ?').run(this.now() - SESSION_IDLE_MS).changes);
  }
}
