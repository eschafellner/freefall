import * as T from 'three';
import { BALANCE, SERVICE_PISTOL, TEST_RIFLE } from '@freefall/shared';

export const ATTACHMENT_SLOTS = ['Muzzle', 'Barrel', 'Optic', 'Underbarrel', 'Magazine', 'Stock'] as const;
export type WeaponAttachmentSlot = (typeof ATTACHMENT_SLOTS)[number];
export type WeaponSocket = 'Grip' | 'SupportHand' | 'EjectionPort' | WeaponAttachmentSlot;
type Vec3 = readonly [number, number, number];

const SOCKETS: Record<WeaponSocket, Vec3> = {
  Grip: [0, 0, 0],
  SupportHand: [-.02, .049, -.292],
  Muzzle: [0, .101, -.597],
  EjectionPort: [.047, .095, -.106],
  Barrel: [0, .101, -.433],
  Optic: [0, .141, -.134],
  Underbarrel: [0, .036, -.348],
  Magazine: [0, .036, -.182],
  Stock: [0, .08, .062],
};

/** Procedural weapon geometry with one shared material. `magazine` and `optic` are local to their sockets. */
export interface WeaponParts {
  body: T.BufferGeometry;
  optic: T.BufferGeometry;
  magazine: T.BufferGeometry;
  /** Moving part in weapon space: pistol slide, pump forend, bolt with charging handle or the hinged barrels. */
  slide?: T.BufferGeometry;
  /** Break action: spent cases thrown out of the chambers when the barrels open (magazine space). */
  spent?: T.BufferGeometry;
  finish: T.MeshStandardMaterial;
}

/**
 * How a weapon model moves. Reload fractions refer to `reloadSeconds` of `weaponId`, like the server timeline.
 *   - `fixed`: no moving part (Kestrel).
 *   - `slide`: slide or bolt travels back `cycle.travel` on every shot and returns within `cycle.seconds`. `lock` holds
 *     it open during the reload (until `insertionAt` when `until` is missing); `charge` lets the support hand rack it.
 *   - `pump`: the forend racks after every shot (VX-13); `magazine` is the shell in the support hand.
 *   - `break`: the barrels (`slide`) tip down around `hinge.pivot`; the support hand carries the rounds (`magazine`) from
 *     `magazine.drop` into the open chambers and closes the barrels again. Shots alternate between the barrels.
 */
export interface WeaponProfile {
  weaponId?: string;
  action: 'fixed' | 'slide' | 'pump' | 'break';
  sockets?: Partial<Record<WeaponSocket, Vec3>>;
  cycle?: { travel: number; seconds: number };
  lock?: { from: number; until?: number; travel: number };
  /** Magazine path during the reload (socket space, fully out) and the support-hand grip on it (magazine space). */
  magazine?: { drop: Vec3; roll: number; hand: Vec3 };
  /**
   * Support hand racks the charging handle (`hand`, weapon space) after the magazine sits: reach, pull back by
   * `travel`, let it slam forward at `release`, return to `SupportHand`.
   */
  charge?: { hand: Vec3; reach: readonly [number, number]; pull: readonly [number, number]; release: number; back: readonly [number, number]; travel: number };
  /** Break action: hinge pin (weapon space), opening angle in radians, open and close windows (reload fractions). */
  hinge?: { pivot: Vec3; angle: number; open: readonly [number, number]; close: readonly [number, number] };
  /** Break action: lateral offset of each barrel from the centre line; the right barrel fires first. */
  barrelSpacing?: number;
  /** `false`: no case leaves the weapon per shot (break action ejects at the reload). */
  ejectsPerShot?: boolean;
}

const PISTOL: WeaponProfile = {
  action: 'slide',
  sockets: { Muzzle: [0, .064, -.154], EjectionPort: [.021, .074, -.052], SupportHand: [-.028, -.018, -.023], Optic: [0, .085, 0], Magazine: [0, -.016, .008] },
  cycle: { travel: .028, seconds: .07 },
  // Slide locks back on an empty magazine during the reload.
  lock: { from: 0, travel: .028 },
};
/** VX-13 Cerberus: pump forend, one shell in the support hand per loaded round. */
export const CERBERUS_HANDLING: WeaponProfile = {
  weaponId: 'vx-13',
  action: 'pump',
  sockets: { Muzzle: [0, .098, -.866], EjectionPort: [.036, .086, -.115], SupportHand: [-.022, .03, -.40], Barrel: [0, .098, -.62],
    Optic: [0, .128, -.12], Underbarrel: [0, .02, -.52], Magazine: [0, .03, -.165], Stock: [0, .07, .06] },
};
const RIFLE: WeaponProfile = { action: 'fixed' };
const MAGAZINE: NonNullable<WeaponProfile['magazine']> = { drop: [-.095, -.185, .045], roll: -.24, hand: [-.03, -.096, .014] };

const smooth = T.MathUtils.smoothstep;

export class WeaponVisualController {
  readonly root = new T.Group();
  readonly sockets = {} as Record<WeaponSocket, T.Group>;
  readonly profile: WeaponProfile;
  private readonly attachmentNodes = {} as Record<WeaponAttachmentSlot, T.Group>;
  private readonly receiver: T.Mesh;
  private readonly fallbackMagazine: T.Mesh;
  private readonly magazine = new T.Group();
  private readonly hand = new T.Vector3();
  private reloadProgress = -1;
  private model?: T.Object3D;
  private importedMagazine?: T.Object3D;
  private readonly slide?: T.Mesh;
  private slideTravel = 0;
  /** Break action: rotates the barrels about the hinge pin; spent cases ride on it while they are thrown out. */
  private readonly hinge?: T.Group;
  private readonly spent?: T.Mesh;
  private shots = 0;
  private readonly chamber = new T.Vector3();
  /** Same reload timeline as the server state machine (`weapons.json › reloadTimeline`). */
  private readonly timeline: { readonly removalAt: number; readonly insertionAt: number };

  private readonly layout: typeof SOCKETS;

  /** `kind`: `true` for the P-01, `false` for the Kestrel, otherwise the profile of the model. */
  constructor(parts: WeaponParts, kind: boolean | WeaponProfile = false) {
    const profile = this.profile = kind === true ? PISTOL : kind === false ? RIFLE : kind;
    this.timeline = (profile === PISTOL ? SERVICE_PISTOL : profile.weaponId ? BALANCE.weapon(profile.weaponId) : TEST_RIFLE).reloadTimeline;
    this.layout = { ...SOCKETS, ...profile.sockets };
    for (const name of Object.keys(SOCKETS) as WeaponSocket[]) {
      const socket = new T.Group();
      socket.name = name;
      socket.position.set(...this.layout[name]);
      this.sockets[name] = socket;
      this.root.add(socket);
    }
    for (const name of ATTACHMENT_SLOTS) {
      const node = new T.Group();
      this.sockets[name].add(node);
      this.attachmentNodes[name] = node;
    }
    this.receiver = new T.Mesh(parts.body, parts.finish);
    this.fallbackMagazine = new T.Mesh(parts.magazine, parts.finish);
    this.root.add(this.receiver);
    if (profile.action !== 'fixed' && parts.slide) {
      this.slide = new T.Mesh(parts.slide, parts.finish);
      if (profile.hinge) {
        this.hinge = new T.Group();
        this.hinge.position.set(...profile.hinge.pivot);
        this.slide.position.set(-profile.hinge.pivot[0], -profile.hinge.pivot[1], -profile.hinge.pivot[2]);
        this.hinge.add(this.slide);
        this.root.add(this.hinge);
        if (parts.spent) {
          this.spent = new T.Mesh(parts.spent, parts.finish);
          this.spent.visible = false;
          this.hinge.add(this.spent);
        }
      } else this.root.add(this.slide);
    }
    if (profile.action === 'break') {
      this.magazine.visible = false;
      this.resetBarrels();
    }
    this.attachmentNodes.Magazine.add(this.magazine);
    this.magazine.add(this.fallbackMagazine);
    this.setAttachment('Optic', new T.Mesh(parts.optic, parts.finish));
  }

  /** Resources remain owned by AssetLoader or the caller. */
  setAttachment(slot: WeaponAttachmentSlot, visual: T.Object3D): void {
    const mount = slot === 'Magazine' ? this.magazine : this.attachmentNodes[slot];
    mount.clear();
    mount.add(visual);
  }

  attachModel(model: T.Object3D): void {
    this.detachModel();
    this.model = model;
    this.root.add(model);
    model.updateWorldMatrix(true, true);
    const transform = new T.Matrix4();
    const inverse = new T.Matrix4().copy(this.root.matrixWorld).invert();
    for (const name of Object.keys(SOCKETS) as WeaponSocket[]) {
      const marker = model.getObjectByName(name);
      if (!marker) continue;
      const socket = this.sockets[name];
      transform.multiplyMatrices(inverse, marker.matrixWorld).decompose(socket.position, socket.quaternion, socket.scale);
    }
    this.receiver.visible = false;
    if (this.slide) this.slide.visible = false;
    const magazine = model.getObjectByName('MagazineMesh');
    if (magazine) {
      // Bind in the seated pose even when the asset arrives mid-reload.
      this.magazine.position.set(0, 0, 0);
      this.magazine.rotation.set(0, 0, 0);
      this.magazine.attach(magazine);
      this.reload(this.reloadProgress);
      this.importedMagazine = magazine;
      this.fallbackMagazine.visible = false;
    }
  }

  detachModel(): void {
    this.model?.removeFromParent();
    this.importedMagazine?.removeFromParent();
    this.importedMagazine = this.model = undefined;
    this.receiver.visible = this.fallbackMagazine.visible = true;
    if (this.slide) this.slide.visible = true;
    for (const name of Object.keys(SOCKETS) as WeaponSocket[]) {
      const socket = this.sockets[name];
      socket.position.set(...this.layout[name]);
      socket.quaternion.identity();
      socket.scale.setScalar(1);
    }
  }

  /** Slide or bolt cycles back on a shot; the pump forend racks; a double barrel fires right, then left. */
  cycle(): void {
    this.slideTravel = 1;
    const spacing = this.profile.barrelSpacing;
    if (spacing) this.sockets.Muzzle.position.x = this.layout.Muzzle[0] + (this.shots++ % 2 === 0 ? spacing : -spacing);
  }

  update(dt: number): void {
    if (!this.slide) return;
    if (this.hinge) {
      const progress = this.reloadProgress;
      this.hinge.rotation.x = -this.hingeAngle(progress);
      if (this.spent) {
        // Ejectors throw both cases back and up as the barrels open.
        const t = (progress - this.profile.hinge!.open[0]) / .2;
        this.spent.visible = t > 0 && t < 1;
        const socket = this.layout.Magazine;
        const pivot = this.profile.hinge!.pivot;
        this.spent.position.set(socket[0] - pivot[0], socket[1] - pivot[1] + .16 * t - .3 * t * t, socket[2] - pivot[2] + .2 * t);
        this.spent.rotation.x = 2.4 * t;
      }
      return;
    }
    if (this.profile.action === 'pump') {
      // Recoil first, then the rack: back 7.5 cm and forward again within ~0.55 s.
      this.slideTravel = Math.max(0, this.slideTravel - dt / .55);
      const elapsed = 1 - this.slideTravel;
      this.slide.position.z = this.slideTravel > 0 && elapsed > .3 ? Math.sin(Math.PI * (elapsed - .3) / .7) * .075 : 0;
      return;
    }
    const { cycle, lock, charge } = this.profile;
    this.slideTravel = Math.max(0, this.slideTravel - dt / (cycle?.seconds ?? .07));
    const progress = this.reloadProgress;
    let travel = this.slideTravel * (cycle?.travel ?? 0);
    if (lock && progress >= lock.from && progress < (lock.until ?? this.timeline.insertionAt)) travel = Math.max(travel, lock.travel);
    if (charge) travel = Math.max(travel, this.chargePull(progress) * charge.travel);
    this.slide.position.z = travel;
  }

  reload(progress: number): void {
    this.reloadProgress = progress;
    if (this.profile.action === 'break') {
      this.loadRounds(progress);
      return;
    }
    // The shell only exists in the support hand while a round is being loaded.
    if (this.profile.action === 'pump') this.magazine.visible = progress >= 0;
    const { removalAt, insertionAt } = this.timeline;
    // Out at the server's MAGAZINE_REMOVAL tick, seated exactly at MAGAZINE_INSERTION.
    const removal = smooth(progress, removalAt - .1, removalAt + .06) * (1 - smooth(progress, insertionAt - .16, insertionAt));
    const { drop, roll } = this.profile.magazine ?? MAGAZINE;
    this.magazine.position.set(drop[0] * removal, drop[1] * removal, drop[2] * removal);
    this.magazine.rotation.z = roll * removal;
  }

  grip(target: T.Vector3): T.Vector3 {
    return target.copy(this.sockets.Grip.position).applyMatrix4(this.root.matrix);
  }

  supportHand(target: T.Vector3, progress: number): T.Vector3 {
    const socket = this.sockets.Magazine;
    socket.updateMatrix();
    const { removalAt, insertionAt } = this.timeline;
    const feed = smooth(progress, .04, Math.max(.08, removalAt - .04)) * (1 - smooth(progress, insertionAt + .02, Math.min(.98, insertionAt + .16)));
    this.magazine.updateMatrix();
    this.hand.set(...(this.profile.magazine ?? MAGAZINE).hand).applyMatrix4(this.magazine.matrix).applyMatrix4(socket.matrix);
    target.copy(this.sockets.SupportHand.position);
    // The forend tips down with the barrels; the hand stays on it while opening and closing.
    if (this.hinge) this.aboutHinge(target, this.hingeAngle(progress));
    target.lerp(this.hand, feed);
    const charge = this.profile.charge;
    if (charge && progress >= 0) {
      const reach = smooth(progress, ...charge.reach) * (1 - smooth(progress, ...charge.back));
      // The hand follows the handle while it is pulled back.
      if (reach > 0) target.lerp(this.hand.set(...charge.hand).setZ(charge.hand[2] + this.chargePull(progress) * charge.travel), reach);
    }
    return target.applyMatrix4(this.root.matrix);
  }

  muzzle(target: T.Vector3): T.Vector3 {
    return this.sockets.Muzzle.getWorldPosition(target);
  }

  /** Break action: opening angle of the barrels at this reload fraction. */
  private hingeAngle(progress: number): number {
    const hinge = this.profile.hinge;
    if (!hinge || progress < 0) return 0;
    return hinge.angle * smooth(progress, ...hinge.open) * (1 - smooth(progress, ...hinge.close));
  }

  /** Rotates a weapon-space point with the opened barrels. */
  private aboutHinge(point: T.Vector3, angle: number): T.Vector3 {
    const [, py, pz] = this.profile.hinge!.pivot;
    const y = point.y - py, z = point.z - pz, c = Math.cos(-angle), s = Math.sin(-angle);
    point.y = py + y * c - z * s;
    point.z = pz + y * s + z * c;
    return point;
  }

  /**
   * Break action: the rounds appear in the hand at `magazine.drop` when it reaches them, travel into the open chambers
   * and sit there at `insertionAt`. Outside the reload they are hidden in the barrels.
   */
  private loadRounds(progress: number): void {
    const { removalAt, insertionAt } = this.timeline;
    const shown = progress >= removalAt - .04 && progress < insertionAt + .04;
    this.magazine.visible = shown;
    if (progress >= insertionAt) this.resetBarrels();
    if (!shown) return;
    const angle = this.hingeAngle(progress);
    const socket = this.sockets.Magazine.position;
    const open = this.aboutHinge(this.chamber.copy(socket), angle).sub(socket);
    const away = 1 - smooth(progress, removalAt, insertionAt - .04);
    const { drop, roll } = this.profile.magazine ?? MAGAZINE;
    this.magazine.position.set(
      open.x + (drop[0] - open.x) * away, open.y + (drop[1] - open.y) * away, open.z + (drop[2] - open.z) * away);
    this.magazine.rotation.set(-angle * (1 - away), 0, roll * away);
  }

  private resetBarrels(): void {
    this.shots = 0;
    if (this.profile.barrelSpacing) this.sockets.Muzzle.position.x = this.layout.Muzzle[0] + this.profile.barrelSpacing;
  }

  /** 0–1: how far the support hand has pulled the charging handle back. */
  private chargePull(progress: number): number {
    const charge = this.profile.charge;
    if (!charge || progress < 0) return 0;
    return smooth(progress, ...charge.pull) * (1 - smooth(progress, charge.release, charge.release + .02));
  }
}
