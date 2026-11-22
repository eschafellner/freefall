import { NET } from '../config/arena.ts';
import { BALANCE } from '../balance/defaults.ts';
import { ALBATROSS_VEHICLE_ID } from '../balance/registry.ts';
import type { PositionXZ } from '../config/movement.ts';
import { WORLD_PROFILES } from '../world/PlanetProfiles.ts';
import { BODENBRUCH } from './missions.ts';
import type { Obstacle, WorldDefinition } from './missions.ts';

export interface PlanetDefinition {
  id: string;
  displayName: string;
  missions: readonly string[];
}

const devAult: PlanetDefinition = { id: 'dev-ault', displayName: "Dev' Ault", missions: [BODENBRUCH.id] };
export const PLANET_REGISTRY: ReadonlyMap<string, PlanetDefinition> = new Map([
  [devAult.id, devAult],
  ...Array.from(WORLD_PROFILES.values(), ({ id, displayName }): [string, PlanetDefinition] => [id, { id, displayName, missions: [] }]),
]);
export const CARRIER_CONSOLE = { x: 0, z: 0, radius: 5 };
export const CARRIER_SPAWN = { x: 0, z: 12, radius: 4, facing: 0 };
export const CARRIER_SHIP = { x: 0, z: -31 };
/** Side rooms: 17 m wide (x 12–29 from the mess wall to the hull), 12 m deep, with a window band in the hull. */
export const CARRIER_ROOM_SIZE = { inner: 12, outer: 29, halfDepth: 6 } as const;
export const CARRIER_ROOMS = [
  { x: -20.5, z: 9, label: 'AUSRÜSTUNG' }, { x: 20.5, z: 9, label: 'WAFFENKAMMER' },
  { x: -20.5, z: -9, label: 'RÜSTUNG' }, { x: 20.5, z: -9, label: 'FORSCHUNG' },
] as const;

const albatross = BALANCE.vehicle(ALBATROSS_VEHICLE_ID);

/** Geometry is defined here. Hull, thruster health and the grounding rule come from `balance/data/structures.json`. */
export const ALBATROSS = {
  hullHealth: albatross.hullHealth, thrusterHealth: albatross.thrusterHealth, disabledThrusters: albatross.disabledThrusters,
  halfWidth: 2.55, halfLength: 5.2, boardingWidth: 2.08, boardingLength: 4.65,
  launchTicks: NET.tickHz * 4, thrusters: [
    { x: -4.35, z: -2.9 }, { x: -4.35, z: 2.9 }, { x: 4.35, z: -2.9 }, { x: 4.35, z: 2.9 },
  ],
} as const;

/**
 * Flight phases in server ticks (30 Hz), about 20 s in total: clamps and siren, release and free fall, re-entry,
 * retro burn down to the touchdown slam, settling and ramp. The client choreography scales with these durations.
 */
export const DEPLOYMENT_PHASES = [
  ['LOCKED', 75], ['DROPPING', 105], ['ATMOSPHERIC_ENTRY', 180], ['BRAKING', 150], ['TOUCHDOWN', 96],
] as const;
export const BOARDING_TICKS = 3 * NET.tickHz;
export const RECONNECT_SECONDS = 12;
export const RESULT_TICKS = 12 * NET.tickHz;
export const LANDING_STAGE_TICKS = DEPLOYMENT_PHASES.reduce((ticks, [, duration]) => ticks + duration, 0);
export const BALLOON = { itemId: 'extraction.balloon', displayName: 'Extraktionsballon', radius: 25,
  countdownTicks: 90 * NET.tickHz, approachTicks: 3 * NET.tickHz, liftTicks: 2 * NET.tickHz, height: 16 } as const;
export const MISSION_REWARDS = { baseExperience: 400, extractionBonusRate: .25 } as const;

export function landingShip(deployment: PositionXZ): PositionXZ {
  return { x: deployment.x, z: deployment.z + 4 };
}

export function inAlbatross(position: PositionXZ, ship: PositionXZ): boolean {
  return Math.abs(position.x - ship.x) <= ALBATROSS.boardingWidth &&
    Math.abs(position.z - ship.z) <= ALBATROSS.boardingLength;
}

const block = (x: number, z: number, halfX: number, halfZ: number, height = 4.8): Obstacle =>
  ({ x, z, halfX, halfZ, height, kind: 'barrier' });

export const CARRIER_BENCHES = [-1, 1].flatMap((side) =>
  [-14, -4, 4, 14].map((z) => block(side * 8.7, z, 1.62, .32, .68)));

export function albatrossCollision(ship: PositionXZ): Obstacle[] {
  return [
    block(ship.x - ALBATROSS.halfWidth, ship.z, .22, ALBATROSS.halfLength, 3.4),
    block(ship.x + ALBATROSS.halfWidth, ship.z, .22, ALBATROSS.halfLength, 3.4),
    block(ship.x, ship.z - ALBATROSS.halfLength, ALBATROSS.halfWidth, .22, 3.4),
  ].map((obstacle) => ({ ...obstacle, surface: 'metal' }));
}

// Service frame beside the mess, outside the deployment route.
const serviceFrame = { ...block(-6.5, 12.4, 1.4, .42, 1.64), bottom: 1.37 };

const { outer, halfDepth } = CARRIER_ROOM_SIZE;
const roomHalfX = (outer - CARRIER_ROOM_SIZE.inner) / 2;
/**
 * Hull walls with a window band towards space. Collision stays solid; the client draws them as framed glass.
 * Rear wall of the mess, the outer hull of each side room and the two hangar walls of the boarding deck.
 */
/** Locker rows along the room wall away from the centre line. */
export const CARRIER_LOCKERS: readonly Obstacle[] = [-1, 1].flatMap((side) =>
  [-9, 9].map((z) => block(side * 20.5, z + Math.sign(z) * (halfDepth - .62), 5.4, .38, 2.5)));
export const CARRIER_WINDOW_WALLS: readonly Obstacle[] = [
  block(0, 17, 13, .3),
  ...[-1, 1].flatMap((side) => [-9, 9].map((z) => block(side * outer, z, .24, halfDepth))),
  block(-7.35, -29, .23, 11), block(7.35, -29, .23, 11),
];

export const CARRIER_WORLD: WorldDefinition = {
  id: 'world.skyfall_carrier', half: 42, deployment: CARRIER_SPAWN,
  patrolRegions: [], breachRegions: [], initialNests: [],
  obstacles: [
    ...CARRIER_WINDOW_WALLS,
    block(-7.7, -17, 4.5, .3), block(7.7, -17, 4.5, .3),
    block(-3.1, -21.4, .25, 4.5), block(3.1, -21.4, .25, 4.5),
    block(0, 0, 1.58, 1.58, 1.06),
    ...CARRIER_BENCHES,
    serviceFrame,
    ...[-1, 1].map((side) => block(serviceFrame.x + side * 1.4, serviceFrame.z, .13, .37, serviceFrame.bottom)),
    ...[-1, 1].flatMap((side) => [
      ...[-15, 0, 15].map((z) => block(side * 12, z, .3, z === 0 ? 5.8 : 2)),
      ...[-9, 9].flatMap((z) => [
        // Room walls, the station desk in the middle and the locker row along the wall away from the centre line.
        block(side * (12 + roomHalfX), z - halfDepth, roomHalfX, .24), block(side * (12 + roomHalfX), z + halfDepth, roomHalfX, .24),
        block(side * 21.5, z - Math.sign(z) * 1.2, 2.1, .8, 1.18),
        ...CARRIER_LOCKERS.filter((locker) => Math.sign(locker.x) === side && Math.sign(locker.z) === Math.sign(z)),
        block(side * 7.7, z, 2.25, 1.2, .85),
      ]),
      block(side * 12, -12.9, .3, .85), block(side * 12, -5.1, .3, .85),
      block(side * 12, 5.1, .3, .85), block(side * 12, 12.9, .3, .85),
    ]),
    block(0, -39.8, 7.6, .25),
    block(-5.3, -18.15, 2.1, .25), block(5.3, -18.15, 2.1, .25),
    ...albatrossCollision(CARRIER_SHIP),
  ],
};

export function missionGround(world: WorldDefinition): WorldDefinition {
  return { ...world, obstacles: [...world.obstacles, ...albatrossCollision(landingShip(world.deployment))] };
}
