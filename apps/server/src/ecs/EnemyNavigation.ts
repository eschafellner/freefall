import { BALANCE, MAX_ENEMIES, NET, openGround } from '@freefall/shared';
import type { MissionBalance, PositionXZ, WorldDefinition } from '@freefall/shared';
import type { GroundNavigation } from '../mission/GroundNavigation.ts';
import type { SimPlayer } from '../simulation/Player.ts';
import type { HordeManager } from './HordeManager.ts';

export const ENEMY_GROUND_RADIUS = .37;
export const ENEMY_EDGE_MARGIN = .5;

export class EnemyNavigation {
  private readonly owners = new Uint32Array(MAX_ENEMIES);
  private readonly blockedTicks = new Uint16Array(MAX_ENEMIES);
  private readonly movedDistance = new Float32Array(MAX_ENEMIES);
  private readonly wantedDistance = new Float32Array(MAX_ENEMIES);
  private readonly retryAt = new Uint32Array(MAX_ENEMIES);
  private readonly routeFailures = new Uint8Array(MAX_ENEMIES);
  private readonly checkedPosition = new Uint8Array(MAX_ENEMIES);
  private readonly invalid = new Uint8Array(MAX_ENEMIES);
  private readonly hasGoal = new Uint8Array(MAX_ENEMIES);
  private readonly goalX = new Float32Array(MAX_ENEMIES);
  private readonly goalZ = new Float32Array(MAX_ENEMIES);
  private readonly rawX = new Float32Array(MAX_ENEMIES);
  private readonly rawZ = new Float32Array(MAX_ENEMIES);
  private readonly routedX = new Float32Array(MAX_ENEMIES);
  private readonly routedZ = new Float32Array(MAX_ENEMIES);
  private readonly refreshAt = new Uint32Array(MAX_ENEMIES);
  private readonly intermediate = new Uint8Array(MAX_ENEMIES);
  private readonly targetLife = new Uint32Array(MAX_ENEMIES);
  private readonly targets: (SimPlayer | undefined)[] = Array(MAX_ENEMIES);
  private readonly attempts = new Uint8Array(MAX_ENEMIES);
  private readonly asleep = new Uint8Array(MAX_ENEMIES);
  private readonly sleepingNeighbors = new Uint8Array(MAX_ENEMIES);
  private readonly clearanceWakes = new Uint8Array(MAX_ENEMIES);
  private readonly straightMotion = new Float32Array(MAX_ENEMIES);
  readonly attackSector = new Int8Array(MAX_ENEMIES).fill(-1);
  readonly repositionSector = new Int8Array(MAX_ENEMIES).fill(-1);
  readonly neighbors = new Uint8Array(MAX_ENEMIES);
  readonly separationX = new Float32Array(MAX_ENEMIES);
  readonly separationZ = new Float32Array(MAX_ENEMIES);
  readonly avoidanceX = new Float32Array(MAX_ENEMIES);
  readonly avoidanceZ = new Float32Array(MAX_ENEMIES);
  readonly actualX = new Float32Array(MAX_ENEMIES);
  readonly actualZ = new Float32Array(MAX_ENEMIES);
  readonly intentSpeed = new Float32Array(MAX_ENEMIES);
  stuckEpisodes = 0;
  unreachableEpisodes = 0;
  recoveries = 0;
  recoveryAttempts = 0;
  recoverySuccesses = 0;
  recoveryFallbacks = 0;

  private readonly config: MissionBalance['hordeAi'];

  constructor(config: MissionBalance['hordeAi'] = BALANCE.swarm.hordeAi) {
    this.config = config;
  }

  private clearProgress(slot: number): void {
    this.blockedTicks[slot] = this.movedDistance[slot] = this.wantedDistance[slot] = 0;
    this.straightMotion[slot] = 0;
  }

  initialize(horde: HordeManager, slot: number): void {
    if (this.owners[slot] === horde.id[slot]) return;
    this.owners[slot] = horde.id[slot];
    this.clearProgress(slot);
    this.attempts[slot] = this.asleep[slot] = this.retryAt[slot] = this.routeFailures[slot] = this.refreshAt[slot] = this.hasGoal[slot] = 0;
    this.invalid[slot] = this.checkedPosition[slot] = this.intermediate[slot] = this.neighbors[slot] = this.clearanceWakes[slot] = 0;
    this.actualX[slot] = this.actualZ[slot] = this.separationX[slot] = this.separationZ[slot] = 0;
    this.avoidanceX[slot] = this.avoidanceZ[slot] = 0;
    this.intentSpeed[slot] = 0;
    this.targets[slot] = undefined;
    this.attackSector[slot] = this.repositionSector[slot] = -1;
  }

  /** Invalidate cached intent on a target/life change or a material displacement. */
  intent(slot: number, goal: PositionXZ, target?: SimPlayer): void {
    const changed = this.targets[slot] !== target || (!!target && target.life !== this.targetLife[slot]);
    const shifted = (goal.x - this.rawX[slot]) ** 2 + (goal.z - this.rawZ[slot]) ** 2 >= this.config.goalRefreshDistance ** 2;
    if (changed || shifted) {
      this.rawX[slot] = goal.x;
      this.rawZ[slot] = goal.z;
      if (changed || this.asleep[slot] || this.routeFailures[slot]) {
        this.attempts[slot] = 0;
        this.clearanceWakes[slot] = 0;
        this.clearProgress(slot);
      }
      this.retryAt[slot] = 0;
      this.routeFailures[slot] = 0;
      this.asleep[slot] = 0;
    }
    if (changed) {
      this.targets[slot] = target;
      this.targetLife[slot] = target?.life ?? 0;
      this.attackSector[slot] = this.repositionSector[slot] = -1;
      this.refreshAt[slot] = 0;
      this.hasGoal[slot] = 0;
    }
  }

  reconsiderAttackPosition(slot: number): void {
    if (this.attackSector[slot] >= 0) this.repositionSector[slot] = this.attackSector[slot];
    this.attackSector[slot] = -1;
    this.refreshAt[slot] = 0;
  }

  canSteer(horde: HordeManager, slot: number, tick: number): boolean {
    return this.owners[slot] !== horde.id[slot] ||
      (this.routeFailures[slot] <= this.config.recoveryRetries && tick >= this.retryAt[slot]);
  }

  recoveryStage(slot: number, tick: number, forwardClear = false): number {
    if (!this.asleep[slot]) return this.attempts[slot];
    // Wake when the goal changes (intent) or when local congestion has actually fallen.
    if (tick < this.retryAt[slot]) return -1;
    if (this.neighbors[slot] >= this.sleepingNeighbors[slot]) {
      if (!forwardClear || this.clearanceWakes[slot] >= this.config.recoveryRetries) {
        this.retryAt[slot] = tick + this.config.unreachableRetryTicks;
        return -1;
      }
      this.clearanceWakes[slot]++;
    }
    this.asleep[slot] = 0;
    this.refreshAt[slot] = 0;
    return this.attempts[slot];
  }

  clearanceStep(horde: HordeManager, slot: number, distance: number, output: PositionXZ): boolean {
    if (!this.asleep[slot]) return false;
    const dx = this.goalX[slot] - horde.x[slot], dz = this.goalZ[slot] - horde.z[slot];
    const length = Math.hypot(dx, dz);
    if (length <= this.arrival(slot)) return false;
    const fraction = Math.min(1, distance / length);
    output.x = dx * fraction;
    output.z = dz * fraction;
    return true;
  }

  setGoal(horde: HordeManager, slot: number, goal: PositionXZ, speed: number, tick: number): void {
    this.initialize(horde, slot);
    if (speed < 0) {
      if (!this.routeFailures[slot]) this.unreachableEpisodes++;
      this.routeFailures[slot]++;
      this.retryAt[slot] = tick + this.config.unreachableRetryTicks + slot % this.config.steeringTicks;
      this.hasGoal[slot] = 0;
      this.refreshAt[slot] = 0;
      this.clearProgress(slot);
      return;
    }
    this.retryAt[slot] = 0;
    this.routeFailures[slot] = 0;
    this.hasGoal[slot] = Number(speed > 0);
    this.goalX[slot] = goal.x;
    this.goalZ[slot] = goal.z;
    if (speed === 0) {
      this.asleep[slot] = this.attempts[slot] = this.refreshAt[slot] = 0;
      this.clearProgress(slot);
    }
  }

  resolve(horde: HordeManager, slot: number, goal: PositionXZ, tick: number, planner: GroundNavigation): number {
    const x = horde.x[slot], z = horde.z[slot];
    const requestedX = goal.x, requestedZ = goal.z;
    const shifted = (requestedX - this.routedX[slot]) ** 2 + (requestedZ - this.routedZ[slot]) ** 2;
    const remaining = (x - this.goalX[slot]) ** 2 + (z - this.goalZ[slot]) ** 2;
    const hasWaypoint = this.hasGoal[slot] && (!this.intermediate[slot] || remaining > this.arrival(slot) ** 2);
    const sameGoal = shifted < this.config.goalRefreshDistance ** 2;
    if (hasWaypoint && tick < this.refreshAt[slot] && sameGoal &&
        (remaining > this.config.arrivalRadius ** 2 || shifted < this.config.arrivalRadius ** 2)) {
      goal.x = this.goalX[slot];
      goal.z = this.goalZ[slot];
      return 1;
    }
    const result = planner.route(x, z, goal);
    if (result === 0 && hasWaypoint && (sameGoal || this.intermediate[slot])) {
      goal.x = this.goalX[slot];
      goal.z = this.goalZ[slot];
      return 1;
    }
    if (result > 0) {
      this.intermediate[slot] = Number(goal.x !== requestedX || goal.z !== requestedZ);
      this.routedX[slot] = requestedX;
      this.routedZ[slot] = requestedZ;
      this.refreshAt[slot] = tick + this.config.routeRefreshTicks + slot % this.config.routeRefreshTicks;
    }
    return result;
  }

  arrival(slot: number): number {
    return this.intermediate[slot] ? this.config.cornerClearance * .5 : this.config.arrivalRadius;
  }

  isStuck(slot: number): boolean { return this.attempts[slot] > 0; }

  contactScale(slot: number): number {
    return this.intermediate[slot] && this.attempts[slot] >= 2 ? this.config.recoveryContactScale : 1;
  }

  face(horde: HordeManager, slot: number, dx: number, dz: number, targetRange = 0): void {
    const target = this.targets[slot];
    if (target) {
      const tx = target.x - horde.x[slot], tz = target.z - horde.z[slot];
      if ((!dx && !dz) || tx * tx + tz * tz <= targetRange * targetRange) {
        dx = tx;
        dz = tz;
      }
    }
    if (!dx && !dz) return;
    const yaw = Math.atan2(dx, -dz);
    const delta = yaw - horde.yaw[slot];
    const turn = this.config.turnRate / NET.tickHz;
    const shortest = delta > Math.PI ? delta - 2 * Math.PI : delta < -Math.PI ? delta + 2 * Math.PI : delta;
    const facing = horde.yaw[slot] + Math.max(-turn, Math.min(turn, shortest));
    horde.yaw[slot] = facing > Math.PI ? facing - 2 * Math.PI : facing < -Math.PI ? facing + 2 * Math.PI : facing;
  }

  getStatus(horde: HordeManager, slot: number) {
    if (this.owners[slot] !== horde.id[slot]) return;
    return {
      destination: this.hasGoal[slot] ? { x: this.goalX[slot], z: this.goalZ[slot] } : undefined,
      stuck: this.isStuck(slot),
      unreachable: this.routeFailures[slot] > 0,
      recoveryAttempts: this.attempts[slot],
      waitingForClearance: !!this.asleep[slot],
      neighborCount: this.neighbors[slot],
      separation: { x: this.separationX[slot], z: this.separationZ[slot] },
      avoidance: { x: this.avoidanceX[slot], z: this.avoidanceZ[slot] },
      steering: { x: horde.vx[slot], z: horde.vz[slot] },
      velocity: { x: this.actualX[slot], z: this.actualZ[slot] },
    };
  }

  /** Preserve the 7.4A repair for invalid spawn origins. Recovery of valid agents uses normal movement. */
  prepare(horde: HordeManager, slot: number, world: WorldDefinition, tick: number): boolean {
    this.initialize(horde, slot);
    if (this.checkedPosition[slot] && (!this.invalid[slot] || (tick + slot) % this.config.unreachableRetryTicks !== 0)) {
      return !this.invalid[slot];
    }
    this.checkedPosition[slot] = 1;
    this.invalid[slot] = 1;
    const x = horde.x[slot], z = horde.z[slot];
    const limit = world.half - ENEMY_EDGE_MARGIN;
    if (Math.max(Math.abs(x), Math.abs(z)) <= limit && openGround(world, x, z, ENEMY_GROUND_RADIUS)) {
      this.invalid[slot] = 0;
      return true;
    }
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;

    const bx = Math.max(-limit, Math.min(limit, x));
    const bz = Math.max(-limit, Math.min(limit, z));
    let bestX = bx, bestZ = bz;
    let best = openGround(world, bx, bz, ENEMY_GROUND_RADIUS) ? 0 : Infinity;
    const padding = ENEMY_GROUND_RADIUS + this.config.cornerClearance;
    for (const obstacle of world.obstacles) {
      if (Math.abs(bx - obstacle.x) > obstacle.halfX + padding || Math.abs(bz - obstacle.z) > obstacle.halfZ + padding) continue;
      for (let side = 0; side < 4; side++) {
        const px = side < 2 ? obstacle.x + (side ? 1 : -1) * (obstacle.halfX + padding) : bx;
        const pz = side >= 2 ? obstacle.z + (side === 3 ? 1 : -1) * (obstacle.halfZ + padding) : bz;
        const distance = (px - bx) ** 2 + (pz - bz) ** 2;
        if (distance >= best || Math.max(Math.abs(px), Math.abs(pz)) > limit || !openGround(world, px, pz, ENEMY_GROUND_RADIUS)) continue;
        best = distance;
        bestX = px;
        bestZ = pz;
      }
    }
    if (best === Infinity) return false;
    horde.x[slot] = bestX;
    horde.z[slot] = bestZ;
    horde.vx[slot] = horde.vz[slot] = 0;
    this.asleep[slot] = this.attempts[slot] = this.retryAt[slot] = this.routeFailures[slot] = this.hasGoal[slot] = this.invalid[slot] = 0;
    this.refreshAt[slot] = this.intentSpeed[slot] = 0;
    this.clearProgress(slot);
    this.recoveries++;
    return true;
  }

  moved(horde: HordeManager, slot: number, beforeX: number, beforeZ: number, liveSpeed: number, staggered: boolean, tick: number): void {
    const dx = horde.x[slot] - beforeX, dz = horde.z[slot] - beforeZ;
    this.actualX[slot] = dx * NET.tickHz;
    this.actualZ[slot] = dz * NET.tickHz;
    if (this.asleep[slot]) return;
    const goalDX = this.goalX[slot] - beforeX, goalDZ = this.goalZ[slot] - beforeZ;
    const distance = this.hasGoal[slot] ? Math.hypot(goalDX, goalDZ) : 0;
    if (staggered || !liveSpeed || (this.hasGoal[slot] && distance <= this.arrival(slot) * 1.01)) {
      this.clearProgress(slot);
      return;
    }
    // Accumulate signed progress so sliding sideways or reversing does not mask a jam.
    const forward = distance > 0 ? (dx * goalDX + dz * goalDZ) / distance : Math.hypot(dx, dz);
    const expected = Math.min(liveSpeed / NET.tickHz, this.hasGoal[slot] ? distance : Infinity);
    this.straightMotion[slot] = Math.max(0, this.straightMotion[slot] + forward);
    if (this.attempts[slot] && this.straightMotion[slot] >= this.config.goalRefreshDistance) {
      this.attempts[slot] = 0;
      this.clearanceWakes[slot] = 0;
      this.recoverySuccesses++;
    }
    this.movedDistance[slot] += forward;
    this.wantedDistance[slot] += expected;
    if (++this.blockedTicks[slot] < this.config.stuckTicks) return;
    const blocked = this.movedDistance[slot] < this.wantedDistance[slot] * this.config.stuckProgressRatio;
    this.clearProgress(slot);
    if (!blocked) return;
    if (!this.attempts[slot]) this.stuckEpisodes++;
    if (this.attempts[slot] >= this.config.recoveryRetries) {
      this.asleep[slot] = 1;
      this.sleepingNeighbors[slot] = this.neighbors[slot];
      this.retryAt[slot] = tick + this.config.recoveryCooldownTicks;
      this.recoveryFallbacks++;
      horde.vx[slot] = horde.vz[slot] = 0;
      return;
    }
    const stage = ++this.attempts[slot];
    this.recoveryAttempts++;
    if (stage >= 2) this.refreshAt[slot] = 0;
    if (stage >= 3) this.attackSector[slot] = -1;
  }
}
