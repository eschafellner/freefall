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

const albatross = BALANCE.vehicle(ALBATROSS_VEHICLE_ID);

/** Geometry is defined here. Hull, thruster health and the grounding rule come from `balance/data/structures.json`. */
export const ALBATROSS = {
  hullHealth: albatross.hullHealth, thrusterHealth: albatross.thrusterHealth, disabledThrusters: albatross.disabledThrusters,
  halfWidth: 2.55, halfLength: 5.2, boardingWidth: 2.08, boardingLength: 4.65,
  launchTicks: NET.tickHz * 4, liftTicks: NET.tickHz * 2, thrusters: [
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
  countdownTicks: 90 * NET.tickHz, approachTicks: 3 * NET.tickHz, liftTicks: 5 * NET.tickHz, height: 20 } as const;
/** Outbound cinematic after the pickup: the Albatross climbs away, the fighter tows the balloon line. */
export const extractionLiftTicks = (method: 'albatross' | 'balloon'): number =>
  method === 'albatross' ? ALBATROSS.liftTicks : BALLOON.liftTicks;
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

export function albatrossCollision(ship: PositionXZ): Obstacle[] {
  return [
    block(ship.x - ALBATROSS.halfWidth, ship.z, .22, ALBATROSS.halfLength, 3.4),
    block(ship.x + ALBATROSS.halfWidth, ship.z, .22, ALBATROSS.halfLength, 3.4),
    block(ship.x, ship.z - ALBATROSS.halfLength, ALBATROSS.halfWidth, .22, 3.4),
  ].map((obstacle) => ({ ...obstacle, surface: 'metal' }));
}

export function missionGround(world: WorldDefinition): WorldDefinition {
  return { ...world, obstacles: [...world.obstacles, ...albatrossCollision(landingShip(world.deployment))] };
}
