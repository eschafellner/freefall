import { ENEMY_BYTES, HORDE_HEADER, NET, PLAYER_MOTION, POSITION_SCALE, allowsPostureAction, copyPosture } from '@freefall/shared';
import type { PlayersSnapshot } from '@freefall/shared';
import type { HordeManager } from '../ecs/HordeManager.ts';
import type { Battlefield } from '../simulation/Battlefield.ts';

export function encodeHorde(h: HordeManager, tick: number, positionScale: number = POSITION_SCALE): Uint8Array {
  const bytes = new Uint8Array(HORDE_HEADER + h.count * ENEMY_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, tick, true);
  view.setUint16(4, h.count, true);
  for (let index = 0, offset = HORDE_HEADER; index < h.count; index++, offset += ENEMY_BYTES) {
    const i = h.active[index];
    view.setUint32(offset, h.id[i], true);
    view.setInt16(offset + 4, Math.round(h.x[i] * positionScale), true);
    view.setInt16(offset + 6, Math.round(h.z[i] * positionScale), true);
    view.setUint8(offset + 8, Math.round(h.yaw[i] * (256 / (2 * Math.PI))) & 255);
    view.setUint8(offset + 9, h.type[i]);
  }
  return bytes;
}

export function playerSnapshot(arena: Battlefield, host: string): PlayersSnapshot {
  const players: PlayersSnapshot['players'] = [];
  for (const p of arena.players) {
    if (!p) continue;
    const { id, slot, x, z, yaw, hp, ack, life, respawnTick, kills, pitch, ammo, reloadUntil, reload } = p;
    const stance = p.posture;
    const balance = arena.movementBalance;
    const motion = p.activeInput && hp > 0
      ? (p.input.aim && allowsPostureAction(stance, 'aim', balance) ? PLAYER_MOTION.aim : 0) | (p.input.sprint && allowsPostureAction(stance, 'sprint', balance) ? PLAYER_MOTION.sprint : 0)
      : 0;
    // The reload state travels only while it matters (running, or interrupted within the last second).
    const recent = reload.phase !== 'READY' && (reload.phase !== 'RELOAD_INTERRUPTED' || arena.tick - reload.at < NET.tickHz);
    players.push({ id, slot, x, z, yaw, hp, ack, life, respawnTick, kills, pitch, motion, ammo, reloadUntil,
      ...(p.y > 0 && { y: p.y }),
      ...((stance.current !== 'STANDING' || stance.until > arena.tick ||
        (stance.started > 0 && arena.tick - stance.started < Math.ceil(NET.tickHz / NET.playerHz) + 1) ||
        (stance.lastDive !== undefined && arena.tick < stance.lastDive + Math.ceil(balance.diveCooldownSeconds * NET.tickHz)) ||
        (stance.standBlockedAt !== undefined && arena.tick - stance.standBlockedAt < NET.tickHz)) && { posture: copyPosture(stance) }),
      ...(recent && { reload: { ...reload } }), equipment: { ...p.equipment, magazines: { ...p.equipment.magazines } } });
  }
  const grenades = arena.grenades.snapshot();
  return { tick: arena.tick, host, players, ...(grenades && { grenades }) };
}
