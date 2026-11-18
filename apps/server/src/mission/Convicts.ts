import { NET, TEST_RIFLE, clearGroundLine, distanceSquared, moveOnGround } from '@freefall/shared';
import type { ConvictSnapshot, PositionXZ, ShotEvent, WorldDefinition } from '@freefall/shared';
import type { HordeManager } from '../ecs/HordeManager.ts';
import { damageEnemy } from '../systems/combat.ts';
import type { MeleeObject } from '../systems/combat.ts';

const kits = [
  ['security-surplus', 'kestrel-service', 150, 5, 24, 7, 28],
  ['field-standard', 'kestrel-standard', 132, 4, 22, 6.7, 26],
  ['light-webbing', 'kestrel-reserve', 118, 3, 20, 6.2, 24],
  ['aged-infantry', 'kestrel-legacy', 106, 2, 18, 5.8, 22],
  ['worn-reserve', 'kestrel-worn', 96, 1, 16, 5.4, 19],
  ['restricted-issue', 'kestrel-restricted', 84, 0, 14, 5, 16],
  ['minimum-issue', 'kestrel-minimum', 72, 0, 12, 4.5, 12],
] as const;

type Kit = typeof kits[number];
type Convict = ConvictSnapshot & MeleeObject & {
  fireAt: number; ammo: number; exit: PositionXZ; post: PositionXZ; nearExit: boolean;
};

export class Convicts {
  readonly members: Convict[];
  deployed = false;
  private readonly kit: Kit;

  constructor(ship: PositionXZ, instanceId: string, difficultyLevel: number) {
    this.kit = kits[difficultyLevel - 1];
    const [equipmentId, weaponId, maxHp, armor, , , magazine] = this.kit;
    this.members = Array.from({ length: 4 }, (_, slot) => {
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
    const [, , , , damage, rate, magazine] = this.kit;
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
          const stride = Math.min(distance, 5.1 / NET.tickHz);
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
        member.reloadUntil = tick + Math.ceil(NET.tickHz * TEST_RIFLE.reloadSeconds);
        continue;
      }
      let closest = -1;
      let best = 37 ** 2;
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
        member.fireAt = tick + 5;
        continue;
      }
      member.state = 'FIRING';
      member.fireAt = tick + Math.ceil(NET.tickHz / rate);
      member.ammo--;
      const toX = horde.x[closest], toZ = horde.z[closest], enemy = horde.id[closest];
      member.yaw = Math.atan2(toX - member.x, member.z - toZ);
      shots.push({ shooter: member.id, fromX: member.x, fromY: 1.24, fromZ: member.z,
        toX, toY: .6, toZ, enemy, eliminated: damageEnemy(horde, closest, damage) });
    }
  }

  snapshot(): ConvictSnapshot[] {
    return this.members.map(({ x, z, id, slot, hp, maxHp, yaw, equipmentId, weaponId, team, state, lastHitAt, reloadUntil }) =>
      ({ x, z, id, slot, hp, maxHp, yaw, equipmentId, weaponId, team, state, lastHitAt, reloadUntil }));
  }
}
