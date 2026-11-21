/**
 * Deterministic gameplay trace used to verify that balance migrations do not change simulation results.
 * Runs scripted four-operator missions on all seven difficulty levels plus a 1,000-enemy arena and prints
 * one fingerprint per scenario. Identical fingerprints before and after a refactor prove identical behavior.
 *
 *   npm run balance:trace            print fingerprints as JSON
 */
import { createHash } from 'node:crypto';
import { BODENBRUCH, BOARDING_TICKS, CARRIER_SHIP, LANDING_STAGE_TICKS, wrapAngle } from '@freefall/shared';
import type { CombatEvent, EquipmentCommand } from '@freefall/shared';
import { MissionInstance } from '../../src/mission/MissionInstance.ts';
import { Arena } from '../../src/simulation/Arena.ts';
import type { Battlefield } from '../../src/simulation/Battlefield.ts';

export const TRACE_DIFFICULTIES = ['easy', 'normal', 'challenging', 'hard', 'extreme', 'nightmare', 'freefall'] as const;

// The tracer start and impact are render metadata. Keep the gameplay shot fields in the fingerprint.
const shotGameplay = (key: string, value: unknown) => key === 'traceFrom' || key === 'impact' ? undefined : value;

function combatGameplay(events: CombatEvent[]): string {
  return JSON.stringify(events.filter((event) => event.type !== 'grenade-release').map((event) => {
    if (event.type === 'blast') {
      const { owner, grenade, contact, ...gameplay } = event;
      return gameplay;
    }
    if (event.type === 'melee') {
      const { y, contact, ...gameplay } = event;
      return gameplay;
    }
    if (event.type === 'enemy-hit') {
      const { direction, ...gameplay } = event;
      return gameplay;
    }
    if (event.type === 'friendly-fire') {
      const { direction, life, ...gameplay } = event;
      return gameplay;
    }
    return event;
  }));
}

function hordeState(field: Battlefield): unknown[] {
  const h = field.horde;
  const rows: unknown[] = [];
  for (let i = 0; i < h.count; i++) {
    const s = h.active[i];
    rows.push([h.id[s], h.type[s], h.x[s], h.z[s], h.hp[s], h.target[s], h.attackAt[s]]);
  }
  return rows;
}

function playerState(field: Battlefield): unknown[] {
  return field.players.map((p) => p && [p.id, p.x, p.z, p.hp, p.ammo, p.kills, p.reloadUntil, p.fireAt,
    p.equipment.slot, p.equipment.inactiveAmmo, p.equipment.magazines.primary, p.equipment.magazines.secondary, p.reload.phase, p.equipment.grenades, p.equipment.stims]);
}

function drive(field: Battlefield, tick: number, seqs: number[]): void {
  for (const player of field.players) {
    if (!player) continue;
    const t = tick + player.slot * 37;
    let equipment: EquipmentCommand | undefined;
    if (t % 240 === 60) equipment = 'grenade';
    else if (t % 300 >= 250 && t % 300 < 255) equipment = 'stim';
    else if (t % 420 === 210) equipment = 'secondary';
    else if (t % 420 === 330) equipment = 'primary';
    else if (t % 180 === 90) equipment = 'melee';
    field.receiveInput(player.id, {
      seq: ++seqs[player.slot], forward: Math.round(Math.sin(t * .013) * .8), strafe: Math.round(Math.cos(t * .021) * .7),
      yaw: wrapAngle(t * .017 + player.slot * 1.4), pitch: -.04 - (t % 50) * .002, sprint: t % 200 < 30 && t % 300 < 150,
      fire: t % 300 < 180, reload: t % 97 === 0 && t % 300 < 180, life: player.life, ...(equipment ? { equipment } : {}),
    });
  }
}

export function missionTrace(difficultyId: string, ticks = 1200): string {
  const mission = new MissionInstance(51296, BODENBRUCH);
  const players = ['host', '1', '2', '3'].map((id) => mission.addPlayer(id));
  Object.assign(players[0], { x: 0, z: 3 });
  if (!mission.select('host', { planetId: 'dev-ault', missionId: BODENBRUCH.id, difficultyId })) throw new Error('select');
  if (!mission.start('host')) throw new Error('start');
  for (const p of players) {
    Object.assign(p, { ...CARRIER_SHIP, x: p.slot % 2 ? 1 : -1 });
    mission.action(p.id, 'ready');
  }
  for (let i = 0; i < BOARDING_TICKS + LANDING_STAGE_TICKS + 1; i++) mission.step();
  const digest = createHash('sha256');
  // The mission instance UUID is random by design. Neutralize it so the trace stays reproducible.
  const instance = mission.snapshot().instanceId!;
  const hash = { update: (text: string) => digest.update(text.replaceAll(instance, 'instance')) };
  // Balance metadata (configuration hash) and wall-clock telemetry are not gameplay and are excluded from the trace.
  const metadata = (key: string, value: unknown) =>
    key === 'balanceHash' || key === 'blastQueryMsTotal' || key === 'blastQueryMsMax' ? undefined : value;
  const seqs = players.map((p) => p.input.seq);
  const stats: Record<string, number> = {};
  for (let i = 0; i < ticks; i++) {
    // Move the squad next to the initial nest so combat, melee, stims and nest damage are exercised.
    if (i === 90) players.forEach((p, n) => Object.assign(p, { x: -98 + n * 2.5, z: 70 + n }));
    drive(mission, mission.tick, seqs);
    mission.step();
    if (i === 400) mission.debug('host', 'breach');
    if (i === 600) mission.debug('host', 'alert');
    hash.update(JSON.stringify(mission.shots, shotGameplay));
    hash.update(combatGameplay(mission.combatEvents));
    if (i % 30 === 0) {
      const snapshot = mission.snapshot();
      hash.update(JSON.stringify([hordeState(mission), playerState(mission), snapshot.nests, snapshot.convicts,
        snapshot.albatross, snapshot.threat, snapshot.groups, snapshot.alarms, snapshot.encounter, mission.grenades.snapshot()]));
    }
    const events = mission.drainEvents();
    for (const event of events) stats[event.type] = (stats[event.type] ?? 0) + 1;
    const gameplayEvents = events.map(({ sequence, instanceId, ...event }) => {
      if (event.type !== 'SwarmNestDestroyed') return event;
      const { position, ...gameplay } = event;
      return gameplay;
    });
    hash.update(JSON.stringify(gameplayEvents, metadata));
  }
  stats.kills = players.reduce((sum, p) => sum + p.kills, 0);
  stats.stimsUsed = players.reduce((sum, p) => sum + 5 - p.equipment.stims, 0);
  stats.grenadesUsed = players.reduce((sum, p) => sum + 2 - p.equipment.grenades, 0);
  stats.enemies = mission.horde.count;
  stats.operatorHp = players.reduce((sum, p) => sum + p.hp, 0);
  if (process.env.TRACE_STATS) console.error(difficultyId, JSON.stringify(stats));
  return digest.digest('hex');
}

export function arenaTrace(ticks = 600): string {
  const arena = new Arena(7, 1000);
  for (const id of ['a', 'b', 'c', 'd']) arena.addPlayer(id);
  const hash = createHash('sha256');
  const seqs = [0, 0, 0, 0];
  for (let i = 0; i < ticks; i++) {
    drive(arena, arena.tick, seqs);
    arena.step();
    hash.update(JSON.stringify(arena.shots, shotGameplay));
    hash.update(combatGameplay(arena.combatEvents));
    if (i % 20 === 0) hash.update(JSON.stringify([hordeState(arena), playerState(arena), arena.grenades.snapshot()]));
  }
  return hash.digest('hex');
}

export function allTraces(): Record<string, string> {
  const traces: Record<string, string> = { arena: arenaTrace() };
  for (const id of TRACE_DIFFICULTIES) traces['mission.' + id] = missionTrace(id);
  return traces;
}

if (import.meta.main) console.log(JSON.stringify(allTraces(), null, 2));
