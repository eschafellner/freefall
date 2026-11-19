import type { PostureCommand, PostureState } from '../config/posture.ts';
import type { HordeSize } from '../config/arena.ts';

import type { WeaponSlot } from '../definitions/combat.ts';

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
}

export const ARENA_ROOM = 'freefall';

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

export interface ShotEvent {
  shooter: string;
  tactical?: true;
  fromX: number;
  fromY: number;
  fromZ: number;
  toX: number;
  toY: number;
  toZ: number;
  enemy: number;
  eliminated: boolean;
  nest?: number;
  /** Weapon slot that fired. Optional for older servers. */
  slot?: WeaponSlot;
  /** Allied operator or convict hit by this shot (friendly fire). */
  ally?: string;
}

export type DamageSource = 'bullet' | 'explosion' | 'melee';

export interface ResupplyGrant {
  primaryMagazines: number;
  secondaryMagazines: number;
  grenades: number;
  stims: number;
}

/** Discrete combat events, broadcast once per tick when any occurred. Presentation and telemetry only. */
export type CombatEvent =
  | { type: 'melee'; tick: number; attacker: string; x: number; z: number; yaw: number; enemy: number; ally?: string;
      damage: number; staggered: boolean; eliminated: boolean }
  | { type: 'friendly-fire'; tick: number; attacker: string; target: string; amount: number; source: DamageSource; self: boolean }
  | { type: 'reload'; tick: number; operator: string; slot: WeaponSlot; phase: 'RELOAD_START' | 'MAGAZINE_INSERTION' | 'RELOAD_INTERRUPTED';
      discarded: number }
  | { type: 'resupply'; tick: number; operator: string; container: string; charges: number; granted: ResupplyGrant }
  | { type: 'blast'; tick: number; id: number; x: number; y: number; z: number; radius: number };

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
}
