/**
 * Weapon handling shared by the authoritative server and the client recoil prediction.
 *
 * Model (all values from `weapons.json`, resolved by `effectiveWeapon`):
 *   - Gameplay recoil: every shot adds a climb (pitch) and a deterministic horizontal deflection (yaw) to the shot
 *     direction. Consecutive shots grow the kick up to `maxSustainedMultiplier`, so long bursts get harder to control.
 *   - Recovery: after `recoveryDelayTicks` without a shot the offset returns to the point of aim.
 *   - Spread: a random cone (hip/aim, moving multiplier) plus bloom per shot. Rolled on the server only.
 * The client camera shows the predicted recoil offset; the crosshair therefore stays on the server's shot line.
 */
import type { EffectiveRecoil, EffectiveSpread } from '../balance/resolver.ts';

export interface RecoilState {
  /** Accumulated offset in radians, added to the input direction. */
  pitch: number;
  yaw: number;
  /** Consecutive shots without full recovery. */
  streak: number;
  lastShotTick: number;
  /** Additional spread cone in radians. */
  bloom: number;
}

export const createRecoilState = (): RecoilState => ({ pitch: 0, yaw: 0, streak: 0, lastShotTick: -1_000_000, bloom: 0 });

export function resetRecoil(state: RecoilState): void {
  state.pitch = state.yaw = state.streak = state.bloom = 0;
  state.lastShotTick = -1_000_000;
}

/** Deterministic horizontal pattern in [-1, 1] with a slight right drift. Identical on server and client. */
export function recoilPattern(streak: number): number {
  const x = Math.sin(streak * 12.9898 + 78.233) * 43758.5453;
  return Math.max(-1, Math.min(1, (x - Math.floor(x)) * 1.7 - .7));
}

export function applyShotRecoil(state: RecoilState, recoil: EffectiveRecoil, spread: EffectiveSpread, tick: number): void {
  const growth = Math.min(recoil.maxSustainedMultiplier, 1 + recoil.sustainedGrowthPerShot * state.streak);
  state.pitch = Math.min(recoil.maxClimb, state.pitch + recoil.pitchPerShot * growth);
  const sideLimit = recoil.maxClimb * .5;
  state.yaw = Math.max(-sideLimit, Math.min(sideLimit, state.yaw + recoilPattern(state.streak) * recoil.yawPerShot * growth));
  state.bloom = Math.min(spread.maxBloom, state.bloom + spread.bloomPerShot);
  state.streak++;
  state.lastShotTick = tick;
}

/** Advances recovery by one simulation tick. */
export function recoverRecoil(state: RecoilState, recoil: EffectiveRecoil, spread: EffectiveSpread, tick: number): void {
  state.bloom = Math.max(0, state.bloom - spread.bloomRecoveryPerTick);
  if (tick - state.lastShotTick < recoil.recoveryDelayTicks) return;
  const magnitude = Math.hypot(state.pitch, state.yaw);
  if (magnitude <= recoil.recoveryPerTick) {
    state.pitch = state.yaw = 0;
    state.streak = 0;
    return;
  }
  const scale = (magnitude - recoil.recoveryPerTick) / magnitude;
  state.pitch *= scale;
  state.yaw *= scale;
}

/**
 * Earliest tick of the next shot (fractional). Sustained fire continues from the scheduled time, so a 4/s weapon
 * fires every 7 or 8 ticks (7.5 on average) instead of always every 8. After a pause the schedule restarts at `tick`.
 * Shared by the server and the client recoil prediction.
 */
export function nextShotAt(scheduled: number, tick: number, interval: number): number {
  return (scheduled > tick - 1 ? scheduled : tick) + interval;
}

/** Spread cone half-angle in radians for the next shot. */
export function spreadCone(spread: EffectiveSpread, state: RecoilState, aiming: boolean, moving: boolean): number {
  return (aiming ? spread.aim : spread.hip) * (moving ? spread.movingMultiplier : 1) + state.bloom;
}
