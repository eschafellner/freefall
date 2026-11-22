import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARRIER_LOCKERS, CARRIER_ROOM_SIZE, CARRIER_ROOMS, CARRIER_WINDOW_WALLS, CARRIER_WORLD } from '@freefall/shared';
import type { MissionSnapshot } from '@freefall/shared';
import { ALARM_PERIOD, carrierAlarm } from '../src/audio/CarrierAlarm.ts';

const state = (patch: Partial<MissionSnapshot>) => ({ state: 'CARRIER_HUB', phase: 'DOCKED', boardingUntil: 0, ...patch }) as MissionSnapshot;

test('carrier lamps and klaxon follow the boarding and drop states', () => {
  assert.equal(carrierAlarm(undefined), 0);
  assert.equal(carrierAlarm(state({})), 0, 'quiet deck in the hub');
  assert.equal(carrierAlarm(state({ state: 'MISSION_SELECTION' })), 0);
  assert.equal(carrierAlarm(state({ state: 'BOARDING' })), 1, 'boarding call while the squad boards');
  assert.equal(carrierAlarm(state({ state: 'BOARDING', boardingUntil: 120 })), 2, 'drop alarm during the countdown');
  assert.equal(carrierAlarm(state({ state: 'DEPLOYMENT', phase: 'LOCKED' })), 2, 'drop alarm while the clamps release');
  assert.equal(carrierAlarm(state({ state: 'DEPLOYMENT', phase: 'DROPPING' })), 0, 'silent once the lander has left');
  assert.ok(ALARM_PERIOD[2] < 2 && ALARM_PERIOD[1] > ALARM_PERIOD[2]);
});

test('the enlarged side rooms keep their window walls, lockers and stations inside the hull', () => {
  const { inner, outer, halfDepth } = CARRIER_ROOM_SIZE;
  assert.ok(outer - inner >= 16 && halfDepth * 2 >= 12);
  for (const wall of [...CARRIER_WINDOW_WALLS, ...CARRIER_LOCKERS]) assert.ok(CARRIER_WORLD.obstacles.includes(wall));
  for (const room of CARRIER_ROOMS) {
    assert.ok(Math.abs(room.x) > inner && Math.abs(room.x) < outer);
    assert.ok(CARRIER_WINDOW_WALLS.some((wall) => wall.x === Math.sign(room.x) * outer && wall.z === room.z), room.label + ' has a hull window');
  }
});
