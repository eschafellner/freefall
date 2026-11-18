import { ENEMY_TYPES, MAX_ENEMIES } from '@freefall/shared';

export class HordeManager {
  readonly x = new Float32Array(MAX_ENEMIES);
  readonly z = new Float32Array(MAX_ENEMIES);
  readonly vx = new Float32Array(MAX_ENEMIES);
  readonly vz = new Float32Array(MAX_ENEMIES);
  readonly yaw = new Float32Array(MAX_ENEMIES);
  readonly hp = new Float32Array(MAX_ENEMIES);
  readonly target = new Int8Array(MAX_ENEMIES).fill(-1);
  readonly type = new Uint8Array(MAX_ENEMIES);
  readonly id = new Uint32Array(MAX_ENEMIES);
  readonly attackAt = new Uint32Array(MAX_ENEMIES);
  readonly active = new Uint16Array(MAX_ENEMIES);
  private readonly denseIndex = new Int16Array(MAX_ENEMIES).fill(-1);
  private readonly free = Uint16Array.from({ length: MAX_ENEMIES }, (_, i) => MAX_ENEMIES - 1 - i);
  private serial = 0;
  count = 0;

  spawn(x: number, z: number, type: number): number {
    if (this.count === MAX_ENEMIES || !ENEMY_TYPES[type]) return -1;
    const i = this.free[MAX_ENEMIES - 1 - this.count];
    this.id[i] = ++this.serial;
    this.x[i] = x;
    this.z[i] = z;
    this.vx[i] = this.vz[i] = this.yaw[i] = 0;
    this.hp[i] = ENEMY_TYPES[type].health;
    this.type[i] = type;
    this.target[i] = -1;
    this.attackAt[i] = 0;
    this.active[this.count] = i;
    this.denseIndex[i] = this.count++;
    return i;
  }

  despawn(i: number): void {
    const index = this.denseIndex[i];
    if (index === undefined || index < 0) return;
    const tail = this.active[--this.count];
    this.active[index] = tail;
    this.denseIndex[tail] = index;
    this.denseIndex[i] = -1;
    this.free[MAX_ENEMIES - 1 - this.count] = i;
  }
}
