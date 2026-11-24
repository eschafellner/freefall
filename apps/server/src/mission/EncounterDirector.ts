import { NET, distanceSquared, openGround } from '@freefall/shared';
import type {
  MissionBalance, MissionDefinition, MissionEvent, MissionState, PatrolRegion, PositionXZ, SwarmBreachRegion,
} from '@freefall/shared';
import { ENEMY_GROUND_RADIUS } from '../ecs/EnemyNavigation.ts';
import type { HordeManager } from '../ecs/HordeManager.ts';
import type { SimPlayer } from '../simulation/Player.ts';
import { PatrolManager } from './PatrolManager.ts';
import type { PatrolGroup } from './PatrolManager.ts';
import { SwarmNestManager } from './SwarmNestManager.ts';
import type { SwarmNest } from './SwarmNestManager.ts';

import { HordeDirector } from './HordeDirector.ts';
import type { EncounterHold } from './HordeDirector.ts';
import { SpawnManager, SPAWN_DEFERRED } from './SpawnManager.ts';

import { nestFits } from './MissionLocations.ts';
import { seededRandom } from '../simulation/Battlefield.ts';

/** Whole part always, the fraction as a chance (difficulty shares such as 0.35 breachers per call). */
function rollCount(expected: number, random: () => number): number {
  const whole = Math.floor(expected);
  return whole + (random() < expected - whole ? 1 : 0);
}

/** FNV-1a over a string, used to seed the caste rolls per mission without touching the shared random streams. */
function seedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash;
}

export class EncounterDirector {
  readonly patrols: PatrolManager;
  readonly nests: SwarmNestManager;
  readonly initialNests = new Map<number, PositionXZ>();
  threat = 0;
  breachCount = 0;
  reinforcements = 0;
  readonly pacing: HordeDirector;
  readonly spawns: SpawnManager;
  private lastTick = -1;
  private lastDestroyed = 0;
  private nextGlobalCall = 0;
  private nextExtractionPressure = 0;
  private extractionFocus?: PositionXZ;
  private alertHeat = 0;
  private readonly regionalCalls = new Map<string, number>();
  private readonly garrisons = new Map<number, PatrolGroup>();
  private readonly patrolSeeding = new Map<PatrolGroup, { until: number; retryAt: number }>();
  /** Patrols that consist of hunters only. */
  private readonly hunterPatrols = new WeakSet<PatrolGroup>();
  /** Breachers per nest: guards still to spawn and breachers owed to reinforcement calls. */
  private readonly breachers = new Map<number, { guards: number; called: number }>();
  /** Separate stream for caste rolls, so the composition never shifts the established spawn sequences. */
  private readonly casteRandom: () => number;
  readonly casteSpawns = { hunters: 0, breachers: 0 };
  private readonly mission: MissionDefinition;
  private readonly players: readonly (SimPlayer | undefined)[];
  private readonly random: () => number;
  /** Fixed balance snapshot of this mission run. All difficulty effects are already resolved. */
  readonly balance: MissionBalance;
  private readonly limits: MissionBalance['limits'];
  private readonly calls: MissionBalance['reinforcements'];
  private readonly threatConfig: MissionBalance['threat'];
  private readonly level: number;

  constructor(mission: MissionDefinition, horde: HordeManager, players: readonly (SimPlayer | undefined)[],
    balance: MissionBalance, random: () => number, waveRandom: () => number, emit: (event: MissionEvent) => void) {
    this.mission = mission;
    this.players = players;
    this.balance = balance;
    this.limits = balance.limits;
    this.calls = balance.reinforcements;
    this.threatConfig = balance.threat;
    this.level = balance.difficulty.level;
    this.random = random;
    this.casteRandom = seededRandom(seedOf(mission.id + '/' + mission.world.id) ^ this.level);
    this.patrols = new PatrolManager(mission.world, horde, random, emit, balance);
    this.nests = new SwarmNestManager(emit, random, balance, mission.world);
    this.spawns = new SpawnManager(mission, horde, this.patrols.navigation, players, balance,
      (position) => this.nests.blocksSpawn(position, ENEMY_GROUND_RADIUS));
    this.pacing = new HordeDirector(mission.world, balance, horde, this.spawns, this.patrols, waveRandom, emit);
  }

  deploy(tick: number): void {
    const regions = this.mission.world.patrolRegions;
    if (regions.length) {
      for (let i = 0; i < this.limits.patrolGroupCount; i++) this.newPatrol(i, tick);
    }
    for (const position of this.mission.world.initialNests) {
      if (this.nests.active.size >= this.limits.maxActiveNests) break;
      if (this.validBreachPosition(position, false)) this.initialNests.set(this.guard(this.nests.create(position, tick)).id, position);
    }
    this.updateThreat(false, false);
  }

  private newPatrol(index: number, tick: number): void {
    const regions = this.mission.world.patrolRegions;
    if (!regions.length || this.patrols.groups.size >= this.limits.patrolGroupCount + this.limits.maxActiveNests) return;
    const region = regions[index % regions.length];
    const waypoint = Math.floor(index / regions.length) % region.route.waypoints.length;
    const { patrolMinSize, patrolMaxSize } = this.limits;
    const size = patrolMinSize + Math.floor(this.random() * (patrolMaxSize - patrolMinSize + 1));
    const group = this.patrols.create(region, waypoint, size);
    if (this.balance.castes.hunterPatrolPureChance > 0 && this.casteRandom() < this.balance.castes.hunterPatrolPureChance) {
      this.hunterPatrols.add(group);
    }
    this.patrolSeeding.set(group, { until: tick + this.balance.director.spawn.patrolSeedWindowTicks, retryAt: tick });
  }

  /** Wire type of the next patrol member: hunters by the difficulty's share, or all of them in a hunter patrol. */
  private patrolMemberType(group: PatrolGroup): number {
    const castes = this.balance.castes;
    if (this.hunterPatrols.has(group)) return castes.hunterWireType;
    return castes.hunterPatrolShare > 0 && this.casteRandom() < castes.hunterPatrolShare
      ? castes.hunterWireType : this.balance.nest.spawnWireType;
  }

  /** Rolls the breacher guards of a new nest (difficulty.json › breacherNestGuards). */
  private guard(nest: SwarmNest): SwarmNest {
    this.breachers.set(nest.id, { guards: rollCount(this.balance.castes.breacherNestGuards, this.casteRandom), called: 0 });
    return nest;
  }

  /** Breachers answering a reinforcement call emerge from the breach or the boosted nest. */
  private callBreachers(nestId: number): void {
    const entry = this.breachers.get(nestId);
    if (entry) entry.called += rollCount(this.balance.castes.breachersPerReinforcement, this.casteRandom);
  }

  validBreachPosition(position: PositionXZ, checkPlayers = true): boolean {
    if (!nestFits(this.mission, this.balance, position)) return false;
    const calls = this.calls;
    if (checkPlayers && this.players.some((player) => player && player.hp > 0 && distanceSquared(player, position) < calls.playerClearance ** 2)) return false;
    for (const nest of this.nests.active.values()) if (distanceSquared(nest, position) < calls.nestSpacing ** 2) return false;
    return true;
  }

  private pickBreach(focus: PositionXZ, tick: number): { position: PositionXZ; region: SwarmBreachRegion } | undefined {
    const regions = this.mission.world.breachRegions.filter((region) =>
      (this.regionalCalls.get(region.id) ?? 0) <= tick && distanceSquared(focus, region) < this.calls.breachSearchRadius ** 2);
    regions.sort((a, b) => distanceSquared(a, focus) - distanceSquared(b, focus));
    for (const region of regions) {
      for (let i = 0; i < this.calls.breachAttemptsPerRegion; i++) {
        const angle = this.random() * Math.PI * 2;
        const radius = i === 0 ? 0 : Math.sqrt(this.random()) * region.radius;
        const position = { x: region.x + Math.sin(angle) * radius, z: region.z + Math.cos(angle) * radius };
        if (this.validBreachPosition(position)) return { position, region };
      }
    }
  }

  private breach(focus: PositionXZ, tick: number, immediate = false): SwarmNest | undefined {
    if (this.nests.active.size >= this.limits.maxActiveNests ||
        this.nests.emergingCount() >= this.limits.maxConcurrentBreaches) return;
    const placement = this.pickBreach(focus, tick);
    if (!placement) return;
    this.regionalCalls.set(placement.region.id, tick + this.calls.regionCooldownTicks);
    return this.guard(this.nests.create(placement.position, tick, immediate ? 0 : ++this.breachCount));
  }

  readonly request = (focus: PositionXZ, tick: number): { breachId?: number; boostedNestId?: number } | undefined => {
    if (this.reinforcements >= this.limits.reinforcementBudget || tick < this.nextGlobalCall) return;
    const nest = this.breach(focus, tick);
    let result: { breachId?: number; boostedNestId?: number };
    if (nest) {
      result = { breachId: nest.breachId };
      this.callBreachers(nest.id);
    } else {
      let closest: SwarmNest | undefined;
      let d2 = this.calls.boostSearchRadius ** 2;
      for (const candidate of this.nests.active.values()) {
        const distance = distanceSquared(candidate, focus);
        if (distance >= d2 || candidate.state === 'EMERGING' || tick < candidate.boostUntil) continue;
        closest = candidate;
        d2 = distance;
      }
      if (!closest) return;
      closest.boostUntil = tick + this.calls.nestBoostTicks;
      closest.spawnCooldown = Math.min(closest.spawnCooldown, tick + NET.tickHz);
      result = { boostedNestId: closest.id };
      this.callBreachers(closest.id);
    }
    this.reinforcements++;
    const heat = this.threatConfig.alertHeat;
    this.alertHeat = Math.min(heat.max, this.alertHeat + heat.perReinforcement);
    this.nextGlobalCall = tick + this.calls.globalCooldownTicks;
    return result;
  };

  touchdown(position: PositionXZ, tick: number): void {
    const heat = this.threatConfig.alertHeat;
    this.alertHeat = Math.min(heat.max, this.alertHeat + heat.touchdownBase + this.level * heat.touchdownPerLevel);
    this.patrols.enableLandingContact(tick + this.balance.patrols.landingGraceTicks);
    this.patrols.reportNoise(position, 'landing', tick);
  }

  startExtraction(tick: number, position: PositionXZ, beacon: boolean): void {
    this.extractionFocus = position;
    if (beacon) {
      const heat = this.threatConfig.alertHeat;
      this.alertHeat = Math.min(heat.max, this.alertHeat + heat.beaconBase + this.level * heat.beaconPerLevel);
      this.patrols.reportNoise(position, 'beacon', tick);
    }
    this.nextExtractionPressure = tick + this.balance.extraction.initialPressureTicks;
  }

  private seedPatrols(tick: number): void {
    for (const [group, schedule] of this.patrolSeeding) {
      if (tick >= schedule.until) {
        group.pendingMembers = 0;
        this.patrolSeeding.delete(group);
        continue;
      }
      if (tick < schedule.retryAt) continue;
      while (group.pendingMembers && this.spawns.canCheckAuthored) {
        const origin = group.position;
        const a = this.random() * Math.PI * 2;
        const r = 1.7 + this.random() * 7;
        const x = origin.x + Math.sin(a) * r;
        const z = origin.z + Math.cos(a) * r;
        const position = openGround(this.mission.world, x, z, .5) ? { x, z } : origin;
        const type = this.patrolMemberType(group);
        const slot = this.spawns.spawnAuthored('patrol', position, origin, group.region.id, type);
        if (slot < 0) {
          schedule.retryAt = tick + this.balance.patrols.perceptionPeriodTicks;
          break;
        }
        this.patrols.attach(group, slot);
        if (type === this.balance.castes.hunterWireType) this.casteSpawns.hunters++;
        group.pendingMembers--;
      }
      if (!group.pendingMembers) this.patrolSeeding.delete(group);
    }
  }

  private readonly spawnGarrison = (nest: SwarmNest, exit: PositionXZ): boolean | undefined => {
    const garrison = this.balance.nest.garrison;
    // Owed breachers first (reinforcement calls), then the nest's guards, otherwise the nest's regular spawn.
    const owed = this.breachers.get(nest.id);
    const breacher = !!owed && (owed.called > 0 || owed.guards > 0);
    const type = breacher ? this.balance.castes.breacherWireType : this.balance.nest.spawnWireType;
    const slot = this.spawns.spawnAuthored('nest', exit, nest, 'nest-' + nest.id, type);
    if (slot === SPAWN_DEFERRED) return;
    if (slot < 0) return false;
    if (breacher) {
      if (owed.called > 0) owed.called--;
      else owed.guards--;
      this.casteSpawns.breachers++;
    }
    let group = this.garrisons.get(nest.id);
    if (!group || group.state === 'ELIMINATED' || group.members.size >= this.limits.patrolMaxSize ||
        distanceSquared(group.position, nest) > garrison.regroupDistance ** 2) {
      const waypoints: PositionXZ[] = [];
      for (let i = 0; i < garrison.routePoints; i++) {
        const theta = nest.rotation + i * Math.PI * (2 / garrison.routePoints);
        const point = { x: nest.x + Math.sin(theta) * garrison.routeRadius, z: nest.z + Math.cos(theta) * garrison.routeRadius };
        if (openGround(this.mission.world, point.x, point.z, 1)) waypoints.push(point);
      }
      if (!waypoints.length) waypoints.push(exit);
      const region: PatrolRegion = { id: 'nest-' + nest.id, x: nest.x, z: nest.z, radius: garrison.routeRadius, route: { waypoints } };
      group = this.patrols.create(region, (nest.exit + 1) % waypoints.length, 0, exit);
      this.garrisons.set(nest.id, group);
    }
    this.patrols.attach(group, slot);
    return true;
  };

  private updateThreat(defending: boolean, extracting: boolean): void {
    const t = this.threatConfig;
    this.threat = Math.round(Math.min(100, t.base + this.level * t.perDifficultyLevel +
      this.nests.active.size * t.perActiveNest + this.alertHeat + (defending ? t.defending : 0) +
      (extracting ? t.extractingBonus : 0)));
  }

  update(tick: number, state: MissionState, defending: boolean, connected: readonly SimPlayer[], living: readonly SimPlayer[],
    targetPlayers: readonly (SimPlayer | undefined)[], attacking: number, profileAI: boolean): void {
    if (tick <= this.lastTick) return;
    this.lastTick = tick;
    this.spawns.beginTick(tick, living, profileAI);
    this.alertHeat = Math.max(0, this.alertHeat - this.threatConfig.alertHeat.decayPerTick);
    const extracting = state === 'EXTRACTION_IN_PROGRESS';
    if (extracting && this.extractionFocus && tick >= this.nextExtractionPressure) {
      this.request(this.extractionFocus, tick);
      this.patrols.reportNoise(this.extractionFocus, 'beacon', tick);
      this.nextExtractionPressure = tick + this.balance.extraction.pressureIntervalTicks;
    }
    this.patrols.update(targetPlayers, tick, this.reinforcements < this.limits.reinforcementBudget, this.request, profileAI);
    this.updateThreat(defending, extracting);
    const pressure = 1 + this.threat / this.threatConfig.nestPressureThreatDivisor + (extracting ? this.threatConfig.extractionNestRate : 0);
    this.nests.update(tick, this.spawnGarrison, pressure);
    this.seedPatrols(tick);
    for (const id of this.garrisons.keys()) if (!this.nests.active.has(id)) this.garrisons.delete(id);
    for (const id of this.breachers.keys()) if (!this.nests.active.has(id)) this.breachers.delete(id);

    let hold: EncounterHold | undefined;
    if (state !== 'ACTIVE_MISSION') hold = 'mission-phase';
    else if (defending) hold = 'defense';
    else if (living.some(({ pendingResupply, equipment }) => pendingResupply || equipment.action === 'resupply')) hold = 'resupply';
    else if (this.nests.destroyed !== this.lastDestroyed) hold = 'nest-destroyed';
    else if (this.patrols.activeCalls || this.nests.emergingCount() || tick < this.nextGlobalCall ||
        this.nests.hasBoost(tick)) hold = 'reinforcement';
    this.lastDestroyed = this.nests.destroyed;
    this.pacing.update(tick, connected, living, attacking, hold, profileAI);
  }

  halt(tick: number): void {
    this.pacing.stop(tick);
    this.patrols.halt(tick);
    this.nests.halt();
    for (const group of this.patrolSeeding.keys()) group.pendingMembers = 0;
    this.patrolSeeding.clear();
  }

  debug(action: string, player: SimPlayer, tick: number): boolean {
    switch (action) {
      case 'horde-wave': return this.pacing.cue(tick);
      case 'patrol':
        if (this.patrols.groups.size >= this.limits.patrolGroupCount + this.limits.maxActiveNests) return false;
        this.newPatrol(this.patrols.groups.size, tick);
        return true;
      case 'alert': {
        let nearest: PatrolGroup | undefined;
        let d2 = Infinity;
        for (const group of this.patrols.groups.values()) {
          const distance = distanceSquared(group.position, player);
          if (!group.members.size || group.alarm || distance >= d2) continue;
          nearest = group;
          d2 = distance;
        }
        if (!nearest) return false;
        this.patrols.forceAlert(nearest, player, tick);
        return true;
      }
      case 'breach': return Boolean(this.request(player, tick));
      case 'nest': {
        if (this.reinforcements >= this.limits.reinforcementBudget || !this.breach(player, tick, true)) return false;
        this.reinforcements++;
        return true;
      }
      case 'destroy-nest': {
        let nearest: SwarmNest | undefined;
        let d2 = Infinity;
        for (const nest of this.nests.active.values()) {
          const distance = distanceSquared(nest, player);
          if (nest.state === 'EMERGING' || distance >= d2) continue;
          nearest = nest;
          d2 = distance;
        }
        if (!nearest) return false;
        this.nests.destroy(nearest, tick, player.id);
        return true;
      }
      default: return false;
    }
  }
}
