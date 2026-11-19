import { FRAG, NET, PLAYER, SERVICE_PISTOL, SIDEARM_RESERVE, STIM, TEST_RIFLE } from '@freefall/shared';
import type { EquipmentCommand, EquipmentState, PlayerInput, PlayerState } from '@freefall/shared';
import { idleInput } from '../networking/input.ts';

export interface SimPlayer extends PlayerState {
  equipment: EquipmentState;
  pendingEquipment?: EquipmentCommand;
  input: PlayerInput;
  /** Received inputs not yet applied to movement. Each one advances movement exactly once. */
  moves: PlayerInput[];
  moveCredit: number;
  /** Adaptive jitter buffer: inputs held back after a short starvation. */
  moveCushion: number;
  moveWaiting: boolean;
  /** Tick at which the queue ran dry (-1 while inputs flow), and of the last cushion change. */
  moveStarvedAt: number;
  moveCushionAt: number;
  inputTick: number;
  fireAt: number;
  protectedUntil: number;
  activeInput: boolean;
  ammo: number;
  reloadUntil: number;
  reloadRequested: boolean;
  pitch: number;
}

/** Drops queued movement, e.g. on placement or disconnect. Acknowledges everything received so far. */
export function clearMoves(player: SimPlayer): void {
  player.moves.length = 0;
  player.moveWaiting = true;
  player.moveStarvedAt = -1;
  player.ack = player.input.seq;
}

export function freshEquipment(): EquipmentState {
  return { slot: 'primary', inactiveAmmo: SERVICE_PISTOL.magazineSize, pistolReserve: SIDEARM_RESERVE,
    grenades: FRAG.capacity, stims: STIM.capacity, started: 0, until: 0, stimResultAt: 0 };
}

export function cancelEquipment(player: SimPlayer, tick: number): void {
  if (player.equipment.action === 'stim') {
    player.equipment.stimResult = 'cancelled';
    player.equipment.stimResultAt = tick;
  }
  delete player.equipment.action;
  player.equipment.until = 0;
  player.pendingEquipment = undefined;
}

export function respawnPlayer(player: SimPlayer, tick: number): void {
  player.x = player.slot * 3 - 4.5;
  player.z = 5;
  player.hp = PLAYER.health;
  player.life++;
  player.respawnTick = 0;
  player.fireAt = tick;
  player.pitch = player.input.pitch;
  player.equipment = freshEquipment();
  player.pendingEquipment = undefined;
  player.ammo = TEST_RIFLE.magazineSize;
  player.reloadUntil = 0;
  player.reloadRequested = false;
  player.protectedUntil = tick + Math.ceil(PLAYER.protectionSeconds * NET.tickHz);
}

export function createPlayer(id: string, slot: number, tick: number): SimPlayer {
  const player: SimPlayer = {
    id, slot, x: 0, z: 0, yaw: 0, hp: 0, ack: 0, life: 0, respawnTick: 0, kills: 0,
    equipment: freshEquipment(), input: idleInput(), moves: [], moveCredit: 0, moveCushion: 0, moveWaiting: true, moveStarvedAt: -1, moveCushionAt: 0, inputTick: -Infinity, fireAt: 0, protectedUntil: 0, activeInput: false,
    ammo: 0, reloadUntil: 0, reloadRequested: false, pitch: 0,
  };
  respawnPlayer(player, tick);
  return player;
}
