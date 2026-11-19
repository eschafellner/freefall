import { NET } from '../config/arena.ts';
import { BALANCE } from '../balance/defaults.ts';
import { ALBATROSS_VEHICLE_ID } from '../balance/registry.ts';
import type { PositionXZ } from '../config/movement.ts';
import { BODENBRUCH } from './missions.ts';
import type { Obstacle, WorldDefinition } from './missions.ts';

export interface PlanetDefinition {
  id: string;
  displayName: string;
  missions: readonly string[];
}

const devAult: PlanetDefinition = { id: 'dev-ault', displayName: "Dev' Ault", missions: [BODENBRUCH.id] };
export const PLANET_REGISTRY: ReadonlyMap<string, PlanetDefinition> = new Map([[devAult.id, devAult]]);
export const CARRIER_CONSOLE = { x: 0, z: 0, radius: 5 };
export const CARRIER_SPAWN = { x: 0, z: 12, radius: 4, facing: 0 };
export const CARRIER_SHIP = { x: 0, z: -31 };
export const CARRIER_ROOMS = [
  { x: -19, z: 9, label: 'AUSRÜSTUNG' }, { x: 19, z: 9, label: 'WAFFENKAMMER' },
  { x: -19, z: -9, label: 'RÜSTUNG' }, { x: 19, z: -9, label: 'FORSCHUNG' },
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

export const DEPLOYMENT_PHASES = [
  ['LOCKED', 25], ['DROPPING', 47], ['ATMOSPHERIC_ENTRY', 76], ['BRAKING', 54], ['TOUCHDOWN', 47],
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
  ];
}

// Service frame beside the mess, outside the deployment route.
const serviceFrame = { ...block(-6.5, 12.4, 1.4, .42, 1.64), bottom: 1.37 };

export const CARRIER_WORLD: WorldDefinition = {
  id: 'world.skyfall_carrier', half: 42, deployment: CARRIER_SPAWN,
  patrolRegions: [], breachRegions: [], initialNests: [],
  obstacles: [
    block(0, 17, 13, .3), block(-7.7, -17, 4.5, .3), block(7.7, -17, 4.5, .3),
    block(-3.1, -21.4, .25, 4.5), block(3.1, -21.4, .25, 4.5),
    block(0, 0, 1.58, 1.58, 1.06),
    ...CARRIER_BENCHES,
    serviceFrame,
    ...[-1, 1].map((side) => block(serviceFrame.x + side * 1.4, serviceFrame.z, .13, .37, serviceFrame.bottom)),
    ...[-1, 1].flatMap((side) => [
      ...[-15, 0, 15].map((z) => block(side * 12, z, .3, z === 0 ? 5.8 : 2)),
      ...[-9, 9].flatMap((z) => [
        block(side * 18.65, z - 4.5, 6.6, .24), block(side * 18.65, z + 4.5, 6.6, .24), block(side * 25, z, .24, 4.5),
        block(side * 21.7, z - 2.3, 1.9, .8, 1.18), block(side * 7.7, z, 2.25, 1.2, .85),
      ]),
      block(side * 12, -12.9, .3, .85), block(side * 12, -5.1, .3, .85),
      block(side * 12, 5.1, .3, .85), block(side * 12, 12.9, .3, .85),
    ]),
    block(-7.35, -29, .23, 11), block(7.35, -29, .23, 11), block(0, -39.8, 7.6, .25),
    block(-5.3, -18.15, 2.1, .25), block(5.3, -18.15, 2.1, .25),
    ...albatrossCollision(CARRIER_SHIP),
  ],
};

export function missionGround(world: WorldDefinition): WorldDefinition {
  return { ...world, obstacles: [...world.obstacles, ...albatrossCollision(landingShip(world.deployment))] };
}
