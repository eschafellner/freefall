/**
 * Armor, penetration and damage falloff. Shared so that the authoritative server and client displays (HUD, catalog)
 * use identical rules. All values come from `balance/data/ammunition.json` and the weapon/enemy definitions.
 *
 *   - Armor classes and penetration use one scale 1 … 7. A hit penetrates when penetration ≥ armor class.
 *   - A non-penetrating hit deals `nonPenetratingDamageFraction` of its damage (blunt trauma).
 *   - Falloff: full damage up to `startMeters`, linear decrease to `minMultiplier` at `endMeters`, constant beyond.
 */
import type { CaliberDefinition, DamageType, EnemyResistances } from '../balance/definitions.ts';

export function penetrates(penetration: number, armorClass: number): boolean {
  return penetration >= armorClass;
}

/** Damage multiplier of the armor step: 1 when penetrating, otherwise the residual fraction. */
export function armorMultiplier(penetration: number, armorClass: number, nonPenetratingFraction: number): number {
  return penetrates(penetration, armorClass) ? 1 : nonPenetratingFraction;
}

export function falloffMultiplier(distance: number, falloff: CaliberDefinition['falloff']): number {
  if (!(distance > falloff.startMeters)) return 1;
  if (distance >= falloff.endMeters) return falloff.minMultiplier;
  const t = (distance - falloff.startMeters) / (falloff.endMeters - falloff.startMeters);
  return 1 - t * (1 - falloff.minMultiplier);
}

/** Target-side protection of an enemy archetype. */
export interface EnemyProtection {
  readonly armorClass: number;
  readonly resistances: EnemyResistances;
}

export function resistanceMultiplier(protection: EnemyProtection, type: DamageType): number {
  return protection.resistances[type];
}
