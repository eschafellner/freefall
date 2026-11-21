import * as T from 'three';
import { MAX_ENEMIES, groundHeight, lerpAngle } from '@freefall/shared';
import type { HordeFrame, WorldDefinition } from '@freefall/shared';
import { combineParts, paintedPart } from './AgentMeshes.ts';
import type { ContactShadows } from './ContactShadows.ts';
import type { GraphicsQuality } from './GraphicsQuality.ts';
import { enemyAttackPitch } from './EnemyAttackPose.ts';

export interface EnemyPose {
  x: number;
  z: number;
  yaw: number;
}

function shell(tier: number): T.BufferGeometry {
  const parts: T.BufferGeometry[] = [];
  const detailed = tier === 0;
  function add(color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, tilt = 0, roll = 0) {
    parts.push(paintedPart(new T.IcosahedronGeometry(1, detailed && parts.length < 3 ? 1 : 0).scale(sx, sy, sz)
      .rotateX(tilt).rotateZ(roll).translate(x, y, z), color));
  }
  add(0x584137, 0, 0.56, 0.07, 0.43, 0.36, 0.58, 0.13);
  add(0x8c6447, 0, 0.69, -0.15, 0.5, 0.36, 0.4, -0.16);
  add(0x9a734f, 0, 0.62, -0.49, 0.28, 0.24, 0.29, -0.31);
  if (tier < 2) {
    for (const side of [-1, 1]) {
      add(0x604838, side * 0.36, 0.5, -0.18, 0.17, 0.14, 0.36, -0.53, side * 0.37);
      add(0x49382f, side * 0.5, 0.23, -0.35, 0.103, 0.28, 0.18, 0.34, side * -0.21);
      add(0x6b513d, side * 0.33, 0.4, 0.23, 0.15, 0.19, 0.29, 0.54, side * 0.29);
      add(0x49382f, side * 0.4, 0.19, 0.43, 0.087, 0.23, 0.16, -0.35, side * -0.2);
      if (tier === 0) {
        add(0x4d392e, side * 0.18, 0.5, -0.65, 0.085, 0.09, 0.22, -0.36, side * -0.1);
        add(0xbd8952, side * 0.17, 0.69, -0.67, 0.036, 0.024, 0.076);
        add(0xae815e, side * 0.18, 0.81, 0.16, 0.21, 0.15, 0.39, 0.25, side * -0.21);
      }
    }
  } else {
    add(0x544036, 0, 0.23, 0.08, 0.55, 0.22, 0.54);
  }
  return combineParts(parts);
}

export class EnemyVisualLOD {
  readonly fallenGeometry = shell(1);
  readonly material = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.83, metalness: 0.08 });
  private readonly meshes = [shell(0), this.fallenGeometry, shell(2)].map((geometry) =>
    new T.InstancedMesh(geometry, this.material, MAX_ENEMIES));
  private readonly transform = new T.Object3D();
  private readonly frustum = new T.Frustum();
  private readonly viewProjection = new T.Matrix4();
  private readonly bounds = new T.Sphere(new T.Vector3(), 1.25);
  private readonly reactions = new Map<number, number>();
  private readonly eliminated = new Map<number, number>();
  private readonly tint = new T.Color();
  private before?: HordeFrame;
  private after?: HordeFrame;
  private alpha = 0;
  visible = 0;

  constructor(scene: T.Scene) {
    for (const mesh of this.meshes) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.setColorAt(0, this.tint);
      mesh.instanceColor!.setUsage(T.DynamicDrawUsage);
      scene.add(mesh);
    }
  }

  clear(): void {
    this.reactions.clear();
    this.eliminated.clear();
    this.before = this.after = undefined;
  }

  hit(id: number, now: number, killed: boolean): EnemyPose | undefined {
    if (!id) return;
    if (!killed) {
      this.reactions.set(id, now + 135);
      return;
    }
    // Hide the interpolated copy until the authoritative despawn reaches the render timeline.
    this.eliminated.set(id, now + 800);
    const a = this.before;
    const b = this.after;
    if (!a || !b) return;
    const i = a.byId.get(id);
    const next = b.byId.get(id);
    if (i === undefined) return next === undefined ? undefined : { x: b.x[next], z: b.z[next], yaw: -b.yaw[next] };
    return next === undefined ? { x: a.x[i], z: a.z[i], yaw: -a.yaw[i] } : {
      x: a.x[i] + (b.x[next] - a.x[i]) * this.alpha,
      z: a.z[i] + (b.z[next] - a.z[i]) * this.alpha,
      yaw: -lerpAngle(a.yaw[i], b.yaw[next], this.alpha),
    };
  }

  draw(camera: T.Camera, a: HordeFrame | undefined, b: HordeFrame | undefined, alpha: number, now: number,
    quality: GraphicsQuality, shadows: ContactShadows, world?: WorldDefinition): void {
    this.before = a;
    this.after = b;
    this.alpha = alpha;
    for (const [id, until] of this.reactions) if (until < now) this.reactions.delete(id);
    for (const [id, until] of this.eliminated) if (until < now) this.eliminated.delete(id);
    for (const mesh of this.meshes) mesh.count = 0;
    let visible = 0;
    if (a && b) {
      this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.viewProjection);
      const near = quality.enemyNear ** 2;
      const far = quality.enemyFar ** 2;
      const shadow = quality.enemyShadowDistance ** 2;
      const tick = a.tick + (b.tick - a.tick) * alpha;
      for (let i = 0; i < a.count; i++) {
        const id = a.id[i];
        if (this.eliminated.has(id)) continue;
        const other = b.byId.get(id);
        const x = other === undefined ? a.x[i] : a.x[i] + (b.x[other] - a.x[i]) * alpha;
        const z = other === undefined ? a.z[i] : a.z[i] + (b.z[other] - a.z[i]) * alpha;
        const ground = groundHeight(world, x, z);
        this.bounds.center.set(x, ground + .62, z);
        if (!this.frustum.intersectsSphere(this.bounds)) continue;
        const dx = x - camera.position.x;
        const dz = z - camera.position.z;
        const distance = dx * dx + dz * dz;
        const tier = distance < near ? 0 : distance < far ? 1 : 2;
        const mesh = this.meshes[tier];
        const moving = other !== undefined && (Math.abs(b.x[other] - a.x[i]) + Math.abs(b.z[other] - a.z[i])) > 0.027;
        const gait = moving && tier < 2 ? Math.sin(now / 88 + id * 3.79) * (tier === 0 ? 0.055 : 0.025) : 0;
        const reaction = tier < 2 ? Math.max(0, (this.reactions.get(id) ?? 0) - now) / 135 : 0;
        const yaw = -(other === undefined ? a.yaw[i] : lerpAngle(a.yaw[i], b.yaw[other], alpha));
        this.transform.position.set(x, ground + Math.abs(gait) * .44, z);
        const attackPitch = tier < 2 ? enemyAttackPitch(a, i, b, other, tick) : 0;
        this.transform.rotation.set(attackPitch + (tier === 0 ? gait * 0.75 - reaction * 0.2 : 0), yaw, gait);
        this.transform.updateMatrix();
        mesh.setMatrixAt(mesh.count, this.transform.matrix);
        const variation = 0.78 + (id % 11) * 0.022;
        mesh.setColorAt(mesh.count++, this.tint.setRGB(variation + reaction, variation + reaction * 0.38, variation));
        if (distance < shadow) shadows.add(x, z, yaw, 1.48, 1.63);
        visible++;
      }
    }
    this.visible = visible;
    for (const mesh of this.meshes) {
      if (!mesh.count) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.clearUpdateRanges();
      mesh.instanceColor!.addUpdateRange(0, mesh.count * 3);
      mesh.instanceColor!.needsUpdate = true;
    }
  }
}
