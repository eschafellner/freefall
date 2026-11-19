import type { PositionXZ } from '../config/movement.ts';

export interface Circle extends PositionXZ { radius: number }
export interface PlayerSpawnRegion extends Circle { facing: number }
export interface PatrolRoute { readonly waypoints: readonly PositionXZ[] }
export interface PatrolRegion extends Circle { id: string; route: PatrolRoute }
export interface SwarmBreachRegion extends Circle { id: string }
export interface Obstacle extends PositionXZ {
  halfX: number;
  halfZ: number;
  /** Top elevation. Solids start at ground level unless bottom is set. */
  height: number;
  bottom?: number;
  kind: 'rock' | 'bunker' | 'barrier' | 'container';
}
export interface WorldDefinition {
  id: string;
  half: number;
  deployment: PlayerSpawnRegion;
  obstacles: readonly Obstacle[];
  serviceApron?: Circle;
  patrolRegions: readonly PatrolRegion[];
  breachRegions: readonly SwarmBreachRegion[];
  initialNests: readonly PositionXZ[];
}

export type ObjectiveDefinition =
  | (Circle & { id: string; kind: 'activate'; label: string; requires?: string; defenseSeconds?: number })
  | { id: string; kind: 'destroy-nests'; label: string; count: number };

export interface MissionDefinition {
  id: string;
  displayName: string;
  briefing: string;
  world: WorldDefinition;
  objectives: readonly ObjectiveDefinition[];
}

const patrol = (id: string, x: number, z: number, radius: number, corrections: Readonly<Record<number, PositionXZ>> = {}): PatrolRegion => ({
  id, x, z, radius,
  route: { waypoints: [
    { x: x - radius, z: z - radius * .4 }, { x: x + radius * .52, z: z - radius * .7 },
    { x: x + radius, z: z + radius * .4 }, { x: x - radius * .53, z: z + radius * .71 },
  ].map((point, index) => corrections[index] ?? point) },
});

const obstacle = (x: number, z: number, halfX: number, halfZ: number, height: number, kind: Obstacle['kind']): Obstacle =>
  ({ x, z, halfX, halfZ, height, kind });
const breach = (id: string, x: number, z: number, radius = 15): SwarmBreachRegion => ({ id, x, z, radius });

export const BODENBRUCH_WORLD: WorldDefinition = {
  id: 'world.bodenbruch', half: 210, deployment: { x: -144, z: 153, radius: 24, facing: .4 },
  obstacles: [
    obstacle(-166, 139, 9, 5, 4.6, 'bunker'), obstacle(-162, 153, 4, 1.65, 2.7, 'container'),
    obstacle(-137, 169, 7, 1.5, 1.3, 'barrier'), obstacle(-133, 139, 4, 1.5, 1.2, 'barrier'),
    obstacle(-114, 46, 8, 5, 4.2, 'bunker'), obstacle(-94, 46, 4, 1.6, 2.6, 'container'),
    obstacle(-89, 26, 4, 1.3, 1.2, 'barrier'), obstacle(-109, 24, 1.3, 4, 1.1, 'barrier'),
    obstacle(97, -38, 8, 4.5, 4, 'bunker'), obstacle(81, -35, 4, 1.7, 2.7, 'container'),
    obstacle(85, -56, 4, 1.3, 1.2, 'barrier'), obstacle(104, -54, 1.4, 4.5, 1.2, 'barrier'),
    obstacle(170, -141, 5, 2, 2.7, 'container'), obstacle(128, -152, 1.4, 6, 1.1, 'barrier'),
    obstacle(-157, 87, 10, 7, 10, 'rock'), obstacle(-64, 98, 14, 7, 8, 'rock'),
    obstacle(-44, 45, 9, 16, 12, 'rock'), obstacle(-26, 25, 6, 7, 6, 'rock'),
    obstacle(-107, -27, 15, 9, 12, 'rock'), obstacle(-42, -44, 13, 10, 11, 'rock'),
    obstacle(38, 14, 9, 13, 8, 'rock'), obstacle(42, 30, 8, 6, 6, 'rock'),
    obstacle(24, -74, 13, 8, 7, 'rock'), obstacle(134, -79, 13, 7, 11, 'rock'),
    obstacle(87, -121, 12, 8, 8, 'rock'), obstacle(167, -102, 7, 10, 7, 'rock'),
    obstacle(115, -180, 11, 7, 9, 'rock'), obstacle(65, 89, 21, 12, 13, 'rock'),
    obstacle(124, 53, 11, 8, 12, 'rock'), obstacle(-139, -105, 11, 16, 10, 'rock'),
    obstacle(24, 151, 16, 9, 10, 'rock'), obstacle(154, 123, 11, 5, 11, 'rock'),
  ],
  serviceApron: { x: 150, z: -153, radius: 13 },
  patrolRegions: [
    patrol('service-road', -111, 83, 24), patrol('west-crater', -52, 82, 30, { 1: { x: -30, z: 70 }, 3: { x: -73, z: 111 } }),
    patrol('ridge-pass', -50, -5, 32), patrol('central-basin', 3, -23, 31),
    patrol('eastern-road', 70, -16, 29, { 1: { x: 74, z: -35 } }), patrol('landing-approach', 121, -105, 30, { 0: { x: 101, z: -108 } }),
    patrol('north-trench', 93, -86, 29, { 2: { x: 111, z: -68 } }), patrol('west-flats', -140, 15, 29, { 2: { x: -121, z: 24 } }),
    patrol('scrapyard', 11, 60, 35), patrol('south-corridor', -50, 134, 32),
  ],
  breachRegions: [
    breach('service-road', -104, 102), breach('west-crater', -72, 74), breach('alpha-flank', -127, 11),
    breach('ridge-pass', -57, 9), breach('central-basin', 1, -34, 18), breach('central-shelf', 20, 4),
    breach('east-road', 66, -2), breach('bravo-flank', 110, -13), breach('bravo-draw', 57, -73),
    breach('evac-west', 108, -139), breach('evac-north', 146, -116), breach('evac-east', 185, -148),
    breach('evac-south', 157, -185), breach('south-flats', -52, 129), breach('east-flats', 55, 49),
  ],
  initialNests: [{ x: -86, z: 78 }],
};

export const BODENBRUCH: MissionDefinition = {
  id: 'mission.operation_bodenbruch',
  displayName: 'Operation Bodenbruch',
  briefing: 'Der Außenposten hat den Kontakt zur Flotte verloren. Reaktiviert die Relais Alpha und Bravo. Nach Zielerfüllung entscheidet der Trupp über die Extraktion.',
  world: BODENBRUCH_WORLD,
  objectives: [
    { id: 'alpha', kind: 'activate', label: 'Kommunikationsanlage Alpha', x: -100, z: 34, radius: 4.8, defenseSeconds: 8 },
    { id: 'bravo', kind: 'activate', label: 'Kommunikationsanlage Bravo', x: 92, z: -49, radius: 4.8, requires: 'alpha' },
    { id: 'nests', kind: 'destroy-nests', label: 'Schwarmnester zerstören', count: 1 },
  ],
};

export const WORLD_REGISTRY: ReadonlyMap<string, WorldDefinition> = new Map([[BODENBRUCH_WORLD.id, BODENBRUCH_WORLD]]);
export const MISSION_REGISTRY: ReadonlyMap<string, MissionDefinition> = new Map([[BODENBRUCH.id, BODENBRUCH]]);
export const BODENBRUCH_ROOM = 'bodenbruch';
