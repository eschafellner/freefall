import { ARENA_HALF, FRAG, NET, clearGroundLine, obstacleIntersection } from '@freefall/shared';
import type { GrenadeState, WorldDefinition } from '@freefall/shared';
import type { HordeManager } from '../ecs/HordeManager.ts';
import type { UniformGrid } from '../ecs/UniformGrid.ts';
import type { SimPlayer } from '../simulation/Player.ts';
import { damageEnemy } from './combat.ts';

interface Projectile extends GrenadeState {
  owner: string;
  vx: number;
  vy: number;
  vz: number;
  resting: boolean;
}

export function blastDamage(g: GrenadeState, x: number, y: number, z: number, world?: WorldDefinition): number {
  const distance = Math.hypot(x - g.x, y - g.y, z - g.z);
  if (distance >= FRAG.radius || (world && !clearGroundLine(world, g.x, g.z, x, z))) return 0;
  return Math.round(FRAG.damage * (1 - distance / FRAG.radius));
}

export class Grenades {
  private readonly items: Projectile[] = [];
  private serial = 0;

  launch(player: SimPlayer, tick: number): void {
    const angle = Math.max(-.35, player.pitch + .34);
    const speed = Math.cos(angle) * 13;
    this.items.push({ id: ++this.serial, owner: player.id, x: player.x, y: 1.35, z: player.z,
      vx: Math.sin(player.yaw) * speed, vz: -Math.cos(player.yaw) * speed, vy: Math.sin(angle) * 13,
      resting: false, detonates: tick + Math.ceil(FRAG.fuseSeconds * NET.tickHz) });
  }

  private advance(g: Projectile, world?: WorldDefinition): void {
    const dt = 1 / NET.tickHz;
    g.vy -= 13 * dt;
    const dx = g.vx * dt, dy = g.vy * dt, dz = g.vz * dt;
    const half = world?.half ?? ARENA_HALF;
    let fraction = dy < 0 ? Math.min(1, (.09 - g.y) / dy) : 1;
    for (const obstacle of world?.obstacles ?? []) {
      fraction = Math.min(fraction, obstacleIntersection(obstacle, g.x, g.y, g.z, dx, dy, dz, 0, fraction, .075));
    }
    const step = Math.max(0, fraction - (fraction < 1 ? .002 : 0));
    g.x = Math.max(-half, Math.min(half, g.x + dx * step));
    g.z = Math.max(-half, Math.min(half, g.z + dz * step));
    g.y = Math.max(.09, g.y + dy * step);
    // Contact stops horizontal travel. A wall impact drops to the ground on subsequent ticks.
    if (fraction < 1 || Math.max(Math.abs(g.x), Math.abs(g.z)) >= half) {
      g.vx = g.vz = 0;
      g.vy = Math.min(g.vy, 0);
      g.resting = g.y <= .10 || (dx === 0 && dz === 0 && fraction < 1);
    }
  }

  update(tick: number, horde: HordeManager, grid: UniformGrid, world: WorldDefinition | undefined,
    players: readonly (SimPlayer | undefined)[], onBlast: (g: GrenadeState, owner: string) => void): void {
    let indexed = false;
    for (let n = this.items.length - 1; n >= 0; n--) {
      const g = this.items[n];
      if (tick > g.detonates + NET.tickHz / 2) {
        this.items.splice(n, 1);
      } else if (tick < g.detonates) {
        if (!g.resting) this.advance(g, world);
      } else if (tick === g.detonates) {
        if (!indexed) { grid.rebuild(horde); indexed = true; }
        const owner = players.find((p) => p?.id === g.owner);
        const endX = grid.cell(g.x + FRAG.radius), endZ = grid.cell(g.z + FRAG.radius);
        for (let z = grid.cell(g.z - FRAG.radius); z <= endZ; z++) {
          for (let x = grid.cell(g.x - FRAG.radius); x <= endX; x++) {
            for (let i = grid.head[z * grid.width + x]; i !== -1; i = grid.next[i]) {
              if (!horde.hp[i]) continue;
              const damage = blastDamage(g, horde.x[i], .5, horde.z[i], world);
              if (damage && damageEnemy(horde, i, damage) && owner) owner.kills++;
            }
          }
        }
        onBlast(g, g.owner);
      }
    }
  }

  clear(): void { this.items.length = 0; }

  snapshot(): GrenadeState[] | undefined {
    if (this.items.length) return this.items.map(({ id, x, y, z, detonates }) => ({ id, x, y, z, detonates }));
  }
}
