import * as T from 'three';

/**
 * Skeleton of the procedural operator. Humanoid bones use the FREEFALL naming preset (`HumanoidSkeleton.ts`), so
 * clips, overlays and future armour assets can bind to the same names. Helper bones carry armour that should only
 * follow part of a joint (pauldrons, tassets) and the spring-mounted backpack.
 *
 * Bind pose: model space in metres, feet at the origin, −Z forward, +X right. Every bone has an identity rotation in
 * the bind pose; limbs hang straight down, so a limb bone's local −Y points to its child and local −Z to the front.
 */
export const OPERATOR_BONES = [
  'Hips', 'Spine', 'Chest', 'UpperChest', 'Neck', 'Head',
  'LeftShoulder', 'LeftUpperArm', 'LeftLowerArm', 'LeftHand',
  'RightShoulder', 'RightUpperArm', 'RightLowerArm', 'RightHand',
  'LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot', 'LeftToes',
  'RightUpperLeg', 'RightLowerLeg', 'RightFoot', 'RightToes',
  'LeftPauldron', 'RightPauldron', 'LeftTasset', 'RightTasset', 'Backpack',
] as const;
export type OperatorBone = (typeof OPERATOR_BONES)[number];
export type Side = -1 | 1;
type Vec3 = readonly [number, number, number];

/** Bind-pose landmarks (model space). Proportions of a 1.80 m operator; the helmet adds a few centimetres. */
export const BODY = {
  hips: .96,
  hipJoint: .92,
  hipWidth: .099,
  knee: .497,
  ankle: .085,
  /** Ball of the foot (toe joint) relative to the ankle. */
  ball: [0, -.057, -.128] as Vec3,
  shoulder: 1.405,
  shoulderWidth: .2,
  elbow: 1.115,
  wrist: .853,
  neck: 1.465,
  head: 1.556,
} as const;

export const THIGH = BODY.hipJoint - BODY.knee;
export const SHIN = BODY.knee - BODY.ankle;
export const UPPER_ARM = BODY.shoulder - BODY.elbow;
export const FOREARM = BODY.elbow - BODY.wrist;

const sided = (name: 'Shoulder' | 'UpperArm' | 'LowerArm' | 'Hand' | 'UpperLeg' | 'LowerLeg' | 'Foot' | 'Toes' | 'Pauldron' | 'Tasset', side: Side) =>
  `${side < 0 ? 'Left' : 'Right'}${name}` as OperatorBone;
export const boneOf = sided;

function layout(): Record<OperatorBone, { parent?: OperatorBone; at: Vec3 }> {
  const result = {
    Hips: { at: [0, BODY.hips, 0] },
    Spine: { parent: 'Hips', at: [0, 1.045, .008] },
    Chest: { parent: 'Spine', at: [0, 1.17, .012] },
    UpperChest: { parent: 'Chest', at: [0, 1.295, .01] },
    Neck: { parent: 'UpperChest', at: [0, BODY.neck, .016] },
    Head: { parent: 'Neck', at: [0, BODY.head, .004] },
    Backpack: { parent: 'UpperChest', at: [0, 1.29, .13] },
  } as Record<string, { parent?: OperatorBone; at: Vec3 }>;
  for (const side of [-1, 1] as const) {
    const x = side * BODY.shoulderWidth;
    result[sided('Shoulder', side)] = { parent: 'UpperChest', at: [side * .035, 1.415, .006] };
    result[sided('Pauldron', side)] = { parent: sided('Shoulder', side), at: [x, BODY.shoulder, .01] };
    result[sided('UpperArm', side)] = { parent: sided('Shoulder', side), at: [x, BODY.shoulder, .01] };
    result[sided('LowerArm', side)] = { parent: sided('UpperArm', side), at: [x, BODY.elbow, .01] };
    result[sided('Hand', side)] = { parent: sided('LowerArm', side), at: [x, BODY.wrist, .01] };
    const h = side * BODY.hipWidth;
    result[sided('UpperLeg', side)] = { parent: 'Hips', at: [h, BODY.hipJoint, 0] };
    result[sided('Tasset', side)] = { parent: 'Hips', at: [h, BODY.hipJoint + .07, -.02] };
    result[sided('LowerLeg', side)] = { parent: sided('UpperLeg', side), at: [h, BODY.knee, 0] };
    result[sided('Foot', side)] = { parent: sided('LowerLeg', side), at: [h, BODY.ankle, 0] };
    result[sided('Toes', side)] = { parent: sided('Foot', side), at: [h + BODY.ball[0], BODY.ankle + BODY.ball[1], BODY.ball[2]] };
  }
  return result as Record<OperatorBone, { parent?: OperatorBone; at: Vec3 }>;
}

export const BIND = layout();
export const BONE_INDEX = Object.fromEntries(OPERATOR_BONES.map((name, i) => [name, i])) as Record<OperatorBone, number>;

/** Bind position of a bone in model space. */
export function bindPosition(bone: OperatorBone): Vec3 { return BIND[bone].at; }

/** One skeleton instance: bones in bind pose, rest positions and the inverse bind matrices shared by every instance. */
export function createOperatorSkeleton(): { root: T.Bone; bones: Record<OperatorBone, T.Bone>; skeleton: T.Skeleton } {
  const bones = {} as Record<OperatorBone, T.Bone>;
  for (const name of OPERATOR_BONES) {
    const bone = new T.Bone();
    bone.name = name;
    bones[name] = bone;
  }
  for (const name of OPERATOR_BONES) {
    const { parent, at } = BIND[name];
    const origin = parent ? BIND[parent].at : [0, 0, 0];
    bones[name].position.set(at[0] - origin[0], at[1] - origin[1], at[2] - origin[2]);
    if (parent) bones[parent].add(bones[name]);
  }
  // Rotations are identity in the bind pose, so each inverse bind matrix is a translation.
  const inverses = OPERATOR_BONES.map((name) => new T.Matrix4().makeTranslation(-BIND[name].at[0], -BIND[name].at[1], -BIND[name].at[2]));
  const skeleton = new T.Skeleton(OPERATOR_BONES.map((name) => bones[name]), inverses);
  return { root: bones.Hips, bones, skeleton };
}
