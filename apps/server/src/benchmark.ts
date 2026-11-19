import { availableParallelism } from 'node:os';
import { arch, cpus, platform, release } from 'node:os';
import { HORDE_SIZES, MAX_PLAYERS, NET } from '@freefall/shared';
import { Arena } from './simulation/Arena.ts';
import { timingStats } from './simulation/FixedLoop.ts';
import { benchmarkMission } from './mission/benchmarkMission.ts';
import { encodeHorde, playerSnapshot } from './networking/snapshots.ts';

const args = process.argv.slice(2);
const mission = args[0] === 'mission';
if (mission) args.shift();
const ticks = Number(args[0] ?? 1800);
const seed = Number(args[1] ?? 421337);
const playerCount = Number(args[2] ?? MAX_PLAYERS);
const firePattern = args[3] ?? 'continuous';
if (!Number.isSafeInteger(ticks) || ticks < 30 || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff ||
    !Number.isInteger(playerCount) || playerCount < 1 || playerCount > MAX_PLAYERS ||
    (firePattern !== 'continuous' && firePattern !== 'burst' && firePattern !== 'combat' && firePattern !== 'tactical')) {
  throw new Error('Usage: npm run benchmark -- [mission] [ticks >= 30] [unsigned 32-bit seed] [players 1..4] [continuous|burst|combat|tactical]');
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
    let maxPlayerBytes = 0;
    let dives = 0;
    let peakEnemies = 0;
    let shots = 0;
    let kills = 0;
    for (let i = 0; i < warmup + ticks; i++) {
      const triggerPhase = i % (NET.tickHz * 4);
      for (const p of players) {
        // 7.2B: magazines are limited. Keep the reserve topped up so the trigger load stays comparable to 7.1.
        p.equipment.magazines.primary = p.loadout.weapons.primary.maxReserveMagazines;
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
        shots += arena.shots.length;
        if (firePattern === 'tactical' && triggerPhase === 45) {
          dives += players.filter((p) => p.posture.lastDive === arena.tick).length;
        }
        if (Math.floor(arena.tick * NET.playerHz / NET.tickHz) > Math.floor((arena.tick - 1) * NET.playerHz / NET.tickHz)) {
          maxPlayerBytes = Math.max(maxPlayerBytes, Buffer.byteLength(JSON.stringify(playerSnapshot(arena, players[0].id))));
        }
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
      'encode p95 ms': snapshots.p95.toFixed(3), 'max horde B': packetBytes, 'max players JSON B': maxPlayerBytes, dives, shots, kills,
      blasts: arena.stats.data.blasts, 'blast max ms': arena.stats.data.blastQueryMsMax.toFixed(3), melee: arena.stats.data.meleeAttacks,
    });
  }
  console.table(rows);
}
