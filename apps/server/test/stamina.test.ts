import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BALANCE, BASE_LOADOUT, CARRIER_WORLD, NET, PLAYER_MOTION, STANDARD_LOADOUT, UNLOCKS, armorMobility, canSprint, resolveSelection,
} from '@freefall/shared';
import type { LoadoutSelection, PlayerInput, WorldDefinition } from '@freefall/shared';
import { playerSnapshot } from '../src/networking/snapshots.ts';
import { Battlefield } from '../src/simulation/Battlefield.ts';
import type { SimPlayer } from '../src/simulation/Player.ts';

const open: WorldDefinition = { ...CARRIER_WORLD, half: 400, obstacles: [] };
const idle: PlayerInput = { seq: 0, forward: 0, strafe: 0, yaw: 0, pitch: 0, sprint: false, fire: false };
const ARMOR = {
  leicht: 'armor.sr4_scout', mittel: 'armor.standard_carrier', schwer: 'armor.bw9_bulwark', ueberschwer: 'armor.kr12_colossus',
} as const;
const selection = (armorId: string): LoadoutSelection => ({ ...STANDARD_LOADOUT, armorId });

class Field extends Battlefield { constructor() { super(11, open); } }

function operator(armorId: string = ARMOR.mittel): { field: Field; player: SimPlayer; drive: (input: Partial<PlayerInput>, steps?: number) => void } {
  const field = new Field();
  const player = field.addPlayer('p')!;
  assert.equal(field.setLoadout('p', selection(armorId)), undefined);
  Object.assign(player, { x: 0, z: 0, protectedUntil: Infinity });
  let seq = 0;
  const drive = (input: Partial<PlayerInput>, steps = 1) => {
    for (let i = 0; i < steps; i++) {
      field.receiveInput('p', { ...idle, ...input, seq: ++seq, life: player.life });
      field.step();
    }
  };
  return { field, player, drive };
}

/** Steps of continuous sprinting until the operator is exhausted. */
function sprintSteps(armorId: string): number {
  const { player, drive } = operator(armorId);
  let steps = 0;
  while (canSprint(player.staminaState) && steps < 2000) {
    drive({ forward: 1, sprint: true });
    steps++;
  }
  return steps;
}

test('armour scales speed, stamina, dive, slide and standing up along the curve', () => {
  const m = (id: string) => resolveSelection(BALANCE, selection(id)).mobility;
  const light = m(ARMOR.leicht), medium = m(ARMOR.mittel), heavy = m(ARMOR.schwer), colossus = m(ARMOR.ueberschwer);
  assert.equal(medium.walkSpeed, 5.8);
  assert.equal(medium.sprintSpeed, 9.2);
  assert.ok(Math.abs(light.walkSpeed - 6.148) < 1e-9 && Math.abs(light.sprintSpeed - 9.936) < 1e-9);
  assert.ok(Math.abs(heavy.walkSpeed - 5.336) < 1e-9 && Math.abs(heavy.sprintSpeed - 8.28) < 1e-9);
  assert.ok(Math.abs(colossus.walkSpeed - 4.756) < 1e-9 && Math.abs(colossus.sprintSpeed - 6.9) < 1e-9);
  assert.deepEqual([light, medium, heavy, colossus].map((x) => x.stamina.max), [120_000, 100_000, 85_000, 70_000]);
  assert.deepEqual([medium.stamina.sprintDrain, medium.stamina.recovery, medium.stamina.delaySteps], [367, 600, 36]);
  assert.equal(medium.diveDistance, BALANCE.movement.diveDistance);
  assert.ok(Math.abs(heavy.diveDistance - BALANCE.movement.diveDistance * .85) < 1e-9, 'heavy armour dives 85 %');
  assert.equal(colossus.diveDistance, 0, 'no dive in over-heavy armour');
  assert.equal(colossus.canSlide, false);
  assert.equal(heavy.canSlide, true);
  assert.equal(colossus.getUpMultiplier, 1.4);
  // In-between ratings interpolate; a 182-point armour has too little dive left and loses it.
  assert.ok(Math.abs(armorMobility(BALANCE, 75).walkSpeed - 5.8 * 1.03) < 1e-9);
  assert.equal(armorMobility(BALANCE, 175).diveDistance, BALANCE.movement.diveDistance * .425);
  assert.equal(armorMobility(BALANCE, 185).diveDistance, 0);
  // The standard loadout keeps today's slide exactly.
  assert.deepEqual(BASE_LOADOUT.slide, BALANCE.movement.slide);
  assert.deepEqual(UNLOCKS.byId.get('upgrade.kr12-koloss')?.cost, { credits: 8000 });
});

test('sprint lasts about 12, 9, 6.7 and 4.7 seconds and moves at the armour speed', () => {
  const seconds = (id: string) => sprintSteps(id) / NET.tickHz;
  const [light, medium, heavy, colossus] = [ARMOR.leicht, ARMOR.mittel, ARMOR.schwer, ARMOR.ueberschwer].map(seconds);
  assert.ok(Math.abs(light - 12.1) < .15, `leicht ${light}`);
  assert.ok(Math.abs(medium - 9.1) < .15, `mittel ${medium}`);
  assert.ok(Math.abs(heavy - 6.7) < .15, `schwer ${heavy}`);
  assert.ok(Math.abs(colossus - 4.7) < .15, `überschwer ${colossus}`);
  const { player, drive } = operator(ARMOR.schwer);
  drive({ forward: 1, sprint: true }, 30);
  assert.ok(Math.abs(-player.z - 8.28) < .01, `one second of heavy sprint covers 8.28 m (${-player.z})`);
});

test('exhaustion blocks the sprint until 30 % is back, after a short pause', () => {
  const { player, drive } = operator();
  drive({ forward: 1, sprint: true }, sprintSteps(ARMOR.mittel));
  assert.equal(player.staminaState.exhausted, true);
  // Still holding sprint: the operator walks; no stamina is spent, so the pool starts to recover.
  let z = player.z;
  drive({ forward: 1, sprint: true });
  assert.ok(Math.abs(z - player.z - 5.8 / NET.tickHz) < 1e-6, 'exhausted: walk speed');
  // Recovery waits 1.2 s, then 18 points per second; exhaustion ends at 30 points.
  const steps = (target: () => boolean) => { let n = 0; while (!target() && n < 1000) { drive({}); n++; } return n; };
  const resumed = steps(() => !player.staminaState.exhausted);
  assert.ok(Math.abs(resumed / NET.tickHz - (1.2 - 1 / NET.tickHz + 30 / 18)) < .1, `sprint back after ${resumed / NET.tickHz} s`);
  z = player.z;
  drive({ forward: 1, sprint: true });
  assert.ok(Math.abs(z - player.z - 9.2 / NET.tickHz) < 1e-6, 'sprinting again');
  // Lying recovers faster than standing.
  const standing = operator(), lying = operator();
  for (const { player: p, drive: d } of [standing, lying]) d({ forward: 1, sprint: true }, 60);
  lying.player.posture = { ...lying.player.posture, current: 'PRONE', requested: 'PRONE' };
  standing.drive({}, 50);
  lying.drive({}, 50);
  // 1.2 s pause, then 14 steps: 600 vs 750 thousandths per step.
  assert.equal(lying.player.staminaState.value - standing.player.staminaState.value, 14 * 150);
});

test('dives and slides cost stamina, over-heavy armour can do neither and the stim refills the pool', () => {
  const { player, drive } = operator();
  drive({ forward: 1, posture: 'dive' });
  assert.equal(player.posture.current, 'DIVING');
  assert.equal(player.staminaState.value, 100_000 - 20_000);
  // Too little stamina for a dive: the command is ignored.
  const tired = operator();
  tired.player.staminaState.value = 19_000;
  tired.drive({ forward: 1, posture: 'dive' });
  assert.notEqual(tired.player.posture.current, 'DIVING');
  // A slide from a sprint costs 15.
  const runner = operator();
  runner.drive({ forward: 1, sprint: true }, 10);
  const before = runner.player.staminaState.value;
  runner.drive({ forward: 1, sprint: true, posture: 'crouch' });
  assert.equal(runner.player.posture.current, 'SLIDING');
  assert.equal(runner.player.staminaState.value, before - 15_000);
  // Over-heavy: no dive, no slide (its sprint is too slow for a slide anyway and the armour forbids it).
  const colossus = operator(ARMOR.ueberschwer);
  colossus.drive({ forward: 1, posture: 'dive' });
  assert.notEqual(colossus.player.posture.current, 'DIVING');
  colossus.drive({ forward: 1, sprint: true }, 10);
  colossus.drive({ forward: 1, sprint: true, posture: 'crouch' });
  assert.notEqual(colossus.player.posture.current, 'SLIDING');
  // Heavy armour dives 85 % of the distance.
  const heavy = operator(ARMOR.schwer);
  heavy.drive({ forward: 1, posture: 'dive' });
  assert.ok(Math.abs(heavy.player.posture.dive!.distance - BALANCE.movement.diveDistance * .85) < 1e-9);
  // Standing up from prone takes 40 % longer in over-heavy armour.
  colossus.player.posture = { ...colossus.player.posture, current: 'PRONE', requested: 'PRONE', started: 0, until: 0 };
  colossus.drive({ posture: 'stand' });
  assert.equal(colossus.player.posture.current, 'GETTING_UP');
  const { started, until } = colossus.player.posture;
  assert.equal(until - started, Math.ceil(BALANCE.movement.proneGetUpSeconds * 1.4 * NET.tickHz));
  // Healing stim: full pool and no exhaustion.
  const patient = operator();
  patient.drive({ forward: 1, sprint: true }, sprintSteps(ARMOR.mittel));
  patient.player.hp = 50;
  patient.drive({ equipment: 'stim' });
  patient.drive({}, Math.ceil(BALANCE.medical('equipment.medical_stim').applicationSeconds * NET.tickHz) + 2);
  assert.equal(patient.player.staminaState.value, 100_000);
  assert.equal(patient.player.staminaState.exhausted, false);
});

test('snapshots carry stamina only while it is not full and rested; the sprint flag follows exhaustion', () => {
  const { field, player, drive } = operator();
  assert.equal(playerSnapshot(field, 'p').players[0].stamina, undefined);
  drive({ forward: 1, sprint: true }, 5);
  assert.deepEqual(playerSnapshot(field, 'p').players[0].stamina, { value: 100_000 - 5 * 367, rest: 0 });
  drive({ forward: 1, sprint: true }, sprintSteps(ARMOR.mittel));
  const state = playerSnapshot(field, 'p').players[0];
  assert.equal(state.stamina?.exhausted, true);
  assert.equal((state.motion ?? 0) & PLAYER_MOTION.sprint, 0, 'exhausted operators are not shown sprinting');
  assert.ok(player.staminaState.exhausted);
});
