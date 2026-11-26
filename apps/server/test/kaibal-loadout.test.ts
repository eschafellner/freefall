/**
 * Release 8.2B: Kaibal 50, Doppellauf mit Kipplauf (feed "break"), 7,77 × 50 mm.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BALANCE, CARRIER_WORLD, STANDARD_LOADOUT, UNLOCKS, createBalanceRegistry, BALANCE_SOURCES, missingLoadoutUnlocks, reserveInRounds, resolveSelection } from '@freefall/shared';
import type { LoadoutSelection, PlayerInput, WorldDefinition } from '@freefall/shared';
import { Battlefield } from '../src/simulation/Battlefield.ts';
import type { SimPlayer } from '../src/simulation/Player.ts';

const idle: PlayerInput = { seq: 0, forward: 0, strafe: 0, yaw: 0, pitch: 0, sprint: false, fire: false };
const open: WorldDefinition = { ...CARRIER_WORLD, half: 40, obstacles: [] };
const KAIBAL: LoadoutSelection = { ...STANDARD_LOADOUT, primaryWeaponId: 'kaibal-50' };

function setup() {
  const field = new Battlefield(7, open);
  const player: SimPlayer = field.addPlayer('a');
  Object.assign(player, { x: 0, z: 0, protectedUntil: 0 });
  assert.equal(field.setLoadout('a', KAIBAL), undefined);
  let seq = 0;
  const drive = (extra: Partial<PlayerInput> = {}, ticks = 1) => {
    for (let i = 0; i < ticks; i++) {
      field.receiveInput('a', { ...idle, seq: ++seq, ...extra });
      field.step();
    }
  };
  const reload = () => {
    drive({ reload: true });
    let ticks = 1;
    for (; ticks < 120 && player.reload.phase !== 'READY'; ticks++) drive();
    return ticks;
  };
  return { field, player, drive, reload };
}

test('Kaibal 50: 7,77 × 50 mm, 2 Läufe, 90 Patronen Reserve, 200 Schuss/min, Kipplauf 0,8 s', () => {
  const kestrel = resolveSelection(BALANCE, STANDARD_LOADOUT).weapons.primary;
  const weapon = resolveSelection(BALANCE, KAIBAL).weapons.primary;
  assert.equal(weapon.displayName, 'Kaibal 50');
  assert.equal(weapon.category, 'double-barrel');
  assert.equal(weapon.slot, 'primary');
  assert.equal(weapon.caliber.id, 'caliber.7-77x50');
  assert.deepEqual(weapon.feed, { type: 'break', chamberRounds: 0 });
  assert.ok(reserveInRounds(weapon.feed));
  assert.equal(weapon.capacity, 2);
  assert.equal(weapon.reserve, 90);
  assert.equal(weapon.reloadSeconds, .8);
  assert.ok(Math.abs(weapon.roundsPerSecond * 60 - 200) < .1);
  // Hochschlag hoch, Seitenauslenkung sehr niedrig.
  const vertical = ({ recoil }: typeof weapon) => recoil.pitchPerShot * recoil.verticalMultiplier;
  const horizontal = ({ recoil }: typeof weapon) => recoil.yawPerShot * recoil.horizontalMultiplier;
  assert.ok(vertical(weapon) > 10 * vertical(kestrel));
  assert.ok(horizontal(weapon) < horizontal(kestrel) / 4);
});

test('Kipplauf: leere Läufe werden aus loser Reserve aufgefüllt, eine Restpatrone bleibt', () => {
  const { player, drive, reload } = setup();
  assert.equal(player.ammo, 2);
  assert.equal(player.equipment.magazines.primary, 90);
  // Both barrels at 200/min: the second shot follows 9 ticks later, then the weapon is empty.
  drive({ fire: true }, 1);
  assert.equal(player.ammo, 1);
  drive({ fire: true }, 8);
  assert.equal(player.ammo, 1, 'zweiter Lauf erst nach 0,3 s');
  drive({ fire: true }, 1);
  assert.equal(player.ammo, 0);
  drive({}, 10);
  const ticks = reload();
  assert.ok(Math.abs(ticks - 24) <= 2, ticks + ' Ticks');
  assert.equal(player.ammo, 2);
  assert.equal(player.equipment.magazines.primary, 88);
  // One shot, then reload: one round goes in, nothing is discarded.
  drive({}, 12);
  drive({ fire: true }, 1);
  drive({}, 12);
  assert.equal(player.ammo, 1);
  reload();
  assert.equal(player.ammo, 2);
  assert.equal(player.equipment.magazines.primary, 87);
  // Last loose round: only one barrel is loaded.
  player.equipment.magazines.primary = 1;
  player.ammo = 0;
  reload();
  assert.equal(player.ammo, 1);
  assert.equal(player.equipment.magazines.primary, 0);
});

test('Registry: Kipplauf hat höchstens 4 Läufe und keine Magazinvarianten', () => {
  const data = structuredClone(BALANCE_SOURCES);
  const weapon = data.weapons.weapons.find(({ id }) => id === 'kaibal-50')!;
  weapon.magazineSize = 6;
  assert.throws(() => createBalanceRegistry(data), /höchstens 4 Läufe/);
  weapon.magazineSize = 2;
  (weapon.magazineVariants as unknown[]) = [{ type: 'drum', displayName: 'Trommel', magazineSize: 10, modifiers: [] }];
  assert.throws(() => createBalanceRegistry(data), /nur für Waffen mit wechselbarem Magazin/);
});

test('Freischaltung: Kaibal 50 ab Level 8 für 3.000 SKR', () => {
  const entry = UNLOCKS.byId.get('weapon.kaibal-50')!;
  assert.deepEqual([entry.acquisition, entry.level, entry.cost, entry.weaponId], ['choice', 8, { credits: 3000 }, 'kaibal-50']);
  const starter = new Set(UNLOCKS.list.filter(({ acquisition }) => acquisition === 'starter').map(({ id }) => id));
  assert.deepEqual(missingLoadoutUnlocks(UNLOCKS, starter, KAIBAL), ['weapon.kaibal-50']);
});
