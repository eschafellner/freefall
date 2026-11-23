/**
 * Spieler-Accounts: Namensregeln, Operator-Handle (Name#1234) und die Profil- und Roster-Verträge zwischen Server und
 * Client. Client und Server prüfen mit denselben Funktionen; maßgeblich bleibt der Server.
 */

export const ACCOUNT_NAME_LENGTH = { min: 3, max: 16 } as const;
export const ACCOUNT_PASSWORD_LENGTH = { min: 8, max: 128 } as const;
/** Tags laufen von 0001 bis 9999. */
export const ACCOUNT_TAG_LIMIT = 9999;
/** Room-Nachricht mit Name, Tag und Level aller Operator eines Raums. */
export const ROSTER_MESSAGE = 'roster';

export interface AccountProfile {
  id: string;
  name: string;
  /** Vierstellig mit führenden Nullen, z. B. "0412". */
  tag: string;
  /** Name#Tag, eindeutig und Login-Kennung. */
  handle: string;
  level: number;
  experience: number;
  createdAt: number;
}

export interface AccountSession { token: string; account: AccountProfile }

export interface RosterEntry {
  /** Session-ID des Operators im Raum. */
  id: string;
  name: string;
  tag: string;
  level: number;
}

/** Gutschrift eines Einsatzes, an den betroffenen Client gesendet. */
export const ACCOUNT_PROGRESS_MESSAGE = 'account-progress';

export interface AccountProgress {
  /** `MissionResult.id`, zu dem die Gutschrift gehört. */
  resultId: string;
  gained: number;
  experience: number;
  level: number;
  previousLevel: number;
  /** Durch den Aufstieg neu freigeschaltete IDs (siehe `UNLOCKS`). */
  unlocked?: string[];
}

export interface AccountUnlock { id: string; source: 'starter' | 'level' | 'choice' | 'admin'; unlockedAt: number }

export interface MissionHistoryEntry {
  resultId: string;
  finishedAt: number;
  missionId: string;
  missionName: string;
  planetId?: string;
  difficultyId: string;
  outcome: 'extracted' | 'team-lost' | 'objective-unavailable';
  primaryObjectivesCompleted: boolean;
  objectivesCompleted: number;
  objectivesTotal: number;
  durationSeconds: number;
  extracted: boolean;
  experience: number;
  kills: number;
  /** Mitspieler (ohne den abfragenden Account) als Name#Tag. */
  squad: string[];
}

export type AccountErrorCode = 'invalid-name' | 'invalid-password' | 'invalid-handle' | 'invalid-credentials' |
  'name-exhausted' | 'rate-limited' | 'unauthorized' | 'bad-request' | 'unavailable';

/** Buchstaben lateinischer Schrift (inkl. Umlaute und ß), Ziffern, Unterstrich und Bindestrich. */
const NAME_PATTERN = /^[\p{Script=Latin}0-9_-]+$/u;
const LETTER = /\p{Script=Latin}/u;
const HANDLE_PATTERN = /^(.+)#(\d{4})$/u;

export function normalizeAccountName(raw: string): string {
  return raw.normalize('NFC').trim();
}

/** Vergleichsschlüssel: unabhängig von Groß-/Kleinschreibung und Kompatibilitätsformen. */
export function accountNameKey(name: string): string {
  return normalizeAccountName(name).normalize('NFKC').toLowerCase();
}

export function accountNameError(raw: string): string | undefined {
  const name = normalizeAccountName(raw);
  const length = [...name].length;
  if (length < ACCOUNT_NAME_LENGTH.min || length > ACCOUNT_NAME_LENGTH.max) {
    return `Der Name braucht ${ACCOUNT_NAME_LENGTH.min} bis ${ACCOUNT_NAME_LENGTH.max} Zeichen.`;
  }
  if (!NAME_PATTERN.test(name)) return 'Erlaubt sind Buchstaben, Ziffern, _ und -. Leerzeichen und # gehören nicht zum Namen.';
  if (!LETTER.test(name)) return 'Der Name braucht mindestens einen Buchstaben.';
  return undefined;
}

export function accountPasswordError(password: string): string | undefined {
  const length = [...password].length;
  if (length < ACCOUNT_PASSWORD_LENGTH.min) return `Das Passwort braucht mindestens ${ACCOUNT_PASSWORD_LENGTH.min} Zeichen.`;
  if (length > ACCOUNT_PASSWORD_LENGTH.max) return `Das Passwort darf höchstens ${ACCOUNT_PASSWORD_LENGTH.max} Zeichen haben.`;
  return undefined;
}

export function formatAccountTag(tag: number): string {
  return String(tag).padStart(4, '0');
}

export function formatAccountHandle(name: string, tag: string | number): string {
  return `${name}#${typeof tag === 'number' ? formatAccountTag(tag) : tag}`;
}

/**
 * Liest die Eingabe im Loginfeld. Mit Tag (Name#1234) ist es eine Anmeldung, ohne Tag eine Neuanlage.
 * `undefined`: Ein # ohne gültigen vierstelligen Tag.
 */
export function parseAccountHandle(raw: string): { name: string; tag?: number } | undefined {
  const input = normalizeAccountName(raw);
  const match = HANDLE_PATTERN.exec(input);
  if (match) {
    const tag = Number(match[2]);
    if (tag < 1 || tag > ACCOUNT_TAG_LIMIT) return undefined;
    return { name: normalizeAccountName(match[1]), tag };
  }
  if (input.includes('#')) return undefined;
  return { name: input };
}
