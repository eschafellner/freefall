import { NET, missionObjectives } from '@freefall/shared';
import type { MissionEvent, MissionSnapshot } from '@freefall/shared';
import { EventHistory } from '../networking/EventHistory.ts';

const PRIORITY = { information: 0, resupply: 1, objective: 2, extraction: 3, damage: 4 };
type Channel = keyof typeof PRIORITY;
interface Notice { text: string; channel: Channel; expires: number; identity: string }
const MAX_NOTICES = 4;
const FRESH_TICKS = NET.tickHz * 2;

export class PresentationNotices {
  private readonly pending: Notice[] = [];

  offer(text: string, channel: Channel, now: number, duration = 2600, identity = text): void {
    this.current(now);
    if (this.pending.some((notice) => notice.identity === identity)) return;
    this.pending.push({ text, channel, expires: now + duration, identity });
    this.pending.sort((a, b) => PRIORITY[b.channel] - PRIORITY[a.channel]);
    this.pending.length = Math.min(MAX_NOTICES, this.pending.length);
  }

  current(now: number): string {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].expires <= now) this.pending.splice(i, 1);
    }
    return this.pending[0]?.text ?? '';
  }

  clear(): void { this.pending.length = 0; }
}

const methodName = (method: 'balloon' | 'albatross') => method === 'balloon' ? 'Rettungsballon' : 'Albatross 02';

/** Short-lived cues use confirmed events. All persistent UI reads the current snapshot independently. */
export class MissionPresentation {
  private readonly history = new EventHistory(FRESH_TICKS);
  private readonly notices: PresentationNotices;
  private previous?: MissionSnapshot;
  private floor = -1;

  constructor(notices: PresentationNotices) { this.notices = notices; }

  snapshot(state: MissionSnapshot, now: number): void {
    const previous = this.previous;
    this.previous = state;
    if (!previous || previous.instanceId !== state.instanceId) {
      this.floor = state.tick;
      this.history.clear();
      this.notices.clear();
      return;
    }
    if (state.result || state.state === 'RETURN_TO_CARRIER') {
      this.notices.clear();
      return;
    }
    if (state.state === 'EXTRACTION_AVAILABLE' && previous.state !== state.state) {
      this.notices.offer('Extraktion verfügbar', 'extraction', now);
    }
    const extraction = state.extraction;
    const before = previous.extraction;
    if (extraction && (!before || before.method !== extraction.method || before.phaseAt !== extraction.phaseAt)) {
      const label = extraction.phase === 'LIFT' ? 'Abflug'
        : extraction.phase === 'APPROACH' ? 'Rettungsjäger im Anflug'
        : before?.method === extraction.method ? 'Neuer Anflug · Am Seil sichern' : 'Extraktion läuft';
      this.notices.offer(methodName(extraction.method) + ' · ' + label, 'extraction', now);
    }
    const hasSupply = (entry: MissionSnapshot) => entry.albatross?.supply?.some(({ state }) => state === 'READY');
    if (state.state === 'ACTIVE_MISSION' && previous.state !== state.state && hasSupply(state)) {
      this.notices.offer('Nachschub an Albatross 02 verfügbar', 'resupply', now);
    }
    if (state.convicts.some((convict) => convict.hp <= 0 &&
        previous.convicts.some(({ id, hp }) => id === convict.id && hp > 0))) {
      this.notices.offer('Convict ausgefallen', 'objective', now);
    }
  }

  event(event: MissionEvent, head: number, now: number): boolean {
    const state = this.previous;
    if (!state?.instanceId || state.result || event.tick <= this.floor ||
        (event.instanceId !== undefined && event.instanceId !== state.instanceId)) return false;
    const subject = 'nestId' in event ? event.nestId : 'entityId' in event ? event.entityId :
      'id' in event ? event.id : 'groupId' in event ? event.groupId : 'waveId' in event ? event.waveId : '';
    const key = event.sequence === undefined ? [event.tick, event.type, subject].join('/') : String(event.sequence);
    if (!this.history.accept(event.tick, key, head)) return false;
    switch (event.type) {
      case 'ObjectiveUpdated': {
        // A delayed progress update must not replace a newer authoritative state.
        const current = state.objectives.find(({ id }) => id === event.id);
        if (event.tick < state.tick && current?.state !== event.state) return false;
        const label = missionObjectives(state).find(({ id }) => id === event.id)?.label ?? 'Missionsziel';
        const text = event.state === 'complete' ? 'erfüllt' : event.state === 'failed' ? 'gescheitert'
          : event.state === 'defending' && current?.state !== 'defending' ? 'Verteidigung läuft' : '';
        if (text) this.notices.offer(label + ' · ' + text, 'objective', now, 3200);
        break;
      }
      case 'SwarmNestDestroyed': this.notices.offer('Schwarmnest zerstört', 'objective', now, 2600, key); break;
      case 'AlbatrossTouchdown': this.notices.offer('Albatross 02 setzt auf', 'information', now); break;
      case 'ReinforcementCallStarted': this.notices.offer('Verstärkungsruf erkannt', 'information', now); break;
      case 'ReinforcementCallInterrupted':
        if (event.reason === 'caller-killed') this.notices.offer('Verstärkungsruf unterbrochen', 'information', now);
        break;
    }
    return true;
  }

  fence(tick: number): void { this.floor = Math.max(tick, this.floor); }

  reset(): void {
    this.previous = undefined;
    this.floor = -1;
    this.history.clear();
    this.notices.clear();
  }
}
