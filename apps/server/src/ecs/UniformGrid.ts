import { ARENA_HALF, MAX_ENEMIES } from '@freefall/shared';
import type { HordeManager } from './HordeManager.ts';

export const CELL_SIZE = 1.9;

export class UniformGrid {
  readonly width: number;
  readonly head: Int16Array;
  private readonly half: number;
  readonly next = new Int16Array(MAX_ENEMIES);

  constructor(half: number = ARENA_HALF) {
    this.half = half;
    this.width = Math.ceil(half * 2 / CELL_SIZE);
    this.head = new Int16Array(this.width ** 2);
  }

  cell(position: number): number {
    return Math.max(0, Math.min(this.width - 1, Math.floor((position + this.half) / CELL_SIZE)));
  }

  rebuild(horde: HordeManager): void {
    this.head.fill(-1);
    for (let index = 0; index < horde.count; index++) {
      const i = horde.active[index];
      const cell = this.cell(horde.x[i]) + this.width * this.cell(horde.z[i]);
      this.next[i] = this.head[cell];
      this.head[cell] = i;
    }
  }
}
