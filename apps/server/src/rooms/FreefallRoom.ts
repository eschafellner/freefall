import { randomInt } from 'node:crypto';
import { Room, ServerError } from '@colyseus/core';
import type { Client } from '@colyseus/core';
import { BALANCE_VERSION_MESSAGE, BODENBRUCH, MAX_PLAYERS, NET, RECONNECT_SECONDS, WIDE_POSITION_SCALE } from '@freefall/shared';
import type { AtmosphereState, ServerMetrics } from '@freefall/shared';
import { MissionInstance } from '../mission/MissionInstance.ts';
import { Arena } from '../simulation/Arena.ts';
import { FixedLoop, timingStats } from '../simulation/FixedLoop.ts';
import { encodeHorde, playerSnapshot } from '../networking/snapshots.ts';

export class FreefallRoom extends Room {
  maxClients = MAX_PLAYERS;
  maxMessagesPerSecond = 90;

  protected createSimulation(seed: number): Arena | MissionInstance { return new Arena(seed); }
  protected get debug(): boolean { return false; }

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
      if (simulation instanceof MissionInstance) {
        client.send('mission-state', simulation.snapshot(this.debug));
      }
      client.send('players', playerSnapshot(simulation, this.host));
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

  onAuth(): boolean {
    return !(this.arena instanceof MissionInstance) || this.arena.acceptsNewOperators;
  }

  onJoin(client: Client): void {
    if (!this.onAuth()) throw new ServerError(400, 'Der Einsatz läuft. Beitritt wieder auf dem Carrier möglich.');
    this.arena.addPlayer(client.sessionId);
    this.members.add(client.sessionId);
    if (!this.host) this.host = client.sessionId;
  }

  onDrop(client: Client): void {
    if (!(this.arena instanceof MissionInstance)) return;
    this.arena.disconnect(client.sessionId);
    this.removeConnection(client.sessionId);
    void this.allowReconnection(client, RECONNECT_SECONDS).catch(() => {
      // A dropped handshake or expired seat is finalized by Colyseus through onLeave.
    });
  }

  onReconnect(client: Client): void {
    if (!(this.arena instanceof MissionInstance)) return;
    this.arena.reconnect(client.sessionId);
    this.members.add(client.sessionId);
    if (!this.host) this.host = client.sessionId;
  }

  onLeave(client: Client): void {
    this.arena.removePlayer(client.sessionId);
    this.removeConnection(client.sessionId);
    if (this.heldFull && !this.flightLocked) {
      this.heldFull = false;
      void this.unlock();
    }
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
  protected createSimulation(seed: number): MissionInstance { return new MissionInstance(seed, BODENBRUCH); }
}

export class LocalMissionDebugRoom extends BodenbruchRoom {
  protected get debug(): boolean { return true; }
}
