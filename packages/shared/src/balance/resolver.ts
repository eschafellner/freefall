/**
 * Balance resolution: base definition → equipment/attachment modifiers → difficulty modifiers → mission modifiers.
 *
 * Every effective value is computed exactly once per configuration, when a loadout or a mission is configured,
 * never per simulation tick. Formula for one stat, independent of the order in which modifiers are listed:
 *
 *   value = (base + Σ add) × Π multiply ÷ Π divide   → then rounding → then range check
 *
 * Each stat declares which layers may touch it. A source may modify a stat only once, and a stat can be resolved
 * only once per resolver. Both rules make double application of a difficulty multiplier an error, not a bug.
 */
import { SIMULATION_HZ } from '../config/limits.ts';
import { OPERATOR_SLIDE_LIMITS } from './definitions.ts';
import { deepFreeze } from './schema.ts';
import type {
  CombatDefinition, ConvictKitDefinition, ConvictSquadDefinition, DamagePolicy, DifficultyDefinition, EnemyGameplay,
  GrenadeDefinition, MedicalDefinition, MeleeDefinition, NestDefinition, OperatorSlideDefinition, ResupplyRules, SupplyContainerDefinition,
  SwarmDefinition, WeaponDefinition, WeaponSlot,
} from './definitions.ts';
import type { BalanceRegistry } from './registry.ts';

export const MODIFIER_LAYERS = ['equipment', 'difficulty', 'mission'] as const;
export type ModifierLayer = (typeof MODIFIER_LAYERS)[number];
export type ModifierOperation = 'add' | 'multiply' | 'divide';

export interface StatModifier {
  /** Unique origin, e.g. `difficulty:hard` or `attachment:compensator`. */
  readonly source: string;
  readonly layer: ModifierLayer;
  /** Stat key, e.g. `nest.maxHealth` or `weapon.kestrel-ar-01.damage`. */
  readonly stat: string;
  readonly operation: ModifierOperation;
  readonly value: number;
}

export interface StatRule {
  readonly layers: readonly ModifierLayer[];
  readonly min?: number;
  readonly max?: number;
  readonly round?: 'round' | 'ceil';
}

export interface ResolvedStat {
  readonly base: number;
  readonly value: number;
  /** Human-readable applied modifiers in application order, e.g. `× 1.1 (difficulty:hard)`. */
  readonly applied: readonly string[];
}

export class BalanceResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BalanceResolutionError';
  }
}

const OPERATION_ORDER: Readonly<Record<ModifierOperation, number>> = { add: 0, multiply: 1, divide: 2 };
const SYMBOL: Readonly<Record<ModifierOperation, string>> = { add: '+', multiply: '×', divide: '÷' };

export class StatResolver {
  private readonly modifiers: readonly StatModifier[];
  private readonly used = new Set<StatModifier>();
  readonly trace: Record<string, ResolvedStat> = {};

  constructor(modifiers: readonly StatModifier[]) {
    const seen = new Set<string>();
    for (const modifier of modifiers) {
      const key = `${modifier.source}→${modifier.stat}`;
      if (seen.has(key)) throw new BalanceResolutionError(`Modifikator ${modifier.source} wirkt mehrfach auf ${modifier.stat}`);
      seen.add(key);
      if (!MODIFIER_LAYERS.includes(modifier.layer)) throw new BalanceResolutionError(`Unbekannte Modifikator-Ebene ${modifier.layer} (${key})`);
      if (!(modifier.operation in OPERATION_ORDER)) throw new BalanceResolutionError(`Unbekannte Operation ${modifier.operation} (${key})`);
      if (!Number.isFinite(modifier.value)) throw new BalanceResolutionError(`Modifikator ${key} ist keine endliche Zahl`);
      if (modifier.operation !== 'add' && modifier.value <= 0) {
        throw new BalanceResolutionError(`Modifikator ${key} muss für ${modifier.operation} > 0 sein, erhalten ${modifier.value}`);
      }
    }
    this.modifiers = modifiers;
  }

  resolve(stat: string, base: number, rule: StatRule): number {
    if (stat in this.trace) throw new BalanceResolutionError(`${stat} wurde bereits aufgelöst. Modifikatoren dürfen nur einmal angewendet werden.`);
    if (!Number.isFinite(base)) throw new BalanceResolutionError(`Basiswert von ${stat} ist nicht endlich`);
    const relevant = this.modifiers.filter((modifier) => modifier.stat === stat).sort((a, b) =>
      MODIFIER_LAYERS.indexOf(a.layer) - MODIFIER_LAYERS.indexOf(b.layer) ||
      OPERATION_ORDER[a.operation] - OPERATION_ORDER[b.operation] || (a.source < b.source ? -1 : 1));
    let add = 0, multiply = 1, divide = 1;
    const applied: string[] = [];
    for (const modifier of relevant) {
      if (!rule.layers.includes(modifier.layer)) {
        throw new BalanceResolutionError(`${stat} erlaubt keine ${modifier.layer}-Modifikatoren (${modifier.source}). Erlaubt: ${rule.layers.join(', ') || 'keine'}`);
      }
      this.used.add(modifier);
      if (modifier.operation === 'add') add += modifier.value;
      else if (modifier.operation === 'multiply') multiply *= modifier.value;
      else divide *= modifier.value;
      applied.push(`${SYMBOL[modifier.operation]} ${modifier.value} (${modifier.source})`);
    }
    let value = (base + add) * multiply / divide;
    if (rule.round === 'round') value = Math.round(value);
    else if (rule.round === 'ceil') value = Math.ceil(value);
    if (!Number.isFinite(value)) throw new BalanceResolutionError(`${stat} ergibt keinen endlichen Wert`);
    if (rule.min !== undefined && value < rule.min) throw new BalanceResolutionError(`${stat} = ${value} unterschreitet das Minimum ${rule.min}`);
    if (rule.max !== undefined && value > rule.max) throw new BalanceResolutionError(`${stat} = ${value} überschreitet das Maximum ${rule.max}`);
    this.trace[stat] = { base, value, applied };
    return value;
  }

  /** Rejects modifiers that target a stat nobody resolved, such as a typo in a stat key. */
  assertAllUsed(): void {
    const unused = this.modifiers.filter((modifier) => !this.used.has(modifier));
    if (unused.length) throw new BalanceResolutionError(`Modifikatoren ohne Ziel: ${unused.map((m) => `${m.source}→${m.stat}`).join(', ')}`);
  }
}

const EQUIPMENT: StatRule['layers'] = ['equipment'];
const MISSION: StatRule['layers'] = ['difficulty', 'mission'];
const NONE: StatRule['layers'] = [];
const ticks = (seconds: number): number => seconds * SIMULATION_HZ;

// ---------------------------------------------------------------------------------------------------------------
// Operator loadout

const DEG = Math.PI / 180;

/** Simulation-ready recoil, in radians and ticks. Shared by the server and the client recoil prediction. */
export interface EffectiveRecoil {
  /** Effective vertical climb per shot: pitchPerShot × verticalMultiplier. */
  readonly pitchPerShot: number;
  /** Effective horizontal deflection per shot: yawPerShot × horizontalMultiplier. */
  readonly yawPerShot: number;
  readonly sustainedGrowthPerShot: number;
  readonly maxSustainedMultiplier: number;
  readonly maxClimb: number;
  readonly recoveryDelayTicks: number;
  readonly recoveryPerTick: number;
}

export interface EffectiveSpread {
  readonly hip: number;
  readonly aim: number;
  readonly movingMultiplier: number;
  readonly bloomPerShot: number;
  readonly maxBloom: number;
  readonly bloomRecoveryPerTick: number;
}

export interface EffectiveWeapon extends WeaponDefinition {
  /** Ticks between two shots. */
  readonly fireIntervalTicks: number;
  /** Exact shot interval in ticks (fractional). Sustained fire averages exactly `roundsPerSecond`. */
  readonly fireInterval: number;
  readonly reloadTicks: number;
  /** Ticks after reload start at which the old magazine leaves the weapon. */
  readonly reloadRemovalTicks: number;
  /** Ticks after reload start at which the magazine transaction happens (exactly once). */
  readonly reloadInsertionTicks: number;
  readonly handling: { readonly recoil: EffectiveRecoil; readonly spread: EffectiveSpread };
}

export interface EffectiveGrenade extends GrenadeDefinition {
  readonly throwTicks: number;
  readonly releaseTicks: number;
  readonly fuseTicks: number;
}

export interface EffectiveMedical extends MedicalDefinition {
  readonly applicationTicks: number;
  /** Health restored by one completed application, before capping at maximum health. */
  readonly healAmount: number;
}

export interface EffectiveMelee extends MeleeDefinition {
  readonly windupTicks: number;
  readonly actionTicks: number;
  readonly cooldownTicks: number;
  readonly staggerTicks: number;
  readonly staggerImmunityTicks: number;
  /** cos(arcDegrees / 2): minimum dot product between facing and target direction. */
  readonly arcCos: number;
}

export interface EffectiveLoadout {
  readonly id: string;
  readonly configHash: string;
  readonly weapons: Readonly<Record<WeaponSlot, EffectiveWeapon>>;
  readonly grenade: EffectiveGrenade;
  readonly medical: EffectiveMedical;
  readonly melee: EffectiveMelee;
  readonly slide: OperatorSlideDefinition;
  readonly switchTicks: number;
  readonly maxHealth: number;
  /** Respawn delay and respawn protection of the operator (`operators.json`), in ticks. */
  readonly respawnTicks: number;
  readonly respawnProtectionTicks: number;
  /** Relation multipliers of the central damage resolver. */
  readonly damagePolicy: DamagePolicy;
  readonly operatorHitbox: CombatDefinition['operatorHitbox'];
  readonly trace: Readonly<Record<string, ResolvedStat>>;
}

function effectiveWeapon(resolver: StatResolver, weapon: WeaponDefinition): EffectiveWeapon {
  const key = `weapon.${weapon.id}`;
  const damage = resolver.resolve(`${key}.damage`, weapon.damage, { layers: EQUIPMENT, min: 0 });
  const roundsPerSecond = resolver.resolve(`${key}.roundsPerSecond`, weapon.roundsPerSecond, { layers: EQUIPMENT, min: 1e-6, max: SIMULATION_HZ });
  const magazineSize = resolver.resolve(`${key}.magazineSize`, weapon.magazineSize, { layers: EQUIPMENT, round: 'round', min: 1 });
  const reserveMagazines = resolver.resolve(`${key}.reserveMagazines`, weapon.reserveMagazines, { layers: EQUIPMENT, round: 'round', min: 0 });
  const maxReserveMagazines = resolver.resolve(`${key}.maxReserveMagazines`, weapon.maxReserveMagazines, { layers: EQUIPMENT, round: 'round', min: reserveMagazines });
  const reloadSeconds = resolver.resolve(`${key}.reloadSeconds`, weapon.reloadSeconds, { layers: EQUIPMENT, min: 1 / SIMULATION_HZ });
  const effectiveRange = resolver.resolve(`${key}.effectiveRange`, weapon.effectiveRange, { layers: EQUIPMENT, min: 0 });
  const reloadTicks = resolver.resolve(`${key}.reloadTicks`, reloadSeconds * SIMULATION_HZ, { layers: NONE, round: 'ceil', min: 2 });
  const reloadInsertionTicks = Math.min(reloadTicks, Math.max(1, Math.round(weapon.reloadTimeline.insertionAt * reloadTicks)));
  const reloadRemovalTicks = Math.min(reloadInsertionTicks - 1, Math.round(weapon.reloadTimeline.removalAt * reloadTicks));
  const { recoil, spread } = weapon;
  const pitch = resolver.resolve(`${key}.recoilPitch`, recoil.pitchPerShot * recoil.verticalMultiplier, { layers: EQUIPMENT, min: 0 });
  const yaw = resolver.resolve(`${key}.recoilYaw`, recoil.yawPerShot * recoil.horizontalMultiplier, { layers: EQUIPMENT, min: 0 });
  const hip = resolver.resolve(`${key}.spreadHip`, spread.hipDegrees, { layers: EQUIPMENT, min: 0 });
  const aim = resolver.resolve(`${key}.spreadAim`, spread.aimDegrees, { layers: EQUIPMENT, min: 0 });
  return {
    ...weapon, damage, roundsPerSecond, magazineSize, reserveMagazines, maxReserveMagazines, reloadSeconds, effectiveRange,
    fireIntervalTicks: resolver.resolve(`${key}.fireIntervalTicks`, SIMULATION_HZ / roundsPerSecond, { layers: NONE, round: 'ceil', min: 1 }),
    fireInterval: Math.max(1, SIMULATION_HZ / roundsPerSecond),
    reloadTicks, reloadRemovalTicks: Math.max(0, reloadRemovalTicks), reloadInsertionTicks,
    handling: {
      recoil: {
        pitchPerShot: pitch * DEG, yawPerShot: yaw * DEG,
        sustainedGrowthPerShot: recoil.sustainedGrowthPerShot, maxSustainedMultiplier: recoil.maxSustainedMultiplier,
        maxClimb: recoil.maxClimbDegrees * DEG,
        recoveryDelayTicks: Math.round(recoil.recoveryDelaySeconds * SIMULATION_HZ),
        recoveryPerTick: recoil.recoveryPerSecond * DEG / SIMULATION_HZ,
      },
      spread: {
        hip: hip * DEG, aim: aim * DEG, movingMultiplier: spread.movingMultiplier,
        bloomPerShot: spread.bloomPerShot * DEG, maxBloom: spread.maxBloomDegrees * DEG,
        bloomRecoveryPerTick: spread.bloomRecoveryPerSecond * DEG / SIMULATION_HZ,
      },
    },
  };
}

function effectiveMelee(resolver: StatResolver, melee: MeleeDefinition): EffectiveMelee {
  const key = `melee.${melee.id}`;
  const damage = resolver.resolve(`${key}.damage`, melee.damage, { layers: EQUIPMENT, min: 0 });
  const range = resolver.resolve(`${key}.range`, melee.range, { layers: EQUIPMENT, min: 0.1 });
  const windupTicks = Math.max(1, Math.round(melee.windupSeconds * SIMULATION_HZ));
  const actionTicks = Math.max(windupTicks + 1, Math.ceil(melee.actionSeconds * SIMULATION_HZ));
  return {
    ...melee, damage, range, windupTicks, actionTicks,
    cooldownTicks: Math.max(actionTicks, Math.ceil(melee.cooldownSeconds * SIMULATION_HZ)),
    staggerTicks: Math.round(melee.staggerSeconds * SIMULATION_HZ),
    staggerImmunityTicks: Math.round(melee.staggerImmunitySeconds * SIMULATION_HZ),
    arcCos: Math.cos(Math.min(Math.PI, melee.arcDegrees * DEG / 2)),
  };
}

/** Armor resolves operator stats separately from weapon and other equipment modifiers. */
export function resolveLoadout(registry: BalanceRegistry, loadoutId = registry.operator.loadoutId,
  modifiers: readonly StatModifier[] = [], armorModifiers: readonly StatModifier[] = []): EffectiveLoadout {
  const loadout = registry.loadout(loadoutId);
  const resolver = new StatResolver(modifiers);
  const armor = new StatResolver(armorModifiers);
  const slideStat = (key: keyof OperatorSlideDefinition) =>
    armor.resolve(`operator.slide.${key}`, registry.movement.slide[key], { layers: EQUIPMENT, ...OPERATOR_SLIDE_LIMITS[key] });
  const slide = {
    seconds: slideStat('seconds'), distance: slideStat('distance'), decay: slideStat('decay'),
    cooldownSeconds: slideStat('cooldownSeconds'), minSpeed: slideStat('minSpeed'),
  };
  armor.assertAllUsed();
  const grenade = registry.grenade(loadout.grenadeId);
  const medical = registry.medical(loadout.medicalId);
  const melee = registry.melee(loadout.meleeId);
  const maxHealth = registry.operator.maxHealth;
  const result: EffectiveLoadout = {
    id: loadout.id,
    configHash: registry.version.hash,
    weapons: {
      primary: effectiveWeapon(resolver, registry.weapon(loadout.primaryWeaponId)),
      secondary: effectiveWeapon(resolver, registry.weapon(loadout.secondaryWeaponId)),
    },
    grenade: {
      ...grenade,
      throwTicks: Math.ceil(grenade.throwSeconds * SIMULATION_HZ),
      // At least one tick: the release is checked from the tick after the throw starts.
      releaseTicks: Math.max(1, Math.ceil(grenade.releaseSeconds * SIMULATION_HZ)),
      fuseTicks: Math.ceil(grenade.fuseSeconds * SIMULATION_HZ),
    },
    medical: {
      ...medical,
      applicationTicks: Math.ceil(medical.applicationSeconds * SIMULATION_HZ),
      healAmount: maxHealth * medical.healFractionOfMaxHealth,
    },
    melee: effectiveMelee(resolver, melee),
    slide,
    switchTicks: Math.ceil(loadout.weaponSwitchSeconds * SIMULATION_HZ),
    maxHealth,
    respawnTicks: Math.ceil(registry.operator.respawnSeconds * SIMULATION_HZ),
    respawnProtectionTicks: Math.ceil(registry.operator.respawnProtectionSeconds * SIMULATION_HZ),
    damagePolicy: registry.combat.damagePolicy,
    operatorHitbox: registry.combat.operatorHitbox,
    trace: { ...resolver.trace, ...armor.trace },
  };
  if (result.grenade.releaseTicks >= result.grenade.throwTicks) {
    throw new BalanceResolutionError(`${grenade.id}: releaseSeconds muss kleiner als throwSeconds sein`);
  }
  resolver.assertAllUsed();
  return deepFreeze(result);
}

// ---------------------------------------------------------------------------------------------------------------
// Mission snapshot

export interface MissionLimits {
  readonly maxActiveEnemies: number;
  readonly maxActiveNests: number;
  readonly maxConcurrentBreaches: number;
  readonly reinforcementBudget: number;
  readonly maxSpawnsPerTick: number;
  readonly patrolGroupCount: number;
  readonly patrolMinSize: number;
  readonly patrolMaxSize: number;
}

/**
 * Fixed, immutable balance of one mission run. Created once when a mission starts. The simulation reads only
 * effective values from here, so raw difficulty multipliers cannot be applied a second time.
 */
export interface MissionBalance {
  readonly movement: BalanceRegistry['movement'];
  readonly hordeAi: SwarmDefinition['hordeAi'];
  readonly meleeAttack: SwarmDefinition['meleeAttack'];
  readonly director: SwarmDefinition['director'];
  readonly configHash: string;
  readonly release: string;
  readonly difficulty: Pick<DifficultyDefinition, 'id' | 'level' | 'displayName'>;
  readonly limits: MissionLimits;
  /** Effective enemy gameplay by wire type. */
  readonly enemies: readonly EnemyGameplay[];
  readonly nest: NestDefinition & {
    readonly maxHealth: number;
    readonly spawnIntervalTicks: number;
    readonly breachTicks: number;
    /** Wire type of `spawnArchetypeId`. */
    readonly spawnWireType: number;
  };
  readonly patrols: SwarmDefinition['patrols'] & {
    readonly sightRange: number;
    readonly contactMemoryTicks: number;
    readonly landingGraceTicks: number;
    readonly investigateTicks: number;
    readonly searchTicks: number;
    readonly lostContactSearchTicks: number;
  };
  readonly reinforcements: SwarmDefinition['reinforcements'] & {
    readonly callTicks: number;
    readonly callCooldownTicks: number;
    readonly globalCooldownTicks: number;
    readonly regionCooldownTicks: number;
    readonly nestBoostTicks: number;
  };
  readonly threat: SwarmDefinition['threat'] & {
    /** Threat added while extracting, already scaled by difficulty. */
    readonly extractingBonus: number;
    /** Extra nest production rate while extracting, already scaled by difficulty. */
    readonly extractionNestRate: number;
  };
  readonly extraction: { readonly initialPressureTicks: number; readonly pressureIntervalTicks: number };
  readonly convicts: { readonly squad: ConvictSquadDefinition; readonly kit: ConvictKitDefinition; readonly reloadTicks: number };
  /** Albatross resupply of this run. Charges and amounts accept mission modifiers (future ship upgrades). */
  readonly resupply: EffectiveResupply;
  readonly trace: Readonly<Record<string, ResolvedStat>>;
}

export interface EffectiveResupply {
  readonly interactionTicks: number;
  readonly interactionRange: number;
  readonly perUse: ResupplyRules['perUse'];
  readonly availableWhen: ResupplyRules['availableWhen'];
  readonly containers: readonly SupplyContainerDefinition[];
}

export function difficultyModifiers(difficulty: DifficultyDefinition, registry: BalanceRegistry): StatModifier[] {
  const source = `difficulty:${difficulty.id}`;
  const mod = (stat: string, operation: ModifierOperation, value: number): StatModifier =>
    ({ source, layer: 'difficulty', stat, operation, value });
  return [
    mod('nest.maxHealth', 'multiply', difficulty.nestHealthMultiplier),
    mod('nest.spawnIntervalTicks', 'multiply', difficulty.nestSpawnIntervalMultiplier),
    mod('patrol.sightRange', 'multiply', difficulty.detectionRangeMultiplier),
    mod('reinforcement.callCooldownTicks', 'multiply', difficulty.reinforcementCooldownMultiplier),
    mod('reinforcement.globalCooldownTicks', 'multiply', difficulty.reinforcementCooldownMultiplier),
    mod('reinforcement.regionCooldownTicks', 'multiply', difficulty.reinforcementCooldownMultiplier),
    mod('extraction.initialPressureTicks', 'divide', difficulty.extractionThreatMultiplier),
    mod('extraction.pressureIntervalTicks', 'divide', difficulty.extractionThreatMultiplier),
    mod('threat.extractingBonus', 'multiply', difficulty.extractionThreatMultiplier),
    mod('threat.extractionNestRate', 'multiply', difficulty.extractionThreatMultiplier),
    ...registry.enemiesByWireType.flatMap((enemy) => enemy ? [
      mod(`enemy.${enemy.id}.health`, 'multiply', difficulty.enemyHealthMultiplier),
      mod(`enemy.${enemy.id}.meleeDamage`, 'multiply', difficulty.enemyDamageMultiplier),
    ] : []),
  ];
}

/**
 * Resolves the fixed balance snapshot of a mission run. `missionModifiers` must use the `mission` layer and may only
 * target stats that also accept difficulty modifiers.
 */
export function resolveMissionBalance(registry: BalanceRegistry, difficultyId: string,
  missionModifiers: readonly StatModifier[] = []): MissionBalance {
  const difficulty = registry.difficulty(difficultyId);
  for (const modifier of missionModifiers) {
    if (modifier.layer !== 'mission') throw new BalanceResolutionError(`Missionsmodifikator ${modifier.source} muss die Ebene "mission" verwenden`);
  }
  const resolver = new StatResolver([...difficultyModifiers(difficulty, registry), ...missionModifiers]);
  const r = (stat: string, base: number, rule: Partial<StatRule> = {}): number =>
    resolver.resolve(stat, base, { layers: MISSION, min: 0, ...rule });
  const { swarm } = registry;
  const nest = registry.primaryNest;
  const kit = registry.convictKit(difficulty.convictKitId);

  const enemies: EnemyGameplay[] = [];
  for (const enemy of registry.enemiesByWireType) {
    if (!enemy) continue;
    const health = r(`enemy.${enemy.id}.health`, enemy.gameplay.health, { round: 'round', min: 1 });
    const meleeDamage = r(`enemy.${enemy.id}.meleeDamage`, enemy.gameplay.meleeDamage);
    // Unchanged stats keep the registry object, which preserves identity with ENEMY_TYPES.
    enemies[enemy.wireType] = health === enemy.gameplay.health && meleeDamage === enemy.gameplay.meleeDamage
      ? enemy.gameplay : { ...enemy.gameplay, health, meleeDamage };
  }

  const balance: MissionBalance = {
    configHash: registry.version.hash,
    movement: registry.movement,
    hordeAi: swarm.hordeAi,
    meleeAttack: swarm.meleeAttack,
    director: swarm.director,
    release: registry.version.release,
    difficulty: { id: difficulty.id, level: difficulty.level, displayName: difficulty.displayName },
    limits: {
      maxActiveEnemies: difficulty.maxActiveEnemies, maxActiveNests: difficulty.maxActiveNests,
      maxConcurrentBreaches: difficulty.maxConcurrentBreaches, reinforcementBudget: difficulty.reinforcementBudget,
      maxSpawnsPerTick: difficulty.maxSpawnsPerTick, patrolGroupCount: difficulty.patrolGroupCount,
      patrolMinSize: difficulty.patrolMinSize, patrolMaxSize: difficulty.patrolMaxSize,
    },
    enemies,
    nest: {
      ...nest,
      maxHealth: r('nest.maxHealth', nest.maxHealth, { round: 'round', min: 1 }),
      spawnIntervalTicks: r('nest.spawnIntervalTicks', ticks(nest.spawnIntervalSeconds), { round: 'round', min: 1 }),
      breachTicks: Math.round(ticks(nest.breachEmergeSeconds)),
      spawnWireType: registry.enemy(nest.spawnArchetypeId).wireType,
    },
    patrols: {
      ...swarm.patrols,
      sightRange: r('patrol.sightRange', registry.enemy(swarm.patrols.archetypeId).ai.detectionRange),
      contactMemoryTicks: ticks(swarm.patrols.contactMemorySeconds),
      landingGraceTicks: ticks(swarm.patrols.landingGraceSeconds),
      investigateTicks: ticks(swarm.patrols.investigateSeconds),
      searchTicks: ticks(swarm.patrols.searchSeconds),
      lostContactSearchTicks: ticks(swarm.patrols.lostContactSearchSeconds),
    },
    reinforcements: {
      ...swarm.reinforcements,
      callTicks: ticks(swarm.reinforcements.callSeconds),
      callCooldownTicks: r('reinforcement.callCooldownTicks', ticks(swarm.reinforcements.callCooldownSeconds), { round: 'ceil' }),
      globalCooldownTicks: r('reinforcement.globalCooldownTicks', ticks(swarm.reinforcements.globalCooldownSeconds), { round: 'ceil' }),
      regionCooldownTicks: r('reinforcement.regionCooldownTicks', ticks(swarm.reinforcements.regionCooldownSeconds), { round: 'ceil' }),
      nestBoostTicks: ticks(swarm.reinforcements.nestBoostSeconds),
    },
    threat: {
      ...swarm.threat,
      extractingBonus: r('threat.extractingBonus', swarm.threat.extracting),
      extractionNestRate: r('threat.extractionNestRate', swarm.threat.extractionNestPressure),
    },
    extraction: {
      initialPressureTicks: r('extraction.initialPressureTicks', ticks(swarm.extraction.initialPressureSeconds), { round: 'ceil' }),
      pressureIntervalTicks: r('extraction.pressureIntervalTicks', ticks(swarm.extraction.pressureIntervalSeconds), { round: 'ceil', min: 1 }),
    },
    convicts: {
      squad: registry.convicts.squad, kit,
      reloadTicks: Math.ceil(SIMULATION_HZ * registry.weapon(registry.convicts.squad.reloadWeaponId).reloadSeconds),
    },
    resupply: resolveResupply(registry, r),
    trace: resolver.trace,
  };
  resolver.assertAllUsed();
  return deepFreeze(balance);
}

function resolveResupply(registry: BalanceRegistry, r: (stat: string, base: number, rule?: Partial<StatRule>) => number): EffectiveResupply {
  const rules = registry.resupply;
  const vehicle = registry.vehicle('vehicle.albatross_02');
  const amount = (name: keyof ResupplyRules['perUse']) => r(`resupply.perUse.${name}`, rules.perUse[name], { round: 'round' });
  return {
    interactionTicks: r('resupply.interactionTicks', rules.interactionSeconds * SIMULATION_HZ, { round: 'ceil', min: 1 }),
    interactionRange: rules.interactionRange,
    perUse: {
      primaryMagazines: amount('primaryMagazines'), secondaryMagazines: amount('secondaryMagazines'),
      grenades: amount('grenades'), stims: amount('stims'),
    },
    availableWhen: rules.availableWhen,
    containers: vehicle.supplyContainers.map((container) => ({
      ...container, charges: r(`resupply.${container.id}.charges`, container.charges, { round: 'round' }),
    })),
  };
}

/** One line per resolved stat, for logs and debugging: `nest.maxHealth: 360 → 396 [× 1.1 (difficulty:hard)]`. */
export function explainBalance(trace: Readonly<Record<string, ResolvedStat>>): string[] {
  return Object.entries(trace).map(([stat, { base, value, applied }]) =>
    `${stat}: ${base} → ${value}${applied.length ? ` [${applied.join(', ')}]` : ''}`);
}
