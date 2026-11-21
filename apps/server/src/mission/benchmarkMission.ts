import { BALLOON, BOARDING_TICKS, BODENBRUCH, CARRIER_SHIP, LANDING_STAGE_TICKS, MAX_ENEMIES, NET,
  SCHABE_TYPE, WIDE_POSITION_SCALE, openGround } from '@freefall/shared';
import type { MissionDefinition } from '@freefall/shared';
import { encodeHorde, playerSnapshot } from '../networking/snapshots.ts';
import { timingStats } from '../simulation/FixedLoop.ts';
import { MissionInstance } from './MissionInstance.ts';

export function benchmarkMission(ticks: number, seed: number, playerCount: number, profileDirector = false): void {
  const emptyWorld = { ...BODENBRUCH.world, initialNests: [], breachRegions: [] };
  const rows = [];
  const directorRows = [];
  for (const scenario of [
    { name: 'empty', difficulty: 'easy', world: { ...emptyWorld, patrolRegions: [] }, warmup: 360, reinforce: false },
    { name: 'patrols', difficulty: 'easy', world: emptyWorld, warmup: 360, reinforce: false },
    { name: 'breach · L1', difficulty: 'easy', world: BODENBRUCH.world, warmup: 360, reinforce: true },
    { name: 'nests · L4', difficulty: 'hard', world: BODENBRUCH.world, warmup: 2350, reinforce: true },
    { name: 'saturation · L7', difficulty: 'freefall', world: BODENBRUCH.world, warmup: 5000, reinforce: true },
    ...(profileDirector ? [{ name: 'dynamic wave · L2', difficulty: 'normal',
      world: { ...BODENBRUCH.world, patrolRegions: [] }, warmup: 360, reinforce: false }] : []),
  ]) {
    const definition: MissionDefinition = { ...BODENBRUCH, world: scenario.world };
    const instance = new MissionInstance(seed, definition);
    const players = Array.from({ length: playerCount }, (_, i) => instance.addPlayer(String(i)));
    const host = players[0];
    host.x = 0; host.z = 3;
    instance.select(host.id, { planetId: 'dev-ault', missionId: definition.id, difficultyId: scenario.difficulty });
    instance.start(host.id);
    instance.debug(host.id, 'land');
    instance.profileEnemyAI = profileDirector;
    const { spawns, pacing } = instance.director;
    const dynamic = scenario.name === 'dynamic wave · L2';
    for (const player of players) {
      player.protectedUntil = Infinity;
      player.x = -103 + (player.slot % 2) * 13;
      player.z = 64 + Math.floor(player.slot / 2) * 14;
      if (dynamic) Object.assign(player, { x: -155 + (player.slot % 2) * 2, z: -45 + (player.slot >> 1) * 2 });
    }
    const timings: number[] = [];
    const encodings: number[] = [];
    const updates: number[] = [], validations: number[] = [], initializations: number[] = [];
    const outcomes: string[] = [];
    const spawnRegions = new Set<string>();
    let peakReserved = 0, peakChecks = 0, peakSpawned = 0;
    let measuredChecks = 0, measuredSpawns = 0, measuredWaveSpawns = 0;
    let failedChecks = 0, waveStarts = 0;
    let bytes = 0;
    let peakEnemies = 0, saturatedTicks = 0;
    let peakGroups = 0;
    let peakNests = 0;
    let peakBreaches = 0;
    let playersClock = 0;
    let hordeClock = 0;
    let missionClock = 0;
    let heapAtWarmup = 0;
    for (let i = 0; i < scenario.warmup + ticks; i++) {
      const measured = i >= scenario.warmup;
      if (i === scenario.warmup) heapAtWarmup = process.memoryUsage().heapUsed;
      if (scenario.reinforce) {
        const period = 4 * NET.tickHz;
        const regions = definition.world.breachRegions;
        const slot = Math.floor(i / period) % regions.length;
        if (scenario.name === 'breach · L1' ? i === scenario.warmup : i > 150 && i % period === 0) {
          instance.director.request(regions[slot], instance.tick);
        }
      }
      const phase = i % 120;
      for (const player of players) {
        instance.receiveInput(player.id, {
          seq: i + 1, forward: Math.sin(i / 125) * .48, strafe: Math.cos(i / 125) * .42,
          yaw: dynamic ? -Math.PI / 2 : player.slot * Math.PI * .51, pitch: -.05,
          sprint: false, fire: !dynamic && phase < 24, reload: !dynamic && phase === 24,
        });
      }
      const previous = profileDirector ? { ...spawns.totals } : undefined;
      const before = performance.now();
      instance.step();
      if (instance.horde.count + spawns.reserved > spawns.cap) throw new Error('Mission spawn cap exceeded');
      if (measured) {
        timings.push(performance.now() - before);
        peakEnemies = Math.max(peakEnemies, instance.horde.count);
        if (instance.horde.count === spawns.cap) saturatedTicks++;
        peakGroups = Math.max(peakGroups, instance.director.patrols.groups.size);
        peakNests = Math.max(peakNests, instance.director.nests.active.size);
        peakBreaches = Math.max(peakBreaches, instance.director.nests.emergingCount());
      }
      const events = instance.drainEvents();
      if (measured && previous) {
        if (pacing.active) updates.push(pacing.updateMs);
        if (spawns.validationMs > 0) validations.push(spawns.validationMs);
        if (spawns.initializationMs > 0) initializations.push(spawns.initializationMs);
        const checked = spawns.totals.checked - previous.checked;
        const spawned = spawns.totals.spawned - previous.spawned;
        if (checked > instance.balance.director.spawn.maxChecksPerTick || spawned > instance.balance.limits.maxSpawnsPerTick) {
          throw new Error('Mission spawn tick budget exceeded');
        }
        measuredChecks += checked;
        measuredSpawns += spawned;
        failedChecks += checked - spawned;
        peakChecks = Math.max(peakChecks, checked);
        peakSpawned = Math.max(peakSpawned, spawned);
        peakReserved = Math.max(peakReserved, spawns.reserved);
        if (spawns.totals.waveSpawned > previous.waveSpawned) {
          measuredWaveSpawns += spawns.totals.waveSpawned - previous.waveSpawned;
          if (spawns.lastRegion) spawnRegions.add(spawns.lastRegion);
        }
        for (const event of events) {
          if (event.type === 'HordeWaveStarted') waveStarts++;
          else if (event.type === 'HordeWaveEnded') outcomes.push(event.reason);
        }
      }
      playersClock += NET.playerHz;
      if (playersClock >= NET.tickHz) {
        playersClock -= NET.tickHz;
        if (measured) bytes += Buffer.byteLength(JSON.stringify(playerSnapshot(instance, '0')));
      }
      hordeClock += NET.hordeHz;
      if (hordeClock >= NET.tickHz) {
        hordeClock -= NET.tickHz;
        const start = performance.now();
        const packet = encodeHorde(instance.horde, instance.tick, WIDE_POSITION_SCALE, instance.enemyCombat);
        if (measured) {
          encodings.push(performance.now() - start);
          bytes += packet.byteLength;
        }
      }
      missionClock += NET.missionHz;
      if (missionClock >= NET.tickHz) {
        missionClock -= NET.tickHz;
        if (measured) bytes += Buffer.byteLength(JSON.stringify(instance.snapshot()));
      }
      if (measured) {
        if (events.length) bytes += Buffer.byteLength(JSON.stringify(events));
        for (const shot of instance.shots) bytes += Buffer.byteLength(JSON.stringify(shot));
        if (instance.combatEvents.length) bytes += Buffer.byteLength(JSON.stringify(instance.combatEvents));
      }
    }
    const sim = timingStats(timings);
    const memory = process.memoryUsage();
    rows.push({
      scenario: scenario.name, warmup: scenario.warmup, enemies: peakEnemies, groups: peakGroups, nests: peakNests,
      'breaches peak': peakBreaches, 'breaches total': instance.director.breachCount,
      saturatedTicks, 'mean ms': sim.mean.toFixed(3), 'p95 ms': sim.p95.toFixed(3), 'p99 ms': sim.p99.toFixed(3), 'max ms': sim.max.toFixed(3),
      'encode p95 ms': timingStats(encodings).p95.toFixed(3),
      'heap Δ MiB': ((memory.heapUsed - heapAtWarmup) / 2 ** 20).toFixed(2), 'RSS MiB': (memory.rss / 2 ** 20).toFixed(2),
      'estimated outbound B/s/client': Math.round(bytes * NET.tickHz / ticks),
    });
    if (profileDirector) {
      const ms = (samples: number[]) => {
        const { mean, p95, p99, max } = timingStats(samples);
        return [mean, p95, p99, max].map((value) => value.toFixed(4)).join('/');
      };
      directorRows.push({ scenario: scenario.name, hash: instance.balance.configHash,
        'updates Ø/P95/P99/max ms': ms(updates), 'checking ticks Ø/P95/P99/max ms': ms(validations),
        'initializing ticks Ø/P95/P99/max ms': ms(initializations), checked: measuredChecks, failedChecks,
        spawned: measuredSpawns, peakChecks, peakSpawned, peakReserved, waveStarts, waveSpawns: measuredWaveSpawns,
        outcomes: outcomes.join(', '), regions: [...spawnRegions].join(', ') });
    }
  }
  console.log('Operation Bodenbruch · %d measured ticks · %d players · seed %d', ticks, playerCount, seed);
  console.log('Peak counters refer to measured ticks. Outbound estimate uses the horde binary payload and JSON sizes for other messages.');
  console.table(rows);
  if (profileDirector) console.table(directorRows);
  benchmarkRecovery(seed);
}

function benchmarkRecovery(seed: number): void {
  const mission = new MissionInstance(seed, BODENBRUCH);
  const operators = Array.from({ length: 4 }, (_, i) => mission.addPlayer(String(i)));
  const host = operators[0];
  Object.assign(host, { x: 0, z: 3 });
  mission.select(host.id, { planetId: 'dev-ault', missionId: BODENBRUCH.id, difficultyId: 'freefall' });
  mission.start(host.id);
  for (const operator of operators) {
    Object.assign(operator, CARRIER_SHIP);
    mission.action(operator.id, 'ready');
  }
  const advance = (count: number) => {
    for (let i = 0; i < count; i++) {
      mission.step();
      mission.drainEvents();
    }
  };
  advance(BOARDING_TICKS + LANDING_STAGE_TICKS + 2);
  for (const operator of operators) operator.protectedUntil = Infinity;
  const [alpha, bravo] = BODENBRUCH.objectives;
  if (alpha.kind !== 'activate' || bravo.kind !== 'activate') throw new Error('Invalid relay definitions');
  Object.assign(host, { x: alpha.x, z: alpha.z });
  if (!mission.interact(host.id)) throw new Error('Alpha was not available');
  advance(8 * NET.tickHz);
  Object.assign(host, { x: bravo.x, z: bravo.z });
  if (!mission.interact(host.id)) throw new Error('Bravo was not available');
  advance(2);
  for (const operator of operators) Object.assign(operator, { x: 100 + operator.slot, z: -65 });
  if (!mission.action(host.id, 'balloon')) throw new Error('Balloon was not available');
  for (const operator of operators.slice(1)) mission.action(operator.id, 'secure');

  // Maintain the hard cap with real patrol members from authored regions.
  const regions = BODENBRUCH.world.patrolRegions;
  const stressGroups = regions.map((region) => mission.director.patrols.create(region, 0, 0));
  let serial = 0;
  let peakEnemies = 0;
  let saturatedTicks = 0;
  let bytes = 0;
  let packets = 0;
  const timings: number[] = [];
  for (let i = 0; i < BALLOON.countdownTicks + BALLOON.approachTicks + BALLOON.liftTicks; i++) {
    while (mission.horde.count < MAX_ENEMIES) {
      const j = serial++;
      const group = stressGroups[j % stressGroups.length];
      const waypoint = group.region.route.waypoints[Math.floor(j / regions.length) % 4];
      const radius = 7 + j % 11;
      const x = waypoint.x + Math.cos(j * 2.39996) * radius;
      const z = waypoint.z + Math.sin(j * 2.39996) * radius;
      if (!openGround(BODENBRUCH.world, x, z, 1) || (x - host.x) ** 2 + (z - host.z) ** 2 < 32 ** 2) continue;
      mission.director.patrols.attach(group, mission.horde.spawn(x, z, SCHABE_TYPE));
    }
    const before = performance.now();
    mission.step();
    timings.push(performance.now() - before);
    mission.drainEvents();
    peakEnemies = Math.max(peakEnemies, mission.horde.count);
    if (mission.horde.count === MAX_ENEMIES) saturatedTicks++;
    if (i % 3 === 0) {
      bytes += encodeHorde(mission.horde, mission.tick, WIDE_POSITION_SCALE, mission.enemyCombat).byteLength;
      packets++;
    }
  }
  const result = mission.snapshot().result;
  if (!result?.extractionSucceeded || result.extractedOperatorIds.length !== 4) throw new Error('Recovery did not finish');
  for (const operator of operators) mission.action(operator.id, 'return-vote');
  advance(NET.tickHz + 1);
  if (mission.state !== 'CARRIER_HUB' || mission.horde.count) throw new Error('Carrier reset did not finish');
  const { mean, p95, max } = timingStats(timings);
  console.log('FREEFALL · four operators · accelerated placement and protected test actors · cap refilled by harness');
  console.table([{
    ticks: timings.length, peakEnemies, saturatedTicks, 'mean ms': mean.toFixed(3), 'p95 ms': p95.toFixed(3),
    'max ms': max.toFixed(3), 'mean horde bytes': Math.round(bytes / packets),
    'extracted operators': result.extractedOperatorIds.length, returned: mission.state,
  }]);
}
