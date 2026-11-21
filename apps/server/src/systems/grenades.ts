import { ARENA_HALF, BALANCE, BASE_LOADOUT, MUZZLE_HEIGHT, NET, clearGroundLine, groundHeight, impactNormal,
  impactSurface, obstacleIntersection, postureCollider, terrainIntersection } from '@freefall/shared';
import type { DamagePolicy, EffectiveGrenade, ExplosionEvent, GrenadeState, Obstacle, WorldDefinition } from '@freefall/shared';
import type { HordeManager } from '../ecs/HordeManager.ts';
import type { UniformGrid } from '../ecs/UniformGrid.ts';
import type { SimPlayer } from '../simulation/Player.ts';
import { damageEnemy, damagePlayer } from './combat.ts';
import type { CombatContext } from './combat.ts';
import { resolveDamage } from './damage.ts';

interface Projectile extends GrenadeState {
  owner: string;
  vx: number;
  vy: number;
  vz: number;
  resting: boolean;
  definition: EffectiveGrenade;
  release: NonNullable<GrenadeState['release']>;
  obstacle?: Obstacle;
}

/**
 * Linear falloff from `baseDamage` at the center to zero at `blastRadius`. Cover blocks the blast: the ground line
 * from the detonation to the target must not cross a solid obstacle (same test as enemy melee line of sight).
 */
export function blastDamage(g: GrenadeState, x: number, y: number, z: number, world?: WorldDefinition,
  grenade: EffectiveGrenade = BASE_LOADOUT.grenade): number {
  const distance = Math.hypot(x - g.x, y - g.y, z - g.z);
  if (distance >= grenade.blastRadius || (world && !clearGroundLine(world, g.x, g.z, x, z))) return 0;
  return Math.round(grenade.baseDamage * (1 - distance / grenade.blastRadius));
}

/** Blast damage against a structure, e.g. a swarm nest, including its structure multiplier (central resolver). */
export function structureBlastDamage(g: GrenadeState, structureId: string, x: number, z: number, world: WorldDefinition | undefined,
  grenade: EffectiveGrenade, policy?: DamagePolicy): number | undefined {
  const damage = blastDamage(g, x, groundHeight(world, x, z) + .5, z, world, grenade);
  if (!damage) return;
  const structureMultiplier = grenade.structureDamageMultipliers[structureId] ?? 1;
  if (!policy) return Math.round(damage * structureMultiplier);
  return resolveDamage(policy, { source: 'explosion', attacker: 'operator', target: 'structure', base: damage, structureMultiplier }).amount;
}

export class Grenades {
  private readonly items: Projectile[] = [];
  private serial = 0;

  launch(player: SimPlayer, tick: number, context: CombatContext = {}, balance = BALANCE.movement): void {
    if (context.stats) context.stats.data.grenadesThrown++;
    const definition = player.loadout.grenade;
    const toss = definition.throw;
    const angle = Math.max(toss.minPitch, player.pitch + toss.pitchOffset);
    const speed = Math.cos(angle) * toss.speed;
    const crouchOffset = player.posture.current === 'CROUCHING' ? balance.colliders.CROUCHING.muzzleHeight - MUZZLE_HEIGHT : 0;
    const release = { tick, x: player.x, y: player.y + Math.max(.15, toss.releaseHeight + crouchOffset), z: player.z };
    const id = ++this.serial;
    this.items.push({ x: release.x, y: release.y, z: release.z, id, owner: player.id, release,
      vx: Math.sin(player.yaw) * speed, vz: -Math.cos(player.yaw) * speed, vy: Math.sin(angle) * toss.speed,
      resting: false, detonates: tick + definition.fuseTicks, definition });
    context.events?.push({ type: 'grenade-release', id, owner: player.id, ...release });
  }

  private advance(g: Projectile, world?: WorldDefinition): void {
    const dt = 1 / NET.tickHz;
    g.vy -= g.definition.throw.gravity * dt;
    const dx = g.vx * dt, dy = g.vy * dt, dz = g.vz * dt;
    const half = world?.half ?? ARENA_HALF;
    let fraction = Math.min(1, terrainIntersection(world, g.x, g.y, g.z, dx, dy, dz, 0, 1, .09));
    for (const obstacle of world?.obstacles ?? []) {
      const hit = obstacleIntersection(obstacle, g.x, g.y, g.z, dx, dy, dz, 0, fraction, .075);
      if (hit < fraction) g.obstacle = obstacle;
      fraction = Math.min(fraction, hit);
    }
    const step = Math.max(0, fraction - (fraction < 1 ? .002 : 0));
    g.x = Math.max(-half, Math.min(half, g.x + dx * step));
    g.z = Math.max(-half, Math.min(half, g.z + dz * step));
    const base = groundHeight(world, g.x, g.z);
    g.y = Math.max(base + .09, g.y + dy * step);
    // Contact stops horizontal travel. A wall impact drops to the ground on subsequent ticks.
    if (fraction < 1 || Math.max(Math.abs(g.x), Math.abs(g.z)) >= half) {
      g.vx = g.vz = 0;
      g.vy = Math.min(g.vy, 0);
      g.resting = g.y <= base + .10 || (dx === 0 && dz === 0 && fraction < 1);
    }
  }

  private contact(g: Projectile, world?: WorldDefinition): ExplosionEvent['contact'] {
    // A canister that slid along a solid uses that surface only while it is still adjacent to it.
    const { x, y, z, obstacle } = g;
    if (obstacle && obstacleIntersection(obstacle, x, y, z, 0, 0, 0, 0, 1, .13, .045) === 0) {
      return { surface: impactSurface(world, x, z, obstacle), normal: impactNormal(world, x, y, z, obstacle) };
    }
    if (y - groundHeight(world, x, z) <= .18) {
      return { surface: impactSurface(world, x, z), normal: impactNormal(world, x, y, z) };
    }
  }

  update(tick: number, horde: HordeManager, grid: UniformGrid, world: WorldDefinition | undefined,
    players: readonly (SimPlayer | undefined)[], onBlast: (g: GrenadeState, owner: string, grenade: EffectiveGrenade) => void,
    context: CombatContext = {}, balance = BALANCE.movement): void {
    let indexed = false;
    for (let n = this.items.length - 1; n >= 0; n--) {
      const g = this.items[n];
      if (tick > g.detonates + NET.tickHz / 2) {
        this.items.splice(n, 1);
      } else if (tick < g.detonates) {
        if (!g.resting) this.advance(g, world);
      } else if (tick === g.detonates) {
        const started = performance.now();
        if (!indexed) { grid.rebuild(horde); indexed = true; }
        const owner = players.find((p) => p?.id === g.owner);
        const radius = g.definition.blastRadius;
        const stats = context.stats?.data;
        // Bounded query: only grid cells overlapping the blast radius, never the whole horde.
        const endX = grid.cell(g.x + radius), endZ = grid.cell(g.z + radius);
        for (let z = grid.cell(g.z - radius); z <= endZ; z++) {
          for (let x = grid.cell(g.x - radius); x <= endX; x++) {
            for (let i = grid.head[z * grid.width + x]; i !== -1; i = grid.next[i]) {
              if (!horde.hp[i]) continue;
              const damage = blastDamage(g, horde.x[i], groundHeight(world, horde.x[i], horde.z[i]) + .5, horde.z[i], world, g.definition);
              if (!damage) continue;
              const before = horde.hp[i];
              const killed = damageEnemy(horde, i, damage);
              if (stats) {
                stats.grenadeDamageEnemies += Math.min(before, damage);
                if (killed) stats.grenadeKills++;
              }
              if (killed && owner) owner.kills++;
            }
          }
        }
        const policy = owner?.loadout.damagePolicy ?? context.policy;
        if (policy) {
          for (const player of players) {
            if (!player || player.hp <= 0) continue;
            const height = player.posture.current === 'STANDING' ? .5 : postureCollider(player.posture, tick, balance).height * .5;
            const base = blastDamage(g, player.x, player.y + height, player.z, world, g.definition);
            if (!base) continue;
            const self = player.id === g.owner;
            const { amount } = resolveDamage(policy, { source: 'explosion', attacker: 'operator', target: 'operator', self, base });
            const dealt = damagePlayer(player, amount, tick, context.respawns ?? true, context);
            if (!dealt) continue;
            if (stats) {
              if (self) stats.selfDamage += dealt;
              else stats.friendlyFireDamage.explosion += dealt;
            }
            context.events?.push({ type: 'friendly-fire', tick, attacker: g.owner, target: player.id, amount: dealt,
              source: 'explosion', self, life: player.life, direction: { x: g.x - player.x, z: g.z - player.z } });
          }
          for (const convict of context.allies?.() ?? []) {
            if (convict.hp <= 0) continue;
            const base = blastDamage(g, convict.x, groundHeight(world, convict.x, convict.z) + .5, convict.z, world, g.definition);
            if (!base) continue;
            const before = convict.hp;
            convict.damage(resolveDamage(policy, { source: 'explosion', attacker: 'operator', target: 'convict', base }).amount, tick);
            if (stats) stats.convictFriendlyDamage += before - convict.hp;
          }
        }
        onBlast(g, g.owner, g.definition);
        context.events?.push({ type: 'blast', tick, id: g.id, x: g.x, y: g.y, z: g.z, radius, owner: g.owner,
          grenade: g.definition.id, contact: this.contact(g, world) });
        if (stats) {
          const elapsed = performance.now() - started;
          stats.blasts++;
          stats.blastQueryMsTotal += elapsed;
          stats.blastQueryMsMax = Math.max(stats.blastQueryMsMax, elapsed);
        }
      }
    }
  }

  clear(): void { this.items.length = 0; }

  snapshot(tick?: number): GrenadeState[] | undefined {
    if (this.items.length) return this.items.map(({ id, x, y, z, detonates, release }) => ({
      id, x, y, z, detonates,
      ...(tick !== undefined && tick - release.tick <= 6 && { release }),
    }));
  }
}
