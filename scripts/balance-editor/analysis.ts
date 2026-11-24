/**
 * Validation and derived values for the balance editor.
 *
 * Validation is exactly what server, client build and `npm run balance:check` do: `createBalanceRegistry`, the
 * standard loadout and the mission balance of every difficulty. Derived values use the resolver and the shared damage
 * rules (falloff, armor, resistance), so they match the simulation. The time-to-kill model simplifies on purpose:
 * every projectile hits, the first shot fires at t = 0, reloads take the full reload time.
 */
import {
  BalanceValidationError, SIMULATION_HZ, armorMultiplier, createBalanceRegistry, falloffMultiplier, resolveLoadout,
  resolveMissionBalance, resolveWeapon,
} from '@freefall/shared';
import type { BalanceRegistry, BalanceVersion, EffectiveWeapon, MissionBalance } from '@freefall/shared';

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
  readonly feedType: 'magazine' | 'single';
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

export interface Analysis {
  readonly difficultyId: string;
  readonly distance: number;
  readonly difficulties: readonly { readonly id: string; readonly level: number; readonly displayName: string }[];
  readonly weapons: readonly WeaponRow[];
  readonly targets: readonly TargetColumn[];
  /** `kills[weaponRowIndex][targetIndex]` */
  readonly kills: readonly (readonly KillCell[])[];
  readonly enemies: readonly EnemyRow[];
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
    for (const ammo of registry.ammoForCaliber(weapon.caliberId)) {
      const w = resolveWeapon(registry, weapon.id, ammo.id);
      resolved.push(w);
      weapons.push(weaponRow(w, weapon.defaultAmmoId === ammo.id, distance));
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
    const available = w.feed.type === 'single' ? w.capacity + w.reserve : w.capacity * (1 + w.reserve);
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
    weapons, targets, kills, enemies,
  };
}

function weaponRow(w: EffectiveWeapon, isDefaultAmmo: boolean, distance: number): WeaponRow {
  const roundsPerSecond = SIMULATION_HZ / w.fireInterval;
  const falloff = falloffMultiplier(distance, w.projectile.falloff);
  const shotDamage = w.projectile.damage * w.projectile.projectilesPerShot * falloff;
  const fullReloadSeconds = w.feed.type === 'single'
    ? (w.feed.startTicks + (w.feed.chamberRounds ? w.feed.chamberTicks : w.reloadTicks) + (w.capacity - 1) * w.reloadTicks) / SIMULATION_HZ
    : w.reloadTicks / SIMULATION_HZ;
  const magazineDamage = shotDamage * w.capacity;
  return {
    weaponId: w.id, ammoId: w.ammo.id, ammoName: w.ammo.displayName, isDefaultAmmo, feedType: w.feed.type,
    damage: w.projectile.damage, projectilesPerShot: w.projectile.projectilesPerShot, shotDamage,
    penetration: w.projectile.penetration, damageType: w.projectile.damageType, roundsPerSecond,
    capacity: w.capacity, fullReloadSeconds,
    dps: shotDamage * roundsPerSecond,
    sustainedDps: magazineDamage / (w.capacity / roundsPerSecond + fullReloadSeconds),
    magazineDamage, falloffMultiplier: falloff, falloff: w.projectile.falloff,
  };
}
