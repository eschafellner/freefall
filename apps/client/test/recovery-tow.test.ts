import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { ALBATROSS, BALLOON, NET, extractionLiftTicks } from '@freefall/shared';
import { TOW, TowLine, hookAt } from '../src/rendering/mission/RecoveryTow.ts';

const heading = new T.Vector3(Math.sin(Math.PI * .235), 0, -Math.cos(Math.PI * .235));
const yoke = new T.Vector3(0, .61 + BALLOON.height - TOW.yokeDrop, 0);
const flat = () => 0;
const lift = BALLOON.liftTicks / NET.tickHz;
// Operators anywhere inside the tether radius: under the balloon, behind, beside and ahead of the fighter's course.
const harnesses = [[0, 0], [-20, 5], [15, 15], [5, -20], [-18, -14]].map(([x, z]) => new T.Vector3(x, TOW.harness, z));

test('the balloon tow lasts long enough to watch and the Albatross keeps its short climb-out', () => {
  assert.equal(extractionLiftTicks('balloon'), BALLOON.liftTicks);
  assert.equal(extractionLiftTicks('albatross'), ALBATROSS.liftTicks);
  assert.ok(lift >= 4 && lift <= 6);
});

test('the line pulls every operator off the ground within the snatch and the brake caps the load', () => {
  for (const harness of harnesses) {
    const tow = new TowLine(harness, yoke, heading, flat);
    let airborne = Infinity;
    for (let s = 0; s <= lift; s += 1 / 60) {
      tow.advance(s);
      if (!tow.grounded && airborne === Infinity) airborne = s;
    }
    assert.ok(airborne < 1.6, `airborne after ${airborne.toFixed(2)} s from ${harness.x},${harness.z}`);
    assert.ok(tow.peakTension <= TOW.brake + 1e-6, 'brake limits the snatch to about 4.5 g');
    assert.ok(tow.peakTension > 2 * TOW.gravity, 'the snatch is felt');
    assert.ok(tow.position.y > 30, 'climbing with the fighter');
  }
});

test('towed operators trail below and behind the hook on a taut line', () => {
  for (const harness of harnesses) {
    const tow = new TowLine(harness, yoke, heading, flat);
    const hook = new T.Vector3();
    for (let s = 2; s <= lift; s += .25) {
      tow.advance(s);
      hookAt(yoke, heading, s, hook);
      const line = hook.clone().sub(tow.position);
      assert.ok(line.y > 0, `below the hook at ${s} s`);
      assert.ok(line.dot(heading) > 0, `behind the hook at ${s} s`);
      assert.ok(line.length() <= tow.length * 1.25, 'nylon stretch stays plausible');
      // The body hangs along the line.
      const axis = new T.Vector3(0, 1, 0).applyQuaternion(tow.rotation);
      assert.ok(axis.dot(line.normalize()) > .9, 'body axis follows the line');
    }
  }
});

test('a late joiner fast-forwards to the same tow pose', () => {
  const live = new TowLine(harnesses[1], yoke, heading, flat);
  for (let s = 0; s <= 3; s += 1 / 47) live.advance(s);
  live.advance(3);
  const late = new TowLine(harnesses[1], yoke, heading, flat);
  late.advance(3);
  assert.ok(live.position.distanceTo(late.position) < 1e-9);
});

test('an operator on rising ground stays on the terrain until the line lifts them', () => {
  const slope = (x: number) => Math.max(0, x * .2);
  const tow = new TowLine(new T.Vector3(10, 2 + TOW.harness, 0), yoke, heading, slope);
  for (let s = 0; s <= lift; s += 1 / 120) {
    tow.advance(s);
    assert.ok(tow.position.y >= slope(tow.position.x) + TOW.harness - 1e-9);
  }
});
