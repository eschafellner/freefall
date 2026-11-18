export const ARENA_HALF = 56;
export const MAX_PLAYERS = 4;
export const MAX_ENEMIES = 1_000;
export const HORDE_SIZES = [0, 100, 250, 500, 1_000] as const;
export type HordeSize = (typeof HORDE_SIZES)[number];

export const NET = {
  tickHz: 30,
  playerHz: 20,
  hordeHz: 10,
  metricsHz: 2,
  missionHz: 5,
  catchUpSteps: 4,
  inputTimeoutTicks: 8,
  interpolationTicks: 4,
} as const;

export const PLAYER = {
  health: 100,
  walkSpeed: 5.8,
  sprintSpeed: 9.2,
  respawnSeconds: 3,
  protectionSeconds: 2,
} as const;

export const TEAM_COLORS = [0x73d5e7, 0xf5b65f, 0xaee775, 0xcb9cf3] as const;

export function clampToArena(position: number): number {
  return Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, position));
}
