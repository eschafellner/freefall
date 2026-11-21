import * as T from 'three';
import type { SoldierAsset } from '../AssetRegistry.ts';
import type { CharacterAnimation, CharacterClip, Locomotion } from './CharacterAnimation.ts';
import { CLIP_REQUIREMENT, CLIP_REQUIREMENTS, clipCoverage } from './animation/ClipLibrary.ts';
import type { ClipCoverage } from './animation/ClipLibrary.ts';
import { UPPER_BODY_BONES, matchHumanoid } from './animation/HumanoidSkeleton.ts';
import type { HumanoidMatch } from './animation/HumanoidSkeleton.ts';
import { findNode } from './animation/Retargeting.ts';
import { nodeNames } from './animation/CharacterClipSet.ts';
import type { TacticalClip } from './TacticalAnimation.ts';

const isGait = (id: CharacterClip) => CLIP_REQUIREMENT.get(id)?.timing === 'speed';
/** Base-layer blend times in seconds. */
const FADE = .15;
/** Gait-to-gait blends keep the foot phase and may be a little longer without looking late. */
const GAIT_FADE = .22;
/** Server-driven transitions (crouch, dive, get-up) start almost at once so the pose does not lag the collider. */
const SERVER_FADE = .08;
const DEATH_FADE = .1;
/** Upper-body layer blend times. */
const OVERLAY_IN = .12;
const OVERLAY_OUT = .2;
const LOCOMOTION_FALLBACK: Record<Locomotion, readonly CharacterClip[]> = {
  idle: [],
  walk: ['run'],
  run: ['walk'],
  sprint: ['run', 'walk'],
  strafeLeft: ['walk', 'run'],
  strafeRight: ['walk', 'run'],
  backward: ['walk', 'run'],
};

function inPlace(clip: T.AnimationClip, model: T.Object3D, motionRoot: string | undefined, dive: boolean): T.AnimationClip {
  const result = clip.clone();
  const modelName = T.PropertyBinding.sanitizeNodeName(model.name);
  const rootName = motionRoot && T.PropertyBinding.sanitizeNodeName(motionRoot);
  const root = findNode(model, motionRoot);
  result.tracks = result.tracks.filter((track) => {
    const { nodeName, propertyName } = T.PropertyBinding.parseTrackName(track.name);
    if (!nodeName || nodeName === modelName || nodeName === model.uuid) return !['position', 'rotation', 'quaternion', 'scale'].includes(propertyName);
    if (nodeName !== rootName && nodeName !== motionRoot) return true;
    if (propertyName === 'position') {
      // The fixed-tick dive path also supplies elevation. Preserve motion on the articulated bones.
      if (dive) return false;
      if (track.getValueSize() !== 3) return false;
      for (let i = 0; i < track.values.length; i += 3) {
        track.values[i] = root?.position.x ?? 0;
        track.values[i + 2] = root?.position.z ?? 0;
      }
    }
    return propertyName !== 'quaternion' && propertyName !== 'rotation' && propertyName !== 'scale';
  });
  return result;
}

/**
 * One clip state. With an upper-body mask a clip is split into a lower and an upper action, so an upper-body layer
 * (reload, stim, fire, hit) can replace the base clip on the upper bones only. Without a mask (no humanoid mapping)
 * the clip stays one full-body action.
 */
interface ClipState {
  id: CharacterClip;
  duration: number;
  lower?: T.AnimationAction;
  upper?: T.AnimationAction;
  baseUpper: { action: T.AnimationAction; overlays: readonly CharacterClip[] }[];
  actions: T.AnimationAction[];
  weight: number;
}

/**
 * Hybrid GLB clip player.
 *
 * Layers: a base layer (locomotion, crouch, dive, prone, supine, get-up, death) and an upper-body layer (reload,
 * pistol reload, stim, fire, hit) masked by the humanoid upper body. Weights are blended linearly here instead of
 * through Three.js fades, so crossfades of both layers stay consistent: base lower = w, base upper = w · (1 − u),
 * upper layer = u. Gait changes keep the normalized step phase, speed clips follow the ground speed, and every
 * server-timed clip (posture transitions, reload, stim) is evaluated at server progress instead of running freely.
 */
export class CharacterClipPlayer {
  private readonly model: T.Object3D;
  private readonly mixer: T.AnimationMixer;
  private readonly states = new Map<CharacterClip, ClipState>();
  private readonly speeds: SoldierAsset['clipSpeeds'];
  private readonly active = new Set<ClipState>();
  private readonly overlays = new Set<ClipState>();
  private base?: ClipState;
  private overlayState?: ClipState;
  private baseFade = FADE;
  readonly humanoid: HumanoidMatch;
  /** True when clips are split into lower and upper body (humanoid upper body resolved). */
  readonly layered: boolean;
  readonly coverage: ClipCoverage;

  constructor(model: T.Object3D, clips: readonly T.AnimationClip[], asset: SoldierAsset) {
    this.model = model;
    this.mixer = new T.AnimationMixer(model);
    this.speeds = asset.clipSpeeds;
    this.humanoid = matchHumanoid(nodeNames(model), asset.skeleton);
    const upperNodes = new Set<string>();
    for (const role of UPPER_BODY_BONES) {
      findNode(model, this.humanoid.bones[role])?.traverse((node) => upperNodes.add(T.PropertyBinding.sanitizeNodeName(node.name)));
    }
    this.layered = this.humanoid.complete && upperNodes.size > 0;
    const prepared = new Map<CharacterClip, T.AnimationClip>();
    const masks = new Map<string, CharacterClip[]>();
    for (const { id, group, layer } of CLIP_REQUIREMENTS) {
      const name = (asset.clips?.[id] ?? id).toLowerCase();
      const source = clips.find((item) => item.name.toLowerCase() === name);
      if (!source || !Number.isFinite(source.duration) || source.duration <= 0 || !source.tracks.length || !source.validate()) continue;
      const clip = inPlace(source, model, asset.motionRoot, group === 'dive');
      clip.tracks = clip.tracks.filter((track) => {
        const { nodeName } = T.PropertyBinding.parseTrackName(track.name);
        return !nodeName || !!T.PropertyBinding.findNode(model, nodeName);
      });
      if (!clip.tracks.length) continue;
      prepared.set(id, clip);
      if (this.layered && layer === 'upper') for (const track of clip.tracks) {
        if (!upperNodes.has(T.PropertyBinding.parseTrackName(track.name).nodeName)) continue;
        const overlays = masks.get(track.name);
        if (overlays) overlays.push(id);
        else masks.set(track.name, [id]);
      }
    }
    for (const { id, layer, loop } of CLIP_REQUIREMENTS) {
      const clip = prepared.get(id);
      if (!clip) continue;
      const state: ClipState = { id, duration: clip.duration, actions: [], baseUpper: [], weight: 0 };
      const upperTracks = this.layered
        ? clip.tracks.filter((track) => upperNodes.has(T.PropertyBinding.parseTrackName(track.name).nodeName)) : [];
      const lowerTracks = this.layered ? clip.tracks.filter((track) => !upperTracks.includes(track)) : clip.tracks;
      const action = (tracks: T.KeyframeTrack[], part: string) => {
        if (!tracks.length) return;
        const result = this.mixer.clipAction(new T.AnimationClip(`${clip.name}#${part}`, clip.duration, tracks));
        if (!loop) {
          result.setLoop(T.LoopOnce, 1);
          result.clampWhenFinished = true;
        }
        state.actions.push(result);
        return result;
      };
      if (layer === 'upper' && this.layered) state.upper = action(upperTracks, 'upper');
      else if (this.layered) {
        state.lower = action(lowerTracks, 'lower');
        // A sparse overlay, e.g. a hand-only fire clip, must not fade unrelated base tracks to bind pose.
        const groups = new Map<string, { tracks: T.KeyframeTrack[]; overlays: readonly CharacterClip[] }>();
        for (const track of upperTracks) {
          const overlays = masks.get(track.name) ?? [];
          const key = overlays.join(',');
          const group = groups.get(key);
          if (group) group.tracks.push(track);
          else groups.set(key, { tracks: [track], overlays });
        }
        for (const { tracks, overlays } of groups.values()) {
          state.baseUpper.push({ action: action(tracks, `upper${state.baseUpper.length}`)!, overlays });
        }
      } else state.upper = action(lowerTracks, 'full');
      if (state.actions.length) this.states.set(id, state);
    }
    this.coverage = clipCoverage(this.states.keys());
  }

  get ready(): boolean { return this.coverage.usable; }
  get hasDeath(): boolean { return this.states.has('death'); }
  has(clip: CharacterClip): boolean { return this.states.has(clip); }
  /** Current base-layer clip. */
  get baseClip(): CharacterClip | undefined { return this.base?.id; }
  get baseTime(): number { return this.base?.actions[0]?.time ?? 0; }
  /** Current upper-body clip and its blended weight (0 while none is active). */
  get overlayClip(): CharacterClip | undefined { return this.overlayState?.id; }
  get overlayWeight(): number {
    let weight = 0;
    for (const state of this.overlays) weight += state.weight;
    return Math.min(1, weight);
  }

  tacticalClip(clip: TacticalClip, fallback?: TacticalClip): TacticalClip | undefined {
    return this.states.has(clip) ? clip : fallback && this.states.has(fallback) ? fallback : undefined;
  }

  fire(): void {
    if (this.overlayState?.id.toLowerCase().endsWith('fire')) this.restart(this.overlayState);
  }
  hit(): void { if (this.overlayState?.id === 'hit') this.restart(this.overlayState); }

  private restart(state: ClipState): void {
    for (const action of state.actions) action.reset().play();
  }

  private chooseBase(state: CharacterAnimation): ClipState | undefined {
    const idle = this.states.get('idle');
    if (state.reaction === 'death') return this.states.get('death') ?? idle;
    const tactical = state.tactical.clip && this.tacticalClip(state.tactical.clip, state.tactical.fallback);
    if (tactical) return this.states.get(tactical);
    let move = this.states.get(state.locomotion);
    for (const fallback of LOCOMOTION_FALLBACK[state.locomotion]) move ??= this.states.get(fallback);
    if (state.combat === 'aim' && state.locomotion === 'idle') return this.states.get('aim') ?? move ?? idle;
    return move ?? idle;
  }

  private chooseOverlay(state: CharacterAnimation, base: ClipState | undefined): ClipState | undefined {
    if (!base || state.reaction === 'death') return;
    const group = CLIP_REQUIREMENT.get(base.id)?.group;
    if (group === 'getUp' || group === 'dive') return;
    const tactical = state.tactical.overlay && this.layered ? this.states.get(state.tactical.overlay) : undefined;
    if (tactical) return tactical;
    // Upright animation tracks would pull the arms and shoulders out of a ground pose.
    if (group === 'prone' || group === 'supine') return;
    if (state.combat === 'reload') {
      return (state.weaponSlot === 'secondary' ? this.states.get('reloadPistol') : undefined) ?? this.states.get('reload');
    }
    if (state.gearAction === 'stim') return this.states.get('stim');
    if (state.gearAction === 'primary' || state.gearAction === 'secondary') return this.states.get('weaponSwitch');
    if (state.reaction === 'hit' && this.states.has('hit')) return this.states.get('hit');
    if (state.combat === 'fire') return this.states.get('fire');
  }

  /** Normalized time of a server-timed clip, or undefined when the clip runs on its own clock. */
  private serverTime(clip: ClipState, state: CharacterAnimation): number | undefined {
    if (CLIP_REQUIREMENT.get(clip.id)?.timing !== 'server') return;
    const group = CLIP_REQUIREMENT.get(clip.id)!.group;
    if (group === 'reload') return state.reload >= 0 ? state.reload : undefined;
    if (group === 'stim' || group === 'switch') return state.actionProgress;
    return state.tactical.progress;
  }

  private activate(clip: ClipState, from?: ClipState, gait = false): void {
    for (const action of clip.actions) {
      if (!this.active.has(clip) && !this.overlays.has(clip)) action.reset();
      action.play();
    }
    // Walk → run → sprint and direction changes continue the step cycle instead of restarting it.
    if (gait && from) {
      const phase = (from.actions[0].time / from.duration) % 1;
      for (const action of clip.actions) action.time = phase * clip.duration;
    }
  }

  update(state: CharacterAnimation, dt: number): void {
    const next = this.chooseBase(state);
    if (next !== this.base) {
      const from = this.base;
      const gait = !!from && !!next && isGait(from.id) && isGait(next.id);
      this.baseFade = state.reaction === 'death' ? DEATH_FADE : gait ? GAIT_FADE
        : next && CLIP_REQUIREMENT.get(next.id)?.timing === 'server' ? SERVER_FADE : FADE;
      if (next) {
        this.activate(next, from, gait);
        this.active.add(next);
      }
      this.base = next;
    }
    const overlay = this.chooseOverlay(state, this.base);
    if (overlay !== this.overlayState) {
      if (overlay) {
        if (!this.overlays.has(overlay)) this.activate(overlay);
        this.overlays.add(overlay);
      }
      this.overlayState = overlay;
    }

    // Linear weight blending. Instant on the first frame so a freshly attached rig never shows the bind pose.
    for (const clip of this.active) {
      const target = clip === this.base ? 1 : 0;
      const first = this.active.size === 1 && clip.weight === 0;
      clip.weight = first ? 1 : T.MathUtils.clamp(clip.weight + Math.sign(target - clip.weight) * dt / this.baseFade, Math.min(target, clip.weight), Math.max(target, clip.weight));
    }
    for (const clip of this.overlays) {
      const target = clip === this.overlayState ? 1 : 0;
      const rate = target ? OVERLAY_IN : OVERLAY_OUT;
      clip.weight = T.MathUtils.clamp(clip.weight + Math.sign(target - clip.weight) * dt / rate, Math.min(target, clip.weight), Math.max(target, clip.weight));
    }
    let total = 0;
    for (const clip of this.active) total += clip.weight;
    let overlayTotal = 0;
    for (const clip of this.overlays) overlayTotal += clip.weight;
    const upper = Math.min(1, overlayTotal);
    const overlayDivisor = Math.max(1, overlayTotal);
    for (const clip of this.active) {
      const weight = total > 0 ? clip.weight / total : 0;
      clip.lower?.setEffectiveWeight(weight);
      clip.upper?.setEffectiveWeight(weight * (1 - upper));
      for (const mask of clip.baseUpper) {
        let covered = 0;
        for (const id of mask.overlays) covered += this.states.get(id)!.weight;
        mask.action.setEffectiveWeight(weight * Math.max(0, 1 - covered / overlayDivisor));
      }
    }
    for (const clip of this.overlays) clip.upper?.setEffectiveWeight(clip.weight / overlayDivisor);
    for (const set of [this.active, this.overlays]) {
      for (const clip of set) {
        if (clip.weight > 0 || clip === this.base || clip === this.overlayState) continue;
        for (const action of clip.actions) action.stop();
        set.delete(clip);
      }
    }

    // Playback rate and clocks.
    for (const set of [this.active, this.overlays]) for (const clip of set) {
      // Fading server clips keep their last sample when a different state takes ownership of the clock.
      if (clip !== this.base && clip !== this.overlayState && CLIP_REQUIREMENT.get(clip.id)?.timing === 'server') continue;
      const authored = isGait(clip.id) ? this.speeds?.[clip.id as Exclude<CharacterClip, 'idle'>] : undefined;
      const progress = this.serverTime(clip, state);
      for (const action of clip.actions) {
        action.timeScale = authored ? T.MathUtils.clamp(state.speed / authored, .6, 1.6) : 1;
        action.paused = progress !== undefined;
        if (progress !== undefined) action.time = T.MathUtils.clamp(progress, 0, 1) * clip.duration;
      }
    }
    // Without a death clip, freeze the idle fallback once the collapse has settled.
    this.mixer.update(state.reaction === 'death' && !this.hasDeath && state.fall >= 1 ? 0 : dt);
  }

  reset(): void {
    this.mixer.stopAllAction();
    for (const clip of this.states.values()) clip.weight = 0;
    this.active.clear();
    this.overlays.clear();
    this.base = this.overlayState = undefined;
  }

  dispose(): void {
    this.reset();
    this.mixer.uncacheRoot(this.model);
    const skeletons = new Set<T.Skeleton>();
    this.model.traverse((node) => {
      if (node instanceof T.SkinnedMesh) skeletons.add(node.skeleton);
    });
    for (const skeleton of skeletons) skeleton.dispose();
  }
}
