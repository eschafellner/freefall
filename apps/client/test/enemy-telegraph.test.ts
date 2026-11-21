import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HordeFrame, NET } from '@freefall/shared';
import { MatchTimeline } from '../src/game/Timeline.ts';
import { enemyAttackPitch } from '../src/rendering/EnemyAttackPose.ts';

function snapshot(tick: number, start?: number): Uint8Array {
  const bytes = new Uint8Array(start === undefined ? 16 : 26);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, tick, true);
  view.setUint16(4, 1, true);
  view.setUint32(6, 42, true);
  if (start !== undefined) {
    view.setUint16(16, 11, true);
    view.setUint16(18, 3, true);
    view.setUint16(20, 8, true);
    view.setUint16(24, tick - start, true);
  }
  return bytes;
}

test('the telegraph follows the server clock with delayed, reordered and dropped presentation frames', () => {
  const timeline = new MatchTimeline();
  const step = 1000 / NET.tickHz;
  timeline.receiveHorde(snapshot(99), undefined, 99 * step + 80);
  // Drop tick 102, receive 105 with jitter, then deliver stale 102.
  timeline.receiveHorde(snapshot(105, 101), undefined, 105 * step + 125);
  timeline.receiveHorde(snapshot(102, 101), undefined, 105 * step + 135);
  timeline.horde.sample(105 * step + 190);
  assert.ok(timeline.horde.jitterTicks > 1);
  assert.equal(timeline.horde.latest?.tick, 105);
  assert.equal(timeline.horde.before?.tick, 99);
  assert.equal(timeline.horde.after?.tick, 105);
  const before = timeline.horde.before!, after = timeline.horde.after!;
  assert.equal(enemyAttackPitch(before, 0, after, 0, 100), 0);
  assert.ok(enemyAttackPitch(before, 0, after, 0, 104) > 0);

  // One full reconnect frame is sufficient to show the current phase.
  const reconnect = new MatchTimeline();
  reconnect.receiveHorde(snapshot(112, 101), undefined, 112 * step + 70);
  reconnect.horde.sample(112 * step + 70);
  const resumed = reconnect.horde.before!;
  assert.equal(enemyAttackPitch(resumed, 0, resumed, 0, resumed.tick), -.14);
  reconnect.receiveHorde(snapshot(118, 101), undefined, 118 * step + 100);
  const recovery = reconnect.horde.latest!;
  assert.ok(enemyAttackPitch(recovery, 0, recovery, 0, 118) > -.14);
  reconnect.receiveHorde(snapshot(121), undefined, 121 * step + 75);
  const cancelled = reconnect.horde.latest!;
  assert.equal(enemyAttackPitch(cancelled, 0, cancelled, 0, 121), 0);
  assert.equal(enemyAttackPitch(recovery, 0, new HordeFrame(), undefined, 123), 0);
});
