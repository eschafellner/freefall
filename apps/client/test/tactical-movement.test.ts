import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BALANCE, NET, advancePosture, applyPostureInput, newPosture } from '@freefall/shared';
import type { PlayerInput, PlayerState, PlayersSnapshot, PostureState } from '@freefall/shared';
import { Prediction } from '../src/game/Prediction.ts';
import { remotePose } from '../src/game/RemoteInterpolation.ts';
import { Bindings } from '../src/input/Bindings.ts';

const idle = (seq: number): PlayerInput => ({ seq, life: 1, forward: 0, strafe: 0, yaw: 0, pitch: 0, fire: false, sprint: false });
const movement = BALANCE.movement;
const player: PlayerState = { id: 'p', slot: 0, x: 0, z: 0, hp: 100, yaw: 0, life: 1, ack: 0, respawnTick: 0, kills: 0 };

test('prediction replays unacknowledged analog dive, then matches the server through landing', () => {
  const position = { x: 0, y: 0, z: 0 };
  const posture = newPosture();
  const prediction = new Prediction();
  prediction.confirm(player, 1);
  const dive = { ...idle(1), posture: 'dive' as const, forward: -.73, strafe: .35 };
  prediction.step(dive);
  assert.equal(prediction.posture.current, 'DIVING');
  for (let tick = 2; tick <= 45; tick++) {
    const input = tick === 2 ? dive : idle(tick - 1);
    if (tick > 2) prediction.step(input);
    advancePosture(position, posture, tick, movement);
    applyPostureInput(position, posture, input, tick, movement);
    if (tick % 2 === 0) {
      const before = { ...prediction.position };
      prediction.confirm({ ...player, ...position, posture, ack: tick - 1 }, tick);
      assert.deepEqual(prediction.position, before);
      assert.equal(prediction.posture.current, posture.current);
    }
  }
  assert.equal(prediction.posture.current, 'SUPINE');
  assert.equal(prediction.stats.corrections, 0);
});

test('server rejection rolls back a locally predicted dive without retaining an action', () => {
  const prediction = new Prediction();
  prediction.confirm(player, 0);
  prediction.step({ ...idle(1), posture: 'dive' });
  for (let i = 2; i < 8; i++) prediction.step(idle(i));
  assert.ok(prediction.position.y > 0);
  prediction.confirm({ ...player, ack: 7 }, 7);
  assert.equal(prediction.position.y, 0);
  assert.equal(prediction.posture.current, 'STANDING');
  prediction.sample(1 / NET.tickHz, .5);
  assert.notEqual(prediction.visualPosture.current, 'DIVING');
});

test('a remote remains airborne until the server landing tick, and reconnect restores ground posture', () => {
  const dive: PostureState = { ...newPosture(), current: 'DIVING', requested: 'PRONE', started: 2, until: 25,
    dive: { x: 0, z: -1, blocked: false, landing: 'PRONE' } };
  const grounded: PostureState = { ...newPosture(), current: 'PRONE', requested: 'PRONE', from: 'DIVING', started: 25, until: 25 };
  const a: PlayersSnapshot = { tick: 24, host: 'p', players: [{ ...player, y: .11, z: -4.89, posture: dive }] };
  const b: PlayersSnapshot = { tick: 26, host: 'p', players: [{ ...player, z: -5, posture: grounded }] };
  const out = { x: 0, z: 0, yaw: 0, pitch: 0, tick: 0 };
  assert.equal(remotePose(a.players[0], a, b, .49, b.players[0], out).posture?.current, 'DIVING');
  const landing = remotePose(a.players[0], a, b, .5, b.players[0], out);
  assert.equal(landing.posture?.current, 'PRONE');
  assert.equal(landing.y, 0);
  const prediction = new Prediction();
  prediction.confirm(b.players[0], b.tick);
  prediction.step(idle(1));
  assert.equal(prediction.posture.current, 'PRONE');
});

test('rebinding detects a conflict, persists a replacement, and resets to defaults', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
  const bindings = new Bindings(storage);
  assert.match(bindings.rebind('DIVE', 'KeyC') ?? '', /Ducken/);
  assert.match(bindings.rebind('DIVE', 'F2') ?? '', /reserviert/);
  assert.equal(bindings.rebind('DIVE', 'Mouse4'), undefined);
  const reloaded = new Bindings(storage);
  assert.equal(reloaded.code('DIVE'), 'Mouse4');
  reloaded.reset();
  assert.equal(new Bindings(storage).code('DIVE'), 'KeyX');
});
