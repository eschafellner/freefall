export const SWARM_FACTION_ID = 'swarm';
export const SCHABE_ARCHETYPE_ID = 'swarm.schabe';
export const SCHABE_TYPE = 0;

export interface EnemyGameplay {
  health: number;
  speed: number;
  hitRadius: number;
  hitHeight: number;
  meleeRange: number;
  meleeDamage: number;
  meleeCooldown: number;
}

interface FactionDefinition {
  id: string;
  displayName: string;
}

interface EnemyArchetype {
  id: string;
  factionId: keyof typeof FACTIONS;
  displayName: string;
  wireType: number;
  gameplay: Readonly<EnemyGameplay>;
  visualAssetId: string;
}

export const FACTIONS = Object.freeze({
  [SWARM_FACTION_ID]: Object.freeze({ id: SWARM_FACTION_ID, displayName: 'Der Schwarm' }),
} satisfies Record<string, FactionDefinition>);

const schabe = Object.freeze({
  id: SCHABE_ARCHETYPE_ID,
  factionId: SWARM_FACTION_ID,
  displayName: 'Schabe',
  wireType: SCHABE_TYPE,
  gameplay: Object.freeze({
    health: 48,
    speed: 3.55,
    hitRadius: 0.68,
    hitHeight: 0.72,
    meleeRange: 1.45,
    meleeDamage: 8,
    meleeCooldown: 1.3,
  }),
  visualAssetId: 'enemy.swarm.schabe.procedural',
} as const satisfies EnemyArchetype);

export const ENEMY_ARCHETYPES = Object.freeze({ [schabe.id]: schabe });
const byWireType: (EnemyArchetype | undefined)[] = [];
for (const archetype of Object.values<EnemyArchetype>(ENEMY_ARCHETYPES)) {
  if (!Number.isInteger(archetype.wireType) || archetype.wireType < 0 || archetype.wireType > 255 ||
      byWireType[archetype.wireType]) throw new Error(`Invalid enemy wire type for ${archetype.id}`);
  byWireType[archetype.wireType] = archetype;
}
export const ENEMY_ARCHETYPES_BY_TYPE = Object.freeze(byWireType);
// Dense gameplay lookup for valid ECS slots. Spawn rejects unregistered types.
export const ENEMY_TYPES = Object.freeze(byWireType.map((archetype) => archetype!.gameplay));
export const RUNNER_TYPE = SCHABE_TYPE;
export type EnemyDefinition = EnemyGameplay;
