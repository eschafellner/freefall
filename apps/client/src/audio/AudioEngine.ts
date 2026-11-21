import { COMBAT } from '@freefall/shared';
import type { AudioEnvironmentId, EnvironmentAudioProfile } from '@freefall/shared';
import { PRIORITY, VOICE_LIMIT, VoiceBudget } from './VoiceBudget.ts';
import { AudioAssets } from './AudioAssets.ts';

const BUSES = ['weapons', 'environment', 'ambience', 'weather', 'ui'] as const;
export type AudioBus = (typeof BUSES)[number];
export type VolumeChannel = 'master' | AudioBus;
export type AudioSettings = Record<VolumeChannel, number> & { muted: boolean; enabled: boolean };

const STORAGE_KEY = 'freefall.audio.v1';
const DEFAULTS: AudioSettings = { master: .8, weapons: .9, environment: .8, ambience: .8, weather: .8, ui: .7, muted: false, enabled: true };

function loadSettings(): AudioSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<AudioSettings> | null;
    if (!stored) return { ...DEFAULTS };
    const settings = { ...DEFAULTS };
    for (const key of ['master', ...BUSES] as const) {
      const value = stored[key];
      if (typeof value === 'number' && Number.isFinite(value)) settings[key] = Math.max(0, Math.min(1, value));
    }
    settings.ambience = typeof stored.ambience === 'number' ? settings.ambience : settings.environment;
    settings.weather = typeof stored.weather === 'number' ? settings.weather : settings.environment;
    if (typeof stored.muted === 'boolean') settings.muted = stored.muted;
    if (typeof stored.enabled === 'boolean') settings.enabled = stored.enabled;
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
  private readonly budget = new VoiceBudget();
  readonly assets = new AudioAssets();
  private readonly samples = new Map<SampleVoice, AudioBus>();
  private readonly spatial = new Set<SampleVoice>();
  private readonly duckGains: GainNode[] = [];
  private duckUntil = 0;
  private lastListener?: AudioPosition;
  private lastYaw = NaN;
  private disposed = false;
  played = 0;

  get running(): boolean { return this.settings.enabled && !this.disposed && this.context?.state === 'running'; }
  get activeVoices(): number {
    this.budget.prune(this.context?.currentTime ?? 0);
    return this.budget.voices.size;
  }
  get peakVoices(): number { return this.budget.peak; }
  set peakVoices(value: number) { this.budget.peak = value; }
  get droppedVoices(): number { return this.budget.dropped; }
  get environment(): AudioEnvironmentId { return this.environmentId; }

  resume(): void {
    if (this.disposed || !this.settings.enabled || typeof AudioContext === 'undefined') return;
    try {
      if (!this.context) this.build(new AudioContext({ latencyHint: 'interactive', sampleRate: 48_000 }));
      if (this.context!.state !== 'running') void this.context!.resume().catch(() => { this.assets.errors++; });
    } catch {
      this.assets.errors++;
    }
  }

  pause(): void { if (this.context?.state === 'running') void this.context.suspend().catch(() => { this.assets.errors++; }); }

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
    for (const bus of BUSES) {
      const gain = context.createGain();
      if (bus === 'ambience' || bus === 'weather') {
        const duck = context.createGain();
        gain.connect(duck).connect(this.master);
        this.duckGains.push(duck);
      } else gain.connect(this.master);
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
    if (!Number.isFinite(value)) return;
    this.settings[channel] = Math.max(0, Math.min(1, value));
    this.saveSettings();
  }

  setOption(key: 'muted' | 'enabled', value: boolean): void {
    this.settings[key] = value;
    this.saveSettings();
    if (key === 'enabled') {
      if (value) this.resume();
      else {
        this.clearVoices();
        this.pause();
      }
    }
  }

  private saveSettings(): void {
    this.applyVolumes();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* private mode */ }
  }

  private applyVolumes(): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.settings.enabled && !this.settings.muted ? this.settings.master ** 2 : 0, now, .03);
    for (const bus of BUSES) this.buses[bus].gain.setTargetAtTime(this.settings[bus] ** 2, now, .03);
  }

  reserve(owner: string, seconds: number, priority: number, cleanup: () => void): (() => void) | undefined {
    if (!this.running) return;
    const release = this.budget.reserve(this.context!.currentTime, owner, priority, seconds, cleanup);
    if (release) this.played++;
    return release;
  }

  preload(ids: Iterable<string>): void {
    if (!this.running) return;
    for (const id of ids) void this.assets.load(this.context!, id);
  }

  play(id: string, options: SampleOptions): SampleVoice | undefined {
    const context = this.context;
    if (!context || !this.running) return;
    const buffer = this.assets.get(id);
    if (!buffer) {
      void this.assets.load(context, id);
      return;
    }
    return this.playBuffer(buffer, options, id);
  }

  /** Procedural samples use the same spatial routing and voice budget as decoded assets. */
  playBuffer(buffer: AudioBuffer, options: SampleOptions, owner = 'procedural'): SampleVoice | undefined {
    const context = this.context;
    const bus = this.buses[options.bus];
    if (!context || !bus || !this.running) return;
    const pitch = options.pitch ?? 1;
    const now = context.currentTime;
    const release = this.reserve(options.owner ?? owner, options.loop ? Infinity : buffer.duration / pitch + .03,
      options.priority ?? PRIORITY.world, () => {
        if (!voice) return;
        this.samples.delete(voice);
        this.spatial.delete(voice);
        voice.disconnect();
      });
    let voice: SampleVoice | undefined;
    if (!release) return;
    voice = new SampleVoice(context, bus, buffer, options, release);
    this.samples.set(voice, options.bus);
    if (options.position) this.spatial.add(voice);
    return voice;
  }

  listener(position: AudioPosition, yaw: number): void {
    const context = this.context;
    if (!context || !this.running) return;
    const { listener, currentTime } = context;
    const before = this.lastListener;
    const distance = before ? Math.abs(position.x - before.x) + Math.abs(position.y - before.y) + Math.abs(position.z - before.z) : Infinity;
    if (distance > .012) {
      if (distance > 12 && listener.positionX) {
        for (const param of [listener.positionX, listener.positionY, listener.positionZ]) param.cancelScheduledValues(currentTime);
      }
      setPosition(listener, position, currentTime, distance > 12);
      this.lastListener = { ...position };
    }
    if (yaw !== this.lastYaw) {
      const x = Math.sin(yaw), z = -Math.cos(yaw);
      if (listener.forwardX) {
        listener.forwardX.setTargetAtTime(x, currentTime, .025);
        listener.forwardZ.setTargetAtTime(z, currentTime, .025);
      } else listener.setOrientation(x, 0, z, 0, 1, 0);
      this.lastYaw = yaw;
    }
  }

  duck(seconds: number): void {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    this.duckUntil = Math.max(this.duckUntil, now + seconds);
    for (const { gain } of this.duckGains) {
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(.44, now, .06);
      gain.setTargetAtTime(1, this.duckUntil, .38);
    }
  }

  metrics() {
    const voices = this.activeVoices;
    let ambience = 0, combat = voices - this.samples.size;
    for (const bus of this.samples.values()) {
      if (bus === 'ambience' || bus === 'weather') ambience++;
      if (bus === 'weapons') combat++;
    }
    return { voices, peak: this.peakVoices, dropped: this.droppedVoices, budget: VOICE_LIMIT, ambience, combat,
      spatial: this.spatial.size, context: this.context?.state ?? 'locked', duck: (this.context?.currentTime ?? 0) < this.duckUntil,
      levels: { ...this.settings }, ...this.assets.metrics() };
  }

  clearVoices(): void {
    this.budget.clear();
    this.lastListener = undefined;
    this.lastYaw = NaN;
    this.duckUntil = 0;
    const now = this.context?.currentTime ?? 0;
    for (const { gain } of this.duckGains) {
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(1, now, .08);
    }
  }

  close(): void {
    this.disposed = true;
    this.clearVoices();
    this.assets.close();
    if (this.context) void this.context.close().catch(() => {});
    this.context = this.master = this.limiter = this.noise = undefined;
    for (const bus of BUSES) delete this.buses[bus];
    this.environments.clear();
    this.duckGains.length = 0;
  }
}

export interface AudioPosition { x: number; y: number; z: number }
interface SampleOptions {
  bus: AudioBus;
  level: number;
  owner?: string;
  priority?: number;
  pitch?: number;
  loop?: boolean;
  offset?: number;
  fade?: number;
  position?: AudioPosition;
  hrtf?: boolean;
  /** Metres from source origin. */
  range?: readonly [reference: number, cutoff: number];
}

function setPosition(node: AudioListener | PannerNode, position: AudioPosition, now: number, immediate = false): void {
  // Some Web Audio implementations expose only the legacy setters on spatial nodes.
  if (!node.positionX) {
    node.setPosition(position.x, position.y, position.z);
    return;
  }
  for (const [param, value] of [[node.positionX, position.x], [node.positionY, position.y], [node.positionZ, position.z]] as const) {
    if (immediate) param.setValueAtTime(value, now);
    else param.setTargetAtTime(value, now, .045);
  }
}

export class SampleVoice {
  private readonly source: AudioBufferSourceNode;
  private readonly gain: GainNode;
  private readonly panner?: PannerNode;
  private stopped = false;
  private level = -1;
  private readonly context: AudioContext;
  readonly stop: () => void;

  constructor(context: AudioContext, bus: AudioNode, buffer: AudioBuffer, options: SampleOptions, release: () => void) {
    this.context = context;
    this.stop = release;
    this.source = context.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = options.loop ?? false;
    this.source.playbackRate.value = options.pitch ?? 1;
    this.gain = context.createGain();
    this.gain.gain.value = options.fade ? 0 : options.level;
    this.source.connect(this.gain);
    if (options.position) {
      const [refDistance, maxDistance] = options.range ?? [3, 32];
      this.panner = context.createPanner();
      this.panner.panningModel = options.hrtf ? 'HRTF' : 'equalpower';
      this.panner.distanceModel = 'linear';
      this.panner.refDistance = refDistance;
      this.panner.maxDistance = maxDistance;
      setPosition(this.panner, options.position, context.currentTime, true);
      this.gain.connect(this.panner).connect(bus);
    } else this.gain.connect(bus);
    this.volume(options.level, options.fade ?? .015);
    this.source.onended = release;
    this.source.start(0, (options.offset ?? 0) % buffer.duration);
  }

  get active(): boolean { return !this.stopped; }

  volume(level: number, fade = .30): void {
    if (Math.abs(this.level - level) < .003) return;
    this.level = level;
    this.gain.gain.setTargetAtTime(level, this.context.currentTime, Math.max(.008, fade / 3));
  }

  position(position: AudioPosition): void {
    if (this.panner) setPosition(this.panner, position, this.context.currentTime);
  }

  fadeOut(seconds: number): void {
    if (!this.active) return;
    this.volume(0, seconds);
    this.source.stop(this.context.currentTime + seconds * 1.5);
  }

  disconnect(): void {
    this.stopped = true;
    this.source.onended = null;
    this.source.stop();
    this.source.disconnect();
    this.gain.disconnect();
    this.panner?.disconnect();
  }
}
