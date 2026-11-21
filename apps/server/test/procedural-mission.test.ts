import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALBATROSS, BALANCE, BALLOON, CAMERA_BACK, CAMERA_LIFT, CAMERA_SHOULDER, ENEMY_TYPES, LOOK_HEIGHT, MAX_PITCH, wrapAngle, BOARDING_TICKS, BODENBRUCH, CARRIER_SHIP, DEV_AULT_PROFILE, DIFFICULTIES,
  LANDING_STAGE_TICKS, MAX_ENEMIES, MISSION_TEMPLATES, NET, PROCEDURAL_CONTRACT_ID, SCHABE_TYPE, WORLD_REGISTRY,
  distanceSquared, groundHeight, isOptionalObjective, missionGround, openGround,
} from '@freefall/shared';
import type { MissionDefinition, MissionEvent, MissionPlan, ObjectiveDefinition, PlanetMissionProfile, PositionXZ } from '@freefall/shared';
import { GroundNavigation } from '../src/mission/GroundNavigation.ts';
import { MissionGenerator, validateObjectiveGraph } from '../src/mission/MissionGenerator.ts';
import { MissionInstance } from '../src/mission/MissionInstance.ts';
import { ObjectiveManager } from '../src/mission/ObjectiveManager.ts';
import { timingStats } from '../src/simulation/FixedLoop.ts';
import { seededRandom } from '../src/simulation/Battlefield.ts';
import type { SimPlayer } from '../src/simulation/Player.ts';

const generator = new MissionGenerator();
const request = { planetId: 'dev-ault', difficultyId: 'normal', seed: 1 };

function generated(seed = 1, templateId?: string) {
  const result = generator.generate({ ...request, seed, templateId });
  assert.equal(result.status, 'generated');
  return result;
}

test('v1 plans have stable identities, survive JSON serialization and freeze their runtime content', () => {
  const { plan, definition, balance } = generated();
  assert.equal(plan.generatorVersion, 1);
  assert.equal(plan.formatVersion, 1);
  assert.equal(plan.templateVersion, 1);
  assert.equal(plan.planetVersion, 1);
  assert.equal(plan.balance.hash, balance.configHash);
  assert.ok(Object.isFrozen(plan.extraction.balloon) && Object.isFrozen(definition.world) && Object.isFrozen(balance));
  const reconstructed: MissionPlan = JSON.parse(JSON.stringify(plan));
  assert.equal(generator.validate(reconstructed), undefined);
  const independent = new MissionGenerator().generate(request);
  assert.equal(independent.status, 'generated');
  assert.deepEqual(reconstructed, independent.plan);
  assert.equal(generated().plan.id, reconstructed.id);
  assert.notEqual(generated(3).plan.id, reconstructed.id);
  assert.equal(generator.validate({ ...reconstructed, objectives: undefined }), 'invalid-plan-format');
  assert.equal(generator.validate({ ...reconstructed, id: 'generated.changed' }), 'invalid-plan-id');
  assert.equal(generator.validate({ ...reconstructed, formatVersion: 0 }), 'invalid-version-or-seed');
  assert.equal(generator.validate({ ...reconstructed, balance: { ...plan.balance, hash: 'old' } }), 'invalid-balance-reference');
  assert.equal(plan.modifiers[0], 'early-extraction-pressure');
  assert.ok(balance.extraction.initialPressureTicks < generated(2).balance.extraction.initialPressureTicks);
});

test('512 sequential seeds across all seven difficulties produce independently validated, varied Dev’ Ault plans', (t) => {
  const local = new MissionGenerator();
  const generation: number[] = [], validation: number[] = [], sizes: number[] = [];
  const templates = new Map<string, number>(), rejections = new Map<string, number>();
  const variants = new Set<string>(), ids = new Set<string>(), pickups = new Set<string>(), orders = new Set<string>();
  const before = process.memoryUsage();
  for (let seed = 0; seed < 512; seed++) {
    const result = local.generate({ ...request, seed, difficultyId: DIFFICULTIES[seed % DIFFICULTIES.length].id });
    for (const reason of result.diagnostics.rejected) rejections.set(reason, (rejections.get(reason) ?? 0) + 1);
    assert.equal(result.status, 'generated', JSON.stringify(result.diagnostics));
    const { plan, diagnostics } = result;
    assert.equal(local.validate(plan), undefined);
    generation.push(diagnostics.generationMs);
    validation.push(diagnostics.validationMs);
    sizes.push(Buffer.byteLength(JSON.stringify(plan)));
    ids.add(plan.id);
    pickups.add(plan.extraction.balloon.id);
    templates.set(plan.templateId, (templates.get(plan.templateId) ?? 0) + 1);
    const order = plan.objectives.map(({ locationId }) => locationId).join(',');
    if (plan.templateId === 'relay-chain') orders.add(order.split(',').slice(0, 2).join(','));
    variants.add(JSON.stringify([order, plan.extraction.balloon.id, plan.modifiers, plan.encounter.breachRegionIds]));
  }
  assert.equal(ids.size, 512);
  assert.equal(pickups.size, 2);
  assert.equal(orders.size, 2);
  assert.equal(templates.size, 3);
  assert.ok(variants.size > 50);
  const after = process.memoryUsage();
  t.diagnostic(JSON.stringify({ valid: ids.size, templates: Object.fromEntries(templates), rejections: Object.fromEntries(rejections),
    variants: variants.size, coldGenerationMs: generation[0], coldValidationMs: validation[0], generationMs: timingStats(generation),
    validationMs: timingStats(validation), planBytes: timingStats(sizes), rssBefore: before.rss, rssAfter: after.rss,
    heapBefore: before.heapUsed, heapAfter: after.heapUsed }));
});

test('invalid profiles, missing content, missing anchors and candidate limit return explicit reasons', () => {
  const withProfile = (patch: Partial<PlanetMissionProfile>) => new MissionGenerator({
    profiles: new Map([['dev-ault', { ...DEV_AULT_PROFILE, ...patch }]]), templates: MISSION_TEMPLATES, worlds: WORLD_REGISTRY,
  });
  const fails = (g: MissionGenerator, override: Partial<typeof request & { templateId: string }>, reason: string) => {
    const result = g.generate({ ...request, ...override });
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, reason);
    return result;
  };
  fails(generator, { planetId: 'unknown' }, 'unknown-planet');
  fails(generator, { difficultyId: 'absent' }, 'invalid-difficulty');
  fails(generator, { seed: -1 }, 'invalid-seed');
  fails(generator, { templateId: 'absent' }, 'missing-template');
  fails(withProfile({ worldId: 'absent' }), {}, 'missing-world');
  assert.equal(fails(withProfile({ templateIds: [] }), {}, 'missing-template').fallback, BODENBRUCH);
  for (const [tag, reason] of [['deployment', 'missing-deployment'], ['relay', 'insufficient-objective-locations'],
    ['balloon', 'missing-extraction']] as const) {
    const broken = withProfile({ locations: DEV_AULT_PROFILE.locations.filter((location) => location.tag !== tag) });
    const result = fails(broken, { templateId: 'relay-chain' }, 'attempts-exhausted');
    assert.equal(result.diagnostics.attempts, 12);
    assert.deepEqual(result.diagnostics.rejected, Array(12).fill(reason));
    assert.equal(result.fallback, BODENBRUCH);
  }
  const empty = fails(withProfile({ locations: [] }), {}, 'attempts-exhausted');
  assert.ok(empty.diagnostics.rejected.every((reason) => reason === 'missing-deployment'));
  const disconnected = { ...BODENBRUCH.world, obstacles: [...BODENBRUCH.world.obstacles,
    { kind: 'barrier' as const, x: 0, z: 0, halfX: 3, halfZ: BODENBRUCH.world.half, height: 8 }] };
  const isolated = new MissionGenerator({
    profiles: new Map([['dev-ault', { ...DEV_AULT_PROFILE,
      locations: DEV_AULT_PROFILE.locations.filter((location) => location.id !== 'south-flats-pickup') }]]),
    templates: MISSION_TEMPLATES, worlds: new Map([[disconnected.id, disconnected]]),
  });
  const result = fails(isolated, {}, 'attempts-exhausted');
  assert.ok(result.diagnostics.rejected.every((reason) => reason === 'unreachable-extraction'));
  assert.equal(result.fallback, undefined);
});

test('validator rejects plan tampering in graph, locations, spawns, extraction and modifier dependencies', () => {
  const { plan } = generated(1, 'relay-chain');
  const [a, b, ...tail] = plan.objectives;
  assert.ok(a && b);
  const cycle = [{ ...a, definition: { ...a.definition, requires: [b.definition.id] } }, b, ...tail];
  assert.equal(generator.validate({ ...plan, objectives: cycle }), 'cyclic-objectives');
  assert.equal(generator.validate({ ...plan, objectives: [{ ...a, definition: { ...a.definition, requires: 'ghost' } }, b] }), 'invalid-dependency');
  assert.equal(generator.validate({ ...plan, objectives: [{ ...a, locationId: 'landing-zone' }, b] }), 'invalid-objective-location');
  assert.equal(generator.validate({ ...plan, extraction: { ...plan.extraction, methods: [] } }), 'missing-extraction');
  assert.equal(generator.validate({ ...plan, modifiers: ['early-extraction-pressure', 'early-extraction-pressure'] }), 'invalid-balance-or-modifier');
  assert.equal(generator.validate({ ...generated(0, 'relay-defense').plan, modifiers: ['early-extraction-pressure'] }), 'invalid-balance-or-modifier');
  assert.equal(generator.validate({ ...plan, encounter: { ...plan.encounter, breachRegionIds: ['bad', ...plan.encounter.breachRegionIds.slice(1)] } }), 'missing-spawn-region');
  assert.equal(generator.validate({ ...plan, encounter: { ...plan.encounter, maxActiveEnemies: 1001 } }), 'invalid-encounter');
});

test('objective graph handles optional dependencies, defended time, duplicate events and failure', () => {
  const relay: ObjectiveDefinition = { id: 'relay', label: 'Relay', x: 1, z: 2, radius: 3, defenseSeconds: 1,
    defenseRequiresPresence: true, kind: 'activate' };
  const nest: ObjectiveDefinition = { id: 'nest', label: 'Nest', count: 1, kind: 'destroy-nests', optional: true,
    target: { x: 30, z: 5 }, requires: ['relay'] };
  assert.equal(validateObjectiveGraph([relay]), undefined);
  assert.equal(validateObjectiveGraph([relay, nest]), undefined);
  assert.equal(validateObjectiveGraph([nest]), 'missing-primary');
  assert.equal(validateObjectiveGraph([{ ...relay, requires: ['nest'] }, nest]), 'invalid-dependency');
  const events: MissionEvent[] = [];
  const runtime = new ObjectiveManager([relay, nest], (event) => events.push(event));
  runtime.start(1);
  assert.equal(runtime.interact({ x: 100, z: 100 }, 1), false);
  assert.equal(runtime.interact(relay, 1), true);
  assert.equal(runtime.interact(relay, 1), false);
  runtime.update(10, 0, []);
  assert.equal(runtime.snapshot()[0].completeAt, 0);
  runtime.nestDestroyed(nest.target!, 11);
  runtime.nestDestroyed(nest.target!, 12);
  runtime.update(100, 0, []);
  assert.equal(runtime.allPrimaryComplete, false);
  runtime.update(101, 0, [{ ...relay, y: 0 }]);
  runtime.update(140, 0, [{ ...relay, y: 0 }]);
  runtime.finish(141, true);
  runtime.finish(141, true);
  assert.equal(events.filter((event) => event.type === 'ObjectiveUpdated' && event.state === 'complete').length, 2);
  assert.equal(runtime.allPrimaryComplete, true);
  const failure = new ObjectiveManager([relay, nest], () => {});
  failure.start(1);
  failure.finish(2, false);
  failure.update(200, 20, [{ ...relay, y: 0 }]);
  assert.deepEqual(failure.snapshot().map(({ state }) => state), ['failed', 'cancelled']);
});

function advance(mission: MissionInstance, ticks: number): void {
  for (let i = 0; i < ticks; i++) mission.step();
}

function input(mission: MissionInstance, operator: SimPlayer, yaw: number, forward: number, pitch = 0, fire = false): void {
  assert.ok(mission.receiveInput(operator.id, { seq: operator.lastInputSeq + 1, life: operator.life,
    yaw, pitch, forward, strafe: 0, sprint: forward > 0, fire }));
}

function walk(mission: MissionInstance, crew: SimPlayer[], target: PositionXZ, radius: number, nav?: GroundNavigation) {
  const steering = { ...target };
  let metres = 0;
  const [lead] = crew;
  for (let i = 0; i < 75 * NET.tickHz; i++) {
    if (crew.every((operator) => distanceSquared(operator, target) <= radius ** 2)) return { metres, ticks: i };
    for (const operator of crew) {
      assert.ok(operator.hp > 0, `${operator.id} died walking to ${JSON.stringify(target)}`);
      if (distanceSquared(operator, target) <= radius ** 2) continue;
      Object.assign(steering, target);
      nav?.steer(operator.x, operator.z, steering);
      const yaw = Math.atan2(steering.x - operator.x, operator.z - steering.z);
      const forward = Math.min(1, Math.sqrt(distanceSquared(operator, steering)) * NET.tickHz / BALANCE.operator.sprintSpeed);
      input(mission, operator, yaw, forward);
    }
    const { x, z } = lead;
    mission.step();
    metres += Math.hypot(lead.x - x, lead.z - z);
  }
  assert.fail(JSON.stringify({ target, crew: crew.map(({ id, x, z }) => ({ id, x, z })) }));
}

function select(mission: MissionInstance, operator: SimPlayer, seed: number, difficultyId = 'normal', templateId?: string,
  planetId = 'dev-ault', worldSeed?: number) {
  assert.ok(mission.select(operator.id, { planetId, missionId: PROCEDURAL_CONTRACT_ID, difficultyId, seed, templateId, worldSeed }, true));
  assert.ok(mission.plan);
  return mission.plan;
}

for (const [seed, type, count, method, planetId = 'dev-ault', worldSeed, difficulty = 'normal'] of [
  [4, 'nest-purge', 1, 'albatross'], [0, 'relay-defense', 1, 'albatross'], [3, 'relay-chain', 4, 'balloon'],
  [20, 'relay-chain', 4, 'balloon', 'green-plains', 76, 'easy'], [4, 'nest-purge', 1, 'albatross', 'green-plains', 17],
  [0, 'relay-defense', 1, 'albatross', 'desert', 31], [0, 'relay-defense', 1, 'albatross', 'ice', 48],
  [0, 'relay-defense', 1, 'albatross', 'forest', 63],
  [0, 'relay-defense', 4, 'albatross', 'desert', 31],
  [0, 'relay-defense', 4, 'albatross', 'ice', 48],
  [0, 'relay-defense', 4, 'albatross', 'forest', 63],
] as const) {
  test(`${planetId} ${type}, seed ${seed}, completes via ${method} with ${count} operators using gameplay inputs`, (t) => {
    const mission = new MissionInstance(51296, BODENBRUCH);
    const crew = Array.from({ length: count }, (_, i) => mission.addPlayer('operator-' + i));
    const [lead] = crew;
    walk(mission, [lead], { x: 0, z: 4 }, .6);
    const replay = () => select(mission, lead, seed, difficulty, worldSeed === undefined ? undefined : type, planetId, worldSeed);
    const plan = replay();
    assert.equal(plan.templateId, type);
    if (worldSeed === undefined) assert.deepEqual(plan, generated(seed).plan);
    else assert.equal(plan.world?.seed, worldSeed);
    assert.ok(mission.start(lead.id));
    for (const operator of crew) {
      for (const target of [{ x: 3.3, z: 3.3 }, { x: 3.3, z: -4 }, { x: 0, z: -10 }, CARRIER_SHIP]) walk(mission, [operator], target, .75);
      assert.ok(mission.interact(operator.id));
    }
    advance(mission, BOARDING_TICKS + LANDING_STAGE_TICKS + 1);
    assert.equal(mission.state, 'ACTIVE_MISSION');
    assert.ok(mission.snapshot().convicts.some(({ state }) => state !== 'ABOARD'));
    assert.equal(mission.snapshot().albatross?.supply?.length, 2);
    assert.equal(mission.director.spawns.cap, plan.encounter.maxActiveEnemies);
    const encounterDefinition: MissionDefinition = Reflect.get(mission.director, 'mission');
    assert.deepEqual(encounterDefinition.world.breachRegions.map(({ id }) => id).sort(), plan.encounter.breachRegionIds);
    assert.equal(mission.director.balance.extraction.initialPressureTicks, plan.encounter.firstExtractionPressureTicks);
    const nav = new GroundNavigation(missionGround(mission.definition.world), mission.balance.hordeAi, mission.movementBalance.colliders.STANDING.radius);
    const ship = mission.snapshot().albatross!;
    let routeMetres = 0, travelTicks = 0;
    const travel = (target: PositionXZ, radius: number, operators = crew) => {
      const leg = walk(mission, operators, target, radius, nav);
      routeMetres += leg.metres;
      travelTicks += leg.ticks;
    };
    travel({ x: ship.x, z: ship.z + 9 }, 1);
    for (const { definition } of plan.objectives.filter(({ definition }) => !isOptionalObjective(definition))) {
      if (definition.kind === 'activate') {
        travel(definition, 3);
        assert.ok(mission.interact(lead.id));
        for (const operator of crew.slice(1)) assert.equal(mission.interact(operator.id), false);
        if (definition.defenseSeconds) advance(mission, definition.defenseSeconds * NET.tickHz);
      } else {
        const target = definition.target!;
        travel({ x: target.x - .86, z: target.z + 13 }, .05);
        let hits = 0;
        const pitch = worldSeed === undefined ? -.02 : Math.atan2(groundHeight(mission.definition.world, target.x, target.z) + .8 - lead.y - 2.1, 17.8);
        for (let i = 0; i < NET.tickHz * 12 && mission.state === 'ACTIVE_MISSION'; i++) {
          input(mission, lead, 0, 0, pitch, true);
          mission.step();
          hits += mission.shots.filter((shot) => shot.nest).length;
        }
        input(mission, lead, 0, 0);
        assert.ok(hits && mission.snapshot().objectives[0].state === 'complete', `${hits} nest hits`);
      }
      advance(mission, 2);
    }
    assert.equal(mission.state, 'EXTRACTION_AVAILABLE');
    if (type === 'nest-purge') {
      assert.ok(mission.receiveInput(lead.id, { ...lead.input, seq: lead.lastInputSeq + 1, life: lead.life, fire: false, reload: true }));
      advance(mission, lead.loadout.weapons.primary.reloadTicks + 2);
      const reserve = lead.loadout.weapons.primary.reserveMagazines;
      assert.equal(lead.equipment.magazines.primary, reserve - 1);
      travel({ x: ship.x - 4.1, z: ship.z }, .5, [lead]);
      const charges = ship.supply!.find(({ side }) => side === 'left')!.charges;
      assert.ok(mission.interact(lead.id));
      for (let i = 0; i < mission.balance.resupply.interactionTicks + 3; i++) {
        input(mission, lead, lead.yaw, 0);
        mission.step();
      }
      assert.equal(lead.equipment.magazines.primary, reserve);
      assert.equal(mission.snapshot().albatross!.supply!.find(({ side }) => side === 'left')!.charges, charges - 1);
    }
    const assembly = method === 'albatross' ? { x: ship.x, z: ship.z + 1 } : plan.extraction.balloon;
    if (method === 'balloon') assert.equal(mission.action(lead.id, 'balloon'), false);
    travel(assembly, 1.5);
    if (method === 'balloon') {
      assert.equal(mission.action(lead.id, 'albatross'), false);
    }
    assert.ok(mission.action(lead.id, method));
    for (const operator of crew.slice(1)) assert.ok(mission.action(operator.id, 'secure'));
    const maxTicks = (method === 'albatross' ? ALBATROSS.launchTicks : BALLOON.countdownTicks + BALLOON.approachTicks) + BALLOON.liftTicks + 1;
    for (let i = 0; i < maxTicks && (mission.state as string) !== 'MISSION_RESULTS'; i++) {
      if (worldSeed !== undefined && method === 'balloon' && mission.snapshot().extraction?.phase !== 'LIFT') {
        for (const operator of crew) {
          if (!operator.hp) continue;
          let enemy = -1, nearest = 24 ** 2;
          for (let index = 0; index < mission.horde.count; index++) {
            const slot = mission.horde.active[index];
            const d2 = (mission.horde.x[slot] - operator.x) ** 2 + (mission.horde.z[slot] - operator.z) ** 2;
            if (d2 < nearest && mission.horde.hp[slot]) {
              nearest = d2;
              enemy = slot;
            }
          }
          if (enemy < 0) continue;
          const x = mission.horde.x[enemy], z = mission.horde.z[enemy];
          const aim = Math.atan2(x - operator.x, operator.z - z) - Math.asin(Math.min(.95, CAMERA_SHOULDER / Math.sqrt(nearest)));
          const target = groundHeight(mission.definition.world, x, z) + ENEMY_TYPES[mission.horde.type[enemy]].hitHeight;
          const pitch = Math.atan2(target - operator.y - LOOK_HEIGHT - CAMERA_LIFT, Math.sqrt(nearest) + CAMERA_BACK);
          input(mission, operator, wrapAngle(aim - operator.recoil.yaw), 0,
            Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch - operator.recoil.pitch)), true);
        }
      }
      mission.step();
    }
    const snapshot = mission.snapshot();
    assert.equal(snapshot.result?.outcome, 'extracted', JSON.stringify({ hp: crew.map((p) => p.hp), state: snapshot.state, tick: snapshot.tick, nests: snapshot.activeNests }));
    assert.equal(snapshot.result?.procedural?.planId, plan.id);
    assert.deepEqual(snapshot.result.extractedOperatorIds, crew.map(({ id }) => id));
    const events = mission.drainEvents();
    assert.equal(events.filter((event) => event.type === 'MissionCompleted').length, 1);
    assert.equal(events.filter((event) => event.type === 'ExtractionAvailable').length, 1);
    assert.ok(mission.horde.count <= plan.encounter.maxActiveEnemies);
    t.diagnostic(JSON.stringify({ seed, worldSeed, worldId: plan.worldId, id: plan.id, objectives: snapshot.result.objectives,
      pickup: method === 'albatross' ? 'albatross' : assembly, durationTicks: snapshot.result.durationTicks,
      routeMetres: Number(routeMetres.toFixed(1)), travelTicks, enemiesAtResult: mission.horde.count, convictsSurvived: snapshot.result.convictsSurvived }));
    for (const operator of crew) assert.ok(mission.action(operator.id, 'return-vote'));
    advance(mission, NET.tickHz + 1);
    assert.equal(mission.state, 'CARRIER_HUB');
    assert.equal(mission.plan, undefined);
    assert.equal(mission.horde.count, 0);
    walk(mission, [lead], { x: 0, z: 4 }, .6);
    assert.deepEqual(replay(), plan);
  });
}

test('teamwipe settles one failed result and reconnect does not reopen the mission', () => {
  const mission = new MissionInstance(73, BODENBRUCH);
  const operator = mission.addPlayer('host');
  Object.assign(operator, { x: 0, z: 3 });
  const plan = select(mission, operator, 0);
  assert.ok(mission.debug(operator.id, 'land'));
  assert.ok(!mission.select(operator.id, { ...request, missionId: PROCEDURAL_CONTRACT_ID, seed: 1 }, true));
  assert.throws(() => mission.addPlayer('late'));
  mission.disconnect(operator.id);
  mission.reconnect(operator.id);
  assert.equal(mission.plan, plan);
  operator.hp = 0;
  advance(mission, 4);
  const result = mission.snapshot().result!;
  assert.equal(result.outcome, 'team-lost');
  assert.equal(result.procedural?.seed, 0);
  assert.equal(result.baseExperience, 0);
  assert.ok(result.objectives?.some(({ state }) => state === 'failed'));
  assert.equal(mission.drainEvents().filter((event) => event.type === 'MissionCompleted').length, 1);
});

for (const [id, worldSeed] of [['dev-ault', undefined], ['forest', 63]] as const)
test(`measure a ${id} relay defense with four operators at the 1,000-enemy cap`, (t) => {
  const mission = new MissionInstance(51296, BODENBRUCH);
  mission.profileEnemyAI = true;
  const crew = Array.from({ length: 4 }, (_, slot) => mission.addPlayer('cap-' + slot));
  const [lead] = crew;
  Object.assign(lead, { x: 0, z: 3 });
  const plan = select(mission, lead, 0, 'freefall', 'relay-defense', id, worldSeed);
  assert.ok(mission.debug(lead.id, 'land'));
  const relay = plan.objectives[0].definition;
  assert.equal(relay.kind, 'activate');
  for (const player of crew) {
    const x = relay.x + player.slot * .5, z = relay.z - 1;
    Object.assign(player, { x, y: groundHeight(mission.definition.world, x, z), z, protectedUntil: Infinity });
  }
  assert.ok(mission.interact(lead.id));
  const surface = missionGround(mission.definition.world);
  const groups = surface.patrolRegions.map((region) => mission.director.patrols.create(region, 0, 0));
  const random = seededRandom(421337);
  for (let i = 0; i < MAX_ENEMIES * 20 && mission.horde.count < MAX_ENEMIES; i++) {
    const group = groups[i % groups.length];
    const { x, z, radius } = group.region;
    const position = { x: x + (2 * random() - 1) * radius, z: z + (2 * random() - 1) * radius };
    if (openGround(surface, position.x, position.z, .5))
      mission.director.patrols.attach(group, mission.horde.spawn(position.x, position.z, SCHABE_TYPE));
  }
  assert.equal(mission.horde.count, MAX_ENEMIES);
  const before = process.memoryUsage();
  const ticks: number[] = [], objectives: number[] = [], navigation: number[] = [], collision: number[] = [];
  for (let i = 0; i < 360; i++) {
    const start = performance.now();
    mission.step();
    ticks.push(performance.now() - start);
    objectives.push(mission.objectiveUpdateMs);
    navigation.push(mission.enemyAITime.navigationMs);
    collision.push(mission.enemyAITime.collisionMs);
    assert.ok(mission.horde.count <= mission.director.spawns.cap);
  }
  const snapshot = mission.snapshot();
  assert.ok(snapshot.primaryObjectivesCompleted);
  assert.equal(snapshot.state, 'EXTRACTION_AVAILABLE');
  assert.equal(snapshot.planId, plan.id);
  const after = process.memoryUsage();
  t.diagnostic(JSON.stringify({ plan: plan.id, tickMs: timingStats(ticks), objectiveUpdateMs: timingStats(objectives),
    navigationMs: timingStats(navigation), collisionMs: timingStats(collision),
    rssBefore: before.rss, rssAfter: after.rss, heapBefore: before.heapUsed, heapAfter: after.heapUsed,
    maxActiveEnemies: MAX_ENEMIES, finalEnemyCount: mission.horde.count }));
});
