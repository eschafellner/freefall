import { MAX_ENEMIES, MAX_PLAYERS, SIMULATION_HZ } from './limits.ts';
import { BALANCE } from '../balance/defaults.ts';

export { MAX_ENEMIES, MAX_PLAYERS, SIMULATION_HZ };
export const ARENA_HALF = 56;
export const HORDE_SIZES = [0, 100, 250, 500, 1_000] as const;
export type HordeSize = (typeof HORDE_SIZES)[number];

export const NET = {
  tickHz: SIMULATION_HZ,
  playerHz: 20,
  hordeHz: 10,
  metricsHz: 2,
  missionHz: 5,
  catchUpSteps: 4,
  inputTimeoutTicks: 8,
  /** Default and starting render delay for snapshot interpolation. */
  interpolationTicks: 4,
} as const;

/**
 * Server-side movement input buffer. Each received input moves the operator exactly once.
 * A short backlog absorbs send and network jitter; the budget caps catch-up after a starved tick.
 */
export const MOVEMENT_INPUT = {
  queue: 10,
  /** Inputs above cushion + backlog are drained with the banked budget. */
  backlog: 2,
  budget: 3,
  /** After a starved tick, movement waits until this many extra inputs are buffered (adaptive). */
  maxCushion: 3,
  /** Only gaps up to this many ticks count as jitter. Longer gaps are pauses (hidden tab, menu). */
  jitterGapTicks: 4,
  /** Ticks (60 s) without starvation before the cushion shrinks by one input. WAN spikes recur slowly. */
  cushionDecayTicks: 1800,
} as const;

/** Client snapshot interpolation. The delay adapts to the measured arrival jitter within these bounds. */
export const INTERPOLATION = {
  minTicks: 2.5,
  maxTicks: 8,
  marginTicks: .6,
  /** Remote operators may be extrapolated this far past the newest snapshot before they hold. */
  extrapolationTicks: 3,
  /** Playback-rate correction toward the target delay, as a fraction of real time. */
  maxRateAdjust: .08,
  /** Larger offsets than this re-anchor the playback clock instead of drifting toward it. */
  resyncTicks: 6,
  /** Arrival history used for jitter estimation, in milliseconds. */
  windowMs: 3000,
} as const;

/** Operator base values from the balance registry (`balance/data/operators.json`). */
export const PLAYER = Object.freeze({
  health: BALANCE.operator.maxHealth,
  walkSpeed: BALANCE.operator.walkSpeed,
  sprintSpeed: BALANCE.operator.sprintSpeed,
  respawnSeconds: BALANCE.operator.respawnSeconds,
  protectionSeconds: BALANCE.operator.respawnProtectionSeconds,
});

export const TEAM_COLORS = [0x73d5e7, 0xf5b65f, 0xaee775, 0xcb9cf3] as const;

export function clampToArena(position: number): number {
  return Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, position));
}
