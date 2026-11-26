/**
 * Points of Interest (PoI): acht Fundorte je Karte, wiederverwendbar in allen Biomen. Ein PoI besteht aus
 * biomneutralen Bauteilen (Wracks, Leichen, Kisten, Sandsäcke) und optional Felsen, die das Biom selbst rendert
 * (`kind: 'rock'`). Metallische Bauteile sind unsichtbare Kollider (`kind: 'debris'`), die der Client als PoI-Modell
 * darstellt. Die Platzierung ist deterministisch aus dem Welt-Seed; die Beute hängt zusätzlich von der Schwierigkeit
 * ab und wird beim Einsatzstart vom Server erzeugt (`spawnPoiLoot`).
 */
import { BALANCE } from '../balance/defaults.ts';
import type { PositionXZ } from '../config/movement.ts';
import type { Circle, Obstacle, WorldDefinition } from '../definitions/missions.ts';
import type { SampleAmounts, SampleId } from '../definitions/resources.ts';
import { terrainHeight } from './Terrain.ts';
import type { Heightfield } from './Terrain.ts';

export type PoiKind = 'rock-operator' | 'ruin' | 'albatross-wreck' | 'convict-remains' | 'trench' | 'drop-pod' | 'field-camp' |
  'burnt-nest' | 'survey-rig' | 'gun-emplacement' | 'relay-debris' | 'monolith';

export interface PointOfInterest extends PositionXZ {
  readonly id: string;
  readonly kind: PoiKind;
  /** Vierteldrehung 0–3 (Kollider sind achsparallel). */
  readonly turn: number;
  readonly radius: number;
  readonly ground: number;
  /** Einziger Fundort der Artefakte auf der Karte. */
  readonly prominent: boolean;
}

type Solid = readonly [x: number, z: number, halfX: number, halfZ: number, height: number, kind: 'rock' | 'debris'];

interface PoiLayout {
  readonly displayName: string;
  readonly radius: number;
  readonly prominent?: boolean;
  readonly solids: readonly Solid[];
}

/** Bauplan je PoI-Typ in lokalen Koordinaten (Blickrichtung +z). */
export const POI_LAYOUTS: Readonly<Record<PoiKind, PoiLayout>> = {
  'rock-operator': { displayName: 'Gefallener Operator am Felsen', radius: 7, solids: [[0, -1.2, 2.2, 1.7, 2.6, 'rock'], [3.3, -1.8, 1.1, .9, 1.4, 'rock']] },
  ruin: { displayName: 'Zerstörter Außenposten', radius: 8,
    solids: [[-3.2, 0, .3, 3, 2.6, 'debris'], [0, -3.2, 3, .3, 2.1, 'debris'], [2.8, 2.6, .3, 1.1, 1.3, 'debris']] },
  'albatross-wreck': { displayName: 'Wrack eines Albatross 02', radius: 11, prominent: true,
    solids: [[0, 0, 1.9, 5.2, 2.3, 'debris'], [3.7, .8, 1.6, .9, 1, 'debris'], [-.6, -7.2, .9, 1.4, 2.9, 'debris']] },
  'convict-remains': { displayName: 'Gefallene Convicts', radius: 6, solids: [[0, -1.6, 1.8, 1.4, 2.1, 'rock']] },
  trench: { displayName: 'Schützengraben', radius: 7,
    solids: [[-2.6, -1.9, 2, .45, .9, 'debris'], [2.6, 1.9, 2, .45, .9, 'debris']] },
  'drop-pod': { displayName: 'Abgestürzte Abwurfkapsel', radius: 6, solids: [[0, 0, 1.1, 1.1, 2.6, 'debris']] },
  'field-camp': { displayName: 'Verlassenes Feldlager', radius: 8,
    solids: [[-2.7, 0, 1.4, 1.8, 1.8, 'debris'], [2.7, .9, 1.4, 1.8, 1.8, 'debris'], [0, -2.8, .6, .6, .9, 'debris']] },
  'burnt-nest': { displayName: 'Ausgebranntes Nest', radius: 8, solids: [[0, 0, 2, 2, 1.5, 'debris']] },
  'survey-rig': { displayName: 'Vermessungsbohrung', radius: 7, solids: [[0, 0, 1.2, 1.2, 5, 'debris'], [2.6, 0, .7, 1.4, 1.4, 'debris']] },
  'gun-emplacement': { displayName: 'Zerstörte Geschützstellung', radius: 8,
    solids: [[0, -2.5, 2, .5, 1.1, 'debris'], [-2.5, 0, .5, 1.6, 1.1, 'debris'], [2.5, 0, .5, 1.6, 1.1, 'debris']] },
  'relay-debris': { displayName: 'Relaistrümmer', radius: 7, solids: [[0, 0, .4, 4, .8, 'debris'], [1.6, 2.2, .6, .6, 1.6, 'debris']] },
  monolith: { displayName: 'Fremdartiger Monolith', radius: 9, prominent: true, solids: [[0, 0, 1, 1, 7, 'debris']] },
};

export const POI_COUNT = 8;
export const POI_KINDS = Object.keys(POI_LAYOUTS) as PoiKind[];
const PROMINENT = POI_KINDS.filter((kind) => POI_LAYOUTS[kind].prominent);
const COMMON = POI_KINDS.filter((kind) => !POI_LAYOUTS[kind].prominent);

/** Kleiner deterministischer Zufallsgenerator (mulberry32). */
export function poiRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Lokale Koordinate → Welt bei Vierteldrehung. */
export function poiToWorld(poi: Pick<PointOfInterest, 'x' | 'z' | 'turn'>, x: number, z: number): PositionXZ {
  const [c, s] = [[1, 0], [0, 1], [-1, 0], [0, -1]][poi.turn & 3];
  return { x: poi.x + x * c - z * s, z: poi.z + x * s + z * c };
}

/** Wie in WorldGenerator: keine Math.hypot/sin/cos in der Platzierung, damit Welt-IDs in jedem Browser gleich sind. */
const length = (x: number, z: number) => Math.sqrt(x * x + z * z);
const RING = [[1, 0], [.7071, .7071], [0, 1], [-.7071, .7071], [-1, 0], [-.7071, -.7071], [0, -1], [.7071, -.7071]] as const;
const height = (terrain: Heightfield | undefined, x: number, z: number) => terrain ? terrainHeight(terrain, x, z) : 0;
const round = (value: number) => Math.round(value * 10) / 10;

/**
 * Platziert bis zu `POI_COUNT` PoI abseits der reservierten Flächen (Landezone, Ziele, Extraktion, Nester, Durchbrüche)
 * und fester Hindernisse. Bäume im Fußabdruck werden entfernt (Lichtung). Liefert die PoI und die neue Hindernisliste.
 */
export function placePointsOfInterest(world: Pick<WorldDefinition, 'half' | 'terrain' | 'obstacles'>, seed: number, reserved: readonly Circle[]):
  { points: PointOfInterest[]; obstacles: Obstacle[] } {
  const random = poiRandom(seed ^ 0x501a7c3);
  const terrain = world.terrain;
  let obstacles = [...world.obstacles];
  const points: PointOfInterest[] = [];
  const shuffled = [...COMMON];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const kinds = [PROMINENT[Math.floor(random() * PROMINENT.length)], ...shuffled.slice(0, POI_COUNT - 1)];
  for (const kind of kinds) {
    const layout = POI_LAYOUTS[kind];
    for (let attempt = 0; attempt < 160; attempt++) {
      const spacing = attempt < 100 ? 60 : 38;
      const reach = world.half - layout.radius - 22;
      const x = round((random() * 2 - 1) * reach), z = round((random() * 2 - 1) * reach);
      if (reserved.some((site) => length(site.x - x, site.z - z) < site.radius + layout.radius + 10)) continue;
      if (points.some((other) => length(other.x - x, other.z - z) < spacing)) continue;
      const clear = layout.radius + 1.5;
      const blocking = (obstacle: Obstacle) => Math.abs(obstacle.x - x) < obstacle.halfX + clear && Math.abs(obstacle.z - z) < obstacle.halfZ + clear;
      if (obstacles.some((obstacle) => obstacle.kind !== 'tree' && blocking(obstacle))) continue;
      const ground = height(terrain, x, z);
      if (terrain) {
        let low = ground, high = ground;
        for (const [dx, dz] of RING) {
          const y = height(terrain, x + dx * layout.radius, z + dz * layout.radius);
          low = Math.min(low, y);
          high = Math.max(high, y);
        }
        if (high - low > 3.2) continue;
      }
      const poi: PointOfInterest = { id: 'poi-' + points.length, kind, x, z, turn: Math.floor(random() * 4), radius: layout.radius,
        ground: Math.round(ground * 100) / 100, prominent: !!layout.prominent };
      obstacles = obstacles.filter((obstacle) => obstacle.kind !== 'tree' || !blocking(obstacle));
      for (const [lx, lz, hx, hz, rise, solid] of layout.solids) {
        const at = poiToWorld(poi, lx, lz);
        const swap = poi.turn % 2 === 1;
        const y = height(terrain, at.x, at.z);
        const halfX = swap ? hz : hx, halfZ = swap ? hx : hz;
        obstacles.push({ x: round(at.x), z: round(at.z), halfX, halfZ, kind: solid, height: Math.round((y + rise) * 100) / 100,
          bottom: Math.round((y - (solid === 'rock' ? length(halfX, halfZ) * .46 : .4)) * 100) / 100 });
      }
      points.push(poi);
      break;
    }
  }
  return { points, obstacles };
}

/** Was auf dem Boden eines PoI liegen kann. */
export type PickupKind = SampleId | 'mark' | 'ammo' | 'stims' | 'grenades';
export const SUPPLY_PICKUPS = ['ammo', 'stims', 'grenades'] as const;

export interface PickupSnapshot extends PositionXZ {
  id: string;
  kind: PickupKind;
}

/**
 * Beute an den PoI aus `balance/data/loot.json` (im Balance-Editor unter „Versorgung & Beute“). Listen je Stufe:
 * Index = Stufe − 1. `spawn`: so viele Einheiten liegen auf der Karte, `limit`: so viele darf der Trupp höchstens
 * tragen und extrahieren. Artefakte: ein Fundort am prägnanten PoI, Limit = Fundmenge. `grant`: was eine Munitionsbox,
 * ein Erste-Hilfe-Kasten oder eine Granatenkiste gibt.
 */
export const POI_LOOT = BALANCE.loot;

const levelIndex = (level: number) => Math.max(0, Math.min(6, Math.round(level) - 1));

/** Wie viele Proben der Trupp auf dieser Stufe höchstens tragen und extrahieren darf. Artefakte siehe `artifacts`. */
export function sampleLimits(level: number, artifacts = 0): Required<SampleAmounts> {
  const index = levelIndex(level);
  return { tissue: POI_LOOT.tissue.limit[index], rock: POI_LOOT.rock.limit[index], artifact: artifacts };
}

const between = (random: () => number, [low, high]: readonly number[]) => low + Math.floor(random() * (high - low + 1));

/** Beute aller PoI einer Karte, deterministisch aus Seed und Stufe. Positionen liegen frei von Hindernissen. */
export function spawnPoiLoot(world: WorldDefinition, seed: number, level: number): PickupSnapshot[] {
  const points = world.pointsOfInterest ?? [];
  const random = poiRandom(seed ^ 0x1007 ^ Math.imul(level, 0x9e3779b1));
  const index = levelIndex(level);
  const pickups: PickupSnapshot[] = [];
  const counts = new Map<string, number>();
  const blocked = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) > world.half - 2 ||
    world.obstacles.some((o) => Math.abs(o.x - x) < o.halfX + .6 && Math.abs(o.z - z) < o.halfZ + .6) ||
    pickups.some((p) => length(p.x - x, p.z - z) < .7);
  const drop = (poi: PointOfInterest, kind: PickupKind) => {
    let spot: PositionXZ = { x: poi.x, z: poi.z };
    for (let attempt = 0; attempt < 40; attempt++) {
      const angle = random() * Math.PI * 2, distance = 1.5 + random() * (poi.radius - 2);
      const x = poi.x + Math.cos(angle) * distance, z = poi.z + Math.sin(angle) * distance;
      if (!blocked(x, z)) { spot = { x, z }; break; }
    }
    const n = counts.get(poi.id) ?? 0;
    counts.set(poi.id, n + 1);
    pickups.push({ id: poi.id + '/' + n, kind, x: Math.round(spot.x * 100) / 100, z: Math.round(spot.z * 100) / 100 });
  };
  const order = () => {
    const list = [...points];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  for (const id of ['tissue', 'rock'] as const) {
    const rules = POI_LOOT[id];
    if (level < rules.fromLevel || !points.length) continue;
    let budget = rules.spawn[index];
    for (const poi of order()) {
      if (budget <= 0) break;
      // Nicht jeder Fundort hat jede Probe.
      if (random() < .2) continue;
      const amount = Math.min(budget, between(random, rules.perSite));
      for (let k = 0; k < amount; k++) drop(poi, id);
      budget -= amount;
    }
    for (const poi of order()) {
      if (budget <= 0) break;
      const amount = Math.min(budget, between(random, rules.perSite));
      for (let k = 0; k < amount; k++) drop(poi, id);
      budget -= amount;
    }
  }
  const landmark = points.find(({ prominent }) => prominent);
  if (landmark && level >= POI_LOOT.artifact.fromLevel) {
    const amount = between(random, POI_LOOT.artifact.perSite);
    for (let k = 0; k < amount; k++) drop(landmark, 'artifact');
  }
  for (const poi of points) {
    if (random() < POI_LOOT.markChance) drop(poi, 'mark');
    const supplies = between(random, POI_LOOT.supplies);
    for (let k = 0; k < supplies; k++) drop(poi, SUPPLY_PICKUPS[Math.floor(random() * SUPPLY_PICKUPS.length)]);
  }
  return pickups;
}
