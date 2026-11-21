import { groundHeight, terrainIntersection } from '../world/Terrain.ts';
import type { PositionXZ } from './movement.ts';
import type { Obstacle, WorldDefinition } from '../definitions/missions.ts';

const CELL = 16;
const LOCAL_CLEARANCE = 8;
const obstacleBins = new WeakMap<WorldDefinition, { width: number; cells: Obstacle[][] }>();
const noObstacles: readonly Obstacle[] = [];

/** Small queries reuse a padded local bucket. Wide lines keep the original ordered scan. */
export function nearbyObstacles(world: WorldDefinition | undefined, x: number, z: number, clearance: number): readonly Obstacle[] {
  if (!world) return noObstacles;
  if (!world.terrain || clearance > LOCAL_CLEARANCE || Math.max(Math.abs(x), Math.abs(z)) > world.half) return world.obstacles;
  let index = obstacleBins.get(world);
  if (!index) {
    const width = 1 + Math.floor(world.half * 2 / CELL);
    const cells = Array.from({ length: width * width }, () => [] as Obstacle[]);
    const cell = (position: number) => Math.max(0, Math.min(width - 1, Math.floor((position + world.half) / CELL)));
    for (const obstacle of world.obstacles) {
      const fromX = cell(obstacle.x - obstacle.halfX - LOCAL_CLEARANCE);
      const toX = cell(obstacle.x + obstacle.halfX + LOCAL_CLEARANCE);
      const fromZ = cell(obstacle.z - obstacle.halfZ - LOCAL_CLEARANCE);
      const toZ = cell(obstacle.z + obstacle.halfZ + LOCAL_CLEARANCE);
      for (let row = fromZ; row <= toZ; row++) for (let col = fromX; col <= toX; col++) {
        cells[row * width + col].push(obstacle);
      }
    }
    index = { width, cells };
    obstacleBins.set(world, index);
  }
  const col = Math.floor((x + world.half) / CELL), row = Math.floor((z + world.half) / CELL);
  return index.cells[row * index.width + col];
}

export function distanceSquared(a: PositionXZ, b: PositionXZ): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

export function overlapsObstacle(x: number, z: number, obstacle: Obstacle, radius = 0): boolean {
  return obstacle.kind !== 'arch-span' && Math.abs(x - obstacle.x) < obstacle.halfX + radius && Math.abs(z - obstacle.z) < obstacle.halfZ + radius;
}

export function openGround(world: WorldDefinition, x: number, z: number, radius: number): boolean {
  return Math.max(Math.abs(x), Math.abs(z)) <= world.half - radius &&
    !nearbyObstacles(world, x, z, radius).some((obstacle) => overlapsObstacle(x, z, obstacle, radius));
}

export function clampToWorld(value: number, half: number): number {
  return Math.max(-half + .5, Math.min(half - .5, value));
}

export function moveOnGround(position: PositionXZ, nextX: number, nextZ: number, world: WorldDefinition, radius: number): void {
  const x = clampToWorld(nextX, world.half);
  const z = clampToWorld(nextZ, world.half);
  if (!nearbyObstacles(world, x, position.z, radius).some((obstacle) => overlapsObstacle(x, position.z, obstacle, radius))) position.x = x;
  if (!nearbyObstacles(world, position.x, z, radius).some((obstacle) => overlapsObstacle(position.x, z, obstacle, radius))) position.z = z;
}

export function obstacleIntersection(
  obstacle: Obstacle, x: number, y: number, z: number, dx: number, dy: number, dz: number,
  start: number, end: number, padding = 0, verticalPadding = 0,
): number {
  const hx = obstacle.halfX + padding;
  const hz = obstacle.halfZ + padding;
  const ox = x - obstacle.x;
  const oz = z - obstacle.z;
  if (Math.abs(dx) < 1e-8) {
    if (Math.abs(ox) > hx) return Infinity;
  } else {
    const a = (-hx - ox) / dx;
    const b = (hx - ox) / dx;
    start = Math.max(start, Math.min(a, b));
    end = Math.min(end, Math.max(a, b));
  }
  if (Math.abs(dz) < 1e-8) {
    if (Math.abs(oz) > hz) return Infinity;
  } else {
    const a = (-hz - oz) / dz;
    const b = (hz - oz) / dz;
    start = Math.max(start, Math.min(a, b));
    end = Math.min(end, Math.max(a, b));
  }
  const bottom = (obstacle.bottom ?? 0) - verticalPadding;
  const top = obstacle.height + verticalPadding;
  if (Math.abs(dy) < 1e-8) {
    if (y < bottom || y > top) return Infinity;
  } else {
    const a = (bottom - y) / dy;
    const b = (top - y) / dy;
    start = Math.max(start, Math.min(a, b));
    end = Math.min(end, Math.max(a, b));
  }
  return start <= end ? start : Infinity;
}

export function clearGroundLine(world: WorldDefinition, x: number, z: number, toX: number, toZ: number): boolean {
  const y = groundHeight(world, x, z) + 1, endY = groundHeight(world, toX, toZ) + 1;
  return clearWorldLine(world, x, y, z, toX - x, endY - y, toZ - z);
}

export function clearWorldLine(world: WorldDefinition, x: number, y: number, z: number, dx: number, dy: number, dz: number): boolean {
  return (!world.terrain || terrainIntersection(world, x, y, z, dx, dy, dz, 0, 1) === Infinity) &&
    !nearbyObstacles(world, x + dx / 2, z + dz / 2, Math.max(Math.abs(dx), Math.abs(dz)) / 2)
      .some((obstacle) => obstacleIntersection(obstacle, x, y, z, dx, dy, dz, 0, 1) <= 1);
}
