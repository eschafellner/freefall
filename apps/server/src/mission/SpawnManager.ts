import {
  ENEMY_TRAITS, terrainIntersection, ALBATROSS, MAX_ENEMIES, MAX_PITCH, aimRay, distanceSquared, groundHeight, landingShip, obstacleIntersection, openGround, postureCollider,
  postureDistanceSquared, postureYaw,
} from '@freefall/shared';
import type { MissionBalance, MissionDefinition, PositionXZ } from '@freefall/shared';
import { ENEMY_EDGE_MARGIN, ENEMY_GROUND_RADIUS } from '../ecs/EnemyNavigation.ts';
import type { HordeManager } from '../ecs/HordeManager.ts';
import { UniformGrid } from '../ecs/UniformGrid.ts';
import type { SimPlayer } from '../simulation/Player.ts';
import type { GroundNavigation } from './GroundNavigation.ts';

const INVALID = -1;
export const SPAWN_DEFERRED = -2;

type Source = 'patrol' | 'nest' | 'wave';
type Rejection = 'ground' | 'protected-area' | 'operator-distance' | 'structure' | 'occupied' | 'visible' | 'route';

interface Observer {
  player: SimPlayer;
  eyeY: number;
  camera: PositionXZ & { y: number };
  facingX: number;
  facingZ: number;
}

/** One synchronous spawn pass after movement and combat. Only the director batch can carry reservations across ticks. */
export class SpawnManager {
  readonly cap: number;
  private readonly mission: MissionDefinition;
  private readonly horde: HordeManager;
  private readonly navigation: GroundNavigation;
  private readonly bodies: readonly (SimPlayer | undefined)[];
  private readonly balance: MissionBalance;
  private readonly blocksStructure: (position: PositionXZ) => boolean;
  private readonly grid: UniformGrid;
  private readonly ship: PositionXZ;
  private readonly ray = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 };
  private readonly observers: Observer[] = [];
  private occupancyReady = false;
  private observersReady = false;
  private tick = 0;
  private profile = false;
  private players: readonly SimPlayer[] = [];
  private checks = 0;
  private dynamicChecks = 0;
  private initialized = 0;
  private held = 0;
  private target?: SimPlayer;
  lastRegion?: string;
  lastCandidate?: PositionXZ;
  lastResult?: Rejection | 'spawned';
  validationMs = 0;
  initializationMs = 0;
  readonly totals = { checked: 0, waveChecked: 0, spawned: 0, waveSpawned: 0, capacityDeferrals: 0, budgetDeferrals: 0,
    rejected: { ground: 0, 'protected-area': 0, 'operator-distance': 0, structure: 0, occupied: 0, visible: 0, route: 0 } };

  constructor(mission: MissionDefinition, horde: HordeManager, navigation: GroundNavigation,
    bodies: readonly (SimPlayer | undefined)[], balance: MissionBalance, blocksStructure: (position: PositionXZ) => boolean) {
    this.mission = mission;
    this.horde = horde;
    this.navigation = navigation;
    this.bodies = bodies;
    this.balance = balance;
    this.blocksStructure = blocksStructure;
    this.cap = Math.min(balance.limits.maxActiveEnemies, MAX_ENEMIES);
    this.grid = new UniformGrid(mission.world.half);
    this.ship = landingShip(mission.world.deployment);
  }

  beginTick(tick: number, players: readonly SimPlayer[], profile: boolean): void {
    this.tick = tick;
    this.players = players;
    this.profile = profile;
    this.occupancyReady = this.observersReady = false;
    this.checks = this.dynamicChecks = this.initialized = this.validationMs = this.initializationMs = 0;
  }

  get reserved(): number { return this.held; }

  get waveCapacity(): number {
    return Math.max(0, this.cap - this.horde.count - this.held - this.balance.director.spawn.priorityHeadroom);
  }

  reserveWave(requested: number): number {
    const granted = Math.min(requested, this.waveCapacity);
    this.held += granted;
    return granted;
  }

  releaseWave(): void { this.held = 0; }

  get canCheckAuthored(): boolean {
    return this.horde.count < this.cap && this.initialized < this.balance.limits.maxSpawnsPerTick &&
      this.checks < this.balance.director.spawn.maxChecksPerTick;
  }

  /** `type` defaults to the nest's spawn archetype (the Schabe). */
  spawnAuthored(source: 'patrol' | 'nest', position: PositionXZ, goal: PositionXZ, region: string, type = this.balance.nest.spawnWireType): number {
    return this.spawn(source, position, region, goal, type);
  }

  spawnWave(position: PositionXZ, region: string, groupFocus?: PositionXZ, type = this.balance.nest.spawnWireType): { slot: number; target: SimPlayer } | number {
    const slot = this.spawn('wave', position, region, groupFocus, type);
    return slot < 0 ? slot : { slot, target: this.target! };
  }

  private spawn(source: Source, position: PositionXZ, region: string, goal: PositionXZ | undefined, type: number): number {
    const dynamic = source === 'wave';
    if (this.horde.count >= this.cap || (dynamic && (!this.held ||
        this.horde.count >= this.cap - this.balance.director.spawn.priorityHeadroom))) {
      this.totals.capacityDeferrals++;
      return SPAWN_DEFERRED;
    }
    const budget = this.balance.director.spawn;
    if (this.checks >= budget.maxChecksPerTick || this.initialized >= this.balance.limits.maxSpawnsPerTick ||
        (dynamic && this.dynamicChecks >= budget.dynamicChecksPerTick)) {
      this.totals.budgetDeferrals++;
      return SPAWN_DEFERRED;
    }

    this.checks++;
    this.totals.checked++;
    if (dynamic) {
      this.dynamicChecks++;
      this.totals.waveChecked++;
    }
    // Match the actual coordinates that will be stored and replicated.
    const candidate = { x: Math.fround(position.x), z: Math.fround(position.z) };
    const before = this.profile ? performance.now() : 0;
    const rejected = this.validate(source, candidate, goal, type);
    if (this.profile) this.validationMs += performance.now() - before;
    if (dynamic) {
      this.lastRegion = region;
      this.lastCandidate = candidate;
      this.lastResult = rejected ?? 'spawned';
    }
    if (rejected) {
      this.totals.rejected[rejected]++;
      return INVALID;
    }

    const start = this.profile ? performance.now() : 0;
    const slot = this.horde.spawn(candidate.x, candidate.z, type);
    if (slot < 0) return SPAWN_DEFERRED;
    if (dynamic || this.horde.count + this.held > this.cap) this.held--;
    this.horde.hp[slot] = this.balance.enemies[type].health;
    this.grid.insert(this.horde, slot);
    this.initialized++;
    this.totals.spawned++;
    if (dynamic) this.totals.waveSpawned++;
    if (this.profile) this.initializationMs += performance.now() - start;
    return slot;
  }

  private validate(source: Source, position: PositionXZ, goal: PositionXZ | undefined, type: number): Rejection | undefined {
    const { x, z } = position;
    const radius = ENEMY_TRAITS[type]?.groundRadius ?? ENEMY_GROUND_RADIUS;
    const { world, objectives } = this.mission;
    const calls = this.balance.reinforcements;
    if (!openGround(world, x, z, Math.max(ENEMY_EDGE_MARGIN, radius))) return 'ground';
    if (Math.abs(x - this.ship.x) < ALBATROSS.halfWidth + radius &&
        Math.abs(z - this.ship.z) < ALBATROSS.halfLength + radius) return 'structure';
    if (this.blocksStructure(position)) return 'structure';
    const minimum = source === 'wave' ? calls.playerClearance :
      source === 'patrol' ? this.balance.patrols.seedPlayerClearance : this.balance.nest.garrison.playerClearance;
    for (const player of this.bodies) {
      if (!player || player.hp <= 0) continue;
      const body = postureCollider(player.posture, this.tick, this.balance.movement);
      const distance = distanceSquared(player, position);
      if (distance < minimum ** 2 || (distance < (Math.hypot(body.radius, body.halfLength) + radius) ** 2 &&
          postureDistanceSquared(player, body, postureYaw(player.posture, player.yaw), x, z) < radius ** 2)) {
        return 'operator-distance';
      }
    }
    if (source === 'wave') {
      if (distanceSquared(position, world.deployment) < (world.deployment.radius + calls.deploymentClearance) ** 2 ||
          (world.serviceApron && distanceSquared(position, world.serviceApron) < (world.serviceApron.radius + calls.serviceApronClearance) ** 2) ||
          objectives.some((objective) => objective.kind === 'activate' &&
            distanceSquared(position, objective) < (objective.radius + calls.objectiveClearance) ** 2)) return 'protected-area';
      if (!this.players.some((player) => distanceSquared(player, position) <= calls.breachSearchRadius ** 2)) return 'operator-distance';
    }
    if (!this.occupancyReady) {
      this.grid.rebuild(this.horde);
      this.occupancyReady = true;
    }
    if (this.grid.overlaps(this.horde, x, z, radius + ENEMY_GROUND_RADIUS * this.grid.maxSize)) return 'occupied';
    if (source !== 'nest' && this.visible(position, type)) return 'visible';
    if (goal && !this.navigation.reachable(x, z, goal.x, goal.z)) return 'route';
    if (source !== 'wave') return;

    this.target = undefined;
    let nearest = calls.breachSearchRadius ** 2;
    for (const player of this.players) {
      const d2 = distanceSquared(player, position);
      if (d2 > nearest || (this.target && d2 === nearest) ||
          !this.navigation.reachable(x, z, player.x, player.z)) continue;
      nearest = d2;
      this.target = player;
    }
    return this.target ? undefined : 'route';
  }

  private visible(position: PositionXZ, type: number): boolean {
    const { world } = this.mission;
    const { ray } = this;
    if (!this.observersReady) {
      this.observers.length = 0;
      for (const player of this.players) {
        const body = postureCollider(player.posture, this.tick, this.balance.movement);
        const yaw = player.yaw + player.recoil.yaw;
        const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, player.pitch + player.recoil.pitch));
        aimRay(ray, player, yaw, pitch, body.lookHeight, player.y, !!world.terrain);
        const eyeY = player.y + body.lookHeight;
        let travel = Math.min(1, terrainIntersection(world, player.x, eyeY, player.z,
          ray.x - player.x, ray.y - eyeY, ray.z - player.z, 0, 1));
        for (const obstacle of world.obstacles) {
          travel = Math.min(travel, obstacleIntersection(obstacle, player.x, eyeY, player.z,
            ray.x - player.x, ray.y - eyeY, ray.z - player.z, 0, 1, ENEMY_GROUND_RADIUS));
        }
        this.observers.push({ player, eyeY, camera: { x: player.x + (ray.x - player.x) * travel,
          y: eyeY + (ray.y - eyeY) * travel, z: player.z + (ray.z - player.z) * travel },
          facingX: Math.sin(yaw), facingZ: -Math.cos(yaw) });
      }
      this.observersReady = true;
    }
    const enemy = this.balance.enemies[type];
    const height = groundHeight(world, position.x, position.z) + enemy.hitHeight + enemy.hitRadius;
    const dot = this.balance.director.spawn.visibilityDot;
    const substantial = (obstacle: typeof world.obstacles[number]) =>
      Math.min(obstacle.halfX, obstacle.halfZ) > ENEMY_GROUND_RADIUS;
    for (const { player, eyeY, camera, facingX, facingZ } of this.observers) {
      const dx = position.x - camera.x, dz = position.z - camera.z;
      if (dx * facingX + dz * facingZ < Math.hypot(dx, dz) * dot) continue;
      const cameraBlocked = (world.terrain && terrainIntersection(world, camera.x, camera.y, camera.z, dx, height - camera.y, dz, 1e-5, 1) < 1) || world.obstacles.some((obstacle) => substantial(obstacle) && obstacleIntersection(obstacle,
        camera.x, camera.y, camera.z, dx, height - camera.y, dz, 0, 1, -ENEMY_GROUND_RADIUS) <= 1);
      if (!cameraBlocked) return true;
      const eyeBlocked = (world.terrain && terrainIntersection(world, player.x, eyeY, player.z,
        position.x - player.x, height - eyeY, position.z - player.z, 0, 1) < 1) || world.obstacles.some((obstacle) => substantial(obstacle) && obstacleIntersection(obstacle,
        player.x, eyeY, player.z, position.x - player.x, height - eyeY, position.z - player.z, 0, 1, -ENEMY_GROUND_RADIUS) <= 1);
      if (!eyeBlocked) return true;
    }
    return false;
  }
}
