import {
  FOREST_ID, detailSeed, groundHeight, openGround, worldNoise,
} from '@freefall/shared';
import type { Circle, PositionXZ, WorldDefinition } from '@freefall/shared';
import { WAR_TRACES } from './WarTraceAssets.ts';
import type { SolidTraceId, TraceId } from './WarTraceAssets.ts';

export const WAR_TRACE_VERSION = 1;

export interface TracePlacement extends PositionXZ {
  readonly asset: TraceId;
  readonly y: number;
  readonly dx: number;
  readonly dz: number;
  readonly yaw: number;
  readonly scale: number;
}
export interface TraceDecal extends PositionXZ {
  readonly kind: 'scorch' | 'resin';
  readonly radius: number;
  readonly yaw: number;
}
export interface WarTraces {
  readonly props: readonly TracePlacement[];
  readonly decals: readonly TraceDecal[];
  /** Obstacle index → solid trace drawn in place of the rock (the collider stays as it is). */
  readonly solids: ReadonlyMap<number, SolidTraceId>;
  /** Battle site centres, for diagnostics and tests. */
  readonly sites: readonly PositionXZ[];
}

const SITE_COUNT = 6;
const SITE_CLEARANCE = 15;
const ROUTE_CLEARANCE = 1.6;
const MAX_GRADE = .4;

function routeDistanceSquared(x: number, z: number, a: PositionXZ, b: PositionXZ): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const span = dx * dx + dz * dz;
  const t = span ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / span)) : 0;
  return (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2;
}

/**
 * Deterministic battle sites, outposts and swarm growth for one world. Purely presentational: the world is read, never
 * written. `reserved` are the mission clearances (deployment, objectives, nests, breach and patrol regions); swarm
 * growth may touch nest and breach rims but nothing enters the other reservations.
 */
export function placeWarTraces(world: WorldDefinition, reserved: readonly Circle[]): WarTraces {
  const field = world.terrain;
  if (!field || !world.planetId) return { props: [], decals: [], solids: new Map(), sites: [] };
  const seed = (detailSeed(world) ^ Math.imul(WAR_TRACE_VERSION, 0x6a09e667)) >>> 0;
  let lane = 0;
  const roll = () => worldNoise(seed, lane++, 77);
  const half = field.half;
  const props: TracePlacement[] = [];
  const decals: TraceDecal[] = [];
  const swarmZones = [...world.initialNests.map(({ x, z }) => ({ x, z, radius: 12 })), ...world.breachRegions];

  const blocked = (x: number, z: number, radius: number, swarm: boolean) => {
    if (Math.max(Math.abs(x), Math.abs(z)) > half - radius - 1) return true;
    for (const site of reserved) {
      const inner = swarm && swarmZones.some((zone) => zone.x === site.x && zone.z === site.z);
      // Swarm growth may reach into the outer half of nest and breach clearances, never into their centre.
      const limit = inner ? site.radius * .55 : site.radius + radius + 1.2;
      if ((x - site.x) ** 2 + (z - site.z) ** 2 < limit ** 2) return true;
    }
    return world.patrolRegions.some(({ route: { waypoints } }) => waypoints.some((a, index) =>
      routeDistanceSquared(x, z, a, waypoints[(index + 1) % waypoints.length]) < (ROUTE_CLEARANCE + radius) ** 2));
  };
  const put = (asset: TraceId, x: number, z: number, scale: number, yaw: number, swarm = false): boolean => {
    const radius = WAR_TRACES[asset].radius * scale;
    if (blocked(x, z, radius, swarm) || !openGround(world, x, z, radius * .55)) return false;
    const span = .5, y = groundHeight(world, x, z);
    const dx = (groundHeight(world, x + span, z) - groundHeight(world, x - span, z)) / (span * 2);
    const dz = (groundHeight(world, x, z + span) - groundHeight(world, x, z - span)) / (span * 2);
    if (Math.hypot(dx, dz) > MAX_GRADE) return false;
    props.push({ asset, x, y, z, dx, dz, yaw, scale });
    return true;
  };
  const crater = (x: number, z: number, radius: number) => {
    if (blocked(x, z, radius, false) || !openGround(world, x, z, radius * .5)) return;
    decals.push({ kind: 'scorch', x, z, radius: radius * 1.45, yaw: roll() * Math.PI * 2 });
    put('crater-rim', x, z, radius, roll() * Math.PI * 2);
  };
  const scatter = (cx: number, cz: number, inner: number, outer: number, fn: (x: number, z: number, angle: number) => void) => {
    const angle = roll() * Math.PI * 2, r = inner + Math.sqrt(roll()) * (outer - inner);
    fn(cx + Math.cos(angle) * r, cz + Math.sin(angle) * r, angle);
  };

  // Battle sites on a jittered 4 × 4 grid; the free cells with the highest noise win.
  const cells: { x: number; z: number; rank: number }[] = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const x = -half + (i + .2 + roll() * .6) * half / 2, z = -half + (j + .2 + roll() * .6) * half / 2;
    if (!blocked(x, z, SITE_CLEARANCE, false)) cells.push({ x, z, rank: roll() });
  }
  const sites = cells.sort((a, b) => b.rank - a.rank).slice(0, SITE_COUNT).map(({ x, z }) => ({ x, z }));
  for (const [index, site] of sites.entries()) {
    const craters = 2 + Math.floor(roll() * 3);
    for (let k = 0; k < craters; k++) scatter(site.x, site.z, 0, 13, (x, z) => crater(x, z, 1.8 + roll() * 2.6));
    for (let k = 0; k < 3; k++) scatter(site.x, site.z, 2, 14, (x, z) => put('debris', x, z, .7 + roll() * .5, roll() * 6.3));
    for (let k = 0; k < 3; k++) scatter(site.x, site.z, 1, 12, (x, z) => put('shells', x, z, .8 + roll() * .4, roll() * 6.3));
    if (index % 2) continue;
    // Abandoned outpost: sandbag arcs facing outward, supply crates, a signal beacon and a toppled mast.
    const facing = roll() * Math.PI * 2;
    for (let k = 0; k < 3; k++) {
      const angle = facing + k * 2.1, r = 6 + roll();
      put('sandbags', site.x + Math.cos(angle) * r, site.z + Math.sin(angle) * r, .9 + roll() * .2, -angle - Math.PI / 2);
    }
    for (let k = 0; k < 3; k++) scatter(site.x, site.z, 1, 4.5, (x, z) => put('crates', x, z, .85 + roll() * .25, roll() * 6.3));
    scatter(site.x, site.z, 2, 4, (x, z) => {
      const yaw = roll() * 6.3;
      if (put('beacon', x, z, 1, yaw)) put('beacon-lamp', x, z, 1, yaw);
    });
    scatter(site.x, site.z, 7, 11, (x, z, angle) => put('mast', x, z, .9 + roll() * .2, -angle));
  }
  // Stray shell craters and wreckage between the sites.
  for (let k = 0; k < 16; k++) crater((roll() * 2 - 1) * (half - 8), (roll() * 2 - 1) * (half - 8), 1.4 + roll() * 2.2);
  for (let k = 0; k < 10; k++) put(roll() < .5 ? 'debris' : 'crates', (roll() * 2 - 1) * (half - 6), (roll() * 2 - 1) * (half - 6),
    .7 + roll() * .4, roll() * 6.3);

  // Swarm growth: dense around nests, a telltale rim around every breach region.
  for (const nest of world.initialNests) {
    decals.push({ kind: 'resin', x: nest.x, z: nest.z, radius: 22, yaw: roll() * 6.3 });
    for (let k = 0; k < 9; k++) scatter(nest.x, nest.z, 8, 24, (x, z) => put('resin', x, z, .8 + roll() * .6, roll() * 6.3, true));
    for (let k = 0; k < 7; k++) scatter(nest.x, nest.z, 9, 22, (x, z) => put('cocoons', x, z, .7 + roll() * .5, roll() * 6.3, true));
    for (let k = 0; k < 7; k++) scatter(nest.x, nest.z, 10, 26, (x, z) => put('spines', x, z, .7 + roll() * .6, roll() * 6.3, true));
    for (let k = 0; k < 9; k++) scatter(nest.x, nest.z, 8, 30, (x, z) => put('husk', x, z, .8 + roll() * .4, roll() * 6.3, true));
  }
  for (const region of world.breachRegions) {
    decals.push({ kind: 'resin', x: region.x, z: region.z, radius: region.radius * 1.15, yaw: roll() * 6.3 });
    for (let k = 0; k < 3; k++) scatter(region.x, region.z, region.radius * .7, region.radius + 4, (x, z) => put('resin', x, z, .6 + roll() * .5, roll() * 6.3, true));
    for (let k = 0; k < 2; k++) scatter(region.x, region.z, region.radius * .7, region.radius + 6, (x, z) => put('husk', x, z, .7 + roll() * .4, roll() * 6.3, true));
    scatter(region.x, region.z, region.radius * .75, region.radius + 3, (x, z) => put('spines', x, z, .6 + roll() * .4, roll() * 6.3, true));
  }

  // A few medium rocks near the battle sites become wrecks or ruins (same collider, new look).
  const solids = new Map<number, SolidTraceId>();
  const kinds: SolidTraceId[] = ['pod-wreck', 'hull-wreck', 'ruin'];
  const candidates = world.obstacles.map((obstacle, index) => ({ obstacle, index })).filter(({ obstacle }) =>
    obstacle.kind === 'rock' && obstacle.halfX < 3.6 && obstacle.halfZ < 3.6)
    .map(({ obstacle, index }) => ({ index, distance: Math.min(...sites.map((site) => Math.hypot(site.x - obstacle.x, site.z - obstacle.z))) }))
    .sort((a, b) => a.distance - b.distance);
  const quota = world.planetId === FOREST_ID ? 3 : 4;
  for (const { index } of candidates.slice(0, quota)) solids.set(index, kinds[Math.floor(worldNoise(seed, index, 91) * 3)]);
  return { props, decals, solids, sites };
}
