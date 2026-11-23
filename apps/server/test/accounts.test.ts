import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { ACCOUNT_PROGRESS_MESSAGE, ARENA_ROOM, BALANCE, BODENBRUCH_ROOM, MISSION_RESOURCE_REWARDS, PROGRESSION, RESOURCES, ROSTER_MESSAGE, STANDARD_LOADOUT, UNLOCKS,
  accountNameError, creditResources, missionResourceReward, startingBalance,
  accountNameKey, accountPasswordError, automaticUnlocks, createUnlockRegistry, experienceForLevel, levelForExperience, levelProgress,
  missingLoadoutUnlocks, parseAccountHandle } from '@freefall/shared';
import type { UnlockDefinition } from '@freefall/shared';
import type { AccountProgress, AccountSession, MissionHistoryEntry, MissionResult, MissionSnapshot, RosterEntry } from '@freefall/shared';
import { missionRecord } from '../src/accounts/MissionSettlement.ts';
import type { MissionRecord } from '../src/accounts/AccountStore.ts';
import { FreefallRoom, LocalMissionDebugRoom, withAccounts } from '../src/rooms/FreefallRoom.ts';
import { AccountService, RateLimiter } from '../src/accounts/AccountService.ts';
import { AccountStore, MIGRATIONS, SESSION_IDLE_MS } from '../src/accounts/AccountStore.ts';
import { startServer } from '../src/server.ts';

test('Operatornamen und Handles werden einheitlich geprüft', () => {
  assert.deepEqual(parseAccountHandle(' Edgar#0412 '), { name: 'Edgar', tag: 412 });
  assert.deepEqual(parseAccountHandle('Edgar'), { name: 'Edgar' });
  assert.equal(parseAccountHandle('Edgar#12'), undefined);
  assert.equal(parseAccountHandle('Edgar#0000'), undefined);
  assert.equal(accountNameError('Jörg_ß-7'), undefined);
  assert.ok(accountNameError('ab'));
  assert.ok(accountNameError('Zu langer Name mit Leerzeichen'));
  assert.ok(accountNameError('Ed gar'));
  assert.ok(accountNameError('1234'));
  assert.ok(accountNameError('Едгар'), 'kyrillische Doppelgänger sind nicht erlaubt');
  assert.equal(accountNameKey('EDGAR'), accountNameKey('edgar'));
  assert.ok(accountPasswordError('kurz'));
  assert.equal(accountPasswordError('lang genug'), undefined);
});

test('Store vergibt Tags, prüft Passwörter und lässt Sitzungen verfallen', async () => {
  let now = 1_000_000;
  const store = new AccountStore(':memory:', () => now);
  try {
    const first = await store.register('Edgar', 'geheimes-passwort');
    const second = await store.register('edgar', 'anderes-passwort');
    assert.ok(first && second);
    assert.match(first.handle, /^Edgar#\d{4}$/);
    assert.notEqual(first.tag, second.tag, 'gleicher Name, anderer Tag');
    assert.equal(second.name, 'edgar', 'Schreibweise bleibt erhalten');
    assert.equal(store.find('EDGAR', Number(first.tag))?.id, first.id);
    assert.equal((await store.verify('Edgar', Number(first.tag), 'geheimes-passwort'))?.id, first.id);
    assert.equal(await store.verify('Edgar', Number(first.tag), 'anderes-passwort'), undefined);
    assert.equal(await store.verify('Niemand', 1, 'geheimes-passwort'), undefined);
    const stored = store.db.prepare('SELECT secret FROM account_credentials WHERE account_id = ?').get(first.id) as { secret: string };
    assert.ok(stored.secret.startsWith('scrypt$') && !stored.secret.includes('geheimes'));

    const token = store.createSession(first.id);
    assert.equal(store.authenticate(token)?.id, first.id);
    assert.equal(store.authenticate(token + 'x'), undefined);
    now += SESSION_IDLE_MS - 1000;
    assert.equal(store.authenticate(token)?.id, first.id, 'Nutzung verlängert die Sitzung');
    now += SESSION_IDLE_MS - 1000;
    assert.equal(store.authenticate(token)?.id, first.id);
    now += SESSION_IDLE_MS + 1;
    assert.equal(store.authenticate(token), undefined, 'abgelaufen');
  } finally {
    store.close();
  }
});

test('Ratenbegrenzung und Raumplätze je Account', () => {
  let now = 0;
  const limiter = new RateLimiter(2, 1000, () => now);
  limiter.hit('ip');
  limiter.hit('ip');
  assert.equal(limiter.blocked('ip'), true);
  now += 1001;
  assert.equal(limiter.blocked('ip'), false);

  const service = new AccountService(new AccountStore(':memory:'));
  let evicted = 0;
  const seat = (sessionId: string) => ({ roomId: 'r', sessionId, connected: true, evict: () => { evicted++; } });
  assert.equal(service.claim('a', seat('s1')), true);
  assert.equal(service.claim('a', seat('s2')), false, 'zweites verbundenes Fenster');
  service.setConnected('a', 's1', false);
  assert.equal(service.claim('a', seat('s2')), true, 'Neuladen übernimmt den getrennten Platz');
  assert.equal(evicted, 1);
  service.release('a', 's1');
  assert.equal(service.seat('a')?.sessionId, 's2', 'alte Sitzung gibt fremden Platz nicht frei');
  service.release('a', 's2');
  assert.equal(service.seat('a'), undefined);
  service.store.close();
});

function waitFor<T>(room: Room, type: string, matches: (data: T) => boolean, timeoutMs = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { unbind(); reject(new Error(`Timed out waiting for ${type}`)); }, timeoutMs);
    const unbind = room.onMessage<T>(type, (payload) => {
      if (!matches(payload)) return;
      clearTimeout(timer);
      unbind();
      resolve(payload);
    });
  });
}

test('Login-API und Raumbeitritt mit Account', { timeout: 20_000 }, async () => {
  const accounts = new AccountService(new AccountStore(':memory:'));
  const server = await startServer(0, '127.0.0.1', false, { accounts });
  const rooms: Room[] = [];
  try {
    const address = server.transport.server?.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const post = (path: string, body: unknown, token?: string) => fetch(base + '/api' + path, { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: JSON.stringify(body) });

    const invalid = await post('/auth/register', { name: 'x', password: 'geheimes-passwort' });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json() as { error: string }).error, 'invalid-name');

    const created = await post('/auth/register', { name: 'Kestrel', password: 'geheimes-passwort' });
    assert.equal(created.status, 201);
    assert.equal(created.headers.get('access-control-allow-origin'), '*');
    const session = await created.json() as AccountSession;
    assert.match(session.account.handle, /^Kestrel#\d{4}$/);

    assert.equal((await post('/auth/login', { handle: 'Kestrel', password: 'geheimes-passwort' })).status, 400, 'Login nur mit Tag');
    assert.equal((await post('/auth/login', { handle: session.account.handle, password: 'falsches-passwort' })).status, 401);
    const login = await post('/auth/login', { handle: session.account.handle.toLowerCase(), password: 'geheimes-passwort' });
    assert.equal(login.status, 200);
    const second = await login.json() as AccountSession;
    assert.equal(second.account.id, session.account.id);

    const me = await fetch(base + '/api/account', { headers: { Authorization: 'Bearer ' + session.token } });
    assert.equal((await me.json() as { account: { id: string } }).account.id, session.account.id);
    assert.equal((await fetch(base + '/api/account')).status, 401);

    const guest = new Client(base);
    await assert.rejects(() => guest.create(ARENA_ROOM), 'Beitritt ohne Anmeldung');

    const client = new Client(base);
    client.http.authToken = session.token;
    const room = await client.create(BODENBRUCH_ROOM);
    rooms.push(room);
    room.onMessage('*', () => {});
    const synced = waitFor<RosterEntry[]>(room, ROSTER_MESSAGE, (entries) => entries.length === 1);
    room.send('sync-state');
    const roster = await synced;
    assert.deepEqual(roster[0], { id: room.sessionId, name: 'Kestrel', tag: session.account.tag, level: 1 });

    const twin = new Client(base);
    twin.http.authToken = second.token;
    await assert.rejects(() => twin.joinById(room.roomId), /bereits/, 'derselbe Account im zweiten Fenster');

    const otherSession = await (await post('/auth/register', { name: 'Albatross', password: 'geheimes-passwort' })).json() as AccountSession;
    const other = new Client(base);
    other.http.authToken = otherSession.token;
    const joined = waitFor<RosterEntry[]>(room, ROSTER_MESSAGE, (entries) => entries.length === 2);
    const peer = await other.joinById(room.roomId);
    rooms.push(peer);
    peer.onMessage('*', () => {});
    const both = await joined;
    assert.deepEqual(both.map(({ name }) => name).sort(), ['Albatross', 'Kestrel']);
    const left = waitFor<RosterEntry[]>(room, ROSTER_MESSAGE, (entries) => entries.length === 1);
    await peer.leave();
    rooms.pop();
    await left;

    assert.equal((await post('/auth/logout', {}, session.token)).status, 204);
    const expired = new Client(base);
    expired.http.authToken = session.token;
    await assert.rejects(() => expired.create(ARENA_ROOM), 'abgemeldetes Token');
  } finally {
    await Promise.all(rooms.map((room) => room.leave().catch(() => {})));
    await server.gracefullyShutdown(false);
    accounts.store.close();
  }
});

test('Bestehende Datenbank mit Schema 1 wird ohne Datenverlust migriert', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'freefall-accounts-')), 'freefall.db');
  const legacy = new DatabaseSync(path);
  legacy.exec(MIGRATIONS[0]);
  legacy.exec('PRAGMA user_version = 1');
  legacy.prepare('INSERT INTO accounts (id, name, name_key, tag, created_at) VALUES (?, ?, ?, ?, ?)').run('alt', 'Veteran', 'veteran', 7, 1);
  legacy.close();
  const store = new AccountStore(path);
  try {
    assert.equal(store.schemaVersion, MIGRATIONS.length);
    assert.deepEqual(store.find('veteran', 7), { id: 'alt', name: 'Veteran', tag: '0007', handle: 'Veteran#0007', level: 1, experience: 0,
      resources: { credits: 5000, marks: 0, tissue: 0, rock: 0, artifact: 0 }, createdAt: 1 }, 'bestehende Accounts erhalten das Startguthaben');
    assert.equal(store.reconcileResources(), 0, 'Startguthaben steht auch im Buch');
  } finally {
    store.close();
  }
});

test('Levelkurve: Level aus Gesamt-EP, Obergrenze und Fortschritt', () => {
  assert.equal(experienceForLevel(1), 0);
  assert.equal(experienceForLevel(2), 500);
  assert.equal(experienceForLevel(3), 1250);
  assert.equal(experienceForLevel(10), 13_500);
  assert.equal(levelForExperience(0), 1);
  assert.equal(levelForExperience(499), 1);
  assert.equal(levelForExperience(500), 2);
  assert.equal(levelForExperience(1249), 2);
  assert.equal(levelForExperience(10_000_000), PROGRESSION.maxLevel);
  assert.deepEqual(levelProgress(700), { level: 2, current: 200, needed: 750 });
  assert.deepEqual(levelProgress(10_000_000), { level: PROGRESSION.maxLevel, current: 0, needed: 0 });
  for (let level = 2; level <= PROGRESSION.maxLevel; level++) {
    assert.ok(experienceForLevel(level) > experienceForLevel(level - 1));
    assert.equal(levelForExperience(experienceForLevel(level)), level);
    assert.equal(levelForExperience(experienceForLevel(level) - 1), level - 1);
  }
});

const record = (resultId: string, participants: MissionRecord['participants']): MissionRecord => ({
  resultId, missionId: 'procedural', missionName: 'Relais Nord', planetId: 'forest', difficultyId: 'normal', outcome: 'extracted',
  primaryObjectivesCompleted: true, extractionMethod: 'albatross', objectivesCompleted: 2, objectivesTotal: 3, durationSeconds: 612.4,
  participants,
});

test('Einsatzabrechnung schreibt jede Ergebnis-ID genau einmal gut', async () => {
  let now = 5_000;
  const store = new AccountStore(':memory:', () => now);
  try {
    assert.equal(store.schemaVersion, MIGRATIONS.length);
    const a = (await store.register('Kestrel', 'geheimes-passwort'))!;
    const b = (await store.register('Albatross', 'geheimes-passwort'))!;
    const first = store.settleMission(record('i-1/result', [
      { accountId: a.id, experience: 500, extracted: true, kills: 31 },
      { accountId: b.id, experience: 400, extracted: false, kills: 12 },
    ]));
    const balance = startingBalance();
    const none = { credited: {}, forfeited: {}, balance };
    assert.deepEqual(first?.get(a.id), { resultId: 'i-1/result', gained: 500, experience: 500, level: 2, previousLevel: 1, resources: none });
    assert.deepEqual(first?.get(b.id), { resultId: 'i-1/result', gained: 400, experience: 400, level: 1, previousLevel: 1, resources: none });
    assert.equal(store.settleMission(record('i-1/result', [{ accountId: a.id, experience: 500, extracted: true, kills: 31 }])), undefined,
      'zweite Abrechnung derselben Ergebnis-ID');
    assert.equal(store.byId(a.id)?.experience, 500);
    assert.equal(store.byId(a.id)?.level, 2);

    now += 60_000;
    const failed = store.settleMission({ ...record('i-2/result', [{ accountId: a.id, experience: 0, extracted: false, kills: 4 }]), outcome: 'team-lost',
      primaryObjectivesCompleted: false });
    assert.deepEqual(failed?.get(a.id), { resultId: 'i-2/result', gained: 0, experience: 500, level: 2, previousLevel: 2, resources: none });
    const history = store.missionHistory(a.id);
    assert.deepEqual(history.map(({ resultId }) => resultId), ['i-2/result', 'i-1/result'], 'neueste zuerst, auch Fehlschläge');
    assert.deepEqual(history[1], { resultId: 'i-1/result', finishedAt: 5_000, missionId: 'procedural', missionName: 'Relais Nord', planetId: 'forest',
      difficultyId: 'normal', outcome: 'extracted', primaryObjectivesCompleted: true, objectivesCompleted: 2, objectivesTotal: 3,
      durationSeconds: 612, extracted: true, experience: 500, resources: {}, forfeited: {}, kills: 31, squad: [b.handle] });
    const ledger = store.db.prepare('SELECT COUNT(*) AS n FROM experience_ledger').get() as { n: number };
    assert.equal(ledger.n, 2, 'keine Buchung für 0 EP');
    store.db.prepare('UPDATE accounts SET experience = 9 WHERE id = ?').run(a.id);
    assert.equal(store.reconcileExperience(), 1);
    assert.equal(store.byId(a.id)?.experience, 500);
  } finally {
    store.close();
  }
});

test('Ergebnis wird über die Session-Zuordnung den Accounts zugeordnet', () => {
  const result = {
    id: 'x/result', missionInstanceId: 'x', missionId: 'procedural', difficultyId: 'hard', primaryObjectivesCompleted: true,
    extractionAttempted: true, extractionSucceeded: true, extractionMethod: 'balloon', extractedOperatorIds: ['s1'],
    convictsDeployed: 0, convictsSurvived: 0, albatrossSurvived: true, baseExperience: 400, extractionBonusExperience: 100,
    rewards: [
      { operatorId: 's1', baseExperience: 400, extractionBonusExperience: 100, totalExperience: 500, kills: 9 },
      { operatorId: 's2', baseExperience: 400, extractionBonusExperience: 0, totalExperience: 400, kills: 3 },
      { operatorId: 'guest', baseExperience: 400, extractionBonusExperience: 0, totalExperience: 400 },
    ],
    missionName: 'Nestsäuberung', procedural: { planId: 'p', planetId: 'ice', seed: 4, templateId: 't', generatorVersion: 1 },
    outcome: 'extracted', durationTicks: 30 * 90,
    objectives: [{ id: 'a', state: 'complete', progress: 1, completeAt: 1, optional: false }, { id: 'n', state: 'failed', progress: 0, completeAt: 0, optional: true }],
  } satisfies MissionResult;
  const mapped = missionRecord(result, new Map([['s1', 'acc-1'], ['s2', 'acc-2']]));
  assert.equal(mapped.planetId, 'ice');
  assert.equal(mapped.durationSeconds, 90);
  assert.equal(mapped.objectivesCompleted, 1);
  assert.equal(mapped.objectivesTotal, 2);
  assert.deepEqual(mapped.participants, [
    { accountId: 'acc-1', experience: 500, extracted: true, kills: 9, resources: {} },
    { accountId: 'acc-2', experience: 400, extracted: false, kills: 3, resources: {} },
  ]);
});

test('Einsatzende im Raum schreibt EP gut, meldet sie und füllt die Historie', { timeout: 20_000 }, async () => {
  const accounts = new AccountService(new AccountStore(':memory:'));
  const server = await startServer(0, '127.0.0.1', false, { accounts });
  const rooms: Room[] = [];
  const roomName = 'settlement-test';
  // Debugbefehle für einen schnellen Einsatz, aber mit Abrechnung wie im regulären Raum.
  server.define(roomName, withAccounts(class extends LocalMissionDebugRoom {
    protected override get settlesExperience(): boolean { return true; }
  }, accounts));
  try {
    const { port } = server.transport.server?.address() as { port: number };
    const base = `http://127.0.0.1:${port}`;
    const register = async (name: string) => (await (await fetch(base + '/api/auth/register', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password: 'geheimes-passwort' }) })).json()) as AccountSession;
    const join = async (session: AccountSession, roomId?: string) => {
      const client = new Client(base);
      client.http.authToken = session.token;
      const room = roomId ? await client.joinById(roomId) : await client.create(roomName);
      room.onMessage('*', () => {});
      room.reconnection.enabled = false;
      rooms.push(room);
      return room;
    };
    const hostSession = await register('Kestrel');
    const guestSession = await register('Albatross');
    const host = await join(hostSession);
    const guest = await join(guestSession, host.roomId);

    host.send('mission-debug', 'land');
    await waitFor<MissionSnapshot>(host, 'mission-state', ({ state }) => state === 'ACTIVE_MISSION', 8000);
    host.send('mission-debug', 'objectives');
    await waitFor<MissionSnapshot>(host, 'mission-state', ({ primaryObjectivesCompleted }) => primaryObjectivesCompleted, 8000);

    const hostProgress = waitFor<AccountProgress>(host, ACCOUNT_PROGRESS_MESSAGE, () => true, 8000);
    const guestProgress = waitFor<AccountProgress>(guest, ACCOUNT_PROGRESS_MESSAGE, () => true, 8000);
    const roster = waitFor<RosterEntry[]>(guest, ROSTER_MESSAGE, (entries) => entries.some(({ level }) => level === 2), 8000);
    // Albatross-Abflug mit dem Host an Bord: Der Host wird extrahiert, der Gast bleibt zurück.
    const mission = (matchMaker.getLocalRoomById(host.roomId) as unknown as { arena: {
      finish(extracted: string[]): void; collectSamples(id: string, amounts: object): boolean } }).arena;
    // Host trägt Proben und wird extrahiert, der Gast fällt zurück: Die Proben gelten trotzdem für beide.
    assert.equal(mission.collectSamples(host.sessionId, { tissue: 2, artifact: 1 }), true);
    assert.equal(mission.collectSamples(guest.sessionId, { rock: 4 }), true);
    mission.finish([host.sessionId]);
    const [mine, theirs] = await Promise.all([hostProgress, guestProgress]);
    assert.equal(mine.gained, 500);
    assert.equal(mine.level, 2);
    assert.equal(mine.previousLevel, 1);
    assert.equal(theirs.gained, 400);
    assert.equal(theirs.level, 1);
    assert.equal((await roster).find(({ id }) => id === host.sessionId)?.level, 2);
    assert.ok((mine.resources?.credited.credits ?? 0) >= 500, 'Stufe 2 bringt mindestens 500 SKR');
    assert.ok((mine.resources?.credited.marks ?? 0) >= 3, 'Stufe 2 bringt mindestens 3 Einsatzmarken');
    assert.deepEqual(theirs.resources?.credited, mine.resources?.credited, 'alle Teilnehmer erhalten dasselbe');
    assert.equal(mine.resources?.credited.tissue, 2);
    assert.equal(mine.resources?.credited.artifact, 1);
    assert.equal(mine.resources?.credited.rock, undefined, 'Proben des nicht extrahierten Gasts sind verloren');
    assert.equal(mine.resources?.balance.credits, 5000 + mine.resources!.credited.credits!);

    const resynced = waitFor<AccountProgress>(host, ACCOUNT_PROGRESS_MESSAGE, () => true);
    host.send('sync-state');
    assert.equal((await resynced).resultId, mine.resultId, 'Reconnect erhält die Gutschrift erneut');

    const response = await fetch(base + '/api/account/missions', { headers: { Authorization: 'Bearer ' + hostSession.token } });
    const { missions } = await response.json() as { missions: MissionHistoryEntry[] };
    assert.equal(missions.length, 1);
    assert.equal(missions[0].resultId, mine.resultId);
    assert.equal(missions[0].extracted, true);
    assert.equal(missions[0].experience, 500);
    assert.deepEqual(missions[0].squad, [guestSession.account.handle]);
    assert.deepEqual(missions[0].resources, mine.resources?.credited);
    const profile = await (await fetch(base + '/api/account', { headers: { Authorization: 'Bearer ' + hostSession.token } })).json() as { account: { experience: number; level: number } };
    assert.deepEqual([profile.account.experience, profile.account.level], [500, 2]);
  } finally {
    await Promise.all(rooms.map((room) => room.leave().catch(() => {})));
    await server.gracefullyShutdown(false);
    accounts.store.close();
  }
});

test('Debug-Räume schreiben keine EP gut', () => {
  // Getter mit einem Ersatz-`this` auswerten, ohne einen Raum zu starten.
  assert.equal(Reflect.get(FreefallRoom.prototype, 'settlesExperience', { debug: true }), false);
  assert.equal(Reflect.get(FreefallRoom.prototype, 'settlesExperience', { debug: false }), true);
  assert.equal(Reflect.get(LocalMissionDebugRoom.prototype, 'debug', {}), true);
});

test('Ressourcen: Startwerte, Obergrenzen und Einsatzlohn nach Schwierigkeit', () => {
  assert.deepEqual(RESOURCES.map(({ id, start, max }) => [id, start, max]),
    [['credits', 5000, 50_000], ['marks', 0, 250], ['tissue', 0, 300], ['rock', 0, 150], ['artifact', 0, 100]]);
  const reward = (difficultyLevel: number, optionalObjectivesCompleted = 0, primaryObjectivesCompleted = true) =>
    missionResourceReward({ difficultyLevel, primaryObjectivesCompleted, optionalObjectivesCompleted });
  assert.deepEqual(reward(2), { credits: 500, marks: 3 });
  assert.deepEqual(reward(7), { credits: 2500, marks: 11 });
  assert.deepEqual(reward(2, 1), { credits: 600, marks: 4 }, 'optionales Ziel: +20 % SKR, +1 Marke');
  assert.deepEqual(reward(7, 2), { credits: 3500, marks: 11 }, 'höchstens 11 Marken je Mission');
  assert.deepEqual(reward(5, 0, false), {}, 'ohne Hauptziele kein Lohn');
  assert.deepEqual(missionResourceReward({ difficultyLevel: 3, primaryObjectivesCompleted: false, optionalObjectivesCompleted: 0, samples: { tissue: 3 } }),
    { tissue: 3 }, 'extrahierte Proben zählen auch ohne Hauptziele');
  for (let level = 2; level <= 7; level++) {
    assert.ok(MISSION_RESOURCE_REWARDS.credits[level - 1] > MISSION_RESOURCE_REWARDS.credits[level - 2]);
    assert.ok(MISSION_RESOURCE_REWARDS.marks[level - 1] > MISSION_RESOURCE_REWARDS.marks[level - 2]);
  }
  assert.deepEqual(creditResources({ ...startingBalance(), credits: 49_800, artifact: 100 }, { credits: 500, marks: 3, artifact: 2 }),
    { credited: { credits: 200, marks: 3 }, forfeited: { credits: 300, artifact: 2 } });
});

test('Ressourcenbuch: Obergrenze, Kauf ohne Rückerstattung, Abgleich', async () => {
  const registry = createUnlockRegistry([
    unlock('weapon.base', { acquisition: 'starter' }),
    unlock('weapon.carbine', { acquisition: 'choice', level: 2, cost: { credits: 3000 } }),
    unlock('upgrade.visor', { acquisition: 'choice', level: 1, cost: { marks: 5, tissue: 2 } }),
  ]);
  const service = new AccountService(new AccountStore(':memory:'), { unlocks: registry });
  try {
    const account = (await service.store.register('Kestrel', 'geheimes-passwort'))!;
    assert.deepEqual(account.resources, startingBalance(), 'neue Accounts starten mit 5.000 SKR');
    assert.deepEqual(service.unlock({ id: account.id, level: 1 }, 'weapon.carbine'), { ok: false, reason: 'Noch nicht verfügbar: ab Level 2.' },
      'Waffen bleiben an das Level gebunden');
    assert.deepEqual(service.unlock({ id: account.id, level: 1 }, 'upgrade.visor'), { ok: false, reason: 'Nicht genug Ressourcen: Es fehlen 5 Marken · 2 Gewebe.' });
    assert.deepEqual(service.unlock({ id: account.id, level: 2 }, 'weapon.carbine'), { ok: true });
    assert.equal(service.store.resources(account.id).credits, 2000);
    assert.equal(service.unlock({ id: account.id, level: 2 }, 'weapon.carbine').ok, false, 'kein zweiter Kauf');
    assert.equal(service.store.resources(account.id).credits, 2000);
    assert.deepEqual(service.unlock({ id: account.id, level: 1 }, 'upgrade.visor'), { ok: false, reason: 'Nicht genug Ressourcen: Es fehlen 5 Marken · 2 Gewebe.' });
    assert.equal(service.owned(account.id).has('upgrade.visor'), false, 'gescheiterter Kauf schaltet nichts frei');

    const settled = service.store.settleMission(record('r-1/result', [{ accountId: account.id, experience: 400, extracted: true, kills: 0,
      resources: { credits: 49_000, marks: 6, tissue: 400 } }]));
    assert.deepEqual(settled?.get(account.id)?.resources, { credited: { credits: 48_000, marks: 6, tissue: 300 }, forfeited: { credits: 1000, tissue: 100 },
      balance: { credits: 50_000, marks: 6, tissue: 300, rock: 0, artifact: 0 } });
    assert.deepEqual(service.store.missionHistory(account.id)[0].forfeited, { credits: 1000, tissue: 100 });
    assert.deepEqual(service.unlock({ id: account.id, level: 1 }, 'upgrade.visor'), { ok: true });
    assert.deepEqual(service.store.resources(account.id), { credits: 50_000, marks: 1, tissue: 298, rock: 0, artifact: 0 });
    assert.deepEqual(service.store.grantResources(account.id, { artifact: 120 }, 'test'), { credited: { artifact: 100 }, forfeited: { artifact: 20 } });

    service.store.db.prepare("UPDATE account_resources SET amount = 7 WHERE account_id = ? AND resource = 'credits'").run(account.id);
    assert.equal(service.store.reconcileResources(), 1);
    assert.equal(service.store.resources(account.id).credits, 50_000);
    const exported = service.store.exportAccount(account.id) as { resourceLedger: { resource: string; amount: number; reason: string }[] };
    assert.deepEqual(exported.resourceLedger.filter(({ reason }) => reason === 'unlock').map(({ resource, amount }) => [resource, amount]),
      [['credits', -3000], ['marks', -5], ['tissue', -2]]);
  } finally {
    service.store.close();
  }
});

const unlock = (id: string, extra: Partial<UnlockDefinition> = {}): UnlockDefinition => ({
  id, kind: id.split('.')[0] as UnlockDefinition['kind'], displayName: id, description: '', acquisition: 'level', level: 1, requires: [], ...extra,
});

test('Freischaltungsregister: stabile IDs, gültige Verweise, Standardausrüstung', () => {
  assert.throws(() => createUnlockRegistry([unlock('weapon.a'), unlock('weapon.a')]), /doppelte/);
  assert.throws(() => createUnlockRegistry([unlock('weapon.a', { requires: ['research.b'] }), unlock('research.b')]), /Voraussetzung/);
  assert.throws(() => createUnlockRegistry([unlock('Weapon A')]), /ungültige ID/);
  assert.throws(() => createUnlockRegistry([unlock('research.x', { kind: 'weapon' })]), /ungültige ID/);
  assert.throws(() => createUnlockRegistry([unlock('weapon.a', { cost: { credits: 100 } })]), /Kosten nur bei Auswahl/);
  assert.throws(() => createUnlockRegistry([unlock('weapon.a', { acquisition: 'choice', cost: { credits: 60_000 } })]), /Preis/);
  assert.throws(() => createUnlockRegistry([unlock('weapon.a', { acquisition: 'choice', cost: { gold: 1 } as never })]), /unbekannte Ressource/);
  for (const entry of UNLOCKS.list) {
    if (entry.weaponId) assert.ok(BALANCE.weapon(entry.weaponId), entry.id);
    if (entry.attachment) assert.ok(BALANCE.weapon(entry.attachment.weaponId).attachmentSlots.includes(entry.attachment.slot), entry.id);
  }
  assert.deepEqual(missingLoadoutUnlocks(UNLOCKS, new Set(automaticUnlocks(UNLOCKS, 1, new Set()).map(({ id }) => id)), STANDARD_LOADOUT), [],
    'Grundausstattung deckt das Standard-Loadout');
  // Primär, Sekundär, Granate, Medizin, Nahkampf, Rucksack, Rüstung.
  assert.deepEqual(missingLoadoutUnlocks(UNLOCKS, new Set(), STANDARD_LOADOUT).length, 7);
});

test('Freischaltungen: Grundausstattung, Levelstufen und Auswahl', async () => {
  const registry = createUnlockRegistry([
    unlock('weapon.base', { acquisition: 'starter' }),
    unlock('research.optics', { level: 3, requires: ['weapon.base'] }),
    unlock('attachment.red-dot', { acquisition: 'choice', level: 4, requires: ['research.optics'] }),
  ]);
  const service = new AccountService(new AccountStore(':memory:'), { unlocks: registry });
  try {
    const account = (await service.store.register('Kestrel', 'geheimes-passwort'))!;
    assert.deepEqual(service.syncUnlocks({ id: account.id, level: 1 }), ['weapon.base']);
    assert.deepEqual(service.syncUnlocks({ id: account.id, level: 1 }), [], 'idempotent');
    assert.deepEqual(service.syncUnlocks({ id: account.id, level: 3 }), ['research.optics'], 'Levelstufe mit erfüllter Voraussetzung');
    assert.deepEqual(service.unlock({ id: account.id, level: 3 }, 'attachment.red-dot'), { ok: false, reason: 'Noch nicht verfügbar: ab Level 4.' });
    assert.equal(service.unlock({ id: account.id, level: 3 }, 'research.optics').ok, false);
    assert.deepEqual(service.unlock({ id: account.id, level: 4 }, 'attachment.red-dot'), { ok: true });
    assert.deepEqual(service.store.unlocks(account.id).map(({ id, source }) => [id, source]),
      [['weapon.base', 'starter'], ['research.optics', 'level'], ['attachment.red-dot', 'choice']]);
    assert.equal(service.unlock({ id: account.id, level: 9 }, 'weapon.unknown').ok, false);
  } finally {
    service.store.close();
  }
});

test('Kontoverwaltung: Passwort ändern, Export, Löschen', { timeout: 20_000 }, async () => {
  const accounts = new AccountService(new AccountStore(':memory:'));
  const server = await startServer(0, '127.0.0.1', false, { accounts });
  try {
    const { port } = server.transport.server?.address() as { port: number };
    const base = `http://127.0.0.1:${port}/api`;
    const call = (method: string, path: string, token?: string, body?: unknown) => fetch(base + path, { method,
      headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: 'Bearer ' + token }) },
      ...(body !== undefined && { body: JSON.stringify(body) }) });
    const first = await (await call('POST', '/auth/register', undefined, { name: 'Kestrel', password: 'geheimes-passwort' })).json() as AccountSession;
    const handle = first.account.handle;
    const second = await (await call('POST', '/auth/login', undefined, { handle, password: 'geheimes-passwort' })).json() as AccountSession;

    assert.equal((await call('POST', '/account/password', first.token, { current: 'falsch-falsch', next: 'neues-passwort-1' })).status, 403);
    assert.equal((await call('POST', '/account/password', first.token, { current: 'geheimes-passwort', next: 'kurz' })).status, 400);
    const changed = await call('POST', '/account/password', first.token, { current: 'geheimes-passwort', next: 'neues-passwort-1' });
    assert.deepEqual(await changed.json(), { revokedSessions: 1 });
    assert.equal((await call('GET', '/account', second.token)).status, 401, 'anderes Gerät abgemeldet');
    assert.equal((await call('GET', '/account', first.token)).status, 200, 'eigene Sitzung bleibt');
    assert.equal((await call('POST', '/auth/login', undefined, { handle, password: 'geheimes-passwort' })).status, 401);
    const third = await (await call('POST', '/auth/login', undefined, { handle, password: 'neues-passwort-1' })).json() as AccountSession;
    assert.deepEqual(await (await call('POST', '/account/sessions/revoke-others', first.token)).json(), { revokedSessions: 1 });
    assert.equal((await call('GET', '/account', third.token)).status, 401);

    const unlocks = await (await call('GET', '/account/unlocks', first.token)).json() as { unlocks: { id: string }[] };
    assert.deepEqual(unlocks.unlocks.map(({ id }) => id).sort(), UNLOCKS.list.filter(({ acquisition }) => acquisition === 'starter').map(({ id }) => id).sort());

    const exported = await call('GET', '/account/export', first.token);
    assert.match(exported.headers.get('content-disposition') ?? '', /attachment; filename="freefall-Kestrel-\d{4}\.json"/);
    const dump = await exported.text();
    const data = JSON.parse(dump) as { account: { handle: string }; credentials: { kind: string }[]; sessions: unknown[]; unlocks: unknown[] };
    assert.equal(data.account.handle, handle);
    assert.deepEqual(data.credentials.map(({ kind }) => kind), ['password']);
    assert.equal(data.sessions.length, 1);
    assert.equal(data.unlocks.length, UNLOCKS.list.filter(({ acquisition }) => acquisition === 'starter').length);
    assert.ok(!dump.includes('scrypt') && !dump.includes(first.token), 'keine Geheimnisse im Export');

    assert.equal((await call('POST', '/account/delete', first.token, { password: 'neues-passwort-1', confirm: 'Kestrel' })).status, 400);
    assert.equal((await call('POST', '/account/delete', first.token, { password: 'falsch-falsch', confirm: handle })).status, 403);
    assert.equal((await call('POST', '/account/delete', first.token, { password: 'neues-passwort-1', confirm: handle })).status, 204);
    assert.equal((await call('GET', '/account', first.token)).status, 401);
    assert.equal((await call('POST', '/auth/login', undefined, { handle, password: 'neues-passwort-1' })).status, 401);
    for (const table of ['accounts', 'account_credentials', 'account_sessions', 'account_unlocks']) {
      assert.equal((accounts.store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, 0, table);
    }
  } finally {
    await server.gracefullyShutdown(false);
    accounts.store.close();
  }
});

test('Gelöschte Accounts verschwinden aus Einsätzen anderer, verwaiste Einsätze werden entfernt', async () => {
  const store = new AccountStore(':memory:');
  try {
    const a = (await store.register('Kestrel', 'geheimes-passwort'))!;
    const b = (await store.register('Albatross', 'geheimes-passwort'))!;
    store.settleMission(record('shared/result', [{ accountId: a.id, experience: 400, extracted: false, kills: 1 }, { accountId: b.id, experience: 400, extracted: false, kills: 1 }]));
    store.settleMission(record('solo/result', [{ accountId: a.id, experience: 400, extracted: false, kills: 1 }]));
    assert.equal(store.deleteAccount(a.id), true);
    assert.deepEqual(store.missionHistory(b.id).map(({ resultId, squad }) => [resultId, squad]), [['shared/result', []]]);
    assert.deepEqual((store.db.prepare('SELECT result_id FROM mission_results').all() as { result_id: string }[]).map(({ result_id }) => result_id), ['shared/result']);
    assert.equal((store.db.prepare('SELECT COUNT(*) AS n FROM experience_ledger').get() as { n: number }).n, 1);
  } finally {
    store.close();
  }
});
