/**
 * Release 8.2B: Modell und Kipplauf-Animation der Kaibal 50.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { BALANCE } from '@freefall/shared';
import { PlayerVisualController } from '../src/rendering/characters/PlayerVisualController.ts';
import { createOperatorWardrobe } from '../src/rendering/characters/operator/Catalog.ts';
import { createKestrel } from '../src/rendering/weapons/Kestrel.ts';
import { KAIBAL50_HANDLING, createKaibal50 } from '../src/rendering/weapons/Kaibal50.ts';
import { WeaponVisualController } from '../src/rendering/weapons/WeaponVisualController.ts';

const rifle = createKestrel();
const parts = createKaibal50(rifle.finish);
const { removalAt, insertionAt } = BALANCE.weapon('kaibal-50').reloadTimeline;
const hinge = KAIBAL50_HANDLING.hinge!;

function weapon() {
  const controller = new WeaponVisualController(parts, KAIBAL50_HANDLING);
  controller.root.updateMatrix();
  const barrels = controller.root.children.find((child) => child instanceof T.Group && child.children.some((mesh) => mesh instanceof T.Mesh && mesh.geometry === parts.slide)) as T.Group;
  const spent = barrels.children.find((mesh) => mesh instanceof T.Mesh && mesh.geometry === parts.spent)!;
  const rounds = controller.sockets.Magazine.children[0].children[0] as T.Group;
  const at = (progress: number) => {
    controller.reload(progress);
    controller.update(1 / 60);
    return controller;
  };
  return { controller, barrels, spent, rounds, at };
}

test('Kaibal 50: zwei Läufe nebeneinander, Mündung vorn, länger als die Kestrel', () => {
  for (const geometry of [parts.body, parts.slide!, parts.magazine, parts.spent!]) geometry.computeBoundingBox();
  rifle.body.computeBoundingBox();
  const barrels = parts.slide!.boundingBox!;
  assert.ok(Math.abs(barrels.min.z - KAIBAL50_HANDLING.sockets!.Muzzle![2]) < .003, 'Mündung am Laufende');
  assert.ok(barrels.min.z < rifle.body.boundingBox!.min.z, 'längere Läufe als die Kestrel');
  assert.ok(parts.body.boundingBox!.max.z - barrels.min.z > 1, 'Gesamtlänge über 1 m');
  assert.ok(barrels.max.x - barrels.min.x > 2 * KAIBAL50_HANDLING.barrelSpacing!, 'nebeneinander');
  assert.equal(KAIBAL50_HANDLING.ejectsPerShot, false);
});

test('Kipplauf: öffnen, Hülsen auswerfen, Patronen in die Kammern, schließen', () => {
  const { controller, barrels, spent, rounds, at } = weapon();
  const rest = new T.Vector3(...KAIBAL50_HANDLING.sockets!.SupportHand!);
  const hand = (progress: number) => controller.supportHand(new T.Vector3(), progress);
  at(-1);
  assert.ok(Math.abs(barrels.rotation.x) < 1e-9);
  assert.equal(rounds.visible, false);
  assert.ok(hand(-1).distanceTo(rest) < 1e-6);
  // Open: barrels tip down (muzzle below the bore line), the forend hand follows them.
  at(hinge.open[1] + .01);
  assert.ok(Math.abs(barrels.rotation.x + hinge.angle) < 1e-3, 'ganz offen');
  controller.root.updateMatrixWorld(true);
  const muzzle = new T.Vector3(0, .085, -.742).applyMatrix4(barrels.children[0].matrixWorld);
  assert.ok(muzzle.y < -.2, 'Mündung zeigt nach unten');
  assert.ok(hand(.03).y < rest.y, 'Hand bleibt am Vorderschaft');
  // Spent cases fly while the barrels open, then disappear.
  at(hinge.open[0] + .1);
  assert.ok(spent.visible && spent.position.z > 0, 'Hülsen fliegen nach hinten');
  at(.4);
  assert.equal(spent.visible, false);
  // Rounds: in the hand at the belt, then in the open chambers at insertionAt.
  at(removalAt);
  assert.ok(rounds.visible && rounds.position.length() > .2, 'Patronen am Gürtel');
  const grip = hand(removalAt);
  rounds.updateMatrix();
  controller.sockets.Magazine.updateMatrix();
  const held = new T.Vector3(...KAIBAL50_HANDLING.magazine!.hand).applyMatrix4(rounds.matrix).applyMatrix4(controller.sockets.Magazine.matrix);
  assert.ok(grip.distanceTo(held) < .03, 'Hand hält die Patronen');
  at(insertionAt);
  const chamber = new T.Vector3(...KAIBAL50_HANDLING.sockets!.Magazine!);
  const seated = rounds.position.clone().add(chamber);
  const open = chamber.clone().sub(new T.Vector3(...hinge.pivot)).applyAxisAngle(new T.Vector3(1, 0, 0), barrels.rotation.x).add(new T.Vector3(...hinge.pivot));
  assert.ok(seated.distanceTo(open) < 1e-6, 'Patronen sitzen in der offenen Kammer');
  // Close again with the hand on the forend.
  at(hinge.close[1] + .02);
  assert.ok(Math.abs(barrels.rotation.x) < 1e-9, 'geschlossen');
  assert.equal(rounds.visible, false);
  assert.ok(hand(1).distanceTo(rest) < 1e-6);
});

test('Schüsse wechseln vom rechten zum linken Lauf, nach dem Nachladen wieder rechts', () => {
  const { controller, at } = weapon();
  const spacing = KAIBAL50_HANDLING.barrelSpacing!;
  const muzzleX = () => controller.sockets.Muzzle.position.x;
  assert.equal(muzzleX(), spacing);
  controller.cycle();
  assert.equal(muzzleX(), spacing, 'erster Schuss rechts');
  controller.cycle();
  assert.equal(muzzleX(), -spacing, 'zweiter Schuss links');
  at(insertionAt + .01);
  at(-1);
  controller.cycle();
  assert.equal(muzzleX(), spacing);
});

test('der Operator zeigt die Kaibal 50 als Primärwaffe', () => {
  const player = new PlayerVisualController(createOperatorWardrobe(), rifle, 0x73d5e7, true, [
    { weaponId: 'kaibal-50', parts, profile: KAIBAL50_HANDLING }]);
  player.setWeapons({ primary: 'kaibal-50', secondary: 'p-01' });
  player.draw('a', 1, 100, 0, 0, 0, 0, false, false, 0, 1, 33, 1 / 30, true);
  assert.equal(player.primaries.get('kaibal-50')!.root.visible, true);
  assert.equal(player.weapon.root.visible, false);
});
