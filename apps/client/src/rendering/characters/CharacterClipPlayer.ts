import * as T from 'three';
import type { SoldierAsset } from '../AssetRegistry.ts';
import type { CharacterAnimation, CharacterClip, Locomotion } from './CharacterAnimation.ts';

import { TACTICAL_LOOPS, TACTICAL_ONCE } from './TacticalAnimation.ts';
import type { TacticalClip } from './TacticalAnimation.ts';

const LOOP_STATES = ['idle', 'walk', 'run', 'sprint', 'strafeLeft', 'strafeRight', 'backward', 'aim', ...TACTICAL_LOOPS] as const;
const GAITS = new Set<CharacterClip>(['walk', 'run', 'sprint', 'strafeLeft', 'strafeRight', 'backward']);
const FADE = .15;
/** Gait-to-gait blends keep the foot phase and may be a little longer without looking late. */
const GAIT_FADE = .22;
const ONE_SHOTS = ['fire', 'reload', 'hit', 'death', ...TACTICAL_ONCE] as const;
const LOCOMOTION_FALLBACK: Record<Locomotion, readonly CharacterClip[]> = {
  idle: [],
  walk: ['run'],
  run: ['walk'],
  sprint: ['run', 'walk'],
  strafeLeft: ['walk', 'run'],
  strafeRight: ['walk', 'run'],
  backward: ['walk', 'run'],
};

function inPlace(clip: T.AnimationClip, motionRoot?: string): T.AnimationClip {
  const result = clip.clone();
  result.tracks = result.tracks.filter((track) => {
    const { nodeName, propertyName } = T.PropertyBinding.parseTrackName(track.name);
    if (nodeName && (!motionRoot || nodeName !== motionRoot)) return true;
    if (propertyName === 'position') {
      for (let i = 3; i < track.values.length; i += 3) {
        track.values[i] = track.values[0];
        track.values[i + 2] = track.values[2];
      }
    }
    return propertyName !== 'quaternion' && propertyName !== 'rotation';
  });
  return result;
}

export class CharacterClipPlayer {
  private readonly model: T.Object3D;
  private readonly mixer: T.AnimationMixer;
  private readonly actions = new Map<CharacterClip, T.AnimationAction>();
  private readonly states = new Map<T.AnimationAction, CharacterClip>();
  private readonly speeds: SoldierAsset['clipSpeeds'];
  private active?: T.AnimationAction;

  constructor(model: T.Object3D, clips: readonly T.AnimationClip[], asset: SoldierAsset) {
    this.model = model;
    this.mixer = new T.AnimationMixer(model);
    this.speeds = asset.clipSpeeds;
    for (const state of [...LOOP_STATES, ...ONE_SHOTS]) {
      const name = (asset.clips?.[state] ?? state).toLowerCase();
      const clip = clips.find((item) => item.name.toLowerCase() === name);
      if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0 || !clip.tracks.length || !clip.validate()) continue;
      const action = this.mixer.clipAction(inPlace(clip, asset.motionRoot));
      if ((ONE_SHOTS as readonly CharacterClip[]).includes(state)) {
        action.setLoop(T.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(state, action);
      this.states.set(action, state);
    }
  }

  get ready(): boolean {
    return this.actions.has('idle') && (this.actions.has('walk') || this.actions.has('run'));
  }

  get hasDeath(): boolean { return this.actions.has('death'); }

  tacticalClip(clip: TacticalClip): TacticalClip | undefined {
    if (this.actions.has(clip)) return clip;
    if (!clip.startsWith('dive')) return;
    const fallback = clip.includes('Backward') ? 'diveBackward' : clip.includes('Forward') ? 'diveForward' : clip;
    return this.actions.has(fallback) ? fallback : undefined;
  }

  fire(): void {
    const active = this.active && this.states.get(this.active);
    this.restart(active === 'proneFire' || active === 'supineFire' ? active : 'fire');
  }
  hit(): void { this.restart('hit'); }

  private restart(clip: CharacterClip): void {
    const action = this.actions.get(clip);
    if (action && action === this.active) action.reset().play();
  }

  update(state: CharacterAnimation, dt: number): void {
    let move = this.actions.get(state.locomotion);
    for (const fallback of LOCOMOTION_FALLBACK[state.locomotion]) {
      if (move) break;
      move = this.actions.get(fallback);
    }
    let next = move ?? this.actions.get('idle');
    if (state.reaction === 'death') next = this.actions.get('death') ?? this.actions.get('idle');
    else if (state.combat === 'reload') next = this.actions.get('reload') ?? next;
    else if (state.reaction === 'hit' && this.actions.has('hit')) next = this.actions.get('hit');
    else if (state.combat === 'fire') next = this.actions.get('fire') ?? next;
    else if (state.combat === 'aim' && state.locomotion === 'idle') next = this.actions.get('aim') ?? next;
    const tactical = state.tactical.clip && this.tacticalClip(state.tactical.clip);
    if (tactical && state.reaction !== 'death') next = this.actions.get(tactical);
    if (next !== this.active) {
      const from = this.active;
      const fromState = from && this.states.get(from);
      const nextState = next && this.states.get(next);
      const gait = !!fromState && !!nextState && GAITS.has(fromState) && GAITS.has(nextState);
      const fade = gait ? GAIT_FADE : FADE;
      from?.fadeOut(fade);
      if (next) {
        next.reset();
        // Walk → run → sprint and direction changes continue the step cycle instead of restarting it.
        if (gait && from) next.time = (from.time / from.getClip().duration % 1) * next.getClip().duration;
        next.fadeIn(fade).play();
      }
      this.active = next;
    }
    const clip = next && this.states.get(next);
    const authored = clip && clip !== 'idle' && GAITS.has(clip) ? this.speeds?.[clip as Exclude<CharacterClip, 'idle'>] : undefined;
    if (next && authored) next.timeScale = T.MathUtils.clamp(state.speed / authored, .6, 1.6);
    if (next && tactical && state.tactical.progress !== undefined && next === this.actions.get(tactical)) {
      next.paused = true;
      next.time = state.tactical.progress * next.getClip().duration;
    }
    if (state.reload >= 0 && next && (clip === 'reload' || clip === 'proneReload' || clip === 'supineReload')) {
      // Evaluate at server progress regardless of the authored clip length.
      next.paused = true;
      next.time = state.reload * next.getClip().duration;
    }
    // Without a death clip, freeze the idle fallback once the collapse has settled.
    this.mixer.update(state.reaction === 'death' && !this.hasDeath && state.fall >= 1 ? 0 : dt);
  }

  reset(): void {
    this.mixer.stopAllAction();
    this.active = undefined;
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
