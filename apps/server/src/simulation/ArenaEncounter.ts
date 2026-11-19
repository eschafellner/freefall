import { ARENA_HALF, BALANCE } from '@freefall/shared';

const arena = BALANCE.swarm.arena;

/** Arena reinforcement ring. Values live in `balance/data/swarm.json` (`arena`). */
export const ARENA_REINFORCEMENTS = Object.freeze({
  archetypeId: arena.archetypeId,
  outerRadius: ARENA_HALF - arena.outerRadiusInset,
  ringWidth: arena.ringWidth,
  refillTicks: arena.refillTicks,
});

export const ARENA_SPAWN_TYPE = BALANCE.enemy(ARENA_REINFORCEMENTS.archetypeId).wireType;
