import { HORDE_SIZES } from '@freefall/shared';
import type { HordeSize, ShotEvent } from '@freefall/shared';
import { Battlefield } from './Battlefield.ts';
import { AI, despawnSystem, spawnSystem } from '../systems/horde.ts';

export { seededRandom } from './Battlefield.ts';

export class Arena extends Battlefield {
  private refillAt = 0;
  /** Grenade and melee kills seen so far (shots report their kills through `onShot`). */
  private otherKills = 0;
  desired: HordeSize;

  constructor(seed: number, desired: HordeSize = 100) {
    super(seed);
    this.desired = desired;
  }

  setHordeSize(size: unknown): boolean {
    if (!HORDE_SIZES.includes(size as HordeSize)) return false;
    if (this.desired !== size) {
      this.desired = size as HordeSize;
      this.refillAt = this.tick;
    }
    return true;
  }

  protected prepareTick(): void {
    despawnSystem(this.horde, this.desired);
    if (this.tick >= this.refillAt) spawnSystem(this.horde, this.desired, this.random);
  }

  protected onShot(shot: ShotEvent): void {
    if (shot.eliminated) this.delayRefill();
  }

  /** Grenade and melee kills delay the refill exactly like kills by shots. */
  protected finishTick(): void {
    const { grenadeKills, meleeKills } = this.stats.data;
    if (grenadeKills + meleeKills > this.otherKills) this.delayRefill();
    this.otherKills = grenadeKills + meleeKills;
  }

  private delayRefill(): void {
    if (this.refillAt <= this.tick) this.refillAt = this.tick + AI.refillTicks;
  }
}
