import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BALANCE, FOREST_ID, GREEN_PLAINS_ID, WORLD_PROFILES, WORLD_GENERATOR_VERSION, advancePosture, applyPostureInput, generateWorld, groundHeight,
  isOperatorGrounded, moveOnGround, newPosture, openGround, restoreWorld, shotWorldLimit, terrainIntersection, terrainVertex, worldChunkId,
} from '@freefall/shared';
import type { PlayerInput } from '@freefall/shared';
import { GroundNavigation } from '../src/mission/GroundNavigation.ts';
import { MissionGenerator } from '../src/mission/MissionGenerator.ts';
import { timingStats } from '../src/simulation/FixedLoop.ts';

test('world identity survives serialization and is independent of mission seed', () => {
  const a = generateWorld(GREEN_PLAINS_ID, 76)!;
  const restored = restoreWorld(JSON.parse(JSON.stringify(a.identity)));
  assert.deepEqual(restored, a);
  assert.equal(a.identity.generatorVersion, WORLD_GENERATOR_VERSION);
  assert.equal(restoreWorld({ ...a.identity, profileVersion: 0 }), undefined);
  assert.equal(restoreWorld({ ...a.identity, assetVersion: 0 }), undefined);
  assert.equal(restoreWorld({ ...a.identity, seed: 77 }), undefined);
  assert.equal(generateWorld(GREEN_PLAINS_ID, -1), undefined);
  assert.notDeepEqual(generateWorld(GREEN_PLAINS_ID, 77)?.world.terrain, a.world.terrain);
  assert.equal(worldChunkId(a.identity.id, 3, 2), worldChunkId(restored!.identity.id, 3, 2));
  assert.notEqual(worldChunkId(a.identity.id, 3, 2), worldChunkId(a.identity.id, 2, 3));
  const generator = new MissionGenerator();
  const request = { planetId: a.identity.planetId, worldSeed: a.identity.seed, difficultyId: 'normal' };
  const first = generator.generate({ ...request, seed: 70 });
  const second = generator.generate({ ...request, seed: 71 });
  assert.equal(first.status, 'generated');
  assert.equal(second.status, 'generated');
  assert.notEqual(first.plan.id, second.plan.id);
  assert.deepEqual(first.plan.world, second.plan.world);
  assert.equal(generator.validate(first.plan), undefined);
});

test('v3 world IDs (with points of interest) do not depend on the JavaScript engine’s Math.hypot implementation', (t) => {
  t.mock.method(Math, 'hypot', (...values: number[]) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)));
  const fixtures = [
    ['green-plains', 17, 'world.generated.779d0f4383462fd5'],
    ['desert', 31, 'world.generated.1b64d096e9a372da'],
    ['ice', 48, 'world.generated.8494c32f2a2d7a0d'],
    ['forest', 63, 'world.generated.7966b075bdc295ce'],
  ] as const;
  for (const [planet, seed, id] of fixtures) assert.equal(generateWorld(planet, seed)?.identity.id, id, planet);
});

test('v2 worlds gather solids into clusters and add each planet’s landmark formation', () => {
  for (const { id } of WORLD_PROFILES.values()) for (let seed = 0; seed < 20; seed++) {
    const { world } = generateWorld(id, seed)!;
    const solids = world.obstacles.filter(({ kind }) => kind !== 'arch-span');
    // Landmark pieces come on top of the scattered budget. Forest points of interest clear trees from their footprint.
    if (id !== FOREST_ID) assert.ok(world.obstacles.length > WORLD_PROFILES.get(id)!.solidCount, id + ' ' + seed);
    else assert.ok(world.obstacles.length > WORLD_PROFILES.get(id)!.solidCount * .8, id + ' ' + seed);
    // Every solid keeps a walkable gap to its neighbours (arch piers excepted, they frame the opening).
    for (const [i, a] of solids.entries()) for (const b of solids.slice(i + 1)) {
      if (a.kind === 'arch-pier' && b.kind === 'arch-pier') continue;
      const gap = Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(a.halfX, a.halfZ) - Math.hypot(b.halfX, b.halfZ);
      assert.ok(gap > -Math.max(a.halfX, a.halfZ, b.halfX, b.halfZ), id + ' ' + seed);
    }
    if (id !== FOREST_ID) {
      // Clustering: the median distance to the nearest other solid is clearly below the v1 scatter (~40 m).
      const nearest = solids.map((a) => Math.min(...solids.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.z - b.z))))
        .sort((a, b) => a - b);
      assert.ok(nearest[nearest.length >> 1] < 20, id + ' ' + seed + ' ' + nearest[nearest.length >> 1]);
    }
  }
});

for (const { id: planetId } of WORLD_PROFILES.values()) test(`100 ${planetId} seeds produce walkable terrain and validated missions`, (t) => {
  const generator = new MissionGenerator();
  const times: number[] = [];
  const validation: number[] = [];
  const heights: number[] = [];
  const ids = new Set<string>();
  for (let seed = 0; seed < 100; seed++) {
    const start = performance.now();
    const result = generator.generate({ planetId, worldSeed: seed, seed: seed + 13,
      difficultyId: 'normal', templateId: ['nest-purge', 'relay-defense', 'relay-chain'][seed % 3] });
    times.push(performance.now() - start);
    assert.equal(result.status, 'generated', JSON.stringify({ seed, ...result.diagnostics }));
    validation.push(result.diagnostics.validationMs);
    ids.add(result.plan.worldId);
    const { world } = result.definition;
    const terrain = world.terrain!;
    assert.equal(terrain.heightsCm.length, (terrain.cells + 1) ** 2);
    assert.ok(terrain.heightsCm.every(Number.isSafeInteger));
    assert.ok(terrain.maxGrade <= terrain.allowedGrade);
    assert.ok(terrain.maxHeight - terrain.minHeight > 8);
    heights.push(terrain.maxHeight - terrain.minHeight);
    assert.equal(groundHeight(world, world.deployment.x, world.deployment.z), 0);
    for (const location of [result.plan.extraction.balloon, result.plan.extraction.albatross]) {
      const y = groundHeight(world, location.x, location.z);
      assert.ok(Math.abs(terrainIntersection(world, location.x, y + 10, location.z, 0, -20, 0, 0, 1) - .5) < 1e-9);
    }
  }
  assert.equal(ids.size, 100);
  t.diagnostic(JSON.stringify({ valid: ids.size, reliefMeters: timingStats(heights), generationMs: timingStats(times),
    validationMs: timingStats(validation) }));
});

test('terrain triangle diagonal and chunk borders agree with heights and hitscan', () => {
  const { world, chunkCells } = generateWorld(GREEN_PLAINS_ID, 31)!;
  const field = world.terrain;
  const ix = 3 * chunkCells, iz = chunkCells;
  const x = ix * field.step - field.half, z = iz * field.step - field.half;
  const height = (terrainVertex(field, ix + 1, iz) + terrainVertex(field, ix, iz + 1)) / 2;
  assert.ok(Math.abs(groundHeight(world, x + 2, z + 2) - height) < 1e-9);
  assert.ok(Math.abs(groundHeight(world, x, z - 1e-7) - groundHeight(world, x, z + 1e-7)) < 1e-6);
  const y = groundHeight(world, x + 2.3, z + .4);
  assert.equal(shotWorldLimit({ x: x + 2.3, y: y + 5, z: z + .4, dx: 0, dy: -1, dz: 0 }, 0, 10, world), 5);
  const dx = 60, dz = 19, dy = -14, startY = groundHeight(world, x, z) + 5;
  const hit = terrainIntersection(world, x, startY, z, dx, dy, dz, 0, 1);
  assert.ok(hit > 0 && hit < 1);
  assert.ok(Math.abs(startY + hit * dy - groundHeight(world, x + dx * hit, z + dz * hit)) < 1e-8);
});

for (const { id } of WORLD_PROFILES.values()) test(`${id} tactical movement follows terrain during crouch, dive and get-up`, () => {
  const { world } = generateWorld(id, 76)!;
  const site = [{ x: 23, z: -31 }, { x: -43, z: 23 }, { x: 41, z: 63 }, { x: 82, z: 143 }]
    .find(({ x, z }) => openGround(world, x, z, 7) && Math.abs(groundHeight(world, x, z - 4) - groundHeight(world, x, z + 4)) > .4);
  assert.ok(site, 'needs a clear sloped test patch');
  for (const direction of [1, -1]) {
    const { x, z } = site;
    const operator = { x, z, y: groundHeight(world, x, z) };
    const posture = newPosture();
    const input: PlayerInput = { seq: 1, forward: 1, strafe: 0, yaw: 0, pitch: 0, sprint: false, fire: false, posture: 'crouch' };
    applyPostureInput(operator, posture, input, 1, BALANCE.movement, world);
    assert.equal(posture.current, 'CROUCHING');
    for (let tick = 2; tick <= 10; tick++) applyPostureInput(operator, posture, { ...input, posture: undefined }, tick, BALANCE.movement, world);
    assert.ok(isOperatorGrounded(operator, world));
    applyPostureInput(operator, posture, { ...input, seq: 2, forward: direction, posture: 'dive' }, 11, BALANCE.movement, world);
    assert.equal(posture.current, 'DIVING');
    const landingTick = posture.until;
    let airborne = false;
    for (let tick = 12; tick <= landingTick; tick++) {
      advancePosture(operator, posture, tick, BALANCE.movement, world);
      const base = groundHeight(world, operator.x, operator.z);
      assert.ok(operator.y >= base);
      airborne ||= operator.y > base + .1;
    }
    assert.ok(airborne && isOperatorGrounded(operator, world));
    assert.equal(posture.current, direction === 1 ? 'PRONE' : 'SUPINE');
    applyPostureInput(operator, posture, { ...input, seq: 3, posture: 'stand' }, landingTick + 1, BALANCE.movement, world);
    assert.equal(posture.current, 'GETTING_UP');
    advancePosture(operator, posture, posture.until, BALANCE.movement, world);
    assert.equal(posture.current, 'STANDING');
    assert.ok(isOperatorGrounded(operator, world));
  }
});


test('forest trunks block player and enemy motion and keep an alternate route open', () => {
  const { world } = generateWorld(FOREST_ID, 63)!;
  const tree = world.obstacles.find(({ kind }) => kind === 'tree')!;
  const a = { x: tree.x - tree.halfX - 1.3, z: tree.z };
  const b = { x: tree.x + tree.halfX + 1.3, z: tree.z };
  const navigation = new GroundNavigation(world);
  assert.ok(openGround(world, a.x, a.z, .5) && openGround(world, b.x, b.z, .5));
  assert.ok(!openGround(world, tree.x, tree.z, .5));
  assert.equal(navigation.visible(a.x, a.z, b.x, b.z), false);
  assert.equal(navigation.reachable(a.x, a.z, b.x, b.z), true);
  for (const radius of [.42, .54]) {
    const operator = { ...a };
    for (let i = 0; i < 30; i++) moveOnGround(operator, operator.x + .18, operator.z, world, radius);
    assert.ok(operator.x <= tree.x - tree.halfX - radius);
  }
});
