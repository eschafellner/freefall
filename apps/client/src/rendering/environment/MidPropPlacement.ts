import {
  DESERT_ID, FOREST_ID, GREEN_PLAINS_ID, ICE_ID, detailSeed, groundHeight, landscapeNoise, openGround,
  worldChunkId, worldNoise,
} from '@freefall/shared';
import type { Circle, Obstacle, PositionXZ, WorldDefinition } from '@freefall/shared';
import { surfaceSample } from './PlanetSurfaces.ts';
import { MID_PROPS } from './MidPropAssets.ts';
import type { MidPropId } from './MidPropAssets.ts';

/** Version of the mid-prop rules and catalogue; part of every placement ID. */
export const MID_PROP_CATALOG_VERSION = 1;

type Weights = readonly [number, number, number, number];
/** Free-standing family: candidates per 60 m chunk, optional patch noise and a surface preference (0–1). */
interface Scatter {
  readonly asset: MidPropId;
  readonly budget: number;
  readonly patch?: readonly [metres: number, threshold: number];
  readonly surface?: (weights: Weights) => number;
  readonly scale: readonly [min: number, max: number];
  /** Minimum distance to the nearest tree trunk (clearings) or maximum distance (undergrowth). */
  readonly trees?: readonly [min: number, max: number];
}
/** Props gathered around a physical solid: rock skirts, root flares, lee-side snow drifts. */
interface Skirt {
  readonly kinds: readonly Obstacle['kind'][];
  readonly asset: MidPropId;
  readonly count: readonly [min: number, max: number];
  /** Distance of the prop centre beyond the footprint edge, in metres. */
  readonly ring: readonly [inner: number, outer: number];
  readonly scale: readonly [min: number, max: number];
  /** Place downwind of the solid, stretched along the wind. */
  readonly lee?: boolean;
  /** Fraction of the asset radius that must stay clear of solids (low values let the prop hug the solid). */
  readonly hug?: number;
}
interface MidProfile { readonly scatter: readonly Scatter[]; readonly skirts: readonly Skirt[]; readonly wind: number }

const grassy = (w: Weights) => w[0] + w[1] * .6;
/** Prevailing wind bearing per planet (world XZ, radians); matches the weather profiles' base direction. */
export const MID_PROFILES: Readonly<Record<string, MidProfile>> = {
  [GREEN_PLAINS_ID]: {
    wind: 2.6,
    scatter: [
      { asset: 'tall-grass', budget: 420, patch: [44, .42], surface: grassy, scale: [.7, 1.12] },
      { asset: 'meadow', budget: 110, patch: [26, .52], surface: grassy, scale: [.8, 1.3] },
      { asset: 'bush', budget: 30, patch: [70, .45], surface: (w) => 1 - w[3], scale: [.65, 1.25] },
      { asset: 'boulders', budget: 5, surface: (w) => .3 + w[2] + w[3], scale: [.6, 1.2] },
    ],
    skirts: [
      { kinds: ['rock'], asset: 'boulders', count: [2, 4], ring: [.2, 2.4], scale: [.5, 1], hug: .4 },
      { kinds: ['rock'], asset: 'tall-grass', count: [3, 6], ring: [.4, 3.5], scale: [.8, 1.3] },
      { kinds: ['tree'], asset: 'roots', count: [1, 1], ring: [-.6, -.6], scale: [.8, 1.1], hug: 0 },
      { kinds: ['tree'], asset: 'bush', count: [1, 2], ring: [.8, 2.5], scale: [.6, 1] },
      { kinds: ['tree'], asset: 'tall-grass', count: [3, 5], ring: [.6, 3], scale: [.8, 1.2] },
    ],
  },
  [DESERT_ID]: {
    wind: .6,
    scatter: [
      { asset: 'dune-grass', budget: 100, patch: [34, .46], surface: (w) => w[0] + w[1] * .4, scale: [.7, 1.25] },
      { asset: 'dry-bush', budget: 26, patch: [55, .46], surface: (w) => w[1] + w[2] + w[0] * .3, scale: [.6, 1.2] },
      { asset: 'succulent', budget: 9, patch: [80, .5], surface: (w) => w[1] + w[2], scale: [.65, 1.15] },
      { asset: 'sandstone', budget: 11, surface: (w) => .25 + w[2] + w[3] * 1.5, scale: [.6, 1.3] },
    ],
    skirts: [
      { kinds: ['rock', 'arch-pier'], asset: 'sandstone', count: [2, 4], ring: [.1, 2.2], scale: [.5, 1.1], hug: .35 },
      { kinds: ['rock'], asset: 'dune-grass', count: [1, 3], ring: [.6, 3], scale: [.7, 1.1], lee: true },
      { kinds: ['rock'], asset: 'dry-bush', count: [0, 2], ring: [.5, 2.5], scale: [.6, 1] },
    ],
  },
  [ICE_ID]: {
    wind: 5.9,
    scatter: [
      { asset: 'snow-mound', budget: 34, patch: [60, .42], surface: (w) => w[0] + w[2] * .5, scale: [.6, 1.4] },
      { asset: 'ice-shards', budget: 18, patch: [45, .5], surface: (w) => w[1] + w[2], scale: [.6, 1.3] },
      { asset: 'frost-rock', budget: 11, surface: (w) => .2 + w[3] + w[2] * .5, scale: [.6, 1.25] },
    ],
    skirts: [
      { kinds: ['ice', 'rock'], asset: 'snow-mound', count: [1, 2], ring: [.3, 1.4], scale: [.9, 1.5], lee: true, hug: .1 },
      { kinds: ['ice'], asset: 'ice-shards', count: [1, 3], ring: [.1, 1.8], scale: [.5, 1], hug: .3 },
      { kinds: ['rock'], asset: 'frost-rock', count: [1, 3], ring: [.1, 2], scale: [.45, .9], hug: .35 },
    ],
  },
  [FOREST_ID]: {
    wind: 3.7,
    scatter: [
      { asset: 'fern-cluster', budget: 110, patch: [30, .44], surface: (w) => w[0] + w[1], scale: [.7, 1.3], trees: [1.2, 14] },
      { asset: 'shrub', budget: 50, patch: [42, .44], surface: (w) => 1 - w[3], scale: [.65, 1.25], trees: [1.5, 18] },
      { asset: 'sapling', budget: 12, patch: [50, .5], surface: (w) => 1 - w[3], scale: [.6, 1.25], trees: [4.5, 40] },
      // Clearings: grass and flowers where the canopy opens.
      { asset: 'tall-grass', budget: 70, patch: [36, .46], surface: (w) => w[0] + w[1], scale: [.55, .95], trees: [5, 60] },
      { asset: 'meadow', budget: 26, patch: [28, .5], surface: (w) => w[0] + w[1], scale: [.7, 1.1], trees: [5, 60] },
      { asset: 'mushrooms', budget: 22, surface: (w) => w[0] + w[2], scale: [.8, 1.4], trees: [.8, 6] },
      { asset: 'log', budget: 4, surface: (w) => 1 - w[3], scale: [.75, 1.2] },
      { asset: 'stump', budget: 5, surface: (w) => 1 - w[3], scale: [.7, 1.2] },
      { asset: 'moss-rock', budget: 4, surface: (w) => .3 + w[3] + w[2], scale: [.6, 1.2] },
    ],
    skirts: [
      { kinds: ['tree'], asset: 'roots', count: [1, 1], ring: [-.55, -.55], scale: [.75, 1.1], hug: 0 },
      { kinds: ['tree'], asset: 'fern-cluster', count: [0, 2], ring: [.6, 2.4], scale: [.7, 1.1] },
      { kinds: ['rock'], asset: 'moss-rock', count: [1, 3], ring: [.1, 2], scale: [.45, .9], hug: .35 },
      { kinds: ['rock'], asset: 'fern-cluster', count: [1, 3], ring: [.4, 2.5], scale: [.7, 1.1] },
    ],
  },
};

const EDGE = .8;
const SITE_PAD = 1.6;
const ROUTE_CLEARANCE = 1.6;

export interface MidPropPlacement extends PositionXZ {
  readonly id: string;
  readonly asset: MidPropId;
  readonly y: number;
  /** Ground tangent (dHeight/dx, dHeight/dz). */
  readonly dx: number;
  readonly dz: number;
  readonly yaw: number;
  readonly scale: number;
  readonly tint: number;
  readonly rank: number;
}

function routeDistanceSquared(x: number, z: number, a: PositionXZ, b: PositionXZ): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const span = dx * dx + dz * dz;
  const t = span ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / span)) : 0;
  return (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2;
}

const footprint = (o: Obstacle) => Math.max(o.halfX, o.halfZ);

/**
 * Deterministic mid-scale decoration of one world chunk. Reads the world only; nothing here reaches the simulation.
 * Skirt props belong to the chunk holding their solid's centre.
 */
export function placeChunkMidProps(world: WorldDefinition, sites: readonly Circle[], col: number, row: number,
  width: number): MidPropPlacement[] {
  const field = world.terrain, planet = world.planetId;
  const profile = planet && MID_PROFILES[planet];
  if (!field || !planet || !profile) return [];
  const seed = detailSeed(world) ^ Math.imul(MID_PROP_CATALOG_VERSION, 0x2c1b3c6d);
  const chunk = worldChunkId(world.id, col, row) + '/mid' + MID_PROP_CATALOG_VERSION;
  const streamSeed = Math.floor(worldNoise(seed, col, row) * 0x100000000);
  const x0 = col * width - field.half, z0 = row * width - field.half;
  const trees = world.obstacles.filter(({ kind }) => kind === 'tree');
  const result: MidPropPlacement[] = [];

  const accept = (id: string, asset: MidPropId, x: number, z: number, scale: number, yaw: number, roll: (lane: number) => number,
    hug = 1): boolean => {
    const info = MID_PROPS[asset];
    const span = .45;
    const y = groundHeight(world, x, z);
    const dx = (groundHeight(world, x + span, z) - groundHeight(world, x - span, z)) / (span * 2);
    const dz = (groundHeight(world, x, z + span) - groundHeight(world, x, z - span)) / (span * 2);
    if (Math.hypot(dx, dz) > info.maxGrade) return false;
    const radius = info.radius * scale;
    if (!openGround(world, x, z, Math.max(.05, radius * hug))) return false;
    if (Math.max(Math.abs(x), Math.abs(z)) > field.half - radius) return false;
    if (sites.some((site) => (x - site.x) ** 2 + (z - site.z) ** 2 < (site.radius + radius + SITE_PAD) ** 2)) return false;
    if (world.patrolRegions.some(({ route: { waypoints } }) => waypoints.some((a, index) =>
      routeDistanceSquared(x, z, a, waypoints[(index + 1) % waypoints.length]) < (ROUTE_CLEARANCE + radius) ** 2))) return false;
    result.push({ id, asset, x, y, z, dx, dz, yaw, scale, tint: roll(6), rank: roll(7) });
    return true;
  };

  for (const [stream, rule] of profile.scatter.entries()) {
    const grid = Math.ceil(Math.sqrt(rule.budget));
    const step = (width - EDGE * 2) / grid;
    for (let i = 0; i < rule.budget; i++) {
      const roll = (lane: number) => worldNoise(streamSeed, i, stream * 17 + lane);
      const cell = (i + Math.floor(worldNoise(streamSeed, stream, 97) * grid * grid)) % (grid * grid);
      const x = x0 + EDGE + (cell % grid + .1 + roll(0) * .8) * step;
      const z = z0 + EDGE + (Math.floor(cell / grid) + .1 + roll(1) * .8) * step;
      if (rule.patch && landscapeNoise(x / rule.patch[0], z / rule.patch[0], seed + 300 + stream * 11) <
        rule.patch[1] + (roll(2) - .5) * .1) continue;
      if (rule.trees) {
        let nearest = Infinity;
        for (const tree of trees) {
          if (Math.abs(tree.x - x) > rule.trees[1] || Math.abs(tree.z - z) > rule.trees[1]) continue;
          nearest = Math.min(nearest, Math.hypot(tree.x - x, tree.z - z) - footprint(tree));
        }
        if (nearest < rule.trees[0] || nearest > rule.trees[1]) continue;
      }
      if (rule.surface) {
        const y = groundHeight(world, x, z);
        const { weights } = surfaceSample(planet, detailSeed(world), field, x, z, y, 0);
        if (roll(3) > rule.surface(weights)) continue;
      }
      const scale = rule.scale[0] + roll(4) * (rule.scale[1] - rule.scale[0]);
      accept(chunk + '/' + rule.asset + '/' + i, rule.asset, x, z, scale, roll(5) * Math.PI * 2, roll);
    }
  }

  const lee = profile.wind;
  for (const [index, solid] of world.obstacles.entries()) {
    if (Math.floor((solid.x + field.half) / width) !== col || Math.floor((solid.z + field.half) / width) !== row) continue;
    for (const [s, skirt] of profile.skirts.entries()) {
      if (!skirt.kinds.includes(solid.kind)) continue;
      const roll0 = (lane: number) => worldNoise(streamSeed ^ 0x51f7, index, s * 23 + lane);
      const count = skirt.count[0] + Math.floor(roll0(0) * (skirt.count[1] - skirt.count[0] + .999));
      for (let j = 0; j < count; j++) {
        const roll = (lane: number) => worldNoise(streamSeed ^ 0x7a3d, index * 31 + j, s * 23 + lane);
        const scale = skirt.scale[0] + roll(4) * (skirt.scale[1] - skirt.scale[0]);
        const angle = skirt.lee ? lee + (roll(0) - .5) * 1.1 : roll(0) * Math.PI * 2;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        // Distance from the centre to the footprint box edge along this bearing.
        const edge = Math.min(solid.halfX / Math.max(1e-3, Math.abs(cos)), solid.halfZ / Math.max(1e-3, Math.abs(sin)));
        const ring = skirt.ring[0] + roll(1) * (skirt.ring[1] - skirt.ring[0]);
        const reach = skirt.ring[0] < 0 ? 0 : edge + ring + MID_PROPS[skirt.asset].radius * scale * (skirt.hug ?? 1) * .6;
        const x = solid.x + cos * reach, z = solid.z + sin * reach;
        // Lee props stretch along the wind (local +X downwind); root flares sit on the trunk.
        const yaw = skirt.lee ? -lee : roll(5) * Math.PI * 2;
        const id = chunk + '/skirt/' + index + '/' + skirt.asset + '/' + j;
        if (skirt.ring[0] < 0) {
          // Root flare centred on the trunk: only reservations and grade apply.
          const y = groundHeight(world, x, z);
          if (sites.some((site) => (x - site.x) ** 2 + (z - site.z) ** 2 < (site.radius + SITE_PAD) ** 2)) continue;
          result.push({ id, asset: skirt.asset, x, y, z, dx: 0, dz: 0, yaw, scale: scale * Math.max(.8, footprint(solid) * 1.6),
            tint: roll(6), rank: roll(7) });
          continue;
        }
        accept(id, skirt.asset, x, z, scale, yaw, roll, skirt.hug ?? 1);
      }
    }
  }
  return result.sort((a, b) => a.rank - b.rank);
}
