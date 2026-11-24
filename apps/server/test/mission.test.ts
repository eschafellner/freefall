import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALBATROSS, BALANCE, BALLOON, FRAG, BOARDING_TICKS, BODENBRUCH, CARRIER_ROOM_SIZE, CARRIER_ROOMS, CARRIER_SHIP, DIFFICULTIES, LANDING_STAGE_TICKS, HordeFrame, MAX_ENEMIES, NET, SCHABE_TYPE, BREACHER_TYPE, WIDE_POSITION_SCALE, decodeHorde,
  distanceSquared, inAlbatross, missionGround, newPosture, openGround, resolveMissionBalance,
} from '@freefall/shared';
import type { DifficultyDefinition, MissionDefinition, MissionEvent, PatrolRegion, PositionXZ } from '@freefall/shared';
import { GroundNavigation } from '../src/mission/GroundNavigation.ts';
import { MissionInstance } from '../src/mission/MissionInstance.ts';
import { PatrolManager } from '../src/mission/PatrolManager.ts';
import { HordeManager } from '../src/ecs/HordeManager.ts';
import { createPlayer } from '../src/simulation/Player.ts';
import { damageEnemy } from '../src/systems/combat.ts';
import { encodeHorde, playerSnapshot } from '../src/networking/snapshots.ts';

const alpha = BODENBRUCH.objectives[0];
const bravo = BODENBRUCH.objectives[1];
assert.ok(alpha.kind === 'activate' && bravo.kind === 'activate');

function advance(mission: MissionInstance, count: number): void {
  for (let i = 0; i < count; i++) mission.step();
}

function plan(mission: MissionInstance, player: ReturnType<typeof createPlayer>, difficulty: string) {
  Object.assign(player, { x: 0, z: 3 });
  assert.ok(mission.select(player.id, { planetId: 'dev-ault', missionId: mission.definition.id, difficultyId: difficulty }));
  assert.ok(mission.start(player.id));
}

function board(mission: MissionInstance, player: ReturnType<typeof createPlayer>) {
  Object.assign(player, { ...CARRIER_SHIP, x: player.slot % 2 ? 1 : -1 });
  assert.ok(mission.action(player.id, 'ready'));
}

function deployed(difficulty = 'normal', def = BODENBRUCH, count = 1) {
  const mission = new MissionInstance(51296, def);
  const players = Array.from({ length: count }, (_, index) => mission.addPlayer(index ? String(index) : 'host'));
  const player = players[0];
  plan(mission, player, difficulty);
  for (const member of players) board(mission, member);
  advance(mission, BOARDING_TICKS + LANDING_STAGE_TICKS + 1);
  return { mission, player, players };
}

function unlock(mission: MissionInstance, player: ReturnType<typeof createPlayer>) {
  assert.ok(mission.debug(player.id, 'objectives'));
  advance(mission, 2);
  assert.equal(mission.state, 'EXTRACTION_AVAILABLE');
}

function visit(mission: MissionInstance, player: ReturnType<typeof createPlayer>, objective: PositionXZ): boolean {
  Object.assign(player, { x: objective.x, z: objective.z });
  advance(mission, 6);
  return mission.interact(player.id);
}

test('each side room can be entered and left through its doorway with regular inputs', () => {
  for (const room of CARRIER_ROOMS) {
    const mission = new MissionInstance(10, BODENBRUCH);
    const player = mission.addPlayer('operator');
    // Stage the approach in the mess, then cross the doorway through the movement system.
    Object.assign(player, { x: 0, z: room.z + 2.4 });
    let seq = 0;
    const walk = (yaw: number, count: number) => {
      for (let i = 0; i < count; i++) {
        mission.receiveInput(player.id, { seq: ++seq, forward: 1, strafe: 0, yaw, pitch: 0, sprint: true, fire: false });
        mission.step();
      }
    };
    walk(Math.sign(room.x) * Math.PI / 2, 62);
    assert.ok(Math.abs(player.x) > CARRIER_ROOM_SIZE.inner + 4 && Math.abs(player.x) < CARRIER_ROOM_SIZE.outer, 'inside the room');
    assert.ok(Math.hypot(player.x - room.x, player.z - room.z) < 5, 'within reach of the station');
    walk(-Math.sign(room.x) * Math.PI / 2, 62);
    assert.ok(Math.abs(player.x) < 1);
  }
});

test('the carrier service frame blocks standing and permits crouching underneath', () => {
  const mission = new MissionInstance(10, BODENBRUCH);
  const p = mission.addPlayer('test');
  Object.assign(p, { x: -6.5, z: 14.3 });
  let seq = 0;
  const step = (posture?: 'crouch' | 'stand', forward = 1) => {
    assert.ok(mission.receiveInput(p.id, { seq: ++seq, life: p.life, posture, forward,
      strafe: 0, yaw: 0, pitch: 0, sprint: false, fire: false }));
    mission.step();
  };
  for (let i = 0; i < 30; i++) step();
  assert.ok(p.z >= 13.2);
  step('crouch');
  while (p.z > 12.45 && seq < 60) step();
  assert.ok(p.z < 12.45);
  step('stand', 0);
  assert.equal(p.posture.current, 'CROUCHING');
  for (let i = 0; i < 26; i++) step();
  step('stand');
  assert.equal(p.posture.current, 'STANDING');
});

test('one to four operators require host selection and complete the same deployment once', () => {
  for (let count = 1; count <= 4; count++) {
    const mission = new MissionInstance(91245, BODENBRUCH);
    const operators = Array.from({ length: count }, (_, i) => mission.addPlayer(String(i)));
    assert.equal(mission.state, 'CARRIER_HUB');
    assert.equal(mission.start('0'), false);
    assert.equal(mission.select('0', { planetId: 'dev-ault', missionId: BODENBRUCH.id, difficultyId: 'easy' }), false);
    plan(mission, operators[0], 'easy');
    assert.equal(mission.action('0', 'ready'), false);
    const vessel = mission.snapshot().albatross;
    assert.ok(vessel);
    for (const operator of operators.slice(0, -1)) board(mission, operator);
    advance(mission, BOARDING_TICKS + 3);
    assert.equal(mission.state, 'BOARDING');
    board(mission, operators.at(-1)!);
    advance(mission, 2);
    assert.ok(mission.snapshot().boardingUntil > mission.tick);
    advance(mission, BOARDING_TICKS + LANDING_STAGE_TICKS);
    assert.equal(mission.state, 'ACTIVE_MISSION');
    const state = mission.snapshot();
    assert.equal(state.albatross?.id, vessel.id);
    assert.equal(state.phase, 'DEPLOYED');
    assert.equal(state.convicts.length, 4);
    assert.equal(new Set(state.convicts.map(({ id }) => id)).size, 4);
    assert.ok(operators.every((operator) => inAlbatross(operator, state.albatross!)));
    const events = mission.drainEvents();
    assert.equal(events.filter(({ type }) => type === 'AlbatrossTouchdown').length, 1);
    assert.equal(events.filter(({ type }) => type === 'MissionStarted').length, 1);
    advance(mission, 36);
    assert.ok([...mission.director.patrols.groups.values()].some(({ state }) => state === 'SUSPICIOUS' || state === 'INVESTIGATING'));
    assert.equal(mission.start('0'), false);
  }
});

test('disconnect and leaving the boarding footprint clear readiness without blocking departure', () => {
  const mission = new MissionInstance(91245, BODENBRUCH);
  const host = mission.addPlayer('host');
  const wing = mission.addPlayer('wing');
  plan(mission, host, 'easy');
  board(mission, host);
  board(mission, wing);
  mission.step();
  assert.ok(mission.snapshot().boardingUntil);
  wing.z += 7;
  mission.step();
  assert.equal(mission.snapshot().boardingUntil, 0);
  mission.disconnect('wing');
  advance(mission, BOARDING_TICKS + LANDING_STAGE_TICKS + 1);
  assert.equal(mission.state, 'ACTIVE_MISSION');
  mission.reconnect('wing');
  assert.equal(wing.hp, 0);
  assert.equal(mission.snapshot().operators[1].connected, true);
});

test('a mission reconnect restores an airborne dive, which lands without a second request', () => {
  const { mission, player } = deployed('easy');
  const seq = player.input.seq + 1;
  assert.ok(mission.receiveInput(player.id, { seq, life: player.life,
    forward: -1, strafe: .19, yaw: player.posture.yaw, pitch: 0, sprint: false, fire: false, posture: 'dive' }));
  advance(mission, 6);
  const started = player.posture.started;
  assert.equal(player.posture.current, 'DIVING');
  mission.disconnect(player.id);
  advance(mission, 5);
  mission.reconnect(player.id);
  const rejoined = playerSnapshot(mission, player.id).players[0];
  assert.equal(rejoined.posture?.current, 'DIVING');
  assert.equal(rejoined.posture?.started, started);
  assert.equal(rejoined.posture?.dive?.id, seq);
  assert.ok(rejoined.y! > 0);
  advance(mission, 30);
  assert.equal(playerSnapshot(mission, player.id).players[0].posture?.current, 'SUPINE');
});

test('Alpha gates Bravo and an Albatross departure rewards only secured living passengers', () => {
  const { mission, player, players } = deployed('easy', BODENBRUCH, 2);
  assert.equal(mission.action(player.id, 'balloon'), false);
  assert.equal(visit(mission, player, bravo), false);
  assert.equal(visit(mission, player, alpha), true);
  assert.equal(mission.snapshot().objectives[0].state, 'defending');
  advance(mission, 8 * NET.tickHz);
  assert.equal(visit(mission, player, bravo), true);
  advance(mission, 2);
  assert.equal(mission.state, 'EXTRACTION_AVAILABLE');
  const ship = mission.snapshot().albatross!;
  assert.equal(mission.action(player.id, 'albatross'), false);
  Object.assign(player, { x: ship.x, z: ship.z + 1 });
  Object.assign(players[1], { x: ship.x, z: ship.z + 1 });
  player.protectedUntil = players[1].protectedUntil = Infinity;
  advance(mission, 6);
  assert.ok(mission.interact(player.id));
  assert.equal(mission.action(player.id, 'balloon'), false);
  advance(mission, ALBATROSS.launchTicks + BALLOON.liftTicks);
  const { result } = mission.snapshot();
  assert.ok(result?.primaryObjectivesCompleted && result.extractionSucceeded);
  assert.deepEqual(result.extractedOperatorIds, [player.id]);
  assert.deepEqual(result.rewards.map(({ totalExperience }) => totalExperience), [500, 400]);
  assert.equal(mission.action(player.id, 'albatross'), false);
  advance(mission, 6);
  assert.equal(mission.drainEvents().filter(({ type }) => type === 'MissionCompleted').length, 1);
  for (const operator of players) assert.ok(mission.action(operator.id, 'return-vote'));
  advance(mission, NET.tickHz + 1);
  assert.equal(mission.state, 'CARRIER_HUB');
  assert.equal(mission.horde.count, 0);
  assert.equal(mission.snapshot().convicts.length, 0);
  plan(mission, player, 'easy');
  assert.notEqual(mission.snapshot().instanceId, result.missionInstanceId);
});

test('only a teamwipe or successful extraction ends a mission and grants earned rewards', () => {
  for (const complete of [false, true]) {
    const { mission, player } = deployed('easy');
    if (complete) unlock(mission, player);
    player.hp = 0;
    mission.step();
    assert.equal(mission.state, 'MISSION_RESULTS');
    assert.equal(mission.snapshot().result?.primaryObjectivesCompleted, complete);
    assert.equal(mission.snapshot().result?.baseExperience, complete ? 400 : 0);
    assert.equal(mission.snapshot().result?.extractionSucceeded, false);
  }

  const { mission, player, players } = deployed('easy', BODENBRUCH, 2);
  unlock(mission, player);
  for (const member of players) assert.equal(mission.action(member.id, 'end-vote'), false);
  assert.equal(mission.debug(player.id, 'finish-no-extraction'), false);
  assert.equal(mission.debug(player.id, 'finish'), false);
  assert.equal(mission.debug(player.id, 'carrier'), false);
  mission.step();
  assert.equal(mission.state, 'EXTRACTION_AVAILABLE');
  assert.equal(mission.snapshot().result, undefined);
});

test('nearby Schaben damage an individual Albatross nozzle through the shared melee path', () => {
  const noPatrols = { ...BODENBRUCH, world: { ...BODENBRUCH.world, initialNests: [], patrolRegions: [] } };
  const { mission } = deployed('easy', noPatrols);
  const ship = mission.snapshot().albatross!;
  const [location] = ALBATROSS.thrusters;
  const enemy = mission.horde.spawn(ship.x + location.x - .55, ship.z + location.z, SCHABE_TYPE);
  mission.horde.yaw[enemy] = Math.PI / 2;
  advance(mission, 2);
  assert.equal(mission.snapshot().albatross!.thrusters[0].state, 'INTACT');
  advance(mission, mission.enemyCombat.timing.windupTicks + mission.enemyCombat.timing.activeTicks);
  const damaged = mission.snapshot().albatross!;
  assert.equal(damaged.hullHealth, ship.hullHealth);
  assert.equal(damaged.thrusters[0].state, 'DAMAGED');
  assert.deepEqual(damaged.thrusters.slice(1), ship.thrusters.slice(1));
});

test('a breacher ignores the Albatross hull and goes for a nozzle instead', () => {
  const noPatrols = { ...BODENBRUCH, world: { ...BODENBRUCH.world, initialNests: [], patrolRegions: [] } };
  const { mission } = deployed('easy', noPatrols);
  const ship = mission.snapshot().albatross!;
  // Beside the hull, far from every nozzle: a Schabe here would strike the hull.
  const enemy = mission.horde.spawn(ship.x - 2.95 - 2.2, ship.z, BREACHER_TYPE);
  mission.horde.yaw[enemy] = Math.PI / 2;
  let nozzle = false;
  for (let i = 0; i < 600 && !nozzle; i++) {
    mission.step();
    nozzle = mission.snapshot().albatross!.thrusters.some(({ state }) => state !== 'INTACT');
  }
  const after = mission.snapshot().albatross!;
  assert.equal(after.hullHealth, ship.hullHealth, 'the hull stays untouched');
  assert.ok(nozzle, 'a nozzle took damage');
});

test('independent engine and hull damage disable ship extraction but preserve balloon recovery', () => {
  const { mission, player } = deployed('easy');
  unlock(mission, player);
  for (let i = 0; i < 2; i++) assert.ok(mission.debug(player.id, 'damage-thruster'));
  const ship = mission.snapshot().albatross!;
  assert.equal(ship.lifecycleState, 'DAMAGED');
  assert.deepEqual(ship.thrusters.map(({ state }) => state), ['DESTROYED', 'INTACT', 'INTACT', 'INTACT']);
  assert.ok(mission.action(player.id, 'albatross'));
  for (let i = 0; i < 2; i++) assert.ok(mission.debug(player.id, 'damage-thruster'));
  assert.equal(mission.snapshot().albatross?.lifecycleState, 'DISABLED');
  mission.step();
  assert.equal(mission.state, 'EXTRACTION_AVAILABLE');
  assert.equal(mission.action(player.id, 'albatross'), false);
  assert.ok(mission.debug(player.id, 'destroy-albatross'));
  assert.equal(mission.snapshot().albatross?.lifecycleState, 'DESTROYED');
  assert.equal(mission.debug(player.id, 'damage-thruster'), false);
  Object.assign(player, { x: ship.x - 1, z: ship.z + 21 });
  assert.ok(mission.action(player.id, 'balloon'));
});

test('balloon takeover, server tether, eligibility, disconnect and capture are snapshot-safe', () => {
  const { mission, player, players } = deployed('easy', BODENBRUCH, 4);
  unlock(mission, player);
  const [, wing, disconnected, unbound] = players;
  Object.assign(player, { x: -145, z: 178, protectedUntil: Infinity });
  Object.assign(wing, { x: -142, z: 178, protectedUntil: Infinity });
  Object.assign(disconnected, { x: -143, z: 178, protectedUntil: Infinity });
  Object.assign(unbound, { x: -110, z: 179, protectedUntil: Infinity });
  assert.ok(mission.action(player.id, 'balloon'));
  const start = mission.snapshot().extraction!;
  assert.equal(start.endsAt - start.startedAt, BALLOON.countdownTicks);
  assert.equal(mission.action(wing.id, 'balloon'), false);
  assert.equal(mission.action(unbound.id, 'secure'), false);
  assert.ok(mission.action(wing.id, 'secure'));
  assert.ok(mission.action(disconnected.id, 'secure'));
  mission.disconnect(disconnected.id);
  player.hp = 0;
  mission.step();
  mission.reconnect(disconnected.id);
  assert.equal(mission.snapshot().extraction?.anchorOperatorId, wing.id);
  for (let i = 1; i <= 120; i++) {
    mission.receiveInput(wing.id, { seq: i, forward: 1, strafe: 0, yaw: Math.PI / 2, pitch: 0, sprint: true, fire: false });
    mission.step();
  }
  assert.ok(distanceSquared(wing, start) <= BALLOON.radius ** 2 + 1e-7);
  assert.ok(distanceSquared(wing, start) >= (BALLOON.radius - .02) ** 2);
  assert.ok(mission.debug(wing.id, 'fighter'));
  mission.step();
  assert.equal(mission.snapshot().extraction?.phase, 'APPROACH');
  advance(mission, BALLOON.approachTicks);
  assert.equal(mission.snapshot().extraction?.phase, 'LIFT');
  mission.disconnect(wing.id);
  advance(mission, BALLOON.liftTicks);
  assert.deepEqual(mission.snapshot().result?.extractedOperatorIds, [wing.id]);
  const events = mission.drainEvents();
  assert.equal(events.filter(({ type }) => type === 'ExtractionBeaconActivated').length, 1);
  assert.equal(events.filter(({ type }) => type === 'MissionCompleted').length, 1);
});

test('Convicts fire, take fatal melee damage, never respawn and have declining equipment', () => {
  const empty = { ...BODENBRUCH, world: { ...BODENBRUCH.world, patrolRegions: [], initialNests: [], breachRegions: [] } };
  const { mission } = deployed('easy', empty);
  advance(mission, 220);
  const convoy = mission.snapshot().convicts;
  assert.ok(convoy.every(({ state }) => state === 'DEFENDING'));
  const [first] = convoy;
  mission.horde.spawn(first.x, first.z + 2.5, SCHABE_TYPE);
  let shots = 0;
  for (let i = 0; i < 20; i++) {
    mission.step();
    shots += mission.shots.filter(({ shooter }) => shooter === first.id).length;
  }
  assert.ok(shots > 0);
  for (let i = 0; i < 35; i++) mission.horde.spawn(first.x - .2 + i * .013, first.z + .9, SCHABE_TYPE);
  advance(mission, 3 * NET.tickHz + mission.enemyCombat.timing.windupTicks);
  assert.equal(mission.snapshot().convicts[0].state, 'DEAD');
  advance(mission, 300);
  assert.equal(mission.snapshot().convicts[0].hp, 0);
  let prior = Infinity;
  const kitIds = new Set();
  for (const level of DIFFICULTIES) {
    const [member] = deployed(level.id, empty).mission.snapshot().convicts;
    kitIds.add(member.equipmentId);
    assert.ok(member.maxHp < prior);
    prior = member.maxHp;
  }
  assert.equal(kitIds.size, 7);
});

test('patrol movement follows authored routes and economy seeds bounded groups', () => {
  for (const region of BODENBRUCH.world.patrolRegions) for (const point of region.route.waypoints) {
    assert.ok(openGround(BODENBRUCH.world, point.x, point.z, 1), region.id);
  }
  const { mission } = deployed('easy');
  advance(mission, 30);
  const group = [...mission.director.patrols.groups.values()].find(({ state }) => state === 'PATROLLING')!;
  assert.ok(group.members.size >= mission.difficulty.patrolMinSize);
  assert.equal(group.state, 'PATROLLING');
  const previous = { ...group.position };
  advance(mission, NET.tickHz * 4);
  assert.ok(distanceSquared(previous, group.position) > 4 ** 2);
  assert.ok(mission.horde.count <= mission.difficulty.maxActiveEnemies);
});

test('group perception reacts to sound through walls, confirms sight and interrupts its caller', () => {
  const events: MissionEvent[] = [];
  const horde = new HordeManager();
  const world = {
    ...BODENBRUCH.world,
    obstacles: [{ x: 0, z: 0, halfX: 4, halfZ: 1, height: 3, kind: 'barrier' as const }],
  };
  const patrols = new PatrolManager(world, horde, () => .5, (event) => events.push(event), resolveMissionBalance(BALANCE, DIFFICULTIES[1].id));
  const region: PatrolRegion = { id: 'test', x: 0, z: 10, radius: 20, route: { waypoints: [{ x: 0, z: 10 }, { x: 0, z: -25 }] } };
  const group = patrols.create(region, 0);
  const caller = horde.spawn(0, 10, SCHABE_TYPE);
  const member = horde.spawn(0, 11, SCHABE_TYPE);
  patrols.attach(group, caller);
  patrols.attach(group, member);
  const player = createPlayer('p', 0, 0);
  player.z = -9;
  let requested = 0;
  const request = () => {
    requested++;
    return { breachId: 123 };
  };
  const run = (begin: number, end: number) => {
    for (let tick = begin; tick <= end; tick++) patrols.update([player], tick, true, request);
  };
  run(1, 10);
  assert.equal(group.state, 'PATROLLING');
  patrols.reportNoise(player, 'explosion', 11);
  run(11, 19);
  assert.equal(group.state, 'SUSPICIOUS');
  run(20, 37);
  assert.equal(group.state, 'INVESTIGATING');
  player.z = 6;
  run(38, 44);
  assert.equal(group.state, 'ALERTED');
  run(45, 60);
  assert.equal(group.state, 'CALLING_REINFORCEMENTS');
  const call = group.alarm;
  assert.ok(call);
  assert.equal(call.endsAt - call.startedAt, 90);
  assert.equal(call.enemyId, horde.id[caller]);
  const reused = horde.id[caller];
  assert.ok(damageEnemy(horde, caller, 100));
  const newSlot = horde.spawn(30, 30, SCHABE_TYPE);
  assert.equal(newSlot, caller);
  assert.notEqual(horde.id[newSlot], reused);
  run(61, 63);
  assert.equal(group.alarm, undefined);
  assert.ok(events.some((event) => event.type === 'ReinforcementCallInterrupted' && event.reason === 'caller-killed'));
  assert.equal(requested, 0);
  patrols.forceAlert(group, player, 64);
  run(64, 85);
  assert.equal(group.state, 'ENGAGING');
  assert.equal(events.filter((event) => event.type === 'ReinforcementCallStarted').length, 1);
  player.z = 100;
  run(86, 285);
  assert.equal(group.state, 'SEARCHING');
  run(286, 430);
  assert.ok(group.state === 'RETURNING' || group.state === 'PATROLLING');
  horde.despawn(member);
  run(431, 440);
  assert.equal(group.state, 'ELIMINATED');
  assert.equal(patrols.groups.has(group.id), false);
});

test('surviving caller triggers one legal breach and exactly one permanent linked nest', () => {
  const { mission, player } = deployed();
  advance(mission, 45);
  const group = [...mission.director.patrols.groups.values()][0];
  player.x = group.position.x;
  player.z = group.position.z + 19;
  player.protectedUntil = 10_000;
  assert.ok(mission.debug(player.id, 'alert'));
  advance(mission, 110);
  const events = mission.drainEvents();
  const completed = events.find((event) => event.type === 'ReinforcementCallCompleted');
  assert.ok(completed && completed.breachId);
  const breaches = events.filter((event) => event.type === 'SwarmBreachStarted' && event.id === completed.breachId);
  assert.equal(breaches.length, 1);
  const breach = breaches[0];
  assert.ok(breach.type === 'SwarmBreachStarted');
  assert.ok(BODENBRUCH.world.breachRegions.some((region) => distanceSquared(region, breach.position) <= region.radius ** 2));
  assert.ok(distanceSquared(breach.position, player) >= 27 ** 2);
  assert.ok(openGround(BODENBRUCH.world, breach.position.x, breach.position.z, 5.8));
  assert.equal(mission.director.validBreachPosition(BODENBRUCH.world.deployment), false);
  assert.equal(mission.director.validBreachPosition(BODENBRUCH.world.serviceApron!), false);
  assert.equal(mission.director.validBreachPosition(alpha), false);
  assert.equal(mission.director.validBreachPosition(player), false);
  assert.equal(mission.snapshot().nests.find((nest) => nest.id === breach.nestId)?.state, 'EMERGING');
  advance(mission, breach.opensAt - mission.tick + NET.tickHz * 42);
  const after = mission.snapshot().nests.filter((nest) => nest.breachId === breach.id);
  assert.equal(after.length, 1);
  assert.equal(after[0].state, 'ACTIVE');
  assert.ok(after[0].lastSpawnAt > breach.opensAt);
  assert.equal(mission.drainEvents().filter((event) => event.type === 'SwarmNestCreated' && event.breachId === breach.id).length, 1);
});

test('rifle hits persistent nest, destroys it and leaves spawned enemies alive', () => {
  const { mission, player } = deployed('easy', {
    ...BODENBRUCH, world: { ...BODENBRUCH.world, patrolRegions: [], breachRegions: [] },
  });
  const nest = mission.snapshot().nests[0];
  advance(mission, 19 * NET.tickHz);
  const count = mission.horde.count;
  const threatBefore = mission.snapshot().threat;
  assert.ok(count > 0);
  assert.equal(mission.snapshot().nests[0].id, nest.id);
  player.x = nest.x - .86;
  player.z = nest.z + 13;
  player.protectedUntil = 10_000;
  let shots = 0;
  for (let i = 0; i < NET.tickHz * 5; i++) {
    mission.receiveInput(player.id, { seq: i + 1, yaw: 0, pitch: -.02, forward: 0, strafe: 0, sprint: false, fire: true });
    mission.step();
    shots += mission.shots.filter((shot) => shot.nest === nest.id).length;
    if (!mission.director.nests.active.has(nest.id)) break;
  }
  assert.ok(shots >= Math.ceil(nest.maxHp / 24));
  assert.equal(mission.snapshot().nests[0].state, 'DESTROYING');
  assert.equal(mission.snapshot().nestsDestroyed, 1);
  assert.ok(mission.snapshot().threat < threatBefore);
  assert.equal(mission.snapshot().objectives[2].state, 'complete');
  const lastCount = mission.horde.count;
  assert.ok(lastCount >= count);
  advance(mission, 40 * NET.tickHz);
  assert.equal(mission.snapshot().nests[0].state, 'DESTROYED');
  assert.equal(mission.horde.count, lastCount);
  assert.ok(mission.drainEvents().some((event) => event.type === 'SwarmNestDamaged' && event.nestId === nest.id));
});

test('difficulty parameters and per-tick enemy budgets apply at all seven levels', () => {
  assert.deepEqual(DIFFICULTIES.map(({ displayName }) => displayName),
    ['Leicht', 'Normal', 'Herausfordernd', 'Schwer', 'Extrem', 'Albtraum', 'FREEFALL']);
  assert.deepEqual(DIFFICULTIES.map(({ maxActiveEnemies }) => maxActiveEnemies), [120, 200, 320, 450, 600, 800, 1000]);
  assert.equal(DIFFICULTIES[6].level, 7);
  const assertBudgets = (definition: DifficultyDefinition) => {
    const mission = new MissionInstance(51296, BODENBRUCH);
    const player = mission.addPlayer('host');
    plan(mission, player, definition.id);
    board(mission, player);
    advance(mission, BOARDING_TICKS + LANDING_STAGE_TICKS + 1);
    assert.deepEqual(mission.difficulty, definition);
    assert.equal(mission.snapshot().nests[0].maxHp, Math.round(360 * definition.nestHealthMultiplier));
    for (let i = 0; i < 120; i++) {
      const count = mission.horde.count;
      assert.ok(count <= definition.maxActiveEnemies && count <= MAX_ENEMIES);
      mission.step();
      assert.ok(mission.horde.count - count <= definition.maxSpawnsPerTick);
    }
    assert.ok(mission.snapshot().groups >= definition.patrolGroupCount);
    while (mission.horde.count < definition.maxActiveEnemies) mission.horde.spawn(204, -205, SCHABE_TYPE);
    for (let i = 0; i < 10; i++) mission.step();
    assert.equal(mission.horde.count, definition.maxActiveEnemies);
    const frame = new HordeFrame();
    assert.ok(decodeHorde(encodeHorde(mission.horde, mission.tick, WIDE_POSITION_SCALE), frame, WIDE_POSITION_SCALE));
    assert.equal(frame.x[frame.count - 1], 204);
    assert.equal(frame.z[frame.count - 1], -205);
  };
  for (const definition of DIFFICULTIES) assertBudgets(definition);
});

test('successful reinforcement effects respect global, concurrent and lifetime budgets', () => {
  const { mission, player } = deployed('easy');
  player.x = -99;
  player.z = 59;
  const tick = mission.tick + 20;
  const first = mission.director.request(player, tick);
  assert.ok(first?.breachId);
  const initial = mission.snapshot();
  assert.equal(initial.activeNests, mission.difficulty.maxActiveNests);
  assert.equal(initial.activeBreaches, mission.difficulty.maxConcurrentBreaches);
  assert.equal(mission.director.request(player, tick + 1), undefined);
  const fallback = mission.director.request(player, tick + 8 * NET.tickHz);
  assert.ok(fallback?.boostedNestId);
  assert.equal(mission.snapshot().breachCount, 1);
  for (let i = 1; i < 26; i++) mission.director.request(player, tick + i * 22 * NET.tickHz);
  assert.equal(mission.director.reinforcements, mission.difficulty.reinforcementBudget);
  assert.equal(mission.director.request(player, tick + 700 * NET.tickHz), undefined);
});

test('a cleared breach region remains on cooldown independently of the current nest cap', () => {
  const { mission, player } = deployed('easy', {
    ...BODENBRUCH,
    world: { ...BODENBRUCH.world, initialNests: [], patrolRegions: [], breachRegions: [BODENBRUCH.world.breachRegions[0]] },
  });
  const director = mission.director;
  const tick = mission.tick;
  assert.ok(director.request(player, tick)?.breachId);
  director.nests.destroy([...director.nests.active.values()][0], tick);
  assert.equal(director.nests.active.size, 0);
  assert.equal(director.request(player, tick + 8 * NET.tickHz), undefined);
  assert.ok(director.request(player, tick + 55 * NET.tickHz)?.breachId);
});

for (const [count, method] of [[1, 'albatross'], [2, 'balloon'], [4, 'albatross'], [4, 'balloon']] as const) {
  test(`${count} operators complete Operation Bodenbruch via ${method} without debug`, () => {
    const mission = new MissionInstance(51296, BODENBRUCH);
    const crew = Array.from({ length: count }, (_, slot) => mission.addPlayer(`operator-${slot}`));
    const player = crew[0];
    const nav = new GroundNavigation(missionGround(BODENBRUCH.world), mission.balance.hordeAi,
      mission.movementBalance.colliders.STANDING.radius);
    const go = (operator: typeof player, target: PositionXZ, radius: number, surface = false): boolean => {
      const steering = { ...target };
      for (let i = 0; i < 60 * NET.tickHz; i++) {
        if (distanceSquared(operator, target) <= radius ** 2) return true;
        Object.assign(steering, target);
        if (surface) nav.steer(operator.x, operator.z, steering);
        const yaw = Math.atan2(steering.x - operator.x, operator.z - steering.z);
        const forward = Math.min(1, Math.sqrt(distanceSquared(operator, steering)) * NET.tickHz / BALANCE.operator.sprintSpeed);
        mission.receiveInput(operator.id, { seq: operator.lastInputSeq + 1, life: operator.life,
          yaw, pitch: 0, forward, strafe: 0, sprint: true, fire: false });
        mission.step();
        if (!operator.hp || mission.snapshot().result) return false;
      }
      return false;
    };
    assert.ok(go(player, { x: 0, z: 4 }, .6));
    assert.ok(mission.select(player.id, { planetId: 'dev-ault', missionId: BODENBRUCH.id, difficultyId: 'normal' }));
    assert.ok(mission.start(player.id));
    for (const operator of crew) {
      for (const target of [{ x: 3.3, z: 3.3 }, { x: 3.3, z: -4 }, { x: 0, z: -10 }, CARRIER_SHIP]) {
        assert.ok(go(operator, target, .75), JSON.stringify({ target, x: operator.x, z: operator.z }));
      }
      assert.ok(mission.interact(operator.id));
    }
    advance(mission, BOARDING_TICKS + LANDING_STAGE_TICKS + 1);
    assert.equal(mission.state, 'ACTIVE_MISSION');
    assert.ok(go(player, { x: player.x, z: player.z + 7 }, 1, true));
    for (const target of [alpha, bravo]) {
      assert.ok(go(player, target, 3, true), JSON.stringify({ target, x: player.x, z: player.z }));
      assert.ok(mission.interact(player.id));
      advance(mission, 2);
    }
    const ship = mission.snapshot().albatross!;
    const assembly = method === 'albatross' ? { x: ship.x, z: ship.z + 1 } : { x: -145, z: 178 };
    for (const operator of crew) assert.ok(go(operator, assembly, 1.5, true),
      JSON.stringify({ operator: operator.id, x: operator.x, z: operator.z, hp: operator.hp, assembly }));
    assert.ok(mission.action(player.id, method));
    for (const operator of crew.slice(1)) assert.ok(mission.action(operator.id, 'secure'));
    const pickup = method === 'albatross' ? ALBATROSS.launchTicks : BALLOON.countdownTicks + BALLOON.approachTicks;
    advance(mission, pickup + BALLOON.liftTicks + 1);
    const result = mission.snapshot().result;
    assert.ok(result?.extractionSucceeded && result.primaryObjectivesCompleted);
    assert.equal(result.extractionMethod, method);
    assert.deepEqual(result.extractedOperatorIds, crew.map(({ id }) => id));
    for (const operator of crew) assert.ok(mission.action(operator.id, 'return-vote'));
    advance(mission, NET.tickHz + 1);
    assert.equal(mission.state, 'CARRIER_HUB');
  });
}

test('four personal stim supplies complete once, cancel on death and disconnect, and reset on new deployment', () => {
  const { mission, players } = deployed('normal', BODENBRUCH, 4);
  const [p, second, third, fourth] = players;
  for (const member of players) {
    assert.equal(member.equipment.stims, 5);
    const input = { ...member.input, seq: member.input.seq + 1, life: member.life, equipment: 'stim' };
    member.hp = member === second ? 86 : 35;
    assert.ok(mission.receiveInput(member.id, input));
    assert.equal(mission.receiveInput(member.id, input), false);
  }
  mission.step();
  const end = p.equipment.until;
  assert.equal(end - mission.tick, Math.ceil(1.2 * NET.tickHz));
  mission.disconnect(third.id);
  mission.reconnect(third.id);
  fourth.hp = 0;
  advance(mission, end - mission.tick - 1);
  assert.equal(p.hp, 35);
  assert.equal(p.equipment.stims, 5);
  advance(mission, 2);
  assert.deepEqual(players.map((v) => v.equipment.stims), [4, 4, 5, 5]);
  assert.deepEqual(players.map((v) => v.hp), [75, 100, 35, 0]);
  assert.equal(third.equipment.stimResult, 'cancelled');
  assert.equal(fourth.equipment.stimResult, 'cancelled');
  mission.disconnect(p.id);
  mission.reconnect(p.id);
  assert.equal(p.equipment.stims, 4);
  for (const member of players) member.hp = 0;
  mission.step();
  assert.ok(mission.snapshot().result);
  assert.ok(mission.debug(p.id, 'carrier'));
  assert.ok(mission.debug(p.id, 'land'));
  assert.deepEqual(players.map((v) => v.equipment.stims), [5, 5, 5, 5]);
});

test('three synchronized throws destroy a normal nest once and stop its spawn budget', () => {
  const { mission, players } = deployed('normal', BODENBRUCH, 3);
  for (const p of players) {
    Object.assign(p, { x: 0, z: 90 });
    const tap = { ...p.input, seq: p.input.seq + 1, life: p.life, equipment: 'grenade', yaw: 0, pitch: -.4 };
    assert.ok(mission.receiveInput(p.id, tap));
    assert.equal(mission.receiveInput(p.id, tap), false);
  }
  mission.step();
  assert.equal(mission.grenades.snapshot(), undefined);
  advance(mission, Math.ceil(FRAG.releaseSeconds * NET.tickHz));
  const flight = mission.grenades.snapshot()!;
  assert.equal(new Set(flight.map((g) => g.id)).size, 3);
  assert.ok(flight[0].y > 1);
  advance(mission, flight[0].detonates - mission.tick - 1);
  const landed = mission.grenades.snapshot()![0];
  assert.ok(landed.y < .11 && landed.z < 89);
  const nest = mission.director.nests.create(landed, mission.tick);
  mission.step();
  assert.equal(nest.state, 'DESTROYING');
  assert.equal(nest.hp, 0);
  assert.equal(nest.spawnBudget, 0);
  assert.ok(!mission.director.nests.active.has(nest.id));
  const destroyed = mission.director.nests.destroyed;
  advance(mission, NET.tickHz);
  assert.equal(mission.grenades.snapshot(), undefined);
  assert.equal(mission.director.nests.destroyed, destroyed);
  assert.deepEqual(players.map((p) => p.equipment.grenades), [1, 1, 1]);
});

test('an empty launch is cancelled and a missed balloon pickup returns for the surviving operator', () => {
  const { mission, player } = deployed('easy');
  unlock(mission, player);
  player.protectedUntil = Infinity;
  assert.ok(mission.action(player.id, 'albatross'));
  player.z += 20;
  advance(mission, ALBATROSS.launchTicks);
  assert.equal(mission.state, 'EXTRACTION_AVAILABLE');
  assert.equal(mission.snapshot().result, undefined);
  assert.ok(mission.action(player.id, 'balloon'));
  mission.disconnect(player.id);
  advance(mission, BALLOON.countdownTicks + BALLOON.approachTicks);
  assert.equal(mission.state, 'EXTRACTION_IN_PROGRESS');
  const snapshot = mission.snapshot();
  assert.equal(snapshot.result, undefined);
  assert.equal(snapshot.extraction?.phase, 'COUNTDOWN');
  assert.deepEqual(snapshot.extraction?.securedIds, []);
  mission.reconnect(player.id);
  assert.ok(mission.action(player.id, 'secure'));
  assert.ok(mission.debug(player.id, 'fighter'));
  advance(mission, 1 + BALLOON.approachTicks + BALLOON.liftTicks);
  assert.deepEqual(mission.snapshot().result?.extractedOperatorIds, [player.id]);
});

for (const method of ['albatross', 'balloon'] as const) {
  test(`${method} checks stance when securing and again at pickup`, () => {
    const { mission, player, players: [, wing] } = deployed('easy', BODENBRUCH, 2);
    unlock(mission, player);
    const ship = mission.snapshot().albatross!;
    const site = method === 'albatross' ? { x: ship.x, z: ship.z + 1 } : { x: -145, z: 178 };
    for (const member of [player, wing]) Object.assign(member, site, { protectedUntil: Infinity });
    for (const posture of ['DIVING', 'PRONE', 'SUPINE', 'GETTING_UP', 'SLIDING'] as const) {
      player.posture = { ...newPosture(), current: posture };
      assert.equal(mission.action(player.id, method), false);
      assert.deepEqual(mission.drainFeedback(), [{ id: player.id, code: 'extraction-posture' }]);
      assert.equal(mission.snapshot().extraction, undefined);
    }
    player.posture = { ...newPosture(), current: 'CROUCHING' };
    assert.ok(mission.action(player.id, method));
    wing.posture = { ...newPosture(), current: 'SUPINE' };
    assert.equal(mission.action(wing.id, 'secure'), false);
    assert.deepEqual(mission.snapshot().extraction?.securedIds, [player.id]);
    wing.posture = newPosture();
    assert.ok(mission.action(wing.id, 'secure'));
    player.posture = { ...newPosture(), current: 'PRONE' };
    const pickup = method === 'albatross' ? ALBATROSS.launchTicks : BALLOON.countdownTicks + BALLOON.approachTicks;
    advance(mission, pickup);
    assert.equal(mission.snapshot().extraction?.phase, 'LIFT');
    assert.deepEqual(mission.snapshot().extraction?.securedIds, [wing.id]);
    advance(mission, BALLOON.liftTicks);
    assert.deepEqual(mission.snapshot().result?.extractedOperatorIds, [wing.id]);
  });
}
