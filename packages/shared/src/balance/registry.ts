/**
 * Central balance registry. Validates the raw data files, checks cross references, freezes the result and computes
 * a reproducible configuration hash. A registry is immutable; changing balance means editing the JSON files and
 * restarting the server.
 */
import { MAX_ENEMIES, SIMULATION_HZ } from '../config/limits.ts';
import {
  SOURCE_FILES, SOURCE_SCHEMAS,
} from './definitions.ts';
import { ARMOR_CLASS_COUNT } from './definitions.ts';
import type {
  AmmoDefinition, ArmorEffects, ArmorRules, LootRules, BackpackDefinition, BalanceManifest, BodyArmorDefinition, BalanceSources, CaliberDefinition, CombatDefinition, ConvictKitDefinition, ConvictSquadDefinition, DifficultyDefinition, EnemyArchetype,
  FactionDefinition, GrenadeDefinition, LoadoutDefinition, MedicalDefinition, MeleeDefinition, MovementDefinition, NestDefinition, OperatorDefinition,
  ResupplyRules, SwarmDefinition, VehicleDefinition, WeaponDefinition,
} from './definitions.ts';
import { balanceHash } from './hash.ts';
import { magazineModifiers, presetSelection, resolveLoadout, resolveMissionBalance, resolveSelection, resolveWeapon } from './resolver.ts';
import { BalanceValidationError, Issues, deepFreeze } from './schema.ts';

/** FREEFALL ships exactly seven difficulty levels. Level 7 is FREEFALL. */
export const DIFFICULTY_LEVEL_COUNT = 7;

export interface BalanceVersion {
  readonly schemaVersion: number;
  readonly release: string;
  /** FNV-1a 64 over the canonical JSON of all data files. */
  readonly hash: string;
}

export interface BalanceRegistry {
  readonly version: BalanceVersion;
  readonly manifest: BalanceManifest;
  readonly weapons: ReadonlyMap<string, WeaponDefinition>;
  readonly calibers: ReadonlyMap<string, CaliberDefinition>;
  readonly ammunition: ReadonlyMap<string, AmmoDefinition>;
  /** Armor classes 1 … 7 and the residual damage of non-penetrating hits (`ammunition.json › armor`). */
  readonly armor: ArmorRules;
  readonly grenades: ReadonlyMap<string, GrenadeDefinition>;
  readonly medicalItems: ReadonlyMap<string, MedicalDefinition>;
  readonly meleeAttacks: ReadonlyMap<string, MeleeDefinition>;
  readonly loadouts: ReadonlyMap<string, LoadoutDefinition>;
  readonly backpacks: ReadonlyMap<string, BackpackDefinition>;
  readonly bodyArmors: ReadonlyMap<string, BodyArmorDefinition>;
  /** Damage taken by armor rating (`equipment.json › armorEffects`). */
  readonly armorEffects: ArmorEffects;
  readonly resupply: ResupplyRules;
  /** Supply items, samples and Marks at Points of Interest (`loot.json`). */
  readonly loot: LootRules;
  readonly operator: OperatorDefinition;
  readonly factions: ReadonlyMap<string, FactionDefinition>;
  readonly enemies: ReadonlyMap<string, EnemyArchetype>;
  readonly enemiesByWireType: readonly (EnemyArchetype | undefined)[];
  readonly nests: ReadonlyMap<string, NestDefinition>;
  /** The swarm nest used by the encounter director. */
  readonly primaryNest: NestDefinition;
  readonly vehicles: ReadonlyMap<string, VehicleDefinition>;
  readonly swarm: SwarmDefinition;
  readonly convicts: { readonly squad: ConvictSquadDefinition; readonly kits: ReadonlyMap<string, ConvictKitDefinition> };
  readonly difficulties: readonly DifficultyDefinition[];
  readonly difficultyById: ReadonlyMap<string, DifficultyDefinition>;
  /** Damage policy (friendly fire), operator hitbox and audio parameters (`combat.json`). */
  readonly combat: CombatDefinition;
  readonly movement: MovementDefinition;

  weapon(id: string): WeaponDefinition;
  caliber(id: string): CaliberDefinition;
  ammo(id: string): AmmoDefinition;
  /** Ammunition types of a caliber, in file order. */
  ammoForCaliber(caliberId: string): readonly AmmoDefinition[];
  grenade(id: string): GrenadeDefinition;
  medical(id: string): MedicalDefinition;
  melee(id: string): MeleeDefinition;
  loadout(id: string): LoadoutDefinition;
  backpack(id: string): BackpackDefinition;
  bodyArmor(id: string): BodyArmorDefinition;
  enemy(id: string): EnemyArchetype;
  nest(id: string): NestDefinition;
  vehicle(id: string): VehicleDefinition;
  convictKit(id: string): ConvictKitDefinition;
  difficulty(id: string): DifficultyDefinition;
}

export const PRIMARY_NEST_ID = 'structure.swarm_nest';
export const ALBATROSS_VEHICLE_ID = 'vehicle.albatross_02';

function lookup<T>(map: ReadonlyMap<string, T>, kind: string): (id: string) => T {
  return (id) => {
    const entry = map.get(id);
    if (!entry) throw new Error(`Unbekannte ${kind}-ID "${id}". Registriert: ${[...map.keys()].join(', ')}`);
    return entry;
  };
}

/** Registers definitions by ID and reports duplicates within the collection and across all collections. */
class IdIndex {
  private readonly owners = new Map<string, string>();
  private readonly issues: Issues;
  constructor(issues: Issues) { this.issues = issues; }

  collect<T extends { readonly id: string }>(entries: readonly T[], path: string): Map<string, T> {
    const map = new Map<string, T>();
    entries.forEach((entry, index) => {
      const owner = this.owners.get(entry.id);
      if (owner) this.issues.add(`${path}[${index}].id`, `ID "${entry.id}" ist bereits in ${owner} vergeben`);
      else this.owners.set(entry.id, `${path}[${index}]`);
      map.set(entry.id, entry);
    });
    return map;
  }
}

export function createBalanceRegistry(raw: unknown): BalanceRegistry {
  const issues = new Issues();
  if (typeof raw !== 'object' || raw === null) throw new BalanceValidationError(['Balance-Quellen: Objekt erwartet']);
  const input = raw as Record<string, unknown>;
  const parsed: Record<string, unknown> = {};
  for (const key of Object.keys(SOURCE_SCHEMAS) as (keyof typeof SOURCE_SCHEMAS)[]) {
    parsed[key] = SOURCE_SCHEMAS[key](input[key], `${SOURCE_FILES[key]} ›`, issues);
  }
  for (const key of Object.keys(input)) if (!(key in SOURCE_SCHEMAS)) issues.add(key, 'unbekannte Balance-Datei');
  issues.throwIfAny();
  const data = parsed as unknown as BalanceSources;

  // Unique IDs, globally across all definition collections.
  const ids = new IdIndex(issues);
  const weapons = ids.collect(data.weapons.weapons, 'weapons.json › weapons');
  const calibers = ids.collect(data.ammunition.calibers, 'ammunition.json › calibers');
  const ammunition = ids.collect(data.ammunition.ammunition, 'ammunition.json › ammunition');
  const grenades = ids.collect(data.equipment.grenades, 'equipment.json › grenades');
  const medical = ids.collect(data.equipment.medical, 'equipment.json › medical');
  const melee = ids.collect(data.equipment.melee, 'equipment.json › melee');
  const backpacks = ids.collect(data.equipment.backpacks, 'equipment.json › backpacks');
  const bodyArmors = ids.collect(data.equipment.armors, 'equipment.json › armors');
  const loadouts = ids.collect(data.equipment.loadouts, 'equipment.json › loadouts');
  const factions = ids.collect(data.enemies.factions, 'enemies.json › factions');
  const enemies = ids.collect(data.enemies.archetypes, 'enemies.json › archetypes');
  const nests = ids.collect(data.structures.nests, 'structures.json › nests');
  const vehicles = ids.collect(data.structures.vehicles, 'structures.json › vehicles');
  const kits = ids.collect(data.convicts.kits, 'convicts.json › kits');
  const difficultyById = ids.collect(data.difficulty.difficulties, 'difficulty.json › difficulties');
  ids.collect([data.operators.operator], 'operators.json › operator');

  const ref = (map: ReadonlyMap<string, unknown>, value: string, path: string, kind: string) => {
    if (!map.has(value)) issues.add(path, `verweist auf unbekannte ${kind}-ID "${value}". Registriert: ${[...map.keys()].join(', ') || 'keine'}`);
  };

  // Armor classes, calibers and ammunition.
  const levels = data.ammunition.armor.classes.map((entry) => entry.level);
  if (levels.join() !== Array.from({ length: ARMOR_CLASS_COUNT }, (_, i) => i + 1).join()) {
    issues.add('ammunition.json › armor.classes', `genau ${ARMOR_CLASS_COUNT} Panzerklassen mit level 1 … ${ARMOR_CLASS_COUNT} in aufsteigender Reihenfolge erwartet, erhalten ${levels.join(', ')}`);
  }
  data.ammunition.calibers.forEach((caliber, i) => {
    const path = `ammunition.json › calibers[${i}]`;
    if (caliber.falloff.startMeters >= caliber.falloff.endMeters) issues.add(`${path}.falloff.startMeters`, 'muss kleiner als endMeters sein');
    if (!data.ammunition.ammunition.some((ammo) => ammo.caliberId === caliber.id)) issues.add(path, `Kaliber "${caliber.id}" hat keine Munitionssorte`);
  });
  data.ammunition.ammunition.forEach((ammo, i) => {
    const path = `ammunition.json › ammunition[${i}]`;
    ref(calibers, ammo.caliberId, `${path}.caliberId`, 'Kaliber');
    const stats = ammo.modifiers.map((modifier) => modifier.stat);
    stats.forEach((stat, n) => {
      if (stats.indexOf(stat) !== n) issues.add(`${path}.modifiers[${n}].stat`, `"${stat}" ist bereits modifiziert. Je Wert ein Modifikator`);
    });
    ammo.modifiers.forEach((modifier, n) => {
      if (modifier.stat === 'penetration' && (modifier.operation !== 'add' || !Number.isInteger(modifier.value))) {
        issues.add(`${path}.modifiers[${n}]`, 'Durchschlag wird in ganzen Stufen verschoben (operation "add", ganze Zahl)');
      }
    });
  });

  // Weapons and loadouts.
  data.weapons.weapons.forEach((weapon, i) => {
    const path = `weapons.json › weapons[${i}]`;
    ref(calibers, weapon.caliberId, `${path}.caliberId`, 'Kaliber');
    ref(ammunition, weapon.defaultAmmoId, `${path}.defaultAmmoId`, 'Munitions');
    const ammo = ammunition.get(weapon.defaultAmmoId);
    if (ammo && ammo.caliberId !== weapon.caliberId) {
      issues.add(`${path}.defaultAmmoId`, `"${ammo.id}" ist Munition für ${ammo.caliberId}, die Waffe verschießt ${weapon.caliberId}`);
    }
    if (weapon.feed.type === 'single' && weapon.reserve > 500) issues.add(`${path}.reserve`, 'zu groß');
    if (weapon.feed.type === 'break' && weapon.magazineSize > 4) issues.add(`${path}.magazineSize`, 'Kipplauf: höchstens 4 Läufe');
    if (weapon.reserve > weapon.maxReserve) {
      issues.add(`${path}.reserve`, `Startreserve ${weapon.reserve} übersteigt die Tragekapazität maxReserve ${weapon.maxReserve}`);
    }
    if (weapon.reloadTimeline.removalAt >= weapon.reloadTimeline.insertionAt) {
      issues.add(`${path}.reloadTimeline.removalAt`, 'muss kleiner als insertionAt sein');
    }
    if (!(weapon.sounds.fire in data.combat.audio.weapons)) {
      issues.add(`${path}.sounds.fire`, `kein Audio-Profil in combat.json › audio.weapons.${weapon.sounds.fire}`);
    }
    if (new Set(weapon.attachmentSlots).size !== weapon.attachmentSlots.length) issues.add(`${path}.attachmentSlots`, 'doppelte Slot-IDs');
    checkMagazineVariants(weapon, path, issues);
  });
  checkLoot(data.loot, issues);
  data.equipment.loadouts.forEach((loadout, i) => {
    const path = `equipment.json › loadouts[${i}]`;
    ref(weapons, loadout.primaryWeaponId, `${path}.primaryWeaponId`, 'Waffen');
    ref(weapons, loadout.secondaryWeaponId, `${path}.secondaryWeaponId`, 'Waffen');
    ref(grenades, loadout.grenadeId, `${path}.grenadeId`, 'Granaten');
    ref(medical, loadout.medicalId, `${path}.medicalId`, 'Heil');
    ref(melee, loadout.meleeId, `${path}.meleeId`, 'Nahkampf');
    ref(backpacks, loadout.backpackId, `${path}.backpackId`, 'Rucksack');
    ref(bodyArmors, loadout.armorId, `${path}.armorId`, 'Rüstungs');
    if (weapons.get(loadout.primaryWeaponId) && weapons.get(loadout.primaryWeaponId)!.slot !== 'primary') {
      issues.add(`${path}.primaryWeaponId`, `"${loadout.primaryWeaponId}" ist keine Primärwaffe`);
    }
    if (weapons.get(loadout.secondaryWeaponId) && weapons.get(loadout.secondaryWeaponId)!.slot !== 'secondary') {
      issues.add(`${path}.secondaryWeaponId`, `"${loadout.secondaryWeaponId}" ist keine Sekundärwaffe`);
    }
  });
  const effects = data.equipment.armorEffects;
  effects.forEach((point, i) => {
    if (i && point.rating <= effects[i - 1].rating) issues.add(`equipment.json › armorEffects[${i}].rating`, 'Rüstungspunkte müssen aufsteigend sortiert sein');
    if (i && point.damageTaken > effects[i - 1].damageTaken) issues.add(`equipment.json › armorEffects[${i}].damageTaken`, 'mehr Rüstung darf nicht mehr Schaden zulassen');
  });
  data.equipment.armors.forEach((armor, i) => {
    if (armor.armorRating < effects[0].rating || armor.armorRating > effects[effects.length - 1].rating) {
      issues.add(`equipment.json › armors[${i}].armorRating`, `liegt außerhalb der Kurve armorEffects (${effects[0].rating} … ${effects[effects.length - 1].rating})`);
    }
  });
  data.equipment.grenades.forEach((grenade, i) => {
    const path = `equipment.json › grenades[${i}]`;
    for (const structure of Object.keys(grenade.structureDamageMultipliers)) {
      ref(nests, structure, `${path}.structureDamageMultipliers.${structure}`, 'Struktur');
    }
    if (grenade.releaseSeconds >= grenade.throwSeconds) issues.add(`${path}.releaseSeconds`, 'muss kleiner als throwSeconds sein');
  });
  data.equipment.melee.forEach((attack, i) => {
    if (attack.windupSeconds >= attack.actionSeconds) issues.add(`equipment.json › melee[${i}].windupSeconds`, 'muss kleiner als actionSeconds sein');
    if (attack.actionSeconds > attack.cooldownSeconds) issues.add(`equipment.json › melee[${i}].actionSeconds`, 'darf cooldownSeconds nicht überschreiten');
  });
  data.structures.vehicles.forEach((vehicle, i) => {
    const seen = new Set<string>();
    vehicle.supplyContainers.forEach((container, n) => {
      const path = `structures.json › vehicles[${i}].supplyContainers[${n}]`;
      if (seen.has(container.id)) issues.add(`${path}.id`, `Container-ID "${container.id}" ist doppelt`);
      seen.add(container.id);
      if ((container.side === 'left') !== (container.x < 0)) issues.add(`${path}.x`, `Seite "${container.side}" passt nicht zu x = ${container.x}`);
    });
  });
  if (data.combat.audio.distantBlendStart >= data.combat.audio.distantBlendEnd) {
    issues.add('combat.json › audio.distantBlendStart', 'muss kleiner als distantBlendEnd sein');
  }
  ref(loadouts, data.operators.operator.loadoutId, 'operators.json › operator.loadoutId', 'Loadout');
  if (data.operators.operator.sprintSpeed < data.operators.operator.walkSpeed) {
    issues.add('operators.json › operator.sprintSpeed', 'muss ≥ walkSpeed sein');
  }

  // Enemies.
  const enemiesByWireType: (EnemyArchetype | undefined)[] = [];
  data.enemies.archetypes.forEach((enemy, i) => {
    const path = `enemies.json › archetypes[${i}]`;
    ref(factions, enemy.factionId, `${path}.factionId`, 'Fraktions');
    const previous = enemiesByWireType[enemy.wireType];
    if (previous) issues.add(`${path}.wireType`, `Wire-Typ ${enemy.wireType} ist bereits an "${previous.id}" vergeben`);
    else enemiesByWireType[enemy.wireType] = enemy;
    if (enemy.leap && enemy.leap.minRange >= enemy.leap.maxRange) issues.add(`${path}.leap.minRange`, 'muss kleiner als maxRange sein');
    if (enemy.charge && enemy.charge.minRange >= enemy.charge.maxRange) issues.add(`${path}.charge.minRange`, 'muss kleiner als maxRange sein');
    if (enemy.tactics === 'flank' && !enemy.flank) issues.add(`${path}.flank`, 'tactics "flank" braucht flank-Werte');
    const timing = enemy.attack ?? data.swarm.meleeAttack;
    const duration = timing.windupTicks + timing.activeTicks + timing.recoveryTicks;
    if (enemy.gameplay.meleeCooldown * SIMULATION_HZ < duration) {
      issues.add(`${path}.gameplay.meleeCooldown`, `kürzer als der Angriff (${duration} Ticks)`);
    }
    const zones = new Set<string>();
    enemy.hitZones?.forEach((zone, n) => {
      if (zones.has(zone.id)) issues.add(`${path}.hitZones[${n}].id`, `"${zone.id}" ist doppelt`);
      zones.add(zone.id);
    });
  });
  for (let type = 0; type < enemiesByWireType.length; type++) {
    if (!enemiesByWireType[type]) issues.add('enemies.json › archetypes', `Wire-Typen müssen lückenlos ab 0 vergeben sein. Typ ${type} fehlt`);
  }

  // Structures.
  data.structures.nests.forEach((nest, i) => {
    const path = `structures.json › nests[${i}]`;
    ref(factions, nest.factionId, `${path}.factionId`, 'Fraktions');
    ref(enemies, nest.spawnArchetypeId, `${path}.spawnArchetypeId`, 'Gegner');
    const archetype = enemies.get(nest.spawnArchetypeId);
    if (archetype && archetype.factionId !== nest.factionId) {
      issues.add(`${path}.spawnArchetypeId`, `"${archetype.id}" gehört zu "${archetype.factionId}", das Nest zu "${nest.factionId}"`);
    }
  });
  if (!nests.has(PRIMARY_NEST_ID)) issues.add('structures.json › nests', `Nest "${PRIMARY_NEST_ID}" wird vom Encounter Director benötigt`);
  if (!vehicles.has(ALBATROSS_VEHICLE_ID)) issues.add('structures.json › vehicles', `Fahrzeug "${ALBATROSS_VEHICLE_ID}" wird benötigt`);

  // Swarm and convicts.
  ref(enemies, data.swarm.arena.archetypeId, 'swarm.json › arena.archetypeId', 'Gegner');
  ref(enemies, data.swarm.patrols.archetypeId, 'swarm.json › patrols.archetypeId', 'Gegner');
  ref(enemies, data.swarm.castes.hunterArchetypeId, 'swarm.json › castes.hunterArchetypeId', 'Gegner');
  ref(enemies, data.swarm.castes.breacherArchetypeId, 'swarm.json › castes.breacherArchetypeId', 'Gegner');
  ref(enemies, data.swarm.castes.assaultBreakerArchetypeId, 'swarm.json › castes.assaultBreakerArchetypeId', 'Gegner');
  ref(weapons, data.convicts.squad.reloadWeaponId, 'convicts.json › squad.reloadWeaponId', 'Waffen');
  const { timing, pressure, wave, spawn } = data.swarm.director;
  if (timing.assaultMinTicks > timing.assaultMaxTicks || timing.peakMinTicks > timing.peakMaxTicks ||
      timing.recoveryMinTicks > timing.recoveryMaxTicks) {
    issues.add('swarm.json › director.timing', 'Mindestdauer darf die Höchstdauer nicht überschreiten');
  }
  if (pressure.startAtMost >= pressure.pauseAt) {
    issues.add('swarm.json › director.pressure', 'startAtMost muss kleiner als pauseAt sein');
  }
  if (wave.minEnemies > wave.maxEnemies || wave.groupMin > wave.groupMax || wave.groupMax > wave.maxEnemies) {
    issues.add('swarm.json › director.wave', 'ungültige Wellen- oder Gruppengrenzen');
  }
  if (spawn.dynamicChecksPerTick > spawn.maxChecksPerTick) {
    issues.add('swarm.json › director.spawn', 'dynamicChecksPerTick überschreitet maxChecksPerTick');
  }

  // Difficulty.
  const difficultyLevels = data.difficulty.difficulties.map((difficulty) => difficulty.level);
  const expected = Array.from({ length: DIFFICULTY_LEVEL_COUNT }, (_, i) => i + 1);
  if (difficultyLevels.join() !== expected.join()) {
    issues.add('difficulty.json › difficulties', `genau ${DIFFICULTY_LEVEL_COUNT} Stufen mit level ${expected.join(', ')} in aufsteigender Reihenfolge erwartet, erhalten ${difficultyLevels.join(', ')}`);
  }
  data.difficulty.difficulties.forEach((difficulty, i) => {
    const path = `difficulty.json › difficulties[${i}]`;
    ref(kits, difficulty.convictKitId, `${path}.convictKitId`, 'Convict-Kit');
    if (difficulty.patrolMinSize > difficulty.patrolMaxSize) {
      issues.add(`${path}.patrolMinSize`, `Minimum ${difficulty.patrolMinSize} ist größer als patrolMaxSize ${difficulty.patrolMaxSize}`);
    }
    if (difficulty.maxActiveEnemies > MAX_ENEMIES) issues.add(`${path}.maxActiveEnemies`, `überschreitet die ECS-Kapazität ${MAX_ENEMIES}`);
    if (difficulty.maxConcurrentBreaches > difficulty.maxActiveNests) {
      issues.add(`${path}.maxConcurrentBreaches`, `mehr gleichzeitige Durchbrüche (${difficulty.maxConcurrentBreaches}) als Nester (${difficulty.maxActiveNests})`);
    }
    if (difficulty.maxSpawnsPerTick > difficulty.maxActiveEnemies) issues.add(`${path}.maxSpawnsPerTick`, 'größer als maxActiveEnemies');
  });
  issues.throwIfAny();

  const movement = data.movement;
  if (movement.diveSeconds - movement.divePrepSeconds < .1) {
    issues.add('movement.json › divePrepSeconds', 'mindestens 0,1 s Flugzeit erforderlich');
  }
  for (const [name, shape] of Object.entries(movement.colliders)) {
    if (shape.muzzleHeight > shape.height) issues.add(`movement.json › colliders.${name}`, 'Mündung liegt oberhalb des Kolliders');
  }
  for (const name of ['CROUCHING', 'PRONE', 'SUPINE', 'SLIDING'] as const) {
    if (movement.colliders[name].height >= movement.colliders.STANDING.height) {
      issues.add(`movement.json › colliders.${name}`, 'muss niedriger als STANDING sein');
    }
  }
  issues.throwIfAny();

  const ammoByCaliber = new Map<string, AmmoDefinition[]>();
  for (const ammo of data.ammunition.ammunition) ammoByCaliber.set(ammo.caliberId, [...(ammoByCaliber.get(ammo.caliberId) ?? []), ammo]);
  const hash = balanceHash(data);
  const registry: BalanceRegistry = {
    version: { schemaVersion: data.manifest.schemaVersion, release: data.manifest.release, hash },
    manifest: data.manifest,
    weapons, calibers, ammunition, armor: data.ammunition.armor, grenades, medicalItems: medical, meleeAttacks: melee, loadouts,
    backpacks, bodyArmors, armorEffects: data.equipment.armorEffects, resupply: data.equipment.resupply, loot: data.loot, operator: data.operators.operator,
    factions, enemies, enemiesByWireType, nests, primaryNest: nests.get(PRIMARY_NEST_ID)!, vehicles,
    swarm: data.swarm,
    convicts: { squad: data.convicts.squad, kits },
    difficulties: data.difficulty.difficulties, difficultyById,
    combat: data.combat, movement,
    weapon: lookup(weapons, 'Waffen'),
    caliber: lookup(calibers, 'Kaliber'),
    ammo: lookup(ammunition, 'Munitions'),
    ammoForCaliber: (caliberId) => ammoByCaliber.get(caliberId) ?? [],
    grenade: lookup(grenades, 'Granaten'),
    medical: lookup(medical, 'Heil'),
    melee: lookup(melee, 'Nahkampf'),
    loadout: lookup(loadouts, 'Loadout'),
    backpack: lookup(backpacks, 'Rucksack'),
    bodyArmor: lookup(bodyArmors, 'Rüstungs'),
    enemy: lookup(enemies, 'Gegner'),
    nest: lookup(nests, 'Struktur'),
    vehicle: lookup(vehicles, 'Fahrzeug'),
    convictKit: lookup(kits, 'Convict-Kit'),
    difficulty: lookup(difficultyById, 'Schwierigkeits'),
  };
  deepFreeze(data);
  Object.freeze(registry);
  for (const map of [weapons, calibers, ammunition, backpacks, bodyArmors, grenades, medical, melee, loadouts, factions, enemies, nests, vehicles, kits, difficultyById] as Map<string, unknown>[]) freezeMap(map);
  Object.freeze(enemiesByWireType);

  // Resolve every configuration once, so invalid effective values fail at startup instead of at mission start.
  for (const loadout of loadouts.keys()) resolveLoadout(registry, loadout);
  // Every weapon with every ammunition of its caliber, so an unused ammunition type cannot hide invalid values.
  for (const weapon of weapons.values()) {
    for (const ammo of registry.ammoForCaliber(weapon.caliberId)) resolveWeapon(registry, weapon.id, ammo.id);
    // Magazine variants are not selectable yet, but their effective values must already be valid.
    for (const variant of weapon.magazineVariants) resolveWeapon(registry, weapon.id, weapon.defaultAmmoId, magazineModifiers(weapon, variant.type));
  }
  // Every selectable item once in the standard loadout, so broken item modifiers fail at startup.
  const standard = presetSelection(registry);
  for (const weapon of weapons.values()) {
    resolveSelection(registry, { ...standard, [weapon.slot === 'primary' ? 'primaryWeaponId' : 'secondaryWeaponId']: weapon.id });
  }
  for (const backpack of backpacks.keys()) resolveSelection(registry, { ...standard, backpackId: backpack });
  for (const armor of bodyArmors.keys()) resolveSelection(registry, { ...standard, armorId: armor });
  for (const difficulty of registry.difficulties) resolveMissionBalance(registry, difficulty.id);
  return registry;
}

const MAGAZINE_NAMES = { compact: 'Das kleine Magazin', extended: 'Das erweiterte Magazin', drum: 'Das Trommelmagazin' } as const;

function checkMagazineVariants(weapon: WeaponDefinition, path: string, issues: Issues): void {
  const variants = weapon.magazineVariants;
  if (variants.length && weapon.feed.type !== 'magazine') {
    issues.add(`${path}.magazineVariants`, 'nur für Waffen mit wechselbarem Magazin (feed.type "magazine")');
  }
  const types = variants.map((variant) => variant.type);
  variants.forEach((variant, n) => {
    const at = `${path}.magazineVariants[${n}]`;
    if (types.indexOf(variant.type) !== n) issues.add(`${at}.type`, `Variante "${variant.type}" ist bereits vorhanden`);
    const smaller = variant.type === 'compact';
    if (smaller ? variant.magazineSize >= weapon.magazineSize : variant.magazineSize <= weapon.magazineSize) {
      issues.add(`${at}.magazineSize`, `${MAGAZINE_NAMES[variant.type]} muss ${smaller ? 'weniger' : 'mehr'} als das Standardmagazin (${weapon.magazineSize}) fassen, erhalten ${variant.magazineSize}`);
    }
    const stats = variant.modifiers.map((modifier) => modifier.stat);
    stats.forEach((stat, m) => {
      if (stats.indexOf(stat) !== m) issues.add(`${at}.modifiers[${m}].stat`, `"${stat}" ist bereits modifiziert. Je Wert ein Modifikator`);
    });
  });
  const extended = variants.find((variant) => variant.type === 'extended');
  const drum = variants.findIndex((variant) => variant.type === 'drum');
  if (extended && drum >= 0 && variants[drum]!.magazineSize <= extended.magazineSize) {
    issues.add(`${path}.magazineVariants[${drum}].magazineSize`, `Das Trommelmagazin muss mehr als das erweiterte Magazin (${extended.magazineSize}) fassen`);
  }
}

function checkLoot(loot: LootRules, issues: Issues): void {
  const range = (pair: readonly number[], path: string) => {
    if (pair[0]! > pair[1]!) issues.add(path, `[min, max] erwartet, min ${pair[0]} ist größer als max ${pair[1]}`);
  };
  range(loot.supplies, 'loot.json › supplies');
  for (const id of ['tissue', 'rock', 'artifact'] as const) range(loot[id].perSite, `loot.json › ${id}.perSite`);
  for (const id of ['tissue', 'rock'] as const) {
    loot[id].spawn.forEach((amount, level) => {
      if (level + 1 < loot[id].fromLevel && amount > 0) {
        issues.add(`loot.json › ${id}.spawn[${level}]`, `Stufe ${level + 1} liegt vor fromLevel ${loot[id].fromLevel}, hier spawnt nichts. 0 erwartet`);
      }
    });
  }
}

/** Maps stay Map instances for lookups but reject mutation. */
function freezeMap<K, V>(map: Map<K, V>): void {
  const reject = () => { throw new TypeError('Balance-Registry ist unveränderlich'); };
  Object.defineProperties(map, { set: { value: reject }, delete: { value: reject }, clear: { value: reject } });
  Object.freeze(map);
}

/** Client request and server reply carrying the server's `BalanceVersion`. */
export const BALANCE_VERSION_MESSAGE = 'balance-version';

export type BalanceVersionCheck =
  | { readonly status: 'match' }
  | { readonly status: 'mismatch'; readonly message: string };

/** Compares the client's balance version with the authoritative server version. */
export function compareBalanceVersion(local: BalanceVersion, server: unknown): BalanceVersionCheck {
  const remote = server as Partial<BalanceVersion> | null;
  if (!remote || typeof remote.hash !== 'string') {
    return { status: 'mismatch', message: 'Der Server meldet keine Balance-Version. Anzeigen können abweichen.' };
  }
  if (remote.hash === local.hash && remote.schemaVersion === local.schemaVersion) return { status: 'match' };
  return {
    status: 'mismatch',
    message: `Balance-Version weicht ab (Server ${remote.release ?? '?'} #${remote.hash}, Client ${local.release} #${local.hash}). ` +
      'Der Server bleibt maßgeblich, angezeigte Werte können abweichen. Bitte Client neu laden.',
  };
}
