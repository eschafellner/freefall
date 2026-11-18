import * as T from 'three';
import type { SoldierAsset } from '../AssetRegistry.ts';
import type { CharacterAnimation, CharacterClip, Locomotion } from './CharacterAnimation.ts';

const LOOP_STATES = ['idle', 'walk', 'run', 'sprint', 'strafeLeft', 'strafeRight', 'backward', 'aim'] as const;
const ONE_SHOTS = ['fire', 'reload', 'hit', 'death'] as const;
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
  private active?: T.AnimationAction;

  constructor(model: T.Object3D, clips: readonly T.AnimationClip[], asset: SoldierAsset) {
    this.model = model;
    this.mixer = new T.AnimationMixer(model);
    for (const state of [...LOOP_STATES, ...ONE_SHOTS]) {
      const name = (asset.clips?.[state] ?? state).toLowerCase();
      const clip = clips.find((item) => item.name.toLowerCase() === name);
      if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0 || !clip.tracks.length || !clip.validate()) continue;
      const action = this.mixer.clipAction(inPlace(clip, asset.motionRoot));
      if (state === 'fire' || state === 'reload' || state === 'death' || state === 'hit') {
        action.setLoop(T.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(state, action);
    }
  }

  get ready(): boolean {
    return this.actions.has('idle') && (this.actions.has('walk') || this.actions.has('run'));
  }

  get hasDeath(): boolean { return this.actions.has('death'); }

  fire(): void { this.restart('fire'); }
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
    if (next !== this.active) {
      this.active?.fadeOut(.15);
      next?.reset().fadeIn(.15).play();
      this.active = next;
    }
    if (state.reload >= 0 && next && next === this.actions.get('reload')) {
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
