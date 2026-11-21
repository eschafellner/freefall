import * as T from 'three';
import { MAX_ENEMIES, MAX_PLAYERS } from '@freefall/shared';
import { smoothstep } from './environment/noise.ts';

import { groundHeight } from '@freefall/shared';
import type { WorldDefinition } from '@freefall/shared';

export class ContactShadows {
  world?: WorldDefinition;
  private readonly mesh: T.InstancedMesh;
  private readonly transform = new T.Object3D();
  private count = 0;

  constructor(scene: T.Scene) {
    const size = 32;
    const pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
        pixels.set([255, 255, 255, 255 * (1 - smoothstep(0.13, 1, d))], (y * size + x) * 4);
      }
    }
    const map = new T.DataTexture(pixels, size, size);
    map.magFilter = map.minFilter = T.LinearFilter;
    map.needsUpdate = true;
    this.mesh = new T.InstancedMesh(
      new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({ color: 0x28251f, map, transparent: true, opacity: 0.34, depthWrite: false }),
      MAX_ENEMIES + MAX_PLAYERS,
    );
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(this.mesh);
  }

  begin(): void {
    this.count = 0;
  }

  add(x: number, z: number, yaw: number, width: number, length: number): void {
    this.transform.position.set(x, groundHeight(this.world, x, z) + .028, z);
    this.transform.rotation.y = yaw;
    this.transform.scale.set(width, 1, length);
    this.transform.updateMatrix();
    this.mesh.setMatrixAt(this.count++, this.transform.matrix);
  }

  end(): void {
    this.mesh.count = this.count;
    if (!this.count) return;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, this.count * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
