/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aimRay } from '@freefall/shared';
import * as T from 'three';
import { CharacterAnimation } from '../src/rendering/characters/CharacterAnimation.ts';
import { CharacterClipPlayer } from '../src/rendering/characters/CharacterClipPlayer.ts';
import { PlayerRigBatches } from '../src/rendering/characters/PlayerRigBatches.ts';
import { PlayerVisualController } from '../src/rendering/characters/PlayerVisualController.ts';
import { createSoldierParts } from '../src/rendering/characters/SoldierRig.ts';
import { createKestrel } from '../src/rendering/weapons/Kestrel.ts';
import { ThirdPersonCamera } from '../src/rendering/ThirdPersonCamera.ts';

test('animation resolves movement directions, upper-body actions and death independently', () => {
  const a = new CharacterAnimation();
  function update(x: number, z: number, sprint = false, aim = false, hp = 100, until = 0, tick = 0) {
    a.update(1 / 60, x, z, sprint, aim, hp > 0, until, tick);
  }
  for (const [forward, strafe, sprint, gait] of [
    [0, 0, false, 'idle'],
    [2, 0, false, 'walk'],
    [5.8, 0, false, 'run'],
    [9.2, 0, true, 'sprint'],
    [0, -5.8, false, 'strafeLeft'],
    [0, 5.8, false, 'strafeRight'],
    [-5.8, 0, false, 'backward'],
  ] as const) {
    for (let f = 0; f < 30; f++) update(forward, strafe, sprint);
    assert.equal(a.locomotion, gait);
  }
  update(-5.8, 0, false, true);
  assert.equal(a.combat, 'aim');
  assert.equal(a.locomotion, 'backward');
  a.fire();
  update(-5.8, 0, false, true);
  assert.equal(a.combat, 'fire');
  for (let f = 0; f < 20; f++) update(-5.8, 0, false, true);
  assert.equal(a.combat, 'aim');
  a.hit();
  update(-5.8, 0, false, true, 90, 73, 25);
  assert.equal(a.combat, 'reload');
  assert.equal(a.reaction, 'hit');
  assert.ok(a.reload > 0 && a.reload < 1);
  update(0, 0, false, false, 0);
  assert.equal(a.reaction, 'death');
  assert.equal(a.reload, -1);
  a.reset();
  assert.equal(a.reaction, 'none');
});

test('aim zoom, sprint and visual recoil preserve the server reticle axis at pitch limits', () => {
  const rig = new ThirdPersonCamera();
  const position = { x: 8, z: -5 };
  for (const pitch of [-.69, -.12, .69]) {
    const ray = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 };
    aimRay(ray, position, 2.5, pitch);
    const target = new T.Vector3(ray.x + ray.dx * 6, ray.y + ray.dy * 6, ray.z + ray.dz * 6);
    for (const [aim, sprint] of [[true, 0], [false, 1]] as const) {
      for (let f = 0; f < 60; f++) {
        if (f === 20) rig.fire();
        rig.update(position, 2.5, pitch, aim, sprint, 1 / 60);
        const projected = target.clone().project(rig.camera);
        assert.ok(Math.hypot(projected.x, projected.y) < 1e-10);
        assert.ok(rig.camera.position.y >= .19 - 1e-9);
      }
    }
  }
});

test('fallback rifle aims from the muzzle and keeps gameplay position independent of pose', () => {
  const player = new PlayerVisualController(createSoldierParts(), createKestrel(), 0x73d5e7);
  const position = { x: 2, z: 5 };
  const origin = new T.Vector3();
  for (const pitch of [-.54, -.12, .42]) {
    for (let f = 0; f < 45; f++) {
      player.draw('pilot', 1, 100, position.x, position.z, 1.5, pitch, true, false, 0, f, f * 16, 1 / 60, true);
    }
    player.weapon.muzzle(origin);
    const bore = new T.Vector3(0, 0, -1).applyQuaternion(player.weapon.root.getWorldQuaternion(new T.Quaternion()));
    const ray = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 };
    aimRay(ray, position, 1.5, pitch);
    const distance = ray.dy < 0 ? Math.min(22, -ray.y / ray.dy) : 22;
    const target = new T.Vector3(ray.x + ray.dx * distance, ray.y + ray.dy * distance, ray.z + ray.dz * distance);
    assert.ok(bore.angleTo(target.sub(origin).normalize()) < .04);
    assert.deepEqual(player.root.position.toArray(), [2, 0, 5]);
  }
  let posed = false;
  player.queueShot({ shooter: 'pilot', life: 1, slot: 'primary' }, 720, (weapon) => { posed = weapon === player.weapon; });
  player.draw('pilot', 1, 100, position.x, position.z, 1.5, -.4, true, false, 0, 45, 720, 1 / 60, true);
  assert.ok(player.animation.kick > 0);
  assert.ok(posed);
});

test('mixer accepts in-place packs and filters horizontal root motion', () => {
  const model = new T.Group();
  const root = new T.Group();
  root.name = 'RigRoot';
  model.add(root);
  const track = new T.VectorKeyframeTrack('RigRoot.position', [0, 1], [1, 0, 4, 2, .2, 3]);
  const clips = [new T.AnimationClip('Idle', 1, [track]), new T.AnimationClip('Walk', 1, [track])];
  const mixer = new CharacterClipPlayer(model, clips, { path: 'test.glb', motionRoot: 'RigRoot' });
  assert.equal(mixer.ready, true);
  const state = new CharacterAnimation();
  mixer.update(state, .5);
  assert.equal(root.position.x, 0);
  assert.ok(root.position.y > 0);
  assert.equal(root.position.z, 0);
  assert.equal(track.values[3], 2); // Clips are cached and shared across instances.
  mixer.dispose();
});

test('a dive clip poses the body without adding vertical or horizontal root motion', () => {
  const model = new T.Group();
  const root = new T.Group();
  const hips = new T.Group();
  root.name = 'RigRoot';
  hips.name = 'Hips';
  model.add(root);
  root.add(hips);
  const motion = new T.VectorKeyframeTrack('RigRoot.position', [0, 1], [0, 0, 0, 2, .7, 3]);
  const tuck = new T.VectorKeyframeTrack('Hips.position', [0, 1], [0, 1, 0, 0, .3, 0]);
  const clips = [new T.AnimationClip('Idle', 1, [tuck]), new T.AnimationClip('Walk', 1, [tuck]),
    new T.AnimationClip('diveForward', 1, [motion, tuck])];
  const mixer = new CharacterClipPlayer(model, clips, { path: 'test.glb', motionRoot: 'RigRoot' });
  const state = new CharacterAnimation();
  state.tactical.clip = 'diveForward';
  state.tactical.progress = .75;
  mixer.update(state, .15);
  assert.equal(mixer.baseClip, 'diveForward');
  assert.deepEqual(root.position.toArray(), [0, 0, 0]);
  assert.ok(hips.position.y > .3 && hips.position.y < 1);
  mixer.dispose();
});

test('visual sprint survives rendering 144 frames per second from 30 Hz prediction', () => {
  const state = new CharacterAnimation();
  let last = 0;
  let sprintFrames = 0;
  for (let frame = 1; frame <= 144; frame++) {
    const distance = Math.floor(frame * 30 / 144) * 9.2 / 30;
    state.update(1 / 144, (distance - last) * 144, 0, true, false, true, 0, 0);
    if (frame > 72 && state.locomotion === 'sprint') sprintFrames++;
    last = distance;
  }
  assert.equal(sprintFrames, 72);
});

test('articulated parts share instanced draws and exclude hidden rigs and replaced pieces', () => {
  const scene = new T.Scene();
  const roots = [new T.Group(), new T.Group(), new T.Group()];
  scene.add(...roots);
  const geometry = new T.BoxGeometry();
  const material = new T.MeshStandardMaterial();
  const source = new T.Mesh(geometry, material);
  for (const root of roots) root.add(source.clone());
  const batches = new PlayerRigBatches(scene, roots);
  const camera = new T.PerspectiveCamera();
  camera.position.set(0, 1, 4);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  const shared = scene.children.find((object) => object instanceof T.InstancedMesh);
  assert.ok(shared instanceof T.InstancedMesh);
  batches.draw(camera);
  assert.equal(shared.count, 3);
  roots[1].visible = false;
  roots[2].clear();
  batches.draw(camera);
  assert.equal(shared.count, 1);
  batches.dispose();
  assert.equal(scene.children.length, 3);
  geometry.dispose();
  material.dispose();
});

test('external rig attaches the primary weapon and a late magazine import returns to the seated transform', () => {
  const player = new PlayerVisualController(createSoldierParts(), createKestrel(), 0x73d5e7);
  const model = new T.Group();
  const mount = new T.Group();
  mount.name = 'RifleSocket';
  const track = new T.NumberKeyframeTrack('RifleSocket.rotation[x]', [0, 1], [0, .1]);
  const clips = [new T.AnimationClip('Idle', 1, [track]), new T.AnimationClip('Walk', 1, [track])];
  model.add(mount);
  player.attachCharacter(model, clips, { path: 'soldier.glb', equipmentNodes: { PrimaryWeapon: 'RifleSocket' } });
  assert.equal(player.weapon.root.parent, mount);

  const prefab = new T.Group();
  const marker = new T.Group();
  marker.name = 'Magazine';
  marker.position.set(0, .05, -.18);
  const magazine = new T.Group();
  magazine.name = 'MagazineMesh';
  magazine.position.copy(marker.position);
  prefab.add(marker, magazine);
  player.weapon.reload(.5);
  player.weapon.attachModel(prefab);
  player.weapon.reload(-1);
  const seated = player.weapon.sockets.Magazine.getWorldPosition(new T.Vector3());
  assert.ok(seated.distanceTo(magazine.getWorldPosition(new T.Vector3())) < 1e-9);
  player.dispose();
});

test('stance travels at ground speed and stationary or dead rigs stop stepping', () => {
  const state = new CharacterAnimation();
  for (let i = 0; i < 60; i++) state.update(1 / 60, 5.8, 0, false, false, true, 0, 0);
  const previous = state.phase;
  state.update(1 / 60, 5.8, 0, false, false, true, 0, 0);
  const cycles = ((state.phase - previous + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
  assert.ok(Math.abs(cycles * 60 * 2 * state.stride / state.stance - state.speed) < .001);
  for (let i = 0; i < 120; i++) state.update(1 / 60, 0, 0, false, false, true, 0, 0);
  const rest = state.phase;
  state.update(.1, 0, 0, false, false, true, 0, 0);
  assert.equal(state.phase, rest);
  state.update(.1, 0, 0, false, false, true, 0, 0, 5);
  assert.notEqual(state.phase, rest);
  const death = state.phase;
  state.update(.1, 5, 0, false, false, false, 0, 0, 5);
  assert.equal(state.phase, death);
});
