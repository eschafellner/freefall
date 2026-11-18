import { MAX_ENEMIES } from '../config/arena.ts';

export const HORDE_HEADER = 6;
export const ENEMY_BYTES = 10;
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
  readonly byId = new Map<number, number>();
}

export function decodeHorde(packet: Uint8Array, frame: HordeFrame, positionScale: number = POSITION_SCALE): boolean {
  if (packet.byteLength < HORDE_HEADER) return false;
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const count = view.getUint16(4, true);
  if (count > MAX_ENEMIES || packet.byteLength !== HORDE_HEADER + count * ENEMY_BYTES) return false;

  frame.tick = view.getUint32(0, true);
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
