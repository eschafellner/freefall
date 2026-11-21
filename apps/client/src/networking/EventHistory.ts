import { NET } from '@freefall/shared';

/** Capped retention for tick-keyed presentation events from the server. */
export class EventHistory {
  private readonly keys = new Map<string, number>();
  private readonly age: number;
  private readonly capacity: number;

  constructor(age: number = NET.tickHz, capacity = 512) {
    this.age = age;
    this.capacity = capacity;
  }

  accept(tick: number, identity: string, head: number): boolean {
    if (tick < head - this.age || this.keys.has(identity)) return false;
    if (this.keys.size >= this.capacity) {
      for (const [key, at] of this.keys) if (at < head - this.age) this.keys.delete(key);
      // Keep live identities so an overloaded consumer cannot replay already presented events.
      if (this.keys.size >= this.capacity) return false;
    }
    this.keys.set(identity, tick);
    return true;
  }

  has(identity: string): boolean { return this.keys.has(identity); }

  clear(): void { this.keys.clear(); }
}
