import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOVEMENT_INPUT, NET, PLAYER, movePlayer } from '@freefall/shared';
import type { PlayerInput } from '@freefall/shared';
import { Arena } from '../src/simulation/Arena.ts';

const STEP = PLAYER.walkSpeed / NET.tickHz;
const walk = (seq: number, yaw = 0): PlayerInput => ({ seq, forward: 1, strafe: 0, yaw, pitch: -.1, sprint: false, fire: false });

test('every movement input moves the operator exactly once and is acknowledged in order', () => {
  const arena = new Arena(5, 0);
  const player = arena.addPlayer('p');
  const start = player.z;
  // Two inputs in one tick, then none: the old "latest input per tick" applied 1 + 1 and skipped seq 1.
  arena.receiveInput('p', walk(1));
  arena.receiveInput('p', walk(2));
  arena.step();
  assert.equal(player.ack, 1);
  arena.step();
  assert.equal(player.ack, 2);
  for (let i = 0; i < 5; i++) arena.step();
  assert.ok(Math.abs(start - player.z - 2 * STEP) < 1e-9, 'two inputs, two steps, nothing repeated');
});

test('client replay of acknowledged inputs reproduces the server position bit for bit', () => {
  const arena = new Arena(6, 0);
  const player = arena.addPlayer('p');
  const client = { x: player.x, z: player.z };
  let seq = 0;
  // Bursty arrival (0, 1 or 2 inputs per tick) with changing direction.
  const pattern = [1, 0, 2, 1, 1, 0, 0, 3, 1, 2, 0, 1];
  for (let tick = 0; tick < 120; tick++) {
    for (let i = 0; i < pattern[tick % pattern.length]; i++) {
      const input = { ...walk(++seq, Math.sin(seq / 7)), strafe: seq % 9 < 3 ? 1 : 0, sprint: seq % 5 === 0 };
      arena.receiveInput('p', input);
      movePlayer(client, input, 1 / NET.tickHz);
    }
    arena.step();
  }
  for (let i = 0; i < 20; i++) arena.step();
  assert.equal(player.ack, seq);
  assert.equal(player.x, client.x);
  assert.equal(player.z, client.z);
});

test('a flood of inputs cannot move faster than the tick rate allows', () => {
  const arena = new Arena(7, 0);
  const player = arena.addPlayer('p');
  const start = player.z;
  for (let i = 1; i <= 40; i++) arena.receiveInput('p', walk(i));
  arena.step();
  // One input per tick plus at most the banked budget; the queue is bounded and drops the oldest.
  assert.ok(start - player.z <= MOVEMENT_INPUT.budget * STEP + 1e-9);
  for (let i = 0; i < 30; i++) arena.step();
  assert.ok(start - player.z <= MOVEMENT_INPUT.queue * STEP + 1e-9);
  assert.equal(player.ack, 40);
});

test('short input gaps grow a small cushion so steady senders move once per tick', () => {
  const arena = new Arena(8, 0);
  const player = arena.addPlayer('p');
  let seq = 0;
  const steps: number[] = [];
  for (let tick = 0; tick < 200; tick++) {
    // Every 10th tick the input arrives one tick late together with the next one.
    if (tick % 10 !== 4) arena.receiveInput('p', walk(++seq));
    if (tick % 10 === 5) arena.receiveInput('p', walk(++seq));
    const z = player.z;
    arena.step();
    if (tick > 60) steps.push(Math.round((z - player.z) / STEP));
  }
  assert.equal(player.moveCushion, 1);
  assert.ok(steps.every((step) => step === 1), 'after adapting, every tick advances exactly one step');
  assert.ok(player.moveCushion <= MOVEMENT_INPUT.maxCushion);
});

test('a long pause does not grow the cushion and the next input is applied at once', () => {
  const arena = new Arena(9, 0);
  const player = arena.addPlayer('p');
  arena.receiveInput('p', walk(1));
  arena.step();
  for (let i = 0; i < 20; i++) arena.step();
  arena.receiveInput('p', walk(2));
  arena.step();
  assert.equal(player.ack, 2);
  assert.equal(player.moveCushion, 0);
});
