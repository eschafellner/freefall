import type { PositionXZ } from './movement.ts';
import type { Obstacle, WorldDefinition } from '../definitions/missions.ts';

export function distanceSquared(a: PositionXZ, b: PositionXZ): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

export function overlapsObstacle(x: number, z: number, obstacle: Obstacle, radius = 0): boolean {
  return Math.abs(x - obstacle.x) < obstacle.halfX + radius && Math.abs(z - obstacle.z) < obstacle.halfZ + radius;
}

export function openGround(world: WorldDefinition, x: number, z: number, radius: number): boolean {
  return Math.max(Math.abs(x), Math.abs(z)) <= world.half - radius &&
    !world.obstacles.some((obstacle) => overlapsObstacle(x, z, obstacle, radius));
}

export function clampToWorld(value: number, half: number): number {
  return Math.max(-half + .5, Math.min(half - .5, value));
}

export function moveOnGround(position: PositionXZ, nextX: number, nextZ: number, world: WorldDefinition, radius: number): void {
  const x = clampToWorld(nextX, world.half);
  const z = clampToWorld(nextZ, world.half);
  if (!world.obstacles.some((obstacle) => overlapsObstacle(x, position.z, obstacle, radius))) position.x = x;
  if (!world.obstacles.some((obstacle) => overlapsObstacle(position.x, z, obstacle, radius))) position.z = z;
}

export function obstacleIntersection(
  obstacle: Obstacle, x: number, y: number, z: number, dx: number, dy: number, dz: number,
  start: number, end: number, padding = 0,
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
  if (Math.abs(dy) < 1e-8) {
    if (y < 0 || y > obstacle.height) return Infinity;
  } else {
    const a = -y / dy;
    const b = (obstacle.height - y) / dy;
    start = Math.max(start, Math.min(a, b));
    end = Math.min(end, Math.max(a, b));
  }
  return start <= end ? start : Infinity;
}

export function clearGroundLine(world: WorldDefinition, x: number, z: number, toX: number, toZ: number): boolean {
  return !world.obstacles.some((obstacle) =>
    obstacleIntersection(obstacle, x, 1, z, toX - x, 0, toZ - z, 0, 1) <= 1);
}
