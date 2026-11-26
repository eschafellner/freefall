import * as T from 'three';

const basis = new T.Matrix4();
const x = new T.Vector3();
const y = new T.Vector3();
const z = new T.Vector3();
const axis = new T.Vector3();
const bend = new T.Vector3();
const local = new T.Vector3();
const inverse = new T.Quaternion();

/**
 * Two-bone solve in one space (rig space): returns the middle joint in `joint` and the reachable end in `end`.
 * `pole` is the direction the middle joint should bulge to (elbow back, knee forward); it is replaced by the bend
 * direction actually used (perpendicular to the origin–target axis), which is what the upper bone should face.
 */
export function solveTwoBone(origin: T.Vector3, target: T.Vector3, upper: number, lower: number, pole: T.Vector3,
  joint: T.Vector3, end: T.Vector3): void {
  axis.subVectors(target, origin);
  const length = axis.length();
  axis.multiplyScalar(1 / Math.max(1e-5, length));
  const distance = T.MathUtils.clamp(length, Math.abs(upper - lower) + .005, upper + lower - .0004);
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  bend.copy(pole).addScaledVector(axis, -pole.dot(axis));
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).addScaledVector(axis, -axis.z);
  bend.normalize();
  joint.copy(origin).addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - along * along)));
  end.copy(origin).addScaledVector(axis, distance);
  pole.copy(bend);
}

/**
 * Orientation of a limb bone that hangs along its local −Y in the bind pose: −Y towards `toward`, and the local
 * axis `front` (+Z or −Z) facing `facing` as closely as possible.
 */
export function aimBone(out: T.Quaternion, from: T.Vector3, toward: T.Vector3, facing: T.Vector3, front: 1 | -1): T.Quaternion {
  y.subVectors(from, toward).normalize();
  z.copy(facing).addScaledVector(y, -facing.dot(y));
  if (z.lengthSq() < 1e-8) z.set(0, 0, front).addScaledVector(y, -y.z * front);
  z.normalize().multiplyScalar(front);
  x.crossVectors(y, z).normalize();
  z.crossVectors(x, y);
  basis.makeBasis(x, y, z);
  return out.setFromRotationMatrix(basis);
}

/**
 * Hinge (elbow, knee) about the parent's local X: the child's −Y points at `toward`. `min`/`max` limit the angle;
 * elbows flex positive (towards −Z), knees negative (towards +Z).
 */
export function hinge(out: T.Quaternion, parent: T.Quaternion, joint: T.Vector3, toward: T.Vector3, min: number, max: number): T.Quaternion {
  local.subVectors(toward, joint).applyQuaternion(inverse.copy(parent).invert());
  const angle = T.MathUtils.clamp(Math.atan2(-local.z, -local.y), min, max);
  return out.setFromAxisAngle(x.set(1, 0, 0), angle);
}

/** `out` = parent⁻¹ · rig, the local rotation that produces the rig-space rotation under `parent`. */
export function localOf(out: T.Quaternion, parent: T.Quaternion, rig: T.Quaternion): T.Quaternion {
  return out.copy(parent).invert().multiply(rig);
}
