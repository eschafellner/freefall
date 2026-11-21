import { NET, distanceSquared } from '@freefall/shared';
import type {
  HordeDirectorMetrics, HordeDirectorSnapshot, HordeDirectorState, HordeWaveEndReason, MissionBalance, MissionEvent,
  PositionXZ, SwarmBreachRegion, WorldDefinition,
} from '@freefall/shared';
import type { HordeManager } from '../ecs/HordeManager.ts';
import type { SimPlayer } from '../simulation/Player.ts';
import type { PatrolGroup, PatrolManager } from './PatrolManager.ts';
import { SPAWN_DEFERRED } from './SpawnManager.ts';
import type { SpawnManager } from './SpawnManager.ts';

export type EncounterHold = Exclude<HordeWaveEndReason, 'completed' | 'partial' | 'blocked'>;

interface Wave {
  id: number;
  budget: number;
  scale: number;
  spawned: number;
  groupCount: number;
  nextAt: number;
  batch?: Batch;
}

interface Batch {
  cursor: number;
  attemptsLeft: number;
  region?: SwarmBreachRegion;
  origin?: PositionXZ;
  group?: PatrolGroup;
}

interface OperatorHealth {
  player: SimPlayer;
  life: number;
  hp: number;
}

export class HordeDirector {
  private readonly balance: MissionBalance;
  private readonly horde: HordeManager;
  private readonly spawns: SpawnManager;
  private readonly patrols: PatrolManager;
  private readonly random: () => number;
  private readonly emit: (event: MissionEvent) => void;
  private readonly regions: SwarmBreachRegion[];
  private readonly config: MissionBalance['director'];
  private readonly health: (OperatorHealth | undefined)[] = [];
  private state: HordeDirectorState = 'CALM';
  private stateAt = 0;
  private calmUntil = 0;
  private nextSample = 0;
  private started = false;
  private serial = 0;
  private wave?: Wave;
  private hold?: EncounterHold;
  private lastRegion?: SwarmBreachRegion;
  private pressure = 0;
  private nearby = 0;
  private living = 0;
  private attacking = 0;
  private damage = 0;
  private casualties = 0;
  private damageMemory = 0;
  private casualtyMemory = 0;
  private rateTick = 0;
  private lastChecks = 0;
  private lastWaveChecks = 0;
  private checksPerSecond = 0;
  private waveChecksPerSecond = 0;
  private throttled = false;
  updateMs = 0;

  constructor(world: WorldDefinition, balance: MissionBalance, horde: HordeManager, spawns: SpawnManager,
    patrols: PatrolManager, random: () => number, emit: (event: MissionEvent) => void) {
    this.balance = balance;
    this.horde = horde;
    this.spawns = spawns;
    this.patrols = patrols;
    this.random = random;
    this.emit = emit;
    this.config = balance.director;
    this.regions = [
      ...world.breachRegions.map((region) => ({ ...region, id: 'breach/' + region.id })),
      ...world.patrolRegions.map(({ id, x, z, radius }) => ({ id: 'patrol/' + id, x, z, radius })),
    ];
  }

  get active(): boolean { return this.started; }

  private enter(state: HordeDirectorState, tick: number): void {
    this.state = state;
    this.stateAt = tick;
    if (state === 'CALM') {
      const config = this.config.timing;
      this.calmUntil = tick + config.calmTicks + Math.floor(this.random() * (config.calmJitterTicks + 1));
    }
  }

  private scale(living: number): number {
    return 1 + Math.max(0, living - 1) * this.config.wave.perAdditionalOperator;
  }

  private endWave(tick: number, reason: HordeWaveEndReason): void {
    const wave = this.wave;
    this.spawns.releaseWave();
    this.wave = undefined;
    if (wave) this.emit({ type: 'HordeWaveEnded', tick, waveId: wave.id, spawned: wave.spawned, reason });
    this.enter('RECOVERY', tick);
  }

  stop(tick: number): void {
    if (!this.started) return;
    this.endWave(tick, 'mission-ended');
    this.started = false;
    this.hold = 'mission-ended';
  }

  /** Local debug can shorten calm. All regular eligibility and validation still apply. */
  cue(tick: number): boolean {
    if (!this.started || this.state !== 'CALM' || this.hold) return false;
    this.calmUntil = tick;
    return true;
  }

  update(tick: number, players: readonly SimPlayer[], living: readonly SimPlayer[], attacking: number,
    missionHold: EncounterHold | undefined, profile: boolean): void {
    this.updateMs = 0;
    if (!this.config.enabled || !this.regions.length) return;
    if (!this.started) {
      this.started = true;
      this.rateTick = tick - 1;
      this.enter('CALM', tick);
    }
    const before = profile ? performance.now() : 0;
    const deferrals = this.spawns.totals.budgetDeferrals + this.spawns.totals.capacityDeferrals;
    this.recordHealth(players);
    this.living = living.length;
    if (tick >= this.nextSample) this.samplePressure(tick, living, attacking);
    const hold = missionHold ?? (living.length === 0 ? 'team-unavailable' : undefined);
    this.hold = hold ?? (this.pressure >= this.config.pressure.pauseAt ? 'pressure' : undefined);
    this.throttled = false;
    this.advance(tick, this.hold);
    this.throttled ||= this.spawns.totals.budgetDeferrals + this.spawns.totals.capacityDeferrals > deferrals;
    if (tick - this.rateTick >= NET.tickHz) {
      this.checksPerSecond = this.spawns.totals.checked - this.lastChecks;
      this.waveChecksPerSecond = this.spawns.totals.waveChecked - this.lastWaveChecks;
      this.lastChecks = this.spawns.totals.checked;
      this.lastWaveChecks = this.spawns.totals.waveChecked;
      this.rateTick = tick;
    }
    if (profile) this.updateMs = performance.now() - before;
  }

  private recordHealth(players: readonly SimPlayer[]): void {
    let present = 0;
    for (const player of players) {
      present |= 1 << player.slot;
      let previous = this.health[player.slot];
      if (previous?.player !== player || previous.life !== player.life) {
        previous = { player, life: player.life, hp: player.hp };
        this.health[player.slot] = previous;
      }
      if (player.hp < previous.hp) {
        this.damage += (previous.hp - player.hp) / player.loadout.maxHealth;
        if (player.hp <= 0) this.casualties++;
      }
      previous.hp = player.hp;
    }
    for (let slot = 0; slot < this.health.length; slot++) if (!(present & (1 << slot))) this.health[slot] = undefined;
  }

  private samplePressure(tick: number, players: readonly SimPlayer[], attacking: number): void {
    const { pressure, sampleTicks } = this.config;
    const weights = pressure.weights;
    const expected = Math.max(1, this.balance.limits.patrolMinSize + this.balance.limits.patrolMaxSize);
    const radius2 = this.balance.patrols.sightRange ** 2;
    let nearby = 0, weakness = 0;
    const horde = this.horde;
    for (const player of players) {
      weakness = Math.max(weakness, 1 - player.hp / player.loadout.maxHealth);
      let local = 0;
      for (let i = 0; i < horde.count; i++) {
        const slot = horde.active[i];
        if ((player.x - horde.x[slot]) ** 2 + (player.z - horde.z[slot]) ** 2 <= radius2) local++;
      }
      nearby = Math.max(nearby, local);
    }
    this.nearby = nearby;
    this.attacking = attacking;
    this.damageMemory = Math.min(1, this.damageMemory * (1 - pressure.smoothing) + this.damage);
    this.casualtyMemory = Math.min(1, this.casualtyMemory * (1 - pressure.smoothing) + this.casualties);
    this.damage = this.casualties = 0;
    const raw = Math.min(1, weights.population * (horde.count / this.spawns.cap) +
      weights.nearby * Math.min(1, nearby / expected) +
      weights.attacks * Math.min(1, attacking / (expected * this.scale(players.length))) +
      weights.health * weakness + weights.damage * this.damageMemory + weights.casualties * this.casualtyMemory);
    this.pressure += (raw - this.pressure) * pressure.smoothing;
    this.nextSample = tick + sampleTicks;
  }

  private advance(tick: number, hold?: EncounterHold): void {
    const { timing, wave: config, pressure } = this.config;
    const age = tick - this.stateAt;
    const wave = this.wave;
    if (wave && hold) {
      this.endWave(tick, hold);
      return;
    }
    switch (this.state) {
      case 'CALM': {
        if (hold) this.calmUntil = Math.max(this.calmUntil, tick + timing.buildupTicks);
        if (hold || tick < this.calmUntil || this.pressure > pressure.startAtMost) return;
        const capacity = this.spawns.waveCapacity;
        if (capacity < config.minEnemies) {
          this.throttled = true;
          return;
        }
        const scale = this.scale(this.living);
        const jitter = 1 + (2 * this.random() - 1) * config.budgetJitter;
        const baseline = (this.balance.limits.patrolMinSize + this.balance.limits.patrolMaxSize) / 2;
        const budget = Math.min(capacity, config.maxEnemies, Math.max(config.minEnemies, Math.round(baseline * scale * jitter)));
        const id = ++this.serial;
        this.wave = { id, budget, scale, spawned: 0, groupCount: 0, nextAt: tick };
        this.enter('BUILDUP', tick);
        this.emit({ type: 'HordeWaveStarted', tick, waveId: id, budget });
        break;
      }
      case 'BUILDUP':
        if (age < timing.buildupTicks) {
          if (wave!.groupCount === 0 || wave!.batch) this.schedule(wave!, tick);
        } else {
          this.enter('ASSAULT', tick);
        }
        break;
      case 'ASSAULT':
        if (age >= timing.assaultMaxTicks || (age >= timing.assaultMinTicks && wave!.spawned >= this.limit(wave!))) {
          this.spawns.releaseWave();
          wave!.batch = undefined;
          if (!wave!.spawned) this.endWave(tick, 'blocked');
          else this.enter('PEAK', tick);
        } else {
          this.schedule(wave!, tick);
        }
        break;
      case 'PEAK':
        if (age >= timing.peakMaxTicks || (age >= timing.peakMinTicks && this.pressure <= pressure.startAtMost)) {
          this.endWave(tick, wave!.spawned >= wave!.budget ? 'completed' : 'partial');
        }
        break;
      case 'RECOVERY':
        if (age >= timing.recoveryMaxTicks || (age >= timing.recoveryMinTicks && !hold && this.pressure <= pressure.startAtMost)) {
          this.enter('CALM', tick);
        }
        break;
    }
  }

  private limit(wave: Wave): number {
    const scale = this.scale(this.living);
    return scale >= wave.scale ? wave.budget : Math.floor(wave.budget * (scale / wave.scale));
  }

  private schedule(wave: Wave, tick: number): void {
    if (tick < wave.nextAt) return;
    const { wave: config, spawn } = this.config;
    const remaining = this.limit(wave) - wave.spawned;
    if (remaining <= 0) {
      if (wave.batch) this.closeBatch(wave, tick);
      return;
    }
    if (!wave.batch) {
      const size = config.groupMin + Math.floor(this.random() * (config.groupMax - config.groupMin + 1));
      if (!this.spawns.reserveWave(Math.min(size, remaining))) {
        this.throttled = true;
        wave.nextAt = tick + config.groupIntervalTicks;
        return;
      }
      let cursor = Math.floor(this.random() * this.regions.length);
      if (this.regions.length > 1 && this.regions[cursor] === this.lastRegion) cursor++;
      wave.batch = { cursor, attemptsLeft: config.candidateRetries };
      wave.groupCount++;
    }

    const batch = wave.batch;
    if (!this.spawns.reserved) {
      this.closeBatch(wave, tick);
      return;
    }
    for (let i = 0; i < spawn.dynamicChecksPerTick && batch.attemptsLeft > 0; i++) {
      const region = batch.region ?? this.regions[batch.cursor % this.regions.length];
      const origin = batch.origin ?? region;
      const spread = batch.origin ? Math.min(region.radius, this.balance.hordeAi.gridCellSize) : region.radius;
      const angle = this.random() * 2 * Math.PI;
      const radius = Math.sqrt(this.random()) * spread;
      const position = { x: origin.x + Math.sin(angle) * radius, z: origin.z + Math.cos(angle) * radius };
      if (distanceSquared(position, region) > region.radius ** 2) {
        batch.attemptsLeft--;
        continue;
      }
      const focus = batch.group?.state === 'ELIMINATED' ? undefined : batch.group?.lastKnown;
      const result = this.spawns.spawnWave(position, region.id, focus);
      if (result === SPAWN_DEFERRED) return;
      batch.cursor++;
      batch.attemptsLeft--;
      if (typeof result === 'number') continue;
      if (!batch.group || batch.group.state === 'ELIMINATED') {
        this.lastRegion = batch.region = region;
        batch.origin = { x: this.horde.x[result.slot], z: this.horde.z[result.slot] };
        const speed = this.balance.enemies[this.balance.nest.spawnWireType].speed;
        const travelTicks = Math.ceil(this.balance.reinforcements.breachSearchRadius / speed * NET.tickHz);
        batch.group = this.patrols.dispatch({ ...region, route: { waypoints: [batch.origin] } }, batch.origin,
          result.target, tick + travelTicks + this.balance.patrols.investigateTicks);
      }
      this.patrols.attach(batch.group, result.slot);
      wave.spawned++;
      if (this.spawns.reserved && batch.attemptsLeft > 0 && wave.spawned < this.limit(wave)) {
        wave.nextAt = tick + config.spawnIntervalTicks;
      } else {
        this.closeBatch(wave, tick);
      }
      return;
    }
    if (batch.attemptsLeft <= 0) this.closeBatch(wave, tick);
  }

  private closeBatch(wave: Wave, tick: number): void {
    this.spawns.releaseWave();
    wave.batch = undefined;
    wave.nextAt = tick + this.config.wave.groupIntervalTicks;
  }

  snapshot(): HordeDirectorSnapshot | undefined {
    if (!this.started) return;
    return { state: this.state, stateAt: this.stateAt, waveId: this.wave?.id };
  }

  metrics(): HordeDirectorMetrics {
    const { totals } = this.spawns;
    return {
      state: this.state, stateAt: this.stateAt, waveId: this.wave?.id,
      pressure: this.pressure, nearby: this.nearby, attacking: this.attacking, living: this.living,
      scale: this.scale(this.living), budget: this.wave?.budget ?? 0,
      remaining: this.wave ? Math.max(0, this.limit(this.wave) - this.wave.spawned) : 0,
      reserved: this.spawns.reserved, queuedGroups: this.wave?.batch ? 1 : 0, cap: this.spawns.cap, hold: this.hold,
      lastSpawnRegion: this.lastRegion?.id,
      lastRegion: this.spawns.lastRegion, lastCandidate: this.spawns.lastCandidate, lastResult: this.spawns.lastResult,
      checksPerSecond: this.checksPerSecond, waveChecksPerSecond: this.waveChecksPerSecond,
      failures: Object.values(totals.rejected).reduce((total, count) => total + count, 0), throttled: this.throttled,
      updateMs: this.updateMs, validationMs: this.spawns.validationMs, initializationMs: this.spawns.initializationMs,
    };
  }
}
