import * as T from 'three';
import { groundHeight, shotWorldLimit } from '@freefall/shared';
import type { CombatPosition, ImpactSurface, MeleeEvent, ShotEvent, ShotImpact, WeaponSlot, WorldDefinition } from '@freefall/shared';
import type { EnemyPose } from './EnemyVisualLOD.ts';
import { GRAPHICS_QUALITY } from './GraphicsQuality.ts';
import type { GraphicsQuality } from './GraphicsQuality.ts';
import { WeaponFireEffects } from './weapons/WeaponFireEffects.ts';
import type { WeaponVisualController } from './weapons/WeaponVisualController.ts';

type Impact = ImpactSurface | 'carapace' | 'fabric';

interface EffectSlot {
  shot?: ShotEvent;
  contact?: CombatPosition;
  tick: number;
  started: number;
  startX: number;
  startY: number;
  startZ: number;
  dx: number;
  dy: number;
  dz: number;
  range: number;
  life: number;
  priority: number;
  profile?: ImpactProfile;
  normal: T.Vector3;
  tangent: T.Vector3;
  bitangent: T.Vector3;
  slip: T.Vector3;
  fallen?: EnemyPose;
}

const MAX_SLOTS = GRAPHICS_QUALITY.high.effectSlots;
const MAX_PARTICLES = MAX_SLOTS * (GRAPHICS_QUALITY.high.impactParticles + 2);
const TRACER_MS = 72;
const TRACER_LENGTH = { primary: 6, secondary: 3.8 };

interface ImpactProfile {
  grain: T.Color;
  dust: T.Color;
  speed: number;
  size: number;
  life: number;
  dustOpacity: number;
  intensity: number;
}

function profile(grain: number, dust: number, speed: number, size: number, life: number, dustOpacity: number, intensity = 1.35): ImpactProfile {
  return { grain: new T.Color(grain), dust: new T.Color(dust), speed, size, life, dustOpacity, intensity };
}

const IMPACTS: Record<Impact, ImpactProfile> = {
  snow: profile(0xe0ecf1, 0xc6d5df, 2.0, .106, 325, .47),
  ice: profile(0xc7e5ed, 0x9ac7d5, 3.1, .072, 235, .20, 1.8),
  sand: profile(0xd3aa72, 0xb68e60, 2.1, .089, 375, .50),
  dirt: profile(0xa48769, 0x947b61, 1.85, .101, 300, .38),
  grass: profile(0x8a995a, 0x978561, 2.05, .085, 280, .27),
  rock: profile(0xb0a397, 0x938575, 2.65, .086, 260, .26),
  'frozen-rock': profile(0xa3b3c2, 0x83919f, 2.65, .086, 260, .26),
  'forest-floor': profile(0xab8950, 0x7f7254, 1.8, .107, 295, .38),
  wood: profile(0xc8a073, 0x9a7657, 2.9, .096, 265, .23),
  metal: profile(0xffb971, 0x6f6c65, 4.1, .067, 180, .09, 3.3),
  concrete: profile(0xc2beb1, 0xa29f94, 2.55, .083, 255, .34),
  neutral: profile(0xa6a095, 0x89837b, 2.1, .085, 235, .19),
  carapace: profile(0xbb834e, 0x715541, 2.5, .091, 240, .20),
  fabric: profile(0xa0917c, 0x79706a, 1.7, .078, 195, .20),
};

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
        gl_PointSize = clamp(size * projectionMatrix[1][1] * viewportHeight * 0.5 / max(0.15, -mvPosition.z), 1.3, 40.0);
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
    tick: 0,
    started: 0, startX: 0, startY: 0, startZ: 0, dx: 0, dy: 0, dz: 0, range: 0, life: 0, priority: 0,
    normal: new T.Vector3(), tangent: new T.Vector3(), bitangent: new T.Vector3(), slip: new T.Vector3(),
  }));
  private readonly weaponFire: WeaponFireEffects;
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
  private activeImpacts = 0;
  private accepted = 0;
  private reused = 0;
  private dropped = 0;
  private updateMs = 0;

  constructor(scene: T.Scene, fallenGeometry: T.BufferGeometry, fallenMaterial: T.Material) {
    this.weaponFire = new WeaponFireEffects(scene);
    this.lines.setAttribute('position', this.linePositions);
    this.lines.setAttribute('color', this.lineColors);
    this.particles.setAttribute('position', this.particlePositions);
    this.particles.setAttribute('tint', this.particleTints);
    this.particles.setAttribute('size', this.particleSizes);

    const tracers = new T.LineSegments(this.lines, new T.LineBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    }));
    tracers.name = 'Confirmed tracers';
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
    this.clear();
  }

  setQuality(quality: GraphicsQuality): void {
    this.quality = quality;
    this.clear();
    this.weaponFire.setQuality(quality);
  }

  setViewport(height: number): void {
    this.particleMaterial.uniforms.viewportHeight.value = height;
  }

  clear(): void {
    for (const slot of this.pool) {
      slot.shot = undefined;
      slot.contact = undefined;
      slot.fallen = undefined;
    }
    this.cursor = this.particleCount = this.activeImpacts = 0;
    this.lines.setDrawRange(0, 0);
    this.particles.setDrawRange(0, 0);
    this.fallen.count = 0;
    this.weaponFire.clear();
  }

  world?: WorldDefinition;

  fire(weapon: WeaponVisualController, slot: WeaponSlot, now: number, local: boolean, camera: T.Camera): void {
    this.weaponFire.fire(weapon, slot, now, local, camera, this.world);
  }

  metrics() {
    return { ...this.weaponFire.metrics(), tracers: this.lines.drawRange.count / 2, tracerCap: this.quality.effectSlots,
      impacts: this.activeImpacts, particles: this.particleCount, particleCap: this.quality.effectSlots * (this.quality.impactParticles + 2),
      impactAccepted: this.accepted, impactReused: this.reused, impactDropped: this.dropped, impactMs: this.updateMs };
  }

  dispose(): void {
    this.clear();
    this.weaponFire.dispose();
  }

  add(shot: ShotEvent, now: number, camera: T.Camera, local: boolean, fallen?: EnemyPose): void {
    this.addEffect({ x: shot.toX, y: shot.toY, z: shot.toZ }, shot.impact, shot.tick ?? 0, now, camera, local, shot, fallen);
  }

  melee(event: MeleeEvent, now: number, camera: T.Camera, local: boolean, fallen?: EnemyPose): void {
    if (event.damage <= 0 || !event.contact) return;
    const impact: ShotImpact = event.enemy
      ? { kind: 'enemy', normal: [-Math.sin(event.yaw), .22, Math.cos(event.yaw)] } : { kind: 'convict' };
    this.addEffect(event.contact, impact, event.tick, now, camera, local, undefined, fallen);
  }

  private addEffect(contact: CombatPosition, impact: ShotImpact | undefined, tick: number, now: number, camera: T.Camera,
    local: boolean, shot?: ShotEvent, fallen?: EnemyPose): void {
    const { x, y, z } = contact;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const material = impact?.kind === 'world' ? (Object.hasOwn(IMPACTS, impact.surface) ? IMPACTS[impact.surface] : IMPACTS.neutral)
      : impact?.kind === 'enemy' || impact?.kind === 'nest' ? IMPACTS.carapace
      : impact ? IMPACTS.fabric : undefined;
    const distance = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
    const profile = distance <= this.quality.enemyFar ? material : undefined;
    if (material && !profile) this.dropped++;
    const priority = local && impact ? 3 : impact && distance < this.quality.enemyNear ? 2 : impact ? 1 : 0;
    const cap = this.quality.effectSlots;
    let chosen = -1;
    for (let i = 0; i < cap; i++) {
      const index = (i + this.cursor) % cap;
      const slot = this.pool[index];
      if (!slot.contact || now - slot.started >= slot.life) { chosen = index; break; }
      if (slot.priority <= priority && (chosen < 0 || slot.priority < this.pool[chosen].priority)) chosen = index;
    }
    if (chosen < 0) {
      if (profile) this.dropped++;
      return;
    }
    const slot = this.pool[chosen];
    this.cursor = (chosen + 1) % cap;
    if (slot.contact) this.reused++;
    if (slot.profile && slot.contact && now - slot.started < slot.profile.life) this.dropped++;
    if (profile) this.accepted++;
    slot.priority = priority;
    slot.profile = profile;
    slot.life = fallen ? 790 : profile?.life ?? TRACER_MS;
    slot.shot = shot;
    slot.contact = contact;
    slot.tick = tick;
    slot.started = now;
    slot.startX = shot?.traceFrom?.x ?? shot?.fromX ?? x;
    slot.startY = shot?.traceFrom?.y ?? shot?.fromY ?? y;
    slot.startZ = shot?.traceFrom?.z ?? shot?.fromZ ?? z;
    const dx = x - slot.startX, dy = y - slot.startY, dz = z - slot.startZ;
    const range = Math.hypot(dx, dy, dz);
    const inverse = range > 0 ? 1 / range : 0;
    slot.dx = dx * inverse;
    slot.dy = dy * inverse;
    slot.dz = dz * inverse;
    const legacyOrConvict = shot && !shot.traceFrom && (shot.life === undefined || (!shot.tactical && !this.world?.terrain));
    slot.range = legacyOrConvict && range > 0 ? shotWorldLimit({ x: slot.startX, y: slot.startY, z: slot.startZ,
      dx: slot.dx, dy: slot.dy, dz: slot.dz }, 0, range, this.world) : range;
    slot.fallen = fallen;
    if (!profile) return;
    slot.normal.set(-slot.dx, -slot.dy, -slot.dz);
    if (impact && 'normal' in impact && impact.normal?.every(Number.isFinite)) slot.normal.fromArray(impact.normal);
    if (slot.normal.lengthSq() < .01) slot.normal.set(0, 1, 0);
    slot.normal.normalize();
    slot.tangent.set(Math.abs(slot.normal.y) > .85 ? 1 : 0, Math.abs(slot.normal.y) > .85 ? 0 : 1, 0)
      .cross(slot.normal).normalize();
    slot.bitangent.crossVectors(slot.normal, slot.tangent);
    slot.slip.set(slot.dx, slot.dy, slot.dz).addScaledVector(slot.normal,
      -(slot.dx * slot.normal.x + slot.dy * slot.normal.y + slot.dz * slot.normal.z));
  }

  private particle(x: number, y: number, z: number, size: number, color: T.Color, alpha: number, intensity = 1) {
    const n = this.particleCount++;
    this.particlePositions.setXYZ(n, x, y, z);
    this.particleSizes.setX(n, size);
    this.particleTints.setXYZW(n, color.r * intensity, color.g * intensity, color.b * intensity, alpha);
  }

  draw(now: number, camera: T.Camera, flashIntensity = 1, reduced = false, windX = 0, windZ = 0): void {
    this.weaponFire.draw(now, camera, flashIntensity);
    const started = performance.now();
    let vertices = 0;
    this.particleCount = this.activeImpacts = 0;
    this.fallen.count = 0;
    for (let i = 0; i < this.quality.effectSlots; i++) {
      const slot = this.pool[i];
      const shot = slot.shot;
      if (!slot.contact) continue;
      const age = Math.max(0, now - slot.started);
      if (age >= slot.life) {
        slot.shot = undefined;
        slot.contact = undefined;
        slot.fallen = undefined;
        continue;
      }

      const { startX, startY, startZ, dx, dy, dz, range } = slot;
      const { x: toX, y: toY, z: toZ } = slot.contact;
      if (shot && range > .08 && age < TRACER_MS) {
        const head = range * Math.min(1, (age + 9) / 36);
        const tail = Math.max(0, head - TRACER_LENGTH[shot.slot ?? 'primary']);
        const brightness = (1 - age / TRACER_MS) * (shot.slot === 'secondary' ? 1.1 : 1.5);
        this.linePositions.setXYZ(vertices, startX + dx * tail, startY + dy * tail, startZ + dz * tail);
        this.lineColors.setXYZ(vertices++, brightness * 0.37, brightness * 0.19, brightness * 0.071);
        this.linePositions.setXYZ(vertices, startX + dx * head, startY + dy * head, startZ + dz * head);
        this.lineColors.setXYZ(vertices++, brightness, brightness * 0.71, brightness * 0.36);
      }

      const distance = Math.hypot(toX - camera.position.x, toY - camera.position.y, toZ - camera.position.z);
      const profile = slot.profile;
      if (profile && age < profile.life && distance < this.quality.enemyFar && distance > .42) {
        this.activeImpacts++;
        const { normal, tangent, bitangent, slip } = slot;
        const t = age / 1000, fade = 1 - age / profile.life;
        const count = reduced || distance > this.quality.enemyNear ? 2 : this.quality.impactParticles;
        const apparent = Math.min(1.45, .87 + distance * .018);
        for (let j = 0; j < count; j++) {
          const angle = i * 7.13 + j * 2.399 + slot.tick * .387;
          const radial = t * profile.speed * (.34 + (j % 3) * .18);
          const kick = .031 + t * profile.speed * (.48 + (j % 4) * .19);
          const a = Math.cos(angle) * radial, b = Math.sin(angle) * radial;
          const sx = slip.x * t * .66, sy = slip.y * t * .66, sz = slip.z * t * .66;
          // Keep debris above the contact plane. Gravity can pull it along a wall or back down a slope.
          const gravity = 4.7 * t * t;
          const lift = Math.max(.013, kick - gravity * normal.y);
          this.particle(toX + normal.x * lift + tangent.x * a + bitangent.x * b + sx + gravity * normal.x * normal.y,
            toY + normal.y * lift + tangent.y * a + bitangent.y * b + sy - gravity * (1 - normal.y ** 2),
            toZ + normal.z * lift + tangent.z * a + bitangent.z * b + sz + gravity * normal.z * normal.y,
            profile.size * apparent * (.58 + fade * .42), profile.grain, fade * .88, reduced ? 1.25 : profile.intensity);
        }
        if (distance > 1.5) {
          const count = reduced || this.quality === GRAPHICS_QUALITY.low || distance > this.quality.enemyNear ? 1 : 2;
          const windNormal = normal.x * windX + normal.z * windZ;
          for (let j = 0; j < count; j++) {
            const lift = .032 + t * (.78 - j * .21);
            const drift = t * t * (j ? .4 : .65);
            this.particle(toX + normal.x * lift + tangent.x * t * j * .45 + (windX - windNormal * normal.x) * drift,
              toY + normal.y * lift + tangent.y * t * j * .45 - windNormal * normal.y * drift,
              toZ + normal.z * lift + tangent.z * t * j * .45 + (windZ - windNormal * normal.z) * drift,
              (.16 + t * 1.04) * apparent, profile.dust, fade * profile.dustOpacity * (j ? .58 : 1) * (reduced ? .64 : 1));
          }
        }
      }
      if (slot.fallen && distance < this.quality.enemyFar) {
        const { x, z, yaw } = slot.fallen;
        const collapse = Math.min(1, age / 220);
        const dissolve = Math.max(0, (age - 530) / 260);
        this.transform.position.set(x + Math.sin(i) * collapse * 0.25, groundHeight(this.world, x, z) - dissolve * .3, z);
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
    this.updateMs = performance.now() - started;
  }
}
