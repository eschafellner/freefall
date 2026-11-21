import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASE_LOADOUT, BODENBRUCH, SCHABE_TYPE, newPosture } from '@freefall/shared';
import type { WorldDefinition } from '@freefall/shared';
import { playerSnapshot } from '../src/networking/snapshots.ts';
import { Battlefield } from '../src/simulation/Battlefield.ts';

const ground: WorldDefinition = { ...BODENBRUCH.world, obstacles: [], half: 40 };
const barrier: WorldDefinition = {
  ...ground, obstacles: [{ x: 0, z: -3, halfX: 3, halfZ: .25, height: 5, kind: 'container' }],
};

function setup(world: WorldDefinition) {
  const field = new Battlefield(78, world);
  const player = field.addPlayer('one');
  Object.assign(player, { x: 0, y: 0, z: 0, yaw: 0, protectedUntil: Infinity });
  let seq = 0;
  function step(equipment?: 'grenade' | 'melee') {
    assert.ok(field.receiveInput(player.id, { seq: ++seq, life: player.life, yaw: 0, pitch: -.52,
      forward: 0, strafe: 0, sprint: false, fire: false, equipment }));
    field.step();
    return field.combatEvents.slice();
  }
  return { field, player, step };
}

test('release, projectile and fuse share an ID; detonation uses the server contact and radius', () => {
  for (const world of [ground, barrier]) {
    const { field, player, step } = setup(world);
    const initial = player.equipment.grenades;
    assert.deepEqual(step('grenade'), []);
    const start = field.tick;
    const def = BASE_LOADOUT.grenade;
    assert.equal(playerSnapshot(field, player.id).players[0].equipment?.actionAt, start + def.releaseTicks);
    let events = step();
    while (field.tick < start + def.releaseTicks) events = step();
    const release = events.find((event) => event.type === 'grenade-release');
    assert.ok(release);
    assert.equal(player.equipment.grenades, initial - 1);
    const snapshot = playerSnapshot(field, player.id).grenades?.[0];
    assert.equal(snapshot?.id, release.id);
    assert.equal(snapshot.release?.tick, release.tick);
    assert.equal(snapshot.detonates, release.tick + def.fuseTicks);
    for (let tick = field.tick + 1; tick < snapshot.detonates; tick++) {
      assert.ok(!step().some((event) => event.type === 'blast'));
    }
    const blast = step().find((event) => event.type === 'blast');
    assert.ok(blast);
    assert.equal(blast.id, snapshot.id);
    assert.equal(blast.tick, snapshot.detonates);
    assert.equal(blast.grenade, def.id);
    assert.equal(blast.owner, player.id);
    assert.equal(blast.radius, def.blastRadius);
    const [end] = field.grenades.snapshot()!;
    assert.deepEqual([blast.x, blast.y, blast.z], [end.x, end.y, end.z]);
    assert.equal(blast.contact?.surface, world === ground ? 'dirt' : 'metal');
    assert.deepEqual(blast.contact?.normal?.map((value) => value || 0), world === ground ? [0, 1, 0] : [0, 0, 1]);
    for (let i = 0; i < 24; i++) assert.ok(!step().some((event) => event.type === 'blast'));
    assert.equal(field.grenades.snapshot(), undefined);
  }
});

test('blocked and interrupted equipment produces no release or strike presentation', () => {
  for (const action of ['grenade', 'melee'] as const) {
    const { field, player, step } = setup(ground);
    player.posture = { ...newPosture(0), current: 'PRONE', from: 'PRONE' };
    step(action);
    assert.equal(player.equipment.action, undefined);
    player.posture = newPosture(0);
    step(action);
    assert.equal(player.equipment.action, action);
    player.hp = 0;
    for (let i = 0; i < 25; i++) assert.ok(!step().some((event) => event.type === 'melee' || event.type === 'grenade-release'));
    assert.equal(field.grenades.snapshot(), undefined);
  }
});

test('only a damaging melee hit carries a presentation contact', () => {
  for (const hit of [false, true]) {
    const { field, player, step } = setup(ground);
    const slot = hit ? field.horde.spawn(0, -1.1, SCHABE_TYPE) : -1;
    const id = hit ? field.horde.id[slot] : 0;
    if (hit) field.horde.hp[slot] = 1000;
    step('melee');
    const tick = field.tick + BASE_LOADOUT.melee.windupTicks;
    assert.equal(playerSnapshot(field, player.id).players[0].equipment?.actionAt, tick);
    while (field.tick + 1 < tick) assert.ok(!step().some((event) => event.type === 'melee'));
    const event = step().find((event) => event.type === 'melee');
    assert.ok(event);
    assert.equal(event.enemy, id);
    assert.equal(Boolean(event.contact), hit);
    assert.equal(event.damage, hit ? BASE_LOADOUT.melee.damage : 0);
    if (hit) assert.ok(event.contact!.z < -.25 && event.contact!.y > 0);
  }
  const { field, player, step } = setup(ground);
  const protectedAlly = field.addPlayer('two');
  Object.assign(protectedAlly, { x: 0, y: 0, z: -1.1, protectedUntil: Infinity });
  step('melee');
  const impact = field.tick + player.loadout.melee.windupTicks;
  while (field.tick + 1 < impact) step();
  const event = step().find((entry) => entry.type === 'melee');
  assert.equal(event?.ally, protectedAlly.id);
  assert.equal(event?.damage, 0);
  assert.equal(event?.contact, undefined);
});
