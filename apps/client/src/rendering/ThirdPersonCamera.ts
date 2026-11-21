import { BALANCE, CAMERA_BACK, LOOK_HEIGHT, aimRay, groundHeight, nearbyObstacles, obstacleIntersection, postureProgress, terrainIntersection } from '@freefall/shared';
import type { PositionXZ, PostureState, WorldDefinition } from '@freefall/shared';
import * as T from 'three';
import { cameraPreferences } from './CameraPreferences.ts';

const HIP_FOV = 62;
const GROUND_CLEARANCE = .19;
const COLLISION_RADIUS = .15;
const COLLISION_VERTICAL = .08;
const IMPULSE_PRIORITY = { mission: 0, melee: 1, explosion: 2, damage: 3 };
type Impulse = keyof typeof IMPULSE_PRIORITY;

/** How far the collision anchor moves in from the shoulder over each authoritative posture. */
export function cameraAnchorWeight(posture: PostureState, tick: number): number {
  switch (posture.current) {
    case 'STANDING': return 0;
    case 'CROUCHING': return .7;
    case 'DIVING': return 1;
    case 'GETTING_UP': return 1 - postureProgress(posture, tick) ** BALANCE.movement.getUpColliderExponent;
    default: return 1;
  }
}

/**
 * Camera tuning. Yaw and pitch are never smoothed: the view follows the mouse in the same frame.
 * View height, zoom and collision release are damped (rates in 1/s).
 */
export const CAMERA_TUNING = {
  aimRate: 11,
  sprintRate: 9,
  aimTravel: .98,
  aimFov: 14,
  sprintPullback: .28,
  sprintFov: 3,
  /** Collision pulls the camera in at once (never through geometry) and releases at this rate. */
  collisionRelease: 7,
};

export class ThirdPersonCamera {
  readonly camera = new T.PerspectiveCamera(HIP_FOV, 1, .11, 325);
  private readonly ray = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 };
  readonly target = new T.Vector3();
  private lookHeight = LOOK_HEIGHT;
  private anchorBlend = 0;
  private aimBlend = 0;
  private sprintBlend = 0;
  private kick = 0;
  private pull = 0;
  private shake = 0;
  private shakeTime = 0;
  private shakePriority = -1;
  private initialized = false;
  get collisionPull(): number { return this.pull; }

  /** Field-of-view punch per shot. Gameplay recoil moves the view separately (pitch/yaw offset). */
  fire(strength = 1): void { this.kick = Math.max(this.kick, Math.min(.8, .63 * strength)); }
  /** One bounded envelope shared by positional effects. A lower priority cannot prolong a stronger reaction. */
  impulse(kind: Impulse, strength: number): void {
    if (cameraPreferences.reducedMotion || cameraPreferences.shake <= 0 || strength <= 0) return;
    const priority = IMPULSE_PRIORITY[kind];
    if (this.shake > .08 && priority < this.shakePriority) return;
    this.shakePriority = priority;
    this.shake = Math.max(this.shake, Math.min(1, strength));
  }
  blast(strength: number): void { this.impulse('explosion', strength); }
  clearImpulse(): void { this.shake = this.kick = 0; this.shakePriority = -1; }
  reset(): void {
    this.lookHeight = LOOK_HEIGHT;
    this.anchorBlend = this.aimBlend = this.sprintBlend = this.kick = this.pull = this.shake = this.shakeTime = 0;
    this.shakePriority = -1;
    this.initialized = false;
  }

  update(position: PositionXZ, yaw: number, pitch: number, aim: boolean, sprint: number, dt: number, world?: WorldDefinition,
    elevation = 0, lookHeight = LOOK_HEIGHT, anchorWeight = 0): void {
    const tuning = CAMERA_TUNING;
    const { smoothing, follow, reducedMotion, shake } = cameraPreferences;
    const followRate = BALANCE.movement.cameraDamping * follow;
    if (!this.initialized) {
      this.lookHeight = lookHeight;
      this.anchorBlend = anchorWeight;
      this.initialized = true;
    }
    this.lookHeight = T.MathUtils.damp(this.lookHeight, lookHeight, followRate / smoothing, dt);
    this.anchorBlend = T.MathUtils.damp(this.anchorBlend, anchorWeight, followRate, dt);
    this.aimBlend = T.MathUtils.damp(this.aimBlend, Number(aim), tuning.aimRate / smoothing, dt);
    this.sprintBlend = T.MathUtils.damp(this.sprintBlend, aim || reducedMotion ? 0 : sprint, tuning.sprintRate / smoothing, dt);
    this.kick *= Math.exp(-dt * 19);
    this.shake = reducedMotion || shake <= 0 ? 0 : this.shake * Math.exp(-dt * 8);
    this.shakeTime += dt;
    aimRay(this.ray, position, yaw, pitch, this.lookHeight, elevation, !!world?.terrain);
    const { dx, dy, dz } = this.ray;
    let travel = this.aimBlend * tuning.aimTravel - this.sprintBlend * tuning.sprintPullback;
    if (!world?.terrain && this.ray.y + dy * travel < GROUND_CLEARANCE) travel = (GROUND_CLEARANCE - this.ray.y) / dy;
    const camera = this.camera;
    const amplitude = !aim && this.shake > .01 ? this.shake * shake * .06 * (1 - .63 * this.anchorBlend) : 0;
    this.placeCamera(position, elevation + this.lookHeight, travel, amplitude, dt, world);
    this.target.set(camera.position.x + dx * CAMERA_BACK, camera.position.y + dy * CAMERA_BACK, camera.position.z + dz * CAMERA_BACK);
    camera.lookAt(this.target);
    const fov = HIP_FOV - this.aimBlend * tuning.aimFov + this.sprintBlend * tuning.sprintFov + (reducedMotion ? 0 : this.kick * shake);
    if (Math.abs(camera.fov - fov) > .015) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }

  private placeCamera(position: PositionXZ, eye: number, travel: number, shake: number, dt: number, world?: WorldDefinition): void {
    const { x, y, z, dx, dy, dz } = this.ray;
    const sx = x + dx * CAMERA_BACK - position.x;
    const sz = z + dz * CAMERA_BACK - position.z;
    const floor = groundHeight(world, position.x, position.z) + GROUND_CLEARANCE;
    eye = Math.max(floor, eye);
    const sy = Math.max(floor, y + dy * CAMERA_BACK) - eye;
    let shoulder = 1 - this.anchorBlend;
    const obstacles = nearbyObstacles(world, position.x, position.z,
      Math.hypot(x + dx * travel - position.x, z + dz * travel - position.z) + COLLISION_RADIUS + .06);
    // Check the segment from the operator first. A shoulder anchor inside a wall would start the boom past its face.
    for (const obstacle of obstacles) {
      const hit = obstacleIntersection(obstacle, position.x, eye, position.z, sx, sy, sz, 0, shoulder, COLLISION_RADIUS, COLLISION_VERTICAL);
      if (hit <= shoulder) shoulder = Math.max(0, hit - .15);
    }
    if (world?.terrain) {
      const hit = terrainIntersection(world, position.x, eye, position.z, sx, sy, sz, 0, shoulder, GROUND_CLEARANCE);
      if (hit <= shoulder) shoulder = Math.max(0, hit - .12);
    }
    const ax = position.x + sx * shoulder;
    const az = position.z + sz * shoulder;
    const ay = eye + sy * shoulder;
    const bx = x + dx * travel + (shake ? Math.sin(this.shakeTime * 71) * shake : 0) - ax;
    const bz = z + dz * travel - az;
    const by = Math.max(world?.terrain ? -Infinity : GROUND_CLEARANCE, y + dy * travel + (shake ? Math.sin(this.shakeTime * 53 + 1.3) * shake * .7 : 0)) - ay;
    const distance = Math.hypot(bx, by, bz);
    let limit = Math.min(1, terrainIntersection(world, ax, ay, az, bx, by, bz, 0, 1, GROUND_CLEARANCE));
    for (const obstacle of obstacles) {
      limit = Math.min(limit, obstacleIntersection(obstacle, ax, ay, az, bx, by, bz, 0, limit, COLLISION_RADIUS, COLLISION_VERTICAL));
    }
    const required = limit < 1 ? Math.min(distance, (1 - limit) * distance + .18) : 0;
    this.pull = required >= this.pull ? required : T.MathUtils.damp(this.pull, required, CAMERA_TUNING.collisionRelease, dt);
    const fraction = distance > 0 ? Math.max(0, 1 - this.pull / distance) : 0;
    this.camera.position.set(ax + bx * fraction, ay + by * fraction, az + bz * fraction);
  }
}
