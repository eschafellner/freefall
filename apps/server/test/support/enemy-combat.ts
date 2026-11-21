import { ENEMY_TYPES } from '@freefall/shared';
import type { Battlefield } from '../../src/simulation/Battlefield.ts';

export function enemyCombatTick(field: Battlefield, tick: number, world = field.world, enemies = ENEMY_TYPES): void {
  field.enemyCombat.update(field.horde, field.players, tick, enemies, field.movementBalance, world);
}

export function runEnemyStrike(field: Battlefield, start: number, world = field.world, enemies = ENEMY_TYPES): number {
  const impact = start + field.enemyCombat.timing.windupTicks;
  for (let tick = start; tick <= impact; tick++) enemyCombatTick(field, tick, world, enemies);
  return impact;
}
