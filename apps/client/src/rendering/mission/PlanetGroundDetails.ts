import * as T from 'three';
import type { Circle, WorldDefinition } from '@freefall/shared';
import { DETAIL_ASSETS, detailClearances, placeChunkDetails } from '../environment/EnvironmentDetailPlacement.ts';
import type { DetailAssetId, EnvironmentDetail } from '../environment/EnvironmentDetailPlacement.ts';
import { applyVegetationWind } from '../environment/VegetationWind.ts';
import type { VegetationWind } from '../environment/VegetationWind.ts';
import { detailGeometry } from '../environment/EnvironmentDetailAssets.ts';
import type { GraphicsQuality } from '../GraphicsQuality.ts';
import { vivid } from '../ToneMapping.ts';
import { applyCloudShadows } from '../environment/CloudShadows.ts';
import type { CloudShadowUniform } from '../environment/CloudShadows.ts';

interface Batch {
  readonly mesh: T.InstancedMesh;
  readonly ranks: Float64Array;
  readonly x: number;
  readonly z: number;
}

export function chunkDistanceSquared(view: T.Vector3, x: number, z: number, half: number): number {
  return Math.max(0, Math.abs(view.x - x) - half) ** 2 + Math.max(0, Math.abs(view.z - z) - half) ** 2;
}

export class PlanetGroundDetails {
  readonly root = new T.Group();
  private readonly batches: Batch[] = [];
  private readonly range = { value: 0 };
  private readonly half: number;

  constructor(world: WorldDefinition, reservations: readonly Circle[], width: number, chunkCount: number, wind?: VegetationWind,
    cloud?: CloudShadowUniform) {
    this.half = width / 2;
    const sites = detailClearances(world, reservations);
    const geometry = new Map<DetailAssetId, T.BufferGeometry>();
    const natural = this.material(.94);
    const vegetation = wind && this.material(.94);
    if (wind && vegetation) applyVegetationWind(vegetation, wind, 'ground');
    const frozen = this.material(.61);
    const white = this.material(.92);
    if (cloud) for (const material of [natural, vegetation, frozen, white]) if (material) applyCloudShadows(material, cloud);
    const transform = new T.Object3D();
    const up = new T.Vector3(0, 1, 0), normal = new T.Vector3();
    const turn = new T.Quaternion();
    const color = new T.Color(), tint = new T.Color();

    for (let row = 0; row < chunkCount; row++) for (let col = 0; col < chunkCount; col++) {
      const byAsset = new Map<DetailAssetId, EnvironmentDetail[]>();
      for (const detail of placeChunkDetails(world, sites, col, row, width)) {
        let group = byAsset.get(detail.asset);
        if (!group) byAsset.set(detail.asset, group = []);
        group.push(detail);
      }
      for (const [id, details] of byAsset) {
        let shape = geometry.get(id);
        if (!shape) {
          shape = detailGeometry(id);
          geometry.set(id, shape);
        }
        const moves = id === 'grass' || id === 'fern' || id === 'forb' || id === 'scrub';
        const mesh = new T.InstancedMesh(shape, moves && vegetation ? vegetation : id === 'ice-chip' ? frozen : id === 'drift' ? white : natural, details.length);
        mesh.name = world.id + '/' + col + '/' + row + '/' + id;
        // Align the bottom of the small footprint to the terrain tangent plane.
        for (const [i, detail] of details.entries()) {
          transform.position.set(detail.x, detail.y - .012, detail.z);
          normal.set(-detail.dx, 1, -detail.dz).normalize();
          transform.quaternion.setFromUnitVectors(up, normal).multiply(turn.setFromAxisAngle(up, detail.yaw));
          transform.scale.setScalar(detail.scale);
          transform.updateMatrix();
          mesh.setMatrixAt(i, transform.matrix);
          const [a, b] = DETAIL_ASSETS[id].colors;
          vivid(color.setHex(a).lerp(tint.setHex(b), detail.tint));
          mesh.setColorAt(i, color);
        }
        // Bounds cover every instance, including those restored by switching to High.
        mesh.computeBoundingSphere();
        if (moves && vegetation) mesh.boundingSphere!.radius += .18;
        mesh.visible = false;
        this.root.add(mesh);
        this.batches.push({ mesh, ranks: Float64Array.from(details, ({ rank }) => rank),
          x: (col + .5) * width - world.half, z: (row + .5) * width - world.half });
      }
    }
    // A biome can have no frozen assets or no valid candidates at all.
    for (const material of [natural, frozen, white, vegetation]) {
      if (material && !this.batches.some(({ mesh }) => mesh.material === material)) material.dispose();
    }
  }

  private material(roughness: number): T.MeshStandardMaterial {
    const material = new T.MeshStandardMaterial({ roughness, metalness: 0, vertexColors: true, side: T.DoubleSide });
    material.customProgramCacheKey = () => 'planet-detail-distance-v1';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.detailDistance = this.range;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `
        #include <common>
        uniform float detailDistance;
      `).replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vec3 contact = (modelMatrix * instanceMatrix[3]).xyz;
        float distanceToDetail = distance(cameraPosition, contact);
        transformed *= 1.0 - smoothstep(detailDistance * .72, detailDistance, distanceToDetail);
      `);
    };
    return material;
  }

  configure(quality: GraphicsQuality): void {
    this.range.value = quality.environmentDetailDistance;
    for (const { mesh, ranks } of this.batches) {
      const index = ranks.findIndex((rank) => rank >= quality.environmentDetailDensity);
      mesh.count = index === -1 ? ranks.length : index;
    }
  }

  update(camera: T.Camera): void {
    const range = this.range.value;
    const altitude = Math.max(0, camera.position.y - 25);
    for (const { mesh, x, z } of this.batches) {
      mesh.visible = mesh.count > 0 && chunkDistanceSquared(camera.position, x, z, this.half) + altitude ** 2 < range ** 2;
    }
  }
}
