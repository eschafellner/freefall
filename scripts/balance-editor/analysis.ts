/**
 * Validation and derived values for the balance editor.
 *
 * Validation is exactly what server, client build and `npm run balance:check` do: `createBalanceRegistry`, the
 * standard loadout and the mission balance of every difficulty. Derived values use the resolver and the shared damage
 * rules (falloff, armor, resistance), so they match the simulation. The time-to-kill model simplifies on purpose:
 * every projectile hits, the first shot fires at t = 0, reloads take the full reload time.
 */
import {
  ALBATROSS_VEHICLE_ID, BalanceValidationError, POI_COUNT, SIMULATION_HZ, armorMultiplier, createBalanceRegistry, falloffMultiplier,
  magazineModifiers, reserveInRounds, resolveLoadout, resolveMissionBalance, resolveWeapon,
} from '@freefall/shared';
import type { BalanceRegistry, BalanceVersion, EffectiveWeapon, MagazineVariantType, MissionBalance } from '@freefall/shared';

export interface AnalysisOptions {
  /** Difficulty for enemy health in the time-to-kill matrix. Default: the first difficulty. */
  readonly difficultyId?: string;
  /** Target distance in meters for damage falloff. Default 0. */
  readonly distance?: number;
}

export interface WeaponRow {
  readonly weaponId: string;
  readonly ammoId: string;
  readonly ammoName: string;
  readonly isDefaultAmmo: boolean;
  /** `standard` or the magazine variant this row was resolved with. */
  readonly magazine: 'standard' | MagazineVariantType;
  readonly magazineName: string;
  readonly feedType: 'magazine' | 'single' | 'break';
  /** Damage per projectile before falloff, armor and resistance. */
  readonly damage: number;
  readonly projectilesPerShot: number;
  /** Damage of a full shot (all projectiles) at the analysis distance against an unarmored target. */
  readonly shotDamage: number;
  readonly penetration: number;
  readonly damageType: string;
  /** Effective rounds per second after rounding to simulation ticks. */
  readonly roundsPerSecond: number;
  readonly capacity: number;
  /** Spare reserve at mission start: magazines (magazine feed) or loose rounds (single feed). */
  readonly reserve: number;
  /** Rounds at mission start: loaded plus reserve. */
  readonly totalRounds: number;
  /** Time to refill an empty weapon in seconds (single feed: chamber plus one cycle per round). */
  readonly fullReloadSeconds: number;
  /** Damage per second while firing, without reloads. */
  readonly dps: number;
  /** Damage per second over a full magazine including the reload. */
  readonly sustainedDps: number;
  readonly magazineDamage: number;
  /** Falloff multiplier at the analysis distance. */
  readonly falloffMultiplier: number;
  readonly falloff: { readonly startMeters: number; readonly endMeters: number; readonly minMultiplier: number };
}

/** One armor class of an enemy that bullets can hit. Enemies with hit zones list each zone's armor class. */
export interface TargetColumn {
  readonly key: string;
  readonly enemyId: string;
  readonly armorClass: number;
  /** Hit zone IDs with this armor class; empty for enemies without zones. */
  readonly zones: readonly string[];
}

export interface KillCell {
  /** Shots until the target dies; null if a shot deals no damage. */
  readonly shots: number | null;
  readonly seconds: number | null;
  readonly reloads: number;
  readonly penetrates: boolean;
  /** Damage per shot after falloff, armor and resistance. */
  readonly shotDamage: number;
  /** False if magazine plus reserve do not suffice. */
  readonly enoughAmmo: boolean;
}

export interface EnemyRow {
  readonly enemyId: string;
  /** Effective health and melee damage per difficulty level (index = position in difficulty.json). */
  readonly health: readonly number[];
  readonly meleeDamage: readonly number[];
}

/** What supply sources give one weapon (standard magazine), capped later by `maxReserve` in the game. */
export interface SupplyWeaponRow {
  readonly weaponId: string;
  readonly slot: 'primary' | 'secondary';
  /** Unit of reserve and grants: spare magazines or loose rounds (single feed). */
  readonly unit: 'magazines' | 'rounds';
  readonly magazineSize: number;
  readonly reserve: number;
  readonly maxReserve: number;
  /** PoI ammo box (primary weapon only); null for secondary weapons. */
  readonly ammoBox: { readonly units: number; readonly rounds: number } | null;
  /** One charge of an Albatross supply container. */
  readonly albatross: { readonly units: number; readonly rounds: number };
}

export interface SupplySummary {
  readonly weapons: readonly SupplyWeaponRow[];
  readonly maxHealth: number;
  /** Health restored by one stim of the standard loadout. */
  readonly stimHeal: number;
  readonly stimCharges: number;
  readonly grenadeCapacity: number;
  /** PoI first aid kit and grenade crate. */
  readonly firstAidKit: { readonly stims: number; readonly heal: number };
  readonly grenadeCrate: { readonly grenades: number };
  /** Albatross: container count, charges over all containers and what all charges give together. */
  readonly albatross: {
    readonly containers: number; readonly charges: number;
    readonly perUse: { readonly primaryMagazines: number; readonly secondaryMagazines: number; readonly grenades: number; readonly stims: number };
  };
  /** Supply items per map: [min, max] per PoI × PoI count. */
  readonly suppliesPerMap: readonly [number, number];
}

export interface Analysis {
  readonly difficultyId: string;
  readonly distance: number;
  readonly difficulties: readonly { readonly id: string; readonly level: number; readonly displayName: string }[];
  readonly weapons: readonly WeaponRow[];
  readonly targets: readonly TargetColumn[];
  /** `kills[weaponRowIndex][targetIndex]` */
  readonly kills: readonly (readonly KillCell[])[];
  readonly enemies: readonly EnemyRow[];
  readonly supplies: SupplySummary;
}

export interface Evaluation {
  readonly ok: boolean;
  readonly issues: readonly string[];
  readonly version?: BalanceVersion;
  readonly analysis?: Analysis;
}

export function evaluateBalance(sources: unknown, options: AnalysisOptions = {}): Evaluation {
  let registry: BalanceRegistry;
  let missions: MissionBalance[];
  try {
    registry = createBalanceRegistry(sources);
    resolveLoadout(registry);
    missions = registry.difficulties.map((difficulty) => resolveMissionBalance(registry, difficulty.id));
  } catch (error) {
    return { ok: false, issues: issuesOf(error) };
  }
  try {
    return { ok: true, issues: [], version: registry.version, analysis: analyze(registry, missions, options) };
  } catch (error) {
    return { ok: false, issues: issuesOf(error), version: registry.version };
  }
}

function issuesOf(error: unknown): string[] {
  if (error instanceof BalanceValidationError) return [...error.issues];
  return [error instanceof Error ? error.message : String(error)];
}

const EPSILON = 1e-9;

function analyze(registry: BalanceRegistry, missions: readonly MissionBalance[], options: AnalysisOptions): Analysis {
  const index = Math.max(0, registry.difficulties.findIndex((difficulty) => difficulty.id === options.difficultyId));
  const difficulty = registry.difficulties[index]!;
  const mission = missions[index]!;
  const distance = Math.min(1000, Math.max(0, Number.isFinite(options.distance) ? options.distance! : 0));

  const resolved: EffectiveWeapon[] = [];
  const weapons: WeaponRow[] = [];
  for (const weapon of registry.weapons.values()) {
    const magazines = [{ type: 'standard' as const, displayName: 'Standardmagazin' }, ...weapon.magazineVariants];
    for (const ammo of registry.ammoForCaliber(weapon.caliberId)) {
      for (const magazine of magazines) {
        const w = resolveWeapon(registry, weapon.id, ammo.id, magazine.type === 'standard' ? [] : magazineModifiers(weapon, magazine.type));
        resolved.push(w);
        weapons.push(weaponRow(w, weapon.defaultAmmoId === ammo.id, magazine.type, magazine.displayName, distance));
      }
    }
  }

  const targets: TargetColumn[] = [];
  for (const enemy of registry.enemiesByWireType) {
    if (!enemy) continue;
    const zones = enemy.hitZones ?? [];
    const classes = zones.length ? [...new Set(zones.map((zone) => zone.armorClass))].sort((a, b) => a - b) : [enemy.armorClass];
    for (const armorClass of classes) {
      targets.push({
        key: `${enemy.id}#${armorClass}`, enemyId: enemy.id, armorClass,
        zones: zones.filter((zone) => zone.armorClass === armorClass).map((zone) => zone.id),
      });
    }
  }

  const residual = registry.armor.nonPenetratingDamageFraction;
  const kills = resolved.map((w, row) => targets.map((target): KillCell => {
    const enemy = registry.enemy(target.enemyId);
    const health = mission.enemies[enemy.wireType]!.health;
    const resistance = enemy.resistances[w.projectile.damageType];
    const shotDamage = weapons[row]!.shotDamage * armorMultiplier(w.projectile.penetration, target.armorClass, residual) * resistance;
    const penetrates = w.projectile.penetration >= target.armorClass;
    if (!(shotDamage > EPSILON)) return { shots: null, seconds: null, reloads: 0, penetrates, shotDamage: 0, enoughAmmo: false };
    const shots = Math.max(1, Math.ceil(health / shotDamage - EPSILON));
    const reloads = Math.floor((shots - 1) / w.capacity);
    const seconds = (shots - 1) * w.fireInterval / SIMULATION_HZ + reloads * weapons[row]!.fullReloadSeconds;
    const available = reserveInRounds(w.feed) ? w.capacity + w.reserve : w.capacity * (1 + w.reserve);
    return { shots, seconds, reloads, penetrates, shotDamage, enoughAmmo: shots <= available };
  }));

  const enemies: EnemyRow[] = registry.enemiesByWireType.filter((enemy) => enemy !== undefined).map((enemy) => ({
    enemyId: enemy.id,
    health: missions.map((m) => m.enemies[enemy.wireType]!.health),
    meleeDamage: missions.map((m) => m.enemies[enemy.wireType]!.meleeDamage),
  }));

  return {
    difficultyId: difficulty.id, distance,
    difficulties: registry.difficulties.map(({ id, level, displayName }) => ({ id, level, displayName })),
    weapons, targets, kills, enemies, supplies: supplies(registry),
  };
}

/** PoI pickups and Albatross containers, with the same unit rules as the server (`Pickups.ts`, `Resupply.ts`). */
function supplies(registry: BalanceRegistry): SupplySummary {
  const { loot, resupply } = registry;
  const loadout = resolveLoadout(registry);
  const weapons = [...registry.weapons.values()].map((definition): SupplyWeaponRow => {
    const w = resolveWeapon(registry, definition.id);
    const single = reserveInRounds(w.feed);
    const grant = (magazines: number) => ({ units: single ? magazines * w.magazineSize : magazines, rounds: magazines * w.magazineSize });
    return {
      weaponId: w.id, slot: w.slot, unit: single ? 'rounds' : 'magazines', magazineSize: w.magazineSize, reserve: w.reserve, maxReserve: w.maxReserve,
      ammoBox: w.slot === 'primary' ? grant(loot.grant.primaryMagazines) : null,
      albatross: grant(w.slot === 'primary' ? resupply.perUse.primaryMagazines : resupply.perUse.secondaryMagazines),
    };
  });
  const containers = registry.vehicle(ALBATROSS_VEHICLE_ID).supplyContainers;
  return {
    weapons, maxHealth: loadout.maxHealth, stimHeal: loadout.medical.healAmount, stimCharges: loadout.medical.maxCharges,
    grenadeCapacity: loadout.grenade.capacity,
    firstAidKit: { stims: loot.grant.stims, heal: loot.grant.stims * loadout.medical.healAmount },
    grenadeCrate: { grenades: loot.grant.grenades },
    albatross: { containers: containers.length, charges: containers.reduce((sum, c) => sum + c.charges, 0), perUse: resupply.perUse },
    suppliesPerMap: [loot.supplies[0]! * POI_COUNT, loot.supplies[1]! * POI_COUNT],
  };
}

function weaponRow(w: EffectiveWeapon, isDefaultAmmo: boolean, magazine: WeaponRow['magazine'], magazineName: string, distance: number): WeaponRow {
  const roundsPerSecond = SIMULATION_HZ / w.fireInterval;
  const falloff = falloffMultiplier(distance, w.projectile.falloff);
  const shotDamage = w.projectile.damage * w.projectile.projectilesPerShot * falloff;
  const fullReloadSeconds = w.feed.type === 'single'
    ? (w.feed.startTicks + (w.feed.chamberRounds ? w.feed.chamberTicks : w.reloadTicks) + (w.capacity - 1) * w.reloadTicks) / SIMULATION_HZ
    : w.reloadTicks / SIMULATION_HZ;
  const magazineDamage = shotDamage * w.capacity;
  return {
    weaponId: w.id, ammoId: w.ammo.id, ammoName: w.ammo.displayName, isDefaultAmmo, magazine, magazineName, feedType: w.feed.type,
    damage: w.projectile.damage, projectilesPerShot: w.projectile.projectilesPerShot, shotDamage,
    penetration: w.projectile.penetration, damageType: w.projectile.damageType, roundsPerSecond,
    capacity: w.capacity, reserve: w.reserve,
    totalRounds: w.capacity + (reserveInRounds(w.feed) ? w.reserve : w.reserve * w.magazineSize), fullReloadSeconds,
    dps: shotDamage * roundsPerSecond,
    sustainedDps: magazineDamage / (w.capacity / roundsPerSecond + fullReloadSeconds),
    magazineDamage, falloffMultiplier: falloff, falloff: w.projectile.falloff,
  };
}
