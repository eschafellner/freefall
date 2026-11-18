import { ENEMY_TYPES, NET, clampToArena, moveOnGround } from '@freefall/shared';
import type { PositionXZ, WorldDefinition } from '@freefall/shared';
import type { HordeManager } from '../ecs/HordeManager.ts';
import type { UniformGrid } from '../ecs/UniformGrid.ts';
import type { SimPlayer } from '../simulation/Player.ts';
import { ARENA_REINFORCEMENTS, ARENA_SPAWN_TYPE } from '../simulation/ArenaEncounter.ts';

export const AI = {
  targetTicks: 6,
  steeringTicks: 2,
  separationRadius: 1.65,
  neighborsPerCell: 12,
  refillTicks: ARENA_REINFORCEMENTS.refillTicks,
} as const;

export function spawnSystem(h: HordeManager, desired: number, random: () => number): void {
  while (h.count < desired) {
    const theta = random() * Math.PI * 2;
    const radius = ARENA_REINFORCEMENTS.outerRadius - random() * ARENA_REINFORCEMENTS.ringWidth;
    h.spawn(Math.sin(theta) * radius, Math.cos(theta) * radius, ARENA_SPAWN_TYPE);
  }
}

export function despawnSystem(h: HordeManager, desired: number): void {
  while (h.count > desired) h.despawn(h.active[h.count - 1]);
}

export function targetingSystem(h: HordeManager, players: readonly (SimPlayer | undefined)[], tick: number): void {
  for (let index = 0; index < h.count; index++) {
    const i = h.active[index];
    const current = players[h.target[i]];
    if (current && current.hp > 0 && (tick + i) % AI.targetTicks !== 0) continue;
    let bestDistance = Infinity;
    let best = -1;
    for (let slot = 0; slot < players.length; slot++) {
      const player = players[slot];
      if (!player || player.hp <= 0) continue;
      const dx = player.x - h.x[i];
      const dz = player.z - h.z[i];
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = slot;
      }
    }
    h.target[i] = best;
  }
}

export type EnemyDestination = (slot: number, output: PositionXZ) => number;
const steeringGoal = { x: 0, z: 0 };

export function steeringSystem(h: HordeManager, grid: UniformGrid, players: readonly (SimPlayer | undefined)[], tick: number,
  destination?: EnemyDestination): void {
  grid.rebuild(h);
  const radius = AI.separationRadius;
  for (let index = 0; index < h.count; index++) {
    const i = h.active[index];
    if ((tick + i) % AI.steeringTicks !== 0) continue;
    const x = h.x[i];
    const z = h.z[i];
    const col = grid.cell(x);
    const row = grid.cell(z);
    let sx = 0;
    let sz = 0;
    for (let r = Math.max(0, row - 1); r <= Math.min(grid.width - 1, row + 1); r++) {
      for (let c = Math.max(0, col - 1); c <= Math.min(grid.width - 1, col + 1); c++) {
        let other = grid.head[r * grid.width + c];
        for (let sample = 0; other !== -1 && sample < AI.neighborsPerCell; sample++, other = grid.next[other]) {
          if (other === i) continue;
          const dx = x - h.x[other];
          const dz = z - h.z[other];
          const d2 = dx * dx + dz * dz;
          if (d2 >= radius * radius) continue;
          if (d2 < 0.000001) {
            sx += i < other ? -1 : 1;
            continue;
          }
          const d = Math.sqrt(d2);
          const weight = (radius - d) / (radius * d);
          sx += dx * weight;
          sz += dz * weight;
        }
      }
    }
    const player = players[h.target[i]];
    let seekX = 0;
    let seekZ = 0;
    const speedScale = destination ? destination(i, steeringGoal) : 1;
    const goal = destination ? steeringGoal : player;
    if (speedScale > 0 && goal && (destination || (player && player.hp > 0))) {
      const dx = goal.x - x;
      const dz = goal.z - z;
      const scale = 1 / Math.max(1.3, Math.hypot(dx, dz));
      seekX = dx * scale;
      seekZ = dz * scale;
      if (Math.abs(dx) + Math.abs(dz) > .06) h.yaw[i] = Math.atan2(dx, -dz);
    }
    const spread = 1.55 / Math.max(1, Math.hypot(sx, sz));
    const vx = seekX + sx * spread;
    const vz = seekZ + sz * spread;
    const speed = speedScale * ENEMY_TYPES[h.type[i]].speed / Math.max(1, Math.hypot(vx, vz));
    h.vx[i] = vx * speed;
    h.vz[i] = vz * speed;
  }
}

export function movementSystem(h: HordeManager, world?: WorldDefinition): void {
  const position = { x: 0, z: 0 };
  for (let index = 0; index < h.count; index++) {
    const i = h.active[index];
    const x = h.x[i] + h.vx[i] / NET.tickHz;
    const z = h.z[i] + h.vz[i] / NET.tickHz;
    if (world) {
      position.x = h.x[i];
      position.z = h.z[i];
      moveOnGround(position, x, z, world, .37);
      h.x[i] = position.x;
      h.z[i] = position.z;
    } else {
      h.x[i] = clampToArena(x);
      h.z[i] = clampToArena(z);
    }
  }
}
