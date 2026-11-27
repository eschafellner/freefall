import * as T from 'three';
import type { EquipmentAnchors, EquipmentSlot } from '../../AssetRegistry.ts';
import type { CharacterAnimation } from '../CharacterAnimation.ts';
import type { WeaponVisualController } from '../../weapons/WeaponVisualController.ts';
import { BIND, BODY, FOREARM, OPERATOR_BONES, SHIN, THIGH, UPPER_ARM, boneOf, createOperatorSkeleton } from './OperatorSkeleton.ts';
import type { OperatorBone, Side } from './OperatorSkeleton.ts';
import type { Channel, CompiledLook, OperatorLook, OperatorWardrobe } from './Wardrobe.ts';
import { GRIP_POINT } from './kit/Parts.ts';
import { aimBone, hinge, localOf, solveTwoBone } from './Limb.ts';
import { Spring, wobble } from './Springs.ts';

const smooth = T.MathUtils.smoothstep;
const clamp = T.MathUtils.clamp;
const lerp = T.MathUtils.lerp;
const TAU = Math.PI * 2;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const UP = new T.Vector3(0, 1, 0);
const NEG_Y = new T.Vector3(0, -1, 0);
const X_AXIS = new T.Vector3(1, 0, 0);
const Y_AXIS = new T.Vector3(0, 1, 0);

/** Hips height of the relaxed stance (knees soft, not locked). */
const STAND = .935;
const WEIGHT = { leicht: -.5, mittel: 0, schwer: .6, ueberschwer: 1 } as const;
/** The weapon frame: the old torso origin, so weapon poses keep their tuned offsets. Child of UpperChest. */
const TORSO_FRAME: readonly [number, number, number] = [0, 1.108 - BIND.UpperChest.at[1], -BIND.UpperChest.at[2]];
/** Hand orientation on the weapon (weapon space): fist axis along the raked pistol grip / along the barrel. */
const RIGHT_ON_GRIP = new T.Quaternion().setFromEuler(new T.Euler(Math.PI / 2 - .32, .06, 0));
const LEFT_ON_FOREND = new T.Quaternion().setFromEuler(new T.Euler(0, 0, Math.PI / 2 - .35));
/** Fist centre relative to the weapon sockets (weapon space). */
const GRIP_OFFSET = new T.Vector3(0, -.016, .014);
const FOREND_OFFSET = new T.Vector3(.014, .004, 0);
const SPINE = [['Spine', .36], ['Chest', .34 / .64], ['UpperChest', 1]] as const;
/** Ankle above the sole; heel and ball contact points under the foot bone. */
const HEEL = new T.Vector3(0, -BODY.ankle, .062);
const BALL = new T.Vector3(0, -BODY.ankle, -.118);

interface Foot {
  /** World position of the planted ankle while standing (procedural stepping). */
  planted: T.Vector3;
  plantedYaw: number;
  from: T.Vector3;
  fromYaw: number;
  /** −1 planted, 0..1 while stepping. */
  step: number;
  valid: boolean;
}

/**
 * The operator's skeleton, skinned look and procedural motion.
 *
 * Gameplay owns the position; this class only poses bones relative to the rendered root. Layers, in order:
 * pelvis (gait bob, sway, counter-rotation, idle weight shift), spine (lean, aim pitch, breathing, spring reactions),
 * head (stabilised look), weapon (tuned offsets plus inertia springs), arms (clavicle + two-bone IK onto the weapon
 * sockets), legs (planted stance track with heel strike and toe-off, swing arc, idle stepping), helper bones
 * (pauldrons, tassets, backpack bounce).
 */
export class OperatorRig {
  readonly root = new T.Group();
  /** Weapon frame (child of UpperChest). Weapons and the sidearm mount here. */
  readonly torso = new T.Group();
  readonly bones: Record<OperatorBone, T.Bone>;
  readonly skeleton: T.Skeleton;
  anchors!: EquipmentAnchors;
  private compiledLook?: CompiledLook;
  private readonly meshes: Partial<Record<Channel, T.SkinnedMesh>> = {};
  private markers: T.Mesh[] = [];
  private readonly injector: T.Mesh;
  private readonly frag: T.Mesh;
  private readonly teamMaterial: T.MeshStandardMaterial;
  private readonly wardrobe: OperatorWardrobe;
  private readonly weaponRoot: T.Object3D;
  private readonly seed: number;
  /** Rig-space transforms of the bones posed so far this frame. */
  private readonly rq = {} as Record<OperatorBone, T.Quaternion>;
  private readonly rp = {} as Record<OperatorBone, T.Vector3>;
  private time = 0;
  private readonly spring = {
    gunX: new Spring(), gunY: new Spring(), gunZ: new Spring(), gunPitch: new Spring(), gunYaw: new Spring(),
    pitch: new Spring(), yaw: new Spring(), roll: new Spring(), headYaw: new Spring(),
    pack: new Spring(), packRoll: new Spring(),
  };
  private readonly feet: Foot[] = [0, 1].map(() => ({
    planted: new T.Vector3(), plantedYaw: 0, from: new T.Vector3(), fromYaw: 0, step: -1, valid: false,
  }));
  private lastFlinch = 0;
  private steer = 0;
  /** Weight of the worn armour: −0.5 light … 1 over-heavy (step depth, stance, jolts). */
  private heavy = 0;
  private fatigue = 0;
  private fatigueTarget = 0;
  private breathPhase = 0;
  private lastLoad = [0, 0];
  private hitSide = 1;
  private readonly deathSide: number;
  // Scratch.
  private readonly v1 = new T.Vector3();
  private readonly v2 = new T.Vector3();
  private readonly v3 = new T.Vector3();
  private readonly pole = new T.Vector3();
  private readonly joint = new T.Vector3();
  private readonly end = new T.Vector3();
  private readonly target = new T.Vector3();
  private readonly aimPoint = new T.Vector3();
  private readonly barrel = new T.Vector3();
  private readonly q1 = new T.Quaternion();
  private readonly q2 = new T.Quaternion();
  private readonly qBase = new T.Quaternion();
  private readonly qUpper = new T.Quaternion();
  private readonly qHand = new T.Quaternion();
  private readonly euler = new T.Euler();
  private readonly look = new T.Matrix4();
  private readonly torsoRig = new T.Matrix4();
  private readonly torsoWorld = new T.Matrix4();
  private readonly torsoWorldInverse = new T.Matrix4();
  private readonly rootInverse = new T.Matrix4();
  private readonly ankles = [new T.Vector3(), new T.Vector3()];
  private readonly footYaw = [0, 0];
  private readonly footPitch = [0, 0];
  private readonly toeBend = [0, 0];
  private readonly load = [0, 0];
  private readonly travel = [0, 0];

  constructor(wardrobe: OperatorWardrobe, team: number, weapon: WeaponVisualController, look: OperatorLook) {
    this.wardrobe = wardrobe;
    this.weaponRoot = weapon.root;
    this.teamMaterial = new T.MeshStandardMaterial({ color: team, roughness: .72 });
    this.seed = ((team * 2654435761) >>> 0) / 4294967296 * 100;
    this.deathSide = Math.sin(this.seed * 13.1) < 0 ? -1 : 1;
    const { root, bones, skeleton } = createOperatorSkeleton();
    this.bones = bones;
    this.skeleton = skeleton;
    this.root.name = 'OperatorRig';
    this.root.add(root);
    for (const name of OPERATOR_BONES) {
      this.rq[name] = new T.Quaternion();
      this.rp[name] = new T.Vector3();
    }
    this.torso.name = 'WeaponFrame';
    this.torso.position.set(...TORSO_FRAME);
    bones.UpperChest.add(this.torso);
    this.torso.add(weapon.root);
    this.injector = new T.Mesh(wardrobe.props.injector, wardrobe.materials.plate);
    this.frag = new T.Mesh(wardrobe.props.frag, wardrobe.materials.plate);
    this.injector.visible = this.frag.visible = false;
    // Held items sit in the support fist (hand space).
    this.injector.position.set(.022, -.088, -.02);
    this.injector.rotation.set(-1.2, 0, 0);
    this.frag.position.set(.03, -.095, 0);
    bones.LeftHand.add(this.injector, this.frag);
    this.dress(look);
  }

  get compiled(): CompiledLook | undefined { return this.compiledLook; }

  /** Puts on a look: swaps the skinned geometry, team markers and equipment anchors. */
  dress(look: OperatorLook): void {
    const compiled = this.wardrobe.look(look);
    if (compiled === this.compiledLook) return;
    this.compiledLook = compiled;
    this.heavy = WEIGHT[compiled.weight];
    for (const channel of ['cloth', 'plate'] as const) {
      const geometry = compiled.geometries[channel];
      let mesh = this.meshes[channel];
      if (!geometry) {
        mesh?.removeFromParent();
        delete this.meshes[channel];
        continue;
      }
      if (!mesh) {
        mesh = new T.SkinnedMesh(geometry, this.wardrobe.materials[channel]);
        mesh.name = 'Operator.' + channel;
        // Detached binding with an identity bind matrix: vertices come out in world space from the bones; the mesh's
        // own world matrix only carries a transport (Albatross lift, balloon line), set by PlayerRigBatches.
        mesh.bindMode = T.DetachedBindMode;
        mesh.bind(this.skeleton, new T.Matrix4());
        mesh.matrixAutoUpdate = false;
        mesh.matrixWorldAutoUpdate = false;
        mesh.frustumCulled = false;
        this.root.add(mesh);
        this.meshes[channel] = mesh;
      } else mesh.geometry = geometry;
    }
    for (const marker of this.markers) marker.removeFromParent();
    this.markers = compiled.markers.map(({ bone, position, facing, size }) => {
      const mesh = new T.Mesh(this.wardrobe.props.patch, this.teamMaterial);
      mesh.position.set(...position);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(...facing).normalize());
      mesh.scale.set(size[0] / .062, size[1] / .049, 1);
      this.bones[bone].add(mesh);
      return mesh;
    });
    const anchor = (slot: EquipmentSlot, bone: OperatorBone, position: readonly [number, number, number]) => {
      const custom = compiled.anchors[slot];
      return custom ? { parent: this.bones[custom.bone], position: custom.position } : { parent: this.bones[bone], position };
    };
    this.anchors = {
      Helmet: anchor('Helmet', 'Head', [0, .2, 0]),
      Torso: anchor('Torso', 'UpperChest', [0, -.01, -.18]),
      Arms: anchor('Arms', 'LeftUpperArm', [0, -.08, 0]),
      Legs: anchor('Legs', 'Hips', [0, -.16, 0]),
      Backpack: anchor('Backpack', 'Backpack', [0, .06, .15]),
      PrimaryWeapon: { parent: this.weaponRoot, position: [0, 0, 0] },
      SecondaryWeapon: anchor('SecondaryWeapon', 'Hips', [.205, -.13, .04]),
    };
  }

  /**
   * Stamina of the operator as sent by the server (thousandths of a point): exhaustion and a low pool make it pant.
   * The pool size differs per armour, so the cue uses absolute points (below 30 it starts).
   */
  setStamina(value: number, exhausted: boolean): void {
    this.fatigueTarget = exhausted ? 1 : clamp((30_000 - value) / 30_000, 0, 1) * .6;
  }

  /** Clears planted feet and springs (respawn, slot change). */
  resetMotion(): void {
    for (const foot of this.feet) {
      foot.valid = false;
      foot.step = -1;
    }
    for (const spring of Object.values(this.spring)) spring.reset();
    this.lastFlinch = 0;
    this.lastLoad = [0, 0];
  }

  private fk(bone: OperatorBone): void {
    const parent = BIND[bone].parent;
    const b = this.bones[bone];
    if (!parent) {
      this.rq[bone].copy(b.quaternion);
      this.rp[bone].copy(b.position);
      return;
    }
    this.rq[bone].multiplyQuaternions(this.rq[parent], b.quaternion);
    this.rp[bone].copy(b.position).applyQuaternion(this.rq[parent]).add(this.rp[parent]);
  }

  /** Sets a bone's rig-space rotation and updates its forward kinematics. */
  private orient(bone: OperatorBone, rig: T.Quaternion): void {
    const parent = BIND[bone].parent;
    if (parent) localOf(this.bones[bone].quaternion, this.rq[parent], rig);
    else this.bones[bone].quaternion.copy(rig);
    this.fk(bone);
  }

  pose(state: CharacterAnimation, weapon: WeaponVisualController, targetWorld: T.Vector3, pitch: number, dt: number,
    muzzleWorld?: T.Vector3): void {
    dt = clamp(dt, 0, .05);
    this.time += dt;
    const t = this.time + this.seed;
    const { aim, sprint, phase, kick, reload } = state;
    const tactical = state.tactical;
    const { slide, supine, tuck, lateral, landing } = tactical;
    const airborne = tactical.clip?.startsWith('dive') ?? false;
    const gait = airborne ? 0 : Math.min(1, state.speed / 5.8);
    const run = smooth(state.speed, 1.6, 4.4);
    // Death: knees buckle, then the body topples face down and goes limp.
    const buckle = smooth(state.fall, 0, .45);
    const topple = smooth(state.fall, .2, 1);
    const prone = Math.max(tactical.prone, topple);
    const crouch = Math.max(tactical.crouch, buckle * (1 - topple) * .9);
    const low = Math.min(1, prone + supine);
    const roll = tactical.roll + topple * .5 * this.deathSide;
    const handling = smooth(reload, 0, .19) * (1 - smooth(reload, .81, 1));
    const strike = state.melee;
    const upright = (1 - low) * (1 - slide);
    const rest = 1 - smooth(state.speed, .3, 1.5);
    const still = rest * upright * (airborne ? 0 : 1) * (1 - buckle);
    const kneel = crouch * rest * (1 - slide) * (1 - low);
    // Exhaustion: fast, deep breaths that heave chest, shoulders and head; the body slumps at rest.
    this.fatigue = T.MathUtils.damp(this.fatigue, this.fatigueTarget, 1.8, dt);
    const fatigue = this.fatigue * (1 - buckle);
    this.breathPhase += dt * (1.6 + 2.8 * fatigue);
    const breathe = Math.sin(this.breathPhase + this.seed);
    const gasp = breathe * fatigue;
    const heavy = this.heavy;
    const shift = wobble(t * .5, this.seed);
    const steady = 1 - .7 * aim;
    this.root.updateWorldMatrix(true, false);

    // ---- Legs: phase-locked gait cycle ------------------------------------------------------------------------
    const stanceFraction = state.stance;
    for (let i = 0; i < 2; i++) {
      const fraction = ((phase + i * Math.PI) / TAU) % 1;
      const planted = fraction < stanceFraction;
      const s = fraction / stanceFraction;
      const w = (fraction - stanceFraction) / (1 - stanceFraction);
      this.load[i] = planted ? Math.sin(Math.PI * s) : 0;
      this.travel[i] = planted ? 1 - 2 * s : -1 + 2 * smooth(w, 0, 1);
      // A foot strike jolts the weapon and backpack.
      if (this.load[i] > 0 && this.lastLoad[i] === 0 && gait > .05) {
        this.spring.gunY.kick(-.22 * gait * steady * (1 + .5 * heavy));
        this.spring.pack.kick(1.6 * gait * (1 + .6 * heavy));
        this.spring.packRoll.kick((i ? -1 : 1) * .5 * gait);
      }
      this.lastLoad[i] = this.load[i];
    }

    // ---- Pelvis ----------------------------------------------------------------------------------------------
    const [loadL, loadR] = this.load;
    const compress = loadL + loadR;
    // Heavier armour sinks deeper into each step and stands lower; light armour stays springy.
    const bob = gait * (run * (.014 - .046 * compress) + (1 - run) * (.016 * compress - .01)) * (1 + .35 * heavy);
    let hy = STAND - .012 * heavy * upright - gait * (.032 + .035 * state.sprint) + bob
      + still * (breathe * (.0018 + .006 * fatigue) - Math.abs(shift) * .01);
    let hx = gait * (loadR - loadL) * lerp(.028, .012, run) + still * shift * .026;
    let hz = .02 * crouch;
    hy = lerp(hy - lerp(.29, .4, kneel) * crouch, .31 + .08 * supine + .12 * tuck - .075 * landing, low);
    if (slide > .001) hy -= .15 * slide;
    hx += .18 * lateral;
    const forwardness = Math.abs(state.forward);
    const blade = (1 - gait) * upright * (1 - crouch * .5);
    const baseX = -.05 * gait - .05 * state.sprint + .12 * crouch - prone * 1.44 + supine * 1.44;
    const baseY = -.2 * blade + .3 * topple * this.deathSide;
    this.qBase.setFromEuler(this.euler.set(baseX, baseY, roll));
    // Hip steering: the pelvis and feet turn towards the direction of travel (diagonal and side runs, backpedal at an
    // angle); the spine turns the chest back to the aim.
    const travelAngle = Math.atan2(state.strafe, state.forward);
    const backward = Math.abs(travelAngle) > 1.75;
    const steer = -clamp((backward ? travelAngle - Math.PI * Math.sign(travelAngle) : travelAngle) * (backward ? .45 : .62), -.8, .8)
      * smooth(state.speed, .6, 2.2) * upright * (1 - crouch * .4) * (airborne ? 0 : 1);
    this.steer = steer;
    const wobbleYaw = gait * .12 * (this.travel[1] - this.travel[0]) * .5 * forwardness * upright + steer;
    const wobbleRoll = (gait * .055 * (loadR - loadL) * (1 - .4 * run) + still * shift * .03) * upright;
    const wobblePitch = -gait * .03 * compress * run * upright;
    const hips = this.bones.Hips;
    hips.position.set(hx, hy, hz);
    hips.quaternion.copy(this.qBase).multiply(this.q1.setFromEuler(this.euler.set(wobblePitch, wobbleYaw, wobbleRoll)));
    this.fk('Hips');

    // ---- Upper body ------------------------------------------------------------------------------------------
    // Reactions: a hit throws the chest back and twists it; acceleration leans into the move and overshoots on stops.
    if (state.flinch > this.lastFlinch + .2) {
      this.hitSide = -this.hitSide;
      this.spring.pitch.kick(2.6);
      this.spring.yaw.kick(2.2 * this.hitSide);
      this.spring.roll.kick(1.2 * this.hitSide);
    }
    this.lastFlinch = state.flinch;
    const lean = this.spring.pitch.step(-clamp(state.accelForward, -30, 30) * .0045 * upright, 2.2, .55, dt);
    const twist = this.spring.yaw.step(-state.turn * .16 * upright, 2.4, .6, dt);
    const sway = this.spring.roll.step(clamp(state.accelStrafe, -30, 30) * .003 * upright, 2.2, .6, dt);
    const bodyPitch = -.04 - .13 * gait * run - .12 * state.sprint - .03 * heavy * gait - .12 * fatigue * still * (1 - aim)
      + gasp * .04 + aim * (pitch * .34 - .03) + kick * .035
      - .16 * crouch + handling * .11 - strike * .12 + lean + still * breathe * .012 - .1 * buckle;
    // Rifle stance: the chest turns the right shoulder back so the support arm reaches the handguard. The weapon is
    // posed without this static twist (see below), so it still points where the operator looks.
    const shoulders = lerp(-.36, -.3, aim) * (1 - .55 * state.sprint) * upright * (1 - buckle) * (1 - .5 * handling);
    const bodyYaw = shoulders + lerp(-.14, -.03, aim) * (1 - upright) + Math.sin(phase) * gait * .055 * upright - handling * .21
      + .23 * lateral + strike * .18 + twist;
    const bodyRoll = Math.cos(phase) * gait * .028 * upright - .15 * lateral + sway;
    this.qUpper.copy(this.qBase).multiply(this.q1.setFromEuler(this.euler.set(bodyPitch, bodyYaw, bodyRoll)));
    // Distribute the rotation between pelvis and chest over the spine: 36 % lumbar, 34 % thoracic, the rest above.
    // Each bone takes its share of what is still missing, so the chest ends exactly on target.
    for (const [bone, share] of SPINE) {
      localOf(this.q2, this.rq[BIND[bone].parent!], this.qUpper);
      this.bones[bone].quaternion.identity().slerp(this.q2, share);
      this.fk(bone);
    }
    // The backpack rides on a spring: foot strikes bounce it, side steps rock it.
    this.bones.Backpack.quaternion.setFromEuler(this.euler.set(
      this.spring.pack.step(0, 3.2, .35, dt) * .05, 0, this.spring.packRoll.step(0, 3, .4, dt) * .05));

    // ---- Weapon frame ----------------------------------------------------------------------------------------
    this.torsoRig.compose(this.rp.UpperChest, this.rq.UpperChest, this.v1.set(1, 1, 1))
      .multiply(this.look.makeTranslation(TORSO_FRAME[0], TORSO_FRAME[1], TORSO_FRAME[2]));
    this.torsoWorld.multiplyMatrices(this.root.matrixWorld, this.torsoRig);
    this.torsoWorldInverse.copy(this.torsoWorld).invert();
    this.injector.visible = state.inject > .08;
    this.frag.visible = state.holdingGrenade;
    const gun = weapon.root;
    const lower = Math.max(state.lower, topple);
    // Inertia: the weapon lags behind acceleration and turns, bounces on foot strikes, drifts slightly at rest.
    const lagX = this.spring.gunX.step(-clamp(state.accelStrafe, -30, 30) * .0016 * steady + state.turn * .012 * steady, 3.2, .5, dt);
    const lagY = this.spring.gunY.step(still * wobble(t * .8, this.seed + 3) * .004 * steady, 3.6, .42, dt);
    const lagZ = this.spring.gunZ.step(clamp(state.accelForward, -30, 30) * .0018 * steady, 3, .55, dt);
    const lagPitch = this.spring.gunPitch.step(-lagY * 1.6 + still * wobble(t * .7, this.seed + 5) * .012 * steady, 4, .5, dt);
    const lagYaw = this.spring.gunYaw.step(state.turn * .07 * steady + still * wobble(t * .6, this.seed + 9) * .015 * steady, 3.4, .5, dt);
    // Low ready with the stock in the shoulder pocket; aiming lifts it to the cheek. Offsets are authored facing
    // forward and turned into the twisted chest frame.
    const straight = lerp(1, .55, upright);
    this.v1.set(lerp(.182, .14, upright) - aim * .012 - handling * .028 - strike * .05 + lagX,
      lerp(.213, .19, upright) + aim * lerp(.028, .065, upright) - state.sprint * .09 - handling * .1 - lower * .12 + Math.max(0, strike) * .06
        + lagY + Math.sin(phase * 2) * gait * .006 * steady,
      lerp(-.175, -.285, upright) - aim * .018 * upright + kick * .043 + handling * lerp(.044, .08, upright) - strike * .22 + lagZ);
    this.q2.setFromAxisAngle(Y_AXIS, -shoulders);
    gun.position.copy(this.v1).applyQuaternion(this.q2);
    gun.rotation.set(-.2 - lower * .84 - state.sprint * .38 - handling * .24 + kick * .1 + strike * .42 - tuck * .36 + lagPitch,
      .065 * straight + state.sprint * .23 - handling * .36 - strike * .25 - .13 * lateral + lagYaw,
      .055 - state.sprint * .18 + handling * .59 + Math.sin(phase) * gait * .03 * steady);
    gun.quaternion.premultiply(this.q2);
    if (aim > .001 && Math.abs(strike) < .05) {
      this.aimPoint.copy(targetWorld).applyMatrix4(this.torsoWorldInverse);
      this.aimPoint.y -= weapon.sockets.Muzzle.position.y;
      this.look.lookAt(gun.position, this.aimPoint, UP);
      this.q1.setFromRotationMatrix(this.look);
      gun.quaternion.slerp(this.q1, aim);
      gun.rotateX(kick * .042);
    }
    if (muzzleWorld && state.lower < .8) {
      this.barrel.copy(muzzleWorld).applyMatrix4(this.torsoWorldInverse);
      this.aimPoint.copy(targetWorld).applyMatrix4(this.torsoWorldInverse);
      this.look.lookAt(this.barrel, this.aimPoint, UP);
      this.q1.setFromRotationMatrix(this.look);
      this.q1.multiply(this.q2.setFromAxisAngle(NEG_Y, .42 * handling));
      gun.quaternion.slerp(this.q1, 1 - .55 * handling - .65 * state.lower);
      this.aimPoint.copy(weapon.sockets.Muzzle.position).applyQuaternion(gun.quaternion);
      this.barrel.sub(this.aimPoint);
      this.barrel.y += .08 * handling + .028 * kick;
      gun.position.lerp(this.barrel, 1 - .62 * state.lower);
    }
    gun.updateMatrix();
    weapon.reload(reload);

    // ---- Head: stabilised look, cheek weld when aiming, glances at rest -------------------------------------
    const glance = this.spring.headYaw.step(still * (1 - aim) * wobble(t * .23, this.seed + 1) * .32 + state.turn * .25, 2.2, .7, dt);
    this.q1.setFromEuler(this.euler.set(pitch * (.5 + .3 * aim) - .05 * (1 - aim) + still * breathe * .01 + gasp * .05,
      glance - .14 * aim, -.16 * aim, 'YXZ'));
    // Lying, falling or sliding: the head rides on the chest and lifts to look ahead.
    this.q2.setFromEuler(this.euler.set(.75 * prone - .45 * supine - .3 * topple, .5 * topple * this.deathSide, 0)).premultiply(this.rq.UpperChest);
    const ride = Math.max(low, slide * .6, buckle);
    this.qHand.copy(this.q1).slerp(this.q2, ride);
    localOf(this.q2, this.rq.UpperChest, this.qHand);
    this.bones.Neck.quaternion.identity().slerp(this.q2, .45);
    this.fk('Neck');
    this.orient('Head', this.qHand);

    // ---- Arms ------------------------------------------------------------------------------------------------
    for (let i = 0; i < 2; i++) {
      const side: Side = i ? 1 : -1;
      // Fist centre and hand orientation in the weapon frame.
      if (i) this.target.copy(weapon.sockets.Grip.position).add(GRIP_OFFSET).applyMatrix4(gun.matrix);
      else weapon.supportHand(this.target, reload).add(this.v1.copy(FOREND_OFFSET).applyQuaternion(gun.quaternion));
      this.qHand.copy(gun.quaternion).multiply(i ? RIGHT_ON_GRIP : LEFT_ON_FOREND);
      if (!i && state.inject > 0) {
        this.target.lerp(this.v1.set(-.1, .15, -.24), state.inject);
        this.qHand.slerp(this.q1.setFromEuler(this.euler.set(-.4, -.6, 1.2)), state.inject);
      }
      if (!i && state.throwing > 0) {
        this.target.lerp(this.v1.set(-.33, .4, state.holdingGrenade ? .09 : -.4), state.throwing);
        this.qHand.slerp(this.q1.setFromEuler(this.euler.set(state.holdingGrenade ? 2.4 : 1.2, 0, .3)), state.throwing);
      }
      // Into rig space; the wrist sits behind the fist centre.
      this.target.applyMatrix4(this.torsoRig);
      this.q1.setFromRotationMatrix(this.torsoRig);
      this.qHand.premultiply(this.q1);
      if (topple > 0) {
        // Limp: the arms drop beside the body onto the ground.
        this.v1.set(side * .42, .06, -.15).applyQuaternion(this.rq.Hips).add(this.rp.Hips);
        this.v1.y = Math.max(.05, this.v1.y);
        this.target.lerp(this.v1, topple * (i ? .55 : 1));
      }
      const grip = this.v2.set(...GRIP_POINT(side)).applyQuaternion(this.qHand);
      this.target.sub(grip);
      // Clavicle: protract and lift towards the hand.
      const shoulder = boneOf('Shoulder', side), upper = boneOf('UpperArm', side), lowerArm = boneOf('LowerArm', side);
      this.v3.copy(this.target).sub(this.rp.UpperChest).applyQuaternion(this.q1.copy(this.rq.UpperChest).invert());
      const rel = this.v3.sub(this.v1.set(side * BODY.shoulderWidth, BIND[upper].at[1] - BIND.UpperChest.at[1], 0));
      const protract = clamp(-rel.z * .42, -.06, .28) * (1 - topple);
      const raise = clamp((rel.y + .32) * .32, -.08, .18) * (1 - topple) + still * breathe * .012 + gasp * .035;
      this.bones[shoulder].quaternion.setFromEuler(this.euler.set(0, side * protract, side * raise));
      this.fk(shoulder);
      this.fk(upper);
      // Elbows down and out, a little back; on the back they point at the ground beside the body.
      this.pole.set(side * .83, -1 + 1.4 * supine, .36).applyQuaternion(this.rq.UpperChest);
      solveTwoBone(this.rp[upper], this.target, UPPER_ARM, FOREARM, this.pole, this.joint, this.end);
      this.orient(upper, aimBone(this.q1, this.rp[upper], this.joint, this.pole, 1));
      hinge(this.bones[lowerArm].quaternion, this.rq[upper], this.joint, this.end, 0, 2.7);
      this.fk(lowerArm);
      this.orient(boneOf('Hand', side), this.qHand);
      // Pauldrons follow half of the upper arm.
      this.bones[boneOf('Pauldron', side)].quaternion.identity().slerp(this.bones[upper].quaternion, .5);
    }

    // ---- Legs ------------------------------------------------------------------------------------------------
    this.rootInverse.copy(this.root.matrixWorld).invert();
    // World yaw of the body: a planted foot keeps its world yaw, so in rig space it is worldYaw − heading.
    const heading = Math.atan2(this.root.matrixWorld.elements[8], this.root.matrixWorld.elements[10]);
    const dirX = state.strafe, dirZ = -state.forward;
    const heelAngle = .3 * gait * (1 - .3 * state.sprint);
    const toeOff = .45 * gait + .3 * state.sprint;
    const lift = (gait * lerp(.1, .24, run) + .16 * state.sprint) * (1 - .15 * heavy);
    // In the dive's flight the legs stretch out behind the body instead of reaching for the ground.
    const lying = airborne ? Math.min(1, low + tuck * 1.5) : low;
    for (let i = 0; i < 2; i++) {
      const side: Side = i ? 1 : -1;
      const fraction = ((phase + i * Math.PI) / TAU) % 1;
      const planted = fraction < stanceFraction;
      const s = fraction / stanceFraction;
      const w = (fraction - stanceFraction) / (1 - stanceFraction);
      const ankle = this.ankles[i];
      // Neutral stance: bladed with the left foot forward at rest, square while moving.
      const nx = side * lerp(.118, .1, gait), nz = (side < 0 ? -.075 : .07) * blade;
      const restYaw = (side < 0 ? .08 : -.32) * blade - side * .1 * (1 - blade);
      // Locomotion: the stance track runs from front to back, slightly behind the hip when running.
      const behind = -.07 * run * gait;
      const reach = state.stride;
      let pitchFoot: number;
      let groundX: number, groundZ: number;
      let pivot: T.Vector3 | undefined;
      let rise = 0;
      if (planted) {
        const along = reach * (1 - 2 * s) + behind;
        groundX = nx + dirX * along;
        groundZ = nz + dirZ * along;
        if (s < .2) {
          pitchFoot = heelAngle * (1 - s / .2) ** 2;
          pivot = HEEL;
        } else if (s > .5) {
          pitchFoot = -toeOff * ((s - .5) / .5) ** 1.6;
          pivot = BALL;
        } else pitchFoot = 0;
      } else {
        // Swing: heel kicks up behind, the knee drives through, the foot reaches and dorsiflexes for the strike.
        const along = reach * (-1 + 2 * smooth(w, .05, .92)) + behind;
        groundX = nx + dirX * along;
        groundZ = nz + dirZ * along;
        rise = lift * Math.sin(Math.PI * Math.min(1, w * 1.15) ** .75) + gait * .03 * (1 - w);
        pitchFoot = w < .35 ? lerp(-toeOff, -toeOff - .25 * run - .2 * state.sprint, smooth(w, 0, .35))
          : lerp(-toeOff - .25 * run - .2 * state.sprint, heelAngle, smooth(w, .35, 1));
      }
      let yaw = -side * .06 * gait + restYaw + this.steer;
      // Rig-space ankle from the ground point and the pivot (heel or ball keeps touching the ground).
      this.q1.setFromEuler(this.euler.set(pitchFoot, yaw, 0, 'YXZ'));
      if (pivot) {
        this.v1.copy(pivot).applyQuaternion(this.q1);
        const base = this.v2.set(pivot.x, 0, pivot.z).applyAxisAngle(Y_AXIS, yaw);
        ankle.set(groundX + base.x - this.v1.x, -this.v1.y, groundZ + base.z - this.v1.z);
      } else ankle.set(groundX, BODY.ankle + rise, groundZ);
      if (!planted) {
        this.v1.copy(BALL).applyQuaternion(this.q1);
        ankle.y = Math.max(ankle.y, -this.v1.y + rise);
      }
      // At rest the feet stay planted in the world and step when the body turns away from them.
      const foot = this.feet[i];
      if (still > .01 && !airborne) {
        if (!foot.valid) {
          foot.planted.copy(this.v1.set(nx, BODY.ankle, nz)).applyMatrix4(this.root.matrixWorld);
          foot.plantedYaw = heading + restYaw;
          foot.valid = true;
        }
        const other = this.feet[1 - i];
        const local = this.v3.copy(foot.planted).applyMatrix4(this.rootInverse);
        const goal = this.v1.set(nx, BODY.ankle, nz);
        const error = Math.hypot(local.x - goal.x, local.z - goal.z);
        const yawError = Math.abs(wrap(foot.plantedYaw - heading - restYaw));
        if (foot.step < 0 && other.step < 0 && (error > .11 || yawError > .42) &&
          (error + yawError * .25 >= this.footError(other, 1 - i, heading, blade) - .01)) {
          foot.step = 0;
          foot.from.copy(foot.planted);
          foot.fromYaw = foot.plantedYaw;
        }
        let px = local.x, pz = local.z, py = BODY.ankle, pyaw = foot.plantedYaw - heading;
        if (foot.step >= 0) {
          foot.step = Math.min(1, foot.step + dt / .26);
          const e = smooth(foot.step, 0, 1);
          const from = this.v2.copy(foot.from).applyMatrix4(this.rootInverse);
          px = lerp(from.x, goal.x, e);
          pz = lerp(from.z, goal.z, e);
          py += Math.sin(Math.PI * foot.step) * .075;
          const fromYaw = foot.fromYaw - heading;
          pyaw = fromYaw + wrap(restYaw - fromYaw) * e;
          if (foot.step >= 1) {
            foot.step = -1;
            foot.planted.copy(this.v2.set(goal.x, BODY.ankle, goal.z)).applyMatrix4(this.root.matrixWorld);
            foot.plantedYaw = heading + restYaw;
          }
        }
        ankle.set(lerp(ankle.x, px, still), lerp(ankle.y, py, still), lerp(ankle.z, pz, still));
        yaw = lerp(yaw, pyaw, still);
        pitchFoot *= 1 - still;
      } else {
        // Moving: remember where the foot is, so it settles from there when the operator stops.
        foot.planted.copy(this.v1.set(ankle.x, BODY.ankle, ankle.z)).applyMatrix4(this.root.matrixWorld);
        foot.plantedYaw = heading + yaw;
        foot.step = -1;
        foot.valid = true;
      }
      // Crouch at rest: kneel on the right knee, left foot planted forward. Moving, the gait runs on bent legs.
      if (kneel > .001) {
        this.v1.set(side < 0 ? -.14 : .12, side < 0 ? BODY.ankle : .115, side < 0 ? -.3 : .33);
        ankle.lerp(this.v1, kneel);
        pitchFoot = lerp(pitchFoot, side < 0 ? 0 : -1.15, kneel);
        yaw = lerp(yaw, side < 0 ? .12 : -.18, kneel);
      }
      // Slide: legs reach forward, the lead foot far out.
      if (slide > .001) {
        ankle.lerp(this.v1.set(side * .19, .099, i === 0 ? -.59 : -.28), slide);
        pitchFoot = lerp(pitchFoot, .5, slide);
      }
      this.footYaw[i] = yaw;
      this.footPitch[i] = pitchFoot;
      this.toeBend[i] = planted && s > .5 ? -pitchFoot : Math.max(0, -pitchFoot) * .3;
      // Lying: legs stretch behind (prone) or ahead (supine) the pelvis.
      if (lying > .001) {
        const direction = prone >= supine ? 1 : -1;
        const step = state.stride * this.travel[i];
        this.v1.set(side * (.19 + .1 * tuck) + state.strafe * step - .23 * lateral, .09 + .2 * tuck + Math.max(0, Math.sin(Math.PI * w)) * .03,
          direction * (.78 - (.2 + .09 * side) * tuck - step * state.forward * .7) + hz);
        if (topple > 0) this.v1.x += side * .1 * topple + (i ? .12 : 0) * topple * this.deathSide;
        ankle.lerp(this.v1, lying);
      }
      if (state.fall > 0 && topple < 1) {
        // Knees buckle: feet stay, the pelvis drops over them.
        ankle.z = lerp(ankle.z, ankle.z + .05, buckle * (1 - topple));
      }
    }
    for (let i = 0; i < 2; i++) {
      const side: Side = i ? 1 : -1;
      const upper = boneOf('UpperLeg', side), lowerLeg = boneOf('LowerLeg', side), foot = boneOf('Foot', side);
      this.fk(upper);
      // Knees forward, slightly out; while strafing the knee opens to the side of travel.
      this.pole.set(side * .14 + state.strafe * .12 * gait, 0, -1).applyQuaternion(this.rq.Hips);
      solveTwoBone(this.rp[upper], this.ankles[i], THIGH, SHIN, this.pole, this.joint, this.end);
      this.orient(upper, aimBone(this.q1, this.rp[upper], this.joint, this.pole, -1));
      hinge(this.bones[lowerLeg].quaternion, this.rq[upper], this.joint, this.end, -2.7, -.02);
      this.fk(lowerLeg);
      // Feet: flat on the ground while standing, in line with the shin while lying.
      this.q1.setFromEuler(this.euler.set(this.footPitch[i], this.footYaw[i], 0, 'YXZ'));
      this.q2.copy(this.rq[lowerLeg]).multiply(this.q2.setFromAxisAngle(X_AXIS, -.35 - .5 * topple));
      this.q1.slerp(this.q2, lying);
      this.orient(foot, this.q1);
      this.bones[boneOf('Toes', side)].quaternion.setFromAxisAngle(X_AXIS, clamp(this.toeBend[i], 0, .9) * (1 - lying));
      // Tassets swing forward with the thigh, never back into it.
      const flexion = Math.max(0, -this.v1.copy(NEG_Y).applyQuaternion(this.bones[upper].quaternion).z);
      this.bones[boneOf('Tasset', side)].quaternion.setFromAxisAngle(X_AXIS, Math.asin(Math.min(1, flexion)) * .75);
    }
  }

  /** Stepping priority: the foot further from its rest spot steps first. */
  private footError(foot: Foot, index: number, heading: number, blade: number): number {
    if (!foot.valid) return 0;
    const side = index ? 1 : -1;
    const local = this.v2.copy(foot.planted).applyMatrix4(this.rootInverse);
    const nx = side * .118, nz = (side < 0 ? -.075 : .07) * blade;
    const restYaw = (side < 0 ? .08 : -.32) * blade;
    const yawError = Math.abs(wrap(foot.plantedYaw - heading - restYaw));
    return Math.hypot(local.x - nx, local.z - nz) + yawError * .25;
  }

  dispose(): void { this.teamMaterial.dispose(); }
}
