import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CARRIER_CABINS, CARRIER_CONSOLE, CARRIER_DOORS, CARRIER_HALLS, CARRIER_PROPS, CARRIER_SHIP, CARRIER_SPAWN, CARRIER_WORLD, BODENBRUCH,
  overlapsObstacle,
} from '@freefall/shared';
import { MissionInstance } from '../src/mission/MissionInstance.ts';

const PLAYER_RADIUS = .42;

test('every carrier doorway is free of colliders on both sides', () => {
  for (const door of CARRIER_DOORS) {
    // Sample the walkable channel through the opening, one metre into each side, inset by the operator radius.
    const across = door.width / 2 - PLAYER_RADIUS - .05;
    for (let a = -1; a <= 1; a += .25) for (let along = -1; along <= 1; along += .25) {
      const x = door.axis === 'x' ? door.x + along : door.x + a * across;
      const z = door.axis === 'x' ? door.z + a * across : door.z + along;
      const blocked = CARRIER_WORLD.obstacles.find((obstacle) => obstacle.bottom === undefined && overlapsObstacle(x, z, obstacle, PLAYER_RADIUS));
      assert.equal(blocked, undefined, `door at ${door.x}/${door.z} blocked at ${x.toFixed(2)}/${z.toFixed(2)}`);
    }
  }
});

test('carrier props stay inside the hull and keep the spawn, console ring and deployment lane clear', () => {
  const { mess, hangar } = CARRIER_HALLS;
  for (const prop of CARRIER_PROPS) {
    assert.ok(Math.abs(prop.x) + prop.halfX <= CARRIER_WORLD.half && Math.abs(prop.z) + prop.halfZ <= CARRIER_WORLD.half, prop.prop);
    if (prop.prop === 'console' || prop.prop === 'pillar') continue;
    // Spawn line, the walk from the console to the airlock and the hangar lane to the lander ramp.
    for (const [x, z] of [[CARRIER_SPAWN.x, CARRIER_SPAWN.z], [3.3, 3.3], [3.3, -4], [0, -10], [0, -16], [0, -20], [0, hangar.maxZ - 1.5]]) {
      assert.ok(!overlapsObstacle(x, z, prop, PLAYER_RADIUS), `${prop.prop} blocks ${x}/${z}`);
    }
    if (Math.abs(prop.x) < mess.maxX && Math.abs(prop.z) < mess.maxZ) {
      assert.ok(Math.hypot(prop.x, prop.z) - Math.max(prop.halfX, prop.halfZ) > CARRIER_CONSOLE.radius - 1.5, `${prop.prop} crowds the console`);
    }
  }
  assert.ok(CARRIER_SHIP.z < hangar.maxZ && CARRIER_SHIP.z > hangar.minZ);
});

test('Krankenstation and Mannschaftsquartier can be walked into through their doors', () => {
  for (const cabin of CARRIER_CABINS) {
    const mission = new MissionInstance(10, BODENBRUCH);
    const player = mission.addPlayer('operator');
    Object.assign(player, { x: 0, z: cabin.z + 2.4 });
    let seq = 0;
    const walk = (yaw: number, count: number) => {
      for (let i = 0; i < count; i++) {
        mission.receiveInput(player.id, { seq: ++seq, forward: 1, strafe: 0, yaw, pitch: 0, sprint: true, fire: false });
        mission.step();
      }
    };
    // Around the console, then straight through the narrow door.
    walk(Math.PI, 3);
    Object.assign(player, { x: Math.sign(cabin.x) * 6, z: cabin.z });
    walk(Math.sign(cabin.x) * Math.PI / 2, 50);
    assert.ok(Math.abs(player.x) > 15, `${cabin.label}: inside (x=${player.x.toFixed(2)})`);
    assert.ok(Math.abs(player.z) < 2.8);
  }
});
