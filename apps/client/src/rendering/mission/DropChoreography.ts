import * as T from 'three';
import type { DeploymentPhase } from '@freefall/shared';

/** Retro burn starts at `brakeHeight` metres, holds a short hover at `flareHeight`, then the lander drops onto its gear. */
export const DROP = { brakeHeight: 140, flareHeight: 4, throttleDown: .86, compression: .42 } as const;

export interface DropPose {
  /** Hull height above the landing pad (negative while the suspension is compressed). */
  height: number;
  pitch: number;
  roll: number;
  /** Camera shake amount 0–1.5 before user scaling. */
  shake: number;
  /** Heat-shield glow and plasma sheath 0–1. */
  heat: number;
  /** Main engine thrust 0–1. */
  thrust: number;
  /** Landing gear extension 0 (stowed) – 1 (down). */
  gear: number;
  /** Suspension compression in metres after touchdown. */
  compression: number;
  /** Touchdown impact envelope 1 → 0. */
  impact: number;
  /** Seconds since touchdown, -1 before. */
  sinceImpact: number;
}

const ease = (x: number) => T.MathUtils.smootherstep(x, 0, 1);

/** Pure flight choreography from the server phase and its progress; shared by the lander, camera and audio. */
export function dropPose(phase: DeploymentPhase, progress: number, seconds: number, wobble: number): DropPose {
  const e = T.MathUtils.clamp(progress, 0, 1);
  const pose: DropPose = { height: 0, pitch: 0, roll: 0, shake: 0, heat: 0, thrust: 0, gear: 1, compression: 0, impact: 0, sinceImpact: -1 };
  const sway = Math.sin(wobble * .49);
  switch (phase) {
    case 'LOCKED':
      // Docking clamps release one after another; the hull starts to strain against the cradle.
      pose.shake = .12 + .4 * e + (e > .7 ? .35 * Math.sin((e - .7) * 40) ** 2 : 0);
      break;
    case 'DROPPING':
      pose.pitch = -.04 - .1 * ease(e);
      pose.roll = sway * (.05 + .04 * e);
      pose.shake = .45 - .15 * e;
      pose.gear = 1 - T.MathUtils.smoothstep(e, .05, .4);
      break;
    case 'ATMOSPHERIC_ENTRY':
      pose.heat = T.MathUtils.smoothstep(e, 0, .35) * (1 - .55 * T.MathUtils.smoothstep(e, .8, 1));
      pose.pitch = -.14 + .02 * Math.sin(wobble * .9);
      pose.roll = sway * .07 * (1 + pose.heat);
      pose.shake = .45 + .9 * pose.heat;
      pose.thrust = .25 * T.MathUtils.smoothstep(e, .85, 1);
      pose.gear = 0;
      break;
    case 'BRAKING': {
      const burn = Math.min(1, e / DROP.throttleDown);
      const fall = Math.max(0, (e - DROP.throttleDown) / (1 - DROP.throttleDown));
      pose.height = e < DROP.throttleDown
        ? DROP.flareHeight + (DROP.brakeHeight - DROP.flareHeight) * (1 - burn) ** 2.4
        : DROP.flareHeight * (1 - fall * fall);
      pose.thrust = e < DROP.throttleDown ? 1 : 1 - .85 * fall;
      pose.heat = .5 * (1 - T.MathUtils.smoothstep(e, 0, .25));
      pose.gear = T.MathUtils.smoothstep(e, .45, .75);
      pose.pitch = -.03 + .07 * T.MathUtils.smoothstep(e, .6, .84) * (1 - fall);
      pose.roll = sway * .025;
      pose.shake = .3 + .45 * pose.thrust + .25 * fall;
      break;
    }
    case 'TOUCHDOWN': {
      // Heavy slam onto the gear: damped spring in the suspension, impact shake, then the ramp drops.
      const s = Math.max(0, seconds);
      pose.sinceImpact = s;
      pose.compression = DROP.compression * Math.exp(-s * 5.2) * Math.cos(s * 12.5);
      pose.height = -pose.compression;
      pose.impact = Math.exp(-s * 3.1);
      pose.pitch = .035 * Math.exp(-s * 4) * Math.sin(s * 10);
      pose.shake = 1.4 * pose.impact;
      break;
    }
  }
  return pose;
}
