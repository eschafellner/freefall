import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AccountService } from './accounts/AccountService.ts';
import { AccountStore } from './accounts/AccountStore.ts';
import { startServer } from './server.ts';

const host = process.env.FREEFALL_HOST ?? '127.0.0.1';
const port = Number(process.env.FREEFALL_PORT ?? 2567);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid FREEFALL_PORT');

// Lokal: apps/server/data (gitignored). Im Container: Volume unter /data.
const dataDir = resolve(process.env.FREEFALL_DATA_DIR ?? join(import.meta.dirname, '..', 'data'));
mkdirSync(dataDir, { recursive: true });
const store = new AccountStore(join(dataDir, 'freefall.db'));
store.pruneSessions();
const accounts = new AccountService(store, { trustProxy: process.env.FREEFALL_TRUST_PROXY === '1' });
process.once('exit', () => store.close());

await startServer(port, host, true, { accounts });
console.log('FREEFALL game server listening on %s:%d (accounts: %s)', host, port, join(dataDir, 'freefall.db'));
