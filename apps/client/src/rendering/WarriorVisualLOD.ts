import * as T from 'three';
import {
  ATTACK_LEAP, BREACHER_TYPE, ENEMY_TRAITS, JAEGER_TYPE, MAX_ENEMIES, attackDuration, attackStrikeAt, enemyAttackTiming, groundHeight,
  leapElevation, lerpAngle,
} from '@freefall/shared';
import type { EnemyAttackTiming, HordeFrame, WorldDefinition } from '@freefall/shared';
import { applySurface } from './AgentMeshes.ts';
import { breacherGeometry } from './BreacherModel.ts';
import type { ContactShadows } from './ContactShadows.ts';
import type { EnemyPose } from './EnemyVisualLOD.ts';
import type { GraphicsQuality } from './GraphicsQuality.ts';
import { jaegerGeometry } from './JaegerModel.ts';
import { applyWarriorSurface } from './WarriorSurface.ts';
import { ROLE } from './WarriorKit.ts';

/** Instance pose: body offset and tilt plus the shader controls (crouch, tuck, limb strike angle, jaw). */
export interface WarriorPose {
  lift: number;
  pitch: number;
  roll: number;
  crouch: number;
  tuck: number;
  strike: number;
  jaw: number;
}

/** Attack state of one enemy on the render clock: kind, timing and fractional ticks since the attack started. */
export interface AttackSample {
  kind: number;
  timing: EnemyAttackTiming;
  elapsed: number;
}

export interface CasteVisual {
  readonly type: number;
  readonly geometry: (tier: 0 | 1 | 2) => T.BufferGeometry;
  /** Leg swing (m), foot lift (m), body drop at full crouch (m), metres covered per gait cycle. */
  readonly gait: { readonly stride: number; readonly lift: number; readonly drop: number; readonly cycle: number };
  readonly bounds: number;
  readonly shadow: readonly [number, number];
  pose(out: WarriorPose, moving: number, gaitPhase: number, attack: AttackSample | undefined): void;
}

const ease = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Phase progress of an attack: 'windup' | 'flight' | 'active' | 'recovery' with 0…1 within the phase. */
function phaseOf(attack: AttackSample): { phase: 'windup' | 'flight' | 'active' | 'recovery'; t: number } | undefined {
  const { timing, elapsed } = attack;
  const strike = attackStrikeAt(timing);
  if (elapsed < 0 || elapsed >= attackDuration(timing)) return;
  if (elapsed < timing.windupTicks) return { phase: 'windup', t: elapsed / timing.windupTicks };
  if (elapsed < strike) return { phase: 'flight', t: (elapsed - timing.windupTicks) / timing.flightTicks };
  if (elapsed < strike + timing.activeTicks) return { phase: 'active', t: (elapsed - strike) / timing.activeTicks };
  return { phase: 'recovery', t: (elapsed - strike - timing.activeTicks) / timing.recoveryTicks };
}

/** Jäger: bounding gallop, rearing slash, and the leap (crouch, airborne tuck with reaching claws, strike, recovery). */
export const JAEGER_VISUAL: CasteVisual = {
  type: JAEGER_TYPE,
  geometry: jaegerGeometry,
  gait: { stride: .34, lift: .2, drop: .34, cycle: 2.4 },
  bounds: 2.1,
  shadow: [2.4, 2.8],
  pose(out, moving, gait, attack) {
    out.lift = Math.abs(Math.sin(gait)) * .13 * moving;
    out.pitch = Math.sin(gait) * .07 * moving;
    out.roll = 0;
    out.crouch = .08 + .12 * moving;
    out.tuck = out.strike = out.jaw = 0;
    const state = attack && phaseOf(attack);
    if (!state) return;
    const { phase, t } = state;
    const leap = attack!.kind === ATTACK_LEAP;
    if (phase === 'windup') {
      out.crouch = mix(out.crouch, leap ? 1 : .45, ease(t));
      out.strike = (leap ? .35 : .95) * ease(t);
      out.jaw = .6 * t;
      out.pitch = leap ? -.1 * ease(t) : .14 * ease(t);
    } else if (phase === 'flight') {
      out.crouch = 0;
      out.tuck = Math.sin(Math.PI * Math.min(1, t * 1.2));
      out.strike = mix(.85, .2, t);
      out.jaw = .8;
      out.pitch = mix(.18, -.2, t);
      out.lift = leapElevation(ENEMY_TRAITS[JAEGER_TYPE].leap!, attack!.elapsed);
    } else if (phase === 'active') {
      out.crouch = leap ? .35 : .2;
      out.strike = -.45;
      out.jaw = 1;
      out.pitch = -.16;
    } else {
      const back = ease(t);
      out.crouch = mix(leap ? .35 : .2, out.crouch, back);
      out.strike = mix(-.45, 0, back);
      out.jaw = 1 - back;
      out.pitch = mix(-.16, out.pitch, back);
    }
  },
};

/** Durchbruchskäfer: heavy diagonal gait with a rolling sway; the attack rears up and slams both forelimbs down. */
export const BREACHER_VISUAL: CasteVisual = {
  type: BREACHER_TYPE,
  geometry: breacherGeometry,
  gait: { stride: .26, lift: .14, drop: .2, cycle: 2.1 },
  bounds: 2.5,
  shadow: [3.2, 3.5],
  pose(out, moving, gait, attack) {
    out.lift = Math.abs(Math.cos(gait)) * .035 * moving;
    out.pitch = 0;
    out.roll = Math.sin(gait) * .045 * moving;
    out.crouch = .04;
    out.tuck = out.strike = out.jaw = 0;
    const state = attack && phaseOf(attack);
    if (!state) return;
    const { phase, t } = state;
    if (phase === 'windup') {
      const up = ease(t);
      out.pitch = .2 * up;
      out.lift += .12 * up;
      out.strike = 1.05 * up;
      out.jaw = .7 * up;
      out.crouch = .04 + .1 * up;
    } else if (phase === 'active') {
      out.pitch = mix(.2, -.12, ease(t * 1.6));
      out.strike = mix(1.05, -.3, ease(t * 1.4));
      out.jaw = 1;
      out.crouch = .22;
    } else if (phase === 'recovery') {
      const back = ease(t);
      out.pitch = mix(-.12, 0, back);
      out.strike = mix(-.3, 0, back);
      out.jaw = 1 - back;
      out.crouch = mix(.22, .04, back);
    }
  },
};

/** Living gait clock per enemy id: integrates the cycle phase from the distance actually covered. */
interface GaitClock { phase: number; seen: number }

function warriorMaterial(caste: CasteVisual): { material: T.MeshStandardMaterial; pulse: { value: number } } {
  const pulse = { value: 0 };
  const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: .86, metalness: .05 });
  const { stride, lift, drop } = caste.gait;
  material.customProgramCacheKey = () => 'swarm-warrior-v1-' + caste.type;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.warriorClock = pulse;
    applySurface(shader);
    applyWarriorSurface(shader);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      attribute vec4 limb;
      attribute vec3 pivot;
      // motion: gait phase (rad), stride 0…1, per-instance clock offset, dead (1 for fallen bodies without the attribute).
      attribute vec4 motion;
      // action: crouch 0…1, airborne tuck 0…1, limb strike angle (rad, + raises), jaw 0…1.
      attribute vec4 action;
      uniform float warriorClock;
      float warriorAngle() {
        if (abs(limb.x - ${ROLE.arm.toFixed(1)}) < .5) return action.z;
        if (abs(limb.x - ${ROLE.jaw.toFixed(1)}) < .5) return -.55 * action.w - .25 * motion.w;
        return 0.0;
      }
      vec3 warriorRotate(vec3 v, float a) {
        float c = cos(a), s = sin(a);
        return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
      }
    `).replace('#include <beginnormal_vertex>', `
      #include <beginnormal_vertex>
      objectNormal = warriorRotate(objectNormal, warriorAngle());
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      {
        float role = limb.x, weight = limb.z, side = limb.w;
        bool limbPart = abs(role - ${ROLE.leg.toFixed(1)}) < .5 || abs(role - ${ROLE.arm.toFixed(1)}) < .5;
        float dead = motion.w;
        // Rigid swing of forelimbs and jaw about their root joint.
        transformed = pivot + warriorRotate(transformed - pivot, warriorAngle());
        if (limbPart) {
          // Airborne tuck, and the curled legs of a fallen body.
          float tuck = max(action.y, dead * .55);
          transformed = pivot + (transformed - pivot) * (1.0 - .42 * tuck * weight) + vec3(0.0, .12 * tuck * weight, 0.0);
          // Gait: swing along the body and lift in the swing phase.
          float phase = motion.x + limb.y;
          transformed.z += sin(phase) * ${stride.toFixed(3)} * weight * motion.y;
          transformed.y += max(0.0, -cos(phase)) * ${lift.toFixed(3)} * weight * weight * motion.y;
          // Crouch: the hips sink with the body, the feet stay planted and the knees splay.
          float sink = action.x * ${drop.toFixed(3)};
          transformed.y -= sink * (1.0 - weight);
          transformed.x += side * sink * .55 * sin(3.14159 * weight);
        } else {
          transformed.y -= action.x * ${drop.toFixed(3)};
        }
        if (abs(role - ${ROLE.tail.toFixed(1)}) < .5 && transformed.z > pivot.z && dead < .5) {
          float tail = clamp((transformed.z - pivot.z) / 1.3, 0.0, 1.0);
          transformed.x += sin(warriorClock * 2.1 + motion.z - tail * 2.2) * .07 * tail * tail;
        }
        vWarriorPulse = (1.0 - dead) * pow(.5 + .5 * sin(warriorClock * 4.4 + motion.z), 3.0);
      }
    `);
  };
  return { material, pulse };
}

/**
 * Instanced renderer of one warrior caste in three detail tiers. Positions and yaw come from the replicated horde
 * frames like the Schabe; locomotion and attacks are animated in the vertex shader from two instance attributes.
 */
export class WarriorVisualLOD {
  readonly caste: CasteVisual;
  readonly material: T.MeshStandardMaterial;
  /** Static copy for fallen bodies: no instance attributes, so the shader curls the legs (motion.w = 1). */
  readonly fallenGeometry: T.BufferGeometry;
  private readonly clock: { value: number };
  private readonly meshes: T.InstancedMesh[];
  private readonly motions: T.InstancedBufferAttribute[] = [];
  private readonly actions: T.InstancedBufferAttribute[] = [];
  private readonly gaits = new Map<number, GaitClock>();
  private readonly reactions = new Map<number, number>();
  private readonly eliminated = new Map<number, number>();
  private readonly transform = new T.Object3D();
  private readonly frustum = new T.Frustum();
  private readonly viewProjection = new T.Matrix4();
  private readonly sphere = new T.Sphere(new T.Vector3(), 2);
  private readonly tint = new T.Color();
  private readonly pose: WarriorPose = { lift: 0, pitch: 0, roll: 0, crouch: 0, tuck: 0, strike: 0, jaw: 0 };
  private readonly attack: AttackSample = { kind: 0, timing: ENEMY_TRAITS[0].melee, elapsed: 0 };
  private lastNow = 0;
  visible = 0;

  constructor(scene: T.Scene, caste: CasteVisual) {
    this.caste = caste;
    const { material, pulse } = warriorMaterial(caste);
    this.material = material;
    this.clock = pulse;
    this.sphere.radius = caste.bounds;
    this.fallenGeometry = caste.geometry(1);
    this.meshes = ([0, 1, 2] as const).map((tier) => {
      const geometry = caste.geometry(tier);
      const motion = new T.InstancedBufferAttribute(new Float32Array(MAX_ENEMIES * 4), 4).setUsage(T.DynamicDrawUsage);
      const action = new T.InstancedBufferAttribute(new Float32Array(MAX_ENEMIES * 4), 4).setUsage(T.DynamicDrawUsage);
      geometry.setAttribute('motion', motion);
      geometry.setAttribute('action', action);
      this.motions.push(motion);
      this.actions.push(action);
      const mesh = new T.InstancedMesh(geometry, material, MAX_ENEMIES);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.setColorAt(0, this.tint.setScalar(1));
      mesh.instanceColor!.setUsage(T.DynamicDrawUsage);
      mesh.castShadow = tier === 0;
      scene.add(mesh);
      return mesh;
    });
  }

  clear(): void {
    this.gaits.clear();
    this.reactions.clear();
    this.eliminated.clear();
  }

  /** Hit flash on a survivor, or hide a killed one until the authoritative despawn arrives. */
  hit(id: number, now: number, killed: boolean): void {
    if (killed) this.eliminated.set(id, now + 800);
    else this.reactions.set(id, now + 150);
  }

  /** Attack state of frame entry `index` on the render clock (same frame choice as the Schabe pose). */
  private sampleAttack(a: HordeFrame, i: number, b: HordeFrame, next: number | undefined, tick: number): AttackSample | undefined {
    const age = a.attackAge[i];
    let frame = a, index = i;
    let start = age ? a.tick - age + 1 : Infinity;
    if (next !== undefined && b.attackAge[next]) {
      const nextStart = b.tick - b.attackAge[next] + 1;
      if (nextStart <= tick && (age ? nextStart >= start : nextStart >= a.tick)) {
        frame = b;
        index = next;
        start = nextStart;
      }
    }
    if (start === Infinity) return;
    this.attack.kind = frame.attackKind[index];
    this.attack.timing = enemyAttackTiming(this.caste.type, this.attack.kind);
    this.attack.elapsed = tick - start;
    return this.attack.elapsed >= 0 && this.attack.elapsed < attackDuration(this.attack.timing) ? this.attack : undefined;
  }

  draw(camera: T.Camera, a: HordeFrame | undefined, b: HordeFrame | undefined, alpha: number, now: number,
    quality: GraphicsQuality, shadows: ContactShadows, world?: WorldDefinition): void {
    for (const [id, until] of this.reactions) if (until < now) this.reactions.delete(id);
    for (const [id, until] of this.eliminated) if (until < now) this.eliminated.delete(id);
    for (const mesh of this.meshes) mesh.count = 0;
    const dt = Math.min(.1, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    this.clock.value = now / 1000;
    let visible = 0;
    if (a && b) {
      this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.viewProjection);
      const near = quality.enemyNear ** 2, far = quality.enemyFar ** 2, shadow = quality.enemyShadowDistance ** 2;
      const tick = a.tick + (b.tick - a.tick) * alpha;
      const ticks = Math.max(1, b.tick - a.tick);
      const { cycle } = this.caste.gait;
      for (let i = 0; i < a.count; i++) {
        if (a.type[i] !== this.caste.type) continue;
        const id = a.id[i];
        if (this.eliminated.has(id)) continue;
        const next = b.byId.get(id);
        const x = next === undefined ? a.x[i] : a.x[i] + (b.x[next] - a.x[i]) * alpha;
        const z = next === undefined ? a.z[i] : a.z[i] + (b.z[next] - a.z[i]) * alpha;
        const ground = groundHeight(world, x, z);
        this.sphere.center.set(x, ground + 1, z);
        if (!this.frustum.intersectsSphere(this.sphere)) continue;
        const dx = x - camera.position.x, dz = z - camera.position.z;
        const distance = dx * dx + dz * dz;
        const tier = distance < near ? 0 : distance < far ? 1 : 2;
        const mesh = this.meshes[tier];
        // Ground speed from the two frames drives the gait clock.
        const speed = next === undefined ? 0 : Math.hypot(b.x[next] - a.x[i], b.z[next] - a.z[i]) * 30 / ticks;
        let clock = this.gaits.get(id);
        if (!clock) this.gaits.set(id, clock = { phase: id * 2.399, seen: now });
        clock.phase += dt * speed / cycle * Math.PI * 2;
        clock.seen = now;
        const moving = Math.min(1, speed / 2.2);
        const attack = tier < 2 ? this.sampleAttack(a, i, b, next, tick) : undefined;
        this.caste.pose(this.pose, moving, clock.phase, attack);
        const reaction = Math.max(0, (this.reactions.get(id) ?? 0) - now) / 150;
        const yaw = -(next === undefined ? a.yaw[i] : lerpAngle(a.yaw[i], b.yaw[next], alpha));
        this.transform.position.set(x, ground + this.pose.lift, z);
        this.transform.rotation.set(this.pose.pitch - reaction * .12, yaw, this.pose.roll);
        this.transform.updateMatrix();
        const slot = mesh.count;
        mesh.setMatrixAt(slot, this.transform.matrix);
        this.motions[tier].setXYZW(slot, clock.phase, tier < 2 ? moving : 0, id * 1.37, 0);
        this.actions[tier].setXYZW(slot, this.pose.crouch, this.pose.tuck, this.pose.strike, this.pose.jaw);
        const variation = .84 + (id % 9) * .02;
        mesh.setColorAt(mesh.count++, this.tint.setRGB(variation + reaction, variation + reaction * .38, variation));
        if (distance < shadow) shadows.add(x, z, yaw, this.caste.shadow[0], this.caste.shadow[1]);
        visible++;
      }
    }
    for (const [id, clock] of this.gaits) if (now - clock.seen > 4000) this.gaits.delete(id);
    this.visible = visible;
    for (const [tier, mesh] of this.meshes.entries()) {
      if (!mesh.count) continue;
      for (const attribute of [this.motions[tier], this.actions[tier]]) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, mesh.count * 4);
        attribute.needsUpdate = true;
      }
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.clearUpdateRanges();
      mesh.instanceColor!.addUpdateRange(0, mesh.count * 3);
      mesh.instanceColor!.needsUpdate = true;
    }
  }
}

export type { EnemyPose };
