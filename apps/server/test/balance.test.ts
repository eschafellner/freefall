import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@colyseus/sdk';
import {
  ALBATROSS, ARENA_ROOM, BALANCE, BALANCE_SOURCES, BALANCE_VERSION_MESSAGE, BASE_LOADOUT, BODENBRUCH, BOARDING_TICKS,
  BalanceResolutionError, BalanceValidationError, CARRIER_SHIP, DIFFICULTIES, ENEMY_ARCHETYPES, ENEMY_TYPES, FRAG,
  LANDING_STAGE_TICKS, MAX_ENEMIES, NEST_COLLAPSE_TICKS, NEST_EXITS, NEST_EXIT_RADIUS, NEST_HIT_HEIGHT, NEST_RADIUS, NET,
  PLAYER, SCHABE_ARCHETYPE_ID, SERVICE_PISTOL, STIM, SWITCH_SECONDS, StatResolver, TEST_RIFLE, WEAPONS,
  balanceHash, compareBalanceVersion, createBalanceRegistry, explainBalance, resolveLoadout, resolveMissionBalance,
} from '@freefall/shared';
import type { BalanceVersion, MissionBalance } from '@freefall/shared';
import { MissionInstance } from '../src/mission/MissionInstance.ts';
import { startServer } from '../src/server.ts';
import { allTraces } from './support/balance-trace.ts';

type Sources = typeof BALANCE_SOURCES;
const sources = (): Sources => structuredClone(BALANCE_SOURCES);

function rejects(change: (data: Sources) => void, ...expected: RegExp[]): void {
  const data = sources();
  change(data);
  assert.throws(() => createBalanceRegistry(data), (error: unknown) => {
    assert.ok(error instanceof BalanceValidationError || error instanceof BalanceResolutionError, String(error));
    for (const pattern of expected) assert.match(error.message, pattern);
    return true;
  });
}

function deepFrozen(value: unknown, path = 'root'): void {
  if (typeof value !== 'object' || value === null) return;
  assert.ok(Object.isFrozen(value), `${path} ist nicht eingefroren`);
  for (const [key, entry] of Object.entries(value)) deepFrozen(entry, `${path}.${key}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Values before the migration (Milestone 7.1, commit 2bef906). Copied verbatim from the removed constants.

const LEGACY = {
  rifle: { id: 'kestrel-ar-01', name: 'Kestrel AR-01', category: 'assault-rifle', roundsPerSecond: 10, damage: 24, range: 72, magazineSize: 30, reloadSeconds: 2.1, visualAssetId: 'weapon.kestrel-ar-01' },
  pistol: { id: 'p-01', name: 'P-01 Dienstpistole', category: 'pistol', roundsPerSecond: 4, damage: 18, range: 44, magazineSize: 12, reloadSeconds: 1.45, visualAssetId: 'weapon.p-01' },
  sidearmReserve: 48,
  switchSeconds: .48,
  frag: { id: 'equipment.frag_grenade', capacity: 2, throwSeconds: .52, releaseSeconds: .22, fuseSeconds: 1.65, radius: 7, damage: 110, nestMultiplier: 1.45 },
  stim: { id: 'equipment.medical_stim', capacity: 5, seconds: 1.2, fraction: .4 },
  player: { health: 100, walkSpeed: 5.8, sprintSpeed: 9.2, respawnSeconds: 3, protectionSeconds: 2 },
  albatross: { hullHealth: 1700, thrusterHealth: 330, disabledThrusters: 2 },
  nest: { hp: 360, intervalSeconds: 5.6, breachSeconds: 6.4, radius: 3.8, hitHeight: 1.55, exitRadius: 4.8, exits: 3, collapseTicks: 64 },
  patrol: { sightRange: 31, cooldownSeconds: 35, callSeconds: 3, contactSeconds: 6, perceptionPeriod: 6 },
  director: { regionCooldownSeconds: 32, playerBuffer: 27 },
  schabe: { health: 48, speed: 3.55, hitRadius: 0.68, hitHeight: 0.72, meleeRange: 1.45, meleeDamage: 8, meleeCooldown: 1.3 },
  convictKits: [
    ['security-surplus', 'kestrel-service', 150, 5, 24, 7, 28],
    ['field-standard', 'kestrel-standard', 132, 4, 22, 6.7, 26],
    ['light-webbing', 'kestrel-reserve', 118, 3, 20, 6.2, 24],
    ['aged-infantry', 'kestrel-legacy', 106, 2, 18, 5.8, 22],
    ['worn-reserve', 'kestrel-worn', 96, 1, 16, 5.4, 19],
    ['restricted-issue', 'kestrel-restricted', 84, 0, 14, 5, 16],
    ['minimum-issue', 'kestrel-minimum', 72, 0, 12, 4.5, 12],
  ],
  difficulties: [
    { id: 'easy', level: 1, displayName: 'Leicht', maxActiveEnemies: 120, maxActiveNests: 2, patrolGroupCount: 5, patrolMinSize: 3, patrolMaxSize: 5, detectionRangeMultiplier: .82, reinforcementCooldownMultiplier: 1.55, nestSpawnIntervalMultiplier: 1.55, nestHealthMultiplier: .85, extractionThreatMultiplier: .5, maxConcurrentBreaches: 1, reinforcementBudget: 5, maxSpawnsPerTick: 8 },
    { id: 'normal', level: 2, displayName: 'Normal', maxActiveEnemies: 200, maxActiveNests: 3, patrolGroupCount: 8, patrolMinSize: 4, patrolMaxSize: 7, detectionRangeMultiplier: 1, reinforcementCooldownMultiplier: 1.25, nestSpawnIntervalMultiplier: 1.2, nestHealthMultiplier: 1, extractionThreatMultiplier: .75, maxConcurrentBreaches: 1, reinforcementBudget: 8, maxSpawnsPerTick: 10 },
    { id: 'challenging', level: 3, displayName: 'Herausfordernd', maxActiveEnemies: 320, maxActiveNests: 4, patrolGroupCount: 12, patrolMinSize: 6, patrolMaxSize: 9, detectionRangeMultiplier: 1.07, reinforcementCooldownMultiplier: 1, nestSpawnIntervalMultiplier: 1, nestHealthMultiplier: 1, extractionThreatMultiplier: 1, maxConcurrentBreaches: 2, reinforcementBudget: 12, maxSpawnsPerTick: 12 },
    { id: 'hard', level: 4, displayName: 'Schwer', maxActiveEnemies: 450, maxActiveNests: 5, patrolGroupCount: 15, patrolMinSize: 8, patrolMaxSize: 13, detectionRangeMultiplier: 1.14, reinforcementCooldownMultiplier: .83, nestSpawnIntervalMultiplier: .8, nestHealthMultiplier: 1.1, extractionThreatMultiplier: 1.25, maxConcurrentBreaches: 2, reinforcementBudget: 16, maxSpawnsPerTick: 14 },
    { id: 'extreme', level: 5, displayName: 'Extrem', maxActiveEnemies: 600, maxActiveNests: 6, patrolGroupCount: 20, patrolMinSize: 10, patrolMaxSize: 16, detectionRangeMultiplier: 1.22, reinforcementCooldownMultiplier: .68, nestSpawnIntervalMultiplier: .62, nestHealthMultiplier: 1.15, extractionThreatMultiplier: 1.5, maxConcurrentBreaches: 3, reinforcementBudget: 20, maxSpawnsPerTick: 16 },
    { id: 'nightmare', level: 6, displayName: 'Albtraum', maxActiveEnemies: 800, maxActiveNests: 8, patrolGroupCount: 24, patrolMinSize: 13, patrolMaxSize: 20, detectionRangeMultiplier: 1.3, reinforcementCooldownMultiplier: .55, nestSpawnIntervalMultiplier: .47, nestHealthMultiplier: 1.2, extractionThreatMultiplier: 1.8, maxConcurrentBreaches: 3, reinforcementBudget: 24, maxSpawnsPerTick: 18 },
    { id: 'freefall', level: 7, displayName: 'FREEFALL', maxActiveEnemies: 1000, maxActiveNests: 10, patrolGroupCount: 30, patrolMinSize: 16, patrolMaxSize: 24, detectionRangeMultiplier: 1.38, reinforcementCooldownMultiplier: .43, nestSpawnIntervalMultiplier: .32, nestHealthMultiplier: 1.25, extractionThreatMultiplier: 2.1, maxConcurrentBreaches: 4, reinforcementBudget: 32, maxSpawnsPerTick: 24 },
  ],
} as const;

/**
 * Golden fingerprints of `apps/server/test/support/balance-trace.ts`. Recorded on 7.1, reproduced by 7.2A and refreshed for
 * the intended 7.2B gameplay changes (magazines, recoil, spread, friendly fire, melee, grenades). A change here means simulation results changed. Refresh only for an intended gameplay change
 * (`npm run balance:trace`) and document it in docs/BALANCE_WORKFLOW.md.
 */
const GOLDEN_TRACES = {
  arena: '82c966fa90c7f449ef12afb805cc340cd63ca7557b83c5577a0303d44630aa75',
  'mission.easy': 'f02328023b95c2acfa6fb6ed83141c58beb7422d2a018b87f1e79ef940b45111',
  'mission.normal': '839fc3eab8ea2dff3db3728bb4d85471eab1886448be0ca11e84ecd8054d3b6b',
  'mission.challenging': 'fc2f4376b99c58da271ffdb67faa1f066f7aa943b51585c3e8c27c5c5f73c520',
  'mission.hard': 'd394b3c6cdc5e92c79a98fd225a1dfd59a1dde5b8f1beb9c8522da019247a04b',
  'mission.extreme': 'f4886e34aab6acc558b0796545b1546289fcf883a13074532985119a19af4d92',
  'mission.nightmare': 'cbaf221ed5c687adfccd883d0e4ce0b5fba8c278675ef13b66bb97d510979467',
  'mission.freefall': '8b00f4b5ae5d70abca8a4ba2525c3f024707bd9d5b4cf2c07928fc153991a644',
};

// ---------------------------------------------------------------------------------------------------------------
// Registry

test('registry loads the published files, freezes them and exposes a stable version', () => {
  assert.equal(BALANCE.version.schemaVersion, 2);
  assert.equal(BALANCE.version.release, '7.3');
  assert.match(BALANCE.version.hash, /^[0-9a-f]{16}$/);
  deepFrozen(BALANCE.weapon('kestrel-ar-01'));
  deepFrozen(BALANCE.swarm);
  deepFrozen(BALANCE.difficulties);
  deepFrozen(BASE_LOADOUT);
  assert.throws(() => (BALANCE.weapons as Map<string, unknown>).set('x', {}), /unveränderlich/);
  assert.throws(() => BALANCE.weapon('missing'), /Unbekannte Waffen-ID "missing"/);
  // Aliases point at registry objects and hold no own copies.
  assert.equal(TEST_RIFLE, BALANCE.weapon('kestrel-ar-01'));
  assert.equal(WEAPONS.secondary, SERVICE_PISTOL);
  assert.equal(FRAG, BALANCE.grenade('equipment.frag_grenade'));
  assert.equal(STIM, BALANCE.medical('equipment.medical_stim'));
  assert.equal(ENEMY_TYPES[0], BALANCE.enemy(SCHABE_ARCHETYPE_ID).gameplay);
  assert.equal(DIFFICULTIES, BALANCE.difficulties);
});

test('IDs are unique across all definitions and every cross reference resolves', () => {
  const ids = [
    ...BALANCE.weapons.keys(), ...BALANCE.grenades.keys(), ...BALANCE.medicalItems.keys(), ...BALANCE.loadouts.keys(),
    ...BALANCE.factions.keys(), ...BALANCE.enemies.keys(), ...BALANCE.nests.keys(), ...BALANCE.vehicles.keys(),
    ...BALANCE.convicts.kits.keys(), ...BALANCE.difficultyById.keys(), BALANCE.operator.id,
  ];
  assert.equal(new Set(ids).size, ids.length);
  for (const loadout of BALANCE.loadouts.values()) {
    assert.equal(BALANCE.weapon(loadout.primaryWeaponId).slot, 'primary');
    assert.equal(BALANCE.weapon(loadout.secondaryWeaponId).slot, 'secondary');
    BALANCE.grenade(loadout.grenadeId);
    BALANCE.medical(loadout.medicalId);
  }
  for (const enemy of BALANCE.enemies.values()) assert.ok(BALANCE.factions.has(enemy.factionId));
  for (const nest of BALANCE.nests.values()) assert.equal(BALANCE.enemy(nest.spawnArchetypeId).factionId, nest.factionId);
  for (const structure of Object.keys(FRAG.structureDamageMultipliers)) BALANCE.nest(structure);
  for (const difficulty of DIFFICULTIES) BALANCE.convictKit(difficulty.convictKitId);
  BALANCE.loadout(BALANCE.operator.loadoutId);
  BALANCE.weapon(BALANCE.convicts.squad.reloadWeaponId);
});

test('invalid definitions are rejected with readable, located messages', () => {
  rejects((d) => { (d.weapons.weapons[0] as { magazineSize: number }).magazineSize = -30; },
    /weapons\.json › weapons\[0\]\.magazineSize: muss ≥ 1 sein, erhalten -30/);
  rejects((d) => { (d.weapons.weapons[0] as { damage: unknown }).damage = Infinity; }, /weapons\[0\]\.damage: endliche Zahl erwartet/);
  rejects((d) => { (d.weapons.weapons[1] as { magazineSize: number }).magazineSize = 12.5; }, /weapons\[1\]\.magazineSize: ganze Zahl erwartet/);
  rejects((d) => { (d.weapons.weapons[0] as { roundsPerSecond: number }).roundsPerSecond = 45; }, /roundsPerSecond: muss ≤ 30 sein/);
  rejects((d) => { delete (d.weapons.weapons[0] as { reloadSeconds?: number }).reloadSeconds; }, /reloadSeconds: endliche Zahl erwartet, fehlt/);
  rejects((d) => { (d.weapons.weapons[0] as Record<string, unknown>).dmg = 5; }, /weapons\[0\]\.dmg: unbekanntes Feld/);
  rejects((d) => { (d.weapons.weapons[0].recoil as { pitchPerShot: number }).pitchPerShot = -.4; }, /recoil\.pitchPerShot: muss ≥ 0 sein/);
  rejects((d) => { (d.weapons.weapons[0].movement as { walkSpeedMultiplier: number }).walkSpeedMultiplier = .9; }, /walkSpeedMultiplier: noch nicht unterstützt/);
  rejects((d) => { (d.weapons.weapons[0] as { reserveMagazines: unknown }).reserveMagazines = 9; }, /übersteigt die Tragekapazität maxReserveMagazines 8/);
  rejects((d) => { (d.weapons.weapons[1] as { reserveMagazines: unknown }).reserveMagazines = 'unlimited'; }, /reserveMagazines: endliche Zahl erwartet/);
  rejects((d) => { (d.weapons.weapons[0].reloadTimeline as { removalAt: number }).removalAt = .9; }, /reloadTimeline\.removalAt: muss kleiner als insertionAt sein/);
  rejects((d) => { (d.equipment.melee[0] as { windupSeconds: number }).windupSeconds = 1; }, /melee\[0\]\.windupSeconds: muss kleiner als actionSeconds sein/);
  rejects((d) => { (d.combat.damagePolicy as { operatorToOperator: number }).operatorToOperator = 1.5; }, /combat\.json › damagePolicy\.operatorToOperator: muss ≤ 1 sein/);
  rejects((d) => { (d.structures.vehicles[0].supplyContainers[0] as { x: number }).x = 3; }, /Seite "left" passt nicht/);
  rejects((d) => { (d.equipment.medical[0] as { healFractionOfMaxHealth: number }).healFractionOfMaxHealth = 0; }, /healFractionOfMaxHealth: muss > 0 sein/);
  rejects((d) => { (d.equipment.medical[0] as { maxCharges: number }).maxCharges = -5; }, /maxCharges: muss ≥ 0 sein/);
  rejects((d) => { (d.equipment.grenades[0] as { releaseSeconds: number }).releaseSeconds = 1; }, /releaseSeconds: muss kleiner als throwSeconds sein/);
  rejects((d) => { (d.difficulty.difficulties[6] as { maxActiveEnemies: number }).maxActiveEnemies = 1500; }, new RegExp(`maxActiveEnemies: muss ≤ ${MAX_ENEMIES} sein`));
  rejects((d) => { (d.difficulty.difficulties[1] as { patrolMinSize: number }).patrolMinSize = 9; }, /patrolMinSize: Minimum 9 ist größer als patrolMaxSize 7/);
  rejects((d) => { (d.difficulty.difficulties[0] as { maxSpawnsPerTick: number }).maxSpawnsPerTick = 0; }, /maxSpawnsPerTick: muss ≥ 1 sein/);
  rejects((d) => { d.difficulty.difficulties.pop(); }, /genau 7 Stufen/);
  rejects((d) => { (d.difficulty.difficulties[6] as { level: number }).level = 8; }, /genau 7 Stufen/);
  rejects((d) => { (d.structures.nests[0] as { maxHealth: number }).maxHealth = 0; }, /nests\[0\]\.maxHealth: muss > 0 sein/);
  rejects((d) => { (d.swarm.reinforcements as { callSeconds: number }).callSeconds = -3; }, /swarm\.json › reinforcements\.callSeconds: muss > 0 sein/);
  rejects((d) => { (d.weapons.weapons[0] as { id: string }).id = 'Kestrel AR'; }, /ID aus Kleinbuchstaben/);
  // Several problems are reported together.
  rejects((d) => {
    (d.weapons.weapons[0] as { damage: number }).damage = -1;
    (d.structures.vehicles[0] as { hullHealth: number }).hullHealth = -1;
  }, /2 Fehler/, /weapons\[0\]\.damage/, /vehicles\[0\]\.hullHealth/);
});

test('duplicate IDs, wire types and broken cross references are rejected', () => {
  rejects((d) => { (d.equipment.grenades[0] as { id: string }).id = 'kestrel-ar-01'; }, /ID "kestrel-ar-01" ist bereits in weapons\.json › weapons\[0\] vergeben/);
  rejects((d) => { (d.enemies.archetypes[0] as { factionId: string }).factionId = 'raiders'; }, /factionId: verweist auf unbekannte Fraktions-ID "raiders"/);
  rejects((d) => { (d.difficulty.difficulties[3] as { convictKitId: string }).convictKitId = 'gold-issue'; }, /convictKitId: verweist auf unbekannte Convict-Kit-ID/);
  rejects((d) => { (d.equipment.loadouts[0] as { primaryWeaponId: string }).primaryWeaponId = 'p-01'; }, /"p-01" ist keine Primärwaffe/);
  rejects((d) => { (d.structures.nests[0] as { spawnArchetypeId: string }).spawnArchetypeId = 'swarm.runner'; }, /spawnArchetypeId: verweist auf unbekannte Gegner-ID/);
  rejects((d) => { (d.equipment.grenades[0] as { structureDamageMultipliers: Record<string, number> }).structureDamageMultipliers = { 'structure.bunker': 2 }; }, /unbekannte Struktur-ID "structure\.bunker"/);
  rejects((d) => {
    d.enemies.archetypes.push({ ...structuredClone(d.enemies.archetypes[0]), id: 'swarm.copy', protected: false });
  }, /Wire-Typ 0 ist bereits an "swarm\.schabe" vergeben/);
  rejects((d) => {
    d.enemies.archetypes.push({ ...structuredClone(d.enemies.archetypes[0]), id: 'swarm.gap', protected: false, wireType: 2 });
  }, /Typ 1 fehlt/);
});

test('seven difficulty levels exist in order and FREEFALL is level 7', () => {
  assert.deepEqual(DIFFICULTIES.map(({ level }) => level), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(DIFFICULTIES.map(({ displayName }) => displayName),
    ['Leicht', 'Normal', 'Herausfordernd', 'Schwer', 'Extrem', 'Albtraum', 'FREEFALL']);
  assert.equal(BALANCE.difficulty('freefall').level, 7);
  assert.equal(BALANCE.difficulty('freefall').displayName, 'FREEFALL');
  assert.equal(BALANCE.difficulty('freefall').maxActiveEnemies, MAX_ENEMIES);
});

test('magazines, reserves, healing and spawn budgets are valid', () => {
  for (const weapon of Object.values(BASE_LOADOUT.weapons)) {
    assert.ok(Number.isInteger(weapon.magazineSize) && weapon.magazineSize > 0);
    assert.ok(Number.isInteger(weapon.reserveMagazines) && weapon.reserveMagazines >= 0);
    assert.ok(weapon.reserveMagazines <= weapon.maxReserveMagazines);
    assert.ok(weapon.reloadRemovalTicks < weapon.reloadInsertionTicks && weapon.reloadInsertionTicks <= weapon.reloadTicks);
    assert.ok(Number.isFinite(weapon.damage) && weapon.damage > 0);
    assert.ok(weapon.fireIntervalTicks >= 1 && weapon.reloadTicks >= 1);
  }
  assert.equal(BASE_LOADOUT.weapons.primary.reserveMagazines, 8);
  assert.equal(BASE_LOADOUT.weapons.secondary.reserveMagazines, 4);
  assert.equal(BASE_LOADOUT.medical.maxCharges, 5);
  assert.equal(BASE_LOADOUT.medical.healAmount, 40);
  assert.ok(BASE_LOADOUT.medical.healAmount <= BASE_LOADOUT.maxHealth);
  assert.equal(BASE_LOADOUT.medical.applicationTicks, 36);
  for (const difficulty of DIFFICULTIES) {
    assert.ok(difficulty.maxActiveEnemies <= MAX_ENEMIES);
    assert.ok(difficulty.maxSpawnsPerTick <= difficulty.maxActiveEnemies);
    assert.ok(difficulty.patrolMinSize <= difficulty.patrolMaxSize);
    assert.ok(difficulty.maxConcurrentBreaches <= difficulty.maxActiveNests);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Resolution

test('modifiers follow add → multiply → divide, apply once and reject stacking errors', () => {
  const mod = (source: string, operation: 'add' | 'multiply' | 'divide', value: number, layer: 'equipment' | 'difficulty' | 'mission' = 'equipment') =>
    ({ source, layer, stat: 'weapon.test.damage', operation, value });
  const resolver = new StatResolver([mod('b', 'multiply', 2), mod('a', 'add', 6), mod('c', 'divide', 4)]);
  // (10 + 6) × 2 ÷ 4, independent of list order.
  assert.equal(resolver.resolve('weapon.test.damage', 10, { layers: ['equipment'] }), 8);
  assert.deepEqual(resolver.trace['weapon.test.damage'].applied, ['+ 6 (a)', '× 2 (b)', '÷ 4 (c)']);
  assert.throws(() => resolver.resolve('weapon.test.damage', 10, { layers: ['equipment'] }), /bereits aufgelöst/);
  assert.throws(() => new StatResolver([mod('a', 'multiply', 2), mod('a', 'multiply', 2)]), /wirkt mehrfach/);
  assert.throws(() => new StatResolver([mod('a', 'multiply', Number.NaN)]), /keine endliche Zahl/);
  assert.throws(() => new StatResolver([mod('a', 'multiply', 0)]), /muss für multiply > 0 sein/);
  assert.throws(() => new StatResolver([mod('d', 'multiply', 2, 'difficulty')]).resolve('weapon.test.damage', 10, { layers: ['equipment'] }),
    /erlaubt keine difficulty-Modifikatoren/);
  assert.throws(() => new StatResolver([mod('a', 'add', -20)]).resolve('weapon.test.damage', 10, { layers: ['equipment'], min: 0 }),
    /unterschreitet das Minimum 0/);
  const unused = new StatResolver([{ ...mod('a', 'add', 1), stat: 'weapon.tset.damage' }]);
  assert.throws(() => unused.assertAllUsed(), /ohne Ziel: a→weapon\.tset\.damage/);

  // Attachment-style modifiers on a loadout; negative magazines are impossible.
  const extended = resolveLoadout(BALANCE, undefined, [{ source: 'attachment:drum', layer: 'equipment', stat: 'weapon.kestrel-ar-01.magazineSize', operation: 'add', value: 15 }]);
  assert.equal(extended.weapons.primary.magazineSize, 60);
  assert.equal(BASE_LOADOUT.weapons.primary.magazineSize, 45);
  assert.throws(() => resolveLoadout(BALANCE, undefined, [{ source: 'x', layer: 'equipment', stat: 'weapon.p-01.magazineSize', operation: 'add', value: -40 }]),
    /magazineSize = -28 unterschreitet das Minimum 1/);
  assert.throws(() => resolveMissionBalance(BALANCE, 'hard', [{ source: 'm', layer: 'difficulty', stat: 'nest.maxHealth', operation: 'multiply', value: 2 }]),
    /muss die Ebene "mission" verwenden/);
});

test('difficulty multipliers are applied exactly once per mission snapshot', () => {
  for (const difficulty of DIFFICULTIES) {
    const balance = resolveMissionBalance(BALANCE, difficulty.id);
    assert.equal(balance.nest.maxHealth, Math.round(LEGACY.nest.hp * difficulty.nestHealthMultiplier));
    const trace = balance.trace['nest.maxHealth'];
    assert.deepEqual(trace.applied, [`× ${difficulty.nestHealthMultiplier} (difficulty:${difficulty.id})`]);
    // The managers only see effective values; the snapshot carries no raw multipliers that could be reapplied.
    assert.equal('nestHealthMultiplier' in balance.difficulty, false);
    assert.equal('nestHealthMultiplier' in balance.limits, false);
  }
  const mission = resolveMissionBalance(BALANCE, 'hard', [{ source: 'mission:storm', layer: 'mission', stat: 'patrol.sightRange', operation: 'multiply', value: .5 }]);
  assert.equal(mission.patrols.sightRange, 31 * 1.14 * .5);
  assert.ok(explainBalance(mission.trace).includes('patrol.sightRange: 31 → 17.669999999999998 [× 1.14 (difficulty:hard), × 0.5 (mission:storm)]'));
});

// ---------------------------------------------------------------------------------------------------------------
// Versioning and server authority

test('balance versions are reproducible and react to every value change', () => {
  assert.equal(createBalanceRegistry(sources()).version.hash, BALANCE.version.hash);
  const reordered = Object.fromEntries(Object.entries(sources()).reverse().map(([key, value]) =>
    [key, JSON.parse(JSON.stringify(value, (_k, v) => v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).reverse()) : v))]));
  assert.equal(createBalanceRegistry(reordered).version.hash, BALANCE.version.hash);
  const tuned = sources();
  (tuned.weapons.weapons[0] as { damage: number }).damage = 25;
  assert.notEqual(createBalanceRegistry(tuned).version.hash, BALANCE.version.hash);
  assert.notEqual(balanceHash({ a: 1 }), balanceHash({ a: 1.0000001 }));
  assert.equal(balanceHash({ a: 1, b: [1, 2] }), balanceHash({ b: [1, 2], a: 1 }));

  const local: BalanceVersion = BALANCE.version;
  assert.deepEqual(compareBalanceVersion(local, { ...local }), { status: 'match' });
  const mismatch = compareBalanceVersion(local, { ...local, hash: '0000000000000000' });
  assert.equal(mismatch.status, 'mismatch');
  assert.match(mismatch.status === 'mismatch' ? mismatch.message : '', /Server bleibt maßgeblich/);
  assert.equal(compareBalanceVersion(local, undefined).status, 'mismatch');
});

function launch(mission: MissionInstance, difficultyId: string) {
  const player = mission.addPlayer('host');
  Object.assign(player, { x: 0, z: 3 });
  assert.ok(mission.select(player.id, { planetId: 'dev-ault', missionId: BODENBRUCH.id, difficultyId }));
  assert.ok(mission.start(player.id));
  Object.assign(player, { ...CARRIER_SHIP, x: -1 });
  assert.ok(mission.action(player.id, 'ready'));
  for (let i = 0; i < BOARDING_TICKS + LANDING_STAGE_TICKS + 1; i++) mission.step();
  return player;
}

test('a running mission keeps its balance snapshot while other configurations differ', () => {
  const mission = new MissionInstance(51296, BODENBRUCH);
  launch(mission, 'hard');
  const snapshot: MissionBalance = mission.balance;
  deepFrozen(snapshot);
  assert.equal(snapshot.difficulty.id, 'hard');
  assert.equal(mission.director.balance, snapshot);
  assert.equal(mission.snapshot().balance?.hash, BALANCE.version.hash);
  assert.equal(mission.snapshot().nests[0].maxHp, 396);

  // A second server process with tuned data, e.g. after a file change and restart.
  const tuned = sources();
  (tuned.structures.nests[0] as { maxHealth: number }).maxHealth = 1000;
  const registry = createBalanceRegistry(tuned);
  const other = new MissionInstance(51296, BODENBRUCH, registry);
  launch(other, 'hard');
  assert.equal(other.snapshot().nests[0].maxHp, 1100);
  assert.notEqual(other.snapshot().balance?.hash, mission.snapshot().balance?.hash);

  // The first run is untouched, also when the host tries to reselect the difficulty mid-mission.
  assert.equal(mission.select('host', { planetId: 'dev-ault', missionId: BODENBRUCH.id, difficultyId: 'easy' }), false);
  for (let i = 0; i < 300; i++) mission.step();
  assert.equal(mission.balance, snapshot);
  assert.equal(mission.director.balance, snapshot);
  for (const nest of mission.snapshot().nests) assert.equal(nest.maxHp, 396);
});

test('the server answers the client balance version check over a real connection', { timeout: 10_000 }, async () => {
  const server = await startServer(0, '127.0.0.1', false);
  try {
    const address = server.transport.server?.address();
    assert.ok(address && typeof address === 'object');
    const room = await new Client(`http://127.0.0.1:${address.port}`).create(ARENA_ROOM);
    room.onMessage('*', () => {});
    const reply = new Promise<unknown>((resolve) => room.onMessage(BALANCE_VERSION_MESSAGE, resolve));
    room.send(BALANCE_VERSION_MESSAGE);
    assert.deepEqual(await reply, BALANCE.version);
    await room.leave();
  } finally {
    await server.gracefullyShutdown(false);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Migration regression: old constants versus registry values

/** Intended 7.2B changes relative to the 7.1 constants (docs/COMBAT_BALANCE_7_2B.md). */
const CHANGES_7_2B = {
  rifle: { magazineSize: 45 },
  pistol: { damage: Math.round(LEGACY.pistol.damage * 1.2 * 1000) / 1000 },
  frag: { damage: LEGACY.frag.damage * 1.5, radius: LEGACY.frag.radius * 1.5, nestMultiplier: 2 },
} as const;

test('weapon, equipment, operator and vehicle values equal the 7.1 constants except the documented 7.2B changes', () => {
  for (const [legacy, weapon, change] of [[LEGACY.rifle, TEST_RIFLE, CHANGES_7_2B.rifle], [LEGACY.pistol, SERVICE_PISTOL, CHANGES_7_2B.pistol]] as const) {
    assert.deepEqual({
      id: weapon.id, name: weapon.displayName, category: weapon.category, roundsPerSecond: weapon.roundsPerSecond,
      damage: weapon.damage, range: weapon.effectiveRange, magazineSize: weapon.magazineSize,
      reloadSeconds: weapon.reloadSeconds, visualAssetId: weapon.assets.visual,
    }, { ...legacy, ...change });
    const effective = BASE_LOADOUT.weapons[weapon.slot];
    assert.equal(effective.fireIntervalTicks, Math.ceil(NET.tickHz / legacy.roundsPerSecond));
    assert.equal(effective.reloadTicks, Math.ceil(legacy.reloadSeconds * NET.tickHz));
  }
  // 7.1 stored 48 loose pistol rounds (4 × 12); 7.2B keeps the same four magazines, now as whole magazines.
  assert.equal(SERVICE_PISTOL.reserveMagazines * SERVICE_PISTOL.magazineSize, LEGACY.sidearmReserve);
  assert.equal(SWITCH_SECONDS, LEGACY.switchSeconds);
  assert.equal(BASE_LOADOUT.switchTicks, Math.ceil(LEGACY.switchSeconds * NET.tickHz));
  assert.deepEqual({
    id: FRAG.id, capacity: FRAG.capacity, throwSeconds: FRAG.throwSeconds, releaseSeconds: FRAG.releaseSeconds,
    fuseSeconds: FRAG.fuseSeconds, radius: FRAG.blastRadius, damage: FRAG.baseDamage,
    nestMultiplier: FRAG.structureDamageMultipliers['structure.swarm_nest'],
  }, { ...LEGACY.frag, ...CHANGES_7_2B.frag });
  assert.deepEqual({ id: STIM.id, capacity: STIM.maxCharges, seconds: STIM.applicationSeconds, fraction: STIM.healFractionOfMaxHealth }, LEGACY.stim);
  assert.equal(BASE_LOADOUT.medical.healAmount, LEGACY.player.health * LEGACY.stim.fraction);
  assert.deepEqual({ ...PLAYER }, LEGACY.player);
  assert.deepEqual({ hullHealth: ALBATROSS.hullHealth, thrusterHealth: ALBATROSS.thrusterHealth, disabledThrusters: ALBATROSS.disabledThrusters }, LEGACY.albatross);
});

test('migrated enemy, nest, swarm, convict and difficulty values equal the 7.1 constants', () => {
  const schabe = ENEMY_ARCHETYPES[SCHABE_ARCHETYPE_ID];
  assert.deepEqual(schabe.gameplay, LEGACY.schabe);
  assert.equal(schabe.wireType, 0);
  assert.equal(schabe.protected, true);
  assert.deepEqual([NEST_RADIUS, NEST_HIT_HEIGHT, NEST_EXIT_RADIUS, NEST_EXITS, NEST_COLLAPSE_TICKS],
    [LEGACY.nest.radius, LEGACY.nest.hitHeight, LEGACY.nest.exitRadius, LEGACY.nest.exits, LEGACY.nest.collapseTicks]);
  assert.deepEqual(DIFFICULTIES.map((d) => Object.fromEntries(Object.keys(LEGACY.difficulties[0]).map((key) => [key, d[key as keyof typeof d]]))),
    LEGACY.difficulties);
  // New difficulty dimensions are neutral in 7.2A.
  for (const d of DIFFICULTIES) assert.deepEqual([d.enemyHealthMultiplier, d.enemyDamageMultiplier], [1, 1]);
  DIFFICULTIES.forEach((difficulty, index) => {
    const kit = BALANCE.convictKit(difficulty.convictKitId);
    assert.deepEqual([kit.id, kit.weaponVariantId, kit.maxHealth, kit.armor, kit.damage, kit.roundsPerSecond, kit.magazineSize],
      LEGACY.convictKits[index]);
  });

  for (const difficulty of LEGACY.difficulties) {
    const balance = resolveMissionBalance(BALANCE, difficulty.id);
    const t = NET.tickHz;
    // Each line repeats the removed 7.1 expression literally.
    assert.equal(balance.nest.maxHealth, Math.round(360 * difficulty.nestHealthMultiplier));
    assert.equal(balance.nest.spawnIntervalTicks, Math.round(5.6 * t * difficulty.nestSpawnIntervalMultiplier));
    assert.equal(balance.nest.breachTicks, Math.round(6.4 * t));
    assert.equal(balance.patrols.sightRange, 31 * difficulty.detectionRangeMultiplier);
    assert.equal(balance.reinforcements.callCooldownTicks, Math.ceil(35 * t * difficulty.reinforcementCooldownMultiplier));
    assert.equal(balance.reinforcements.regionCooldownTicks, Math.ceil(32 * t * difficulty.reinforcementCooldownMultiplier));
    assert.equal(balance.reinforcements.globalCooldownTicks, Math.ceil(4 * t * difficulty.reinforcementCooldownMultiplier));
    assert.equal(balance.reinforcements.callTicks, 3 * t);
    assert.equal(balance.patrols.contactMemoryTicks, 6 * t);
    assert.equal(balance.extraction.initialPressureTicks, Math.ceil(6 * t / difficulty.extractionThreatMultiplier));
    assert.equal(balance.extraction.pressureIntervalTicks, Math.ceil(15 * t / difficulty.extractionThreatMultiplier));
    assert.equal(balance.threat.extractingBonus, 13 * difficulty.extractionThreatMultiplier);
    assert.equal(balance.threat.extractionNestRate, difficulty.extractionThreatMultiplier * .4);
    assert.equal(balance.convicts.reloadTicks, Math.ceil(t * LEGACY.rifle.reloadSeconds));
    // The protected Schabe keeps its approved values and object identity on every level.
    assert.equal(balance.enemies[0], ENEMY_TYPES[0]);
  }
});

test('combat, spawn and damage results match the recorded 7.2B golden traces', { timeout: 60_000 }, () => {
  assert.deepEqual(allTraces(), GOLDEN_TRACES);
});
