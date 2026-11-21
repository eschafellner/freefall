import { NET } from '@freefall/shared';
import type { CombatEvent, GrenadeReleaseEvent, MeleeEvent, ShotEvent } from '@freefall/shared';
import { EventHistory } from './EventHistory.ts';
import { ShotHistory } from './ShotHistory.ts';

type ActionEvent = GrenadeReleaseEvent | MeleeEvent;

/** Admission and lifetime for authoritative combat cues, before they fan out to VFX, audio and HUD. */
export class CombatPresentation {
  private shots = new ShotHistory();
  private readonly actions = new EventHistory();
  // The server can send a batch of up to 48 feedback events every tick.
  private readonly feedback = new EventHistory(NET.tickHz, 48 * (NET.tickHz + 1));
  private readonly pending: { event: ActionEvent; expires: number }[] = [];
  private floor = -1;
  duplicates = 0;
  duplicateShots = 0;

  snapshot(tick: number): void { this.shots.snapshot(tick); }

  shot(event: ShotEvent): boolean {
    if (event.tick === undefined || event.tick <= this.floor) return false;
    const result = this.shots.receive(event);
    if (result === 'duplicate') this.duplicateShots++;
    return result === 'accepted';
  }

  suspend(tick: number): void {
    this.shots.suspend();
    this.fence(tick);
  }

  accept(event: CombatEvent, head: number, feedbackFloor = -1): boolean {
    if (event.tick <= this.floor) return false;
    switch (event.type) {
      case 'blast':
      case 'grenade-release':
      case 'melee': {
        const key = event.type === 'melee' ? `melee:${event.tick}:${event.attacker}` : `${event.type}:${event.id}`;
        if (this.actions.has(key)) this.duplicates++;
        if (!this.actions.accept(event.tick, key, head)) return false;
        if (event.type === 'grenade-release') return !this.actions.has(`blast:${event.id}`);
        if (event.type === 'blast') {
          const release = this.pending.findIndex(({ event: pending }) => pending.type === 'grenade-release' && pending.id === event.id);
          if (release >= 0) this.pending.splice(release, 1);
        }
        return true;
      }
      default: {
        if (event.tick <= feedbackFloor) return false;
        const subject = event.type === 'enemy-hit' ? [event.attack, event.target, event.life]
          : event.type === 'reload' ? [event.operator, event.slot, event.phase]
          : event.type === 'resupply' ? [event.operator, event.container]
          : [event.attacker, event.target, event.source];
        return this.feedback.accept(event.tick, [event.tick, event.type, ...subject].join(':'), head);
      }
    }
  }

  queue(event: ActionEvent, now: number): void {
    // Bound the delay when the pose timeline stalls. Delayed snapshots never manufacture a cue.
    const index = this.pending.findLastIndex((entry) => entry.event.tick <= event.tick);
    this.pending.splice(index + 1, 0, { event, expires: now + 320 });
  }

  draw(tick: number, now: number, present: (event: ActionEvent, now: number, waitedMs: number) => void): void {
    for (let i = 0; i < this.pending.length;) {
      const { event, expires } = this.pending[i];
      if (event.tick <= tick || expires <= now) {
        this.pending.splice(i, 1);
        if (now - expires < 320) present(event, now, now - (expires - 320));
      } else i++;
    }
  }

  fence(tick: number): void {
    this.floor = Math.max(tick, this.floor);
    this.pending.length = 0;
  }

  clear(): void {
    this.floor = -1;
    this.pending.length = this.duplicates = this.duplicateShots = 0;
    this.shots = new ShotHistory();
    this.actions.clear();
    this.feedback.clear();
  }
}
