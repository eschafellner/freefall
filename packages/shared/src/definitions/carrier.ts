import { albatrossCollision } from './deployment.ts';
import type { Obstacle, WorldDefinition } from './missions.ts';

/**
 * Skyfall Carrier, Deck 03. Top view, +x starboard, +z aft (towards the star), -z towards the bow and the hangar.
 *
 * - Messe: two-storey atrium (x ±12, z -17..17) with galleries above the side bands, the mission console in the middle
 *   and a panorama window in the aft wall.
 * - Four side rooms (17 × 12 m) behind doors in the mess walls, and between each pair a narrower room:
 *   Krankenstation (port) and Mannschaftsquartier (starboard).
 * - Druckschleuse with two door pairs (z -17..-23) into the hangar (x ±17, z -23..-46) with Albatross 02 on its launch
 *   cradle, a second lander in maintenance, cargo and the open hangar gate behind an atmosphere shield.
 *
 * Every collider is an axis-aligned box on the deck (y = 0). The client draws the detailed models at the same places.
 */
export const CARRIER_CONSOLE = { x: 0, z: 0, radius: 5 };
export const CARRIER_SPAWN = { x: 0, z: 12, radius: 4, facing: 0 };
export const CARRIER_SHIP = { x: 0, z: -31 };
/** Side rooms: 17 m wide (x 12–29 from the mess wall to the hull), 12 m deep, with a window band in the hull. */
export const CARRIER_ROOM_SIZE = { inner: 12, outer: 29, halfDepth: 6 } as const;
export const CARRIER_ROOMS = [
  { x: -20.5, z: 9, label: 'AUSRÜSTUNG' }, { x: 20.5, z: 9, label: 'WAFFENKAMMER' },
  { x: -20.5, z: -9, label: 'RÜSTUNG' }, { x: 20.5, z: -9, label: 'FORSCHUNG' },
] as const;
/** Rooms between each pair of side rooms; walk-in only, no station. */
export const CARRIER_CABINS = [
  { x: -20.5, z: 0, label: 'KRANKENSTATION' }, { x: 20.5, z: 0, label: 'MANNSCHAFTSQUARTIER' },
] as const;

/** Outline of the main spaces (inner faces of their walls) and their ceiling height. */
export const CARRIER_HALLS = {
  mess: { minX: -12, maxX: 12, minZ: -17, maxZ: 17, ceiling: 9.8 },
  airlock: { minX: -3.1, maxX: 3.1, minZ: -23, maxZ: -17, ceiling: 4.2 },
  hangar: { minX: -17, maxX: 17, minZ: -46, maxZ: -23, ceiling: 12.5 },
} as const;
/** The mess galleries: deck edge (|x|), underside and floor height. The side bands below them are 4.6 m high. */
export const CARRIER_GALLERY = { edge: 8.4, underside: 4.6, floor: 5.05 } as const;
/** Height of the side and cabin rooms. */
export const CARRIER_ROOM_CEILING = 4.9;
export const CARRIER_CABIN_CEILING = 3.7;

export interface CarrierDoor {
  x: number;
  z: number;
  /** Axis a walker crosses the doorway along; the opening spans the other axis. */
  axis: 'x' | 'z';
  width: number;
  height: number;
}

const ROOM_DOOR = 2.2;
const CABIN_DOOR = 1.6;
/** Every doorway on the deck. The client fits frames and sliding doors; collision leaves the opening free. */
export const CARRIER_DOORS: readonly CarrierDoor[] = [
  ...[-1, 1].flatMap((side) => [
    ...CARRIER_ROOMS.filter((room) => Math.sign(room.x) === side).map((room) =>
      ({ x: side * 12, z: room.z, axis: 'x' as const, width: ROOM_DOOR * 2, height: 3.4 })),
    { x: side * 12, z: 0, axis: 'x' as const, width: CABIN_DOOR * 2, height: 3 },
  ]),
  // Airlock pair: the opening is the chamber between the inner faces of its walls.
  { x: 0, z: -17, axis: 'z', width: 5.7, height: 4.2 },
  { x: 0, z: -23, axis: 'z', width: 5.7, height: 4.2 },
];

const block = (x: number, z: number, halfX: number, halfZ: number, height = 4.8): Obstacle =>
  ({ x, z, halfX, halfZ, height, kind: 'barrier' });

/** A collider with the model the client draws there. `yaw` turns the model (multiples of π/2 keep the box exact). */
export interface CarrierProp extends Obstacle {
  prop: string;
  yaw?: number;
}
const prop = (name: string, x: number, z: number, halfX: number, halfZ: number, height: number, yaw = 0): CarrierProp =>
  ({ ...block(x, z, halfX, halfZ, height), prop: name, yaw });

const { inner, outer, halfDepth } = CARRIER_ROOM_SIZE;
const roomHalfX = (outer - inner) / 2;
const roomCenterX = inner + roomHalfX;

/** Row along the room wall away from the centre line: lockers, weapon racks, armour alcoves or specimen tanks. */
export const CARRIER_LOCKERS: readonly Obstacle[] = [-1, 1].flatMap((side) =>
  [-9, 9].map((z) => block(side * roomCenterX, z + Math.sign(z) * (halfDepth - .62), 5.4, .38, 2.5)));

/**
 * Hull walls with a window band towards space. Collision stays solid; the client draws them as framed glass.
 * Aft wall of the mess (two storeys), the outer hull of each side room and of the Mannschaftsquartier and the
 * starboard hangar wall (towards Dev' Ault).
 */
export const CARRIER_WINDOW_WALLS: readonly Obstacle[] = [
  block(0, 17, 13, .3),
  ...[-1, 1].flatMap((side) => [-9, 9].map((z) => block(side * outer, z, .24, halfDepth))),
  block(outer, 0, .24, 3),
  block(17.3, -34.65, .3, 11.95),
];

/** Plain walls (no window). */
export const CARRIER_WALLS: readonly Obstacle[] = [
  // Mess: bow wall either side of the airlock and the side walls between the doorways.
  block(-7.65, -17, 4.55, .3), block(7.65, -17, 4.55, .3),
  ...[-1, 1].flatMap((side) => [
    block(side * 12, 14.25, .3, 3.05), block(side * 12, 4.2, .3, 2.6),
    block(side * 12, -4.2, .3, 2.6), block(side * 12, -14.25, .3, 3.05),
    // Room partitions: aft and bow walls of the side rooms, which also close the cabins.
    ...[-15, -3, 3, 15].map((z) => block(side * roomCenterX, z, roomHalfX, .24)),
  ]),
  // Hull behind the Krankenstation (no window, cabinets stand against it).
  block(-outer, 0, .24, 3),
  // Airlock chamber and the aft wall of the hangar.
  block(-3.1, -20, .25, 3.05), block(3.1, -20, .25, 3.05),
  block(-10.2, -23, 7.1, .3), block(10.2, -23, 7.1, .3),
  // Port hangar wall and the hangar gate (closed by the atmosphere shield).
  block(-17.3, -34.65, .3, 11.95),
  block(0, -46.3, 17.6, .3),
];

// Service frame beside the lounge, outside the deployment route (crouch underneath).
const serviceFrame = { ...block(-6.5, 12.4, 1.4, .42, 1.64), bottom: 1.37 };

/** Furniture and equipment with collision. */
export const CARRIER_PROPS: readonly CarrierProp[] = [
  // Mess: gallery pillars, dining tables with benches, lounge, galley, ready-room benches and racks.
  ...[-1, 1].flatMap((side) => [
    ...[-13.5, -4.2, 4.2, 13.5].map((z) => prop('pillar', side * 8.4, z, .36, .36, 4.8)),
    ...[-4.2, 4.2].flatMap((z) => [
      prop('mess-table', side * 6.2, z, 1.75, .5, .78),
      prop('mess-bench', side * 6.2, z - .98, 1.75, .22, .47),
      prop('mess-bench', side * 6.2, z + .98, 1.75, .22, .47),
      prop('wall-unit', side * 11.35, z, .4, 2, 2.3, side * -Math.PI / 2),
    ]),
    prop('ready-bench', side * 6.2, -13.4, 1.8, .3, .5),
    prop('gear-rack', side * 11.3, -14.3, .45, 2.4, 2.3, side * -Math.PI / 2),
  ]),
  prop('galley', -10.95, 14.15, .8, 2.55, 1.05, Math.PI / 2),
  prop('refreshment', 10.95, 14.4, .75, 2, 2.1, -Math.PI / 2),
  prop('lounge-sofa', 6.3, 15.35, 1.75, .45, .9),
  prop('lounge-table', 6.3, 14.05, .8, .4, .45),
  prop('console', 0, 0, 1.58, 1.58, 1.06),
  // Side rooms: the station at the far end of the room and secondary furniture along the near wall.
  ...[-1, 1].flatMap((side) => [-9, 9].flatMap((z) => {
    const near = z - Math.sign(z) * (halfDepth - .55);
    const room = CARRIER_ROOMS.find((entry) => Math.sign(entry.x) === side && entry.z === z)!;
    const kind = room.label.toLowerCase().replace('ü', 'ue');
    return [
      prop(kind + '-station', side * 23.6, z, .8, 1.7, 1.05, side * -Math.PI / 2),
      prop(kind + '-near', side * 20.5, near, 5.2, .45, 2.2, z > 0 ? 0 : Math.PI),
      // Second piece in the corner between door and wall row, clear of the walk from the door to the station.
      prop(kind + '-extra', side * 17.6, z + Math.sign(z) * 3.1, .9, .6, 1, z > 0 ? Math.PI : 0),
    ];
  })),
  // Krankenstation: four beds, med scanner, cabinets.
  ...[-15.9, -19.6].flatMap((x) => [-1, 1].map((s) => prop('med-bed', x, s * 2.18, 1.1, .5, .72, s > 0 ? Math.PI : 0))),
  prop('med-scanner', -24.6, 0, 1.35, .75, 2.3, Math.PI / 2),
  prop('med-cabinet', -27.9, 0, .55, 2.2, 2.4, Math.PI / 2),
  // Mannschaftsquartier: bunk stacks along both walls, a table at the hull.
  ...[15.6, 18.3, 21, 23.7].flatMap((x) => [-1, 1].map((s) => prop('bunk', x, s * 2.27, 1.1, .48, 2.6, s > 0 ? Math.PI : 0))),
  prop('crew-table', 27, 0, .55, 1, .78),
  // Hangar: lander in maintenance in front of the starboard windows, cargo containers, fuel cart, crate stacks.
  prop('lander-maintenance', 11.2, -34.5, 3.3, 5.8, 3.6),
  prop('container', -12.6, -27.6, 1.3, 3.1, 2.7),
  prop('container', -13.6, -36.4, 1.3, 3.1, 5.4),
  prop('fuel-cart', -8.6, -41.2, .95, 1.7, 1.8),
  prop('crates', -13.4, -43, 1.6, 1.4, 1.6),
  prop('crates', 13.4, -43.4, 1.6, 1.2, 1.2),
  prop('tool-cart', 7.2, -27.4, .5, .8, 1.1),
  // Pressure door control posts at the inner airlock door.
  ...[-1, 1].map((side) => prop('door-post', side * 3.55, -16.45, .3, .25, 2.6)),
];

export const CARRIER_WORLD: WorldDefinition = {
  id: 'world.skyfall_carrier', half: 48, deployment: CARRIER_SPAWN,
  patrolRegions: [], breachRegions: [], initialNests: [],
  obstacles: [
    ...CARRIER_WINDOW_WALLS,
    ...CARRIER_WALLS,
    ...CARRIER_LOCKERS,
    ...CARRIER_PROPS,
    serviceFrame,
    ...[-1, 1].map((side) => block(serviceFrame.x + side * 1.4, serviceFrame.z, .13, .37, serviceFrame.bottom)),
    ...albatrossCollision(CARRIER_SHIP),
  ],
};
