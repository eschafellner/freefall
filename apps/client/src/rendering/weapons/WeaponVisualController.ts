import * as T from 'three';
import { SERVICE_PISTOL, TEST_RIFLE } from '@freefall/shared';
import type { createKestrel } from './Kestrel.ts';

export const ATTACHMENT_SLOTS = ['Muzzle', 'Barrel', 'Optic', 'Underbarrel', 'Magazine', 'Stock'] as const;
export type WeaponAttachmentSlot = (typeof ATTACHMENT_SLOTS)[number];
export type WeaponSocket = 'Grip' | 'SupportHand' | 'EjectionPort' | WeaponAttachmentSlot;

const SOCKETS: Record<WeaponSocket, readonly [number, number, number]> = {
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

const smooth = T.MathUtils.smoothstep;

export class WeaponVisualController {
  readonly root = new T.Group();
  readonly sockets = {} as Record<WeaponSocket, T.Group>;
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
  /** Same reload timeline as the server state machine (`weapons.json › reloadTimeline`). */
  private readonly timeline: { readonly removalAt: number; readonly insertionAt: number };

  private readonly layout: typeof SOCKETS;

  constructor(parts: Omit<ReturnType<typeof createKestrel>['pistol'], 'slide'> & { slide?: T.BufferGeometry }, pistol = false) {
    this.timeline = (pistol ? SERVICE_PISTOL : TEST_RIFLE).reloadTimeline;
    this.layout = pistol ? { ...SOCKETS, Muzzle: [0, .064, -.154], EjectionPort: [.021, .074, -.052], SupportHand: [-.028, -.018, -.023],
      Optic: [0, .085, 0], Magazine: [0, -.016, .008] } : SOCKETS;
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
    if (pistol && parts.slide) {
      this.slide = new T.Mesh(parts.slide, parts.finish);
      this.root.add(this.slide);
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

  /** Slide cycles back on a shot and returns within ~70 ms. */
  cycle(): void { this.slideTravel = 1; }

  update(dt: number): void {
    if (!this.slide) return;
    this.slideTravel = Math.max(0, this.slideTravel - dt / .07);
    // Slide locks back on an empty magazine during the reload.
    const locked = this.reloadProgress >= 0 && this.reloadProgress < this.timeline.insertionAt ? 1 : 0;
    this.slide.position.z = Math.max(this.slideTravel, locked) * .028;
  }

  reload(progress: number): void {
    this.reloadProgress = progress;
    const { removalAt, insertionAt } = this.timeline;
    // Out at the server's MAGAZINE_REMOVAL tick, seated exactly at MAGAZINE_INSERTION.
    const removal = smooth(progress, removalAt - .1, removalAt + .06) * (1 - smooth(progress, insertionAt - .16, insertionAt));
    this.magazine.position.set(-.095 * removal, -.185 * removal, .045 * removal);
    this.magazine.rotation.z = -.24 * removal;
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
    this.hand.set(-.03, -.096, .014).applyMatrix4(this.magazine.matrix).applyMatrix4(socket.matrix);
    return target.copy(this.sockets.SupportHand.position).lerp(this.hand, feed).applyMatrix4(this.root.matrix);
  }

  muzzle(target: T.Vector3): T.Vector3 {
    return this.sockets.Muzzle.getWorldPosition(target);
  }
}
