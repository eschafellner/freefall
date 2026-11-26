import * as T from 'three';

/**
 * Transport of a rig: a plain offset (the Albatross carries its passengers rigidly) or a carry on a line: the rig's
 * harness point (pivot metres above its feet) is placed at anchor and the rig turned by rotation around it.
 */
export type RigTransport = T.Vector3 | { readonly anchor: T.Vector3; readonly rotation: T.Quaternion; readonly pivot: number };

const transport = new WeakMap<T.Scene, ReadonlyMap<number, RigTransport>>();

interface Part {
  source: T.Mesh;
  mesh: T.InstancedMesh;
}

export class PlayerRigBatches {
  private readonly batches: T.InstancedMesh[] = [];
  private readonly parts = new Map<T.Object3D, Part[]>();
  private readonly frustum = new T.Frustum();
  private readonly projection = new T.Matrix4();
  private readonly bounds = new T.Sphere(new T.Vector3(), 1.55);

  private readonly scene: T.Scene;
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
    this.followsTransport = followsTransport;
    const groups = new Map<string, T.Mesh[]>();
    const byRoot = new Map<T.Object3D, T.Mesh[]>();
    for (const root of rigs) {
      const sources: T.Mesh[] = [];
      root.traverse((object) => {
        if (!(object instanceof T.Mesh) || Array.isArray(object.material)) return;
        const key = object.geometry.uuid + ':' + object.material.uuid;
        const group = groups.get(key);
        if (group) group.push(object);
        else groups.set(key, [object]);
        object.layers.disable(0);
        sources.push(object);
      });
      byRoot.set(root, sources);
    }
    const assignment = new Map<T.Mesh, T.InstancedMesh>();
    for (const group of groups.values()) {
      const { geometry, material } = group[0];
      const mesh = new T.InstancedMesh(geometry, material, group.length);
      mesh.name = 'PlayerRigBatch';
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      scene.add(mesh);
      this.batches.push(mesh);
      for (const source of group) assignment.set(source, mesh);
    }
    for (const [root, sources] of byRoot) {
      this.parts.set(root, sources.map((source) => ({ source, mesh: assignment.get(source)! })));
    }
  }

  draw(camera: T.Camera): void {
    const offsets = this.followsTransport ? transport.get(this.scene) : undefined;
    let index = 0;
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    for (const mesh of this.batches) mesh.count = 0;
    for (const [root, parts] of this.parts) {
      const offset = offsets?.get(index++);
      if (!root.visible) continue;
      this.bounds.center.set(root.position.x, root.position.y + .86, root.position.z);
      const shift = offset instanceof T.Vector3 ? offset : undefined;
      const carry = offset && !shift ? offset as Exclude<RigTransport, T.Vector3> : undefined;
      if (carry) {
        this.bounds.center.copy(carry.anchor);
        this.carryMatrix.makeRotationFromQuaternion(carry.rotation).setPosition(carry.anchor);
        this.carryMatrix.multiply(this.pivotMatrix.makeTranslation(-root.position.x, -root.position.y - carry.pivot, -root.position.z));
      } else if (shift) this.bounds.center.add(shift);
      if (!this.frustum.intersectsSphere(this.bounds)) continue;
      root.updateMatrixWorld();
      for (const { source, mesh } of parts) {
        if (!this.attached(source, root)) continue;
        if (!offset) mesh.setMatrixAt(mesh.count++, source.matrixWorld);
        else if (carry) mesh.setMatrixAt(mesh.count++, this.offsetMatrix.multiplyMatrices(this.carryMatrix, source.matrixWorld));
        else {
          const matrix = this.offsetMatrix.copy(source.matrixWorld).setPosition(
            source.matrixWorld.elements[12] + shift!.x,
            source.matrixWorld.elements[13] + shift!.y,
            source.matrixWorld.elements[14] + shift!.z,
          );
          mesh.setMatrixAt(mesh.count++, matrix);
        }
      }
    }
    for (const mesh of this.batches) {
      if (!mesh.count) continue;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private attached(source: T.Object3D, root: T.Object3D): boolean {
    // Slot overrides may hide a procedural hierarchy or replace one of its pieces.
    for (let part: T.Object3D | null = source; part; part = part.parent) {
      if (!part.visible) return false;
      if (part === root) return true;
    }
    return false;
  }

  dispose(): void {
    for (const mesh of this.batches) {
      mesh.removeFromParent();
      mesh.dispose();
    }
  }
}
