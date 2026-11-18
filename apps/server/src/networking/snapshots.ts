import { ENEMY_BYTES, HORDE_HEADER, PLAYER_MOTION, POSITION_SCALE } from '@freefall/shared';
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
    const { id, slot, x, z, yaw, hp, ack, life, respawnTick, kills, pitch, ammo, reloadUntil } = p;
    const motion = p.activeInput && hp > 0
      ? (p.input.aim ? PLAYER_MOTION.aim : 0) | (p.input.sprint ? PLAYER_MOTION.sprint : 0)
      : 0;
    players.push({ id, slot, x, z, yaw, hp, ack, life, respawnTick, kills, pitch, motion, ammo, reloadUntil, equipment: { ...p.equipment } });
  }
  const grenades = arena.grenades.snapshot();
  return { tick: arena.tick, host, players, ...(grenades && { grenades }) };
}
