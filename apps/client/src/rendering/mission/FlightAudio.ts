import type { MissionSnapshot } from '@freefall/shared';
import type { AudioEngine } from '../../audio/AudioEngine.ts';
import { PRIORITY } from '../../audio/VoiceBudget.ts';

/** Legacy deployment cues sit over the authored vehicle layers. */
export class FlightAudio {
  private readonly engine: AudioEngine;
  private cue?: string;

  constructor(engine: AudioEngine) { this.engine = engine; }

  private get context(): AudioContext | undefined { return this.engine.context; }

  update(state?: MissionSnapshot): void {
    const cue = state?.result ? '' : state?.extraction ? state.extraction.method + state.extraction.phase : state?.phase ?? '';
    const previous = this.cue;
    this.cue = cue;
    if (previous === undefined || previous === cue || !this.engine.running) return;
    switch (cue) {
      case 'LOCKED':
        this.tone('triangle', 119, 31, .55, .19);
        this.tone('sine', 530, 360, .63, .065, .30);
        this.tone('sine', 530, 360, .62, .055, 1.02);
        break;
      case 'DROPPING': this.tone('sawtooth', 58, 39, 1.4, .045); break;
      case 'ATMOSPHERIC_ENTRY': this.tone('sawtooth', 74, 111, 2.25, .065); break;
      case 'BRAKING': this.tone('sawtooth', 58, 104, 1.6, .085); break;
      case 'TOUCHDOWN': this.tone('triangle', 91, 26, .83, .21, .48); break;
    }
  }

  clear(): void { this.cue = undefined; }

  private tone(type: OscillatorType, from: number, to: number, duration: number, volume: number, delay = 0): void {
    const context = this.context!;
    const bus = this.engine.bus('environment');
    if (!bus) return;
    const release = this.engine.reserve('deployment', duration + delay + .08, PRIORITY.combat, () => {
      oscillator.stop(); oscillator.disconnect(); gain.disconnect();
    });
    if (!release) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
    gain.gain.setValueAtTime(.001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(.16, duration / 3));
    gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    oscillator.connect(gain).connect(bus);
    oscillator.start(at);
    oscillator.stop(at + duration + .04);
    oscillator.onended = release;
  }
}
