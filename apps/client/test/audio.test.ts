import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { BODENBRUCH, HordeFrame, NET, WORLD_PROFILES, generateWorld, newPosture, planetWeather } from '@freefall/shared';
import type { DiveState, PlayerState } from '@freefall/shared';
import { AudioEngine } from '../src/audio/AudioEngine.ts';
import { HordeAudio, attackPhase } from '../src/audio/HordeAudio.ts';
import { AudioEventHistory } from '../src/audio/MissionAudio.ts';
import { MovementAudio, surfaceAudio } from '../src/audio/MovementAudio.ts';
import { AudioLayers, SOUNDSCAPES, Soundscape } from '../src/audio/Soundscape.ts';
import { PRIORITY, VOICE_LIMIT, VoiceBudget } from '../src/audio/VoiceBudget.ts';

const here = new URL('.', import.meta.url);
const meters = { x: 0, y: 0, z: 0 };

test('spatial audio accepts Web Audio listeners with legacy setters', () => {
  const positions: number[][] = [];
  const orientations: number[][] = [];
  const engine = new AudioEngine();
  engine.settings.enabled = true;
  engine.context = { state: 'running', currentTime: 1, listener: {
    setPosition: (...args: number[]) => positions.push(args),
    setOrientation: (...args: number[]) => orientations.push(args),
  } } as unknown as AudioContext;
  const position = { x: 3, y: 1.5, z: -5 };
  engine.listener(position, 0);
  engine.listener(position, 0);
  assert.deepEqual(positions, [[3, 1.5, -5]]);
  assert.deepEqual(orientations, [[0, 0, -1, 0, 1, 0]]);
});

test('audio catalog covers every weather profile and the encoded assets match their source manifest', () => {
  const dir = new URL('../public/audio/', here);
  const read = (file: string) => JSON.parse(readFileSync(new URL('../../../docs/' + file, here), 'utf8'));
  const src = read('audio-sources.json');
  const catalog = read('audio-masters.json') as { id: string; source: string; sha256: Record<string, string> }[];
  const expected: string[] = [];
  const ids = new Set(catalog.map(({ id }) => id));
  for (const [id, profile] of WORLD_PROFILES) {
    const sound = SOUNDSCAPES[id]!;
    assert.ok(sound.baseLevel > 0 && profile.id === id);
    assert.deepEqual(Object.keys(sound.weather).sort(), planetWeather(id).map(({ id }) => id).sort());
    for (const id of [sound.bed, sound.wind, sound.details + '-1']) assert.ok(ids.has(id), id);
  }
  for (const asset of catalog) {
    assert.equal(src[asset.source].license, 'CC0 1.0');
    assert.ok(src[asset.source].source.startsWith('https://'));
    for (const extension of ['ogg', 'mp3']) {
      const file = asset.id + '.' + extension;
      expected.push(file);
      assert.equal(createHash('sha256').update(readFileSync(new URL(file, dir))).digest('hex'), asset.sha256[extension]);
    }
  }
  assert.deepEqual(readdirSync(dir).sort(), expected.sort());
});

test('owner-provided effects outside the CC0 library match their manifest', () => {
  const dir = new URL('../public/sfx/', here);
  const manifest = JSON.parse(readFileSync(new URL('../../../docs/sfx-sources.json', here), 'utf8')) as
    { id: string; rights: string; sha256: Record<string, string> }[];
  const expected: string[] = [];
  for (const asset of manifest) {
    assert.ok(asset.rights);
    for (const extension of ['ogg', 'mp3']) {
      const file = asset.id + '.' + extension;
      expected.push(file);
      assert.equal(createHash('sha256').update(readFileSync(new URL(file, dir))).digest('hex'), asset.sha256[extension]);
    }
  }
  assert.deepEqual(readdirSync(dir).sort(), expected.sort());
});

test('1,000 simultaneous voices leave protected seats and clean up at expiration', () => {
  const budget = new VoiceBudget();
  let cleans = 0;
  for (let i = 0; i < 1000; i++) budget.reserve(0, 'ambient' + i, PRIORITY.detail, 2, () => cleans++);
  assert.equal(budget.voices.size, VOICE_LIMIT - 6);
  assert.ok(budget.dropped >= 1000 - VOICE_LIMIT);
  for (let i = 0; i < 4; i++) assert.ok(budget.reserve(0, 'attack', PRIORITY.threat, 1, () => cleans++));
  assert.equal(budget.reserve(0, 'attack', PRIORITY.threat, 1, () => cleans++), undefined);
  for (const alert of ['pickup', 'completion']) assert.ok(budget.reserve(0, alert, PRIORITY.alert, 1, () => cleans++));
  assert.equal(budget.peak, VOICE_LIMIT);
  budget.prune(1.1);
  assert.equal(budget.voices.size, VOICE_LIMIT - 6);
  budget.clear();
  assert.equal(cleans, VOICE_LIMIT);
});

function fakeAudio() {
  const samples: string[] = [];
  const levels: number[] = [];
  const stopped: string[] = [];
  const fades: string[] = [];
  const engine = {
    running: true, assets: { failed: () => false }, preload: () => {}, duck: () => {},
    play(id: string, options: { level: number }) {
      samples.push(id);
      levels.push(options.level);
      return {
        active: true, position() {},
        volume(level: number) { levels.push(level); },
        stop() { this.active = false; stopped.push(id); },
        fadeOut() { fades.push(id); },
      };
    },
  } as unknown as AudioEngine;
  return { engine, samples, levels, stopped, fades };
}

test('soundscape follows authoritative weather interpolation without restarting its layers', () => {
  const { engine, samples, levels, stopped } = fakeAudio();
  const soundscape = new Soundscape(engine);
  const { world } = generateWorld('ice', 48)!;
  const clear = planetWeather('ice')[0], snow = planetWeather('ice')[3];
  const state = { version: 1, current: { weather: clear.id, wind: clear.wind }, target: { weather: snow.id, wind: snow.wind },
    worldId: world.id, planetId: 'ice', profileId: clear.lightingId, seed: 456, instanceId: 'instance',
    originTick: 0, revision: 2, timeOfDay: 'day' as const, startTick: 30, durationTicks: 900 };
  soundscape.update(0, 30, 'ice', world, state, meters, false);
  const calm = levels.at(-1)!;
  soundscape.update(200, 480, 'ice', world, state, meters, false);
  const mixing = levels.at(-1)!;
  soundscape.update(400, 930, 'ice', world, state, meters, false);
  assert.ok(calm < mixing && mixing < levels.at(-1)!);
  assert.deepEqual(samples, ['ice-bed', 'ice-wind']);
  soundscape.clear();
  assert.equal(stopped.length, 2);
  soundscape.update(470, 936, 'ice', world, state, meters, false);
  assert.deepEqual(samples, ['ice-bed', 'ice-wind', 'ice-bed', 'ice-wind']);
});

test('loop replacement crossfades once and disposal releases both layers', () => {
  const { engine, samples, stopped, fades } = fakeAudio();
  const layers = new AudioLayers(engine);
  layers.set('planet', 'ice-bed', 'ambience', .4, 2);
  layers.set('planet', 'ice-bed', 'ambience', .3, 2);
  layers.set('planet', 'forest-bed', 'ambience', .4, 2);
  assert.deepEqual(samples, ['ice-bed', 'forest-bed']);
  assert.deepEqual(fades, ['ice-bed']);
  layers.clear();
  assert.deepEqual(stopped.toSorted(), ['forest-bed', 'ice-bed']);
});

test('surface steps use displacement, vary successive takes and play each confirmed landing once', () => {
  const { engine, samples } = fakeAudio();
  const world = BODENBRUCH.world;
  const audio = new MovementAudio(engine);
  const player = { id: 'operator', slot: 0, x: 0, z: 0, yaw: 0, hp: 100, ack: 0, life: 1, kills: 0, respawnTick: 0 } satisfies PlayerState;
  const standing = newPosture();
  assert.equal(surfaceAudio(world, 0, 0), 'rock');
  for (let tick = 0; tick < 25; tick++) audio.update(player, meters, standing, .04, false, world, tick, true, meters);
  assert.equal(samples.length, 0);
  for (let tick = 25; tick < 49; tick++) audio.update(player, { ...meters, x: (tick - 25) * .15 }, standing, .04, false, world, tick, true, meters);
  assert.ok(samples.length > 2);
  assert.ok(samples.every((sample, index) => sample.startsWith('rock-') && sample !== samples[index - 1]));
  const before = samples.length;
  const landing = { ...standing, current: 'PRONE' as const, started: 50,
    landedDive: { id: 4, until: 50, landing: 'PRONE' } as DiveState };
  for (let tick = 50; tick <= 59; tick++) {
    audio.update({ ...player, posture: landing }, { ...meters, x: 3.5 }, landing, .04, false, world, tick, true, meters);
  }
  assert.equal(samples.length, before + 1);
  audio.clear();
  audio.update({ ...player, posture: landing }, { ...meters, x: 3.5 }, landing, .04, false, world, 59, true, meters);
  assert.equal(samples.length, before + 1, 'baseline after reconnect suppresses a retained dive ID');
});

test('authoritative enemy windups prioritize nearby threats under 250, 500 and 1,000 records', () => {
  for (const size of [250, 500, 1000]) {
    const { engine, samples } = fakeAudio();
    const hear = new HordeAudio(engine);
    const horde = new HordeFrame();
    horde.tick = 100;
    horde.count = size;
    horde.windupTicks = 8; horde.activeTicks = 4;
    for (let i = 0; i < size; i++) {
      horde.id[i] = i + 1; horde.byId.set(i + 1, i); horde.x[i] = 4 + i % 20; horde.z[i] = i % 7;
    }
    hear.update(horde, horde, 0, meters, BODENBRUCH.world);
    horde.tick += 3;
    horde.attackAge.fill(1, 0, size);
    assert.equal(attackPhase(horde, 0, horde.tick)?.phase, 'windup');
    hear.update(horde, horde, 0, meters, BODENBRUCH.world);
    assert.equal(samples.filter((sample) => sample.startsWith('schabe-hiss')).length, 2);
    horde.tick += 2; horde.attackAge.fill(3, 0, size);
    hear.update(horde, horde, 0, meters, BODENBRUCH.world);
    assert.equal(samples.filter((sample) => sample.startsWith('schabe-hiss')).length, 2);
    horde.tick += 6; horde.attackAge.fill(9, 0, size);
    assert.equal(attackPhase(horde, 0, horde.tick)?.phase, 'active');
    hear.update(horde, horde, 0, meters, BODENBRUCH.world);
    assert.equal(samples.filter((sample) => sample.startsWith('schabe-impact')).length, 2);
    hear.clear();
  }
});

test('recent repeated combat and mission events are deduplicated across stream replay', () => {
  const history = new AudioEventHistory();
  assert.ok(history.accept(100, 'hit:23:11', 101));
  assert.equal(history.accept(100, 'hit:23:11', 105), false);
  assert.equal(history.accept(101, 'old-replayed-event', 102 + NET.tickHz), false);
  assert.ok(history.accept(104, 'hit:23:12', 105));
});

test('a cancelled or removed enemy cannot start an audio cue from the older horde frame', () => {
  const { engine, samples } = fakeAudio();
  const hear = new HordeAudio(engine);
  const frame = (tick: number, attackAge: number, alive = true) => {
    const horde = new HordeFrame();
    horde.tick = tick;
    horde.windupTicks = 8;
    horde.activeTicks = 4;
    if (alive) {
      horde.count = 1;
      horde.id[0] = 23;
      horde.byId.set(23, 0);
      horde.x[0] = 4;
      horde.attackAge[0] = attackAge;
    }
    return horde;
  };
  const initial = frame(100, 0);
  hear.update(initial, initial, 0, meters, BODENBRUCH.world);
  hear.update(frame(103, 8), frame(106, 0), .5, meters, BODENBRUCH.world);
  hear.update(frame(109, 8), frame(112, 0, false), .5, meters, BODENBRUCH.world);
  assert.deepEqual(samples, []);
  hear.update(frame(115, 8), frame(118, 11), .5, meters, BODENBRUCH.world);
  assert.equal(samples.length, 1);
  assert.match(samples[0], /^schabe-impact-/);
});
