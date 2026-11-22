import { BALANCE, NET, PLAYER, divePeakStep, diveTravel, groundHeight, isGroundPosture, lerpAngle,
  postureCollider, postureSweep, sampleDive, slidePeakStep } from '@freefall/shared';
import type { DiveState, PlayerState, PlayersSnapshot, PostureState, WorldDefinition } from '@freefall/shared';

/** Faster than any legal movement between two snapshots: treated as a teleport, never interpolated. */
const { slide } = BALANCE.movement;
const TELEPORT_STEP = Math.max(
  PLAYER.sprintSpeed * 2 / NET.tickHz,
  slidePeakStep(slide, Math.ceil(slide.seconds * NET.tickHz)) + 1e-9,
);

function slideStep(posture?: PostureState): number {
  return posture?.slide ? slidePeakStep(posture.slide, posture.until - posture.started) + 1e-9 : 0;
}

export interface RemotePose {
  x: number;
  y?: number;
  posture?: PostureState;
  /** Body heading can be interpolated independently of the snapshot's camera heading. */
  bodyYaw?: number;
  state?: PlayerState;
  z: number;
  yaw: number;
  pitch: number;
  /** Fractional server tick of this pose. */
  tick: number;
}

function reconstructDive(dive: DiveState, player: PlayerState, next: PlayerState, a: number, b: number,
  tick: number, out: RemotePose, world?: WorldDefinition): void {
  if (tick < dive.started) {
    const t = (tick - a) / (dive.started - a);
    out.x = player.x + (dive.originX - player.x) * t;
    out.z = player.z + (dive.originZ - player.z) * t;
    if (world?.terrain) out.y = groundHeight(world, out.x, out.z);
    out.posture = player.posture;
    return;
  }
  if (tick < dive.until) {
    sampleDive(dive, tick, out);
    out.y = (out.y ?? 0) + groundHeight(world, out.x, out.z);
    out.posture = next.posture?.current === 'DIVING' ? next.posture : player.posture?.current === 'DIVING' ? player.posture : {
      current: 'DIVING', requested: dive.landing, from: dive.from, started: dive.started, until: dive.until, yaw: dive.yaw, dive,
    };
    return;
  }
  const travel = diveTravel(dive, dive.until);
  const x = dive.originX + dive.x * travel, z = dive.originZ + dive.z * travel;
  const moveUntil = next.posture?.current === 'GETTING_UP' ? next.posture.started : b;
  const t = moveUntil <= dive.until ? 0 : (tick - dive.until) / (moveUntil - dive.until);
  const move = next.posture?.current === 'GETTING_UP' ? Math.min(1, t) : t;
  out.x = x + (next.x - x) * move;
  out.z = z + (next.z - z) * move;
  out.y = groundHeight(world, out.x, out.z);
  if (!next.posture || next.posture.started > tick) {
    out.posture = {
      current: dive.landing, requested: dive.landing, from: 'DIVING', started: dive.until, until: dive.until, yaw: dive.yaw, landedDive: dive,
    };
  } else out.posture = next.posture;
}

/**
 * Pose of one remote operator between two snapshots. `alpha` above 1 extrapolates the last segment
 * (bounded by the timeline). A new life (respawn, placement) or a jump faster than legal movement is a
 * discontinuity: the pose switches at the midpoint instead of sliding across the map.
 */
export function remotePose(player: PlayerState, a: PlayersSnapshot, b: PlayersSnapshot, alpha: number,
  next: PlayerState | undefined, out: RemotePose, world?: WorldDefinition): RemotePose {
  const span = Math.max(1, b.tick - a.tick);
  const dive = next?.posture?.dive ?? next?.posture?.landedDive;
  const crossesDive = dive && dive.started <= b.tick && dive.until > a.tick &&
    (!player.posture?.dive || player.posture.dive.id === dive.id);
  // A packet gap can span ordinary movement as well, so keep the usual locomotion bound.
  const maxStep = Math.max(TELEPORT_STEP, slideStep(player.posture), slideStep(next?.posture),
    crossesDive ? divePeakStep(dive) + 1e-9 : 0);
  const continuous = !!next && next.life === player.life &&
    Math.hypot(next.x - player.x, next.z - player.z) <= maxStep * span;
  const t = !next ? 0 : continuous ? alpha : alpha >= .5 ? 1 : 0;
  const to = next ?? player;
  // Extrapolate position only along continuous motion; angles never overshoot.
  const angle = Math.min(1, t);
  out.x = player.x + (to.x - player.x) * t;
  out.z = player.z + (to.z - player.z) * t;
  const inFlight = continuous && to.hp > 0 && to.posture?.current === 'DIVING';
  const tick = a.tick + (b.tick - a.tick) * (inFlight ? angle : alpha);
  const source = player.posture, destination = to.posture;
  const gettingUp = source?.current === 'GETTING_UP';
  const startsGetUp = destination?.current === 'GETTING_UP' && destination.started > a.tick;
  const endsGetUp = gettingUp && destination?.current !== 'GETTING_UP' && to.hp > 0;
  const transitionTick = destination && destination.current !== source?.current ? destination.started :
    endsGetUp ? source.until : b.tick;
  const edge = Math.max(a.tick, Math.min(b.tick, transitionTick));
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
  if (continuous && crossesDive && player.hp > 0 && to.hp > 0) {
    reconstructDive(dive, player, to, a.tick, b.tick, tick, out, world);
  }
  if (continuous && !crossesDive && (startsGetUp || endsGetUp)) {
    // All displacement belongs before the get-up starts or after it ends.
    const move = startsGetUp
      ? Math.min(1, Math.max(0, (tick - a.tick) / Math.max(1, edge - a.tick)))
      : Math.max(0, tick - edge) / Math.max(1, b.tick - edge);
    out.x = player.x + (to.x - player.x) * move;
    out.z = player.z + (to.z - player.z) * move;
  }
  const interpolatingGroundTurn = continuous && source && destination && isGroundPosture(source.current) &&
    source.current === destination.current && source.started === destination.started;
  out.bodyYaw = interpolatingGroundTurn ? lerpAngle(source.yaw, destination.yaw, angle) : out.posture?.yaw;
  if (continuous && to.hp > 0 && out.posture && isGroundPosture(out.posture.current)) {
    if (t > 1 && destination && isGroundPosture(destination.current)) {
      // A partial crawl step can end at an obstacle. Never extrapolate the body through that obstacle.
      const origin = { x: to.x, y: to.y ?? 0, z: to.z };
      const dx = out.x - origin.x, dz = out.z - origin.z;
      if (dx || dz) {
        const shape = postureCollider(destination, b.tick);
        const fraction = postureSweep(origin, dx, dz, origin.y + shape.height, shape, destination.yaw, world);
        out.x = origin.x + dx * fraction;
        out.z = origin.z + dz * fraction;
      }
    }
    if (world?.terrain) out.y = groundHeight(world, out.x, out.z);
  }
  out.yaw = lerpAngle(player.yaw, to.yaw, angle);
  out.pitch = (player.pitch ?? 0) + ((to.pitch ?? player.pitch ?? 0) - (player.pitch ?? 0)) * angle;
  out.tick = tick;
  return out;
}
