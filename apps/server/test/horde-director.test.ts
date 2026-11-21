import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BALANCE, BODENBRUCH, NET, SCHABE_TYPE, distanceSquared, missionGround, resolveMissionBalance } from '@freefall/shared';
import type { HordeDirectorState, MissionDefinition, MissionEvent, Obstacle, PositionXZ } from '@freefall/shared';
import { HordeManager } from '../src/ecs/HordeManager.ts';
import { GroundNavigation } from '../src/mission/GroundNavigation.ts';
import { MissionInstance } from '../src/mission/MissionInstance.ts';
import { SPAWN_DEFERRED, SpawnManager } from '../src/mission/SpawnManager.ts';
import { createPlayer } from '../src/simulation/Player.ts';

const regions = [
  { id: 'south', x: 0, z: 43, radius: 8 },
  { id: 'southwest', x: -37, z: 35, radius: 8 },
  { id: 'southeast', x: 38, z: 35, radius: 8 },
];

function definition(obstacles: readonly Obstacle[] = []): MissionDefinition {
  return { ...BODENBRUCH, world: { ...BODENBRUCH.world, obstacles, breachRegions: regions, patrolRegions: [], initialNests: [] } };
}

function deploy(count: number, scenario = definition(), face = 0) {
  const mission = new MissionInstance(421337, scenario);
  const players = Array.from({ length: count }, (_, i) => mission.addPlayer('operator-' + i));
  const host = players[0];
  assert.equal(mission.snapshot().encounter, undefined);
  assert.ok(mission.debug(host.id, 'deploy'));
  mission.step();
  assert.equal(mission.snapshot().encounter, undefined);
  assert.ok(mission.debug(host.id, 'land'));
  for (const player of players) {
    Object.assign(player, { x: player.slot * 2, z: 0, yaw: face, pitch: 0, protectedUntil: Infinity });
    mission.receiveInput(player.id, { seq: 1, life: player.life, yaw: face, pitch: 0,
      forward: 0, strafe: 0, sprint: false, fire: false });
  }
  mission.step();
  assert.equal(mission.snapshot().encounter?.state, 'CALM');
  return { mission, players, host };
}

function stepUntil(mission: MissionInstance, predicate: () => boolean, ticks = 40 * NET.tickHz) {
  for (let i = 0; i < ticks && !predicate(); i++) mission.step();
  assert.ok(predicate(), 'condition did not become true before its tick deadline');
}

function start(mission: MissionInstance, id: string): void {
  assert.ok(mission.debug(id, 'horde-wave'));
  mission.step();
  assert.equal(mission.snapshot().encounter?.state, 'BUILDUP');
}

test('a seeded natural wave passes through five states, varies region, and leaves living enemies in recovery', () => {
  function trace(count: number) {
    const { mission } = deploy(count);
    const { horde, director } = mission;
    const states: HordeDirectorState[] = [];
    const events: MissionEvent[] = [];
    const initialPositions: PositionXZ[] = [];
    const spawnRegions = new Set<string>();
    let spawned = 0;
    let maxPerTick = 0;
    for (let i = 0; i < 100 * NET.tickHz; i++) {
      mission.step();
      const state = mission.snapshot().encounter?.state;
      if (state && states.at(-1) !== state) states.push(state);
      events.push(...mission.drainEvents());
      maxPerTick = Math.max(maxPerTick, director.spawns.totals.waveSpawned - spawned);
      if (director.spawns.totals.waveSpawned !== spawned) {
        const slot = horde.active[horde.count - 1];
        initialPositions.push({ x: horde.x[slot], z: horde.z[slot] });
        spawnRegions.add(director.spawns.lastRegion!);
        spawned = director.spawns.totals.waveSpawned;
      }
      assert.ok(horde.count + director.spawns.reserved <= director.spawns.cap);
      if (state === 'RECOVERY') {
        assert.ok(horde.count > 0);
        assert.equal(director.spawns.reserved, 0);
      }
      if (states.length === 6) break;
    }
    assert.deepEqual(states, ['CALM', 'BUILDUP', 'ASSAULT', 'PEAK', 'RECOVERY', 'CALM']);
    const waves = events.filter((event) => event.type === 'HordeWaveStarted');
    const ends = events.filter((event) => event.type === 'HordeWaveEnded');
    assert.equal(waves.length, 1);
    assert.equal(ends.length, 1);
    assert.equal(ends[0].waveId, waves[0].waveId);
    assert.equal(ends[0].reason, 'completed');
    assert.equal(ends[0].spawned, waves[0].budget);
    assert.equal(maxPerTick, 1);
    assert.ok(spawnRegions.size > 1);
    const instance = mission.snapshot().instanceId;
    assert.ok(instance && waves[0].instanceId === instance && ends[0].instanceId === instance);
    assert.ok(waves[0].sequence !== undefined && ends[0].sequence !== undefined && waves[0].sequence < ends[0].sequence);
    return { waves: waves.map(({ instanceId, ...wave }) => wave),
      ends: ends.map(({ instanceId, ...end }) => end), initialPositions };
  }
  const single = trace(1);
  const pair = trace(2);
  const trio = trace(3);
  const team = trace(4);
  assert.deepEqual(trace(4), team);
  assert.ok(single.waves[0].budget <= pair.waves[0].budget);
  assert.ok(pair.waves[0].budget < trio.waves[0].budget);
  assert.ok(trio.waves[0].budget <= team.waves[0].budget);
});

test('validation rejects invalid ground, living bodies, visibility, overlap and disconnected navigation', () => {
  const wall = { kind: 'barrier', x: 28, z: 0, halfX: 1, halfZ: 210, height: 6 } as const;
  const def = definition([wall]);
  const world = missionGround(def.world);
  const balance = resolveMissionBalance(BALANCE, 'normal');
  const horde = new HordeManager();
  const players = Array.from({ length: 4 }, (_, i) => createPlayer(String(i), i, 0));
  Object.assign(players[0], { x: 0, z: 0, hp: 100, y: 0, yaw: 0 });
  Object.assign(players[1], { x: -35, z: -45, hp: 100, y: 0, yaw: 0 });
  Object.assign(players[2], { x: -25, z: 76, hp: 100, y: 0, yaw: Math.PI });
  Object.assign(players[3], { x: -1, z: 83, hp: 100, y: 0, yaw: 0 });
  const manager = new SpawnManager({ ...def, world }, horde, new GroundNavigation(world), players, balance, () => false);
  const candidates = [
    { x: Infinity, z: 40 }, { x: 0, z: 215 }, { x: 28, z: 40 }, { x: 0, z: 0 },
    { x: 0, z: 49 }, { x: 45, z: 50 },
  ];
  const results = ['ground', 'ground', 'ground', 'operator-distance', 'visible', 'route'];
  assert.equal(manager.reserveWave(6), 6);
  for (const [index, candidate] of candidates.entries()) {
    manager.beginTick(index + 1, players, false);
    assert.equal(manager.spawnWave(candidate, 'probe'), -1, JSON.stringify(candidate));
    assert.equal(manager.lastResult, results[index]);
  }
  players[3].yaw = Math.PI;
  manager.beginTick(10, players, false);
  const legal = { x: 0, z: 45 };
  assert.equal(typeof manager.spawnWave(legal, 'south'), 'object');
  assert.equal(manager.spawnWave(legal, 'south'), -1);
  assert.equal(manager.lastResult, 'occupied');
  assert.equal(manager.reserved, 5);
  assert.equal(horde.count, 1);
  Object.assign(players[3], { x: 45, z: 0, yaw: 0 });
  manager.beginTick(11, players, false);
  const acrossWall = { x: 45, z: 50 };
  assert.equal(manager.spawnWave(acrossWall, 'southeast', players[0]), -1);
  assert.equal(manager.lastResult, 'route');
  assert.equal(typeof manager.spawnWave(acrossWall, 'southeast'), 'object');
});

test('spawn producers share caps, authored work can reclaim slots, and a freed entity slot is reusable', () => {
  const def = definition();
  const base = resolveMissionBalance(BALANCE, 'normal');
  const balance = { ...base, limits: { ...base.limits, maxActiveEnemies: 4, maxSpawnsPerTick: 2 },
    director: { ...base.director, spawn: { ...base.director.spawn, priorityHeadroom: 0 } } };
  const horde = new HordeManager();
  const player = createPlayer('host', 0, 0);
  Object.assign(player, { hp: 100, yaw: 0 });
  const manager = new SpawnManager(def, horde, new GroundNavigation(def.world), [player], balance, () => false);
  assert.equal(manager.reserveWave(10), 4);
  assert.equal(manager.reserveWave(10), 0);
  manager.beginTick(1, [player], false);
  const south = { x: 0, z: 45 };
  const first = manager.spawnAuthored('nest', south, south, 'nest');
  assert.ok(first >= 0);
  assert.equal(manager.reserved, 3);
  assert.equal(typeof manager.spawnWave({ x: 2, z: 45 }, 'south'), 'object');
  assert.equal(manager.spawnWave({ x: 4, z: 45 }, 'south'), SPAWN_DEFERRED);
  manager.beginTick(2, [player], false);
  assert.equal(typeof manager.spawnWave({ x: 4, z: 45 }, 'south'), 'object');
  assert.equal(typeof manager.spawnWave({ x: 6, z: 45 }, 'south'), 'object');
  assert.equal(manager.reserved, 0);
  assert.equal(horde.count, manager.cap);
  manager.beginTick(3, [player], false);
  assert.equal(manager.spawnAuthored('nest', south, south, 'nest'), SPAWN_DEFERRED);
  horde.despawn(first);
  const id = horde.id[first];
  manager.beginTick(4, [player], false);
  assert.equal(manager.spawnAuthored('nest', south, south, 'nest'), first);
  assert.notEqual(horde.id[first], id);
});

test('a fully occluded candidate can use the existing ground route around cover', () => {
  const def = definition([{ kind: 'rock', x: 0, z: -20, halfX: 5, halfZ: 1, height: 6 }]);
  const horde = new HordeManager();
  const player = createPlayer('host', 0, 0);
  player.hp = 100;
  const balance = resolveMissionBalance(BALANCE, 'normal');
  const manager = new SpawnManager(def, horde, new GroundNavigation(def.world), [player], balance, () => false);
  assert.equal(manager.reserveWave(1), 1);
  manager.beginTick(1, [player], false);
  assert.equal(typeof manager.spawnWave({ x: 0, z: -45 }, 'covered'), 'object');
});

test('an entirely visible spawn area expires with bounded retries and releases its reservations', () => {
  const def = definition();
  const { mission, host } = deploy(1, { ...def, world: { ...def.world, breachRegions: regions.slice(0, 1) } }, Math.PI);
  start(mission, host.id);
  let waveEnd: MissionEvent | undefined;
  stepUntil(mission, () => Boolean(waveEnd ??= mission.drainEvents().find((event) => event.type === 'HordeWaveEnded')));
  assert.equal(waveEnd?.type, 'HordeWaveEnded');
  assert.equal(waveEnd.reason, 'blocked');
  assert.equal(waveEnd.spawned, 0);
  const { spawns } = mission.director;
  const { candidateRetries, groupIntervalTicks } = mission.balance.director.wave;
  const { assaultMaxTicks } = mission.balance.director.timing;
  assert.ok(spawns.totals.waveChecked > 0);
  assert.ok(spawns.totals.waveChecked <= (1 + Math.ceil(assaultMaxTicks / groupIntervalTicks)) * candidateRetries);
  assert.equal(spawns.reserved, 0);
  assert.equal(mission.horde.count, 0);
  stepUntil(mission, () => mission.snapshot().encounter?.state === 'CALM');
});

test('a group whose first spawn dies still dispatches its remaining members through live patrol AI', () => {
  const { mission, host } = deploy(4);
  const { horde, director } = mission;
  start(mission, host.id);
  stepUntil(mission, () => director.spawns.totals.waveSpawned === 1);
  const first = [...director.patrols.groups.values()].find((group) => !group.canReinforce)!;
  assert.equal(first.members.size, 1);
  assert.ok(director.spawns.reserved > 0);
  horde.despawn(horde.active[0]);
  stepUntil(mission, () => director.spawns.totals.waveSpawned === 2);
  const replacement = director.patrols.groupFor(horde.active[0]);
  assert.equal(first.state, 'ELIMINATED');
  assert.ok(replacement && director.patrols.groups.get(replacement.id) === replacement);
  assert.equal(replacement.state, 'INVESTIGATING');
  assert.equal(replacement.canReinforce, false);
});

test('a live wave yields to defense, nest destruction and mission results without deleting its cohort', () => {
  for (const reason of ['defense', 'nest-destroyed', 'mission-ended'] as const) {
    const def = definition();
    const { mission, players, host } = deploy(4, {
      ...def, world: { ...def.world, initialNests: [{ x: -86, z: 78 }] },
    });
    const { spawns, nests } = mission.director;
    start(mission, host.id);
    stepUntil(mission, () => spawns.totals.waveSpawned > 0);
    assert.ok(spawns.reserved > 0);
    const first = mission.horde.id[mission.horde.active[0]];
    const waveId = mission.snapshot().encounter?.waveId;
    const prior = spawns.totals.waveSpawned;
    if (reason === 'defense') {
      const objective = mission.definition.objectives[0];
      assert.equal(objective.kind, 'activate');
      Object.assign(host, objective);
      assert.ok(mission.interact(host.id));
    } else if (reason === 'nest-destroyed') {
      const nest = [...nests.active.values()][0];
      assert.ok(nest);
      nests.destroy(nest, mission.tick, host.id);
      assert.equal(nest.spawnBudget, 0);
    } else {
      for (const player of players) player.hp = 0;
    }
    mission.step();
    const ends = mission.drainEvents().filter((event) => event.type === 'HordeWaveEnded');
    assert.deepEqual(ends.map((event) => [event.waveId, event.reason]), [[waveId, reason]]);
    assert.equal(spawns.reserved, 0);
    assert.equal(spawns.totals.waveSpawned, prior);
    assert.ok(mission.horde.active.subarray(0, mission.horde.count).some((slot) => mission.horde.id[slot] === first));
    if (reason === 'mission-ended') {
      assert.equal(mission.snapshot().encounter, undefined);
      assert.ok(mission.snapshot().result);
    } else {
      assert.equal(mission.snapshot().encounter?.state, 'RECOVERY');
    }
  }
});

test('pressure rises gradually after damage and concentration, while disconnect and reconnect preserve the wave ID', () => {
  const { mission, players, host } = deploy(4);
  start(mission, host.id);
  const waveId = mission.snapshot().encounter?.waveId;
  mission.disconnect(players[1].id);
  mission.step();
  assert.equal(mission.director.pacing.metrics().living, 3);
  mission.reconnect(players[1].id);
  mission.step();
  assert.equal(mission.director.pacing.metrics().living, 4);
  assert.equal(mission.snapshot().encounter?.waveId, waveId);
  const before = mission.director.pacing.metrics().pressure;
  for (let i = 0; i < 18; i++) {
    const point = { x: -9 + i, z: 12 };
    assert.ok(distanceSquared(host, point) < mission.balance.patrols.sightRange ** 2);
    mission.horde.spawn(point.x, point.z, SCHABE_TYPE);
  }
  players[3].hp = 0;
  host.hp = 20;
  stepUntil(mission, () => mission.director.pacing.metrics().pressure > before);
  const sample = mission.director.pacing.metrics();
  assert.ok(sample.pressure <= before + mission.balance.director.pressure.smoothing);
  assert.equal(sample.living, 3);
  assert.ok(sample.nearby >= 18);
  assert.equal(mission.drainEvents().filter((event) => event.type === 'HordeWaveStarted').length, 1);
});
