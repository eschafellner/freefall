import { balanceHash } from '../balance/index.ts';
import type { PositionXZ } from '../config/movement.ts';
import type { Circle, Obstacle, WorldDefinition } from '../definitions/missions.ts';
import type { Heightfield } from './Terrain.ts';
import { terrainHeight } from './Terrain.ts';
import { DESERT_ID, FOREST_ID, GREEN_PLAINS_ID, ICE_ID, WORLD_PROFILES } from './PlanetProfiles.ts';
import type { PlanetProfile } from './PlanetProfiles.ts';

export const WORLD_GENERATOR_VERSION = 1;
export const WORLD_PLAN_VERSION = 1;
export const WORLD_ASSET_VERSION = 1;
export interface WorldIdentity {
  readonly id: string;
  readonly planetId: string;
  readonly biome: string;
  readonly seed: number;
  readonly formatVersion: number;
  readonly generatorVersion: number;
  readonly profileVersion: number;
  readonly assetVersion: number;
}

export interface WorldPlan {
  readonly identity: WorldIdentity;
  readonly world: WorldDefinition & { terrain: Heightfield };
  readonly chunkCells: number;
  readonly relays: readonly Circle[];
  readonly balloonSites: readonly Circle[];
}

export function isWorldSeed(seed: unknown): seed is number {
  return typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff;
}

export function worldNoise(seed: number, x: number, z: number): number {
  let hash = seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0x100000000;
}

const blend = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

// Preserve the v1 server's normalized length calculation for hashed terrain and collider data.
// Math.hypot is implementation-approximated and can round differently in a browser.
function worldLength(x: number, z: number): number {
  const scale = Math.max(Math.abs(x), Math.abs(z));
  if (scale === 0) return 0;
  const nx = x / scale, nz = z / scale;
  return Math.sqrt(nx * nx + nz * nz) * scale;
}

function valueNoise(seed: number, x: number, z: number, scale: number): number {
  const u = x / scale, v = z / scale;
  const ix = Math.floor(u), iz = Math.floor(v);
  const sx = smooth(u - ix), sz = smooth(v - iz);
  return blend(blend(worldNoise(seed, ix, iz), worldNoise(seed, ix + 1, iz), sx),
    blend(worldNoise(seed, ix, iz + 1), worldNoise(seed, ix + 1, iz + 1), sx), sz) * 2 - 1;
}

function createTerrain(profile: PlanetProfile, seed: number, flat: readonly Circle[]): Heightfield {
  const { id, half, step, grade, relief } = profile;
  const bearing = worldNoise(seed, 0, 15) * Math.PI * 2;
  const sin = Math.sin(bearing), cos = Math.cos(bearing);
  const cells = half * 2 / step, stride = cells + 1;
  const heights = new Array<number>(stride * stride);
  for (let iz = 0; iz < stride; iz++) {
    const z = iz * step - half;
    for (let ix = 0; ix < stride; ix++) {
      const x = ix * step - half;
      const warp = valueNoise(seed ^ 0x6b7e, x, z, 95) * 14;
      const broad = valueNoise(seed, x + warp, z, 115);
      const middle = valueNoise(seed ^ 0x41e7, x, z + warp, 45);
      let y = relief[0] * broad + relief[1] * middle + relief[2] * valueNoise(seed ^ 0x192, x, z, 16);
      const along = x * cos + z * sin, across = z * cos - x * sin;
      if (id === DESERT_ID) {
        const ridge = Math.sin((across + 13 * middle) / 15);
        const canyon = Math.max(0, 1 - Math.abs(across - 58 - 25 * broad) / 31);
        y += (ridge * .77 + ridge ** 3 * .23) * 3.5 - 16 * smooth(canyon) + 7 * smooth(Math.max(0, broad));
      } else if (id === ICE_ID) {
        const tongue = Math.max(0, 1 - Math.abs(across + 46 + 24 * broad) / 64);
        y += 13 * smooth(tongue) + 7 * smooth(Math.max(0, Math.min(1, (along + middle * 44) / 71)));
      }
      for (const site of flat) {
        const range = worldLength(x - site.x, z - site.z) - site.radius;
        if (range >= 30) continue;
        const target = site === flat[0] ? 0 : relief[0] * valueNoise(seed, site.x, site.z, 115);
        y = blend(target, y, smooth(Math.max(0, range / 30)));
      }
      heights[iz * stride + ix] = y;
    }
  }
  const maximumGrade = () => {
    let maximum = 0;
    for (let z = 0; z < cells; z++) for (let x = 0; x < cells; x++) {
      const i = z * stride + x, a = heights[i], b = heights[i + 1], c = heights[i + stride], d = heights[i + stride + 1];
      maximum = Math.max(maximum, (b - a) ** 2 + (c - a) ** 2, (d - c) ** 2 + (d - b) ** 2);
    }
    return Math.sqrt(maximum) / step;
  };
  const scale = Math.min(1, (grade - .008) / maximumGrade());
  let minHeight = Infinity, maxHeight = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    const cm = Math.round(heights[i] * scale * 100) || 0;
    heights[i] = cm * .01;
    minHeight = Math.min(minHeight, heights[i]);
    maxHeight = Math.max(maxHeight, heights[i]);
  }
  return { half, step, cells, minHeight, maxHeight, maxGrade: maximumGrade(), allowedGrade: grade,
    heightsCm: heights.map((height) => Math.round(height * 100)) };
}

function jitter(seed: number, slot: number, x: number, z: number, range: number): PositionXZ {
  return { x: x + Math.round((worldNoise(seed, slot, 0) * 2 - 1) * range),
    z: z + Math.round((worldNoise(seed, slot, 1) * 2 - 1) * range) };
}

export function generateWorld(planetId: string, seed: number): WorldPlan | undefined {
  const profile = WORLD_PROFILES.get(planetId);
  if (!profile || !isWorldSeed(seed)) return;
  const { version, biome, half, chunkCells } = profile;
  const deployment = { ...jitter(seed, 0, -146, 156, 12), radius: 25, facing: .4 };
  const relays = [[-122, -14], [78, -134], [144, 32]].map(([x, z], i) => ({ ...jitter(seed, i + 1, x, z, 12), radius: 5 }));
  const balloonSites = [[-64, -164], [149, 141]].map(([x, z], i) => ({ ...jitter(seed, i + 4, x, z, 10), radius: 6 }));
  const nest = jitter(seed, 6, 0, 63, 16);
  const initialNests = [nest];
  const breachRegions = Array.from({ length: 16 }, (_, i) => ({
    ...jitter(seed, i + 10, -176 + (i % 4) * 113, -181 + Math.floor(i / 4) * 118, 9),
    id: 'sector-' + i, radius: 14,
  }));
  const patrolRegions = breachRegions.filter((_, i) => i % 2 === 0).map(({ x, z, radius }, i) => ({
    id: 'patrol-' + i, x, z, radius,
    route: { waypoints: [{ x: x - 14, z }, { x, z: z - 14 }, { x: x + 14, z }, { x, z: z + 14 }] },
  }));
  const terrain = createTerrain(profile, seed, [deployment, ...relays, ...balloonSites, { ...nest, radius: 8 }]);
  const reserved = [deployment, ...relays, ...balloonSites, { ...nest, radius: 12 }, ...breachRegions];
  const obstacles: Obstacle[] = [];
  for (let i = 0; i < profile.solidCount * 13 && obstacles.length < profile.solidCount; i++) {
    const { x, z } = jitter(seed ^ 0x9b12, i, 0, 0, 216);
    const forest = planetId === FOREST_ID;
    const large = obstacles.length < 3;
    const tree = planetId === GREEN_PLAINS_ID ? !large && obstacles.length % 3 === 0 : forest && obstacles.length % 12 !== 1;
    if (forest && !large && valueNoise(seed ^ 0x73da, x, z, 58) < -.04) continue;
    const ice = planetId === ICE_ID && obstacles.length % 3 !== 2;
    const halfX = tree ? (large ? .86 : .38 + worldNoise(seed, i, 7) * .22) :
      (large ? 4.6 : 1.2) + worldNoise(seed, i, 3) * 2.3;
    const halfZ = halfX * (.72 + worldNoise(seed, i, 5) * .35);
    const width = worldLength(halfX, halfZ);
    if (reserved.some((site) => worldLength(site.x - x, site.z - z) < site.radius + width + 7) ||
        obstacles.some((other) => worldLength(other.x - x, other.z - z) < other.halfX + width + (forest ? 3.5 : 6))) continue;
    const ground = terrainHeight(terrain, x, z);
    const arc = planetId === DESERT_ID && obstacles.length === 0;
    if (arc) {
      // The center remains a traversable opening. The side piers are the rock collision proxies.
      for (const offset of [-4.1, 4.1]) {
        const y = terrainHeight(terrain, x + offset, z);
        obstacles.push({ x: x + offset, z, halfX: 1.6, halfZ: 2, bottom: y - 1.4, height: y + 6.8, kind: 'arch-pier' });
      }
      const beam = Math.max(ground, ...obstacles.slice(-2).map(({ height }) => height - 6.8));
      obstacles.push({ x, z, halfX: 2.35, halfZ: 1.55, bottom: beam + 5.65, height: beam + 7.45, kind: 'arch-span' });
      continue;
    }
    obstacles.push({ x, z, halfX, halfZ, bottom: ground - width * .46,
      height: ground + (tree ? large ? 6 : 3.5 : ice ? halfX * 1.44 : halfX * .95), kind: tree ? 'tree' : ice ? 'ice' : 'rock' });
  }
  const configuration = { planetId, biome, seed, formatVersion: WORLD_PLAN_VERSION, generatorVersion: WORLD_GENERATOR_VERSION,
    profileVersion: version, assetVersion: WORLD_ASSET_VERSION };
  const content = { half, terrain, planetId, deployment, obstacles, patrolRegions, breachRegions, initialNests };
  const id = 'world.generated.' + balanceHash([configuration, content, relays, balloonSites, chunkCells]);
  return { identity: { id, ...configuration }, world: { id, ...content }, chunkCells, relays, balloonSites };
}

export function restoreWorld(identity: WorldIdentity): WorldPlan | undefined {
  const plan = generateWorld(identity.planetId, identity.seed);
  const expected = plan?.identity;
  if (expected && expected.id === identity.id && expected.biome === identity.biome &&
      expected.formatVersion === identity.formatVersion && expected.generatorVersion === identity.generatorVersion &&
      expected.profileVersion === identity.profileVersion && expected.assetVersion === identity.assetVersion) return plan;
}

export function worldChunkId(worldId: string, x: number, z: number): string {
  return worldId + '/' + x + '/' + z;
}
