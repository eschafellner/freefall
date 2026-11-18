import { CAMERA_BACK, aimRay, obstacleIntersection } from '@freefall/shared';
import type { PositionXZ, WorldDefinition } from '@freefall/shared';
import * as T from 'three';

const HIP_FOV = 62;
const GROUND_CLEARANCE = .19;

export class ThirdPersonCamera {
  readonly camera = new T.PerspectiveCamera(HIP_FOV, 1, .11, 325);
  private readonly ray = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 };
  private aimBlend = 0;
  private sprintBlend = 0;
  private kick = 0;

  fire(strength = 1): void { this.kick = Math.max(this.kick, .63 * strength); }
  reset(): void { this.aimBlend = this.sprintBlend = this.kick = 0; }

  update(position: PositionXZ, yaw: number, pitch: number, aim: boolean, sprint: number, dt: number, world?: WorldDefinition): void {
    this.aimBlend = T.MathUtils.damp(this.aimBlend, Number(aim), 11, dt);
    this.sprintBlend = T.MathUtils.damp(this.sprintBlend, aim ? 0 : sprint, 9, dt);
    this.kick *= Math.exp(-dt * 19);
    aimRay(this.ray, position, yaw, pitch);
    const { x, y, z, dx, dy, dz } = this.ray;
    let travel = this.aimBlend * .98 - this.sprintBlend * .40;
    if (world) {
      const fx = x + dx * CAMERA_BACK;
      const fy = y + dy * CAMERA_BACK;
      const fz = z + dz * CAMERA_BACK;
      let limit = CAMERA_BACK - travel;
      for (const obstacle of world.obstacles) {
        limit = Math.min(limit, obstacleIntersection(obstacle, fx, fy, fz, -dx, -dy, -dz, 0, limit, .15));
      }
      if (limit < CAMERA_BACK - travel) travel = Math.min(CAMERA_BACK - .14, CAMERA_BACK - limit + .18);
    }
    // Slide along the existing aim line. Zoom and recoil keep the crosshair on that line.
    if (y + dy * travel < GROUND_CLEARANCE) travel = (GROUND_CLEARANCE - y) / dy;
    const camera = this.camera;
    camera.position.set(x + dx * travel, y + dy * travel, z + dz * travel);
    camera.lookAt(camera.position.x + dx, camera.position.y + dy, camera.position.z + dz);
    const fov = HIP_FOV - this.aimBlend * 14 + this.sprintBlend * 3.8 + this.kick;
    if (Math.abs(camera.fov - fov) > .015) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }
}
