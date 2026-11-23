import type { Obstacle, WorldDefinition } from '../definitions/missions.ts';
import type { ImpactNormal } from '../contracts/messages.ts';
import { CARRIER_WORLD } from '../definitions/deployment.ts';
import { ICE_ID } from './PlanetProfiles.ts';
import { dominantTerrainFinish } from './PlanetSurfaces.ts';
import type { SurfaceFinish } from './PlanetSurfaces.ts';
import { terrainVertex } from './Terrain.ts';

export type ImpactSurface = 'snow' | 'ice' | 'sand' | 'dirt' | 'grass' | 'rock' | 'frozen-rock' |
  'forest-floor' | 'wood' | 'metal' | 'concrete' | 'neutral';

export const ARENA_PAD = { x: 0, z: 4, radius: 10.4 } as const;
export const ARENA_ROAD_PLATES = [{ x: 14, z: -16 }, { x: 14, z: -34 }] as const;

const terrainSurfaces: Record<SurfaceFinish, ImpactSurface> = {
  snow: 'snow', ice: 'ice', frost: 'frozen-rock', rock: 'rock', sand: 'sand', hardpan: 'dirt', gravel: 'rock',
  grass: 'grass', earth: 'dirt', 'forest-floor': 'forest-floor', moss: 'forest-floor', litter: 'forest-floor', bark: 'wood',
};

const obstacleSurfaces: Record<Obstacle['kind'], ImpactSurface> = {
  rock: 'rock', tree: 'wood', ice: 'ice', 'arch-pier': 'rock', 'arch-span': 'rock',
  bunker: 'concrete', barrier: 'concrete', container: 'metal', debris: 'metal',
};

export function impactSurface(world: WorldDefinition | undefined, x: number, z: number, obstacle?: Obstacle): ImpactSurface {
  if (world?.id === CARRIER_WORLD.id) return 'metal';
  if (obstacle) {
    if (obstacle.kind === 'rock' && world?.planetId === ICE_ID) return 'frozen-rock';
    return obstacle.surface ?? (Object.hasOwn(obstacleSurfaces, obstacle.kind) ? obstacleSurfaces[obstacle.kind] : 'neutral');
  }
  if (world?.terrain) {
    const finish = dominantTerrainFinish(world, x, z);
    if (finish === 'rock' && world.planetId === ICE_ID) return 'frozen-rock';
    return finish ? terrainSurfaces[finish] : 'neutral';
  }
  if (world) return world.id === 'world.bodenbruch' ? 'dirt' : 'neutral';
  if (ARENA_ROAD_PLATES.some((plate) => Math.abs(plate.x - x) <= 1.6 && Math.abs(plate.z - z) <= 3)) return 'metal';
  return Math.hypot(x - ARENA_PAD.x, z - ARENA_PAD.z) <= ARENA_PAD.radius ? 'concrete' : 'dirt';
}

export function impactNormal(world: WorldDefinition | undefined, x: number, y: number, z: number,
  obstacle?: Obstacle): ImpactNormal {
  if (obstacle) {
    const ox = x - obstacle.x, oz = z - obstacle.z;
    const yBottom = Math.abs(y - (obstacle.bottom ?? 0)), yTop = Math.abs(y - obstacle.height);
    const xFace = Math.abs(Math.abs(ox) - obstacle.halfX), zFace = Math.abs(Math.abs(oz) - obstacle.halfZ);
    if (xFace <= Math.min(zFace, yBottom, yTop)) return [ox < 0 ? -1 : 1, 0, 0];
    if (zFace <= Math.min(yBottom, yTop)) return [0, 0, oz < 0 ? -1 : 1];
    return [0, yBottom < yTop ? -1 : 1, 0];
  }
  const field = world?.terrain;
  if (!field) return [0, 1, 0];
  const u = (x + field.half) / field.step, v = (z + field.half) / field.step;
  const ix = Math.min(field.cells - 1, Math.max(0, Math.floor(u)));
  const iz = Math.min(field.cells - 1, Math.max(0, Math.floor(v)));
  const b = terrainVertex(field, ix + 1, iz), c = terrainVertex(field, ix, iz + 1);
  const lower = u - ix + v - iz <= 1;
  const a = lower ? terrainVertex(field, ix, iz) : terrainVertex(field, ix + 1, iz + 1);
  const dx = u < 0 || u > field.cells ? 0 : (lower ? b - a : a - c) / field.step;
  const dz = v < 0 || v > field.cells ? 0 : (lower ? c - a : a - b) / field.step;
  const length = Math.hypot(dx, 1, dz);
  return [-dx / length, 1 / length, -dz / length];
}
