import { MAX_ENEMIES } from '../config/arena.ts';

export const HORDE_HEADER = 6;
export const ENEMY_BYTES = 10;
export const HORDE_COMBAT_HEADER = 6;
export const HORDE_ATTACK_BYTES = 4;
export const POSITION_SCALE = 256;
export const WIDE_POSITION_SCALE = 128;

export class HordeFrame {
  tick = -1;
  count = 0;
  readonly id = new Uint32Array(MAX_ENEMIES);
  readonly x = new Float32Array(MAX_ENEMIES);
  readonly z = new Float32Array(MAX_ENEMIES);
  readonly yaw = new Float32Array(MAX_ENEMIES);
  readonly type = new Uint8Array(MAX_ENEMIES);
  /** Age in server ticks plus one. Zero means no attack in this frame. */
  readonly attackAge = new Uint16Array(MAX_ENEMIES);
  windupTicks = 0;
  activeTicks = 0;
  recoveryTicks = 0;
  readonly byId = new Map<number, number>();
}

export function decodeHorde(packet: Uint8Array, frame: HordeFrame, positionScale: number = POSITION_SCALE): boolean {
  if (packet.byteLength < HORDE_HEADER) return false;
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const count = view.getUint16(4, true);
  const tick = view.getUint32(0, true);
  const recordsEnd = HORDE_HEADER + count * ENEMY_BYTES;
  const extra = packet.byteLength - recordsEnd;
  if (count > MAX_ENEMIES || extra < 0) return false;
  frame.attackAge.fill(0, 0, count);
  frame.windupTicks = frame.activeTicks = frame.recoveryTicks = 0;
  if (extra) {
    const attacks = (extra - HORDE_COMBAT_HEADER) / HORDE_ATTACK_BYTES;
    if (!Number.isInteger(attacks) || attacks < 1 || attacks > count) return false;
    const windup = view.getUint16(recordsEnd, true);
    const active = view.getUint16(recordsEnd + 2, true);
    const recovery = view.getUint16(recordsEnd + 4, true);
    if (!windup || !active || !recovery || windup + active + recovery > 0xffff) return false;
    for (let offset = recordsEnd + HORDE_COMBAT_HEADER; offset < packet.byteLength; offset += HORDE_ATTACK_BYTES) {
      const index = view.getUint16(offset, true);
      const age = view.getUint16(offset + 2, true);
      if (index >= count || age > tick || age >= windup + active + recovery || frame.attackAge[index]) return false;
      frame.attackAge[index] = age + 1;
    }
    frame.windupTicks = windup;
    frame.activeTicks = active;
    frame.recoveryTicks = recovery;
  }

  frame.tick = tick;
  frame.count = count;
  frame.byId.clear();
  for (let i = 0, offset = HORDE_HEADER; i < count; i++, offset += ENEMY_BYTES) {
    const id = view.getUint32(offset, true);
    frame.id[i] = id;
    frame.byId.set(id, i);
    frame.x[i] = view.getInt16(offset + 4, true) / positionScale;
    frame.z[i] = view.getInt16(offset + 6, true) / positionScale;
    frame.yaw[i] = view.getUint8(offset + 8) * (Math.PI * 2 / 256);
    frame.type[i] = view.getUint8(offset + 9);
  }
  return true;
}
