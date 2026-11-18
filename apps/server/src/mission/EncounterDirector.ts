import { MAX_ENEMIES, NET, NEST_EXIT_RADIUS, SCHABE_TYPE, distanceSquared, openGround } from '@freefall/shared';
import type {
  DifficultyDefinition, MissionDefinition, MissionEvent, PatrolRegion, PositionXZ, SwarmBreachRegion,
} from '@freefall/shared';
import type { HordeManager } from '../ecs/HordeManager.ts';
import type { SimPlayer } from '../simulation/Player.ts';
import { PatrolManager } from './PatrolManager.ts';
import type { PatrolGroup } from './PatrolManager.ts';
import { SwarmNestManager } from './SwarmNestManager.ts';
import type { SwarmNest } from './SwarmNestManager.ts';

const PLAYER_BUFFER = 27;
const REGION_COOLDOWN = 32 * NET.tickHz;
const RADIUS_PADDING = NEST_EXIT_RADIUS + 1;

export class EncounterDirector {
  readonly patrols: PatrolManager;
  readonly nests: SwarmNestManager;
  threat = 0;
  breachCount = 0;
  reinforcements = 0;
  private spawnedThisTick = 0;
  private nextGlobalCall = 0;
  private nextExtractionPressure = 0;
  private extractionFocus?: PositionXZ;
  private alertHeat = 0;
  private readonly regionalCalls = new Map<string, number>();
  private readonly garrisons = new Map<number, PatrolGroup>();
  private readonly mission: MissionDefinition;
  private readonly horde: HordeManager;
  private readonly players: readonly (SimPlayer | undefined)[];
  private readonly random: () => number;
  private difficulty: DifficultyDefinition;

  constructor(mission: MissionDefinition, horde: HordeManager, players: readonly (SimPlayer | undefined)[],
    difficulty: DifficultyDefinition, random: () => number, emit: (event: MissionEvent) => void) {
    this.mission = mission;
    this.horde = horde;
    this.players = players;
    this.difficulty = difficulty;
    this.random = random;
    this.patrols = new PatrolManager(mission.world, horde, random, emit);
    this.nests = new SwarmNestManager(emit, random);
  }

  deploy(difficulty: DifficultyDefinition, tick: number): void {
    this.difficulty = difficulty;
    const regions = this.mission.world.patrolRegions;
    if (regions.length) {
      for (let i = 0; i < difficulty.patrolGroupCount; i++) this.newPatrol(i);
    }
    for (const position of this.mission.world.initialNests) {
      if (this.nests.active.size >= difficulty.maxActiveNests) break;
      if (this.validBreachPosition(position, false)) this.nests.create(position, tick, difficulty);
    }
    this.updateThreat(false, false);
  }

  newPatrol(index: number): void {
    const regions = this.mission.world.patrolRegions;
    if (!regions.length || this.patrols.groups.size >= this.difficulty.patrolGroupCount + this.difficulty.maxActiveEnemies) return;
    const region = regions[index % regions.length];
    const waypoint = Math.floor(index / regions.length) % region.route.waypoints.length;
    const { patrolMinSize, patrolMaxSize } = this.difficulty;
    const size = patrolMinSize + Math.floor(this.random() * (patrolMaxSize - patrolMinSize + 1));
    this.patrols.create(region, waypoint, size);
  }

  validBreachPosition(position: PositionXZ, checkPlayers = true): boolean {
    const { world, objectives } = this.mission;
    if (!openGround(world, position.x, position.z, RADIUS_PADDING)) return false;
    if (distanceSquared(position, world.deployment) < (world.deployment.radius + 12) ** 2) return false;
    if (world.serviceApron && distanceSquared(position, world.serviceApron) < (world.serviceApron.radius + 9) ** 2) return false;
    for (const objective of objectives) {
      if (objective.kind === 'activate' && distanceSquared(position, objective) < (objective.radius + 12) ** 2) return false;
    }
    if (checkPlayers && this.players.some((player) => player && player.hp > 0 && distanceSquared(player, position) < PLAYER_BUFFER ** 2)) return false;
    for (const nest of this.nests.active.values()) if (distanceSquared(nest, position) < 18 ** 2) return false;
    return true;
  }

  private pickBreach(focus: PositionXZ, tick: number): { position: PositionXZ; region: SwarmBreachRegion } | undefined {
    const regions = this.mission.world.breachRegions.filter((region) =>
      (this.regionalCalls.get(region.id) ?? 0) <= tick && distanceSquared(focus, region) < 125 ** 2);
    regions.sort((a, b) => distanceSquared(a, focus) - distanceSquared(b, focus));
    for (const region of regions) {
      for (let i = 0; i < 11; i++) {
        const angle = this.random() * Math.PI * 2;
        const radius = i === 0 ? 0 : Math.sqrt(this.random()) * region.radius;
        const position = { x: region.x + Math.sin(angle) * radius, z: region.z + Math.cos(angle) * radius };
        if (this.validBreachPosition(position)) return { position, region };
      }
    }
  }

  private breach(focus: PositionXZ, tick: number, immediate = false): SwarmNest | undefined {
    if (this.nests.active.size >= this.difficulty.maxActiveNests ||
        this.nests.emergingCount() >= this.difficulty.maxConcurrentBreaches) return;
    const placement = this.pickBreach(focus, tick);
    if (!placement) return;
    this.regionalCalls.set(placement.region.id, tick + Math.ceil(REGION_COOLDOWN * this.difficulty.reinforcementCooldownMultiplier));
    return this.nests.create(placement.position, tick, this.difficulty, immediate ? 0 : ++this.breachCount);
  }

  readonly request = (focus: PositionXZ, tick: number): { breachId?: number; boostedNestId?: number } | undefined => {
    if (this.reinforcements >= this.difficulty.reinforcementBudget || tick < this.nextGlobalCall) return;
    const nest = this.breach(focus, tick);
    let result: { breachId?: number; boostedNestId?: number };
    if (nest) {
      result = { breachId: nest.breachId };
    } else {
      let closest: SwarmNest | undefined;
      let d2 = 150 ** 2;
      for (const candidate of this.nests.active.values()) {
        const distance = distanceSquared(candidate, focus);
        if (distance >= d2 || candidate.state === 'EMERGING' || tick < candidate.boostUntil) continue;
        closest = candidate;
        d2 = distance;
      }
      if (!closest) return;
      closest.boostUntil = tick + 18 * NET.tickHz;
      closest.spawnCooldown = Math.min(closest.spawnCooldown, tick + NET.tickHz);
      result = { boostedNestId: closest.id };
    }
    this.reinforcements++;
    this.alertHeat = Math.min(42, this.alertHeat + 12);
    this.nextGlobalCall = tick + Math.ceil(4 * NET.tickHz * this.difficulty.reinforcementCooldownMultiplier);
    return result;
  };

  touchdown(position: PositionXZ, tick: number): void {
    this.alertHeat = Math.min(42, this.alertHeat + 4 + this.difficulty.level * 2);
    this.patrols.enableLandingContact(tick + 6 * NET.tickHz);
    this.patrols.reportNoise(position, 'landing', tick);
  }

  startExtraction(tick: number, position: PositionXZ, beacon: boolean): void {
    this.extractionFocus = position;
    if (beacon) {
      this.alertHeat = Math.min(42, this.alertHeat + 8 + this.difficulty.level * 3);
      this.patrols.reportNoise(position, 'beacon', tick);
    }
    this.nextExtractionPressure = tick + Math.ceil(6 * NET.tickHz / this.difficulty.extractionThreatMultiplier);
  }

  private spawn(position: PositionXZ): number {
    if (this.spawnedThisTick >= this.difficulty.maxSpawnsPerTick ||
        this.horde.count >= Math.min(this.difficulty.maxActiveEnemies, MAX_ENEMIES)) return -1;
    if (!openGround(this.mission.world, position.x, position.z, .5)) return -1;
    const slot = this.horde.spawn(position.x, position.z, SCHABE_TYPE);
    if (slot !== -1) this.spawnedThisTick++;
    return slot;
  }

  private seedPatrols(): void {
    for (const group of this.patrols.groups.values()) {
      while (group.pendingMembers && this.spawnedThisTick < this.difficulty.maxSpawnsPerTick) {
        const origin = group.position;
        const a = this.random() * Math.PI * 2;
        const r = 1.7 + this.random() * 7;
        const x = origin.x + Math.sin(a) * r;
        const z = origin.z + Math.cos(a) * r;
        const position = openGround(this.mission.world, x, z, .5) ? { x, z } : origin;
        if (!openGround(this.mission.world, position.x, position.z, .5) ||
            this.players.some((player) => player && player.hp > 0 && distanceSquared(player, position) < 14 ** 2)) break;
        const slot = this.spawn(position);
        if (slot === -1) return;
        this.patrols.attach(group, slot);
        group.pendingMembers--;
      }
    }
  }

  private readonly spawnGarrison = (nest: SwarmNest, exit: PositionXZ): boolean => {
    if (this.players.some((player) => player && player.hp > 0 && distanceSquared(player, exit) < 7 ** 2)) return false;
    const slot = this.spawn(exit);
    if (slot === -1) return false;
    let group = this.garrisons.get(nest.id);
    if (!group || group.state === 'ELIMINATED' || group.members.size >= this.difficulty.patrolMaxSize ||
        distanceSquared(group.position, nest) > 24 ** 2) {
      const waypoints: PositionXZ[] = [];
      for (let i = 0; i < 8; i++) {
        const theta = nest.rotation + i * Math.PI * .25;
        const point = { x: nest.x + Math.sin(theta) * 13, z: nest.z + Math.cos(theta) * 13 };
        if (openGround(this.mission.world, point.x, point.z, 1)) waypoints.push(point);
      }
      if (!waypoints.length) waypoints.push(exit);
      const region: PatrolRegion = { id: 'nest-' + nest.id, x: nest.x, z: nest.z, radius: 13, route: { waypoints } };
      group = this.patrols.create(region, (nest.exit + 1) % waypoints.length, 0, exit);
      this.garrisons.set(nest.id, group);
    }
    this.patrols.attach(group, slot);
    return true;
  };

  private updateThreat(defending: boolean, extracting: boolean): void {
    this.threat = Math.round(Math.min(100, 3 + this.difficulty.level * 3 +
      this.nests.active.size * 5 + this.alertHeat + (defending ? 11 : 0) +
      (extracting ? 13 * this.difficulty.extractionThreatMultiplier : 0)));
  }

  update(tick: number, defending: boolean, extracting: boolean): void {
    this.spawnedThisTick = 0;
    this.alertHeat = Math.max(0, this.alertHeat - .008);
    if (extracting && this.extractionFocus && tick >= this.nextExtractionPressure) {
      this.request(this.extractionFocus, tick);
      this.patrols.reportNoise(this.extractionFocus, 'beacon', tick);
      this.nextExtractionPressure = tick + Math.ceil(15 * NET.tickHz / this.difficulty.extractionThreatMultiplier);
    }
    this.patrols.update(this.players, tick, this.difficulty,
      this.reinforcements < this.difficulty.reinforcementBudget, this.request);
    this.seedPatrols();
    this.updateThreat(defending, extracting);
    const pressure = 1 + this.threat / 200 + (extracting ? this.difficulty.extractionThreatMultiplier * .4 : 0);
    this.nests.update(tick, this.spawnGarrison, pressure);
    for (const id of this.garrisons.keys()) if (!this.nests.active.has(id)) this.garrisons.delete(id);
  }

  debug(action: string, player: SimPlayer, tick: number): boolean {
    switch (action) {
      case 'patrol':
        if (this.patrols.groups.size >= this.difficulty.patrolGroupCount + this.difficulty.maxActiveNests) return false;
        this.newPatrol(tick);
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
        if (this.reinforcements >= this.difficulty.reinforcementBudget || !this.breach(player, tick, true)) return false;
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
