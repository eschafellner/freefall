import { MAX_PITCH } from '@freefall/shared';
import type { DiveIntent, PlayerInput } from '@freefall/shared';

export function idleInput(yaw = 0, pitch = -0.12): PlayerInput {
  return { seq: 0, forward: 0, strafe: 0, yaw, pitch, sprint: false, fire: false };
}

function axis(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1;
}

function heading(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Math.PI;
}

function readDiveIntent(value: unknown): DiveIntent | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
  const { forward, strafe, yaw } = value as Record<string, unknown>;
  if (axis(forward) && axis(strafe) && heading(yaw)) return { forward, strafe, yaw };
}

export function validateInput(payload: unknown, lastSeq: number): PlayerInput | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return;
  const { seq, forward, strafe, yaw, pitch, sprint, fire, aim, reload, equipment, posture, life, diveIntent } = payload as Record<string, unknown>;
  const intent = posture === 'dive' ? readDiveIntent(diveIntent) : undefined;
  if (
    typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq <= lastSeq || seq > 0xffffffff ||
    !axis(forward) || !axis(strafe) || !heading(yaw) ||
    typeof pitch !== 'number' || !Number.isFinite(pitch) || Math.abs(pitch) > MAX_PITCH ||
    typeof sprint !== 'boolean' || typeof fire !== 'boolean' ||
    (aim !== undefined && typeof aim !== 'boolean') ||
    ((equipment !== undefined || posture !== undefined || life !== undefined) && (typeof life !== 'number' || !Number.isSafeInteger(life) || life < 0)) ||
    (posture !== undefined && posture !== 'crouch' && posture !== 'dive' && posture !== 'stand') ||
    (diveIntent !== undefined && !intent) ||
    (equipment !== undefined && (!(equipment === 'primary' || equipment === 'secondary' ||
      equipment === 'grenade' || equipment === 'stim' || equipment === 'melee'))) ||
    (reload !== undefined && typeof reload !== 'boolean')
  ) return;
  return { seq, forward, strafe, yaw, pitch, sprint, fire, ...(equipment && { equipment }), ...(posture && { posture }),
    ...(intent && { diveIntent: intent }), ...(life !== undefined && { life: life as number }), ...(aim && { aim }), ...(reload && { reload }) };
}
