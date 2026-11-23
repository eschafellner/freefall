/**
 * Verwaltung auf dem Server, z. B. im Container:
 *   docker compose exec game node apps/server/dist/accounts/admin.js reset-password "Name#1234"
 *   docker compose exec game node apps/server/dist/accounts/admin.js backup /data/backup-2026-11-23.db
 *   docker compose exec game node apps/server/dist/accounts/admin.js grant-resource "Name#1234" tissue 10
 * Lokal: node --conditions=development apps/server/src/accounts/admin.ts …
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { RESOURCE_IDS, UNLOCKS, formatResourceAmounts, isResourceId, parseAccountHandle } from '@freefall/shared';
import { AccountStore } from './AccountStore.ts';

const [command, argument] = process.argv.slice(2);
const dataDir = resolve(process.env.FREEFALL_DATA_DIR ?? join(import.meta.dirname, '..', '..', 'data'));
const store = new AccountStore(join(dataDir, 'freefall.db'));

try {
  if (command === 'reset-password' && argument) {
    const handle = parseAccountHandle(argument);
    const account = handle?.tag ? store.find(handle.name, handle.tag) : undefined;
    if (!account) throw new Error(`Kein Account ${argument}`);
    const password = randomBytes(9).toString('base64url');
    await store.setPassword(account.id, password);
    const revoked = store.revokeSessions(account.id);
    console.log(`${account.handle}: neues Passwort ${password} (${revoked} Sitzungen beendet)`);
  } else if (command === 'backup' && argument) {
    // VACUUM INTO schreibt eine konsistente Kopie, auch während der Server läuft.
    store.db.prepare('VACUUM INTO ?').run(resolve(argument));
    console.log(`Sicherung geschrieben: ${resolve(argument)}`);
  } else if (command === 'grant' && argument && process.argv[4]) {
    // Freischaltung zu Testzwecken direkt vergeben (Quelle "admin").
    const handle = parseAccountHandle(argument);
    const account = handle?.tag ? store.find(handle.name, handle.tag) : undefined;
    const unlock = UNLOCKS.byId.get(process.argv[4]);
    if (!account) throw new Error(`Kein Account ${argument}`);
    if (!unlock) throw new Error(`Unbekannte Freischaltung ${process.argv[4]}. Bekannt: ${[...UNLOCKS.byId.keys()].join(', ')}`);
    const granted = store.grantUnlocks(account.id, [unlock], 'admin');
    console.log(granted.length ? `${account.handle}: ${unlock.id} vergeben` : `${account.handle} besitzt ${unlock.id} bereits`);
  } else if (command === 'grant-resource' && argument && process.argv[4] && process.argv[5]) {
    // Ressourcen zu Testzwecken gutschreiben, begrenzt auf die Obergrenze (Grund "admin").
    const handle = parseAccountHandle(argument);
    const account = handle?.tag ? store.find(handle.name, handle.tag) : undefined;
    const resource = process.argv[4];
    const amount = Number(process.argv[5]);
    if (!account) throw new Error(`Kein Account ${argument}`);
    if (!isResourceId(resource)) throw new Error(`Unbekannte Ressource ${resource}. Bekannt: ${RESOURCE_IDS.join(', ')}`);
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('Menge muss eine positive ganze Zahl sein.');
    const { credited, forfeited } = store.grantResources(account.id, { [resource]: amount }, randomUUID());
    console.log(`${account.handle}: gutgeschrieben ${formatResourceAmounts(credited) || 'nichts'}${formatResourceAmounts(forfeited) ? `, verfallen ${formatResourceAmounts(forfeited)}` : ''}`);
  } else if (command === 'reconcile') {
    console.log(`EP-Summen aus dem Buch neu berechnet: ${store.reconcileExperience()} Accounts korrigiert`);
    console.log(`Ressourcen aus dem Buch neu berechnet: ${store.reconcileResources()} Einträge korrigiert`);
  } else if (command === 'stats') {
    const accounts = store.db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number };
    const sessions = store.db.prepare('SELECT COUNT(*) AS n FROM account_sessions').get() as { n: number };
    const missions = store.db.prepare('SELECT COUNT(*) AS n FROM mission_results').get() as { n: number };
    console.log(`Schema ${store.schemaVersion} · ${accounts.n} Accounts · ${sessions.n} Sitzungen · ${missions.n} Einsätze`);
  } else {
    console.log('Befehle: reset-password "Name#1234" | grant "Name#1234" <Freischaltung> | grant-resource "Name#1234" <Ressource> <Menge> | backup <Zieldatei> | reconcile | stats');
    process.exitCode = 1;
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  store.close();
}
