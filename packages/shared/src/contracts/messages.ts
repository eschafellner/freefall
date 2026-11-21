import type { PostureCommand, PostureState } from '../config/posture.ts';
import type { OperatorPosition } from '../config/postureGeometry.ts';
import type { PositionXZ } from '../config/movement.ts';
import type { HordeSize } from '../config/arena.ts';

import type { WeaponSlot } from '../definitions/combat.ts';
import type { ImpactSurface } from '../world/ImpactSurfaces.ts';
import type { HordeDirectorMetrics } from './mission.ts';

/** Client-requested actions. `life` must match the current life, so a request can never outlive a respawn. */
export type EquipmentCommand = WeaponSlot | 'grenade' | 'stim' | 'melee';
/** Running equipment action. `resupply` is started by the interaction key at an Albatross supply container. */
export type EquipmentAction = EquipmentCommand | 'resupply';

export interface EquipmentState {
  slot: WeaponSlot;
  /** Rounds in the loaded magazine of the holstered weapon. */
  inactiveAmmo: number;
  /** Full spare magazines per weapon slot. Partial magazines are never stored. */
  magazines: Record<WeaponSlot, number>;
  grenades: number;
  stims: number;
  action?: EquipmentAction;
  started: number;
  until: number;
  /** Confirmed release or strike tick for the current equipment animation. */
  actionAt?: number;
  stimResult?: 'completed' | 'cancelled';
  stimResultAt: number;
  /** First tick at which the next melee strike may start. */
  meleeReadyAt: number;
  /** Supply container in use while `action === 'resupply'`. */
  supplyId?: string;
}

/**
 * Authoritative reload state machine. The ammunition transaction (one spare magazine → full magazine, leftover
 * rounds discarded) happens exactly once, on the `insertAt` tick (`MAGAZINE_INSERTION`).
 */
export type ReloadPhase = 'READY' | 'RELOAD_START' | 'MAGAZINE_REMOVAL' | 'MAGAZINE_INSERTION' | 'RELOAD_COMPLETE' | 'RELOAD_INTERRUPTED';

export interface ReloadState {
  phase: ReloadPhase;
  slot: WeaponSlot;
  started: number;
  removalAt: number;
  insertAt: number;
  until: number;
  /** Tick of the last phase change. */
  at: number;
}

export interface GrenadeState {
  id: number;
  x: number;
  y: number;
  z: number;
  detonates: number;
  /** Launch sample carried by the first snapshots to interpolate into the flight. */
  release?: CombatPosition & { tick: number };
}

export const ARENA_ROOM = 'freefall';

export interface DiveIntent {
  forward: number;
  strafe: number;
  yaw: number;
}

export interface PlayerInput {
  seq: number;
  forward: number;
  strafe: number;
  yaw: number;
  pitch: number;
  sprint: boolean;
  fire: boolean;
  aim?: boolean;
  reload?: boolean;
  equipment?: EquipmentCommand;
  posture?: PostureCommand;
  /** Camera-relative axes and camera yaw sampled on the dive button edge. */
  diveIntent?: DiveIntent;
  life?: number;
}

export interface PlayerState {
  id: string;
  slot: number;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  ack: number;
  life: number;
  respawnTick: number;
  kills: number;
  // Optional at the wire boundary so a new client can still read older snapshots.
  pitch?: number;
  /** Last simulated upright heading, sent if it differs from the latest camera input. */
  bodyYaw?: number;
  posture?: PostureState;
  y?: number;
  motion?: number;
  ammo?: number;
  reloadUntil?: number;
  reload?: ReloadState;
  equipment?: EquipmentState;
}

export const PLAYER_MOTION = { sprint: 1, aim: 2 } as const;

export interface PlayersSnapshot {
  tick: number;
  host: string;
  players: PlayerState[];
  grenades?: GrenadeState[];
}

export type ImpactNormal = readonly [x: number, y: number, z: number];

export type ShotImpact =
  | { kind: 'world'; surface: ImpactSurface; normal: ImpactNormal }
  | { kind: 'enemy' | 'nest' | 'convict'; normal?: ImpactNormal }
  | { kind: 'operator'; life: number };

export interface ShotEvent {
  shooter: string;
  /** Authoritative combat tick, also used to deduplicate presentation. Older peers may omit it. */
  tick?: number;
  life?: number;
  tactical?: true;
  fromX: number;
  fromY: number;
  fromZ: number;
  /** Start of the validated ray when it differs from the muzzle (standing shoulder shots on flat maps). */
  traceFrom?: OperatorPosition;
  toX: number;
  toY: number;
  toZ: number;
  enemy: number;
  eliminated: boolean;
  nest?: number;
  /** Weapon slot that fired. Optional for older servers. */
  slot?: WeaponSlot;
  /** Presentation of the validated collision. A miss or protected target has no impact. */
  impact?: ShotImpact;
  /** Allied operator or convict intersected by this shot (may be protected). */
  ally?: string;
}

export type DamageSource = 'bullet' | 'explosion' | 'melee';

export interface ResupplyGrant {
  primaryMagazines: number;
  secondaryMagazines: number;
  grenades: number;
  stims: number;
}

export interface CombatPosition { x: number; y: number; z: number }

export interface ExplosionEvent extends CombatPosition {
  type: 'blast';
  tick: number;
  id: number;
  radius: number;
  owner?: string;
  grenade?: string;
  contact?: { surface: ImpactSurface; normal: ImpactNormal };
}

export interface GrenadeReleaseEvent extends CombatPosition {
  type: 'grenade-release';
  tick: number;
  id: number;
  owner: string;
}

export interface MeleeEvent {
  type: 'melee';
  tick: number;
  attacker: string;
  x: number;
  y?: number;
  z: number;
  yaw: number;
  enemy: number;
  ally?: string;
  damage: number;
  staggered: boolean;
  eliminated: boolean;
  contact?: CombatPosition;
}

/** Discrete combat events, broadcast once per tick when any occurred. Presentation and telemetry only. */
export type CombatEvent =
  | { type: 'enemy-hit'; tick: number; attack: string; enemy: number; target: string; life: number; amount: number;
      direction?: PositionXZ }
  | MeleeEvent
  | { type: 'friendly-fire'; tick: number; attacker: string; target: string; amount: number; source: DamageSource; self: boolean;
      life?: number; direction?: PositionXZ }
  | { type: 'reload'; tick: number; operator: string; slot: WeaponSlot; phase: 'RELOAD_START' | 'MAGAZINE_INSERTION' | 'RELOAD_INTERRUPTED';
      discarded: number }
  | { type: 'resupply'; tick: number; operator: string; container: string; charges: number; granted: ResupplyGrant }
  | ExplosionEvent
  | GrenadeReleaseEvent;

/** Per-run combat telemetry. Aggregated per weapon and system, no personal data. */
export interface CombatTelemetry {
  shots: Record<WeaponSlot, number>;
  hits: Record<WeaponSlot, number>;
  damage: Record<WeaponSlot, number>;
  magazinesUsed: Record<WeaponSlot, number>;
  roundsDiscarded: Record<WeaponSlot, number>;
  reloadsInterrupted: number;
  grenadesThrown: number;
  grenadeDamageEnemies: number;
  grenadeDamageNests: number;
  grenadeKills: number;
  meleeAttacks: number;
  meleeHits: number;
  meleeKills: number;
  staggers: number;
  friendlyFireDamage: Record<DamageSource, number>;
  selfDamage: number;
  convictFriendlyDamage: number;
  resupplyUses: number;
  refilled: ResupplyGrant;
  blasts: number;
  blastQueryMsTotal: number;
  blastQueryMsMax: number;
}

export interface EnemyAISample {
  id: number;
  state: string;
  target?: string;
  distance?: number;
  targetValid: boolean;
  cooldownTicks: number;
  combat?: { type: string; phase: string; range: number; angle: number; id?: string; remainingTicks?: number;
    result?: string; damage?: number; reservation?: number };
  destination?: PositionXZ;
  stuck?: boolean;
  unreachable?: boolean;
  recoveryAttempts?: number;
  waitingForClearance?: boolean;
  neighborCount?: number;
  separation?: PositionXZ;
  avoidance?: PositionXZ;
  steering?: PositionXZ;
  velocity?: PositionXZ;
}

export interface EnemyAIMetrics {
  targetMs: number;
  navigationMs: number;
  attackMs: number;
  attackValidationMs: number;
  attacks: { windup: number; active: number; recovery: number; startsPerSecond: number; hitsPerSecond: number };
  encounterMs: number;
  /** Perception and target scoring within encounterMs. */
  perceptionMs: number;
  steeringMs: number;
  neighborMs: number;
  collisionMs: number;
  fieldMs: number;
  stuckEpisodes: number;
  unreachableEpisodes: number;
  recoveries: number;
  recoveryAttempts: number;
  recoverySuccesses: number;
  recoveryFallbacks: number;
  pathRequests: number;
  fieldBuilds: number;
  fieldHits: number;
  deferredPaths: number;
  samples: EnemyAISample[];
}

export interface ServerMetrics {
  tickHz: number;
  lastMs: number;
  meanMs: number;
  p95Ms: number;
  droppedSteps: number;
  activeEnemies: number;
  activePlayers: number;
  hordeSize: HordeSize;
  /** Combat telemetry of the running battlefield (mission run or arena session). */
  combat?: CombatTelemetry;
  /** Bounded diagnostics from a local debug room. */
  enemyAI?: EnemyAIMetrics;
  hordeDirector?: HordeDirectorMetrics;
}
