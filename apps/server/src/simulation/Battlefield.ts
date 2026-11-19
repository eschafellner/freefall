import { BALANCE, ENEMY_TYPES, MAX_PLAYERS, MOVEMENT_INPUT, NET, advancePosture, applyPostureInput, resolveLoadout } from '@freefall/shared';
import type {
  BalanceRegistry, CombatEvent, EffectiveGrenade, EffectiveLoadout, EnemyGameplay, GrenadeState, MovementDefinition, MovementBoundary, ShotEvent,
  WorldDefinition,
} from '@freefall/shared';
import { HordeManager } from '../ecs/HordeManager.ts';
import { StaggerComponent } from '../ecs/StaggerComponent.ts';
import { UniformGrid } from '../ecs/UniformGrid.ts';
import { validateInput } from '../networking/input.ts';
import { movementSystem, steeringSystem, targetingSystem } from '../systems/horde.ts';
import type { EnemyDestination } from '../systems/horde.ts';
import { fireWeapon, interruptReload, meleeStrike, meleeSystem, switchWeaponState, updateReload } from '../systems/combat.ts';
import type { AllyTarget, CombatContext, CombatTargets, SecondaryTarget } from '../systems/combat.ts';
import { createPlayer, respawnPlayer } from './Player.ts';
import type { SimPlayer } from './Player.ts';

import { updateEquipment } from '../systems/equipment.ts';
import type { EquipmentHooks, ResupplyHooks } from '../systems/equipment.ts';
import { Grenades } from '../systems/grenades.ts';
import { CombatStats } from '../systems/telemetry.ts';

export function seededRandom(seed: number): () => number {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

export class Battlefield {
  readonly horde = new HordeManager();
  /** Melee stagger per horde slot (separate component, the HordeManager is part of the Schabe baseline). */
  readonly stagger = new StaggerComponent();
  readonly players: (SimPlayer | undefined)[] = Array.from({ length: MAX_PLAYERS });
  readonly grenades = new Grenades();
  readonly shots: ShotEvent[] = [];
  /** Combat events of the current tick (melee, friendly fire, reload, resupply, blasts). */
  readonly combatEvents: CombatEvent[] = [];
  /** Aggregated combat telemetry. Plain counters, see systems/telemetry.ts. */
  readonly stats = new CombatStats();
  protected readonly random: () => number;
  protected destination?: EnemyDestination;
  protected combatTargets?: CombatTargets;
  protected secondaryTarget?: SecondaryTarget;
  private readonly grid: UniformGrid;
  private readonly ray = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 };
  tick = 0;

  readonly world?: WorldDefinition;
  /** Validated, immutable balance data. Loaded once at server start. */
  readonly registry: BalanceRegistry;
  /** Effective operator loadout, resolved once when the battlefield is configured. */
  readonly loadout: EffectiveLoadout;
  /** Effective enemy gameplay by wire type. Missions replace it with their difficulty-resolved snapshot. */
  protected enemyStats: readonly EnemyGameplay[] = ENEMY_TYPES;

  constructor(seed: number, world?: WorldDefinition, registry: BalanceRegistry = BALANCE) {
    this.world = world;
    this.registry = registry;
    this.loadout = resolveLoadout(registry);
    this.random = seededRandom(seed);
    this.grid = new UniformGrid(world?.half);
    this.combat = {
      players: this.players, allies: () => this.allies(), random: this.random, stats: this.stats, events: this.combatEvents,
      respawns: true, grid: this.grid, stagger: this.stagger, policy: this.loadout.damagePolicy,
    };
    this.hooks = {
      launch: (p) => this.grenades.launch(p, this.tick, this.combat, this.movementBalance),
      strike: (p) => {
        const event = meleeStrike(this.horde, p, this.tick, this.movementWorld, this.combat, this.movementBalance);
        if (event) this.combatEvents.push(event);
      },
      interruptReload: (p) => interruptReload(p, this.tick, this.combat),
      switched: (p) => switchWeaponState(p),
    };
  }

  /** Shared combat services for hitscan, melee and grenades. Built once, never per tick. */
  protected readonly combat: CombatContext;
  private readonly hooks: EquipmentHooks;
  /** Allied non-operator targets reachable by friendly fire (convicts in missions). */
  protected allies(): readonly AllyTarget[] { return []; }
  /** Albatross resupply. Only missions provide containers. */
  protected get resupply(): ResupplyHooks | undefined { return undefined; }

  addPlayer(id: string): SimPlayer {
    const slot = this.players.indexOf(undefined);
    if (slot === -1) throw new Error('Battlefield is full');
    const player = createPlayer(id, slot, this.tick, this.loadout);
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
  get movementBalance(): MovementDefinition { return this.registry.movement; }
  protected get movementWorld(): WorldDefinition | undefined { return this.world; }
  protected canMove(_player: SimPlayer): boolean { return true; }
  protected movementBoundary(_player: SimPlayer): MovementBoundary | undefined { return; }
  protected prepareTick(): void {}
  protected onBlast(_g: GrenadeState, _owner: string, _grenade: EffectiveGrenade): void {}
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
        const input = move.posture && move.life !== player.life ? { ...move, posture: undefined } : move;
        applyPostureInput(player, player.posture, input, this.tick, this.movementBalance,
          this.movementWorld, this.movementBoundary(player), this.registry.operator);
      }
    }
  }

  private readonly blast = (g: GrenadeState, owner: string, grenade: EffectiveGrenade) => this.onBlast(g, owner, grenade);

  step(): void {
    this.tick++;
    this.shots.length = 0;
    this.combatEvents.length = 0;
    this.combat.respawns = this.respawns;
    this.hooks.resupply = this.resupply;
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
        if (player.hp > 0) advancePosture(player, player.posture, this.tick, this.movementBalance,
          this.movementWorld, this.movementBoundary(player), this.canMove(player));
        this.consumeMoves(player);
      }
    }
    if (this.simulatesCombat) {
      this.updateTargets();
      steeringSystem(this.horde, this.grid, this.players, this.tick, this.destination, this.stagger);
      movementSystem(this.horde, this.movementWorld, this.tick, this.stagger);
      for (const player of this.players) {
        if (!player) continue;
        if (!this.canMove(player)) {
          player.activeInput = false;
          player.pendingEquipment = undefined;
        }
        updateEquipment(player, this.tick, this.hooks, this.movementBalance);
        updateReload(player, this.tick, this.combat, this.movementBalance);
        const shot = fireWeapon(this.horde, player, this.ray, this.tick, this.movementWorld, this.combatTargets, this.combat, this.movementBalance);
        if (!shot) continue;
        this.shots.push(shot);
        this.onShot(shot);
      }
      this.grenades.update(this.tick, this.horde, this.grid, this.movementWorld, this.players, this.blast, this.combat, this.movementBalance);
      meleeSystem(this.horde, this.players, this.tick, this.movementWorld, this.respawns, this.secondaryTarget, this.enemyStats, this.stagger, this.movementBalance);
    }
    this.finishTick();
  }
}
