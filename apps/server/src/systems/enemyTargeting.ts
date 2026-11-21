import { MAX_ENEMIES } from '@freefall/shared';
import type { MissionBalance } from '@freefall/shared';
import type { HordeManager } from '../ecs/HordeManager.ts';
import type { SimPlayer } from '../simulation/Player.ts';

export type OperatorSlots = readonly (SimPlayer | undefined)[];
type TargetingBalance = MissionBalance['hordeAi']['targeting'];

export function validOperator(player: SimPlayer | undefined): player is SimPlayer {
  return !!player && player.hp > 0 && Number.isFinite(player.x) && Number.isFinite(player.y) && Number.isFinite(player.z);
}

/** A slot can be reused, and an arena respawn changes life without replacing the player object. */
export function currentOperator(players: OperatorSlots, player: SimPlayer | undefined, life: number): SimPlayer | undefined {
  return validOperator(player) && players[player.slot] === player && player.life === life ? player : undefined;
}

/** Distance is the existing aggro signal. Perception and mission participation remain caller-owned. */
export function selectOperator(players: OperatorSlots, x: number, z: number, config: TargetingBalance, current?: SimPlayer, committed = false,
  range = Infinity, accepts?: (player: SimPlayer) => boolean): SimPlayer | undefined {
  let bestDistance = range * range;
  let best: SimPlayer | undefined;
  if (validOperator(current) && players[current.slot] === current) {
    const distance = (current.x - x) ** 2 + (current.z - z) ** 2;
    if (distance <= bestDistance && (!accepts || accepts(current))) {
      if (committed) return current;
      best = current;
      const meters = Math.sqrt(distance);
      const switchDistance = Math.min(meters * config.switchRatio, meters - config.switchMeters);
      if (switchDistance <= 0) return current;
      bestDistance = switchDistance ** 2;
    }
  }
  for (const candidate of players) {
    if (candidate === current || !validOperator(candidate)) continue;
    const distance = (candidate.x - x) ** 2 + (candidate.z - z) ** 2;
    if (distance > bestDistance || (best && best !== current && distance === bestDistance) || (accepts && !accepts(candidate))) continue;
    bestDistance = distance;
    best = candidate;
  }
  return best;
}

export class ArenaTargeting {
  private readonly enemyIds = new Uint32Array(MAX_ENEMIES);
  private readonly lives = new Uint32Array(MAX_ENEMIES);
  private readonly committedUntil = new Uint32Array(MAX_ENEMIES);
  private readonly targets: (SimPlayer | undefined)[] = [];

  update(horde: HordeManager, players: OperatorSlots, tick: number, config: MissionBalance['hordeAi']): void {
    for (let index = 0; index < horde.count; index++) {
      const slot = horde.active[index];
      const fresh = this.enemyIds[slot] !== horde.id[slot];
      const previous = fresh ? undefined : this.targets[slot];
      const current = currentOperator(players, previous, this.lives[slot]);
      if (!fresh && previous === current && (tick + slot) % config.targetTicks !== 0) continue;
      const next = selectOperator(players, horde.x[slot], horde.z[slot], config.targeting, current, tick < this.committedUntil[slot]);
      if (fresh || next !== current) this.committedUntil[slot] = tick + config.targeting.commitmentTicks;
      this.enemyIds[slot] = horde.id[slot];
      this.targets[slot] = next;
      this.lives[slot] = next?.life ?? 0;
      horde.target[slot] = next?.slot ?? -1;
    }
  }
}
