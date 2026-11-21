import { ARENA_HALF, MAX_ENEMIES } from '@freefall/shared';
import type { HordeManager } from './HordeManager.ts';

export const CELL_SIZE = 1.9;

export class UniformGrid {
  readonly width: number;
  readonly head: Int16Array;
  private readonly half: number;
  readonly next = new Int16Array(MAX_ENEMIES);
  readonly neighbors = new Int16Array(MAX_ENEMIES);
  readonly distances = new Float32Array(MAX_ENEMIES);
  contactX = 0;
  contactZ = 0;

  constructor(half: number = ARENA_HALF) {
    this.half = half;
    this.width = Math.ceil(half * 2 / CELL_SIZE);
    this.head = new Int16Array(this.width ** 2);
  }

  cell(position: number): number {
    return Math.max(0, Math.min(this.width - 1, Math.floor((position + this.half) / CELL_SIZE)));
  }

  rebuild(horde: HordeManager, tick = 0): void {
    this.head.fill(-1);
    // Rotate dense-list insertion order so oversubscribed cells expose different contacts over time.
    let index = horde.count > 0 ? ((Math.imul(tick, 31) >>> 0) % horde.count) : 0;
    for (let remaining = horde.count; remaining > 0; remaining--) {
      this.insert(horde, horde.active[index]);
      if (++index === horde.count) index = 0;
    }
  }

  insert(horde: HordeManager, slot: number): void {
    const cell = this.cell(horde.x[slot]) + this.width * this.cell(horde.z[slot]);
    this.next[slot] = this.head[cell];
    this.head[cell] = slot;
  }

  overlaps(horde: HordeManager, x: number, z: number, radius: number): boolean {
    const left = this.cell(x - radius), right = this.cell(x + radius), bottom = this.cell(z + radius);
    for (let row = this.cell(z - radius); row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        for (let slot = this.head[row * this.width + col]; slot !== -1; slot = this.next[slot]) {
          if ((x - horde.x[slot]) ** 2 + (z - horde.z[slot]) ** 2 < radius ** 2) return true;
        }
      }
    }
    return false;
  }

  /** Bounded sample of nearby slots, ordered by distance. The scratch buffers belong to this grid. */
  nearby(horde: HordeManager, slot: number, radius: number, perCell: number, limit: number): number {
    const x = horde.x[slot], z = horde.z[slot], r2 = radius * radius;
    const right = this.cell(x + radius), bottom = this.cell(z + radius), left = this.cell(x - radius);
    let count = 0;
    for (let row = this.cell(z - radius); row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        let other = this.head[row * this.width + col];
        for (let sampled = 0; other !== -1 && sampled < perCell; sampled++, other = this.next[other]) {
          if (other === slot) continue;
          const d2 = (x - horde.x[other]) ** 2 + (z - horde.z[other]) ** 2;
          if (d2 >= r2 || (count === limit && d2 >= this.distances[count - 1])) continue;
          let at = Math.min(count, limit - 1);
          while (at && d2 < this.distances[at - 1]) {
            this.neighbors[at] = this.neighbors[at - 1];
            this.distances[at] = this.distances[at - 1];
            at--;
          }
          this.neighbors[at] = other;
          this.distances[at] = d2;
          count = Math.min(count + 1, limit);
        }
      }
    }
    return count;
  }

  /** Fraction of the step before contact. Existing penetrations are allowed to open up. */
  contactFraction(horde: HordeManager, slot: number, dx: number, dz: number, diameter: number, perCell: number): number {
    const x = horde.x[slot], z = horde.z[slot];
    const step2 = dx * dx + dz * dz, diameter2 = diameter * diameter;
    const reachX = diameter + Math.abs(dx), reachZ = diameter + Math.abs(dz);
    // The grid was built before integration. Include the largest step of a nearby regular agent.
    const padding = diameter + Math.sqrt(step2) + diameter;
    const left = this.cell(x - padding), right = this.cell(x + padding), bottom = this.cell(z + padding);
    let fraction = 1;
    for (let row = this.cell(z - padding); row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        let other = this.head[row * this.width + col];
        for (let sampled = 0; other !== -1 && sampled < perCell; sampled++, other = this.next[other]) {
          if (other === slot) continue;
          const rx = x - horde.x[other], rz = z - horde.z[other];
          // Outside the swept contact box, the quadratic cannot yield a collision.
          if (Math.abs(rx) > reachX || Math.abs(rz) > reachZ) continue;
          const approach = rx * dx + rz * dz;
          if (approach >= 0) continue;
          const clearance = rx * rx + rz * rz - diameter2;
          if (clearance <= 0) {
            this.contactX = rx;
            this.contactZ = rz;
            return 0;
          }
          const discriminant = approach * approach - step2 * clearance;
          if (discriminant <= 0) continue;
          const contact = clearance / (-approach + Math.sqrt(discriminant));
          if (contact >= fraction) continue;
          fraction = contact;
          this.contactX = rx + dx * contact;
          this.contactZ = rz + dz * contact;
        }
      }
    }
    return fraction;
  }
}
