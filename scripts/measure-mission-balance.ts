/** Input-driven server runs. Route choices and time bounds belong to this measurement script. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism, cpus, release, totalmem } from 'node:os';
import {
  ALBATROSS, BALANCE, BALLOON, extractionLiftTicks, BOARDING_TICKS, BODENBRUCH, CAMERA_LIFT, CAMERA_SHOULDER, CARRIER_SHIP,
  LANDING_STAGE_TICKS, LOOK_HEIGHT, MAX_PITCH, NET, PROCEDURAL_CONTRACT_ID, WIDE_POSITION_SCALE, clearWorldLine,
  createBalanceRegistry, distanceSquared, groundHeight, isOptionalObjective, missionGround, openGround, wrapAngle,
} from '@freefall/shared';
import type { ExtractionMethod, PositionXZ, WorldDefinition } from '@freefall/shared';
import { GroundNavigation } from '../apps/server/src/mission/GroundNavigation.ts';
import { MissionInstance } from '../apps/server/src/mission/MissionInstance.ts';
import { missionGenerator } from '../apps/server/src/mission/MissionGenerator.ts';
import { encodeHorde, playerSnapshot } from '../apps/server/src/networking/snapshots.ts';
import { timingStats } from '../apps/server/src/simulation/FixedLoop.ts';
import type { SimPlayer } from '../apps/server/src/simulation/Player.ts';

const simulationSeed = 51296;
const planets = { 'green-plains': [76, 17], desert: [31, 32], ice: [48, 49], forest: [63, 76] } as const;
type Stage = 'boarding' | 'deployment' | 'approach' | 'betweenObjectives' | 'objective' | 'resupply' | 'extractionTravel' | 'extraction' | 'patrol';
type Scenario = {
  planetId: keyof typeof planets; worldSeed: number; missionSeed: number; templateId: string; count: number;
  method: ExtractionMethod; supply?: true; patrolSeconds?: number; difficultyId?: string;
};
const scenarios: Scenario[] = [];
for (const [planetId, worlds] of Object.entries(planets) as [keyof typeof planets, readonly [number, number]][]) {
  for (const count of [1, 2, 3, 4]) {
    for (const method of ['albatross', 'balloon'] as const) {
      scenarios.push({ planetId, worldSeed: worlds[0], missionSeed: 0, templateId: 'relay-defense', count, method });
      scenarios.push({ planetId, worldSeed: worlds[1], missionSeed: 20, templateId: 'relay-chain', count, method });
    }
  }
  for (const method of ['albatross', 'balloon'] as const) {
    scenarios.push({ planetId, worldSeed: worlds[1], missionSeed: 4, templateId: 'nest-purge', count: method === 'albatross' ? 1 : 4, method, supply: true });
  }
}
scenarios.push({ planetId: 'forest', worldSeed: 63, missionSeed: 0, templateId: 'relay-defense', count: 4,
  method: 'albatross', supply: true, patrolSeconds: 18 * 60 });
for (const count of [1, 2, 3, 4]) {
  scenarios.push({ planetId: 'forest', worldSeed: 76, missionSeed: 4, templateId: 'nest-purge', count,
    method: 'balloon', supply: true, difficultyId: 'freefall' });
}

const label = ({ planetId, worldSeed, missionSeed, templateId, count, method, patrolSeconds, difficultyId }: Scenario) =>
  [planetId, worldSeed, missionSeed, templateId, count, method, ...(patrolSeconds ? ['long'] : []), ...(difficultyId ? [difficultyId] : [])].join('/');
const [outputPath, filter = '.*', snapshotPath] = process.argv.slice(2);
assert.ok(outputPath, 'Usage: measure-mission-balance.ts <output.json> [scenario regex] [registry snapshot.json]');
const matching = scenarios.filter((scenario) => new RegExp(filter).test(label(scenario)));
assert.ok(matching.length, 'No scenarios matched');
const cycles = Number(process.env.FREEFALL_MISSION_CYCLES ?? 1);
assert.ok(Number.isSafeInteger(cycles) && cycles >= 1, 'Expected a positive FREEFALL_MISSION_CYCLES');
assert.ok(cycles === 1 || matching.every(({ count }) => count === matching[0].count), 'Lifecycle runs require the same crew size');
const registry = snapshotPath ? createBalanceRegistry(JSON.parse(readFileSync(snapshotPath, 'utf8'))) : BALANCE;
const buildVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

class ControllerStop extends Error {}
function requireRoute(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new ControllerStop(reason);
}

function send(mission: MissionInstance, player: SimPlayer, yaw: number, overrides: Record<string, unknown> = {}) {
  assert.ok(mission.receiveInput(player.id, { seq: player.lastInputSeq + 1, life: player.life,
    yaw, pitch: 0, forward: 0, strafe: 0, sprint: false, fire: false, ...overrides }));
}

function aimAt(player: SimPlayer, x: number, y: number, z: number) {
  const distance = Math.hypot(x - player.x, z - player.z);
  const yaw = Math.atan2(x - player.x, player.z - z) - Math.asin(Math.min(.95, CAMERA_SHOULDER / distance));
  const pitch = Math.atan2(y - player.y - LOOK_HEIGHT - CAMERA_LIFT, Math.sqrt(Math.max(.01, distance ** 2 - CAMERA_SHOULDER ** 2)));
  return { yaw: wrapAngle(yaw - player.recoil.yaw), pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch - player.recoil.pitch)) };
}

function visible(world: WorldDefinition, player: SimPlayer, x: number, y: number, z: number) {
  const origin = player.y + 1.2;
  return clearWorldLine(world, player.x, origin, player.z, x - player.x, y - origin, z - player.z);
}

function attempt(scenario: Scenario, session?: { mission: MissionInstance; crew: SimPlayer[] }) {
  const { planetId, worldSeed, missionSeed, templateId, count, method, difficultyId = 'normal' } = scenario;
  const mission = session?.mission ?? new MissionInstance(simulationSeed, BODENBRUCH, registry);
  mission.captureMissionTelemetry = true;
  mission.profileEnemyAI = true;
  const crew = session?.crew ?? Array.from({ length: count }, (_, i) => mission.addPlayer('operator-' + i));
  const [lead] = crew;
  let stage: Stage = 'boarding', routeMetres = 0, bandwidthBytes = 0, resultEvents = 0;
  const stages: Partial<Record<Stage, number>> = {};
  const ticks: number[] = [], objectives: number[] = [], encounters: number[] = [], director: number[] = [];
  let peakRss = process.memoryUsage.rss();
  let finished = false;
  let startTick: number | undefined;
  const sample = () => {
    const before = performance.now();
    mission.step();
    const stepMs = performance.now() - before;
    for (const event of mission.drainEvents()) {
      if (event.type === 'MissionStarted') startTick = event.tick;
      if (event.type === 'MissionCompleted') { finished = true; resultEvents++; }
      if (startTick !== undefined) bandwidthBytes += Buffer.byteLength(JSON.stringify(event));
    }
    if (startTick === undefined || mission.tick <= startTick) return;
    stages[stage] = (stages[stage] ?? 0) + 1;
    ticks.push(stepMs);
    if (mission.state === 'ACTIVE_MISSION' || mission.state.startsWith('EXTRACTION')) {
      objectives.push(mission.objectiveUpdateMs);
      encounters.push(mission.enemyAITime.encounterMs);
      director.push(mission.director.pacing.updateMs);
    }
    const due = (hz: number) => (mission.tick * hz) % NET.tickHz < hz;
    if (due(NET.playerHz)) bandwidthBytes += Buffer.byteLength(JSON.stringify(playerSnapshot(mission, lead.id)));
    if (due(NET.missionHz)) bandwidthBytes += Buffer.byteLength(JSON.stringify(mission.snapshot()));
    if (due(NET.hordeHz)) bandwidthBytes += encodeHorde(mission.horde, mission.tick, WIDE_POSITION_SCALE, mission.enemyCombat).byteLength;
    if (mission.shots.length) bandwidthBytes += Buffer.byteLength(JSON.stringify(mission.shots));
    if (mission.combatEvents.length) bandwidthBytes += Buffer.byteLength(JSON.stringify(mission.combatEvents));
    if (due(1)) peakRss = Math.max(peakRss, process.memoryUsage.rss());
  };
  const request = { planetId, worldSeed, seed: missionSeed, templateId, difficultyId };
  const generation = missionGenerator.generate(request, registry);
  const diagnostics = generation.diagnostics;
  const ground = generation.status === 'generated' ? missionGround(generation.definition.world) : undefined;
  let navigation: GroundNavigation | undefined;

  function engage(player: SimPlayer, world: WorldDefinition): boolean {
    const gear = player.equipment;
    if (gear.action === 'stim') { send(mission, player, player.yaw); return true; }
    let nearest = 20 ** 2, enemy = -1;
    const horde = mission.horde;
    for (let i = 0; i < horde.count; i++) {
      const slot = horde.active[i], x = horde.x[slot], z = horde.z[slot];
      const range = distanceSquared(player, { x, z });
      if (!horde.hp[slot] || range >= nearest) continue;
      const y = groundHeight(world, x, z) + mission.balance.enemies[horde.type[slot]].hitHeight;
      if (!visible(world, player, x, y, z)) continue;
      const dx = x - player.x, dz = z - player.z;
      if (crew.some((ally) => {
        if (!ally.hp || ally === player) return false;
        const ax = ally.x - player.x, az = ally.z - player.z;
        const dot = ax * dx + az * dz;
        return dot > 0 && dot < range && (ax * dz - az * dx) ** 2 < .8 ** 2 * range;
      })) continue;
      nearest = range;
      enemy = slot;
    }
    if (nearest >= 7 ** 2 && player.hp <= 55 && gear.stims && !player.reloadRequested) {
      send(mission, player, player.yaw, { equipment: 'stim' });
      return true;
    }
    if (enemy < 0 || (!player.ammo && !gear.magazines[gear.slot] && !gear.inactiveAmmo)) return false;
    const x = horde.x[enemy], z = horde.z[enemy];
    const { yaw, pitch } = aimAt(player, x, groundHeight(world, x, z) + mission.balance.enemies[horde.type[enemy]].hitHeight, z);
    send(mission, player, yaw, { pitch, aim: true, fire: player.ammo > 0, reload: !player.ammo && gear.magazines[gear.slot] > 0,
      ...(!player.ammo && !gear.magazines[gear.slot] && { equipment: gear.slot === 'primary' ? 'secondary' : 'primary' }) });
    return true;
  }

  function walk(target: PositionXZ, radius: number, operators = crew, fight = true) {
    const waypoint = { ...target };
    const radius2 = radius ** 2;
    for (let i = 0; !finished && i < 150 * NET.tickHz; i++) {
      if (operators.every((operator) => !operator.hp || distanceSquared(operator, target) <= radius2)) return;
      for (const player of operators) {
        if (!player.hp) continue;
        if (ground && navigation && fight && engage(player, ground)) continue;
        if (distanceSquared(player, target) <= radius2) { send(mission, player, player.yaw); continue; }
        Object.assign(waypoint, target);
        navigation?.steer(player.x, player.z, waypoint);
        send(mission, player, Math.atan2(waypoint.x - player.x, player.z - waypoint.z), {
          forward: Math.min(1, Math.sqrt(distanceSquared(player, waypoint)) * NET.tickHz / registry.operator.sprintSpeed), sprint: true,
        });
      }
      const { x, z } = lead;
      sample();
      if (navigation) routeMetres += Math.hypot(lead.x - x, lead.z - z);
    }
    requireRoute(finished, 'Navigation controller timed out at ' + JSON.stringify(target));
  }

  function hold(duration: number, operators = crew, fight = true) {
    for (let i = 0; i < duration && !finished; i++) {
      for (const player of operators) {
        if (player.hp && !(fight && ground && engage(player, ground))) send(mission, player, player.yaw);
      }
      sample();
    }
  }

  function run() {
    requireRoute(generation.status === 'generated' && ground, 'Generation rejected: ' + (generation.status === 'failed' ? generation.reason : 'no ground'));
    walk({ x: 0, z: 4 }, .6, [lead]);
    assert.ok(mission.select(lead.id, { ...request, missionId: PROCEDURAL_CONTRACT_ID }, true));
    const plan = mission.plan!;
    assert.deepEqual(plan, generation.plan);
    assert.ok(mission.start(lead.id));
    for (const player of crew) {
      for (const point of [{ x: 3.3, z: 3.3 }, { x: 3.3, z: -4 }, { x: 0, z: -10 }, CARRIER_SHIP]) walk(point, .75, [player]);
      assert.ok(mission.interact(player.id));
    }
    stage = 'deployment';
    for (let i = 0; startTick === undefined; i++) {
      assert.ok(i <= BOARDING_TICKS + 1);
      sample();
    }
    hold(LANDING_STAGE_TICKS, [], false);
    assert.equal(mission.state, 'ACTIVE_MISSION');
    navigation = new GroundNavigation(ground, mission.balance.hordeAi, mission.movementBalance.colliders.STANDING.radius);
    const ship = mission.snapshot().albatross!;
    stage = 'approach';
    walk({ x: ship.x, z: ship.z + 9 }, 1);
    if (scenario.patrolSeconds) {
      stage = 'patrol';
      // Extended exposure around the deployment site with live enemies and no replenishment by the script.
      hold(scenario.patrolSeconds * NET.tickHz);
    }
    let first = true;
    for (const { definition } of plan.objectives.filter(({ definition }) => !isOptionalObjective(definition))) {
      if (finished) return;
      stage = first ? 'approach' : 'betweenObjectives';
      first = false;
      if (definition.kind === 'activate') {
        walk(definition, 3);
        if (finished) return;
        stage = 'objective';
        const operator = crew.find((player) => player.hp > 0)!;
        assert.ok(mission.interact(operator.id));
        hold(Math.ceil((definition.defenseSeconds ?? 0) * NET.tickHz) + 2);
      } else {
        const { x, z } = definition.target!;
        const height = groundHeight(ground, x, z) + mission.balance.nest.hitHeight;
        const points = Array.from({ length: 12 }, (_, index) => ({ x: x + 13 * Math.sin(index * Math.PI / 6), z: z + 13 * Math.cos(index * Math.PI / 6) }));
        const shooter = crew.find((p) => p.hp > 0)!;
        const point = points.find((point) => openGround(ground, point.x, point.z, 1) && navigation!.reachable(point.x, point.z, shooter.x, shooter.z) &&
          clearWorldLine(ground, point.x, groundHeight(ground, point.x, point.z) + 1.2, point.z,
            x - point.x, height - groundHeight(ground, point.x, point.z) - 1.2, z - point.z));
        requireRoute(point, 'No reachable firing position selected for nest');
        walk(point, .65);
        stage = 'objective';
        if (!finished && difficultyId === 'freefall' && shooter.hp) {
          const { yaw } = aimAt(shooter, x, height, z);
          send(mission, shooter, yaw, { equipment: 'grenade' });
          sample();
        }
        for (let i = 0; !finished && mission.state === 'ACTIVE_MISSION' && i < 24 * NET.tickHz; i++) {
          const operator = crew.find((p) => p.hp > 0);
          if (operator) {
            const { yaw, pitch } = aimAt(operator, x, height, z);
            send(mission, operator, yaw, { pitch, aim: true, fire: operator.ammo > 0, reload: !operator.ammo });
          }
          for (const other of crew) if (other !== operator && other.hp && !engage(other, ground)) send(mission, other, other.yaw);
          sample();
        }
        hold(2, crew, false);
      }
    }
    if (finished) return;
    requireRoute(mission.state as string === 'EXTRACTION_AVAILABLE', 'Objectives did not settle on this route');
    if (scenario.supply) {
      const operator = crew.find((p) => p.hp > 0)!;
      stage = 'resupply';
      hold(1, [operator], false);
      send(mission, operator, operator.yaw, { reload: true });
      sample();
      hold(operator.loadout.weapons[operator.equipment.slot].reloadTicks + 2, [operator], false);
      walk({ x: ship.x - 4.1, z: ship.z }, .5, [operator]);
      if (finished) return;
      if (mission.interact(operator.id)) hold(mission.balance.resupply.interactionTicks + 2, [operator], false);
    }
    stage = 'extractionTravel';
    walk(method === 'albatross' ? { x: ship.x, z: ship.z + 1 } : plan.extraction.balloon, 1.5);
    if (finished) return;
    stage = 'extraction';
    const living = crew.filter((p) => p.hp > 0);
    const [caller, ...passengers] = living;
    requireRoute(mission.action(caller.id, method), 'Requested extraction did not start');
    for (const passenger of passengers) assert.ok(mission.action(passenger.id, 'secure'));
    const countdown = method === 'albatross' ? ALBATROSS.launchTicks : BALLOON.countdownTicks + BALLOON.approachTicks;
    hold(countdown, crew, method === 'balloon');
    hold(extractionLiftTicks(method) + 1, [], false);
    requireRoute(finished, 'Extraction window did not produce a result');
  }

  let stopped: string | undefined;
  try { run(); } catch (error) {
    if (!(error instanceof ControllerStop)) throw error;
    stopped = error.message;
  }
  const { result, state, albatross } = mission.snapshot();
  const telemetry = mission.missionTelemetry();
  assert.equal(resultEvents, result ? 1 : 0);
  const durationTicks = result?.durationTicks ?? ticks.length;
  if (result && telemetry) assert.equal(Object.values(telemetry.stateTicks).reduce((sum, value) => sum + value, 0), durationTicks);
  return { scenario, status: result?.outcome ?? 'controller-stop', stopped, state, stage, durationTicks, stages,
    plan: mission.plan, generation: diagnostics, result, telemetry, combat: mission.stats.snapshot(),
    crew: crew.map(({ hp, kills, ammo, equipment }) => ({ hp, kills, ammo, slot: equipment.slot,
      inactiveAmmo: equipment.inactiveAmmo, magazines: equipment.magazines, grenades: equipment.grenades, stims: equipment.stims })),
    supply: albatross?.supply, routeMetres: Math.round(routeMetres * 100) / 100,
    perf: { stepMs: timingStats(ticks), objectiveMs: timingStats(objectives), encounterMs: timingStats(encounters),
      directorMs: timingStats(director), rssBytesPeakSample: peakRss, estimatedPayloadBytesPerSecond: durationTicks ? bandwidthBytes * NET.tickHz / durationTicks : 0 },
  };
}

function measureScenario(scenario: Scenario) {
  const run = attempt(scenario);
  console.error('%s %s %ss', label(scenario), run.status, (run.durationTicks / NET.tickHz).toFixed(1));
  return run;
}

function measureLifecycle() {
  const mission = new MissionInstance(simulationSeed, BODENBRUCH, registry);
  const crew = Array.from({ length: matching[0].count }, (_, i) => mission.addPlayer('operator-' + i));
  const memory = () => { globalThis.gc?.(); return process.memoryUsage(); };
  const baselineMemory = memory();
  const results: { scenario: Scenario; outcome: string; durationTicks: number; carrierTick: number;
    enemyCount: number; grenadesActive: boolean; memory: NodeJS.MemoryUsage }[] = [];
  const resultIds = new Set<string>();
  for (let cycle = 0; cycle < cycles; cycle++) {
    for (const scenario of matching) {
      const result = attempt(scenario, { mission, crew });
      assert.ok(result.result && !resultIds.has(result.result.id), 'Each deployment must produce its own result');
      resultIds.add(result.result.id);
      for (const player of crew) assert.ok(mission.action(player.id, 'return-vote'));
      for (let i = 0; mission.state !== 'CARRIER_HUB' && i <= NET.tickHz + 1; i++) mission.step();
      assert.equal(mission.state, 'CARRIER_HUB');
      assert.ok(!mission.snapshot().result && !mission.snapshot().extraction && !mission.plan && !mission.atmosphere);
      assert.equal(mission.horde.count, 0);
      assert.ok(!mission.grenades.snapshot());
      assert.equal(mission.missionTelemetry(), undefined);
      assert.ok(crew.every((player) => mission.players[player.slot] === player));
      mission.drainEvents();
      results.push({ scenario, outcome: result.status, durationTicks: result.durationTicks, carrierTick: mission.tick,
        enemyCount: mission.horde.count, grenadesActive: !!mission.grenades.snapshot(), memory: memory() });
      console.error('cycle %d %s %s %ss', cycle + 1, label(scenario), result.status, (result.durationTicks / NET.tickHz).toFixed(1));
    }
  }
  return { cycles, baselineMemory, forcedGC: typeof globalThis.gc === 'function', results };
}

const evidence = cycles > 1 ? { lifecycle: measureLifecycle() } : { runs: matching.map(measureScenario) };
writeFileSync(outputPath, JSON.stringify({ buildVersion, revision: process.env.FREEFALL_SOURCE_REVISION,
  sourceBalance: registry.version, defaultDifficultyId: 'normal', simulationSeed, tickHz: NET.tickHz,
  host: { cpu: cpus()[0]?.model, logicalCpus: availableParallelism(), kernel: release(), ramBytes: totalmem(), node: process.version },
  ...evidence }, null, 2) + '\n');
