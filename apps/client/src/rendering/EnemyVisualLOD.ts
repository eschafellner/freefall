import * as T from 'three';
import { MAX_ENEMIES, SCHABE_TYPE, groundHeight, lerpAngle } from '@freefall/shared';
import type { HordeFrame, WorldDefinition } from '@freefall/shared';
import { applySurface } from './AgentMeshes.ts';
import { applySchabeTissue, schabeGeometry } from './SchabeModel.ts';
import type { ContactShadows } from './ContactShadows.ts';
import type { GraphicsQuality } from './GraphicsQuality.ts';
import { enemyAttackPitch } from './EnemyAttackPose.ts';

export interface EnemyPose {
  x: number;
  z: number;
  yaw: number;
  /** Wire type of the fallen body (default: the Schabe). */
  type?: number;
}

/** Abdomen breathing (rad per gait unit) and its relative swell; sensor stalks sway and ember veins beat (`pulse` × breath rate) with the same clock. */
export const SCHABE_IDLE = { breath: .13, swell: .035, pulse: 3 } as const;

/** Leg swing (m) along the body and foot lift (m) at full stride. */
export const SCHABE_GAIT = { stride: .11, lift: .075, rate: 1 / 88 } as const;

function gaitMaterial(): { material: T.MeshStandardMaterial; time: { value: number } } {
  const time = { value: 0 };
  const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.83, metalness: 0.08 });
  material.customProgramCacheKey = () => 'schabe-gait-v3';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.gaitTime = time;
    applySurface(shader);
    applySchabeTissue(shader);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      attribute vec2 rig;
      attribute vec2 gait;
      uniform float gaitTime;
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      // gait.x: per-instance phase, gait.y: stride amount (0 while standing or for fallen bodies without the attribute).
      if (rig.y > 0.0 && gait.y > 0.0) {
        float phase = gaitTime + gait.x + rig.x;
        transformed.z += sin(phase) * ${SCHABE_GAIT.stride.toFixed(3)} * rig.y * gait.y;
        transformed.y += max(0.0, -cos(phase)) * ${SCHABE_GAIT.lift.toFixed(3)} * rig.y * rig.y * gait.y;
      }
      // Living bodies (gait.x is the per-instance phase, 0 on fallen bodies): abdomen breathing, stalk sway, vein pulse.
      if (gait.x != 0.0) {
        float breath = sin(gaitTime * ${SCHABE_IDLE.breath.toFixed(3)} + gait.x) * tissue.x;
        transformed.x *= 1.0 + ${SCHABE_IDLE.swell.toFixed(3)} * breath;
        transformed.y = .58 + (transformed.y - .58) * (1.0 + ${(SCHABE_IDLE.swell * 1.5).toFixed(3)} * breath);
        float sway = tissue.y * tissue.y;
        transformed.x += sin(gaitTime * .31 + gait.x * 1.7 + tissue.y * 2.4) * .06 * sway;
        transformed.y += cos(gaitTime * .23 + gait.x) * .035 * sway;
        vSchabePulse = pow(.5 + .5 * sin(gaitTime * ${(SCHABE_IDLE.breath * SCHABE_IDLE.pulse).toFixed(3)} + gait.x * 2.3), 3.0);
      }
    `);
  };
  return { material, time };
}

export class EnemyVisualLOD {
  /** Own copy without the per-instance gait buffer, so fallen bodies never walk. */
  readonly fallenGeometry = schabeGeometry(1);
  private readonly gaitShader = gaitMaterial();
  readonly material = this.gaitShader.material;
  private readonly gaits: T.InstancedBufferAttribute[] = [];
  private readonly meshes = ([0, 1, 2] as const).map(schabeGeometry).map((geometry) => {
    const gait = new T.InstancedBufferAttribute(new Float32Array(MAX_ENEMIES * 2), 2);
    gait.setUsage(T.DynamicDrawUsage);
    geometry.setAttribute('gait', gait);
    this.gaits.push(gait);
    return new T.InstancedMesh(geometry, this.material, MAX_ENEMIES);
  });
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
    this.gaitShader.time.value = now * SCHABE_GAIT.rate;
    let visible = 0;
    if (a && b) {
      this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.viewProjection);
      const near = quality.enemyNear ** 2;
      const far = quality.enemyFar ** 2;
      const shadow = quality.enemyShadowDistance ** 2;
      const tick = a.tick + (b.tick - a.tick) * alpha;
      for (let i = 0; i < a.count; i++) {
        // Warrior castes have their own renderers (SwarmVisuals).
        if (a.type[i] !== SCHABE_TYPE) continue;
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
        this.gaits[tier].setXY(mesh.count, id * 3.79, moving && tier < 2 ? 1 : 0);
        const variation = 0.78 + (id % 11) * 0.022;
        mesh.setColorAt(mesh.count++, this.tint.setRGB(variation + reaction, variation + reaction * 0.38, variation));
        if (distance < shadow) shadows.add(x, z, yaw, 1.48, 1.63);
        visible++;
      }
    }
    this.visible = visible;
    for (const [tier, mesh] of this.meshes.entries()) {
      if (!mesh.count) continue;
      const gait = this.gaits[tier];
      gait.clearUpdateRanges();
      gait.addUpdateRange(0, mesh.count * 2);
      gait.needsUpdate = true;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.clearUpdateRanges();
      mesh.instanceColor!.addUpdateRange(0, mesh.count * 3);
      mesh.instanceColor!.needsUpdate = true;
    }
  }
}
