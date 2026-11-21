import * as T from 'three';
import { ModelParts } from '../ModelParts.ts';
import type { EquipmentAnchors } from '../AssetRegistry.ts';
import type { CharacterAnimation } from './CharacterAnimation.ts';
import type { WeaponVisualController } from '../weapons/WeaponVisualController.ts';

const seam = 0x343c34;
const carrier = 0x696350;
const armor = 0x45514d;
const edge = 0x768174;
const rubber = 0x282d2c;
const fastener = 0x90917e;
const skin = 0x9c7a62;
const shoulder = .224;
const hip = .114;
const upperArm = .30;
const forearm = .279;
const thigh = .43;
const calf = .438;
const pelvisHeight = .953;
const negY = new T.Vector3(0, -1, 0);
const up = new T.Vector3(0, 1, 0);

export interface SoldierPart {
  readonly geometry: T.BufferGeometry;
  readonly material: T.Material;
}

// Geometry is shared by all four rigs, including paired limbs. Colors are baked per part.
export function createSoldierParts({ olive = 0x626555, fabric = 0x4b5246 } = {}) {
  const matte = new T.MeshStandardMaterial({ vertexColors: true, roughness: .84, metalness: .06 });
  const strap = new T.MeshStandardMaterial({ roughness: .76, vertexColors: true, metalness: .08 });
  function part(draw: (m: ModelParts) => void, material = matte): SoldierPart {
    const shapes = new ModelParts();
    draw(shapes);
    return shapes.mesh(material);
  }
  return {
    pelvis: part((m) => {
      m.box(fabric, 0, .029, .016, .347, .187, .249, .035);
      m.box(seam, 0, .087, -.007, .381, .056, .261, .012);
      m.box(fastener, 0, .084, -.142, .061, .032, .012, .003);
      for (const side of [-1, 1]) {
        m.box(armor, side * .175, .023, .051, .105, .132, .122, .014, .12, -side * .12);
        m.box(carrier, side * .167, .023, -.083, .078, .12, .092, .012, .16);
      }
    }),
    torso: part((m) => {
      m.box(seam, 0, .016, .011, .298, .174, .214, .031, -.06);
      m.box(fabric, 0, .158, .007, .374, .373, .225, .042, -.06);
      m.box(carrier, 0, .177, -.004, .359, .303, .258, .036);
      m.box(armor, 0, .206, -.131, .30, .212, .069, .018, -.1);
      m.box(edge, 0, .29, -.174, .151, .024, .013, .003);
      for (const side of [-1, 1]) {
        m.box(seam, side * .119, .33, -.016, .062, .048, .196, .011, -.09, -side * .17);
        m.box(edge, side * .113, .268, -.169, .046, .047, .027, .004, -.15);
        m.box(seam, side * .188, .133, .012, .033, .12, .157, .007);
        for (let i = 0; i < 2; i++) m.box(fastener, side * .204, .098 + i * .052, .009, .007, .014, .073, .002);
      }
      for (const x of [-.082, 0, .082]) {
        m.box(carrier, x, .118, -.169, .073, .138, .068, .01, -.08);
        m.box(seam, x, .158, -.208, .065, .026, .016, .003);
        m.box(edge, x, .101, -.208, .016, .061, .013, .002);
      }
    }),
    head: part((m) => {
      m.tube(fabric, 0, .028, 0, .064, .073, .11);
      m.oval(skin, 0, .115, -.013, .171, .214, .184);
      m.box(rubber, 0, .094, -.073, .15, .114, .104, .021, -.12);
      m.oval(armor, 0, .166, .007, .229, .205, .253);
      m.box(armor, 0, .155, -.086, .213, .061, .081, .015);
      m.box(0x303f3c, 0, .13, -.111, .17, .035, .036, .008, .09);
      m.box(edge, 0, .17, -.134, .124, .016, .015, .004);
      for (const side of [-1, 1]) {
        m.box(rubber, side * .102, .101, .021, .044, .089, .097, .012);
        m.box(armor, side * .126, .12, .023, .017, .058, .083, .005);
        m.box(fastener, side * .132, .127, .037, .009, .014, .029, .002);
      }
    }, strap),
    pack: part((m) => {
      m.box(seam, 0, .206, .147, .269, .289, .092, .014);
      m.box(armor, 0, .216, .207, .265, .264, .124, .023, .04);
      m.box(carrier, 0, .096, .257, .204, .078, .046, .012);
      m.box(rubber, 0, .198, .273, .192, .074, .016, .006);
      m.box(fastener, 0, .201, .282, .069, .018, .006, .002);
      for (const side of [-1, 1]) {
        m.box(seam, side * .09, .215, .272, .026, .243, .024, .005, .04);
        m.box(fastener, side * .09, .286, .285, .024, .025, .011, .002);
        m.box(carrier, side * .125, .146, .223, .047, .124, .086, .008);
      }
      // Comms antenna and marked quick-access field dressing on the rear harness.
      m.box(0x535749, -.076, .11, .286, .12, .089, .051, .009);
      m.box(0xcac7ae, -.076, .11, .313, .044, .011, .003);
      m.box(0xcac7ae, -.076, .11, .314, .011, .041, .003);
      m.tube(rubber, .102, .383, .221, .008, .011, .146, .12);
    }),
    sleeves: [-1, 1].map((side) => part((m) => {
      m.tube(olive, 0, -.142, 0, .087, .065, .31);
      m.oval(fabric, 0, -.289, .004, .133, .125, .132);
      m.box(armor, side * .04, -.054, .002, .12, .143, .17, .027, .04, side * -.12);
      m.box(edge, side * .076, -.075, -.016, .034, .096, .095, .007, .04);
      m.box(seam, side * .048, -.199, .009, .038, .046, .103, .007);
    })),
    forearm: part((m) => {
      m.tube(fabric, 0, -.134, 0, .065, .045, .264);
      m.box(armor, 0, -.094, .039, .101, .117, .049, .011, -.09);
      m.box(seam, 0, -.245, 0, .095, .068, .104, .011);
    }),
    glove: part((m) => {
      m.box(rubber, 0, -.001, .012, .078, .09, .085, .013, -.13);
      m.box(armor, .001, .023, -.023, .07, .04, .032, .005);
    }),
    thigh: part((m) => {
      m.tube(olive, 0, -.177, 0, .114, .064, .46);
      m.oval(fabric, 0, -.414, .009, .134, .155, .166);
      m.box(fabric, 0, -.162, -.042, .153, .186, .117, .019);
      m.box(carrier, .008, -.205, -.09, .094, .118, .047, .01, .1);
      m.box(seam, 0, -.253, 0, .174, .032, .174, .012);
    }),
    shin: part((m) => {
      m.tube(olive, 0, -.188, .006, .077, .051, .394);
      m.box(armor, 0, -.034, -.063, .138, .121, .073, .016, .09);
      m.box(armor, 0, -.171, -.044, .095, .14, .037, .011);
      m.box(seam, 0, -.355, -.001, .121, .17, .132, .014);
    }),
    boot: part((m) => {
      m.box(rubber, 0, -.031, -.06, .119, .103, .252, .018);
      m.box(armor, 0, -.027, -.136, .119, .08, .103, .014);
      m.box(seam, 0, -.076, -.066, .126, .036, .257, .009);
      for (let i = 0; i < 3; i++) m.box(edge, 0, .017 - i * .005, -.028 - i * .023, .069, .009, .011, .002);
    }),
    beltKit: part((m) => {
      m.box(0x3a4039, .225, -.122, .051, .064, .15, .094, .012, .16);
      m.box(rubber, .258, -.139, .053, .012, .044, .096, .004, .16);
      m.oval(armor, -.20, .023, -.068, .081, .111, .077);
      m.box(carrier, -.2, .008, -.069, .084, .033, .08, .006);
      m.box(edge, -.22, .075, -.07, .019, .042, .027, .003);
    }),
    injector: part((m) => {
      m.box(0xc2c1a7, 0, .059, 0, .031, .112, .032, .005);
      m.box(0x67362c, 0, .099, 0, .035, .014, .036, .003);
      m.tube(rubber, 0, .13, 0, .009, .012, .025);
    }),
    frag: part((m) => {
      m.oval(armor, 0, .04, 0, .066, .095, .065);
      m.box(edge, .018, .079, .007, .018, .061, .024, .003);
    }),
    patch: part((m) => m.box(0xffffff, 0, 0, 0, .062, .049, .007, .002)),
  };
}

interface Limb {
  near: T.Mesh;
  far: T.Mesh;
  end: T.Mesh;
}

const mesh = (part: SoldierPart) => new T.Mesh(part.geometry, part.material);

export class SoldierRig {
  readonly root = new T.Group();
  readonly torso = new T.Group();
  readonly anchors: EquipmentAnchors;
  private readonly head = new T.Group();
  private readonly arms: Limb[];
  private readonly legs: Limb[];
  private readonly injector: T.Mesh;
  private readonly frag: T.Mesh;
  private readonly origin = new T.Vector3();
  private readonly target = new T.Vector3();
  private readonly pole = new T.Vector3();
  private readonly bone = new T.Vector3();
  private readonly joint = new T.Vector3();
  private readonly axis = new T.Vector3();
  private readonly barrel = new T.Vector3();
  private readonly aimTarget = new T.Vector3();
  private readonly look = new T.Matrix4();
  private readonly desired = new T.Quaternion();
  private readonly axisRotation = new T.Quaternion();
  private readonly teamMaterial: T.MeshStandardMaterial;

  constructor(parts: ReturnType<typeof createSoldierParts>, team: number, weapon: WeaponVisualController, operator = true) {
    this.teamMaterial = new T.MeshStandardMaterial({ color: team, roughness: .78 });
    this.root.add(mesh(parts.pelvis), this.torso);
    if (operator) this.root.add(mesh(parts.beltKit));
    this.torso.position.y = .178;
    this.head.position.set(0, .355, .004);
    this.torso.add(mesh(parts.torso), mesh(parts.pack), this.head, weapon.root);
    this.head.add(mesh(parts.head));
    this.arms = parts.sleeves.map((sleeve) => this.limb(this.torso, sleeve, parts.forearm, parts.glove));
    this.injector = mesh(parts.injector);
    this.frag = mesh(parts.frag);
    this.injector.visible = this.frag.visible = false;
    this.arms[0].end.add(this.injector, this.frag);
    this.legs = [-1, 1].map(() => this.limb(this.root, parts.thigh, parts.shin, parts.boot));
    const patch = new T.Mesh(parts.patch.geometry, this.teamMaterial);
    patch.position.set(-.083, -.05, 0);
    patch.rotation.y = -Math.PI / 2;
    const rear = new T.Mesh(parts.patch.geometry, this.teamMaterial);
    rear.position.set(0, .252, .281);
    this.arms[0].near.add(patch);
    this.torso.add(rear);
    this.anchors = {
      Helmet: { parent: this.head, position: [0, .17, 0] },
      Torso: { parent: this.torso, position: [0, .18, -.16] },
      Arms: { parent: this.arms[0].near, position: [0, -.08, 0] },
      Legs: { parent: this.root, position: [0, -.13, 0] },
      Backpack: { parent: this.torso, position: [0, .2, .27] },
      PrimaryWeapon: { parent: weapon.root, position: [0, 0, 0] },
      SecondaryWeapon: { parent: this.root, position: [.208, -.113, .059] },
    };
  }

  private limb(parent: T.Group, a: SoldierPart, b: SoldierPart, c: SoldierPart): Limb {
    const limb = { near: mesh(a), far: mesh(b), end: mesh(c) };
    parent.add(limb.near, limb.far, limb.end);
    return limb;
  }

  /** Rigid fallback segments solve a stable two-bone bend. No assumptions about imported skeletons. */
  private bend(limb: Limb, upper: number, lower: number): void {
    this.axis.subVectors(this.target, this.origin);
    const length = this.axis.length();
    this.axis.multiplyScalar(1 / Math.max(.0001, length));
    const distance = T.MathUtils.clamp(length, Math.abs(upper - lower) + .005, upper + lower - .0002);
    const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
    this.pole.addScaledVector(this.axis, -this.pole.dot(this.axis)).normalize();
    this.joint.copy(this.origin).addScaledVector(this.axis, along)
      .addScaledVector(this.pole, Math.sqrt(Math.max(0, upper * upper - along * along)));
    limb.end.position.copy(this.origin).addScaledVector(this.axis, distance);
    limb.near.position.copy(this.origin);
    limb.far.position.copy(this.joint);
    limb.near.quaternion.setFromUnitVectors(negY, this.bone.subVectors(this.joint, this.origin).normalize());
    limb.far.quaternion.setFromUnitVectors(negY, this.bone.subVectors(limb.end.position, this.joint).normalize());
  }

  pose(state: CharacterAnimation, weapon: WeaponVisualController, targetWorld: T.Vector3, pitch: number, now: number, muzzleWorld?: T.Vector3): void {
    const { aim, sprint, phase, kick, reload, flinch } = state;
    const { crouch, slide, prone, supine, roll, tuck, lateral, landing } = state.tactical;
    const low = Math.min(1, prone + supine);
    const airborne = state.tactical.clip?.startsWith('dive') ?? false;
    const gait = airborne ? 0 : Math.min(1, state.speed / 5.8);
    const fall = T.MathUtils.smoothstep(state.fall, 0, 1);
    const handling = T.MathUtils.smoothstep(reload, 0, .19) * (1 - T.MathUtils.smoothstep(reload, .81, 1));
    const breathe = Math.sin(now / 430) * .003 * (1 - fall);
    this.root.position.y = pelvisHeight - .023 - gait * (.066 + Math.cos(phase * 2) * .019) + breathe - fall * .69;
    this.root.position.x = Math.sin(phase) * gait * .024 + .18 * lateral;
    this.root.position.y = T.MathUtils.lerp(this.root.position.y - .32 * crouch, .29 + .08 * supine + .12 * tuck - .075 * landing, low);
    if (slide > .001) this.root.position.y -= .17 * slide;
    this.root.rotation.set(gait * .025 + sprint * .06 - fall * 1.22 + .14 * crouch - prone * 1.44 + supine * 1.44,
      fall * .31, fall * -.54 + roll);
    this.torso.rotation.set(-state.lean * .105 - sprint * .10 + aim * (pitch * .32 - .038) + kick * .033 - flinch * .15 + handling * .11,
      -.16 - state.turn * .20 + aim * .13 + Math.sin(phase) * gait * .077 - handling * .21 + .23 * lateral,
      Math.cos(phase) * gait * .038 + flinch * .065 - .15 * lateral);
    this.head.rotation.set(-this.torso.rotation.x * .55 + .61 * prone - .34 * supine, -this.torso.rotation.y * .65, -this.torso.rotation.z * .55);
    this.injector.visible = state.inject > .08;
    this.frag.visible = state.holdingGrenade;
    const gun = weapon.root;
    // Melee thrust: the weapon drives forward and up (stock/muzzle strike), the torso leans into it.
    const strike = state.melee;
    gun.position.set(.182 - aim * .018 - handling * .026 - strike * .05, .213 + aim * .028 - sprint * .103 - handling * .108 - state.lower * .12 + Math.max(0, strike) * .06,
      -.175 + kick * .043 + handling * .044 - strike * .26);
    gun.rotation.set(-.20 - state.lower * .84 - sprint * .38 - handling * .24 + kick * .10 + strike * .42 - tuck * .36,
      .065 + sprint * .23 - handling * .36 - strike * .25 - .13 * lateral,
      .055 - sprint * .18 + handling * .59);
    this.torso.rotation.x -= strike * .12;
    this.torso.rotation.y += strike * .18;
    if (aim > .001 && Math.abs(strike) < .05) {
      this.aimTarget.copy(targetWorld);
      this.torso.worldToLocal(this.aimTarget);
      this.aimTarget.y -= weapon.sockets.Muzzle.position.y;
      this.look.lookAt(gun.position, this.aimTarget, up);
      this.desired.setFromRotationMatrix(this.look);
      gun.quaternion.slerp(this.desired, aim);
      gun.rotateX(kick * .042);
    }
    if (muzzleWorld && state.lower < .8) {
      this.barrel.copy(muzzleWorld);
      this.torso.worldToLocal(this.barrel);
      this.aimTarget.copy(targetWorld);
      this.torso.worldToLocal(this.aimTarget);
      this.look.lookAt(this.barrel, this.aimTarget, up);
      this.desired.setFromRotationMatrix(this.look);
      this.desired.multiply(this.axisRotation.setFromAxisAngle(negY, .42 * handling));
      gun.quaternion.slerp(this.desired, 1 - .55 * handling - .65 * state.lower);
      this.aimTarget.copy(weapon.sockets.Muzzle.position).applyQuaternion(gun.quaternion);
      this.barrel.sub(this.aimTarget);
      this.barrel.y += .08 * handling + .028 * kick;
      gun.position.lerp(this.barrel, 1 - .62 * state.lower);
    }
    gun.updateMatrix();
    weapon.reload(reload);

    for (let i = 0; i < 2; i++) {
      const side = i * 2 - 1;
      const arm = this.arms[i];
      this.origin.set(side * shoulder, .286, -.006);
      if (i === 0) weapon.supportHand(this.target, reload);
      else weapon.grip(this.target);
      if (i === 0 && state.inject > 0) this.target.lerp(this.aimTarget.set(-.12, .13, -.235), state.inject);
      if (i === 0 && state.throwing > 0) this.target.lerp(this.aimTarget.set(-.33, .40, state.holdingGrenade ? .09 : -.40), state.throwing);
      this.pole.set(side * .83, -1 + 1.4 * supine, .36);
      this.bend(arm, upperArm, forearm);
      arm.end.quaternion.copy(gun.quaternion);
      arm.end.rotateZ(side * .19);

      const leg = this.legs[i];
      const cycle = phase + i * Math.PI;
      const fraction = (cycle / (Math.PI * 2)) % 1;
      const swing = Math.max(0, (fraction - state.stance) / (1 - state.stance));
      const travel = fraction < state.stance ? 1 - 2 * fraction / state.stance
        : 2 * T.MathUtils.smoothstep(swing, 0, 1) - 1;
      const step = airborne ? 0 : travel * state.stride;
      const pivot = (1 - gait) * state.turn;
      const lift = Math.sin(swing * Math.PI) * (gait * (.105 + sprint * .09) + Math.abs(pivot) * .055);
      this.origin.set(side * hip, 0, 0);
      this.target.set(side * (hip + .015) + step * state.strafe - this.root.position.x, .099 - this.root.position.y + lift - fall * .52,
        -step * state.forward + side * pivot * travel * .073 + .026 - fall * .08);
      this.target.z -= .19 * crouch;
      if (slide > .001 && this.root.parent) {
        this.aimTarget.set(side * .19, .099, i === 0 ? -.59 : -.28);
        this.root.worldToLocal(this.root.parent.localToWorld(this.aimTarget));
        this.target.lerp(this.aimTarget, slide);
      }
      if (low > .001 && this.root.parent) {
        const direction = prone > supine ? 1 : -1;
        this.aimTarget.set(side * (.19 + .10 * tuck) + state.strafe * step - .23 * lateral, .09 + .20 * tuck + lift * .3,
          direction * (.74 - (.20 + .09 * side) * tuck - step * state.forward * .7));
        this.root.worldToLocal(this.root.parent.localToWorld(this.aimTarget));
        this.target.lerp(this.aimTarget, low);
      }
      this.pole.set(side * .16 + state.strafe * .29, 0, -1);
      this.bend(leg, thigh, calf);
      leg.end.rotation.set(Math.sin(swing * Math.PI * 2) * gait * .23 * (1 - slide), -side * .085, 0);
    }
  }

  dispose(): void { this.teamMaterial.dispose(); }
}
