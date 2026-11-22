import * as T from 'three';
import { MAX_ENEMIES, groundHeight, lerpAngle } from '@freefall/shared';
import type { HordeFrame, WorldDefinition } from '@freefall/shared';
import { applySurface } from './AgentMeshes.ts';
import { ModelParts } from './ModelParts.ts';
import type { ContactShadows } from './ContactShadows.ts';
import type { GraphicsQuality } from './GraphicsQuality.ts';
import { enemyAttackPitch } from './EnemyAttackPose.ts';

export interface EnemyPose {
  x: number;
  z: number;
  yaw: number;
}

type Point = readonly [number, number, number];

/** Hip, knee and foot per leg pair (front, middle, rear) for the +X side; mirrored for −X. */
const LEGS: readonly (readonly [Point, Point, Point])[] = [
  [[.3, .44, -.36], [.53, .47, -.55], [.6, .02, -.7]],
  [[.36, .4, -.1], [.6, .45, -.08], [.71, .02, -.05]],
  [[.33, .38, .22], [.55, .43, .41], [.65, .02, .58]],
];

/**
 * Procedural Schabe in three detail tiers (+Y up, −Z forward). Squat, low body with three carapace segments in earth
 * and copper browns, mandibles, lighter eyes. Tier 0 adds jointed legs, antennae, carapace ridges and wing cases;
 * tier 1 keeps jointed legs in fewer segments; tier 2 is the base silhouette. Legs carry a `rig` attribute (tripod
 * phase, weight from hip to foot) for the gait in the vertex shader.
 */
function shell(tier: number): T.BufferGeometry {
  const m = new ModelParts({ contact: .045, occlusion: .55, rig: true });
  const detail = tier === 0 ? .66 : tier === 1 ? .42 : .34;
  m.gloss = .55;
  m.oval(0x584137, 0, .56, .07, .86, .72, 1.16, .13, 0, detail);
  m.oval(0x8c6447, 0, .69, -.15, 1, .72, .8, -.16, 0, detail);
  m.oval(0x9a734f, 0, .62, -.49, .56, .48, .58, -.31, 0, detail);
  if (tier === 2) {
    m.gloss = 1;
    m.oval(0x544036, 0, .23, .08, 1.1, .44, 1.08, 0, 0, .3);
    return m.geometry();
  }
  for (const side of [-1, 1]) {
    // Flank plates and wing cases over the abdomen.
    m.oval(0x604838, side * .36, .5, -.18, .34, .28, .72, -.53, side * .37, tier === 0 ? .5 : .3);
    if (tier === 0) m.oval(0xae815e, side * .18, .81, .16, .42, .3, .78, .25, side * -.21, .55);
  }
  if (tier === 0) {
    // Overlapping carapace ridges across the abdomen and a light dorsal keel on the thorax.
    for (const [z, scale, color] of [[-.02, 1, 0x4f3b31], [.2, .93, 0x5c4538], [.4, .76, 0x4f3b31]] as const) {
      m.oval(color, 0, .57 - z * .08, z, .88 * scale, .74 * scale, .16, .13, 0, .42);
    }
  }
  // Head: lighter eyes with a faint sheen, mandible bases and curved pincers.
  m.gloss = .35;
  m.glow = tier === 0 ? .3 : 0;
  for (const side of [-1, 1]) m.oval(0xc99258, side * .17, .69, -.67, .09, .065, .11, 0, 0, tier === 0 ? .45 : .3);
  m.glow = 0;
  m.gloss = .5;
  for (const side of [-1, 1]) {
    m.oval(0x4d392e, side * .17, .5, -.66, .17, .18, .32, -.36, side * -.1, tier === 0 ? .4 : .3);
    if (tier === 0) m.segment(0x3c2c23, [side * .14, .47, -.76], [side * .05, .42, -.9], .035, .012, 5, false);
  }
  if (tier === 0) {
    m.gloss = .6;
    for (const side of [-1, 1]) {
      m.segment(0x4a372c, [side * .09, .74, -.7], [side * .17, .87, -.9], .021, .014, 5);
      m.segment(0x4a372c, [side * .17, .87, -.9], [side * .3, .82, -1.06], .014, .007, 4);
    }
  }
  // Six jointed legs, tripod gait: left front, right middle and left rear move together.
  m.gloss = .6;
  for (const [pair, [hip, knee, foot]] of LEGS.entries()) {
    for (const side of [-1, 1]) {
      const h: Point = [hip[0] * side, hip[1], hip[2]];
      const k: Point = [knee[0] * side, knee[1], knee[2]];
      const f: Point = [foot[0] * side, foot[1], foot[2]];
      const reach = Math.hypot(f[0] - h[0], f[1] - h[1], f[2] - h[2]);
      const group = (side < 0) === (pair !== 1) ? 0 : 1;
      m.rig = (x, y, z) => [group * Math.PI + pair * .3, Math.min(1, Math.hypot(x - h[0], y - h[1], z - h[2]) / reach)];
      m.segment(0x5a4335, h, k, .088, .064, tier === 0 ? 6 : 4, tier === 0);
      m.segment(0x49382f, k, f, .062, .03, tier === 0 ? 6 : 4, tier === 0);
      if (tier === 0) m.oval(0x2e241e, f[0], f[1] + .02, f[2], .07, .05, .09, 0, 0, .25);
    }
  }
  m.rig = undefined;
  return m.geometry();
}

/** Leg swing (m) along the body and foot lift (m) at full stride. */
export const SCHABE_GAIT = { stride: .11, lift: .075, rate: 1 / 88 } as const;

function gaitMaterial(): { material: T.MeshStandardMaterial; time: { value: number } } {
  const time = { value: 0 };
  const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.83, metalness: 0.08 });
  material.customProgramCacheKey = () => 'schabe-gait-v1';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.gaitTime = time;
    applySurface(shader);
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
    `);
  };
  return { material, time };
}

export class EnemyVisualLOD {
  /** Own copy without the per-instance gait buffer, so fallen bodies never walk. */
  readonly fallenGeometry = shell(1);
  private readonly gaitShader = gaitMaterial();
  readonly material = this.gaitShader.material;
  private readonly gaits: T.InstancedBufferAttribute[] = [];
  private readonly meshes = [shell(0), shell(1), shell(2)].map((geometry) => {
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
