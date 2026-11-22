import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { availableParallelism, cpus, release, totalmem } from 'node:os';
import {
  BALANCE, BODENBRUCH, HordeFrame, MAX_ENEMIES, MAX_PLAYERS, NET, PROCEDURAL_CONTRACT_ID, SCHABE_TYPE,
  WIDE_POSITION_SCALE, clearWorldLine, createBalanceRegistry, decodeHorde, distanceSquared, groundHeight, missionGround, openGround,
} from '@freefall/shared';
import type { HordeDirectorState, HordeWaveEndReason, MissionDefinition, PositionXZ } from '@freefall/shared';
import { ENEMY_GROUND_RADIUS } from '../apps/server/src/ecs/EnemyNavigation.ts';
import { GroundNavigation } from '../apps/server/src/mission/GroundNavigation.ts';
import { SPAWN_DEFERRED } from '../apps/server/src/mission/SpawnManager.ts';
import { MissionInstance } from '../apps/server/src/mission/MissionInstance.ts';
import { encodeHorde } from '../apps/server/src/networking/snapshots.ts';
import { seededRandom } from '../apps/server/src/simulation/Battlefield.ts';
import { timingStats } from '../apps/server/src/simulation/FixedLoop.ts';
import type { SimPlayer } from '../apps/server/src/simulation/Player.ts';

const simulationSeed = 421337;
const missionSeed = 0;
const planets = { 'green-plains': 76, desert: 31, ice: 48, forest: 63 };
type Planet = keyof typeof planets;
const [matrix = 'all', snapshot] = process.argv.slice(2);
assert.ok(['all', 'combat', 'director', 'planets', 'stress'].includes(matrix));
const patrolSeconds = Number(process.env.FREEFALL_PRESSURE_SECONDS ?? 150);
assert.ok(Number.isSafeInteger(patrolSeconds) && patrolSeconds > 0, 'Expected a positive duration in seconds');
const registry = snapshot ? createBalanceRegistry(JSON.parse(readFileSync(snapshot, 'utf8'))) : BALANCE;
const cycleWorld: MissionDefinition = {
  ...BODENBRUCH,
  world: {
    ...BODENBRUCH.world, obstacles: [], patrolRegions: [], initialNests: [],
    breachRegions: [
      { id: 'south', x: 0, z: 43, radius: 8 },
      { id: 'southwest', x: -37, z: 35, radius: 8 },
      { id: 'southeast', x: 38, z: 35, radius: 8 },
    ],
  },
};
type Scenario =
  | { kind: 'single' | 'retreat' | 'delayed-retreat' | 'surrounded'; operators: 1; seconds: number }
  | { kind: 'director' | 'director-contact'; operators: number; seconds: number }
  | { kind: 'patrol'; operators: number; seconds: number; planet: Planet }
  | { kind: 'stress'; operators: number; seconds: number; planet: Planet; count: number };

function deploy(scenario: Scenario) {
  const generated = 'planet' in scenario;
  const mission = new MissionInstance(simulationSeed, generated ? BODENBRUCH : cycleWorld, registry);
  const crew = Array.from({ length: scenario.operators }, (_, slot) => mission.addPlayer('operator-' + slot));
  const host = crew[0];
  const difficultyId = scenario.kind === 'stress' ? 'freefall' : 'normal';
  if (generated) {
    Object.assign(host, { x: 0, z: 3 });
    assert.ok(mission.select(host.id, {
      planetId: scenario.planet, missionId: PROCEDURAL_CONTRACT_ID, difficultyId,
      seed: missionSeed, worldSeed: planets[scenario.planet], templateId: 'relay-defense',
    }, true), JSON.stringify(scenario));
    assert.equal(mission.plan?.world?.seed, planets[scenario.planet]);
  }
  assert.ok(mission.debug(host.id, 'land'));
  mission.profileEnemyAI = true;
  return { mission, crew, difficultyId };
}

function seedAttackers(mission: MissionInstance, player: SimPlayer, count: number) {
  const origin = { x: player.x, z: player.z };
  const patrols = mission.director.patrols;
  const group = patrols.create({ ...origin, id: 'close-contact', radius: 3, route: { waypoints: [origin] } }, 0, 0, origin, false);
  for (let index = 0; index < count; index++) {
    const yaw = 2 * Math.PI * index / count;
    const slot = mission.horde.spawn(origin.x + Math.sin(yaw) * 1.25, origin.z + Math.cos(yaw) * 1.25, SCHABE_TYPE);
    patrols.attach(group, slot);
    mission.horde.yaw[slot] = -yaw;
  }
  patrols.forceAlert(group, player, mission.tick);
}

function placeCrewNearPatrols(mission: MissionInstance, crew: SimPlayer[]) {
  const surface = missionGround(mission.definition.world);
  const regions = [...surface.patrolRegions];
  const patrols = mission.director.patrols;
  patrols.enableLandingContact(0);
  for (const player of crew) {
    const others = crew.slice(0, player.slot);
    const score = (at: PositionXZ) => Math.min(distanceSquared(surface.deployment, at),
      ...others.map((other) => distanceSquared(other, at)));
    regions.sort((a, b) => score(b) - score(a));
    const region = regions.shift()!;
    const goal = region.route.waypoints[0];
    const position = Array.from({ length: 16 }, (_, i) => ({
      x: goal.x + 18 * Math.cos(i * Math.PI / 8), z: goal.z + 18 * Math.sin(i * Math.PI / 8),
    })).find(({ x, z }) => openGround(surface, x, z, .5) && patrols.navigation.reachable(x, z, goal.x, goal.z));
    assert.ok(position, 'No traversable starting point for the stress operator');
    Object.assign(player, position, { y: groundHeight(surface, position.x, position.z), protectedUntil: 0 });
  }
}

function seedStress(mission: MissionInstance, count: number, crew: SimPlayer[]) {
  const surface = missionGround(mission.definition.world);
  const patrols = mission.director.patrols;
  const groups = surface.patrolRegions.map((region) => patrols.create(region, 0, 0, region.route.waypoints[0], false));
  const random = seededRandom(simulationSeed);
  const horde = mission.horde;
  for (let attempt = 0; horde.count < count && attempt < count * 40; attempt++) {
    const group = groups[attempt % groups.length];
    const { x, z, radius } = group.region;
    const at = { x: x + (random() * 2 - 1) * radius, z: z + (random() * 2 - 1) * radius };
    if (!openGround(surface, at.x, at.z, .5) || crew.some((p) => Math.hypot(p.x - at.x, p.z - at.z) < 8)) continue;
    patrols.attach(group, horde.spawn(at.x, at.z, SCHABE_TYPE));
  }
  assert.equal(horde.count, count);
  mission.director.spawns.spawnAuthored = () => SPAWN_DEFERRED;
  for (const group of groups) {
    const nearest = crew.reduce((best, player) =>
      distanceSquared(player, group.position) < distanceSquared(best, group.position) ? player : best);
    patrols.forceAlert(group, nearest, mission.tick);
  }
}

function defend(mission: MissionInstance, player: SimPlayer, surface: ReturnType<typeof missionGround>, seq: number,
  engagementRange: number, goal?: PositionXZ, route?: GroundNavigation) {
  const horde = mission.horde;
  let nearest = engagementRange, yaw = 0, pitch = 0;
  for (let i = 0; i < horde.count; i++) {
    const slot = horde.active[i], x = horde.x[slot], z = horde.z[slot];
    const dx = x - player.x, dz = z - player.z;
    const distance = Math.hypot(dx, dz);
    const dy = groundHeight(surface, x, z) + .48 - player.y - 1.55;
    if (distance >= nearest || !clearWorldLine(surface, player.x, player.y + 1.55, player.z, dx, dy, dz)) continue;
    nearest = distance;
    yaw = Math.atan2(dx, -dz);
    pitch = Math.atan2(dy, distance + 3);
  }
  let forward = nearest < (engagementRange <= 8 ? 3 : 8) ? -.8 : 0;
  if (goal && route && distanceSquared(player, goal) > 25 && nearest >= 12) {
    const step = { ...goal };
    if (route.steer(player.x, player.z, step)) {
      forward = .85;
      yaw = Math.atan2(step.x - player.x, player.z - step.z);
      pitch = 0;
    }
  }
  const equipment = player.hp <= 50 && player.equipment.stims > 0 ? 'stim' : undefined;
  mission.receiveInput(player.id, { seq, life: player.life, yaw, pitch, forward,
    strafe: 0, sprint: false, fire: nearest < engagementRange && forward <= 0 && !equipment, equipment });
}

function measure(scenario: Scenario) {
  const { mission, crew, difficultyId } = deploy(scenario);
  const { director, horde, navigation, enemyCombat: combat, enemyAITime: ai } = mission;
  const surface = missionGround(mission.definition.world);
  if (!('planet' in scenario)) {
    for (const player of crew) Object.assign(player, { x: (player.slot - (crew.length - 1) / 2) * 2, y: 0, z: 0, yaw: 0, protectedUntil: 0 });
    if (!scenario.kind.startsWith('director')) seedAttackers(mission, crew[0], scenario.kind === 'surrounded' ? 6 : 1);
  }
  if (scenario.kind === 'stress') {
    placeCrewNearPatrols(mission, crew);
    seedStress(mission, scenario.count, crew);
  }
  const botNavigation = scenario.kind === 'patrol'
    ? new GroundNavigation(surface, mission.balance.hordeAi, mission.movementBalance.colliders.STANDING.radius) : undefined;
  const objective = mission.plan?.objectives[0].definition;
  const destinations = crew.map(({ slot }) => objective?.kind === 'activate' ?
    [{ x: objective.x + 2 * slot, z: objective.z }, { x: objective.x, z: objective.z }]
      .find(({ x, z }) => openGround(surface, x, z, .5)) : undefined);

  const frame = new HordeFrame();
  const ids = new Uint32Array(MAX_ENEMIES);
  const targetSlots = new Int8Array(MAX_ENEMIES).fill(-1);
  const movedIds = new Set<number>();
  const hpTimeline = crew.map(() => ({ firstHit: null as number | null, death: null as number | null, damage: 0, hits: 0, simultaneous: 0 }));
  const targetTicks = Array<number>(crew.length).fill(0);
  const phases: { state: HordeDirectorState; start: number; ticks: number; pressureSum: number; pressureMax: number;
    maxPopulation: number; nearSum: number; rangeSum: number; attackSum: number; spawnChecks: number; spawns: number; damage: number }[] = [];
  const waves: { tick: number; budget?: number; spawned?: number; reason?: HordeWaveEndReason }[] = [];
  const holds: Record<string, number> = {};
  const timings = { tick: [] as number[], ai: [] as number[], target: [] as number[], navigation: [] as number[],
    attack: [] as number[], director: [] as number[], spawn: [] as number[], encode: [] as number[] };
  const first = mission.tick;
  const clock = performance.now();
  const cpu = process.cpuUsage();
  const initialMemory = process.memoryUsage();
  let activeMin = horde.count, activeMax = horde.count, activeTicks = 0, rangeTicks = 0, stuckPeak = 0, overlapProbes = 0;
  let switches = 0, acquisitions = 0, losses = 0, enemyDeaths = 0, bytes = 0, peakChecks = 0, peakWaveChecks = 0, peakSpawned = 0;
  let maxWindup = 0, maxActive = 0, maxRecovery = 0, firstDamageFromStart: number | undefined;
  let pendingOperatorAttacks = 0, lastTick = 0;
  const hitSizes: Record<number, number> = {};
  const slotsHit = Array<number>(crew.length).fill(0);
  const spawn = director.spawns.totals;
  const probes = new Map<string, number>();
  let waveChecks = spawn.waveChecked;
  let waveSpawned = spawn.waveSpawned;
  let checked = spawn.checked;
  let spawned = spawn.spawned;
  let previousCount = horde.count, previousSpawned = spawned;
  let firstWindup: number | undefined;
  for (let seq = 1; seq <= scenario.seconds * NET.tickHz; seq++) {
    for (const player of crew) {
      if (scenario.kind === 'stress') player.hp = 100_000; // Sustained-load fixture only.
      if (scenario.kind === 'patrol' || scenario.kind.startsWith('director'))
        defend(mission, player, surface, seq, scenario.kind === 'director-contact' ? 6 : 27, destinations[player.slot], botNavigation);
      else if ((scenario.kind === 'retreat' || scenario.kind === 'delayed-retreat') &&
          firstWindup !== undefined && seq > firstWindup + (scenario.kind === 'delayed-retreat' ? 11 : 0)) {
        mission.receiveInput(player.id, { seq, life: player.life, yaw: 0, pitch: 0, forward: 1, strafe: 0, sprint: false, fire: false });
      }
    }
    const start = performance.now();
    mission.step();
    timings.tick.push(performance.now() - start);
    lastTick = mission.tick - first;
    if (combat.windingUp > 0) firstWindup ??= seq;
    timings.ai.push(ai.targetMs + ai.navigationMs + ai.attackMs + ai.encounterMs);
    timings.target.push(ai.targetMs);
    timings.navigation.push(ai.navigationMs);
    timings.attack.push(ai.attackMs);
    timings.director.push(director.pacing.updateMs);
    timings.spawn.push(director.spawns.validationMs + director.spawns.initializationMs);

    slotsHit.fill(0);
    let damage = 0;
    for (const event of mission.combatEvents) {
      if (event.type !== 'enemy-hit') continue;
      const player = crew.find((member) => member.id === event.target)!;
      const record = hpTimeline[player.slot];
      record.firstHit ??= lastTick;
      firstDamageFromStart ??= mission.tick - Number(event.attack.split(':')[1]);
      record.damage += event.amount;
      record.hits++;
      slotsHit[player.slot]++;
      hitSizes[event.amount] = (hitSizes[event.amount] ?? 0) + 1;
      damage += event.amount;
    }
    for (const player of crew) {
      const record = hpTimeline[player.slot];
      record.simultaneous = Math.max(record.simultaneous, slotsHit[player.slot]);
      if (player.hp <= 0) record.death ??= lastTick;
    }
    const candidateChecks = spawn.waveChecked - waveChecks, newWaveSpawns = spawn.waveSpawned - waveSpawned;
    peakChecks = Math.max(peakChecks, spawn.checked - checked);
    peakWaveChecks = Math.max(peakWaveChecks, candidateChecks);
    peakSpawned = Math.max(peakSpawned, spawn.spawned - spawned);
    for (const event of mission.drainEvents()) {
      if (event.type === 'HordeWaveStarted') waves.push({ tick: lastTick, budget: event.budget });
      if (event.type === 'HordeWaveEnded') waves.push({ tick: lastTick, spawned: event.spawned, reason: event.reason });
    }
    waveChecks = spawn.waveChecked;
    waveSpawned = spawn.waveSpawned;
    checked = spawn.checked;
    spawned = spawn.spawned;
    const state = director.pacing.snapshot();
    let inRange = 0, stuck = 0;
    pendingOperatorAttacks = 0;
    probes.clear();
    const sampleGeometry = seq % NET.tickHz === 0;
    for (let i = 0; i < horde.count; i++) {
      const slot = horde.active[i], id = horde.id[slot], target = horde.target[slot];
      assert.ok(horde.hp[slot] > 0);
      if (target >= 0) {
        const player = crew[target];
        assert.ok(player, 'Unknown operator slot');
        targetTicks[target]++;
        // Center-distance proxy for standing melee reach. Server validation uses the true posture and cover.
        if ((player.x - horde.x[slot]) ** 2 + (player.z - horde.z[slot]) ** 2 <= mission.balance.enemies[horde.type[slot]].meleeRange ** 2) inRange++;
      }
      if (ids[slot] === id && target !== targetSlots[slot]) {
        if (targetSlots[slot] < 0) acquisitions++;
        else if (target < 0) losses++;
        else switches++;
      }
      ids[slot] = id;
      targetSlots[slot] = target;
      if (navigation.isStuck(slot)) stuck++;
      if (Math.hypot(navigation.actualX[slot], navigation.actualZ[slot]) > .05) movedIds.add(id);
      const attack = combat.get(horde, slot);
      if (attack?.player && !attack.resolved && mission.tick < attack.start + combat.timing.windupTicks + combat.timing.activeTicks &&
          attack.result !== 'stagger' && attack.result !== 'target-lost') pendingOperatorAttacks++;
      if (sampleGeometry) {
        assert.ok(openGround(surface, horde.x[slot], horde.z[slot], ENEMY_GROUND_RADIUS - .0001),
          `Enemy ${id} intersects grounded terrain`);
        const key = Math.floor(horde.x[slot] / .35) + ',' + Math.floor(horde.z[slot] / .35);
        if (probes.has(key)) overlapProbes++;
        probes.set(key, id);
      }
    }
    // Count authoritative removals even when a replacement reuses the slot in the same tick.
    enemyDeaths += previousCount + spawned - previousSpawned - horde.count;
    previousCount = horde.count;
    previousSpawned = spawned;
    activeMin = Math.min(activeMin, horde.count);
    activeMax = Math.max(activeMax, horde.count);
    activeTicks += horde.count;
    rangeTicks += inRange;
    stuckPeak = Math.max(stuckPeak, stuck);
    maxWindup = Math.max(maxWindup, combat.windingUp);
    maxActive = Math.max(maxActive, combat.active);
    maxRecovery = Math.max(maxRecovery, combat.recovering);

    if (state) {
      const pressure = director.pacing.metrics();
      if (pressure.hold) holds[pressure.hold] = (holds[pressure.hold] ?? 0) + 1;
      if (phases.at(-1)?.state !== state.state) phases.push({ state: state.state, start: lastTick, ticks: 0,
        pressureSum: 0, pressureMax: 0, maxPopulation: 0, nearSum: 0, rangeSum: 0, attackSum: 0,
        spawnChecks: 0, spawns: 0, damage: 0 });
      const phase = phases.at(-1)!;
      phase.ticks++;
      phase.pressureSum += pressure.pressure;
      phase.pressureMax = Math.max(phase.pressureMax, pressure.pressure);
      phase.maxPopulation = Math.max(phase.maxPopulation, horde.count);
      phase.nearSum += pressure.nearby;
      phase.rangeSum += inRange;
      phase.attackSum += combat.windingUp + combat.active;
      phase.spawnChecks += candidateChecks;
      phase.spawns += newWaveSpawns;
      phase.damage += damage;
    }
    if (seq % (NET.tickHz / NET.hordeHz) === 0) {
      const before = performance.now();
      const packet = encodeHorde(horde, mission.tick, WIDE_POSITION_SCALE, combat);
      timings.encode.push(performance.now() - before);
      assert.ok(decodeHorde(packet, frame, WIDE_POSITION_SCALE) && frame.byId.size === horde.count);
      bytes += packet.byteLength;
    }
    if (mission.state !== 'ACTIVE_MISSION') break;
  }

  const usage = process.cpuUsage(cpu);
  const elapsedMs = performance.now() - clock;
  const memory = process.memoryUsage();
  assert.equal(hpTimeline.reduce((total, operator) => total + operator.damage, 0), combat.totals.operatorDamage);
  assert.ok(peakChecks <= mission.balance.director.spawn.maxChecksPerTick);
  assert.ok(peakWaveChecks <= mission.balance.director.spawn.dynamicChecksPerTick);
  if (scenario.kind === 'stress') {
    assert.equal(activeMax, scenario.count);
    assert.ok(movedIds.size >= scenario.count * .9, 'Seeded enemies did not actively simulate movement');
  }
  const config = { difficultyId, simulationSeed, missionSeed: mission.plan?.seed ?? null, worldSeed: mission.plan?.world?.seed ?? null,
    generatorVersion: mission.plan?.generatorVersion ?? null, world: mission.definition.world.id, plan: mission.plan?.id,
    obstacles: surface.obstacles.length, tickHz: NET.tickHz, hordeHz: NET.hordeHz, activeCap: director.spawns.cap };
  return { scenario, config, durationTicks: lastTick, state: mission.state, finalHp: crew.map((p) => p.hp),
    active: { min: activeMin, max: activeMax, final: horde.count, mean: activeTicks / lastTick, movedIds: movedIds.size, enemyDeaths },
    combat: { ...combat.totals, firstWindup, firstDamageFromStart, hitSizes, hpTimeline, pendingOperatorAttacks,
      unsuccessfulOperatorStarts: combat.totals.operatorStarts - combat.totals.operatorHits - pendingOperatorAttacks,
      maxWindup, maxActive, maxRecovery, rangeMean: rangeTicks / lastTick, resources: mission.stats.data },
    targeting: { targetTicks, switches, acquisitions, losses },
    navigation: { ...director.patrols.navigation.metrics, stuckPeak, stuckEpisodes: navigation.stuckEpisodes,
      recoveryAttempts: navigation.recoveryAttempts, recoveries: navigation.recoverySuccesses,
      fallbacks: navigation.recoveryFallbacks, unreachable: navigation.unreachableEpisodes, overlapProbes },
    spawn: { ...spawn, peakChecks, peakWaveChecks, peakSpawned }, waves, holds,
    phases: phases.map(({ pressureSum, nearSum, rangeSum, attackSum, ...phase }) => ({
      ...phase, pressureMean: pressureSum / phase.ticks, nearbyMean: nearSum / phase.ticks,
      rangeMean: rangeSum / phase.ticks, attackMean: attackSum / phase.ticks,
    })),
    ms: Object.fromEntries(Object.entries(timings).map(([key, samples]) => [key, timingStats(samples)])),
    runtime: { elapsedMs, cpuMs: (usage.user + usage.system) / 1000, initialMemory, memory,
      hordePayloadBytesPerSecond: bytes * NET.tickHz / lastTick },
  };
}

const run = (name: string) => matrix === name || matrix === 'all';
const scenarios: Scenario[] = [];
if (run('combat')) for (const kind of ['single', 'retreat', 'delayed-retreat', 'surrounded'] as const) scenarios.push({ kind, operators: 1, seconds: 25 });
if (run('director')) for (const kind of ['director', 'director-contact'] as const) {
  for (let operators = 1; operators <= MAX_PLAYERS; operators++) scenarios.push({ kind, operators, seconds: patrolSeconds });
}
if (run('planets')) for (const planet of Object.keys(planets) as Planet[]) {
  for (const operators of planet === 'green-plains' ? [1, 2, 3, 4] : [1, 4])
    scenarios.push({ kind: 'patrol', planet, operators, seconds: patrolSeconds });
}
if (run('stress')) for (const count of [50, 100, 250, 500, 750, 1000]) {
  scenarios.push({ kind: 'stress', planet: 'forest', operators: 4, seconds: 15, count });
}
const provenance = {
  revision: process.env.FREEFALL_SOURCE_REVISION ?? null,
  workspace: process.env.FREEFALL_WORKSPACE ?? 'working tree',
  balanceHash: registry.version.hash, balanceRelease: registry.version.release,
  hardware: { cpu: cpus()[0].model, threads: availableParallelism(), ram: totalmem(), kernel: release(), node: process.version },
};
console.log(JSON.stringify({ ...provenance, matrix, scenarios: scenarios.map(measure) }, null, 2));
