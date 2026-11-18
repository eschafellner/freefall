import { availableParallelism } from 'node:os';
import { arch, cpus, platform, release } from 'node:os';
import { HORDE_SIZES, MAX_PLAYERS, NET } from '@freefall/shared';
import { Arena } from './simulation/Arena.ts';
import { timingStats } from './simulation/FixedLoop.ts';
import { benchmarkMission } from './mission/benchmarkMission.ts';
import { encodeHorde } from './networking/snapshots.ts';

const args = process.argv.slice(2);
const mission = args[0] === 'mission';
if (mission) args.shift();
const ticks = Number(args[0] ?? 1800);
const seed = Number(args[1] ?? 421337);
const playerCount = Number(args[2] ?? MAX_PLAYERS);
const firePattern = args[3] ?? 'continuous';
if (!Number.isSafeInteger(ticks) || ticks < 30 || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff ||
    !Number.isInteger(playerCount) || playerCount < 1 || playerCount > MAX_PLAYERS ||
    (firePattern !== 'continuous' && firePattern !== 'burst')) {
  throw new Error('Usage: npm run benchmark -- [mission] [ticks >= 30] [unsigned 32-bit seed] [players 1..4] [continuous|burst]');
}

console.log('%s · %s %s %s · %s · %d logical CPUs available', process.version, platform(), release(), arch(), cpus()[0].model, availableParallelism());

if (mission) benchmarkMission(ticks, seed, playerCount);
else benchmarkArena();

function benchmarkArena(): void {
  const warmup = 360;
  const bytesPerTick = NET.tickHz / NET.hordeHz;
  console.log('%d warm-up ticks + %d measured ticks at virtual %d Hz, seed %d, %d players', warmup, ticks, NET.tickHz, seed, playerCount);
  console.log('Trigger pattern: %s', firePattern);
  const rows = [];
  for (const count of HORDE_SIZES) {
    const arena = new Arena(seed, count);
    const players = Array.from({ length: playerCount }, (_, i) => arena.addPlayer(String(i)));
    const simTimes = [];
    const snapshotTimes = [];
    let packetBytes = 0;
    let peakEnemies = 0;
    let shots = 0;
    let kills = 0;
    for (let i = 0; i < warmup + ticks; i++) {
      const triggerPhase = i % (NET.tickHz * 4);
      for (const p of players) {
        // Reproducible player activity with overlapping pursuit paths and constant fire.
        arena.receiveInput(p.id, {
          seq: i + 1, forward: 1, strafe: 0, yaw: Math.sin(i / 90 + p.slot * 2) * Math.PI,
          pitch: -0.065, sprint: false, fire: firePattern === 'continuous' || triggerPhase < NET.tickHz,
          reload: firePattern === 'burst' && triggerPhase === NET.tickHz,
        });
      }
      const before = performance.now();
      arena.step();
      const after = performance.now();
      if (i >= warmup) {
        simTimes.push(after - before);
        peakEnemies = Math.max(peakEnemies, arena.horde.count);
        shots += arena.shots.length;
        kills += arena.shots.filter((shot) => shot.eliminated).length;
      }
      if (arena.tick % bytesPerTick === 0) {
        const start = performance.now();
        const bytes = encodeHorde(arena.horde, arena.tick);
        const elapsed = performance.now() - start;
        if (i >= warmup) {
          packetBytes = Math.max(bytes.byteLength, packetBytes);
          snapshotTimes.push(elapsed);
        }
      }
    }
    const sim = timingStats(simTimes);
    const snapshots = timingStats(snapshotTimes);
    rows.push({
      target: count, peak: peakEnemies,
      'mean ms': sim.mean.toFixed(3), 'p95 ms': sim.p95.toFixed(3), 'max ms': sim.max.toFixed(3),
      'encode p95 ms': snapshots.p95.toFixed(3), 'max snapshot B': packetBytes, shots, kills,
    });
  }
  console.table(rows);
}
