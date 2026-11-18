import { CAMERA_BACK, ENEMY_TYPES, MUZZLE_HEIGHT, NET, PLAYER, WEAPONS, aimRay, clearGroundLine, obstacleIntersection } from '@freefall/shared';
import type { AimRay, ShotEvent, WorldDefinition } from '@freefall/shared';
import type { HordeManager } from '../ecs/HordeManager.ts';
import { cancelEquipment } from '../simulation/Player.ts';
import type { SimPlayer } from '../simulation/Player.ts';

export function damageEnemy(h: HordeManager, slot: number, amount: number): boolean {
  h.hp[slot] = Math.max(0, h.hp[slot] - amount);
  if (h.hp[slot] > 0) return false;
  h.despawn(slot);
  return true;
}

export function damagePlayer(player: SimPlayer, amount: number, tick: number, respawns = true): void {
  if (player.hp <= 0 || tick < player.protectedUntil) return;
  player.hp = Math.max(0, player.hp - amount);
  if (player.hp === 0) {
    cancelEquipment(player, tick);
    player.respawnTick = respawns ? tick + NET.tickHz * PLAYER.respawnSeconds : 0;
    player.reloadUntil = 0;
    player.reloadRequested = false;
  }
}

export interface MeleeObject {
  x: number;
  z: number;
  readonly hp: number;
  damage(amount: number, tick: number): void;
}

export type SecondaryTarget = (slot: number) => MeleeObject | undefined;

export function meleeSystem(h: HordeManager, players: readonly (SimPlayer | undefined)[], tick: number, world?: WorldDefinition, respawns = true, secondary?: SecondaryTarget): void {
  for (let index = 0; index < h.count; index++) {
    const i = h.active[index];
    if (tick < h.attackAt[i]) continue;
    const player = players[h.target[i]];
    const target = player && player.hp > 0 ? player : secondary?.(i);
    if (!target || target.hp <= 0 || ('protectedUntil' in target && tick < target.protectedUntil)) continue;
    const enemy = ENEMY_TYPES[h.type[i]];
    const dx = target.x - h.x[i];
    const dz = target.z - h.z[i];
    if (dx * dx + dz * dz > enemy.meleeRange ** 2) continue;
    if (world && !clearGroundLine(world, h.x[i], h.z[i], target.x, target.z)) continue;
    h.attackAt[i] = tick + Math.ceil(enemy.meleeCooldown * NET.tickHz);
    if ('damage' in target) target.damage(enemy.meleeDamage, tick);
    else damagePlayer(target, enemy.meleeDamage, tick, respawns);
  }
}



export function updateReload(player: SimPlayer, tick: number): void {
  const requested = player.reloadRequested;
  player.reloadRequested = false;
  if (player.hp <= 0 || player.equipment.action) return;
  const gear = player.equipment;
  const weapon = WEAPONS[gear.slot];
  if (player.reloadUntil && tick >= player.reloadUntil) {
    const needed = weapon.magazineSize - player.ammo;
    const rounds = gear.slot === 'secondary' ? Math.min(gear.pistolReserve, needed) : needed;
    if (gear.slot === 'secondary') gear.pistolReserve -= rounds;
    player.ammo += rounds;
    player.reloadUntil = 0;
  }
  if (player.reloadUntil || !player.activeInput || player.ammo === weapon.magazineSize || (gear.slot === 'secondary' && !gear.pistolReserve)) return;
  if (requested || (player.ammo === 0 && player.input.fire)) player.reloadUntil = tick + Math.ceil(weapon.reloadSeconds * NET.tickHz);
}

export interface CombatTargets {
  intersect(ray: AimRay, max: number): { nestId: number; distance: number } | undefined;
  hit(nestId: number, amount: number, tick: number, shooter: string): void;
}

export function fireWeapon(h: HordeManager, player: SimPlayer, ray: AimRay, tick: number,
  world?: WorldDefinition, targets?: CombatTargets): ShotEvent | undefined {
  const weapon = WEAPONS[player.equipment.slot];
  if (player.equipment.action || !player.activeInput || !player.input.fire || player.hp <= 0 || !player.ammo || player.reloadUntil || tick < player.fireAt) return;
  player.ammo--;
  player.fireAt = tick + Math.ceil(NET.tickHz / weapon.roundsPerSecond);
  aimRay(ray, player, player.input.yaw, player.input.pitch);

  const rightX = Math.cos(player.yaw);
  const rightZ = Math.sin(player.yaw);
  const fromX = player.x + rightX * 0.58 + Math.sin(player.yaw) * 0.66;
  const fromZ = player.z + rightZ * 0.58 - Math.cos(player.yaw) * 0.66;
  let end = weapon.range + CAMERA_BACK;
  if (ray.dy < 0) end = Math.min(end, -ray.y / ray.dy);
  if (world) {
    for (const obstacle of world.obstacles) {
      end = Math.min(end, obstacleIntersection(obstacle, ray.x, ray.y, ray.z, ray.dx, ray.dy, ray.dz, CAMERA_BACK, end));
      const muzzleBlock = obstacleIntersection(obstacle, player.x, MUZZLE_HEIGHT, player.z,
        fromX - player.x, 0, fromZ - player.z, 0, 1);
      if (muzzleBlock <= 1) end = Math.min(end, CAMERA_BACK);
    }
  }
  let closest = -1;
  for (let index = 0; index < h.count; index++) {
    const i = h.active[index];
    const definition = ENEMY_TYPES[h.type[i]];
    const ox = h.x[i] - ray.x;
    const oy = definition.hitHeight - ray.y;
    const oz = h.z[i] - ray.z;
    const projection = ox * ray.dx + oy * ray.dy + oz * ray.dz;
    const inside = definition.hitRadius ** 2 - (ox * ox + oy * oy + oz * oz - projection * projection);
    if (inside < 0) continue;
    const far = projection + Math.sqrt(inside);
    if (far < CAMERA_BACK) continue;
    const near = Math.max(CAMERA_BACK, projection - Math.sqrt(inside));
    if (near >= end) continue;
    end = near;
    closest = i;
  }
  const nest = targets?.intersect(ray, end);
  if (nest && nest.distance < end) {
    closest = -1;
    end = nest.distance;
    targets?.hit(nest.nestId, weapon.damage, tick, player.id);
  }
  const enemy = closest === -1 ? 0 : h.id[closest];
  const eliminated = closest !== -1 && damageEnemy(h, closest, weapon.damage);
  if (eliminated) player.kills++;
  return {
    shooter: player.id, fromX, fromY: MUZZLE_HEIGHT, fromZ, enemy, eliminated, ...(nest && end === nest.distance ? { nest: nest.nestId } : {}),
    toX: ray.x + ray.dx * end, toY: ray.y + ray.dy * end, toZ: ray.z + ray.dz * end,
  };
}
