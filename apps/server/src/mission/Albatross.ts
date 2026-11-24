import { ALBATROSS } from '@freefall/shared';
import type { AlbatrossSnapshot, MissionEvent, PositionXZ } from '@freefall/shared';
import type { MeleeObject } from '../systems/combat.ts';

export class Albatross {
  readonly id: string;
  hullHealth: number = ALBATROSS.hullHealth;
  lastHitAt = 0;
  readonly thrusters: AlbatrossSnapshot['thrusters'] = ALBATROSS.thrusters.map(() => ({
    health: ALBATROSS.thrusterHealth, maxHealth: ALBATROSS.thrusterHealth, state: 'INTACT', lastHitAt: 0,
  }));
  readonly targets: MeleeObject[];

  readonly position: PositionXZ;
  private readonly emit: (event: MissionEvent) => void;

  constructor(position: PositionXZ, instanceId: string, emit: (event: MissionEvent) => void) {
    this.position = position;
    this.emit = emit;
    this.id = instanceId + '/albatross';
    // Surface points let the existing melee range test reach the ship from outside the hull.
    this.targets = [
      ...ALBATROSS.thrusters.map(({ x, z }, i) => this.part(x, z, i)),
      this.part(-2.95, 0), this.part(2.95, 0), this.part(0, -5.55), this.part(0, 4.3),
    ];
  }

  private part(x: number, z: number, thruster?: number): MeleeObject {
    const ship = this;
    return {
      x: this.position.x + x, z: this.position.z + z, ...(thruster !== undefined && { thruster }),
      get hp() { return ship.hullHealth ? thruster === undefined ? ship.hullHealth : ship.thrusters[thruster].health : 0; },
      damage: (amount, tick) => this.damage(amount, tick, thruster),
    };
  }

  get state(): AlbatrossSnapshot['lifecycleState'] {
    if (!this.hullHealth) return 'DESTROYED';
    if (this.thrusters.filter((thruster) => thruster.state === 'DESTROYED').length >= ALBATROSS.disabledThrusters) return 'DISABLED';
    if (this.hullHealth < ALBATROSS.hullHealth || this.thrusters.some((thruster) => thruster.state !== 'INTACT')) return 'DAMAGED';
    return 'OPERATIONAL';
  }

  get airworthy(): boolean { return this.state === 'OPERATIONAL' || this.state === 'DAMAGED'; }

  damage(amount: number, tick: number, index?: number): boolean {
    if (!this.hullHealth || !Number.isFinite(amount) || amount <= 0) return false;
    if (index === undefined) this.hullHealth = Math.max(0, this.hullHealth - amount);
    else {
      const thruster = this.thrusters[index];
      if (!thruster?.health) return false;
      thruster.health = Math.max(0, thruster.health - amount);
      thruster.state = thruster.health ? 'DAMAGED' : 'DESTROYED';
      thruster.lastHitAt = tick;
    }
    this.lastHitAt = tick;
    this.emit({ type: 'AlbatrossDamaged', tick, entityId: this.id, amount, thruster: index });
    return true;
  }

  snapshot(): AlbatrossSnapshot {
    return {
      ...this.position, id: this.id, hullHealth: this.hullHealth, maxHullHealth: ALBATROSS.hullHealth,
      lifecycleState: this.state, extractionAvailable: this.airworthy,
      thrusters: this.thrusters.map((thruster) => ({ ...thruster })), lastHitAt: this.lastHitAt,
    };
  }
}
