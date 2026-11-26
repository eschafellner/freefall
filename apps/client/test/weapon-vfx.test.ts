import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { BASE_LOADOUT, CARRIER_WORLD, newPosture } from '@freefall/shared';
import type { EquipmentState, Posture, ShotEvent } from '@freefall/shared';
import { GRAPHICS_QUALITY } from '../src/rendering/GraphicsQuality.ts';
import { VisualEffectsManager } from '../src/rendering/VisualEffectsManager.ts';
import { PlayerVisualController } from '../src/rendering/characters/PlayerVisualController.ts';
import { createOperatorWardrobe } from '../src/rendering/characters/operator/Catalog.ts';
import { createKestrel } from '../src/rendering/weapons/Kestrel.ts';
import { WeaponFireEffects } from '../src/rendering/weapons/WeaponFireEffects.ts';
import { WeaponVisualController } from '../src/rendering/weapons/WeaponVisualController.ts';

const wall = { ...CARRIER_WORLD, obstacles: [{ x: 0, z: -2, halfX: 3, halfZ: .2, height: 3, kind: 'barrier' as const }] };
const shot: ShotEvent = {
  shooter: 'pilot', tick: 20, life: 1, slot: 'primary',
  fromX: 0, fromY: 1.2, fromZ: 0, toX: 0, toY: 1.2, toZ: -10, enemy: 0, eliminated: false,
};

test('a firing cue uses the posed weapon in allowed postures and never fires an echo twice', () => {
  const p = new PlayerVisualController(createOperatorWardrobe(), createKestrel(), 0xffffff);
  const gear = { slot: 'primary', started: 0, until: 0 } as EquipmentState;
  let count = 0;
  let missing = 0;
  const present = (weapon: WeaponVisualController | undefined) => {
    if (weapon) { count++; assert.equal(weapon, gear.slot === 'primary' ? p.weapon : p.sidearm); }
    else missing++;
  };
  const draw = (posture: Posture, tick: number, life = 1, time = tick * 16) =>
    p.draw('pilot', life, 100, 0, 0, 0, 0, true, false, 0, tick, time, 1 / 60, false, gear,
      { ...newPosture(), current: posture });

  p.queueShot(shot, 300, present);
  p.queueShot(shot, 300, present);
  draw('STANDING', 19);
  assert.equal(count, 0);
  draw('STANDING', 20);
  assert.equal(count, 1);
  for (const [tick, posture] of [[21, 'CROUCHING'], [22, 'PRONE'], [23, 'SUPINE']] as const) {
    gear.slot = 'secondary';
    p.queueShot({ ...shot, tick: undefined, slot: 'secondary' }, tick * 16, present);
    draw(posture, tick);
  }
  assert.equal(count, 4);

  p.queueShot({ ...shot, tick: 30, slot: 'secondary' }, 460, present);
  draw('DIVING', 30);
  p.queueShot({ ...shot, tick: 31, slot: 'secondary' }, 470, present);
  draw('GETTING_UP', 31);
  p.queueShot({ ...shot, tick: 32 }, 480, present);
  draw('STANDING', 32);
  p.queueShot({ ...shot, tick: 33, slot: 'secondary' }, 490, present);
  draw('STANDING', 33, 2);
  assert.equal(missing, 4);
  assert.equal(count, 4);

  p.queueShot({ ...shot, tick: 50, life: 2 }, 590, present);
  p.expireShots(890);
  draw('STANDING', 50, 2, 895);
  assert.equal(missing, 5);
  assert.equal(count, 4);

  p.queueShot({ ...shot, tick: 51, life: 2 }, 900, present);
  p.clearShots();
  p.expireShots(1200);
  assert.equal(missing, 5);

  p.queueShot({ ...shot, tick: undefined, life: 2, slot: 'secondary' }, 1200, present);
  draw('DIVING', 53, 2, 1200);
  assert.equal(count, 4);
  draw('SUPINE', 54, 2, 1216);
  assert.equal(count, 5);
  p.queueShot({ ...shot, tick: 58, life: 2, slot: 'secondary' }, 1220, present);
  p.queueShot({ ...shot, tick: 56, life: 2, slot: 'secondary' }, 1221, present);
  p.queueShot({ ...shot, tick: 56, life: 2, slot: 'secondary' }, 1222, present);
  assert.equal(missing, 6, 'late confirmation still presents once at its server position');
  p.dispose();
});

test('muzzle VFX use the imported socket transform, cap output and recycle casings and light', () => {
  const scene = new T.Scene();
  const effects = new WeaponFireEffects(scene);
  effects.setQuality(GRAPHICS_QUALITY.high);
  const parts = createKestrel();
  const weapon = new WeaponVisualController(parts);
  const camera = new T.PerspectiveCamera();
  camera.position.set(0, 1.7, 3.4);
  weapon.root.position.set(.5, 1.1, -.5);
  weapon.root.rotation.y = .53;
  const prefab = new T.Group();
  const marker = new T.Object3D();
  marker.name = 'Muzzle';
  marker.position.set(.07, .16, -.68);
  marker.rotation.x = .31;
  prefab.add(marker);
  weapon.attachModel(prefab);

  effects.fire(weapon, 'primary', 100, true, camera, undefined);
  effects.draw(100, camera, 1);
  assert.deepEqual(effects.metrics(), { flashes: 1, casings: 1, lights: 1, flashCap: 16, casingCap: 32 });
  const batch = scene.getObjectByName('Muzzle flashes') as T.InstancedMesh;
  const matrix = new T.Matrix4();
  batch.getMatrixAt(0, matrix);
  const position = new T.Vector3(), rotation = new T.Quaternion(), scale = new T.Vector3();
  matrix.decompose(position, rotation, scale);
  assert.ok(position.distanceTo(marker.getWorldPosition(new T.Vector3())) < 1e-6);
  assert.ok(rotation.angleTo(marker.getWorldQuaternion(new T.Quaternion())) < 1e-3);

  const brass = scene.getObjectByName('Shell casings') as T.InstancedMesh;
  brass.getMatrixAt(0, matrix);
  position.setFromMatrixPosition(matrix);
  const port = weapon.sockets.EjectionPort.getWorldPosition(new T.Vector3());
  assert.ok(position.distanceTo(port) < 1e-6);
  effects.draw(125, camera, 0);
  assert.equal(effects.metrics().flashes, 0);
  assert.equal(effects.metrics().lights, 0);
  assert.equal(effects.metrics().casings, 1);
  brass.getMatrixAt(0, matrix);
  const right = new T.Vector3(1, 0, 0).applyQuaternion(weapon.root.getWorldQuaternion(rotation));
  assert.ok(position.setFromMatrixPosition(matrix).sub(port).dot(right) > 0);

  effects.draw(146, camera, 1);
  assert.equal(effects.metrics().flashes, 0);
  assert.equal(effects.metrics().lights, 0);
  effects.draw(740, camera, 1);
  assert.equal(effects.metrics().casings, 0);

  camera.position.copy(marker.getWorldPosition(position));
  effects.fire(weapon, 'primary', 750, true, camera, undefined);
  effects.draw(750, camera, 1);
  assert.equal(effects.metrics().flashes, 0);
  assert.equal(effects.metrics().lights, 0);
  camera.position.set(0, 1.7, 3.4);
  effects.clear();
  const obstruction = { ...wall, obstacles: [{ ...wall.obstacles[0], z: -1.25 }] };
  effects.fire(weapon, 'primary', 760, true, camera, obstruction);
  effects.draw(760, camera, 1);
  assert.equal(effects.metrics().flashes, 0);

  effects.setQuality(GRAPHICS_QUALITY.low);
  for (let i = 0; i < 80; i++) effects.fire(weapon, 'primary', 800 + i * .1, true, camera, undefined);
  effects.draw(810, camera, 1);
  assert.deepEqual(effects.metrics(), { flashes: 6, casings: 4, lights: 0, flashCap: 6, casingCap: 4 });
  effects.clear();
  assert.equal(effects.metrics().casings, 0);
  let disposed = false;
  batch.geometry.addEventListener('dispose', () => { disposed = true; });
  effects.dispose();
  assert.ok(disposed);
  assert.equal(scene.children.length, 0);
});

test('tracers stop at the confirmed endpoint, hide a blocked ray and clip legacy paths against cover', () => {
  const scene = new T.Scene();
  const mesh = new T.BoxGeometry();
  const material = new T.MeshBasicMaterial();
  const effects = new VisualEffectsManager(scene, [{ geometry: mesh, material }]);
  const camera = new T.Camera();
  camera.position.set(0, 1.7, 3);
  const lines = scene.getObjectByName('Confirmed tracers') as T.LineSegments;
  const vertices = lines.geometry.getAttribute('position');
  const length = BASE_LOADOUT.weapons.primary.effectiveRange;

  effects.add({ ...shot, traceFrom: { x: .8, y: shot.fromY, z: 0 }, toZ: -length, toX: .8 }, 100, camera, true);
  effects.draw(130, camera);
  assert.equal(lines.geometry.drawRange.count, 2);
  assert.ok(Math.abs(vertices.getX(0) - .8) < 1e-5);
  assert.equal(vertices.getZ(1), -length);
  assert.equal(effects.metrics().flashes, 0);
  effects.draw(172, camera);
  assert.equal(lines.geometry.drawRange.count, 0);

  effects.clear();
  effects.world = wall;
  effects.add(shot, 200, camera, true);
  effects.draw(230, camera);
  assert.equal(lines.geometry.drawRange.count, 2);
  assert.ok(Math.abs(vertices.getZ(1) + 1.8) < 1e-6);
  effects.clear();

  effects.add({ ...shot, traceFrom: { x: shot.toX, y: shot.toY, z: shot.toZ } }, 300, camera, true);
  effects.draw(320, camera);
  assert.equal(lines.geometry.drawRange.count, 0);
  effects.dispose();
  mesh.dispose();
  material.dispose();
});
