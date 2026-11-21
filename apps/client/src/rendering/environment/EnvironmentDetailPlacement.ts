import {
  detailSeed, ENVIRONMENT_CATALOG_VERSION, DESERT_ID, FOREST_ID, GREEN_PLAINS_ID, ICE_ID, groundHeight, nearbyObstacles, openGround, worldChunkId, worldNoise,
} from '@freefall/shared';
import type { Circle, PositionXZ, WorldDefinition } from '@freefall/shared';
import { landscapeNoise } from './noise.ts';
import { surfaceSample } from './PlanetSurfaces.ts';

export { detailSeed, ENVIRONMENT_CATALOG_VERSION } from '@freefall/shared';

export const DETAIL_ASSETS = {
  'drift':    { category: 'surface-detail', radius: .52, maxGrade: .20, height: .10, colors: [0xb4c3ca, 0xc7d1d4] },
  'ice-chip': { category: 'biome-decoration', radius: .24, maxGrade: .32, height: .22, colors: [0x7093a4, 0x9eb5c2] },
  'scree':    { category: 'rock-detail', radius: .28, maxGrade: .42, height: .15, colors: [0x867b65, 0x9b907b] },
  'pebble':   { category: 'small-ground-prop', radius: .15, maxGrade: .37, height: .09, colors: [0x786c5a, 0x98917d] },
  'scrub':    { category: 'vegetation', radius: .32, maxGrade: .25, height: .28, colors: [0x837751, 0x9a865c] },
  'grass':    { category: 'vegetation', radius: .30, maxGrade: .29, height: .31, colors: [0x6c7846, 0x8a8c55] },
  'forb':     { category: 'vegetation', radius: .26, maxGrade: .27, height: .26, colors: [0x5e7046, 0x828851] },
  'fern':     { category: 'vegetation', radius: .53, maxGrade: .29, height: .41, colors: [0x586c43, 0x778952] },
  'litter':   { category: 'surface-detail', radius: .29, maxGrade: .30, height: .05, colors: [0x644c39, 0x926f52] },
  'deadwood': { category: 'landmark-decoration', radius: .56, maxGrade: .22, height: .14, colors: [0x594635, 0x796350] },
} as const;

export type DetailAssetId = keyof typeof DETAIL_ASSETS;
type Density = 'small' | 'vegetation' | 'surface' | 'landmark';
interface DensityProfile {
  readonly small: number;
  readonly vegetation: number;
  readonly surface: number;
  readonly landmark: number;
  readonly cluster: number;
  readonly families: Readonly<Record<Density, readonly DetailAssetId[]>>;
}

/** Maximum candidate counts per 60 m chunk. Large and medium solids use the 7.6 world profile. */
export const DETAIL_DENSITY: Readonly<Record<string, DensityProfile>> = {
  [ICE_ID]: { small: 112, vegetation: 0, surface: 112, landmark: 20, cluster: .41,
    families: { small: ['ice-chip', 'scree'], vegetation: [], surface: ['drift'], landmark: ['ice-chip'] } },
  [DESERT_ID]: { small: 230, vegetation: 85, surface: 0, landmark: 38, cluster: .52,
    families: { small: ['pebble', 'scree'], vegetation: ['scrub'], surface: [], landmark: ['scree'] } },
  [GREEN_PLAINS_ID]: { small: 155, vegetation: 705, surface: 0, landmark: 20, cluster: .42,
    families: { small: ['pebble', 'scree'], vegetation: ['grass', 'forb'], surface: [], landmark: ['scree'] } },
  [FOREST_ID]: { small: 125, vegetation: 330, surface: 245, landmark: 104, cluster: .44,
    families: { small: ['pebble'], vegetation: ['fern', 'forb'], surface: ['litter'], landmark: ['deadwood'] } },
};

const STREAMS = ['small', 'vegetation', 'surface', 'landmark'] as const;
const EDGE = .6;
const ROUTE_CLEARANCE = 1.4;
const SITE_PAD = 1.25;
const MIN_SCALE = .63;
const SCALE_RANGE = .52;
const LANDMARK_RANGE = 7;

export interface EnvironmentDetail extends PositionXZ {
  readonly id: string;
  readonly chunk: string;
  readonly asset: DetailAssetId;
  readonly y: number;
  readonly grade: number;
  readonly dx: number;
  readonly dz: number;
  readonly yaw: number;
  readonly scale: number;
  readonly tint: number;
  readonly rank: number;
}

export function detailClearances(world: WorldDefinition, sites: readonly Circle[]): Circle[] {
  return [world.deployment, ...(world.serviceApron ? [world.serviceApron] : []), ...sites,
    ...world.initialNests.map(({ x, z }) => ({ x, z, radius: 12 })), ...world.breachRegions, ...world.patrolRegions];
}

function routeDistanceSquared(x: number, z: number, a: PositionXZ, b: PositionXZ): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const span = dx * dx + dz * dz;
  const t = span ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / span)) : 0;
  return (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2;
}

/** Read-only extension of an existing world chunk. No authority or quality setting enters placement. */
export function placeChunkDetails(world: WorldDefinition, sites: readonly Circle[], col: number, row: number,
  width: number): EnvironmentDetail[] {
  const field = world.terrain;
  const planet = world.planetId;
  if (!field || !planet || !DETAIL_DENSITY[planet]) return [];
  const config = DETAIL_DENSITY[planet], seed = detailSeed(world);
  const chunk = worldChunkId(world.id, col, row);
  const streamSeed = Math.floor(worldNoise(seed, col, row) * 0x100000000);
  const x0 = col * width - field.half, z0 = row * width - field.half;
  const result: EnvironmentDetail[] = [];
  for (const [stream, density] of STREAMS.entries()) {
    const budget = config[density];
    const grid = Math.ceil(Math.sqrt(budget));
    const step = (width - EDGE * 2) / grid;
    for (let i = 0; i < budget; i++) {
      const roll = (lane: number) => worldNoise(streamSeed, i, stream * 13 + lane);
      // Scramble the order of the partial last row, keeping density uniform across the chunk.
      const cell = (i + Math.floor(worldNoise(streamSeed, stream, 71) * grid * grid)) % (grid * grid);
      const x = x0 + EDGE + (cell % grid + .14 + roll(0) * .72) * step;
      const z = z0 + EDGE + (Math.floor(cell / grid) + .14 + roll(1) * .72) * step;
      const cluster = landscapeNoise(x * .092, z * .092, seed + 41);
      if (density === 'vegetation' && cluster < config.cluster + (roll(2) - .5) * .12) continue;
      const adjacent = density === 'landmark' && nearbyObstacles(world, x, z, LANDMARK_RANGE).some((obstacle) => {
        const dx = Math.max(0, Math.abs(x - obstacle.x) - obstacle.halfX);
        const dz = Math.max(0, Math.abs(z - obstacle.z) - obstacle.halfZ);
        return dx * dx + dz * dz < LANDMARK_RANGE ** 2;
      });
      if (density === 'landmark' && !adjacent) continue;

      const span = .35;
      const y = groundHeight(world, x, z);
      const dx = (groundHeight(world, x + span, z) - groundHeight(world, x - span, z)) / (span * 2);
      const dz = (groundHeight(world, x, z + span) - groundHeight(world, x, z - span)) / (span * 2);
      const grade = Math.hypot(dx, dz);
      const { weights } = surfaceSample(planet, seed, field, x, z, y, grade);
      const variants = config.families[density];
      const variant = variants.length > 1 && roll(3) < (density === 'vegetation' ? .14 + weights[1] * .64 :
        .25 + weights[2] * .43 + weights[3] * .28) ? 1 : 0;
      const asset = variants[variant];
      const info = DETAIL_ASSETS[asset];
      if (grade > info.maxGrade || (density === 'vegetation' && weights[3] > .36) ||
          (asset === 'drift' && weights[0] < .39) ||
          (asset === 'fern' && weights[0] + weights[1] < .58)) continue;
      const scale = MIN_SCALE + roll(4) * SCALE_RANGE;
      const clearance = info.radius * scale;
      if (!openGround(world, x, z, clearance) ||
          sites.some((site) => (x - site.x) ** 2 + (z - site.z) ** 2 < (site.radius + clearance + SITE_PAD) ** 2) ||
          world.patrolRegions.some(({ route: { waypoints } }) => waypoints.some((a, index) =>
            routeDistanceSquared(x, z, a, waypoints[(index + 1) % waypoints.length]) < (ROUTE_CLEARANCE + clearance) ** 2))) continue;
      result.push({ id: chunk + '/' + ENVIRONMENT_CATALOG_VERSION + '/' + density + '/' + i,
        chunk, asset, x, y, z, dx, dz, grade, yaw: roll(5) * Math.PI * 2, scale, tint: roll(6), rank: roll(7) });
    }
  }
  return result.sort((a, b) => a.rank - b.rank);
}
