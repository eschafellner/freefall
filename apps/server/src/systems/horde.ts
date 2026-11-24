import { ARENA_HALF, BALANCE, ENEMY_TRAITS, ENEMY_TYPES, NET, clampToArena, moveOnGround } from '@freefall/shared';
import type { EnemyGameplay, EnemyTraits, MissionBalance, PositionXZ, WorldDefinition } from '@freefall/shared';
import type { EnemyFlanking } from '../ecs/EnemyFlanking.ts';
import { ENEMY_EDGE_MARGIN, ENEMY_GROUND_RADIUS } from '../ecs/EnemyNavigation.ts';
import type { EnemyApproach } from '../ecs/EnemyApproach.ts';
import type { EnemyCombat } from '../ecs/EnemyCombat.ts';
import type { GroundNavigation } from '../mission/GroundNavigation.ts';
import { validOperator } from './enemyTargeting.ts';
import type { EnemyNavigation } from '../ecs/EnemyNavigation.ts';
import type { HordeManager } from '../ecs/HordeManager.ts';
import type { StaggerComponent } from '../ecs/StaggerComponent.ts';
import type { UniformGrid } from '../ecs/UniformGrid.ts';
import type { SimPlayer } from '../simulation/Player.ts';
import { ARENA_REINFORCEMENTS, ARENA_SPAWN_TYPE } from '../simulation/ArenaEncounter.ts';

/** Horde scheduling and separation. Values live in `balance/data/swarm.json` (`hordeAi`, `arena.refillTicks`). */
export const AI = Object.freeze({
  ...BALANCE.swarm.hordeAi,
  refillTicks: ARENA_REINFORCEMENTS.refillTicks,
});

export function spawnSystem(h: HordeManager, desired: number, random: () => number): void {
  const limit = Math.min(desired, h.count + ARENA_REINFORCEMENTS.maxSpawnsPerTick);
  while (h.count < limit) {
    const theta = random() * Math.PI * 2;
    const radius = ARENA_REINFORCEMENTS.outerRadius - random() * ARENA_REINFORCEMENTS.ringWidth;
    if (h.spawn(Math.sin(theta) * radius, Math.cos(theta) * radius, ARENA_SPAWN_TYPE) < 0) break;
  }
}

export function despawnSystem(h: HordeManager, desired: number): void {
  while (h.count > desired) h.despawn(h.active[h.count - 1]);
}

/** Positive speed follows the output, zero holds position, negative reports a missing route. */
export type EnemyDestination = (slot: number, output: PositionXZ) => number;

export interface HordeSteering {
  readonly config: MissionBalance['hordeAi'];
  readonly navigation: EnemyNavigation;
  readonly approach: EnemyApproach;
  readonly combat?: EnemyCombat;
  readonly stagger: StaggerComponent;
  edge: number;
  readonly timing: { neighborMs: number };
  stats: readonly EnemyGameplay[];
  /** Body and tactics traits by wire type. Default: the published registry. */
  traits?: readonly EnemyTraits[];
  /** Flanking state of `tactics: 'flank'` archetypes. */
  flank?: EnemyFlanking;
  planner?: GroundNavigation;
  destination?: EnemyDestination;
  fallback?: EnemyDestination;
  profile: boolean;
}

const goal = { x: 0, z: 0 };
const DIAGONAL = Math.SQRT1_2;
const OVERLAP_DIRECTIONS = [[1, 0], [DIAGONAL, DIAGONAL], [0, 1], [-DIAGONAL, DIAGONAL]] as const;

export function steeringSystem(h: HordeManager, grid: UniformGrid, players: readonly (SimPlayer | undefined)[], tick: number,
  context?: HordeSteering): void {
  grid.rebuild(h, tick);
  const config = context?.config ?? AI;
  const navigation = context?.navigation;
  const planner = context?.planner;
  const stats = context?.stats ?? ENEMY_TYPES;
  const traits = context?.traits ?? ENEMY_TRAITS;
  const edge = context?.edge ?? ARENA_HALF - ENEMY_EDGE_MARGIN;
  const horizon = config.steeringTicks / NET.tickHz;
  const response = 1 - Math.exp(-config.steeringResponse * horizon);
  const diameter = ENEMY_GROUND_RADIUS * 2;
  const contactDiameter = diameter * config.contactDiameterFraction;
  const clearance = { x: 0, z: 0 };
  planner?.beginTick(context?.profile);
  context?.approach.rebuild(h, players, stats);
  let index = h.count ? ((Math.imul(tick, 31) >>> 0) % h.count) : 0;
  for (let remaining = h.count; remaining > 0; remaining--) {
    const i = h.active[index];
    if (++index === h.count) index = 0;
    const staggerUntil = context?.stagger.active(h, i) ?? 0;
    if (tick < staggerUntil || context?.combat?.holding(h, i, tick) ||
        (tick !== staggerUntil && (tick + i) % config.steeringTicks !== 0)) continue;
    navigation?.initialize(h, i);
    const player = players[h.target[i]];
    const x = h.x[i], z = h.z[i];
    goal.x = x;
    goal.z = z;
    let speedScale = 0;
    if (context?.destination) {
      speedScale = context.destination(i, goal);
    } else if (validOperator(player)) {
      goal.x = player.x;
      goal.z = player.z;
      speedScale = 1;
    }
    const pursuing = validOperator(player) && goal.x === player.x && goal.z === player.z;
    navigation?.intent(i, goal, pursuing ? player : undefined);
    if (navigation && speedScale <= 0) {
      navigation.setGoal(h, i, goal, speedScale, tick);
      navigation.intentSpeed[i] = h.vx[i] = h.vz[i] = 0;
      continue;
    }
    if (navigation && !navigation.canSteer(h, i, tick)) continue;

    const queryStart = context?.profile ? performance.now() : 0;
    const ownSize = grid.size[i];
    const count = grid.nearby(h, i, config.separationRadius * (ownSize + grid.maxSize) / 2, config.neighborsPerCell, config.maxNeighbors);
    if (context?.profile) context.timing.neighborMs += performance.now() - queryStart;
    if (navigation) navigation.neighbors[i] = count;
    const enemy = stats[h.type[i]];
    const step = enemy.speed / NET.tickHz;
    const forwardClear = navigation?.clearanceStep(h, i, step, clearance) &&
      (!planner || planner.visible(x, z, x + clearance.x, z + clearance.z)) &&
      grid.contactFraction(h, i, clearance.x, clearance.z, contactDiameter * navigation.contactScale(i), config.contactCandidatesPerCell) >= 1;
    const recovery = navigation?.recoveryStage(i, tick, forwardClear) ?? 0;
    if (recovery < 0) continue;
    const kind = traits[h.type[i]];
    const circling = !!context?.flank && pursuing && kind?.tactics === 'flank' && context.flank.goal(h, i, player, kind, tick, goal);
    if (context && pursuing && !circling) context.approach.choose(h, i, player, enemy.meleeRange, edge, goal, context.navigation, planner);

    if (planner && navigation) {
      let result = navigation.resolve(h, i, goal, tick, planner);
      if (result < 0 && pursuing && (goal.x !== player.x || goal.z !== player.z)) {
        goal.x = player.x;
        goal.z = player.z;
        result = navigation.resolve(h, i, goal, tick, planner);
      } else if (result < 0 && context?.fallback) {
        speedScale = context.fallback(i, goal);
        if (speedScale > 0) result = navigation.resolve(h, i, goal, tick, planner);
      }
      if (result <= 0) {
        // A budget deferral does not imply an unreachable destination.
        if (result < 0) navigation.setGoal(h, i, goal, -1, tick);
        navigation.intentSpeed[i] = h.vx[i] = h.vz[i] = 0;
        continue;
      }
    }
    navigation?.setGoal(h, i, goal, speedScale, tick);

    let sx = 0, sz = 0, contactX = 0, contactZ = 0;
    for (let j = 0; j < count; j++) {
      const other = grid.neighbors[j];
      const d = Math.sqrt(grid.distances[j]);
      let nx: number, nz: number;
      if (d > 0) {
        nx = (x - h.x[other]) / d;
        nz = (z - h.z[other]) / d;
      } else {
        const a = h.id[i], b = h.id[other];
        const pair = OVERLAP_DIRECTIONS[(Math.imul(a, b) + (a ^ b)) & 3];
        const sign = a < b ? -1 : 1;
        nx = pair[0] * sign;
        nz = pair[1] * sign;
      }
      const pairScale = ownSize === 1 && grid.size[other] === 1 ? 1 : (ownSize + grid.size[other]) / 2;
      const weight = Math.max(0, 1 - d / (config.separationRadius * pairScale));
      sx += nx * weight;
      sz += nz * weight;
      if (d >= diameter * pairScale) continue;
      const compression = 1 - d / (diameter * pairScale);
      contactX += nx * compression;
      contactZ += nz * compression;
    }

    const dx = goal.x - x, dz = goal.z - z;
    const distance = Math.hypot(dx, dz);
    const moving = distance > (navigation?.arrival(i) ?? config.arrivalRadius);
    const seekX = moving ? dx / distance : 0, seekZ = moving ? dz / distance : 0;
    const topSpeed = enemy.speed * (context ? speedScale : 1);
    const routeSpeed = Math.min(topSpeed, distance / horizon);
    const spread = config.separationStrength * Math.min(1, distance / config.separationRadius) / Math.max(1, Math.hypot(sx, sz));
    const pressure = config.contactStrength / Math.max(1, Math.hypot(contactX, contactZ));
    // At a settled contact position use only compression. Broader separation acts while approaching.
    let repelX = contactX * pressure + (moving ? sx * spread : 0);
    let repelZ = contactZ * pressure + (moving ? sz * spread : 0);
    if (moving) {
      const forward = repelX * seekX + repelZ * seekZ;
      const floor = config.forwardFloor - 1;
      if (forward < floor) {
        repelX += seekX * (floor - forward);
        repelZ += seekZ * (floor - forward);
      }
    }
    let steerX = seekX + repelX, steerZ = seekZ + repelZ;
    let avoidanceX = 0, avoidanceZ = 0;
    if (moving && recovery && recovery < config.recoveryRetries) {
      // Keep a deterministic side during each attempt. The next stage tries the opposite side.
      const side = ((h.id[i] + (recovery >= 2 ? 1 : 0)) & 1) ? 1 : -1;
      const yielding = recovery === 1 && side > 0 && distance > diameter &&
        grid.contactFraction(h, i, seekX * step, seekZ * step, contactDiameter, config.contactCandidatesPerCell) < 1;
      const forward = yielding ? -config.forwardFloor : 1;
      steerX = seekX * forward - seekZ * side * config.separationStrength;
      steerZ = seekZ * forward + seekX * side * config.separationStrength;
    } else if (moving && recovery) {
      steerX = seekX;
      steerZ = seekZ;
    }
    if (planner && (repelX || repelZ || recovery)) {
      const scale = (moving ? routeSpeed : topSpeed) * horizon / Math.max(1, Math.hypot(steerX, steerZ));
      if (!planner.visible(x, z, x + steerX * scale, z + steerZ * scale)) {
        steerX = seekX;
        steerZ = seekZ;
      }
      avoidanceX = steerX - seekX - repelX;
      avoidanceZ = steerZ - seekZ - repelZ;
    }
    const speed = (moving ? routeSpeed : topSpeed) / Math.max(1, Math.hypot(steerX, steerZ));
    const vx = steerX * speed, vz = steerZ * speed;
    // A narrowed corner and a real obstacle take precedence over velocity smoothing.
    const blend = avoidanceX || avoidanceZ || routeSpeed < topSpeed ? 1 : response;
    h.vx[i] += (vx - h.vx[i]) * blend;
    h.vz[i] += (vz - h.vz[i]) * blend;
    if (navigation) navigation.intentSpeed[i] = moving ? topSpeed : 0;
    if (navigation && context?.profile) {
      navigation.separationX[i] = repelX;
      navigation.separationZ[i] = repelZ;
      navigation.avoidanceX[i] = avoidanceX;
      navigation.avoidanceZ[i] = avoidanceZ;
    }
  }
}

/** Collision and stagger run on every tick. Yaw follows achieved movement or faces the contact target when holding. */
export function movementSystem(h: HordeManager, world?: WorldDefinition, tick = 0, staggers?: StaggerComponent,
  navigation?: EnemyNavigation, grid?: UniformGrid, config = BALANCE.swarm.hordeAi, combat?: EnemyCombat,
  enemies: readonly EnemyGameplay[] = ENEMY_TYPES, traits: readonly EnemyTraits[] = ENEMY_TRAITS): void {
  const position = { x: 0, z: 0 };
  const diameter = ENEMY_GROUND_RADIUS * 2 * config.contactDiameterFraction;
  let index = h.count ? ((Math.imul(tick, 31) >>> 0) % h.count) : 0;
  for (let remaining = h.count; remaining > 0; remaining--) {
    const i = h.active[index];
    if (++index === h.count) index = 0;
    const stagger = staggers?.active(h, i) ?? 0;
    const staggered = stagger > 0 && tick < stagger;
    if (stagger && !staggered) staggers!.end(i);
    if (!staggered && combat?.holding(h, i, tick)) {
      if (navigation) navigation.actualX[i] = navigation.actualZ[i] = 0;
      continue;
    }
    if (world && navigation && !navigation.prepare(h, i, world, tick)) {
      h.vx[i] = h.vz[i] = 0;
      continue;
    }
    const beforeX = h.x[i], beforeZ = h.z[i];
    const dx = h.vx[i] / NET.tickHz, dz = h.vz[i] / NET.tickHz;
    if (dx || dz) {
      position.x = beforeX;
      position.z = beforeZ;
      const radius = traits[h.type[i]]?.groundRadius ?? ENEMY_GROUND_RADIUS;
      if (world) {
        moveOnGround(position, Math.fround(beforeX + dx), Math.fround(beforeZ + dz), world, radius);
      } else {
        position.x = clampToArena(beforeX + dx);
        position.z = clampToArena(beforeZ + dz);
      }
      let stepX = position.x - beforeX, stepZ = position.z - beforeZ;
      if (grid && !staggered && (stepX || stepZ)) {
        const clearance = diameter * (navigation?.contactScale(i) ?? 1);
        const fraction = grid.contactFraction(h, i, stepX, stepZ, clearance, config.contactCandidatesPerCell);
        if (fraction < 1) {
          // Try a tangent from the original position. Recheck both constraints before committing it.
          const nx = grid.contactX, nz = grid.contactZ;
          const normal2 = nx * nx + nz * nz;
          const inward = normal2 ? Math.min(0, (stepX * nx + stepZ * nz) / normal2) : 0;
          const tangentX = stepX - inward * nx, tangentZ = stepZ - inward * nz;
          stepX *= fraction;
          stepZ *= fraction;
          if (inward && (tangentX || tangentZ)) {
            const slide = grid.contactFraction(h, i, tangentX, tangentZ, clearance, config.contactCandidatesPerCell);
            if (slide * slide * (tangentX ** 2 + tangentZ ** 2) > stepX ** 2 + stepZ ** 2) {
              stepX = tangentX * slide;
              stepZ = tangentZ * slide;
            }
          }
          position.x = beforeX;
          position.z = beforeZ;
          if (world) moveOnGround(position, Math.fround(beforeX + stepX), Math.fround(beforeZ + stepZ), world, radius);
          else {
            position.x = clampToArena(beforeX + stepX);
            position.z = clampToArena(beforeZ + stepZ);
          }
          // Axis clipping can change a tangent into an inward step. Keep the two collision checks consistent.
          const actualX = position.x - beforeX, actualZ = position.z - beforeZ;
          if ((Math.abs(actualX - stepX) > 1e-8 || Math.abs(actualZ - stepZ) > 1e-8) &&
              (actualX || actualZ) && grid.contactFraction(h, i, actualX, actualZ, clearance, config.contactCandidatesPerCell) < 1) {
            position.x = beforeX;
            position.z = beforeZ;
          }
        }
      }
      h.x[i] = position.x;
      h.z[i] = position.z;
    }
    if (navigation) {
      const commanded = navigation.intentSpeed[i] || Math.hypot(h.vx[i], h.vz[i]);
      navigation.moved(h, i, beforeX, beforeZ, commanded, staggered, tick);
      if (!staggered) navigation.face(h, i, h.x[i] - beforeX, h.z[i] - beforeZ, enemies[h.type[i]].meleeRange);
    }
    if (staggered) {
      const remaining = stagger - tick;
      const scale = remaining > 1 ? (remaining - 1) / remaining : 0;
      h.vx[i] *= scale;
      h.vz[i] *= scale;
    }
  }
}
