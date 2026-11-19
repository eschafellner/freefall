import type { PostureCollider } from '../balance/definitions.ts';
import type { Obstacle, WorldDefinition } from '../definitions/missions.ts';
import { ARENA_HALF } from './arena.ts';
import type { AimRay, MovementBoundary, PositionXZ } from './movement.ts';

export interface OperatorPosition extends PositionXZ { y: number }

const EPS = 1e-7;

function boxEntry(x: number, y: number, z: number, dx: number, dy: number, dz: number,
  halfX: number, minY: number, maxY: number, halfZ: number, start: number, end: number): number {
  if (Math.abs(dx) < EPS) {
    if (Math.abs(x) > halfX) return Infinity;
  } else {
    const a = (-halfX - x) / dx, b = (halfX - x) / dx;
    start = Math.max(start, Math.min(a, b)); end = Math.min(end, Math.max(a, b));
  }
  if (Math.abs(dy) < EPS) {
    if (y < minY || y > maxY) return Infinity;
  } else {
    const a = (minY - y) / dy, b = (maxY - y) / dy;
    start = Math.max(start, Math.min(a, b)); end = Math.min(end, Math.max(a, b));
  }
  if (Math.abs(dz) < EPS) {
    if (Math.abs(z) > halfZ) return Infinity;
  } else {
    const a = (-halfZ - z) / dz, b = (halfZ - z) / dz;
    start = Math.max(start, Math.min(a, b)); end = Math.min(end, Math.max(a, b));
  }
  return start <= end ? start : Infinity;
}

/** Oriented gameplay volume, bottom anchored to the operator's elevation. */
export function postureRayHit(ray: AimRay, p: OperatorPosition, shape: PostureCollider, yaw: number,
  min: number, max: number): number {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const x = ray.x - p.x, z = ray.z - p.z;
  return boxEntry(c * x + s * z, ray.y - p.y, c * z - s * x,
    c * ray.dx + s * ray.dz, ray.dy, c * ray.dz - s * ray.dx,
    shape.radius, 0, shape.height, shape.halfLength, min, max);
}

/** Ray against the head, armored torso and lower body of a horizontal operator. */
export function groundedBodyHit(ray: AimRay, p: OperatorPosition, shape: PostureCollider, yaw: number, supine: boolean,
  min: number, max: number): number {
  const c = Math.cos(yaw), s = Math.sin(yaw), sign = supine ? -1 : 1;
  const x = ray.x - p.x, z = ray.z - p.z;
  const ox = c * x + s * z, oy = ray.y - p.y, oz = sign * (c * z - s * x);
  const dx = c * ray.dx + s * ray.dz, dz = sign * (c * ray.dz - s * ray.dx);
  const { height, radius, halfLength } = shape;
  const head = boxEntry(ox, oy, oz + halfLength * .78, dx, ray.dy, dz,
    radius * .48, height * .25, height * .91, halfLength * .22, min, max);
  const torso = boxEntry(ox, oy, oz + halfLength * .19, dx, ray.dy, dz,
    radius, height * .12, height, halfLength * .45, min, max);
  const legs = boxEntry(ox, oy, oz - halfLength * .57, dx, ray.dy, dz,
    radius * .80, height * .03, height * (supine ? .79 : .62), halfLength * .43, min, max);
  return Math.min(head, torso, legs);
}

/** Squared distance from a point to the horizontal footprint. Used for attack reach. */
export function postureDistanceSquared(p: PositionXZ, shape: PostureCollider, yaw: number, x: number, z: number): number {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const dx = x - p.x, dz = z - p.z;
  return Math.max(0, Math.abs(c * dx + s * dz) - shape.radius) ** 2 +
    Math.max(0, Math.abs(c * dz - s * dx) - shape.halfLength) ** 2;
}

function obstacleEntry(p: OperatorPosition, dx: number, dz: number, top: number,
  shape: PostureCollider, c: number, s: number, halfX: number, halfZ: number, obstacle: Obstacle): number {
  if (top <= (obstacle.bottom ?? 0) + EPS || p.y >= obstacle.height - EPS) return Infinity;
  const x = p.x - obstacle.x, z = p.z - obstacle.z;
  // Intersect the four separating-axis time intervals of an oriented box and a world-aligned box.
  const time = boxEntry(x, 0, z, dx, 0, dz, halfX + obstacle.halfX - EPS, -1, 1,
    halfZ + obstacle.halfZ - EPS, 0, 1);
  if (time === Infinity) return time;
  const end = 1 - boxEntry(x + dx, 0, z + dz, -dx, 0, -dz, halfX + obstacle.halfX - EPS, -1, 1,
    halfZ + obstacle.halfZ - EPS, 0, 1);
  const ac = Math.abs(c), as = Math.abs(s);
  return boxEntry(c * x + s * z, 0, c * z - s * x, c * dx + s * dz, 0, c * dz - s * dx,
    shape.radius + ac * obstacle.halfX + as * obstacle.halfZ - EPS, -1, 1,
    shape.halfLength + as * obstacle.halfX + ac * obstacle.halfZ - EPS, time, end);
}

export function postureSweep(p: OperatorPosition, dx: number, dz: number, top: number, shape: PostureCollider,
  yaw: number, world?: WorldDefinition, boundary?: MovementBoundary): number {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const halfX = Math.abs(c) * shape.radius + Math.abs(s) * shape.halfLength;
  const halfZ = Math.abs(s) * shape.radius + Math.abs(c) * shape.halfLength;
  const half = world?.half ?? ARENA_HALF;
  const maxX = half - Math.max(.5, halfX), maxZ = half - Math.max(.5, halfZ);
  if (Math.abs(p.x) > maxX + EPS || Math.abs(p.z) > maxZ + EPS) return 0;
  let fraction = Math.min(1, dx ? (Math.sign(dx) * maxX - p.x) / dx : 1,
    dz ? (Math.sign(dz) * maxZ - p.z) / dz : 1);
  if (boundary && dx * dx + dz * dz > EPS) {
    const x = p.x - boundary.x, z = p.z - boundary.z;
    if ((x + dx) ** 2 + (z + dz) ** 2 > boundary.radius ** 2 + EPS) {
      const a = dx * dx + dz * dz, b = x * dx + z * dz;
      const disc = b * b - a * (x * x + z * z - boundary.radius ** 2);
      fraction = Math.min(fraction, disc >= 0 ? (-b + Math.sqrt(disc)) / a : 0);
    }
  }
  for (const obstacle of world?.obstacles ?? []) {
    fraction = Math.min(fraction, obstacleEntry(p, dx, dz, top, shape, c, s, halfX, halfZ, obstacle));
  }
  return Math.max(0, fraction < 1 ? fraction - EPS : 1);
}

export function fitsPosture(p: OperatorPosition, shape: PostureCollider, yaw: number, world?: WorldDefinition): boolean {
  return postureSweep(p, 0, 0, p.y + shape.height, shape, yaw, world) === 1;
}
