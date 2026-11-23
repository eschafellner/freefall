import * as T from 'three';
import { NET, groundHeight, resolveWeather, sampleWind, weatherEase, weatherLerp, weatherProgress } from '@freefall/shared';
import type { AtmosphereState, PlanetAtmosphereProfile, TimeOfDay, WeatherProfile, WindSample, WorldDefinition } from '@freefall/shared';
import { VegetationWind } from './VegetationWind.ts';
import { WeatherParticles } from './WeatherParticles.ts';
import type { GraphicsQuality } from '../GraphicsQuality.ts';

/**
 * Light mood per time of day, applied on top of the planet's daylight profile. Colours are targets the profile is
 * blended toward; factors scale the profile. `azimuth` turns the sun around the vertical axis (radians), so dawn and
 * dusk light the world from opposite sides with long shadows.
 */
export interface TimeOfDayLight {
  elevation: number; azimuth: number;
  sun: number; sunColor: number;
  fill: number; fillSky: number; fillGround: number; fillMix: number;
  environment: number; exposure: number;
  /** Sky brightness and how far the sky is pulled toward neutral grey. */
  sky: number; desaturate: number;
  /** Warm horizon band toward the sun and the zenith tint (0 = off). */
  glow: number; glowColor: number; zenith: number; zenithColor: number;
  fogColor: number; fogMix: number;
}

export const TIME_OF_DAY_LIGHT: Readonly<Record<TimeOfDay, Readonly<TimeOfDayLight>>> = {
  day: {
    elevation: 1, azimuth: 0, sun: 1, sunColor: 0xffffff, fill: 1, fillSky: 0xffffff, fillGround: 0xffffff, fillMix: 0,
    environment: 1, exposure: 1, sky: 1, desaturate: 0, glow: 0, glowColor: 0xffffff, zenith: 0, zenithColor: 0xffffff,
    fogColor: 0xffffff, fogMix: 0,
  },
  'overcast-day': {
    elevation: .95, azimuth: 0, sun: .74, sunColor: 0xe4eaf0, fill: 1.12, fillSky: 0xc4ced8, fillGround: 0x7e8079, fillMix: .5,
    environment: 1.15, exposure: .97, sky: .9, desaturate: .5, glow: 0, glowColor: 0xffffff, zenith: .22, zenithColor: 0x9aa4ad,
    fogColor: 0xa9b1b5, fogMix: .45,
  },
  // Morgenrot: rose-orange low sun, violet-blue zenith, pink haze.
  dawn: {
    elevation: .32, azimuth: -1.15, sun: .86, sunColor: 0xffa46c, fill: .9, fillSky: 0xa4a6dc, fillGround: 0x8a6a62, fillMix: .6,
    environment: .82, exposure: 1, sky: .9, desaturate: .04, glow: 1, glowColor: 0xff8656, zenith: .55, zenithColor: 0x6676c2,
    fogColor: 0xdba496, fogMix: .52,
  },
  // Abendrot: deep orange-red sun, glowing horizon band, indigo zenith.
  dusk: {
    elevation: .26, azimuth: 1.99, sun: .9, sunColor: 0xff7e3c, fill: .84, fillSky: 0x9488cc, fillGround: 0x7a5648, fillMix: .62,
    environment: .76, exposure: .98, sky: .84, desaturate: .03, glow: 1.2, glowColor: 0xff6630, zenith: .62, zenithColor: 0x4a5199,
    fogColor: 0xdc916c, fogMix: .55,
  },
};

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
  azimuth = 0;
  environment = 1;
  readonly fillSky = new T.Color();
  readonly fillGround = new T.Color();
  readonly glow = new T.Color();
  glowAmount = 0;
  readonly zenith = new T.Color();
  zenithAmount = 0;
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

    const day = TIME_OF_DAY_LIGHT[state.timeOfDay];
    const light = this.lighting;
    const cloud = weatherLerp(a.cloud, b.cloud, mix);
    const haze = weatherLerp(a.hazeMix, b.hazeMix, mix);
    const mist = weatherLerp(a.groundMist, b.groundMist, mix);
    this.haze.setHex(a.hazeColor);
    if (a.hazeColor !== b.hazeColor) this.haze.lerp(light.skyTint.setHex(b.hazeColor), mix);
    light.fog.setHex(profile.fog.color).lerp(this.haze, haze).lerp(light.sunTint.setHex(day.fogColor), day.fogMix);
    const mistLayer = 1 - T.MathUtils.smoothstep(altitude, .8, 8);
    const sheet = .83 + motion * .14 * Math.sin(time * .15 + camera.position.x * .046 + camera.position.z * .036);
    light.fogDensity = Math.min(.0081, weatherLerp(a.fogDensity, b.fogDensity, mix) + mist * mistLayer * sheet);
    light.fill = day.fill * (1 + cloud * .075);
    light.sun = day.sun * (1 - cloud * .31);
    light.exposure = day.exposure * (1 - cloud * .033);
    light.elevation = day.elevation;
    light.azimuth = day.azimuth;
    light.environment = day.environment;
    light.skyTint.copy(this.haze).lerp(light.fog, day.fogMix);
    light.skyAmount = Math.min(.58, cloud * .42 + haze * .24 + day.desaturate);
    light.skyBrightness = day.sky * (1 - cloud * .115);
    // Clouds and haze mute the colour of the low sun and of the sky glow.
    const muted = 1 - Math.min(.6, cloud * .45 + haze * .25);
    light.sunTint.setHex(0xffffff).lerp(this.haze.setHex(day.sunColor), muted);
    light.fillSky.setHex(profile.fill.sky).lerp(this.haze.setHex(day.fillSky), day.fillMix);
    light.fillGround.setHex(profile.fill.ground).lerp(this.haze.setHex(day.fillGround), day.fillMix);
    light.glow.setHex(day.glowColor);
    light.glowAmount = day.glow * muted;
    light.zenith.setHex(day.zenithColor);
    light.zenithAmount = day.zenith * (1 - cloud * .5);

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
