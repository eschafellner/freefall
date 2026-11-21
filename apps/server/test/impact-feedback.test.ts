import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMERA_SHOULDER, CARRIER_WORLD, DESERT_ID, ENEMY_TYPES, FOREST_ID, GREEN_PLAINS_ID, ICE_ID,
  generateWorld, groundHeight, impactNormal, impactSurface, missionGround, newPosture, shotWorldLimit } from '@freefall/shared';
import type { AimRay, CombatEvent, ImpactSurface, Obstacle, WorldDefinition } from '@freefall/shared';
import { HordeManager } from '../src/ecs/HordeManager.ts';
import { createPlayer } from '../src/simulation/Player.ts';
import { fireWeapon } from '../src/systems/combat.ts';

const open = { ...CARRIER_WORLD, obstacles: [] };
const ray: AimRay = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1 };
const pilot = () => {
  const p = createPlayer('shooter', 0, 0);
  Object.assign(p, { x: 0, y: 0, z: 0, yaw: 0, activeInput: true });
  p.input = { seq: 1, yaw: 0, pitch: 0, fire: true, aim: true, forward: 0, strafe: 0, sprint: false };
  return p;
};

test('hitscan sends no impact for range misses or a rejected shot', () => {
  const horde = new HordeManager();
  const p = pilot();
  const miss = fireWeapon(horde, p, { ...ray }, 1, open);
  assert.ok(miss);
  assert.equal(miss.impact, undefined);
  assert.equal(fireWeapon(horde, p, { ...ray }, 1, open), undefined);
  const diving = pilot();
  diving.posture = { ...newPosture(), current: 'DIVING' };
  assert.equal(fireWeapon(horde, diving, { ...ray }, 1, open), undefined);
});

test('the same validated ray supplies contacts on floor and metal wall', () => {
  const horde = new HordeManager();
  const p = pilot();
  const wall = { ...open, obstacles: [{ x: 0, z: -6, halfX: 3, halfZ: .35, height: 3, kind: 'barrier' as const }] };
  const hit = fireWeapon(horde, p, { ...ray }, 1, wall);
  assert.deepEqual(hit?.impact, { kind: 'world', surface: 'metal', normal: [0, 0, 1] });
  assert.ok(Math.abs(hit!.toZ + 5.65) < 1e-8);
  const downward = pilot();
  downward.input.pitch = -.6;
  const floor = fireWeapon(horde, downward, { ...ray }, 1, open);
  assert.deepEqual(floor?.impact, { kind: 'world', surface: 'metal', normal: [0, 1, 0] });
  assert.ok(Math.abs(floor!.toY) < 1e-8);
});

test('only actual damage to an operator is confirmed and it carries the target life', () => {
  const horde = new HordeManager();
  const p = pilot();
  p.input.pitch = -.08;
  const ally = createPlayer('ally', 1, 0);
  Object.assign(ally, { x: CAMERA_SHOULDER, y: 0, z: -6, life: 4, protectedUntil: 20 });
  const events: CombatEvent[] = [];
  const initial = ally.hp;
  const blocked = fireWeapon(horde, p, { ...ray }, 1, open, undefined, { players: [p, ally], events });
  assert.equal(blocked?.ally, ally.id);
  assert.equal(blocked?.impact, undefined);
  assert.equal(ally.hp, initial);
  assert.equal(events.length, 0, 'protected target produces no damage event');
  const shooter = pilot();
  shooter.input.pitch = -.08;
  const hit = fireWeapon(horde, shooter, { ...ray }, 21, open, undefined, { players: [shooter, ally], events });
  assert.deepEqual(hit?.impact, { kind: 'operator', life: 4 });
  assert.ok(ally.hp < initial);
  assert.equal(events.slice().length, 1);
  const [damage] = events.slice();
  assert.ok(damage.type === 'friendly-fire' && damage.direction);
  const { direction, ...confirmation } = damage;
  assert.deepEqual(confirmation, { type: 'friendly-fire', tick: 21, attacker: shooter.id, target: ally.id,
    amount: initial - ally.hp, source: 'bullet', self: false, life: ally.life });
  assert.ok(direction.z > .99 && Math.abs(direction.x) < .01);
  assert.equal(hit?.eliminated, false);
});

test('Schabe contact uses the sphere normal and a despawned ID cannot die twice', () => {
  const horde = new HordeManager();
  const p = pilot();
  p.input.pitch = -.12;
  const slot = horde.spawn(CAMERA_SHOULDER, -8, 0);
  const id = horde.id[slot];
  horde.hp[slot] = ENEMY_TYPES[0].health;
  const first = fireWeapon(horde, p, { ...ray }, 1, open);
  assert.equal(first?.enemy, id);
  assert.equal(first?.impact?.kind, 'enemy');
  assert.ok(first.impact.normal && Math.abs(Math.hypot(...first.impact.normal) - 1) < 1e-7);
  assert.equal(first.eliminated, false);
  horde.hp[slot] = 1;
  const kill = fireWeapon(horde, p, { ...ray }, 120, open);
  assert.equal(kill?.enemy, id);
  assert.equal(kill?.eliminated, true);
  assert.equal(p.kills, 1);
  const empty = fireWeapon(horde, p, { ...ray }, 240, open);
  assert.equal(empty?.enemy, 0);
  assert.equal(empty?.eliminated, false);
  assert.equal(horde.spawn(CAMERA_SHOULDER, -8, 0), slot);
  assert.notEqual(horde.id[slot], id);
});

test('dominant finishes, props and neutral fallback are sourced from all four worlds', () => {
  const expected: [string, ImpactSurface[]][] = [
    [ICE_ID, ['snow', 'ice', 'frozen-rock']], [DESERT_ID, ['sand', 'dirt', 'rock']],
    [GREEN_PLAINS_ID, ['grass', 'dirt', 'rock']], [FOREST_ID, ['forest-floor', 'rock']],
  ];
  for (const [planet, materials] of expected) {
    const { world } = generateWorld(planet, 76)!;
    const found = new Set<ImpactSurface>();
    for (let x = -215; x <= 215; x += 7) for (let z = -215; z <= 215; z += 7) found.add(impactSurface(world, x, z));
    for (const material of materials) assert.ok(found.has(material), planet + ' / ' + material);
    const ship = missionGround(world).obstacles.at(-1)!;
    assert.equal(impactSurface(world, ship.x, ship.z, ship), 'metal');
    if (planet === FOREST_ID) assert.equal(impactSurface(world, 0, 0, world.obstacles.find(({ kind }) => kind === 'tree')), 'wood');
  }
  assert.equal(impactSurface({ ...open, id: 'unknown' }, 0, 0), 'neutral');
  const unknown = { ...generateWorld(FOREST_ID, 76)!.world, planetId: 'constructor' };
  assert.equal(impactSurface(unknown, 0, 0), 'neutral');
  assert.equal(impactSurface(undefined, 14, -34), 'metal');
  assert.equal(impactSurface(undefined, 0, 4), 'concrete');
});

test('triangle normal traverses the same sloped terrain as the collision, including a cell boundary', () => {
  const world: WorldDefinition = { ...open, id: 'slope', terrain: {
    half: 1, step: 1, cells: 2, allowedGrade: 1, maxGrade: 1, minHeight: 0, maxHeight: 2,
    heightsCm: [0, 100, 200, 0, 100, 200, 0, 100, 200],
  } };
  for (const x of [-.4, 0, .4]) {
    const contact = { distance: Infinity };
    const height = groundHeight(world, x, .1);
    const distance = shotWorldLimit({ ...ray, x, y: 4, z: .1, dy: -1, dz: 0 }, 0, 9, world, contact);
    assert.ok(Math.abs(4 - distance - height) < 1e-8);
    assert.equal(contact.distance, distance);
    const n = impactNormal(world, x, height, .1);
    assert.ok(Math.abs(n[0] + Math.SQRT1_2) < 1e-8 && Math.abs(n[1] - Math.SQRT1_2) < 1e-8 && n[2] === 0);
  }
  const trunk: Obstacle = { x: 0, z: 0, halfX: .5, halfZ: .4, bottom: .2, height: 4, kind: 'tree' };
  assert.deepEqual(impactNormal(world, -.5, 2, 0, trunk), [-1, 0, 0]);
  assert.deepEqual(impactNormal(world, 0, 4, 0, trunk), [0, 1, 0]);
  assert.deepEqual(impactNormal(world, 0, .2, 0, trunk), [0, -1, 0]);
});
