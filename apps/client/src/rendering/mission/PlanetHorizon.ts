import * as T from 'three';
import { DESERT_ID, FOREST_ID, ICE_ID, terrainHeight, terrainVertex, terrainVertexSlope } from '@freefall/shared';
import type { Heightfield } from '@freefall/shared';
import { landscapeNoise, randomSource, smoothstep } from '../environment/noise.ts';
import { surfaceSample } from '../environment/PlanetSurfaces.ts';
import { fieldSampler, localRelief, macroTint } from '../environment/TerrainMacro.ts';

/** Ring offsets outside the playable square in metres; dense at the seam, sparse at the skyline. */
export const HORIZON_RINGS = [0, 4, 10, 18, 28, 40, 55, 72, 92, 115, 140, 168, 200, 235, 275, 320, 370, 425, 485,
  550, 620, 695, 775, 860, 950, 1045, 1145, 1250] as const;
/** Forest backdrop: canopy tint on the ground and a belt of distant conifers. */
const CANOPY = { start: 120, full: 260, tint: [.72, .9, .66], belt: 165, spacing: 9.5 } as const;
/** Furthest point of the backdrop from the world centre (square corner). */
export const HORIZON_REACH = (half: number) => (half + HORIZON_RINGS[HORIZON_RINGS.length - 1]) * Math.SQRT2;

const ridged = (x: number, z: number, scale: number, seed: number) =>
  1 - Math.abs(landscapeNoise(x / scale, z / scale, seed) * 2 - 1);

/** Biome silhouette that grows with the distance `d` beyond the playable border. */
function backdrop(planet: string, seed: number, x: number, z: number, d: number): number {
  const rise = smoothstep(25, 520, d);
  const far = smoothstep(380, 1000, d);
  const broad = landscapeNoise(x / 210, z / 210, seed + 611);
  if (planet === DESERT_ID) {
    // Mesas: flat tops with steep flanks and a second terrace, low dunes in front.
    const mesa = landscapeNoise(x / 240, z / 240, seed + 623);
    const plateau = smoothstep(.5, .56, mesa) * (26 + 30 * landscapeNoise(x / 90, z / 90, seed + 629));
    const terrace = smoothstep(.62, .66, mesa) * 20;
    const dunes = 3.5 * Math.sin((x * .6 + z * .8) / 23 + broad * 6) * smoothstep(10, 120, d);
    return rise * (6 + plateau + terrace) + dunes + far * 46 * ridged(x, z, 420, seed + 631) ** 1.5;
  }
  if (planet === ICE_ID) {
    // Glacier walls and jagged peaks well above the play area.
    return rise * (14 + 46 * broad) + far * (60 + 190 * ridged(x, z, 260, seed + 641) ** 2.2);
  }
  if (planet === FOREST_ID) {
    return rise * (16 + 44 * ridged(x, z, 170, seed + 651)) + far * 58 * ridged(x, z, 300, seed + 653) ** 1.5;
  }
  // Rolling grassland hills with a low blue range at the skyline.
  return rise * (8 + 34 * broad) + far * 72 * ridged(x, z, 330, seed + 661) ** 2;
}

/** Ground height of the backdrop. Continuous with the playable heightfield at its border. */
export function horizonHeight(planet: string, seed: number, field: Heightfield, x: number, z: number): number {
  const { half } = field;
  const d = Math.max(0, Math.max(Math.abs(x), Math.abs(z)) - half);
  const edge = terrainHeight(field, Math.max(-half, Math.min(half, x)), Math.max(-half, Math.min(half, z)));
  const foothills = (landscapeNoise(x / 70, z / 70, seed + 601) * 2 - 1) * 6 * smoothstep(0, 60, d);
  return edge * (1 - smoothstep(0, 140, d)) + foothills + backdrop(planet, seed, x, z, d);
}

/**
 * Decorative terrain outside the playable square, out to the skyline. It shares the planet ground material and its
 * long-range haze, has no collision and casts no shadows.
 */
export function createPlanetHorizon(planet: string, seed: number, field: Heightfield, material: T.Material): T.Mesh {
  const { half, step } = field;
  const side = Math.round(half * 2 / step);
  const ring = side * 4;
  const count = HORIZON_RINGS.length * ring;
  const positions = new Float32Array(count * 3);
  const heightAt = (x: number, z: number) => horizonHeight(planet, seed, field, x, z);
  const fieldAt = fieldSampler(field);
  for (const [k, offset] of HORIZON_RINGS.entries()) {
    const radius = half + offset;
    for (let i = 0; i < ring; i++) {
      const edge = Math.floor(i / side), t = (i % side) / side * 2 * radius - radius;
      const [x, z] = edge === 0 ? [t, -radius] : edge === 1 ? [radius, t] : edge === 2 ? [-t, radius] : [-radius, -t];
      const index = k * ring + i;
      // The seam ring reuses the exact heightfield vertices so no gap opens along the border.
      const y = k === 0 ? terrainVertex(field, Math.round((x + half) / step), Math.round((z + half) / step)) : heightAt(x, z);
      positions.set([x, y, z], index * 3);
    }
  }
  const indices: number[] = [];
  for (let k = 0; k + 1 < HORIZON_RINGS.length; k++) for (let i = 0; i < ring; i++) {
    const a = k * ring + i, b = k * ring + (i + 1) % ring, c = a + ring, d = b + ring;
    indices.push(a, b, c, b, d, c);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal') as T.BufferAttribute;
  const weights = new Float32Array(count * 4), tones = new Float32Array(count), macro = new Float32Array(count * 3);
  const tint = [0, 0, 0];
  const forest = planet === FOREST_ID;
  for (let index = 0; index < count; index++) {
    const x = positions[index * 3], y = positions[index * 3 + 1], z = positions[index * 3 + 2];
    let grade: number;
    if (index < ring) {
      const [dx, dz] = terrainVertexSlope(field, Math.round((x + half) / step), Math.round((z + half) / step));
      const length = Math.hypot(dx, 1, dz);
      normals.setXYZ(index, -dx / length, 1 / length, -dz / length);
      grade = Math.hypot(dx, dz);
    } else {
      const ny = Math.max(.05, normals.getY(index));
      grade = Math.hypot(normals.getX(index), normals.getZ(index)) / ny;
    }
    const sample = surfaceSample(planet, seed, field, x, z, y, grade);
    const relief = index < ring ? localRelief(y, fieldAt, x, z) : localRelief(y, heightAt, x, z);
    macroTint(planet, seed, x, z, relief, tint);
    const canopy = forest ? smoothstep(CANOPY.start, CANOPY.full, Math.max(Math.abs(x), Math.abs(z)) - half) *
      (1 - sample.weights[3]) : 0;
    if (canopy > 0) {
      // Distant forest reads as a dark moss-green canopy; exposed rock stays bare.
      const [floor, moss, litter, rock] = sample.weights;
      sample.weights = [floor * (1 - canopy), moss + (floor + litter) * canopy, litter * (1 - canopy), rock];
      for (let i = 0; i < 3; i++) tint[i] *= 1 + (CANOPY.tint[i] - 1) * canopy;
    }
    weights.set(sample.weights, index * 4);
    tones[index] = sample.tone;
    macro.set(tint, index * 3);
  }
  geometry.setAttribute('surfaceWeights', new T.BufferAttribute(weights, 4));
  geometry.setAttribute('surfaceTone', new T.BufferAttribute(tones, 1));
  geometry.setAttribute('surfaceMacro', new T.BufferAttribute(macro, 3));
  geometry.computeBoundingSphere();
  geometry.name = 'planet-horizon';
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Planet horizon';
  mesh.castShadow = false;
  // Matches the terrain along the seam; fragments outside the shadow camera stay lit.
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Distant conifers on the forest backdrop, from the border out to `CANOPY.belt` metres. One instanced draw; instances are
 * in random order so a lower graphics tier can show a uniform prefix.
 */
export function createForestBelt(seed: number, field: Heightfield, crown: T.BufferGeometry, material: T.Material): T.InstancedMesh {
  const { half } = field;
  const reach = half + CANOPY.belt, spacing = CANOPY.spacing;
  const random = randomSource(seed ^ 0x5f0e57);
  const trees: { x: number; z: number; rank: number }[] = [];
  for (let z = -reach; z <= reach; z += spacing) for (let x = -reach; x <= reach; x += spacing) {
    const px = x + (random() - .5) * spacing * .9, pz = z + (random() - .5) * spacing * .9;
    const d = Math.max(Math.abs(px), Math.abs(pz)) - half;
    if (d < 3 || d > CANOPY.belt) continue;
    // Clumps and small clearings; thinning toward the far edge where the canopy tint takes over.
    if (landscapeNoise(px / 46, pz / 46, seed + 671) < .38 + .2 * smoothstep(60, CANOPY.belt, d)) continue;
    trees.push({ x: px, z: pz, rank: random() });
  }
  trees.sort((a, b) => a.rank - b.rank);
  const mesh = new T.InstancedMesh(crown, material, trees.length);
  const transform = new T.Object3D(), color = new T.Color();
  for (const [i, { x, z }] of trees.entries()) {
    const height = 8.5 + random() * 6;
    const width = height * (.21 + random() * .08);
    transform.position.set(x, horizonHeight(FOREST_ID, seed, field, x, z) - .3, z);
    transform.rotation.set(0, random() * Math.PI * 2, 0);
    transform.scale.set(width, height, width);
    transform.updateMatrix();
    mesh.setMatrixAt(i, transform.matrix);
    mesh.setColorAt(i, color.setScalar(.66 + random() * .34));
  }
  mesh.computeBoundingSphere();
  mesh.name = 'Forest horizon belt';
  mesh.castShadow = mesh.receiveShadow = false;
  return mesh;
}
