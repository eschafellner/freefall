/** Difficulty aliases. All seven levels live in `balance/data/difficulty.json`. */
import { BALANCE } from '../balance/defaults.ts';
import type { DifficultyDefinition } from '../balance/definitions.ts';

export type { DifficultyDefinition } from '../balance/definitions.ts';

export const DIFFICULTIES: readonly DifficultyDefinition[] = BALANCE.difficulties;
export const DIFFICULTY_REGISTRY: ReadonlyMap<string, DifficultyDefinition> = BALANCE.difficultyById;
