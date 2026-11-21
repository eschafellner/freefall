import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BALANCE, BODENBRUCH, ENEMY_TYPES, NET, SCHABE_TYPE, newPosture, openGround, resolveMissionBalance,
} from '@freefall/shared';
import type { Obstacle, PositionXZ, Posture, WorldDefinition } from '@freefall/shared';
import { ENEMY_GROUND_RADIUS, EnemyNavigation } from '../src/ecs/EnemyNavigation.ts';
import { HordeManager } from '../src/ecs/HordeManager.ts';
import { UniformGrid } from '../src/ecs/UniformGrid.ts';
import { GroundNavigation } from '../src/mission/GroundNavigation.ts';
import { MissionInstance } from '../src/mission/MissionInstance.ts';
import { PatrolManager } from '../src/mission/PatrolManager.ts';
import { Battlefield } from '../src/simulation/Battlefield.ts';
import { damageEnemy } from '../src/systems/combat.ts';
import { enemyCombatTick, runEnemyStrike } from './support/enemy-combat.ts';
import { movementSystem } from '../src/systems/horde.ts';

const stats = ENEMY_TYPES[SCHABE_TYPE];
const world = (obstacles: readonly Obstacle[] = []): WorldDefinition => ({
  ...BODENBRUCH.world, half: 25, obstacles, patrolRegions: [], breachRegions: [], initialNests: [],
  deployment: { x: -20, z: 20, radius: 2, facing: 0 },
});
const barrier = (x: number, halfX: number, halfZ: number, height = 1.4, z = 0): Obstacle =>
  ({ x, z, halfX, halfZ, height, kind: 'barrier' });
const advance = (field: Battlefield, ticks: number) => {
  for (let i = 0; i < ticks; i++) field.step();
};

test('local pursuit distributes over four operators, retains comparable targets and switches for a large distance advantage', () => {
  const field = new Battlefield(42);
  const players = ['a', 'b', 'c', 'd'].map((id, i) =>
    Object.assign(field.addPlayer(id), { x: i % 2 * 20, z: Math.floor(i / 2) * 20 }));
  const nearEach = players.map((p) => field.horde.spawn(p.x, p.z + 4, SCHABE_TYPE));
  field.step();
  assert.deepEqual(nearEach.map((i) => field.horde.target[i]), [0, 1, 2, 3]);

  const [a, b] = players;
  const enemy = nearEach[0];
  const park = () => { field.horde.x[enemy] = 0; field.horde.z[enemy] = 0; };
  a.x = 10;
  b.x = 9.5;
  for (let i = 0; i < NET.tickHz + 12; i++) {
    park();
    field.step();
    assert.equal(field.horde.target[enemy], a.slot);
  }
  b.x = 3;
  for (let i = 0; i < 6; i++) {
    park();
    field.step();
  }
  assert.equal(field.horde.target[enemy], b.slot);
  field.removePlayer(b.id);
  park();
  const replacement = Object.assign(field.addPlayer('replacement'), { x: 24, z: 24 });
  assert.equal(replacement.slot, b.slot);
  field.step();
  assert.equal(field.horde.target[enemy], a.slot);
  a.life++;
  replacement.x = 1;
  replacement.z = 1;
  park();
  field.step();
  assert.equal(field.horde.target[enemy], replacement.slot);
});

test('four mission operators take simultaneous authoritative hits across postures and reconnect without stale aggro', () => {
  const definition = {
    ...BODENBRUCH, world: { ...BODENBRUCH.world, patrolRegions: [], breachRegions: [], initialNests: [] },
  };
  const mission = new MissionInstance(17, definition);
  const players = ['a', 'b', 'c', 'd'].map((id) => mission.addPlayer(id));
  assert.ok(mission.debug(players[0].id, 'land'));
  const postures = ['STANDING', 'CROUCHING', 'PRONE', 'SUPINE'] as const;
  const members = players.map((p, slot) => {
    Object.assign(p, { x: -75 + slot * 23, z: 5, protectedUntil: 0 });
    p.posture = { ...newPosture(), current: postures[slot] };
    const region = { id: p.id, x: p.x, z: p.z, radius: 4, route: { waypoints: [{ x: p.x, z: p.z + 3 }] } };
    const group = mission.director.patrols.create(region, 0);
    group.nextCall = Infinity; // Keep this fixture focused on combat; reinforcement calls are covered by mission tests.
    const enemy = mission.horde.spawn(p.x, p.z - 1, SCHABE_TYPE);
    mission.director.patrols.attach(group, enemy);
    mission.director.patrols.forceAlert(group, p, mission.tick);
    mission.horde.yaw[enemy] = Math.PI;
    return { group, enemy };
  });
  const before = players.map((p) => p.hp);
  mission.step();
  assert.deepEqual(members.map(({ enemy }) => mission.horde.target[enemy]), [0, 1, 2, 3]);
  assert.deepEqual(players.map((p) => p.hp), before);
  advance(mission, mission.enemyCombat.timing.windupTicks + mission.enemyCombat.timing.decisionTicks);
  assert.deepEqual(players.map((p) => p.hp), before.map((hp) => hp - stats.meleeDamage));
  const player = players[2], { enemy } = members[2];
  mission.disconnect(player.id);
  const life = player.life, hp = player.hp;
  mission.step();
  assert.equal(mission.horde.target[enemy], -1);
  assert.equal(player.hp, hp);
  advance(mission, NET.tickHz);
  assert.equal(player.hp, hp);
  mission.reconnect(player.id);
  assert.equal(player.life, life);
  for (let i = 0; i < 8 && mission.horde.target[enemy] !== player.slot; i++) {
    mission.horde.x[enemy] = player.x;
    mission.horde.z[enemy] = player.z - 1;
    mission.step();
  }
  assert.equal(mission.horde.target[enemy], player.slot);
  for (let i = 0; i < Math.ceil(stats.meleeCooldown * NET.tickHz) && player.hp === hp; i++) mission.step();
  assert.equal(player.hp, hp - stats.meleeDamage);
  assert.equal(mission.enemyAIMetrics().samples.find(({ id }) => id === mission.horde.id[enemy])?.target, player.id);
});

test('a disconnect and reconnect between ticks cancels an old windup and releases its sector', () => {
  const mission = new MissionInstance(17, { ...BODENBRUCH, world: { ...world(), breachRegions: [] } });
  const player = mission.addPlayer('operator');
  assert.ok(mission.debug(player.id, 'land'));
  Object.assign(player, { x: 0, z: 0, protectedUntil: 0 });
  const group = mission.director.patrols.create({ id: 'probe', x: 0, z: 0, radius: 4, route: { waypoints: [player] } }, 0);
  const slot = mission.horde.spawn(0, 1, SCHABE_TYPE);
  mission.director.patrols.attach(group, slot);
  mission.director.patrols.forceAlert(group, player, mission.tick);
  mission.horde.yaw[slot] = 0;
  advance(mission, mission.enemyCombat.timing.decisionTicks);
  const attack = mission.enemyCombat.get(mission.horde, slot);
  assert.ok(attack && attack.reservation >= 0);
  const hp = player.hp;
  mission.disconnect(player.id);
  mission.reconnect(player.id);
  assert.equal(attack.result, 'target-lost');
  assert.equal(attack.reservation, -1);
  advance(mission, mission.enemyCombat.timing.windupTicks + mission.enemyCombat.timing.activeTicks);
  assert.equal(player.hp, hp);
  assert.equal(mission.enemyCombat.totals.interruptions, 1);
});

test('patrol cleanup releases dead memberships without removing a reused slot from its new group', () => {
  const horde = new HordeManager();
  const balance = resolveMissionBalance(BALANCE, 'normal');
  const patrols = new PatrolManager(world(), horde, () => .5, () => {}, balance);
  const region = { id: 'probe', x: 0, z: 0, radius: 4, route: { waypoints: [{ x: 0, z: 0 }] } };
  const previous = patrols.create(region, 0);
  const dropped = horde.spawn(0, 0, SCHABE_TYPE), reused = horde.spawn(1, 0, SCHABE_TYPE);
  patrols.attach(previous, dropped);
  patrols.attach(previous, reused);
  horde.despawn(dropped);
  horde.despawn(reused);
  const successor = patrols.create(region, 0);
  assert.equal(horde.spawn(1, 0, SCHABE_TYPE), reused);
  patrols.attach(successor, reused);
  for (let tick = 1; tick <= balance.patrols.perceptionPeriodTicks; tick++) patrols.update([], tick, false, () => undefined);
  assert.equal(previous.state, 'ELIMINATED');
  assert.equal(patrols.groupFor(dropped), undefined);
  assert.equal(patrols.groupFor(reused), successor);
  assert.equal(patrols.groups.size, 1);
});

test('patrol perception discards a visible operator across an impassable low wall and leaves expired search', () => {
  const surface = world([barrier(0, .12, 25, .3)]);
  const horde = new HordeManager();
  const field = new Battlefield(12);
  const player = Object.assign(field.addPlayer('across'), { x: 4, z: 0 });
  const closer = Object.assign(field.addPlayer('reachable'), { x: -12, z: 0 });
  const balance = resolveMissionBalance(BALANCE, 'normal');
  const patrols = new PatrolManager(surface, horde, () => .5, () => {}, balance);
  const waypoint = { x: -4, z: 0 };
  const group = patrols.create({ id: 'split', ...waypoint, radius: 6, route: { waypoints: [waypoint] } }, 0);
  const slot = horde.spawn(waypoint.x, waypoint.z, SCHABE_TYPE);
  patrols.attach(group, slot);
  patrols.enableLandingContact(0);
  let tick = 0;
  const update = (ticks: number) => {
    for (let i = 0; i < ticks; i++) patrols.update(field.players, ++tick, false, () => undefined);
  };
  update(20);
  assert.equal(patrols.targetFor(field.players, slot), closer);
  assert.notEqual(patrols.targetFor(field.players, slot), player);
  closer.hp = 0;
  update(20 + balance.patrols.contactMemoryTicks + balance.patrols.lostContactSearchTicks + 20);
  assert.equal(patrols.targetFor(field.players, slot), undefined);
  assert.ok(group.state === 'RETURNING' || group.state === 'PATROLLING');
});

for (const posture of ['STANDING', 'CROUCHING', 'DIVING', 'PRONE', 'SUPINE', 'GETTING_UP', 'SLIDING'] as const satisfies readonly Posture[]) {
  test(`contact and cooldown follow ${posture}`, () => {
    const field = new Battlefield(3);
    const p = Object.assign(field.addPlayer('operator'), { x: 0, z: 0, y: posture === 'DIVING' ? .2 : 0, protectedUntil: 0 });
    p.posture = { ...newPosture(), current: posture, from: 'PRONE', started: 0, until: 45 };
    const horde = field.horde;
    const slot = horde.spawn(4, 0, SCHABE_TYPE);
    horde.target[slot] = p.slot;
    horde.yaw[slot] = -Math.PI / 2;
    const hp = p.hp, tick = 10;
    enemyCombatTick(field, tick);
    assert.equal(p.hp, hp);
    assert.equal(horde.attackAt[slot], 0);
    horde.x[slot] = 1.2;
    runEnemyStrike(field, tick);
    assert.equal(p.hp, hp - stats.meleeDamage);
    assert.equal(horde.attackAt[slot], tick + Math.ceil(stats.meleeCooldown * NET.tickHz));
  });
}

test('cover blocks at strike height, while elevation, stagger and death cancel contact', () => {
  const field = new Battlefield(3);
  const p = Object.assign(field.addPlayer('operator'), { x: 0, z: 0, protectedUntil: 0 });
  const horde = field.horde;
  const enemy = horde.spawn(1.25, 0, SCHABE_TYPE);
  horde.target[enemy] = p.slot;
  horde.yaw[enemy] = -Math.PI / 2;
  const hp = p.hp;
  const attack = (tick: number, surface?: WorldDefinition) => enemyCombatTick(field, tick, surface);
  attack(2, world([barrier(.7, .02, 2, .85)]));
  assert.equal(p.hp, hp);
  p.y = 1.3;
  attack(4);
  assert.equal(p.hp, hp);
  p.y = 0;
  field.stagger.begin(horde, enemy, 8, 12);
  attack(6);
  assert.equal(p.hp, hp);
  runEnemyStrike(field, 8);
  assert.equal(p.hp, hp - stats.meleeDamage);
  damageEnemy(horde, enemy, stats.health);
  attack(100);
  assert.equal(p.hp, hp - stats.meleeDamage);
  const next = horde.spawn(1, 0, SCHABE_TYPE);
  horde.target[next] = p.slot;
  p.hp = 0;
  attack(102);
  assert.equal(horde.attackAt[next], 0);
});

test('ground navigation goes around low collision footprints and permits a direct narrow corridor', () => {
  const surface = world([barrier(0, 2, 3, .25)]);
  const nav = new GroundNavigation(surface);
  const horde = new HordeManager();
  const enemy = horde.spawn(-9, 0, SCHABE_TYPE);
  const goal = { x: 9, z: 0 };
  let arrived = false;
  for (let i = 0; i < 500; i++) {
    const waypoint = { ...goal };
    assert.ok(nav.steer(horde.x[enemy], horde.z[enemy], waypoint));
    const dx = waypoint.x - horde.x[enemy], dz = waypoint.z - horde.z[enemy];
    const scale = Math.min(stats.speed / Math.hypot(dx, dz), NET.tickHz);
    horde.vx[enemy] = dx * scale;
    horde.vz[enemy] = dz * scale;
    movementSystem(horde, surface);
    assert.ok(openGround(surface, horde.x[enemy], horde.z[enemy], ENEMY_GROUND_RADIUS));
    if (Math.hypot(horde.x[enemy] - goal.x, horde.z[enemy] - goal.z) < .25) {
      arrived = true;
      break;
    }
  }
  assert.ok(arrived);
  const corridor = new GroundNavigation(world([barrier(0, 4, .4, 2, -1), barrier(0, 4, .4, 2, 1)]));
  const direct = { x: 7, z: 0 };
  assert.equal(corridor.steer(-7, 0, direct), true);
  assert.deepEqual(direct, { x: 7, z: 0 });
  for (const invalid of [{ x: NaN, z: 0 }, { x: 26, z: 0 }, { x: 0, z: 0 }]) assert.equal(nav.steer(-9, 0, invalid), false);
  assert.equal(horde.x[enemy] > 0, true); // Geometry is navigated on the flat ground plane.
});

test('a patrol skips a waypoint across a disconnected ground region', () => {
  const surface = world([barrier(0, .12, 25)]);
  const horde = new HordeManager();
  const patrols = new PatrolManager(surface, horde, () => .5, () => {}, resolveMissionBalance(BALANCE, 'normal'));
  const here = { x: -6, z: 0 };
  const group = patrols.create({ id: 'route', ...here, radius: 10,
    route: { waypoints: [here, { x: 8, z: 0 }, { x: -16, z: 1 }] } }, 0);
  const enemy = horde.spawn(here.x, here.z, SCHABE_TYPE);
  patrols.attach(group, enemy);
  for (let tick = 1; tick <= 6; tick++) patrols.update([], tick, false, () => undefined);
  assert.equal(group.waypoint, 2);
  assert.equal(group.state, 'PATROLLING');
});

test('sustained world clipping is counted once and an invalid origin is repaired without stale slot state', () => {
  const surface = world([barrier(0, .2, 5)]);
  const navigation = new EnemyNavigation();
  const horde = new HordeManager();
  const enemy = horde.spawn(-.61, 0, SCHABE_TYPE);
  horde.vx[enemy] = stats.speed;
  for (let tick = 1; tick <= 24; tick++) movementSystem(horde, surface, tick, undefined, navigation);
  assert.equal(navigation.stuckEpisodes, 1);
  assert.equal(navigation.getStatus(horde, enemy)?.stuck, true);
  horde.despawn(enemy);
  assert.equal(horde.spawn(0, 0, SCHABE_TYPE), enemy);
  movementSystem(horde, surface, 25, undefined, navigation);
  assert.ok(openGround(surface, horde.x[enemy], horde.z[enemy], ENEMY_GROUND_RADIUS));
  assert.equal(navigation.recoveries, 1);
  assert.equal(navigation.getStatus(horde, enemy)?.stuck, false);
  const blocked: PositionXZ = { x: 0, z: 0 };
  navigation.setGoal(horde, enemy, blocked, -1, 26);
  assert.equal(navigation.canSteer(horde, enemy, 27), false);
  assert.equal(navigation.canSteer(horde, enemy, 44), true);
  navigation.setGoal(horde, enemy, blocked, -1, 44);
  assert.equal(navigation.unreachableEpisodes, 1);
});

test('bounded grid samples include nearby cells, follow moving slots and rotate dense contacts', () => {
  const field = new HordeManager();
  const grid = new UniformGrid(20);
  const slot = field.spawn(0, 0, SCHABE_TYPE);
  grid.rebuild(field);
  assert.equal(grid.nearby(field, slot, 1.65, 8, 8), 0);
  const close = field.spawn(1.2, 0, SCHABE_TYPE);
  const remote = field.spawn(-1.5, 1.5, SCHABE_TYPE);
  assert.notEqual(grid.cell(0), grid.cell(1.2));
  grid.rebuild(field);
  assert.equal(grid.nearby(field, slot, 1.65, 8, 8), 1);
  assert.equal(grid.neighbors[0], close);
  field.x[close] = 3.2;
  grid.rebuild(field);
  assert.equal(grid.nearby(field, slot, 1.65, 8, 8), 0);
  for (let i = 0; i < 64; i++) field.spawn(.1, .1, SCHABE_TYPE);
  const sampled = new Set<number>();
  for (let tick = 1; tick < 10; tick++) {
    grid.rebuild(field, tick);
    assert.equal(grid.nearby(field, slot, 1.65, 8, 6), 6);
    for (const other of grid.neighbors.subarray(0, 6)) sampled.add(other);
  }
  assert.ok(sampled.size > 12);
  assert.ok(!sampled.has(remote));
});

test('forty converging attackers keep flowing into several sectors without collapsing onto the operator', () => {
  const field = new Battlefield(42);
  const player = Object.assign(field.addPlayer('operator'), { x: 0, z: 0, protectedUntil: 0 });
  for (let i = 0; i < 40; i++) {
    const angle = i * Math.PI / 20;
    const radius = 3 + i % 4;
    field.horde.spawn(Math.cos(angle) * radius, Math.sin(angle) * radius, SCHABE_TYPE);
  }
  player.hp = 100_000;
  advance(field, 240);
  const { horde } = field;
  const quadrants = new Set<number>();
  let inReach = 0, closest = Infinity;
  for (const slot of horde.active.subarray(0, horde.count)) {
    const x = horde.x[slot], z = horde.z[slot];
    if (Math.hypot(x, z) <= stats.meleeRange) {
      inReach++;
      quadrants.add(Number(x >= 0) + Number(z >= 0) * 2);
    }
    for (const other of horde.active.subarray(0, horde.count)) {
      if (other > slot) closest = Math.min(closest, Math.hypot(x - horde.x[other], z - horde.z[other]));
    }
  }
  assert.equal(quadrants.size, 4);
  assert.ok(inReach >= 6 && inReach <= 27, String(inReach));
  assert.ok(closest >= .5, String(closest));
  assert.ok(player.hp < 100_000);
  assert.equal(horde.count, 40);
});

test('a horde clears a bent 1.2 m passage without world clipping or jumping between waypoints', () => {
  const ground = world([
    barrier(0, 25, 11.2, .25, -13.8),
    barrier(-11.8, 13.2, 3.7, 2, 2.3),
    barrier(13.8, 11.2, 4.3, 3, 1.7),
  ]);
  const field = new Battlefield(8, ground);
  const player = Object.assign(field.addPlayer('exit'), { x: 2, z: 9, protectedUntil: 0, hp: 100_000 });
  const slots = Array.from({ length: 8 }, (_, i) => field.horde.spawn(-2 - i * .85, -2, SCHABE_TYPE));
  for (let tick = 0; tick < 400; tick++) {
    const x = slots.map((i) => field.horde.x[i]), z = slots.map((i) => field.horde.z[i]);
    field.step();
    for (const [index, i] of slots.entries()) {
      assert.ok(openGround(ground, field.horde.x[i], field.horde.z[i], ENEMY_GROUND_RADIUS));
      assert.ok(Math.hypot(field.horde.x[i] - x[index], field.horde.z[i] - z[index]) <= stats.speed / NET.tickHz + 1e-5);
    }
  }
  assert.ok(slots.filter((i) => field.horde.z[i] > 6.37).length >= 6,
    JSON.stringify(slots.map((i) => field.navigation.getStatus(field.horde, i))));
  assert.ok(player.hp < 100_000);
});

test('distance fields are shared, cached and budgeted and invalid destinations allocate no field', () => {
  const nav = new GroundNavigation(world([barrier(0, .4, 4)]), {
    ...BALANCE.swarm.hordeAi, routeRequestsPerTick: 3, fieldBuildsPerTick: 1, fieldCacheLimit: 1,
  });
  nav.beginTick();
  assert.equal(nav.route(-5, 0, { x: Number.NaN, z: 0 }), -1);
  assert.equal(nav.route(-5, 0, { x: 5, z: 0 }), 1);
  assert.equal(nav.route(-5, .2, { x: 5, z: 0 }), 1);
  assert.equal(nav.route(-5, 0, { x: 12, z: 1 }), 0);
  assert.equal(nav.route(-5, 0, { x: 5, z: 0 }), 0);
  assert.deepEqual(nav.metrics, { requests: 3, builds: 1, hits: 1, deferred: 2 });
  nav.beginTick();
  assert.equal(nav.route(-5, 0, { x: 12, z: 1 }), 1);
  assert.equal(nav.route(-5, 0, { x: 5, z: 0 }), 0);
  assert.equal(nav.metrics.builds, 2);
});

test('blocked progress uses bounded recovery stages and reacts to a new goal, while arrival remains intentional', () => {
  const config = { ...BALANCE.swarm.hordeAi, stuckTicks: 6 };
  const nav = new EnemyNavigation(config);
  const horde = new HordeManager();
  const slot = horde.spawn(0, 0, SCHABE_TYPE);
  const goal = { x: 5, z: 0 };
  nav.initialize(horde, slot);
  nav.intent(slot, goal);
  nav.setGoal(horde, slot, goal, 1, 1);
  for (let tick = 1; tick <= 300; tick++) nav.moved(horde, slot, 0, 0, stats.speed, false, tick);
  assert.equal(nav.stuckEpisodes, 1);
  assert.equal(nav.recoveryAttempts, config.recoveryRetries);
  assert.equal(nav.recoveryFallbacks, 1);
  assert.equal(nav.recoveryStage(slot, 300), -1);

  goal.x = -4;
  nav.intent(slot, goal);
  nav.setGoal(horde, slot, goal, 1, 301);
  assert.equal(nav.recoveryStage(slot, 301), 0);
  for (let tick = 302; tick <= 307; tick++) nav.moved(horde, slot, 0, 0, stats.speed, false, tick);
  for (let tick = 308; tick <= 319; tick++) {
    const before = horde.x[slot];
    horde.x[slot] -= stats.speed / NET.tickHz;
    nav.moved(horde, slot, before, 0, stats.speed, false, tick);
  }
  assert.equal(nav.recoverySuccesses, 1);
  goal.x = horde.x[slot];
  nav.setGoal(horde, slot, goal, 1, 320);
  for (let tick = 321; tick <= 400; tick++) nav.moved(horde, slot, goal.x, 0, stats.speed, false, tick);
  assert.equal(nav.stuckEpisodes, 2);
});

test('route refresh ignores small goal changes and immediately follows a materially displaced goal', () => {
  const ground = new GroundNavigation(world());
  const navigation = new EnemyNavigation();
  const horde = new HordeManager();
  const slot = horde.spawn(-5, 0, SCHABE_TYPE);
  navigation.initialize(horde, slot);
  const route = (x: number, z: number, tick: number) => {
    const goal = { x, z };
    ground.beginTick();
    navigation.intent(slot, goal);
    assert.equal(navigation.resolve(horde, slot, goal, tick, ground), 1);
    navigation.setGoal(horde, slot, goal, 1, tick);
    return goal;
  };
  assert.deepEqual(route(4, 0, 1), { x: 4, z: 0 });
  assert.deepEqual(route(4.2, .08, 2), { x: 4, z: 0 });
  assert.equal(ground.metrics.requests, 1);
  assert.deepEqual(route(6, 1.2, 3), { x: 6, z: 1.2 });
  assert.equal(ground.metrics.requests, 2);
});

test('separation against cover and a terrain boundary stays deterministic and respects both obstacles', () => {
  const cover = world([barrier(0, 5, .25, .3, 23.3)]);
  const run = () => {
    const field = new Battlefield(108, cover);
    const player = Object.assign(field.addPlayer('wall'), { x: 3, z: 24.2, hp: 100_000, protectedUntil: 0 });
    const slots = Array.from({ length: 6 }, () => field.horde.spawn(-4, 24.2, SCHABE_TYPE));
    for (let tick = 0; tick < 360; tick++) {
      field.step();
      for (const slot of slots) {
        assert.ok(field.horde.z[slot] <= cover.half - .5);
        assert.ok(openGround(cover, field.horde.x[slot], field.horde.z[slot], ENEMY_GROUND_RADIUS));
      }
    }
    assert.ok(player.hp < 100_000);
    return slots.map((slot) => [field.horde.x[slot], field.horde.z[slot], field.horde.yaw[slot]]);
  };
  assert.deepEqual(run(), run());
});
