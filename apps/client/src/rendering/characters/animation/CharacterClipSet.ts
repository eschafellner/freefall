/**
 * Builds the clip list of a character from its own GLB clips and any number of animation packs. Packs with the
 * same skeleton are used as they are; packs with a different humanoid skeleton are retargeted onto the character.
 * Runs once per asset on the original (rest pose) scene; the resulting clips are shared by every clone.
 */
import * as T from 'three';
import { matchHumanoid } from './HumanoidSkeleton.ts';
import type { HumanoidMatch, SkeletonConfig } from './HumanoidSkeleton.ts';
import { retargetClip, sameRig } from './Retargeting.ts';

export interface AnimationPack {
  /** Rest-pose scene of the pack (its skeleton). */
  scene: T.Object3D;
  animations: readonly T.AnimationClip[];
  skeleton?: SkeletonConfig;
  /** Label for log lines, usually the asset path. */
  label: string;
}

export interface PreparedClips {
  clips: T.AnimationClip[];
  humanoid: HumanoidMatch;
  /** One line per pack: used as-is, retargeted or skipped (and why). */
  notes: string[];
}

export function nodeNames(root: T.Object3D): string[] {
  const names: string[] = [];
  root.traverse((node) => { if (node.name) names.push(node.name); });
  return names;
}

export function prepareCharacterClips(model: T.Object3D, own: readonly T.AnimationClip[], packs: readonly AnimationPack[],
  skeleton?: SkeletonConfig): PreparedClips {
  const humanoid = matchHumanoid(nodeNames(model), skeleton);
  const clips = [...own];
  const notes: string[] = [];
  for (const pack of packs) {
    const source = matchHumanoid(nodeNames(pack.scene), pack.skeleton);
    const target = { root: model, bones: humanoid.bones };
    const from = { root: pack.scene, bones: source.bones };
    if (!source.complete || !humanoid.complete) {
      // Without a full humanoid mapping the pack can only be used if it binds to the same node names.
      clips.push(...pack.animations);
      notes.push(`${pack.label}: ohne Retargeting übernommen (Humanoid-Zuordnung unvollständig: ${
        [...(humanoid.complete ? [] : ['Charakter ' + humanoid.missing.join(', ')]), ...(source.complete ? [] : ['Paket ' + source.missing.join(', ')])].join('; ')})`);
    } else if (sameRig(from, target)) {
      clips.push(...pack.animations);
      notes.push(`${pack.label}: gleiches Skelett, ${pack.animations.length} Clips direkt übernommen`);
    } else {
      clips.push(...pack.animations.map((clip) => retargetClip(clip, from, target)));
      notes.push(`${pack.label}: ${pack.animations.length} Clips retargeted (${source.preset ?? 'eigene Zuordnung'} → ${humanoid.preset ?? 'eigene Zuordnung'})`);
    }
  }
  return { clips, humanoid, notes };
}
