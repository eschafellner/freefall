import { attackDuration, attackStrikeAt } from '@freefall/shared';
import type { EnemyAttackTiming } from '@freefall/shared';

/** Attack state of one enemy on the render clock: kind, timing and fractional ticks since the attack started. */
export interface AttackSample {
  kind: number;
  timing: EnemyAttackTiming;
  elapsed: number;
}

/** Phase progress of an attack: 'windup' | 'flight' | 'active' | 'recovery' with 0…1 within the phase. */
export function attackPhase(attack: AttackSample): { phase: 'windup' | 'flight' | 'active' | 'recovery'; t: number } | undefined {
  const { timing, elapsed } = attack;
  const strike = attackStrikeAt(timing);
  if (elapsed < 0 || elapsed >= attackDuration(timing)) return;
  if (elapsed < timing.windupTicks) return { phase: 'windup', t: elapsed / timing.windupTicks };
  if (elapsed < strike) return { phase: 'flight', t: (elapsed - timing.windupTicks) / timing.flightTicks };
  if (elapsed < strike + timing.activeTicks) return { phase: 'active', t: (elapsed - strike) / timing.activeTicks };
  return { phase: 'recovery', t: (elapsed - strike - timing.activeTicks) / timing.recoveryTicks };
}
