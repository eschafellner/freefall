import { NET, isGroundPosture, postureProgress } from '@freefall/shared';
import type { PostureState } from '@freefall/shared';
import * as T from 'three';

export const TACTICAL_LOOPS = [
  'crouchIdle', 'crouchWalk', 'crouchStrafeLeft', 'crouchStrafeRight', 'slideLoop',
  'proneIdle', 'proneAim', 'proneCrawl', 'supineIdle', 'supineAim', 'supineMove',
] as const;

export const TACTICAL_ONCE = [
  'crouchEnter', 'crouchExit', 'slideStart', 'slideEnd', 'diveForward', 'diveBackward', 'diveLeft', 'diveRight',
  'diveForwardLeft', 'diveForwardRight', 'diveBackwardLeft', 'diveBackwardRight',
  'proneEnter', 'proneLand', 'proneGetUp', 'supineEnter', 'supineLand', 'supineGetUp',
] as const;

export const TACTICAL_OVERLAYS = [
  'crouchAim', 'crouchFire', 'crouchReload', 'proneFire', 'proneReload', 'proneSwitch', 'proneStim',
  'supineFire', 'supineReload', 'supineSwitch', 'supineStim',
] as const;
export type TacticalClip = (typeof TACTICAL_LOOPS)[number] | (typeof TACTICAL_ONCE)[number];
export type TacticalOverlay = (typeof TACTICAL_OVERLAYS)[number];

const SLIDE_START_END = .2;
const SLIDE_LOOP_END = .8;
export const LANDING_TICKS = Math.ceil(.16 * NET.tickHz);
const GROUND_ENTRY_TICKS = Math.ceil(.2 * NET.tickHz);
const smooth = T.MathUtils.smoothstep;

interface TacticalMotion {
  speed: number;
  strafe?: number;
  combat: string;
  gearAction?: string;
  aiming?: boolean;
}

export class TacticalAnimation {
  clip?: TacticalClip;
  fallback?: TacticalClip;
  overlay?: TacticalOverlay;
  progress?: number;
  crouch = 0;
  slide = 0;
  prone = 0;
  supine = 0;
  roll = 0;
  tuck = 0;
  lateral = 0;
  landing = 0;

  reset(): void {
    this.clip = this.fallback = this.overlay = this.progress = undefined;
    this.crouch = this.slide = this.prone = this.supine = this.roll = this.tuck = this.lateral = this.landing = 0;
  }

  update(state: PostureState | undefined, tick: number, dt: number, motion: TacticalMotion, snap = false): void {
    this.clip = this.fallback = this.overlay = this.progress = undefined;
    let crouch = 0, slide = 0, prone = 0, supine = 0, roll = 0, tuck = 0, lateral = 0, landing = 0;
    if (state) {
      const progress = postureProgress(state, tick);
      if (state.current === 'SLIDING') {
        if (progress < SLIDE_START_END) {
          this.clip = 'slideStart';
          this.progress = progress / SLIDE_START_END;
        } else if (progress < SLIDE_LOOP_END) {
          this.clip = 'slideLoop';
          this.progress = (progress - SLIDE_START_END) / (SLIDE_LOOP_END - SLIDE_START_END);
        } else {
          this.clip = 'slideEnd';
          this.progress = (progress - SLIDE_LOOP_END) / (1 - SLIDE_LOOP_END);
        }
        crouch = T.MathUtils.smoothstep(progress, 0, SLIDE_START_END);
        slide = crouch * (1 - T.MathUtils.smoothstep(progress, SLIDE_LOOP_END, 1));
      } else if (state.current === 'CROUCHING' || (state.current === 'STANDING' && state.from === 'CROUCHING' && tick < state.until)) {
        const entering = state.current === 'CROUCHING';
        const transitioning = progress < 1 && state.from !== 'SLIDING';
        crouch = entering ? transitioning ? smooth(progress, 0, 1) : 1 : 1 - smooth(progress, 0, 1);
        if (transitioning) {
          this.clip = entering ? 'crouchEnter' : 'crouchExit';
          this.progress = progress;
        } else if (motion.speed > .25) {
          const strafe = motion.strafe ?? 0;
          this.clip = Math.abs(strafe) < .69 ? 'crouchWalk' : strafe < 0 ? 'crouchStrafeLeft' : 'crouchStrafeRight';
          this.fallback = 'crouchWalk';
        } else this.clip = 'crouchIdle';
        if (entering) this.overlay = motion.gearAction ? undefined : motion.combat === 'reload' ? 'crouchReload' :
          motion.combat === 'fire' ? 'crouchFire' : motion.aiming || motion.combat === 'aim' ? 'crouchAim' : undefined;
      } else if (state.current === 'DIVING' && state.dive) {
        const { x, z, yaw, takeoff, landing: destination, impact } = state.dive;
        const f = x * Math.sin(yaw) - z * Math.cos(yaw);
        const side = x * Math.cos(yaw) + z * Math.sin(yaw);
        const angle = Math.atan2(Math.abs(side), Math.abs(f));
        const backward = destination === 'SUPINE';
        this.clip = angle < Math.PI / 8 ? backward ? 'diveBackward' : 'diveForward' :
          angle > 3 * Math.PI / 8 && !backward ? side < 0 ? 'diveLeft' : 'diveRight' :
          backward ? side < 0 ? 'diveBackwardLeft' : 'diveBackwardRight' :
          side < 0 ? 'diveForwardLeft' : 'diveForwardRight';
        this.progress = progress;
        const ready = state.dive.from === 'CROUCHING' ? 1 : .78 * smooth(tick, state.started, takeoff);
        const flight = T.MathUtils.clamp((tick - takeoff) / Math.max(1, state.until - takeoff), 0, 1);
        const drop = smooth(flight, 0, .93);
        const extension = Math.sin(Math.PI * drop);
        const braced = impact ? smooth(tick, impact.tick, impact.tick + 3) * (1 - drop) : 0;
        crouch = ready * (1 - smooth(flight, 0, .36));
        prone = backward ? 0 : drop;
        supine = backward ? drop : 0;
        roll = -side * (.9 * extension + .15 * braced);
        lateral = side * extension;
        tuck = extension * (backward ? .92 : .65) + .15 * braced;
      } else if (isGroundPosture(state.current) || state.current === 'GETTING_UP') {
        const rising = state.current === 'GETTING_UP';
        const belly = (rising ? state.from : state.current) === 'PRONE';
        const low = rising ? 1 - T.MathUtils.smoothstep(progress, 0, .78) : 1;
        prone = belly ? low : 0;
        supine = belly ? 0 : low;
        crouch = rising ? Math.sin(Math.PI * progress) * .85 : 0;
        roll = rising && !belly ? .46 * Math.sin(Math.PI * progress) : 0;
        const { combat, speed, gearAction, aiming } = motion;
        this.clip = rising ? belly ? 'proneGetUp' : 'supineGetUp' :
          speed > .22 ? belly ? 'proneCrawl' : 'supineMove' :
          aiming || combat === 'aim' ? belly ? 'proneAim' : 'supineAim' : belly ? 'proneIdle' : 'supineIdle';
        if (rising) this.progress = progress;
        else {
          if (gearAction === 'stim') this.overlay = belly ? 'proneStim' : 'supineStim';
          else if (gearAction === 'primary' || gearAction === 'secondary') this.overlay = belly ? 'proneSwitch' : 'supineSwitch';
          else if (combat === 'reload') this.overlay = belly ? 'proneReload' : 'supineReload';
          else if (combat === 'fire') this.overlay = belly ? 'proneFire' : 'supineFire';
          // The authoritative landing remains available across dropped snapshots and reconnects.
          const touchdown = state.landedDive?.until;
          if (touchdown === state.started && state.landedDive?.landing === state.current && tick < touchdown + LANDING_TICKS) {
            this.fallback = this.clip;
            this.clip = belly ? 'proneLand' : 'supineLand';
            this.progress = T.MathUtils.clamp((tick - touchdown) / LANDING_TICKS, 0, 1);
            landing = Math.sin(Math.PI * this.progress) * (1 - this.progress);
          } else if (state.from === 'STANDING' || state.from === 'CROUCHING') {
            const entry = (tick - state.started) / GROUND_ENTRY_TICKS;
            if (entry >= 0 && entry < 1) {
              this.fallback = this.clip;
              this.clip = belly ? 'proneEnter' : 'supineEnter';
              this.progress = entry;
            }
          }
        }
      }
    }
    this.crouch = snap ? crouch : T.MathUtils.damp(this.crouch, crouch, 18, dt);
    this.slide = snap ? slide : T.MathUtils.damp(this.slide, slide, 20, dt);
    this.prone = snap ? prone : T.MathUtils.damp(this.prone, prone, 24, dt);
    this.supine = snap ? supine : T.MathUtils.damp(this.supine, supine, 24, dt);
    this.roll = snap ? roll : T.MathUtils.damp(this.roll, roll, 22, dt);
    this.tuck = snap ? tuck : T.MathUtils.damp(this.tuck, tuck, 22, dt);
    this.lateral = snap ? lateral : T.MathUtils.damp(this.lateral, lateral, 22, dt);
    this.landing = landing;
  }
}
