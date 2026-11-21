import { NET } from '@freefall/shared';
import type { ShotEvent } from '@freefall/shared';
import { EventHistory } from './EventHistory.ts';

/** A hitscan producer emits at most one shot and one impact per shooter per server tick. */
export function shotIdentity(event: ShotEvent): string {
  return event.tick + ':' + event.shooter;
}

export class ShotHistory {
  private readonly seen = new EventHistory();
  private head = -1;
  private floor = -1;
  private waiting = true;

  snapshot(tick: number): void {
    if (tick <= this.head) return;
    this.head = tick;
    if (this.waiting) {
      this.waiting = false;
      this.floor = tick;
    }
  }

  suspend(): void { this.waiting = true; }

  receive(event: ShotEvent): 'accepted' | 'stale' | 'duplicate' {
    const tick = event.tick;
    if (this.waiting || tick === undefined || tick <= this.floor) return 'stale';
    const identity = shotIdentity(event);
    if (this.seen.has(identity)) return 'duplicate';
    if (tick < this.head - NET.tickHz) return 'stale';
    return this.seen.accept(tick, identity, this.head) ? 'accepted' : 'stale';
  }
}
