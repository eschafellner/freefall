import * as T from 'three';
import type { Circle, WorldDefinition } from '@freefall/shared';
import { detailClearances } from '../environment/EnvironmentDetailPlacement.ts';
import { MID_PROPS, midPropGeometry } from '../environment/MidPropAssets.ts';
import type { MidPropId, MidPropMaterial } from '../environment/MidPropAssets.ts';
import { placeChunkMidProps } from '../environment/MidPropPlacement.ts';
import type { MidPropPlacement } from '../environment/MidPropPlacement.ts';
import { applyVegetationWind } from '../environment/VegetationWind.ts';
import type { VegetationWind } from '../environment/VegetationWind.ts';
import type { GraphicsQuality } from '../GraphicsQuality.ts';
import { chunkDistanceSquared } from './PlanetGroundDetails.ts';

interface Batch {
  readonly mesh: T.InstancedMesh;
  readonly ranks: Float64Array;
  readonly x: number;
  readonly z: number;
}

/** Chunks per batch side: mid props reach further than ground details, so they batch over larger regions. */
const REGION = 2;
/** Plants lean only a little with the slope; rocks, wood and snow follow it fully. */
const UPRIGHT: Readonly<Record<MidPropMaterial, number>> = { foliage: .3, solid: .85, ice: .5 };

export class PlanetMidProps {
  readonly root = new T.Group();
  private readonly batches: Batch[] = [];
  private readonly range = { value: 0 };
  private readonly half: number;
  private shadows = false;
  readonly placements: number;

  constructor(world: WorldDefinition, reservations: readonly Circle[], width: number, chunkCount: number, wind?: VegetationWind) {
    this.root.name = 'Mid props';
    this.half = width * REGION / 2;
    const sites = detailClearances(world, reservations);
    const materials: Record<MidPropMaterial, T.MeshStandardMaterial> = {
      foliage: this.material(.92), solid: this.material(.93), ice: this.material(.32),
    };
    if (wind) applyVegetationWind(materials.foliage, wind, 'ground');
    const geometry = new Map<MidPropId, T.BufferGeometry>();
    const transform = new T.Object3D();
    const up = new T.Vector3(0, 1, 0), normal = new T.Vector3(), turn = new T.Quaternion();
    const color = new T.Color(), tint = new T.Color();
    let placements = 0;
    for (let rz = 0; rz < chunkCount; rz += REGION) for (let rx = 0; rx < chunkCount; rx += REGION) {
      const byAsset = new Map<MidPropId, MidPropPlacement[]>();
      for (let row = rz; row < Math.min(chunkCount, rz + REGION); row++) for (let col = rx; col < Math.min(chunkCount, rx + REGION); col++) {
        for (const prop of placeChunkMidProps(world, sites, col, row, width)) {
          let group = byAsset.get(prop.asset);
          if (!group) byAsset.set(prop.asset, group = []);
          group.push(prop);
        }
      }
      for (const [id, props] of byAsset) {
        props.sort((a, b) => a.rank - b.rank);
        placements += props.length;
        let shape = geometry.get(id);
        if (!shape) geometry.set(id, shape = midPropGeometry(id));
        const info = MID_PROPS[id];
        const mesh = new T.InstancedMesh(shape, materials[info.material], props.length);
        mesh.name = 'Mid prop ' + world.id + '/' + rx + '/' + rz + '/' + id;
        const lean = UPRIGHT[info.material];
        // Fraction of the height buried in the ground (drifts sit deep, everything else just touches down).
        const sink: number = 'sink' in info ? info.sink : .04;
        for (const [i, prop] of props.entries()) {
          transform.position.set(prop.x, prop.y - info.height * sink * prop.scale, prop.z);
          normal.set(-prop.dx * lean, 1, -prop.dz * lean).normalize();
          transform.quaternion.setFromUnitVectors(up, normal).multiply(turn.setFromAxisAngle(up, prop.yaw));
          transform.scale.setScalar(prop.scale);
          transform.updateMatrix();
          mesh.setMatrixAt(i, transform.matrix);
          const [a, b] = info.tints;
          mesh.setColorAt(i, color.setHex(a).lerp(tint.setHex(b), prop.tint).multiplyScalar(.86 + prop.tint * .2));
        }
        mesh.computeBoundingSphere();
        if (info.material === 'foliage' && wind) mesh.boundingSphere!.radius += .3;
        mesh.receiveShadow = true;
        mesh.visible = false;
        this.root.add(mesh);
        this.batches.push({ mesh, ranks: Float64Array.from(props, ({ rank }) => rank),
          x: (rx + REGION / 2) * width - world.half, z: (rz + REGION / 2) * width - world.half });
      }
    }
    this.placements = placements;
    for (const material of Object.values(materials)) {
      if (!this.batches.some(({ mesh }) => mesh.material === material)) material.dispose();
    }
  }

  private material(roughness: number): T.MeshStandardMaterial {
    const material = new T.MeshStandardMaterial({ roughness, metalness: 0, vertexColors: true, side: T.DoubleSide });
    material.customProgramCacheKey = () => 'planet-mid-prop-v1';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.midPropDistance = this.range;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `
        #include <common>
        uniform float midPropDistance;
      `).replace('#include <begin_vertex>', `
        #include <begin_vertex>
        // Grow in from the edge of the visible range instead of popping.
        vec3 midContact = (modelMatrix * instanceMatrix[3]).xyz;
        transformed *= 1.0 - smoothstep(midPropDistance * .8, midPropDistance, distance(cameraPosition, midContact));
      `);
    };
    return material;
  }

  configure(quality: GraphicsQuality): void {
    this.range.value = quality.midPropDistance;
    this.shadows = quality.midPropShadows;
    for (const { mesh, ranks } of this.batches) {
      const index = ranks.findIndex((rank) => rank >= quality.midPropDensity);
      mesh.count = index === -1 ? ranks.length : index;
    }
  }

  update(camera: T.Camera): void {
    const range = this.range.value;
    const altitude = Math.max(0, camera.position.y - 40);
    for (const { mesh, x, z } of this.batches) {
      const distance = chunkDistanceSquared(camera.position, x, z, this.half) + altitude ** 2;
      mesh.visible = mesh.count > 0 && distance < range ** 2;
      mesh.castShadow = mesh.visible && this.shadows && distance < 64 ** 2;
    }
  }
}
