import type { GroundPosture } from './posture.ts';
import type { PositionXZ } from './movement.ts';

export interface DiveState {
  /** Input sequence, scoped to the operator's life. */
  id: number;
  x: number;
  z: number;
  yaw: number;
  from: 'STANDING' | 'CROUCHING';
  landing: GroundPosture;
  originX: number;
  originZ: number;
  started: number;
  takeoff: number;
  until: number;
  distance: number;
  arcHeight: number;
  /** First blocked step, including the partial displacement accepted by the sweep. */
  impact?: { tick: number; travel: number; elevation: number };
}

const HORIZONTAL_DECAY = .35;

function flightProgress(dive: DiveState, tick: number): number {
  return Math.max(0, Math.min(1, (tick - dive.takeoff) / (dive.until - dive.takeoff)));
}

function travelAt(distance: number, progress: number): number {
  return distance * progress * (1 + HORIZONTAL_DECAY * (1 - progress));
}

export function diveTravel(dive: DiveState, tick: number): number {
  if (dive.impact && tick >= dive.impact.tick) return dive.impact.travel;
  return travelAt(dive.distance, flightProgress(dive, tick));
}

export function diveElevation(dive: DiveState, tick: number): number {
  const { impact } = dive;
  if (tick >= dive.until) return 0;
  if (impact && tick >= impact.tick) {
    return impact.elevation * (dive.until - tick) / (dive.until - impact.tick);
  }
  const s = flightProgress(dive, tick);
  return 4 * dive.arcHeight * s * (1 - s);
}

export function divePeakStep(dive: DiveState): number {
  return travelAt(dive.distance, flightProgress(dive, dive.takeoff + 1));
}

/** Interpolate fixed-step positions, including the partial step into a blocking obstacle. */
export function sampleDive(dive: DiveState, tick: number, out: PositionXZ & { y?: number }): void {
  const before = Math.floor(tick), f = tick - before;
  const travel = diveTravel(dive, before) * (1 - f) + diveTravel(dive, before + 1) * f;
  out.x = dive.originX + dive.x * travel;
  out.z = dive.originZ + dive.z * travel;
  out.y = diveElevation(dive, before) * (1 - f) + diveElevation(dive, before + 1) * f;
}
