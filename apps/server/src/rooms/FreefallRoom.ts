import { randomInt } from 'node:crypto';
import { Room, ServerError } from '@colyseus/core';
import type { AuthContext, Client } from '@colyseus/core';
import { ACCOUNT_PROGRESS_MESSAGE, BALANCE_VERSION_MESSAGE, BODENBRUCH, LOADOUT_MESSAGE, validateLoadoutSelection, MAX_PLAYERS, NET, RECONNECT_SECONDS, ROSTER_MESSAGE, WIDE_POSITION_SCALE } from '@freefall/shared';
import type { AccountProfile, AccountProgress, LoadoutReply, AtmosphereState, MissionResult, RosterEntry, ServerMetrics } from '@freefall/shared';
import type { AccountService } from '../accounts/AccountService.ts';
import { missionRecord } from '../accounts/MissionSettlement.ts';
import { MissionInstance } from '../mission/MissionInstance.ts';
import { Arena } from '../simulation/Arena.ts';
import { FixedLoop, timingStats } from '../simulation/FixedLoop.ts';
import { encodeHorde, playerSnapshot } from '../networking/snapshots.ts';

export class FreefallRoom extends Room {
  maxClients = MAX_PLAYERS;
  maxMessagesPerSecond = 90;

  protected createSimulation(seed: number): Arena | MissionInstance { return new Arena(seed); }
  protected get debug(): boolean { return false; }
  /** Gesetzt über `withAccounts`. Ohne Dienst treten Clients als Gast bei. */
  get accountService(): AccountService | undefined { return undefined; }
  /** Debug-Räume schreiben keine EP gut (Debugbefehle können Ziele und Extraktion erzwingen). */
  protected get settlesExperience(): boolean { return !this.debug; }

  private readonly arena = this.createSimulation(randomInt(0x100000000));
  private missionClock = 0;
  private flightLocked = false;
  /** Room stayed locked after a run because it is full. Released when a seat frees up (see `onLeave`). */
  private heldFull = false;
  private revision = -1;
  private atmosphere?: AtmosphereState;
  private readonly loop = new FixedLoop();
  private readonly times: number[] = [];
  private readonly members = new Set<string>();
  /** Session-ID → Account des Operators. */
  private readonly operators = new Map<string, AccountProfile>();
  /** Session-ID → Account-ID für die gesamte Raumlaufzeit, auch nach dem Verlassen (Abrechnung verriegelter Teilnehmer). */
  private readonly identities = new Map<string, string>();
  /** Letzte Gutschrift je Session, für Reconnect und `sync-state`. */
  private readonly progress = new Map<string, AccountProgress>();
  private readonly reconnections = new Map<string, ReturnType<Room['allowReconnection']>>();
  private host = '';
  private playerClock = 0;
  private hordeClock = 0;
  private metricsClock = 0;
  private lastMetricsAt = performance.now();
  private lastMetricsTick = 0;

  onCreate(): void {
    const simulation = this.arena;
    simulation.profileEnemyAI = this.debug;
    const balance = simulation.registry.version;
    this.metadata = simulation instanceof MissionInstance
      ? { mission: simulation.definition.id, protocol: 5, balance: balance.hash } : { arena: 'Boreal Relay', protocol: 2, balance: balance.hash };
    this.onMessage(BALANCE_VERSION_MESSAGE, (client) => client.send(BALANCE_VERSION_MESSAGE, balance));
    this.onMessage('input', (client, payload: unknown) => {
      this.arena.receiveInput(client.sessionId, payload);
    });
    this.onMessage('sync-state', (client) => {
      client.send(ROSTER_MESSAGE, this.roster());
      const progress = this.progress.get(client.sessionId);
      if (progress) client.send(ACCOUNT_PROGRESS_MESSAGE, progress);
      if (simulation instanceof MissionInstance) {
        client.send('mission-state', simulation.snapshot(this.debug));
      }
      client.send('players', playerSnapshot(simulation, this.host));
      const own = simulation.players.find((player) => player?.id === client.sessionId);
      if (own) client.send(LOADOUT_MESSAGE, { selection: own.loadout.selection } satisfies LoadoutReply);
    });
    // Carrier › Ausrüstung: shape and IDs, then account unlocks, then the simulation (Carrier only, resolvable).
    this.onMessage(LOADOUT_MESSAGE, (client, payload: unknown) => {
      const reply = (message: LoadoutReply) => client.send(LOADOUT_MESSAGE, message);
      const checked = validateLoadoutSelection(simulation.registry, payload);
      if ('error' in checked) return reply({ error: checked.error });
      const account = this.operators.get(client.sessionId);
      const missing = account ? this.accountService?.missingForLoadout(account, checked.selection) ?? [] : [];
      if (missing.length) return reply({ error: `Nicht freigeschaltet: ${missing.join(', ')}` });
      const error = simulation.setLoadout(client.sessionId, checked.selection);
      reply(error ? { error } : { selection: checked.selection });
    });
    this.onMessage('horde-size', (client, payload: unknown) => {
      if (client.sessionId === this.host && simulation instanceof Arena) simulation.setHordeSize(payload);
    });
    if (simulation instanceof MissionInstance) {
      this.onMessage('mission-selection', (client, payload: unknown) => {
        if (client.sessionId === this.host) simulation.select(client.sessionId, payload, this.debug);
      });
      this.onMessage('atmosphere-state', (client) => client.send('atmosphere-state', simulation.atmosphere ?? null));
      this.onMessage('mission-plan', (client, id: unknown) => {
        const plan = simulation.plan;
        if (plan && plan.id === id) client.send('mission-plan', plan);
      });
      this.onMessage('mission-start', (client, planId: unknown) => {
        if (client.sessionId === this.host && planId === simulation.plan?.id) simulation.start(client.sessionId);
      });
      this.onMessage('mission-cancel', (client) => {
        if (client.sessionId === this.host) simulation.cancelBoarding(client.sessionId);
      });
      this.onMessage('mission-action', (client, action: unknown) => simulation.action(client.sessionId, action));
      this.onMessage('mission-interact', (client) => simulation.interact(client.sessionId));
      this.onMessage('mission-debug', (client, payload: unknown) => {
        if (this.debug && client.sessionId === this.host) simulation.debug(client.sessionId, payload);
      });
    }
    let previous = performance.now();
    this.setTimestep(() => {
      const now = performance.now();
      this.loop.advance(now - previous, this.step);
      previous = now;
    }, 1000 / NET.tickHz);
    // Disable Schema patches after installing the simulation callback so Colyseus
    // does not install a second timer to advance its room clock.
    this.patchRate = null;
  }

  private get acceptsJoin(): boolean {
    return !(this.arena instanceof MissionInstance) || this.arena.acceptsNewOperators;
  }

  onJoin(client: Client): void {
    if (!this.acceptsJoin) throw new ServerError(400, 'Der Einsatz läuft. Beitritt wieder auf dem Carrier möglich.');
    const account = this.accountService ? client.auth as AccountProfile | undefined : undefined;
    if (account) {
      const sessionId = client.sessionId;
      const claimed = this.accountService!.claim(account.id, { roomId: this.roomId, sessionId, connected: true,
        evict: () => this.reconnections.get(sessionId)?.reject(new Error('Operator in neuer Sitzung angemeldet')) });
      if (!claimed) throw new ServerError(409, `${account.handle} ist bereits in einem anderen Fenster verbunden.`);
      // Serverseitige Loadout-Prüfung: Heute setzen alle mit der Standardausrüstung ein, die jeder Account besitzt.
      const missing = this.accountService!.missingForLoadout(account);
      if (missing.length) {
        this.accountService!.release(account.id, sessionId);
        throw new ServerError(403, `Ausrüstung nicht freigeschaltet: ${missing.join(', ')}`);
      }
      this.operators.set(sessionId, account);
      this.identities.set(sessionId, account.id);
    }
    this.arena.addPlayer(client.sessionId);
    this.members.add(client.sessionId);
    if (!this.host) this.host = client.sessionId;
    if (account) this.broadcast(ROSTER_MESSAGE, this.roster());
  }

  onDrop(client: Client): void {
    if (!(this.arena instanceof MissionInstance)) return;
    this.arena.disconnect(client.sessionId);
    this.removeConnection(client.sessionId);
    const account = this.operators.get(client.sessionId);
    if (account) this.accountService?.setConnected(account.id, client.sessionId, false);
    const reconnection = this.allowReconnection(client, RECONNECT_SECONDS);
    this.reconnections.set(client.sessionId, reconnection);
    void reconnection.catch(() => {
      // A dropped handshake or expired seat is finalized by Colyseus through onLeave.
    });
  }

  onReconnect(client: Client): void {
    this.reconnections.delete(client.sessionId);
    if (!(this.arena instanceof MissionInstance)) return;
    this.arena.reconnect(client.sessionId);
    this.members.add(client.sessionId);
    if (!this.host) this.host = client.sessionId;
    const account = this.operators.get(client.sessionId);
    if (account) this.accountService?.setConnected(account.id, client.sessionId, true);
  }

  onLeave(client: Client): void {
    this.reconnections.delete(client.sessionId);
    const account = this.operators.get(client.sessionId);
    if (account) {
      this.operators.delete(client.sessionId);
      this.progress.delete(client.sessionId);
      this.accountService?.release(account.id, client.sessionId);
      this.broadcast(ROSTER_MESSAGE, this.roster());
    }
    this.arena.removePlayer(client.sessionId);
    this.removeConnection(client.sessionId);
    if (this.heldFull && !this.flightLocked) {
      this.heldFull = false;
      void this.unlock();
    }
  }

  /** Schreibt das Einsatzergebnis den Accounts gut und meldet jedem Operator seine Gutschrift. */
  private settle(result: MissionResult): void {
    const accounts = this.accountService;
    if (!accounts || !this.settlesExperience) return;
    const credited = accounts.settlement.settle(missionRecord(result, this.identities));
    if (!credited) return;
    for (const [sessionId, accountId] of this.identities) {
      const credit = credited.get(accountId);
      if (!credit) continue;
      const unlocked = accounts.syncUnlocks({ id: accountId, level: credit.level });
      const progress = unlocked.length ? { ...credit, unlocked } : credit;
      credited.set(accountId, progress);
      this.progress.set(sessionId, progress);
      const account = this.operators.get(sessionId);
      if (account) this.operators.set(sessionId, { ...account, experience: progress.experience, level: progress.level,
        ...(progress.resources && { resources: progress.resources.balance }) });
      this.clients.getById(sessionId)?.send(ACCOUNT_PROGRESS_MESSAGE, progress);
    }
    this.broadcast(ROSTER_MESSAGE, this.roster());
  }

  private roster(): RosterEntry[] {
    return [...this.operators].map(([id, { name, tag, level }]) => ({ id, name, tag, level }));
  }

  private removeConnection(id: string): void {
    this.members.delete(id);
    if (this.host === id) this.host = this.members.values().next().value ?? '';
  }

  private readonly step = (): void => {
    const start = performance.now();
    this.arena.step();
    this.times.push(performance.now() - start);
    if (this.times.length > NET.tickHz * 4) this.times.shift();

    let flowChanged = false;
    for (const shot of this.arena.shots) {
      const operator = this.arena.players.find((player) => player?.id === shot.shooter);
      this.broadcast('shot', { ...shot, tick: this.arena.tick, ...(operator && { life: operator.life }) });
    }
    // Bounded feedback for this tick. Health and attack state are also carried in full snapshots.
    const combat = this.arena.combatEvents;
    if (combat.length > 48) {
      // Keep transient action results even under enemy-hit pressure. Snapshot health remains authoritative.
      const action = (event: (typeof combat)[number]) =>
        event.type === 'blast' || event.type === 'melee' || event.type === 'grenade-release';
      const actions = combat.filter(action);
      this.broadcast('combat', [...actions, ...combat.filter((event) => !action(event)).slice(0, Math.max(0, 48 - actions.length))]);
    } else if (combat.length) this.broadcast('combat', combat);
    if (this.arena instanceof MissionInstance) {
      if (this.flightLocked === this.arena.acceptsNewOperators) {
        this.flightLocked = !this.flightLocked;
        if (this.flightLocked) void this.lock();
        // A full room keeps its lock after the run. An explicit unlock would list it as joinable although every
        // seat is taken, and matchmaking would fail instead of creating a new room.
        else if (this.hasReachedMaxClients()) this.heldFull = true;
        else void this.unlock();
      }
      const events = this.arena.drainEvents();
      if (events.length) this.broadcast('mission-events', events);
      for (const event of events) if (event.type === 'MissionCompleted') this.settle(event.result);
      if (this.arena.captureMissionTelemetry) {
        const completed = events.find((event) => event.type === 'MissionCompleted');
        if (completed) console.info('[mission-telemetry] %s', JSON.stringify({
          result: completed.result, telemetry: this.arena.missionTelemetry(),
        }));
      }
      for (const { id, code } of this.arena.drainFeedback()) this.clients.getById(id)?.send('mission-feedback', code);
      if (this.atmosphere !== this.arena.atmosphere) {
        this.atmosphere = this.arena.atmosphere;
        this.broadcast('atmosphere-state', this.atmosphere ?? null);
      }
      const revisionChanged = this.revision !== this.arena.flowRevision;
      this.revision = this.arena.flowRevision;
      flowChanged = revisionChanged;
      this.missionClock += NET.missionHz;
      const periodic = this.missionClock >= NET.tickHz;
      if (periodic) this.missionClock -= NET.tickHz;
      if (periodic || revisionChanged) this.broadcast('mission-state', this.arena.snapshot(this.debug));
    }
    this.playerClock += NET.playerHz;
    if (this.playerClock >= NET.tickHz) {
      this.playerClock -= NET.tickHz;
      this.broadcast('players', playerSnapshot(this.arena, this.host));
    } else if (flowChanged) this.broadcast('players', playerSnapshot(this.arena, this.host));
    this.hordeClock += NET.hordeHz;
    if (this.hordeClock >= NET.tickHz) {
      this.hordeClock -= NET.tickHz;
      if (this.arena instanceof MissionInstance) {
        this.broadcastBytes('horde-wide', encodeHorde(this.arena.horde, this.arena.tick, WIDE_POSITION_SCALE, this.arena.enemyCombat), {});
      } else {
        this.broadcastBytes('horde', encodeHorde(this.arena.horde, this.arena.tick, undefined, this.arena.enemyCombat), {});
      }
    }
    this.metricsClock += NET.metricsHz;
    if (this.metricsClock >= NET.tickHz) {
      this.metricsClock -= NET.tickHz;
      const now = performance.now();
      const stats = timingStats(this.times);
      const metrics: ServerMetrics = {
        tickHz: (this.arena.tick - this.lastMetricsTick) * 1000 / Math.max(1, now - this.lastMetricsAt),
        lastMs: this.times.at(-1) ?? 0,
        meanMs: stats.mean,
        p95Ms: stats.p95,
        droppedSteps: this.loop.dropped,
        activeEnemies: this.arena.horde.count,
        activePlayers: this.members.size,
        hordeSize: this.arena instanceof Arena ? this.arena.desired : 0,
        combat: this.arena.stats.snapshot(),
        ...(this.debug && { enemyAI: this.arena.enemyAIMetrics() }),
        ...(this.debug && this.arena instanceof MissionInstance && this.arena.director.pacing.active && {
          hordeDirector: this.arena.director.pacing.metrics(),
        }),
      };
      this.lastMetricsAt = now;
      this.lastMetricsTick = this.arena.tick;
      this.broadcast('metrics', metrics);
    }
  };
}

export class BodenbruchRoom extends FreefallRoom {
  protected createSimulation(seed: number): MissionInstance {
    const mission = new MissionInstance(seed, BODENBRUCH);
    mission.captureMissionTelemetry = process.env.FREEFALL_MISSION_TELEMETRY === '1';
    return mission;
  }
}

export class LocalMissionDebugRoom extends BodenbruchRoom {
  protected get debug(): boolean { return true; }
}

/**
 * Raumklasse mit Accountdienst. Ohne Dienst bleibt die Klasse unverändert (Gastmodus).
 * Das statische `onAuth` läuft schon beim HTTP-Matchmaking: Ohne gültiges Token gibt es weder Raum noch Platzreservierung.
 * Das Ergebnis steht danach in `client.auth`.
 */
export function withAccounts<T extends typeof FreefallRoom>(Base: T, accounts: AccountService | undefined): T {
  if (!accounts) return Base;
  // @ts-expect-error Mixin über eine konkrete Raumklasse; der Konstruktor bleibt unverändert.
  return class extends Base {
    get accountService(): AccountService { return accounts; }

    static async onAuth(token: string, _options: unknown, _context: AuthContext): Promise<AccountProfile> {
      if (!token) throw new ServerError(401, 'Bitte zuerst anmelden.');
      const account = accounts.authenticate(token);
      if (!account) throw new ServerError(401, 'Anmeldung abgelaufen. Bitte erneut anmelden.');
      return account;
    }
  };
}
