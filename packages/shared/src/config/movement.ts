import { clampToArena, PLAYER } from './arena.ts';
import { distanceSquared, moveOnGround } from './worldGeometry.ts';
import type { WorldDefinition } from '../definitions/missions.ts';
import type { PlayerInput } from '../contracts/messages.ts';

export const MAX_PITCH = 0.69;
export const LOOK_HEIGHT = 1.34;
export const CAMERA_BACK = 4.8;
export const CAMERA_SHOULDER = 0.86;
export const CAMERA_LIFT = 0.76;
export const MUZZLE_HEIGHT = 1.24;

export interface PositionXZ {
  x: number;
  z: number;
}

export interface MovementBoundary extends PositionXZ { radius: number }

export function constrainTether(position: PositionXZ, anchor: PositionXZ, radius: number): void {
  const dx = position.x - anchor.x;
  const dz = position.z - anchor.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= radius) return;
  position.x = anchor.x + dx * (radius / distance);
  position.z = anchor.z + dz * (radius / distance);
}

export function movePlayer(position: PositionXZ, input: PlayerInput, dt: number, world?: WorldDefinition,
  boundary?: MovementBoundary): void {
  const distance = dt * (input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed);
  const scale = distance / Math.max(1, Math.hypot(input.forward, input.strafe));
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  const x = position.x + (input.strafe * cos + input.forward * sin) * scale;
  const z = position.z + (input.strafe * sin - input.forward * cos) * scale;
  if (world && boundary) {
    const candidate = { x, z };
    constrainTether(candidate, boundary, boundary.radius);
    const startX = position.x, startZ = position.z;
    moveOnGround(position, candidate.x, candidate.z, world, .42);
    if (distanceSquared(position, boundary) > boundary.radius ** 2 + 1e-7) {
      position.x = startX;
      position.z = startZ;
    }
  } else if (world) moveOnGround(position, x, z, world, .42);
  else {
    position.x = clampToArena(x);
    position.z = clampToArena(z);
  }
}

export function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function lerpAngle(from: number, to: number, alpha: number): number {
  return from + wrapAngle(to - from) * alpha;
}

export interface AimRay {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

export function aimRay(ray: AimRay, position: PositionXZ, yaw: number, pitch: number): void {
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const cp = Math.cos(pitch);
  ray.dx = sy * cp;
  ray.dy = Math.sin(pitch);
  ray.dz = -cy * cp;
  ray.x = position.x + cy * CAMERA_SHOULDER - ray.dx * CAMERA_BACK;
  ray.y = Math.max(0.19, LOOK_HEIGHT + CAMERA_LIFT - ray.dy * CAMERA_BACK);
  ray.z = position.z + sy * CAMERA_SHOULDER - ray.dz * CAMERA_BACK;
}
