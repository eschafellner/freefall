import * as T from 'three';
import { ModelParts } from '../ModelParts.ts';
import { surfaceMaterial } from '../AgentMeshes.ts';
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
// Joint origins, segment lengths and anchors are fixed by the rig; only the dressing differs between variants.
export type SoldierVariant = 'operator' | 'convict';

export function createSoldierParts({ olive = 0x626555, fabric = 0x4b5246, variant = 'operator' as SoldierVariant } = {}) {
  const matte = surfaceMaterial({ vertexColors: true, roughness: .86, metalness: .06 });
  const strap = surfaceMaterial({ roughness: .78, vertexColors: true, metalness: .08 });
  const convict = variant === 'convict';
  // Convicts: prison overall with reflective bands, scrap plates, work gloves and a custody collar.
  const plate = convict ? 0x5d625e : armor;
  const rust = 0x6e5a48;
  const band = 0xd9d2a2;
  const glove = convict ? 0x8b7a58 : rubber;
  const bootColor = convict ? 0x3d3129 : rubber;
  function part(draw: (m: ModelParts) => void, material = matte): SoldierPart {
    const shapes = new ModelParts();
    draw(shapes);
    return shapes.mesh(material);
  }
  /** Polymer or steel: lower roughness than fabric. */
  function hard(m: ModelParts, draw: () => void, gloss = .62): void {
    const before = m.gloss;
    m.gloss = gloss;
    draw();
    m.gloss = before;
  }
  /** Pouch with a slightly wider flap and a fastener. */
  function pouch(m: ModelParts, color: number, x: number, y: number, z: number, w: number, h: number, d: number, pitch = 0): void {
    m.box(color, x, y, z, w, h, d, Math.min(w, h, d) * .22, pitch);
    m.box(color, x, y + h * .36, z - d * .08, w * 1.06, h * .3, d * 1.05, Math.min(w, d) * .18, pitch);
    hard(m, () => m.box(fastener, x, y + h * .22, z - d * .55, w * .22, h * .1, .006, .002, pitch), .5);
  }
  return {
    pelvis: part((m) => {
      m.box(fabric, 0, .029, .016, .347, .187, .249, .045);
      m.box(seam, 0, .087, -.007, .381, .056, .261, .02);
      hard(m, () => m.box(fastener, 0, .086, -.14, .066, .036, .014, .005), .45);
      for (const side of [-1, 1]) {
        if (convict) {
          m.box(band, side * .172, .0, -.01, .02, .15, .255, .008);
        } else {
          hard(m, () => m.box(armor, side * .175, .023, .051, .105, .132, .122, .03, .12, -side * .12));
          pouch(m, carrier, side * .167, .023, -.09, .078, .12, .085, .16);
        }
      }
    }),
    torso: part((m) => {
      m.box(seam, 0, .016, .011, .298, .174, .214, .05, -.06);
      m.box(fabric, 0, .158, .007, .374, .373, .225, .07, -.06);
      // Collar around the neck opening.
      m.tube(convict ? fabric : seam, 0, .335, .0, .082, .1, .055);
      if (convict) {
        // Overall zip, reflective bands and mismatched scrap plates strapped over the chest.
        m.box(band, 0, .1, -.112, .38, .03, .02, .008, -.06);
        m.box(0x2f2f2b, 0, .2, -.117, .018, .26, .01, .004, -.06);
        hard(m, () => {
          m.box(plate, -.065, .215, -.135, .17, .15, .03, .02, -.1, .07);
          m.box(rust, .075, .17, -.13, .15, .17, .028, .018, -.08, -.1);
          m.box(plate, 0, .2, .13, .27, .2, .03, .02, .06);
        }, .55);
        for (const [x, y, roll] of [[-.02, .23, .62], [.02, .13, -.55]] as const) m.box(0x2b2926, x, y, -.152, .4, .028, .012, .005, -.08, roll);
        for (const side of [-1, 1]) {
          m.box(0x2b2926, side * .11, .27, .0, .045, .03, .29, .008);
          hard(m, () => m.box(fastener, side * .15, .14, -.151, .022, .022, .01, .004), .45);
        }
        return;
      }
      m.box(carrier, 0, .177, -.004, .359, .303, .258, .05);
      hard(m, () => {
        m.box(armor, 0, .206, -.134, .30, .212, .06, .03, -.1);
        m.box(armor, 0, .2, .132, .29, .22, .05, .025, .05);
        m.box(edge, 0, .292, -.173, .151, .022, .012, .005);
      });
      for (const side of [-1, 1]) {
        // Shoulder straps, side cummerbund and its fasteners.
        m.box(seam, side * .119, .33, -.016, .062, .045, .196, .015, -.09, -side * .17);
        hard(m, () => m.box(edge, side * .113, .268, -.169, .046, .047, .027, .008, -.15));
        m.box(carrier, side * .186, .14, .012, .04, .14, .2, .014);
        for (let i = 0; i < 2; i++) hard(m, () => m.box(fastener, side * .207, .098 + i * .052, .009, .007, .014, .073, .002), .5);
      }
      for (const x of [-.082, 0, .082]) pouch(m, carrier, x, .118, -.176, .073, .138, .06, -.08);
      pouch(m, seam, -.1, .265, -.172, .07, .05, .03, -.1);
    }),
    head: part((m) => {
      m.tube(fabric, 0, .028, 0, .064, .073, .11);
      m.oval(skin, 0, .115, -.013, .171, .214, .184);
      if (convict) {
        // Hood, respirator with twin filters and cheap goggles; steel custody collar with a status light.
        m.oval(0x6b665a, 0, .14, .022, .225, .25, .235);
        m.box(0x6b665a, 0, .06, .05, .19, .12, .16, .05);
        hard(m, () => {
          m.oval(0x2c2f2d, 0, .075, -.088, .118, .1, .09);
          for (const side of [-1, 1]) m.tube(0x3e4340, side * .058, .062, -.11, .026, .028, .04, Math.PI / 2, side * .5);
          m.box(0x262b2b, 0, .142, -.098, .15, .038, .03, .012);
          for (const side of [-1, 1]) m.oval(0x5f6d63, side * .038, .143, -.112, .044, .03, .012);
          m.tube(0x4d5255, 0, -.005, 0, .085, .085, .03, 0, 0, 14);
        }, .45);
        m.glow = 1.6;
        m.box(0xffa24a, 0, -.005, -.086, .022, .014, .01, .003);
        m.glow = 0;
        return;
      }
      m.box(0x3f4741, 0, .088, -.073, .15, .11, .1, .03, -.12);
      hard(m, () => {
        // Rounded ballistic shell with rim, side rails, NVG shroud and goggles.
        m.dome(armor, 0, .135, .007, .238, .19, .262, .56);
        m.tube(armor, 0, .138, .007, .118, .121, .022, 0, 0, 16);
        for (const side of [-1, 1]) m.box(edge, side * .118, .165, .01, .012, .022, .14, .004);
        m.box(0x303f3c, 0, .2, -.122, .06, .04, .03, .01, .2);
        m.box(rubber, 0, .133, -.112, .16, .04, .04, .014, .05);
      });
      hard(m, () => {
        m.glow = .35;
        for (const side of [-1, 1]) m.oval(0x2c4d52, side * .041, .133, -.13, .056, .036, .016);
        m.glow = 0;
      }, .22);
      for (const side of [-1, 1]) {
        hard(m, () => m.tube(rubber, side * .107, .1, .015, .045, .045, .04, 0, Math.PI / 2, 14), .7);
        m.box(rubber, side * .078, .045, -.035, .012, .09, .012, .004, .35);
        hard(m, () => m.box(fastener, side * .13, .1, .015, .008, .016, .016, .003), .5);
      }
    }, strap),
    pack: part((m) => {
      if (convict) {
        // Canvas duffel strapped across the back; the rear face stays where the stencil expects it.
        m.capsule(0x5e5a46, 0, .19, .215, .085, .3, 0, Math.PI / 2);
        for (const x of [-.08, .08]) m.box(0x2b2926, x, .19, .215, .022, .18, .18, .006);
        m.box(0x5e5a46, 0, .19, .275, .2, .12, .03, .02);
        return;
      }
      m.box(seam, 0, .206, .147, .269, .289, .092, .025);
      hard(m, () => m.box(armor, 0, .216, .207, .265, .264, .124, .035, .04));
      pouch(m, carrier, 0, .096, .257, .204, .078, .046);
      m.box(rubber, 0, .198, .273, .192, .074, .016, .006);
      hard(m, () => m.box(fastener, 0, .201, .282, .069, .018, .006, .002), .5);
      for (const side of [-1, 1]) {
        m.box(seam, side * .09, .215, .272, .026, .243, .024, .008, .04);
        hard(m, () => m.box(fastener, side * .09, .286, .285, .024, .025, .011, .003), .5);
        pouch(m, carrier, side * .125, .146, .223, .047, .124, .086);
      }
      // Comms antenna and marked quick-access field dressing on the rear harness.
      m.box(0x535749, -.076, .11, .286, .12, .089, .051, .015);
      m.box(0xcac7ae, -.076, .11, .313, .044, .011, .003);
      m.box(0xcac7ae, -.076, .11, .314, .011, .041, .003);
      m.tube(rubber, .102, .383, .221, .008, .011, .146, .12, 0, 8);
    }),
    sleeves: [-1, 1].map((side) => part((m) => {
      m.tube(olive, 0, -.142, 0, .087, .065, .31);
      m.oval(fabric, 0, -.289, .004, .133, .125, .132);
      if (convict) {
        m.tube(band, 0, -.2, 0, .078, .073, .03);
        return;
      }
      // Rounded shoulder pad over the deltoid.
      hard(m, () => {
        m.dome(armor, side * .028, -.035, .002, .15, .17, .175, .55, 0, side * -.3);
        m.box(edge, side * .078, -.075, -.016, .03, .09, .09, .01, .04);
      });
      m.box(seam, side * .048, -.199, .009, .038, .046, .103, .012);
    })),
    forearm: part((m) => {
      m.tube(fabric, 0, -.134, 0, .065, .045, .264);
      if (convict) {
        m.tube(band, 0, -.2, 0, .052, .05, .025);
        return;
      }
      hard(m, () => {
        m.oval(armor, 0, -.012, .038, .082, .085, .06);
        m.box(armor, 0, -.105, .036, .085, .11, .04, .015, -.09);
      });
      m.box(seam, 0, -.245, 0, .095, .068, .104, .02);
    }),
    glove: part((m) => {
      m.box(glove, 0, .004, .008, .078, .075, .085, .022, -.13);
      m.box(glove, 0, -.04, -.004, .074, .04, .08, .016, -.25);
      m.capsule(glove, .036, -.006, -.03, .014, .055, 1.1, .2);
      if (!convict) hard(m, () => m.box(armor, .001, .024, -.026, .07, .03, .03, .01), .6);
    }),
    thigh: part((m) => {
      m.tube(olive, 0, -.177, 0, .114, .064, .46);
      m.oval(fabric, 0, -.414, .009, .134, .155, .166);
      if (convict) {
        m.tube(band, 0, -.3, .0, .085, .08, .03);
        pouch(m, 0x8c4a24, .07, -.2, .0, .05, .1, .09);
        return;
      }
      m.box(fabric, 0, -.162, -.042, .153, .186, .117, .035);
      pouch(m, carrier, .008, -.205, -.096, .094, .118, .045, .1);
      m.box(seam, 0, -.253, 0, .174, .032, .174, .016);
    }),
    shin: part((m) => {
      m.tube(olive, 0, -.188, .006, .077, .051, .394);
      if (convict) {
        m.oval(rust, 0, -.04, -.055, .11, .1, .06);
        m.box(0x2b2926, 0, -.06, -.02, .13, .02, .13, .006);
        m.box(bootColor, 0, -.355, -.001, .118, .16, .128, .03);
        return;
      }
      // Knee pad and shin guard.
      hard(m, () => {
        m.oval(armor, 0, -.034, -.066, .135, .125, .085);
        m.box(armor, 0, -.175, -.046, .09, .14, .035, .015);
      });
      m.box(rubber, 0, -.04, -.03, .14, .022, .12, .008);
      m.box(seam, 0, -.355, -.001, .121, .17, .132, .025);
    }),
    boot: part((m) => {
      m.box(bootColor, 0, -.031, -.055, .118, .1, .24, .03);
      // Toe cap, heel counter and a wider, darker sole.
      hard(m, () => {
        m.oval(convict ? 0x4a3a2e : armor, 0, -.04, -.155, .118, .085, .09);
        m.box(convict ? 0x4a3a2e : armor, 0, -.03, .045, .112, .08, .05, .02);
      }, .7);
      m.box(0x1c1f1e, 0, -.082, -.06, .128, .028, .262, .01);
      for (let i = 0; i < 3; i++) m.box(convict ? 0x6d5f4f : edge, 0, .016 - i * .005, -.028 - i * .023, .066, .008, .01, .002);
    }),
    beltKit: part((m) => {
      pouch(m, 0x3a4039, .225, -.122, .051, .064, .15, .094, .16);
      m.box(rubber, .258, -.139, .053, .012, .044, .096, .004, .16);
      hard(m, () => m.oval(armor, -.20, .023, -.068, .081, .111, .077));
      m.box(carrier, -.2, .008, -.069, .084, .033, .08, .01);
      m.box(edge, -.22, .075, -.07, .019, .042, .027, .004);
    }),
    injector: part((m) => {
      m.box(0xc2c1a7, 0, .059, 0, .031, .112, .032, .008);
      m.box(0x67362c, 0, .099, 0, .035, .014, .036, .004);
      m.tube(rubber, 0, .13, 0, .009, .012, .025, 0, 0, 8);
    }),
    frag: part((m) => {
      hard(m, () => m.oval(armor, 0, .04, 0, .066, .095, .065));
      m.box(edge, .018, .079, .007, .018, .061, .024, .004);
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
