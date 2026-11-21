import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import type { ShotEvent } from '@freefall/shared';
import type { AudioEngine, SampleVoice } from '../src/audio/AudioEngine.ts';
import { ImpactAudio } from '../src/audio/ImpactAudio.ts';
import { shotMarker } from '../src/game/HitFeedback.ts';
import { ShotHistory } from '../src/networking/ShotHistory.ts';
import { GRAPHICS_QUALITY } from '../src/rendering/GraphicsQuality.ts';
import { VisualEffectsManager } from '../src/rendering/VisualEffectsManager.ts';

const shot: ShotEvent = { shooter: 'pilot', life: 1, tick: 30, slot: 'primary', enemy: 0, eliminated: false, fromX: 0, fromY: 1, fromZ: 0,
  toX: 0, toY: 1, toZ: -5, impact: { kind: 'world', surface: 'metal', normal: [0, 0, 1] } };

test('markers distinguish confirmed damage, enemy death and friendly fire', () => {
  assert.equal(shotMarker(shot, 'pilot'), undefined);
  assert.equal(shotMarker({ ...shot, ally: 'protected', impact: undefined, eliminated: true }, 'pilot'), undefined);
  assert.equal(shotMarker({ ...shot, ally: 'ally', impact: { kind: 'operator', life: 1 } }, 'pilot'), 'ally');
  assert.equal(shotMarker({ ...shot, impact: { kind: 'enemy' }, enemy: 1 }, 'pilot'), 'hit');
  assert.equal(shotMarker({ ...shot, impact: { kind: 'enemy' }, enemy: 1, eliminated: true }, 'pilot'), 'kill');
  assert.equal(shotMarker({ ...shot, impact: { kind: 'enemy' }, enemy: 1, eliminated: true }, 'observer'), undefined);
});

test('receive window permits reordering and cuts off pre-join and pre-reconnect contacts', () => {
  const history = new ShotHistory();
  assert.equal(history.receive(shot), 'stale');
  history.snapshot(20);
  assert.equal(history.receive(shot), 'accepted');
  assert.equal(history.receive({ ...shot, tick: 29 }), 'accepted');
  assert.equal(history.receive(shot), 'duplicate');
  assert.equal(history.receive({ ...shot, shooter: 'convict-1' }), 'accepted');
  assert.equal(history.receive({ ...shot, tick: 20 }), 'stale');
  history.snapshot(40);
  history.suspend();
  assert.equal(history.receive({ ...shot, tick: 41 }), 'stale');
  history.snapshot(100);
  assert.equal(history.receive({ ...shot, tick: 99 }), 'stale');
  assert.equal(history.receive({ ...shot, tick: 101 }), 'accepted');
  history.snapshot(150);
  assert.equal(history.receive({ ...shot, tick: 102 }), 'stale');
});

test('pooled particles exit the contact plane, obey quality budgets and expire independently of tracers', () => {
  const scene = new T.Scene();
  const geometry = new T.BoxGeometry();
  const surface = new T.MeshBasicMaterial();
  const effects = new VisualEffectsManager(scene, geometry, surface);
  const camera = new T.PerspectiveCamera();
  camera.position.set(0, 1.4, 0);
  const points = scene.children.find((object) => object instanceof T.Points)!;
  effects.setQuality(GRAPHICS_QUALITY.low);
  effects.add(shot, 0, camera, true);
  effects.draw(75, camera);
  assert.equal(effects.metrics().tracers, 0);
  assert.equal(effects.metrics().impacts, 1);
  assert.equal(effects.metrics().particles, 4);
  const positions = points.geometry.getAttribute('position');
  for (let i = 0; i < effects.metrics().particles; i++) assert.ok(positions.getZ(i) > shot.toZ);
  for (let i = 0; i < 150; i++) effects.add({ ...shot, tick: i, toX: i * .01 }, 80, camera, i % 3 === 0);
  effects.draw(90, camera, 1, true);
  assert.ok(effects.metrics().impactDropped > 0);
  assert.ok(effects.metrics().particles <= effects.metrics().particleCap);
  assert.ok(effects.metrics().impacts <= GRAPHICS_QUALITY.low.effectSlots);
  effects.draw(500, camera);
  assert.equal(effects.metrics().particles, 0);
  effects.add({ ...shot, impact: undefined }, 510, camera, true);
  effects.draw(530, camera);
  assert.equal(effects.metrics().particles, 0);
  assert.equal(effects.metrics().tracers, 1);
  effects.setQuality(GRAPHICS_QUALITY.high);
  assert.equal(effects.metrics().tracers, 0);
  effects.dispose();
  geometry.dispose();
  surface.dispose();
});

test('impact audio uses the confirmed coordinates, applies cooldown and falls back with no decoded asset', () => {
  const played: { options: { position: object }; samples: Float32Array }[] = [];
  let stopped = 0;
  const voice = { active: true, stop: () => stopped++ } as unknown as SampleVoice;
  const engine = {
    context: { sampleRate: 8000, createBuffer: () => ({ copyToChannel(samples: Float32Array) { Object.assign(this, { samples }); } }) },
    assets: { get: () => undefined },
    running: true,
    playBuffer: ({ samples }: { samples: Float32Array }, options: { position: object }) => { played.push({ options, samples }); return voice; },
  } as unknown as AudioEngine;
  const audio = new ImpactAudio(engine);
  const listener = { x: 0, y: 1, z: 0 };
  audio.play(shot, listener, true, 0);
  audio.play(shot, listener, true, 10);
  audio.play({ ...shot, impact: undefined }, listener, true, 80);
  audio.play({ ...shot, toZ: -200 }, listener, true, 110);
  audio.play({ ...shot, impact: { kind: 'enemy' } }, listener, true, 120);
  assert.equal(played.length, 2);
  for (const { options, samples } of played) {
    assert.deepEqual(options.position, { x: 0, y: 1, z: -5 });
    assert.ok(samples.some((sample) => sample !== 0));
    assert.ok(samples.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 1));
  }
  assert.notEqual(played[0].samples.length, played[1].samples.length);
  audio.clear();
  assert.equal(stopped, 1);
});
