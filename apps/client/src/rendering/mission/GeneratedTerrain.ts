import * as T from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  FOREST_ID, WORLD_PROFILES, groundHeight, terrainVertex, terrainVertexSlope, worldChunkId, worldNoise,
} from '@freefall/shared';
import type { Circle, Obstacle, WorldDefinition } from '@freefall/shared';
import { applyVegetationWind } from '../environment/VegetationWind.ts';
import type { VegetationWind } from '../environment/VegetationWind.ts';
import { applyRockSurface, createPlanetMaterials } from '../environment/PlanetMaterials.ts';
import type { RockSurfaceControls, RockSurfaceOptions } from '../environment/PlanetMaterials.ts';
import { detailSeed } from '../environment/EnvironmentDetailPlacement.ts';
import { surfaceSample } from '../environment/PlanetSurfaces.ts';
import { GRAPHICS_QUALITY } from '../GraphicsQuality.ts';
import type { GraphicsQuality } from '../GraphicsQuality.ts';
import { PlanetGroundDetails } from './PlanetGroundDetails.ts';
import { PlanetMidProps } from './PlanetMidProps.ts';
import { PlanetWarTraces } from './PlanetWarTraces.ts';
import { AmbientLife } from '../environment/AmbientLife.ts';
import { broadleafCrown, coniferCrown } from './Conifer.ts';
import { randomSource } from '../environment/noise.ts';
import { fieldSampler, localRelief, macroTint } from '../environment/TerrainMacro.ts';
import { createForestBelt, createPlanetHorizon } from './PlanetHorizon.ts';
import { vividHex } from '../ToneMapping.ts';
import { applyCloudShadows, createCloudShadows } from '../environment/CloudShadows.ts';
import type { CloudShadowUniform } from '../environment/CloudShadows.ts';

// Keep every vertex along a shared border. Interior fans use only the coarse lattice.
function coarseIndices(cells: number): number[] {
  const indices: number[] = [];
  const stride = cells + 1, step = 3;
  for (let z = 0; z < cells; z += step) for (let x = 0; x < cells; x += step) {
    const index = (x: number, z: number) => z * stride + x;
    const rim = [index(x, z)];
    if (x === 0) rim.push(index(x, z + 1), index(x, z + 2));
    rim.push(index(x, z + step));
    if (z + step === cells) rim.push(index(x + 1, z + step), index(x + 2, z + step));
    rim.push(index(x + step, z + step));
    if (x + step === cells) rim.push(index(x + step, z + 2), index(x + step, z + 1));
    rim.push(index(x + step, z));
    if (z === 0) rim.push(index(x + 2, z), index(x + 1, z));
    const center = index(x + 1, z + 1);
    for (let i = 0; i < rim.length; i++) indices.push(center, rim[i], rim[(i + 1) % rim.length]);
  }
  return indices;
}

interface Props<T> { x: number; z: number; items: T[] }

/** Deposit on upward rock faces per planet: moss on the green worlds, drift sand in the desert, snow on ice. */
export function rockDeposit(planet: string, surface: { base: number; vegetation: number }, frozen: boolean): RockSurfaceOptions {
  const deposit: Record<string, [number, number]> = {
    // Moss sits darker and less saturated than the lit grass around it.
    'green-plains': [0x4f5a2c, .4], desert: [surface.base, .42], ice: [0xe8eef2, .78], [FOREST_ID]: [0x45542c, .55],
  };
  const [base, coverage] = deposit[planet] ?? [surface.base, 0];
  const dust = vividHex(base);
  return { ground: surface.base, dust, coverage: frozen ? Math.min(1, coverage + .1) : coverage, metres: frozen ? 2.4 : 1.6 };
}

/** Mean ground height under a rock footprint (centre and the four edge midpoints). */
function footGround(world: WorldDefinition, o: Obstacle): number {
  return (groundHeight(world, o.x, o.z) + groundHeight(world, o.x + o.halfX, o.z) + groundHeight(world, o.x - o.halfX, o.z)
    + groundHeight(world, o.x, o.z + o.halfZ) + groundHeight(world, o.x, o.z - o.halfZ)) / 5;
}

/** Geometry view sharing the shape's buffers, with its own per-instance ground heights. */
function withGround(shape: T.BufferGeometry, heights: Float32Array): T.BufferGeometry {
  const geometry = new T.BufferGeometry();
  geometry.name = shape.name;
  for (const [name, attribute] of Object.entries(shape.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(shape.index);
  geometry.boundingBox = shape.boundingBox;
  geometry.boundingSphere = shape.boundingSphere;
  geometry.setAttribute('rockGround', new T.InstancedBufferAttribute(heights, 1));
  return geometry;
}
interface PropBatch { near: T.InstancedMesh; far: T.InstancedMesh; x: number; z: number; rockBounds?: T.Box3 }

function propRegions<T extends Obstacle>(items: readonly T[], half: number, width: number): Props<T>[] {
  const regions = new Map<string, Props<T>>();
  for (const item of items) {
    const x = (Math.floor((item.x + half) / width) + .5) * width - half;
    const z = (Math.floor((item.z + half) / width) + .5) * width - half;
    const key = x + '/' + z;
    let region = regions.get(key);
    if (!region) regions.set(key, region = { x, z, items: [] });
    region.items.push(item);
  }
  return [...regions.values()];
}

/** Smooth 3D value noise for rock relief (deterministic, no allocation). */
function rockNoise(x: number, y: number, z: number): number {
  const hash = (i: number, j: number, k: number) => {
    let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
  };
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return lerp(
    lerp(lerp(hash(ix, iy, iz), hash(ix + 1, iy, iz), u), lerp(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), u), v),
    lerp(lerp(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), u), lerp(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), u), v), w);
}

/**
 * Collision rock in the unit box: shouldered base shape, fracture planes that cut flat faces with crisp edges, fractal
 * relief and, on rock, faint strata. `rockCavity` holds the local curvature (+ hollows, − edges) for baked shading.
 */
export function rockGeometry(frozen: boolean, detailed: boolean): T.BufferGeometry {
  // Three's detail n gives 20·(n+1)² faces: 1280 near rock, 720 near ice, 180 far.
  const source = new T.IcosahedronGeometry(1, detailed ? frozen ? 5 : 7 : 2);
  source.deleteAttribute('normal');
  source.deleteAttribute('uv');
  const geometry = mergeVertices(source, 1e-5);
  source.dispose();
  geometry.name = (frozen ? 'planet-ice' : 'planet-rock') + (detailed ? '/near' : '/far');
  const positions = geometry.getAttribute('position');
  const random = randomSource(frozen ? 4211 : 1877);
  const cuts = Array.from({ length: frozen ? 9 : 7 }, () => {
    const normal = new T.Vector3(random() * 2 - 1, (random() * 2 - 1) * .8, random() * 2 - 1).normalize();
    return { normal, offset: .62 + random() * .26 };
  });
  const p = new T.Vector3();
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i);
    const bulge = .91 + .08 * Math.sin(p.x * 8 + p.y * 5 + p.z * 7);
    // Push out the shoulders so the visible mass approaches the existing box proxy.
    const shoulder = (value: number) => Math.sign(value) * Math.abs(value) ** .64;
    p.set(shoulder(p.x) * bulge, shoulder(p.y) * bulge, shoulder(p.z) * bulge);
    // Fracture planes: everything beyond a plane is pulled back onto it, leaving a flat face with a sharp edge.
    for (const { normal, offset } of cuts) {
      const beyond = p.dot(normal) - offset;
      if (beyond > 0) p.addScaledVector(normal, -beyond * (frozen ? .96 : .82));
    }
    if (detailed) {
      const length = p.length();
      let relief = 0, amplitude = frozen ? .035 : .07, frequency = 2.6;
      for (let octave = 0; octave < 4; octave++) {
        relief += (rockNoise(p.x * frequency + 11, p.y * frequency, p.z * frequency - 7) - .5) * amplitude;
        amplitude *= .5;
        frequency *= 2.15;
      }
      if (!frozen) relief += Math.sin(p.y * 23 + rockNoise(p.x * 3, p.y * 3, p.z * 3) * 3) * .012;
      p.multiplyScalar(1 + relief / Math.max(.2, length));
    }
    positions.setXYZ(i, p.x, Math.max(-.92, p.y), p.z);
  }
  geometry.computeBoundingBox();
  const extents = geometry.boundingBox!.getSize(new T.Vector3());
  geometry.translate(...geometry.boundingBox!.getCenter(new T.Vector3()).negate().toArray());
  geometry.scale(2 / extents.x, 2 / extents.y, 2 / extents.z);
  geometry.computeVertexNormals();
  // Curvature from the one-ring: neighbour mean against the vertex along its normal.
  const index = geometry.index!;
  const sum = new Float32Array(positions.count * 3), count = new Uint16Array(positions.count);
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    for (const [from, to] of [[a, b], [b, c], [c, a], [b, a], [c, b], [a, c]]) {
      sum[from * 3] += positions.getX(to);
      sum[from * 3 + 1] += positions.getY(to);
      sum[from * 3 + 2] += positions.getZ(to);
      count[from]++;
    }
  }
  const normals = geometry.getAttribute('normal');
  const cavity = new Float32Array(positions.count);
  for (let i = 0; i < positions.count; i++) {
    const n = count[i] || 1;
    const dx = sum[i * 3] / n - positions.getX(i), dy = sum[i * 3 + 1] / n - positions.getY(i), dz = sum[i * 3 + 2] / n - positions.getZ(i);
    const bend = (dx * normals.getX(i) + dy * normals.getY(i) + dz * normals.getZ(i)) / (detailed ? frozen ? .02 : .012 : .06);
    cavity[i] = Math.max(-1, Math.min(1, bend));
  }
  geometry.setAttribute('rockCavity', new T.BufferAttribute(cavity, 1));
  return geometry;
}

export class GeneratedTerrain {
  readonly root = new T.Group();
  readonly textures: readonly T.Texture[];
  private readonly chunks: { near: T.Mesh; far: T.Mesh; x: number; z: number }[] = [];
  private readonly details: PlanetGroundDetails;
  private readonly midProps: PlanetMidProps;
  private readonly life: AmbientLife;
  /** Battle sites and swarm growth; `traces.solids` lists the rocks drawn as wrecks or ruins. */
  readonly warTraces: PlanetWarTraces;
  get traces() { return this.warTraces.traces; }
  private readonly propBatches: PropBatch[] = [];
  private readonly detailRange: { value: T.Vector2 };
  private quality: GraphicsQuality = GRAPHICS_QUALITY.medium;
  private readonly rockControls: RockSurfaceControls = { dusting: { value: 1 } };
  private belt?: { mesh: T.InstancedMesh; total: number };
  private readonly cloud: CloudShadowUniform;
  private readonly cloudDrift = new T.Vector2(1, .4).normalize();
  private cloudCover = 0;
  private cloudClock = 0;
  private readonly wind?: VegetationWind;

  constructor(world: WorldDefinition, reservations: readonly Circle[], anisotropy: number, wind?: VegetationWind) {
    const field = world.terrain!;
    const { half, step, cells } = field;
    const profile = WORLD_PROFILES.get(world.planetId!)!;
    const { id, surface, chunkCells: tile } = profile;
    const forest = id === FOREST_ID;
    const seed = detailSeed(world);
    const materials = createPlanetMaterials(id, seed, anisotropy);
    const { ground } = materials;
    this.wind = wind;
    this.cloud = createCloudShadows(profile.atmosphere.sky.cloudThreshold);
    applyCloudShadows(ground, this.cloud);
    const fieldAt = fieldSampler(field);
    const tint = [0, 0, 0];
    this.warTraces = new PlanetWarTraces(world, reservations);
    // Rock and bark textures are appended to the same list later; decal textures join it here.
    materials.textures.push(...this.warTraces.textures);
    this.textures = materials.textures;
    this.root.add(this.warTraces.root);
    this.detailRange = materials.detailRange;
    const transform = new T.Object3D();
    const color = new T.Color();
    const coarse = coarseIndices(tile);
    const width = tile * step;

    for (let cz = 0; cz < cells; cz += tile) for (let cx = 0; cx < cells; cx += tile) {
      const positions: number[] = [], normals: number[] = [], weights: number[] = [], tones: number[] = [], macro: number[] = [];
      const indices: number[] = [];
      for (let j = 0; j <= tile; j++) for (let i = 0; i <= tile; i++) {
        const ix = cx + i, iz = cz + j;
        const x = ix * step - half, z = iz * step - half;
        const [dx, dz] = terrainVertexSlope(field, ix, iz);
        const length = Math.hypot(dx, 1, dz);
        normals.push(-dx / length, 1 / length, -dz / length);
        const height = terrainVertex(field, ix, iz);
        positions.push(x, height, z);
        const sample = surfaceSample(id, seed, field, x, z, height, Math.hypot(dx, dz));
        weights.push(...sample.weights);
        tones.push(sample.tone);
        macro.push(...macroTint(id, seed, x, z, localRelief(height, fieldAt, x, z), tint));
        if (i < tile && j < tile) {
          const a = j * (tile + 1) + i, b = a + 1, c = a + tile + 1, d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('surfaceWeights', new T.Float32BufferAttribute(weights, 4));
      geometry.setAttribute('surfaceTone', new T.Float32BufferAttribute(tones, 1));
      geometry.setAttribute('surfaceMacro', new T.Float32BufferAttribute(macro, 3));
      geometry.setIndex(indices);
      const terrainMesh = new T.Mesh(geometry, ground);
      terrainMesh.name = worldChunkId(world.id, cx / tile, cz / tile);
      terrainMesh.receiveShadow = true;
      const farGeometry = new T.BufferGeometry();
      for (const [name, attribute] of Object.entries(geometry.attributes)) farGeometry.setAttribute(name, attribute);
      farGeometry.setIndex(coarse);
      const farMesh = new T.Mesh(farGeometry, ground);
      farMesh.name = terrainMesh.name + '/far';
      farMesh.receiveShadow = true;
      farMesh.visible = false;
      this.root.add(terrainMesh, farMesh);

      const x = cx * step - half + width / 2, z = cz * step - half + width / 2;
      this.chunks.push({ near: terrainMesh, far: farMesh, x, z });
    }
    this.root.add(createPlanetHorizon(id, seed, field, ground));
    this.details = new PlanetGroundDetails(world, reservations, width, cells / tile, wind, this.cloud);
    this.root.add(this.details.root);
    this.midProps = new PlanetMidProps(world, reservations, width, cells / tile, wind, this.cloud);
    this.root.add(this.midProps.root);
    this.life = new AmbientLife(world, wind);
    this.root.add(this.life.root);

    const stone = materials.prop('rock', surface.rock, .93);
    applyRockSurface(stone, rockDeposit(id, surface, false), this.rockControls);
    applyCloudShadows(stone, this.cloud);
    const bridge = world.obstacles.find(({ kind }) => kind === 'arch-span');
    for (const [frozen, rocks] of [
      [false, world.obstacles.filter(({ kind }, index) => (kind === 'rock' && !this.traces.solids.has(index)) || kind === 'arch-pier')],
      [true, world.obstacles.filter(({ kind }) => kind === 'ice')],
    ] as const) {
      if (!rocks.length) continue;
      const rockMaterial = frozen ? materials.prop('ice', surface.exposed, .39) : stone;
      if (frozen) {
        applyRockSurface(rockMaterial, rockDeposit(id, surface, true), this.rockControls);
        applyCloudShadows(rockMaterial, this.cloud);
      }
      const nearShape = rockGeometry(frozen, true), farShape = rockGeometry(frozen, false);
      for (const { x, z, items } of propRegions(rocks, half, width * 2)) {
        const heights = Float32Array.from(items, (obstacle) => footGround(world, obstacle));
        const near = new T.InstancedMesh(withGround(nearShape, heights), rockMaterial, items.length);
        const far = new T.InstancedMesh(withGround(farShape, heights), rockMaterial, items.length);
        for (const [i, obstacle] of items.entries()) {
          const bottom = obstacle.bottom ?? 0;
          transform.position.set(obstacle.x, (obstacle.height + bottom) / 2, obstacle.z);
          transform.scale.set(obstacle.halfX, (obstacle.height - bottom) / 2, obstacle.halfZ);
          transform.updateMatrix();
          near.setMatrixAt(i, transform.matrix);
          far.setMatrixAt(i, transform.matrix);
          const tint = worldNoise(seed, obstacle.x, obstacle.z);
          color.setScalar(.72 + .46 * tint);
          near.setColorAt(i, color);
          far.setColorAt(i, color);
        }
        near.name = frozen ? 'Ice collision props' : 'Rock collision props';
        far.name = near.name + '/far';
        near.receiveShadow = far.receiveShadow = true;
        far.visible = false;
        this.root.add(near, far);
        near.computeBoundingBox();
        this.propBatches.push({ near, far, x, z, rockBounds: near.boundingBox! });
      }
    }
    if (bridge) {
      const shape = new T.TorusGeometry(4.3, 1.05, 7, 20, Math.PI);
      shape.name = 'sandstone-arch';
      const archGround = groundHeight(world, bridge.x, bridge.z);
      shape.setAttribute('rockGround', new T.Float32BufferAttribute(new Float32Array(shape.getAttribute('position').count).fill(archGround), 1));
      const arch = new T.Mesh(shape, stone);
      arch.position.set(bridge.x, bridge.height - 5.35, bridge.z);
      arch.scale.z = 1.45;
      arch.castShadow = arch.receiveShadow = true;
      arch.name = 'Sandstone arch';
      this.root.add(arch);
    }

    const trees = world.obstacles.filter(({ kind }) => kind === 'tree');
    if (!trees.length) return;
    const trunkShape = new T.CylinderGeometry(.36, 1, 1, 8, 4);
    trunkShape.name = 'tree-trunk';
    const barkUv = trunkShape.getAttribute('uv');
    const barkPosition = trunkShape.getAttribute('position');
    for (let i = 0; i < barkUv.count; i++) {
      barkUv.setY(i, barkUv.getY(i) * 2.3);
      const y = barkPosition.getY(i);
      const flare = y < -.24 ? .94 + .06 * Math.cos(i % 9 * Math.PI) : .75 + .07 * Math.cos(i % 9 * Math.PI);
      barkPosition.setXYZ(i, barkPosition.getX(i) * flare, y, barkPosition.getZ(i) * flare);
    }
    trunkShape.computeVertexNormals();
    const trunkMaterial = materials.prop('bark', 0x665649, .96);
    const crownShape = forest ? coniferCrown(true) : broadleafCrown(true);
    const farShape = forest ? coniferCrown(false) : broadleafCrown(false);
    const crownId = forest ? 'forest-conifer' : 'plains-crown';
    crownShape.name = crownId + '/near';
    farShape.name = crownId + '/far';
    const crownMaterial = new T.MeshStandardMaterial({
      color: vividHex(forest ? 0x566b50 : 0x445433, 1.35), metalness: 0, roughness: .96,
      vertexColors: true, side: T.DoubleSide,
    });
    const farCrownMaterial = forest && wind ? crownMaterial.clone() : crownMaterial;
    if (forest && wind) {
      applyVegetationWind(crownMaterial, wind, 'crown');
      applyVegetationWind(farCrownMaterial, wind, 'crown-far');
    }
    for (const material of new Set([trunkMaterial, crownMaterial, farCrownMaterial])) applyCloudShadows(material, this.cloud);
    const random = randomSource(seed);
    const layers = forest ? 1 : 5;
    if (forest) {
      const belt = createForestBelt(seed, field, farShape, new T.MeshStandardMaterial({
        name: 'Forest horizon crowns', color: vividHex(0x566b50, 1.35), metalness: 0, roughness: .96, vertexColors: true, side: T.DoubleSide,
      }));
      this.root.add(belt);
      this.belt = { mesh: belt, total: belt.count };
    }
    for (const region of propRegions(trees, half, width)) {
      const trunks = new T.InstancedMesh(trunkShape, trunkMaterial, region.items.length);
      const crowns = new T.InstancedMesh(crownShape, crownMaterial, region.items.length * layers);
      const distant = new T.InstancedMesh(farShape, farCrownMaterial, region.items.length);
      for (const [i, tree] of region.items.entries()) {
        const base = groundHeight(world, tree.x, tree.z);
        // Landmark giants (halfX > 1.2, the forest's "Alter Baum") tower over the canopy.
        const giant = tree.halfX > 1.2;
        const height = (forest ? 8.3 : 5.6) + random() * (forest ? 4.6 : 2.2) + (giant ? 9 : tree.halfX > .8 ? 3 : 0);
        transform.rotation.set(0, random() * Math.PI, 0);
        const foot = base - .24;
        transform.position.set(tree.x, foot + height / 2, tree.z);
        transform.scale.set(tree.halfX, height, tree.halfZ);
        transform.updateMatrix();
        trunks.setMatrixAt(i, transform.matrix);
        transform.position.y = forest ? base : base + height * .91;
        const width = forest ? height * (.21 + random() * .08) * (giant ? 1.25 : 1) : 2;
        transform.scale.set(width, forest ? height : 1.9, width);
        transform.updateMatrix();
        distant.setMatrixAt(i, transform.matrix);
        const tint = .72 + random() * .4;
        distant.setColorAt(i, color.setScalar(tint));
        if (forest) {
          crowns.setMatrixAt(i, transform.matrix);
          crowns.setColorAt(i, color.setScalar(tint));
          continue;
        }
        for (let j = 0; j < layers; j++) {
          const angle = j * 2.4;
          const offset = j ? 1.35 : 0;
          transform.position.set(tree.x + Math.sin(angle) * offset, base + height - .42 * j, tree.z + Math.cos(angle) * offset);
          transform.rotation.y = angle;
          const spread = 1.65 + random() * .8;
          transform.scale.set(spread, 1.3 + random() * .6, spread);
          transform.updateMatrix();
          crowns.setMatrixAt(i * layers + j, transform.matrix);
          crowns.setColorAt(i * layers + j, color.setScalar(.65 + random() * .43));
        }
      }
      if (forest && wind) {
        for (const mesh of [crowns, distant]) {
          mesh.computeBoundingSphere();
          mesh.boundingSphere!.radius += .35;
        }
      }
      this.root.add(trunks, crowns, distant);
      trunks.name = 'Tree collision trunks';
      crowns.name = 'Crown';
      distant.name = 'Crown/far';
      distant.visible = false;
      this.propBatches.push({ near: crowns, far: distant, x: region.x, z: region.z });
    }
  }

  /** Dawn/dusk strength (0 by day): bioluminescent wildlife brightens. */
  setTwilight(amount: number): void { this.life.setTwilight(amount); }

  /** Weather cloud amount (0 clear … 1 overcast): cloud shadows are strongest under broken cloud. */
  setCloudCover(amount: number): void { this.cloudCover = Math.max(0, Math.min(1, amount)); }

  configure(quality: GraphicsQuality): void {
    this.quality = quality;
    this.detailRange.value.set(quality.terrainTextureDistance * .68, quality.terrainTextureDistance);
    this.rockControls.dusting.value = quality === GRAPHICS_QUALITY.low ? 0 : 1;
    if (this.belt) this.belt.mesh.count = Math.round(this.belt.total * (quality === GRAPHICS_QUALITY.low ? .45 : 1));
    this.details.configure(quality);
    this.midProps.configure(quality);
    this.life.configure(quality);
    this.warTraces.configure(quality);
  }

  update(camera: T.Camera): void {
    const low = this.quality === GRAPHICS_QUALITY.low;
    const terrainDistance = camera.position.y > 27 ? 190 : low ? 105 : 140;
    for (const { near, far, x, z } of this.chunks) {
      near.visible = Math.abs(camera.position.x - x) < terrainDistance && Math.abs(camera.position.z - z) < terrainDistance;
      far.visible = !near.visible;
    }
    for (const { near, far, x, z, rockBounds } of this.propBatches) {
      const { x: vx, z: vz } = camera.position;
      const range = rockBounds ? Math.hypot(Math.max(0, rockBounds.min.x - vx, vx - rockBounds.max.x),
        Math.max(0, rockBounds.min.z - vz, vz - rockBounds.max.z)) : Math.hypot(vx - x, vz - z);
      const limit = this.quality.environmentLodDistance * (rockBounds ? .64 : 1);
      // Hysteresis prevents adjacent frames from switching representations at the same boundary.
      near.visible = range < limit + (near.visible ? 7 : -7);
      near.castShadow = near.visible && !low && range < 69;
      far.visible = !near.visible;
    }
    // Cloud shadows drift with the wind; heavy overcast flattens them, clear sky keeps a few.
    const now = performance.now() / 1000;
    const dt = this.cloudClock ? Math.min(.2, now - this.cloudClock) : 0;
    this.cloudClock = now;
    const flow = this.wind?.flow.value;
    if (flow && Math.hypot(flow.x, flow.y) > .01) this.cloudDrift.set(flow.x, flow.y).normalize();
    const cloud = this.cloud.value;
    cloud.x = (cloud.x - this.cloudDrift.x * dt * 4.5) % 100000;
    cloud.y = (cloud.y - this.cloudDrift.y * dt * 4.5) % 100000;
    cloud.z = (low ? .55 : .75) * (1 - this.cloudCover * .5);
    this.details.update(camera);
    this.midProps.update(camera);
    this.life.update(camera);
  }
}
