import type { WorldIdentity } from '../world/WorldGenerator.ts';
import type { ExtractionMethod } from './mission.ts';
import type { MissionLocation, ObjectiveTemplateId } from '../definitions/proceduralMissions.ts';
import type { ObjectiveDefinition } from '../definitions/missions.ts';

import type { TimeOfDay } from '../world/PlanetWeather.ts';

export interface PlannedObjective {
  readonly type: ObjectiveTemplateId;
  readonly locationId: string;
  readonly definition: ObjectiveDefinition;
}

export interface MissionPlan {
  readonly id: string;
  readonly formatVersion: number;
  readonly generatorVersion: number;
  readonly planetId: string;
  readonly planetVersion: number;
  readonly worldId: string;
  readonly world?: WorldIdentity;
  readonly seed: number;
  readonly timeOfDay?: TimeOfDay;
  readonly templateId: string;
  readonly requestedTemplateId?: string;
  readonly templateVersion: number;
  readonly displayName: string;
  readonly briefing: string;
  readonly difficultyId: string;
  readonly deployment: MissionLocation;
  readonly objectives: readonly PlannedObjective[];
  readonly encounter: {
    readonly maxActiveEnemies: number;
    readonly maxSpawnsPerTick: number;
    readonly reinforcementBudget: number;
    readonly firstExtractionPressureTicks: number;
    readonly breachRegionIds: readonly string[];
  };
  readonly extraction: {
    readonly methods: readonly ExtractionMethod[];
    readonly albatross: MissionLocation;
    readonly balloon: MissionLocation;
  };
  readonly resupply: 'albatross';
  readonly modifiers: readonly string[];
  readonly balance: { readonly release: string; readonly hash: string };
}
