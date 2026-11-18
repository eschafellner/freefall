import * as T from 'three';
import type { ShotEvent } from '@freefall/shared';
import type { EnemyPose } from './EnemyVisualLOD.ts';
import { GRAPHICS_QUALITY } from './GraphicsQuality.ts';
import type { GraphicsQuality } from './GraphicsQuality.ts';
import { groundSurface } from './terrain.ts';

type Impact = ReturnType<typeof groundSurface> | 'carapace' | 'air';

interface EffectSlot {
  shot?: ShotEvent;
  started: number;
  startX: number;
  startY: number;
  startZ: number;
  impact: Impact;
  fallen?: EnemyPose;
}

const MAX_SLOTS = GRAPHICS_QUALITY.high.effectSlots;
const MAX_PARTICLES = MAX_SLOTS * (GRAPHICS_QUALITY.high.impactParticles + 4);
const sparks = new T.Color(0xffb971);
const flash = new T.Color(0xffca88);
const dirt = new T.Color(0x97816a);
const concrete = new T.Color(0xa6a398);
const soot = new T.Color(0x5f564d);
const chitin = new T.Color(0xb88758);

function dynamic(length: number, stride = 3): T.BufferAttribute {
  return new T.BufferAttribute(new Float32Array(length * stride), stride).setUsage(T.DynamicDrawUsage);
}

function upload(attribute: T.BufferAttribute, count: number): void {
  if (!count) return;
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, count * attribute.itemSize);
  attribute.needsUpdate = true;
}

function particleMaterial(scene: T.Scene): T.ShaderMaterial {
  return new T.ShaderMaterial({
    uniforms: { ...T.UniformsUtils.clone(T.UniformsLib.fog), viewportHeight: { value: 1 } },
    fog: Boolean(scene.fog),
    transparent: true,
    depthWrite: false,
    vertexShader: `
      #include <fog_pars_vertex>
      uniform float viewportHeight;
      attribute float size;
      attribute vec4 tint;
      varying vec4 particle;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp(size * projectionMatrix[1][1] * viewportHeight * 0.5 / max(0.15, -mvPosition.z), 1.0, 68.0);
        particle = tint;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <fog_pars_fragment>
      varying vec4 particle;
      void main() {
        vec2 offset = gl_PointCoord * 2.0 - 1.0;
        float r = dot(offset, offset);
        if (r >= 1.0) discard;
        gl_FragColor = vec4(particle.rgb, particle.a * (1.0 - smoothstep(0.0, 1.0, r)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}

export class VisualEffectsManager {
  private readonly pool: EffectSlot[] = Array.from({ length: MAX_SLOTS }, () => ({
    started: 0, startX: 0, startY: 0, startZ: 0, impact: 'air',
  }));
  private readonly lines = new T.BufferGeometry();
  private readonly particles = new T.BufferGeometry();
  private readonly linePositions = dynamic(MAX_SLOTS * 2);
  private readonly lineColors = dynamic(MAX_SLOTS * 2);
  private readonly particlePositions = dynamic(MAX_PARTICLES);
  private readonly particleTints = dynamic(MAX_PARTICLES, 4);
  private readonly particleSizes = dynamic(MAX_PARTICLES, 1);
  private readonly particleMaterial: T.ShaderMaterial;
  private readonly fallen: T.InstancedMesh;
  private readonly transform = new T.Object3D();
  private readonly tint = new T.Color();
  private quality: GraphicsQuality = GRAPHICS_QUALITY.medium;
  private cursor = 0;
  private particleCount = 0;

  constructor(scene: T.Scene, fallenGeometry: T.BufferGeometry, fallenMaterial: T.Material) {
    this.lines.setAttribute('position', this.linePositions);
    this.lines.setAttribute('color', this.lineColors);
    this.particles.setAttribute('position', this.particlePositions);
    this.particles.setAttribute('tint', this.particleTints);
    this.particles.setAttribute('size', this.particleSizes);

    const tracers = new T.LineSegments(this.lines, new T.LineBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    }));
    this.particleMaterial = particleMaterial(scene);
    const points = new T.Points(this.particles, this.particleMaterial);
    tracers.frustumCulled = points.frustumCulled = false;
    tracers.renderOrder = 3;
    points.renderOrder = 2;
    this.fallen = new T.InstancedMesh(fallenGeometry, fallenMaterial, MAX_SLOTS);
    this.fallen.count = 0;
    this.fallen.frustumCulled = false;
    this.fallen.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.fallen.setColorAt(0, this.tint);
    this.fallen.instanceColor!.setUsage(T.DynamicDrawUsage);
    scene.add(tracers, points, this.fallen);
  }

  setQuality(quality: GraphicsQuality): void {
    this.quality = quality;
    this.clear();
  }

  setViewport(height: number): void {
    this.particleMaterial.uniforms.viewportHeight.value = height;
  }

  clear(): void {
    for (const slot of this.pool) {
      slot.shot = undefined;
      slot.fallen = undefined;
    }
    this.cursor = 0;
  }

  add(shot: ShotEvent, now: number, fallen?: EnemyPose, muzzle?: T.Vector3): void {
    const slot = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.quality.effectSlots;
    slot.shot = shot;
    slot.started = now;
    slot.startX = muzzle?.x ?? shot.fromX;
    slot.startY = muzzle?.y ?? shot.fromY;
    slot.startZ = muzzle?.z ?? shot.fromZ;
    slot.impact = shot.enemy || shot.nest ? 'carapace' : Math.abs(shot.toY) < 0.021 ? groundSurface(shot.toX, shot.toZ) : 'air';
    slot.fallen = fallen;
  }

  private particle(x: number, y: number, z: number, size: number, color: T.Color, alpha: number, intensity = 1) {
    const n = this.particleCount++;
    this.particlePositions.setXYZ(n, x, y, z);
    this.particleSizes.setX(n, size);
    this.particleTints.setXYZW(n, color.r * intensity, color.g * intensity, color.b * intensity, alpha);
  }

  draw(now: number, camera: T.Camera): void {
    let vertices = 0;
    this.particleCount = 0;
    this.fallen.count = 0;
    for (let i = 0; i < this.quality.effectSlots; i++) {
      const slot = this.pool[i];
      const shot = slot.shot;
      if (!shot) continue;
      const age = Math.max(0, now - slot.started);
      const life = slot.fallen ? 790 : slot.impact !== 'air' ? 490 : 93;
      if (age >= life) {
        slot.shot = undefined;
        slot.fallen = undefined;
        continue;
      }

      const { startX, startY, startZ } = slot;
      const { toX, toY, toZ } = shot;
      const dx = toX - startX;
      const dy = toY - startY;
      const dz = toZ - startZ;
      if (age < 91) {
        const head = Math.min(1, (age + 18) / 55);
        const tail = Math.max(0, head - 0.33 - (1 - head) * 0.12 + Math.max(0, age - 60) / 160);
        const brightness = (1 - age / 91) * 2.1;
        this.linePositions.setXYZ(vertices, startX + dx * tail, startY + dy * tail, startZ + dz * tail);
        this.lineColors.setXYZ(vertices++, brightness * 0.37, brightness * 0.19, brightness * 0.071);
        this.linePositions.setXYZ(vertices, startX + dx * head, startY + dy * head, startZ + dz * head);
        this.lineColors.setXYZ(vertices++, brightness, brightness * 0.71, brightness * 0.36);
      }
      if (age < 65) {
        const fade = 1 - age / 65;
        this.particle(startX, startY, startZ, 0.17 + fade * 0.14, flash, fade * 0.9, 3.4);
      }

      const distance = Math.hypot(toX - camera.position.x, toZ - camera.position.z);
      if (slot.impact !== 'air' && distance < this.quality.enemyFar) {
        const metal = slot.impact === 'metal';
        const airborne = slot.impact === 'carapace';
        const debris = metal ? sparks : airborne ? chitin : slot.impact === 'concrete' ? concrete : dirt;
        const scale = shot.eliminated ? 1.3 : 0.76;
        const t = age / 1000;
        if (age < 250) {
          const count = distance > this.quality.enemyNear ? Math.min(2, this.quality.impactParticles) : this.quality.impactParticles;
          for (let j = 0; j < count; j++) {
            const a = i * 7.13 + j * 2.399;
            const speed = scale * (metal ? 3.7 : 2.1) * (0.66 + j * 0.071);
            const rise = speed * (0.68 + (j % 4) * 0.28);
            this.particle(toX + Math.cos(a) * speed * t, Math.max(0.026, toY + rise * t - t * t * 5.9),
              toZ + Math.sin(a) * speed * t, (metal ? 0.070 : 0.113) * (1 - age / 400),
              debris, (1 - age / 250) * 0.83, metal ? 3.4 : 1.3);
          }
        }
        if (age < 490) {
          const fade = 1 - age / 490;
          const smoke = metal || airborne ? soot : debris;
          this.particle(toX + t * 0.26, toY + 0.065 + t * 0.94, toZ - t * 0.26,
            (0.23 + t * 1.45) * scale, smoke, fade * 0.33);
          this.particle(toX - t * 0.23, toY + 0.04 + t * 0.63, toZ + t * 0.46,
            (0.17 + t * 1.30) * scale, smoke, fade * 0.23);
          if (shot.eliminated && age < 125) {
            this.particle(toX, toY, toZ, 0.27 + t * 3.8, flash, (1 - age / 125) * 0.76, 2.0);
          }
        }
      }
      if (slot.fallen && distance < this.quality.enemyFar) {
        const { x, z, yaw } = slot.fallen;
        const collapse = Math.min(1, age / 220);
        const dissolve = Math.max(0, (age - 530) / 260);
        this.transform.position.set(x + Math.sin(i) * collapse * 0.25, -dissolve * 0.3, z);
        this.transform.rotation.set(-collapse * 0.48, yaw, collapse * (i % 2 ? 1.29 : -1.29));
        this.transform.scale.setScalar(1 - dissolve * 0.36);
        this.transform.updateMatrix();
        this.fallen.setMatrixAt(this.fallen.count, this.transform.matrix);
        this.fallen.setColorAt(this.fallen.count++, this.tint.setScalar(0.8 - dissolve * 0.32));
      }
    }
    this.lines.setDrawRange(0, vertices);
    this.particles.setDrawRange(0, this.particleCount);
    upload(this.linePositions, vertices);
    upload(this.lineColors, vertices);
    upload(this.particlePositions, this.particleCount);
    upload(this.particleTints, this.particleCount);
    upload(this.particleSizes, this.particleCount);
    upload(this.fallen.instanceMatrix, this.fallen.count);
    upload(this.fallen.instanceColor!, this.fallen.count);
  }
}
