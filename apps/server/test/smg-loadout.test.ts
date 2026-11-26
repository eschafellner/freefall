/**
 * Release 8.2A: Maschinenpistolen MP-99 (10 mm) und Viktor 55 (.55) als Primärwaffen aus dem Arsenal.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BALANCE, CARRIER_WORLD, STANDARD_LOADOUT, UNLOCKS, missingLoadoutUnlocks, resolveSelection, validateLoadoutSelection } from '@freefall/shared';
import type { LoadoutSelection, PlayerInput, WorldDefinition } from '@freefall/shared';
import { Battlefield } from '../src/simulation/Battlefield.ts';
import type { SimPlayer } from '../src/simulation/Player.ts';

const idle: PlayerInput = { seq: 0, forward: 0, strafe: 0, yaw: 0, pitch: 0, sprint: false, fire: false };
const open: WorldDefinition = { ...CARRIER_WORLD, half: 40, obstacles: [] };
const MP99: LoadoutSelection = { ...STANDARD_LOADOUT, primaryWeaponId: 'mp-99' };
const VIKTOR: LoadoutSelection = { ...STANDARD_LOADOUT, primaryWeaponId: 'viktor-55' };

function setup(selection: LoadoutSelection) {
  const field = new Battlefield(7, open);
  const player: SimPlayer = field.addPlayer('a');
  Object.assign(player, { x: 0, z: 0, protectedUntil: 0 });
  assert.equal(field.setLoadout('a', selection), undefined);
  let seq = 0;
  const drive = (extra: Partial<PlayerInput> = {}, ticks = 1) => {
    for (let i = 0; i < ticks; i++) {
      field.receiveInput('a', { ...idle, seq: ++seq, ...extra });
      field.step();
    }
  };
  return { field, player, drive };
}

test('MP-99 und Viktor 55: Kaliber, Magazin, Reserve, Nachladezeit und Kadenz laut Vorgabe', () => {
  const kestrel = resolveSelection(BALANCE, STANDARD_LOADOUT).weapons.primary;
  const mp = resolveSelection(BALANCE, MP99).weapons.primary;
  const viktor = resolveSelection(BALANCE, VIKTOR).weapons.primary;
  for (const [weapon, name, caliber, magazine, reload, rpm] of [
    [mp, 'MP-99', 'caliber.10mm', 40, 2.2, 720], [viktor, 'Viktor 55', 'caliber.55', 35, 1.4, 1100],
  ] as const) {
    assert.equal(weapon.displayName, name);
    assert.equal(weapon.category, 'submachine-gun');
    assert.equal(weapon.slot, 'primary');
    assert.equal(weapon.caliber.id, caliber);
    assert.equal(weapon.capacity, magazine);
    assert.equal(weapon.reserve, 8);
    assert.equal(weapon.maxReserve, 8);
    assert.equal(weapon.reloadSeconds, reload);
    assert.ok(Math.abs(weapon.roundsPerSecond * 60 - rpm) < .1, name + ' Schuss/min');
  }
  // Kaliberwerte unverändert (Vorgabe): 10 mm 21,6, .55 32 Schaden je Treffer.
  assert.equal(mp.projectile.damage, 21.6);
  assert.equal(viktor.projectile.damage, 32);
  // Effektiver Rückstoß je Schuss (Grundwert × Multiplikator). MP-99: wenig. Viktor 55: wenig vertikal, viel horizontal.
  const vertical = ({ recoil }: typeof mp) => recoil.pitchPerShot * recoil.verticalMultiplier;
  const horizontal = ({ recoil }: typeof mp) => recoil.yawPerShot * recoil.horizontalMultiplier;
  assert.ok(vertical(mp) < vertical(kestrel) && horizontal(mp) < horizontal(kestrel));
  assert.ok(vertical(viktor) < vertical(mp));
  assert.ok(horizontal(viktor) > 2 * horizontal(kestrel));
  assert.ok(horizontal(viktor) > 4 * vertical(viktor));
  // Die Seitenauslenkung braucht Platz: sie ist auf die Hälfte von maxClimbDegrees begrenzt.
  assert.ok(viktor.recoil.maxClimbDegrees / 2 >= 5 * horizontal(viktor));
});

test('Dauerfeuer folgt der Kadenz, Nachladen dauert 2,2 s bzw. 1,4 s', () => {
  for (const [selection, perSecond, reloadTicks] of [[MP99, 12, 66], [VIKTOR, 18.33333, 42]] as const) {
    const { player, drive } = setup(selection);
    const full = player.ammo;
    drive({ fire: true }, 30);
    const fired = full - player.ammo;
    assert.ok(Math.abs(fired - perSecond) <= 1, `${selection.primaryWeaponId}: ${fired} Schuss in 1 s`);
    drive({}, 10);
    player.ammo = 0;
    drive({ reload: true });
    let ticks = 1;
    for (; ticks < 200 && player.reload.phase !== 'READY'; ticks++) drive();
    assert.equal(player.ammo, full);
    assert.ok(Math.abs(ticks - reloadTicks) <= 2, `${selection.primaryWeaponId}: ${ticks} Ticks Nachladen`);
  }
});

test('Freischaltung im Arsenal: MP-99 ab Level 5 für 4.500 SKR, Viktor 55 ab Level 7 für 6.000 SKR', () => {
  const mp = UNLOCKS.byId.get('weapon.mp-99')!;
  const viktor = UNLOCKS.byId.get('weapon.viktor-55')!;
  assert.deepEqual([mp.acquisition, mp.level, mp.cost, mp.weaponId], ['choice', 5, { credits: 4500 }, 'mp-99']);
  assert.deepEqual([viktor.acquisition, viktor.level, viktor.cost, viktor.weaponId], ['choice', 7, { credits: 6000 }, 'viktor-55']);
  const starter = new Set(UNLOCKS.list.filter(({ acquisition }) => acquisition === 'starter').map(({ id }) => id));
  assert.deepEqual(missingLoadoutUnlocks(UNLOCKS, starter, MP99), ['weapon.mp-99']);
  assert.deepEqual(missingLoadoutUnlocks(UNLOCKS, new Set([...starter, 'weapon.viktor-55']), VIKTOR), []);
  assert.deepEqual(validateLoadoutSelection(BALANCE, VIKTOR), { selection: VIKTOR });
  assert.match((validateLoadoutSelection(BALANCE, { ...STANDARD_LOADOUT, secondaryWeaponId: 'mp-99' }) as { error: string }).error, /keine Sekundärwaffe/);
});
