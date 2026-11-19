import { BALANCE, NET, isGroundPosture, postureProgress } from '@freefall/shared';
import type { PostureState } from '@freefall/shared';
import * as T from 'three';

export const TACTICAL_LOOPS = [
  'crouchIdle', 'crouchWalk',
  'proneIdle', 'proneAim', 'proneCrawl', 'supineIdle', 'supineAim', 'supineMove',
] as const;

export const TACTICAL_ONCE = [
  'crouchEnter', 'crouchExit', 'diveForward', 'diveBackward', 'diveLeft', 'diveRight',
  'diveForwardLeft', 'diveForwardRight', 'diveBackwardLeft', 'diveBackwardRight',
  'proneFire', 'proneReload', 'proneGetUp', 'proneStim',
  'supineFire', 'supineReload', 'supineGetUp', 'supineStim',
] as const;

export type TacticalClip = (typeof TACTICAL_LOOPS)[number] | (typeof TACTICAL_ONCE)[number];

export class TacticalAnimation {
  clip?: TacticalClip;
  progress?: number;
  crouch = 0;
  prone = 0;
  supine = 0;
  roll = 0;
  tuck = 0;

  reset(): void {
    this.clip = undefined;
    this.progress = undefined;
    this.crouch = this.prone = this.supine = this.roll = this.tuck = 0;
  }

  update(state: PostureState | undefined, tick: number, dt: number,
    motion: { speed: number; combat: string; inject: number }): void {
    this.clip = this.progress = undefined;
    let crouch = 0, prone = 0, supine = 0, roll = 0, tuck = 0;
    if (state) {
      const progress = postureProgress(state, tick);
      if (state.current === 'CROUCHING' || (state.current === 'STANDING' && state.from === 'CROUCHING' && tick < state.until)) {
        const entering = state.current === 'CROUCHING';
        crouch = entering ? 1 : 0;
        this.clip = progress < 1 ? entering ? 'crouchEnter' : 'crouchExit' : motion.speed > .25 ? 'crouchWalk' : 'crouchIdle';
        if (progress < 1) this.progress = progress;
      } else if (state.current === 'DIVING' && state.dive) {
        const { x, z, landing } = state.dive;
        const f = x * Math.sin(state.yaw) - z * Math.cos(state.yaw);
        const side = x * Math.cos(state.yaw) + z * Math.sin(state.yaw);
        const angle = Math.atan2(Math.abs(side), Math.abs(f));
        this.clip = angle < Math.PI / 8 ? f < 0 ? 'diveBackward' : 'diveForward' :
          angle > 3 * Math.PI / 8 ? side < 0 ? 'diveLeft' : 'diveRight' :
          f < 0 ? side < 0 ? 'diveBackwardLeft' : 'diveBackwardRight' :
          side < 0 ? 'diveForwardLeft' : 'diveForwardRight';
        this.progress = progress;
        const prep = Math.ceil(BALANCE.movement.divePrepSeconds * NET.tickHz) / Math.max(1, state.until - state.started);
        const drop = T.MathUtils.smoothstep(progress, prep * .7, .82);
        crouch = .76 * Math.sin(Math.PI * Math.min(1, progress / Math.max(.07, prep * 2.7)));
        prone = landing === 'PRONE' ? drop : 0;
        supine = landing === 'SUPINE' ? drop : 0;
        roll = -side * .78 * Math.sin(Math.PI * drop);
        tuck = Math.sin(Math.PI * drop);
      } else if (isGroundPosture(state.current) || state.current === 'GETTING_UP') {
        const rising = state.current === 'GETTING_UP';
        const belly = (rising ? state.from : state.current) === 'PRONE';
        const low = rising ? 1 - T.MathUtils.smoothstep(progress, 0, .78) : 1;
        prone = belly ? low : 0;
        supine = belly ? 0 : low;
        crouch = rising ? Math.sin(Math.PI * progress) * .85 : 0;
        roll = rising && !belly ? .46 * Math.sin(Math.PI * progress) : 0;
        const { combat, speed, inject } = motion;
        this.clip = rising ? belly ? 'proneGetUp' : 'supineGetUp' :
          inject > .05 ? belly ? 'proneStim' : 'supineStim' :
          combat === 'reload' ? belly ? 'proneReload' : 'supineReload' :
          combat === 'fire' ? belly ? 'proneFire' : 'supineFire' :
          speed > .22 ? belly ? 'proneCrawl' : 'supineMove' :
          combat === 'aim' ? belly ? 'proneAim' : 'supineAim' : belly ? 'proneIdle' : 'supineIdle';
        if (rising) this.progress = progress;
      }
    }
    this.crouch = T.MathUtils.damp(this.crouch, crouch, 16, dt);
    this.prone = T.MathUtils.damp(this.prone, prone, 20, dt);
    this.supine = T.MathUtils.damp(this.supine, supine, 20, dt);
    this.roll = T.MathUtils.damp(this.roll, roll, 22, dt);
    this.tuck = T.MathUtils.damp(this.tuck, tuck, 18, dt);
  }
}
