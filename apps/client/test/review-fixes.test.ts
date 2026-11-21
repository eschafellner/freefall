/**
 * Client regression tests for the fixes of the full code review (2026-11).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_BINDINGS, INPUT_ACTIONS, UNBOUND, Bindings } from '../src/input/Bindings.ts';
import { Prediction } from '../src/game/Prediction.ts';

function storage(value?: unknown) {
  const store = new Map<string, string>();
  if (value !== undefined) store.set('freefall.bindings.v1', JSON.stringify(value));
  return { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, v: string) => void store.set(key, v) };
}

test('an incomplete stored binding keeps the player keys and fills new actions with free defaults', () => {
  const { BALLOON: _, ...older } = { ...DEFAULT_BINDINGS, DIVE: 'Mouse4', FIRE: 'KeyF' };
  const bindings = new Bindings(storage(older));
  assert.equal(bindings.code('DIVE'), 'Mouse4');
  assert.equal(bindings.code('FIRE'), 'KeyF');
  assert.equal(bindings.code('BALLOON'), DEFAULT_BINDINGS.BALLOON);
});

test('a missing action whose default key is taken stays unbound until the player assigns one', () => {
  const bindings = new Bindings(storage({ INTERACT: 'KeyB' }));
  assert.equal(bindings.code('INTERACT'), 'KeyB');
  assert.equal(bindings.code('BALLOON'), UNBOUND);
  assert.equal(bindings.label('BALLOON'), 'nicht belegt');
  assert.equal(bindings.code('DIVE'), DEFAULT_BINDINGS.DIVE);
  assert.equal(bindings.rebind('BALLOON', 'KeyN'), undefined);
  assert.equal(new Bindings(storage(JSON.parse(JSON.stringify({ INTERACT: 'KeyB', BALLOON: 'KeyN' })))).code('BALLOON'), 'KeyN');
});

test('invalid or duplicate stored keys fall back instead of discarding the whole binding', () => {
  const bindings = new Bindings(storage({ DIVE: 'F2', CROUCH: 'Mouse3', STAND_UP: 'Mouse3', FIRE: 42 }));
  assert.equal(bindings.code('DIVE'), DEFAULT_BINDINGS.DIVE, 'reserved key');
  assert.equal(bindings.code('CROUCH'), 'Mouse3');
  assert.equal(bindings.code('STAND_UP'), DEFAULT_BINDINGS.STAND_UP, 'duplicate key: the first action keeps it');
  assert.equal(bindings.code('FIRE'), DEFAULT_BINDINGS.FIRE);
  const codes = INPUT_ACTIONS.map((action) => bindings.code(action)).filter((code) => code !== UNBOUND);
  assert.equal(new Set(codes).size, codes.length, 'no key is bound twice');
  for (const raw of ['[]', '"x"', 'null', '{broken']) {
    const store = storage();
    store.setItem('freefall.bindings.v1', raw);
    assert.equal(new Bindings(store).code('FIRE'), DEFAULT_BINDINGS.FIRE);
  }
});

test('prediction ignores inputs of an earlier life like the server does', () => {
  const prediction = new Prediction();
  const state = { id: 'p', slot: 0, x: 0, z: 5, yaw: 0, hp: 100, ack: 0, life: 2, respawnTick: 0, kills: 0 };
  prediction.confirm(state as never, 10);
  prediction.step({ seq: 1, life: 1, forward: 1, strafe: 0, yaw: 0, pitch: 0, sprint: false, fire: false });
  assert.equal(prediction.position.z, 5);
  prediction.step({ seq: 2, life: 2, forward: 1, strafe: 0, yaw: 0, pitch: 0, sprint: false, fire: false });
  assert.ok(prediction.position.z < 5);
});
