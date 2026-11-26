/**
 * Per-archetype body, armor and attack traits derived from `enemies.json`, shared by server simulation, snapshot
 * decoding and client presentation. Model space: +Y up, −Z forward, metres above the ground pivot. An enemy with
 * yaw θ faces (sin θ, −cos θ) in world space.
 */
import { BALANCE } from '../balance/defaults.ts';
import type { EnemyArchetype } from '../balance/definitions.ts';
import type { BalanceRegistry } from '../balance/registry.ts';
import { SIMULATION_HZ } from '../config/limits.ts';

/** Ground collision radius of archetypes without `groundRadius` (the Schabe). */
export const DEFAULT_ENEMY_GROUND_RADIUS = .37;

export interface EnemyAttackTiming {
  readonly windupTicks: number;
  /** Airborne ticks between windup and strike (leap attacks only, 0 for melee). */
  readonly flightTicks: number;
  readonly activeTicks: number;
  readonly recoveryTicks: number;
  readonly halfAngleDegrees: number;
}

export interface EnemyLeap extends EnemyAttackTiming {
  readonly minRange: number;
  readonly maxRange: number;
  readonly cooldownTicks: number;
  readonly arcHeight: number;
}

export interface EnemyCharge extends EnemyAttackTiming {
  readonly minRange: number;
  readonly maxRange: number;
  readonly cooldownTicks: number;
  /** Metres per tick while running. */
  readonly step: number;
  /** Maximum course correction per running tick (radians). */
  readonly steer: number;
  readonly contactHalfWidth: number;
  readonly contactReach: number;
  readonly damageMultiplier: number;
}

export interface EnemyHitZone {
  readonly id: string;
  readonly armorClass: number;
  readonly from: readonly number[];
  readonly to: readonly number[];
  readonly radius: number;
}

export interface EnemyTraits {
  readonly groundRadius: number;
  /** groundRadius relative to the Schabe; scales contact and separation distances. */
  readonly size: number;
  readonly zones?: readonly EnemyHitZone[];
  readonly frontArmor?: { readonly cos: number; readonly armorClass: number };
  readonly tactics: 'direct' | 'flank';
  readonly flank?: { readonly radius: number; readonly sideCos: number; readonly abortDistance: number; readonly abortAfterHitTicks: number };
  readonly melee: EnemyAttackTiming;
  readonly leap?: EnemyLeap;
  readonly charge?: EnemyCharge;
  readonly vehicleTargets: 'all' | 'thrusters';
  readonly staggerImmune: boolean;
  /** True when the archetype has its own melee timing; others follow the replicated default (horde frame header). */
  readonly ownTiming: boolean;
}

export const ATTACK_MELEE = 0;
export const ATTACK_LEAP = 1;
export const ATTACK_CHARGE = 2;
export type AttackKind = typeof ATTACK_MELEE | typeof ATTACK_LEAP | typeof ATTACK_CHARGE;

export function attackDuration(timing: EnemyAttackTiming): number {
  return timing.windupTicks + timing.flightTicks + timing.activeTicks + timing.recoveryTicks;
}

/** Tick (relative to the attack start) on which the strike resolves. */
export function attackStrikeAt(timing: EnemyAttackTiming): number {
  return timing.windupTicks + timing.flightTicks;
}

export type AttackPhase = 'windup' | 'flight' | 'active' | 'recovery' | 'done';

export function attackPhase(timing: EnemyAttackTiming, elapsed: number): AttackPhase {
  if (elapsed < timing.windupTicks) return 'windup';
  if (elapsed < timing.windupTicks + timing.flightTicks) return 'flight';
  if (elapsed < attackStrikeAt(timing) + timing.activeTicks) return 'active';
  return elapsed < attackDuration(timing) ? 'recovery' : 'done';
}

function traitsOf(archetype: EnemyArchetype, registry: BalanceRegistry): EnemyTraits {
  const base = archetype.attack ?? registry.swarm.meleeAttack;
  const groundRadius = archetype.groundRadius ?? DEFAULT_ENEMY_GROUND_RADIUS;
  const leap = archetype.leap;
  const charge = archetype.charge;
  return Object.freeze({
    groundRadius,
    size: groundRadius / DEFAULT_ENEMY_GROUND_RADIUS,
    ...(archetype.hitZones && { zones: archetype.hitZones }),
    ...(archetype.frontArmor && { frontArmor: Object.freeze({
      cos: Math.cos(archetype.frontArmor.halfAngleDegrees * Math.PI / 180), armorClass: archetype.frontArmor.armorClass }) }),
    tactics: archetype.tactics ?? 'direct',
    ...(archetype.flank && { flank: Object.freeze({
      radius: archetype.flank.radius, sideCos: Math.cos(archetype.flank.sideAngleDegrees * Math.PI / 180),
      abortDistance: archetype.flank.abortDistance, abortAfterHitTicks: Math.round(archetype.flank.abortAfterHitSeconds * SIMULATION_HZ) }) }),
    melee: Object.freeze({ windupTicks: base.windupTicks, flightTicks: 0, activeTicks: base.activeTicks,
      recoveryTicks: base.recoveryTicks, halfAngleDegrees: base.halfAngleDegrees }),
    ...(leap && { leap: Object.freeze({
      windupTicks: leap.windupTicks, flightTicks: leap.flightTicks, activeTicks: base.activeTicks, recoveryTicks: leap.recoveryTicks,
      halfAngleDegrees: base.halfAngleDegrees, minRange: leap.minRange, maxRange: leap.maxRange,
      cooldownTicks: Math.ceil(leap.cooldownSeconds * SIMULATION_HZ), arcHeight: leap.arcHeight }) }),
    ...(charge && { charge: Object.freeze({
      windupTicks: charge.windupTicks, flightTicks: charge.runTicks, activeTicks: base.activeTicks, recoveryTicks: charge.recoveryTicks,
      halfAngleDegrees: base.halfAngleDegrees, minRange: charge.minRange, maxRange: charge.maxRange,
      cooldownTicks: Math.ceil(charge.cooldownSeconds * SIMULATION_HZ), step: charge.speed / SIMULATION_HZ,
      steer: charge.steerDegreesPerSecond * Math.PI / 180 / SIMULATION_HZ, contactHalfWidth: charge.contactHalfWidth,
      contactReach: charge.contactReach, damageMultiplier: charge.damageMultiplier }) }),
    vehicleTargets: archetype.vehicleTargets ?? 'all',
    staggerImmune: archetype.staggerImmune ?? false,
    ownTiming: !!archetype.attack,
  });
}

/** Traits by wire type. */
export function enemyTraits(registry: BalanceRegistry): readonly EnemyTraits[] {
  return Object.freeze(registry.enemiesByWireType.map((archetype) => traitsOf(archetype!, registry)));
}

export const ENEMY_TRAITS = enemyTraits(BALANCE);

/** Timing of an attack kind for a wire type (leap and charge fall back to melee for archetypes without them). */
export function enemyAttackTiming(type: number, kind: number, traits: readonly EnemyTraits[] = ENEMY_TRAITS): EnemyAttackTiming {
  const entry = traits[type] ?? traits[0];
  if (kind === ATTACK_LEAP && entry.leap) return entry.leap;
  return kind === ATTACK_CHARGE && entry.charge ? entry.charge : entry.melee;
}

/**
 * Timing of a replicated attack: the frame header (default melee timing sent by the server) for archetypes without
 * their own timing, the registry timing for leaps, charges and archetypes with an `attack` block.
 */
export function replicatedAttackTiming(frame: { readonly type: ArrayLike<number>; readonly attackKind: ArrayLike<number>;
  readonly windupTicks: number; readonly activeTicks: number; readonly recoveryTicks: number }, index: number,
  traits: readonly EnemyTraits[] = ENEMY_TRAITS): EnemyAttackTiming {
  const type = frame.type[index], kind = frame.attackKind[index];
  const entry = traits[type] ?? traits[0];
  if (kind !== ATTACK_MELEE || entry.ownTiming || !frame.windupTicks) return enemyAttackTiming(type, kind, traits);
  return { windupTicks: frame.windupTicks, flightTicks: 0, activeTicks: frame.activeTicks, recoveryTicks: frame.recoveryTicks,
    halfAngleDegrees: entry.melee.halfAngleDegrees };
}

/** Longest attack of any archetype: the upper bound for a replicated attack age. */
export function maxAttackTicks(traits: readonly EnemyTraits[] = ENEMY_TRAITS): number {
  let longest = 0;
  for (const entry of traits) {
    longest = Math.max(longest, attackDuration(entry.melee), entry.leap ? attackDuration(entry.leap) : 0,
      entry.charge ? attackDuration(entry.charge) : 0);
  }
  return longest;
}

/** Height of a leaping enemy above the ground, `elapsed` ticks after the attack started. */
export function leapElevation(leap: EnemyLeap, elapsed: number): number {
  const t = (elapsed - leap.windupTicks) / leap.flightTicks;
  return t > 0 && t < 1 ? leap.arcHeight * 4 * t * (1 - t) : 0;
}

/**
 * Armor class against damage from (fromX, fromZ) without a ray: the frontal armor inside its cone, otherwise
 * `base`.
 */
export function directionalArmorClass(traits: EnemyTraits | undefined, base: number, yaw: number, x: number, z: number,
  fromX: number, fromZ: number): number {
  const front = traits?.frontArmor;
  if (!front) return base;
  const dx = fromX - x, dz = fromZ - z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return front.armorClass;
  return (dx * Math.sin(yaw) - dz * Math.cos(yaw)) / length >= front.cos ? Math.max(base, front.armorClass) : base;
}

interface Ray { readonly x: number; readonly y: number; readonly z: number; readonly dx: number; readonly dy: number; readonly dz: number }

/** Entry distance of a unit ray into a capsule, `Infinity` if it misses. A start inside counts as a hit at `min`. */
export function rayCapsule(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number, min: number, max: number): number {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const baba = bax * bax + bay * bay + baz * baz;
  const r2 = radius * radius;
  // Start inside: distance from the start point to the segment.
  const sx = ox + dx * min - ax, sy = oy + dy * min - ay, sz = oz + dz * min - az;
  const along = baba > 1e-12 ? Math.max(0, Math.min(1, (sx * bax + sy * bay + sz * baz) / baba)) : 0;
  if ((sx - bax * along) ** 2 + (sy - bay * along) ** 2 + (sz - baz * along) ** 2 <= r2) return min < max ? min : Infinity;
  const sphere = (cx: number, cy: number, cz: number) => {
    const px = ox - cx, py = oy - cy, pz = oz - cz;
    const b = px * dx + py * dy + pz * dz;
    const h = b * b - (px * px + py * py + pz * pz - r2);
    return h < 0 ? Infinity : -b - Math.sqrt(h);
  };
  let t = Infinity;
  const oax = ox - ax, oay = oy - ay, oaz = oz - az;
  const bard = bax * dx + bay * dy + baz * dz;
  const a = baba - bard * bard;
  if (baba > 1e-12 && a > 1e-12) {
    const baoa = bax * oax + bay * oay + baz * oaz;
    const b = baba * (dx * oax + dy * oay + dz * oaz) - baoa * bard;
    const c = baba * (oax * oax + oay * oay + oaz * oaz) - baoa * baoa - r2 * baba;
    const h = b * b - a * c;
    if (h < 0) return Infinity;
    const body = (-b - Math.sqrt(h)) / a;
    const y = baoa + body * bard;
    if (y > 0 && y < baba) t = body;
  }
  if (t === Infinity) t = Math.min(sphere(ax, ay, az), sphere(bx, by, bz));
  return t >= min && t < max ? t : Infinity;
}

/**
 * Nearest hit zone of an enemy at (x, baseY, z) with yaw along a unit world ray, or undefined. `index` is the zone's
 * position in `zones`.
 */
export function zoneRayHit(zones: readonly EnemyHitZone[], yaw: number, x: number, baseY: number, z: number, ray: Ray,
  min: number, max: number): { distance: number; index: number } | undefined {
  // World → model: right r = (cos θ, 0, sin θ), back b = (−sin θ, 0, cos θ).
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const wx = ray.x - x, wz = ray.z - z;
  const ox = wx * c + wz * s, oz = -wx * s + wz * c, oy = ray.y - baseY;
  const dx = ray.dx * c + ray.dz * s, dz = -ray.dx * s + ray.dz * c, dy = ray.dy;
  let best = max, index = -1;
  for (let i = 0; i < zones.length; i++) {
    const { from, to, radius } = zones[i];
    const t = rayCapsule(ox, oy, oz, dx, dy, dz, from[0], from[1], from[2], to[0], to[1], to[2], radius, min, best);
    if (t < best) { best = t; index = i; }
  }
  return index < 0 ? undefined : { distance: best, index };
}

/** Model-space point of a zone mapped to world space (tests and presentation). */
export function modelToWorld(yaw: number, x: number, baseY: number, z: number, point: readonly number[]): { x: number; y: number; z: number } {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: x + point[0] * c - point[2] * s, y: baseY + point[1], z: z + point[0] * s + point[2] * c };
}
