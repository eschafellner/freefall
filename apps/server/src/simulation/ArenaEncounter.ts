import { ARENA_HALF, ENEMY_ARCHETYPES, SCHABE_ARCHETYPE_ID } from '@freefall/shared';

export const ARENA_REINFORCEMENTS = {
  archetypeId: SCHABE_ARCHETYPE_ID,
  outerRadius: ARENA_HALF - 5,
  ringWidth: 11,
  refillTicks: 9,
} as const;

export const ARENA_SPAWN_TYPE = ENEMY_ARCHETYPES[ARENA_REINFORCEMENTS.archetypeId].wireType;
