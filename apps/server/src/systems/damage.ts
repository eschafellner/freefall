/**
 * Central damage resolver for every player-caused and enemy-caused hit.
 *
 * Order of operations (each step at most once per damage event):
 *   1. Base damage: weapon damage, melee damage or grenade damage after distance falloff.
 *   2. Target-type multiplier: structure multiplier for explosions against structures (`structureDamageMultipliers`).
 *   3. Relation multiplier from `combat.json › damagePolicy`: hostile 1, operator → operator, operator → convict or
 *      self damage. Applied exactly once here; callers never scale by the policy themselves.
 *   4. Rounding: operators, convicts and structures take whole hit points (at least 1 if the result is positive).
 *      Enemies keep fractional damage (ECS health is a float).
 *   5. Target side: convict armor, respawn and landing protection are applied by the target afterwards.
 */
import type { DamagePolicy, DamageSource } from '@freefall/shared';

export type Combatant = 'operator' | 'enemy' | 'convict';
export type DamageTarget = 'operator' | 'enemy' | 'convict' | 'structure' | 'vehicle';
export type DamageRelation = 'hostile' | 'friendly' | 'self';

export interface DamageRequest {
  readonly source: DamageSource;
  readonly attacker: Combatant;
  readonly target: DamageTarget;
  /** Attacker and target are the same operator (own grenade). */
  readonly self?: boolean;
  readonly base: number;
  /** Explosion against a structure: the grenade's structure multiplier. */
  readonly structureMultiplier?: number;
}

export interface ResolvedDamage {
  readonly amount: number;
  readonly relation: DamageRelation;
  /** Relation multiplier that was applied (1 for hostile damage). */
  readonly multiplier: number;
}

export function damageRelation(attacker: Combatant, target: DamageTarget, self = false): DamageRelation {
  if (self) return 'self';
  const allied = (side: Combatant | DamageTarget) => side === 'operator' || side === 'convict';
  if (attacker === 'enemy') return target === 'enemy' ? 'friendly' : 'hostile';
  return allied(target) ? 'friendly' : 'hostile';
}

export function relationMultiplier(policy: DamagePolicy, request: DamageRequest, relation: DamageRelation): number {
  if (relation === 'hostile') return 1;
  if (request.source === 'explosion' && request.target === 'operator' && !policy.explosionsDamageOperators) return 0;
  if (relation === 'self') return policy.selfDamage;
  if (request.attacker === 'operator' && request.target === 'operator') return policy.operatorToOperator;
  if (request.attacker === 'operator' && request.target === 'convict') return policy.operatorToConvict;
  // Enemy against enemy and convict against operator are not simulated.
  return 0;
}

export function resolveDamage(policy: DamagePolicy, request: DamageRequest): ResolvedDamage {
  const relation = damageRelation(request.attacker, request.target, request.self);
  const multiplier = relationMultiplier(policy, request, relation);
  let amount = Math.max(0, request.base);
  if (request.target === 'structure' && request.source === 'explosion') amount *= request.structureMultiplier ?? 1;
  amount *= multiplier;
  if (request.target !== 'enemy' && amount > 0) amount = Math.max(1, Math.round(amount));
  return { amount, relation, multiplier };
}
