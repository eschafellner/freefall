import { obstacleIntersection, openGround } from '@freefall/shared';
import type { PositionXZ, WorldDefinition } from '@freefall/shared';

const CELL = 5;
const CACHE_LIMIT = 48;

export class GroundNavigation {
  private readonly width: number;
  private readonly blocked: Uint8Array;
  private readonly queue: Int16Array;
  private readonly fields = new Map<number, Int16Array>();
  private readonly world: WorldDefinition;

  constructor(world: WorldDefinition) {
    this.world = world;
    this.width = Math.ceil(world.half * 2 / CELL);
    this.blocked = new Uint8Array(this.width ** 2);
    this.queue = new Int16Array(this.blocked.length);
    for (let cell = 0; cell < this.blocked.length; cell++) {
      this.blocked[cell] = Number(!openGround(world, this.x(cell), this.z(cell), CELL * .5 + .4));
    }
  }

  private x(cell: number): number { return (cell % this.width + .5) * CELL - this.world.half; }
  private z(cell: number): number { return (Math.floor(cell / this.width) + .5) * CELL - this.world.half; }

  private cell(x: number, z: number): number {
    const col = Math.min(this.width - 1, Math.max(0, Math.floor((x + this.world.half) / CELL)));
    const row = Math.min(this.width - 1, Math.max(0, Math.floor((z + this.world.half) / CELL)));
    return col + row * this.width;
  }

  private visible(x: number, z: number, toX: number, toZ: number): boolean {
    for (const obstacle of this.world.obstacles) {
      if (Math.max(x, toX) < obstacle.x - obstacle.halfX - .43 ||
          Math.min(x, toX) > obstacle.x + obstacle.halfX + .43 ||
          Math.max(z, toZ) < obstacle.z - obstacle.halfZ - .43 ||
          Math.min(z, toZ) > obstacle.z + obstacle.halfZ + .43) continue;
      if (obstacleIntersection(obstacle, x, .5, z, toX - x, 0, toZ - z, 0, 1, .37) <= 1) return false;
    }
    return true;
  }

  private nearby(x: number, z: number, field?: Int16Array): number {
    const origin = this.cell(x, z);
    let best = -1;
    let cost = Infinity;
    const col = origin % this.width;
    const row = Math.floor(origin / this.width);
    for (let r = Math.max(0, row - 2); r <= Math.min(row + 2, this.width - 1); r++) {
      for (let c = Math.max(0, col - 2); c <= Math.min(col + 2, this.width - 1); c++) {
        const cell = c + r * this.width;
        if (this.blocked[cell] || (field && field[cell] < 0)) continue;
        const score = Math.hypot(this.x(cell) - x, this.z(cell) - z) + (field?.[cell] ?? 0) * CELL;
        if (score >= cost || !this.visible(x, z, this.x(cell), this.z(cell))) continue;
        best = cell;
        cost = score;
      }
    }
    return best;
  }

  private field(goal: number): Int16Array {
    const existing = this.fields.get(goal);
    if (existing) return existing;
    if (this.fields.size === CACHE_LIMIT) this.fields.delete(this.fields.keys().next().value!);
    const distances = new Int16Array(this.blocked.length).fill(-1);
    const width = this.width;
    let tail = 1;
    this.queue[0] = goal;
    distances[goal] = 0;
    for (let head = 0; head < tail; head++) {
      const cell = this.queue[head];
      const col = cell % width;
      const cost = distances[cell] + 1;
      for (let direction = 0; direction < 4; direction++) {
        if ((direction === 0 && col === 0) || (direction === 1 && col === width - 1)) continue;
        const next = cell + (direction === 0 ? -1 : direction === 1 ? 1 : direction === 2 ? -width : width);
        if (next < 0 || next >= distances.length || distances[next] !== -1 || this.blocked[next]) continue;
        distances[next] = cost;
        this.queue[tail++] = next;
      }
    }
    this.fields.set(goal, distances);
    return distances;
  }

  steer(x: number, z: number, output: PositionXZ): void {
    const toX = output.x;
    const toZ = output.z;
    if (this.visible(x, z, toX, toZ)) return;
    let goal = this.cell(toX, toZ);
    if (this.blocked[goal]) goal = this.nearby(toX, toZ);
    if (goal === -1) return;
    const field = this.field(goal);
    const current = this.cell(x, z);
    let next = -1;
    if (field[current] <= 0) {
      next = this.nearby(x, z, field);
    } else {
      const col = current % this.width;
      let cost = field[current];
      const width = this.width;
      for (let direction = 0; direction < 4; direction++) {
        if ((direction === 0 && col === 0) || (direction === 1 && col === width - 1)) continue;
        const cell = current + (direction === 0 ? -1 : direction === 1 ? 1 : direction === 2 ? -width : width);
        if (field[cell] >= 0 && field[cell] < cost && this.visible(x, z, this.x(cell), this.z(cell))) {
          next = cell;
          cost = field[cell];
        }
      }
    }
    if (next === -1) return;
    output.x = this.x(next);
    output.z = this.z(next);
  }
}
