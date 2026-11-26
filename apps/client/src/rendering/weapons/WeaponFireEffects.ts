import * as T from 'three';
import { clearWorldLine, groundHeight } from '@freefall/shared';
import type { WeaponSlot, WorldDefinition } from '@freefall/shared';
import { GRAPHICS_QUALITY } from '../GraphicsQuality.ts';
import type { GraphicsQuality } from '../GraphicsQuality.ts';
import type { WeaponVisualController } from './WeaponVisualController.ts';

const PROFILES = {
  primary: { flashMs: 46, length: .32, width: .16, brightness: 1.8, casingSize: 1, brassSpeed: 1.85 },
  secondary: { flashMs: 38, length: .20, width: .12, brightness: 1.45, casingSize: .68, brassSpeed: 1.65 },
} as const;
const CASING_LIFETIME_MS = 640;
const MIN_CAMERA_DISTANCE_SQ = .32 ** 2;
const FLASH_COLOR = new T.Color(0xffbf79);
const FORWARD = new T.Vector3(0, 0, -1);

interface TimedEffect {
  started: number;
  ends: number;
  local: boolean;
}

function claim<T extends TimedEffect>(pool: readonly T[], limit: number, now: number, local: boolean): T | undefined {
  let oldest: T | undefined;
  for (let i = 0; i < limit; i++) {
    const effect = pool[i];
    if (effect.ends <= now) return effect;
    if (!local && effect.local) continue;
    if (!oldest || (oldest.local === effect.local ? effect.started < oldest.started : !effect.local)) oldest = effect;
  }
  return oldest;
}

/** Two crossed cards, tapered by the mask along the barrel's local -Z axis. */
function flashGeometry(): T.BufferGeometry {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute([
    -.5, 0, 0, .5, 0, 0, -.5, 0, -1, .5, 0, -1,
    0, -.5, 0, 0, .5, 0, 0, -.5, -1, 0, .5, -1,
  ], 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1], 2));
  geometry.setIndex([0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6]);
  return geometry;
}

function flashMask(): T.DataTexture {
  const width = 64, height = 32;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = (x + .5) / width;
      const v = (y + .5) * 2 / height - 1;
      const envelope = Math.sin(Math.PI * t ** .62) ** .7;
      const shape = Math.max(0, 1 - Math.abs(v + .07 * Math.sin(t * 9)) / (.88 * envelope));
      const alpha = shape ** 1.75 * (1 - t) ** .82 * Math.min(1, t * 22);
      const index = (y * width + x) * 4;
      pixels.set([255, 255, 255, Math.round(alpha * 246)], index);
    }
  }
  const texture = new T.DataTexture(pixels, width, height);
  texture.minFilter = texture.magFilter = T.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function timed() { return { started: 0, ends: -Infinity, local: false }; }

export class WeaponFireEffects {
  private readonly max = GRAPHICS_QUALITY.high;
  private readonly flashes = Array.from({ length: this.max.muzzleFlashes }, () => ({
    ...timed(), origin: new T.Vector3(), rotation: new T.Quaternion(), profile: PROFILES.primary as (typeof PROFILES)[WeaponSlot],
  }));
  private readonly casings = Array.from({ length: this.max.shellCasings }, () => ({
    ...timed(), origin: new T.Vector3(), velocity: new T.Vector3(), floor: 0, land: 0, size: 1,
  }));
  private readonly mask = flashMask();
  private readonly flashBatch = new T.InstancedMesh(flashGeometry(), new T.MeshBasicMaterial({
    map: this.mask, side: T.DoubleSide, transparent: true, forceSinglePass: true, depthWrite: false, blending: T.AdditiveBlending,
  }), this.max.muzzleFlashes);
  private readonly casingBatch = new T.InstancedMesh(new T.CylinderGeometry(.0046, .0053, .032, 6), new T.MeshStandardMaterial({
    color: 0xa38146, metalness: .45, roughness: .42,
  }), this.max.shellCasings);
  private readonly light = new T.PointLight(0xffb577, 0, 2.8, 2);
  private readonly pose = new T.Object3D();
  private readonly port = new T.Vector3();
  private readonly rotation = new T.Quaternion();
  private readonly direction = new T.Vector3();
  private readonly tint = new T.Color();
  private readonly scene: T.Scene;
  private quality: GraphicsQuality = GRAPHICS_QUALITY.medium;

  constructor(scene: T.Scene) {
    this.scene = scene;
    this.flashBatch.name = 'Muzzle flashes';
    this.casingBatch.name = 'Shell casings';
    for (const batch of [this.flashBatch, this.casingBatch]) {
      batch.count = 0;
      batch.visible = false;
      batch.frustumCulled = false;
      batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
    }
    this.flashBatch.setColorAt(0, FLASH_COLOR);
    this.flashBatch.instanceColor!.setUsage(T.DynamicDrawUsage);
    this.flashBatch.renderOrder = 3;
    scene.add(this.flashBatch, this.casingBatch);
  }

  setQuality(quality: GraphicsQuality): void {
    this.clear();
    this.quality = quality;
    // Keep the light count stable during firing so lit materials retain their programs.
    if (quality.muzzleLight) this.scene.add(this.light);
    else this.light.removeFromParent();
  }

  fire(weapon: WeaponVisualController, slot: WeaponSlot, now: number, local: boolean,
    camera: T.Camera, world: WorldDefinition | undefined): void {
    const { muzzleFlashes, shellCasings, muzzleDistance, casingDistance } = this.quality;
    const profile = PROFILES[slot];
    const muzzle = weapon.sockets.Muzzle;
    weapon.muzzle(this.port);
    const distance = this.port.distanceToSquared(camera.position);
    if (distance > muzzleDistance ** 2) return;

    const flash = claim(this.flashes, muzzleFlashes, now, local);
    if (flash) {
      muzzle.getWorldQuaternion(this.rotation);
      const { x, y, z } = this.port;
      const dir = this.direction.copy(FORWARD).applyQuaternion(this.rotation).multiplyScalar(profile.length);
      if (y > groundHeight(world, x, z) && (world ? clearWorldLine(world, x, y, z, dir.x, dir.y, dir.z) : y + dir.y > 0)) {
        flash.origin.copy(this.port);
        flash.rotation.copy(this.rotation);
        flash.profile = profile;
        Object.assign(flash, { started: now, ends: now + profile.flashMs, local });
      }
    }

    if (!local && distance > casingDistance ** 2) return;
    if (weapon.profile.ejectsPerShot === false) return;
    const casing = claim(this.casings, shellCasings, now, local);
    if (!casing) return;
    const socket = weapon.sockets.EjectionPort;
    socket.getWorldPosition(this.port);
    socket.getWorldQuaternion(this.rotation);
    const floor = groundHeight(world, this.port.x, this.port.z) + .018;
    if (this.port.y <= floor) return;
    casing.origin.copy(this.port);
    casing.velocity.set(profile.brassSpeed, .78, .30).applyQuaternion(this.rotation);
    const { x, y, z } = casing.velocity;
    const land = (y + Math.sqrt(y * y + 19.6 * (this.port.y - floor))) / 9.8;
    // A short cosmetic arc stays on this side of nearby solid cover.
    if (world && !clearWorldLine(world, this.port.x, this.port.y, this.port.z, x * land, 0, z * land)) return;
    Object.assign(casing, { floor, land, size: profile.casingSize, started: now, ends: now + CASING_LIFETIME_MS, local });
  }

  draw(now: number, camera: T.Camera, intensity: number): void {
    const { flashBatch, casingBatch, light, pose, quality } = this;
    flashBatch.count = casingBatch.count = light.intensity = 0;
    if (intensity > 0) for (let i = 0; i < quality.muzzleFlashes; i++) {
      const flash = this.flashes[i];
      if (flash.ends <= now || flash.origin.distanceToSquared(camera.position) < MIN_CAMERA_DISTANCE_SQ) continue;
      const { profile } = flash;
      const fade = (Math.min(1, (flash.ends - now) / profile.flashMs)) ** 1.5 * intensity;
      pose.position.copy(flash.origin);
      pose.quaternion.copy(flash.rotation);
      pose.scale.set(profile.width, profile.width, profile.length * (.62 + .38 * fade));
      pose.updateMatrix();
      flashBatch.setMatrixAt(flashBatch.count, pose.matrix);
      flashBatch.setColorAt(flashBatch.count++, this.tint.copy(FLASH_COLOR).multiplyScalar(profile.brightness * fade));
      if (flash.local && quality.muzzleLight && fade * quality.muzzleLight > light.intensity) {
        light.position.copy(flash.origin);
        light.intensity = fade * quality.muzzleLight;
      }
    }
    for (let i = 0; i < quality.shellCasings; i++) {
      const casing = this.casings[i];
      if (casing.ends <= now) continue;
      const age = Math.max(0, now - casing.started) / 1000;
      const flight = Math.min(casing.land, age);
      pose.position.copy(casing.origin).addScaledVector(casing.velocity, flight);
      pose.position.y = Math.max(casing.floor, pose.position.y - 4.9 * flight * flight);
      if (pose.position.distanceToSquared(camera.position) < MIN_CAMERA_DISTANCE_SQ) continue;
      pose.rotation.set(flight * 18, i * 1.62, flight * 25 + .8);
      pose.scale.setScalar(casing.size * Math.min(1, (casing.ends - now) / 120));
      pose.updateMatrix();
      casingBatch.setMatrixAt(casingBatch.count++, pose.matrix);
    }
    for (const batch of [flashBatch, casingBatch]) {
      batch.visible = batch.count > 0;
      if (batch.visible) {
        batch.instanceMatrix.clearUpdateRanges();
        batch.instanceMatrix.addUpdateRange(0, batch.count * 16);
        batch.instanceMatrix.needsUpdate = true;
      }
    }
    if (flashBatch.count) {
      const colors = flashBatch.instanceColor!;
      colors.clearUpdateRanges();
      colors.addUpdateRange(0, flashBatch.count * 3);
      colors.needsUpdate = true;
    }
  }

  metrics() {
    return { flashes: this.flashBatch.count, casings: this.casingBatch.count, lights: Number(this.light.intensity > 0),
      flashCap: this.quality.muzzleFlashes, casingCap: this.quality.shellCasings };
  }

  clear(): void {
    for (const pool of [this.flashes, this.casings]) for (const effect of pool) effect.ends = -Infinity;
    this.flashBatch.count = this.casingBatch.count = this.light.intensity = 0;
    this.flashBatch.visible = this.casingBatch.visible = false;
  }

  dispose(): void {
    this.clear();
    for (const batch of [this.flashBatch, this.casingBatch]) {
      batch.removeFromParent();
      batch.dispose();
      batch.geometry.dispose();
      batch.material.dispose();
    }
    this.mask.dispose();
    this.light.removeFromParent();
    this.light.dispose();
  }
}
