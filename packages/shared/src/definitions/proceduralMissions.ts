import { BALANCE } from '../balance/index.ts';
import type { BalanceRegistry, StatModifier } from '../balance/index.ts';
import { landingShip } from './deployment.ts';
import { SWARM_FACTION_ID } from './enemies.ts';
import { WORLD_PROFILES } from '../world/PlanetProfiles.ts';
import type { WorldPlan } from '../world/WorldGenerator.ts';
import { BODENBRUCH } from './missions.ts';
import type { Circle, ObjectiveDefinition } from './missions.ts';

export const PROCEDURAL_CONTRACT_ID = 'mission.procedural';
export const MISSION_GENERATOR_VERSION = 1;
export const MISSION_PLAN_VERSION = 1;

export type ObjectiveLocationTag = 'relay' | 'initial-nest';
export type MissionLocationTag = ObjectiveLocationTag | 'deployment' | 'albatross' | 'balloon';
export interface MissionLocation extends Circle {
  readonly id: string;
  readonly tag: MissionLocationTag;
  readonly label: string;
}

interface ObjectiveTemplate {
  readonly kind: ObjectiveDefinition['kind'];
  readonly locationTag: ObjectiveLocationTag;
}

export const OBJECTIVE_TEMPLATES = {
  'activate-relay': { kind: 'activate', locationTag: 'relay' },
  'defend-relay': { kind: 'activate', locationTag: 'relay' },
  'purge-nest': { kind: 'destroy-nests', locationTag: 'initial-nest' },
} as const satisfies Record<string, ObjectiveTemplate>;
export type ObjectiveTemplateId = keyof typeof OBJECTIVE_TEMPLATES;

export interface MissionTemplate {
  readonly id: string;
  readonly version: number;
  readonly displayName: string;
  readonly primary: readonly ObjectiveTemplateId[];
  readonly optional: readonly ObjectiveTemplateId[];
}

const templates: readonly MissionTemplate[] = [
  { id: 'nest-purge', version: 1, displayName: 'Nestjagd', primary: ['purge-nest'], optional: [] },
  { id: 'relay-defense', version: 1, displayName: 'Relaisverteidigung', primary: ['defend-relay'], optional: ['purge-nest'] },
  { id: 'relay-chain', version: 1, displayName: 'Relaisverbund', primary: ['defend-relay', 'activate-relay'], optional: ['purge-nest'] },
];
export const MISSION_TEMPLATES: ReadonlyMap<string, MissionTemplate> = new Map(templates.map((entry) => [entry.id, entry]));

const { world } = BODENBRUCH;
const relays = BODENBRUCH.objectives.filter((item) => item.kind === 'activate');
const deployment = { ...world.deployment, id: 'landing-zone', tag: 'deployment', label: 'Landepunkt' } as const;
const albatross = { ...landingShip(world.deployment), radius: 1, id: 'albatross', tag: 'albatross', label: 'Albatross 02' } as const;

export interface PlanetMissionProfile {
  readonly id: string;
  readonly version: number;
  readonly worldId: string;
  readonly environmentTags: readonly string[];
  readonly enemyFactions: readonly string[];
  readonly templateIds: readonly string[];
  readonly objectiveTypes: readonly ObjectiveTemplateId[];
  readonly locations: readonly MissionLocation[];
  readonly breachRegionIds: readonly string[];
  readonly breachRegionCount: number;
  readonly modifierIds: readonly string[];
  readonly difficultyIds: readonly string[];
  readonly fallbackMissionId?: string;
}

export const DEV_AULT_PROFILE: PlanetMissionProfile = {
  id: 'dev-ault',
  version: 1,
  worldId: world.id,
  environmentTags: ['open-ground', 'rocky-outpost'],
  enemyFactions: [SWARM_FACTION_ID],
  templateIds: templates.map(({ id }) => id),
  objectiveTypes: ['activate-relay', 'defend-relay', 'purge-nest'],
  locations: [
    deployment, albatross,
    ...relays.map(({ id, x, z, radius, label }) => ({ id, x, z, radius, label, tag: 'relay' as const })),
    { ...world.initialNests[0], id: 'west-crater-nest', tag: 'initial-nest', radius: BALANCE.primaryNest.hitRadius, label: 'Schwarmnest im Westkrater' },
    { x: -145, z: 178, radius: 5, id: 'south-flats-pickup', tag: 'balloon', label: 'Südliche Ebene' },
    { ...world.serviceApron!, radius: 5, id: 'service-apron-pickup', tag: 'balloon', label: 'Östliches Vorfeld' },
  ],
  breachRegionIds: world.breachRegions.map(({ id }) => id),
  breachRegionCount: 12,
  modifierIds: ['early-extraction-pressure'],
  difficultyIds: BALANCE.difficulties.map(({ id }) => id),
  fallbackMissionId: BODENBRUCH.id,
};

export const PLANET_MISSION_PROFILES: ReadonlyMap<string, PlanetMissionProfile> = new Map([[DEV_AULT_PROFILE.id, DEV_AULT_PROFILE]]);

interface MissionModifier {
  readonly id: string;
  readonly displayName: string;
  readonly planetIds: readonly string[];
  readonly templateIds: readonly string[];
  readonly requires: 'extraction-reinforcements';
  readonly conflicts: readonly string[];
  resolve(registry: BalanceRegistry): readonly StatModifier[];
}

const earlyPressure: MissionModifier = {
  id: 'early-extraction-pressure',
  displayName: 'Frühe Verstärkung bei Extraktion',
  planetIds: [DEV_AULT_PROFILE.id, ...WORLD_PROFILES.keys()],
  templateIds: ['relay-chain', 'nest-purge'],
  requires: 'extraction-reinforcements',
  conflicts: [],
  resolve: (registry) => [{
    source: 'mission:early-extraction-pressure', layer: 'mission', stat: 'extraction.initialPressureTicks',
    operation: 'multiply', value: registry.swarm.missionGeneration.earlyPressureMultiplier,
  }],
};
export const MISSION_MODIFIERS: ReadonlyMap<string, MissionModifier> = new Map([[earlyPressure.id, earlyPressure]]);


export function worldMissionProfile(plan: WorldPlan): PlanetMissionProfile {
  const { world, identity } = plan;
  return {
    ...DEV_AULT_PROFILE,
    id: identity.planetId, worldId: world.id, version: identity.profileVersion,
    environmentTags: [identity.biome], modifierIds: ['early-extraction-pressure'], fallbackMissionId: undefined,
    locations: [
      { ...world.deployment, id: 'landing-zone', tag: 'deployment', label: 'Landepunkt' },
      { ...landingShip(world.deployment), radius: 1, id: 'albatross', tag: 'albatross', label: 'Albatross 02' },
      ...plan.relays.map((site, i) => ({ ...site, id: 'relay-' + i, tag: 'relay' as const, label: 'Relais ' + ['Alpha', 'Bravo', 'Charlie'][i] })),
      ...world.initialNests.map((site, i) => ({ ...site, id: 'start-nest-' + i, tag: 'initial-nest' as const,
        label: 'Schwarmnest', radius: BALANCE.primaryNest.hitRadius })),
      ...plan.balloonSites.map((site, i) => ({ ...site, id: 'pickup-' + i, tag: 'balloon' as const, label: i === 0 ? 'Nordwest' : 'Südost' })),
    ],
    breachRegionIds: world.breachRegions.map(({ id }) => id),
  };
}
