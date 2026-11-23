import { STANDARD_LOADOUT, UNLOCKS, automaticUnlocks, formatResourceAmounts, hasResources, missingLoadoutUnlocks, unlockBlocker } from '@freefall/shared';
import type { AccountProfile, LoadoutSelection, UnlockRegistry } from '@freefall/shared';
import { AccountStore } from './AccountStore.ts';
import { MissionSettlement } from './MissionSettlement.ts';

/** Gleitendes Fenster je Schlüssel (IP oder Account). */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  readonly limit: number;
  readonly windowMs: number;
  private readonly now: () => number;

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  private recent(key: string): number[] {
    const since = this.now() - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((at) => at > since);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  blocked(key: string): boolean { return this.recent(key).length >= this.limit; }

  hit(key: string): void {
    const list = this.recent(key);
    list.push(this.now());
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.prune();
  }

  reset(key: string): void { this.hits.delete(key); }

  private prune(): void { for (const key of [...this.hits.keys()]) this.recent(key); }
}

/** Platz eines Accounts in einem Raum. `evict` gibt einen getrennten Platz frei, wenn derselbe Account neu beitritt. */
export interface AccountSeat {
  roomId: string;
  sessionId: string;
  connected: boolean;
  evict: () => void;
}

export interface AccountServiceOptions {
  /** Client-IP aus `X-Forwarded-For` übernehmen. Nur hinter dem eigenen Proxy (nginx) setzen. */
  trustProxy?: boolean;
  now?: () => number;
  /** Freischaltungsregister; Standard: `UNLOCKS` aus shared. */
  unlocks?: UnlockRegistry;
}

/** Accounts, Anmeldebegrenzung und die Zuordnung Account → Raumplatz für einen Serverprozess. */
export class AccountService {
  readonly store: AccountStore;
  readonly settlement: MissionSettlement;
  readonly trustProxy: boolean;
  readonly loginByIp: RateLimiter;
  readonly loginByAccount: RateLimiter;
  readonly registerByIp: RateLimiter;
  /** Passwortprüfungen angemeldeter Accounts (Passwort ändern, Konto löschen). */
  readonly confirmByAccount: RateLimiter;
  readonly unlockRegistry: UnlockRegistry;
  private readonly seats = new Map<string, AccountSeat>();

  constructor(store: AccountStore, options: AccountServiceOptions = {}) {
    this.store = store;
    this.settlement = new MissionSettlement(store);
    this.trustProxy = options.trustProxy ?? false;
    const now = options.now ?? Date.now;
    this.loginByIp = new RateLimiter(20, 15 * 60_000, now);
    this.loginByAccount = new RateLimiter(8, 15 * 60_000, now);
    this.registerByIp = new RateLimiter(6, 60 * 60_000, now);
    this.confirmByAccount = new RateLimiter(8, 15 * 60_000, now);
    this.unlockRegistry = options.unlocks ?? UNLOCKS;
  }

  owned(accountId: string): Set<string> {
    return new Set(this.store.unlocks(accountId).map(({ id }) => id));
  }

  /** Vergibt Grundausstattung und alle Levelstufen, die das Level erlaubt. Liefert die neu vergebenen IDs. */
  syncUnlocks(account: Pick<AccountProfile, 'id' | 'level'>): string[] {
    const owned = this.owned(account.id);
    const due = automaticUnlocks(this.unlockRegistry, account.level, owned);
    if (!due.length) return [];
    const starter = this.store.grantUnlocks(account.id, due.filter(({ acquisition }) => acquisition === 'starter'), 'starter');
    const level = this.store.grantUnlocks(account.id, due.filter(({ acquisition }) => acquisition === 'level'), 'level');
    return [...starter, ...level];
  }

  /** Freischaltung per Auswahl, mit Abbuchung des Preises (`cost`). Liefert einen Grund, wenn sie nicht möglich ist. */
  unlock(account: Pick<AccountProfile, 'id' | 'level'>, id: string): { ok: true } | { ok: false; reason: string } {
    const unlock = this.unlockRegistry.byId.get(id);
    if (!unlock) return { ok: false, reason: 'Unbekannte Freischaltung.' };
    this.syncUnlocks(account);
    const owned = this.owned(account.id);
    if (owned.has(id)) return { ok: false, reason: 'Bereits freigeschaltet.' };
    if (unlock.acquisition !== 'choice') return { ok: false, reason: 'Wird automatisch mit dem Level freigeschaltet.' };
    const blocker = unlockBlocker(unlock, account.level, owned, this.unlockRegistry);
    if (blocker) return { ok: false, reason: `Noch nicht verfügbar: ${blocker}.` };
    if (!hasResources(unlock.cost)) {
      this.store.grantUnlocks(account.id, [unlock], 'choice');
      return { ok: true };
    }
    const purchase = this.store.purchaseUnlock(account.id, unlock, unlock.cost!);
    if (purchase.ok) return { ok: true };
    if (purchase.reason === 'owned') return { ok: false, reason: 'Bereits freigeschaltet.' };
    return { ok: false, reason: `Nicht genug Ressourcen: Es fehlen ${formatResourceAmounts(purchase.missing)}.` };
  }

  /** Fehlende Freischaltungen für ein Loadout; leer, wenn der Account es nutzen darf. */
  missingForLoadout(account: Pick<AccountProfile, 'id' | 'level'>, loadout: LoadoutSelection = STANDARD_LOADOUT): string[] {
    this.syncUnlocks(account);
    return missingLoadoutUnlocks(this.unlockRegistry, this.owned(account.id), loadout);
  }

  authenticate(token: unknown): AccountProfile | undefined { return this.store.authenticate(token); }

  /**
   * Belegt den Platz für einen Account. Ein verbundener Platz in einem anderen Tab oder Raum blockiert.
   * Ein getrennter Platz (z. B. nach Neuladen der Seite) wird freigegeben und übernommen.
   */
  claim(accountId: string, seat: AccountSeat): boolean {
    const existing = this.seats.get(accountId);
    if (existing?.connected) return false;
    this.seats.set(accountId, seat);
    if (existing) existing.evict();
    return true;
  }

  setConnected(accountId: string, sessionId: string, connected: boolean): void {
    const seat = this.seats.get(accountId);
    if (seat?.sessionId === sessionId) seat.connected = connected;
  }

  release(accountId: string, sessionId: string): void {
    if (this.seats.get(accountId)?.sessionId === sessionId) this.seats.delete(accountId);
  }

  seat(accountId: string): Readonly<AccountSeat> | undefined { return this.seats.get(accountId); }
}
