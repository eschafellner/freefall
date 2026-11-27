/**
 * Operator stamina. Server and client prediction advance it once per movement input (one 1/30 s step), in whole
 * thousandths of a point, so both sides compute exactly the same value and the snapshot carries it losslessly.
 *
 *   - Sprinting drains `sprintDrain` per step. At 0 the operator is exhausted and cannot sprint until `recoverAt`.
 *   - Dives and slides cost a fixed amount and need that much stamina to start.
 *   - After `delaySteps` steps without spending, stamina recovers by `recovery` per step (`lyingRecovery` while
 *     crouched, prone or supine).
 */
export interface StaminaRules {
  /** Pool in thousandths of a point (100 points = 100 000). */
  readonly max: number;
  readonly sprintDrain: number;
  readonly recovery: number;
  readonly lyingRecovery: number;
  readonly delaySteps: number;
  readonly diveCost: number;
  readonly slideCost: number;
  /** Exhaustion ends at this value. */
  readonly recoverAt: number;
}

export interface StaminaState {
  /** Thousandths of a point, 0 … max. */
  value: number;
  /** Steps since stamina was last spent, capped at `delaySteps`. */
  rest: number;
  exhausted: boolean;
}

/** Wire form (`PlayerState.stamina`); absent means full and rested. */
export interface StaminaSnapshot {
  readonly value: number;
  readonly rest: number;
  readonly exhausted?: true;
}

export function freshStamina(rules: StaminaRules): StaminaState {
  return { value: rules.max, rest: rules.delaySteps, exhausted: false };
}

export const canSprint = (stamina: StaminaState) => !stamina.exhausted && stamina.value > 0;

export function spendStamina(stamina: StaminaState, amount: number): void {
  stamina.value = Math.max(0, stamina.value - amount);
  stamina.rest = 0;
  if (stamina.value === 0) stamina.exhausted = true;
}

export function restStamina(stamina: StaminaState, rules: StaminaRules, lying: boolean): void {
  if (stamina.rest < rules.delaySteps) {
    stamina.rest++;
    return;
  }
  stamina.value = Math.min(rules.max, stamina.value + (lying ? rules.lyingRecovery : rules.recovery));
  if (stamina.exhausted && stamina.value >= rules.recoverAt) stamina.exhausted = false;
}

/** Fills the pool (respawn, loadout change, healing stim). */
export function refillStamina(stamina: StaminaState, rules: StaminaRules): void {
  Object.assign(stamina, freshStamina(rules));
}

export function staminaSnapshot(stamina: StaminaState, rules: StaminaRules): StaminaSnapshot | undefined {
  if (stamina.value >= rules.max && stamina.rest >= rules.delaySteps && !stamina.exhausted) return undefined;
  return { value: stamina.value, rest: stamina.rest, ...(stamina.exhausted && { exhausted: true as const }) };
}

export function staminaFromSnapshot(snapshot: StaminaSnapshot | undefined, rules: StaminaRules): StaminaState {
  if (!snapshot) return freshStamina(rules);
  return { value: Math.min(rules.max, snapshot.value), rest: Math.min(rules.delaySteps, snapshot.rest), exhausted: !!snapshot.exhausted };
}
