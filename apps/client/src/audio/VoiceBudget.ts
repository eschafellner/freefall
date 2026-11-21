import { COMBAT } from '@freefall/shared';

export const VOICE_LIMIT = COMBAT.audio.maxVoices;
export const PRIORITY = { detail: 10, bed: 48, world: 30, combat: 45, threat: 75, alert: 100 } as const;

interface Voice {
  owner: string;
  priority: number;
  until: number;
  cleanup: () => void;
}

/** A voice represents one audible event, including its constituent synth layers. */
export class VoiceBudget {
  readonly voices = new Set<Voice>();
  peak = 0;
  dropped = 0;

  prune(now: number): void {
    for (const voice of this.voices) if (voice.until <= now) this.release(voice);
  }

  reserve(now: number, owner: string, priority: number, seconds: number, cleanup: () => void): (() => void) | undefined {
    this.prune(now);
    const limit = VOICE_LIMIT - (priority >= PRIORITY.alert ? 0 : priority >= PRIORITY.threat ? 2 : 6);
    let owned = 0;
    let weakest: Voice | undefined;
    for (const voice of this.voices) {
      if (voice.owner === owner) owned++;
      if (voice.priority < priority && (!weakest || voice.priority < weakest.priority)) weakest = voice;
    }
    if (owned >= COMBAT.audio.maxVoicesPerShooter || (this.voices.size >= limit && !weakest)) {
      this.dropped++;
      return;
    }
    if (this.voices.size >= limit) {
      // A reservation at a lower tier cannot consume the seats held for higher tiers.
      if (this.voices.size > limit) {
        this.dropped++;
        return;
      }
      this.release(weakest!);
      this.dropped++;
    }
    const voice = { owner, priority, until: now + seconds, cleanup };
    this.voices.add(voice);
    this.peak = Math.max(this.peak, this.voices.size);
    return () => this.release(voice);
  }

  private release(voice: Voice): void {
    if (this.voices.delete(voice)) voice.cleanup();
  }

  clear(): void {
    for (const voice of this.voices) this.release(voice);
  }
}
