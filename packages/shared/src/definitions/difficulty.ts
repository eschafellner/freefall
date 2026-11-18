export interface DifficultyDefinition {
  readonly id: string;
  readonly level: number;
  readonly displayName: string;
  readonly maxActiveEnemies: number;
  readonly maxActiveNests: number;
  readonly patrolGroupCount: number;
  readonly patrolMinSize: number;
  readonly patrolMaxSize: number;
  readonly detectionRangeMultiplier: number;
  readonly reinforcementCooldownMultiplier: number;
  readonly nestSpawnIntervalMultiplier: number;
  readonly nestHealthMultiplier: number;
  readonly extractionThreatMultiplier: number;
  readonly maxConcurrentBreaches: number;
  readonly reinforcementBudget: number;
  readonly maxSpawnsPerTick: number;
}

export const DIFFICULTIES: readonly DifficultyDefinition[] = [
  { id: 'easy', level: 1, displayName: 'Leicht', maxActiveEnemies: 120, maxActiveNests: 2, patrolGroupCount: 5, patrolMinSize: 3, patrolMaxSize: 5, detectionRangeMultiplier: .82, reinforcementCooldownMultiplier: 1.55, nestSpawnIntervalMultiplier: 1.55, nestHealthMultiplier: .85, extractionThreatMultiplier: .5, maxConcurrentBreaches: 1, reinforcementBudget: 5, maxSpawnsPerTick: 8 },
  { id: 'normal', level: 2, displayName: 'Normal', maxActiveEnemies: 200, maxActiveNests: 3, patrolGroupCount: 8, patrolMinSize: 4, patrolMaxSize: 7, detectionRangeMultiplier: 1, reinforcementCooldownMultiplier: 1.25, nestSpawnIntervalMultiplier: 1.2, nestHealthMultiplier: 1, extractionThreatMultiplier: .75, maxConcurrentBreaches: 1, reinforcementBudget: 8, maxSpawnsPerTick: 10 },
  { id: 'challenging', level: 3, displayName: 'Herausfordernd', maxActiveEnemies: 320, maxActiveNests: 4, patrolGroupCount: 12, patrolMinSize: 6, patrolMaxSize: 9, detectionRangeMultiplier: 1.07, reinforcementCooldownMultiplier: 1, nestSpawnIntervalMultiplier: 1, nestHealthMultiplier: 1, extractionThreatMultiplier: 1, maxConcurrentBreaches: 2, reinforcementBudget: 12, maxSpawnsPerTick: 12 },
  { id: 'hard', level: 4, displayName: 'Schwer', maxActiveEnemies: 450, maxActiveNests: 5, patrolGroupCount: 15, patrolMinSize: 8, patrolMaxSize: 13, detectionRangeMultiplier: 1.14, reinforcementCooldownMultiplier: .83, nestSpawnIntervalMultiplier: .8, nestHealthMultiplier: 1.1, extractionThreatMultiplier: 1.25, maxConcurrentBreaches: 2, reinforcementBudget: 16, maxSpawnsPerTick: 14 },
  { id: 'extreme', level: 5, displayName: 'Extrem', maxActiveEnemies: 600, maxActiveNests: 6, patrolGroupCount: 20, patrolMinSize: 10, patrolMaxSize: 16, detectionRangeMultiplier: 1.22, reinforcementCooldownMultiplier: .68, nestSpawnIntervalMultiplier: .62, nestHealthMultiplier: 1.15, extractionThreatMultiplier: 1.5, maxConcurrentBreaches: 3, reinforcementBudget: 20, maxSpawnsPerTick: 16 },
  { id: 'nightmare', level: 6, displayName: 'Albtraum', maxActiveEnemies: 800, maxActiveNests: 8, patrolGroupCount: 24, patrolMinSize: 13, patrolMaxSize: 20, detectionRangeMultiplier: 1.3, reinforcementCooldownMultiplier: .55, nestSpawnIntervalMultiplier: .47, nestHealthMultiplier: 1.2, extractionThreatMultiplier: 1.8, maxConcurrentBreaches: 3, reinforcementBudget: 24, maxSpawnsPerTick: 18 },
  { id: 'freefall', level: 7, displayName: 'FREEFALL', maxActiveEnemies: 1000, maxActiveNests: 10, patrolGroupCount: 30, patrolMinSize: 16, patrolMaxSize: 24, detectionRangeMultiplier: 1.38, reinforcementCooldownMultiplier: .43, nestSpawnIntervalMultiplier: .32, nestHealthMultiplier: 1.25, extractionThreatMultiplier: 2.1, maxConcurrentBreaches: 4, reinforcementBudget: 32, maxSpawnsPerTick: 24 },
];

export const DIFFICULTY_REGISTRY: ReadonlyMap<string, DifficultyDefinition> =
  new Map(DIFFICULTIES.map((difficulty) => [difficulty.id, difficulty]));
