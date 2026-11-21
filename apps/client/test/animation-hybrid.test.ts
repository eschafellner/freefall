/**
 * Hybrid character animation: humanoid mapping, retargeting, upper-body layering, server-timed clips, procedural
 * overlays and the procedural fallback. All skeletons and clips here are synthetic test fixtures built in code.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { newPosture } from '@freefall/shared';
import { CharacterAnimation } from '../src/rendering/characters/CharacterAnimation.ts';
import { CharacterClipPlayer } from '../src/rendering/characters/CharacterClipPlayer.ts';
import { PlayerVisualController } from '../src/rendering/characters/PlayerVisualController.ts';
import { createSoldierParts } from '../src/rendering/characters/SoldierRig.ts';
import { TACTICAL_LOOPS, TACTICAL_ONCE, TACTICAL_OVERLAYS } from '../src/rendering/characters/TacticalAnimation.ts';
import { prepareCharacterClips } from '../src/rendering/characters/animation/CharacterClipSet.ts';
import { CLIP_REQUIREMENTS, clipCoverage } from '../src/rendering/characters/animation/ClipLibrary.ts';
import { SKELETON_PRESETS, matchHumanoid } from '../src/rendering/characters/animation/HumanoidSkeleton.ts';
import type { HumanoidBone, SkeletonPreset } from '../src/rendering/characters/animation/HumanoidSkeleton.ts';
import { findNode, retargetClip, sameRig } from '../src/rendering/characters/animation/Retargeting.ts';
import { SkeletonOverlay, solveTwoBoneIK } from '../src/rendering/characters/animation/SkeletonOverlay.ts';
import { createKestrel } from '../src/rendering/weapons/Kestrel.ts';

const LAYOUT: [HumanoidBone, HumanoidBone | undefined, [number, number, number]][] = [
  ['hips', undefined, [0, 1, 0]], ['spine', 'hips', [0, .1, 0]], ['chest', 'spine', [0, .15, 0]],
  ['upperChest', 'chest', [0, .15, 0]], ['neck', 'upperChest', [0, .12, 0]], ['head', 'neck', [0, .1, 0]],
  ['leftShoulder', 'upperChest', [-.08, .08, 0]], ['leftUpperArm', 'leftShoulder', [-.12, 0, 0]],
  ['leftLowerArm', 'leftUpperArm', [-.28, 0, 0]], ['leftHand', 'leftLowerArm', [-.25, 0, 0]],
  ['rightShoulder', 'upperChest', [.08, .08, 0]], ['rightUpperArm', 'rightShoulder', [.12, 0, 0]],
  ['rightLowerArm', 'rightUpperArm', [.28, 0, 0]], ['rightHand', 'rightLowerArm', [.25, 0, 0]],
  ['leftUpperLeg', 'hips', [-.1, -.05, 0]], ['leftLowerLeg', 'leftUpperLeg', [0, -.45, 0]],
  ['leftFoot', 'leftLowerLeg', [0, -.42, 0]], ['leftToes', 'leftFoot', [0, -.05, -.12]],
  ['rightUpperLeg', 'hips', [.1, -.05, 0]], ['rightLowerLeg', 'rightUpperLeg', [0, -.45, 0]],
  ['rightFoot', 'rightLowerLeg', [0, -.42, 0]], ['rightToes', 'rightFoot', [0, -.05, -.12]],
];

/**
 * Builds a rest-pose humanoid. `twist` gives every bone a different rest rotation (with positions rotated back),
 * which is what differently authored rigs look like to the retargeter. `scale` changes proportions.
 */
function rig(preset: SkeletonPreset, options: { twist?: boolean; scale?: number; sanitize?: boolean } = {}) {
  const root = new T.Group();
  const bones = new Map<HumanoidBone, T.Bone>();
  const scale = options.scale ?? 1;
  for (const [role, parent, offset] of LAYOUT) {
    const bone = new T.Bone();
    const name = SKELETON_PRESETS[preset][role]!;
    bone.name = options.sanitize ? T.PropertyBinding.sanitizeNodeName(name) : name;
    (parent ? bones.get(parent)! : root).add(bone);
    const position = new T.Vector3(...offset).multiplyScalar(scale);
    if (options.twist) {
      // Rest rotation q in parent space; express the offset in the bone's own frame of the parent.
      bone.quaternion.setFromEuler(new T.Euler(.4 * (bones.size % 3), .7, -.3 * (bones.size % 2)));
    }
    const parentNode = parent ? bones.get(parent)! : undefined;
    if (parentNode) position.applyQuaternion(new T.Quaternion()); // offsets are authored in parent space
    bone.position.copy(position);
    bones.set(role, bone);
  }
  root.updateMatrixWorld(true);
  return { root, bones };
}

function rootOrientation(root: T.Object3D, node: T.Object3D): T.Quaternion {
  root.updateMatrixWorld(true);
  const m = root.matrixWorld.clone().invert().multiply(node.matrixWorld);
  const q = new T.Quaternion();
  m.decompose(new T.Vector3(), q, new T.Vector3());
  return q;
}

function boneTrack(node: T.Object3D, times: number[], rotations: T.Quaternion[]): T.QuaternionKeyframeTrack {
  return new T.QuaternionKeyframeTrack(`${T.PropertyBinding.sanitizeNodeName(node.name)}.quaternion`, times,
    rotations.flatMap((q) => [q.x, q.y, q.z, q.w]));
}

const about = (axis: [number, number, number], angle: number) => new T.Quaternion().setFromAxisAngle(new T.Vector3(...axis).normalize(), angle);
/** Keyframe values are Float32, so equal rotations differ by up to ~3e-4 rad through acos. */
const angle = (a: T.Quaternion, b: T.Quaternion) => a.angleTo(b);

test('humanoid roles are detected from presets, including glTF-sanitized names, and can be overridden', () => {
  const mixamo = rig('mixamo', { sanitize: true });
  const names: string[] = [];
  mixamo.root.traverse((node) => node.name && names.push(node.name));
  const match = matchHumanoid(names);
  assert.equal(match.preset, 'mixamo');
  assert.equal(match.complete, true);
  assert.equal(match.bones.hips, 'mixamorigHips');
  const unreal = matchHumanoid(['pelvis', 'spine_01', 'head']);
  assert.equal(unreal.preset, 'unreal');
  assert.ok(unreal.missing.includes('leftHand'));
  const custom = matchHumanoid([...names, 'Pelvis_Custom'], { bones: { hips: 'Pelvis_Custom' } });
  assert.equal(custom.bones.hips, 'Pelvis_Custom');
  assert.equal(matchHumanoid(['Cube', 'Light']).preset, undefined);
});

test('retargeting transfers root-space rotation deltas onto a rig with other names, rest poses and proportions', () => {
  // GLTFLoader stores sanitized node names ("mixamorigHips"); the clip binds to those.
  const source = rig('mixamo', { sanitize: true });
  const target = rig('freefall', { twist: true, scale: .9 });
  const sourceMap = matchHumanoid([...source.bones.values()].map((b) => b.name)).bones;
  const targetMap = matchHumanoid([...target.bones.values()].map((b) => b.name)).bones;
  const arm = source.bones.get('leftUpperArm')!;
  const spine = source.bones.get('spine')!;
  const hips = source.bones.get('hips')!;
  const clip = new T.AnimationClip('Reload', 1, [
    boneTrack(arm, [0, 1], [arm.quaternion.clone(), about([0, 0, 1], -1.1).multiply(arm.quaternion)]),
    boneTrack(spine, [0, .5, 1], [spine.quaternion.clone(), about([1, 0, 0], .35), about([0, 1, 0], .5)]),
    new T.VectorKeyframeTrack(`${hips.name.replace(':', '')}.position`, [0, 1], [0, 1, 0, 0, .9, 0]),
  ]);
  const from = { root: source.root, bones: sourceMap };
  const to = { root: target.root, bones: targetMap };
  assert.equal(sameRig(from, to), false);
  const rest = new Map([...target.bones].map(([role, bone]) => [role, rootOrientation(target.root, bone)]));
  const sourceRest = new Map([...source.bones].map(([role, bone]) => [role, rootOrientation(source.root, bone)]));
  const result = retargetClip(clip, from, to);
  assert.ok(result.tracks.every((track) => !track.name.includes('mixamo')));

  for (const time of [0, .37, .5, 1]) {
    const sourceMixer = new T.AnimationMixer(source.root);
    sourceMixer.clipAction(clip).play();
    sourceMixer.setTime(time);
    const targetMixer = new T.AnimationMixer(target.root);
    targetMixer.clipAction(result).play();
    targetMixer.setTime(time);
    for (const role of ['spine', 'chest', 'leftUpperArm', 'leftLowerArm', 'head'] as const) {
      const sourceDelta = rootOrientation(source.root, source.bones.get(role)!).multiply(sourceRest.get(role)!.clone().invert());
      const targetDelta = rootOrientation(target.root, target.bones.get(role)!).multiply(rest.get(role)!.clone().invert());
      assert.ok(angle(sourceDelta, targetDelta) < 2e-3, `${role} at ${time}: ${angle(sourceDelta, targetDelta)}`);
    }
    sourceMixer.stopAllAction();
    targetMixer.stopAllAction();
  }
  // Hips drop 10 cm on the source; the 90 % rig drops 9 cm.
  const targetMixer = new T.AnimationMixer(target.root);
  targetMixer.clipAction(result).play();
  targetMixer.setTime(.999); // a looping action wraps at its duration
  assert.ok(Math.abs(target.bones.get('hips')!.position.y - (.9 - .1 * .9 * .999)) < 1e-3, `hips ${target.bones.get('hips')!.position.y}`);
});

test('packs on the same skeleton are used as they are, other skeletons are retargeted', () => {
  const model = rig('freefall');
  const same = rig('freefall');
  const other = rig('mixamo', { twist: true });
  const idle = new T.AnimationClip('Idle', 1, [boneTrack(same.bones.get('head')!, [0, 1], [new T.Quaternion(), about([0, 1, 0], .2)])]);
  const walk = new T.AnimationClip('Walk', 1, [boneTrack(other.bones.get('head')!, [0, 1], [other.bones.get('head')!.quaternion.clone(), about([0, 1, 0], .2)])]);
  const prepared = prepareCharacterClips(model.root, [], [
    { scene: same.root, animations: [idle], label: 'same.glb' },
    { scene: other.root, animations: [walk], label: 'other.glb' },
  ]);
  assert.equal(prepared.clips[0], idle);
  assert.notEqual(prepared.clips[1], walk);
  assert.equal(prepared.clips[1].name, 'Walk');
  assert.match(prepared.notes[0], /direkt übernommen/);
  assert.match(prepared.notes[1], /retargeted \(mixamo → freefall\)/);
});

function animated() {
  const model = rig('freefall');
  const b = (role: HumanoidBone) => model.bones.get(role)!;
  const pose = (name: string, duration: number, legs: number, arms: number) => new T.AnimationClip(name, duration, [
    boneTrack(b('leftUpperLeg'), [0, duration], [about([1, 0, 0], legs), about([1, 0, 0], legs)]),
    boneTrack(b('leftUpperArm'), [0, duration], [about([1, 0, 0], arms), about([1, 0, 0], arms)]),
  ]);
  const ramp = (name: string, duration: number) => new T.AnimationClip(name, duration, [
    boneTrack(b('leftUpperLeg'), [0, duration], [about([1, 0, 0], 0), about([1, 0, 0], 1)]),
  ]);
  return { model, b, pose, ramp };
}

test('an upper-body reload layer replaces the arms while the legs keep the locomotion clip', () => {
  const { model, b, pose } = animated();
  const clips = [pose('Idle', 1, .3, .3), pose('Walk', 1, .3, .3), pose('Reload', 2, -1, -1.2)];
  const player = new CharacterClipPlayer(model.root, clips, { path: 'x.glb' });
  assert.equal(player.layered, true);
  const state = new CharacterAnimation();
  player.update(state, 1 / 60);
  assert.ok(angle(b('leftUpperArm').quaternion, about([1, 0, 0], .3)) < 1e-3);
  state.combat = 'reload';
  state.reload = .5;
  for (let i = 0; i < 30; i++) player.update(state, 1 / 60);
  assert.equal(player.overlayClip, 'reload');
  assert.ok(Math.abs(player.overlayWeight - 1) < 1e-9);
  assert.ok(angle(b('leftUpperArm').quaternion, about([1, 0, 0], -1.2)) < 1e-3, 'arms follow the reload clip');
  assert.ok(angle(b('leftUpperLeg').quaternion, about([1, 0, 0], .3)) < 1e-3, 'legs stay on the base layer');
  state.combat = 'ready';
  state.reload = -1;
  player.update(state, .1);
  assert.ok(player.overlayWeight > 0 && player.overlayWeight < 1, 'the layer fades out');
  for (let i = 0; i < 20; i++) player.update(state, 1 / 60);
  assert.equal(player.overlayWeight, 0);
  assert.ok(angle(b('leftUpperArm').quaternion, about([1, 0, 0], .3)) < 1e-3);
});

test('server-timed clips follow server progress and the pistol reload falls back to the rifle clip', () => {
  const { model, b, pose, ramp } = animated();
  const reload = new T.AnimationClip('Reload', 2, [boneTrack(b('leftUpperArm'), [0, 2], [about([1, 0, 0], 0), about([1, 0, 0], 1)])]);
  const player = new CharacterClipPlayer(model.root, [pose('Idle', 1, 0, 0), pose('Walk', 1, 0, 0), ramp('CrouchEnter', .5), reload], { path: 'x.glb' });
  const state = new CharacterAnimation();
  state.tactical.clip = 'crouchEnter';
  state.tactical.progress = .25;
  for (let i = 0; i < 10; i++) player.update(state, 1 / 60);
  assert.equal(player.baseClip, 'crouchEnter');
  assert.ok(angle(b('leftUpperLeg').quaternion, about([1, 0, 0], .25)) < 1e-3, 'posture clip at server progress');
  state.tactical.clip = state.tactical.progress = undefined;
  state.weaponSlot = 'secondary';
  state.combat = 'reload';
  state.reload = .8;
  for (let i = 0; i < 20; i++) player.update(state, 1 / 60);
  assert.equal(player.overlayClip, 'reload');
  assert.ok(angle(b('leftUpperArm').quaternion, about([1, 0, 0], .8)) < 1e-3, `reload clip at server progress: ${b('leftUpperArm').quaternion.toArray()}`);
});

test('slide start, loop and end use their own server-driven clip time', () => {
  const { model, b, pose, ramp } = animated();
  const clips = [pose('Idle', 1, 0, 0), pose('Walk', 1, 0, 0), ramp('SlideStart', .5), ramp('SlideLoop', 2), ramp('SlideEnd', 1)];
  const player = new CharacterClipPlayer(model.root, clips, { path: 'x.glb' });
  const state = new CharacterAnimation();
  const slide = { ...newPosture(), current: 'SLIDING' as const, started: 10, until: 30 };
  for (const [tick, clip] of [[12, 'slideStart'], [20, 'slideLoop'], [28, 'slideEnd']] as const) {
    state.tactical.update(slide, tick, 1 / 60, state);
    for (let i = 0; i < 10; i++) player.update(state, 1 / 60);
    assert.equal(player.baseClip, clip);
    assert.ok(angle(b('leftUpperLeg').quaternion, about([1, 0, 0], .5)) < 1e-3);
  }
  state.tactical.update({ ...slide, from: 'SLIDING', current: 'CROUCHING', started: 30 }, 30, 1 / 60, state);
  assert.equal(state.tactical.clip, 'crouchIdle');
});

test('base clips crossfade linearly and gait changes keep the step phase', () => {
  const { model, pose } = animated();
  const player = new CharacterClipPlayer(model.root, [pose('Idle', 1, 0, 0), pose('Walk', 1, .5, 0), pose('Run', .6, .5, 0)], { path: 'x.glb' });
  const state = new CharacterAnimation();
  player.update(state, 1 / 60);
  state.locomotion = 'walk';
  player.update(state, .075);
  const weights = (player as unknown as { active: Set<{ id: string; weight: number }> }).active;
  const byId = Object.fromEntries([...weights].map((entry) => [entry.id, entry.weight]));
  assert.ok(Math.abs(byId.walk - .5) < 1e-9 && Math.abs(byId.idle - .5) < 1e-9, JSON.stringify(byId));
  for (let i = 0; i < 30; i++) player.update(state, 1 / 60);
  assert.deepEqual([...weights].map((entry) => entry.id), ['walk']);
  const walk = [...weights][0] as unknown as { actions: T.AnimationAction[]; duration: number };
  const phase = (walk.actions[0].time / walk.duration) % 1;
  state.locomotion = 'run';
  player.update(state, 0);
  const run = [...weights].find((entry) => entry.id === 'run') as unknown as { actions: T.AnimationAction[]; duration: number };
  assert.ok(Math.abs(run.actions[0].time / run.duration - phase) < 1e-9);
});

test('the look overlay pitches the head with the view and two-bone IK reaches its target', () => {
  const { root, bones } = rig('freefall');
  const map = matchHumanoid([...bones.values()].map((b) => b.name)).bones;
  const overlay = new SkeletonOverlay(root, map, true);
  const head = bones.get('head')!;
  const before = new T.Vector3(0, 0, -1).applyQuaternion(head.getWorldQuaternion(new T.Quaternion()));
  overlay.apply({ pitch: .4, yaw: 0, look: 1, kick: 0 });
  const after = new T.Vector3(0, 0, -1).applyQuaternion(head.getWorldQuaternion(new T.Quaternion()));
  assert.ok(Math.abs(before.angleTo(after) - .4) < 1e-6);
  assert.ok(after.y > before.y, 'positive pitch looks up');

  const target = new T.Vector3(-.1, .25, -.2);
  solveTwoBoneIK(bones.get('leftUpperLeg')!, bones.get('leftLowerLeg')!, bones.get('leftFoot')!, target, new T.Vector3(-.1, .6, -1));
  assert.ok(bones.get('leftFoot')!.getWorldPosition(new T.Vector3()).distanceTo(target) < 1e-6);
  const knee = bones.get('leftLowerLeg')!.getWorldPosition(new T.Vector3());
  assert.ok(knee.z < -.05, 'the knee bends toward the pole');
});

test('foot IK lifts a foot that a clip pushes into the ground and leaves planted feet alone', () => {
  const { root, bones } = rig('freefall');
  const map = matchHumanoid([...bones.values()].map((b) => b.name)).bones;
  const overlay = new SkeletonOverlay(root, map, true);
  const foot = bones.get('leftFoot')!;
  const rest = foot.getWorldPosition(new T.Vector3()).y;
  overlay.apply({ pitch: 0, yaw: 0, look: 0, kick: 0, ground: 0 });
  assert.ok(Math.abs(foot.getWorldPosition(new T.Vector3()).y - rest) < 1e-9);
  bones.get('hips')!.position.y -= .08;
  root.updateMatrixWorld(true);
  overlay.apply({ pitch: 0, yaw: 0, look: 0, kick: 0, ground: 0 });
  assert.ok(Math.abs(foot.getWorldPosition(new T.Vector3()).y - rest) < 1e-6, 'ankle back at its rest height');
});

test('the procedural rig stays the fallback for states whose GLB clip is missing', () => {
  const player = new PlayerVisualController(createSoldierParts(), createKestrel(), 0x73d5e7);
  const { model, pose } = animated();
  const mount = new T.Group();
  mount.name = 'PrimaryWeapon';
  model.bones.get('rightHand')!.add(mount);
  player.attachCharacter(model.root, [pose('Idle', 1, 0, 0), pose('Walk', 1, 0, 0), pose('ProneIdle', 1, 0, 0)], { path: 'x.glb' });
  const [procedural, imported] = player.root.children;
  const draw = (posture?: ReturnType<typeof newPosture>, tick = 0) =>
    player.draw('p', 1, 100, 0, 0, 0, 0, false, false, 0, tick, 0, 1 / 60, true, undefined, posture);
  draw();
  assert.equal(imported.visible, true);
  assert.equal(procedural.visible, false);
  const prone = { ...newPosture(0), current: 'PRONE' as const };
  draw(prone);
  assert.equal(imported.visible, true, 'prone idle exists as a clip');
  const supine = { ...newPosture(0), current: 'SUPINE' as const };
  draw(supine);
  assert.equal(imported.visible, false, 'no supine clip: procedural rig');
  assert.equal(procedural.visible, true);
  assert.equal(player.slots.SecondaryWeapon.parent, procedural);
  assert.ok(player.clipCoverage?.missingCore.supine?.includes('supineIdle'));
  const slide = { ...newPosture(), current: 'SLIDING' as const, until: 20 };
  for (let i = 0; i < 30; i++) draw(slide, 10);
  assert.equal(imported.visible, false);
  assert.equal(procedural.visible, true);
  assert.deepEqual(player.clipCoverage?.missingCore.slide, ['slideStart', 'slideLoop', 'slideEnd']);
  player.dispose();
});

test('the clip contract covers every tactical clip once and reports gaps per group', () => {
  const ids = CLIP_REQUIREMENTS.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const clip of [...TACTICAL_LOOPS, ...TACTICAL_ONCE, ...TACTICAL_OVERLAYS]) assert.ok(ids.includes(clip), clip);
  const minimal = clipCoverage(['idle', 'run']);
  assert.equal(minimal.usable, true);
  assert.ok(!minimal.missingCore.locomotion?.includes('walk'), 'Run stands in for Walk');
  assert.ok(minimal.missingCore.reload?.includes('reload'));
  assert.ok(minimal.missingCore.stim?.includes('stim'));
  assert.equal(clipCoverage(['walk']).usable, false);
  assert.ok(findNode(rig('freefall').root, 'LeftHand'));
});

test('sparse ground overlays leave gait and unkeyed upper-body tracks on the base layer', () => {
  const { model, b, pose } = animated();
  const head = b('head');
  const nod = about([0, 0, 1], .44);
  const crawl = pose('proneCrawl', 2, .92, .26);
  crawl.tracks.push(boneTrack(head, [0, 2], [nod, nod]));
  const reload = pose('proneReload', 2, -1, -.6);
  const player = new CharacterClipPlayer(model.root, [crawl, reload], { path: 'test.glb' });
  const state = new CharacterAnimation();
  state.tactical.clip = 'proneCrawl';
  state.tactical.overlay = 'proneReload';
  state.reload = .35;
  player.update(state, .15);
  assert.equal(player.baseClip, 'proneCrawl');
  assert.equal(player.overlayClip, 'proneReload');
  assert.ok(angle(head.quaternion, nod) < 1e-3);
  const time = player.baseTime;
  state.tactical.overlay = undefined;
  state.reload = -1;
  player.update(state, .25);
  assert.equal(player.overlayWeight, 0);
  assert.ok(player.baseTime > time);
  assert.ok(angle(head.quaternion, nod) < 1e-3);
  player.dispose();
});

test('invalid clip bindings and root transforms cannot satisfy required coverage', () => {
  const { model, pose } = animated();
  model.root.name = 'Character';
  const stranger = new T.VectorKeyframeTrack('Unknown.position', [0, 1], [0, 0, 0, 1, 2, 3]);
  const root = new T.VectorKeyframeTrack('Character.position', [0, 1], [0, 0, 0, 1, 2, 3]);
  const player = new CharacterClipPlayer(model.root, [new T.AnimationClip('Walk', 1, [stranger, root]), pose('idle', 1, 0, 0)], { path: 'test.glb' });
  assert.equal(player.has('walk'), false);
  assert.equal(player.ready, false);
  assert.deepEqual(model.root.position.toArray(), [0, 0, 0]);
  player.dispose();
});

test('remote shot animation waits for its render tick and drops shot echoes from other lives', () => {
  const player = new PlayerVisualController(createSoldierParts(), createKestrel(), 0x73d5e7);
  const posture = { ...newPosture(), current: 'SUPINE' as const };
  const draw = (tick: number, life = 1) => player.draw('p', life, 100, 0, 0, 0, 0, false, false, 0, tick, 0, 1 / 60, false, undefined, posture);
  const shot = { shooter: 'p', tick: 20, life: 1, fromX: 0, fromY: .4, fromZ: 0, toX: 0, toY: 1, toZ: -5, enemy: 0, eliminated: false };
  draw(16);
  player.queueShot(shot);
  player.queueShot(shot);
  draw(19);
  assert.equal(player.animation.kick, 0);
  draw(20);
  assert.equal(player.animation.tactical.overlay, 'supineFire');
  const kick = player.animation.kick;
  player.queueShot(shot);
  draw(20.3);
  assert.ok(player.animation.kick < kick);
  player.queueShot({ ...shot, tick: 21 });
  draw(21, 2);
  assert.equal(player.animation.kick, 0);
  player.dispose();
});
