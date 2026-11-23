import type { AccountErrorCode, AccountProfile, AccountSession, AccountUnlock, MissionHistoryEntry } from '@freefall/shared';
import { endpoint } from '../networking/Match.ts';

const TOKEN_KEY = 'freefall.account.token';
const HANDLE_KEY = 'freefall.account.handle';

export class AccountError extends Error {
  readonly code: AccountErrorCode;
  constructor(code: AccountErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function storage(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, token?: string): Promise<T | undefined> {
  let response: Response;
  try {
    response = await fetch(endpoint() + '/api' + path, {
      method,
      headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: 'Bearer ' + token }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch {
    throw new AccountError('unavailable', 'Spielserver nicht erreichbar. Prüfe die Verbindung und versuche es erneut.');
  }
  if (response.status === 204) return undefined;
  const payload = await response.json().catch(() => undefined) as { error?: AccountErrorCode; message?: string } | undefined;
  if (!response.ok) {
    throw new AccountError(payload?.error ?? 'unavailable', payload?.message ?? `Accountdienst antwortet nicht (HTTP ${response.status}).`);
  }
  return payload as T;
}

/** Zuletzt verwendeter Operatorname mit Tag, zum Vorbelegen des Loginfelds. */
export function rememberedHandle(): string { return storage()?.getItem(HANDLE_KEY) ?? ''; }

export function storedToken(): string | undefined { return storage()?.getItem(TOKEN_KEY) ?? undefined; }

function keep(session: AccountSession): AccountSession {
  storage()?.setItem(TOKEN_KEY, session.token);
  storage()?.setItem(HANDLE_KEY, session.account.handle);
  return session;
}

export function forgetSession(): void { storage()?.removeItem(TOKEN_KEY); }

/** Gespeicherte Sitzung prüfen. `undefined`: keine oder abgelaufene Sitzung. */
export async function restoreSession(): Promise<AccountSession | undefined> {
  const token = storedToken();
  if (!token) return undefined;
  try {
    const result = await request<{ account: AccountProfile }>('GET', '/account', undefined, token);
    return result && { token, account: result.account };
  } catch (error) {
    if (error instanceof AccountError && error.code === 'unauthorized') forgetSession();
    throw error;
  }
}

export async function login(handle: string, password: string): Promise<AccountSession> {
  return keep((await request<AccountSession>('POST', '/auth/login', { handle, password }))!);
}

export async function register(name: string, password: string): Promise<AccountSession> {
  return keep((await request<AccountSession>('POST', '/auth/register', { name, password }))!);
}

export async function missionHistory(token: string, limit = 20): Promise<MissionHistoryEntry[]> {
  return (await request<{ missions: MissionHistoryEntry[] }>('GET', `/account/missions?limit=${limit}`, undefined, token))?.missions ?? [];
}

export async function changePassword(token: string, current: string, next: string): Promise<number> {
  return (await request<{ revokedSessions: number }>('POST', '/account/password', { current, next }, token))?.revokedSessions ?? 0;
}

export async function revokeOtherSessions(token: string): Promise<number> {
  return (await request<{ revokedSessions: number }>('POST', '/account/sessions/revoke-others', {}, token))?.revokedSessions ?? 0;
}

/** Lädt den Datenexport und bietet ihn als Datei zum Speichern an. */
export async function downloadExport(token: string, handle: string): Promise<void> {
  const data = await request<unknown>('GET', '/account/export', undefined, token);
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `freefall-${handle.replace('#', '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function deleteAccount(token: string, password: string, confirm: string): Promise<void> {
  await request('POST', '/account/delete', { password, confirm }, token);
  forgetSession();
  try { globalThis.localStorage?.removeItem(HANDLE_KEY); } catch { /* optional */ }
}

export async function unlocks(token: string): Promise<AccountUnlock[]> {
  return (await request<{ unlocks: AccountUnlock[] }>('GET', '/account/unlocks', undefined, token))?.unlocks ?? [];
}

export async function unlock(token: string, id: string): Promise<AccountUnlock[]> {
  return (await request<{ unlocks: AccountUnlock[] }>('POST', '/account/unlocks', { id }, token))?.unlocks ?? [];
}

export async function logout(token: string): Promise<void> {
  forgetSession();
  await request('POST', '/auth/logout', {}, token).catch(() => undefined);
}
