import { DESERT_ID, FOREST_ID, GREEN_PLAINS_ID, ICE_ID, groundHeight, resolveWeather, sampleWind, weatherEase,
  weatherProgress } from '@freefall/shared';
import type { AtmosphereState, WindSample, WorldDefinition } from '@freefall/shared';
import type { AudioBus, AudioEngine, AudioPosition, SampleVoice } from './AudioEngine.ts';
import { PRIORITY } from './VoiceBudget.ts';

interface SoundscapeProfile {
  bed: string;
  wind: string;
  details: string;
  baseLevel: number;
  fade: number;
  interval: readonly [seconds: number, variation: number];
  detailRange: readonly [reference: number, cutoff: number];
  weather: Readonly<Record<string, number>>;
}

export const SOUNDSCAPES = {
  [ICE_ID]: {
    bed: 'ice-bed', wind: 'ice-wind', details: 'ice-crack', baseLevel: .44, fade: 3.1,
    interval: [26, 44], detailRange: [13, 82],
    weather: { 'clear-cold': .09, overcast: .17, 'light-snow': .38, 'windy-snow': .69 },
  },
  [DESERT_ID]: {
    bed: 'desert-bed', wind: 'desert-wind', details: 'desert-grit', baseLevel: .43, fade: 3,
    interval: [23, 39], detailRange: [10, 65],
    weather: { 'dry-clear': .07, 'dust-haze': .31, windy: .50, 'light-dust-gusts': .67 },
  },
  [GREEN_PLAINS_ID]: {
    bed: 'plains-bed', wind: 'plains-wind', details: 'grass-rustle', baseLevel: .39, fade: 2.7,
    interval: [19, 40], detailRange: [5, 38],
    weather: { clear: .16, cloudy: .24, windy: .62, 'light-mist': .07 },
  },
  [FOREST_ID]: {
    bed: 'forest-bed', wind: 'forest-wind', details: 'wood-crack', baseLevel: .46, fade: 3,
    interval: [18, 41], detailRange: [8, 53],
    weather: { 'forest-calm': .12, 'windy-forest': .64, 'ground-mist': .08, 'overcast-forest': .24 },
  },
} satisfies Record<string, SoundscapeProfile> as Readonly<Record<string, SoundscapeProfile | undefined>>;

export function takeIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => prefix + '-' + (index + 1));
}

/** Per-group variation, including across adjacent foot contacts on the same material. */
export class Takes {
  private readonly previous = new Map<string, number>();

  pick(key: string, prefix: string, count: number): string {
    return prefix + '-' + (this.index(key, count) + 1);
  }

  index(key: string, count: number): number {
    const last = this.previous.get(key) ?? -1;
    const candidate = Math.floor(Math.random() * (last < 0 ? count : count - 1));
    const next = last >= 0 && candidate >= last ? candidate + 1 : candidate;
    this.previous.set(key, next);
    return next;
  }

  clear(): void { this.previous.clear(); }
}

interface Loop { id: string; voice: SampleVoice }

/** Maintains one live source per logical layer. A retiring source only exists during the crossfade. */
export class AudioLayers {
  private readonly live = new Map<string, Loop>();
  private readonly retiring = new Map<string, SampleVoice>();
  private readonly engine: AudioEngine;

  constructor(engine: AudioEngine) { this.engine = engine; }

  set(key: string, id: string | undefined, bus: AudioBus, level: number, fade: number,
    position?: AudioPosition, range?: readonly [number, number], offset = 0): void {
    if (!this.retiring.get(key)?.active) this.retiring.delete(key);
    const old = this.live.get(key);
    if (id && old?.id === id && old.voice.active) {
      old.voice.volume(level, fade);
      if (position) old.voice.position(position);
      return;
    }
    if (id) {
      const voice = this.engine.play(id, { bus, level, loop: true, fade, position, range, offset,
        owner: key, priority: PRIORITY.bed, hrtf: !!position });
      // Keep the outgoing layer audible while the incoming file is decoding.
      if (!voice && !this.engine.assets.failed(id)) return;
      if (voice) this.live.set(key, { id, voice });
      else this.live.delete(key);
    } else this.live.delete(key);
    if (old?.voice.active) {
      this.retiring.get(key)?.stop();
      old.voice.fadeOut(fade);
      this.retiring.set(key, old.voice);
    }
  }

  clear(): void {
    for (const { voice } of this.live.values()) voice.stop();
    for (const voice of this.retiring.values()) voice.stop();
    this.live.clear();
    this.retiring.clear();
  }

  asset(key: string): string | undefined {
    const loop = this.live.get(key);
    return loop?.voice.active ? loop.id : undefined;
  }
}

export class Soundscape {
  readonly layers: AudioLayers;
  planet?: string;
  weather?: string;
  private nextDetail = Infinity;
  private nextMix = 0;
  private detailReady = false;
  private wind: WindSample = { x: 0, z: 0, direction: 0, strength: 0, gust: 0, turbulence: 0 };
  private details = new Takes();
  private readonly engine: AudioEngine;

  constructor(engine: AudioEngine) { this.engine = engine; this.layers = new AudioLayers(engine); }

  update(now: number, tick: number, planet: string | undefined, world: WorldDefinition | undefined,
    atmosphere: AtmosphereState | undefined, listener: AudioPosition, carrier: boolean): void {
    const changed = planet !== this.planet;
    if (!changed && now < this.nextMix) return;
    this.nextMix = now + 150;
    const profile = planet ? SOUNDSCAPES[planet] : undefined;
    if (changed) {
      this.planet = planet;
      this.detailReady = false;
      this.nextDetail = profile ? now + (14 + Math.random() * 25) * 1000 : Infinity;
    }
    const state = atmosphere?.worldId === world?.id && atmosphere?.planetId === planet ? atmosphere : undefined;
    const current = planet ? resolveWeather(planet, state?.current.weather) : undefined;
    const target = state?.target && planet ? resolveWeather(planet, state.target.weather) : undefined;
    const progress = state ? weatherEase(weatherProgress(state, tick)) : 0;
    if (state) sampleWind(state, tick, progress, this.wind);
    const wind = state ? this.wind : current?.wind;
    let weatherLevel = 0;
    if (profile && current && wind) {
      const from = profile.weather[current.id] ?? 0;
      const to = target ? profile.weather[target.id] ?? from : from;
      weatherLevel = (from + (to - from) * progress) * (.67 + .48 * wind.strength);
    }
    this.weather = current && (target ? current.id + ' → ' + target.id : current.id);
    const phase = (state?.seed ?? 0) % 853 / 13;
    const dayLevel = state?.timeOfDay === 'dawn' || state?.timeOfDay === 'dusk' ? .90 : 1;
    this.layers.set('planet', profile?.bed ?? (carrier ? 'carrier' : undefined), 'ambience',
      (profile?.baseLevel ?? .36) * dayLevel, profile?.fade ?? 1.4, undefined, undefined, phase);
    this.layers.set('wind', profile?.wind, 'weather', weatherLevel, profile?.fade ?? 1.8, undefined, undefined, phase * .63);
    if (profile && !this.detailReady && this.engine.running) {
      this.engine.preload(takeIds(profile.details, 3));
      this.detailReady = true;
    }
    if (!profile || !world || !this.engine.running || now < this.nextDetail) return;
    const [interval, variation] = profile.interval;
    this.nextDetail = now + (interval + Math.random() * variation) * 1000;

    // Prefer upwind landmarks inside the audible radius. A distant ground point is the fallback in open areas.
    const direction = (wind?.direction ?? 0) + (Math.random() - .5) * Math.PI;
    const radius = profile.detailRange[1];
    const dx = Math.cos(direction), dz = Math.sin(direction);
    let distance = radius * .83;
    let x = listener.x + dx * radius * .42, z = listener.z + dz * radius * .42;
    for (const obstacle of world.obstacles) {
      const ox = obstacle.x - listener.x, oz = obstacle.z - listener.z;
      if (ox * dx + oz * dz < 4) continue;
      const range = Math.hypot(ox, oz);
      if (range < 11 || range >= distance) continue;
      x = obstacle.x; z = obstacle.z; distance = range;
    }
    x = Math.max(-world.half, Math.min(world.half, x));
    z = Math.max(-world.half, Math.min(world.half, z));
    this.engine.play(this.details.pick(planet!, profile.details, 3),
      { bus: 'environment', level: .43 + Math.random() * .13, position: { x, y: groundHeight(world, x, z) + 1.7, z },
        range: profile.detailRange, pitch: .88 + Math.random() * .22, priority: PRIORITY.detail });
  }

  clear(): void {
    this.layers.clear();
    this.details.clear();
    this.planet = this.weather = undefined;
    this.nextMix = 0;
    this.nextDetail = Infinity;
    this.detailReady = false;
  }
}
