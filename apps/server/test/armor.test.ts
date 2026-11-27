import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BALANCE, BALANCE_SOURCES, BASE_LOADOUT, CAMERA_SHOULDER, CARRIER_WORLD, STANDARD_LOADOUT, TEST_RIFLE, UNLOCKS, armorDamageTaken,
  automaticUnlocks, createBalanceRegistry, missingLoadoutUnlocks, resolveSelection, validateLoadoutSelection,
} from '@freefall/shared';
import type { PlayerInput, WorldDefinition } from '@freefall/shared';
import { playerSnapshot } from '../src/networking/snapshots.ts';
import { Battlefield } from '../src/simulation/Battlefield.ts';
import type { SimPlayer } from '../src/simulation/Player.ts';
import { damagePlayer } from '../src/systems/combat.ts';
import { protectionOf, resolveDamage } from '../src/systems/damage.ts';

const LIGHT = { ...STANDARD_LOADOUT, armorId: 'armor.sr4_scout' };
const HEAVY = { ...STANDARD_LOADOUT, armorId: 'armor.bw9_bulwark' };
const open: WorldDefinition = { ...CARRIER_WORLD, half: 40, obstacles: [] };
const idle: PlayerInput = { seq: 0, forward: 0, strafe: 0, yaw: 0, pitch: 0, sprint: false, fire: false };

test('three body armours carry the specified armour points, damage factors, weight classes and looks', () => {
  const expected = [
    ['armor.sr4_scout', 'leicht', 50, 1.25, 'sr4'],
    ['armor.standard_carrier', 'mittel', 100, 1, 'fr7'],
    ['armor.bw9_bulwark', 'schwer', 150, .75, 'bw9'],
  ] as const;
  for (const [id, weight, rating, taken, look] of expected) {
    const loadout = resolveSelection(BALANCE, { ...STANDARD_LOADOUT, armorId: id });
    assert.deepEqual(loadout.protection, { armorRating: rating, damageTaken: taken, weightClass: weight });
    assert.equal(loadout.look.armor, look);
    assert.equal(loadout.look.pack, 'funk');
  }
  assert.equal(BASE_LOADOUT.protection.damageTaken, 1, 'the standard issue keeps every existing balance value');
  assert.equal(BASE_LOADOUT.bodyArmor.id, STANDARD_LOADOUT.armorId);
});

test('armour ratings between and beyond the points of the curve interpolate and clamp', () => {
  const curve = BALANCE.armorEffects;
  assert.equal(armorDamageTaken(curve, 75), 1.125);
  assert.equal(armorDamageTaken(curve, 125), .875);
  assert.equal(armorDamageTaken(curve, 200), .5, 'over-heavy armour of the concept');
  assert.equal(armorDamageTaken(curve, 0), 1.25);
  assert.equal(armorDamageTaken(curve, 300), .5);
  // Invalid curves fail validation: unsorted points, more armour letting more damage through, ratings off the curve.
  const broken = (patch: (equipment: { armorEffects: { rating: number; damageTaken: number }[]; armors: { armorRating: number }[] }) => void) => {
    const sources = structuredClone(BALANCE_SOURCES) as unknown as { equipment: Parameters<typeof patch>[0] };
    patch(sources.equipment);
    return () => createBalanceRegistry(sources as never);
  };
  assert.throws(broken((e) => { e.armorEffects[1].rating = 40; }), /aufsteigend/);
  assert.throws(broken((e) => { e.armorEffects[2].damageTaken = 1.4; }), /mehr Rüstung/);
  assert.throws(broken((e) => { e.armors[0].armorRating = 250; }), /außerhalb der Kurve/);
});

test('the damage resolver scales every hit on an operator by its armour before rounding to whole hit points', () => {
  const policy = BASE_LOADOUT.damagePolicy;
  const hit = (protection: number, base = 40) => resolveDamage(policy, { source: 'melee', attacker: 'enemy', target: 'operator', base, protection }).amount;
  assert.deepEqual([hit(1.25), hit(1), hit(.75)], [50, 40, 30]);
  assert.equal(hit(1.25, 30), 38, '37.5 rounds to whole hit points');
  // Friendly fire: policy first, then armour.
  assert.equal(resolveDamage(policy, { source: 'explosion', attacker: 'operator', target: 'operator', base: 100, protection: .75 }).amount, 23);
  // Armour never touches enemies, convicts or structures.
  assert.equal(resolveDamage(policy, { source: 'bullet', attacker: 'operator', target: 'enemy', base: 24, protection: .5 }).amount, 24);
});

test('operators in light, medium and heavy armour lose 125, 100 and 75 % of the same hits', () => {
  const field = new (class extends Battlefield { constructor() { super(3, open); } })();
  const players = ['light', 'medium', 'heavy'].map((id) => field.addPlayer(id)!);
  assert.equal(field.setLoadout('light', LIGHT), undefined);
  assert.equal(field.setLoadout('heavy', HEAVY), undefined);
  const lost: number[] = [];
  for (const player of players) {
    player.protectedUntil = 0;
    const base = 20;
    const { amount } = resolveDamage(BASE_LOADOUT.damagePolicy, { source: 'melee', attacker: 'enemy', target: 'operator', base, protection: protectionOf(player) });
    lost.push(damagePlayer(player, amount, field.tick));
  }
  assert.deepEqual(lost, [25, 20, 15]);

  // Friendly fire through the real shot path: 30 % policy, then armour.
  const shooter = field.addPlayer('shooter')!;
  const [light, , heavy] = players;
  let seq = 0;
  for (const target of [light, heavy]) {
    target.hp = 100;
    for (const other of field.players) if (other) Object.assign(other, { x: 30, z: 30, protectedUntil: 0 });
    Object.assign(shooter, { x: 0, z: 0 });
    Object.assign(target, { x: CAMERA_SHOULDER, z: -6 });
    for (let i = 0; i < 12 && target.hp === 100; i++) {
      seq++;
      field.receiveInput('shooter', { ...idle, seq, fire: true, pitch: -.1 });
      for (const other of field.players) if (other && other !== shooter) field.receiveInput(other.id, { ...idle, seq });
      field.step();
    }
    const bullet = Math.round(TEST_RIFLE.damage * .3 * target.loadout.protection.damageTaken);
    assert.equal(target.hp, 100 - bullet, `${target.id}: ${100 - target.hp}`);
  }
});

test('light and heavy armour are bought with credits and travel in snapshots only when they differ from the standard', () => {
  const owned = new Set(automaticUnlocks(UNLOCKS, 1, new Set()).map(({ id }) => id));
  assert.deepEqual(missingLoadoutUnlocks(UNLOCKS, owned, STANDARD_LOADOUT), [], 'FR-7 is standard issue');
  assert.deepEqual(missingLoadoutUnlocks(UNLOCKS, owned, LIGHT), ['upgrade.sr4-spaeher']);
  assert.deepEqual(missingLoadoutUnlocks(UNLOCKS, owned, HEAVY), ['upgrade.bw9-bollwerk']);
  assert.deepEqual(UNLOCKS.byId.get('upgrade.sr4-spaeher')?.cost, { credits: 6000 });
  assert.deepEqual(UNLOCKS.byId.get('upgrade.bw9-bollwerk')?.cost, { credits: 4000 });
  assert.deepEqual(missingLoadoutUnlocks(UNLOCKS, new Set([...owned, 'upgrade.bw9-bollwerk']), HEAVY), []);
  assert.ok('selection' in validateLoadoutSelection(BALANCE, HEAVY));
  const field = new (class extends Battlefield { constructor() { super(5, open); } })();
  const [a, b] = [field.addPlayer('a')!, field.addPlayer('b')!];
  field.setLoadout('b', HEAVY);
  const snapshot = playerSnapshot(field, 'a');
  const state = (player: SimPlayer) => snapshot.players.find((entry) => entry.id === player.id)!;
  assert.equal(state(a).look, undefined, 'standard issue: no extra bytes');
  assert.deepEqual(state(b).look, { armor: 'bw9', helmet: 'bw9-helm', pack: 'funk' });
});
