import { NET } from '@freefall/shared';
import type { ExtractionMethod, HordeDirectorState, HordeWaveEndReason, MissionEvent, MissionState, ObjectiveSnapshot } from '@freefall/shared';
import type { MissionInstance } from './MissionInstance.ts';

type ObjectiveTiming = {
  state: ObjectiveSnapshot['state']; availableAt?: number; defenseStartedAt?: number;
  staffedSince?: number; staffedTicks: number; settledAt?: number;
};

const phaseTicks = (): Record<HordeDirectorState, number> => ({ CALM: 0, BUILDUP: 0, ASSAULT: 0, PEAK: 0, RECOVERY: 0 });
const extractionTimes = () => ({ starts: 0, cancellations: 0, missedPickups: 0, ticks: 0, liftTicks: 0,
  peakActiveEnemies: 0, operatorEnemyDamage: 0 });

/** Optional, server-only counters. Storage depends on mission objectives and party slots, never on ticks or enemies. */
export class MissionTelemetry {
  readonly startedAt: number;
  readonly operatorsAtDeployment: number;
  readonly stateTicks: Partial<Record<MissionState, number>> = {};
  readonly objectives: Record<string, ObjectiveTiming>;
  readonly interactions = { objectivesAccepted: 0, objectivesRejected: 0, resupplyAccepted: 0, resupplyRejected: 0 };
  readonly resources = { resupplyOperatorTicks: 0, stimsUsed: 0, reloadsStarted: 0 };
  readonly extraction = { albatross: extractionTimes(), balloon: extractionTimes() };
  readonly combat = { activeTicks: 0, operatorEnemyDamage: 0, kills: 0, deaths: 0 };
  readonly convicts = { shots: 0, kills: 0 };
  readonly movement = { movingTicks: 0, stationaryWithoutCombatTicks: 0 };
  readonly party = { disconnects: 0, reconnects: 0 };
  readonly director = { phaseTicks: phaseTicks(), sampledPressure: 0, pressureSamples: 0, peakPressure: 0,
    wavesStarted: 0, waveEnemiesSpawned: 0, waveEnds: {} as Partial<Record<HordeWaveEndReason, number>> };
  readonly encounters = { nestsCreated: 0, nestsDestroyed: 0, breachStarts: 0, alarmsCompleted: 0 };
  readonly population = { samples: 0, activeSum: 0, peak: 0, spawnChecks: 0, spawned: 0 };
  private readonly depletion: { slot: number; primaryAt?: number; secondaryAt?: number; grenadesAt?: number; stimsAt?: number }[];
  private readonly killsBySlot: number[];
  private readonly aliveBySlot: boolean[];
  private readonly activeSlots: boolean[];
  private readonly lastPositions: ({ x: number; z: number } | undefined)[];

  constructor(mission: MissionInstance, deployed: ReadonlySet<string>) {
    this.startedAt = mission.tick;
    this.operatorsAtDeployment = deployed.size;
    this.objectives = Object.fromEntries(mission.definition.objectives.map(({ id }) => [id, { state: 'locked', staffedTicks: 0 }]));
    this.depletion = mission.players.map((_, slot) => ({ slot }));
    this.killsBySlot = mission.players.map((player) => player?.kills ?? 0);
    this.aliveBySlot = mission.players.map((player) => !!player?.hp);
    this.activeSlots = mission.players.map((player) => !!player && deployed.has(player.id));
    this.lastPositions = mission.players.map((player) => player && { x: player.x, z: player.z });
  }

  event(event: MissionEvent): void {
    switch (event.type) {
      case 'ObjectiveUpdated': {
        const objective = this.objectives[event.id];
        if (!objective || objective.settledAt !== undefined) break;
        const { state, tick, completeAt } = event;
        objective.state = state;
        if (state === 'available') objective.availableAt ??= tick;
        if (state === 'defending') objective.defenseStartedAt ??= tick;
        if (state === 'defending' && completeAt > 0) objective.staffedSince ??= tick;
        else if (objective.staffedSince !== undefined) {
          objective.staffedTicks += tick - objective.staffedSince;
          delete objective.staffedSince;
        }
        if (state === 'complete' || state === 'failed' || state === 'cancelled') objective.settledAt = tick;
        break;
      }
      case 'ExtractionStarted': this.extraction[event.method].starts++; break;
      case 'HordeWaveStarted': this.director.wavesStarted++; break;
      case 'HordeWaveEnded': {
        this.director.waveEnemiesSpawned += event.spawned;
        this.director.waveEnds[event.reason] = (this.director.waveEnds[event.reason] ?? 0) + 1;
        break;
      }
      case 'SwarmNestCreated': this.encounters.nestsCreated++; break;
      case 'SwarmNestDestroyed': this.encounters.nestsDestroyed++; break;
      case 'SwarmBreachStarted': this.encounters.breachStarts++; break;
      case 'ReinforcementCallCompleted': this.encounters.alarmsCompleted++; break;
    }
  }

  step(mission: MissionInstance, state: MissionState, extractionMethod?: ExtractionMethod, lifting = false): void {
    const { tick } = mission;
    this.stateTicks[state] = (this.stateTicks[state] ?? 0) + 1;
    const extraction = extractionMethod && this.extraction[extractionMethod];
    if (extraction) {
      extraction.ticks++;
      if (lifting) extraction.liftTicks++;
      extraction.peakActiveEnemies = Math.max(extraction.peakActiveEnemies, mission.horde.count);
    }
    if (state === 'DEPLOYMENT') {
      for (const player of mission.players) {
        const position = player && this.lastPositions[player.slot];
        if (position && player) { position.x = player.x; position.z = player.z; }
      }
      return;
    }

    const active = mission.horde.count;
    this.population.samples++;
    this.population.activeSum += active;
    this.population.peak = Math.max(this.population.peak, active);
    this.population.spawnChecks = mission.director.spawns.totals.checked;
    this.population.spawned = mission.director.spawns.totals.spawned;
    const pacing = mission.director.pacing;
    const phase = pacing.snapshot();
    if (phase) {
      this.director.phaseTicks[phase.state]++;
      if ((tick - this.startedAt) % NET.tickHz === 0) {
        const { pressure } = pacing.metrics();
        this.director.sampledPressure += pressure;
        this.director.pressureSamples++;
        this.director.peakPressure = Math.max(this.director.peakPressure, pressure);
      }
    }
    let combat = false;
    for (const shot of mission.shots) {
      if (shot.slot !== undefined) combat = true;
      else {
        this.convicts.shots++;
        if (shot.eliminated) this.convicts.kills++;
      }
    }
    for (const event of mission.combatEvents) {
      if (event.type === 'reload' && event.phase === 'RELOAD_START') this.resources.reloadsStarted++;
      if (event.type === 'enemy-hit' && mission.players.some((player) => player?.id === event.target)) {
        this.combat.operatorEnemyDamage += event.amount;
        if (extraction) extraction.operatorEnemyDamage += event.amount;
        combat = true;
      }
      if (event.type === 'melee' || event.type === 'blast' || event.type === 'friendly-fire') combat = true;
    }
    if (combat) this.combat.activeTicks++;
    let moving = false;
    for (const player of mission.players) {
      if (!player || !this.activeSlots[player.slot]) continue;
      const { slot, equipment } = player;
      const previous = this.lastPositions[slot]!;
      moving ||= previous.x !== player.x || previous.z !== player.z;
      previous.x = player.x;
      previous.z = player.z;
      this.combat.kills += player.kills - this.killsBySlot[slot];
      this.killsBySlot[slot] = player.kills;
      const alive = player.hp > 0;
      if (this.aliveBySlot[slot] && !alive) this.combat.deaths++;
      this.aliveBySlot[slot] = alive;
      if (equipment.stimResult === 'completed' && equipment.stimResultAt === tick) this.resources.stimsUsed++;
      if (equipment.action === 'resupply') this.resources.resupplyOperatorTicks++;
      if (!alive) continue;
      const depleted = this.depletion[slot];
      if (!equipment.magazines.primary && !(equipment.slot === 'primary' ? player.ammo : equipment.inactiveAmmo)) depleted.primaryAt ??= tick;
      if (!equipment.magazines.secondary && !(equipment.slot === 'secondary' ? player.ammo : equipment.inactiveAmmo)) depleted.secondaryAt ??= tick;
      if (!equipment.grenades) depleted.grenadesAt ??= tick;
      if (!equipment.stims) depleted.stimsAt ??= tick;
    }
    if (moving) this.movement.movingTicks++;
    else if (!combat) this.movement.stationaryWithoutCombatTicks++;
  }

  snapshot() {
    return structuredClone({ startedAt: this.startedAt, operatorsAtDeployment: this.operatorsAtDeployment,
      stateTicks: this.stateTicks, objectives: this.objectives, interactions: this.interactions, resources: this.resources,
      depletion: this.depletion.filter(({ slot }) => this.activeSlots[slot]), extraction: this.extraction, combat: this.combat,
      population: this.population, director: this.director, encounters: this.encounters, movement: this.movement, party: this.party,
      convicts: this.convicts });
  }
}
