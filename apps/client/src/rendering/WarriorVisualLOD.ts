import * as T from 'three';
import {
  ASSAULT_BREAKER_TYPE, ATTACK_CHARGE, ATTACK_LEAP, BREACHER_TYPE, ENEMY_TRAITS, JAEGER_TYPE, MAX_ENEMIES, attackDuration, attackStrikeAt, enemyAttackTiming, groundHeight,
  leapElevation, lerpAngle,
} from '@freefall/shared';
import type { EnemyAttackTiming, HordeFrame, WorldDefinition } from '@freefall/shared';
import { applySurface } from './AgentMeshes.ts';
import { ASSAULT_HEAD_PIVOT, assaultBreakerGeometry } from './AssaultBreakerModel.ts';
import { ASSAULT_RIG_GLSL, assaultBreakerPose, assaultCycle } from './AssaultBreakerRig.ts';
import { attackPhase } from './WarriorAttack.ts';
import type { AttackSample } from './WarriorAttack.ts';
import { breacherGeometry } from './BreacherModel.ts';
import type { ContactShadows } from './ContactShadows.ts';
import type { EnemyPose } from './EnemyVisualLOD.ts';
import type { GraphicsQuality } from './GraphicsQuality.ts';
import { jaegerGeometry } from './JaegerModel.ts';
import { applyWarriorSurface } from './WarriorSurface.ts';
import type { WarriorSurfaceOptions } from './WarriorSurface.ts';
import { ROLE } from './WarriorKit.ts';
import type { Vec3 } from './SwarmOrganism.ts';

/**
 * Instance pose: body offset and tilt plus the shader controls (crouch, tuck, limb strike angle, jaw). Castes with a
 * `head` rig swing their head (and jaw) by `strike` instead of forelimbs.
 */
export interface WarriorPose {
  lift: number;
  pitch: number;
  roll: number;
  crouch: number;
  tuck: number;
  strike: number;
  jaw: number;
  /** Rigged castes only (see `CasteVisual.rig`): forward lunge (m), head yaw (rad), gallop blend, skid brace, tail raise
   * (rad) and forefoot scrape progress (0 none … 1). */
  surge?: number;
  headYaw?: number;
  gallop?: number;
  brace?: number;
  tail?: number;
  paw?: number;
}

export type { AttackSample };

/** What a pose may read besides the gait: smoothed ground speed (m/s), render time (s) and a per-enemy seed. */
export interface PoseContext {
  speed: number;
  time: number;
  seed: number;
}

export interface CasteVisual {
  readonly type: number;
  readonly geometry: (tier: 0 | 1 | 2) => T.BufferGeometry;
  /** Leg swing (m), foot lift (m), body drop at full crouch (m), metres covered per gait cycle. */
  readonly gait: { readonly stride: number; readonly lift: number; readonly drop: number; readonly cycle: number };
  readonly bounds: number;
  readonly shadow: readonly [number, number];
  /** Rigid head: vertices with ROLE.head (and the jaw) pitch about this joint by the pose's `strike` angle. */
  readonly head?: { readonly pivot: Vec3 };
  /** Detail tier distances scale with the body: a giant keeps its near tier further out. Default 1. */
  readonly lodScale?: number;
  /** Surface options of the shared warrior finish (e.g. a scale pattern). */
  readonly surface?: WarriorSurfaceOptions;
  /**
   * Model-space rig: GLSL declaring `abPose(inout vec3 p, inout vec3 n, float breath)`. Its instances carry only position
   * and yaw in the instance matrix; lift, pitch and roll go to the `body` attribute so the rig can keep feet planted.
   */
  readonly rig?: { readonly vertex: string };
  /** Metres per gait cycle at a ground speed (default `gait.cycle`). */
  readonly cycleAt?: (speed: number) => number;
  /** Turning on the spot steps the legs as if walking this radius (rigged castes). */
  readonly turnRadius?: number;
  pose(out: WarriorPose, moving: number, gaitPhase: number, attack: AttackSample | undefined, context: PoseContext): void;
}

const ease = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const phaseOf = attackPhase;

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

/**
 * Assaultbreaker: model-space rig with planted feet (see AssaultBreakerRig.ts): a heavy lateral-sequence walk that
 * becomes a rotary gallop in the charge, the charge windup (roar, forefoot scrape, coil), the skidding head toss and
 * the hooking gore.
 */
export const ASSAULT_BREAKER_VISUAL: CasteVisual = {
  type: ASSAULT_BREAKER_TYPE,
  geometry: assaultBreakerGeometry,
  gait: { stride: 0, lift: 0, drop: .36, cycle: 3.2 },
  bounds: 4,
  shadow: [3.8, 6.4],
  head: { pivot: ASSAULT_HEAD_PIVOT },
  lodScale: 1.8,
  surface: { scales: 12 },
  rig: { vertex: ASSAULT_RIG_GLSL },
  cycleAt: assaultCycle,
  turnRadius: 1.8,
  pose: assaultBreakerPose,
};

/**
 * Living gait clock per enemy id: integrates the cycle phase from the distance actually covered. Rigged castes also
 * smooth the ground speed (gait blends) and remember the yaw (stepping while turning on the spot).
 */
interface GaitClock { phase: number; seen: number; speed: number; yaw: number }

/**
 * Material of a rigged caste: the rig deforms position and normal in model space (`abPose`); the depth material
 * (shadow casting) runs the same deformation so shadows follow the animation.
 */
function riggedMaterial(caste: CasteVisual, rig: { readonly vertex: string }, pulse: { value: number }):
  { material: T.MeshStandardMaterial; depth: T.MeshDepthMaterial } {
  const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: .86, metalness: .05 });
  material.customProgramCacheKey = () => 'swarm-warrior-rig-v1-' + caste.type;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.warriorClock = pulse;
    applySurface(shader);
    applyWarriorSurface(shader, caste.surface);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
${rig.vertex}
      varying vec3 vWarriorTint;`).replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      vec3 warriorPosed = position;
      abPose(warriorPosed, objectNormal, tissue.x);`).replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed = warriorPosed;
      vWarriorPulse = (1.0 - motion.w) * pow(.5 + .5 * sin(warriorClock * 4.4 + motion.z), 3.0);
      {
        // Per-enemy shade (id % 9 from the clock offset) and the hit flash, instead of an instance colour.
        float variation = .84 + mod(floor(motion.z / 1.37 + .5), 9.0) * .02;
        vWarriorTint = mix(vec3(variation + action.x, variation + action.x * .38, variation), vec3(1.0), motion.w);
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWarriorTint;`).replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= vWarriorTint;`);
  };
  const depth = new T.MeshDepthMaterial();
  depth.customProgramCacheKey = () => 'swarm-warrior-rig-depth-v1-' + caste.type;
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.warriorClock = pulse;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 tissue;
${rig.vertex}`).replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 warriorNormal = vec3(0.0, 1.0, 0.0);
        abPose(transformed, warriorNormal, tissue.x);
      }`);
  };
  return { material, depth };
}

function warriorMaterial(caste: CasteVisual): { material: T.MeshStandardMaterial; pulse: { value: number }; depth?: T.MeshDepthMaterial } {
  const pulse = { value: 0 };
  if (caste.rig) return { ...riggedMaterial(caste, caste.rig, pulse), pulse };
  const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: .86, metalness: .05 });
  const { stride, lift, drop } = caste.gait;
  const head = caste.head?.pivot.map((v) => v.toFixed(3)).join(', ');
  material.customProgramCacheKey = () => 'swarm-warrior-v1-' + caste.type;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.warriorClock = pulse;
    applySurface(shader);
    applyWarriorSurface(shader, caste.surface);
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
        ${head ? `if (abs(limb.x - ${ROLE.head.toFixed(1)}) < .5) return action.z - .12 * motion.w;` : ''}
        return 0.0;
      }
      vec3 warriorRotate(vec3 v, float a) {
        float c = cos(a), s = sin(a);
        return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
      }
    `).replace('#include <beginnormal_vertex>', `
      #include <beginnormal_vertex>
      objectNormal = warriorRotate(objectNormal, warriorAngle());
      ${head ? `if (abs(limb.x - ${ROLE.jaw.toFixed(1)}) < .5) objectNormal = warriorRotate(objectNormal, action.z - .12 * motion.w);` : ''}
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      {
        float role = limb.x, weight = limb.z, side = limb.w;
        bool limbPart = abs(role - ${ROLE.leg.toFixed(1)}) < .5 || abs(role - ${ROLE.arm.toFixed(1)}) < .5;
        float dead = motion.w;
        // Rigid swing of forelimbs and jaw about their root joint.
        transformed = pivot + warriorRotate(transformed - pivot, warriorAngle());
        ${head ? `// The jaw hangs from the head and follows its swing.
        if (abs(role - ${ROLE.jaw.toFixed(1)}) < .5) {
          vec3 headPivot = vec3(${head});
          transformed = headPivot + warriorRotate(transformed - headPivot, action.z - .12 * motion.w);
        }` : ''}
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
  /** Rigged castes: body (pitch, roll, heave, surge) and gait (gallop, brace, tail raise, head yaw) per instance. */
  private readonly bodies: T.InstancedBufferAttribute[] = [];
  private readonly strides: T.InstancedBufferAttribute[] = [];
  private readonly gaits = new Map<number, GaitClock>();
  private readonly reactions = new Map<number, number>();
  private readonly eliminated = new Map<number, number>();
  private readonly transform = new T.Object3D();
  private readonly frustum = new T.Frustum();
  private readonly viewProjection = new T.Matrix4();
  private readonly sphere = new T.Sphere(new T.Vector3(), 2);
  private readonly tint = new T.Color();
  private readonly pose: WarriorPose = { lift: 0, pitch: 0, roll: 0, crouch: 0, tuck: 0, strike: 0, jaw: 0 };
  private readonly context: PoseContext = { speed: 0, time: 0, seed: 0 };
  private readonly attack: AttackSample = { kind: 0, timing: ENEMY_TRAITS[0].melee, elapsed: 0 };
  private lastNow = 0;
  visible = 0;

  constructor(scene: T.Scene, caste: CasteVisual) {
    this.caste = caste;
    const { material, pulse, depth } = warriorMaterial(caste);
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
      if (caste.rig) {
        const body = new T.InstancedBufferAttribute(new Float32Array(MAX_ENEMIES * 4), 4).setUsage(T.DynamicDrawUsage);
        const stride = new T.InstancedBufferAttribute(new Float32Array(MAX_ENEMIES * 4), 4).setUsage(T.DynamicDrawUsage);
        geometry.setAttribute('body', body);
        geometry.setAttribute('gait', stride);
        this.bodies.push(body);
        this.strides.push(stride);
      }
      const mesh = new T.InstancedMesh(geometry, material, MAX_ENEMIES);
      if (depth) mesh.customDepthMaterial = depth;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      // Rigged castes tint in the shader (one vertex attribute less).
      if (!caste.rig) {
        mesh.setColorAt(0, this.tint.setScalar(1));
        mesh.instanceColor!.setUsage(T.DynamicDrawUsage);
      }
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
      const scale = (this.caste.lodScale ?? 1) ** 2;
      const near = quality.enemyNear ** 2 * scale, far = quality.enemyFar ** 2 * scale, shadow = quality.enemyShadowDistance ** 2 * scale;
      const tick = a.tick + (b.tick - a.tick) * alpha;
      const ticks = Math.max(1, b.tick - a.tick);
      const { cycle } = this.caste.gait;
      const rigged = !!this.caste.rig;
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
        const yaw = -(next === undefined ? a.yaw[i] : lerpAngle(a.yaw[i], b.yaw[next], alpha));
        let clock = this.gaits.get(id);
        if (!clock) this.gaits.set(id, clock = { phase: id * 2.399, seen: now, speed, yaw });
        let pace = speed;
        if (rigged) {
          // Smoothed speed blends the gaits; turning on the spot steps the legs.
          clock.speed += (speed - clock.speed) * (1 - Math.exp(-dt / .2));
          const turn = dt > 0 ? Math.abs(Math.atan2(Math.sin(yaw - clock.yaw), Math.cos(yaw - clock.yaw))) / dt : 0;
          pace = Math.max(clock.speed, Math.min(2.4, turn * (this.caste.turnRadius ?? 0)));
        }
        clock.yaw = yaw;
        clock.phase += dt * pace / (this.caste.cycleAt?.(clock.speed) ?? cycle) * Math.PI * 2;
        clock.seen = now;
        const moving = Math.min(1, pace / 2.2);
        const attack = tier < 2 ? this.sampleAttack(a, i, b, next, tick) : undefined;
        this.context.speed = rigged ? clock.speed : speed;
        this.context.time = now / 1000;
        this.context.seed = id * 1.37;
        this.caste.pose(this.pose, moving, clock.phase, attack, this.context);
        const reaction = Math.max(0, (this.reactions.get(id) ?? 0) - now) / 150;
        const pose = this.pose;
        // Yaw first, then pitch about the body's own lateral axis, then roll.
        this.transform.rotation.order = 'YXZ';
        if (rigged) {
          this.transform.position.set(x, ground, z);
          this.transform.rotation.set(0, yaw, 0);
        } else {
          this.transform.position.set(x, ground + pose.lift, z);
          this.transform.rotation.set(pose.pitch - reaction * .12, yaw, pose.roll);
        }
        this.transform.updateMatrix();
        const slot = mesh.count;
        mesh.setMatrixAt(slot, this.transform.matrix);
        this.motions[tier].setXYZW(slot, clock.phase, tier < 2 || rigged ? moving : 0, id * 1.37, 0);
        if (rigged) {
          this.actions[tier].setXYZW(slot, reaction, pose.paw ?? 0, pose.strike, pose.jaw);
          this.bodies[tier].setXYZW(slot, pose.pitch - reaction * .05, pose.roll, pose.lift - pose.crouch * this.caste.gait.drop, pose.surge ?? 0);
          this.strides[tier].setXYZW(slot, pose.gallop ?? 0, pose.brace ?? 0, pose.tail ?? 0, pose.headYaw ?? 0);
          mesh.count++;
        } else {
          this.actions[tier].setXYZW(slot, pose.crouch, pose.tuck, pose.strike, pose.jaw);
          const variation = .84 + (id % 9) * .02;
          mesh.setColorAt(mesh.count++, this.tint.setRGB(variation + reaction, variation + reaction * .38, variation));
        }
        if (distance < shadow) shadows.add(x, z, yaw, this.caste.shadow[0], this.caste.shadow[1]);
        visible++;
      }
    }
    for (const [id, clock] of this.gaits) if (now - clock.seen > 4000) this.gaits.delete(id);
    this.visible = visible;
    for (const [tier, mesh] of this.meshes.entries()) {
      if (!mesh.count) continue;
      for (const attribute of [this.motions[tier], this.actions[tier], ...(this.caste.rig ? [this.bodies[tier], this.strides[tier]] : [])]) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, mesh.count * 4);
        attribute.needsUpdate = true;
      }
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, mesh.count * 3);
        mesh.instanceColor.needsUpdate = true;
      }
    }
  }
}

export type { EnemyPose };
