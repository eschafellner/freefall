/**
 * Animation retargeting between humanoid skeletons with different bone names, rest poses and proportions.
 *
 * Method (root-space rest delta): for every humanoid role the source rotation relative to the source rest pose is
 * transferred in root space and applied to the target rest pose:
 *   G'target(b) = G'source(b) · Gsource_rest(b)⁻¹ · Gtarget_rest(b)        (G = orientation in root space)
 *   local'target(b) = G'target(parent(b))⁻¹ · G'target(b)
 * Target bones without a role keep their rest rotation; extra source bones (twists, props) only take part in the
 * source chain. Only the hips translate: the source hips offset from rest is scaled by the hip-height ratio, all
 * other bones keep the target's own proportions. Requirements: both rigs face −Z with +Y up in their root space
 * (the FREEFALL import convention), uniform scale, and both are passed in their rest pose. Output is resampled at a
 * fixed rate.
 */
import * as T from 'three';
import { HUMANOID_BONES } from './HumanoidSkeleton.ts';
import type { HumanoidBone, HumanoidBoneMap } from './HumanoidSkeleton.ts';

export interface RetargetRig {
  /** Root of the hierarchy (scene or armature). Its own transform is the reference frame. */
  root: T.Object3D;
  bones: HumanoidBoneMap;
}

export interface RetargetOptions {
  /** Samples per second of the produced clip (default 30, the simulation rate). */
  fps?: number;
}

interface Node {
  object: T.Object3D;
  parent: number;
  restLocal: T.Quaternion;
  restPosition: T.Vector3;
  /** Rest orientation and transform in root space. */
  restGlobal: T.Quaternion;
  restMatrix: T.Matrix4;
}

/** Hierarchy below `root` in pre-order (parents before children). */
function hierarchy(root: T.Object3D): { list: Node[]; index: Map<T.Object3D, number> } {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const list: Node[] = [];
  const index = new Map<T.Object3D, number>();
  root.traverse((object) => {
    if (object === root) return;
    const parent = object.parent && object.parent !== root ? index.get(object.parent) ?? -1 : -1;
    const restMatrix = toRoot.clone().multiply(object.matrixWorld);
    const restGlobal = new T.Quaternion();
    restMatrix.decompose(new T.Vector3(), restGlobal, new T.Vector3());
    index.set(object, list.length);
    list.push({ object, parent, restLocal: object.quaternion.clone(), restPosition: object.position.clone(), restGlobal, restMatrix });
  });
  return { list, index };
}

/** Finds a node by its asset name or by the sanitized name glTF/Three.js uses in track bindings. */
export function findNode(root: T.Object3D, name: string | undefined): T.Object3D | undefined {
  if (!name) return;
  const wanted = T.PropertyBinding.sanitizeNodeName(name);
  let found: T.Object3D | undefined;
  root.traverse((object) => {
    if (!found && (object.name === name || T.PropertyBinding.sanitizeNodeName(object.name) === wanted)) found = object;
  });
  return found;
}

/** True if both rigs use the same names and rest rotations, so clips can be shared without retargeting. */
export function sameRig(source: RetargetRig, target: RetargetRig, epsilon = 1e-4): boolean {
  for (const role of HUMANOID_BONES) {
    const a = findNode(source.root, source.bones[role]);
    const b = findNode(target.root, target.bones[role]);
    if (!a !== !b) return false;
    if (!a || !b) continue;
    if (T.PropertyBinding.sanitizeNodeName(a.name) !== T.PropertyBinding.sanitizeNodeName(b.name)) return false;
    if (Math.abs(a.quaternion.dot(b.quaternion)) < 1 - epsilon) return false;
  }
  return true;
}

/** Retargets one clip from the source rig onto the target rig. Roles missing on either side are skipped. */
export function retargetClip(clip: T.AnimationClip, source: RetargetRig, target: RetargetRig, options: RetargetOptions = {}): T.AnimationClip {
  const fps = options.fps ?? 30;
  const src = hierarchy(source.root);
  const dst = hierarchy(target.root);
  const roles: { role: HumanoidBone; from: number; to: number }[] = [];
  for (const role of HUMANOID_BONES) {
    const a = findNode(source.root, source.bones[role]);
    const b = findNode(target.root, target.bones[role]);
    if (a && b && src.index.has(a) && dst.index.has(b)) roles.push({ role, from: src.index.get(a)!, to: dst.index.get(b)! });
  }
  const sourceOf = new Map(roles.map((entry) => [entry.to, entry.from]));

  const rotation = new Map<number, T.Interpolant>();
  const position = new Map<number, T.Interpolant>();
  for (const track of clip.tracks) {
    const { nodeName, propertyName } = T.PropertyBinding.parseTrackName(track.name);
    const node = findNode(source.root, nodeName);
    const at = node && src.index.get(node);
    if (at === undefined) continue;
    // createInterpolant picks slerp for quaternion tracks and honors each track's interpolation mode.
    const interpolant = (track as unknown as { createInterpolant(): T.Interpolant }).createInterpolant();
    if (propertyName === 'quaternion') rotation.set(at, interpolant);
    else if (propertyName === 'position') position.set(at, interpolant);
  }

  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = Array.from({ length: frames }, (_, i) => Math.min(clip.duration, i / fps));
  times[frames - 1] = clip.duration;
  const values = new Map<number, number[]>(roles.map(({ to }) => [to, []]));
  const hips = roles.find((entry) => entry.role === 'hips');
  const hipsValues: number[] = [];
  const height = (node: Node) => new T.Vector3().setFromMatrixPosition(node.restMatrix).y;
  const sourceHeight = hips ? height(src.list[hips.from]) : 0;
  const scale = hips && sourceHeight > 1e-6 ? height(dst.list[hips.to]) / sourceHeight : 1;
  const identity = new T.Quaternion();

  const srcGlobal = src.list.map(() => new T.Quaternion());
  const dstGlobal = dst.list.map(() => new T.Quaternion());
  const local = new T.Quaternion();
  const delta = new T.Quaternion();
  for (const time of times) {
    src.list.forEach((node, i) => {
      const sampled = rotation.get(i)?.evaluate(time);
      if (sampled) local.fromArray(sampled).normalize(); else local.copy(node.restLocal);
      srcGlobal[i].copy(node.parent < 0 ? identity : srcGlobal[node.parent]).multiply(local);
    });
    dst.list.forEach((node, i) => {
      const parent = node.parent < 0 ? identity : dstGlobal[node.parent];
      const from = sourceOf.get(i);
      if (from === undefined) {
        dstGlobal[i].copy(parent).multiply(node.restLocal);
        return;
      }
      delta.copy(src.list[from].restGlobal).invert().premultiply(srcGlobal[from]);
      dstGlobal[i].copy(delta).multiply(node.restGlobal);
      local.copy(parent).invert().multiply(dstGlobal[i]);
      values.get(i)!.push(local.x, local.y, local.z, local.w);
    });
    if (hips) {
      const sourceNode = src.list[hips.from];
      const targetNode = dst.list[hips.to];
      const offset = new T.Vector3();
      const sampled = position.get(hips.from)?.evaluate(time);
      if (sampled) {
        const parentMatrix = sourceNode.parent < 0 ? new T.Matrix4() : src.list[sourceNode.parent].restMatrix;
        const animated = new T.Vector3().fromArray(sampled).applyMatrix4(parentMatrix);
        offset.subVectors(animated, sourceNode.restPosition.clone().applyMatrix4(parentMatrix)).multiplyScalar(scale);
      }
      const parentMatrix = targetNode.parent < 0 ? new T.Matrix4() : dst.list[targetNode.parent].restMatrix;
      const point = targetNode.restPosition.clone().applyMatrix4(parentMatrix).add(offset).applyMatrix4(parentMatrix.clone().invert());
      hipsValues.push(point.x, point.y, point.z);
    }
  }
  const binding = (i: number) => T.PropertyBinding.sanitizeNodeName(dst.list[i].object.name);
  const tracks: T.KeyframeTrack[] = roles.map(({ to }) => new T.QuaternionKeyframeTrack(`${binding(to)}.quaternion`, times, values.get(to)!));
  if (hips && position.has(hips.from)) tracks.push(new T.VectorKeyframeTrack(`${binding(hips.to)}.position`, times, hipsValues));
  return new T.AnimationClip(clip.name, clip.duration, tracks);
}
