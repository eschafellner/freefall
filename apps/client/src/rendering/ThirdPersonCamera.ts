import { CAMERA_BACK, aimRay, obstacleIntersection } from '@freefall/shared';
import type { PositionXZ, WorldDefinition } from '@freefall/shared';
import * as T from 'three';

const HIP_FOV = 62;
const GROUND_CLEARANCE = .19;

/**
 * Camera tuning. Yaw and pitch are never smoothed: the view follows the mouse in the same frame.
 * Only zoom blends and the collision release are damped (rates in 1/s).
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
  private aimBlend = 0;
  private sprintBlend = 0;
  private kick = 0;
  private pull = 0;

  fire(strength = 1): void { this.kick = Math.max(this.kick, .63 * strength); }
  reset(): void { this.aimBlend = this.sprintBlend = this.kick = this.pull = 0; }

  update(position: PositionXZ, yaw: number, pitch: number, aim: boolean, sprint: number, dt: number, world?: WorldDefinition): void {
    const tuning = CAMERA_TUNING;
    this.aimBlend = T.MathUtils.damp(this.aimBlend, Number(aim), tuning.aimRate, dt);
    this.sprintBlend = T.MathUtils.damp(this.sprintBlend, aim ? 0 : sprint, tuning.sprintRate, dt);
    this.kick *= Math.exp(-dt * 19);
    aimRay(this.ray, position, yaw, pitch);
    const { x, y, z, dx, dy, dz } = this.ray;
    let travel = this.aimBlend * tuning.aimTravel - this.sprintBlend * tuning.sprintPullback;
    let required = 0;
    if (world) {
      const fx = x + dx * CAMERA_BACK;
      const fy = y + dy * CAMERA_BACK;
      const fz = z + dz * CAMERA_BACK;
      let limit = CAMERA_BACK - travel;
      for (const obstacle of world.obstacles) {
        limit = Math.min(limit, obstacleIntersection(obstacle, fx, fy, fz, -dx, -dy, -dz, 0, limit, .15));
      }
      if (limit < CAMERA_BACK - travel) required = Math.min(CAMERA_BACK - .14, CAMERA_BACK - limit + .18) - travel;
    }
    // Moving in is immediate so the view never clips; moving back out eases to avoid pumping at edges.
    this.pull = required >= this.pull ? required : T.MathUtils.damp(this.pull, required, tuning.collisionRelease, dt);
    travel = Math.min(CAMERA_BACK - .14, travel + this.pull);
    // Slide along the existing aim line. Zoom and recoil keep the crosshair on that line.
    if (y + dy * travel < GROUND_CLEARANCE) travel = (GROUND_CLEARANCE - y) / dy;
    const camera = this.camera;
    camera.position.set(x + dx * travel, y + dy * travel, z + dz * travel);
    camera.lookAt(camera.position.x + dx, camera.position.y + dy, camera.position.z + dz);
    const fov = HIP_FOV - this.aimBlend * tuning.aimFov + this.sprintBlend * tuning.sprintFov + this.kick;
    if (Math.abs(camera.fov - fov) > .015) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }
}
