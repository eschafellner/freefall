/**
 * Enemy aliases. All values live in `balance/data/enemies.json`. The registry validates IDs, factions and the
 * unique, gap-free wire types; these exports keep the historic names and network IDs stable.
 */
import { BALANCE } from '../balance/defaults.ts';
import type { EnemyArchetype, EnemyGameplay, FactionDefinition } from '../balance/definitions.ts';
import type { EnemyProtection } from '../combat/ballistics.ts';

export type { EnemyArchetype, EnemyGameplay } from '../balance/definitions.ts';

export const SWARM_FACTION_ID = 'swarm';
export const SCHABE_ARCHETYPE_ID = 'swarm.schabe';
export const SCHABE_TYPE = BALANCE.enemy(SCHABE_ARCHETYPE_ID).wireType;
export const JAEGER_ARCHETYPE_ID = 'swarm.jaeger';
export const JAEGER_TYPE = BALANCE.enemy(JAEGER_ARCHETYPE_ID).wireType;
export const BREACHER_ARCHETYPE_ID = 'swarm.durchbruchskaefer';
export const BREACHER_TYPE = BALANCE.enemy(BREACHER_ARCHETYPE_ID).wireType;

export const FACTIONS: Readonly<Record<string, FactionDefinition>> = Object.freeze(Object.fromEntries(BALANCE.factions));
export const ENEMY_ARCHETYPES: Readonly<Record<string, EnemyArchetype>> = Object.freeze(Object.fromEntries(BALANCE.enemies));
export const ENEMY_ARCHETYPES_BY_TYPE = BALANCE.enemiesByWireType;
/** Dense base gameplay lookup by wire type for the ECS. Missions use the difficulty-resolved copy in MissionBalance. */
export const ENEMY_TYPES: readonly EnemyGameplay[] = Object.freeze(BALANCE.enemiesByWireType.map((archetype) => archetype!.gameplay));
/** Armor class and damage-type resistances by wire type. Not affected by difficulty. */
export function enemyProtection(registry: typeof BALANCE): readonly EnemyProtection[] {
  return Object.freeze(registry.enemiesByWireType.map((archetype) =>
    Object.freeze({ armorClass: archetype!.armorClass, resistances: archetype!.resistances })));
}
export const ENEMY_PROTECTION = enemyProtection(BALANCE);
export const RUNNER_TYPE = SCHABE_TYPE;
export type EnemyDefinition = EnemyGameplay;
