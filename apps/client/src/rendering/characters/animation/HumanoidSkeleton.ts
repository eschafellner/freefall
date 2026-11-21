/**
 * Canonical humanoid skeleton used for clip layering, procedural overlays and retargeting.
 *
 * Every character or animation asset maps its own bone names onto these roles. A role map can be written by hand
 * in the asset registry or detected from a known naming preset. Name matching is pure (no Three.js), so the offline
 * asset check (`scripts/check-character-asset.ts`) uses the same rules as the client.
 */
export const HUMANOID_BONES = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
] as const;
export type HumanoidBone = (typeof HUMANOID_BONES)[number];
export type HumanoidBoneMap = Partial<Record<HumanoidBone, string>>;

/** Roles a character must provide for layering, look overlay, IK and retargeting. */
export const REQUIRED_HUMANOID_BONES: readonly HumanoidBone[] = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
];

/**
 * Upper-body mask: reload, stim and fire layers own these bones (and every bone below them in the asset, e.g.
 * fingers or twist bones). Everything else, including the hips, stays with the base locomotion layer.
 */
export const UPPER_BODY_BONES: readonly HumanoidBone[] = [
  'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
];

export type SkeletonPreset = 'freefall' | 'mixamo' | 'unreal';

/** Bone names as written by the authoring tools. Matching ignores case and the characters glTF/Three.js strip. */
export const SKELETON_PRESETS: Readonly<Record<SkeletonPreset, HumanoidBoneMap>> = {
  // Recommended convention for FREEFALL-authored rigs (VRM-style role names).
  freefall: {
    hips: 'Hips', spine: 'Spine', chest: 'Chest', upperChest: 'UpperChest', neck: 'Neck', head: 'Head',
    leftShoulder: 'LeftShoulder', leftUpperArm: 'LeftUpperArm', leftLowerArm: 'LeftLowerArm', leftHand: 'LeftHand',
    rightShoulder: 'RightShoulder', rightUpperArm: 'RightUpperArm', rightLowerArm: 'RightLowerArm', rightHand: 'RightHand',
    leftUpperLeg: 'LeftUpperLeg', leftLowerLeg: 'LeftLowerLeg', leftFoot: 'LeftFoot', leftToes: 'LeftToes',
    rightUpperLeg: 'RightUpperLeg', rightLowerLeg: 'RightLowerLeg', rightFoot: 'RightFoot', rightToes: 'RightToes',
  },
  mixamo: {
    hips: 'mixamorig:Hips', spine: 'mixamorig:Spine', chest: 'mixamorig:Spine1', upperChest: 'mixamorig:Spine2',
    neck: 'mixamorig:Neck', head: 'mixamorig:Head',
    leftShoulder: 'mixamorig:LeftShoulder', leftUpperArm: 'mixamorig:LeftArm', leftLowerArm: 'mixamorig:LeftForeArm', leftHand: 'mixamorig:LeftHand',
    rightShoulder: 'mixamorig:RightShoulder', rightUpperArm: 'mixamorig:RightArm', rightLowerArm: 'mixamorig:RightForeArm', rightHand: 'mixamorig:RightHand',
    leftUpperLeg: 'mixamorig:LeftUpLeg', leftLowerLeg: 'mixamorig:LeftLeg', leftFoot: 'mixamorig:LeftFoot', leftToes: 'mixamorig:LeftToeBase',
    rightUpperLeg: 'mixamorig:RightUpLeg', rightLowerLeg: 'mixamorig:RightLeg', rightFoot: 'mixamorig:RightFoot', rightToes: 'mixamorig:RightToeBase',
  },
  unreal: {
    hips: 'pelvis', spine: 'spine_01', chest: 'spine_02', upperChest: 'spine_03', neck: 'neck_01', head: 'head',
    leftShoulder: 'clavicle_l', leftUpperArm: 'upperarm_l', leftLowerArm: 'lowerarm_l', leftHand: 'hand_l',
    rightShoulder: 'clavicle_r', rightUpperArm: 'upperarm_r', rightLowerArm: 'lowerarm_r', rightHand: 'hand_r',
    leftUpperLeg: 'thigh_l', leftLowerLeg: 'calf_l', leftFoot: 'foot_l', leftToes: 'ball_l',
    rightUpperLeg: 'thigh_r', rightLowerLeg: 'calf_r', rightFoot: 'foot_r', rightToes: 'ball_r',
  },
};

/** Skeleton description of one asset in the registry. Without `bones` the preset is detected from the names. */
export interface SkeletonConfig {
  preset?: SkeletonPreset;
  /** Explicit role → bone name. Overrides the preset per role. */
  bones?: HumanoidBoneMap;
}

/** Same normalization as `PropertyBinding.sanitizeNodeName` plus case folding. */
export function normalizeBoneName(name: string): string {
  return name.replace(/\s/g, '_').replace(/[[\].:/]/g, '').toLowerCase();
}

export interface HumanoidMatch {
  /** Role → node name exactly as it appears in the asset. */
  bones: HumanoidBoneMap;
  preset?: SkeletonPreset;
  missing: HumanoidBone[];
  /** All required roles resolved: layering, overlays and retargeting are available. */
  complete: boolean;
}

function matchPreset(byName: Map<string, string>, map: HumanoidBoneMap): HumanoidBoneMap {
  const bones: HumanoidBoneMap = {};
  for (const role of HUMANOID_BONES) {
    const wanted = map[role];
    const found = wanted && byName.get(normalizeBoneName(wanted));
    if (found) bones[role] = found;
  }
  return bones;
}

/** Resolves humanoid roles from the node names of an asset. */
export function matchHumanoid(names: Iterable<string>, config: SkeletonConfig = {}): HumanoidMatch {
  const byName = new Map<string, string>();
  for (const name of names) if (!byName.has(normalizeBoneName(name))) byName.set(normalizeBoneName(name), name);
  let preset = config.preset;
  let bones: HumanoidBoneMap = preset ? matchPreset(byName, SKELETON_PRESETS[preset]) : {};
  if (!preset) {
    let best = -1;
    for (const candidate of Object.keys(SKELETON_PRESETS) as SkeletonPreset[]) {
      const match = matchPreset(byName, SKELETON_PRESETS[candidate]);
      const score = REQUIRED_HUMANOID_BONES.filter((role) => match[role]).length;
      if (score > best) { best = score; preset = candidate; bones = match; }
    }
    if (best <= 0) { preset = undefined; bones = {}; }
  }
  if (config.bones) {
    for (const role of HUMANOID_BONES) {
      const wanted = config.bones[role];
      const found = wanted && byName.get(normalizeBoneName(wanted));
      if (found) bones[role] = found;
      else if (wanted) delete bones[role];
    }
  }
  const missing = REQUIRED_HUMANOID_BONES.filter((role) => !bones[role]);
  return { bones, preset, missing, complete: missing.length === 0 };
}
