import { BALANCE, NET, PLAYER, lerpAngle } from '@freefall/shared';
import type { PlayerState, PlayersSnapshot, PostureState } from '@freefall/shared';

/** Faster than any legal movement between two snapshots: treated as a teleport, never interpolated. */
const TELEPORT_SPEED = Math.max(PLAYER.sprintSpeed * 2,
  1.35 * BALANCE.movement.diveDistance / (BALANCE.movement.diveSeconds - BALANCE.movement.divePrepSeconds)) / NET.tickHz;

export interface RemotePose {
  x: number;
  y?: number;
  posture?: PostureState;
  state?: PlayerState;
  z: number;
  yaw: number;
  pitch: number;
  /** Fractional server tick of this pose. */
  tick: number;
}

/**
 * Pose of one remote operator between two snapshots. `alpha` above 1 extrapolates the last segment
 * (bounded by the timeline). A new life (respawn, placement) or a jump faster than legal movement is a
 * discontinuity: the pose switches at the midpoint instead of sliding across the map.
 */
export function remotePose(player: PlayerState, a: PlayersSnapshot, b: PlayersSnapshot, alpha: number,
  next: PlayerState | undefined, out: RemotePose): RemotePose {
  const span = Math.max(1, b.tick - a.tick);
  const continuous = !!next && next.life === player.life &&
    Math.hypot(next.x - player.x, next.z - player.z) <= TELEPORT_SPEED * span;
  const t = !next ? 0 : continuous ? alpha : alpha >= .5 ? 1 : 0;
  const to = next ?? player;
  // Extrapolate position only along continuous motion; angles never overshoot.
  const angle = Math.min(1, t);
  out.x = player.x + (to.x - player.x) * t;
  out.z = player.z + (to.z - player.z) * t;
  const tick = a.tick + (b.tick - a.tick) * alpha;
  const edge = to.posture && to.posture.current !== player.posture?.current
    ? Math.max(a.tick, Math.min(b.tick, to.posture.started)) : b.tick;
  const beforeY = player.y ?? 0, afterY = to.y ?? 0;
  let heightAlpha = angle;
  if (continuous && player.posture?.current === 'DIVING' && to.posture?.current !== 'DIVING') {
    heightAlpha = Math.min(1, Math.max(0, (tick - a.tick) / Math.max(1e-6, edge - a.tick)));
  } else if (continuous && player.posture?.current !== 'DIVING' && to.posture?.current === 'DIVING') {
    heightAlpha = Math.min(1, Math.max(0, (tick - edge) / Math.max(1e-6, b.tick - edge)));
  }
  out.y = beforeY + (afterY - beforeY) * heightAlpha;
  out.state = continuous ? tick >= edge ? to : player : t === 1 ? to : player;
  out.posture = out.state.posture;
  out.yaw = lerpAngle(player.yaw, to.yaw, angle);
  out.pitch = (player.pitch ?? 0) + ((to.pitch ?? player.pitch ?? 0) - (player.pitch ?? 0)) * angle;
  out.tick = a.tick + (b.tick - a.tick) * alpha;
  return out;
}
