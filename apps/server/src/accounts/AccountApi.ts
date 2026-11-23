import type { IncomingMessage, ServerResponse } from 'node:http';
import { accountNameError, accountPasswordError, formatAccountHandle, parseAccountHandle } from '@freefall/shared';
import type { AccountErrorCode, AccountProfile, AccountSession } from '@freefall/shared';
import type { AccountService } from './AccountService.ts';

const BODY_LIMIT = 2048;

class ApiError extends Error {
  readonly status: number;
  readonly code: AccountErrorCode;
  constructor(status: number, code: AccountErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  if (body === undefined) { res.end(); return; }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
    throw new ApiError(415, 'bad-request', 'Anfrage muss JSON sein.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > BODY_LIMIT) throw new ApiError(413, 'bad-request', 'Anfrage zu groß.');
    chunks.push(chunk as Buffer);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* unten */ }
  throw new ApiError(400, 'bad-request', 'Ungültige Anfrage.');
}

const text = (value: unknown): string => typeof value === 'string' ? value : '';

function bearer(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
}

function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

const RATE_LIMITED = new ApiError(429, 'rate-limited', 'Zu viele Versuche. Warte einige Minuten und versuche es erneut.');

/**
 * HTTP-Endpunkte unter `/api`:
 * - `POST /api/auth/register` { name, password } → 201 { token, account }
 * - `POST /api/auth/login` { handle: "Name#1234", password } → 200 { token, account }
 * - `GET /api/account` (Bearer) → 200 { account }
 * - `GET /api/account/missions?limit=20` (Bearer) → 200 { missions }
 * - `GET /api/account/unlocks` (Bearer) → { unlocks }
 * - `POST /api/account/unlocks` { id } (Bearer) → { unlocks, account }: Freischaltung, Preis wird abgebucht
 * - `POST /api/account/password` { current, next } (Bearer) → { revokedSessions }
 * - `POST /api/account/sessions/revoke-others` (Bearer) → { revokedSessions }
 * - `GET /api/account/export` (Bearer) → JSON-Datei mit allen gespeicherten Daten
 * - `POST /api/account/delete` { password, confirm: "Name#1234" } (Bearer) → 204
 * - `POST /api/auth/logout` (Bearer) → 204
 * Fehler: { error, message } mit deutschem Text für die Anzeige.
 */
export function accountApi(accounts: AccountService) {
  const session = (account: AccountProfile): AccountSession => ({ token: accounts.store.createSession(account.id), account });

  function requireAccount(req: IncomingMessage): { account: AccountProfile; token: string } {
    const token = bearer(req);
    const account = accounts.authenticate(token);
    if (!account || !token) throw new ApiError(401, 'unauthorized', 'Anmeldung abgelaufen. Bitte erneut anmelden.');
    return { account, token };
  }

  /** Passwortbestätigung für Kontoänderungen, begrenzt je Account. */
  async function confirmPassword(account: AccountProfile, password: string): Promise<void> {
    if (accounts.confirmByAccount.blocked(account.id)) throw RATE_LIMITED;
    if (!await accounts.store.verify(account.name, Number(account.tag), password)) {
      accounts.confirmByAccount.hit(account.id);
      throw new ApiError(403, 'invalid-credentials', 'Das Passwort stimmt nicht.');
    }
    accounts.confirmByAccount.reset(account.id);
  }

  async function route(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    const ip = clientIp(req, accounts.trustProxy);
    if (req.method === 'POST' && path === '/auth/register') {
      if (accounts.registerByIp.blocked(ip)) throw RATE_LIMITED;
      const body = await readJson(req);
      const name = text(body.name);
      const password = text(body.password);
      const nameError = accountNameError(name);
      if (nameError) throw new ApiError(400, 'invalid-name', nameError);
      const passwordError = accountPasswordError(password);
      if (passwordError) throw new ApiError(400, 'invalid-password', passwordError);
      accounts.registerByIp.hit(ip);
      const account = await accounts.store.register(name, password);
      if (!account) throw new ApiError(409, 'name-exhausted', 'Für diesen Namen ist kein Tag mehr frei. Wähle einen anderen Namen.');
      send(res, 201, session(account));
      return;
    }
    if (req.method === 'POST' && path === '/auth/login') {
      const body = await readJson(req);
      const handle = parseAccountHandle(text(body.handle));
      if (!handle?.tag) throw new ApiError(400, 'invalid-handle', 'Melde dich mit deinem vollen Operatornamen an, z. B. Name#1234.');
      const accountKey = `${handle.name.toLowerCase()}#${handle.tag}`;
      if (accounts.loginByIp.blocked(ip) || accounts.loginByAccount.blocked(accountKey)) throw RATE_LIMITED;
      const account = await accounts.store.verify(handle.name, handle.tag, text(body.password));
      if (!account) {
        accounts.loginByIp.hit(ip);
        accounts.loginByAccount.hit(accountKey);
        throw new ApiError(401, 'invalid-credentials', 'Operatorname oder Passwort stimmt nicht.');
      }
      accounts.loginByAccount.reset(accountKey);
      send(res, 200, session(account));
      return;
    }
    if (req.method === 'GET' && path === '/account') {
      const { account } = requireAccount(req);
      accounts.syncUnlocks(account);
      send(res, 200, { account });
      return;
    }
    if (req.method === 'GET' && path === '/account/missions') {
      const { account } = requireAccount(req);
      const limit = Number(new URL(req.url ?? '/', 'http://localhost').searchParams.get('limit') ?? 20);
      send(res, 200, { missions: accounts.store.missionHistory(account.id, Number.isFinite(limit) ? Math.min(100, Math.max(1, limit)) : 20) });
      return;
    }
    if (req.method === 'GET' && path === '/account/unlocks') {
      const { account } = requireAccount(req);
      accounts.syncUnlocks(account);
      send(res, 200, { unlocks: accounts.store.unlocks(account.id) });
      return;
    }
    if (req.method === 'POST' && path === '/account/unlocks') {
      const { account } = requireAccount(req);
      const body = await readJson(req);
      const result = accounts.unlock(account, text(body.id));
      if (!result.ok) throw new ApiError(409, 'bad-request', result.reason);
      send(res, 201, { unlocks: accounts.store.unlocks(account.id), account: accounts.store.byId(account.id) });
      return;
    }
    if (req.method === 'POST' && path === '/account/password') {
      const { account, token } = requireAccount(req);
      const body = await readJson(req);
      const next = text(body.next);
      const problem = accountPasswordError(next);
      if (problem) throw new ApiError(400, 'invalid-password', problem);
      await confirmPassword(account, text(body.current));
      await accounts.store.setPassword(account.id, next);
      // Andere Geräte müssen sich mit dem neuen Passwort neu anmelden.
      const revoked = accounts.store.revokeOtherSessions(account.id, token);
      send(res, 200, { revokedSessions: revoked });
      return;
    }
    if (req.method === 'POST' && path === '/account/sessions/revoke-others') {
      const { account, token } = requireAccount(req);
      send(res, 200, { revokedSessions: accounts.store.revokeOtherSessions(account.id, token) });
      return;
    }
    if (req.method === 'GET' && path === '/account/export') {
      const { account } = requireAccount(req);
      res.setHeader('Content-Disposition', `attachment; filename="freefall-${formatAccountHandle(account.name, account.tag).replace('#', '-')}.json"`);
      send(res, 200, accounts.store.exportAccount(account.id));
      return;
    }
    if (req.method === 'POST' && path === '/account/delete') {
      const { account } = requireAccount(req);
      const body = await readJson(req);
      if (text(body.confirm) !== account.handle) throw new ApiError(400, 'bad-request', `Zur Bestätigung den vollen Operatornamen ${account.handle} eingeben.`);
      await confirmPassword(account, text(body.password));
      if (accounts.seat(account.id)) throw new ApiError(409, 'bad-request', 'Der Operator ist noch in einem Raum. Erst den Raum verlassen.');
      accounts.store.deleteAccount(account.id);
      send(res, 204);
      return;
    }
    if (req.method === 'POST' && path === '/auth/logout') {
      const token = bearer(req);
      if (token) accounts.store.revokeSession(token);
      send(res, 204);
      return;
    }
    send(res, 404, { error: 'bad-request', message: 'Unbekannter Endpunkt.' });
  }

  return (req: IncomingMessage, res: ServerResponse, next?: () => void): void => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) { if (next) next(); else send(res, 404); return; }
    // Bearer-Token statt Cookies: Jede Herkunft darf anfragen, ohne dass Sitzungen mitgeschickt werden.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { send(res, 204); return; }
    route(req, res, url.pathname.slice(4)).catch((error: unknown) => {
      if (error instanceof ApiError) { send(res, error.status, { error: error.code, message: error.message }); return; }
      console.error('[accounts]', error);
      send(res, 500, { error: 'unavailable', message: 'Accountdienst nicht verfügbar.' });
    });
  };
}
