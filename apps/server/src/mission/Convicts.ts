import { NET, clearGroundLine, distanceSquared, groundHeight, moveOnGround } from '@freefall/shared';
import type { ConvictSnapshot, MissionBalance, PositionXZ, ShotEvent, WorldDefinition } from '@freefall/shared';
import type { HordeManager } from '../ecs/HordeManager.ts';
import { damageEnemy } from '../systems/combat.ts';
import type { MeleeObject } from '../systems/combat.ts';

// Kits, squad size, speed and range live in `balance/data/convicts.json`. The difficulty selects the kit.
type Convict = ConvictSnapshot & MeleeObject & {
  fireAt: number; ammo: number; exit: PositionXZ; post: PositionXZ; nearExit: boolean;
};

export class Convicts {
  readonly members: Convict[];
  deployed = false;
  private readonly config: MissionBalance['convicts'];

  constructor(ship: PositionXZ, instanceId: string, config: MissionBalance['convicts']) {
    this.config = config;
    const { id: equipmentId, weaponVariantId: weaponId, maxHealth: maxHp, armor, magazineSize: magazine } = config.kit;
    this.members = Array.from({ length: config.squad.size }, (_, slot) => {
      const side = slot % 2 ? 1 : -1;
      const row = slot < 2 ? 0 : 1;
      const member: Convict = {
        id: instanceId + '/convict-' + (slot + 1), slot, team: 'carrier', yaw: Math.PI,
        hp: maxHp, maxHp, equipmentId, weaponId, state: 'ABOARD', lastHitAt: 0,
        x: ship.x + side * 1.65, z: ship.z - 2.9 + row * 1.6,
        exit: { x: ship.x + side * 1.12, z: ship.z + 7.8 },
        post: { x: ship.x + side * (7 + row * 5), z: ship.z + (row ? -4 : 5.5) },
        nearExit: false, ammo: magazine, reloadUntil: 0, fireAt: 0,
        damage(amount, tick) {
          if (member.hp <= 0 || member.state === 'ABOARD') return;
          member.hp = Math.max(0, member.hp - Math.max(1, amount - armor));
          member.lastHitAt = tick;
          if (!member.hp) member.state = 'DEAD';
        },
      };
      return member;
    });
  }

  deploy(): void {
    if (this.deployed) return;
    this.deployed = true;
    for (const member of this.members) member.state = 'MOVING';
  }

  update(tick: number, horde: HordeManager, world: WorldDefinition, shots: ShotEvent[]): void {
    const { damage, roundsPerSecond: rate, magazineSize: magazine } = this.config.kit;
    const { moveSpeed, engageRange, idleRescanTicks } = this.config.squad;
    for (const member of this.members) {
      if (!member.hp || member.state === 'ABOARD') continue;
      if (member.state === 'MOVING') {
        const target = member.nearExit ? member.post : member.exit;
        const dx = target.x - member.x;
        const dz = target.z - member.z;
        const distance = Math.hypot(dx, dz);
        if (distance < .25) {
          if (!member.nearExit) member.nearExit = true;
          else member.state = 'DEFENDING';
        } else {
          const stride = Math.min(distance, moveSpeed / NET.tickHz);
          member.yaw = Math.atan2(dx, -dz);
          moveOnGround(member, member.x + dx / distance * stride, member.z + dz / distance * stride, world, .35);
        }
        continue;
      }
      if (member.reloadUntil && tick >= member.reloadUntil) {
        member.ammo = magazine;
        member.reloadUntil = 0;
      }
      if (member.reloadUntil || tick < member.fireAt) continue;
      if (!member.ammo) {
        member.state = 'DEFENDING';
        member.reloadUntil = tick + this.config.reloadTicks;
        continue;
      }
      let closest = -1;
      let best = engageRange ** 2;
      for (let index = 0; index < horde.count; index++) {
        const slot = horde.active[index];
        const dx = horde.x[slot] - member.x;
        const dz = horde.z[slot] - member.z;
        const distance = dx * dx + dz * dz;
        if (distance >= best || !clearGroundLine(world, member.x, member.z, horde.x[slot], horde.z[slot])) continue;
        best = distance;
        closest = slot;
      }
      if (closest < 0) {
        member.state = 'DEFENDING';
        member.fireAt = tick + idleRescanTicks;
        continue;
      }
      member.state = 'FIRING';
      // Fractional schedule: sustained fire averages exactly `roundsPerSecond` instead of rounding every
      // interval up to whole ticks. A pause (no target, reload) restarts the schedule at the current tick.
      member.fireAt = (member.fireAt > tick - 1 ? member.fireAt : tick) + NET.tickHz / rate;
      member.ammo--;
      const toX = horde.x[closest], toZ = horde.z[closest], enemy = horde.id[closest];
      member.yaw = Math.atan2(toX - member.x, member.z - toZ);
      shots.push({ shooter: member.id, fromX: member.x, fromY: groundHeight(world, member.x, member.z) + 1.24, fromZ: member.z,
        toX, toY: groundHeight(world, toX, toZ) + .6, toZ, enemy, impact: { kind: 'enemy' }, eliminated: damageEnemy(horde, closest, damage) });
    }
  }

  snapshot(): ConvictSnapshot[] {
    return this.members.map(({ x, z, id, slot, hp, maxHp, yaw, equipmentId, weaponId, team, state, lastHitAt, reloadUntil }) =>
      ({ x, z, id, slot, hp, maxHp, yaw, equipmentId, weaponId, team, state, lastHitAt, reloadUntil }));
  }
}
