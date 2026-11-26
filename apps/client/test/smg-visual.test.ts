/**
 * Release 8.2A: Modelle und Animationen von MP-99 und Viktor 55.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { BALANCE } from '@freefall/shared';
import { PlayerVisualController } from '../src/rendering/characters/PlayerVisualController.ts';
import { createOperatorWardrobe } from '../src/rendering/characters/operator/Catalog.ts';
import { createCerberus } from '../src/rendering/weapons/Cerberus.ts';
import { createKestrel } from '../src/rendering/weapons/Kestrel.ts';
import { MP99_HANDLING, createMp99 } from '../src/rendering/weapons/Mp99.ts';
import { VIKTOR55_HANDLING, createViktor55 } from '../src/rendering/weapons/Viktor55.ts';
import { CERBERUS_HANDLING, WeaponVisualController } from '../src/rendering/weapons/WeaponVisualController.ts';
import type { WeaponProfile } from '../src/rendering/weapons/WeaponVisualController.ts';

const rifle = createKestrel();
const models = [
  { weaponId: 'mp-99', parts: createMp99(rifle.finish), profile: MP99_HANDLING },
  { weaponId: 'viktor-55', parts: createViktor55(rifle.finish), profile: VIKTOR55_HANDLING },
];
const local = (weapon: WeaponVisualController, world: T.Vector3) => world.applyMatrix4(weapon.root.matrix.clone().invert());
const slideZ = (weapon: WeaponVisualController) => (weapon.root.children.find((child) => child instanceof T.Mesh && child.geometry === models.find(({ profile }) => profile === weapon.profile)!.parts.slide) as T.Mesh).position.z;

test('MP-99 und Viktor 55: Mündung vorn, Griff im Ursprung, Magazin unter dem Gehäuse, kompakter als die Kestrel', () => {
  rifle.body.computeBoundingBox();
  for (const { weaponId, parts, profile } of models) {
    assert.equal(profile.weaponId, weaponId);
    parts.body.computeBoundingBox();
    const box = parts.body.boundingBox!;
    const sockets = profile.sockets!;
    assert.ok(Math.abs(sockets.Muzzle![2] - box.min.z) < .006, weaponId + ': Mündung am vorderen Ende');
    assert.ok(box.min.z > rifle.body.boundingBox!.min.z + .1, weaponId + ': kürzer als die Kestrel');
    assert.ok(box.max.z - box.min.z > .55 && box.max.z - box.min.z < .75, weaponId + ': Länge mit Schaft');
    assert.ok(box.min.x > -.05 && box.max.x < .05, weaponId + ': schlank');
    parts.magazine.computeBoundingBox();
    assert.ok(parts.magazine.boundingBox!.min.y < -.18, weaponId + ': langes Magazin');
    assert.ok(sockets.Magazine![2] < 0 && sockets.SupportHand![2] < sockets.Magazine![2], weaponId + ': Stützhand vor dem Magazin');
    assert.ok(parts.slide, weaponId + ': beweglicher Verschluss');
    for (const geometry of [parts.body, parts.optic, parts.magazine, parts.slide!]) {
      for (const value of geometry.getAttribute('position').array) assert.ok(Number.isFinite(value));
    }
  }
});

test('der Operator zeigt die gewählte Primärwaffe und lädt mit ihrem Verschluss', () => {
  const player = new PlayerVisualController(createOperatorWardrobe(), rifle, 0x73d5e7, true, [
    { weaponId: 'vx-13', parts: createCerberus(rifle.finish), profile: CERBERUS_HANDLING }, ...models,
  ]);
  const draw = (tick: number) => player.draw('a', 1, 100, 0, 0, 0, 0, false, false, 0, tick, tick * 33, 1 / 30, true);
  for (const id of ['mp-99', 'viktor-55', 'vx-13', 'kestrel-ar-01']) {
    player.setWeapons({ primary: id, secondary: 'p-01' });
    draw(1);
    for (const [other, weapon] of player.primaries) assert.equal(weapon.root.visible, other === id, `${id}: ${other}`);
    assert.equal(player.weapon.root.visible, id === 'kestrel-ar-01');
  }
  // A confirmed shot cycles the bolt of the visible MP-99.
  player.setWeapons({ primary: 'mp-99', secondary: 'p-01' });
  draw(2);
  player.queueShot({ shooter: 'a', tick: 3, life: 1, slot: 'primary' });
  draw(3);
  const mp = player.primaries.get('mp-99')!;
  assert.ok(slideZ(mp) > .005, 'Verschluss fährt zurück');
  for (let tick = 4; tick < 8; tick++) draw(tick);
  assert.equal(slideZ(mp), 0, 'und wieder vor');
});

function reloadTrack(profile: WeaponProfile, parts: (typeof models)[number]['parts']) {
  const weapon = new WeaponVisualController(parts, profile);
  weapon.root.updateMatrix();
  const hand = (progress: number) => {
    weapon.reload(progress);
    weapon.update(1 / 60);
    return local(weapon, weapon.supportHand(new T.Vector3(), progress));
  };
  const magazine = (progress: number) => {
    weapon.reload(progress);
    return (weapon.sockets.Magazine.children[0].children[0] as T.Object3D).position.clone();
  };
  return { weapon, hand, magazine };
}

test('MP-99: Magazin raus und rein auf der Server-Timeline, dann zieht die Stützhand den Spannhebel', () => {
  const { removalAt, insertionAt } = BALANCE.weapon('mp-99').reloadTimeline;
  const { weapon, hand, magazine } = reloadTrack(MP99_HANDLING, models[0].parts);
  const rest = new T.Vector3(...MP99_HANDLING.sockets!.SupportHand!);
  assert.ok(hand(-1).distanceTo(rest) < 1e-6, 'ohne Nachladen an der Griffstütze');
  assert.ok(magazine(removalAt + .08).y < -.25, 'Magazin draußen');
  assert.ok(magazine(insertionAt).length() < 1e-6, 'Magazin sitzt bei insertionAt');
  assert.ok(magazine(.9).length() < 1e-6);
  // Hand on the falling magazine, then at the charging handle while it is pulled back.
  const atMagazine = hand(removalAt + .06);
  assert.ok(atMagazine.y < rest.y - .2, 'Hand am Magazin');
  const charge = MP99_HANDLING.charge!;
  const pulled = hand(charge.pull[1] + .01);
  assert.ok(slideZ(weapon) > charge.travel * .95, 'Spannhebel hinten');
  assert.ok(pulled.distanceTo(new T.Vector3(charge.hand[0], charge.hand[1], charge.hand[2] + slideZ(weapon))) < .002, 'Hand am Spannhebel');
  hand(charge.release + .03);
  assert.equal(slideZ(weapon), 0, 'Verschluss schnellt vor');
  assert.ok(hand(1).distanceTo(rest) < 1e-6, 'zurück an der Griffstütze');
});

test('Viktor 55: schneller Wechsel, Verschluss offen bis kurz nach dem Einsetzen', () => {
  const { removalAt, insertionAt } = BALANCE.weapon('viktor-55').reloadTimeline;
  const { weapon, hand, magazine } = reloadTrack(VIKTOR55_HANDLING, models[1].parts);
  const lock = VIKTOR55_HANDLING.lock!;
  assert.ok(magazine(removalAt + .08).y < -.2);
  assert.ok(magazine(insertionAt).length() < 1e-6);
  hand(removalAt);
  assert.equal(slideZ(weapon), lock.travel, 'Verschluss offen');
  hand(insertionAt);
  assert.equal(slideZ(weapon), lock.travel, 'noch offen beim Einsetzen');
  hand(lock.until! + .01);
  assert.equal(slideZ(weapon), 0, 'Fanghebel lässt ihn vor');
  assert.ok(hand(1).distanceTo(new T.Vector3(...VIKTOR55_HANDLING.sockets!.SupportHand!)) < 1e-6);
  // At 1100 rounds/min the bolt has returned before the next shot.
  weapon.reload(-1);
  weapon.cycle();
  weapon.update(.001);
  assert.ok(slideZ(weapon) > .015);
  weapon.update(1 / BALANCE.weapon('viktor-55').roundsPerSecond - .001);
  assert.equal(slideZ(weapon), 0);
});
