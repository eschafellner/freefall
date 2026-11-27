import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { BALANCE, BASE_LOADOUT, newPosture } from '@freefall/shared';
import type { EquipmentState, PostureState } from '@freefall/shared';
import { PlayerVisualController } from '../src/rendering/characters/PlayerVisualController.ts';
import { DEFAULT_LOOK, LOOK_PRESETS, WARDROBE, createOperatorWardrobe } from '../src/rendering/characters/operator/Catalog.ts';
import { BODY, OPERATOR_BONES } from '../src/rendering/characters/operator/OperatorSkeleton.ts';
import { GRIP_POINT } from '../src/rendering/characters/operator/kit/Parts.ts';
import { PlayerRigBatches } from '../src/rendering/characters/PlayerRigBatches.ts';
import { createKestrel } from '../src/rendering/weapons/Kestrel.ts';

const wardrobe = createOperatorWardrobe();
const rifle = createKestrel();

function operator(): PlayerVisualController {
  return new PlayerVisualController(wardrobe, rifle, 0x73d5e7);
}

/** Draws `frames` at 60 Hz; returns the next frame index. */
function run(player: PlayerVisualController, frames: number, options: {
  start?: number; x?: (f: number) => number; z?: (f: number) => number; yaw?: (f: number) => number; aim?: boolean;
  hp?: number; posture?: PostureState; gear?: EquipmentState; reloadUntil?: number;
} = {}): number {
  const start = options.start ?? 0;
  for (let f = start; f < start + frames; f++) {
    const tick = Math.floor(f / 2);
    player.draw('op', 1, options.hp ?? 100, options.x?.(f) ?? 0, options.z?.(f) ?? 0, options.yaw?.(f) ?? 0, 0, !!options.aim, false,
      options.reloadUntil ?? 0, tick, f * 1000 / 60, 1 / 60, true, options.gear, options.posture);
  }
  player.root.updateMatrixWorld(true);
  return start + frames;
}

const world = (object: T.Object3D, local: readonly [number, number, number] = [0, 0, 0]) =>
  new T.Vector3(...local).applyMatrix4(object.matrixWorld);

test('every look stays within the character budget with valid, normalised skin weights', () => {
  assert.ok(OPERATOR_BONES.length <= 80, 'bone budget');
  const looks = [...Object.values(LOOK_PRESETS), DEFAULT_LOOK];
  for (const look of looks) {
    const compiled = wardrobe.look(look);
    assert.ok(compiled.triangles <= 25_000, `${compiled.key}: ${compiled.triangles} triangles`);
    for (const geometry of Object.values(compiled.geometries)) {
      const index = geometry!.getAttribute('skinIndex');
      const weight = geometry!.getAttribute('skinWeight');
      for (let i = 0; i < weight.count; i += 7) {
        const sum = weight.getX(i) + weight.getY(i) + weight.getZ(i) + weight.getW(i);
        assert.ok(Math.abs(sum - 1) < 1e-4, `weights sum to one (${sum})`);
        for (const k of [index.getX(i), index.getY(i), index.getZ(i), index.getW(i)]) assert.ok(k < OPERATOR_BONES.length);
      }
    }
  }
  for (const slot of ['armor', 'helmet', 'pack'] as const) assert.ok(WARDROBE.filter((item) => item.slot === slot).length >= 2, slot);
});

test('looks swap at runtime, share geometry and fall back per slot for unknown ids', () => {
  const a = operator(), b = operator();
  a.setLook(LOOK_PRESETS.schwer);
  b.setLook({ armor: 'bw9', helmet: 'bw9-helm', pack: 'versorgung' });
  const meshes = (player: PlayerVisualController) => {
    const found: T.SkinnedMesh[] = [];
    player.rig.root.traverse((node) => { if (node instanceof T.SkinnedMesh) found.push(node); });
    return found;
  };
  assert.equal(meshes(a).length, 2, 'two draws per operator: cloth and plate');
  assert.deepEqual(meshes(a).map((mesh) => mesh.geometry), meshes(b).map((mesh) => mesh.geometry), 'shared geometry');
  const heavy = meshes(a)[0].geometry;
  a.setLook({ armor: 'unbekannt', helmet: 'bw9-helm', pack: 'funk' });
  assert.equal(a.rig.compiled?.key, `${DEFAULT_LOOK.armor}|bw9-helm|funk`);
  assert.notEqual(meshes(a)[0].geometry, heavy);
  a.setLook(undefined);
  assert.equal(a.rig.compiled?.key, `${DEFAULT_LOOK.armor}|${DEFAULT_LOOK.helmet}|${DEFAULT_LOOK.pack}`);
  // The backpack slot follows the pack's anchor.
  a.setLook(LOOK_PRESETS.schwer);
  run(a, 2);
  assert.equal(a.slots.Backpack.parent, a.rig.bones.Backpack);
  a.dispose();
  b.dispose();
});

test('both fists close on the weapon at rest and while aiming', () => {
  const player = operator();
  for (const aim of [false, true]) {
    run(player, 90, { aim, yaw: () => .4 });
    const weapon = player.weapon;
    const right = world(player.rig.bones.RightHand, GRIP_POINT(1));
    const grip = world(weapon.sockets.Grip, [0, -.016, .014]);
    assert.ok(right.distanceTo(grip) < .015, `trigger hand on the grip (${right.distanceTo(grip).toFixed(3)} m, aim ${aim})`);
    const left = world(player.rig.bones.LeftHand, GRIP_POINT(-1));
    const forend = world(weapon.sockets.SupportHand);
    assert.ok(left.distanceTo(forend) < .03, `support hand on the handguard (${left.distanceTo(forend).toFixed(3)} m, aim ${aim})`);
  }
  player.dispose();
});

test('standing feet rest on the ground and stay planted through small turns', () => {
  const player = operator();
  let f = run(player, 120);
  const feet = [player.rig.bones.LeftFoot, player.rig.bones.RightFoot];
  for (const foot of feet) assert.ok(Math.abs(world(foot).y - BODY.ankle) < .012, `ankle height ${world(foot).y}`);
  const before = feet.map((foot) => world(foot));
  // A small turn keeps the feet where they are; the knees and hips absorb it.
  f = run(player, 30, { start: f, yaw: (i) => Math.min(.2, (i - f) * .02) });
  feet.forEach((foot, i) => assert.ok(world(foot).distanceTo(before[i]) < .004, 'planted foot does not slide'));
  // A quarter turn makes the operator step round; both feet end near their stance beside the body again.
  f = run(player, 150, { start: f, yaw: (i) => Math.min(Math.PI / 2, .2 + (i - f) * .05) });
  const hips = world(player.rig.bones.Hips);
  for (const foot of feet) {
    const offset = world(foot).sub(hips);
    assert.ok(Math.hypot(offset.x, offset.z) < .25, 'feet stepped under the body');
    assert.ok(Math.abs(world(foot).y - BODY.ankle) < .012, 'and are planted again');
  }
  player.dispose();
});

test('running feet touch the ground once per stride and the stance foot does not skate', () => {
  const player = operator();
  let f = run(player, 60, { z: (i) => -i * 5.8 / 60 });
  const lows: number[] = [];
  let skate = 0;
  let last: T.Vector3 | undefined;
  for (let i = 0; i < 60; i++) {
    f = run(player, 1, { start: f, z: (k) => -k * 5.8 / 60 });
    const ankle = world(player.rig.bones.LeftFoot);
    lows.push(ankle.y);
    // While the foot is down (flat or rolling), its world position should barely move.
    if (ankle.y < BODY.ankle + .02 && last && last.y < BODY.ankle + .02) skate = Math.max(skate, Math.abs(ankle.z - last.z));
    last = ankle;
  }
  assert.ok(Math.min(...lows) < BODY.ankle + .02, 'foot reaches the ground');
  assert.ok(Math.max(...lows) > BODY.ankle + .12, 'and lifts in the swing');
  assert.ok(skate < .06, `stance foot skates at most a few centimetres per frame (${skate.toFixed(3)})`);
  player.dispose();
});

test('every posture, action and the death fall pose without invalid transforms', () => {
  const player = operator();
  const yaw = 0;
  const postures: PostureState[] = [
    { ...newPosture(yaw), current: 'CROUCHING', requested: 'CROUCHING', started: 0, until: 6 },
    { ...newPosture(yaw), current: 'SLIDING', requested: 'SLIDING', started: 0, until: 18 },
    { ...newPosture(yaw), current: 'PRONE', requested: 'PRONE', started: 0, until: 6 },
    { ...newPosture(yaw), current: 'SUPINE', requested: 'SUPINE', started: 0, until: 6 },
    { ...newPosture(yaw), current: 'GETTING_UP', requested: 'STANDING', from: 'PRONE', started: 0, until: 24 },
    { ...newPosture(yaw), current: 'DIVING', requested: 'PRONE', started: 0, until: 23,
      dive: { id: 1, x: 0, z: -1, yaw, from: 'STANDING', landing: 'PRONE', originX: 0, originZ: 0, started: 0, takeoff: 3, until: 23, distance: 5, arcHeight: .62 } },
  ];
  const gear = (action: EquipmentState['action'], until: number, actionAt?: number): EquipmentState =>
    ({ slot: 'primary', inactiveAmmo: 0, magazines: { primary: 1, secondary: 1 }, grenades: 1, stims: 1, action, started: 0, until, actionAt, stimResultAt: 0, meleeReadyAt: 0 });
  const finite = () => {
    for (const bone of Object.values(player.rig.bones)) {
      const { x, y, z, w } = bone.quaternion;
      assert.ok([x, y, z, w, bone.position.x, bone.position.y, bone.position.z].every(Number.isFinite), bone.name);
    }
  };
  let f = 0;
  for (const posture of postures) {
    f = run(player, 50, { start: f, posture, z: (i) => -i * .02 });
    finite();
  }
  for (const [action, until, at] of [['grenade', 30, 14], ['melee', 20, 7], ['stim', 36, undefined], ['secondary', 18, undefined]] as const) {
    f = run(player, 40, { start: 0, gear: gear(action, until, at) });
    finite();
  }
  run(player, 30, { start: 0, reloadUntil: 63 });
  finite();
  run(player, 60, { start: 0, hp: 0 });
  finite();
  // The fallen body lies on the ground.
  assert.ok(world(player.rig.bones.Hips).y < .45, 'fallen');
  player.dispose();
});

test('skinned bodies follow a transport and hide outside the view', () => {
  const scene = new T.Scene();
  const player = operator();
  scene.add(player.root);
  run(player, 2);
  const batches = new PlayerRigBatches(scene, [player.root]);
  const camera = new T.PerspectiveCamera(60, 1, .1, 100);
  camera.position.set(0, 1.5, 5);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  const body = player.rig.root.children.find((node): node is T.SkinnedMesh => node instanceof T.SkinnedMesh)!;
  batches.draw(camera);
  assert.equal(body.visible, true);
  assert.ok(body.matrixWorld.equals(new T.Matrix4()), 'no transport: identity');
  PlayerRigBatches.setTransport(scene, new Map([[0, new T.Vector3(0, 12, 0)]]));
  batches.draw(camera);
  assert.equal(body.matrixWorld.elements[13], 12, 'lifted with the Albatross');
  PlayerRigBatches.setTransport(scene, undefined);
  camera.lookAt(0, 1, 20);
  camera.updateMatrixWorld();
  batches.draw(camera);
  assert.equal(body.visible, false, 'culled with its rig');
  batches.dispose();
  player.dispose();
});

test('every body armour and backpack of the balance data has its look in the wardrobe', () => {
  for (const armor of BALANCE.bodyArmors.values()) {
    assert.ok(wardrobe.has(armor.visual.armor, 'armor'), armor.id);
    assert.ok(wardrobe.has(armor.visual.helmet, 'helmet'), armor.id);
  }
  for (const pack of BALANCE.backpacks.values()) assert.ok(wardrobe.has(pack.visual, 'pack'), pack.id);
  // Snapshots omit the standard look, so the client default must be exactly the standard loadout's look.
  assert.deepEqual({ ...BASE_LOADOUT.look }, { ...DEFAULT_LOOK });
});
