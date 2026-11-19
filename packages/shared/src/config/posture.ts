import { BALANCE } from '../balance/defaults.ts';
import type { MovementDefinition, PostureCollider } from '../balance/definitions.ts';
import type { PlayerInput } from '../contracts/messages.ts';
import type { WorldDefinition } from '../definitions/missions.ts';
import { NET } from './arena.ts';
import { constrainTether, movePlayer, wrapAngle } from './movement.ts';
import type { MovementBoundary } from './movement.ts';
import { fitsPosture, postureSweep } from './postureGeometry.ts';
import type { OperatorPosition } from './postureGeometry.ts';

export type Posture = keyof MovementDefinition['actions'];
export type GroundPosture = 'PRONE' | 'SUPINE';
export type PostureCommand = 'crouch' | 'dive' | 'stand';
export type PostureAction = keyof MovementDefinition['actions']['STANDING'];

interface DiveState {
  x: number;
  z: number;
  landing: GroundPosture;
  blocked: boolean;
}

export interface PostureState {
  current: Posture;
  requested: Posture;
  from: Exclude<Posture, 'GETTING_UP'>;
  /** Fixed simulation ticks. */
  started: number;
  until: number;
  lastDive?: number;
  /** Body orientation, independent of camera aim during tactical movement. */
  yaw: number;
  dive?: DiveState;
  standBlockedAt?: number;
}

export const newPosture = (yaw = 0): PostureState =>
  ({ current: 'STANDING', requested: 'STANDING', from: 'STANDING', started: 0, until: 0, yaw });

export function copyPosture(state: PostureState): PostureState {
  return { ...state, ...(state.dive && { dive: { ...state.dive } }) };
}

export function isGroundPosture(posture: Posture): posture is GroundPosture {
  return posture === 'PRONE' || posture === 'SUPINE';
}

export function postureProgress(state: PostureState, tick: number): number {
  return Math.max(0, Math.min(1, (tick - state.started) / Math.max(1, state.until - state.started)));
}

const seconds = (n: number) => Math.ceil(n * NET.tickHz);

function transition(state: PostureState, current: Posture, tick: number, duration = 0, requested = current): void {
  if (state.current !== 'GETTING_UP') state.from = state.current;
  state.current = current;
  state.requested = requested;
  state.started = tick;
  state.until = tick + duration;
}

export function postureCollider(state: PostureState, tick: number, balance = BALANCE.movement): PostureCollider {
  const shapes = balance.colliders;
  if (state.current !== 'GETTING_UP') return shapes[state.current];
  const source = shapes[state.from], target = shapes.STANDING;
  const t = postureProgress(state, tick);
  return {
    radius: source.radius + (target.radius - source.radius) * t,
    halfLength: source.halfLength + (target.halfLength - source.halfLength) * t,
    height: source.height + (target.height - source.height) * t,
    lookHeight: source.lookHeight + (target.lookHeight - source.lookHeight) * t,
    muzzleHeight: source.muzzleHeight + (target.muzzleHeight - source.muzzleHeight) * t,
  };
}

export function postureYaw(state: PostureState, viewYaw: number): number {
  return state.current === 'STANDING' || state.current === 'CROUCHING' ? viewYaw : state.yaw;
}

export function tacticalAimYaw(state: PostureState, yaw: number, balance = BALANCE.movement): number {
  const arc = balance.groundAimHalfArc;
  return isGroundPosture(state.current)
    ? state.yaw + Math.max(-arc, Math.min(arc, wrapAngle(yaw - state.yaw))) : yaw;
}

export function tacticalAimPitch(state: PostureState, pitch: number, balance = BALANCE.movement): number {
  if (state.current === 'PRONE') return Math.max(balance.proneMinPitch, pitch);
  if (state.current === 'SUPINE') return Math.max(balance.supineMinPitch, pitch);
  return pitch;
}

export function tacticalMuzzle(out: OperatorPosition, p: OperatorPosition, state: PostureState, yaw: number,
  shape: PostureCollider): void {
  const ground = isGroundPosture(state.current);
  const side = ground ? .26 : .45;
  const forward = state.current === 'PRONE' ? shape.halfLength + .12 : state.current === 'SUPINE' ? .62 : .66;
  out.x = p.x + Math.cos(yaw) * side + Math.sin(yaw) * forward;
  out.y = p.y + shape.muzzleHeight;
  out.z = p.z + Math.sin(yaw) * side - Math.cos(yaw) * forward;
}

export function allowsPostureAction(state: PostureState, action: PostureAction, balance = BALANCE.movement): boolean {
  return balance.actions[state.current][action];
}

function diveProgress(state: PostureState, tick: number, balance: MovementDefinition): number {
  const takeoff = state.started + seconds(balance.divePrepSeconds);
  return Math.max(0, Math.min(1, (tick - takeoff) / Math.max(1, state.until - takeoff)));
}

export function advancePosture(p: OperatorPosition, state: PostureState, tick: number, balance: MovementDefinition,
  world?: WorldDefinition, boundary?: MovementBoundary, mobile = true): void {
  if (state.current === 'GETTING_UP') {
    if (!mobile || !fitsPosture(p, postureCollider(state, tick, balance), state.yaw, world)) {
      state.standBlockedAt = tick;
      transition(state, state.from, tick);
    } else if (tick >= state.until) transition(state, 'STANDING', tick);
    return;
  }
  const dive = state.dive;
  if (state.current !== 'DIVING' || !dive) return;

  const s = diveProgress(state, tick, balance);
  const before = diveProgress(state, tick - 1, balance);
  // Ease out the horizontal impulse, with a ballistic vertical arc and an explicit preparation phase.
  const travel = balance.diveDistance * (s - before) * (1.35 - .35 * (s + before));
  const y = 4 * balance.diveArcHeight * s * (1 - s);
  const flight = balance.colliders.DIVING;
  const landing = balance.colliders[dive.landing];
  // Reserve the entire landing footprint along the path, including the ground below the airborne operator.
  const envelope = {
    ...flight, radius: Math.max(flight.radius, landing.radius), halfLength: Math.max(flight.halfLength, landing.halfLength),
  };
  const ground = { x: p.x, z: p.z, y: 0 };
  const dx = !mobile || dive.blocked ? 0 : dive.x * travel;
  const dz = !mobile || dive.blocked ? 0 : dive.z * travel;
  const top = Math.max(y, p.y) + Math.max(flight.height, landing.height);
  const fraction = postureSweep(ground, dx, dz, top, envelope, state.yaw, world, boundary);
  p.x += dx * fraction;
  p.z += dz * fraction;
  dive.blocked ||= !mobile || fraction < 1;
  if (y <= p.y || fitsPosture({ x: p.x, z: p.z, y }, envelope, state.yaw, world)) p.y = y;
  if (tick >= state.until || !mobile) {
    p.y = 0;
    delete state.dive;
    transition(state, dive.landing, tick);
  }
}

export function applyPostureInput(p: OperatorPosition, state: PostureState, input: PlayerInput, tick: number,
  balance = BALANCE.movement, world?: WorldDefinition, boundary?: MovementBoundary,
  speeds: Pick<typeof BALANCE.operator, 'walkSpeed' | 'sprintSpeed'> = BALANCE.operator): void {
  if (state.current === 'DIVING' || state.current === 'GETTING_UP') return;
  const ground = isGroundPosture(state.current);
  const upright = !ground;
  const command = state.started === tick ? undefined : input.posture;
  if (command === 'dive' && upright && p.y === 0 &&
      (state.lastDive === undefined || tick >= state.lastDive + seconds(balance.diveCooldownSeconds))) {
    const magnitude = Math.hypot(input.forward, input.strafe);
    if (magnitude > 1e-6 || balance.noDirection === 'forward') {
      const forward = magnitude > 1e-6 ? input.forward / magnitude : 1;
      const strafe = magnitude > 1e-6 ? input.strafe / magnitude : 0;
      const s = Math.sin(input.yaw), c = Math.cos(input.yaw);
      const landing = forward < balance.backwardDotThreshold ? 'SUPINE' : 'PRONE';
      if (fitsPosture(p, balance.colliders.DIVING, input.yaw, world) &&
          fitsPosture(p, balance.colliders[landing], input.yaw, world)) {
        state.yaw = input.yaw;
        state.lastDive = tick;
        state.dive = { x: strafe * c + forward * s, z: strafe * s - forward * c, landing, blocked: false };
        transition(state, 'DIVING', tick, seconds(balance.diveSeconds), landing);
        return;
      }
    }
  }
  const stand = command === 'stand' || (command === 'crouch' && state.current === 'CROUCHING');
  if (stand && state.current !== 'STANDING') {
    delete state.standBlockedAt;
    if (!fitsPosture(p, balance.colliders.STANDING, 0, world)) state.standBlockedAt = tick;
    else if (ground) {
      transition(state, 'GETTING_UP', tick, seconds(state.current === 'PRONE' ? balance.proneGetUpSeconds : balance.supineGetUpSeconds), 'STANDING');
      return;
    } else transition(state, 'STANDING', tick, seconds(balance.crouchSeconds));
  } else if (command === 'crouch' && state.current === 'STANDING') {
    if (fitsPosture(p, balance.colliders.CROUCHING, 0, world)) transition(state, 'CROUCHING', tick, seconds(balance.crouchSeconds));
  }

  const shape = balance.colliders[state.current];
  if (ground) {
    const maxTurn = balance.groundTurnRadiansPerSecond / NET.tickHz;
    const delta = Math.max(-maxTurn, Math.min(maxTurn, wrapAngle(input.yaw - state.yaw)));
    if (fitsPosture(p, shape, state.yaw + delta, world) && fitsPosture(p, shape, state.yaw + delta / 2, world)) {
      state.yaw = wrapAngle(state.yaw + delta);
    }
  } else state.yaw = input.yaw;

  if (!input.forward && !input.strafe) return;
  if (state.current === 'STANDING' && !world?.obstacles.some((o) => (o.bottom ?? 0) >= shape.height) &&
      shape.radius === shape.halfLength && shape.radius <= .5) {
    // Keep the established upright locomotion and tether behavior in the original maps.
    movePlayer(p, input, 1 / NET.tickHz, world, boundary, speeds, shape.radius,
      allowsPostureAction(state, 'sprint', balance));
    return;
  }
  const multiplier = state.current === 'CROUCHING' ? balance.crouchSpeedMultiplier :
    state.current === 'PRONE' ? balance.proneSpeedMultiplier : state.current === 'SUPINE' ? balance.supineSpeedMultiplier : 1;
  const speed = input.sprint && allowsPostureAction(state, 'sprint', balance) ? speeds.sprintSpeed : speeds.walkSpeed;
  const scale = speed * multiplier / (NET.tickHz * Math.max(1, Math.hypot(input.forward, input.strafe)));
  const sin = Math.sin(input.yaw), cos = Math.cos(input.yaw);
  const next = { x: p.x + (input.strafe * cos + input.forward * sin) * scale,
    z: p.z + (input.strafe * sin - input.forward * cos) * scale };
  if (boundary) constrainTether(next, boundary, boundary.radius);
  const yaw = ground ? state.yaw : 0;
  const dx = next.x - p.x;
  p.x += dx * postureSweep(p, dx, 0, shape.height, shape, yaw, world, boundary);
  const dz = next.z - p.z;
  p.z += dz * postureSweep(p, 0, dz, shape.height, shape, yaw, world, boundary);
}
