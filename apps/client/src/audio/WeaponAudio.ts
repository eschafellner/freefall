/**
 * Layered, procedural weapon audio. No audio data crosses the network: every client synthesizes the sounds from
 * synchronized gameplay events (shots, reload phases, blasts, melee, resupply) and its own listener position.
 *
 * Shot layers (parameters in `combat.json › audio.weapons`):
 *   transient  band-passed noise crack, a few milliseconds, the "dry" impulse
 *   body       pitch-dropping sine through soft saturation, the low-frequency pressure
 *   mechanical short resonant click of bolt or slide, only audible up close
 *   tail       low-passed noise into the environment reverb/echo send
 * Distance: delay by the speed of sound, level falloff, a low-pass that closes with distance and a cross-fade from
 * the close variant (crack + mechanics) to the distant variant (dull boom + more tail).
 *
 * Procedural weapons share the mixer and voice budget with recorded gameplay audio.
 */
import { COMBAT, WEAPONS } from '@freefall/shared';
import type { AudioEnvironmentId, WeaponSlot } from '@freefall/shared';
import type { AudioEngine } from './AudioEngine.ts';
import { PRIORITY } from './VoiceBudget.ts';

export interface Listener { x: number; y?: number; z: number; yaw: number }
export interface SoundSource { x: number; z: number; y?: number }

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

interface Voice {
  at: number;
  /** Close (0) to distant (1). */
  blend: number;
  out: AudioNode;
  sources: Set<AudioScheduledSourceNode>;
}

export class WeaponAudio {
  private readonly engine: AudioEngine;
  private curve?: Float32Array<ArrayBuffer>;
  private readonly pending = new Map<string, AudioScheduledSourceNode[]>();
  private readonly transient = new Set<() => void>();
  private random = 0x51ed;

  constructor(engine: AudioEngine) { this.engine = engine; }

  setEnvironment(id: AudioEnvironmentId): void {
    if (this.engine.environment !== id) this.engine.setEnvironment(id);
  }

  private rand(): number {
    this.random = (Math.imul(this.random, 1664525) + 1013904223) >>> 0;
    return this.random / 0x100000000;
  }

  /**
   * Creates the spatial output chain of one sound event, or undefined if it is inaudible or over budget.
   * `seconds` is the audible length; it may depend on the distance blend (distant tails ring longer).
   */
  private voice(owner: string, source: SoundSource, listener: Listener, own: boolean, length: number | ((blend: number) => number),
    gain = 1, priority?: number): Voice | undefined {
    const context = this.engine.context;
    const bus = this.engine.bus('weapons');
    if (!context || !bus || context.state !== 'running') return;
    const { audibleDistance, distantBlendStart, distantBlendEnd, speedOfSound } = COMBAT.audio;
    const dx = source.x - listener.x, dz = source.z - listener.z;
    const horizontal = Math.hypot(dx, dz);
    const distance = own ? 0 : priority === undefined ? horizontal : Math.hypot(horizontal, (source.y ?? listener.y ?? 0) - (listener.y ?? 0));
    if (distance > audibleDistance) return;
    const blend = smooth(distantBlendStart, distantBlendEnd, distance);
    const seconds = typeof length === 'function' ? length(blend) : length;
    const sources = new Set<AudioScheduledSourceNode>();
    const release = this.engine.reserve(owner, seconds + distance / speedOfSound + .10,
      priority ?? (own ? PRIORITY.threat : PRIORITY.combat - Math.min(14, distance / 6)), () => {
        if (release) this.transient.delete(release);
        for (const source of sources) source.stop();
        out.disconnect(); wet?.disconnect(); dry.disconnect(); filter.disconnect(); pan.disconnect();
      });
    if (!release) return;
    if (priority !== undefined) this.transient.add(release);
    const at = context.currentTime + .005 + distance / speedOfSound;
    const pan = context.createStereoPanner();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    const right = distance > .5 ? (dx * Math.cos(listener.yaw) + dz * Math.sin(listener.yaw)) / distance : 0;
    const front = distance > .5 ? (dx * Math.sin(listener.yaw) - dz * Math.cos(listener.yaw)) / distance : 1;
    pan.pan.value = Math.max(-.85, Math.min(.85, right * .85));
    // Sources behind the listener lose some brilliance.
    filter.frequency.value = (17_000 - 15_400 * blend) * (front < 0 ? .7 : 1);
    filter.Q.value = .4;
    const dry = context.createGain();
    dry.gain.value = gain / (1 + distance / 14);
    dry.connect(filter).connect(pan).connect(bus);
    const out = context.createGain();
    out.connect(dry);
    const send = this.engine.send;
    const wet = send ? context.createGain() : undefined;
    if (send && wet) {
      // Distant sources are dominated by reflections.
      wet.gain.value = gain * (.35 + blend * .9) / (1 + distance / 40);
      out.connect(wet).connect(send);
    }
    return { at, blend, out, sources };
  }

  private noise(voice: Voice, start: number, duration: number, type: BiquadFilterType, frequency: number, q: number,
    level: number, attack = .001, to?: number): AudioBufferSourceNode | undefined {
    const context = this.engine.context!;
    const buffer = this.engine.noiseBuffer;
    if (!buffer || level <= 0) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    // Looping white noise has no audible seam, so a random start offset can never cut a long layer short.
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, start);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    filter.Q.value = q;
    const gain = context.createGain();
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter).connect(gain).connect(voice.out);
    source.start(start, this.rand() * buffer.duration);
    source.stop(start + duration + .02);
    voice.sources.add(source);
    source.onended = () => { voice.sources.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
    return source;
  }

  private tone(voice: Voice, start: number, duration: number, from: number, to: number, level: number,
    type: OscillatorType = 'sine', saturate = false): OscillatorNode | undefined {
    const context = this.engine.context!;
    if (level <= 0) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    const shaper = saturate ? this.shaper() : undefined;
    (shaper ? oscillator.connect(shaper) : oscillator).connect(gain).connect(voice.out);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
    voice.sources.add(oscillator);
    oscillator.onended = () => { voice.sources.delete(oscillator); oscillator.disconnect(); shaper?.disconnect(); gain.disconnect(); };
    return oscillator;
  }

  /** Soft clipper (one per tone, shared curve) that adds harmonics to the low body for small speakers. */
  private shaper(): WaveShaperNode {
    if (!this.curve) {
      this.curve = new Float32Array(1024);
      for (let i = 0; i < this.curve.length; i++) {
        const x = i / (this.curve.length - 1) * 2 - 1;
        this.curve[i] = Math.tanh(x * 2.4) / Math.tanh(2.4);
      }
    }
    const shaper = this.engine.context!.createWaveShaper();
    shaper.curve = this.curve;
    return shaper;
  }

  shot(slot: WeaponSlot, shooter: string, source: SoundSource, listener: Listener, own: boolean): void {
    const kind = WEAPONS[slot].sounds.fire;
    const profile = COMBAT.audio.weapons[kind];
    const rifle = kind === 'rifle';
    const tail = rifle ? .42 : .3;
    // The tail layer starts 10 ms late and lasts tail × (1 + blend).
    const voice = this.voice(shooter, source, listener, own, (blend) => tail * (1 + blend) + .1, profile.gain);
    if (!voice) return;
    const { at, blend } = voice;
    const close = 1 - blend;
    const vary = 1 + (this.rand() * 2 - 1) * profile.variation;
    // Close: sharp crack. Distant: the crack is gone, a dull boom and the reflections remain.
    this.noise(voice, at, rifle ? .045 : .03, 'bandpass', profile.transientHz * vary, .8, .9 * close + .05);
    this.noise(voice, at, rifle ? .02 : .014, 'highpass', 5200 * vary, .5, .35 * close);
    this.tone(voice, at, rifle ? .16 : .1, profile.bodyHz * 1.9 * vary, profile.bodyHz * .55, profile.bodyGain * (.7 + blend * .5), 'sine', true);
    if (close > .35) {
      this.noise(voice, at + (rifle ? .011 : .008), .018, 'bandpass', (rifle ? 2300 : 3300) * vary, 6, profile.mechanicalGain * close);
      if (!rifle) this.noise(voice, at + .045, .02, 'bandpass', 2700 * vary, 8, profile.mechanicalGain * .6 * close);
    }
    this.noise(voice, at + .01, tail * (1 + blend), 'lowpass', 1500 - 800 * blend, .5, profile.tailGain * (.35 + blend * .45), .012);
    // Casing on the ground, own rifle only (keeps the voice count low).
    if (own && rifle && this.rand() < .7) {
      this.noise(voice, at + .32 + this.rand() * .12, .05, 'bandpass', 5200 + this.rand() * 1800, 12, .05);
    }
  }

  explosion(source: SoundSource, listener: Listener, distance: number): void {
    const profile = COMBAT.audio.explosion;
    const priority = distance < 12 ? PRIORITY.combat + 17 : PRIORITY.combat - Math.min(14, distance / 5);
    const voice = this.voice('blast', source, listener, false, 1.35, profile.gain * .76, priority);
    if (!voice) return;
    const { at, blend } = voice;
    this.noise(voice, at, .22 + blend * .21, 'lowpass', 5600 - 4200 * blend, .7, .94, .002, 190);
    this.tone(voice, at, .65, profile.bodyHz * (1.48 + this.rand() * .16), profile.bodyHz * .52, .93, 'sine', true);
    this.noise(voice, at + .035, .85 + .34 * blend, 'lowpass', 890 - blend * 380, .5, profile.tailGain * .52, .034);
  }

  private mechanics(owner: string, source: SoundSource, listener: Listener, own: boolean, steps: [number, number, number, number][]): AudioScheduledSourceNode[] {
    const voice = this.voice(owner, source, listener, own, Math.max(...steps.map(([delay]) => delay)) + .2, own ? .55 : .4);
    if (!voice || (!own && voice.blend > .4)) return [];
    const nodes: AudioScheduledSourceNode[] = [];
    for (const [delay, frequency, q, level] of steps) {
      const node = this.noise(voice, voice.at + delay, .035, 'bandpass', frequency, q, level);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  /** Reload phases from the server: start (release + drop), insertion (seat), interruption (cancels pending cues). */
  reload(operator: string, slot: WeaponSlot, phase: 'RELOAD_START' | 'MAGAZINE_INSERTION' | 'RELOAD_INTERRUPTED',
    source: SoundSource, listener: Listener, own: boolean, removalSeconds: number, chamberSeconds: number): void {
    const key = operator;
    if (phase === 'RELOAD_INTERRUPTED') {
      for (const node of this.pending.get(key) ?? []) { try { node.stop(); } catch { /* already ended */ } }
      this.pending.delete(key);
      return;
    }
    const rifle = slot === 'primary';
    if (phase === 'RELOAD_START') {
      const nodes = this.mechanics(`${operator}-reload`, source, listener, own, [
        [0, 900, 2, .18], [removalSeconds, rifle ? 1900 : 2600, 7, .4], [removalSeconds + .2, 700, 3, .22],
      ]);
      if (!nodes.length) return;
      const pending = new Set(nodes);
      this.pending.set(key, nodes);
      for (const node of nodes) node.addEventListener('ended', () => {
        pending.delete(node);
        if (!pending.size && this.pending.get(key) === nodes) this.pending.delete(key);
      }, { once: true });
    } else {
      this.pending.delete(key);
      this.mechanics(`${operator}-reload`, source, listener, own, [
        [0, rifle ? 1500 : 2100, 6, .55], [chamberSeconds, rifle ? 2600 : 3400, 9, .5], [chamberSeconds + .06, 1700, 6, .35],
      ]);
    }
  }

  reset(): void {
    this.pending.clear();
    this.clearTransient();
  }

  clearTransient(): void { for (const release of this.transient) release(); }

  switchWeapon(operator: string, source: SoundSource, listener: Listener, own: boolean): void {
    this.mechanics(`${operator}-switch`, source, listener, own, [[0, 600, 1.5, .16], [.24, 2800, 8, .3]]);
  }

  grenadeRelease(operator: string, source: SoundSource, listener: Listener, own: boolean): void {
    if (!own && Math.hypot(source.x - listener.x, source.z - listener.z) > 30) return;
    const voice = this.voice(`${operator}-throw`, source, listener, own, .18, .50, PRIORITY.world + 4);
    if (!voice) return;
    this.noise(voice, voice.at, .06, 'bandpass', 1650, 3.8, .25, .007, 740);
  }

  meleeSwing(operator: string, source: SoundSource, listener: Listener, own: boolean): void {
    if (!own && Math.hypot(source.x - listener.x, source.z - listener.z) > 30) return;
    const voice = this.voice(`${operator}-melee`, source, listener, own, .18, own ? .76 : .53, PRIORITY.combat);
    if (voice) this.noise(voice, voice.at, .115, 'bandpass', 540, 1.1, .39, .018, 1950);
  }

  resupply(operator: string, source: SoundSource, listener: Listener, own: boolean): void {
    this.mechanics(`${operator}-supply`, source, listener, own, [[0, 420, 2, .5], [.08, 1200, 4, .35], [.3, 2100, 8, .3], [.42, 1800, 8, .25]]);
  }
}
