import { availableParallelism } from 'node:os';
import { arch, cpus, platform, release } from 'node:os';
import { HORDE_SIZES, MAX_PLAYERS, NET, isGroundPosture } from '@freefall/shared';
import { Arena } from './simulation/Arena.ts';
import { timingStats } from './simulation/FixedLoop.ts';
import { ENEMY_AI_SCENARIOS, benchmarkEnemyAI } from './mission/benchmarkEnemyAI.ts';
import { benchmarkMission } from './mission/benchmarkMission.ts';
import { encodeHorde, playerSnapshot } from './networking/snapshots.ts';

const args = process.argv.slice(2);
const mission = args[0] === 'mission';
const enemyAI = args[0] === 'enemy-ai';
if (mission || enemyAI) args.shift();
const ticks = Number(args[0] ?? 1800);
const seed = Number(args[1] ?? 421337);
const matrix = !mission && !enemyAI && args[2] === 'matrix';
const aiMatrix = enemyAI && args[2] === 'matrix';
const playerCount = matrix || aiMatrix ? MAX_PLAYERS : Number(args[2] ?? MAX_PLAYERS);
const firePattern = args[3] ?? 'continuous';
const scenario = ENEMY_AI_SCENARIOS.find((item) => item === (args[3] ?? 'distributed'));
if (!Number.isSafeInteger(ticks) || ticks < 30 || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff ||
    !Number.isInteger(playerCount) || playerCount < 1 || playerCount > MAX_PLAYERS ||
    (!enemyAI && !(mission && firePattern === 'director') && !['continuous', 'burst', 'combat', 'tactical', 'ground'].includes(firePattern)) ||
    (enemyAI && !scenario)) {
  throw new Error('Usage: npm run benchmark -- [mission|enemy-ai] [ticks >= 30] [seed] [players 1..4|matrix] [arena: continuous|burst|combat|tactical|ground, mission: director, enemy-ai: distributed|open|concentrated|corridor|mobile|director]');
}

console.log('%s · %s %s %s · %s · %d logical CPUs available', process.version, platform(), release(), arch(), cpus()[0].model, availableParallelism());

if (enemyAI && scenario) benchmarkEnemyAI(ticks, seed, aiMatrix ? 'matrix' : playerCount, scenario);
else if (mission) benchmarkMission(ticks, seed, playerCount, args[3] === 'director');
else benchmarkArena();

function benchmarkArena(): void {
  const warmup = 360;
  const ticksPerHordePacket = NET.tickHz / NET.hordeHz;
  console.log('%d warm-up ticks + %d measured ticks at virtual %d Hz, seed %d, players: %s',
    warmup, ticks, NET.tickHz, seed, matrix ? '1 at 0/100, 4 at 250/500/1000' : playerCount);
  console.log('Trigger pattern: %s', firePattern);
  const rows = [];
  for (const count of HORDE_SIZES) {
    const arena = new Arena(seed, count);
    const operators = matrix && count <= 100 ? 1 : playerCount;
    const players = Array.from({ length: operators }, (_, i) => arena.addPlayer(String(i)));
    const simTimes = [];
    const snapshotTimes = [];
    let packetBytes = 0;
    let payloadTotal = 0;
    let maxPlayerBytes = 0;
    let dives = 0;
    let peakEnemies = 0;
    let minEnemies: number = count;
    let livingOperators = operators;
    let shots = 0;
    let kills = 0;
    let crawlTicks = 0;
    let fireTicks = 0;
    let reloadTicks = 0;
    let stimTicks = 0;
    let heapStart = 0;
    let cpuStart = process.cpuUsage();
    for (let i = 0; i < warmup + ticks; i++) {
      if (i === warmup) {
        heapStart = process.memoryUsage().heapUsed;
        cpuStart = process.cpuUsage();
      }
      const triggerPhase = i % (NET.tickHz * 4);
      for (const p of players) {
        // 7.2B: magazines are limited. Keep the reserve topped up so the trigger load stays comparable to 7.1.
        p.equipment.magazines.primary = p.loadout.weapons.primary.maxReserve;
        if (firePattern === 'ground') {
          const phase = i % (6 * NET.tickHz);
          const equipment = phase === 130 ? 'stim' as const : undefined;
          // Keep the four operators alive for the full sample. The tactical scenario measures normal combat damage.
          if (isGroundPosture(p.posture.current)) p.protectedUntil = Infinity;
          if (equipment) {
            p.equipment.stims = p.loadout.medical.maxCharges;
            p.hp = p.loadout.maxHealth - p.loadout.medical.healAmount;
          }
          arena.receiveInput(p.id, {
            seq: i + 1, life: p.life, ...(i === 0 && { posture: 'dive' }),
            forward: i === 0 ? p.slot % 2 ? -1 : 1 : Math.cos(phase / (6 * NET.tickHz) * Math.PI * 2),
            strafe: Math.sin(phase / (6 * NET.tickHz) * Math.PI * 2),
            yaw: .25 * Math.sin(phase / NET.tickHz) * (p.slot % 2 ? -1 : 1),
            pitch: -.21, sprint: false, aim: true, fire: phase < 60, reload: phase === 60, equipment,
          });
          continue;
        }
        const tactical = firePattern === 'tactical';
        if (firePattern === 'combat' || tactical) p.equipment.grenades = p.loadout.grenade.capacity;
        // Reproducible player activity with overlapping pursuit paths and constant fire.
        // `combat` adds a grenade every 2 s and a melee strike every second per operator.
        const t = i + p.slot * 11;
        const equipment = tactical ? triggerPhase === 0 ? 'grenade' as const : undefined : firePattern !== 'combat' ? undefined
          : t % (NET.tickHz * 2) === 0 ? 'grenade' as const : t % NET.tickHz === 15 ? 'melee' as const : undefined;
        const posture = tactical && triggerPhase === 45 ? 'dive' : tactical && triggerPhase === 86 ? 'stand' : undefined;
        arena.receiveInput(p.id, {
          seq: i + 1, forward: posture === 'dive' && p.slot % 2 ? -1 : 1, strafe: posture === 'dive' ? p.slot * .28 : 0, yaw: Math.sin(i / 90 + p.slot * 2) * Math.PI,
          pitch: -0.065, sprint: false, fire: firePattern !== 'burst' || triggerPhase < NET.tickHz,
          reload: firePattern === 'burst' && triggerPhase === NET.tickHz,
          ...(equipment && { equipment, life: p.life }),
          ...(posture && { posture, life: p.life }),
        });
      }
      const before = performance.now();
      arena.step();
      const after = performance.now();
      if (i >= warmup) {
        simTimes.push(after - before);
        peakEnemies = Math.max(peakEnemies, arena.horde.count);
        minEnemies = Math.min(minEnemies, arena.horde.count);
        let alive = 0;
        for (const player of players) if (player.hp > 0) alive++;
        livingOperators = Math.min(livingOperators, alive);
        shots += arena.shots.length;
        if (firePattern === 'ground') {
          if (players.every((p) => p.posture.groundMotion)) crawlTicks++;
          if (arena.shots.length === players.length) fireTicks++;
          if (players.every((p) => p.reloadUntil > arena.tick)) reloadTicks++;
          if (players.every((p) => p.equipment.action === 'stim')) stimTicks++;
        }
        if (firePattern === 'tactical' && triggerPhase === 45) {
          dives += players.filter((p) => p.posture.lastDive === arena.tick).length;
        }
        if (Math.floor(arena.tick * NET.playerHz / NET.tickHz) > Math.floor((arena.tick - 1) * NET.playerHz / NET.tickHz)) {
          const bytes = Buffer.byteLength(JSON.stringify(playerSnapshot(arena, players[0].id)));
          maxPlayerBytes = Math.max(maxPlayerBytes, bytes);
          payloadTotal += bytes;
        }
        kills += arena.shots.filter((shot) => shot.eliminated).length;
      }
      if (arena.tick % ticksPerHordePacket === 0) {
        const start = performance.now();
        const bytes = encodeHorde(arena.horde, arena.tick, undefined, arena.enemyCombat);
        const elapsed = performance.now() - start;
        if (i >= warmup) {
          packetBytes = Math.max(bytes.byteLength, packetBytes);
          payloadTotal += bytes.byteLength;
          snapshotTimes.push(elapsed);
        }
      }
    }
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage(cpuStart);
    const sim = timingStats(simTimes);
    const snapshots = timingStats(snapshotTimes);
    rows.push({
      target: count, operators, 'min alive': livingOperators, 'min enemies': minEnemies, peak: peakEnemies,
      'mean ms': sim.mean.toFixed(3), 'p95 ms': sim.p95.toFixed(3), 'p99 ms': sim.p99.toFixed(3), 'max ms': sim.max.toFixed(3),
      'encode p95 ms': snapshots.p95.toFixed(3), 'max horde B': packetBytes, 'max players JSON B': maxPlayerBytes, dives, shots, kills,
      'payload KiB/s': (payloadTotal / 1024 * NET.tickHz / ticks).toFixed(1),
      'CPU ms': ((cpu.user + cpu.system) / 1000).toFixed(1), 'heap delta MiB': ((memory.heapUsed - heapStart) / 2 ** 20).toFixed(1),
      'RSS MiB': (memory.rss / 2 ** 20).toFixed(1),
      blasts: arena.stats.data.blasts, 'blast max ms': arena.stats.data.blastQueryMsMax.toFixed(3), melee: arena.stats.data.meleeAttacks,
      ...(firePattern === 'ground' && { crawlTicks, fireTicks, reloadTicks, stimTicks }),
    });
  }
  console.table(rows);
}
