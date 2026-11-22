/** Paired server-only stance samples using the published registry and generated collision geometry. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { availableParallelism, cpus, release } from 'node:os';
import { BALANCE, NET, SCHABE_TYPE, createBalanceRegistry, generateWorld, groundHeight, missionGround, openGround } from '@freefall/shared';
import type { PlayerInput, WorldPlan } from '@freefall/shared';
import { encodeHorde, playerSnapshot } from '../apps/server/src/networking/snapshots.ts';
import { Battlefield } from '../apps/server/src/simulation/Battlefield.ts';
import { timingStats } from '../apps/server/src/simulation/FixedLoop.ts';

const seed = 421337;
const ticks = 210;
const snapshot = process.argv[2];
const registry = snapshot ? createBalanceRegistry(JSON.parse(readFileSync(snapshot, 'utf8'))) : BALANCE;
const worlds = [['green-plains', 76], ['desert', 31], ['ice', 48], ['forest', 63]] as const;
type Sequence = 'upright' | 'crouched' | 'tactical';

class SurvivalProbe extends Battlefield {
  protected override get respawns(): boolean { return false; }
}

function sample(plan: WorldPlan, operators: number, enemies: number, sequence: Sequence) {
  const world = missionGround(plan.world);
  const field = new SurvivalProbe(seed, world, registry);
  const landing = plan.world.deployment!;
  // Keep the open-field probe clear of the Albatross hull added by missionGround.
  const deployment = Array.from({ length: 32 }, (_, index) => {
    const angle = index * Math.PI / 8, radius = index < 16 ? 20 : 30;
    return { x: landing.x + Math.cos(angle) * radius, z: landing.z + Math.sin(angle) * radius };
  }).find(({ x, z }) => openGround(world, x, z, 12));
  assert.ok(deployment, `open movement field on ${plan.identity.planetId}`);
  const crew = Array.from({ length: operators }, (_, slot) => {
    const player = field.addPlayer(`operator-${slot}`);
    player.x = deployment.x + (slot - (operators - 1) / 2) * 4;
    player.z = deployment.z;
    player.y = groundHeight(world, player.x, player.z);
    assert.ok(openGround(world, player.x, player.z, 6));
    player.protectedUntil = 0;
    if (!enemies) player.hp -= player.loadout.medical.healAmount;
    return player;
  });
  const waypoints = world.patrolRegions.flatMap(({ route }) => route.waypoints);
  const occupied = new Set<string>();
  for (let i = 0; field.horde.count < enemies && i < enemies * 64; i++) {
    const nearby = field.horde.count < Math.min(enemies, 36);
    const center = nearby ? deployment : waypoints[i % waypoints.length];
    const radius = nearby ? 5 + (i % 7) * .9 : 2 + (i % 39) * .8;
    const angle = i * 2.399963;
    const x = center.x + Math.cos(angle) * radius, z = center.z + Math.sin(angle) * radius;
    const cell = `${Math.floor(x / .8)},${Math.floor(z / .8)}`;
    if (occupied.has(cell) || !openGround(world, x, z, .55)) continue;
    assert.ok(field.horde.spawn(x, z, SCHABE_TYPE) >= 0);
    occupied.add(cell);
  }
  assert.equal(field.horde.count, enemies);
  const movement = field.enableMovementProfiling();
  const timing = [];
  let bytesHorde = 0, bytesPlayers = 0;
  let minEnemies = enemies, maxEnemies = enemies, atTarget = 0;
  const heapBefore = process.memoryUsage();

  for (let tick = 1; tick <= ticks; tick++) {
    for (const player of crew) {
      if (!player.hp) continue;
      const direction = player.slot % 2 ? -1 : 1;
      const forward = tick === 6 ? direction : tick >= 32 && tick <= 40 ? .4 : 0;
      const strafe = tick >= 32 && tick <= 40 ? .65 * direction : 0;
      const input: PlayerInput = { seq: tick, life: player.life, yaw: 0, pitch: -.18,
        forward, strafe, sprint: false, aim: tick >= 30 && tick < 75, fire: tick >= 30 && tick < 51,
        reload: tick === 55, ...(tick === 130 && { equipment: 'stim' }) };
      if (sequence === 'tactical' && tick === 6) input.posture = 'dive';
      if (sequence === 'crouched' && tick === 6) input.posture = 'crouch';
      if (sequence !== 'upright' && tick === 173) input.posture = 'stand';
      assert.ok(field.receiveInput(player.id, input));
    }
    const before = performance.now();
    field.step();
    timing.push(performance.now() - before);
    for (const player of crew) {
      assert.ok(player.y >= groundHeight(world, player.x, player.z) - 1e-7, 'operator below the terrain');
    }
    minEnemies = Math.min(minEnemies, field.horde.count);
    maxEnemies = Math.max(maxEnemies, field.horde.count);
    if (field.horde.count === enemies) atTarget++;
    if (tick % (NET.tickHz / NET.hordeHz) === 0) bytesHorde += encodeHorde(field.horde, tick, undefined, field.enemyCombat).byteLength;
    if (Math.floor(tick * NET.playerHz / NET.tickHz) > Math.floor((tick - 1) * NET.playerHz / NET.tickHz)) {
      bytesPlayers += Buffer.byteLength(JSON.stringify(playerSnapshot(field, crew[0].id)));
    }
  }

  const heapAfter = process.memoryUsage();
  if (!enemies && sequence === 'tactical') {
    assert.equal(movement.dive.completed, operators);
    assert.equal(movement.dive.metres, operators * registry.movement.diveDistance);
    assert.equal(movement.getUp.completed, operators);
    assert.equal(movement.ground.PRONE.stimsCompleted + movement.ground.SUPINE.stimsCompleted, operators);
  }
  return { world: plan.identity, operators, sequence, enemies, minEnemies, maxEnemies, atTarget,
    survivors: crew.filter(({ hp }) => hp > 0).length, health: crew.map(({ hp }) => hp),
    enemy: field.enemyCombat.totals, movement, tickMs: timingStats(timing), bytesHorde, bytesPlayers,
    heapDeltaBytes: heapAfter.heapUsed - heapBefore.heapUsed, rssBytes: heapAfter.rss };
}

const samples = worlds.map(([planet, worldSeed], index) => sample(generateWorld(planet, worldSeed)!, index + 1, 0, 'tactical'));
const forest = generateWorld('forest', 63)!;
for (const [operators, enemies] of [[1, 1], [2, 8], [4, 36], [4, 1000]]) {
  for (const sequence of ['upright', 'crouched', 'tactical'] as const) samples.push(sample(forest, operators, enemies, sequence));
}
console.log(JSON.stringify({ registry: registry.version, simulationSeed: seed, tickHz: NET.tickHz, ticks,
  node: process.version, kernel: release(), cpu: cpus()[0].model, workers: availableParallelism(), samples }, null, 2));
