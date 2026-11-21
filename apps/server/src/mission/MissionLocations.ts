import {
  ALBATROSS, MAX_PLAYERS, distanceSquared, inAlbatross, landingShip, missionGround, openGround,
} from '@freefall/shared';
import type {
  MissionBalance, MissionDefinition, MissionLocation, PositionXZ, WorldDefinition,
} from '@freefall/shared';
import { GroundNavigation } from './GroundNavigation.ts';

export function landingOperatorPosition(ship: PositionXZ, slot: number): PositionXZ {
  return { x: ship.x + (slot % 2 ? .9 : -.9), z: ship.z + 2 + 1.4 * Math.floor(slot / 2) };
}

/** Shared with deployment and runtime breaches so validation uses their actual placement rules. */
export function nestFits(mission: MissionDefinition, balance: MissionBalance, position: PositionXZ): boolean {
  const { world, objectives } = mission;
  const calls = balance.reinforcements;
  return openGround(world, position.x, position.z, balance.nest.exitRadius + 1) &&
    distanceSquared(position, world.deployment) >= (world.deployment.radius + calls.deploymentClearance) ** 2 &&
    (!world.serviceApron || distanceSquared(position, world.serviceApron) >=
      (world.serviceApron.radius + calls.serviceApronClearance) ** 2) &&
    objectives.every((objective) => objective.kind !== 'activate' ||
      distanceSquared(position, objective) >= (objective.radius + calls.objectiveClearance) ** 2);
}

export interface MissionLocationGeometry {
  readonly world: WorldDefinition;
  readonly ground: WorldDefinition;
  open(point: PositionXZ, clearance: number): boolean;
  reachable(start: PositionXZ, target: PositionXZ): boolean;
}

/** Validate sites against the same ground envelope and path graph used during a mission. */
export function staticMissionGeometry(world: WorldDefinition, balance: MissionBalance): MissionLocationGeometry {
  const ground = missionGround(world);
  const radius = balance.movement.colliders.STANDING.radius;
  const navigation = new GroundNavigation(ground, balance.hordeAi, radius);
  return {
    world, ground,
    open: (point, clearance) => Number.isFinite(point.x) && Number.isFinite(point.z) &&
      Number.isFinite(clearance) && clearance > 0 && openGround(ground, point.x, point.z, Math.max(radius, clearance)),
    reachable: (start, end) => navigation.reachable(start.x, start.z, end.x, end.z),
  };
}

export function validDeployment(deployment: MissionLocation, ship: MissionLocation, geometry: MissionLocationGeometry): boolean {
  const expectedShip = landingShip(geometry.world.deployment);
  if (distanceSquared(deployment, geometry.world.deployment) !== 0 || distanceSquared(ship, expectedShip) !== 0 ||
      !openGround(geometry.world, ship.x, ship.z, Math.max(ALBATROSS.halfLength, ...ALBATROSS.thrusters.map(({ x }) => Math.abs(x)))) ||
      !geometry.open(ship, ship.radius)) return false;
  for (let slot = 0; slot < MAX_PLAYERS; slot++) {
    const spawn = landingOperatorPosition(ship, slot);
    if (!inAlbatross(spawn, ship) || !geometry.open(spawn, .1) || !geometry.reachable(spawn, ship)) return false;
  }
  return true;
}

export function separated(a: MissionLocation, b: MissionLocation): boolean {
  return distanceSquared(a, b) >= (a.radius + b.radius) ** 2;
}
