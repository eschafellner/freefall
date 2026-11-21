import { NET } from '../config/arena.ts';
import { DESERT_ID, FOREST_ID, GREEN_PLAINS_ID, ICE_ID, WORLD_PROFILES } from './PlanetProfiles.ts';

export const WEATHER_VERSION = 1;
const TAU = 2 * Math.PI;

export const TIME_OF_DAY = {
  day: 'Tag', 'overcast-day': 'Bedeckter Tag', dawn: 'Morgendämmerung', dusk: 'Abenddämmerung',
} as const;
export type TimeOfDay = keyof typeof TIME_OF_DAY;
export function isTimeOfDay(value: unknown): value is TimeOfDay {
  return typeof value === 'string' && Object.hasOwn(TIME_OF_DAY, value);
}

export type WeatherParticle = 'none' | 'snow' | 'dust';
export interface WindProfile {
  readonly direction: number;
  readonly strength: number;
  readonly gust: number;
  readonly frequency: number;
  readonly turbulence: number;
}

export interface WeatherProfile {
  readonly id: string;
  readonly planetId: string;
  readonly lightingId: string;
  readonly fogDensity: number;
  readonly hazeColor: number;
  readonly hazeMix: number;
  readonly groundMist: number;
  readonly cloud: number;
  readonly wind: WindProfile;
  readonly vegetation: number;
  readonly particle: WeatherParticle;
  readonly density: number;
  readonly velocity: number;
  readonly transitionSeconds: number;
  readonly audio: string;
}

function biome(planetId: string, hazeColor: number, direction: number, particle: WeatherParticle, profiles: readonly (
  readonly [id: string, fogDensity: number, groundMist: number, cloud: number, strength: number, gust: number,
    vegetation: number, density: number, velocity: number]
)[]): readonly WeatherProfile[] {
  return profiles.map(([id, fogDensity, groundMist, cloud, strength, gust, vegetation, density, velocity], index) => ({
    id, planetId, lightingId: WORLD_PROFILES.get(planetId)!.atmosphere.id, fogDensity, hazeColor,
    hazeMix: Math.max(cloud * .46, density * .25, groundMist * 150), groundMist, cloud,
    wind: { direction: (direction + index * .30) % TAU, strength, gust, frequency: .065 + index * .016, turbulence: .16 + gust * .4 },
    vegetation, particle: density ? particle : 'none', density, velocity, transitionSeconds: 28 + index * 4,
    audio: 'ambience.' + planetId + '.' + id,
  }));
}

const PROFILES: ReadonlyMap<string, readonly WeatherProfile[]> = new Map([
  [ICE_ID, biome(ICE_ID, 0xb7c6cf, 5.9, 'snow', [
    ['clear-cold', .0044, 0, 0, .24, .13, 0, 0, 0],
    ['overcast', .0050, 0, .63, .28, .17, 0, 0, 0],
    ['light-snow', .0054, 0, .52, .42, .22, 0, .67, 1.35],
    ['windy-snow', .0065, .0007, .73, .69, .29, 0, 1, 1.7],
  ])],
  [DESERT_ID, biome(DESERT_ID, 0xb4a189, .6, 'dust', [
    ['dry-clear', .0041, 0, 0, .23, .11, .3, 0, 0],
    ['dust-haze', .0063, .0008, .34, .42, .22, .62, .62, 2.25],
    ['windy', .0049, 0, .14, .63, .30, .83, .27, 3.6],
    ['light-dust-gusts', .0060, .0012, .31, .67, .31, 1, 1, 3.8],
  ])],
  [GREEN_PLAINS_ID, biome(GREEN_PLAINS_ID, 0xb2bfb9, 2.6, 'none', [
    ['clear', .0035, 0, 0, .25, .14, .68, 0, 0],
    ['cloudy', .0045, 0, .78, .36, .14, .74, 0, 0],
    ['windy', .0039, 0, .22, .65, .28, 1, 0, 0],
    ['light-mist', .0054, .0015, .40, .18, .12, .62, 0, 0],
  ])],
  [FOREST_ID, biome(FOREST_ID, 0xa5b5af, 3.7, 'none', [
    ['forest-calm', .0052, 0, 0, .19, .11, .64, 0, 0],
    ['windy-forest', .0054, 0, .24, .61, .28, 1, 0, 0],
    ['ground-mist', .0062, .0022, .45, .26, .14, .78, 0, 0],
    ['overcast-forest', .0060, 0, .76, .33, .18, .79, 0, 0],
  ])],
]);

const between = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const unit = (value: unknown) => between(value, 0, 1);
const uint32 = (value: unknown): value is number => between(value, 0, 0xffffffff) && Number.isInteger(value);
const tickValue = (value: unknown): value is number => between(value, 0, Number.MAX_SAFE_INTEGER) && Number.isInteger(value);

function validWind(wind: WindProfile | undefined): boolean {
  return !!wind && between(wind.direction, 0, TAU) && unit(wind.strength) && unit(wind.gust) &&
    between(wind.frequency, 0, .25) && unit(wind.turbulence);
}

export function validWeatherProfile(planetId: string, data: unknown): data is WeatherProfile {
  if (!data || typeof data !== 'object') return false;
  const p = data as WeatherProfile;
  const lighting = WORLD_PROFILES.get(planetId)?.atmosphere;
  const particle = planetId === ICE_ID ? 'snow' : planetId === DESERT_ID ? 'dust' : 'none';
  return !!lighting && p.planetId === planetId && p.lightingId === lighting.id &&
    typeof p.id === 'string' && /^[a-z][a-z-]{1,31}$/.test(p.id) &&
    between(p.fogDensity, .002, .008) && between(p.hazeColor, 0, 0xffffff) && Number.isInteger(p.hazeColor) &&
    unit(p.hazeMix) && between(p.groundMist, 0, .0025) && unit(p.cloud) && validWind(p.wind) &&
    unit(p.vegetation) && unit(p.density) && between(p.velocity, 0, 6) &&
    (p.density === 0 ? p.particle === 'none' && p.velocity === 0 : p.particle !== 'none' && p.particle === particle && p.velocity > 0) &&
    between(p.transitionSeconds, 2, 120) && p.audio === 'ambience.' + planetId + '.' + p.id;
}

const VALID_PROFILES = new Map([...PROFILES].map(([planet, profiles]) => [
  planet, Object.freeze(profiles.filter((profile) => validWeatherProfile(planet, profile))
    .map((profile) => Object.freeze({ ...profile, wind: Object.freeze(profile.wind) }))),
]));

export function planetWeather(planetId: string): readonly WeatherProfile[] {
  return VALID_PROFILES.get(planetId) ?? [];
}

export function resolveWeather(planetId: string, id?: string): WeatherProfile | undefined {
  const profiles = planetWeather(planetId);
  return profiles.find((profile) => profile.id === id) ?? profiles[0];
}

export interface AtmosphereEndpoint {
  readonly weather: string;
  readonly wind: WindProfile;
}

export interface AtmosphereState {
  readonly version: number;
  readonly instanceId: string;
  readonly worldId: string;
  readonly planetId: string;
  readonly profileId: string;
  readonly seed: number;
  readonly timeOfDay: TimeOfDay;
  readonly originTick: number;
  readonly revision: number;
  readonly current: AtmosphereEndpoint;
  readonly target?: AtmosphereEndpoint;
  readonly startTick: number;
  readonly durationTicks: number;
}

export function validAtmosphereState(data: unknown): data is AtmosphereState {
  if (!data || typeof data !== 'object') return false;
  const s = data as AtmosphereState;
  const profiles = planetWeather(s.planetId);
  const endpoint = (value?: AtmosphereEndpoint) => value && validWind(value.wind) &&
    profiles.some(({ id }) => id === value.weather);
  return s.version === WEATHER_VERSION && typeof s.instanceId === 'string' && !!s.instanceId &&
    typeof s.worldId === 'string' && !!s.worldId && !!profiles.length && s.profileId === profiles[0].lightingId &&
    uint32(s.seed) && isTimeOfDay(s.timeOfDay) && tickValue(s.originTick) && tickValue(s.revision) &&
    tickValue(s.startTick) && s.startTick >= s.originTick && tickValue(s.durationTicks) && !!endpoint(s.current) &&
    (s.target === undefined ? s.durationTicks === 0 : !!endpoint(s.target) && between(s.durationTicks, 2 * NET.tickHz, 120 * NET.tickHz));
}

export function weatherHash(seed: number): number {
  seed = Math.imul(seed ^ (seed >>> 16), 0x7feb352d);
  seed = Math.imul(seed ^ (seed >>> 15), 0x846ca68b);
  return (seed ^ (seed >>> 16)) >>> 0;
}

export const weatherLerp = (a: number, b: number, progress: number) => a + (b - a) * progress;
export function weatherProgress(state: AtmosphereState, tick: number): number {
  return state.target ? Math.max(0, Math.min(1, (tick - state.startTick) / state.durationTicks)) : 0;
}
export const weatherEase = (progress: number) => progress * progress * (3 - 2 * progress);

export interface WindSample {
  x: number;
  z: number;
  direction: number;
  strength: number;
  gust: number;
  turbulence: number;
}

function gustEnvelope(t: number, frequency: number, phase: number): number {
  return .5 + .32 * Math.sin(t * TAU * frequency + phase) + .18 * Math.sin(t * TAU * frequency * 1.73 - phase);
}

export function sampleWind(state: AtmosphereState, tick: number, progress: number, out: WindSample): void {
  const a = state.current.wind;
  const b = state.target?.wind ?? a;
  const t = Math.max(0, (tick - state.originTick) / NET.tickHz);
  const phase = state.seed / 0x100000000 * TAU;
  // Sample both oscillators before crossfading. Interpolating their frequencies would skip phase.
  const gust = weatherLerp(a.gust * gustEnvelope(t, a.frequency, phase), b.gust * gustEnvelope(t, b.frequency, phase), progress);
  const turbulence = weatherLerp(a.turbulence, b.turbulence, progress);
  const delta = (b.direction - a.direction + TAU * 1.5) % TAU - Math.PI;
  const direction = (a.direction + delta * progress + Math.sin(t * .31 + phase) * turbulence * .28 + TAU) % TAU;
  const strength = Math.min(1, weatherLerp(a.strength, b.strength, progress) + gust);
  out.x = Math.cos(direction) * strength;
  out.z = Math.sin(direction) * strength;
  out.direction = direction;
  out.strength = strength;
  out.gust = gust;
  out.turbulence = turbulence;
}
