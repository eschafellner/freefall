import type { MissionSnapshot } from '@freefall/shared';

/** Small Web Audio fallback until authored ship audio is available. */
export class FlightAudio {
  private context?: AudioContext;
  private cue = '';

  resume(): void {
    if (!window.AudioContext) return;
    this.context ??= new AudioContext();
    void this.context.resume().catch(() => {});
  }

  combat(cue: 'rifle' | 'pistol' | 'blast', distance: number): void {
    if (!this.context || this.context.state !== 'running' || distance > 48) return;
    const volume = .14 / (1 + distance * .14);
    if (cue === 'blast') {
      this.tone('sawtooth', 89, 27, .33, volume);
      this.tone('triangle', 163, 45, .17, volume * .65);
    } else {
      this.tone('triangle', cue === 'rifle' ? 184 : 243, 42, cue === 'rifle' ? .09 : .075, volume);
    }
  }

  close(): void { void this.context?.close(); }

  update(state?: MissionSnapshot): void {
    const cue = state?.result ? '' : state?.extraction ? state.extraction.method + state.extraction.phase : state?.phase ?? '';
    if (this.cue === cue) return;
    this.cue = cue;
    if (!this.context || this.context.state !== 'running') return;
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
      case 'balloonCOUNTDOWN': this.tone('sine', 320, 780, .48, .07); break;
      case 'balloonAPPROACH': this.tone('sawtooth', 43, 115, 2.85, .08); break;
      case 'balloonLIFT': this.tone('triangle', 158, 44, 1.7, .10); break;
      case 'albatrossCOUNTDOWN': this.tone('sawtooth', 36, 81, 3.8, .075); break;
    }
  }

  private tone(type: OscillatorType, from: number, to: number, duration: number, volume: number, delay = 0): void {
    const context = this.context!;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
    gain.gain.setValueAtTime(.001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(.16, duration / 3));
    gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + duration + .04);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
}
