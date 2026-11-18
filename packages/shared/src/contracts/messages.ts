import type { HordeSize } from '../config/arena.ts';

import type { WeaponSlot } from '../definitions/combat.ts';

export type EquipmentCommand = WeaponSlot | 'grenade' | 'stim';

export interface EquipmentState {
  slot: WeaponSlot;
  inactiveAmmo: number;
  pistolReserve: number;
  grenades: number;
  stims: number;
  action?: EquipmentCommand;
  started: number;
  until: number;
  stimResult?: 'completed' | 'cancelled';
  stimResultAt: number;
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
  motion?: number;
  ammo?: number;
  reloadUntil?: number;
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
  fromX: number;
  fromY: number;
  fromZ: number;
  toX: number;
  toY: number;
  toZ: number;
  enemy: number;
  eliminated: boolean;
  nest?: number;
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
}
