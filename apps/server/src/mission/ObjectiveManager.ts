import { NET, distanceSquared, isOperatorGrounded, isOptionalObjective, objectiveDependencies } from '@freefall/shared';
import type { MissionEvent, ObjectiveDefinition, ObjectiveSnapshot, OperatorPosition, PositionXZ, WorldDefinition } from '@freefall/shared';

export class ObjectiveManager {
  private readonly entries = new Map<string, ObjectiveSnapshot>();
  private readonly destroyedTargets = new Set<string>();
  private defense?: { state: ObjectiveSnapshot; objective: Extract<ObjectiveDefinition, { kind: 'activate' }>;
    duration: number; remaining: number };
  private readonly quotas: readonly Extract<ObjectiveDefinition, { kind: 'destroy-nests' }>[];
  private remainingPrimary = 0;

  private readonly definitions: readonly ObjectiveDefinition[];
  private readonly emit: (event: MissionEvent) => void;

  constructor(definitions: readonly ObjectiveDefinition[], emit: (event: MissionEvent) => void) {
    this.definitions = definitions;
    this.emit = emit;
    this.quotas = definitions.filter((objective): objective is Extract<ObjectiveDefinition, { kind: 'destroy-nests' }> =>
      objective.kind === 'destroy-nests' && !objective.target);
    for (const objective of definitions) {
      this.entries.set(objective.id, { id: objective.id, state: 'locked', progress: 0, completeAt: 0 });
      if (!isOptionalObjective(objective)) this.remainingPrimary++;
    }
  }

  get allPrimaryComplete(): boolean { return this.remainingPrimary === 0; }
  get defending(): boolean { return Boolean(this.defense?.state.completeAt); }

  private change(state: ObjectiveSnapshot, patch: Omit<Partial<ObjectiveSnapshot>, 'id'>, tick: number): void {
    Object.assign(state, patch);
    this.emit({ type: 'ObjectiveUpdated', ...state, tick });
  }

  private complete(objective: ObjectiveDefinition, state: ObjectiveSnapshot, tick: number, progress = 1): void {
    if (state.state !== 'available' && state.state !== 'defending') return;
    this.change(state, { state: 'complete', progress, completeAt: 0 }, tick);
    if (!isOptionalObjective(objective)) this.remainingPrimary--;
  }

  private unlock(tick: number): void {
    for (const objective of this.definitions) {
      const state = this.entries.get(objective.id)!;
      if (state.state !== 'locked' ||
          objectiveDependencies(objective).some((id) => this.entries.get(id)?.state !== 'complete')) continue;
      this.change(state, { state: 'available' }, tick);
      if (this.destroyedTargets.has(objective.id)) {
        this.complete(objective, state, tick);
        this.unlock(tick);
        return;
      }
    }
  }

  start(tick: number): void { this.unlock(tick); }

  interact(position: PositionXZ, tick: number): boolean {
    for (const objective of this.definitions) {
      if (objective.kind !== 'activate' ||
          distanceSquared(position, objective) > objective.radius ** 2) continue;
      const state = this.entries.get(objective.id)!;
      if (state.state !== 'available') continue;
      if (objective.defenseSeconds) {
        if (this.defense) return false;
        const duration = Math.ceil(objective.defenseSeconds * NET.tickHz);
        this.defense = { state, objective, duration, remaining: duration };
        this.change(state, { state: 'defending', completeAt: tick + duration }, tick);
      } else {
        this.complete(objective, state, tick);
        this.unlock(tick);
      }
      return true;
    }
    return false;
  }

  nestDestroyed(position: PositionXZ, tick: number): void {
    for (const objective of this.definitions) {
      if (objective.kind !== 'destroy-nests' || !objective.target ||
          distanceSquared(objective.target, position) !== 0 || this.destroyedTargets.has(objective.id)) continue;
      this.destroyedTargets.add(objective.id);
      const state = this.entries.get(objective.id)!;
      this.complete(objective, state, tick);
    }
    this.unlock(tick);
  }

  update(tick: number, destroyed: number, living: readonly OperatorPosition[] = [], world?: WorldDefinition): void {
    const defense = this.defense;
    if (defense) {
      const { state, objective } = defense;
      const present = !objective.defenseRequiresPresence ||
        living.some((player) => isOperatorGrounded(player, world) && distanceSquared(player, objective) <= objective.radius ** 2);
      if (!present && state.completeAt) {
        defense.remaining = Math.max(1, state.completeAt - tick);
        this.change(state, { completeAt: 0, progress: 1 - defense.remaining / defense.duration }, tick);
      } else if (present && !state.completeAt) {
        this.change(state, { completeAt: tick + defense.remaining }, tick);
      } else if (present && tick >= state.completeAt) {
        this.defense = undefined;
        this.complete(objective, state, tick);
        this.unlock(tick);
      }
    }
    if (!destroyed) return;
    for (const objective of this.quotas) {
      const state = this.entries.get(objective.id)!;
      if (state.state !== 'available' || destroyed <= state.progress) continue;
      if (destroyed >= objective.count) {
        this.complete(objective, state, tick, objective.count);
        this.unlock(tick);
      } else this.change(state, { progress: destroyed }, tick);
    }
  }

  finish(tick: number, success: boolean): void {
    this.defense = undefined;
    for (const objective of this.definitions) {
      const state = this.entries.get(objective.id)!;
      if (state.state === 'complete' || state.state === 'failed' || state.state === 'cancelled') continue;
      this.change(state, { completeAt: 0, state: success || isOptionalObjective(objective) ? 'cancelled' : 'failed' }, tick);
    }
  }

  debugComplete(tick: number): void {
    this.defense = undefined;
    for (const definition of this.definitions) {
      if (isOptionalObjective(definition)) continue;
      this.unlock(tick);
      this.complete(definition, this.entries.get(definition.id)!, tick);
    }
  }

  snapshot(): ObjectiveSnapshot[] { return Array.from(this.entries.values(), (entry) => ({ ...entry })); }
}
