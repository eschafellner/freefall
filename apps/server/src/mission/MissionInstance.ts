import { randomUUID } from 'node:crypto';
import {
  ALBATROSS, BOARDING_TICKS, CARRIER_CONSOLE, CARRIER_SHIP, CARRIER_SPAWN, CARRIER_WORLD, DEPLOYMENT_PHASES,
  DIFFICULTY_REGISTRY, FRAG, MISSION_REWARDS, NET, PLANET_REGISTRY, RESULT_TICKS,
  distanceSquared, inAlbatross, isCarrierScene, landingShip, missionGround,
} from '@freefall/shared';
import type {
  DeploymentPhase, GrenadeState, MissionDefinition, MissionEvent, MissionResult, MissionSelection, MissionSnapshot, MissionState,
  PositionXZ, ShotEvent, WorldDefinition,
} from '@freefall/shared';
import { idleInput } from '../networking/input.ts';
import { Battlefield } from '../simulation/Battlefield.ts';
import { cancelEquipment, clearMoves, freshEquipment, respawnPlayer } from '../simulation/Player.ts';
import type { SimPlayer } from '../simulation/Player.ts';
import { blastDamage } from '../systems/grenades.ts';
import type { MeleeObject } from '../systems/combat.ts';
import { Albatross } from './Albatross.ts';
import { Convicts } from './Convicts.ts';
import { EncounterDirector } from './EncounterDirector.ts';
import { ExtractionSystem } from './ExtractionSystem.ts';
import { ObjectiveManager } from './ObjectiveManager.ts';

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
  private instanceId?: string;
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
  private readonly ready = new Set<string>();
  private readonly returnVotes = new Set<string>();
  private readonly roster = new Set<string>();
  private albatross?: Albatross;
  private convicts?: Convicts;
  private extraction = new ExtractionSystem();
  private readonly lastInteraction = new WeakMap<SimPlayer, number>();
  private readonly surface: WorldDefinition;
  private objectives: ObjectiveManager;
  private pendingEvents: MissionEvent[] = [];
  director: EncounterDirector;

  readonly definition: MissionDefinition;

  constructor(seed: number, definition: MissionDefinition) {
    super(seed, definition.world);
    this.definition = definition;
    this.surface = missionGround(definition.world);
    this.objectives = new ObjectiveManager(definition.objectives, this.emit);
    this.director = this.createDirector();
    this.combatTargets = this.director.nests;
    this.destination = (slot, output) => {
      const target = this.players[this.horde.target[slot]]?.hp ? undefined : this.secondaryTarget?.(slot);
      if (!target) return this.director.patrols.destination(this.players, slot, output);
      output.x = target.x;
      output.z = target.z;
      this.director.patrols.steer(slot, output);
      return 1;
    };
    this.secondaryTarget = this.findSecondary;
  }

  private readonly emit = (event: MissionEvent): void => { this.pendingEvents.push(event); };
  get state(): MissionState { return this.stateValue; }
  get difficulty() { return DIFFICULTY_REGISTRY.get(this.selection?.difficultyId ?? 'normal')!; }
  get acceptsNewOperators(): boolean {
    return this.state === 'CARRIER_HUB' || this.state === 'MISSION_SELECTION' || this.state === 'BOARDING';
  }

  private createDirector(): EncounterDirector {
    return new EncounterDirector({ ...this.definition, world: this.surface }, this.horde, this.players, this.difficulty, this.random, this.emit);
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
    player.x = x; player.z = z; player.yaw = yaw;
    player.input = { ...idleInput(), seq: player.input.seq, yaw };
    player.activeInput = false;
    player.inputTick = -Infinity;
    clearMoves(player);
  }

  private placeInCarrier(player: SimPlayer): void {
    this.place(player, player.slot * 2.5 - 3.75, CARRIER_SPAWN.z, CARRIER_SPAWN.facing);
  }

  private placeAtLanding(player: SimPlayer): void {
    const ship = this.albatross!.position;
    this.place(player, ship.x + (player.slot % 2 ? .9 : -.9), ship.z + 2 + 1.4 * Math.floor(player.slot / 2), Math.PI);
    player.protectedUntil = this.tick + 6 * NET.tickHz;
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
    cancelEquipment(player, this.tick);
    player.reloadRequested = false;
    player.activeInput = false;
    player.inputTick = -Infinity;
    clearMoves(player);
    this.ready.delete(id);
    this.returnVotes.delete(id);
    if (this.extraction.current?.phase !== 'LIFT') this.extraction.release(id);
  }

  reconnect(id: string): void { this.disconnected.delete(id); }

  override removePlayer(id: string): void {
    this.disconnect(id);
    this.disconnected.delete(id);
    super.removePlayer(id);
  }

  override receiveInput(id: string, payload: unknown): boolean {
    const player = this.player(id);
    return !!player && this.canMove(player) && super.receiveInput(id, payload);
  }

  select(id: string, payload: unknown): boolean {
    const player = this.player(id);
    if (!player || (this.state !== 'CARRIER_HUB' && this.state !== 'MISSION_SELECTION') ||
        distanceSquared(player, CARRIER_CONSOLE) > CARRIER_CONSOLE.radius ** 2 || !payload || typeof payload !== 'object') return false;
    const { planetId, missionId, difficultyId } = payload as Partial<MissionSelection>;
    if (typeof planetId !== 'string' || missionId !== this.definition.id || typeof difficultyId !== 'string' ||
        !PLANET_REGISTRY.get(planetId)?.missions.includes(missionId) || !DIFFICULTY_REGISTRY.has(difficultyId)) return false;
    this.selection = { planetId, missionId, difficultyId };
    if (this.state === 'CARRIER_HUB') this.transition('MISSION_SELECTION');
    return true;
  }

  start(id: string): boolean {
    const player = this.player(id);
    if (!player || this.state !== 'MISSION_SELECTION' || !this.selection ||
        distanceSquared(player, CARRIER_CONSOLE) > CARRIER_CONSOLE.radius ** 2) return false;
    this.transition('BOARDING');
    this.instanceId = randomUUID();
    for (const p of this.players) if (p) p.equipment = freshEquipment();
    this.albatross = new Albatross(landingShip(this.definition.world.deployment), this.instanceId, this.emit);
    this.convicts = new Convicts(this.albatross.position, this.instanceId, this.difficulty.level);
    this.phase = 'BOARDING';
    this.phaseAt = this.tick;
    return true;
  }

  private beginDeployment(): void {
    this.transition('DEPLOYMENT');
    this.boardingUntil = 0;
    for (const player of this.connected) this.roster.add(player.id);
    this.emit({ type: 'MissionStarted', tick: this.tick, missionId: this.definition.id, difficultyId: this.difficulty.id });
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
      this.director.deploy(this.difficulty, this.tick);
      this.director.touchdown(ship.position, this.tick);
      this.emit({ type: 'AlbatrossTouchdown', tick: this.tick, entityId: ship.id, position: ship.position });
    }
    if (!step) {
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
    if ((this.state !== 'EXTRACTION_AVAILABLE' && this.state !== 'EXTRACTION_IN_PROGRESS') || player.hp <= 0) return false;
    if (this.state === 'EXTRACTION_IN_PROGRESS') return action === 'secure' && this.extraction.secure(player);
    if (action !== 'balloon' && action !== 'albatross') return false;
    const ship = this.albatross!;
    if (!this.extraction.start(action, player, ship.position, ship.airworthy, this.tick, this.surface)) return false;
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
    if (this.state === 'ACTIVE_MISSION') return this.objectives.interact(player, this.tick);
    if (this.state === 'EXTRACTION_AVAILABLE') return this.action(id, 'albatross');
    return this.action(id, 'secure');
  }

  protected get respawns(): boolean { return false; }
  protected get simulatesMovement(): boolean { return this.acceptsNewOperators || this.simulatesCombat; }
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
  protected updateTargets(): void {}

  protected onBlast(g: GrenadeState, owner: string): void {
    for (const nest of this.director.nests.active.values()) {
      const damage = blastDamage(g, nest.x, .5, nest.z, this.surface);
      if (damage) this.director.nests.hit(nest.id, Math.round(damage * FRAG.nestMultiplier), this.tick, owner);
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

  private finish(extracted: string[] = []): void {
    if (this.result || !this.instanceId) return;
    this.transition('MISSION_RESULTS');
    const baseExperience = this.primaryCompleted ? MISSION_REWARDS.baseExperience : 0;
    const extractionBonusExperience = extracted.length ? Math.round(baseExperience * MISSION_REWARDS.extractionBonusRate) : 0;
    this.result = {
      id: this.instanceId + '/result', missionInstanceId: this.instanceId,
      missionId: this.definition.id, difficultyId: this.difficulty.id, primaryObjectivesCompleted: this.primaryCompleted,
      extractionAttempted: !!this.extraction.attempted, extractionMethod: this.extraction.attempted ?? 'none',
      extractionSucceeded: extracted.length > 0, extractedOperatorIds: extracted,
      convictsDeployed: this.convicts?.deployed ? this.convicts.members.length : 0,
      convictsSurvived: this.convicts?.deployed ? this.convicts.members.filter(({ hp }) => hp > 0).length : 0,
      albatrossSurvived: Boolean(this.albatross?.hullHealth),
      baseExperience, extractionBonusExperience,
      rewards: [...this.roster].map((operatorId) => {
        const bonus = extracted.includes(operatorId) ? extractionBonusExperience : 0;
        return { operatorId, baseExperience, extractionBonusExperience: bonus, totalExperience: baseExperience + bonus };
      }),
    };
    this.grenades.clear();
    for (const p of this.players) if (p) cancelEquipment(p, this.tick);
    this.resultUntil = this.tick + RESULT_TICKS;
    this.returnVotes.clear();
    this.director.patrols.halt(this.tick);
    this.emit({ type: 'MissionCompleted', tick: this.tick, result: this.result });
    for (const player of this.players) if (player) player.activeInput = false;
  }

  private reset(): void {
    this.grenades.clear();
    while (this.horde.count) this.horde.despawn(this.horde.active[this.horde.count - 1]);
    this.selection = this.instanceId = this.result = this.albatross = this.convicts = undefined;
    this.phase = 'DOCKED'; this.phaseIndex = -1;
    this.phaseAt = this.phaseUntil = this.boardingUntil = this.resultUntil = this.returnUntil = 0;
    this.primaryCompleted = false;
    this.ready.clear(); this.roster.clear(); this.returnVotes.clear();
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

    this.convicts!.update(this.tick, this.horde, this.surface, this.shots);
    this.objectives.update(this.tick, this.director.nests.destroyed);
    if (this.state === 'ACTIVE_MISSION' && this.objectives.allPrimaryComplete) {
      this.primaryCompleted = true;
      this.transition('OBJECTIVES_COMPLETED');
    } else if (this.state === 'OBJECTIVES_COMPLETED') this.transition('EXTRACTION_AVAILABLE');

    const living = connected.filter(({ hp }) => hp > 0);
    if (!this.players.some((player) => player && player.hp > 0)) {
      this.finish();
      return;
    }
    if (this.state === 'EXTRACTION_IN_PROGRESS') {
      const extraction = this.extraction.current!;
      const wasLift = extraction.phase === 'LIFT';
      const result = this.extraction.update(living, this.tick, this.albatross!.airworthy);
      if (result === 'cancel') this.transition('EXTRACTION_AVAILABLE');
      else if (result === 'complete') {
        // Captured operators retain their result if they drop during the outbound cinematic.
        this.finish(extraction.securedIds);
        return;
      } else if (!wasLift && extraction.phase === 'LIFT') {
        for (const player of living) if (extraction.securedIds.includes(player.id)) {
          cancelEquipment(player, this.tick);
          player.protectedUntil = extraction.endsAt + 1;
          player.activeInput = false;
          player.inputTick = -Infinity;
          clearMoves(player);
        }
      }
    }
    this.director.update(this.tick, this.objectives.defending, this.state === 'EXTRACTION_IN_PROGRESS');
  }

  debug(id: string, action: unknown): boolean {
    const player = this.player(id);
    if (!player || typeof action !== 'string') return false;
    if ((action === 'board' || action === 'deploy' || action === 'land') &&
        (this.state === 'CARRIER_HUB' || this.state === 'MISSION_SELECTION')) {
      this.place(player, 0, 3, 0);
      if (!this.selection && !this.select(id, { planetId: 'dev-ault', missionId: this.definition.id, difficultyId: 'normal' })) return false;
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
    if (action === 'objectives' && this.state === 'ACTIVE_MISSION') {
      this.objectives.debugComplete(this.tick);
      return true;
    }
    if (action === 'damage-thruster') {
      const index = this.albatross!.thrusters.findIndex(({ health }) => health > 0);
      return this.albatross!.damage(ALBATROSS.thrusterHealth / 2, this.tick, index);
    }
    if (action === 'destroy-albatross') return this.albatross!.damage(ALBATROSS.hullHealth, this.tick);
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
    const convicts = this.convicts?.snapshot() ?? [];
    if (ship && aboardCarrier) {
      for (const convict of convicts) {
        convict.x += CARRIER_SHIP.x - ship.x;
        convict.z += CARRIER_SHIP.z - ship.z;
      }
      Object.assign(ship, CARRIER_SHIP);
    }
    return {
      tick: this.tick, missionId: this.definition.id, difficultyId: this.difficulty.id, state: this.state,
      selection: this.selection, instanceId: this.instanceId, phase: this.phase, phaseAt: this.phaseAt,
      phaseUntil: this.phaseUntil, boardingUntil: this.boardingUntil, primaryObjectivesCompleted: this.primaryCompleted,
      resultUntil: this.resultUntil, objectives: this.objectives.snapshot(), result: this.result,
      extraction: this.extraction.snapshot(), albatross: ship, convicts,
      operators: this.players.flatMap((player) => player ? [{
        id: player.id, connected: !this.disconnected.has(player.id),
        participating: this.roster.has(player.id) || (this.acceptsNewOperators && !this.disconnected.has(player.id)),
        boarded: aboardCarrier && inAlbatross(player, CARRIER_SHIP), ready: this.ready.has(player.id),
        endVote: this.returnVotes.has(player.id),
      }] : []),
      threat: this.director.threat, nests: this.director.nests.snapshot(), alarms: this.director.patrols.alarms(),
      groups: this.director.patrols.groups.size, activeNests: this.director.nests.active.size,
      activeBreaches: this.director.nests.emergingCount(), breachCount: this.director.breachCount,
      nestsDestroyed: this.director.nests.destroyed, debug,
    };
  }
}
