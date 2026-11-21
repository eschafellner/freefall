import { MAX_PLAYERS } from '@freefall/shared';
import type { EnemyGameplay, MissionBalance, PositionXZ } from '@freefall/shared';
import type { GroundNavigation } from '../mission/GroundNavigation.ts';
import type { SimPlayer } from '../simulation/Player.ts';
import { validOperator } from '../systems/enemyTargeting.ts';
import type { EnemyNavigation } from './EnemyNavigation.ts';
import type { HordeManager } from './HordeManager.ts';

const FULL_TURN = 2 * Math.PI;

export class EnemyApproach {
  private readonly occupancy: Uint16Array;
  private readonly reservations: Uint32Array;
  private readonly directions: PositionXZ[];
  private readonly sectors: number;
  private readonly config: MissionBalance['hordeAi'];

  constructor(config: MissionBalance['hordeAi'], baseReach: number) {
    this.config = config;
    const circumference = FULL_TURN * baseReach * config.attackRingFraction;
    this.sectors = Math.min(32, Math.max(3, Math.floor(circumference / config.attackSpacing)));
    this.occupancy = new Uint16Array(MAX_PLAYERS * this.sectors);
    this.reservations = new Uint32Array(this.occupancy.length);
    this.directions = Array.from({ length: this.sectors }, (_, i) => {
      const angle = i * FULL_TURN / this.sectors;
      return { x: Math.cos(angle), z: Math.sin(angle) };
    });
  }

  private sector(x: number, z: number): number {
    return (Math.round(Math.atan2(z, x) * this.sectors / FULL_TURN) + this.sectors) % this.sectors;
  }

  reserve(target: SimPlayer, x: number, z: number, id: number): number {
    const index = target.slot * this.sectors + this.sector(x - target.x, z - target.z);
    if (this.reservations[index]) return -1;
    this.reservations[index] = id;
    return index;
  }

  release(index: number): void {
    if (index >= 0) this.reservations[index] = 0;
  }

  rebuild(horde: HordeManager, players: readonly (SimPlayer | undefined)[], stats: readonly EnemyGameplay[]): void {
    this.occupancy.fill(0);
    for (let index = 0; index < horde.count; index++) {
      const slot = horde.active[index], target = players[horde.target[slot]];
      if (!validOperator(target)) continue;
      const dx = horde.x[slot] - target.x, dz = horde.z[slot] - target.z;
      const radius = stats[horde.type[slot]].meleeRange + this.config.separationRadius;
      if (dx * dx + dz * dz >= radius * radius) continue;
      this.occupancy[target.slot * this.sectors + this.sector(dx, dz)]++;
    }
  }

  choose(horde: HordeManager, slot: number, target: SimPlayer, reach: number, limit: number, goal: PositionXZ,
    navigation: EnemyNavigation, planner?: GroundNavigation): void {
    const x = horde.x[slot], z = horde.z[slot];
    const dx = x - target.x, dz = z - target.z;
    if (dx * dx + dz * dz > this.config.approachRange ** 2) {
      navigation.attackSector[slot] = -1;
      return;
    }
    const radius = reach * this.config.attackRingFraction;
    const current = navigation.attackSector[slot];
    const previous = navigation.repositionSector[slot];
    const base = target.slot * this.sectors;
    if (current >= 0) {
      const point = this.directions[current];
      const px = target.x + point.x * radius, pz = target.z + point.z * radius;
      if (!this.reservations[base + current] && this.usable(x, z, px, pz, target, limit, planner)) {
        goal.x = px;
        goal.z = pz;
        return;
      }
    }

    const occupied = dx * dx + dz * dz < (reach + this.config.separationRadius) ** 2;
    const ownSector = occupied ? this.sector(dx, dz) : -1;
    const first = horde.id[slot] % this.sectors;
    let best = -1, score = Infinity, bestX = goal.x, bestZ = goal.z;
    for (let i = 0; i < this.sectors; i++) {
      const sector = (first + i) % this.sectors;
      const point = this.directions[sector];
      const px = target.x + point.x * radius, pz = target.z + point.z * radius;
      const others = this.occupancy[base + sector] - Number(sector === ownSector);
      const cost = (px - x) ** 2 + (pz - z) ** 2 + others * this.config.attackSpacing ** 2 +
        Number(sector === previous || this.reservations[base + sector] !== 0) * radius ** 2;
      if (cost >= score || !this.usable(x, z, px, pz, target, limit, planner)) continue;
      score = cost;
      best = sector;
      bestX = px;
      bestZ = pz;
    }
    navigation.attackSector[slot] = best;
    if (best >= 0) navigation.repositionSector[slot] = -1;
    goal.x = bestX;
    goal.z = bestZ;
  }

  private usable(x: number, z: number, px: number, pz: number, target: SimPlayer, limit: number, planner?: GroundNavigation): boolean {
    if (Math.max(Math.abs(px), Math.abs(pz)) > limit) return false;
    return !planner || (planner.visible(px, pz, target.x, target.z) && planner.visible(x, z, px, pz));
  }
}
