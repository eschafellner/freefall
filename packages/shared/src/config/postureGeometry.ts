import type { PostureCollider } from '../balance/definitions.ts';
import type { Obstacle, WorldDefinition } from '../definitions/missions.ts';
import { ARENA_HALF } from './arena.ts';
import type { AimRay, MovementBoundary, PositionXZ } from './movement.ts';
import { clearWorldLine, nearbyObstacles, obstacleIntersection } from './worldGeometry.ts';
import { groundHeight, terrainIntersection } from '../world/Terrain.ts';

export interface OperatorPosition extends PositionXZ { y: number }

const EPS = 1e-7;

/** Ground contact uses the current surface. Cover is not a walkable floor. */
export function isOperatorGrounded(position: OperatorPosition, world?: WorldDefinition): boolean {
  const tolerance = world?.terrain ? 1e-5 : EPS;
  return Math.abs(position.y - groundHeight(world, position.x, position.z)) <= tolerance;
}

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

/** In body space, negative Z points toward the head in prone and toward the feet in supine. */
export const GROUND_HIT_ZONES = [
  { part: 'head', z: -.78, halfLength: .22, halfWidth: .48, bottom: .25, top: .91 },
  { part: 'torso', z: -.19, halfLength: .45, halfWidth: 1, bottom: .12, top: 1 },
  { part: 'legs', z: .57, halfLength: .43, halfWidth: .8, bottom: .03, top: .62 },
] as const;

export function groundHitZoneTop(zone: (typeof GROUND_HIT_ZONES)[number], supine: boolean): number {
  return supine && zone.part === 'legs' ? .79 : zone.top;
}

/** Ray against the head, armored torso and lower body of a horizontal operator. */
export function groundedBodyHit(ray: AimRay, p: OperatorPosition, shape: PostureCollider, yaw: number, supine: boolean,
  min: number, max: number, world?: WorldDefinition): number {
  const c = Math.cos(yaw), s = Math.sin(yaw), sign = supine ? -1 : 1;
  const x = ray.x - p.x, z = ray.z - p.z;
  const ox = c * x + s * z, oy = ray.y - p.y, oz = sign * (c * z - s * x);
  const dx = c * ray.dx + s * ray.dz, dz = sign * (c * ray.dz - s * ray.dx);
  const { height, radius, halfLength } = shape;
  let hit = Infinity;
  for (const zone of GROUND_HIT_ZONES) {
    const center = halfLength * zone.z;
    const base = world?.terrain ? groundHeight(world, p.x - s * center * sign, p.z + c * center * sign) : p.y;
    hit = Math.min(hit, boxEntry(ox, oy + p.y - base, oz - center, dx, ray.dy, dz,
      radius * zone.halfWidth, height * zone.bottom, height * groundHitZoneTop(zone, supine),
      halfLength * zone.halfLength, min, max));
  }
  return hit;
}

export type AttackContact = 'hit' | 'angle' | 'cover' | 'volume';

export interface AttackArc {
  x: number;
  z: number;
  cos: number;
  sin: number;
}

function attackBoxContact(x: number, y: number, z: number, localX: number, localZ: number, c: number, s: number,
  halfX: number, minZ: number, maxZ: number, bottom: number, top: number, reachSquared: number, halfHeight: number,
  arc: AttackArc, world?: WorldDefinition): AttackContact {
  if (y + halfHeight < bottom || y - halfHeight > top) return 'volume';
  const dx = Math.max(-halfX, Math.min(halfX, localX)) - localX;
  const dz = Math.max(minZ, Math.min(maxZ, localZ)) - localZ;
  const distanceSquared = dx * dx + dz * dz;
  if (distanceSquared > reachSquared) return 'volume';
  const dy = Math.max(bottom, Math.min(top, y)) - y;
  const worldX = c * dx - s * dz, worldZ = s * dx + c * dz;
  if (worldX * arc.x + worldZ * arc.z >= Math.sqrt(distanceSquared) * arc.cos) {
    return clearAttackSegment(x, y, z, worldX, dy, worldZ, world) ? 'hit' : 'cover';
  }
  // The closest point can be outside the sector while a corner crosses one of its edges.
  const centerZ = (minZ + maxZ) * .5;
  let result: AttackContact = 'angle';
  for (const side of [-1, 1]) {
    const rayX = arc.x * arc.cos - side * arc.z * arc.sin;
    const rayZ = arc.z * arc.cos + side * arc.x * arc.sin;
    const distance = boxEntry(localX, 0, localZ - centerZ, c * rayX + s * rayZ, 0, c * rayZ - s * rayX,
      halfX, 0, 0, maxZ - centerZ, 0, Math.sqrt(reachSquared));
    if (distance === Infinity) continue;
    if (clearAttackSegment(x, y, z, rayX * distance, dy, rayZ * distance, world)) return 'hit';
    result = 'cover';
  }
  return result;
}

function clearAttackSegment(x: number, y: number, z: number, dx: number, dy: number, dz: number, world?: WorldDefinition): boolean {
  return !world || clearWorldLine(world, x, y, z, dx, dy, dz);
}

/** Test reach and cover to the nearest point of the current oriented operator volume. */
export function postureAttackContact(p: OperatorPosition, shape: PostureCollider, yaw: number,
  x: number, y: number, z: number, reach: number, halfHeight: number, arc: AttackArc, world?: WorldDefinition): AttackContact {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const ox = x - p.x, oz = z - p.z;
  return attackBoxContact(x, y, z, c * ox + s * oz, c * oz - s * ox, c, s,
    shape.radius, -shape.halfLength, shape.halfLength, p.y, p.y + shape.height, reach ** 2, halfHeight, arc, world);
}

/** An enemy's horizontal attack reaches a body zone only across a clear segment at a valid attack height. */
export function groundedAttackContact(p: OperatorPosition, shape: PostureCollider, yaw: number, supine: boolean,
  x: number, y: number, z: number, range: number, halfHeight: number, arc: AttackArc, world?: WorldDefinition): AttackContact {
  const c = Math.cos(yaw), s = Math.sin(yaw), sign = supine ? -1 : 1;
  const ox = x - p.x, oz = z - p.z;
  const localX = c * ox + s * oz, localZ = c * oz - s * ox;
  const reachSquared = range ** 2;
  let result: AttackContact = 'volume';
  for (const zone of GROUND_HIT_ZONES) {
    const centerZ = zone.z * shape.halfLength * sign;
    const halfZ = zone.halfLength * shape.halfLength;
    const base = world?.terrain ? groundHeight(world, p.x - s * centerZ, p.z + c * centerZ) : p.y;
    const contact = attackBoxContact(x, y, z, localX, localZ, c, s,
      zone.halfWidth * shape.radius, centerZ - halfZ, centerZ + halfZ,
      base + zone.bottom * shape.height, base + groundHitZoneTop(zone, supine) * shape.height, reachSquared, halfHeight, arc, world);
    if (contact === 'hit') return contact;
    if (contact === 'cover' || (contact === 'angle' && result === 'volume')) result = contact;
  }
  return result;
}

/** Optional presentation output. The numeric hit limit and collision order are unchanged. */
export interface ShotWorldContact {
  distance: number;
  obstacle?: Obstacle;
}

export function shotWorldLimit(ray: AimRay, min: number, max: number, world?: WorldDefinition, contact?: ShotWorldContact): number {
  const terrain = terrainIntersection(world, ray.x, ray.y, ray.z, ray.dx, ray.dy, ray.dz, min, max);
  max = Math.min(max, terrain);
  if (contact) {
    contact.distance = terrain;
    contact.obstacle = undefined;
  }
  for (const obstacle of world?.obstacles ?? []) {
    const distance = obstacleIntersection(obstacle, ray.x, ray.y, ray.z, ray.dx, ray.dy, ray.dz, min, max);
    if (contact && distance < contact.distance) {
      contact.distance = distance;
      contact.obstacle = obstacle;
    }
    max = Math.min(max, distance);
  }
  return max;
}

/** Redirect the shoulder ray from the physical muzzle to the selected aim point and clip it against the world. */
export function traceTacticalShot(ray: AimRay, p: OperatorPosition, muzzle: OperatorPosition, aimDistance: number,
  range: number, aimedAtTarget: boolean, world?: WorldDefinition, contact?: ShotWorldContact): number {
  const dx = ray.x + ray.dx * aimDistance - muzzle.x;
  const dy = ray.y + ray.dy * aimDistance - muzzle.y;
  const dz = ray.z + ray.dz * aimDistance - muzzle.z;
  const forward = dx * ray.dx + dz * ray.dz > EPS;
  ray.x = muzzle.x; ray.y = muzzle.y; ray.z = muzzle.z;
  if ((!forward && !aimedAtTarget) || (world && !clearWorldLine(world, p.x, muzzle.y, p.z, muzzle.x - p.x, 0, muzzle.z - p.z))) return 0;
  if (forward) {
    const length = Math.hypot(dx, dy, dz);
    ray.dx = dx / length; ray.dy = dy / length; ray.dz = dz / length;
  }
  return shotWorldLimit(ray, 0, range, world, contact);
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
  // Conservative vertical envelope for movement over a sloped triangle.
  const rise = world?.terrain ? world.terrain.maxGrade * Math.hypot(dx, dz) : 0;
  const base = rise ? { x: p.x, z: p.z, y: p.y - rise } : p;
  for (const obstacle of nearbyObstacles(world, p.x + dx / 2, p.z + dz / 2,
    Math.max(halfX + Math.abs(dx) / 2, halfZ + Math.abs(dz) / 2))) {
    fraction = Math.min(fraction, obstacleEntry(base, dx, dz, top + rise, shape, c, s, halfX, halfZ, obstacle));
  }
  return Math.max(0, fraction < 1 ? fraction - EPS : 1);
}

export function fitsPosture(p: OperatorPosition, shape: PostureCollider, yaw: number, world?: WorldDefinition): boolean {
  return postureSweep(p, 0, 0, p.y + shape.height, shape, yaw, world) === 1;
}
