import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ENEMY_ARCHETYPES, ENEMY_ARCHETYPES_BY_TYPE, ENEMY_TYPES, FACTIONS, HordeFrame, RUNNER_TYPE,
  SCHABE_ARCHETYPE_ID, SWARM_FACTION_ID, decodeHorde,
} from '@freefall/shared';
import { encodeHorde } from '../src/networking/snapshots.ts';
import { Arena } from '../src/simulation/Arena.ts';
import { ARENA_REINFORCEMENTS } from '../src/simulation/ArenaEncounter.ts';
import { AI } from '../src/systems/horde.ts';

test('arena spawns the approved Schabe on legacy wire type zero', () => {
  const schabe = ENEMY_ARCHETYPES[SCHABE_ARCHETYPE_ID];
  assert.equal(schabe.id, 'swarm.schabe');
  assert.equal(schabe.displayName, 'Schabe');
  assert.equal(schabe.factionId, SWARM_FACTION_ID);
  assert.deepEqual(FACTIONS[schabe.factionId], { id: 'swarm', displayName: 'Der Schwarm' });
  assert.equal(schabe.visualAssetId, 'enemy.swarm.schabe.procedural');
  assert.equal(RUNNER_TYPE, 0);
  assert.equal(ENEMY_ARCHETYPES_BY_TYPE[0], schabe);
  assert.equal(ENEMY_TYPES[0], schabe.gameplay);
  assert.deepEqual(schabe.gameplay, {
    health: 48, speed: 3.55, hitRadius: 0.68, hitHeight: 0.72,
    meleeRange: 1.45, meleeDamage: 8, meleeCooldown: 1.3,
  });
  assert.deepEqual(ARENA_REINFORCEMENTS, {
    archetypeId: 'swarm.schabe', outerRadius: 51, ringWidth: 11, refillTicks: 9,
  });
  assert.deepEqual(AI, {
    targetTicks: 6, steeringTicks: 2, separationRadius: 1.65, neighborsPerCell: 12, refillTicks: 9,
  });

  const arena = new Arena(1, 100);
  arena.step();
  const frame = new HordeFrame();
  assert.ok(decodeHorde(encodeHorde(arena.horde, arena.tick), frame));
  assert.equal(frame.count, 100);
  for (let i = 0; i < frame.count; i++) {
    assert.equal(frame.type[i], 0);
    assert.equal(arena.horde.hp[arena.horde.active[i]], 48);
    const radius = Math.hypot(frame.x[i], frame.z[i]);
    assert.ok(radius >= 39.99 && radius <= 51.01);
  }
});

test('Schabe procedural visual and ECS source match the approved baseline', () => {
  const root = new URL('../../../', import.meta.url);
  const manifest = readFileSync(new URL('docs/enemies/schabe/baseline.sha256', root), 'utf8');
  for (const line of manifest.trim().split('\n')) {
    const [expected, path] = line.trim().split(/\s+/);
    const hash = createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex');
    assert.equal(hash, expected, `Approved Schabe baseline changed: ${path}`);
  }
});
