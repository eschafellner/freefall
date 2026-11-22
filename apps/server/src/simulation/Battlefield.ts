import { ARENA_HALF, BALANCE, ENEMY_TYPES, MAX_PLAYERS, MOVEMENT_INPUT, NET, advancePosture, allowsPostureAction,
  applyPostureInput, resolveLoadout } from '@freefall/shared';
import type {
  BalanceRegistry, CombatEvent, EffectiveGrenade, EffectiveLoadout, EnemyGameplay, EnemyAIMetrics, EnemyAISample, GrenadeState, MovementDefinition, MovementBoundary, ShotEvent,
  WorldDefinition,
} from '@freefall/shared';
import { EnemyApproach } from '../ecs/EnemyApproach.ts';
import { EnemyCombat } from '../ecs/EnemyCombat.ts';
import { ENEMY_EDGE_MARGIN, EnemyNavigation } from '../ecs/EnemyNavigation.ts';
import { HordeManager } from '../ecs/HordeManager.ts';
import { StaggerComponent } from '../ecs/StaggerComponent.ts';
import { UniformGrid } from '../ecs/UniformGrid.ts';
import { validateInput } from '../networking/input.ts';
import { movementSystem, steeringSystem } from '../systems/horde.ts';
import type { EnemyDestination, HordeSteering } from '../systems/horde.ts';
import { GroundNavigation } from '../mission/GroundNavigation.ts';
import { ArenaTargeting, validOperator } from '../systems/enemyTargeting.ts';
import { fireWeapon, interruptReload, meleeStrike, switchWeaponState, updateReload } from '../systems/combat.ts';
import type { AllyTarget, CombatContext, CombatTargets, SecondaryTarget } from '../systems/combat.ts';
import { createPlayer, respawnPlayer } from './Player.ts';
import type { SimPlayer } from './Player.ts';

import { updateEquipment } from '../systems/equipment.ts';
import type { EquipmentHooks, ResupplyHooks } from '../systems/equipment.ts';
import { Grenades } from '../systems/grenades.ts';
import { CombatStats, MovementStats } from '../systems/telemetry.ts';

export function seededRandom(seed: number): () => number {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

export class Battlefield {
  readonly horde = new HordeManager();
  readonly navigation: EnemyNavigation;
  readonly enemyCombat: EnemyCombat;
  profileEnemyAI = false;
  readonly enemyAITime = { targetMs: 0, navigationMs: 0, attackMs: 0, encounterMs: 0, perceptionMs: 0,
    steeringMs: 0, neighborMs: 0, collisionMs: 0, fieldMs: 0 };
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
  protected fallbackDestination?: EnemyDestination;
  protected combatTargets?: CombatTargets;
  protected secondaryTarget?: SecondaryTarget;
  private grid: UniformGrid;
  private readonly steering: HordeSteering;
  private planner?: GroundNavigation;
  private readonly targeting = new ArenaTargeting();
  private lastEnemyMetrics = { tick: 0, starts: 0, hits: 0 };
  private readonly ray = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 };
  tick = 0;

  readonly world?: WorldDefinition;
  /** Validated, immutable balance data. Loaded once at server start. */
  readonly registry: BalanceRegistry;
  /** Effective operator loadout, resolved once when the battlefield is configured. */
  readonly loadout: EffectiveLoadout;
  /** Effective enemy gameplay by wire type. Missions replace it with their difficulty-resolved snapshot. */
  protected enemyStats: readonly EnemyGameplay[];

  constructor(seed: number, world?: WorldDefinition, registry: BalanceRegistry = BALANCE) {
    this.world = world;
    this.registry = registry;
    this.loadout = resolveLoadout(registry);
    this.random = seededRandom(seed);
    this.grid = new UniformGrid(world?.half);
    this.enemyStats = registry.enemiesByWireType.map((entry, type) => entry?.gameplay ?? ENEMY_TYPES[type]);
    const config = registry.swarm.hordeAi;
    this.navigation = new EnemyNavigation(config);
    const approach = new EnemyApproach(config, registry.enemy(registry.swarm.patrols.archetypeId).gameplay.meleeRange);
    this.enemyCombat = new EnemyCombat(registry.swarm.meleeAttack, approach, this.navigation, this.stagger);
    this.steering = {
      config, navigation: this.navigation, stagger: this.stagger,
      approach, combat: this.enemyCombat,
      edge: (world?.half ?? ARENA_HALF) - ENEMY_EDGE_MARGIN, stats: this.enemyStats, timing: this.enemyAITime, profile: false,
    };
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

  protected setCombatBounds(half: number): void {
    if (this.steering.edge === half - ENEMY_EDGE_MARGIN) return;
    this.grid = this.combat.grid = new UniformGrid(half);
    this.steering.edge = half - ENEMY_EDGE_MARGIN;
  }

  /** Shared combat services for hitscan, melee and grenades. Built once, never per tick. */
  protected readonly combat: CombatContext;
  private readonly hooks: EquipmentHooks;
  /** Allied non-operator targets reachable by friendly fire (convicts in missions). */
  protected allies(): readonly AllyTarget[] { return []; }
  /** Albatross resupply. Only missions provide containers. */
  protected get resupply(): ResupplyHooks | undefined { return undefined; }

  enableMovementProfiling(): MovementStats { return this.combat.movementStats ??= new MovementStats(); }

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
    const input = validateInput(payload, player.lastInputSeq);
    if (!input) return false;
    player.lastInputSeq = input.seq;
    if (input.life === undefined || input.life === player.life) {
      if (this.simulatesCombat && player.hp > 0) {
        if (input.equipment) player.pendingEquipment ??= input.equipment;
        if (input.reload && !player.input.reload) player.reloadRequested = true;
      }
      player.input = input;
      player.inputTick = this.tick;
    }
    player.moves.push(input);
    if (player.moves.length > MOVEMENT_INPUT.queue) {
      // Keep one-shot commands on their original input so a queued dive retains its axes, camera and ID.
      const expendable = player.moves.findIndex((move, i) => !move.posture && i < player.moves.length - 1);
      const index = expendable < 0 ? 0 : expendable;
      if (player.moves[index].posture && this.combat.movementStats) this.combat.movementStats.droppedCommands++;
      player.moves.splice(index, 1);
    }
    return true;
  }

  protected get respawns(): boolean { return true; }
  protected get simulatesCombat(): boolean { return true; }
  protected get simulatesMovement(): boolean { return this.simulatesCombat; }
  get movementBalance(): MovementDefinition { return this.registry.movement; }
  protected get movementWorld(): WorldDefinition | undefined { return this.world; }
  protected get groundNavigation(): GroundNavigation | undefined {
    if (this.world) return this.planner ??= new GroundNavigation(this.world, this.registry.swarm.hordeAi);
  }
  protected canMove(_player: SimPlayer): boolean { return true; }
  protected movementBoundary(_player: SimPlayer): MovementBoundary | undefined { return; }
  protected prepareTick(): void {}
  protected onBlast(_g: GrenadeState, _owner: string, _grenade: EffectiveGrenade): void {}
  protected onShot(_shot: ShotEvent): void {}
  protected finishTick(): void {}
  protected readonly targetPlayers: readonly (SimPlayer | undefined)[] = this.players;
  protected updateTargets(): void { this.targeting.update(this.horde, this.targetPlayers, this.tick, this.registry.swarm.hordeAi); }

  protected enemyState(_slot: number): string | undefined { return undefined; }

  enemyAIMetrics(): EnemyAIMetrics {
    const horde = this.horde;
    const samples: EnemyAISample[] = [];
    for (let i = 0; i < Math.min(4, horde.count); i++) {
      const slot = horde.active[i];
      const player = this.targetPlayers[horde.target[slot]];
      const target = validOperator(player) ? player : this.secondaryTarget?.(slot);
      const cooldownTicks = Math.max(0, horde.attackAt[slot] - this.tick);
      const nav = this.navigation.getStatus(horde, slot);
      const state = this.tick < this.stagger.active(horde, slot) ? 'STAGGERED' :
        this.enemyState(slot) ?? (target ? (cooldownTicks ? 'COOLDOWN' : 'PURSUING') : 'IDLE');
      samples.push({
        id: horde.id[slot], state, target: target ? ('id' in target ? String(target.id) : 'Albatross') : undefined,
        distance: target ? Math.hypot(horde.x[slot] - target.x, horde.z[slot] - target.z) : undefined,
        targetValid: !!target && target.hp > 0, cooldownTicks, ...nav,
        combat: this.enemyCombat.sample(horde, slot, this.tick, this.enemyStats[horde.type[slot]]),
      });
    }
    const planner = this.steering.planner?.metrics;
    const combat = this.enemyCombat;
    const rate = NET.tickHz / Math.max(1, this.tick - this.lastEnemyMetrics.tick);
    const startsPerSecond = (combat.totals.starts - this.lastEnemyMetrics.starts) * rate;
    const hitsPerSecond = (combat.totals.hits - this.lastEnemyMetrics.hits) * rate;
    this.lastEnemyMetrics = { tick: this.tick, starts: combat.totals.starts, hits: combat.totals.hits };
    return {
      ...this.enemyAITime, samples, stuckEpisodes: this.navigation.stuckEpisodes,
      attackValidationMs: combat.validationMs,
      attacks: { windup: combat.windingUp, active: combat.active, recovery: combat.recovering, startsPerSecond, hitsPerSecond },
      unreachableEpisodes: this.navigation.unreachableEpisodes, recoveries: this.navigation.recoveries,
      recoveryAttempts: this.navigation.recoveryAttempts, recoverySuccesses: this.navigation.recoverySuccesses,
      recoveryFallbacks: this.navigation.recoveryFallbacks, pathRequests: planner?.requests ?? 0,
      fieldBuilds: planner?.builds ?? 0, fieldHits: planner?.hits ?? 0, deferredPaths: planner?.deferred ?? 0,
    };
  }

  /**
   * Applies queued movement inputs in order, each exactly once. Prediction replays the same inputs, so the
   * acknowledged position matches the client unless the world disagrees.
   *
   * Steady state is one input per tick, which keeps remote operators uniform. A tick without a queued input
   * (network or frame jitter) grows a small cushion: movement resumes once that many extra inputs wait, so a
   * jittery link does not alternate between zero and two steps. The cushion shrinks again after a quiet
   * period. A backlog above cushion + MOVEMENT_INPUT.backlog is drained actively: up to MOVEMENT_INPUT.budget
   * inputs per tick while banked credit lasts. Credit grows by one per tick (plus a small clock-drift allowance),
   * which bounds the average rate to the tick rate. Extra inputs of a tick never carry a posture command, so the
   * posture machine sees at most one command per tick, exactly like the client replay.
   * Inputs of an earlier life (sent before the client learned about a respawn or placement) are acknowledged
   * but do not move the operator; the client drops them from its prediction as well.
   */
  private consumeMoves(player: SimPlayer, stats?: MovementStats): void {
    player.moveCredit = Math.min(MOVEMENT_INPUT.credit, player.moveCredit + 1 + MOVEMENT_INPUT.drift);
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
    // These transition ticks accept no locomotion. Preserve later queued moves for the first mobile tick.
    const { posture } = player;
    const landing = posture.started === this.tick && (posture.from === 'DIVING' || posture.from === 'SLIDING');
    const budget = landing ? 1 : MOVEMENT_INPUT.budget;
    let consumed = 0;
    while (player.moves.length && player.moveCredit >= 1 && consumed < budget &&
        (!consumed || (player.moves.length > player.moveCushion + MOVEMENT_INPUT.backlog && !player.moves[0].posture))) {
      const move = player.moves.shift()!;
      player.moveCredit--;
      consumed++;
      player.ack = move.seq;
      if (player.hp > 0 && this.canMove(player) && (move.life === undefined || move.life === player.life)) {
        const from = player.posture.current;
        applyPostureInput(player, player.posture, move, this.tick, this.movementBalance,
          this.movementWorld, this.movementBoundary(player), this.registry.operator, player.loadout.slide);
        const acceptedDive = player.posture.dive?.id === move.seq && player.posture.started === this.tick;
        if (acceptedDive) {
          player.protectedUntil = Math.min(player.protectedUntil, this.tick);
        }
        if (move.posture) stats?.input(move.posture, from, player.posture, acceptedDive);
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
    const movementStats = this.combat.movementStats;
    if (this.simulatesMovement) {
      const before = movementStats ? performance.now() : 0;
      for (const player of this.players) {
        if (!player) continue;
        if (this.respawns && player.hp <= 0 && this.tick >= player.respawnTick) respawnPlayer(player, this.tick);
        player.activeInput = this.tick - player.inputTick <= NET.inputTimeoutTicks;
        if (player.hp > 0 && player.activeInput) {
          player.yaw = player.input.yaw;
          player.pitch = player.input.pitch;
        }
        if (player.hp > 0) {
          const { current, started, dive } = player.posture;
          const hadImpact = !!dive?.impact;
          advancePosture(player, player.posture, this.tick, this.movementBalance,
            this.movementWorld, this.movementBoundary(player), this.canMove(player));
          movementStats?.advance(current, started, player.posture.current, this.tick, dive, hadImpact);
        }
        this.consumeMoves(player, movementStats);
        if (movementStats && player.hp > 0) movementStats.postureTicks[player.posture.current]++;
      }
      if (movementStats) {
        movementStats.movementMs += performance.now() - before;
        movementStats.measuredTicks++;
      }
    }
    if (this.profileEnemyAI) {
      const time = this.enemyAITime;
      time.targetMs = time.navigationMs = time.attackMs = time.encounterMs = time.perceptionMs = 0;
      time.steeringMs = time.neighborMs = time.collisionMs = time.fieldMs = 0;
    }
    if (this.simulatesCombat) {
      this.enemyCombat.prune(this.horde, this.tick);
      const beforeTargets = this.profileEnemyAI ? performance.now() : 0;
      this.updateTargets();
      const beforeNavigation = this.profileEnemyAI ? performance.now() : 0;
      if (this.profileEnemyAI) this.enemyAITime.targetMs = beforeNavigation - beforeTargets;
      const steering = this.steering;
      steering.planner = this.horde.count ? this.groundNavigation : undefined;
      steering.stats = this.enemyStats;
      steering.destination = this.destination;
      steering.fallback = this.fallbackDestination;
      steering.profile = this.profileEnemyAI;
      steeringSystem(this.horde, this.grid, this.targetPlayers, this.tick, steering);
      const beforeCollision = this.profileEnemyAI ? performance.now() : 0;
      movementSystem(this.horde, this.movementWorld, this.tick, this.stagger, this.navigation, this.grid,
        steering.config, this.enemyCombat, this.enemyStats);
      if (this.profileEnemyAI) {
        const afterCollision = performance.now();
        this.enemyAITime.navigationMs = afterCollision - beforeNavigation;
        this.enemyAITime.steeringMs = beforeCollision - beforeNavigation;
        this.enemyAITime.collisionMs = afterCollision - beforeCollision;
        this.enemyAITime.fieldMs = steering.planner?.fieldMs ?? 0;
      }
      for (const player of this.players) {
        if (!player) continue;
        if (!this.canMove(player)) {
          player.activeInput = false;
          player.pendingEquipment = undefined;
        }
        updateEquipment(player, this.tick, this.hooks, this.movementBalance);
        updateReload(player, this.tick, this.combat, this.movementBalance);
        const shot = fireWeapon(this.horde, player, this.ray, this.tick, this.movementWorld, this.combatTargets, this.combat, this.movementBalance);
        movementStats?.combat(player, this.tick, !!shot, player.activeInput && !!player.input.aim &&
          allowsPostureAction(player.posture, 'aim', this.movementBalance));
        if (!shot) continue;
        this.shots.push(shot);
        this.onShot(shot);
      }
      this.grenades.update(this.tick, this.horde, this.grid, this.movementWorld, this.players, this.blast, this.combat, this.movementBalance);
      const beforeAttacks = this.profileEnemyAI ? performance.now() : 0;
      this.enemyCombat.update(this.horde, this.targetPlayers, this.tick, this.enemyStats, this.movementBalance,
        this.movementWorld, this.secondaryTarget, this.combat, this.profileEnemyAI);
      if (this.profileEnemyAI) this.enemyAITime.attackMs = performance.now() - beforeAttacks;
    }
    this.finishTick();
    if (this.simulatesCombat) this.enemyCombat.prune(this.horde, this.tick);
    else this.enemyCombat.clear();
  }
}
