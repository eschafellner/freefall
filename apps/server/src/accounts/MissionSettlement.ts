import { NET } from '@freefall/shared';
import type { AccountProgress, MissionResult } from '@freefall/shared';
import type { AccountStore, MissionRecord } from './AccountStore.ts';

/**
 * Übersetzt ein `MissionResult` in den Datensatz der Abrechnung. Die Teilnehmerliste ist die beim Start verriegelte
 * Liste (`result.rewards`); Session-IDs werden über `identities` den Accounts zugeordnet. Operator ohne Account
 * (Gastmodus) fallen heraus.
 */
export function missionRecord(result: MissionResult, identities: ReadonlyMap<string, string>): MissionRecord {
  const objectives = result.objectives ?? [];
  return {
    resultId: result.id,
    missionId: result.missionId,
    missionName: result.missionName ?? result.missionId,
    planetId: result.planetId ?? result.procedural?.planetId,
    difficultyId: result.difficultyId,
    outcome: result.outcome ?? (result.extractionSucceeded ? 'extracted' : 'team-lost'),
    primaryObjectivesCompleted: result.primaryObjectivesCompleted,
    extractionMethod: result.extractionMethod,
    objectivesCompleted: objectives.filter(({ state }) => state === 'complete').length,
    objectivesTotal: objectives.length,
    durationSeconds: (result.durationTicks ?? 0) / NET.tickHz,
    balanceHash: result.balanceHash,
    participants: result.rewards.flatMap(({ operatorId, totalExperience, kills }) => {
      const accountId = identities.get(operatorId);
      return accountId ? [{ accountId, experience: totalExperience, extracted: result.extractedOperatorIds.includes(operatorId), kills: kills ?? 0 }] : [];
    }),
  };
}

/**
 * Schreibt Einsätze in die Datenbank. Schlägt das Schreiben fehl (z. B. Datenträger voll), bleibt der Datensatz im
 * Speicher und wird bei jedem weiteren `settle`/`retry` erneut versucht. Die Ergebnis-ID verhindert doppelte Gutschriften.
 */
export class MissionSettlement {
  private readonly store: AccountStore;
  private readonly pending = new Map<string, MissionRecord>();

  constructor(store: AccountStore) { this.store = store; }

  get backlog(): number { return this.pending.size; }

  /** Gutschriften je Account, oder `undefined`, wenn das Ergebnis schon abgerechnet ist oder noch aussteht. */
  settle(record: MissionRecord): Map<string, AccountProgress> | undefined {
    this.retry();
    return this.write(record);
  }

  retry(): void {
    for (const record of [...this.pending.values()]) this.write(record);
  }

  private write(record: MissionRecord): Map<string, AccountProgress> | undefined {
    try {
      const progress = this.store.settleMission(record);
      this.pending.delete(record.resultId);
      return progress;
    } catch (error) {
      if (!this.pending.has(record.resultId)) console.error('[accounts] Einsatz %s nicht abgerechnet, neuer Versuch folgt:', record.resultId, error);
      this.pending.set(record.resultId, record);
      return undefined;
    }
  }
}
