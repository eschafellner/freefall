/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INTERPOLATION, NET, PLAYER } from '@freefall/shared';
import type { PlayerInput, PlayerState, PlayersSnapshot } from '@freefall/shared';
import { Prediction } from '../src/game/Prediction.ts';
import { remotePose } from '../src/game/RemoteInterpolation.ts';
import { Timeline } from '../src/game/Timeline.ts';
import { ThirdPersonCamera } from '../src/rendering/ThirdPersonCamera.ts';

const STEP = 1000 / NET.tickHz;
const walk = (seq: number): PlayerInput => ({ seq, forward: 1, strafe: 0, yaw: 0, pitch: 0, sprint: false, fire: false });
const state = (x: number, z: number, ack: number, life = 1): PlayerState =>
  ({ id: 'p', slot: 0, x, z, yaw: 0, hp: 100, ack, life, respawnTick: 0, kills: 0 });

/** Drives Prediction like Game.draw at a display rate and returns per-frame rendered displacement. */
function frames(hz: number, count: number, prediction: Prediction, onStep?: (seq: number) => void): number[] {
  let elapsed = 0, seq = 0, last = prediction.rendered.z;
  const moves: number[] = [];
  for (let f = 0; f < count; f++) {
    const dt = 1 / hz;
    elapsed += dt * 1000;
    const steps = Math.floor(elapsed / STEP);
    elapsed -= steps * STEP;
    for (let i = 0; i < steps; i++) {
      prediction.step(walk(++seq));
      onStep?.(seq);
    }
    prediction.sample(dt, elapsed / STEP);
    moves.push(last - prediction.rendered.z);
    last = prediction.rendered.z;
  }
  return moves;
}

test('local operator moves the same distance every frame at 60 and 144 Hz from 30 Hz steps', () => {
  for (const hz of [60, 144, 165]) {
    const prediction = new Prediction();
    prediction.confirm(state(0, 0, 0));
    const moves = frames(hz, hz, prediction).slice(Math.ceil(hz / NET.tickHz) + 1);
    const expected = PLAYER.walkSpeed / hz;
    for (const move of moves) assert.ok(Math.abs(move - expected) < 1e-6, `${hz} Hz: ${move} vs ${expected}`);
  }
});

test('a reconciliation correction is blended without a visible jump and never kept', () => {
  const prediction = new Prediction();
  prediction.confirm(state(0, 0, 0));
  frames(60, 30, prediction);
  const before = { ...prediction.rendered };
  // 30 frames at 60 Hz are 15 predicted steps. The server acknowledges 10 of them 0.19 m further back.
  prediction.confirm(state(0, -10 * PLAYER.walkSpeed / NET.tickHz + .19, 10));
  assert.ok(Math.abs(prediction.stats.lastCorrection - .19) < 1e-9);
  prediction.sample(0, 0);
  assert.ok(Math.hypot(prediction.rendered.x - before.x, prediction.rendered.z - before.z) < .2);
  assert.ok(prediction.error > .1);
  for (let i = 0; i < 30; i++) prediction.sample(1 / 60, 0);
  assert.ok(prediction.error < .001, 'correction decays within half a second');
  assert.equal(prediction.stats.corrections, 1);
});

test('new life and large desync snap to the authoritative position', () => {
  const prediction = new Prediction();
  prediction.confirm(state(0, 0, 0));
  frames(60, 30, prediction);
  prediction.confirm(state(20, 20, 999, 2));
  prediction.sample(1 / 60, .5);
  assert.deepEqual(prediction.rendered, { x: 20, y: 0, z: 20 });
  prediction.confirm(state(-20, 20, 999, 2));
  prediction.sample(1 / 60, .5);
  assert.deepEqual(prediction.rendered, { x: -20, y: 0, z: 20 });
  assert.equal(prediction.stats.snaps, 1);
});

function snapshot(tick: number, x: number, life = 1): PlayersSnapshot {
  return { tick, host: 'h', players: [{ ...state(x, 0, 0, life), id: 'r' }] };
}

test('timeline adapts its delay to measured jitter and runs at real time without stalls', () => {
  const timeline = new Timeline<PlayersSnapshot>({ extrapolationTicks: INTERPOLATION.extrapolationTicks });
  let seed = 3;
  const random = () => (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 2 ** 32;
  const arrivals: [number, PlayersSnapshot][] = [];
  for (let tick = 0, i = 0; tick < 600; tick += i++ % 2 ? 1 : 2) arrivals.push([tick * STEP + 40 + random() * 30, snapshot(tick, tick * .2)]);
  let next = 0, stalls = 0, lastTick = -Infinity;
  for (let now = 0; now < 600 * STEP; now += 1000 / 120) {
    while (next < arrivals.length && arrivals[next][0] <= now) timeline.push(arrivals[next][1], arrivals[next++][0]);
    timeline.sample(now);
    if (now > 2000) {
      if (timeline.tick <= lastTick) stalls++;
      assert.ok(timeline.tick > lastTick - 1e-9);
    }
    lastTick = timeline.tick;
  }
  assert.equal(stalls, 0);
  // 30 ms jitter ≈ 0.9 ticks on top of the 2-tick snapshot gap.
  assert.ok(timeline.jitterTicks > .6 && timeline.jitterTicks < 1.1, String(timeline.jitterTicks));
  assert.ok(timeline.delayTicks >= 3 && timeline.delayTicks <= 4, String(timeline.delayTicks));
  assert.equal(timeline.heldFrames, 0);
});

test('timeline extrapolates a bounded distance past the newest snapshot, then holds', () => {
  const timeline = new Timeline<PlayersSnapshot>({ extrapolationTicks: 3 });
  for (let tick = 0; tick <= 60; tick += 2) timeline.push(snapshot(tick, tick), tick * STEP);
  for (let now = 0; now <= 60 * STEP; now += 8) timeline.sample(now);
  // Snapshots stop. Playback continues up to three ticks past the newest one.
  for (let now = 60 * STEP; now < 90 * STEP; now += 8) timeline.sample(now);
  assert.ok(Math.abs(timeline.tick - 63) < 1e-9);
  assert.ok(timeline.alpha > 1 && timeline.alpha <= 2.5);
  assert.ok(timeline.heldFrames > 0);
});

test('remote poses never interpolate across a respawn or a teleport', () => {
  const pose = { x: 0, z: 0, yaw: 0, pitch: 0, tick: 0 };
  const a = snapshot(10, 0), b = snapshot(12, 40);
  remotePose(a.players[0], a, b, .3, b.players[0], pose);
  assert.equal(pose.x, 0);
  remotePose(a.players[0], a, b, .7, b.players[0], pose);
  assert.equal(pose.x, 40);
  const c = snapshot(12, .4, 2);
  remotePose(a.players[0], a, c, .5, c.players[0], pose);
  assert.equal(pose.x, .4);
  const d = snapshot(12, .4);
  remotePose(a.players[0], a, d, .5, d.players[0], pose);
  assert.ok(Math.abs(pose.x - .2) < 1e-12);
});

test('camera collision pulls in at once and eases back out', () => {
  const rig = new ThirdPersonCamera();
  const world = { obstacles: [] as never[] } as never;
  const wall = { obstacles: [{ kind: 'barrier', x: 0, z: 9.3, halfX: 4, halfZ: .2, height: 4 }] } as never;
  const position = { x: 0, z: 5 };
  for (let f = 0; f < 30; f++) rig.update(position, 0, -.12, false, 0, 1 / 60, world);
  const free = rig.camera.position.z;
  rig.update(position, 0, -.12, false, 0, 1 / 60, wall);
  const blocked = rig.camera.position.z;
  assert.ok(blocked < free - .5, `${blocked} < ${free}`);
  rig.update(position, 0, -.12, false, 0, 1 / 60, world);
  const released = rig.camera.position.z;
  assert.ok(released > blocked && released < free - .1, 'one frame later the camera is still easing out');
  for (let f = 0; f < 60; f++) rig.update(position, 0, -.12, false, 0, 1 / 60, world);
  assert.ok(Math.abs(rig.camera.position.z - free) < 1e-3);
});
