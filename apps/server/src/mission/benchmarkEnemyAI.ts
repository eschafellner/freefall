import {
  BALANCE, BALANCE_SOURCES, BODENBRUCH, HORDE_SIZES, HordeFrame, NET, SCHABE_TYPE, WIDE_POSITION_SCALE,
  createBalanceRegistry, decodeHorde, missionGround, openGround,
} from '@freefall/shared';
import type { Obstacle } from '@freefall/shared';
import { ENEMY_GROUND_RADIUS } from '../ecs/EnemyNavigation.ts';
import { encodeHorde } from '../networking/snapshots.ts';
import { timingStats } from '../simulation/FixedLoop.ts';
import { seededRandom } from '../simulation/Battlefield.ts';
import { MissionInstance } from './MissionInstance.ts';

export const ENEMY_AI_SCENARIOS = ['distributed', 'open', 'concentrated', 'corridor', 'mobile', 'director'] as const;
type Scenario = typeof ENEMY_AI_SCENARIOS[number];
const DISTRIBUTED = [{ x: -12, z: 42 }, { x: 25, z: -8 }, { x: -88, z: 56 }, { x: 87, z: -50 }];
const CONCENTRATED = [{ x: -12, z: 42 }, { x: -10, z: 42 }, { x: -12, z: 44 }, { x: -10, z: 44 }];
const CORRIDOR_POSITIONS = [{ x: 7, z: 0 }, { x: 9, z: 1 }, { x: 8, z: -2 }, { x: 10, z: -1 }];
const CORRIDOR: Obstacle[] = [
  { kind: 'barrier', x: 0, z: 105.375, halfX: 2, halfZ: 104.625, height: 2.5 },
  { kind: 'barrier', x: 0, z: -104.6, halfX: 2, halfZ: 104.15, height: .7 },
];

export function benchmarkEnemyAI(ticks: number, seed: number, playerCount: number | 'matrix', scenario: Scenario): void {
  const warmup = 360;
  const obstacles = scenario === 'open' || scenario === 'mobile' ? [] : scenario === 'corridor' ? CORRIDOR : BODENBRUCH.world.obstacles;
  const withDirector = scenario === 'director';
  const world = { ...BODENBRUCH.world, obstacles, initialNests: [], patrolRegions: [],
    breachRegions: withDirector ? BODENBRUCH.world.breachRegions : [] };
  const surface = missionGround(world);
  const positions = scenario === 'concentrated' ? CONCENTRATED : scenario === 'corridor' ? CORRIDOR_POSITIONS : DISTRIBUTED;
  const rows = [], load = [];
  for (const count of HORDE_SIZES) {
    const operators = playerCount === 'matrix' ? (count <= 100 ? 1 : 4) : playerCount;
    // Set the test population cap before deployment. The director samples a stable full room at each load point.
    const registry = withDirector && count ? createBalanceRegistry({ ...BALANCE_SOURCES,
      difficulty: { difficulties: BALANCE_SOURCES.difficulty.difficulties.map((difficulty) =>
        difficulty.id === 'freefall' ? { ...difficulty, maxActiveEnemies: count } : difficulty) },
    }) : BALANCE;
    const mission = new MissionInstance(seed, {
      ...BODENBRUCH, world: count ? world : { ...world, breachRegions: [] },
    }, registry);
    const random = seededRandom(seed);
    const players = Array.from({ length: operators }, (_, i) => mission.addPlayer(String(i)));
    const host = players[0];
    if (withDirector) {
      Object.assign(host, { x: 0, z: 3 });
      if (!mission.select(host.id, { planetId: 'dev-ault', missionId: BODENBRUCH.id, difficultyId: 'freefall' })) {
        throw new Error('Could not select the profiled mission');
      }
    }
    if (!mission.debug(host.id, 'land')) throw new Error('Could not deploy benchmark crew');
    for (const player of players) Object.assign(player, positions[player.slot], { protectedUntil: 0 });
    const groups = positions.map((position, i) => mission.director.patrols.create({
      ...position, id: 'benchmark-' + i, radius: 20,
      route: { waypoints: [position, { x: position.x + 3, z: position.z + 3 }] },
    }, 0));
    mission.profileEnemyAI = true;
    let spawned = 0;
    for (let attempt = 0; spawned < count && attempt < count * 30; attempt++) {
      const group = groups[spawned % groups.length];
      const angle = random() * Math.PI * 2;
      const radius = 4 + random() * 19;
      const x = group.region.x + Math.sin(angle) * radius;
      const z = group.region.z + Math.cos(angle) * radius;
      if ((scenario === 'corridor' && x > -4) || !openGround(surface, x, z, .5)) continue;
      mission.director.patrols.attach(group, mission.horde.spawn(x, z, SCHABE_TYPE));
      spawned++;
    }
    if (spawned !== count) throw new Error('Could not place benchmark horde');
    if (scenario === 'corridor') {
      for (const [index, group] of groups.entries()) {
        mission.director.patrols.forceAlert(group, players[index % operators], mission.tick);
        group.lastSeen = warmup + ticks;
        group.nextCall = Infinity;
      }
    }

    const horde = mission.horde;
    const ids = horde.id.slice();
    const startX = horde.x.slice(), startZ = horde.z.slice();
    const wireFrame = new HordeFrame();
    const navigation = mission.navigation;
    const combat = mission.enemyCombat;
    const ai = mission.enemyAITime;
    const routeMetrics = mission.director.patrols.navigation.metrics;
    const counters = () => ({
      requests: routeMetrics.requests, builds: routeMetrics.builds, hits: routeMetrics.hits, deferred: routeMetrics.deferred,
      stuck: navigation.stuckEpisodes, unreachable: navigation.unreachableEpisodes, repaired: navigation.recoveries,
      attempts: navigation.recoveryAttempts, recovered: navigation.recoverySuccesses, fallbacks: navigation.recoveryFallbacks,
      decisions: combat.totals.decisions, validations: combat.totals.validations, strikes: combat.totals.starts,
      damageEvents: combat.totals.hits, operatorHits: combat.totals.operatorHits, operatorDamage: combat.totals.operatorDamage,
      interruptions: combat.totals.interruptions,
    });
    const sim: number[] = [], aiTimes: number[] = [], target: number[] = [], nav: number[] = [], attack: number[] = [];
    const steer: number[] = [], neighbor: number[] = [], collision: number[] = [], field: number[] = [];
    const encounter: number[] = [], perception: number[] = [], wire: number[] = [];
    const validation: number[] = [], directorUpdates: number[] = [];
    let packetBytes = 0, meleeDamage = 0, peakMoving = 0, peakRequests = 0, peakBuilds = 0;
    let peakActive = 0, peakAttacking = 0, hordeBytes = 0, combatBytes = 0;
    let peakFieldMs = 0, crossed = 0, activeTargets = 0;
    let measuredOperatorStarts = 0, hitsFromMeasuredStarts = 0;
    const firstMeasuredTick = mission.tick + warmup + 1;
    const lastCompleteStart = firstMeasuredTick + ticks - combat.timing.windupTicks - combat.timing.activeTicks;
    let beforeCounters = counters();
    let memoryStart = process.memoryUsage();
    for (let i = 0; i < warmup + ticks; i++) {
      for (const p of players) {
        p.hp = 100_000;
        if (scenario !== 'mobile') continue;
        const yaw = (i * 2 * Math.PI / 240 + p.slot + Math.PI) % (2 * Math.PI) - Math.PI;
        mission.receiveInput(p.id, {
          seq: i + 1, life: p.life, forward: .55, strafe: 0, yaw, pitch: 0, sprint: false, fire: false,
        });
      }
      if (i === warmup) {
        beforeCounters = counters();
        memoryStart = process.memoryUsage();
      }
      const beforeRequests = routeMetrics.requests;
      const beforeBuilds = routeMetrics.builds;
      const beforeOperatorStarts = combat.totals.operatorStarts;
      const before = performance.now();
      mission.step();
      const elapsed = performance.now() - before;
      mission.drainEvents();
      peakRequests = Math.max(peakRequests, routeMetrics.requests - beforeRequests);
      peakBuilds = Math.max(peakBuilds, routeMetrics.builds - beforeBuilds);
      peakFieldMs = Math.max(peakFieldMs, ai.fieldMs);
      if (i < warmup) continue;
      if (horde.count !== count) throw new Error('Benchmark horde count changed');
      if (mission.tick <= lastCompleteStart) measuredOperatorStarts += combat.totals.operatorStarts - beforeOperatorStarts;
      for (const event of mission.combatEvents) {
        if (event.type !== 'enemy-hit') continue;
        const start = Number(event.attack.slice(event.attack.lastIndexOf(':') + 1));
        if (start >= firstMeasuredTick && start <= lastCompleteStart) hitsFromMeasuredStarts++;
      }
      sim.push(elapsed);
      aiTimes.push(ai.targetMs + ai.navigationMs + ai.attackMs + ai.encounterMs);
      target.push(ai.targetMs);
      nav.push(ai.navigationMs);
      steer.push(ai.steeringMs);
      neighbor.push(ai.neighborMs);
      collision.push(ai.collisionMs);
      field.push(ai.fieldMs);
      attack.push(ai.attackMs);
      validation.push(combat.validationMs);
      peakActive = Math.max(peakActive, combat.active);
      peakAttacking = Math.max(peakAttacking, combat.windingUp + combat.active);
      encounter.push(ai.encounterMs);
      if (withDirector) directorUpdates.push(mission.director.pacing.updateMs);
      perception.push(ai.perceptionMs);
      for (const p of players) meleeDamage += 100_000 - p.hp;
      if (Math.floor(mission.tick * NET.hordeHz / NET.tickHz) > Math.floor((mission.tick - 1) * NET.hordeHz / NET.tickHz)) {
        const start = performance.now();
        const packet = encodeHorde(horde, mission.tick, WIDE_POSITION_SCALE, mission.enemyCombat);
        wire.push(performance.now() - start);
        packetBytes = packet.byteLength;
        hordeBytes += packetBytes;
        if (i % NET.tickHz === 2 && (!decodeHorde(packet, wireFrame, WIDE_POSITION_SCALE) ||
            wireFrame.count !== count || wireFrame.byId.size !== count)) {
          throw new Error('Benchmark horde snapshot could not be decoded');
        }
      }
      if (mission.combatEvents.length) combatBytes += Buffer.byteLength(JSON.stringify(mission.combatEvents));
      if (i % NET.tickHz === 0 || i === warmup + ticks - 1) {
        let moving = 0, targetMask = 0;
        crossed = 0;
        for (const slot of horde.active.subarray(0, count)) {
          const x = horde.x[slot], z = horde.z[slot];
          if (horde.id[slot] !== ids[slot] || !openGround(surface, x, z, ENEMY_GROUND_RADIUS - 0.0001)) {
            throw new Error(`Invalid benchmark entity ${slot} at ${x}, ${z}`);
          }
          const target = horde.target[slot];
          if (target !== -1 && !players[target]) throw new Error('Benchmark contained an invalid target slot');
          if (target >= 0) targetMask |= 1 << target;
          if (navigation.actualX[slot] ** 2 + navigation.actualZ[slot] ** 2 > .01) moving++;
          if (x > 2.5) crossed++;
        }
        activeTargets |= targetMask;
        peakMoving = Math.max(peakMoving, moving);
      }
    }
    if (count && (!meleeDamage || !horde.active.subarray(0, count).some((slot) =>
      Math.hypot(horde.x[slot] - startX[slot], horde.z[slot] - startZ[slot]) > ENEMY_GROUND_RADIUS))) {
      throw new Error(`The benchmark horde did not pursue or attack (count ${count}, damage ${meleeDamage}, crossings ${crossed})`);
    }
    if (peakRequests > mission.balance.hordeAi.routeRequestsPerTick || peakBuilds > mission.balance.hordeAi.fieldBuildsPerTick) {
      throw new Error('Benchmark exceeded a navigation budget');
    }
    const totals = timingStats(sim), totalAI = timingStats(aiTimes), memoryEnd = process.memoryUsage();
    const p95 = (samples: number[]) => timingStats(samples).p95.toFixed(3);
    const delta = counters();
    for (const key of Object.keys(delta) as (keyof typeof delta)[]) delta[key] -= beforeCounters[key];
    if (delta.operatorDamage !== meleeDamage) throw new Error('Counted Schabe damage does not match the authoritative HP delta');
    if (hitsFromMeasuredStarts > measuredOperatorStarts) throw new Error('More operator hits than attacks in the measured cohort');
    const combatTiming = timingStats(attack);
    if (withDirector) {
      const directorTiming = timingStats(directorUpdates);
      console.log('Director %d: %s', count, JSON.stringify({ balanceHash: mission.balance.configHash,
        state: mission.snapshot().encounter?.state, checks: mission.director.spawns.totals.checked,
        ...directorTiming }));
    }
    rows.push({
      count, operators, 'tick Ø': totals.mean.toFixed(3), 'tick p95': totals.p95.toFixed(3), 'tick p99': totals.p99.toFixed(3), max: totals.max.toFixed(3),
      'AI Ø': totalAI.mean.toFixed(3), 'AI p95': totalAI.p95.toFixed(3), 'AI p99': totalAI.p99.toFixed(3),
      target: p95(target), nav: p95(nav), steering: p95(steer), neighbors: p95(neighbor), collision: p95(collision),
      'field p95': p95(field), 'field max incl. warm-up': peakFieldMs.toFixed(3),
      'melee Ø/P95/P99': [combatTiming.mean, combatTiming.p95, combatTiming.p99].map((ms) => ms.toFixed(3)).join('/'),
      'validation p95': p95(validation), encounter: p95(encounter),
      perception: p95(perception), encode: p95(wire),
    });
    load.push({
      count, 'requests/s': Math.round(delta.requests * NET.tickHz / ticks), peakRequests, peakBuilds, coldBuilds: beforeCounters.builds, builds: delta.builds,
      hits: delta.hits, deferred: delta.deferred, stuck: delta.stuck, attempts: delta.attempts,
      recovered: delta.recovered, fallbacks: delta.fallbacks, unreachable: delta.unreachable, repaired: delta.repaired,
      peakMoving, operatorTargets: players.filter((p) => activeTargets & (1 << p.slot)).length,
      ...(scenario === 'corridor' ? { crossed } : {}),
      packetBytes, meleeDamage, 'heap Δ MiB': ((memoryEnd.heapUsed - memoryStart.heapUsed) / 2 ** 20).toFixed(2),
      'RSS MiB': (memoryEnd.rss / 2 ** 20).toFixed(2), 'array buffers MiB': (memoryEnd.arrayBuffers / 2 ** 20).toFixed(2),
    });
    console.log('Combat %d: %s', count, JSON.stringify({
      decisionsPerSecond: Math.round(delta.decisions * NET.tickHz / ticks),
      validationsPerSecond: Math.round(delta.validations * NET.tickHz / ticks),
      attacksPerSecond: +(delta.strikes * NET.tickHz / ticks).toFixed(2),
      damageEventsPerSecond: +(delta.damageEvents * NET.tickHz / ticks).toFixed(2),
      operatorHits: delta.operatorHits, operatorDamage: delta.operatorDamage,
      operatorHitsPerMinute: +(delta.operatorHits * 60 * NET.tickHz / ticks).toFixed(2),
      measuredOperatorStarts, hitsFromMeasuredStarts,
      operatorHitRate: measuredOperatorStarts ? +(hitsFromMeasuredStarts / measuredOperatorStarts).toFixed(3) : 0,
      peakActive, peakAttacking, interruptions: delta.interruptions,
      hordeBytesPerSecond: Math.round(hordeBytes * NET.tickHz / ticks),
      combatJsonBytesPerSecond: Math.round(combatBytes * NET.tickHz / ticks),
    }));
  }
  console.log('Bodenbruch AI · %s · seed %d · %d warm-up + %d measured ticks · simulation and subsystem timings in ms', scenario, seed, warmup, ticks);
  console.table(rows);
  console.table(load);
}
