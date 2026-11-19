/**
 * Shared Web Audio graph: one context, four volume buses, a peak limiter against clipping, a voice budget and one
 * reverb/echo send per acoustic environment. Every game sound (weapons, explosions, flight cues, UI) goes through
 * this engine, so the volume settings and the voice limit apply everywhere.
 *
 *   sources → [bus: weapons | environment | ui] → master gain → limiter → destination
 *                └── send ──→ convolver (environment IR) + feedback echo ──→ environment bus
 */
import { COMBAT } from '@freefall/shared';
import type { AudioEnvironmentId, EnvironmentAudioProfile } from '@freefall/shared';

export type AudioBus = 'weapons' | 'environment' | 'ui';
export type VolumeChannel = 'master' | AudioBus;
export type AudioSettings = Record<VolumeChannel, number>;

const STORAGE_KEY = 'freefall.audio.v1';
const DEFAULTS: AudioSettings = { master: .8, weapons: .9, environment: .8, ui: .7 };

function loadSettings(): AudioSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<AudioSettings> | null;
    if (!stored) return { ...DEFAULTS };
    const settings = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS) as VolumeChannel[]) {
      const value = stored[key];
      if (typeof value === 'number' && Number.isFinite(value)) settings[key] = Math.max(0, Math.min(1, value));
    }
    return settings;
  } catch {
    return { ...DEFAULTS };
  }
}

interface Environment {
  input: GainNode;
  convolver: ConvolverNode;
  wet: GainNode;
  delay: DelayNode;
  feedback: GainNode;
}

export class AudioEngine {
  context?: AudioContext;
  readonly settings: AudioSettings = loadSettings();
  private master?: GainNode;
  private limiter?: DynamicsCompressorNode;
  private readonly buses = {} as Record<AudioBus, GainNode>;
  private readonly environments = new Map<AudioEnvironmentId, Environment>();
  private environmentId: AudioEnvironmentId = 'open-field';
  private noise?: AudioBuffer;
  private voices = 0;
  private readonly perOwner = new Map<string, number>();
  /** Peak simultaneous voices since the last read (telemetry). */
  peakVoices = 0;
  droppedVoices = 0;

  get running(): boolean { return this.context?.state === 'running'; }
  get activeVoices(): number { return this.voices; }
  get environment(): AudioEnvironmentId { return this.environmentId; }

  resume(): void {
    if (!window.AudioContext) return;
    if (!this.context) this.build(new AudioContext({ latencyHint: 'interactive' }));
    void this.context!.resume().catch(() => {});
  }

  private build(context: AudioContext): void {
    this.context = context;
    const { limiterThresholdDb } = COMBAT.audio;
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = limiterThresholdDb;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = .002;
    this.limiter.release.value = .16;
    this.master = context.createGain();
    this.master.connect(this.limiter).connect(context.destination);
    for (const bus of ['weapons', 'environment', 'ui'] as const) {
      const gain = context.createGain();
      gain.connect(this.master);
      this.buses[bus] = gain;
    }
    this.applyVolumes();
    const length = context.sampleRate * 2;
    this.noise = context.createBuffer(1, length, context.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 0x2f6b;
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      data[i] = seed / 0x80000000 - 1;
    }
    for (const id of Object.keys(COMBAT.audio.environments) as AudioEnvironmentId[]) {
      this.environments.set(id, this.createEnvironment(context, COMBAT.audio.environments[id]));
    }
    this.setEnvironment(this.environmentId);
  }

  /** Procedural impulse response: exponential decay, metallic resonances for interiors, sparse late echoes outside. */
  private createEnvironment(context: AudioContext, profile: EnvironmentAudioProfile): Environment {
    const rate = context.sampleRate;
    const length = Math.ceil(rate * profile.reverbSeconds);
    const impulse = context.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      let seed = 0x9e37 + channel * 7919;
      for (let i = 0; i < length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const t = i / rate;
        const decay = Math.exp(-6.9 * t / profile.reverbSeconds);
        const ring = profile.metallic ? 1 + profile.metallic * (Math.sin(t * 2 * Math.PI * 463) + Math.sin(t * 2 * Math.PI * 1187) * .6) : 1;
        // Outdoors: little early energy, the tail builds up later (distant terrain reflections).
        const build = profile.metallic ? 1 : Math.min(1, t / .06);
        data[i] = (seed / 0x80000000 - 1) * decay * ring * build * .5;
      }
    }
    const input = context.createGain();
    const convolver = context.createConvolver();
    convolver.buffer = impulse;
    const wet = context.createGain();
    wet.gain.value = 0;
    const delay = context.createDelay(2);
    delay.delayTime.value = Math.max(.001, profile.echoDelaySeconds);
    const feedback = context.createGain();
    feedback.gain.value = profile.echoFeedback;
    const damping = context.createBiquadFilter();
    damping.type = 'lowpass';
    damping.frequency.value = profile.metallic ? 4200 : 2200;
    input.connect(convolver).connect(wet);
    input.connect(delay).connect(damping).connect(feedback).connect(delay);
    damping.connect(wet);
    wet.connect(this.buses.environment);
    return { input, convolver, wet, delay, feedback };
  }

  setEnvironment(id: AudioEnvironmentId): void {
    this.environmentId = id;
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const [key, environment] of this.environments) {
      const target = key === id ? COMBAT.audio.environments[key].reverbWet : 0;
      environment.wet.gain.setTargetAtTime(target, now, .25);
    }
  }

  /** Reverb/echo send of the active environment. */
  get send(): AudioNode | undefined { return this.environments.get(this.environmentId)?.input; }

  bus(name: AudioBus): AudioNode | undefined { return this.buses[name]; }

  get noiseBuffer(): AudioBuffer | undefined { return this.noise; }

  setVolume(channel: VolumeChannel, value: number): void {
    this.settings[channel] = Math.max(0, Math.min(1, value));
    this.applyVolumes();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* private mode */ }
  }

  private applyVolumes(): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    // Perceptual curve: slider position squared.
    this.master.gain.setTargetAtTime(this.settings.master ** 2, now, .03);
    for (const bus of ['weapons', 'environment', 'ui'] as const) this.buses[bus].gain.setTargetAtTime(this.settings[bus] ** 2, now, .03);
  }

  /**
   * Reserves a voice for `seconds`. Returns false when the global or the per-owner budget is exhausted, so very
   * intense fights thin out distant sounds instead of stacking hundreds of oscillators. Own sounds use priority.
   */
  acquire(owner: string, seconds: number, priority = false): boolean {
    const { maxVoices, maxVoicesPerShooter } = COMBAT.audio;
    const owned = this.perOwner.get(owner) ?? 0;
    if (!priority && (this.voices >= maxVoices || owned >= maxVoicesPerShooter)) {
      this.droppedVoices++;
      return false;
    }
    this.voices++;
    this.perOwner.set(owner, owned + 1);
    this.peakVoices = Math.max(this.peakVoices, this.voices);
    window.setTimeout(() => {
      this.voices = Math.max(0, this.voices - 1);
      const left = (this.perOwner.get(owner) ?? 1) - 1;
      if (left > 0) this.perOwner.set(owner, left);
      else this.perOwner.delete(owner);
    }, seconds * 1000);
    return true;
  }

  close(): void { void this.context?.close(); }
}
