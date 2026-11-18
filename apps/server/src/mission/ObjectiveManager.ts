import { NET, distanceSquared } from '@freefall/shared';
import type { MissionEvent, ObjectiveDefinition, ObjectiveSnapshot, PositionXZ } from '@freefall/shared';

export class ObjectiveManager {
  private readonly definitions: readonly ObjectiveDefinition[];
  private readonly entries = new Map<string, ObjectiveSnapshot>();
  private readonly emit: (event: MissionEvent) => void;

  constructor(definitions: readonly ObjectiveDefinition[], emit: (event: MissionEvent) => void) {
    this.definitions = definitions;
    this.emit = emit;
    for (const { id } of definitions) this.entries.set(id, { id, state: 'locked', progress: 0, completeAt: 0 });
  }

  get allPrimaryComplete(): boolean {
    return this.definitions.every(({ id, kind }) => kind !== 'activate' || this.entries.get(id)?.state === 'complete');
  }

  get defending(): boolean {
    return this.definitions.some(({ id }) => this.entries.get(id)?.state === 'defending');
  }

  private change(state: ObjectiveSnapshot, patch: Partial<ObjectiveSnapshot>, tick: number): void {
    Object.assign(state, patch);
    this.emit({ type: 'ObjectiveUpdated', ...state, tick });
  }

  private unlock(tick: number): void {
    for (const objective of this.definitions) {
      const state = this.entries.get(objective.id)!;
      if (state.state !== 'locked') continue;
      if (objective.kind === 'activate' && objective.requires && this.entries.get(objective.requires)?.state !== 'complete') continue;
      this.change(state, { state: 'available' }, tick);
    }
  }

  start(tick: number): void { this.unlock(tick); }

  interact(position: PositionXZ, tick: number): boolean {
    for (const objective of this.definitions) {
      if (objective.kind !== 'activate' || distanceSquared(position, objective) > objective.radius ** 2) continue;
      const state = this.entries.get(objective.id)!;
      if (state.state !== 'available') continue;
      if (objective.defenseSeconds) {
        this.change(state, { state: 'defending', completeAt: tick + Math.ceil(objective.defenseSeconds * NET.tickHz) }, tick);
      } else {
        this.change(state, { state: 'complete', progress: 1 }, tick);
        this.unlock(tick);
      }
      return true;
    }
    return false;
  }

  update(tick: number, destroyed: number): void {
    let unlock = false;
    for (const objective of this.definitions) {
      const state = this.entries.get(objective.id)!;
      if (state.state === 'defending' && tick >= state.completeAt) {
        this.change(state, { state: 'complete', progress: 1, completeAt: 0 }, tick);
        unlock = true;
      }
      if (objective.kind !== 'destroy-nests' || state.state !== 'available' || destroyed <= state.progress) continue;
      this.change(state, { progress: Math.min(destroyed, objective.count), state: destroyed >= objective.count ? 'complete' : 'available' }, tick);
    }
    if (unlock) this.unlock(tick);
  }

  debugComplete(tick: number): void {
    for (const definition of this.definitions) {
      if (definition.kind !== 'activate') continue;
      this.change(this.entries.get(definition.id)!, { state: 'complete', progress: 1, completeAt: 0 }, tick);
    }
  }

  snapshot(): ObjectiveSnapshot[] { return Array.from(this.entries.values(), (entry) => ({ ...entry })); }
}
