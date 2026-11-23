import { randomInt, randomUUID } from 'node:crypto';
import {
  ALBATROSS, BALANCE, BOARDING_TICKS, allowsPostureAction, CARRIER_CONSOLE, CARRIER_SHIP, CARRIER_SPAWN, CARRIER_WORLD, DEPLOYMENT_PHASES,
  WEATHER_VERSION, WORLD_PROFILES, isTimeOfDay, planetWeather, MISSION_REWARDS, NET, SAMPLE_IDS, missionResourceReward, sampleLimits, spawnPoiLoot, groundHeight, isWorldSeed, PLANET_REGISTRY, PROCEDURAL_CONTRACT_ID, RESULT_TICKS,
  canSecureExtraction, distanceSquared, inAlbatross, isCarrierScene, isOperatorGrounded, isOptionalObjective, landingShip, missionGround, newPosture, resolveMissionBalance,
} from '@freefall/shared';
import type {
  BalanceRegistry, DeploymentPhase, EffectiveGrenade, GrenadeState, MissionBalance, MissionDefinition, MissionEvent, MissionResult,
  MissionFallback, MissionGenerationSelection, MissionSelection, MissionSnapshot, MissionState, PositionXZ, SampleAmounts, SampleId, ShotEvent, WorldDefinition,
} from '@freefall/shared';
import { Battlefield, seededRandom } from '../simulation/Battlefield.ts';
import { cancelEquipment, clearMoves, refillPlayer, reloading, respawnPlayer } from '../simulation/Player.ts';
import type { SimPlayer } from '../simulation/Player.ts';
import { structureBlastDamage } from '../systems/grenades.ts';
import type { AllyTarget, MeleeObject } from '../systems/combat.ts';
import type { ResupplyHooks } from '../systems/equipment.ts';
import { Albatross } from './Albatross.ts';
import { ResupplySystem } from './Resupply.ts';
import { PickupSystem } from './Pickups.ts';
import { Convicts } from './Convicts.ts';
import { EncounterDirector } from './EncounterDirector.ts';
import { ExtractionSystem } from './ExtractionSystem.ts';
import { MissionAtmosphere } from './MissionAtmosphere.ts';
import { MissionTelemetry } from './MissionTelemetry.ts';
import { ObjectiveManager } from './ObjectiveManager.ts';
import { isMissionSeed, missionGenerator } from './MissionGenerator.ts';
import type { GenerationResult } from './MissionGenerator.ts';
import { landingOperatorPosition } from './MissionLocations.ts';

const DEFAULT_DIFFICULTY = 'normal';

const transitions: Readonly<Record<MissionState, readonly MissionState[]>> = {
  CARRIER_HUB: ['MISSION_SELECTION'],
  MISSION_SELECTION: ['BOARDING'],
  BOARDING: ['DEPLOYMENT', 'CARRIER_HUB'],
  DEPLOYMENT: ['ACTIVE_MISSION', 'MISSION_RESULTS'],
  ACTIVE_MISSION: ['OBJECTIVES_COMPLETED', 'MISSION_RESULTS'],
  OBJECTIVES_COMPLETED: ['EXTRACTION_AVAILABLE', 'MISSION_RESULTS'],
  EXTRACTION_AVAILABLE: ['EXTRACTION_IN_PROGRESS', 'MISSION_RESULTS'],
  EXTRACTION_IN_PROGRESS: ['EXTRACTION_AVAILABLE', 'MISSION_RESULTS'],
  MISSION_RESULTS: ['RETURN_TO_CARRIER'],
  RETURN_TO_CARRIER: ['CARRIER_HUB'],
};

export class MissionInstance extends Battlefield {
  flowRevision = 0;
  private stateValue: MissionState = 'CARRIER_HUB';
  private selection?: MissionSelection;
  private generated?: Extract<GenerationResult, { status: 'generated' }>;
  private fallback?: MissionFallback;
  private startedAt = 0;
  captureMissionTelemetry = false;
  private telemetry?: MissionTelemetry;
  objectiveUpdateMs = 0;
  atmosphereUpdateMs = 0;
  private weather?: MissionAtmosphere;
  get atmosphere() { return this.weather?.state; }
  private instanceId?: string;
  private presentationSequence = 0;
  private result?: MissionResult;
  private resultUntil = 0;
  private returnUntil = 0;
  private phase: DeploymentPhase = 'DOCKED';
  private phaseIndex = -1;
  private phaseAt = 0;
  private phaseUntil = 0;
  private boardingUntil = 0;
  private primaryCompleted = false;
  private readonly disconnected = new Set<string>();
  protected override readonly targetPlayers: (SimPlayer | undefined)[] = [];
  private readonly secondaryCheckedAt = new Uint32Array(this.horde.id.length);
  private readonly secondaryTargets: (MeleeObject | undefined)[] = [];
  private readonly ready = new Set<string>();
  private readonly returnVotes = new Set<string>();
  private readonly roster = new Set<string>();
  /** Beute der Points of Interest und getragene Proben (ab dem Einsatzstart). */
  private pickups?: PickupSystem;
  private pickupRevision = 0;
  private albatross?: Albatross;
  private convicts?: Convicts;
  private supply?: ResupplySystem;
  /** Interaction feedback per operator, drained by the room (`mission-feedback`). */
  private feedback: { id: string; code: string }[] = [];
  private extraction = new ExtractionSystem();
  private readonly lastInteraction = new WeakMap<SimPlayer, number>();
  private readonly staticSurface: WorldDefinition;
  private generatedSurface?: WorldDefinition;
  private get surface(): WorldDefinition { return this.generatedSurface ?? this.staticSurface; }
  private readonly waveRandom: () => number;
  private objectives: ObjectiveManager;
  private pendingEvents: MissionEvent[] = [];
  /** Balance shown in the carrier before a run starts (default difficulty). */
  private readonly lobbyBalance: MissionBalance;
  /** Fixed balance snapshot of the current run. Set once at mission start, cleared on return to the carrier. */
  private missionBalance?: MissionBalance;
  director: EncounterDirector;

  private readonly baseDefinition: MissionDefinition;
  get definition(): MissionDefinition { return this.generated?.definition ?? this.baseDefinition; }
  get plan() { return this.generated?.plan; }

  constructor(seed: number, definition: MissionDefinition, registry: BalanceRegistry = BALANCE) {
    super(seed, definition.world, registry);
    this.waveRandom = seededRandom(~seed);
    this.baseDefinition = definition;
    this.lobbyBalance = resolveMissionBalance(registry, DEFAULT_DIFFICULTY);
    this.staticSurface = missionGround(definition.world);
    this.objectives = new ObjectiveManager(definition.objectives, this.emit);
    this.director = this.createDirector();
    this.combatTargets = this.director.nests;
    this.destination = (slot, output) => {
      const target = this.targetPlayers[this.horde.target[slot]]?.hp ? undefined : this.secondaryTarget?.(slot);
      if (!target) return this.director.patrols.destination(this.targetPlayers, slot, output);
      output.x = target.x;
      output.z = target.z;
      return 1;
    };
    this.fallbackDestination = (slot, output) => this.secondaryTarget?.(slot)
      ? this.director.patrols.destination(this.targetPlayers, slot, output) : 0;
    this.secondaryTarget = (slot) => {
      if (this.secondaryCheckedAt[slot] !== this.tick) {
        this.secondaryCheckedAt[slot] = this.tick;
        this.secondaryTargets[slot] = this.findSecondary(slot);
      }
      return this.secondaryTargets[slot];
    };
  }

  private readonly emit = (event: MissionEvent): void => {
    this.telemetry?.event(event);
    this.pendingEvents.push({ ...event, instanceId: this.instanceId, sequence: ++this.presentationSequence });
    if (event.type !== 'SwarmNestDestroyed' || !this.simulatesCombat) return;
    const initial = this.director.initialNests.get(event.nestId);
    if (initial) this.objectives.nestDestroyed(initial, event.tick);
  };
  get state(): MissionState { return this.stateValue; }
  get difficulty() { return this.registry.difficulty(this.selection?.difficultyId ?? DEFAULT_DIFFICULTY); }
  /** Effective balance of the current run. Immutable for the whole mission, even if the registry is replaced. */
  get balance(): MissionBalance { return this.missionBalance ?? this.lobbyBalance; }
  protected override get groundNavigation() { return this.director.patrols.navigation; }
  protected get loadoutChangeAllowed(): boolean { return this.state === 'CARRIER_HUB' || this.state === 'MISSION_SELECTION'; }

  get acceptsNewOperators(): boolean {
    return this.state === 'CARRIER_HUB' || this.state === 'MISSION_SELECTION' || this.state === 'BOARDING';
  }

  private createDirector(): EncounterDirector {
    const definition = this.definition;
    const world = this.surface;
    return new EncounterDirector({ ...definition, world }, this.horde, this.players, this.balance, this.random, this.waveRandom, this.emit);
  }

  private transition(next: MissionState): void {
    if (!transitions[this.state].includes(next)) throw new Error(`Illegal mission transition ${this.state} -> ${next}`);
    this.stateValue = next;
    this.flowRevision++;
  }

  private get connected(): SimPlayer[] {
    return this.players.filter((player): player is SimPlayer => !!player && !this.disconnected.has(player.id));
  }

  private player(id: string): SimPlayer | undefined {
    return this.disconnected.has(id) ? undefined : this.players.find((entry) => entry?.id === id);
  }

  private place(player: SimPlayer, x: number, z: number, yaw: number): void {
    player.life++;
    player.x = x; player.y = groundHeight(this.movementWorld, x, z); player.z = z; player.yaw = yaw;
    player.posture = newPosture(yaw);
    clearMoves(player);
  }

  private placeInCarrier(player: SimPlayer): void {
    this.place(player, player.slot * 2.5 - 3.75, CARRIER_SPAWN.z, CARRIER_SPAWN.facing);
  }

  private placeAtLanding(player: SimPlayer): void {
    const ship = this.albatross!.position;
    const { x, z } = landingOperatorPosition(ship, player.slot);
    this.place(player, x, z, Math.PI);
    player.protectedUntil = this.tick + this.registry.operator.landingProtectionSeconds * NET.tickHz;
  }

  addPlayer(id: string): SimPlayer {
    if (!this.acceptsNewOperators) throw new Error('Einsatz läuft');
    const player = super.addPlayer(id);
    this.placeInCarrier(player);
    return player;
  }

  disconnect(id: string): void {
    const player = this.player(id);
    if (!player) return;
    this.disconnected.add(id);
    if (this.telemetry && (this.state === 'DEPLOYMENT' || this.simulatesCombat)) this.telemetry.party.disconnects++;
    this.enemyCombat.interruptOperator(player, this.tick);
    cancelEquipment(player, this.tick);
    player.reloadRequested = false;
    clearMoves(player);
    this.ready.delete(id);
    this.returnVotes.delete(id);
    if (this.extraction.current?.phase !== 'LIFT') this.extraction.release(id);
  }

  reconnect(id: string): void {
    if (this.disconnected.delete(id) && this.telemetry && (this.state === 'DEPLOYMENT' || this.simulatesCombat)) {
      this.telemetry.party.reconnects++;
    }
  }

  override removePlayer(id: string): void {
    this.disconnect(id);
    this.disconnected.delete(id);
    super.removePlayer(id);
  }

  override receiveInput(id: string, payload: unknown): boolean {
    const player = this.player(id);
    return !!player && this.canMove(player) && super.receiveInput(id, payload);
  }

  select(id: string, payload: unknown, allowSeed = false): boolean {
    const player = this.player(id);
    if (!player || (this.state !== 'CARRIER_HUB' && this.state !== 'MISSION_SELECTION') ||
        distanceSquared(player, CARRIER_CONSOLE) > CARRIER_CONSOLE.radius ** 2 || !payload || typeof payload !== 'object') return false;
    const { planetId, missionId, difficultyId, seed, templateId, worldSeed, timeOfDay } = payload as Partial<MissionGenerationSelection>;
    if (typeof planetId !== 'string' || typeof difficultyId !== 'string' || !this.registry.difficultyById.has(difficultyId)) return false;
    const planet = PLANET_REGISTRY.get(planetId);
    const generatedWorld = WORLD_PROFILES.has(planetId);
    if (timeOfDay !== undefined && (!generatedWorld || !isTimeOfDay(timeOfDay))) return false;
    if (!planet || (!generatedWorld && !planet.missions.includes(this.baseDefinition.id)) ||
        (generatedWorld && missionId !== PROCEDURAL_CONTRACT_ID) ||
        (worldSeed !== undefined && (!generatedWorld || !isWorldSeed(worldSeed)))) return false;
    if (missionId !== PROCEDURAL_CONTRACT_ID && missionId !== this.baseDefinition.id) return false;
    let generated: typeof this.generated;
    let fallback: typeof this.fallback;
    if (missionId === PROCEDURAL_CONTRACT_ID) {
      if ((seed !== undefined && (!allowSeed || !isMissionSeed(seed))) ||
          (templateId !== undefined && (typeof templateId !== 'string' || templateId.length > 64))) return false;
      const missionSeed = seed ?? randomInt(0x100000000);
      const selectedWorldSeed = generatedWorld ? worldSeed ?? randomInt(0x100000000) : undefined;
      const result = missionGenerator.generate({ planetId, difficultyId, seed: missionSeed, templateId, timeOfDay,
        ...(selectedWorldSeed !== undefined && { worldSeed: selectedWorldSeed }) }, this.registry);
      if (result.status === 'failed' && !process.env.NODE_TEST_CONTEXT) {
        console.warn('[mission-generation] %s', JSON.stringify({ planetId, missionSeed, worldSeed: selectedWorldSeed,
          templateId, difficultyId, balanceHash: this.registry.version.hash, reason: result.reason, ...result.diagnostics }));
      }
      if (result.status === 'generated') {
        if (!generatedWorld && result.definition.world.id !== this.baseDefinition.world.id) return false;
        generated = result;
      } else if (result.fallback === this.baseDefinition) {
        fallback = { seed: missionSeed, reason: result.reason };
      } else {
        this.feedback.push({ id, code: 'generation-failed' });
        return false;
      }
    }
    this.generated = generated;
    this.generatedSurface = generated && missionGround(generated.definition.world);
    this.fallback = fallback;
    this.selection = { planetId, missionId: generated?.plan.id ?? this.baseDefinition.id, difficultyId };
    this.objectives = new ObjectiveManager(this.definition.objectives, this.emit);
    if (this.state === 'CARRIER_HUB') this.transition('MISSION_SELECTION');
    else this.flowRevision++;
    return true;
  }

  start(id: string): boolean {
    const player = this.player(id);
    if (!player || this.state !== 'MISSION_SELECTION' || !this.selection ||
        distanceSquared(player, CARRIER_CONSOLE) > CARRIER_CONSOLE.radius ** 2) return false;
    this.transition('BOARDING');
    this.instanceId = randomUUID();
    // Freeze the balance of this run. Later registry changes cannot reach a running mission.
    this.missionBalance = this.generated?.balance ?? resolveMissionBalance(this.registry, this.selection.difficultyId);
    this.enemyStats = this.missionBalance.enemies;
    this.setCombatBounds(this.surface.half);
    this.director = this.createDirector();
    this.combatTargets = this.director.nests;
    for (const p of this.players) if (p) refillPlayer(p);
    this.stats.reset();
    this.albatross = new Albatross(landingShip(this.definition.world.deployment), this.instanceId, this.emit);
    this.convicts = new Convicts(this.albatross.position, this.instanceId, this.balance.convicts);
    this.supply = new ResupplySystem(this.albatross, this.balance.resupply, this.combatEvents, this.stats);
    this.phase = 'BOARDING';
    this.phaseAt = this.tick;
    return true;
  }

  /**
   * The host calls the run off before departure: back to the hub with the selection kept (no timeout, see
   * docs/GAME_FLOW.md). Operators stay where they are; the boarding state of this run is discarded.
   */
  cancelBoarding(id: string): boolean {
    const player = this.player(id);
    if (!player || this.state !== 'BOARDING') return false;
    const selection = this.selection;
    this.transition('CARRIER_HUB');
    this.instanceId = this.albatross = this.convicts = this.supply = this.missionBalance = undefined;
    this.enemyStats = this.lobbyBalance.enemies;
    this.director = this.createDirector();
    this.combatTargets = this.director.nests;
    this.phase = 'DOCKED';
    this.phaseAt = this.tick;
    this.boardingUntil = 0;
    this.ready.clear();
    this.feedback = [];
    // Keep the chosen mission on the console so the squad can restart without selecting again.
    if (selection) {
      this.selection = selection;
      this.transition('MISSION_SELECTION');
    }
    return true;
  }

  private beginDeployment(): void {
    this.transition('DEPLOYMENT');
    this.startedAt = this.tick;
    const plan = this.plan;
    if (plan?.world && planetWeather(plan.world.planetId).length) {
      this.weather = new MissionAtmosphere(this.instanceId!, plan.world, plan.seed, this.tick, plan.timeOfDay);
    }
    this.boardingUntil = 0;
    for (const player of this.connected) this.roster.add(player.id);
    // Beute der Points of Interest: Menge und Probenarten nach Schwierigkeit, Lage aus dem Welt-Seed.
    const world = this.surface;
    const loot = spawnPoiLoot(world, (plan?.seed ?? randomInt(0x7fffffff)) ^ 0x2f1d, this.difficulty.level);
    this.pickups = new PickupSystem(world, loot, sampleLimits(this.difficulty.level, loot.filter(({ kind }) => kind === 'artifact').length));
    this.pickupRevision = 0;
    if (this.captureMissionTelemetry) this.telemetry = new MissionTelemetry(this, this.roster);
    this.emit({ type: 'MissionStarted', tick: this.tick, missionId: this.definition.id, difficultyId: this.difficulty.id, balanceHash: this.balance.configHash });
    this.nextDeploymentPhase();
  }

  private nextDeploymentPhase(): void {
    this.flowRevision++;
    const step = DEPLOYMENT_PHASES[++this.phaseIndex];
    this.phaseAt = this.tick;
    this.phase = step?.[0] ?? 'DEPLOYED';
    this.phaseUntil = step ? this.tick + step[1] : 0;
    if (this.phase === 'TOUCHDOWN') {
      this.ready.clear();
      for (const player of this.players) if (player) {
        this.placeAtLanding(player);
        if (!this.roster.has(player.id)) player.hp = 0;
      }
      const ship = this.albatross!;
      this.director.deploy(this.tick);
      this.director.touchdown(ship.position, this.tick);
      this.emit({ type: 'AlbatrossTouchdown', tick: this.tick, entityId: ship.id, position: ship.position });
    }
    if (!step) {
      const missingTarget = this.definition.objectives.some((objective) =>
        objective.kind === 'destroy-nests' && !isOptionalObjective(objective) && objective.target &&
        ![...this.director.initialNests.values()].some((position) => distanceSquared(position, objective.target!) === 0));
      if (missingTarget) {
        this.finish([], 'objective-unavailable');
        return;
      }
      this.objectives.start(this.tick);
      this.convicts!.deploy();
      this.transition('ACTIVE_MISSION');
    }
  }

  action(id: string, action: unknown): boolean {
    const player = this.player(id);
    if (!player) return false;
    if (action === 'return-vote' && this.state === 'MISSION_RESULTS') return this.vote(id);
    if (action === 'ready' && this.state === 'BOARDING' && inAlbatross(player, CARRIER_SHIP)) {
      if (!this.ready.delete(id)) this.ready.add(id);
      return true;
    }
    if (action !== 'secure' && action !== 'balloon' && action !== 'albatross') return false;
    if (this.state !== (action === 'secure' ? 'EXTRACTION_IN_PROGRESS' : 'EXTRACTION_AVAILABLE') || player.hp <= 0) {
      if (action === 'balloon') this.feedback.push({ id, code: 'balloon-unavailable' });
      return false;
    }
    if (!canSecureExtraction(player.posture.current, player, this.surface)) {
      this.feedback.push({ id, code: 'extraction-posture' });
      return false;
    }
    if (action === 'secure') return this.extraction.secure(player);
    const ship = this.albatross!;
    if (!this.extraction.start(action, player, ship.position, ship.airworthy, this.tick, this.surface, this.plan?.extraction.balloon)) {
      if (action === 'balloon') this.feedback.push({ id, code: this.plan ? 'balloon-pickup-zone' : 'balloon-unavailable' });
      return false;
    }
    this.transition('EXTRACTION_IN_PROGRESS');
    const extraction = this.extraction.current!;
    this.director.startExtraction(this.tick, extraction, action === 'balloon');
    if (action === 'balloon') this.emit({ type: 'ExtractionBeaconActivated', tick: this.tick, position: { x: extraction.x, z: extraction.z } });
    this.emit({ type: 'ExtractionStarted', tick: this.tick, method: action, arrivalAt: extraction.endsAt });
    return true;
  }

  private vote(id: string): boolean {
    if (!this.returnVotes.delete(id)) this.returnVotes.add(id);
    return true;
  }

  interact(id: string): boolean {
    const player = this.player(id);
    if (!player || player.hp <= 0 || (this.lastInteraction.get(player) ?? 0) > this.tick) return false;
    this.lastInteraction.set(player, this.tick + 6);
    if (this.state === 'BOARDING') return this.action(id, 'ready');
    const container = this.simulatesCombat && this.canMove(player) ? this.supply?.reachable(player) : undefined;
    const pickup = !container && this.simulatesCombat && this.pickups && this.canMove(player) ? this.pickups.take(player) : undefined;
    if (pickup) {
      this.feedback.push({ id, code: pickup });
      if (this.pickups!.revision !== this.pickupRevision) { this.pickupRevision = this.pickups!.revision; this.flowRevision++; }
      return pickup !== 'pickup-full' && pickup !== 'pickup-limit';
    }
    if (container) {
      // Validated again on the tick the action starts and on the tick it completes. Every reason the action
      // would not start is reported here, so the operator never presses E without an answer.
      const blocked = this.supply!.blocker(player, container.id) ??
        (player.equipment.action || player.input.fire ? 'resupply-busy' :
          reloading(player) || player.reloadRequested ? 'resupply-reloading' :
            !allowsPostureAction(player.posture, 'resupply', this.movementBalance) ? 'resupply-posture' : undefined);
      if (blocked) {
        if (this.telemetry) this.telemetry.interactions.resupplyRejected++;
        this.feedback.push({ id, code: blocked });
        return false;
      }
      if (this.telemetry) this.telemetry.interactions.resupplyAccepted++;
      player.pendingResupply = container.id;
      return true;
    }
    if (this.state === 'ACTIVE_MISSION') {
      const accepted = (!this.plan || isOperatorGrounded(player, this.surface)) && this.objectives.interact(player, this.tick);
      if (this.telemetry) this.telemetry.interactions[accepted ? 'objectivesAccepted' : 'objectivesRejected']++;
      return accepted;
    }
    if (this.state === 'EXTRACTION_AVAILABLE') return this.action(id, 'albatross');
    return this.action(id, 'secure');
  }

  protected get respawns(): boolean { return false; }
  protected get simulatesMovement(): boolean { return this.acceptsNewOperators || this.simulatesCombat; }
  override get movementBalance() { return this.balance.movement; }
  protected get movementWorld(): WorldDefinition { return this.acceptsNewOperators ? CARRIER_WORLD : this.surface; }
  protected get simulatesCombat(): boolean {
    return this.state === 'ACTIVE_MISSION' || this.state === 'OBJECTIVES_COMPLETED' ||
      this.state === 'EXTRACTION_AVAILABLE' || this.state === 'EXTRACTION_IN_PROGRESS';
  }

  protected canMove(player: SimPlayer): boolean {
    const extraction = this.extraction.current;
    return extraction?.phase !== 'LIFT' || !extraction.securedIds.includes(player.id);
  }

  protected movementBoundary(player: SimPlayer) { return this.extraction.tether(player); }
  protected override allies(): readonly AllyTarget[] { return this.convicts?.deployed ? this.convicts.members : []; }
  protected override get resupply(): ResupplyHooks | undefined { return this.supply; }

  drainFeedback(): { id: string; code: string }[] {
    const feedback = this.feedback;
    this.feedback = [];
    return feedback;
  }
  protected override enemyState(slot: number): string | undefined {
    return this.director.patrols.groupFor(slot)?.state;
  }

  protected updateTargets(): void {
    for (let slot = 0; slot < this.players.length; slot++) {
      const player = this.players[slot];
      this.targetPlayers[slot] = player && this.roster.has(player.id) &&
        !this.disconnected.has(player.id) && this.canMove(player) ? player : undefined;
    }
    const horde = this.horde;
    for (let i = 0; i < horde.count; i++) {
      const slot = horde.active[i];
      horde.target[slot] = this.director.patrols.targetFor(this.targetPlayers, slot)?.slot ?? -1;
    }
  }

  protected onBlast(g: GrenadeState, owner: string, grenade: EffectiveGrenade): void {
    const structure = this.balance.nest.id;
    for (const nest of this.director.nests.active.values()) {
      if (nest.state === 'EMERGING') continue;
      const damage = structureBlastDamage(g, structure, nest.x, nest.z, this.surface, grenade, this.loadout.damagePolicy);
      if (damage === undefined) continue;
      this.stats.data.grenadeDamageNests += this.director.nests.hit(nest.id, damage, this.tick, owner);
    }
    this.reportNoise(g, 'explosion');
  }

  protected onShot(shot: ShotEvent): void { this.reportNoise({ x: shot.fromX, z: shot.fromZ }, 'shot'); }
  reportNoise(position: PositionXZ, kind: 'shot' | 'explosion'): void {
    if (this.simulatesCombat) this.director.patrols.reportNoise(position, kind, this.tick);
  }

  private readonly findSecondary = (slot: number): MeleeObject | undefined => {
    const ship = this.albatross;
    if (!ship || !this.convicts || !this.director.patrols.canPursueSecondary(slot)) return;
    const x = this.horde.x[slot], z = this.horde.z[slot];
    if ((ship.position.x - x) ** 2 + (ship.position.z - z) ** 2 > 36 ** 2 || !this.convicts.deployed) return;
    let target: MeleeObject | undefined;
    let range = 28 ** 2;
    for (const candidate of this.convicts.members) {
      const distance = (candidate.x - x) ** 2 + (candidate.z - z) ** 2;
      if (!candidate.hp || distance >= range) continue;
      range = distance;
      target = candidate;
    }
    // Infantry has priority at comparable range. Nearby surfaces remain valid targets.
    if (target) range *= .65;
    const takeoff = this.extraction.current;
    if (takeoff?.method === 'albatross' && takeoff.phase === 'LIFT') return target;
    for (const candidate of ship.targets) {
      const distance = (candidate.x - x) ** 2 + (candidate.z - z) ** 2;
      if (!candidate.hp || distance >= range) continue;
      range = distance;
      target = candidate;
    }
    return target;
  };

  private finish(extracted: string[] = [], failure: 'team-lost' | 'objective-unavailable' = 'team-lost'): void {
    if (this.result || !this.instanceId) return;
    this.transition('MISSION_RESULTS');
    this.weather = undefined;
    const succeeded = extracted.length > 0;
    this.objectives.finish(this.tick, succeeded);
    const optional = new Set(this.definition.objectives.filter(isOptionalObjective).map(({ id }) => id));
    const plan = this.plan;
    const baseExperience = this.primaryCompleted ? MISSION_REWARDS.baseExperience : 0;
    const extractionBonusExperience = extracted.length ? Math.round(baseExperience * MISSION_REWARDS.extractionBonusRate) : 0;
    const samples = this.pickups?.extracted(extracted) ?? {};
    const marksFound = this.pickups?.marksFound ?? 0;
    const resources = missionResourceReward({ difficultyLevel: this.difficulty.level, primaryObjectivesCompleted: this.primaryCompleted,
      optionalObjectivesCompleted: this.objectives.snapshot().filter(({ id, state }) => optional.has(id) && state === 'complete').length, samples,
      marksFound });
    this.result = {
      id: this.instanceId + '/result', missionInstanceId: this.instanceId,
      missionId: this.definition.id, difficultyId: this.difficulty.id, balanceHash: this.balance.configHash,
      primaryObjectivesCompleted: this.primaryCompleted,
      extractionAttempted: !!this.extraction.attempted, extractionMethod: this.extraction.attempted ?? 'none',
      extractionSucceeded: extracted.length > 0, extractedOperatorIds: extracted,
      convictsDeployed: this.convicts?.deployed ? this.convicts.members.length : 0,
      convictsSurvived: this.convicts?.deployed ? this.convicts.members.filter(({ hp }) => hp > 0).length : 0,
      albatrossSurvived: Boolean(this.albatross?.hullHealth),
      baseExperience, extractionBonusExperience,
      rewards: [...this.roster].map((operatorId) => {
        const bonus = extracted.includes(operatorId) ? extractionBonusExperience : 0;
        const kills = this.players.find((player) => player?.id === operatorId)?.kills ?? 0;
        return { operatorId, baseExperience, extractionBonusExperience: bonus, totalExperience: baseExperience + bonus, kills, resources: { ...resources } };
      }),
      samples, marksFound,
      missionName: plan?.displayName ?? this.definition.displayName,
      planetId: plan?.planetId ?? this.selection?.planetId,
      combat: this.stats.snapshot(),
      procedural: plan && { planId: plan.id, planetId: plan.planetId, seed: plan.seed, templateId: plan.templateId, generatorVersion: plan.generatorVersion, ...(plan.world && { world: plan.world }) },
      fallback: this.fallback,
      outcome: succeeded ? 'extracted' : failure, durationTicks: this.tick - this.startedAt,
      objectives: this.objectives.snapshot().map((objective) => ({ ...objective, optional: optional.has(objective.id) })),
    };
    if (!process.env.NODE_TEST_CONTEXT) console.info('[combat-telemetry] %s', JSON.stringify({ missionId: this.definition.id, difficultyId: this.difficulty.id,
      balanceHash: this.balance.configHash, combat: this.result.combat }));
    this.grenades.clear();
    for (const p of this.players) if (p) cancelEquipment(p, this.tick);
    this.resultUntil = this.tick + RESULT_TICKS;
    this.returnVotes.clear();
    this.director.halt(this.tick);
    this.emit({ type: 'MissionCompleted', tick: this.tick, result: this.result });
    for (const player of this.players) if (player) player.activeInput = false;
  }

  private reset(): void {
    this.telemetry = undefined;
    this.weather = undefined;
    this.grenades.clear();
    while (this.horde.count) this.horde.despawn(this.horde.active[this.horde.count - 1]);
    this.selection = this.instanceId = this.result = this.albatross = this.convicts = this.supply = this.missionBalance = undefined;
    this.generated = this.fallback = this.generatedSurface = undefined;
    this.feedback = [];
    this.enemyStats = this.lobbyBalance.enemies;
    this.phase = 'DOCKED'; this.phaseIndex = -1;
    this.phaseAt = this.phaseUntil = this.boardingUntil = this.resultUntil = this.returnUntil = 0;
    this.primaryCompleted = false;
    this.ready.clear(); this.roster.clear(); this.returnVotes.clear(); this.pickups = undefined;
    this.objectives = new ObjectiveManager(this.definition.objectives, this.emit);
    this.director = this.createDirector();
    this.combatTargets = this.director.nests;
    this.extraction = new ExtractionSystem();
    for (const player of this.players) if (player) {
      respawnPlayer(player, this.tick);
      player.kills = 0;
      this.placeInCarrier(player);
    }
    this.stateValue = 'CARRIER_HUB';
    this.flowRevision++;
  }

  override step(): void {
    const { telemetry, state } = this;
    if (!telemetry || (state !== 'DEPLOYMENT' && !this.simulatesCombat)) {
      super.step();
      return;
    }
    const extraction = this.extraction.current;
    const extractionPhase = extraction?.phase;
    super.step();
    telemetry.step(this, state, extraction?.method, extractionPhase === 'LIFT');
  }

  missionTelemetry() { return this.telemetry?.snapshot(); }

  protected finishTick(): void {
    const connected = this.connected;
    if (this.state === 'BOARDING') {
      for (const player of connected) if (!inAlbatross(player, CARRIER_SHIP)) this.ready.delete(player.id);
      if (!connected.length || !connected.every((player) => this.ready.has(player.id))) this.boardingUntil = 0;
      else if (!this.boardingUntil) this.boardingUntil = this.tick + BOARDING_TICKS;
      else if (this.tick >= this.boardingUntil) this.beginDeployment();
      return;
    }
    if (this.state === 'DEPLOYMENT') {
      if (this.tick >= this.phaseUntil) this.nextDeploymentPhase();
      return;
    }
    if (this.state === 'MISSION_RESULTS') {
      if (this.tick >= this.resultUntil || (connected.length && connected.every(({ id }) => this.returnVotes.has(id)))) {
        this.transition('RETURN_TO_CARRIER');
        this.returnUntil = this.tick + NET.tickHz;
      }
      return;
    }
    if (this.state === 'RETURN_TO_CARRIER') {
      if (this.tick >= this.returnUntil) this.reset();
      return;
    }
    if (!this.simulatesCombat) return;

    if (this.weather) {
      const started = this.profileEnemyAI ? performance.now() : 0;
      this.weather.update(this.tick);
      if (this.profileEnemyAI) this.atmosphereUpdateMs = performance.now() - started;
    }
    this.convicts!.update(this.tick, this.horde, this.surface, this.shots);
    const living = connected.filter(({ hp }) => hp > 0);
    if (this.pickups) {
      // Gefallene Operator lassen ihre Proben einzeln fallen.
      for (const player of this.players) if (player && player.hp <= 0) this.pickups.drop(player.id, player);
      if (this.pickups.revision !== this.pickupRevision) { this.pickupRevision = this.pickups.revision; this.flowRevision++; }
    }
    const beforeObjectives = this.profileEnemyAI ? performance.now() : 0;
    this.objectives.update(this.tick, this.director.nests.destroyed, living, this.surface);
    if (this.profileEnemyAI) this.objectiveUpdateMs = performance.now() - beforeObjectives;
    if (this.state === 'ACTIVE_MISSION' && this.objectives.allPrimaryComplete) {
      this.primaryCompleted = true;
      this.transition('OBJECTIVES_COMPLETED');
    } else if (this.state === 'OBJECTIVES_COMPLETED') {
      this.transition('EXTRACTION_AVAILABLE');
      this.emit({ type: 'ExtractionAvailable', tick: this.tick });
    }

    if (!this.players.some((player) => player && player.hp > 0)) {
      this.finish();
      return;
    }
    if (this.state === 'EXTRACTION_IN_PROGRESS') {
      const extraction = this.extraction.current!;
      const previousPhase = extraction.phase;
      const result = this.extraction.update(living, this.tick, this.albatross!.airworthy, this.surface);
      if (result === 'cancel') {
        if (this.telemetry) this.telemetry.extraction[extraction.method].cancellations++;
        this.transition('EXTRACTION_AVAILABLE');
      } else if (result === 'complete') {
        // Captured operators retain their result if they drop during the outbound cinematic.
        this.finish(extraction.securedIds);
        return;
      } else if (previousPhase === 'APPROACH' && extraction.phase === 'COUNTDOWN' && this.telemetry) {
        this.telemetry.extraction.balloon.missedPickups++;
      } else if (previousPhase !== 'LIFT' && extraction.phase === 'LIFT') {
        for (const player of living) if (extraction.securedIds.includes(player.id)) {
          cancelEquipment(player, this.tick);
          player.protectedUntil = extraction.endsAt + 1;
          clearMoves(player);
        }
      }
    }
    const beforeEncounter = this.profileEnemyAI ? performance.now() : 0;
    this.director.update(this.tick, this.state, this.objectives.defending, connected, living, this.targetPlayers,
      this.enemyCombat.windingUp + this.enemyCombat.active, this.profileEnemyAI);
    if (this.profileEnemyAI) {
      this.enemyAITime.encounterMs = performance.now() - beforeEncounter;
      this.enemyAITime.perceptionMs = this.director.patrols.perceptionMs;
    }
  }

  /** Legt einem Operator Proben direkt in den Rucksack (Debug, Tests), begrenzt auf das Truppenlimit. */
  collectSamples(operatorId: string, amounts: SampleAmounts): boolean {
    const player = this.player(operatorId);
    if (!player || player.hp <= 0 || !this.roster.has(operatorId) || !this.simulatesCombat || this.result || !this.pickups) return false;
    return this.pickups.carry(operatorId, amounts);
  }

  /** Proben, die ein Operator gerade trägt. */
  samplesCarriedBy(operatorId: string): SampleAmounts {
    return this.pickups?.carriedBy(operatorId) ?? {};
  }

  /** Beute der Points of Interest (Tests, Debug). */
  get pickupSystem(): PickupSystem | undefined { return this.pickups; }

  debug(id: string, action: unknown): boolean {
    const player = this.player(id);
    if (!player || typeof action !== 'string') return false;
    if ((action === 'board' || action === 'deploy' || action === 'land') &&
        (this.state === 'CARRIER_HUB' || this.state === 'MISSION_SELECTION')) {
      this.place(player, 0, 3, 0);
      if (!this.selection && !this.select(id, { planetId: 'dev-ault', missionId: this.baseDefinition.id, difficultyId: 'normal' })) return false;
      if (!this.start(id)) return false;
    }
    if (action === 'board' && this.state === 'BOARDING') {
      for (const operator of this.connected) {
        this.place(operator, CARRIER_SHIP.x + (operator.slot % 2 ? 1 : -1), CARRIER_SHIP.z + 1 + (operator.slot >> 1), Math.PI);
        this.ready.add(operator.id);
      }
      return true;
    }
    if ((action === 'deploy' || action === 'land') && (this.state === 'BOARDING' || this.state === 'DEPLOYMENT')) {
      if (this.state === 'BOARDING') {
        this.debug(id, 'board');
        this.beginDeployment();
      }
      if (action === 'land') while (this.phase !== 'DEPLOYED') this.nextDeploymentPhase();
      return true;
    }
    if (action === 'carrier' && (this.state === 'MISSION_RESULTS' || this.state === 'RETURN_TO_CARRIER')) {
      this.pendingEvents = [];
      this.reset();
      return true;
    }
    if (!this.simulatesCombat) return false;
    if (action.startsWith('weather:')) return this.weather?.debug(this.tick, action) ?? false;
    if (action === 'objectives' && this.state === 'ACTIVE_MISSION') {
      this.objectives.debugComplete(this.tick);
      return true;
    }
    // Proben zum Testen der Anzeige: sample:tissue, sample:rock, sample:artifact (Debug-Räume schreiben nichts gut).
    if (action.startsWith('sample:')) {
      const kind = action.slice(7) as SampleId;
      return SAMPLE_IDS.includes(kind) && this.collectSamples(id, { [kind]: 1 });
    }
    if (action === 'damage-thruster') {
      const index = this.albatross!.thrusters.findIndex(({ health }) => health > 0);
      return this.albatross!.damage(ALBATROSS.thrusterHealth / 2, this.tick, index);
    }
    if (action === 'destroy-albatross') return this.albatross!.damage(ALBATROSS.hullHealth, this.tick);
    if (action === 'destroy-supply') return this.supply!.containers.some(({ id }) => this.supply!.destroy(id, this.tick));
    if (action === 'balloon') return this.action(id, 'balloon');
    if (action === 'fighter' && this.extraction.current?.method === 'balloon' && this.extraction.current.phase === 'COUNTDOWN') {
      this.extraction.current.endsAt = this.tick + 1;
      return true;
    }
    return this.director.debug(action, player, this.tick);
  }

  drainEvents(): MissionEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  snapshot(debug = false): MissionSnapshot {
    const aboardCarrier = isCarrierScene(this.state, this.phase);
    const ship = this.albatross?.snapshot();
    if (ship && this.supply) ship.supply = this.supply.snapshot();
    const convicts = this.convicts?.snapshot() ?? [];
    if (ship && aboardCarrier) {
      for (const convict of convicts) {
        convict.x += CARRIER_SHIP.x - ship.x;
        convict.z += CARRIER_SHIP.z - ship.z;
      }
      for (const container of ship.supply ?? []) {
        container.x += CARRIER_SHIP.x - ship.x;
        container.z += CARRIER_SHIP.z - ship.z;
      }
      Object.assign(ship, CARRIER_SHIP);
    }
    return {
      tick: this.tick, missionId: this.definition.id, difficultyId: this.difficulty.id, state: this.state,
      balance: this.plan?.balance ?? { release: this.balance.release, hash: this.balance.configHash },
      atmosphereVersion: WEATHER_VERSION, selection: this.selection, planId: this.plan?.id, fallback: this.fallback, instanceId: this.instanceId, phase: this.phase, phaseAt: this.phaseAt,
      phaseUntil: this.phaseUntil, boardingUntil: this.boardingUntil, primaryObjectivesCompleted: this.primaryCompleted,
      resultUntil: this.resultUntil, objectives: this.objectives.snapshot(), result: this.result,
      extraction: this.extraction.snapshot(), albatross: ship, convicts,
      ...(this.pickups && !aboardCarrier && { pickups: this.pickups.snapshot(),
        samples: { limits: this.pickups.limits, team: this.pickups.teamCarried(), carried: this.pickups.carriedSnapshot() } }),
      operators: this.players.flatMap((player) => player ? [{
        id: player.id, connected: !this.disconnected.has(player.id),
        participating: this.roster.has(player.id) || (this.acceptsNewOperators && !this.disconnected.has(player.id)),
        boarded: aboardCarrier && inAlbatross(player, CARRIER_SHIP), ready: this.ready.has(player.id),
        endVote: this.returnVotes.has(player.id),
      }] : []),
      threat: this.director.threat, encounter: this.director.pacing.snapshot(),
      nests: this.director.nests.snapshot(), alarms: this.director.patrols.alarms(),
      groups: this.director.patrols.groups.size, activeNests: this.director.nests.active.size,
      activeBreaches: this.director.nests.emergingCount(), breachCount: this.director.breachCount,
      nestsDestroyed: this.director.nests.destroyed, debug,
    };
  }
}
