import { DESERT_ID, FOREST_ID, GREEN_PLAINS_ID, ICE_ID } from './PlanetProfiles.ts';
import { terrainVertex } from './Terrain.ts';
import type { Heightfield } from './Terrain.ts';
import type { WorldDefinition } from '../definitions/missions.ts';
import { landscapeNoise, smoothstep } from './SurfaceNoise.ts';

export type SurfaceFinish = 'snow' | 'ice' | 'frost' | 'rock' | 'sand' | 'hardpan' | 'gravel' |
  'grass' | 'earth' | 'forest-floor' | 'moss' | 'litter' | 'bark';
type SurfaceLayer = readonly [finish: SurfaceFinish, color: number, roughness: number, metres: number];
type Layers = readonly [SurfaceLayer, SurfaceLayer, SurfaceLayer, SurfaceLayer];

export const PLANET_SURFACES: Readonly<Record<string, Layers>> = {
  [ICE_ID]: [
    ['snow', 0xbac5cb, .93, 2.65], ['ice', 0x708e9d, .29, 5.2],
    ['frost', 0x83949e, .62, 3.9], ['rock', 0x5c6670, .88, 4.6],
  ],
  [DESERT_ID]: [
    ['sand', 0xae8d62, .90, 3.9], ['hardpan', 0x987351, .84, 3.25],
    ['gravel', 0x806345, .94, 3.5], ['rock', 0x795b48, .91, 4.8],
  ],
  [GREEN_PLAINS_ID]: [
    ['grass', 0x667246, .94, 2.9], ['earth', 0x5e503c, .91, 3.25],
    ['gravel', 0x757066, .91, 3.5], ['rock', 0x74736a, .90, 4.6],
  ],
  [FOREST_ID]: [
    ['forest-floor', 0x534935, .94, 3.7], ['moss', 0x59633e, .90, 3.1],
    ['litter', 0x705742, .95, 3.6], ['rock', 0x64675d, .89, 4.6],
  ],
};

export function surfaceSample(planet: string, seed: number, field: Heightfield, x: number, z: number,
  height: number, grade: number): { weights: [number, number, number, number]; tone: number } {
  const patch = landscapeNoise(x * .040, z * .040, seed);
  const broken = landscapeNoise(x * .125, z * .125, seed + 87);
  const altitude = (height - field.minHeight) / Math.max(1, field.maxHeight - field.minHeight);
  const slope = grade / field.allowedGrade;
  const ice = planet === ICE_ID;
  const rock = smoothstep(.39, .89, slope + (broken - .46) * .52 + (altitude - .5) * .14);
  const other = smoothstep(.42, .68, patch + (ice ? (.48 - altitude) * .43 - slope * .20 : 0));
  const accent = smoothstep(.50, .73, broken + (ice ? other * .13 + slope * .13 : slope * .15));
  const cover = 1 - rock;
  return {
    weights: [
      cover * (1 - accent) * (1 - other),
      cover * (1 - accent) * other,
      cover * accent,
      rock,
    ],
    tone: .78 + patch * .33 + broken * .18,
  };
}

export const ENVIRONMENT_CATALOG_VERSION = 2;

export function detailSeed(world: WorldDefinition): number {
  return (Number.parseInt(world.id.slice(-8), 16) ^ Math.imul(ENVIRONMENT_CATALOG_VERSION, 0x3b9aca07)) >>> 0;
}

/** Uses the same central differences as the rendered vertex weights. */
export function terrainVertexSlope(field: Heightfield, ix: number, iz: number): [number, number] {
  return [
    (terrainVertex(field, Math.min(field.cells, ix + 1), iz) - terrainVertex(field, Math.max(0, ix - 1), iz)) / (field.step * 2),
    (terrainVertex(field, ix, Math.min(field.cells, iz + 1)) - terrainVertex(field, ix, Math.max(0, iz - 1))) / (field.step * 2),
  ];
}

/** Interpolate the same vertex weights along the same diagonal as the close terrain mesh. */
export function dominantTerrainFinish(world: WorldDefinition, x: number, z: number): SurfaceFinish | undefined {
  const field = world.terrain;
  const planet = world.planetId;
  const layers = planet && Object.hasOwn(PLANET_SURFACES, planet) ? PLANET_SURFACES[planet] : undefined;
  if (!field || !planet || !layers) return;
  const u = Math.max(0, Math.min(field.cells, (x + field.half) / field.step));
  const v = Math.max(0, Math.min(field.cells, (z + field.half) / field.step));
  const ix = Math.min(field.cells - 1, Math.floor(u)), iz = Math.min(field.cells - 1, Math.floor(v));
  const fx = u - ix, fz = v - iz;
  const seed = detailSeed(world);
  const weights = (vx: number, vz: number) => surfaceSample(planet, seed, field, vx * field.step - field.half,
    vz * field.step - field.half, terrainVertex(field, vx, vz), Math.hypot(...terrainVertexSlope(field, vx, vz))).weights;
  const lower = fx + fz <= 1;
  const a = lower ? weights(ix, iz) : weights(ix + 1, iz + 1);
  const b = weights(ix + 1, iz), c = weights(ix, iz + 1);
  const wb = lower ? fx : 1 - fz, wc = lower ? fz : 1 - fx;
  let dominant = 0, best = -1;
  for (let i = 0; i < layers.length; i++) {
    const weight = a[i] * (1 - wb - wc) + b[i] * wb + c[i] * wc;
    // Prefer the earlier layer when the blend is nearly balanced.
    if (weight > best + .025) { best = weight; dominant = i; }
  }
  return layers[dominant][0];
}
