/**
 * Milestone 7.2B: gunplay, tactical reloading, melee, grenades, reduced friendly fire and Albatross resupply.
 * Every value is read from the balance registry; the tests only fix the rules, not duplicate numbers.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BALANCE, BALANCE_SOURCES, BASE_LOADOUT, BOARDING_TICKS, BODENBRUCH, CAMERA_SHOULDER, CARRIER_SHIP, CARRIER_WORLD, FRAG,
  LANDING_STAGE_TICKS, MELEE, NET, SERVICE_PISTOL, TEST_RIFLE, createBalanceRegistry, resolveLoadout, resolveMissionBalance,
} from '@freefall/shared';
import type { CombatEvent, GrenadeState, PlayerInput, WorldDefinition } from '@freefall/shared';
import { HordeManager } from '../src/ecs/HordeManager.ts';
import { UniformGrid } from '../src/ecs/UniformGrid.ts';
import { MissionInstance } from '../src/mission/MissionInstance.ts';
import { validateInput } from '../src/networking/input.ts';
import { playerSnapshot } from '../src/networking/snapshots.ts';
import { Battlefield } from '../src/simulation/Battlefield.ts';
import type { SimPlayer } from '../src/simulation/Player.ts';
import { resolveDamage } from '../src/systems/damage.ts';
import { Grenades, blastDamage, structureBlastDamage } from '../src/systems/grenades.ts';
import { CombatStats } from '../src/systems/telemetry.ts';

const DEG = Math.PI / 180;
const idle: PlayerInput = { seq: 0, forward: 0, strafe: 0, yaw: 0, pitch: 0, sprint: false, fire: false };

/** Battlefield without an encounter: enemies exist only when a test spawns them. */
class Range extends Battlefield {
  constructor(world?: WorldDefinition, seed = 7) { super(seed, world); }
}

const wall: WorldDefinition = {
  ...CARRIER_WORLD, half: 40,
  obstacles: [{ x: 0, z: -2, halfX: 3, halfZ: .2, height: 3, kind: 'barrier' }],
};
const open: WorldDefinition = { ...CARRIER_WORLD, half: 40, obstacles: [] };

/** Sends one input per tick, like a client does, and steps the simulation. */
function driver(field: Battlefield) {
  const seqs = new Map<string, number>();
  return (player: SimPlayer, extra: Partial<PlayerInput> = {}, ticks = 1) => {
    for (let i = 0; i < ticks; i++) {
      const seq = (seqs.get(player.id) ?? 0) + 1;
      seqs.set(player.id, seq);
      field.receiveInput(player.id, { ...idle, seq, ...(extra.equipment ? { life: player.life } : {}), ...extra });
      for (const other of field.players) {
        if (!other || other === player) continue;
        const s = (seqs.get(other.id) ?? 0) + 1;
        seqs.set(other.id, s);
        field.receiveInput(other.id, { ...idle, seq: s, yaw: other.input.yaw });
      }
      field.step();
      if (i === 0) extra = { ...extra, equipment: undefined, reload: undefined };
    }
  };
}

function place(player: SimPlayer, x: number, z: number): void {
  Object.assign(player, { x, z, protectedUntil: 0 });
}

// ---------------------------------------------------------------------------------------------------------------
// 15.1 Weapon balance

test('rifle has 45 rounds and 8 spare magazines, pistol 4 spare magazines and +20 % damage', () => {
  const { primary, secondary } = BASE_LOADOUT.weapons;
  assert.equal(primary.magazineSize, 45);
  assert.equal(primary.reserveMagazines, 8);
  assert.equal(primary.maxReserveMagazines, 8);
  assert.equal(primary.magazineSize * (1 + primary.reserveMagazines), 405);
  assert.equal(secondary.reserveMagazines, 4);
  assert.equal(secondary.magazineSize, 12);
  assert.equal(secondary.damage, 21.6);
  assert.equal(Math.round(secondary.damage / 18 * 1000) / 1000, 1.2);

  // The increased pistol damage is what the server applies to an enemy.
  const field = new Range(open);
  const p = field.addPlayer('a');
  const drive = driver(field);
  place(p, 0, 0);
  drive(p, { equipment: 'secondary' });
  while (p.equipment.action) drive(p);
  const enemy = field.horde.spawn(CAMERA_SHOULDER, -8, 0);
  field.horde.hp[enemy] = 200;
  drive(p, { fire: true, pitch: -.12 });
  assert.equal(field.shots.length, 1);
  assert.equal(field.shots[0].slot, 'secondary');
  assert.ok(Math.abs(field.horde.hp[enemy] - (200 - secondary.damage)) < 1e-4);
});

test('recoil and spread come from the registry and stay server-authoritative', () => {
  const { recoil, spread } = BASE_LOADOUT.weapons.primary.handling;
  assert.ok(Math.abs(recoil.pitchPerShot - TEST_RIFLE.recoil.pitchPerShot * 1.2 * DEG) < 1e-12);
  assert.ok(Math.abs(recoil.yawPerShot - TEST_RIFLE.recoil.yawPerShot * 1.1 * DEG) < 1e-12);
  assert.equal(TEST_RIFLE.recoil.verticalMultiplier, 1.2);
  assert.equal(TEST_RIFLE.recoil.horizontalMultiplier, 1.1);
  assert.ok(spread.aim < spread.hip);
  // A changed data file changes the effective value; nothing is hard-coded.
  const data = structuredClone(BALANCE_SOURCES);
  (data.weapons.weapons[0].recoil as { verticalMultiplier: number }).verticalMultiplier = 2.4;
  const doubled = resolveLoadout(createBalanceRegistry(data)).weapons.primary.handling.recoil;
  assert.ok(Math.abs(doubled.pitchPerShot - recoil.pitchPerShot * 2) < 1e-12);

  // Sustained fire climbs and grows per shot; a pause recovers to the point of aim.
  const field = new Range(open);
  const p = field.addPlayer('a');
  const drive = driver(field);
  place(p, 0, 0);
  const pitches: number[] = [];
  for (let i = 0; i < 60 && pitches.length < 20; i++) {
    drive(p, { fire: true });
    if (field.shots.length) pitches.push(p.recoil.pitch);
  }
  assert.equal(pitches.length, 20);
  assert.ok(pitches[1] - pitches[0] < pitches[12] - pitches[11] + 1e-9, 'later shots kick harder');
  assert.ok(pitches.at(-1)! <= recoil.maxClimb + 1e-9);
  drive(p, {}, 60);
  assert.equal(p.recoil.pitch, 0);
  assert.equal(p.recoil.streak, 0);
});

test('the server controls the fire rate regardless of how often the client sends fire', () => {
  const field = new Range(open);
  const p = field.addPlayer('a');
  const drive = driver(field);
  let shots = 0;
  for (let i = 0; i < NET.tickHz; i++) {
    drive(p, { fire: true });
    shots += field.shots.length;
  }
  assert.equal(shots, Math.ceil(NET.tickHz / BASE_LOADOUT.weapons.primary.fireIntervalTicks));
  assert.equal(shots, TEST_RIFLE.roundsPerSecond);
  // Unknown fields such as a client-side damage value are dropped by validation.
  const parsed = validateInput({ ...idle, seq: 1, damage: 9999, ammo: 999, magazines: 99 }, 0) as unknown as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed).sort(), ['fire', 'forward', 'pitch', 'seq', 'sprint', 'strafe', 'yaw']);
});

test('Kestrel starts recovering on its next regular firing tick and still climbs under held fire', () => {
  const field = new Range(open);
  const operator = field.addPlayer('a');
  const drive = driver(field);
  const { handling, fireIntervalTicks } = operator.loadout.weapons.primary;
  assert.equal(handling.recoil.recoveryDelayTicks, fireIntervalTicks);
  drive(operator, { fire: true });
  const peak = operator.recoil.pitch;
  assert.ok(peak > 0);
  drive(operator, {}, fireIntervalTicks - 1);
  assert.equal(operator.recoil.pitch, peak);
  drive(operator);
  assert.ok(operator.recoil.pitch > 0 && operator.recoil.pitch < peak);
  drive(operator, { fire: true }, fireIntervalTicks * 8);
  assert.ok(operator.recoil.pitch > peak);
});

test('flat-world standing shots replicate the validated shoulder ray and the original muzzle separately', () => {
  const field = new Range(wall);
  const p = field.addPlayer('a');
  place(p, 0, 0);
  driver(field)(p, { fire: true, aim: true });
  const [shot] = field.shots;
  assert.ok(shot.traceFrom);
  assert.ok(Math.abs(shot.traceFrom.x - CAMERA_SHOULDER) < .05);
  assert.ok(Math.abs(shot.traceFrom.z) < .05);
  assert.ok(Math.abs(shot.toZ + 1.8) < 1e-8);
  assert.ok(Math.abs(shot.traceFrom.x - shot.fromX) > .2);
  assert.equal(shot.enemy, 0);
  assert.equal(shot.eliminated, false);

  const closeWall = { ...wall, obstacles: [{ ...wall.obstacles[0], z: -.45, halfZ: .12 }] };
  const blocked = new Range(closeWall);
  const other = blocked.addPlayer('a');
  place(other, 0, 0);
  driver(blocked)(other, { fire: true, aim: true });
  const [stopped] = blocked.shots;
  assert.deepEqual(stopped.traceFrom, { x: stopped.toX, y: stopped.toY, z: stopped.toZ });
});

// ---------------------------------------------------------------------------------------------------------------
// 15.2 Tactical reload

function reloadField() {
  const field = new Range(open);
  const p = field.addPlayer('a');
  return { field, p, drive: driver(field) };
}

test('a reload discards the partial magazine and uses exactly one spare magazine', () => {
  const { field, p, drive } = reloadField();
  p.ammo = 17;
  drive(p, { reload: true });
  assert.equal(p.reload.phase as string, 'RELOAD_START');
  // Duplicate reload requests while reloading do nothing.
  for (let i = 0; i < 5; i++) drive(p, { reload: i % 2 === 0 });
  while (p.reload.phase !== 'READY') drive(p, { reload: true });
  assert.equal(p.ammo, 45);
  assert.equal(p.equipment.magazines.primary, 7);
  assert.equal(field.stats.data.magazinesUsed.primary, 1);
  assert.equal(field.stats.data.roundsDiscarded.primary, 17);
  const snapshot = playerSnapshot(field, p.id).players[0];
  assert.equal(snapshot.ammo, 45);
  assert.equal(snapshot.equipment?.magazines.primary, 7);
});

test('full magazines and empty reserves cannot be reloaded, an empty magazine can', () => {
  const { p, drive } = reloadField();
  drive(p, { reload: true });
  assert.equal(p.reload.phase, 'READY');
  assert.equal(p.equipment.magazines.primary, 8);
  p.ammo = 3;
  p.equipment.magazines.primary = 0;
  drive(p, { reload: true });
  drive(p, { fire: true }, 3);
  assert.equal(p.reload.phase, 'READY');
  p.ammo = 0;
  p.equipment.magazines.primary = 2;
  drive(p, { fire: true });
  assert.equal(p.reload.phase, 'RELOAD_START', 'held fire on an empty magazine starts a reload');
  while (p.reload.phase !== 'READY') drive(p);
  assert.equal(p.ammo, 45);
  assert.equal(p.equipment.magazines.primary, 1);
});

test('interruptions before the insertion keep the ammunition, after it no second transaction happens', () => {
  for (const interrupt of ['secondary', 'grenade', 'melee'] as const) {
    const { p, drive } = reloadField();
    p.ammo = 10;
    drive(p, { reload: true });
    drive(p, {}, 5);
    drive(p, { equipment: interrupt });
    assert.equal(p.reload.phase, 'RELOAD_INTERRUPTED', interrupt);
    while (p.equipment.action) drive(p);
    assert.equal(p.equipment.magazines.primary, 8, interrupt);
    assert.equal(interrupt === 'secondary' ? p.equipment.inactiveAmmo : p.ammo, 10, interrupt);
  }
  const { field, p, drive } = reloadField();
  p.ammo = 10;
  drive(p, { reload: true });
  while (p.reload.phase !== 'MAGAZINE_INSERTION') drive(p);
  drive(p, { equipment: 'secondary' });
  while (p.equipment.action) drive(p);
  assert.equal(p.equipment.inactiveAmmo, 45);
  assert.equal(p.equipment.magazines.primary, 7);
  assert.equal(field.stats.data.magazinesUsed.primary, 1);
});

test('switching weapons and reloading in the same input never duplicates ammunition', () => {
  const { p, drive } = reloadField();
  p.ammo = 20;
  drive(p, { reload: true, equipment: 'secondary', fire: true });
  while (p.equipment.action || p.reload.phase !== 'READY' && p.reload.phase !== 'RELOAD_INTERRUPTED') drive(p);
  const total = () => p.ammo + p.equipment.inactiveAmmo + p.equipment.magazines.primary * 45 + p.equipment.magazines.secondary * 12;
  assert.equal(total(), 20 + 12 + 8 * 45 + 4 * 12);
  for (let i = 0; i < 6; i++) drive(p, { equipment: i % 2 ? 'secondary' : 'primary', reload: true });
  while (p.equipment.action || (p.reload.phase !== 'READY' && p.reload.phase !== 'RELOAD_INTERRUPTED')) drive(p);
  assert.ok(total() <= 20 + 12 + 8 * 45 + 4 * 12);
});

test('death during a reload leaves the magazine counts untouched', () => {
  const { field, p, drive } = reloadField();
  p.ammo = 4;
  drive(p, { reload: true });
  drive(p, {}, 3);
  p.protectedUntil = 0;
  p.hp = 1;
  field.horde.spawn(p.x, p.z - .5, 0);
  for (let i = 0; i < 80 && p.hp > 0; i++) drive(p);
  assert.equal(p.hp, 0);
  assert.equal(p.reload.phase, 'RELOAD_INTERRUPTED');
  assert.equal(p.equipment.magazines.primary, 8);
  assert.equal(p.ammo, 4);
});

// ---------------------------------------------------------------------------------------------------------------
// 15.3 Grenades

const grenade = BASE_LOADOUT.grenade;
const at = (x: number, z: number): GrenadeState => ({ id: 1, x, y: .09, z, detonates: 0 });

test('grenade damage, radius and falloff use the central configuration', () => {
  assert.equal(grenade.baseDamage, 110 * 1.5);
  assert.equal(grenade.blastRadius, 7 * 1.5);
  const center = blastDamage(at(0, 0), 0, .5, 0, open, grenade);
  const near = blastDamage(at(0, 0), 3, .5, 0, open, grenade);
  const far = blastDamage(at(0, 0), 9, .5, 0, open, grenade);
  assert.ok(center > near && near > far && far > 0);
  assert.equal(blastDamage(at(0, 0), grenade.blastRadius, .5, 0, open, grenade), 0);
  assert.equal(blastDamage(at(0, 0), 0, .5, -4, wall, grenade), 0, 'a solid wall blocks the blast');
});

test('grenades damage and destroy swarm nests on Normal in two to four well placed throws', () => {
  const nestHp = resolveMissionBalance(BALANCE, 'normal').nest.maxHealth;
  const policy = BASE_LOADOUT.damagePolicy;
  const multiplier = FRAG.structureDamageMultipliers['structure.swarm_nest'];
  assert.equal(multiplier, 2);
  const direct = structureBlastDamage(at(0, 0), 'structure.swarm_nest', 0, 0, open, grenade, policy)!;
  assert.equal(direct, Math.round(blastDamage(at(0, 0), 0, .5, 0, open, grenade) * multiplier));
  const edge = structureBlastDamage(at(4, 0), 'structure.swarm_nest', 0, 0, open, grenade, policy)!;
  const outside = structureBlastDamage(at(6, 0), 'structure.swarm_nest', 0, 0, open, grenade, policy)!;
  const throws = (damage: number) => Math.ceil(nestHp / damage);
  assert.ok(throws(direct) >= 2 && throws(direct) <= 4, `direct ${throws(direct)}`);
  assert.ok(throws(edge) >= 2 && throws(edge) <= 4, `edge ${throws(edge)}`);
  assert.ok(throws(outside) <= 4, `outside ${throws(outside)}`);
});

test('grenades destroy a nest in a mission and the destroyed nest stops spawning', () => {
  const { mission, player } = deployed();
  const nest = [...mission.director.nests.active.values()].find(({ state }) => state !== 'EMERGING')!;
  const hp = nest.hp;
  player.equipment.grenades = 0;
  let thrown = 0;
  while (mission.director.nests.active.has(nest.id) && thrown < 4) {
    mission.grenades.launch({ ...player, x: nest.x, z: nest.z, pitch: -1.5, yaw: 0 } as SimPlayer, mission.tick);
    thrown++;
    for (let i = 0; i < grenade.fuseTicks + 2; i++) mission.step();
  }
  assert.ok(!mission.director.nests.active.has(nest.id), `nest with ${hp} hp survived ${thrown} grenades`);
  assert.ok(thrown >= 2 && thrown <= 4);
  assert.ok(mission.stats.data.grenadeDamageNests >= hp);
  const spawnedAt = mission.snapshot().nests.find(({ id }) => id === nest.id)!.lastSpawnAt;
  for (let i = 0; i < NET.tickHz * 12; i++) mission.step();
  assert.equal(mission.snapshot().nests.find(({ id }) => id === nest.id)?.lastSpawnAt ?? spawnedAt, spawnedAt);
});

test('grenade blasts respect friendly fire and self damage, and only query cells inside the radius', () => {
  const field = new Range(open);
  const [a, b] = [field.addPlayer('a'), field.addPlayer('b')];
  place(a, 0, 0);
  place(b, 2, 0);
  // 1,000 static enemies (no simulation step moves them); the ones outside the radius must stay untouched.
  const horde = new HordeManager();
  for (let i = 0; i < 1000; i++) horde.spawn(-35 + (i % 40) * 1.8, -35 + Math.floor(i / 40) * 2.8, 0);
  for (let i = 0; i < horde.count; i++) horde.hp[horde.active[i]] = 1000;
  const grid = new UniformGrid(open.half);
  const grenades = new Grenades();
  const stats = new CombatStats();
  const events: CombatEvent[] = [];
  grenades.launch({ ...a, pitch: -1.5 } as SimPlayer, 0, { stats });
  let blast: GrenadeState | undefined;
  for (let tick = 1; tick <= grenade.fuseTicks + 1; tick++) {
    grenades.update(tick, horde, grid, open, field.players, (g) => { blast = { ...g }; }, { stats, events, respawns: false });
  }
  assert.ok(blast);
  let inside = 0;
  for (let n = 0; n < horde.count; n++) {
    const i = horde.active[n];
    const distance = Math.hypot(horde.x[i] - blast.x, .5 - blast.y, horde.z[i] - blast.z);
    if (distance >= grenade.blastRadius) assert.equal(horde.hp[i], 1000);
    else if (horde.hp[i] < 1000) inside++;
  }
  assert.ok(inside > 10, `${inside} enemies inside`);
  const policy = BASE_LOADOUT.damagePolicy;
  assert.ok(stats.data.selfDamage > 0 && stats.data.friendlyFireDamage.explosion > 0);
  assert.equal(stats.data.blasts, 1);
  assert.equal(stats.data.grenadesThrown, 1);
  assert.ok(100 - a.hp <= Math.round(grenade.baseDamage * policy.selfDamage));
  assert.ok(100 - b.hp <= Math.round(grenade.baseDamage * policy.operatorToOperator));
  assert.ok(events.some((event) => event.type === 'friendly-fire' && event.self && event.target === 'a'));
  assert.ok(events.some((event) => event.type === 'blast'));
});

// ---------------------------------------------------------------------------------------------------------------
// 15.4 Melee

function meleeField(world = open) {
  const field = new Range(world);
  const p = field.addPlayer('a');
  place(p, 0, 0);
  return { field, p, drive: driver(field) };
}

test('melee hits one target in front within range, for the configured damage', () => {
  assert.equal(MELEE.damage, 50);
  assert.equal(MELEE.range, 2);
  assert.equal(MELEE.cooldownSeconds, .8);
  assert.equal(MELEE.staggerSeconds, .4);
  const { field, p, drive } = meleeField();
  const front = field.horde.spawn(0, -1.8, 0);
  const second = field.horde.spawn(.5, -1.9, 0);
  for (const i of [front, second]) field.horde.hp[i] = 500;
  drive(p, { equipment: 'melee' });
  while (p.equipment.action) drive(p);
  const hurt = [front, second].filter((i) => field.horde.hp[i] < 500);
  assert.equal(hurt.length, 1, 'single primary target');
  assert.equal(field.horde.hp[hurt[0]], 500 - MELEE.damage);
  assert.equal(field.stats.data.meleeHits, 1);
});

test('melee misses targets behind, out of range or behind cover', () => {
  for (const [world, x, z] of [[open, 0, 2], [open, 0, -3.6], [wall, 0, -2.6]] as const) {
    const { field, p, drive } = meleeField(world);
    const enemy = field.horde.spawn(x, z, 0);
    field.horde.hp[enemy] = 500;
    field.horde.x[enemy] = x;
    drive(p, { equipment: 'melee' });
    assert.equal(field.horde.hp[enemy], 500, `x ${x} z ${z}`);
    while (p.equipment.action) drive(p);
    assert.equal(field.horde.hp[enemy], 500, `x ${x} z ${z}`);
  }
});

test('melee cooldown, stagger, bounded knockback and stun-lock immunity', () => {
  const { field, p, drive } = meleeField();
  const enemy = field.horde.spawn(0, -1.6, 0);
  field.horde.hp[enemy] = 1000;
  drive(p, { equipment: 'melee' });
  while (!field.stats.data.staggers) drive(p);
  const before = field.horde.z[enemy];
  while (p.equipment.action) drive(p);
  const staggeredUntil = field.stagger.active(field.horde, enemy);
  assert.ok(staggeredUntil > field.tick, 'enemy is staggered');
  assert.equal(field.stats.data.staggers, 1);
  // No attacks while staggered.
  assert.ok(field.horde.attackAt[enemy] >= staggeredUntil);
  // Cooldown: a second strike right after the first is ignored.
  drive(p, { equipment: 'melee' });
  assert.equal(p.equipment.action, undefined);
  while (field.tick < staggeredUntil + 1) drive(p);
  const pushed = before - field.horde.z[enemy];
  assert.ok(pushed > .3 && pushed <= MELEE.knockbackDistance + .05, `knockback ${pushed}`);
  assert.equal(field.stagger.active(field.horde, enemy), 0, 'stagger ends on its own');
  // Within the immunity window the next strike damages but does not stagger again.
  while (field.tick < p.equipment.meleeReadyAt) drive(p);
  Object.assign(p, { z: field.horde.z[enemy] + 1.4, x: field.horde.x[enemy] });
  drive(p, { equipment: 'melee' });
  while (p.equipment.action) drive(p);
  assert.equal(field.stats.data.meleeHits, 2);
  assert.equal(field.stats.data.staggers, 1);
});

test('knockback never pushes an enemy through a wall', () => {
  const { field, p, drive } = meleeField(wall);
  place(p, 0, -.6);
  const enemy = field.horde.spawn(0, -1.4, 0);
  field.horde.hp[enemy] = 1000;
  drive(p, { equipment: 'melee' });
  while (p.equipment.action) drive(p);
  drive(p, {}, MELEE.staggerSeconds * NET.tickHz + 2);
  assert.ok(field.horde.z[enemy] > -2 + .2, `enemy at ${field.horde.z[enemy]}`);
});

// ---------------------------------------------------------------------------------------------------------------
// 15.5 Friendly fire

test('the damage resolver applies the friendly-fire multiplier exactly once and in order', () => {
  const policy = BASE_LOADOUT.damagePolicy;
  assert.equal(policy.operatorToOperator, .3);
  assert.equal(policy.selfDamage, .3);
  assert.deepEqual(resolveDamage(policy, { source: 'explosion', attacker: 'operator', target: 'operator', base: 100 }),
    { amount: 30, relation: 'friendly', multiplier: .3 });
  assert.equal(resolveDamage(policy, { source: 'explosion', attacker: 'operator', target: 'operator', self: true, base: 100 }).amount, 30);
  assert.equal(resolveDamage(policy, { source: 'bullet', attacker: 'operator', target: 'enemy', base: 24 }).amount, 24);
  assert.equal(resolveDamage(policy, { source: 'explosion', attacker: 'operator', target: 'structure', base: 100, structureMultiplier: 2 }).amount, 200);
  assert.equal(resolveDamage(policy, { source: 'bullet', attacker: 'enemy', target: 'operator', base: 8 }).amount, 8);
  assert.equal(resolveDamage(policy, { source: 'melee', attacker: 'operator', target: 'convict', base: 50 }).amount, 15);
});

test('operators hurt each other with reduced bullet and melee damage', () => {
  const field = new Range(open);
  const [a, b] = [field.addPlayer('a'), field.addPlayer('b')];
  const drive = driver(field);
  place(a, 0, 0);
  place(b, CAMERA_SHOULDER, -6);
  drive(a, { fire: true, pitch: -.1 });
  assert.equal(field.shots[0].ally, 'b');
  const bullet = Math.round(TEST_RIFLE.damage * .3);
  assert.equal(b.hp, 100 - bullet);
  assert.equal(field.stats.data.friendlyFireDamage.bullet, bullet);
  assert.ok(field.combatEvents.some((event) => event.type === 'friendly-fire' && event.target === 'b' && event.amount === bullet));
  place(b, 0, -1.2);
  drive(a, {}, 4);
  drive(a, { equipment: 'melee' });
  while (a.equipment.action) drive(a);
  assert.equal(b.hp, 100 - bullet - Math.round(MELEE.damage * .3));
});

// ---------------------------------------------------------------------------------------------------------------
// 15.6 Resupply

function deployed(count = 1) {
  const mission = new MissionInstance(51296, BODENBRUCH);
  const players = Array.from({ length: count }, (_, index) => mission.addPlayer(index ? String(index) : 'host'));
  Object.assign(players[0], { x: 0, z: 3 });
  assert.ok(mission.select('host', { planetId: 'dev-ault', missionId: BODENBRUCH.id, difficultyId: 'normal' }));
  assert.ok(mission.start('host'));
  for (const member of players) {
    Object.assign(member, { ...CARRIER_SHIP, x: member.slot % 2 ? 1 : -1 });
    assert.ok(mission.action(member.id, 'ready'));
  }
  for (let i = 0; i < BOARDING_TICKS + LANDING_STAGE_TICKS + 1; i++) mission.step();
  assert.equal(mission.state, 'ACTIVE_MISSION');
  for (const member of players) member.protectedUntil = Infinity;
  return { mission, player: players[0], players };
}

function atContainer(mission: MissionInstance, player: SimPlayer, side: 'left' | 'right', offset = 0): void {
  const ship = mission.snapshot().albatross!;
  Object.assign(player, { x: ship.x + (side === 'left' ? -4.1 : 4.1), z: ship.z + offset });
}

test('two shared containers exist at the Albatross with the configured charges', () => {
  const { mission } = deployed();
  const supply = mission.snapshot().albatross!.supply!;
  assert.equal(supply.length, 2);
  assert.deepEqual(supply.map(({ side }) => side).sort(), ['left', 'right']);
  for (const container of supply) {
    assert.equal(container.charges, 4);
    assert.equal(container.maxCharges, BALANCE.vehicle('vehicle.albatross_02').supplyContainers.find(({ id }) => id === container.id)!.charges);
    assert.equal(container.state, 'READY');
  }
});

test('resupply refills magazines, grenades and stims up to capacity and only charges when something is added', () => {
  const { mission, player } = deployed();
  const drive = driver(mission);
  atContainer(mission, player, 'left');
  // Fully supplied: no charge is used and the operator gets feedback.
  assert.equal(mission.interact(player.id), false);
  assert.deepEqual(mission.drainFeedback(), [{ id: player.id, code: 'resupply-full' }]);
  player.equipment.magazines.primary = 7;
  player.equipment.magazines.secondary = 1;
  player.equipment.grenades = 0;
  player.equipment.stims = 4;
  for (let i = 0; i < 8; i++) drive(player);
  assert.equal(mission.interact(player.id), true);
  drive(player);
  assert.equal(player.equipment.action, 'resupply');
  while (player.equipment.action) drive(player);
  assert.deepEqual(player.equipment.magazines, { primary: 8, secondary: 2 });
  assert.equal(player.equipment.grenades, 1);
  assert.equal(player.equipment.stims, 5);
  const left = mission.snapshot().albatross!.supply!.find(({ side }) => side === 'left')!;
  assert.equal(left.charges, 3);
  assert.deepEqual(mission.stats.data.refilled, { primaryMagazines: 1, secondaryMagazines: 1, grenades: 1, stims: 1 });
});

test('simultaneous use of the last charge grants it exactly once', () => {
  const { mission, players } = deployed(4);
  const drive = driver(mission);
  const supply = (mission as unknown as { supply: { containers: { side: string; charges: number }[] } }).supply;
  supply.containers.find(({ side }) => side === 'right')!.charges = 1;
  players.forEach((p, i) => {
    atContainer(mission, p, 'right', (i - 1.5) * .5);
    p.equipment.magazines.primary = 0;
  });
  for (let i = 0; i < 8; i++) drive(players[0]);
  for (const p of players) assert.equal(mission.interact(p.id), true);
  drive(players[0]);
  for (let i = 0; i < 40; i++) {
    for (const p of players) mission.receiveInput(p.id, { ...idle, seq: p.input.seq + 1 });
    mission.step();
  }
  const refilled = players.filter((p) => p.equipment.magazines.primary > 0);
  assert.equal(refilled.length, 1);
  assert.equal(refilled[0].equipment.magazines.primary, 2);
  assert.equal(supply.containers.find(({ side }) => side === 'right')!.charges, 0);
  assert.equal(mission.snapshot().albatross!.supply!.find(({ side }) => side === 'right')!.state, 'EMPTY');
  // Repeated requests on an empty container are rejected with feedback and never go negative.
  mission.drainFeedback();
  for (let i = 0; i < 8; i++) drive(players[1]);
  assert.equal(mission.interact(players[1].id), false);
  assert.deepEqual(mission.drainFeedback(), [{ id: players[1].id, code: 'resupply-empty' }]);
});

test('out of range, destroyed containers and a destroyed Albatross block resupply, a disabled one does not', () => {
  const { mission, player } = deployed();
  const drive = driver(mission);
  player.equipment.stims = 0;
  const ship = mission.snapshot().albatross!;
  // Inside the hull, right behind the container wall, does not count.
  Object.assign(player, { x: ship.x - 2, z: ship.z });
  assert.equal(mission.interact(player.id), false);
  for (let i = 0; i < 8; i++) drive(player);
  assert.ok(mission.debug(player.id, 'damage-thruster'));
  assert.ok(mission.debug(player.id, 'damage-thruster'));
  assert.ok(mission.debug(player.id, 'damage-thruster'));
  assert.ok(mission.debug(player.id, 'damage-thruster'));
  assert.equal(mission.snapshot().albatross!.lifecycleState, 'DISABLED');
  atContainer(mission, player, 'left');
  assert.equal(mission.interact(player.id), true, 'a grounded Albatross still supplies');
  while (player.equipment.action || player.pendingResupply) drive(player);
  assert.equal(player.equipment.stims, 2);
  for (let i = 0; i < 8; i++) drive(player);
  assert.ok(mission.debug(player.id, 'destroy-supply'));
  assert.equal(mission.snapshot().albatross!.supply!.find(({ side }) => side === 'left')!.state, 'DESTROYED');
  assert.equal(mission.interact(player.id), false);
  assert.equal(mission.drainFeedback()[0].code, 'resupply-destroyed');
  atContainer(mission, player, 'right');
  for (let i = 0; i < 8; i++) drive(player);
  assert.ok(mission.debug(player.id, 'destroy-albatross'));
  assert.equal(mission.snapshot().albatross!.supply!.find(({ side }) => side === 'right')!.state, 'OFFLINE');
  assert.equal(mission.interact(player.id), false);
});

test('leaving the container or firing cancels the interaction without a transaction', () => {
  const { mission, player } = deployed();
  const drive = driver(mission);
  atContainer(mission, player, 'left');
  player.equipment.grenades = 0;
  for (let i = 0; i < 8; i++) drive(player);
  assert.ok(mission.interact(player.id));
  drive(player, {}, 5);
  drive(player, { fire: true });
  assert.equal(player.equipment.action, undefined);
  assert.equal(player.equipment.grenades, 0);
  assert.equal(mission.snapshot().albatross!.supply!.find(({ side }) => side === 'left')!.charges, 4);
});

// ---------------------------------------------------------------------------------------------------------------
// 15.7 Multiplayer consistency

test('four operators reload, throw and strike at once without duplicating anything', () => {
  const field = new Range(open);
  const players = ['a', 'b', 'c', 'd'].map((id) => field.addPlayer(id));
  players.forEach((p, i) => { place(p, i * 6 - 9, 0); p.ammo = 5 + i; });
  for (let i = 0; i < 4; i++) {
    const enemy = field.horde.spawn(i * 6 - 9, -1.6, 0);
    field.horde.hp[enemy] = 1000;
  }
  const seq = new Map(players.map((p) => [p.id, 0]));
  const send = (p: SimPlayer, extra: Partial<PlayerInput>) => {
    seq.set(p.id, seq.get(p.id)! + 1);
    field.receiveInput(p.id, { ...idle, seq: seq.get(p.id)!, life: p.life, ...extra });
  };
  for (const p of players) send(p, { reload: true });
  field.step();
  for (const p of players) assert.equal(p.reload.phase, 'RELOAD_START');
  for (let i = 0; i < 90; i++) {
    for (const p of players) send(p, { reload: i % 3 === 0 });
    field.step();
  }
  for (const p of players) {
    assert.equal(p.ammo, 45);
    assert.equal(p.equipment.magazines.primary, 7);
  }
  assert.equal(field.stats.data.magazinesUsed.primary, 4);
  for (const p of players) send(p, { equipment: 'melee' });
  field.step();
  for (let i = 0; i < 30; i++) { for (const p of players) send(p, {}); field.step(); }
  assert.equal(field.stats.data.meleeHits, 4);
});

test('reconnect during a reload and after a resupply keeps consistent ammunition and grants nothing twice', () => {
  const { mission, player } = deployed(2);
  const drive = driver(mission);
  player.ammo = 9;
  drive(player, { reload: true });
  drive(player, {}, 4);
  mission.disconnect(player.id);
  for (let i = 0; i < 90; i++) mission.step();
  mission.reconnect(player.id);
  // The server finishes or interrupts the reload on its own clock; either way exactly one transaction at most.
  const used = 8 - player.equipment.magazines.primary;
  assert.ok(used === 0 || used === 1);
  assert.equal(player.ammo, used ? 45 : 9);
  assert.ok(player.reload.phase === 'READY' || player.reload.phase === 'RELOAD_INTERRUPTED');

  atContainer(mission, player, 'left');
  player.equipment.stims = 3;
  for (let i = 0; i < 8; i++) drive(player);
  assert.ok(mission.interact(player.id));
  while (player.pendingResupply || player.equipment.action) drive(player);
  assert.equal(player.equipment.stims, 5);
  const charges = mission.snapshot().albatross!.supply!.find(({ side }) => side === 'left')!.charges;
  mission.disconnect(player.id);
  mission.step();
  mission.reconnect(player.id);
  for (let i = 0; i < 8; i++) drive(player);
  assert.equal(mission.interact(player.id), false, 'fully supplied after reconnect');
  assert.equal(mission.snapshot().albatross!.supply!.find(({ side }) => side === 'left')!.charges, charges);
  assert.equal(player.equipment.stims, 5);
});

test('a disconnect during the resupply interaction cancels it without a transaction', () => {
  const { mission, player } = deployed();
  const drive = driver(mission);
  atContainer(mission, player, 'right');
  player.equipment.grenades = 0;
  for (let i = 0; i < 8; i++) drive(player);
  assert.ok(mission.interact(player.id));
  drive(player, {}, 3);
  assert.equal(player.equipment.action, 'resupply');
  mission.disconnect(player.id);
  for (let i = 0; i < 60; i++) mission.step();
  mission.reconnect(player.id);
  assert.equal(player.equipment.grenades, 0);
  assert.equal(mission.snapshot().albatross!.supply!.find(({ side }) => side === 'right')!.charges, 4);
});
