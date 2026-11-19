import { MAX_PITCH } from '@freefall/shared';
import type { PlayerInput } from '@freefall/shared';

export function idleInput(yaw = 0, pitch = -0.12): PlayerInput {
  return { seq: 0, forward: 0, strafe: 0, yaw, pitch, sprint: false, fire: false };
}

export function validateInput(payload: unknown, lastSeq: number): PlayerInput | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return;
  const { seq, forward, strafe, yaw, pitch, sprint, fire, aim, reload, equipment, posture, life } = payload as Record<string, unknown>;
  if (
    typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq <= lastSeq || seq > 0xffffffff ||
    (typeof forward !== 'number' || !Number.isFinite(forward) || Math.abs(forward) > 1) ||
    (typeof strafe !== 'number' || !Number.isFinite(strafe) || Math.abs(strafe) > 1) ||
    typeof yaw !== 'number' || !Number.isFinite(yaw) || Math.abs(yaw) > Math.PI ||
    typeof pitch !== 'number' || !Number.isFinite(pitch) || Math.abs(pitch) > MAX_PITCH ||
    typeof sprint !== 'boolean' || typeof fire !== 'boolean' ||
    (aim !== undefined && typeof aim !== 'boolean') ||
    ((equipment !== undefined || posture !== undefined) && (typeof life !== 'number' || !Number.isSafeInteger(life) || life < 0)) ||
    (posture !== undefined && posture !== 'crouch' && posture !== 'dive' && posture !== 'stand') ||
    (equipment !== undefined && (!(equipment === 'primary' || equipment === 'secondary' ||
      equipment === 'grenade' || equipment === 'stim' || equipment === 'melee'))) ||
    (reload !== undefined && typeof reload !== 'boolean')
  ) return;
  return { seq, forward, strafe, yaw, pitch, sprint, fire, ...(equipment && { equipment }), ...(posture && { posture }), ...((equipment || posture) && { life: life as number }), ...(aim && { aim }), ...(reload && { reload }) };
}
