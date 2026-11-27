import { BALANCE } from '../balance/defaults.ts';
import type { MovementDefinition, OperatorSlideDefinition, PostureCollider } from '../balance/definitions.ts';
import type { PlayerInput } from '../contracts/messages.ts';
import type { WorldDefinition } from '../definitions/missions.ts';
import { NET } from './arena.ts';
import { diveElevation, diveTravel } from './dive.ts';
import type { DiveState } from './dive.ts';
import { constrainTether, movePlayer, wrapAngle } from './movement.ts';
import type { AimRay, MovementBoundary } from './movement.ts';
import { groundHeight } from '../world/Terrain.ts';
import { canSprint, restStamina, spendStamina } from './stamina.ts';
import type { StaminaState } from './stamina.ts';
import type { EffectiveMobility } from '../balance/resolver.ts';
import { fitsPosture, groundedBodyHit, isOperatorGrounded, postureSweep, traceTacticalShot } from './postureGeometry.ts';
import type { OperatorPosition, ShotWorldContact } from './postureGeometry.ts';

export type Posture = keyof MovementDefinition['actions'];
export type GroundPosture = 'PRONE' | 'SUPINE';
export type PostureCommand = 'crouch' | 'dive' | 'stand';
export type PostureAction = keyof MovementDefinition['actions']['STANDING'];

interface SlideState {
  x: number;
  z: number;
  distance: number;
  decay: number;
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
  /** Briefly retained so interpolation can cross the landing edge after a dropped snapshot. */
  landedDive?: DiveState;
  slide?: SlideState;
  slideCooldownUntil?: number;
  /** Direction of the last movement step that actually reached the slide entry speed. */
  slideRunUp?: { tick: number; x: number; z: number };
  /** Last accepted ground movement in world-space metres per second. */
  groundMotion?: { tick: number; x: number; z: number };
  /** Accepted stand command sequence, scoped to the operator's life. */
  getUpId?: number;
  standBlockedAt?: number;
}

export const newPosture = (yaw = 0): PostureState =>
  ({ current: 'STANDING', requested: 'STANDING', from: 'STANDING', started: 0, until: 0, yaw });

const copyDive = (dive: DiveState): DiveState =>
  ({ ...dive, ...(dive.impact && { impact: { ...dive.impact } }) });

export function copyPosture(state: PostureState): PostureState {
  return {
    ...state,
    ...(state.dive && { dive: copyDive(state.dive) }),
    ...(state.landedDive && { landedDive: copyDive(state.landedDive) }),
    ...(state.slide && { slide: { ...state.slide } }),
    ...(state.slideRunUp && { slideRunUp: { ...state.slideRunUp } }),
    ...(state.groundMotion && { groundMotion: { ...state.groundMotion } }),
  };
}

export function isGroundPosture(posture: Posture): posture is GroundPosture {
  return posture === 'PRONE' || posture === 'SUPINE';
}

export function canSecureExtraction(posture: Posture, position: OperatorPosition, world?: WorldDefinition): boolean {
  return (posture === 'STANDING' || posture === 'CROUCHING') && isOperatorGrounded(position, world);
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
  if (state.current === 'DIVING' && state.dive && tick < state.dive.takeoff) return shapes[state.dive.from];
  if (state.current !== 'GETTING_UP') return shapes[state.current];
  const source = shapes[state.from], target = shapes.STANDING;
  const t = postureProgress(state, tick) ** balance.getUpColliderExponent;
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
  if (state.current === 'PRONE') return Math.max(balance.proneMinPitch, Math.min(balance.proneMaxPitch, pitch));
  if (state.current === 'SUPINE') return Math.max(balance.supineMinPitch, Math.min(balance.supineMaxPitch, pitch));
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

export function tacticalShotLimit(ray: AimRay, p: OperatorPosition, muzzle: OperatorPosition, state: PostureState,
  shape: PostureCollider, aimDistance: number, range: number, aimedAtTarget: boolean, world?: WorldDefinition, contact?: ShotWorldContact): number {
  const end = traceTacticalShot(ray, p, muzzle, aimDistance, range, aimedAtTarget, world, contact);
  if (end > 0 && isGroundPosture(state.current) &&
      groundedBodyHit(ray, p, shape, state.yaw, state.current === 'SUPINE', 0, end, world) !== Infinity) return 0;
  return end;
}

export function allowsPostureAction(state: PostureState, action: PostureAction, balance = BALANCE.movement): boolean {
  return balance.actions[state.current][action];
}

export function diveEnvelope(landing: GroundPosture, balance: MovementDefinition): PostureCollider {
  const flight = balance.colliders.DIVING;
  const ground = balance.colliders[landing];
  return {
    ...flight,
    radius: Math.max(flight.radius, ground.radius),
    halfLength: Math.max(flight.halfLength, ground.halfLength),
    height: Math.max(flight.height, ground.height),
  };
}

function advanceDive(p: OperatorPosition, state: PostureState, dive: DiveState, tick: number,
  balance: MovementDefinition, world?: WorldDefinition, boundary?: MovementBoundary, mobile = true): void {
  if (!dive.impact && (tick > dive.takeoff || !mobile)) {
    const before = diveTravel(dive, tick - 1);
    const step = diveTravel(dive, tick) - before;
    const y = diveElevation(dive, tick);
    const envelope = diveEnvelope(dive.landing, balance);
    // Sweep the full column down to the floor. Every accepted point leaves room to settle in place.
    const base = groundHeight(world, p.x, p.z);
    const ground = { x: p.x, y: base, z: p.z };
    const fraction = mobile
      ? postureSweep(ground, dive.x * step, dive.z * step, Math.max(p.y, base + y) + envelope.height,
        envelope, dive.yaw, world, boundary)
      : 0;
    if (fraction < 1) {
      const travel = before + step * fraction;
      const x = dive.originX + dive.x * travel, z = dive.originZ + dive.z * travel;
      const contact = { x, y: groundHeight(world, x, z) + y, z };
      // A low ceiling can block a rise even if no horizontal motion was possible.
      const elevation = mobile && fitsPosture(contact, envelope, dive.yaw, world) ? y : p.y - base;
      dive.impact = { tick, travel, elevation };
    }
  }
  const travel = diveTravel(dive, tick);
  p.x = dive.originX + dive.x * travel;
  p.z = dive.originZ + dive.z * travel;
  p.y = groundHeight(world, p.x, p.z) + diveElevation(dive, tick);
  if (tick >= dive.until) {
    state.landedDive = dive;
    delete state.dive;
    transition(state, dive.landing, dive.until);
  }
}

export function advancePosture(p: OperatorPosition, state: PostureState, tick: number, balance: MovementDefinition,
  world?: WorldDefinition, boundary?: MovementBoundary, mobile = true): void {
  if (state.landedDive && tick >= state.landedDive.until + NET.tickHz) delete state.landedDive;
  if (state.slideRunUp && (!mobile || tick > state.slideRunUp.tick + 1)) delete state.slideRunUp;
  if (state.slideCooldownUntil !== undefined && tick >= state.slideCooldownUntil) delete state.slideCooldownUntil;
  if (state.groundMotion && tick > state.groundMotion.tick + 1) delete state.groundMotion;
  if (state.current === 'SLIDING' && state.slide) {
    advanceSlide(p, state, state.slide, tick, balance, world, boundary, mobile);
    return;
  }
  if (state.current === 'GETTING_UP') {
    const finished = tick >= state.until;
    if (!mobile || !isOperatorGrounded(p, world) || !fitsPosture(p, balance.colliders.STANDING, 0, world) ||
        (!finished && !fitsPosture(p, postureCollider(state, tick, balance), state.yaw, world))) {
      state.standBlockedAt = tick;
      transition(state, state.from, tick);
    } else if (finished) transition(state, 'STANDING', tick);
    if (state.current !== 'GETTING_UP') delete state.getUpId;
    return;
  }
  if (state.current === 'DIVING' && state.dive) advanceDive(p, state, state.dive, tick, balance, world, boundary, mobile);
}

function slideStepDistance(slide: Pick<SlideState, 'distance' | 'decay'>, before: number, after: number): number {
  // Integral of linearly declining speed. The normalized curve travels exactly one slide distance.
  return slide.distance * (after - before) * (1 + slide.decay * (1 - after - before));
}

/** Maximum displacement per simulation tick, attained on the first slide step. */
export function slidePeakStep(slide: Pick<SlideState, 'distance' | 'decay'>, durationTicks: number): number {
  return slideStepDistance(slide, 0, 1 / Math.max(1, durationTicks));
}

function advanceSlide(p: OperatorPosition, state: PostureState, slide: SlideState, tick: number,
  balance: MovementDefinition, world?: WorldDefinition, boundary?: MovementBoundary, mobile = true): void {
  if (mobile) {
    const travel = slideStepDistance(slide, postureProgress(state, tick - 1), postureProgress(state, tick));
    const dx = slide.x * travel, dz = slide.z * travel;
    const { SLIDING, CROUCHING } = balance.colliders;
    // Reserve the crouch clearance as well, so the operator can settle into it at any point of the slide.
    const fraction = Math.min(
      postureSweep(p, dx, dz, p.y + SLIDING.height, SLIDING, state.yaw, world, boundary),
      postureSweep(p, dx, dz, p.y + CROUCHING.height, CROUCHING, 0, world, boundary),
    );
    p.x += dx * fraction;
    p.z += dz * fraction;
    if (world?.terrain) p.y = groundHeight(world, p.x, p.z);
    if (fraction === 1 && tick < state.until) return;
  }
  delete state.slide;
  transition(state, 'CROUCHING', tick);
}

/**
 * One movement input of an operator (server and client prediction). `mobility` and `stamina` come from the operator's
 * armor (`EffectiveLoadout.mobility`) and its running stamina; without them movement is unlimited (tools and tests).
 */
export function applyPostureInput(p: OperatorPosition, state: PostureState, input: PlayerInput, tick: number,
  balance = BALANCE.movement, world?: WorldDefinition, boundary?: MovementBoundary,
  speeds: Pick<typeof BALANCE.operator, 'walkSpeed' | 'sprintSpeed'> = BALANCE.operator,
  slideBalance: OperatorSlideDefinition = balance.slide, mobility?: EffectiveMobility, stamina?: StaminaState): void {
  const rules = stamina && mobility?.stamina;
  /** Every input step without spending lets stamina recover (faster crouched or lying). */
  const rest = () => { if (rules) restStamina(stamina!, rules, state.current !== 'STANDING' && state.current !== 'GETTING_UP'); };
  if (state.current === 'DIVING' || state.current === 'GETTING_UP' || state.current === 'SLIDING' ||
      (state.from === 'DIVING' && state.started === tick) ||
      (state.current === 'CROUCHING' && state.from === 'SLIDING' && state.started === tick)) {
    rest();
    return;
  }
  const runUp = state.slideRunUp;
  delete state.slideRunUp;
  const ground = isGroundPosture(state.current);
  const command = state.started === tick ? undefined : input.posture;
  const diveDistance = mobility ? mobility.diveDistance : balance.diveDistance;
  if (command === 'dive' && allowsPostureAction(state, 'dive', balance) && diveDistance > 0 &&
      (!rules || stamina!.value >= rules.diveCost) &&
      (state.current === 'STANDING' || state.current === 'CROUCHING') &&
      startDive(p, state, state.current, input, tick, balance, world, boundary, diveDistance)) {
    if (rules) spendStamina(stamina!, rules.diveCost);
    return;
  }
  const stand = command === 'stand' || (command === 'crouch' && state.current === 'CROUCHING');
  if (stand && allowsPostureAction(state, 'standUp', balance) && state.current !== 'STANDING') {
    delete state.standBlockedAt;
    if (!isOperatorGrounded(p, world) || !fitsPosture(p, balance.colliders.STANDING, 0, world)) state.standBlockedAt = tick;
    else if (ground) {
      delete state.groundMotion;
      state.getUpId = input.seq;
      transition(state, 'GETTING_UP', tick, seconds((state.current === 'PRONE' ? balance.proneGetUpSeconds : balance.supineGetUpSeconds) *
        (mobility?.getUpMultiplier ?? 1)), 'STANDING');
      rest();
      return;
    } else transition(state, 'STANDING', tick, seconds(balance.crouchSeconds));
  } else if (command === 'crouch' && state.current === 'STANDING') {
    if (input.sprint && (input.forward || input.strafe) && isOperatorGrounded(p, world) && runUp && tick <= runUp.tick + 1 &&
        (state.slideCooldownUntil === undefined || tick >= state.slideCooldownUntil) && (mobility?.canSlide ?? true) &&
        (!rules || stamina!.value >= rules.slideCost)) {
      const yaw = Math.atan2(runUp.x, -runUp.z);
      if (fitsPosture(p, balance.colliders.SLIDING, yaw, world) && fitsPosture(p, balance.colliders.CROUCHING, 0, world)) {
        state.yaw = yaw;
        state.slide = { x: runUp.x, z: runUp.z, distance: slideBalance.distance, decay: slideBalance.decay };
        state.slideCooldownUntil = tick + seconds(slideBalance.cooldownSeconds);
        transition(state, 'SLIDING', tick, seconds(slideBalance.seconds), 'CROUCHING');
        if (rules) spendStamina(stamina!, rules.slideCost);
        return;
      }
    }
    if (fitsPosture(p, balance.colliders.CROUCHING, 0, world)) transition(state, 'CROUCHING', tick, seconds(balance.crouchSeconds));
  }

  const shape = balance.colliders[state.current];
  if (ground) {
    moveGroundedOperator(p, state, input, tick, shape, balance, speeds.walkSpeed, world, boundary);
    rest();
    return;
  }
  state.yaw = input.yaw;

  if (!input.forward && !input.strafe) {
    rest();
    return;
  }
  const startX = p.x, startZ = p.z;
  const sprintAllowed = allowsPostureAction(state, 'sprint', balance) && (!rules || canSprint(stamina!));
  const sprint = input.sprint && sprintAllowed;
  if (!world?.terrain && state.current === 'STANDING' && !world?.obstacles.some((o) => (o.bottom ?? 0) >= shape.height) &&
      shape.radius === shape.halfLength && shape.radius <= .5) {
    // Keep the established upright locomotion and tether behavior in the original maps.
    movePlayer(p, input, 1 / NET.tickHz, world, boundary, speeds, shape.radius, sprintAllowed);
  } else {
    const multiplier = state.current === 'CROUCHING' ? balance.crouchSpeedMultiplier : 1;
    const speed = sprint ? speeds.sprintSpeed : speeds.walkSpeed;
    const scale = speed * multiplier / (NET.tickHz * Math.max(1, Math.hypot(input.forward, input.strafe)));
    const sin = Math.sin(input.yaw), cos = Math.cos(input.yaw);
    const next = { x: p.x + (input.strafe * cos + input.forward * sin) * scale,
      z: p.z + (input.strafe * sin - input.forward * cos) * scale };
    if (boundary) constrainTether(next, boundary, boundary.radius);
    const dx = next.x - p.x;
    p.x += dx * postureSweep(p, dx, 0, p.y + shape.height, shape, 0, world, boundary);
    if (world?.terrain) p.y = groundHeight(world, p.x, p.z);
    const dz = next.z - p.z;
    p.z += dz * postureSweep(p, 0, dz, p.y + shape.height, shape, 0, world, boundary);
    if (world?.terrain) p.y = groundHeight(world, p.x, p.z);
  }
  if (state.current === 'STANDING' && sprint) {
    const dx = p.x - startX, dz = p.z - startZ;
    const distance = Math.hypot(dx, dz);
    if (distance * NET.tickHz + 1e-9 >= slideBalance.minSpeed) {
      state.slideRunUp = { tick, x: dx / distance, z: dz / distance };
    }
  }
  if (rules && sprint) spendStamina(stamina!, rules.sprintDrain);
  else rest();
}

function moveGroundedOperator(p: OperatorPosition, state: PostureState, input: PlayerInput, tick: number,
  shape: PostureCollider, balance: MovementDefinition, walkSpeed: number, world?: WorldDefinition,
  boundary?: MovementBoundary): void {
  if (!allowsPostureAction(state, 'groundMove', balance) || !isOperatorGrounded(p, world)) {
    delete state.groundMotion;
    return;
  }
  const prone = state.current === 'PRONE';
  const maxTurn = (prone ? balance.proneTurnRadiansPerSecond : balance.supineTurnRadiansPerSecond) / NET.tickHz;
  const delta = Math.max(-maxTurn, Math.min(maxTurn, wrapAngle(input.yaw - state.yaw)));
  if (delta && fitsPosture(p, shape, state.yaw + delta, world) && fitsPosture(p, shape, state.yaw + delta / 2, world)) {
    state.yaw = wrapAngle(state.yaw + delta);
  }
  if (!input.forward && !input.strafe) {
    delete state.groundMotion;
    return;
  }
  const speed = walkSpeed * (prone ? balance.proneSpeedMultiplier : balance.supineSpeedMultiplier);
  const scale = speed / Math.max(1, Math.hypot(input.forward, input.strafe));
  const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
  const vx = state.groundMotion?.x ?? 0, vz = state.groundMotion?.z ?? 0;
  const changeX = (input.strafe * cos + input.forward * sin) * scale - vx;
  const changeZ = (input.strafe * sin - input.forward * cos) * scale - vz;
  const change = Math.hypot(changeX, changeZ);
  const blend = change > 0 ? Math.min(1, balance.groundAcceleration / (NET.tickHz * change)) : 1;
  const next = { x: p.x + (vx + changeX * blend) / NET.tickHz, z: p.z + (vz + changeZ * blend) / NET.tickHz };
  if (boundary) constrainTether(next, boundary, boundary.radius);
  const dx = next.x - p.x, dz = next.z - p.z;
  const acceptedX = dx && dx * postureSweep(p, dx, 0, p.y + shape.height, shape, state.yaw, world, boundary);
  p.x += acceptedX;
  if (world?.terrain) p.y = groundHeight(world, p.x, p.z);
  const acceptedZ = dz && dz * postureSweep(p, 0, dz, p.y + shape.height, shape, state.yaw, world, boundary);
  p.z += acceptedZ;
  if (world?.terrain) p.y = groundHeight(world, p.x, p.z);
  if (acceptedX || acceptedZ) state.groundMotion = { tick, x: acceptedX * NET.tickHz, z: acceptedZ * NET.tickHz };
  else delete state.groundMotion;
}

function startDive(p: OperatorPosition, state: PostureState, from: DiveState['from'], input: PlayerInput, tick: number,
  balance: MovementDefinition, world?: WorldDefinition, boundary?: MovementBoundary, distance = balance.diveDistance): boolean {
  if (!isOperatorGrounded(p, world) || state.dive ||
      (state.lastDive !== undefined && tick < state.lastDive + seconds(balance.diveCooldownSeconds)) ||
      (boundary && Math.hypot(p.x - boundary.x, p.z - boundary.z) > boundary.radius + 1e-7)) return false;

  const intent = input.diveIntent ?? input;
  const magnitude = Math.hypot(intent.forward, intent.strafe);
  if (!Number.isFinite(magnitude) || !Number.isFinite(intent.yaw)) return false;
  const neutral = magnitude <= 1e-6;
  if (neutral && balance.noDirection === 'reject') return false;
  const cameraYaw = neutral ? state.yaw : intent.yaw;
  const forward = neutral ? 1 : intent.forward / magnitude;
  const strafe = neutral ? 0 : intent.strafe / magnitude;
  const sin = Math.sin(cameraYaw), cos = Math.cos(cameraYaw);
  const x = strafe * cos + forward * sin, z = strafe * sin - forward * cos;
  const dot = x * Math.sin(state.yaw) - z * Math.cos(state.yaw);
  const landing = dot < balance.backwardDotThreshold ? 'SUPINE' : 'PRONE';
  if (!fitsPosture(p, diveEnvelope(landing, balance), state.yaw, world)) return false;

  transition(state, 'DIVING', tick, seconds(balance.diveSeconds), landing);
  state.lastDive = tick;
  delete state.landedDive;
  state.dive = {
    id: input.seq, x, z, yaw: state.yaw, from, landing, originX: p.x, originZ: p.z,
    started: tick, takeoff: tick + seconds(balance.divePrepSeconds), until: state.until,
    distance, arcHeight: balance.diveArcHeight,
  };
  return true;
}
