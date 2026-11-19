import { MAX_ENEMIES } from '@freefall/shared';
import type { HordeManager } from './HordeManager.ts';

/**
 * Melee stagger state per horde slot. Kept outside the approved `HordeManager` (Schabe baseline). An entry is only
 * valid while the slot still holds the same enemy id, so a recycled slot never inherits a stagger.
 */
export class StaggerComponent {
  /** No steering and no attacks until this tick; velocity holds the decaying knockback. */
  readonly until = new Uint32Array(MAX_ENEMIES);
  /** No new stagger before this tick, which prevents stun-lock chains. */
  readonly immuneUntil = new Uint32Array(MAX_ENEMIES);
  private readonly owner = new Uint32Array(MAX_ENEMIES);

  /** Stagger end tick of slot `i`, 0 if not staggered. */
  active(h: HordeManager, i: number): number { return this.owner[i] === h.id[i] ? this.until[i] : 0; }

  immune(h: HordeManager, i: number, tick: number): boolean { return this.owner[i] === h.id[i] && tick < this.immuneUntil[i]; }

  begin(h: HordeManager, i: number, until: number, immuneUntil: number): void {
    this.owner[i] = h.id[i];
    this.until[i] = until;
    this.immuneUntil[i] = immuneUntil;
  }

  end(i: number): void { this.until[i] = 0; }

  clear(): void { this.owner.fill(0); this.until.fill(0); this.immuneUntil.fill(0); }
}
