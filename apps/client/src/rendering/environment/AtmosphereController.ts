import * as T from 'three';
import { NET, groundHeight, resolveWeather, sampleWind, weatherEase, weatherLerp, weatherProgress } from '@freefall/shared';
import type { AtmosphereState, PlanetAtmosphereProfile, TimeOfDay, WeatherProfile, WindSample, WorldDefinition } from '@freefall/shared';
import { VegetationWind } from './VegetationWind.ts';
import { WeatherParticles } from './WeatherParticles.ts';
import type { GraphicsQuality } from '../GraphicsQuality.ts';

const LIGHTING = {
  day:          { elevation: 1,    sun: 1,   fill: 1,   exposure: 1,   sky: 1,   tint: 0,   color: 0xffffff },
  'overcast-day': { elevation: .95, sun: .79, fill: 1.08, exposure: .99, sky: .92, tint: .19, color: 0xb2bfcb },
  dawn:         { elevation: .42, sun: .77, fill: .93, exposure: .98, sky: .83, tint: .21, color: 0xbba6a9 },
  dusk:         { elevation: .32, sun: .75, fill: .91, exposure: .96, sky: .78, tint: .27, color: 0xc1a286 },
} satisfies Record<TimeOfDay, object>;

export class AtmosphereLighting {
  readonly fog = new T.Color();
  readonly skyTint = new T.Color();
  readonly sunTint = new T.Color();
  fogDensity = 0;
  skyAmount = 0;
  skyBrightness = 1;
  sun = 1;
  fill = 1;
  exposure = 1;
  elevation = 1;
}

export class AtmosphereController {
  readonly wind = new VegetationWind();
  private readonly lighting = new AtmosphereLighting();
  private readonly haze = new T.Color();
  private readonly windSample: WindSample = { x: 0, z: 0, direction: 0, strength: 0, gust: 0, turbulence: 0 };
  private particles?: WeatherParticles;
  private cached?: { state: AtmosphereState; current: WeatherProfile; target: WeatherProfile };
  private run?: string;
  private phaseTick = 0;
  private cameraHeight = 0;
  private ground = 0;
  private groundX = Infinity;
  private groundZ = Infinity;
  private snapshot?: {
    planet: string; profile: string; version: number; revision: number; current: string; timeOfDay: TimeOfDay;
    audio: string; target?: string; targetAudio?: string; seed: number; startTick: number; durationTicks: number;
  };
  private progress = 0;
  private updateMs = 0;
  private particlesMs = 0;
  private quality = 0;

  private readonly scene: T.Scene;

  constructor(scene: T.Scene) { this.scene = scene; }

  update(state: AtmosphereState | undefined, world: WorldDefinition | undefined, profile: PlanetAtmosphereProfile | undefined,
    tick: number, dt: number, camera: T.Camera, quality: GraphicsQuality, reduced: boolean, pixelRatio: number,
    visible: boolean, debug: boolean): AtmosphereLighting | undefined {
    if (!state || !world || state.worldId !== world.id || profile?.id !== state.profileId) {
      this.clear();
      return;
    }
    if (state.instanceId !== this.run) {
      this.clear();
      this.run = state.instanceId;
      this.phaseTick = tick;
    }
    if (!visible) {
      if (this.particles) this.particles.points.visible = false;
      return;
    }
    const started = debug ? performance.now() : 0;
    const altitude = this.altitude(world, camera, dt);
    if (this.cached?.state !== state) {
      const current = resolveWeather(state.planetId, state.current.weather)!;
      const target = resolveWeather(state.planetId, state.target?.weather) ?? current;
      this.cached = { state, current, target: state.target ? target : current };
      this.snapshot = {
        planet: state.planetId, profile: state.profileId, version: state.version, revision: state.revision,
        current: current.id, target: state.target && target.id, timeOfDay: state.timeOfDay,
        audio: current.audio, targetAudio: state.target ? target.audio : undefined, seed: state.seed,
        startTick: state.startTick, durationTicks: state.durationTicks,
      };
    }
    const { current: a, target: b } = this.cached;
    this.phaseTick = Math.max(this.phaseTick, tick);
    this.progress = weatherProgress(state, this.phaseTick);
    const mix = weatherEase(this.progress);
    const time = Math.max(0, (this.phaseTick - state.originTick) / NET.tickHz);
    sampleWind(state, this.phaseTick, mix, this.windSample);
    const wind = this.windSample;
    const motion = reduced ? 0 : 1;
    const response = weatherLerp(a.vegetation, b.vegetation, mix) * quality.vegetationMotion * motion;
    this.wind.flow.value.set(wind.x * response, wind.z * response, time * 1.52, wind.turbulence * response);

    const day = LIGHTING[state.timeOfDay];
    const light = this.lighting;
    const cloud = weatherLerp(a.cloud, b.cloud, mix);
    const haze = weatherLerp(a.hazeMix, b.hazeMix, mix);
    const mist = weatherLerp(a.groundMist, b.groundMist, mix);
    this.haze.setHex(a.hazeColor);
    if (a.hazeColor !== b.hazeColor) this.haze.lerp(light.skyTint.setHex(b.hazeColor), mix);
    light.fog.setHex(profile.fog.color).lerp(this.haze, haze).lerp(light.sunTint.setHex(day.color), day.tint * .42);
    const mistLayer = 1 - T.MathUtils.smoothstep(altitude, .8, 8);
    const sheet = .83 + motion * .14 * Math.sin(time * .15 + camera.position.x * .046 + camera.position.z * .036);
    light.fogDensity = Math.min(.0081, weatherLerp(a.fogDensity, b.fogDensity, mix) + mist * mistLayer * sheet);
    light.fill = day.fill * (1 + cloud * .075);
    light.sun = day.sun * (1 - cloud * .31);
    light.exposure = day.exposure * (1 - cloud * .033);
    light.elevation = day.elevation;
    light.skyTint.copy(this.haze).lerp(light.sunTint, day.tint);
    light.skyAmount = Math.min(.58, cloud * .42 + haze * .24 + day.tint);
    light.skyBrightness = day.sky * (1 - cloud * .115);
    light.sunTint.setHex(0xffffff).lerp(this.haze.setHex(day.color), day.tint * 1.58);

    const particleStart = debug ? performance.now() : 0;
    const density = weatherLerp(a.density, b.density, mix) * motion;
    const count = quality.weatherParticles * density * (1 - T.MathUtils.smoothstep(altitude, 7, 17));
    const particle = a.particle === 'none' ? b.particle : a.particle;
    if (count > 0 && !this.particles) this.particles = new WeatherParticles(this.scene, state.seed);
    const velocity = a.density && b.density ? weatherLerp(a.velocity, b.velocity, mix) : a.velocity || b.velocity;
    this.particles?.update(world, camera, particle, count, velocity, dt, wind.x, wind.z, wind.gust, pixelRatio);
    this.particlesMs = debug ? performance.now() - particleStart : 0;
    this.updateMs = debug ? performance.now() - started : 0;
    this.quality = quality.weatherParticles;
    return light;
  }

  private altitude(world: WorldDefinition, camera: T.Camera, dt: number): number {
    // Sample operator-relative relief for mist and weather volume gating without creating geometry.
    const { x, y, z } = camera.position;
    if (Math.abs(x - this.groundX) + Math.abs(z - this.groundZ) > .25) {
      this.groundX = x;
      this.groundZ = z;
      this.ground = world.terrain ? groundHeight(world, x, z) : 0;
    }
    const height = Math.max(0, y - this.ground);
    this.cameraHeight += (height - this.cameraHeight) * (1 - Math.exp(-dt * 9));
    return this.cameraHeight;
  }

  metrics() {
    return this.snapshot && { ...this.snapshot, progress: this.progress, ...this.windSample,
      particles: this.particles?.points.visible ? this.particles.count : 0,
      cap: this.quality, particleMs: this.particlesMs, updateMs: this.updateMs };
  }

  finish(instanceId: string | undefined): AtmosphereLighting | undefined {
    if (!this.cached || this.run !== instanceId) return;
    // Keep the last exposure and fog on the result backdrop while stopping cosmetic motion.
    this.particles?.dispose();
    this.particles = this.snapshot = undefined;
    this.wind.flow.value.setScalar(0);
    return this.lighting;
  }

  clear(): void {
    if (!this.run) return;
    this.particles?.dispose();
    this.particles = this.cached = this.snapshot = this.run = undefined;
    this.groundX = this.groundZ = Infinity;
    this.cameraHeight = 0;
    this.wind.flow.value.setScalar(0);
  }
}
