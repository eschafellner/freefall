/**
 * Albatross resupply containers. Shared, limited charges per container; one charge refills magazines, grenades and
 * stims up to the carry capacity. All checks and the transaction run on the server tick, so simultaneous requests
 * are serialized: the first completion consumes the charge, later ones see the updated state.
 */
import { ALBATROSS } from '@freefall/shared';
import type { CombatEvent, EffectiveResupply, PositionXZ, ResupplyGrant, SupplyContainerSnapshot } from '@freefall/shared';
import type { SimPlayer } from '../simulation/Player.ts';
import type { MeleeObject } from '../systems/combat.ts';
import type { ResupplyHooks } from '../systems/equipment.ts';
import type { CombatStats } from '../systems/telemetry.ts';
import type { Albatross } from './Albatross.ts';

export type ResupplyBlocker = 'resupply-offline' | 'resupply-destroyed' | 'resupply-empty' | 'resupply-range' | 'resupply-full';

interface Container extends SupplyContainerSnapshot { target: MeleeObject }

export class ResupplySystem implements ResupplyHooks {
  readonly containers: Container[];
  private readonly ship: Albatross;
  private readonly config: EffectiveResupply;
  private readonly events: CombatEvent[];
  private readonly stats: CombatStats;

  constructor(ship: Albatross, config: EffectiveResupply, events: CombatEvent[], stats: CombatStats) {
    this.ship = ship;
    this.config = config;
    this.events = events;
    this.stats = stats;
    this.containers = config.containers.map((definition) => {
      const container: Container = {
        id: definition.id, side: definition.side, serial: definition.serial,
        x: ship.position.x + definition.x, z: ship.position.z + definition.z,
        charges: definition.charges, maxCharges: definition.charges, health: definition.health, maxHealth: definition.health,
        state: 'READY', lastUsedAt: 0, lastHitAt: 0,
        target: {
          x: ship.position.x + definition.x, z: ship.position.z + definition.z,
          get hp() { return ship.hullHealth ? container.health : 0; },
          damage: (amount, tick) => {
            if (!container.health || !ship.hullHealth || !(amount > 0)) return;
            container.health = Math.max(0, container.health - amount);
            container.lastHitAt = tick;
          },
        },
      };
      return container;
    });
    // Containers are part of the hull: the swarm can attack and destroy them like thrusters.
    ship.targets.push(...this.containers.map(({ target }) => target));
  }

  get interactionTicks(): number { return this.config.interactionTicks; }

  private offline(): boolean {
    const allowed = this.config.availableWhen;
    switch (this.ship.state) {
      case 'DESTROYED': return !allowed.vehicleDestroyed;
      case 'DISABLED': return !allowed.vehicleDisabled;
      case 'DAMAGED': return !allowed.vehicleDamaged;
      default: return false;
    }
  }

  private stateOf(container: { health: number; charges: number }): SupplyContainerSnapshot['state'] {
    if (!container.health) return 'DESTROYED';
    if (this.offline()) return 'OFFLINE';
    return container.charges ? 'READY' : 'EMPTY';
  }

  /** Operator is outside the hull on the container's side and within reach. */
  private inReach(player: PositionXZ, container: Container): boolean {
    const side = container.side === 'left' ? -1 : 1;
    const lateral = (player.x - this.ship.position.x) * side;
    return lateral >= ALBATROSS.halfWidth + .2 &&
      (player.x - container.x) ** 2 + (player.z - container.z) ** 2 <= this.config.interactionRange ** 2;
  }

  /** Container the operator can reach, regardless of its state. */
  reachable(player: PositionXZ): Container | undefined {
    return this.containers.find((container) => this.inReach(player, container));
  }

  /** What one charge would give this operator right now, capped at every carry capacity. */
  grant(player: SimPlayer): ResupplyGrant {
    const { perUse } = this.config;
    const gear = player.equipment;
    const { primary, secondary } = player.loadout.weapons;
    return {
      primaryMagazines: Math.max(0, Math.min(perUse.primaryMagazines, primary.maxReserveMagazines - gear.magazines.primary)),
      secondaryMagazines: Math.max(0, Math.min(perUse.secondaryMagazines, secondary.maxReserveMagazines - gear.magazines.secondary)),
      grenades: Math.max(0, Math.min(perUse.grenades, player.loadout.grenade.capacity - gear.grenades)),
      stims: Math.max(0, Math.min(perUse.stims, player.loadout.medical.maxCharges - gear.stims)),
    };
  }

  blocker(player: SimPlayer, containerId: string): ResupplyBlocker | undefined {
    const container = this.containers.find(({ id }) => id === containerId);
    if (!container || player.hp <= 0) return 'resupply-offline';
    const state = this.stateOf(container);
    if (state === 'DESTROYED') return 'resupply-destroyed';
    if (state === 'OFFLINE') return 'resupply-offline';
    if (state === 'EMPTY') return 'resupply-empty';
    if (!this.inReach(player, container)) return 'resupply-range';
    const grant = this.grant(player);
    if (!grant.primaryMagazines && !grant.secondaryMagazines && !grant.grenades && !grant.stims) return 'resupply-full';
  }

  complete(player: SimPlayer, containerId: string, tick: number): boolean {
    if (this.blocker(player, containerId)) return false;
    const container = this.containers.find(({ id }) => id === containerId)!;
    const granted = this.grant(player);
    const gear = player.equipment;
    gear.magazines.primary += granted.primaryMagazines;
    gear.magazines.secondary += granted.secondaryMagazines;
    gear.grenades += granted.grenades;
    gear.stims += granted.stims;
    container.charges--;
    container.lastUsedAt = tick;
    const data = this.stats.data;
    data.resupplyUses++;
    for (const key of Object.keys(granted) as (keyof ResupplyGrant)[]) data.refilled[key] += granted[key];
    this.events.push({ type: 'resupply', tick, operator: player.id, container: container.id, charges: container.charges, granted });
    return true;
  }

  /** Debug and tests: destroys one container. */
  destroy(containerId: string, tick: number): boolean {
    const container = this.containers.find(({ id }) => id === containerId);
    if (!container?.health) return false;
    container.target.damage(container.health, tick);
    return true;
  }

  snapshot(): SupplyContainerSnapshot[] {
    return this.containers.map(({ target: _target, ...container }) => ({ ...container, state: this.stateOf(container) }));
  }
}
