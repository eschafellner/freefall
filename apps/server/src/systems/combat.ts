import {
  BALANCE, BASE_LOADOUT, CAMERA_BACK, ENEMY_TYPES, MAX_PITCH, MUZZLE_HEIGHT, NET, aimRay, nextShotAt, applyShotRecoil, clearGroundLine,
  diveElevation, groundHeight, impactNormal, impactSurface, obstacleIntersection, recoverRecoil, resetRecoil, spreadCone, allowsPostureAction, groundedBodyHit, isGroundPosture,
  newPosture, postureCollider, postureRayHit, postureYaw, shotWorldLimit, tacticalAimPitch, tacticalAimYaw,
  tacticalMuzzle, tacticalShotLimit,
} from '@freefall/shared';
import type { AimRay, CombatEvent, DamagePolicy, PostureCollider, ShotEvent, ShotImpact, ShotWorldContact, WorldDefinition } from '@freefall/shared';
import type { HordeManager } from '../ecs/HordeManager.ts';
import type { StaggerComponent } from '../ecs/StaggerComponent.ts';
import type { UniformGrid } from '../ecs/UniformGrid.ts';
import { cancelEquipment, readyReload, reloading } from '../simulation/Player.ts';
import type { SimPlayer } from '../simulation/Player.ts';
import { resolveDamage } from './damage.ts';
import type { CombatStats } from './telemetry.ts';

export function damageEnemy(h: HordeManager, slot: number, amount: number): boolean {
  h.hp[slot] = Math.max(0, h.hp[slot] - amount);
  if (h.hp[slot] > 0) return false;
  h.despawn(slot);
  return true;
}

/**
 * Applies already resolved damage to an operator. Returns the health actually removed. With a combat context, a
 * reload cut short by death is published (`RELOAD_INTERRUPTED`) and counted like any other interruption.
 */
export function damagePlayer(player: SimPlayer, amount: number, tick: number, respawns = true, context?: CombatContext): number {
  if (player.hp <= 0 || tick < player.protectedUntil || !(amount > 0)) return 0;
  const before = player.hp;
  player.hp = Math.max(0, player.hp - amount);
  if (player.hp === 0) {
    cancelEquipment(player, tick);
    if (player.posture.dive) player.y -= diveElevation(player.posture.dive, tick);
    player.posture = newPosture(player.yaw);
    player.respawnTick = respawns ? tick + player.loadout.respawnTicks : 0;
    interruptReload(player, tick, context);
    player.reloadRequested = false;
  }
  return before - player.hp;
}

export interface MeleeObject {
  x: number;
  z: number;
  readonly hp: number;
  damage(amount: number, tick: number): void;
}

/** Allied non-operator target (convict) that friendly fire can reach. */
export interface AllyTarget extends MeleeObject { readonly id: string }

export type SecondaryTarget = (slot: number) => MeleeObject | undefined;

/** Optional combat services. Without them, shots ignore friendly fire, spread and telemetry (unit tests). */
export interface CombatContext {
  players?: readonly (SimPlayer | undefined)[];
  allies?: () => readonly AllyTarget[];
  /** Uniform random in [0, 1). Spread is rolled only on the server. */
  random?: () => number;
  stats?: CombatStats;
  events?: CombatEvent[];
  respawns?: boolean;
  grid?: UniformGrid;
  stagger?: StaggerComponent;
  /** Fallback policy when the attacker left the battlefield (e.g. a grenade of a disconnected operator). */
  policy?: DamagePolicy;
}

// ---------------------------------------------------------------------------------------------------------------
// Tactical reload

/**
 * Ends a running reload without a second transaction. Before `MAGAZINE_INSERTION` the ammunition stays untouched
 * (`RELOAD_INTERRUPTED`); after it the new magazine is already seated and the weapon is simply ready.
 */
export function interruptReload(player: SimPlayer, tick: number, context?: CombatContext): void {
  const reload = player.reload;
  player.reloadUntil = 0;
  if (!reloading(player)) return;
  if (reload.phase === 'MAGAZINE_INSERTION' || reload.phase === 'RELOAD_COMPLETE') {
    player.reload = { ...readyReload(tick), slot: reload.slot };
    return;
  }
  reload.phase = 'RELOAD_INTERRUPTED';
  reload.at = tick;
  if (context?.stats) context.stats.data.reloadsInterrupted++;
  context?.events?.push({ type: 'reload', tick, operator: player.id, slot: reload.slot, phase: 'RELOAD_INTERRUPTED', discarded: 0 });
}

/** Why a reload cannot start, or undefined if it can. */
export function reloadBlocker(player: SimPlayer): 'full' | 'empty' | undefined {
  const weapon = player.loadout.weapons[player.equipment.slot];
  if (player.ammo >= weapon.magazineSize) return 'full';
  if (player.equipment.magazines[player.equipment.slot] <= 0) return 'empty';
}

export function updateReload(player: SimPlayer, tick: number, context?: CombatContext, balance = BALANCE.movement): void {
  const requested = player.reloadRequested;
  player.reloadRequested = false;
  const reload = player.reload;
  if (player.hp <= 0 || !allowsPostureAction(player.posture, 'reload', balance)) {
    interruptReload(player, tick, context);
    return;
  }
  const gear = player.equipment;
  if (reloading(player)) {
    const weapon = player.loadout.weapons[reload.slot];
    if (reload.phase === 'RELOAD_START' && tick >= reload.removalAt) {
      reload.phase = 'MAGAZINE_REMOVAL';
      reload.at = tick;
    }
    if (reload.phase === 'MAGAZINE_REMOVAL' && tick >= reload.insertAt) {
      // The single ammunition transaction of this reload. The phase change makes it impossible to repeat.
      if (gear.slot !== reload.slot || gear.magazines[reload.slot] <= 0) {
        interruptReload(player, tick, context);
        return;
      }
      const discarded = player.ammo;
      gear.magazines[reload.slot]--;
      player.ammo = weapon.magazineSize;
      reload.phase = 'MAGAZINE_INSERTION';
      reload.at = tick;
      if (context?.stats) {
        context.stats.data.magazinesUsed[reload.slot]++;
        context.stats.data.roundsDiscarded[reload.slot] += discarded;
      }
      context?.events?.push({ type: 'reload', tick, operator: player.id, slot: reload.slot, phase: 'MAGAZINE_INSERTION', discarded });
    } else if (reload.phase === 'MAGAZINE_INSERTION' && tick > reload.insertAt) {
      reload.phase = 'RELOAD_COMPLETE';
      reload.at = tick;
    }
    if (tick >= reload.until) {
      player.reload = { ...readyReload(tick), slot: reload.slot };
      player.reloadUntil = 0;
    }
    return;
  }
  if (gear.action || !player.activeInput || reloadBlocker(player)) return;
  if (!requested && !(player.ammo === 0 && player.input.fire)) return;
  const weapon = player.loadout.weapons[gear.slot];
  player.reload = {
    phase: 'RELOAD_START', slot: gear.slot, started: tick, at: tick,
    removalAt: tick + weapon.reloadRemovalTicks, insertAt: tick + weapon.reloadInsertionTicks, until: tick + weapon.reloadTicks,
  };
  player.reloadUntil = player.reload.until;
  context?.events?.push({ type: 'reload', tick, operator: player.id, slot: gear.slot, phase: 'RELOAD_START', discarded: 0 });
}

// ---------------------------------------------------------------------------------------------------------------
// Hitscan

export interface CombatTargets {
  intersect(ray: AimRay, max: number, min?: number): { nestId: number; distance: number } | undefined;
  /** Returns the health actually removed. */
  hit(nestId: number, amount: number, tick: number, shooter: string): number;
}

/** Ray against a vertical cylinder standing on the ground. Returns the entry distance or Infinity. */
export function cylinderHit(ray: AimRay, x: number, z: number, radius: number, height: number, min: number, max: number, baseY = 0): number {
  const ox = ray.x - x, oz = ray.z - z;
  const a = ray.dx * ray.dx + ray.dz * ray.dz;
  if (a < 1e-9) return Infinity;
  const b = ox * ray.dx + oz * ray.dz;
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - a * c;
  if (disc < 0) return Infinity;
  const root = Math.sqrt(disc);
  const near = (-b - root) / a, far = (-b + root) / a;
  for (const t of [Math.max(near, min), far]) {
    if (t < min || t >= max || t > far) continue;
    const y = ray.y + ray.dy * t - baseY;
    if (y >= 0 && y <= height) return t;
  }
  return Infinity;
}

function enemyHit(ray: AimRay, h: HordeManager, i: number, min: number, world?: WorldDefinition): number {
  const definition = ENEMY_TYPES[h.type[i]];
  const ox = h.x[i] - ray.x;
  const oy = groundHeight(world, h.x[i], h.z[i]) + definition.hitHeight - ray.y;
  const oz = h.z[i] - ray.z;
  const projection = ox * ray.dx + oy * ray.dy + oz * ray.dz;
  const inside = definition.hitRadius ** 2 - (ox * ox + oy * oy + oz * oz - projection * projection);
  if (inside < 0) return Infinity;
  const root = Math.sqrt(inside);
  return projection + root < min ? Infinity : Math.max(min, projection - root);
}

function operatorHit(ray: AimRay, player: SimPlayer, min: number, max: number, tick: number,
  balance: typeof BALANCE.movement, world?: WorldDefinition): number {
  if (player.posture.current === 'STANDING') {
    const box = player.loadout.operatorHitbox;
    return cylinderHit(ray, player.x, player.z, box.radius, box.height, min, max, player.y);
  }
  const shape = postureCollider(player.posture, tick, balance);
  const yaw = postureYaw(player.posture, player.yaw);
  if (isGroundPosture(player.posture.current)) {
    return groundedBodyHit(ray, player, shape, yaw, player.posture.current === 'SUPINE', min, max, world);
  }
  return postureRayHit(ray, player, shape, yaw, min, max);
}

const noRandom = () => 0;

export function fireWeapon(h: HordeManager, player: SimPlayer, ray: AimRay, tick: number,
  world?: WorldDefinition, targets?: CombatTargets, context: CombatContext = {}, balance = BALANCE.movement): ShotEvent | undefined {
  const slot = player.equipment.slot;
  const weapon = player.loadout.weapons[slot];
  const { recoil, spread } = weapon.handling;
  recoverRecoil(player.recoil, recoil, spread, tick);
  if (!allowsPostureAction(player.posture, 'fire', balance) || player.equipment.action || !player.activeInput || !player.input.fire || player.hp <= 0 || !player.ammo || reloading(player) || tick < player.fireAt) return;
  player.ammo--;
  player.fireAt = nextShotAt(player.fireAt, tick, weapon.fireInterval);
  const random = context.random ?? noRandom;
  const input = player.input;
  // Direction: point of aim + authoritative recoil offset + spread cone. The client only predicts the recoil.
  const cone = spreadCone(spread, player.recoil, !!input.aim && allowsPostureAction(player.posture, 'aim', balance), input.forward !== 0 || input.strafe !== 0);
  const angle = random() * Math.PI * 2;
  const deviation = cone * Math.sqrt(random());
  const pitch = tacticalAimPitch(player.posture,
    Math.max(-MAX_PITCH, Math.min(MAX_PITCH, input.pitch + player.recoil.pitch + Math.sin(angle) * deviation)), balance);
  const yaw = tacticalAimYaw(player.posture, input.yaw + player.recoil.yaw + Math.cos(angle) * deviation, balance);
  const tactical = player.posture.current !== 'STANDING';
  applyShotRecoil(player.recoil, recoil, spread, tick);
  const shape = postureCollider(player.posture, tick, balance);
  aimRay(ray, player, yaw, pitch, tactical ? shape.lookHeight : undefined, player.y, !!world?.terrain);
  const stats = context.stats?.data;
  if (stats) stats.shots[slot]++;

  const muzzleYaw = tactical ? yaw : player.yaw;
  const muzzle = {
    x: player.x + Math.cos(muzzleYaw) * .58 + Math.sin(muzzleYaw) * .66,
    y: player.y + MUZZLE_HEIGHT,
    z: player.z + Math.sin(muzzleYaw) * .58 - Math.cos(muzzleYaw) * .66,
  };
  if (tactical) tacticalMuzzle(muzzle, player, player.posture, muzzleYaw, shape);
  const { x: fromX, y: fromY, z: fromZ } = muzzle;
  let min = CAMERA_BACK;
  const contact: ShotWorldContact = { distance: Infinity };
  let end = shotWorldLimit(ray, min, weapon.effectiveRange + CAMERA_BACK, world, contact);
  const box = player.loadout.operatorHitbox;
  const allies = context.allies?.() ?? [];
  if (tactical || world?.terrain) {
    const cover = end;
    // Aim from the shoulder camera and trace the actual shot from the low barrel toward its point of aim.
    for (let index = 0; index < h.count; index++) end = Math.min(end, enemyHit(ray, h, h.active[index], min, world));
    for (const other of context.players ?? []) {
      if (other && other !== player && other.hp > 0) end = Math.min(end, operatorHit(ray, other, min, end, tick, balance, world));
    }
    for (const ally of allies) {
      if (ally.hp > 0) end = Math.min(end, cylinderHit(ray, ally.x, ally.z, box.radius, box.height, min, end, groundHeight(world, ally.x, ally.z)));
    }
    const aimNest = targets?.intersect(ray, end);
    if (aimNest) end = Math.min(end, aimNest.distance);
    contact.distance = Infinity;
    end = tacticalShotLimit(ray, player, muzzle, player.posture, shape, end, weapon.effectiveRange, end < cover, world, contact);
    min = 0;
  } else if (world?.obstacles.some((o) => obstacleIntersection(o, player.x, fromY, player.z,
    fromX - player.x, 0, fromZ - player.z, 0, 1) <= 1)) end = min;

  let closest = -1;
  for (let index = 0; index < h.count; index++) {
    const i = h.active[index];
    const near = enemyHit(ray, h, i, min, world);
    if (near >= end) continue;
    end = near;
    closest = i;
  }
  // Friendly fire: other operators and allied convicts block and take reduced damage.
  let allyOperator: SimPlayer | undefined;
  let allyConvict: AllyTarget | undefined;
  for (const other of context.players ?? []) {
    if (!other || other === player || other.hp <= 0) continue;
    const t = operatorHit(ray, other, min, end, tick, balance, world);
    if (t >= end) continue;
    end = t;
    closest = -1;
    allyOperator = other;
  }
  for (const convict of allies) {
    if (convict.hp <= 0) continue;
    const t = cylinderHit(ray, convict.x, convict.z, box.radius, box.height, min, end, groundHeight(world, convict.x, convict.z));
    if (t >= end) continue;
    end = t;
    closest = -1;
    allyOperator = undefined;
    allyConvict = convict;
  }
  const nest = targets?.intersect(ray, end, min);
  const policy = player.loadout.damagePolicy;
  let ally: string | undefined;
  let impact: ShotImpact | undefined;
  if (nest && nest.distance < end) {
    closest = -1;
    allyOperator = allyConvict = undefined;
    end = nest.distance;
    const { amount } = resolveDamage(policy, { source: 'bullet', attacker: 'operator', target: 'structure', base: weapon.damage });
    const dealt = targets?.hit(nest.nestId, amount, tick, player.id) ?? 0;
    if (dealt > 0) impact = { kind: 'nest' };
    if (stats) { stats.hits[slot]++; stats.damage[slot] += dealt; }
  } else if (allyOperator) {
    ally = allyOperator.id;
    const { amount } = resolveDamage(policy, { source: 'bullet', attacker: 'operator', target: 'operator', base: weapon.damage });
    const dealt = damagePlayer(allyOperator, amount, tick, context.respawns ?? true, context);
    if (dealt) {
      impact = { kind: 'operator', life: allyOperator.life };
      if (stats) stats.friendlyFireDamage.bullet += dealt;
      context.events?.push({ type: 'friendly-fire', tick, attacker: player.id, target: ally, amount: dealt,
        source: 'bullet', self: false, life: allyOperator.life, direction: { x: -ray.dx, z: -ray.dz } });
    }
  } else if (allyConvict) {
    ally = allyConvict.id;
    const { amount } = resolveDamage(policy, { source: 'bullet', attacker: 'operator', target: 'convict', base: weapon.damage });
    const before = allyConvict.hp;
    allyConvict.damage(amount, tick);
    if (allyConvict.hp < before) impact = { kind: 'convict' };
    if (stats) stats.convictFriendlyDamage += before - allyConvict.hp;
  }
  const toX = ray.x + ray.dx * end, toY = ray.y + ray.dy * end, toZ = ray.z + ray.dz * end;
  const enemy = closest === -1 ? 0 : h.id[closest];
  let eliminated = false;
  if (closest !== -1) {
    const { amount } = resolveDamage(policy, { source: 'bullet', attacker: 'operator', target: 'enemy', base: weapon.damage });
    if (stats) { stats.hits[slot]++; stats.damage[slot] += Math.min(h.hp[closest], amount); }
    const x = h.x[closest], z = h.z[closest];
    const nx = toX - x, ny = toY - groundHeight(world, x, z) - ENEMY_TYPES[h.type[closest]].hitHeight, nz = toZ - z;
    const length = Math.hypot(nx, ny, nz);
    if (amount > 0) impact = { kind: 'enemy', ...(length > 1e-5 && { normal: [nx / length, ny / length, nz / length] }) };
    eliminated = damageEnemy(h, closest, amount);
  }
  if (eliminated) player.kills++;
  if (!impact && !ally && !nest && !enemy && end > min && end === contact.distance) {
    impact = { kind: 'world', surface: impactSurface(world, toX, toZ, contact.obstacle),
      normal: impactNormal(world, toX, toY, toZ, contact.obstacle) };
  }
  return {
    shooter: player.id, ...(tactical && { tactical }), fromX, fromY, fromZ, enemy, eliminated, slot,
    ...(min > 0 && { traceFrom: { x: ray.x + ray.dx * min, y: ray.y + ray.dy * min, z: ray.z + ray.dz * min } }),
    ...(nest && end === nest.distance ? { nest: nest.nestId } : {}), ...(ally ? { ally } : {}),
    toX, toY, toZ, ...(impact && { impact }),
  };
}

/** Weapon switches start with a fresh recoil state, so a pistol never inherits rifle climb. */
export function switchWeaponState(player: SimPlayer): void { resetRecoil(player.recoil); }

// ---------------------------------------------------------------------------------------------------------------
// Operator melee

/** Puts an enemy into a short stagger with bounded knockback. Returns false while it is immune. */
export function staggerEnemy(h: HordeManager, stagger: StaggerComponent, i: number, tick: number, staggerTicks: number,
  immunityTicks: number, knockbackDistance: number, dirX: number, dirZ: number): boolean {
  if (!staggerTicks || stagger.immune(h, i, tick)) return false;
  stagger.begin(h, i, tick + staggerTicks, tick + staggerTicks + immunityTicks);
  // Linear decay: the strike resolves after this tick's movement, so the impulse moves the enemy on the T - 1 ticks
  // before the stagger ends with velocities v0 × (T - k) / (T - 1). Travel = v0 / Hz × T / 2 = knockbackDistance.
  // A one-tick stagger has no movement tick and therefore no knockback.
  const v0 = staggerTicks > 1 ? 2 * knockbackDistance * NET.tickHz / staggerTicks : 0;
  h.vx[i] = dirX * v0;
  h.vz[i] = dirZ * v0;
  h.attackAt[i] = Math.max(h.attackAt[i], tick + staggerTicks);
  return true;
}

/**
 * Resolves one melee strike on its impact tick: a single primary target in a frontal cone, not through cover.
 * Enemies come from the uniform grid (bounded cell range), operators and convicts are a handful of entries.
 */
export function meleeStrike(h: HordeManager, player: SimPlayer, tick: number, world: WorldDefinition | undefined,
  context: CombatContext = {}, balance = BALANCE.movement): CombatEvent | undefined {
  if (player.hp <= 0 || !allowsPostureAction(player.posture, 'melee', balance)) return;
  const melee = player.loadout.melee;
  const box = player.loadout.operatorHitbox;
  const fx = Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const stats = context.stats?.data;
  if (stats) stats.meleeAttacks++;
  let bestScore = Infinity;
  let enemy = -1;
  let operator: SimPlayer | undefined;
  let convict: AllyTarget | undefined;
  const consider = (x: number, z: number, radius: number): number => {
    const dx = x - player.x, dz = z - player.z;
    const distance = Math.hypot(dx, dz);
    const edge = distance - radius;
    if (edge > melee.range) return Infinity;
    const facing = distance > 1e-3 ? (dx * fx + dz * fz) / distance : 1;
    if (facing < melee.arcCos && distance > radius) return Infinity;
    const score = Math.max(0, edge) + (1 - facing) * .75;
    if (score >= bestScore) return Infinity;
    if (world && !clearGroundLine(world, player.x, player.z, x, z)) return Infinity;
    return score;
  };
  const reach = melee.range + 1.2;
  const scan = (i: number) => {
    const score = consider(h.x[i], h.z[i], ENEMY_TYPES[h.type[i]].hitRadius);
    if (score === Infinity) return;
    bestScore = score; enemy = i; operator = convict = undefined;
  };
  const grid = context.grid;
  if (grid) {
    grid.rebuild(h);
    const endX = grid.cell(player.x + reach), endZ = grid.cell(player.z + reach);
    for (let z = grid.cell(player.z - reach); z <= endZ; z++) {
      for (let x = grid.cell(player.x - reach); x <= endX; x++) {
        for (let i = grid.head[z * grid.width + x]; i !== -1; i = grid.next[i]) scan(i);
      }
    }
  } else {
    for (let index = 0; index < h.count; index++) scan(h.active[index]);
  }
  for (const other of context.players ?? []) {
    if (!other || other === player || other.hp <= 0) continue;
    if (other.posture.current !== 'STANDING') {
      const shape = postureCollider(other.posture, tick, balance);
      const height = groundHeight(world, player.x, player.z) + balance.operatorMeleeHeight;
      if (height < other.y || height > other.y + shape.height) continue;
    }
    const score = consider(other.x, other.z, box.radius);
    if (score === Infinity) continue;
    bestScore = score; operator = other; enemy = -1; convict = undefined;
  }
  for (const ally of context.allies?.() ?? []) {
    if (ally.hp <= 0) continue;
    const score = consider(ally.x, ally.z, box.radius);
    if (score === Infinity) continue;
    bestScore = score; convict = ally; operator = undefined; enemy = -1;
  }
  const policy = player.loadout.damagePolicy;
  const y = player.y + Math.min(balance.operatorMeleeHeight, postureCollider(player.posture, tick, balance).height);
  const base = { tick, attacker: player.id, x: player.x, y, z: player.z, yaw: player.yaw };
  if (enemy !== -1) {
    const dx = h.x[enemy] - player.x, dz = h.z[enemy] - player.z;
    const length = Math.hypot(dx, dz) || 1;
    const id = h.id[enemy];
    const radius = Math.min(Math.hypot(dx, dz), ENEMY_TYPES[h.type[enemy]].hitRadius * .72);
    const contact = { x: h.x[enemy] - dx / length * radius, y: groundHeight(world, h.x[enemy], h.z[enemy]) + .5,
      z: h.z[enemy] - dz / length * radius };
    const { amount } = resolveDamage(policy, { source: 'melee', attacker: 'operator', target: 'enemy', base: melee.damage });
    if (stats) stats.meleeHits++;
    const eliminated = damageEnemy(h, enemy, amount);
    let staggered = false;
    if (eliminated) {
      player.kills++;
      if (stats) stats.meleeKills++;
    } else {
      staggered = !!context.stagger && staggerEnemy(h, context.stagger, enemy, tick, melee.staggerTicks, melee.staggerImmunityTicks, melee.knockbackDistance, dx / length, dz / length);
      if (staggered && stats) stats.staggers++;
    }
    return { type: 'melee', ...base, enemy: id, damage: amount, staggered, eliminated, contact: amount > 0 ? contact : undefined };
  }
  if (operator) {
    const height = postureCollider(operator.posture, tick, balance).height;
    const contact = { x: operator.x, y: Math.max(operator.y + .1, Math.min(y, operator.y + height)), z: operator.z };
    const { amount } = resolveDamage(policy, { source: 'melee', attacker: 'operator', target: 'operator', base: melee.damage });
    const dealt = damagePlayer(operator, amount, tick, context.respawns ?? true, context);
    if (dealt) {
      if (stats) stats.friendlyFireDamage.melee += dealt;
      context.events?.push({ type: 'friendly-fire', tick, attacker: player.id, target: operator.id, amount: dealt,
        source: 'melee', self: false, life: operator.life, direction: { x: player.x - operator.x, z: player.z - operator.z } });
    }
    return { type: 'melee', ...base, enemy: 0, ally: operator.id, damage: dealt, staggered: false, eliminated: false,
      contact: dealt > 0 ? contact : undefined };
  }
  if (convict) {
    const { amount } = resolveDamage(policy, { source: 'melee', attacker: 'operator', target: 'convict', base: melee.damage });
    const before = convict.hp;
    convict.damage(amount, tick);
    if (stats) stats.convictFriendlyDamage += before - convict.hp;
    const dealt = before - convict.hp;
    return { type: 'melee', ...base, enemy: 0, ally: convict.id, damage: dealt, staggered: false, eliminated: false,
      contact: dealt > 0 ? { x: convict.x, y: groundHeight(world, convict.x, convict.z) + .95, z: convict.z } : undefined };
  }
  return { type: 'melee', ...base, enemy: 0, damage: 0, staggered: false, eliminated: false };
}
