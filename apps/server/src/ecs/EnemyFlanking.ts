import { MAX_ENEMIES } from '@freefall/shared';
import type { EnemyTraits, PositionXZ } from '@freefall/shared';
import type { SimPlayer } from '../simulation/Player.ts';
import type { HordeManager } from './HordeManager.ts';

/** Largest bearing change per steering update while circling (rad). */
const ARC_STEP = .75;
/** Bearing relative to the operator's facing that the flanker aims for (rad, about 125°). */
const FLANK_BEARING = 2.2;

/**
 * Flanking state per horde slot for archetypes with `tactics: 'flank'` (the hunter). A flanker circles the operator at
 * `flank.radius` toward the side and rear and commits to the attack once it is outside the operator's frontal cone,
 * very close, or has just taken damage. A committed flanker that drifts far away circles again. Entries are only valid
 * while the slot holds the same enemy id.
 */
export class EnemyFlanking {
  private readonly owner = new Uint32Array(MAX_ENEMIES);
  private readonly side = new Int8Array(MAX_ENEMIES);
  private readonly lastHp = new Float32Array(MAX_ENEMIES);
  private readonly hitAt = new Int32Array(MAX_ENEMIES);
  private readonly committedFlag = new Uint8Array(MAX_ENEMIES);
  private readonly targets: (SimPlayer | undefined)[] = Array(MAX_ENEMIES);
  circling = 0;
  commits = 0;

  private claim(h: HordeManager, slot: number): void {
    if (this.owner[slot] === h.id[slot]) return;
    this.owner[slot] = h.id[slot];
    this.side[slot] = 0;
    this.lastHp[slot] = h.hp[slot];
    this.hitAt[slot] = -1;
    this.committedFlag[slot] = 0;
    this.targets[slot] = undefined;
  }

  /** True once the flanker may strike (always true for slots this component does not track). */
  committed(h: HordeManager, slot: number): boolean {
    return this.owner[slot] !== h.id[slot] || this.committedFlag[slot] === 1;
  }

  /**
   * Updates the flank of `slot` against `target` and writes the circling goal. Returns false when the flanker has
   * committed and should approach directly.
   */
  goal(h: HordeManager, slot: number, target: SimPlayer, traits: EnemyTraits, tick: number, output: PositionXZ): boolean {
    const flank = traits.flank;
    if (!flank) return false;
    this.claim(h, slot);
    if (h.hp[slot] < this.lastHp[slot]) this.hitAt[slot] = tick;
    this.lastHp[slot] = h.hp[slot];
    if (this.targets[slot] !== target) {
      this.targets[slot] = target;
      this.committedFlag[slot] = 0;
      this.side[slot] = 0;
    }
    const rx = h.x[slot] - target.x, rz = h.z[slot] - target.z;
    const distance = Math.hypot(rx, rz);
    if (this.committedFlag[slot] && distance > flank.radius * 1.7) this.committedFlag[slot] = 0;
    if (this.committedFlag[slot]) return false;
    const fx = Math.sin(target.yaw), fz = -Math.cos(target.yaw);
    const bearingCos = distance > 1e-4 ? (rx * fx + rz * fz) / distance : 1;
    const recentlyHit = this.hitAt[slot] >= 0 && tick - this.hitAt[slot] <= flank.abortAfterHitTicks;
    if (distance <= flank.abortDistance || bearingCos <= flank.sideCos || recentlyHit) {
      this.committedFlag[slot] = 1;
      this.commits++;
      return false;
    }
    if (!this.side[slot]) this.side[slot] = fx * rz - fz * rx >= 0 ? 1 : -1;
    const current = Math.atan2(rz, rx);
    const wanted = Math.atan2(fz, fx) + this.side[slot] * FLANK_BEARING;
    let delta = wanted - current;
    delta -= Math.round(delta / (2 * Math.PI)) * 2 * Math.PI;
    const bearing = current + Math.max(-ARC_STEP, Math.min(ARC_STEP, delta));
    output.x = target.x + Math.cos(bearing) * flank.radius;
    output.z = target.z + Math.sin(bearing) * flank.radius;
    this.circling++;
    return true;
  }

  clear(): void { this.owner.fill(0); this.committedFlag.fill(0); this.targets.fill(undefined); }
}
