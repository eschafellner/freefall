import * as T from 'three';
import { landHeight } from '../terrain.ts';
import { ENVIRONMENT } from './EnvironmentConfig.ts';
import { landscapeNoise, randomSource } from './noise.ts';

interface Cluster {
  x: number;
  z: number;
  mesh: T.InstancedMesh;
  vegetation: boolean;
}

export class GroundDetails {
  private readonly clusters: Cluster[] = [];

  constructor(scene: T.Object3D) {
    const stone = new T.IcosahedronGeometry(1, 0);
    const position = stone.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      position.setXYZ(i, x * (0.87 + z * 0.19), y * (0.85 + x * 0.19), z * (0.9 - y * 0.25));
    }
    stone.computeVertexNormals();
    const rockMat = new T.MeshLambertMaterial();
    const scrub = new T.BufferGeometry();
    const blades: number[] = [];
    const random = randomSource(92062);
    for (let i = 0; i < 7; i++) {
      const a = random() * Math.PI * 2;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      const x = dx * random() * 0.15;
      const z = dz * random() * 0.15;
      const width = 0.025 + random() * 0.035;
      const rise = 0.23 + random() * 0.25;
      blades.push(x + dz * width, 0, z - dx * width, x + dx * 0.18, rise, z + dz * 0.18, x - dz * width, 0, z + dx * width);
    }
    scrub.setAttribute('position', new T.Float32BufferAttribute(blades, 3));
    scrub.computeVertexNormals();
    const grassMat = new T.MeshLambertMaterial({ side: T.DoubleSide });
    const transform = new T.Object3D();
    const tint = new T.Color();
    const regionSize = 24;
    for (let row = -4; row < 4; row++) {
      for (let col = -4; col < 4; col++) {
        const cx = (col + 0.5) * regionSize;
        const cz = (row + 0.5) * regionSize;
        const gravel = new T.InstancedMesh(stone, rockMat, 38);
        const brush = new T.InstancedMesh(scrub, grassMat, 17);
        let rocks = 0;
        let grass = 0;
        for (let i = 0; i < 38; i++) {
          const x = cx + (random() - 0.5) * regionSize;
          const z = cz + (random() - 0.5) * regionSize;
          const border = Math.max(Math.abs(x), Math.abs(z));
          const outside = border > ENVIRONMENT.half + 2.8;
          const inPad = Math.hypot(x - ENVIRONMENT.pad.x, z - ENVIRONMENT.pad.z) < ENVIRONMENT.pad.radius + 0.6;
          const inRoad = Math.abs(x - ENVIRONMENT.roadX - Math.sin(z * 0.06) * 1.5) < 4;
          if (inPad || inRoad || (border > 60 && border < 78)) continue;
          const h = landHeight(x, z);
          const size = outside ? 0.13 + random() ** 3 * 0.69 : 0.022 + random() ** 2 * 0.125;
          transform.position.set(x, h + size * 0.18, z);
          transform.rotation.set(0, random() * Math.PI * 2, 0);
          transform.scale.set(size * (1.0 + random() * 0.45), size * (outside ? 0.67 : 0.36), size);
          transform.updateMatrix();
          gravel.setMatrixAt(rocks, transform.matrix);
          gravel.setColorAt(rocks++, tint.setHSL(0.085 + random() * 0.06, 0.12 + random() * 0.12, 0.22 + random() * 0.17));

          if (grass < 17 && (outside || landscapeNoise(x * 0.12, z * 0.12, 65) > 0.59)) {
            transform.position.set(x + size * 0.7, h, z);
            transform.scale.setScalar(outside ? 0.65 + random() * 0.65 : 0.19 + random() * 0.13);
            transform.updateMatrix();
            brush.setMatrixAt(grass, transform.matrix);
            brush.setColorAt(grass++, tint.setHSL(0.12 + random() * 0.07, 0.19 + random() * 0.12, 0.22 + random() * 0.16));
          }
        }
        gravel.count = rocks;
        brush.count = grass;
        for (const mesh of [gravel, brush]) {
          mesh.computeBoundingSphere();
          scene.add(mesh);
          this.clusters.push({ x: cx, z: cz, mesh, vegetation: mesh === brush });
        }
      }
    }
  }

  update(camera: T.Camera, gravelDistance: number, brushDistance: number): void {
    for (const cluster of this.clusters) {
      const limit = cluster.vegetation ? brushDistance : gravelDistance;
      const dx = camera.position.x - cluster.x;
      const dz = camera.position.z - cluster.z;
      // Tile margin avoids dropping the closest instances prematurely at a tile edge.
      cluster.mesh.visible = limit > 0 && cluster.mesh.count > 0 && dx * dx + dz * dz < (limit + 16.97) ** 2;
    }
  }
}
