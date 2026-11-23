/**
 * Schemas and types of all balance data files in `balance/data/`. The TypeScript types are inferred from the
 * schemas, so a field is described exactly once.
 */
import { MAX_ENEMIES, SIMULATION_HZ } from '../config/limits.ts';
import {
  arr, bool, count, either, id, nonNegative, num, obj, oneOf, positive, record, reserved, str,
} from './schema.ts';
import type { Infer } from './schema.ts';

const MOVEMENT_7_2B = 'waffenabhängige Laufgeschwindigkeit ist noch nicht in Server und Prediction verdrahtet';

export const manifestSchema = obj({
  schemaVersion: oneOf([3] as const),
  release: str(),
  description: str(),
});

/** Armor classes and penetration share one scale: a hit penetrates when penetration ≥ armor class. */
export const ARMOR_CLASS_COUNT = 7;
export const DAMAGE_TYPES = ['kinetic', 'explosive'] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];
/** Weapon stats an ammunition type may modify (stat key `weapon.<id>.<stat>`, layer `ammunition`). */
export const AMMO_MODIFIABLE_STATS = [
  'damage', 'penetration', 'muzzleVelocity', 'roundsPerSecond', 'recoilPitch', 'recoilYaw', 'spreadHip', 'spreadAim', 'pelletSpread',
] as const;

const armorClass = () => count({ min: 1, max: ARMOR_CLASS_COUNT });

export const caliberSchema = obj({
  id: id(),
  /** Shown in HUD and catalog, e.g. "5,55 × 39 mm". */
  displayName: str(),
  family: oneOf(['pistol', 'rifle', 'shotgun'] as const),
  /** Damage per projectile before ammunition, weapon and equipment modifiers. */
  damage: positive({ max: 10_000 }),
  /** Projectiles per shot. Above 1 (shot) every pellet is its own hitscan ray with its own damage. */
  projectilesPerShot: count({ min: 1, max: 32 }),
  /** Half-angle in degrees of the pellet cone around the (already spread) aim direction. 0 for single projectiles. */
  pelletSpreadDegrees: nonNegative({ max: 20 }),
  /** Muzzle velocity in m/s. Hitscan: scales damage falloff distances and drives presentation, not flight time. */
  muzzleVelocity: positive({ max: 3000 }),
  /** Penetration level on the armor class scale (1 = minimal … 7). */
  penetration: armorClass(),
  /** Damage falloff over the distance from the muzzle, at the caliber's reference velocity. */
  falloff: obj({
    /** Full damage up to this distance. */
    startMeters: nonNegative({ max: 2000 }),
    /** Linear decrease until this distance, constant `minMultiplier` beyond. */
    endMeters: positive({ max: 4000 }),
    minMultiplier: num({ min: 0, max: 1 }),
  }),
});

export const ammoSchema = obj({
  id: id(),
  caliberId: id(),
  displayName: str(),
  /** Short label for HUD and magazines, e.g. "VM". */
  shortName: str(),
  damageType: oneOf(DAMAGE_TYPES),
  /** Applied on the `ammunition` layer, before equipment modifiers. */
  modifiers: arr(obj({
    stat: oneOf(AMMO_MODIFIABLE_STATS),
    operation: oneOf(['add', 'multiply', 'divide'] as const),
    value: num(),
  })),
});

export const ammunitionSchema = obj({
  armor: obj({
    /** Fraction of the damage a non-penetrating hit still deals (blunt trauma). */
    nonPenetratingDamageFraction: num({ min: 0, max: 1 }),
    /** Exactly ARMOR_CLASS_COUNT entries, level 1 … 7. Penetration level n uses the label of class n. */
    classes: arr(obj({ level: armorClass(), displayName: str(), penetrationName: str() })),
  }),
  calibers: arr(caliberSchema, { min: 1 }),
  ammunition: arr(ammoSchema, { min: 1 }),
});

export const weaponSchema = obj({
  id: id(),
  displayName: str(),
  category: oneOf(['assault-rifle', 'pistol', 'shotgun'] as const),
  slot: oneOf(['primary', 'secondary'] as const),
  /** Defines damage, penetration, velocity, falloff and the usable ammunition (`ammunition.json`). */
  caliberId: id(),
  /** Ammunition loaded when no other is selected. Must belong to `caliberId`. */
  defaultAmmoId: id(),
  /** How the weapon changes its ammunition, e.g. barrel length. Multiplies the caliber values. */
  ballistics: obj({
    damageMultiplier: positive({ max: 5 }),
    /** Also scales the falloff distances (faster projectiles keep their energy longer). */
    velocityMultiplier: positive({ max: 3 }),
  }),
  /** Shots per second. One shot per tick at most. */
  roundsPerSecond: positive({ max: SIMULATION_HZ }),
  magazineSize: count({ min: 1, max: 500 }),
  /**
   * How rounds get into the weapon.
   *   - `magazine`: `reserve` counts full spare magazines; a reload swaps the magazine, the rest is discarded.
   *   - `single`: `reserve` counts loose rounds; a reload inserts one round per `reloadSeconds` cycle until the
   *     weapon is full, the reserve is empty or the operator fires (fire input ends the reload between rounds).
   * `chamberRounds` (0 or 1): one extra round in the chamber on top of `magazineSize`.
   */
  feed: either(
    obj({ type: oneOf(['magazine'] as const), chamberRounds: count({ max: 1 }) }),
    obj({
      type: oneOf(['single'] as const), chamberRounds: count({ max: 1 }),
      /** Raising the weapon to the loading port before the first round. */
      startSeconds: nonNegative({ max: 5 }),
      /** Empty weapon: the first round goes straight into the chamber and takes this long instead of `reloadSeconds`. */
      chamberSeconds: positive({ max: 5 }),
    }),
    'feed: { type: "magazine", chamberRounds } oder { type: "single", chamberRounds, startSeconds, chamberSeconds } erwartet',
  ),
  /** Spare reserve at mission start: magazines (`feed.type: magazine`) or loose rounds (`single`). */
  reserve: count({ max: 500 }),
  /** Carry capacity of the reserve, same unit. Resupply never exceeds it. */
  maxReserve: count({ max: 500 }),
  /** Magazine feed: whole reload. Single feed: one round cycle. */
  reloadSeconds: positive({ max: 30 }),
  /**
   * Reload state machine as fractions of `reloadSeconds`: the old magazine (or the hand with the next round) leaves at
   * `removalAt`; the ammunition transaction happens atomically at `insertionAt` (single feed: once per round).
   */
  reloadTimeline: obj({ removalAt: num({ min: 0, max: 1 }), insertionAt: num({ above: 0, max: 1 }) }),
  effectiveRange: positive({ max: 1000 }),
  recoil: obj({
    /** Base vertical climb per shot in degrees, before `verticalMultiplier`. */
    pitchPerShot: nonNegative({ max: 10 }),
    /** Base horizontal deflection per shot in degrees (deterministic pattern), before `horizontalMultiplier`. */
    yawPerShot: nonNegative({ max: 10 }),
    verticalMultiplier: positive({ max: 5 }),
    horizontalMultiplier: positive({ max: 5 }),
    /** Each consecutive shot without recovery increases the kick by this fraction … */
    sustainedGrowthPerShot: nonNegative({ max: 1 }),
    /** … up to this multiplier. Sustained fire becomes harder to control than bursts. */
    maxSustainedMultiplier: num({ min: 1, max: 5 }),
    /** Upper bound of the accumulated climb in degrees. */
    maxClimbDegrees: nonNegative({ max: 30 }),
    /** Recovery starts this long after the last shot. */
    recoveryDelaySeconds: nonNegative({ max: 5 }),
    /** Degrees per second the accumulated recoil returns to the point of aim. */
    recoveryPerSecond: nonNegative({ max: 200 }),
    /** Presentation only: scales the weapon model kick on the client. */
    visualKick: nonNegative({ max: 5 }),
    /** Presentation only: field-of-view punch of the camera in degrees. */
    cameraKick: nonNegative({ max: 5 }),
  }),
  spread: obj({
    /** Cone half-angle in degrees from the hip. */
    hipDegrees: nonNegative({ max: 20 }),
    /** Cone half-angle in degrees while aiming down the sights. */
    aimDegrees: nonNegative({ max: 20 }),
    movingMultiplier: num({ min: 1, max: 10 }),
    /** Additional cone per shot (bloom) in degrees, recovered at `bloomRecoveryPerSecond`. */
    bloomPerShot: nonNegative({ max: 10 }),
    maxBloomDegrees: nonNegative({ max: 30 }),
    bloomRecoveryPerSecond: nonNegative({ max: 200 }),
  }),
  movement: obj({
    walkSpeedMultiplier: reserved(1, MOVEMENT_7_2B),
    sprintSpeedMultiplier: reserved(1, MOVEMENT_7_2B),
  }),
  assets: obj({ visual: id() }),
  /** Audio cue IDs. Each cue needs a profile in `combat.json › audio.weapons`. */
  sounds: obj({ fire: oneOf(['rifle', 'pistol', 'shotgun'] as const) }),
  attachmentSlots: arr(id()),
});

export const grenadeSchema = obj({
  id: id(),
  displayName: str(),
  capacity: count({ min: 0, max: 20 }),
  throwSeconds: positive({ max: 10 }),
  releaseSeconds: nonNegative({ max: 10 }),
  fuseSeconds: positive({ max: 30 }),
  baseDamage: nonNegative(),
  /** Penetration level against armor classes. Blast damage is of type `explosive`. */
  penetration: armorClass(),
  blastRadius: positive({ max: 100 }),
  falloff: oneOf(['linear'] as const),
  /** Keyed by structure definition ID. Structures without an entry take the blast damage unchanged. */
  structureDamageMultipliers: record(nonNegative({ max: 100 })),
  throw: obj({
    speed: positive({ max: 100 }),
    pitchOffset: num({ min: -1.5, max: 1.5 }),
    minPitch: num({ min: -1.5, max: 1.5 }),
    gravity: positive({ max: 100 }),
    releaseHeight: positive({ max: 5 }),
  }),
});

export const medicalSchema = obj({
  id: id(),
  displayName: str(),
  maxCharges: count({ max: 20 }),
  applicationSeconds: positive({ max: 30 }),
  healFractionOfMaxHealth: positive({ max: 1 }),
  cooldownSeconds: reserved(0, 'ein Stim-Cooldown benötigt zusätzlichen Netzwerkzustand'),
  interruptedBy: obj({ fire: bool(), sprint: bool(), reload: bool(), weaponSwitch: bool(), melee: bool() }),
});

export const meleeSchema = obj({
  id: id(),
  displayName: str(),
  damage: nonNegative({ max: 10_000 }),
  /** Penetration level against armor classes. Melee damage is of type `kinetic`. */
  penetration: armorClass(),
  /** Reach in meters from the operator to the edge of the target's hit radius. */
  range: positive({ max: 10 }),
  /** Full width of the frontal hit cone in degrees. */
  arcDegrees: positive({ max: 360 }),
  /** Time from input to the impact frame. The hit is resolved on this tick. */
  windupSeconds: nonNegative({ max: 5 }),
  /** Whole action, after which other actions are possible again. */
  actionSeconds: positive({ max: 5 }),
  /** Time from one strike to the next. */
  cooldownSeconds: positive({ max: 30 }),
  staggerSeconds: nonNegative({ max: 5 }),
  /** After a stagger ends, the same enemy cannot be staggered again for this long (no stun-lock chains). */
  staggerImmunitySeconds: nonNegative({ max: 30 }),
  /** Maximum knockback travel in meters. Movement uses the regular collision, so walls stop it. */
  knockbackDistance: nonNegative({ max: 5 }),
});

/**
 * Stat modifier of an equipment item on the `equipment` layer. `primary.<stat>` and `secondary.<stat>` address the
 * weapon in that slot (e.g. `primary.maxReserve`); other keys are used as written (e.g. `melee.<id>.damage`).
 */
const equipmentModifierSchema = obj({
  stat: str(/^[a-z0-9][a-zA-Z0-9._-]*$/, 'Stat-Schlüssel erwartet'),
  operation: oneOf(['add', 'multiply', 'divide'] as const),
  value: num(),
});

export const backpackSchema = obj({
  id: id(),
  displayName: str(),
  description: str(),
  modifiers: arr(equipmentModifierSchema),
});

/** Body armor. Its modifiers resolve separately and may only target operator stats (`operator.slide.*`). */
export const bodyArmorSchema = obj({
  id: id(),
  displayName: str(),
  description: str(),
  modifiers: arr(equipmentModifierSchema),
});

export const loadoutSchema = obj({
  id: id(),
  primaryWeaponId: id(),
  secondaryWeaponId: id(),
  grenadeId: id(),
  medicalId: id(),
  meleeId: id(),
  backpackId: id(),
  armorId: id(),
  weaponSwitchSeconds: positive({ max: 10 }),
});

export const resupplySchema = obj({
  onMissionStart: oneOf(['full'] as const),
  onRespawn: oneOf(['full'] as const),
  /** Albatross supply containers (`structures.json › vehicles[].supplyContainers`). */
  supplyCrates: oneOf(['albatross'] as const),
  interactionSeconds: positive({ max: 30 }),
  /** Distance from the container center to the operator. */
  interactionRange: positive({ max: 10 }),
  /** Granted per container charge, each capped at the carry capacity. */
  /** Single-feed weapons receive `magazineSize` rounds per granted magazine (magazine equivalents). */
  perUse: obj({
    primaryMagazines: count({ max: 50 }),
    secondaryMagazines: count({ max: 50 }),
    grenades: count({ max: 20 }),
    stims: count({ max: 20 }),
  }),
  /** Vehicle lifecycle states in which intact containers can be used. */
  availableWhen: obj({ vehicleDamaged: bool(), vehicleDisabled: bool(), vehicleDestroyed: bool() }),
});

export const operatorSchema = obj({
  id: id(),
  loadoutId: id(),
  maxHealth: positive({ max: 10_000, integer: true }),
  walkSpeed: positive({ max: 50 }),
  sprintSpeed: positive({ max: 50 }),
  respawnSeconds: nonNegative({ max: 120 }),
  respawnProtectionSeconds: nonNegative({ max: 60 }),
  landingProtectionSeconds: nonNegative({ max: 60 }),
});

export const factionSchema = obj({ id: id(), displayName: str() });

export const enemyGameplaySchema = obj({
  health: positive({ max: 100_000 }),
  speed: positive({ max: 50 }),
  hitRadius: positive({ max: 20 }),
  hitHeight: nonNegative({ max: 20 }),
  meleeRange: positive({ max: 50 }),
  meleeDamage: nonNegative({ max: 10_000 }),
  /** Seconds between melee attacks. Attack rate = 1 / meleeCooldown. */
  meleeCooldown: positive({ max: 60 }),
});

export const enemySchema = obj({
  id: id(),
  factionId: id(),
  displayName: str(),
  /** Approved designs. Changes require an explicit request and must keep the regression tests green. */
  protected: bool(),
  /** Network and ECS type byte. Never renumber an existing archetype. */
  wireType: count({ max: 255 }),
  visualAssetId: id(),
  gameplay: enemyGameplaySchema,
  /** 1 = unarmored. Hits with lower penetration deal only `nonPenetratingDamageFraction`. */
  armorClass: armorClass(),
  /** Damage multiplier per damage type, after armor. */
  resistances: obj({ kinetic: nonNegative({ max: 10 }), explosive: nonNegative({ max: 10 }) }),
  ai: obj({ detectionRange: positive({ max: 500 }) }),
});

export const nestSchema = obj({
  id: id(),
  factionId: id(),
  spawnArchetypeId: id(),
  maxHealth: positive({ max: 1_000_000 }),
  armorClass: armorClass(),
  spawnIntervalSeconds: positive({ max: 600 }),
  breachEmergeSeconds: nonNegative({ max: 120 }),
  minSpawnIntervalTicks: count({ min: 1, max: 3600 }),
  blockedSpawnRetryTicks: count({ min: 1, max: 3600 }),
  reinforcementBoostRate: positive({ max: 20 }),
  hitRadius: positive({ max: 50 }),
  hitHeight: nonNegative({ max: 50 }),
  exits: count({ min: 1, max: 16 }),
  exitRadius: positive({ max: 50 }),
  collapseTicks: count({ max: 3600 }),
  garrison: obj({
    routeRadius: positive({ max: 200 }),
    routePoints: count({ min: 1, max: 32 }),
    regroupDistance: positive({ max: 500 }),
    playerClearance: nonNegative({ max: 200 }),
  }),
});

export const supplyContainerSchema = obj({
  id: id(),
  side: oneOf(['left', 'right'] as const),
  /** Stenciled serial number. */
  serial: str(),
  /** Mount point relative to the vehicle center. */
  x: num({ min: -20, max: 20 }),
  z: num({ min: -20, max: 20 }),
  /** Shared charges per mission, used by all operators. */
  charges: count({ max: 100 }),
  health: positive({ max: 1_000_000 }),
});

export const vehicleSchema = obj({
  id: id(),
  displayName: str(),
  hullHealth: positive({ max: 1_000_000 }),
  thrusterHealth: positive({ max: 1_000_000 }),
  /** Destroyed thrusters that ground the ship. */
  disabledThrusters: count({ min: 1, max: 4 }),
  supplyContainers: arr(supplyContainerSchema),
});

const weaponAudioSchema = obj({
  gain: nonNegative({ max: 4 }),
  /** Center of the sharp transient (crack) layer in Hz. */
  transientHz: positive({ max: 20_000 }),
  /** Fundamental of the low-frequency pressure layer in Hz. */
  bodyHz: positive({ max: 1000 }),
  bodyGain: nonNegative({ max: 4 }),
  mechanicalGain: nonNegative({ max: 4 }),
  tailGain: nonNegative({ max: 4 }),
  /** Random pitch and level variation per shot (fraction). */
  variation: nonNegative({ max: 0.5 }),
});

const environmentAudioSchema = obj({
  reverbSeconds: positive({ max: 10 }),
  reverbWet: nonNegative({ max: 1 }),
  echoDelaySeconds: nonNegative({ max: 2 }),
  echoFeedback: nonNegative({ max: 0.9 }),
  /** 0 = natural, 1 = strong metallic resonances. */
  metallic: nonNegative({ max: 1 }),
});

export const combatSchema = obj({
  /**
   * Relation multipliers of the central damage resolver. Each is applied exactly once per damage event, after the
   * base damage and structure multipliers, before target-side armor and protection windows.
   */
  damagePolicy: obj({
    operatorToOperator: nonNegative({ max: 1 }),
    selfDamage: nonNegative({ max: 1 }),
    operatorToConvict: nonNegative({ max: 1 }),
    explosionsDamageOperators: bool(),
  }),
  /** Vertical cylinder used for friendly-fire hitscan and melee against operators. */
  operatorHitbox: obj({ radius: positive({ max: 3 }), height: positive({ max: 4 }) }),
  /** Client presentation. Part of the hash so all clients hear the same mix. */
  audio: obj({
    maxVoices: count({ min: 1, max: 128 }),
    maxVoicesPerShooter: count({ min: 1, max: 32 }),
    audibleDistance: positive({ max: 2000 }),
    distantBlendStart: nonNegative({ max: 2000 }),
    distantBlendEnd: positive({ max: 2000 }),
    speedOfSound: positive({ max: 2000 }),
    limiterThresholdDb: num({ min: -40, max: 0 }),
    weapons: obj({ rifle: weaponAudioSchema, pistol: weaponAudioSchema, shotgun: weaponAudioSchema }),
    explosion: obj({ gain: nonNegative({ max: 4 }), bodyHz: positive({ max: 1000 }), tailGain: nonNegative({ max: 4 }) }),
    environments: obj({ carrier: environmentAudioSchema, 'open-field': environmentAudioSchema, outpost: environmentAudioSchema }),
  }),
});

export const swarmSchema = obj({
  director: obj({
    enabled: bool(),
    sampleTicks: count({ min: 1, max: SIMULATION_HZ * 10 }),
    timing: obj({
      calmTicks: count({ min: 1, max: 18000 }),
      calmJitterTicks: count({ max: 18000 }),
      buildupTicks: count({ min: 1, max: 18000 }),
      assaultMinTicks: count({ min: 1, max: 18000 }),
      assaultMaxTicks: count({ min: 1, max: 18000 }),
      peakMinTicks: count({ min: 1, max: 18000 }),
      peakMaxTicks: count({ min: 1, max: 18000 }),
      recoveryMinTicks: count({ min: 1, max: 18000 }),
      recoveryMaxTicks: count({ min: 1, max: 18000 }),
    }),
    pressure: obj({
      smoothing: positive({ max: 1 }),
      startAtMost: nonNegative({ max: 1 }),
      pauseAt: positive({ max: 1 }),
      weights: obj({ population: nonNegative({ max: 1 }), nearby: nonNegative({ max: 1 }),
        attacks: nonNegative({ max: 1 }), health: nonNegative({ max: 1 }), damage: nonNegative({ max: 1 }),
        casualties: nonNegative({ max: 1 }) }),
    }),
    wave: obj({
      minEnemies: count({ min: 1, max: MAX_ENEMIES }),
      maxEnemies: count({ min: 1, max: MAX_ENEMIES }),
      groupMin: count({ min: 1, max: MAX_ENEMIES }),
      groupMax: count({ min: 1, max: MAX_ENEMIES }),
      perAdditionalOperator: nonNegative({ max: 1 }),
      budgetJitter: nonNegative({ max: .5 }),
      groupIntervalTicks: count({ min: 1, max: 18000 }),
      spawnIntervalTicks: count({ min: 1, max: 18000 }),
      candidateRetries: count({ min: 1, max: 100 }),
    }),
    spawn: obj({
      visibilityDot: num({ min: -1, max: 1 }),
      maxChecksPerTick: count({ min: 1, max: MAX_ENEMIES }),
      dynamicChecksPerTick: count({ min: 1, max: MAX_ENEMIES }),
      priorityHeadroom: count({ max: MAX_ENEMIES }),
      patrolSeedWindowTicks: count({ min: 1, max: 18000 }),
    }),
  }),
  meleeAttack: obj({
    windupTicks: count({ min: 1, max: 300 }),
    activeTicks: count({ min: 1, max: 300 }),
    recoveryTicks: count({ min: 1, max: 300 }),
    halfAngleDegrees: positive({ max: 90 }),
    decisionTicks: count({ min: 1, max: 30 }),
  }),
  hordeAi: obj({
    targetTicks: count({ min: 1, max: 300 }),
    targeting: (value, path, issues) => obj({
      commitmentTicks: count({ max: 3600 }),
      switchMeters: nonNegative({ max: 500 }),
      switchRatio: positive({ max: 1 }),
    })(value === undefined ? { commitmentTicks: SIMULATION_HZ, switchMeters: 2, switchRatio: .8 } : value, path, issues),
    steeringTicks: count({ min: 1, max: 300 }),
    separationRadius: positive({ max: 20 }),
    neighborsPerCell: count({ min: 1, max: 32 }),
    maxNeighbors: count({ min: 1, max: 32 }),
    separationStrength: nonNegative({ max: 3 }),
    contactStrength: nonNegative({ max: 3 }),
    contactDiameterFraction: positive({ max: 1 }),
    contactCandidatesPerCell: count({ min: 1, max: 64 }),
    forwardFloor: nonNegative({ max: 1 }),
    steeringResponse: positive({ max: 60 }),
    turnRate: positive({ max: 60 }),
    attackRingFraction: positive({ max: 1 }),
    attackSpacing: positive({ max: 5 }),
    approachRange: positive({ max: 30 }),
    arrivalRadius: positive({ max: 1 }),
    goalRefreshDistance: positive({ max: 10 }),
    routeRefreshTicks: count({ min: 2, max: 300 }),
    routeRequestsPerTick: count({ min: 1, max: 1000 }),
    fieldBuildsPerTick: count({ min: 1, max: 8 }),
    fieldCacheLimit: count({ min: 1, max: 64 }),
    gridCellSize: positive({ min: 2, max: 10 }),
    cornerClearance: positive({ max: 0.2 }),
    anchorSearchCells: count({ min: 1, max: 4 }),
    waypointLookahead: count({ min: 1, max: 6 }),
    stuckTicks: count({ min: 1, max: 300 }),
    stuckProgressRatio: positive({ max: 1 }),
    recoveryRetries: count({ min: 1, max: 3 }),
    recoveryCooldownTicks: count({ min: 1, max: 1200 }),
    recoveryContactScale: positive({ max: 1 }),
    unreachableRetryTicks: count({ min: 1, max: 300 }),
  }),
  arena: obj({
    archetypeId: id(),
    outerRadiusInset: nonNegative({ max: 50 }),
    ringWidth: positive({ max: 50 }),
    refillTicks: count({ max: 3600 }),
    maxSpawnsPerTick: (value, path, issues) =>
      count({ min: 1, max: MAX_ENEMIES })(value === undefined ? 100 : value, path, issues),
  }),
  patrols: obj({
    archetypeId: id(),
    perceptionPeriodTicks: count({ min: 1, max: 300 }),
    closeAwarenessRange: nonNegative({ max: 500 }),
    fieldOfViewDot: num({ min: -1, max: 1 }),
    contactMemorySeconds: positive({ max: 600 }),
    alertDelayTicks: count({ max: 3600 }),
    suspiciousDelayTicks: count({ max: 3600 }),
    investigateSeconds: positive({ max: 600 }),
    searchSeconds: positive({ max: 600 }),
    lostContactSearchSeconds: positive({ max: 600 }),
    /** After touchdown, shots near the landing zone stay unnoticed for this long. */
    landingGraceSeconds: nonNegative({ max: 600 }),
    routeSpeedScale: positive({ max: 2 }),
    suspiciousSpeedScale: positive({ max: 2 }),
    noiseRadius: obj({ shot: nonNegative(), explosion: nonNegative(), landing: nonNegative(), beacon: nonNegative() }),
    noiseLifetimeTicks: obj({ shot: count(), explosion: count(), landing: count(), beacon: count() }),
    maxRememberedNoises: count({ min: 1, max: 1000 }),
    /** Patrol members do not spawn closer than this to a living operator. */
    seedPlayerClearance: nonNegative({ max: 500 }),
  }),
  reinforcements: obj({
    callSeconds: positive({ max: 60 }),
    callCooldownSeconds: nonNegative({ max: 600 }),
    globalCooldownSeconds: nonNegative({ max: 600 }),
    regionCooldownSeconds: nonNegative({ max: 600 }),
    nestBoostSeconds: nonNegative({ max: 600 }),
    boostSearchRadius: positive({ max: 1000 }),
    breachSearchRadius: positive({ max: 1000 }),
    breachAttemptsPerRegion: count({ min: 1, max: 100 }),
    playerClearance: nonNegative({ max: 500 }),
    nestSpacing: nonNegative({ max: 500 }),
    deploymentClearance: nonNegative({ max: 500 }),
    serviceApronClearance: nonNegative({ max: 500 }),
    objectiveClearance: nonNegative({ max: 500 }),
  }),
  threat: obj({
    base: nonNegative({ max: 100 }),
    perDifficultyLevel: nonNegative({ max: 100 }),
    perActiveNest: nonNegative({ max: 100 }),
    defending: nonNegative({ max: 100 }),
    extracting: nonNegative({ max: 100 }),
    /** Threat that adds +100 % nest production (`1 + threat / divisor`). */
    nestPressureThreatDivisor: positive(),
    extractionNestPressure: nonNegative({ max: 10 }),
    alertHeat: obj({
      max: nonNegative({ max: 100 }),
      perReinforcement: nonNegative({ max: 100 }),
      decayPerTick: nonNegative({ max: 10 }),
      touchdownBase: nonNegative({ max: 100 }),
      touchdownPerLevel: nonNegative({ max: 100 }),
      beaconBase: nonNegative({ max: 100 }),
      beaconPerLevel: nonNegative({ max: 100 }),
    }),
  }),
  extraction: obj({
    initialPressureSeconds: nonNegative({ max: 600 }),
    pressureIntervalSeconds: positive({ max: 600 }),
  }),
  missionGeneration: (value, path, issues) => obj({
    relayDefenseSeconds: positive({ max: 120 }),
    earlyPressureMultiplier: positive({ min: 0.5, max: 0.95 }),
  })(value === undefined ? { relayDefenseSeconds: 8, earlyPressureMultiplier: .65 } : value, path, issues),
});

export const convictSquadSchema = obj({
  size: count({ min: 0, max: 4 }),
  moveSpeed: positive({ max: 50 }),
  engageRange: positive({ max: 500 }),
  idleRescanTicks: count({ min: 1, max: 300 }),
  /** Convicts reload with the reload duration of this registered weapon. */
  reloadWeaponId: id(),
  /** Penetration level of convict shots against enemy armor classes. */
  penetration: armorClass(),
});

export const convictKitSchema = obj({
  /** Also the wire `equipmentId` of a convict. */
  id: id(),
  weaponVariantId: id(),
  maxHealth: positive({ max: 10_000, integer: true }),
  /** Flat reduction per hit. A hit always deals at least 1 damage. */
  armor: nonNegative({ max: 1000 }),
  damage: positive({ max: 10_000 }),
  roundsPerSecond: positive({ max: SIMULATION_HZ }),
  magazineSize: count({ min: 1, max: 500 }),
});

export const difficultySchema = obj({
  id: id(),
  level: count({ min: 1 }),
  displayName: str(),
  maxActiveEnemies: count({ min: 1, max: MAX_ENEMIES }),
  maxActiveNests: count({ max: 64 }),
  patrolGroupCount: count({ max: 200 }),
  patrolMinSize: count({ min: 1, max: MAX_ENEMIES }),
  patrolMaxSize: count({ min: 1, max: MAX_ENEMIES }),
  detectionRangeMultiplier: positive({ max: 10 }),
  reinforcementCooldownMultiplier: positive({ max: 10 }),
  nestSpawnIntervalMultiplier: positive({ max: 10 }),
  nestHealthMultiplier: positive({ max: 10 }),
  extractionThreatMultiplier: positive({ max: 10 }),
  maxConcurrentBreaches: count({ max: 64 }),
  reinforcementBudget: count({ max: 1000 }),
  maxSpawnsPerTick: count({ min: 1, max: MAX_ENEMIES }),
  enemyHealthMultiplier: positive({ max: 10 }),
  enemyDamageMultiplier: positive({ max: 10 }),
  convictKitId: id(),
});

const postureColliderSchema = obj({
  radius: positive({ max: 2 }), halfLength: positive({ max: 2 }), height: positive({ max: 3 }),
  lookHeight: positive({ max: 3 }), muzzleHeight: positive({ max: 3 }),
});

const postureActionsSchema = obj({
  sprint: bool(), aim: bool(), fire: bool(), reload: bool(), stim: bool(),
  switch: bool(), grenade: bool(), melee: bool(), resupply: bool(),
  dive: bool(), groundMove: bool(), standUp: bool(),
});

export const OPERATOR_SLIDE_LIMITS = {
  seconds: { min: .2, max: 3 },
  distance: { min: .1, max: 12 },
  decay: { min: 0, max: 1 },
  cooldownSeconds: { min: 0, max: 15 },
  minSpeed: { min: .1, max: 20 },
} as const;

const operatorSlideSchema = obj({
  seconds: num(OPERATOR_SLIDE_LIMITS.seconds), distance: num(OPERATOR_SLIDE_LIMITS.distance),
  decay: num(OPERATOR_SLIDE_LIMITS.decay), cooldownSeconds: num(OPERATOR_SLIDE_LIMITS.cooldownSeconds),
  minSpeed: num(OPERATOR_SLIDE_LIMITS.minSpeed),
});

export const movementSchema = obj({
  crouchSpeedMultiplier: positive({ max: 1 }), proneSpeedMultiplier: positive({ max: 1 }),
  supineSpeedMultiplier: positive({ max: 1 }), crouchSeconds: positive({ max: 3 }),
  slide: operatorSlideSchema,
  diveDistance: positive({ max: 12 }), diveSeconds: num({ min: .2, max: 3 }),
  diveCooldownSeconds: nonNegative({ max: 15 }), divePrepSeconds: nonNegative({ max: 2 }),
  diveArcHeight: positive({ max: 2 }), noDirection: oneOf(['forward', 'reject'] as const),
  backwardDotThreshold: num({ min: -.5, max: 0 }), proneGetUpSeconds: positive({ max: 5 }),
  supineGetUpSeconds: positive({ max: 5 }),
  proneTurnRadiansPerSecond: positive({ max: 12 }), supineTurnRadiansPerSecond: positive({ max: 12 }),
  groundAcceleration: positive({ max: 60 }), getUpColliderExponent: num({ min: 1, max: 4 }),
  proneMinPitch: num({ min: -.69, max: 0 }), supineMinPitch: num({ min: -.69, max: 0 }),
  proneMaxPitch: positive({ max: .69 }), supineMaxPitch: positive({ max: .69 }),
  groundAimHalfArc: positive({ max: Math.PI / 2 }),
  cameraDamping: positive({ max: 60 }), enemyAttackHalfHeight: positive({ max: 2 }),
  operatorMeleeHeight: positive({ max: 3 }),
  colliders: obj({
    STANDING: postureColliderSchema, CROUCHING: postureColliderSchema, DIVING: postureColliderSchema,
    PRONE: postureColliderSchema, SUPINE: postureColliderSchema, SLIDING: postureColliderSchema,
  }),
  actions: obj({
    STANDING: postureActionsSchema, CROUCHING: postureActionsSchema, DIVING: postureActionsSchema,
    PRONE: postureActionsSchema, SUPINE: postureActionsSchema, GETTING_UP: postureActionsSchema, SLIDING: postureActionsSchema,
  }),
});

/** One schema per data file. */
export const SOURCE_SCHEMAS = {
  manifest: manifestSchema,
  weapons: obj({ weapons: arr(weaponSchema, { min: 1 }) }),
  ammunition: ammunitionSchema,
  equipment: obj({
    grenades: arr(grenadeSchema, { min: 1 }),
    medical: arr(medicalSchema, { min: 1 }),
    melee: arr(meleeSchema, { min: 1 }),
    backpacks: arr(backpackSchema, { min: 1 }),
    armors: arr(bodyArmorSchema, { min: 1 }),
    loadouts: arr(loadoutSchema, { min: 1 }),
    resupply: resupplySchema,
  }),
  operators: obj({ operator: operatorSchema }),
  enemies: obj({ factions: arr(factionSchema, { min: 1 }), archetypes: arr(enemySchema, { min: 1 }) }),
  structures: obj({ nests: arr(nestSchema, { min: 1 }), vehicles: arr(vehicleSchema, { min: 1 }) }),
  swarm: swarmSchema,
  convicts: obj({ squad: convictSquadSchema, kits: arr(convictKitSchema, { min: 1 }) }),
  difficulty: obj({ difficulties: arr(difficultySchema, { min: 1 }) }),
  combat: combatSchema,
  movement: movementSchema,
} as const;

export type BalanceManifest = Infer<typeof manifestSchema>;
export type WeaponDefinition = Infer<typeof weaponSchema>;
export type CaliberDefinition = Infer<typeof caliberSchema>;
export type AmmoDefinition = Infer<typeof ammoSchema>;
export type AmmoModifier = AmmoDefinition['modifiers'][number];
export type ArmorRules = Infer<typeof ammunitionSchema>['armor'];
export type ArmorClassDefinition = ArmorRules['classes'][number];
export type EnemyResistances = EnemyArchetype['resistances'];
export type GrenadeDefinition = Infer<typeof grenadeSchema>;
export type MedicalDefinition = Infer<typeof medicalSchema>;
export type MeleeDefinition = Infer<typeof meleeSchema>;
export type SupplyContainerDefinition = Infer<typeof supplyContainerSchema>;
export type MovementDefinition = Infer<typeof movementSchema>;
export type OperatorSlideDefinition = Infer<typeof operatorSlideSchema>;
export type PostureCollider = Infer<typeof postureColliderSchema>;
export type CombatDefinition = Infer<typeof combatSchema>;
export type DamagePolicy = CombatDefinition['damagePolicy'];
export type WeaponAudioProfile = CombatDefinition['audio']['weapons']['rifle'];
export type EnvironmentAudioProfile = CombatDefinition['audio']['environments']['carrier'];
export type AudioEnvironmentId = keyof CombatDefinition['audio']['environments'];
export type LoadoutDefinition = Infer<typeof loadoutSchema>;
export type BackpackDefinition = Infer<typeof backpackSchema>;
export type BodyArmorDefinition = Infer<typeof bodyArmorSchema>;
export type WeaponFeed = WeaponDefinition['feed'];
/** Player-chosen loadout (Carrier › Ausrüstung). Every ID refers to the balance registry. */
export interface LoadoutSelection {
  readonly primaryWeaponId: string;
  readonly secondaryWeaponId: string;
  readonly meleeId: string;
  /** Tactical slot: grenade. */
  readonly grenadeId: string;
  readonly medicalId: string;
  readonly backpackId: string;
  readonly armorId: string;
}
export const LOADOUT_SELECTION_KEYS = ['primaryWeaponId', 'secondaryWeaponId', 'meleeId', 'grenadeId', 'medicalId', 'backpackId', 'armorId'] as const;
export type ResupplyRules = Infer<typeof resupplySchema>;
export type OperatorDefinition = Infer<typeof operatorSchema>;
export type FactionDefinition = Infer<typeof factionSchema>;
export type EnemyGameplay = Infer<typeof enemyGameplaySchema>;
export type EnemyArchetype = Infer<typeof enemySchema>;
export type NestDefinition = Infer<typeof nestSchema>;
export type VehicleDefinition = Infer<typeof vehicleSchema>;
export type SwarmDefinition = Infer<typeof swarmSchema>;
export type ConvictSquadDefinition = Infer<typeof convictSquadSchema>;
export type ConvictKitDefinition = Infer<typeof convictKitSchema>;
export type DifficultyDefinition = Infer<typeof difficultySchema>;
export type BalanceSources = { readonly [K in keyof typeof SOURCE_SCHEMAS]: Infer<(typeof SOURCE_SCHEMAS)[K]> };
export type WeaponSlot = WeaponDefinition['slot'];

/** File name of each source, used in error messages. */
export const SOURCE_FILES: Readonly<Record<keyof typeof SOURCE_SCHEMAS, string>> = {
  manifest: 'manifest.json', weapons: 'weapons.json', ammunition: 'ammunition.json', equipment: 'equipment.json', operators: 'operators.json',
  enemies: 'enemies.json', structures: 'structures.json', swarm: 'swarm.json', convicts: 'convicts.json',
  difficulty: 'difficulty.json', combat: 'combat.json', movement: 'movement.json',
};
