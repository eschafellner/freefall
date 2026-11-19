import { BASE_LOADOUT, NET, PLAYER, createRecoilState, newPosture, resetRecoil } from '@freefall/shared';
import type {
  EffectiveLoadout, EquipmentCommand, EquipmentState, PlayerInput, PlayerState, PostureState, RecoilState, ReloadState,
} from '@freefall/shared';
import { idleInput } from '../networking/input.ts';

export interface SimPlayer extends PlayerState {
  y: number;
  posture: PostureState;
  /** Effective, immutable weapon and equipment stats. Resolved once per configuration, never per tick. */
  loadout: EffectiveLoadout;
  equipment: EquipmentState;
  pendingEquipment?: EquipmentCommand;
  /** Supply container requested through the interaction key, processed on the next tick. */
  pendingResupply?: string;
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
  /** Mirrors `reload.until` while a reload runs, 0 otherwise. Kept for older clients and animation. */
  reloadUntil: number;
  reload: ReloadState;
  reloadRequested: boolean;
  /** Server-authoritative recoil and bloom of the active weapon. */
  recoil: RecoilState;
  pitch: number;
}

export const readyReload = (tick = 0): ReloadState =>
  ({ phase: 'READY', slot: 'primary', started: 0, removalAt: 0, insertAt: 0, until: 0, at: tick });

/** True while the reload state machine blocks firing (start, removal, insertion, completion). */
export const reloading = (player: SimPlayer): boolean =>
  player.reload.phase !== 'READY' && player.reload.phase !== 'RELOAD_INTERRUPTED';

/** Drops queued movement, e.g. on placement or disconnect. Acknowledges everything received so far. */
export function clearMoves(player: SimPlayer): void {
  player.moves.length = 0;
  player.moveWaiting = true;
  player.moveStarvedAt = -1;
  player.ack = player.input.seq;
}

/** Full resupply as defined by `equipment.json › resupply` (mission start and respawn). */
export function freshEquipment(loadout: EffectiveLoadout = BASE_LOADOUT): EquipmentState {
  const { primary, secondary } = loadout.weapons;
  return {
    slot: 'primary', inactiveAmmo: secondary.magazineSize,
    magazines: { primary: primary.reserveMagazines, secondary: secondary.reserveMagazines },
    grenades: loadout.grenade.capacity, stims: loadout.medical.maxCharges, started: 0, until: 0, stimResultAt: 0, meleeReadyAt: 0,
  };
}

/** Restores the full mission-start loadout, including the loaded magazine of the primary weapon. */
export function refillPlayer(player: SimPlayer): void {
  player.equipment = freshEquipment(player.loadout);
  player.ammo = player.loadout.weapons.primary.magazineSize;
  player.reload = readyReload(player.reload.at);
  player.reloadUntil = 0;
  player.reloadRequested = false;
  resetRecoil(player.recoil);
}

export function cancelEquipment(player: SimPlayer, tick: number): void {
  if (player.equipment.action === 'stim') {
    player.equipment.stimResult = 'cancelled';
    player.equipment.stimResultAt = tick;
  }
  delete player.equipment.action;
  delete player.equipment.supplyId;
  player.equipment.until = 0;
  player.pendingEquipment = undefined;
  player.pendingResupply = undefined;
}

export function respawnPlayer(player: SimPlayer, tick: number): void {
  player.x = player.slot * 3 - 4.5;
  player.z = 5;
  player.y = 0;
  player.posture = newPosture(player.yaw);
  player.hp = player.loadout.maxHealth;
  player.life++;
  player.respawnTick = 0;
  player.fireAt = tick;
  player.pitch = player.input.pitch;
  refillPlayer(player);
  player.pendingEquipment = undefined;
  player.pendingResupply = undefined;
  player.protectedUntil = tick + Math.ceil(PLAYER.protectionSeconds * NET.tickHz);
}

export function createPlayer(id: string, slot: number, tick: number, loadout: EffectiveLoadout = BASE_LOADOUT): SimPlayer {
  const player: SimPlayer = {
    id, slot, x: 0, y: 0, z: 0, posture: newPosture(), yaw: 0, hp: 0, ack: 0, life: 0, respawnTick: 0, kills: 0, loadout,
    equipment: freshEquipment(loadout), input: idleInput(), moves: [], moveCredit: 0, moveCushion: 0, moveWaiting: true, moveStarvedAt: -1, moveCushionAt: 0, inputTick: -Infinity, fireAt: 0, protectedUntil: 0, activeInput: false,
    ammo: 0, reloadUntil: 0, reload: readyReload(tick), reloadRequested: false, recoil: createRecoilState(), pitch: 0,
  };
  respawnPlayer(player, tick);
  return player;
}
