/**
 * Procedural additions on top of GLB clips, applied after the mixer each frame:
 *   - look and aim: the spine chain, neck and head turn toward the view pitch and the yaw offset from the body,
 *   - recoil: a short chest kick from the shot impulse,
 *   - foot IK (opt-in per asset): a two-bone solve lifts a foot that a clip pushes below the ground.
 * All rotations are applied in world space around the character's own axes, so they work on any retargeted rig
 * whose bones have arbitrary local axes.
 */
import * as T from 'three';
import { findNode } from './Retargeting.ts';
import type { HumanoidBone, HumanoidBoneMap } from './HumanoidSkeleton.ts';

/** Share of the look rotation per bone. Missing bones hand their share to the remaining ones. */
const LOOK_CHAIN: readonly (readonly [HumanoidBone, number])[] = [
  ['spine', .22], ['chest', .28], ['upperChest', .15], ['neck', .17], ['head', .18],
];
const MAX_LOOK_YAW = 1.05;
const KICK_PITCH = .07;
/** Foot corrections below this depth (m) are left to the clip. */
const FOOT_TOLERANCE = .01;

const right = new T.Vector3();
const up = new T.Vector3(0, 1, 0);
const rotation = new T.Quaternion();
const turn = new T.Quaternion();
const world = new T.Quaternion();
const parentWorld = new T.Quaternion();
const a = new T.Vector3();
const b = new T.Vector3();
const c = new T.Vector3();
const direction = new T.Vector3();
const pole = new T.Vector3();
const knee = new T.Vector3();
const goal = new T.Vector3();

/** Rotates `bone` by the world-space rotation `q` and refreshes its subtree's world matrices. */
export function rotateWorld(bone: T.Object3D, q: T.Quaternion): void {
  bone.getWorldQuaternion(world);
  if (bone.parent) bone.parent.getWorldQuaternion(parentWorld); else parentWorld.identity();
  bone.quaternion.copy(parentWorld.invert().multiply(q).multiply(world));
  bone.updateMatrixWorld(true);
}

/**
 * Analytic two-bone IK in world space. Moves `end` (foot or hand) onto `target` by rotating `upper` and `lower`;
 * the middle joint bends toward `poleTarget`. Unreachable targets are approached along the straight line.
 */
export function solveTwoBoneIK(upper: T.Object3D, lower: T.Object3D, end: T.Object3D, target: T.Vector3, poleTarget: T.Vector3): void {
  upper.getWorldPosition(a);
  lower.getWorldPosition(b);
  end.getWorldPosition(c);
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  if (l1 < 1e-6 || l2 < 1e-6) return;
  direction.subVectors(target, a);
  const distance = T.MathUtils.clamp(direction.length(), Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  direction.normalize();
  pole.subVectors(poleTarget, a);
  pole.addScaledVector(direction, -pole.dot(direction));
  if (pole.lengthSq() < 1e-10) pole.subVectors(b, a).addScaledVector(direction, -b.clone().sub(a).dot(direction));
  if (pole.lengthSq() < 1e-10) return;
  pole.normalize();
  const cos = T.MathUtils.clamp((l1 * l1 + distance * distance - l2 * l2) / (2 * l1 * distance), -1, 1);
  knee.copy(a).addScaledVector(direction, cos * l1).addScaledVector(pole, Math.sqrt(1 - cos * cos) * l1);
  goal.copy(a).addScaledVector(direction, distance);
  rotateWorld(upper, rotation.setFromUnitVectors(b.clone().sub(a).normalize(), knee.clone().sub(a).normalize()));
  lower.getWorldPosition(b);
  end.getWorldPosition(c);
  rotateWorld(lower, rotation.setFromUnitVectors(c.clone().sub(b).normalize(), goal.clone().sub(b).normalize()));
}

export interface OverlayInput {
  /** View pitch in radians (positive looks up). */
  pitch: number;
  /** View yaw relative to the body heading in radians. */
  yaw: number;
  /** 0 disables look and aim (ground postures, death), 1 applies them fully. */
  look: number;
  /** Shot impulse from `CharacterAnimation.kick`. */
  kick: number;
  /** Ground height under the character in world space, for foot IK. */
  ground?: number;
}

export class SkeletonOverlay {
  private readonly model: T.Object3D;
  private readonly chain: { bone: T.Object3D; share: number }[] = [];
  private readonly chest?: T.Object3D;
  private readonly legs: { upper: T.Object3D; lower: T.Object3D; foot: T.Object3D; height: number }[] = [];
  readonly footIK: boolean;

  constructor(model: T.Object3D, bones: HumanoidBoneMap, footIK = false) {
    this.model = model;
    this.footIK = footIK;
    const found = LOOK_CHAIN.flatMap(([role, share]) => {
      const bone = findNode(model, bones[role]);
      return bone ? [{ bone, share }] : [];
    });
    const total = found.reduce((sum, entry) => sum + entry.share, 0);
    for (const entry of found) this.chain.push({ bone: entry.bone, share: entry.share / total });
    this.chest = findNode(model, bones.chest) ?? findNode(model, bones.upperChest) ?? findNode(model, bones.spine);
    model.updateMatrixWorld(true);
    const inverse = model.matrixWorld.clone().invert();
    for (const side of ['left', 'right'] as const) {
      const upper = findNode(model, bones[`${side}UpperLeg`]);
      const lower = findNode(model, bones[`${side}LowerLeg`]);
      const foot = findNode(model, bones[`${side}Foot`]);
      if (upper && lower && foot) {
        // Rest height of the ankle above the model origin (feet at the origin by convention).
        const height = foot.getWorldPosition(new T.Vector3()).applyMatrix4(inverse).y;
        this.legs.push({ upper, lower, foot, height });
      }
    }
  }

  get available(): boolean { return this.chain.length > 0; }

  apply(input: OverlayInput): void {
    if (!this.chain.length && !this.legs.length) return;
    this.model.updateMatrixWorld(true);
    this.model.getWorldQuaternion(world);
    right.set(1, 0, 0).applyQuaternion(world);
    if (input.look > 1e-3) {
      const yaw = T.MathUtils.clamp(input.yaw, -MAX_LOOK_YAW, MAX_LOOK_YAW) * input.look;
      const pitch = input.pitch * input.look;
      for (const { bone, share } of this.chain) {
        // Yaw turns about the world up axis (to the right is negative), pitch about the character's right axis.
        rotation.setFromAxisAngle(up, -yaw * share).multiply(turn.setFromAxisAngle(right, pitch * share));
        rotateWorld(bone, rotation);
      }
    }
    if (this.chest && input.kick > 1e-3) rotateWorld(this.chest, rotation.setFromAxisAngle(right, input.kick * KICK_PITCH));
    if (this.footIK && input.ground !== undefined) {
      const forward = new T.Vector3(0, 0, -1).applyQuaternion(world);
      for (const leg of this.legs) {
        leg.foot.getWorldPosition(c);
        const floor = input.ground + leg.height;
        if (c.y >= floor - FOOT_TOLERANCE) continue;
        leg.lower.getWorldPosition(b);
        solveTwoBoneIK(leg.upper, leg.lower, leg.foot, goal.set(c.x, floor, c.z).clone(), b.clone().addScaledVector(forward, .5));
      }
    }
  }
}
