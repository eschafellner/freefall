import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  NET, WEATHER_VERSION, WORLD_PROFILES, generateWorld, planetWeather, resolveWeather, sampleWind,
  validAtmosphereState, validWeatherProfile, weatherEase, weatherProgress,
} from '@freefall/shared';
import type { WindSample } from '@freefall/shared';
import { MissionAtmosphere } from '../src/mission/MissionAtmosphere.ts';
import { missionGenerator } from '../src/mission/MissionGenerator.ts';

const identity = generateWorld('forest', 63)!.identity;

test('planet weather data validates its light profile, ranges, resources and biome', () => {
  for (const { id } of WORLD_PROFILES.values()) {
    const profiles = planetWeather(id);
    assert.equal(new Set(profiles.map((profile) => profile.id)).size, 4);
    for (const profile of profiles) assert.ok(validWeatherProfile(id, profile));
    assert.equal(resolveWeather(id, 'wrong'), profiles[0]);
  }
  const snow = resolveWeather('ice', 'windy-snow')!;
  assert.equal(resolveWeather('unknown'), undefined);
  assert.equal(validWeatherProfile('ice', undefined), false);
  assert.equal(validWeatherProfile('desert', snow), false);
  for (const patch of [{ fogDensity: Infinity }, { density: NaN }, { transitionSeconds: 0 },
    { particle: 'dust' }, { lightingId: 'forest.filtered-day.v1' }, { wind: { ...snow.wind, direction: -1 } }]) {
    assert.equal(validWeatherProfile('ice', { ...snow, ...patch }), false);
  }
});

test('equal seeds reproduce the sequence, including transitions and their completion on the shared tick', () => {
  const a = new MissionAtmosphere('a', identity, 0, 50, 'dusk');
  const b = new MissionAtmosphere('a', identity, 0, 50, 'dusk');
  const different = new MissionAtmosphere('b', identity, 1, 50, 'dusk');
  assert.notEqual(a.state.seed, different.state.seed);
  assert.notEqual(a.state.seed, new MissionAtmosphere('a', generateWorld('forest', 64)!.identity, 0, 50).state.seed);
  const initial = a.state;
  let starts = 0, completions = 0, previous = a.state;
  for (let tick = 50; tick <= 1800 * NET.tickHz; tick++) {
    a.update(tick);
    b.update(tick);
    if (a.state === previous) continue;
    assert.deepEqual(a.state, b.state);
    assert.ok(validAtmosphereState(JSON.parse(JSON.stringify(a.state))));
    if (a.state.target) {
      starts++;
      assert.equal(weatherProgress(a.state, tick), 0);
      assert.equal(weatherProgress(a.state, tick + a.state.durationTicks / 2), .5);
      assert.equal(weatherProgress(a.state, tick + a.state.durationTicks), 1);
      assert.notEqual(a.state.current.weather, a.state.target.weather);
    } else {
      completions++;
      assert.deepEqual(a.state.current, previous.target);
    }
    previous = a.state;
  }
  assert.equal(initial.version, WEATHER_VERSION);
  assert.equal(initial.timeOfDay, 'dusk');
  assert.ok(starts >= 5 && completions >= 5);
  assert.equal(validAtmosphereState({ ...initial, version: -1 }), false);
  assert.equal(validAtmosphereState({ ...initial, originTick: NaN }), false);
  assert.equal(validAtmosphereState({ ...initial, current: { ...initial.current, weather: 'windy-snow' } }), false);
});

test('a replacement transition waits for a continuous endpoint and applies bounded debug wind', () => {
  const weather = new MissionAtmosphere('run', identity, 55, 100);
  assert.equal(weather.debug(100, 'weather:windy-snow'), false);
  assert.equal(weather.debug(100, 'weather:ground-mist:270:NaN'), false);
  assert.ok(weather.debug(100, 'weather:ground-mist:359:0'));
  const firstTransition = weather.state;
  assert.ok(weather.debug(101, 'weather:windy-forest:1:1'));
  assert.equal(weather.state, firstTransition);
  weather.update(160);
  assert.equal(weather.state.current.weather, 'ground-mist');
  assert.equal(weather.state.target?.weather, 'windy-forest');
  const wind: WindSample = { x: 0, z: 0, direction: 0, strength: 0, gust: 0, turbulence: 0 };
  sampleWind(weather.state, 160, 0, wind);
  assert.equal(Math.hypot(wind.x, wind.z), 0);
  sampleWind(weather.state, 190, weatherEase(.5), wind);
  assert.ok(wind.x > .49 && Math.abs(wind.z) < .01, JSON.stringify(wind));
  weather.update(220);
  sampleWind(weather.state, 220, 0, wind);
  assert.ok(wind.x > .99);
  assert.equal(weather.state.target, undefined);
});

test('optional time of day preserves the generated mission geometry and rejects incompatible settings', () => {
  const request = { planetId: 'forest', worldSeed: 63, seed: 0, templateId: 'relay-defense', difficultyId: 'normal' };
  const daylight = missionGenerator.generate(request);
  const dawn = missionGenerator.generate({ ...request, timeOfDay: 'dawn' });
  assert.ok(daylight.status === 'generated' && dawn.status === 'generated');
  assert.equal(daylight.plan.worldId, dawn.plan.worldId);
  assert.deepEqual(daylight.plan.objectives, dawn.plan.objectives);
  assert.deepEqual(daylight.plan.extraction, dawn.plan.extraction);
  assert.equal(dawn.plan.timeOfDay, 'dawn');
  assert.equal(missionGenerator.validate({ ...dawn.plan, timeOfDay: 'midnight' }), 'invalid-version-or-seed');
});
