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
import { ARMOR_ACTION_CUTOFF, LOADOUT_SELECTION_KEYS, MAX_ARMOR_RATING, OPERATOR_SLIDE_LIMITS } from './definitions.ts';
import type { StaminaRules } from '../config/stamina.ts';
import { deepFreeze } from './schema.ts';
import type {
  AmmoDefinition, ArmorEffects, ArmorRules, ArmorWeightClass, BackpackDefinition, BodyArmorDefinition, CaliberDefinition, LoadoutSelection, CombatDefinition, ConvictKitDefinition, DamageType, EnemyArchetype, ConvictSquadDefinition, DamagePolicy, DifficultyDefinition, EnemyGameplay,
  GrenadeDefinition, MagazineVariantType, MedicalDefinition, MeleeDefinition, NestDefinition, OperatorSlideDefinition, ResupplyRules, SupplyContainerDefinition,
  SwarmDefinition, WeaponDefinition, WeaponSlot,
} from './definitions.ts';
import type { BalanceRegistry } from './registry.ts';

/** `ammunition`: the loaded ammunition type (`ammunition.json › ammunition[].modifiers`), applied before equipment. */
/** `research`: completed research of the operator's account (`definitions/research.ts`), operator stats only. */
export const MODIFIER_LAYERS = ['ammunition', 'equipment', 'difficulty', 'mission', 'research'] as const;
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
/** Weapon stats that the loaded ammunition may change (see `AMMO_MODIFIABLE_STATS`). */
const WEAPON: StatRule['layers'] = ['ammunition', 'equipment'];
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

/** Resolved caliber × weapon × ammunition values that the damage resolver needs per hit. */
export interface EffectiveBallistics {
  /** Damage per projectile, identical to `EffectiveWeapon.damage`. */
  readonly damage: number;
  /** Pellets per shot (shot shells), each its own ray. */
  readonly projectilesPerShot: number;
  /** Pellet cone half-angle in radians around the spread aim direction. */
  readonly pelletSpread: number;
  /** Penetration level 1 … 7 against armor classes. */
  readonly penetration: number;
  readonly muzzleVelocity: number;
  readonly damageType: DamageType;
  /** Falloff distances scaled by muzzleVelocity / caliber reference velocity. */
  readonly falloff: CaliberDefinition['falloff'];
}

/** True when `reserve`/`maxReserve` count loose rounds (single feed, break action) instead of whole magazines. */
export function reserveInRounds(feed: { readonly type: string }): boolean {
  return feed.type !== 'magazine';
}

/** Resolved feed. Single feed: `reloadTicks` and the removal/insertion ticks describe one round cycle. */
export type EffectiveFeed =
  | { readonly type: 'magazine'; readonly chamberRounds: number }
  | { readonly type: 'break'; readonly chamberRounds: 0 }
  | { readonly type: 'single'; readonly chamberRounds: number; readonly startTicks: number; readonly chamberTicks: number };

export interface EffectiveWeapon extends Omit<WeaponDefinition, 'feed'> {
  /** Damage per projectile: caliber × weapon ballistics, then ammunition and equipment modifiers. */
  readonly damage: number;
  readonly caliber: CaliberDefinition;
  /** Loaded ammunition type. */
  readonly ammo: AmmoDefinition;
  /** Effective projectile: caliber × weapon `ballistics` × ammunition. */
  readonly projectile: EffectiveBallistics;
  readonly feed: EffectiveFeed;
  /** Rounds the weapon holds when full: magazineSize + chamberRounds. */
  readonly capacity: number;
  /** Ticks between two shots. */
  readonly fireIntervalTicks: number;
  /** Exact shot interval in ticks (fractional). Sustained fire averages exactly `roundsPerSecond`. */
  readonly fireInterval: number;
  readonly reloadTicks: number;
  /** Ticks after reload (or round cycle) start at which the old magazine leaves the weapon. */
  readonly reloadRemovalTicks: number;
  /** Ticks after reload (or round cycle) start at which the ammunition transaction happens (exactly once). */
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
  /** Preset ID (`equipment.json › loadouts`) or `custom` for a selection from the Carrier. */
  readonly id: string;
  readonly configHash: string;
  /** The IDs this loadout was resolved from. */
  readonly selection: LoadoutSelection;
  readonly weapons: Readonly<Record<WeaponSlot, EffectiveWeapon>>;
  readonly grenade: EffectiveGrenade;
  readonly medical: EffectiveMedical;
  readonly melee: EffectiveMelee;
  readonly backpack: BackpackDefinition;
  readonly bodyArmor: BodyArmorDefinition;
  /**
   * Body armor protection: the armor rating after armor modifiers (`operator.armorRating`), the factor every hit on
   * the operator is scaled by (`armorEffects` curve) and the weight class.
   */
  readonly protection: { readonly armorRating: number; readonly damageTaken: number; readonly weightClass: ArmorWeightClass };
  /** Visible equipment as wardrobe ids (`PlayerState.look`). */
  readonly look: { readonly armor: string; readonly helmet: string; readonly pack: string };
  /** Speeds, dive, slide, standing up and stamina of the operator in this armor (`armorEffects`). */
  readonly mobility: EffectiveMobility;
  /** Armor classes and residual damage of non-penetrating hits. */
  readonly armorRules: ArmorRules;
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

/** Movement of an operator in its armor. Shared by the server simulation and the client prediction. */
export interface EffectiveMobility {
  readonly walkSpeed: number;
  readonly sprintSpeed: number;
  /** Dive distance in metres; 0 when the armor cannot dive. */
  readonly diveDistance: number;
  readonly canSlide: boolean;
  /** Multiplier of the time to stand up from prone or supine. */
  readonly getUpMultiplier: number;
  readonly stamina: StaminaRules;
}

/** The ammunition's modifiers as `ammunition`-layer modifiers on `weapon.<id>.<stat>`. */
export function ammoModifiers(weapon: WeaponDefinition, ammo: AmmoDefinition): StatModifier[] {
  return ammo.modifiers.map((modifier) => ({
    source: `ammo:${ammo.id}`, layer: 'ammunition', stat: `weapon.${weapon.id}.${modifier.stat}`,
    operation: modifier.operation, value: modifier.value,
  }));
}

/**
 * A magazine variant as `equipment`-layer modifiers on `weapon.<id>.<stat>`: its size replaces `magazineSize`, its own
 * modifiers follow. Pass the result to `resolveWeapon` to get the weapon with that magazine.
 */
export function magazineModifiers(weapon: WeaponDefinition, type: MagazineVariantType): StatModifier[] {
  const variant = weapon.magazineVariants.find((entry) => entry.type === type);
  if (!variant) throw new BalanceResolutionError(`${weapon.id} hat keine Magazinvariante "${type}"`);
  const source = `magazine:${type}`;
  const size = variant.magazineSize - weapon.magazineSize;
  return [
    ...(size ? [{ source, layer: 'equipment' as const, stat: `weapon.${weapon.id}.magazineSize`, operation: 'add' as const, value: size }] : []),
    ...variant.modifiers.map((modifier) => ({
      source, layer: 'equipment' as const, stat: `weapon.${weapon.id}.${modifier.stat}`, operation: modifier.operation, value: modifier.value,
    })),
  ];
}

/** Equipment item modifiers; `primary.` / `secondary.` address the weapon in that slot. */
function itemModifiers(source: string, modifiers: readonly { stat: string; operation: ModifierOperation; value: number }[],
  weapons: Readonly<Record<WeaponSlot, string>>): StatModifier[] {
  return modifiers.map(({ stat, operation, value }) => {
    const slot = stat.split('.', 1)[0];
    const target = slot === 'primary' || slot === 'secondary' ? `weapon.${weapons[slot]}${stat.slice(slot.length)}` : stat;
    return { source, layer: 'equipment', stat: target, operation, value };
  });
}

function loadedAmmo(registry: BalanceRegistry, weapon: WeaponDefinition, ammoId = weapon.defaultAmmoId): AmmoDefinition {
  const ammo = registry.ammo(ammoId);
  if (ammo.caliberId !== weapon.caliberId) {
    throw new BalanceResolutionError(`${weapon.id} verschießt ${weapon.caliberId}, "${ammo.id}" ist Munition für ${ammo.caliberId}`);
  }
  return ammo;
}

function effectiveWeapon(resolver: StatResolver, registry: BalanceRegistry, weapon: WeaponDefinition, ammo: AmmoDefinition): EffectiveWeapon {
  const key = `weapon.${weapon.id}`;
  const caliber = registry.caliber(weapon.caliberId);
  const damage = resolver.resolve(`${key}.damage`, caliber.damage * weapon.ballistics.damageMultiplier, { layers: WEAPON, min: 0 });
  const penetration = resolver.resolve(`${key}.penetration`, caliber.penetration, { layers: WEAPON, round: 'round', min: 1, max: registry.armor.classes.length });
  const muzzleVelocity = resolver.resolve(`${key}.muzzleVelocity`, caliber.muzzleVelocity * weapon.ballistics.velocityMultiplier, { layers: WEAPON, min: 1 });
  const pelletSpread = resolver.resolve(`${key}.pelletSpread`, caliber.pelletSpreadDegrees, { layers: WEAPON, min: 0, max: 20 });
  const energy = muzzleVelocity / caliber.muzzleVelocity;
  const roundsPerSecond = resolver.resolve(`${key}.roundsPerSecond`, weapon.roundsPerSecond, { layers: WEAPON, min: 1e-6, max: SIMULATION_HZ });
  const magazineSize = resolver.resolve(`${key}.magazineSize`, weapon.magazineSize, { layers: EQUIPMENT, round: 'round', min: 1 });
  const reserve = resolver.resolve(`${key}.reserve`, weapon.reserve, { layers: EQUIPMENT, round: 'round', min: 0 });
  const maxReserve = resolver.resolve(`${key}.maxReserve`, weapon.maxReserve, { layers: EQUIPMENT, round: 'round', min: reserve });
  const reloadSeconds = resolver.resolve(`${key}.reloadSeconds`, weapon.reloadSeconds, { layers: EQUIPMENT, min: 1 / SIMULATION_HZ });
  const effectiveRange = resolver.resolve(`${key}.effectiveRange`, weapon.effectiveRange, { layers: EQUIPMENT, min: 0 });
  const reloadTicks = resolver.resolve(`${key}.reloadTicks`, reloadSeconds * SIMULATION_HZ, { layers: NONE, round: 'ceil', min: 2 });
  const reloadInsertionTicks = Math.min(reloadTicks, Math.max(1, Math.round(weapon.reloadTimeline.insertionAt * reloadTicks)));
  const reloadRemovalTicks = Math.min(reloadInsertionTicks - 1, Math.round(weapon.reloadTimeline.removalAt * reloadTicks));
  const source = weapon.feed;
  const feed: EffectiveFeed = source.type === 'single'
    ? { type: 'single', chamberRounds: source.chamberRounds, startTicks: Math.round(source.startSeconds * SIMULATION_HZ),
      chamberTicks: Math.max(2, Math.ceil(source.chamberSeconds * SIMULATION_HZ)) }
    : source.type === 'break' ? { type: 'break', chamberRounds: 0 } : { type: 'magazine', chamberRounds: source.chamberRounds };
  const { recoil, spread } = weapon;
  const pitch = resolver.resolve(`${key}.recoilPitch`, recoil.pitchPerShot * recoil.verticalMultiplier, { layers: WEAPON, min: 0 });
  const yaw = resolver.resolve(`${key}.recoilYaw`, recoil.yawPerShot * recoil.horizontalMultiplier, { layers: WEAPON, min: 0 });
  const hip = resolver.resolve(`${key}.spreadHip`, spread.hipDegrees, { layers: WEAPON, min: 0 });
  const aim = resolver.resolve(`${key}.spreadAim`, spread.aimDegrees, { layers: WEAPON, min: 0 });
  return {
    ...weapon, damage, caliber, ammo, feed, capacity: magazineSize + feed.chamberRounds,
    projectile: {
      damage, projectilesPerShot: caliber.projectilesPerShot, pelletSpread: pelletSpread * DEG, penetration, muzzleVelocity,
      damageType: ammo.damageType,
      falloff: {
        startMeters: caliber.falloff.startMeters * energy, endMeters: caliber.falloff.endMeters * energy,
        minMultiplier: caliber.falloff.minMultiplier,
      },
    }, roundsPerSecond, magazineSize, reserve, maxReserve, reloadSeconds, effectiveRange,
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

/** One weapon with a given ammunition (default: `defaultAmmoId`), e.g. for catalogs and validation. */
export function resolveWeapon(registry: BalanceRegistry, weaponId: string, ammoId?: string,
  modifiers: readonly StatModifier[] = []): EffectiveWeapon {
  const weapon = registry.weapon(weaponId);
  const ammo = loadedAmmo(registry, weapon, ammoId);
  const resolver = new StatResolver([...ammoModifiers(weapon, ammo), ...modifiers]);
  const result = effectiveWeapon(resolver, registry, weapon, ammo);
  resolver.assertAllUsed();
  return deepFreeze(result);
}

/**
 * Damage factor of an armor rating: piecewise linear between the points of `equipment.json › armorEffects`, clamped
 * to the end points. 50 → 1.25, 100 → 1, 150 → 0.75, 200 → 0.5 with the shipped curve.
 */
export function armorDamageTaken(effects: ArmorEffects, rating: number): number {
  return armorEffect(effects, rating, 'damageTaken');
}

/** Any column of the armor curve at a rating (same interpolation as `armorDamageTaken`). */
export function armorEffect(effects: ArmorEffects, rating: number, key: Exclude<keyof ArmorEffects[number], 'rating'>): number {
  if (rating <= effects[0].rating) return effects[0][key];
  for (let i = 1; i < effects.length; i++) {
    const a = effects[i - 1], b = effects[i];
    if (rating <= b.rating) return a[key] + (b[key] - a[key]) * (rating - a.rating) / (b.rating - a.rating);
  }
  return effects[effects.length - 1][key];
}

/** Speeds, dive, slide and stamina for an armor rating. Stamina is in whole thousandths per 1/30 s step. */
/**
 * Mobility of an operator in armor with this rating. `factors` scale the stamina pool and the dive distance (research);
 * the defaults keep the armor values exactly.
 */
export function armorMobility(registry: BalanceRegistry, rating: number, factors: { readonly stamina?: number; readonly dive?: number } = {}): EffectiveMobility {
  const effect = (key: Exclude<keyof ArmorEffects[number], 'rating'>) => armorEffect(registry.armorEffects, rating, key);
  const { movement, operator } = registry;
  const rules = movement.stamina;
  const max = Math.round(effect('stamina') * (factors.stamina ?? 1) * 1000);
  const recovery = rules.recoveryPerSecond * effect('recovery') * 1000 / SIMULATION_HZ;
  const dive = effect('dive');
  return {
    walkSpeed: operator.walkSpeed * effect('walk'),
    sprintSpeed: operator.sprintSpeed * effect('sprint'),
    diveDistance: dive >= ARMOR_ACTION_CUTOFF ? movement.diveDistance * dive * (factors.dive ?? 1) : 0,
    canSlide: effect('slide') >= ARMOR_ACTION_CUTOFF,
    getUpMultiplier: effect('getUp'),
    stamina: {
      max,
      sprintDrain: Math.round(rules.sprintDrainPerSecond * effect('sprintDrain') * 1000 / SIMULATION_HZ),
      recovery: Math.round(recovery),
      lyingRecovery: Math.round(recovery * rules.lyingRecoveryMultiplier),
      delaySteps: Math.round(rules.recoveryDelaySeconds * SIMULATION_HZ),
      diveCost: Math.round(rules.diveCost * 1000),
      slideCost: Math.round(rules.slideCost * 1000),
      recoverAt: Math.round(max * rules.recoverFraction),
    },
  };
}

/** The IDs of a preset loadout (`equipment.json › loadouts`). */
export function presetSelection(registry: BalanceRegistry, loadoutId = registry.operator.loadoutId): LoadoutSelection {
  const { primaryWeaponId, secondaryWeaponId, meleeId, grenadeId, medicalId, backpackId, armorId } = registry.loadout(loadoutId);
  return { primaryWeaponId, secondaryWeaponId, meleeId, grenadeId, medicalId, backpackId, armorId };
}

/**
 * Checks a client-supplied loadout selection: object shape, known IDs and the slot of each weapon. Returns the
 * normalized selection or a readable reason. Ownership (unlocks) is checked separately on the server.
 */
export function validateLoadoutSelection(registry: BalanceRegistry, value: unknown):
  { readonly selection: LoadoutSelection } | { readonly error: string } {
  if (typeof value !== 'object' || value === null) return { error: 'Loadout: Objekt erwartet' };
  const input = value as Record<string, unknown>;
  const ids: Record<string, string> = {};
  for (const key of LOADOUT_SELECTION_KEYS) {
    const id = input[key];
    if (typeof id !== 'string' || id.length > 80) return { error: `Loadout: ${key} fehlt` };
    ids[key] = id;
  }
  const selection = ids as unknown as LoadoutSelection;
  const known: [ReadonlyMap<string, unknown>, string, string][] = [
    [registry.weapons, selection.primaryWeaponId, 'Primärwaffe'], [registry.weapons, selection.secondaryWeaponId, 'Sekundärwaffe'],
    [registry.meleeAttacks, selection.meleeId, 'Nahkampfwaffe'], [registry.grenades, selection.grenadeId, 'Taktische Ausrüstung'],
    [registry.medicalItems, selection.medicalId, 'Medizin'], [registry.backpacks, selection.backpackId, 'Rucksack'],
    [registry.bodyArmors, selection.armorId, 'Rüstung'],
  ];
  for (const [map, id, label] of known) if (!map.has(id)) return { error: `${label} "${id}" ist unbekannt` };
  if (registry.weapon(selection.primaryWeaponId).slot !== 'primary') return { error: `"${selection.primaryWeaponId}" ist keine Primärwaffe` };
  if (registry.weapon(selection.secondaryWeaponId).slot !== 'secondary') return { error: `"${selection.secondaryWeaponId}" ist keine Sekundärwaffe` };
  return { selection: Object.freeze({ ...selection }) };
}

/**
 * Armor resolves operator stats separately from weapon and other equipment modifiers. `ammo` selects the loaded
 * ammunition per slot; without an entry the weapon's `defaultAmmoId` is loaded.
 */
export function resolveLoadout(registry: BalanceRegistry, loadoutId = registry.operator.loadoutId,
  modifiers: readonly StatModifier[] = [], armorModifiers: readonly StatModifier[] = [],
  ammo: Partial<Readonly<Record<WeaponSlot, string>>> = {}): EffectiveLoadout {
  return resolveSelection(registry, presetSelection(registry, loadoutId), modifiers, armorModifiers, ammo, loadoutId);
}

/** Effective loadout of a selection (Carrier › Ausrüstung). Backpack and body armor add their own modifiers. */
export function resolveSelection(registry: BalanceRegistry, selection: LoadoutSelection,
  modifiers: readonly StatModifier[] = [], armorModifiers: readonly StatModifier[] = [],
  ammo: Partial<Readonly<Record<WeaponSlot, string>>> = {}, id = 'custom', research: readonly StatModifier[] = []): EffectiveLoadout {
  const preset = registry.loadout(registry.operator.loadoutId);
  const primary = registry.weapon(selection.primaryWeaponId);
  const secondary = registry.weapon(selection.secondaryWeaponId);
  if (primary.slot !== 'primary' || secondary.slot !== 'secondary') {
    throw new BalanceResolutionError(`Loadout ${id}: ${primary.id} / ${secondary.id} passen nicht zu Primär- und Sekundärslot`);
  }
  const backpack = registry.backpack(selection.backpackId);
  const bodyArmor = registry.bodyArmor(selection.armorId);
  const slots = { primary: primary.id, secondary: secondary.id };
  const primaryAmmo = loadedAmmo(registry, primary, ammo.primary);
  const secondaryAmmo = loadedAmmo(registry, secondary, ammo.secondary);
  const resolver = new StatResolver([...ammoModifiers(primary, primaryAmmo), ...ammoModifiers(secondary, secondaryAmmo),
    ...itemModifiers(`backpack:${backpack.id}`, backpack.modifiers, slots), ...modifiers]);
  const armor = new StatResolver([...itemModifiers(`armor:${bodyArmor.id}`, bodyArmor.modifiers, slots), ...armorModifiers]);
  const slideStat = (key: keyof OperatorSlideDefinition) =>
    armor.resolve(`operator.slide.${key}`, registry.movement.slide[key], { layers: EQUIPMENT, ...OPERATOR_SLIDE_LIMITS[key] });
  const armorRating = armor.resolve('operator.armorRating', bodyArmor.armorRating,
    { layers: EQUIPMENT, min: 0, max: MAX_ARMOR_RATING, round: 'round' });
  // Research raises health, the stamina pool and the dive distance of the operator in any armor.
  const body = new StatResolver(research);
  const RESEARCH: StatRule['layers'] = ['research'];
  const maxHealth = body.resolve('operator.maxHealth', registry.operator.maxHealth, { layers: RESEARCH, min: 1, max: 10_000, round: 'round' });
  const mobility = armorMobility(registry, armorRating, {
    stamina: body.resolve('operator.staminaFactor', 1, { layers: RESEARCH, min: .1, max: 10 }),
    dive: body.resolve('operator.diveFactor', 1, { layers: RESEARCH, min: .1, max: 10 }),
  });
  body.assertAllUsed();
  // The armor's slide factor shortens the slide; the standard armor keeps the movement values exactly.
  const slideFactor = armorEffect(registry.armorEffects, armorRating, 'slide');
  const slide = {
    seconds: slideStat('seconds'), distance: slideStat('distance') * (slideFactor === 1 ? 1 : slideFactor), decay: slideStat('decay'),
    cooldownSeconds: slideStat('cooldownSeconds'), minSpeed: slideStat('minSpeed'),
  };
  armor.assertAllUsed();
  const grenade = registry.grenade(selection.grenadeId);
  const medical = registry.medical(selection.medicalId);
  const melee = registry.melee(selection.meleeId);
  const result: EffectiveLoadout = {
    id,
    configHash: registry.version.hash,
    selection: { ...selection },
    weapons: {
      primary: effectiveWeapon(resolver, registry, primary, primaryAmmo),
      secondary: effectiveWeapon(resolver, registry, secondary, secondaryAmmo),
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
    backpack, bodyArmor,
    protection: { armorRating, damageTaken: armorDamageTaken(registry.armorEffects, armorRating), weightClass: bodyArmor.weightClass },
    look: { armor: bodyArmor.visual.armor, helmet: bodyArmor.visual.helmet, pack: backpack.visual },
    mobility,
    armorRules: registry.armor,
    slide,
    switchTicks: Math.ceil((registry.loadouts.get(id) ?? preset).weaponSwitchSeconds * SIMULATION_HZ),
    maxHealth,
    respawnTicks: Math.ceil(registry.operator.respawnSeconds * SIMULATION_HZ),
    respawnProtectionTicks: Math.ceil(registry.operator.respawnProtectionSeconds * SIMULATION_HZ),
    damagePolicy: registry.combat.damagePolicy,
    operatorHitbox: registry.combat.operatorHitbox,
    trace: { ...resolver.trace, ...armor.trace, ...body.trace },
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
  readonly convicts: {
    readonly squad: ConvictSquadDefinition; readonly kit: ConvictKitDefinition; readonly reloadTicks: number;
    /** Armor rules for convict shots against enemies. */
    readonly armor: ArmorRules;
    /** Enemy armor class and resistances by wire type. */
    readonly protection: readonly { readonly armorClass: number; readonly resistances: EnemyArchetype['resistances'] }[];
  };
  /** Albatross resupply of this run. Charges and amounts accept mission modifiers (future ship upgrades). */
  readonly resupply: EffectiveResupply;
  /** Warrior castes of this run: wire types and the difficulty's shares (`difficulty.json`). */
  readonly castes: {
    readonly hunterWireType: number;
    readonly breacherWireType: number;
    readonly hunterPatrolShare: number;
    readonly hunterPatrolPureChance: number;
    readonly breachersPerReinforcement: number;
    readonly breacherNestGuards: number;
    readonly assaultBreakerWireType: number;
    readonly assaultBreakersPerReinforcement: number;
    readonly assaultBreakerNestGuards: number;
    readonly maxActiveAssaultBreakers: number;
  };
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
      squad: registry.convicts.squad, kit, armor: registry.armor,
      protection: registry.enemiesByWireType.map((enemy) => ({ armorClass: enemy!.armorClass, resistances: enemy!.resistances })),
      reloadTicks: Math.ceil(SIMULATION_HZ * registry.weapon(registry.convicts.squad.reloadWeaponId).reloadSeconds),
    },
    resupply: resolveResupply(registry, r),
    castes: {
      hunterWireType: registry.enemy(swarm.castes.hunterArchetypeId).wireType,
      breacherWireType: registry.enemy(swarm.castes.breacherArchetypeId).wireType,
      hunterPatrolShare: difficulty.hunterPatrolShare,
      hunterPatrolPureChance: difficulty.hunterPatrolPureChance,
      breachersPerReinforcement: difficulty.breachersPerReinforcement,
      breacherNestGuards: difficulty.breacherNestGuards,
      assaultBreakerWireType: registry.enemy(swarm.castes.assaultBreakerArchetypeId).wireType,
      assaultBreakersPerReinforcement: difficulty.assaultBreakersPerReinforcement,
      assaultBreakerNestGuards: difficulty.assaultBreakerNestGuards,
      maxActiveAssaultBreakers: difficulty.maxActiveAssaultBreakers,
    },
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
