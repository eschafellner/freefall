import { MAX_PLAYERS, MOVEMENT_INPUT, NET, movePlayer } from '@freefall/shared';
import type { GrenadeState, MovementBoundary, ShotEvent, WorldDefinition } from '@freefall/shared';
import { HordeManager } from '../ecs/HordeManager.ts';
import { UniformGrid } from '../ecs/UniformGrid.ts';
import { validateInput } from '../networking/input.ts';
import { movementSystem, steeringSystem, targetingSystem } from '../systems/horde.ts';
import type { EnemyDestination } from '../systems/horde.ts';
import { fireWeapon, meleeSystem, updateReload } from '../systems/combat.ts';
import type { CombatTargets, SecondaryTarget } from '../systems/combat.ts';
import { createPlayer, respawnPlayer } from './Player.ts';
import type { SimPlayer } from './Player.ts';

import { updateEquipment } from '../systems/equipment.ts';
import { Grenades } from '../systems/grenades.ts';

export function seededRandom(seed: number): () => number {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

export class Battlefield {
  readonly horde = new HordeManager();
  readonly players: (SimPlayer | undefined)[] = Array.from({ length: MAX_PLAYERS });
  readonly grenades = new Grenades();
  readonly shots: ShotEvent[] = [];
  protected readonly random: () => number;
  protected destination?: EnemyDestination;
  protected combatTargets?: CombatTargets;
  protected secondaryTarget?: SecondaryTarget;
  private readonly grid: UniformGrid;
  private readonly ray = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 };
  tick = 0;

  readonly world?: WorldDefinition;

  constructor(seed: number, world?: WorldDefinition) {
    this.world = world;
    this.random = seededRandom(seed);
    this.grid = new UniformGrid(world?.half);
  }

  addPlayer(id: string): SimPlayer {
    const slot = this.players.indexOf(undefined);
    if (slot === -1) throw new Error('Battlefield is full');
    const player = createPlayer(id, slot, this.tick);
    this.players[slot] = player;
    return player;
  }

  removePlayer(id: string): void {
    const slot = this.players.findIndex((player) => player?.id === id);
    if (slot !== -1) this.players[slot] = undefined;
  }

  receiveInput(id: string, payload: unknown): boolean {
    const player = this.players.find((entry) => entry?.id === id);
    if (!player) return false;
    const input = validateInput(payload, player.input.seq);
    if (!input) return false;
    if (this.simulatesCombat && player.hp > 0 && input.life === player.life && input.equipment) {
      player.pendingEquipment ??= input.equipment;
    }
    if (this.simulatesCombat && player.hp > 0 && input.reload && !player.input.reload) player.reloadRequested = true;
    player.input = input;
    player.inputTick = this.tick;
    player.moves.push(input);
    if (player.moves.length > MOVEMENT_INPUT.queue) player.moves.shift();
    return true;
  }

  protected get respawns(): boolean { return true; }
  protected get simulatesCombat(): boolean { return true; }
  protected get simulatesMovement(): boolean { return this.simulatesCombat; }
  protected get movementWorld(): WorldDefinition | undefined { return this.world; }
  protected canMove(_player: SimPlayer): boolean { return true; }
  protected movementBoundary(_player: SimPlayer): MovementBoundary | undefined { return; }
  protected prepareTick(): void {}
  protected onBlast(_g: GrenadeState, _owner: string): void {}
  protected onShot(_shot: ShotEvent): void {}
  protected finishTick(): void {}
  protected updateTargets(): void { targetingSystem(this.horde, this.players, this.tick); }

  /**
   * Applies queued movement inputs in order, each exactly once. Prediction replays the same inputs, so the
   * acknowledged position matches the client unless the world disagrees.
   *
   * Steady state is one input per tick, which keeps remote operators uniform. A tick without a queued input
   * (network or frame jitter) grows a small cushion: movement resumes once that many extra inputs wait, so a
   * jittery link does not alternate between zero and two steps. The cushion shrinks again after a quiet
   * period. A backlog above cushion + MOVEMENT_INPUT.backlog drains with the banked budget, which bounds the
   * average rate to the tick rate.
   */
  private consumeMoves(player: SimPlayer): void {
    player.moveCredit = Math.min(MOVEMENT_INPUT.budget, player.moveCredit + 1);
    if (!player.moves.length) {
      if (!player.moveWaiting) player.moveStarvedAt = this.tick;
      player.moveWaiting = true;
      return;
    }
    if (player.moveWaiting && player.moveStarvedAt >= 0) {
      // The stream resumed. A short gap was jitter: buffer one more input from now on.
      if (this.tick - player.moveStarvedAt <= MOVEMENT_INPUT.jitterGapTicks) {
        player.moveCushion = Math.min(MOVEMENT_INPUT.maxCushion, player.moveCushion + 1);
        player.moveCushionAt = this.tick;
      }
      player.moveStarvedAt = -1;
    } else if (player.moveCushion && this.tick - player.moveCushionAt > MOVEMENT_INPUT.cushionDecayTicks) {
      player.moveCushion--;
      player.moveCushionAt = this.tick;
    }
    if (player.moveWaiting && player.moves.length <= player.moveCushion &&
        this.tick - player.inputTick <= NET.inputTimeoutTicks) return;
    player.moveWaiting = false;
    let consumed = 0;
    while (player.moves.length && player.moveCredit >= 1 &&
        (!consumed || player.moves.length > player.moveCushion + MOVEMENT_INPUT.backlog)) {
      const move = player.moves.shift()!;
      player.moveCredit--;
      consumed++;
      player.ack = move.seq;
      if (player.hp > 0 && this.canMove(player)) {
        movePlayer(player, move, 1 / NET.tickHz, this.movementWorld, this.movementBoundary(player));
      }
    }
  }

  private readonly launch = (p: SimPlayer) => this.grenades.launch(p, this.tick);
  private readonly blast = (g: GrenadeState, owner: string) => this.onBlast(g, owner);

  step(): void {
    this.tick++;
    this.shots.length = 0;
    this.prepareTick();
    if (this.simulatesMovement) {
      for (const player of this.players) {
        if (!player) continue;
        if (this.respawns && player.hp <= 0 && this.tick >= player.respawnTick) respawnPlayer(player, this.tick);
        player.activeInput = this.tick - player.inputTick <= NET.inputTimeoutTicks;
        if (player.hp > 0 && player.activeInput) {
          player.yaw = player.input.yaw;
          player.pitch = player.input.pitch;
        }
        this.consumeMoves(player);
      }
    }
    if (this.simulatesCombat) {
      this.updateTargets();
      steeringSystem(this.horde, this.grid, this.players, this.tick, this.destination);
      movementSystem(this.horde, this.movementWorld);
      for (const player of this.players) {
        if (!player) continue;
        if (!this.canMove(player)) {
          player.activeInput = false;
          player.pendingEquipment = undefined;
        }
        updateEquipment(player, this.tick, this.launch);
        updateReload(player, this.tick);
        const shot = fireWeapon(this.horde, player, this.ray, this.tick, this.movementWorld, this.combatTargets);
        if (!shot) continue;
        this.shots.push(shot);
        this.onShot(shot);
      }
      this.grenades.update(this.tick, this.horde, this.grid, this.movementWorld, this.players, this.blast);
      meleeSystem(this.horde, this.players, this.tick, this.movementWorld, this.respawns, this.secondaryTarget);
    }
    this.finishTick();
  }
}
