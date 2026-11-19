/**
 * The published balance configuration: the JSON files in `./data`, validated once at module load.
 * A broken file stops the server (and the client build) with a readable error list.
 */
import combat from './data/combat.json' with { type: 'json' };
import convicts from './data/convicts.json' with { type: 'json' };
import difficulty from './data/difficulty.json' with { type: 'json' };
import enemies from './data/enemies.json' with { type: 'json' };
import equipment from './data/equipment.json' with { type: 'json' };
import manifest from './data/manifest.json' with { type: 'json' };
import movement from './data/movement.json' with { type: 'json' };
import operators from './data/operators.json' with { type: 'json' };
import structures from './data/structures.json' with { type: 'json' };
import swarm from './data/swarm.json' with { type: 'json' };
import weapons from './data/weapons.json' with { type: 'json' };
import { createBalanceRegistry } from './registry.ts';
import { resolveLoadout } from './resolver.ts';

/** Raw data as loaded from disk. Use for tests that need a modified copy. */
export const BALANCE_SOURCES = { manifest, weapons, equipment, operators, enemies, structures, swarm, convicts, difficulty, combat, movement };

export const BALANCE = createBalanceRegistry(BALANCE_SOURCES);

/** Effective standard operator loadout without attachments. */
export const BASE_LOADOUT = resolveLoadout(BALANCE);
