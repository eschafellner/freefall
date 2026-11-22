import { DEPLOYMENT_PHASES, NET } from '@freefall/shared';
import type { MissionSnapshot } from '@freefall/shared';
import type { AudioEngine } from '../../audio/AudioEngine.ts';
import { PRIORITY } from '../../audio/VoiceBudget.ts';

const seconds = (phase: string) => (DEPLOYMENT_PHASES.find(([name]) => name === phase)?.[1] ?? 30) / NET.tickHz;

/**
 * Synthesised deployment cues over the authored lander loop: clamp release, the shove of the drop, the rising
 * re-entry roar, the retro burn and the touchdown slam with engine cut-off. Lengths follow the server phases.
 */
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
    const length = seconds(cue);
    switch (cue) {
      case 'LOCKED':
        // Ramp slam and three docking clamps letting go in sequence; the klaxon comes from CarrierAlarm.
        this.tone('triangle', 119, 31, .55, .19);
        for (const [i, delay] of [1.6, 1.95, 2.25].entries()) {
          this.noise('bandpass', 1900 - i * 300, 900, .09, .24, delay);
          this.tone('triangle', 92, 48, .3, .16, delay);
        }
        break;
      case 'DROPPING':
        // Release jolt, then the stomach-drop rumble of free fall.
        this.tone('sine', 70, 30, 1.1, .3);
        this.noise('lowpass', 140, 380, length, .22, .05, .9);
        this.tone('sawtooth', 58, 39, length, .04);
        break;
      case 'ATMOSPHERIC_ENTRY':
        // Roar that builds with the plasma and breaks up near the end.
        this.noise('bandpass', 180, 1300, length, .38, 0, length * .45);
        this.noise('lowpass', 90, 260, length, .3, 0, length * .3);
        this.tone('sawtooth', 74, 111, length, .06);
        break;
      case 'BRAKING':
        // Full retro burn: low engine body and a hissing exhaust that throttles down at the end.
        this.noise('lowpass', 260, 520, length * .9, .34, 0, .5);
        this.tone('sawtooth', 52, 64, length * .86, .085);
        this.tone('sawtooth', 340, 90, .9, .05, length * .86);
        break;
      case 'TOUCHDOWN':
        // The slam: sub thud, crunch of the gear, settling hiss.
        this.tone('sine', 62, 24, 1.3, .42);
        this.tone('triangle', 91, 26, .83, .26, .02);
        this.noise('lowpass', 900, 160, .55, .42);
        this.noise('highpass', 2400, 1200, 1.6, .08, .5, .1);
        break;
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

  /** Filtered noise layer with a sweep from `from` to `to` Hz and an attack of `attack` seconds. */
  private noise(type: BiquadFilterType, from: number, to: number, duration: number, volume: number, delay = 0, attack = .01): void {
    const context = this.context!;
    const bus = this.engine.bus('environment');
    const buffer = this.engine.noiseBuffer;
    if (!bus || !buffer) return;
    const release = this.engine.reserve('deployment', duration + delay + .08, PRIORITY.combat, () => {
      source.stop(); source.disconnect(); filter.disconnect(); gain.disconnect();
    });
    if (!release) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const at = context.currentTime + delay;
    filter.type = type;
    filter.Q.value = type === 'bandpass' ? 1.2 : .7;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + duration);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + Math.max(.005, Math.min(attack, duration * .8)));
    gain.gain.setValueAtTime(volume, at + Math.max(.006, duration * .82));
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter).connect(gain).connect(bus);
    source.start(at, Math.random() * buffer.duration);
    source.stop(at + duration + .04);
    source.onended = release;
  }
}
