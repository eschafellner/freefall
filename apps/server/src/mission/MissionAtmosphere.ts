import { NET, WEATHER_VERSION, planetWeather, weatherHash } from '@freefall/shared';
import type { AtmosphereEndpoint, AtmosphereState, TimeOfDay, WeatherProfile, WindProfile, WorldIdentity } from '@freefall/shared';

export class MissionAtmosphere {
  private nextTick: number;
  private sequence = 0;
  private queued?: { endpoint: AtmosphereEndpoint; ticks: number };
  private readonly profiles: readonly WeatherProfile[];
  private stateValue: AtmosphereState;
  get state(): AtmosphereState { return this.stateValue; }

  constructor(instanceId: string, world: WorldIdentity, missionSeed: number, tick: number, timeOfDay: TimeOfDay = 'day') {
    this.profiles = planetWeather(world.planetId);
    const seed = weatherHash(world.seed ^ weatherHash(missionSeed) ^ Math.imul(WEATHER_VERSION, 0x9e3779b1));
    const profile = this.profiles[weatherHash(seed) % this.profiles.length];
    this.stateValue = {
      instanceId, worldId: world.id, planetId: world.planetId, profileId: profile.lightingId,
      version: WEATHER_VERSION, seed, originTick: tick, timeOfDay, revision: 0, current: this.endpoint(profile),
      startTick: tick, durationTicks: 0,
    };
    this.nextTick = tick + this.dwell(0);
  }

  private endpoint(profile: WeatherProfile, wind: Partial<WindProfile> = {}): AtmosphereEndpoint {
    return { weather: profile.id, wind: { ...profile.wind, ...wind } };
  }

  private dwell(index: number): number {
    return (175 + weatherHash(this.state.seed ^ (index + 1)) % 101) * NET.tickHz;
  }

  private begin(tick: number, target: AtmosphereEndpoint, durationTicks: number): void {
    this.stateValue = { ...this.state, target, startTick: tick, durationTicks, revision: this.state.revision + 1 };
  }

  update(tick: number): void {
    const { target, startTick, durationTicks } = this.state;
    if (target) {
      if (tick < startTick + durationTicks) return;
      this.stateValue = { ...this.state, current: target, target: undefined, startTick: tick, durationTicks: 0, revision: this.state.revision + 1 };
      this.nextTick = tick + this.dwell(this.sequence);
    }
    if (this.queued) {
      this.begin(tick, this.queued.endpoint, this.queued.ticks);
      this.queued = undefined;
    } else if (tick >= this.nextTick && this.profiles.length > 1) {
      const candidates = this.profiles.filter(({ id }) => id !== this.state.current.weather);
      const profile = candidates[weatherHash(this.state.seed ^ ++this.sequence) % candidates.length];
      this.begin(tick, this.endpoint(profile), profile.transitionSeconds * NET.tickHz);
    }
  }

  debug(tick: number, action: string): boolean {
    const [kind, id, degrees, strength, seconds, extra] = action.split(':');
    const profile = this.profiles.find((entry) => entry.id === id);
    const duration = seconds === undefined ? 2 : Number(seconds);
    if (kind !== 'weather' || !profile || extra !== undefined || !Number.isInteger(duration) || duration < 2 || duration > 120) return false;
    const wind = !degrees && !strength ? undefined : {
      direction: Number(degrees) * Math.PI / 180, strength: Number(strength), gust: 0, turbulence: 0,
    };
    if (wind && (!degrees || !strength || !(wind.direction >= 0 && wind.direction <= Math.PI * 2 &&
      wind.strength >= 0 && wind.strength <= 1))) return false;
    this.queued = { endpoint: this.endpoint(profile, wind), ticks: duration * NET.tickHz };
    this.update(tick);
    return true;
  }
}
