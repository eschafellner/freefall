/**
 * Milestone 8.0A: calibers, ammunition types and armor classes as the base of the damage system.
 * Rules only; balance values are read from `ammunition.json` and the weapon/enemy definitions.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARMOR, ARMOR_CLASS_COUNT, BALANCE, BALANCE_SOURCES, BASE_LOADOUT, CAMERA_SHOULDER, CARRIER_WORLD, ENEMY_PROTECTION, FRAG, MELEE,
  BalanceResolutionError, BalanceValidationError, armorMultiplier, createBalanceRegistry, explainBalance, falloffMultiplier,
  penetrates, resolveLoadout, resolveWeapon,
} from '@freefall/shared';
import type { BalanceRegistry, PlayerInput, WorldDefinition } from '@freefall/shared';
import { Battlefield } from '../src/simulation/Battlefield.ts';
import type { SimPlayer } from '../src/simulation/Player.ts';
import { resolveDamage } from '../src/systems/damage.ts';

type Sources = typeof BALANCE_SOURCES;
const sources = (): Sources => structuredClone(BALANCE_SOURCES);
const policy = BASE_LOADOUT.damagePolicy;

function rejects(change: (data: Sources) => void, pattern: RegExp): void {
  const data = sources();
  change(data);
  assert.throws(() => createBalanceRegistry(data), (error: unknown) => {
    assert.ok(error instanceof BalanceValidationError || error instanceof BalanceResolutionError, String(error));
    assert.match(error.message, pattern);
    return true;
  });
}

/** Teilmantel for 5,55 as a test-only ammunition type. */
function withSoftPoint(data: Sources): Sources {
  (data.ammunition.ammunition as unknown[]).push({
    id: 'ammo.5-55x39.sp', caliberId: 'caliber.5-55x39', displayName: 'Teilmantel', shortName: 'TM', damageType: 'kinetic',
    modifiers: [
      { stat: 'damage', operation: 'multiply', value: 1.15 },
      { stat: 'penetration', operation: 'add', value: -1 },
      { stat: 'recoilPitch', operation: 'multiply', value: 1.1 },
    ],
  });
  return data;
}

test('calibers, ammunition and seven armor classes are registered; existing weapons keep their values', () => {
  assert.equal(ARMOR_CLASS_COUNT, 7);
  assert.deepEqual(ARMOR.classes.map((entry) => entry.level), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(ARMOR.nonPenetratingDamageFraction, .1);
  assert.equal(BALANCE.calibers.size, 7);
  for (const caliber of BALANCE.calibers.values()) assert.ok(BALANCE.ammoForCaliber(caliber.id).length >= 1, caliber.id);

  const { primary, secondary } = BASE_LOADOUT.weapons;
  assert.equal(primary.caliber.id, 'caliber.5-55x39');
  assert.equal(primary.ammo.id, 'ammo.5-55x39.fmj');
  assert.equal(primary.damage, 24);
  assert.equal(primary.projectile.penetration, 2); // 8.2C: 3 → 2
  assert.equal(secondary.caliber.id, 'caliber.10mm');
  assert.equal(secondary.damage, 21.6);
  assert.equal(secondary.projectile.penetration, 2);
  // Falloff is part of the pipeline but starts beyond the current effective ranges (no balance change in 8.0A).
  assert.ok(primary.projectile.falloff.startMeters > primary.effectiveRange);
  assert.ok(secondary.projectile.falloff.startMeters > secondary.effectiveRange);

  assert.deepEqual(ENEMY_PROTECTION[0], { armorClass: 1, resistances: { kinetic: 1, explosive: 1 } });
  assert.equal(BALANCE.primaryNest.armorClass, 1);
  assert.equal(MELEE.penetration, 1);
  assert.equal(FRAG.penetration, 4);
  assert.equal(BALANCE.convicts.squad.penetration, 3);
});

test('penetration ≥ armor class deals full damage, anything lower only the residual 10 %', () => {
  for (let armorClass = 1; armorClass <= ARMOR_CLASS_COUNT; armorClass++) {
    for (let penetration = 1; penetration <= ARMOR_CLASS_COUNT; penetration++) {
      assert.equal(penetrates(penetration, armorClass), penetration >= armorClass);
      assert.equal(armorMultiplier(penetration, armorClass, .1), penetration >= armorClass ? 1 : .1);
    }
  }
  // Class 2 (light) needs at least "Niedrig", class 3 (medium) at least "Mittel".
  assert.equal(ARMOR.classes[1].penetrationName, 'Niedrig');
  assert.equal(ARMOR.classes[2].penetrationName, 'Mittel');
  const hit = (penetration: number, armorClass: number) => resolveDamage(policy, {
    source: 'bullet', attacker: 'operator', target: 'enemy', base: 24,
    armor: { armorClass, penetration, nonPenetratingFraction: ARMOR.nonPenetratingDamageFraction },
  });
  assert.deepEqual([hit(1, 2).amount, hit(1, 2).penetrated], [2.4000000000000004, false]);
  assert.deepEqual([hit(2, 2).amount, hit(2, 2).penetrated], [24, true]);
  assert.equal(hit(2, 3).amount, 2.4000000000000004);
  assert.equal(hit(3, 3).amount, 24);
});

test('falloff is linear between start and end and constant beyond', () => {
  const falloff = { startMeters: 10, endMeters: 30, minMultiplier: .5 };
  assert.equal(falloffMultiplier(0, falloff), 1);
  assert.equal(falloffMultiplier(10, falloff), 1);
  assert.equal(falloffMultiplier(20, falloff), .75);
  assert.equal(falloffMultiplier(30, falloff), .5);
  assert.equal(falloffMultiplier(500, falloff), .5);
});

test('the damage resolver applies falloff, structure, armor, resistance and relation once each, in order', () => {
  const armor = { armorClass: 2, penetration: 1, nonPenetratingFraction: .1 };
  // 100 × falloff .5 × armor .1 × resistance 2 = 10, hostile, fractional for enemies.
  assert.ok(Math.abs(resolveDamage(policy, { source: 'bullet', attacker: 'operator', target: 'enemy', base: 100,
    falloffMultiplier: .5, armor, resistanceMultiplier: 2 }).amount - 10) < 1e-9);
  // Structures round to whole hit points and keep at least 1.
  assert.equal(resolveDamage(policy, { source: 'explosion', attacker: 'operator', target: 'structure', base: 7,
    structureMultiplier: 1, armor }).amount, 1);
  // Friendly fire keeps its multiplier on top of falloff.
  assert.equal(resolveDamage(policy, { source: 'bullet', attacker: 'operator', target: 'operator', base: 100,
    falloffMultiplier: .5 }).amount, 15);
});

test('ammunition modifies weapon values on its own layer before equipment, and weapons scale their ammunition', () => {
  const registry = createBalanceRegistry(withSoftPoint(sources()));
  const loadout = resolveLoadout(registry, undefined,
    [{ source: 'attachment:test', layer: 'equipment', stat: 'weapon.kestrel-ar-01.damage', operation: 'multiply', value: 2 }],
    [], { primary: 'ammo.5-55x39.sp' });
  const rifle = loadout.weapons.primary;
  assert.equal(rifle.ammo.shortName, 'TM');
  assert.ok(Math.abs(rifle.damage - 24 * 1.15 * 2) < 1e-9);
  assert.equal(rifle.projectile.penetration, 1);
  assert.ok(Math.abs(rifle.handling.recoil.pitchPerShot - BASE_LOADOUT.weapons.primary.handling.recoil.pitchPerShot * 1.1) < 1e-12);
  assert.deepEqual(loadout.trace['weapon.kestrel-ar-01.damage'].applied, ['× 1.15 (ammo:ammo.5-55x39.sp)', '× 2 (attachment:test)']);
  assert.ok(explainBalance(loadout.trace).some((line) => line.startsWith('weapon.kestrel-ar-01.penetration: 2 → 1')));
  // Without a selection the default ammunition is loaded.
  assert.equal(resolveLoadout(registry).weapons.primary.damage, 24);
  assert.throws(() => resolveLoadout(registry, undefined, [], [], { secondary: 'ammo.5-55x39.sp' }), /p-01 verschießt caliber\.10mm/);

  // A longer barrel (velocity) carries the caliber falloff further.
  const data = sources();
  (data.weapons.weapons[0].ballistics as { velocityMultiplier: number; damageMultiplier: number }).velocityMultiplier = 1.25;
  (data.weapons.weapons[0].ballistics as { velocityMultiplier: number; damageMultiplier: number }).damageMultiplier = 1.1;
  const barrel = resolveWeapon(createBalanceRegistry(data), 'kestrel-ar-01');
  assert.equal(barrel.projectile.muzzleVelocity, 900 * 1.25);
  assert.equal(barrel.projectile.falloff.startMeters, 80 * 1.25);
  assert.ok(Math.abs(barrel.damage - 24 * 1.1) < 1e-9);
});

test('broken caliber and ammunition data is rejected with located messages', () => {
  rejects((d) => { (d.weapons.weapons[0] as { defaultAmmoId: string }).defaultAmmoId = 'ammo.10mm.fmj'; },
    /weapons\[0\]\.defaultAmmoId: "ammo\.10mm\.fmj" ist Munition für caliber\.10mm, die Waffe verschießt caliber\.5-55x39/);
  rejects((d) => { (d.weapons.weapons[0] as { caliberId: string }).caliberId = 'caliber.9mm'; }, /caliberId: verweist auf unbekannte Kaliber-ID "caliber\.9mm"/);
  rejects((d) => { (d.ammunition.armor.classes as unknown[]).pop(); }, /genau 7 Panzerklassen/);
  rejects((d) => { (d.enemies.archetypes[0] as { armorClass: number }).armorClass = 8; }, /archetypes\[0\]\.armorClass: muss ≤ 7 sein/);
  rejects((d) => { (d.ammunition.ammunition[0] as { caliberId: string }).caliberId = 'caliber.x'; }, /ammunition\[0\]\.caliberId: verweist auf unbekannte Kaliber-ID/);
  rejects((d) => { (d.ammunition.ammunition as unknown[]).splice(1, 1); }, /Kaliber "caliber\.55" hat keine Munitionssorte/);
  rejects((d) => {
    withSoftPoint(d);
    (d.ammunition.ammunition.at(-1)!.modifiers[1] as { value: number }).value = -.5;
  }, /Durchschlag wird in ganzen Stufen verschoben/);
  // An unused ammunition type is still resolved against every weapon of its caliber.
  rejects((d) => {
    withSoftPoint(d);
    (d.ammunition.ammunition.at(-1)!.modifiers[1] as { value: number }).value = -2;
  }, /weapon\.kestrel-ar-01\.penetration = 0 unterschreitet das Minimum 1/);
});

// ---------------------------------------------------------------------------------------------------------------
// Server: armored enemies

const idle: PlayerInput = { seq: 0, forward: 0, strafe: 0, yaw: 0, pitch: 0, sprint: false, fire: false };
const open: WorldDefinition = { ...CARRIER_WORLD, half: 40, obstacles: [] };

class Range extends Battlefield {
  constructor(registry: BalanceRegistry) { super(7, open, registry); }
}

function shoot(registry: BalanceRegistry, slot: 'primary' | 'secondary'): number {
  const field = new Range(registry);
  const player: SimPlayer = field.addPlayer('a');
  Object.assign(player, { x: 0, z: 0, protectedUntil: 0 });
  let seq = 0;
  const drive = (extra: Partial<PlayerInput> = {}) => {
    field.receiveInput('a', { ...idle, seq: ++seq, ...(extra.equipment ? { life: player.life } : {}), ...extra });
    field.step();
  };
  if (slot === 'secondary') {
    drive({ equipment: 'secondary' });
    while (player.equipment.action) drive();
  }
  const enemy = field.horde.spawn(CAMERA_SHOULDER, -8, 0);
  field.horde.hp[enemy] = 200;
  drive({ fire: true, pitch: -.12 });
  assert.equal(field.shots.length, 1);
  return 200 - field.horde.hp[enemy];
}

test('server shots respect the enemy armor class: 10 mm and 5,55 stop at class 3 and penetrate class 2', () => {
  const armored = (armorClass: number) => {
    const data = sources();
    (data.enemies.archetypes[0] as { armorClass: number }).armorClass = armorClass;
    return createBalanceRegistry(data);
  };
  // 8.2C: 5,55 × 39 mm has penetration 2 like 10 mm.
  assert.ok(Math.abs(shoot(armored(3), 'secondary') - 21.6 * .1) < 1e-4);
  assert.ok(Math.abs(shoot(armored(3), 'primary') - 24 * .1) < 1e-4);
  assert.ok(Math.abs(shoot(armored(2), 'secondary') - 21.6) < 1e-4);
  assert.ok(Math.abs(shoot(armored(2), 'primary') - 24) < 1e-4);
  // Unarmored Schabe: unchanged damage.
  assert.ok(Math.abs(shoot(BALANCE, 'secondary') - 21.6) < 1e-4);
});

test('server shots apply caliber falloff over the muzzle distance', () => {
  const data = sources();
  (data.ammunition.calibers[0] as { falloff: { startMeters: number; endMeters: number; minMultiplier: number } }).falloff =
    { startMeters: 1, endMeters: 4, minMultiplier: .5 };
  const dealt = shoot(createBalanceRegistry(data), 'secondary');
  assert.ok(Math.abs(dealt - 21.6 * .5) < 1e-4, String(dealt));
});
