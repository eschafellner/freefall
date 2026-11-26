import { ALBATROSS, BALLOON, canSecureExtraction, distanceSquared, extractionLiftTicks, inAlbatross, openGround } from '@freefall/shared';
import type { ExtractionMethod, ExtractionSnapshot, MissionLocation, PositionXZ, WorldDefinition } from '@freefall/shared';
import type { SimPlayer } from '../simulation/Player.ts';

interface ExtractionStrategy {
  countdown: number;
  radius: number;
  anchor(player: SimPlayer, ship: PositionXZ): PositionXZ;
  eligible(player: SimPlayer, anchor: PositionXZ): boolean;
}

const strategies: Record<ExtractionMethod, ExtractionStrategy> = {
  albatross: {
    countdown: ALBATROSS.launchTicks, radius: ALBATROSS.boardingLength,
    anchor: (_player, ship) => ship, eligible: inAlbatross,
  },
  balloon: {
    countdown: BALLOON.countdownTicks, radius: BALLOON.radius,
    anchor: (player) => player, eligible: (player, anchor) => distanceSquared(player, anchor) <= BALLOON.radius ** 2 + 1e-7,
  },
};

export class ExtractionSystem {
  current?: ExtractionSnapshot;
  attempted?: ExtractionMethod;
  private balloonUsed = false;

  start(method: ExtractionMethod, player: SimPlayer, ship: PositionXZ, airworthy: boolean,
    tick: number, world: WorldDefinition, pickup?: MissionLocation): boolean {
    if (this.current || (method === 'balloon' ? this.balloonUsed : !airworthy)) return false;
    const strategy = strategies[method];
    if (method === 'balloon' && pickup && distanceSquared(player, pickup) > pickup.radius ** 2) return false;
    const anchor = method === 'balloon' && pickup ? pickup : strategy.anchor(player, ship);
    if (!strategy.eligible(player, anchor) || (method === 'balloon' && (!openGround(world, anchor.x, anchor.z, 1.1) || inAlbatross(anchor, ship)))) return false;
    this.current = {
      method, x: anchor.x, z: anchor.z, phase: 'COUNTDOWN', startedAt: tick, phaseAt: tick,
      endsAt: tick + strategy.countdown, radius: strategy.radius, securedIds: [player.id],
    };
    this.attempted = method;
    if (method === 'balloon') {
      this.balloonUsed = true;
      this.current.anchorOperatorId = player.id;
    }
    return true;
  }

  secure(player: SimPlayer): boolean {
    const active = this.current;
    if (!active || active.phase === 'LIFT' || !strategies[active.method].eligible(player, active)) return false;
    if (active.securedIds.includes(player.id)) return false;
    active.securedIds.push(player.id);
    active.anchorOperatorId ??= active.method === 'balloon' ? player.id : undefined;
    return true;
  }

  release(id: string): void {
    const active = this.current;
    if (!active || !active.securedIds.includes(id)) return;
    active.securedIds = active.securedIds.filter((operator) => operator !== id);
    if (active.anchorOperatorId === id) active.anchorOperatorId = active.securedIds[0];
  }

  tether(player: SimPlayer): ExtractionSnapshot | undefined {
    const active = this.current;
    return active?.method === 'balloon' && active.securedIds.includes(player.id) ? active : undefined;
  }

  update(living: readonly SimPlayer[], tick: number, airworthy: boolean, world?: WorldDefinition): 'cancel' | 'complete' | undefined {
    const active = this.current;
    if (!active) return;
    if (active.method === 'albatross' && !airworthy) {
      this.current = undefined;
      return 'cancel';
    }
    if (active.phase === 'LIFT') return tick >= active.endsAt ? 'complete' : undefined;
    for (const id of active.securedIds) {
      if (!living.some((player) => player.id === id && strategies[active.method].eligible(player, active))) this.release(id);
    }
    if (tick < active.endsAt) return;
    if (active.method === 'balloon' && active.phase === 'COUNTDOWN') {
      active.phase = 'APPROACH';
      active.phaseAt = tick;
      active.endsAt = tick + BALLOON.approachTicks;
      return;
    }
    for (const id of active.securedIds) {
      if (!living.some((player) => player.id === id && canSecureExtraction(player.posture.current, player, world))) this.release(id);
    }
    if (!active.securedIds.length) {
      if (active.method === 'albatross') {
        this.current = undefined;
        return 'cancel';
      }
      // The deployed balloon keeps its anchor. The fighter makes another pass.
      active.phase = 'COUNTDOWN';
      active.phaseAt = tick;
      active.endsAt = tick + BALLOON.countdownTicks;
      return;
    }
    active.phase = 'LIFT';
    active.phaseAt = tick;
    active.endsAt = tick + extractionLiftTicks(active.method);
  }

  snapshot(): ExtractionSnapshot | undefined {
    return this.current && { ...this.current, securedIds: [...this.current.securedIds] };
  }
}
