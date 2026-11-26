import * as T from 'three';

/**
 * Transport of a rig: a plain offset (the Albatross carries its passengers rigidly) or a carry on a line: the rig's
 * harness point (pivot metres above its feet) is placed at anchor and the rig turned by rotation around it.
 */
export type RigTransport = T.Vector3 | { readonly anchor: T.Vector3; readonly rotation: T.Quaternion; readonly pivot: number };

const transport = new WeakMap<T.Scene, ReadonlyMap<number, RigTransport>>();
const IDENTITY = new T.Matrix4();

/**
 * Draws the rigid parts of several character rigs (weapons, props, team patches) as shared instanced meshes, one
 * draw per geometry and material. Rigs are scanned every frame, so looks can change at runtime. Skinned bodies render
 * themselves; this class only hands them the rig's transport and hides them outside the view.
 */
export class PlayerRigBatches {
  private readonly batches = new Map<string, T.InstancedMesh>();
  private readonly frustum = new T.Frustum();
  private readonly projection = new T.Matrix4();
  private readonly bounds = new T.Sphere(new T.Vector3(), 1.55);

  private readonly scene: T.Scene;
  private readonly roots: readonly T.Object3D[];
  private readonly followsTransport: boolean;
  private readonly offsetMatrix = new T.Matrix4();
  private readonly carryMatrix = new T.Matrix4();
  private readonly pivotMatrix = new T.Matrix4();

  static setTransport(scene: T.Scene, offsets: ReadonlyMap<number, RigTransport> | undefined): void {
    if (offsets) transport.set(scene, offsets);
    else transport.delete(scene);
  }

  constructor(scene: T.Scene, rigs: readonly T.Object3D[], followsTransport = true) {
    this.scene = scene;
    this.roots = rigs;
    this.followsTransport = followsTransport;
    // Create the batches for the current pieces up front (shaders compile with the scene).
    for (const root of rigs) root.traverse((object) => {
      if (this.rigid(object)) this.batch(object, rigs.length);
    });
  }

  private rigid(object: T.Object3D): object is T.Mesh<T.BufferGeometry, T.Material> {
    return object instanceof T.Mesh && !(object instanceof T.SkinnedMesh) && !(object instanceof T.InstancedMesh) &&
      !Array.isArray(object.material);
  }

  private batch(source: T.Mesh<T.BufferGeometry, T.Material>, capacity: number): T.InstancedMesh {
    source.layers.disable(0);
    const key = source.geometry.uuid + ':' + source.material.uuid;
    let mesh = this.batches.get(key);
    if (mesh && mesh.instanceMatrix.count >= capacity) return mesh;
    const size = Math.max(capacity, (mesh?.instanceMatrix.count ?? 0) * 2, this.roots.length);
    const grown = new T.InstancedMesh(source.geometry, source.material, size);
    grown.name = 'PlayerRigBatch';
    grown.count = mesh?.count ?? 0;
    grown.frustumCulled = false;
    grown.instanceMatrix.setUsage(T.DynamicDrawUsage);
    if (mesh) {
      grown.instanceMatrix.array.set(mesh.instanceMatrix.array.subarray(0, mesh.count * 16));
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.scene.add(grown);
    this.batches.set(key, grown);
    return grown;
  }

  draw(camera: T.Camera): void {
    const offsets = this.followsTransport ? transport.get(this.scene) : undefined;
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    for (const mesh of this.batches.values()) mesh.count = 0;
    for (const [index, root] of this.roots.entries()) {
      if (!root.visible) continue;
      const offset = offsets?.get(index);
      this.bounds.center.set(root.position.x, root.position.y + .86, root.position.z);
      const shift = offset instanceof T.Vector3 ? offset : undefined;
      const carry = offset && !shift ? offset as Exclude<RigTransport, T.Vector3> : undefined;
      let moved: T.Matrix4 | undefined;
      if (carry) {
        this.bounds.center.copy(carry.anchor);
        this.carryMatrix.makeRotationFromQuaternion(carry.rotation).setPosition(carry.anchor);
        moved = this.carryMatrix.multiply(this.pivotMatrix.makeTranslation(-root.position.x, -root.position.y - carry.pivot, -root.position.z));
      } else if (shift) {
        this.bounds.center.add(shift);
        moved = this.carryMatrix.makeTranslation(shift.x, shift.y, shift.z);
      }
      const seen = this.frustum.intersectsSphere(this.bounds);
      if (seen) root.updateMatrixWorld();
      this.collect(root, seen, moved);
    }
    for (const mesh of this.batches.values()) {
      if (!mesh.count) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Visits the visible part of a rig: rigid meshes go into their batch, skinned meshes get the transport. */
  private collect(node: T.Object3D, seen: boolean, moved: T.Matrix4 | undefined): void {
    if (node instanceof T.SkinnedMesh) {
      node.visible = seen;
      node.matrixWorld.copy(moved ?? IDENTITY);
      return;
    }
    if (!node.visible) return;
    if (seen && this.rigid(node)) {
      const mesh = this.batch(node, 0);
      if (mesh.count >= mesh.instanceMatrix.count) this.batch(node, mesh.count + 1);
      const target = this.batches.get(node.geometry.uuid + ':' + node.material.uuid)!;
      target.setMatrixAt(target.count++, moved ? this.offsetMatrix.multiplyMatrices(moved, node.matrixWorld) : node.matrixWorld);
    }
    for (const child of node.children) this.collect(child, seen, moved);
  }

  dispose(): void {
    for (const mesh of this.batches.values()) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.batches.clear();
  }
}
