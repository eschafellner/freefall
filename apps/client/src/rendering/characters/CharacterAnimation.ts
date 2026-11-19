import { NET, TEST_RIFLE } from '@freefall/shared';
import * as T from 'three';
import { TacticalAnimation } from './TacticalAnimation.ts';
import type { TacticalClip } from './TacticalAnimation.ts';

export type Locomotion = 'idle' | 'walk' | 'run' | 'sprint' | 'strafeLeft' | 'strafeRight' | 'backward';
export type Combat = 'ready' | 'aim' | 'fire' | 'reload';
export type Reaction = 'none' | 'hit' | 'death';
export type CharacterClip = Locomotion | Exclude<Combat, 'ready'> | Exclude<Reaction, 'none'> | TacticalClip;

const clamp = T.MathUtils.clamp;
const damp = T.MathUtils.damp;


export class CharacterAnimation {
  readonly tactical = new TacticalAnimation();
  locomotion: Locomotion = 'idle';
  combat: Combat = 'ready';
  reaction: Reaction = 'none';
  speed = 0;
  forward = 0;
  strafe = 0;
  phase = 0;
  stride = 0;
  stance = .47;
  turn = 0;
  lean = 0;
  aim = 0;
  sprint = 0;
  kick = 0;
  flinch = 0;
  fall = 0;
  reload = -1;
  lower = 0;
  inject = 0;
  throwing = 0;
  /** Melee strike: negative = wind-up, 1 = full thrust at the impact frame. */
  melee = 0;
  holdingGrenade = false;
  private velocityForward = 0;
  private velocityStrafe = 0;

  reset(): void {
    this.tactical.reset();
    this.locomotion = 'idle';
    this.combat = 'ready';
    this.reaction = 'none';
    this.speed = this.forward = this.strafe = this.phase = this.aim = this.sprint = this.kick = this.flinch = this.fall = 0;
    this.holdingGrenade = false;
    this.lower = this.inject = this.throwing = this.melee = 0;
    this.stride = this.turn = this.lean = 0;
    this.reload = -1;
    this.velocityForward = this.velocityStrafe = 0;
  }

  fire(): void { this.kick = 1; }
  hit(): void { this.flinch = 1; }

  update(dt: number, forwardSpeed: number, strafeSpeed: number, sprint: boolean, aim: boolean,
    alive: boolean, reloadUntil: number, tick: number, turnRate = 0, reloadSeconds: number = TEST_RIFLE.reloadSeconds): void {
    // Prediction advances at 30 Hz even on a high-refresh display. Filter velocity before clipping its magnitude.
    const lastForward = this.velocityForward;
    this.velocityForward = damp(this.velocityForward, alive ? forwardSpeed : 0, 14, dt);
    this.velocityStrafe = damp(this.velocityStrafe, alive ? strafeSpeed : 0, 14, dt);
    const speed = Math.hypot(this.velocityForward, this.velocityStrafe);
    this.speed = Math.min(speed, 10.5);
    const denom = Math.max(.5, speed);
    this.forward = this.velocityForward / denom;
    this.strafe = this.velocityStrafe / denom;
    const moving = alive && this.speed > 0.35;
    const sprinting = sprint && moving && this.speed > 6.4 && this.forward > 0.38 && !aim;
    if (!moving) this.locomotion = 'idle';
    else if (sprinting) this.locomotion = 'sprint';
    else if (this.forward < -0.55) this.locomotion = 'backward';
    else if (Math.abs(this.strafe) > 0.69) this.locomotion = this.strafe < 0 ? 'strafeLeft' : 'strafeRight';
    else this.locomotion = this.speed < 3.3 ? 'walk' : 'run';

    if (alive && reloadUntil > tick) {
      const reloadTicks = Math.ceil(reloadSeconds * NET.tickHz);
      const progress = clamp(1 - (reloadUntil - tick) / reloadTicks, 0, 1);
      this.reload = Math.min(1, progress + 2 / reloadTicks, Math.max(progress, this.reload + dt / reloadSeconds));
    } else {
      this.reload = -1;
    }
    this.combat = !alive ? 'ready' : this.reload >= 0 ? 'reload' : this.kick > 0.19 ? 'fire' : aim && alive ? 'aim' : 'ready';
    this.reaction = !alive ? 'death' : this.flinch > 0.17 ? 'hit' : 'none';
    this.aim = damp(this.aim, alive && this.combat !== 'reload' ? aim ? 1 : this.kick * 0.74 : 0, 14, dt);
    this.sprint = damp(this.sprint, sprinting && this.combat === 'ready' ? 1 : 0, 11, dt);
    this.fall = alive ? 0 : Math.min(1, this.fall + dt / 0.64);
    this.turn = damp(this.turn, alive ? clamp(turnRate / 5, -1, 1) : 0, 12, dt);
    this.lean = damp(this.lean, clamp((this.velocityForward - lastForward) / Math.max(.001, dt) / 34, -1, 1), 8, dt);
    this.stance = .47 - .21 * Math.min(1, this.speed / 9.2);
    const cadence = Math.max(.68 + this.speed * .20, this.speed * this.stance / .80);
    this.stride = this.speed * this.stance / (2 * cadence);
    if (alive && (moving || Math.abs(this.turn) > .08)) {
      const cycles = moving ? cadence : 1.35 * Math.abs(this.turn);
      this.phase = (this.phase + dt * Math.PI * 2 * cycles) % (Math.PI * 2);
    }
    this.kick *= Math.exp(-dt * 15);
    this.flinch *= Math.exp(-dt * 9);
  }
}
