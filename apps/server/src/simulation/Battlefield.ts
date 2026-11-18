import { MAX_PLAYERS, NET, movePlayer } from '@freefall/shared';
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
        player.ack = player.input.seq;
        if (player.hp > 0 && player.activeInput) {
          player.yaw = player.input.yaw;
          player.pitch = player.input.pitch;
          if (this.canMove(player)) {
            movePlayer(player, player.input, 1 / NET.tickHz, this.movementWorld, this.movementBoundary(player));
          }
        }
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
