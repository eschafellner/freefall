import type { MissionSnapshot } from '@freefall/shared';
import type { AudioEngine } from './AudioEngine.ts';
import { PRIORITY } from './VoiceBudget.ts';

/** 0: quiet deck, 1: boarding call (amber lamps), 2: drop alarm (red lamps, klaxon). */
export type AlarmLevel = 0 | 1 | 2;

/** Alarm state of the carrier for lamps and klaxon; drop countdown and clamp release count as the drop alarm. */
export function carrierAlarm(state: Pick<MissionSnapshot, 'state' | 'phase' | 'boardingUntil'> | undefined): AlarmLevel {
  if (!state) return 0;
  if (state.state === 'BOARDING') return state.boardingUntil > 0 ? 2 : 1;
  if (state.state === 'DEPLOYMENT') return state.phase === 'LOCKED' || state.phase === 'BOARDING' || state.phase === 'DOCKED' ? 2 : 0;
  return 0;
}

/** Seconds between two klaxon blasts and between two boarding calls. */
export const ALARM_PERIOD = { 1: 6.5, 2: 1.45 } as const;

/**
 * Synthesised alarm of the carrier, played through the carrier reverb:
 * - boarding call: a two-tone hull chime with a metallic tail,
 * - drop alarm: a rising klaxon blast (detuned saw and square through a horn-like filter and soft clipping) with a
 *   rattling tremolo, followed by a short low pulse, repeating while the countdown and the clamp release run.
 */
export class CarrierAlarm {
  private readonly engine: AudioEngine;
  private next = 0;
  private level: AlarmLevel = 0;
  private shape?: Float32Array<ArrayBuffer>;

  constructor(engine: AudioEngine) { this.engine = engine; }

  update(state: MissionSnapshot | undefined): void {
    const level = carrierAlarm(state);
    const context = this.engine.context;
    if (!context || !this.engine.running) { this.level = level; return; }
    const now = context.currentTime;
    if (level !== this.level) {
      this.level = level;
      this.next = now + .05;
    }
    if (!level || now < this.next) return;
    if (level === 2) this.klaxon(this.next);
    else this.chime(this.next);
    this.next = Math.max(now, this.next) + ALARM_PERIOD[level];
  }

  clear(): void { this.level = 0; this.next = 0; }

  /** Soft clipping of the horn driver; the curve is shared, the node belongs to one blast. */
  private curve(context: BaseAudioContext): WaveShaperNode {
    if (!this.shape) {
      const samples = 1024;
      this.shape = new Float32Array(samples);
      for (let i = 0; i < samples; i++) this.shape[i] = Math.tanh((i / (samples - 1) * 2 - 1) * 2.6) / Math.tanh(2.6);
    }
    const shaper = context.createWaveShaper();
    shaper.curve = this.shape;
    shaper.oversample = '2x';
    return shaper;
  }

  private klaxon(at: number): void {
    const context = this.engine.context!;
    const bus = this.engine.bus('environment');
    if (!bus) return;
    const length = 1.05;
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    const release = this.engine.reserve('carrier-alarm', length + .4, PRIORITY.alert, () => {
      for (const source of sources) { try { source.stop(); } catch { /* already stopped */ } }
      for (const node of nodes) node.disconnect();
    });
    if (!release) return;
    const output = context.createGain();
    output.gain.setValueAtTime(.0001, at);
    output.gain.exponentialRampToValueAtTime(.34, at + .05);
    output.gain.setValueAtTime(.34, at + length - .18);
    output.gain.exponentialRampToValueAtTime(.0001, at + length);
    // Horn body: resonances of a short flared horn, then a gentle top cut.
    const horn = context.createBiquadFilter();
    horn.type = 'bandpass'; horn.frequency.value = 1150; horn.Q.value = .9;
    const formant = context.createBiquadFilter();
    formant.type = 'peaking'; formant.frequency.value = 2300; formant.Q.value = 2.4; formant.gain.value = 7;
    const top = context.createBiquadFilter();
    top.type = 'lowpass'; top.frequency.value = 4200;
    const drive = context.createGain();
    drive.gain.value = 1.8;
    const shaper = this.curve(context);
    // Rattle of the diaphragm.
    const tremolo = context.createGain();
    tremolo.gain.value = .78;
    const rattle = context.createOscillator();
    rattle.frequency.value = 34;
    const depth = context.createGain();
    depth.gain.value = .22;
    rattle.connect(depth).connect(tremolo.gain);
    drive.connect(shaper).connect(horn).connect(formant).connect(top).connect(tremolo).connect(output).connect(bus);
    nodes.push(output, horn, formant, top, drive, shaper, tremolo, depth);
    // Pitch: a fast rise, a hold and a slight sag at the end, the classic "whoop" of a ship's klaxon.
    for (const [type, ratio, level] of [['sawtooth', 1, .5], ['square', 1.006, .28], ['sawtooth', .5, .3], ['square', 1.503, .1]] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      const f = oscillator.frequency;
      f.setValueAtTime(310 * ratio, at);
      f.exponentialRampToValueAtTime(640 * ratio, at + .42);
      f.linearRampToValueAtTime(660 * ratio, at + .8);
      f.exponentialRampToValueAtTime(560 * ratio, at + length);
      const gain = context.createGain();
      gain.gain.value = level;
      oscillator.connect(gain).connect(drive);
      oscillator.start(at);
      oscillator.stop(at + length + .05);
      sources.push(oscillator);
      nodes.push(oscillator, gain);
    }
    rattle.start(at);
    rattle.stop(at + length + .05);
    sources.push(rattle);
    nodes.push(rattle);
    // Low pulse after each blast, felt more than heard: the carrier's hull answering the alarm.
    const thump = context.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(74, at + length);
    thump.frequency.exponentialRampToValueAtTime(46, at + length + .3);
    const thumpGain = context.createGain();
    thumpGain.gain.setValueAtTime(.0001, at + length);
    thumpGain.gain.exponentialRampToValueAtTime(.32, at + length + .02);
    thumpGain.gain.exponentialRampToValueAtTime(.0001, at + length + .32);
    thump.connect(thumpGain).connect(bus);
    thump.start(at + length);
    thump.stop(at + length + .36);
    thump.onended = release;
    sources.push(thump);
    nodes.push(thump, thumpGain);
  }

  private chime(at: number): void {
    const context = this.engine.context!;
    const bus = this.engine.bus('environment');
    if (!bus) return;
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    const release = this.engine.reserve('carrier-alarm', 2.4, PRIORITY.alert, () => {
      for (const source of sources) { try { source.stop(); } catch { /* already stopped */ } }
      for (const node of nodes) node.disconnect();
    });
    if (!release) return;
    // Two falling notes (E5, C5) with inharmonic partials for a struck metal plate.
    for (const [delay, base] of [[0, 659.3], [.42, 523.3]] as const) {
      for (const [ratio, level, decay] of [[1, .16, 1.5], [2.76, .05, .7], [5.4, .025, .35], [.5, .06, 1.8]] as const) {
        const oscillator = context.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = base * ratio;
        const gain = context.createGain();
        gain.gain.setValueAtTime(.0001, at + delay);
        gain.gain.exponentialRampToValueAtTime(level, at + delay + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, at + delay + decay);
        oscillator.connect(gain).connect(bus);
        oscillator.start(at + delay);
        oscillator.stop(at + delay + decay + .02);
        sources.push(oscillator);
        nodes.push(oscillator, gain);
      }
    }
    sources.at(-1)!.onended = release;
  }
}
