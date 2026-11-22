import { BALANCE, diveTravel, isGroundPosture } from '@freefall/shared';
import type { CombatTelemetry, DamageSource, DiveState, Posture, PostureCommand, PostureState, ResupplyGrant, WeaponSlot } from '@freefall/shared';
import type { SimPlayer } from '../simulation/Player.ts';

const slots = (): Record<WeaponSlot, number> => ({ primary: 0, secondary: 0 });
const grant = (): ResupplyGrant => ({ primaryMagazines: 0, secondaryMagazines: 0, grenades: 0, stims: 0 });

export const emptyTelemetry = (): CombatTelemetry => ({
  shots: slots(), hits: slots(), damage: slots(), magazinesUsed: slots(), roundsDiscarded: slots(),
  reloadsInterrupted: 0, grenadesThrown: 0, grenadeDamageEnemies: 0, grenadeDamageNests: 0, grenadeKills: 0,
  meleeAttacks: 0, meleeHits: 0, meleeKills: 0, staggers: 0,
  friendlyFireDamage: { bullet: 0, explosion: 0, melee: 0 } satisfies Record<DamageSource, number>,
  selfDamage: 0, convictFriendlyDamage: 0, resupplyUses: 0, refilled: grant(),
  blasts: 0, blastQueryMsTotal: 0, blastQueryMsMax: 0,
});

/** Plain counters, incremented inline. No allocation per tick, no per-player data. */
export class CombatStats {
  data: CombatTelemetry = emptyTelemetry();

  reset(): void { this.data = emptyTelemetry(); }

  /** Deep copy for snapshots and mission results. */
  snapshot(): CombatTelemetry {
    const round = (value: number) => Math.round(value * 100) / 100;
    const d = this.data;
    const map = <T extends Record<string, number>>(record: T): T =>
      Object.fromEntries(Object.entries(record).map(([key, value]) => [key, round(value)])) as T;
    return {
      ...d, shots: { ...d.shots }, hits: { ...d.hits }, damage: map(d.damage), magazinesUsed: { ...d.magazinesUsed },
      roundsDiscarded: { ...d.roundsDiscarded }, friendlyFireDamage: map(d.friendlyFireDamage), refilled: { ...d.refilled },
      grenadeDamageEnemies: round(d.grenadeDamageEnemies), grenadeDamageNests: round(d.grenadeDamageNests),
      blastQueryMsTotal: round(d.blastQueryMsTotal), blastQueryMsMax: Math.round(d.blastQueryMsMax * 1000) / 1000,
    };
  }
}

const postureCounters = () => Object.fromEntries(Object.keys(BALANCE.movement.actions).map((posture) => [posture, 0])) as Record<Posture, number>;
const groundActions = () => ({ aimTicks: 0, shots: 0, magazinesInserted: 0, stimsCompleted: 0 });
const DIVE_DIRECTIONS = ['forward', 'forward-right', 'right', 'back-right', 'backward', 'back-left', 'left', 'forward-left'] as const;

/** Opt-in simulation counters for movement probes. Sized by the state machine, independent of enemy count. */
export class MovementStats {
  readonly postureTicks = postureCounters();
  readonly damage = postureCounters();
  readonly deaths = postureCounters();
  readonly transitions: Partial<Record<`${Posture}:${Posture}`, number>> = {};
  readonly rejected: Record<PostureCommand, number> = { crouch: 0, dive: 0, stand: 0 };
  readonly dive = { attempts: 0, accepted: 0, completed: 0, collisions: 0, metres: 0, ticks: 0,
    directions: { forward: 0, 'forward-right': 0, right: 0, 'back-right': 0, backward: 0, 'back-left': 0, left: 0, 'forward-left': 0 } };
  readonly getUp = { attempts: 0, accepted: 0, completed: 0, interrupted: 0, ticks: 0 };
  readonly ground = { PRONE: groundActions(), SUPINE: groundActions() };
  droppedCommands = 0;
  movementMs = 0;
  measuredTicks = 0;

  private transition(from: Posture, to: Posture): void {
    if (from === to) return;
    const key = `${from}:${to}` as const;
    this.transitions[key] = (this.transitions[key] ?? 0) + 1;
  }

  input(command: PostureCommand, from: Posture, after: PostureState, acceptedDive: boolean): void {
    this.transition(from, after.current);
    if (from === after.current) this.rejected[command]++;
    if (command === 'dive') {
      this.dive.attempts++;
      if (acceptedDive && after.dive) {
        this.dive.accepted++;
        const { x, z, yaw } = after.dive;
        const heading = Math.atan2(x, -z) - yaw;
        this.dive.directions[DIVE_DIRECTIONS[(Math.round(heading / (Math.PI / 4)) + 8) % 8]]++;
      }
    }
    if (command === 'stand' && (isGroundPosture(from) || from === 'GETTING_UP')) {
      this.getUp.attempts++;
      if (from !== 'GETTING_UP' && after.current === 'GETTING_UP') this.getUp.accepted++;
    }
  }

  advance(from: Posture, started: number, to: Posture, tick: number, dive?: DiveState, hadImpact = false): void {
    this.transition(from, to);
    if (dive?.impact && !hadImpact) this.dive.collisions++;
    if (from === 'DIVING' && isGroundPosture(to) && dive) {
      this.dive.completed++;
      this.dive.metres += diveTravel(dive, tick);
      this.dive.ticks += tick - started;
    }
    if (from === 'GETTING_UP' && to !== from) {
      if (to === 'STANDING') {
        this.getUp.completed++;
        this.getUp.ticks += tick - started;
      } else this.getUp.interrupted++;
    }
  }

  combat(player: SimPlayer, tick: number, shot: boolean, aim: boolean): void {
    const posture = player.posture.current;
    if (!isGroundPosture(posture)) return;
    const counters = this.ground[posture];
    if (aim) counters.aimTicks++;
    if (shot) counters.shots++;
    if (player.reload.phase === 'MAGAZINE_INSERTION' && player.reload.at === tick) counters.magazinesInserted++;
    if (player.equipment.stimResult === 'completed' && player.equipment.stimResultAt === tick) counters.stimsCompleted++;
  }
}
