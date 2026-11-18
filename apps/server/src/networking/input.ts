import { MAX_PITCH } from '@freefall/shared';
import type { PlayerInput } from '@freefall/shared';

export function idleInput(yaw = 0, pitch = -0.12): PlayerInput {
  return { seq: 0, forward: 0, strafe: 0, yaw, pitch, sprint: false, fire: false };
}

export function validateInput(payload: unknown, lastSeq: number): PlayerInput | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return;
  const { seq, forward, strafe, yaw, pitch, sprint, fire, aim, reload, equipment, life } = payload as Record<string, unknown>;
  if (
    typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq <= lastSeq || seq > 0xffffffff ||
    (forward !== -1 && forward !== 0 && forward !== 1) ||
    (strafe !== -1 && strafe !== 0 && strafe !== 1) ||
    typeof yaw !== 'number' || !Number.isFinite(yaw) || Math.abs(yaw) > Math.PI ||
    typeof pitch !== 'number' || !Number.isFinite(pitch) || Math.abs(pitch) > MAX_PITCH ||
    typeof sprint !== 'boolean' || typeof fire !== 'boolean' ||
    (aim !== undefined && typeof aim !== 'boolean') ||
    (equipment !== undefined && (!(equipment === 'primary' || equipment === 'secondary' ||
      equipment === 'grenade' || equipment === 'stim') || typeof life !== 'number' || !Number.isSafeInteger(life))) ||
    (reload !== undefined && typeof reload !== 'boolean')
  ) return;
  return { seq, forward, strafe, yaw, pitch, sprint, fire, ...(equipment && { equipment, life: life as number }), ...(aim && { aim }), ...(reload && { reload }) };
}
