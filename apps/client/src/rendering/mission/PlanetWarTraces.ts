import * as T from 'three';
import { WORLD_PROFILES } from '@freefall/shared';
import type { Circle, Obstacle, WorldDefinition } from '@freefall/shared';
import { detailClearances } from '../environment/EnvironmentDetailPlacement.ts';
import { WAR_TRACES, traceGeometry } from '../environment/WarTraceAssets.ts';
import type { TraceId, TraceMaterial } from '../environment/WarTraceAssets.ts';
import { placeWarTraces } from '../environment/WarTracePlacement.ts';
import type { WarTraces } from '../environment/WarTracePlacement.ts';
import { createTerrainDecals } from '../environment/TerrainDecals.ts';
import type { GraphicsQuality } from '../GraphicsQuality.ts';

/** Solid traces fill their collider's AABB like the rock mesh they replace. */
function unitBox(geometry: T.BufferGeometry): T.BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!, size = box.getSize(new T.Vector3());
  geometry.translate(...box.getCenter(new T.Vector3()).negate().toArray());
  geometry.scale(2 / size.x, 2 / size.y, 2 / size.z);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Battle sites, outposts and swarm growth. Small traces grow in with distance like the mid props; solid traces stand in
 * for rock colliders and stay visible at every range.
 */
export class PlanetWarTraces {
  readonly root = new T.Group();
  readonly textures: readonly T.Texture[];
  readonly traces: WarTraces;
  private readonly range = { value: 0 };
  private readonly small: T.InstancedMesh[] = [];
  private readonly solid: T.InstancedMesh[] = [];
  private lamp?: T.Material;

  constructor(world: WorldDefinition, reservations: readonly Circle[]) {
    this.root.name = 'War traces';
    this.traces = placeWarTraces(world, detailClearances(world, reservations));
    const rock = WORLD_PROFILES.get(world.planetId!)?.surface.rock ?? 0x777777;
    const materials: Record<TraceMaterial, T.Material> = {
      metal: this.material(new T.MeshStandardMaterial({ roughness: .6, metalness: .22, vertexColors: true })),
      solid: this.material(new T.MeshStandardMaterial({ roughness: .94, metalness: 0, vertexColors: true })),
      resin: this.material(new T.MeshStandardMaterial({ roughness: .3, metalness: .08, vertexColors: true })),
      lamp: this.material(new T.MeshBasicMaterial({ color: 0xff8a3a })),
    };
    this.lamp = materials.lamp;
    const transform = new T.Object3D(), up = new T.Vector3(0, 1, 0), normal = new T.Vector3(), turn = new T.Quaternion();
    const surface = WORLD_PROFILES.get(world.planetId!)?.surface;
    // Crater lips mix the planet's ground and rock colours (snow and dirt on ice, sand and stone in the desert).
    const color = new T.Color(), rim = new T.Color(surface?.base ?? rock).lerp(new T.Color(rock), .45).multiplyScalar(1.15);
    const groups = new Map<TraceId, typeof this.traces.props[number][]>();
    for (const prop of this.traces.props) {
      let list = groups.get(prop.asset);
      if (!list) groups.set(prop.asset, list = []);
      list.push(prop);
    }
    for (const [id, props] of groups) {
      const info = WAR_TRACES[id];
      const mesh = new T.InstancedMesh(traceGeometry(id), materials[info.material], props.length);
      mesh.name = 'War trace ' + id;
      for (const [i, prop] of props.entries()) {
        const lean = id === 'beacon' || id === 'beacon-lamp' ? 0 : .8;
        transform.position.set(prop.x, prop.y - .02, prop.z);
        normal.set(-prop.dx * lean, 1, -prop.dz * lean).normalize();
        transform.quaternion.setFromUnitVectors(up, normal).multiply(turn.setFromAxisAngle(up, prop.yaw));
        transform.scale.setScalar(prop.scale);
        transform.updateMatrix();
        mesh.setMatrixAt(i, transform.matrix);
        mesh.setColorAt(i, id === 'crater-rim' ? rim : color.setScalar(.85 + (i * .618 % 1) * .25));
      }
      mesh.computeBoundingSphere();
      mesh.receiveShadow = info.material !== 'lamp';
      this.small.push(mesh);
      this.root.add(mesh);
    }
    const solids = new Map<string, Obstacle[]>();
    for (const [index, kind] of this.traces.solids) {
      let list = solids.get(kind);
      if (!list) solids.set(kind, list = []);
      list.push(world.obstacles[index]);
    }
    // Solids replace colliders and must never fade, so they get their own plain materials.
    const solidMaterials = {
      metal: new T.MeshStandardMaterial({ roughness: .6, metalness: .22, vertexColors: true }),
      solid: new T.MeshStandardMaterial({ roughness: .94, metalness: 0, vertexColors: true }),
    };
    for (const [kind, obstacles] of solids) {
      const id = kind as 'pod-wreck' | 'hull-wreck' | 'ruin';
      const mesh = new T.InstancedMesh(unitBox(traceGeometry(id)), solidMaterials[WAR_TRACES[id].material], obstacles.length);
      mesh.name = 'War trace solid ' + id;
      for (const [i, obstacle] of obstacles.entries()) {
        const bottom = obstacle.bottom ?? 0;
        transform.position.set(obstacle.x, (obstacle.height + bottom) / 2, obstacle.z);
        transform.quaternion.setFromAxisAngle(up, (obstacle.x * 7.13 + obstacle.z * 3.7) % 1 < .5 ? 0 : Math.PI);
        transform.scale.set(obstacle.halfX, (obstacle.height - bottom) / 2, obstacle.halfZ);
        transform.updateMatrix();
        mesh.setMatrixAt(i, transform.matrix);
      }
      mesh.castShadow = mesh.receiveShadow = true;
      this.solid.push(mesh);
      this.root.add(mesh);
    }
    const decals = createTerrainDecals(world, this.traces.decals);
    this.root.add(...decals.meshes);
    this.textures = decals.textures;
    for (const material of [...Object.values(materials), ...Object.values(solidMaterials)]) {
      if (![...this.small, ...this.solid].some((mesh) => mesh.material === material)) material.dispose();
    }
  }

  /** Small traces shrink to nothing at the edge of the range. */
  private material<M extends T.Material>(material: M): M {
    const range = this.range;
    material.customProgramCacheKey = () => 'planet-war-trace-v1';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.traceDistance = range;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `
        #include <common>
        uniform float traceDistance;
      `).replace('#include <begin_vertex>', `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 traceContact = (modelMatrix * instanceMatrix[3]).xyz;
          transformed *= 1.0 - smoothstep(traceDistance * .8, traceDistance, distance(cameraPosition, traceContact));
        #endif
      `);
    };
    return material;
  }

  configure(quality: GraphicsQuality): void {
    // Traces read from further away than plants: they are the landmarks of a battlefield.
    this.range.value = quality.midPropDistance * 1.35;
    for (const mesh of this.small) mesh.castShadow = quality.midPropShadows && mesh.material !== this.lamp;
  }
}
