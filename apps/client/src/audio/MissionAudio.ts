import { ALBATROSS, NET, groundHeight } from '@freefall/shared';
import type { MissionEvent, MissionSnapshot, PositionXZ, WorldDefinition } from '@freefall/shared';
import { FlightAudio } from '../rendering/mission/FlightAudio.ts';
import { CarrierAlarm } from './CarrierAlarm.ts';
import type { AudioEngine, AudioPosition } from './AudioEngine.ts';
import { AudioLayers, Takes } from './Soundscape.ts';
import { PRIORITY } from './VoiceBudget.ts';
import { MusicPlayer, musicCue } from './Music.ts';

export interface AudioTransport {
  ship?: AudioPosition;
  recovery?: AudioPosition;
}

export { EventHistory as AudioEventHistory } from '../networking/EventHistory.ts';

const AIR_RANGE = [ALBATROSS.halfWidth * 3, 152] as const;

export class MissionAudio {
  private readonly engine: AudioEngine;
  private readonly flight: FlightAudio;
  private readonly alarm: CarrierAlarm;
  private readonly layers: AudioLayers;
  private readonly takes = new Takes();
  readonly music: MusicPlayer;
  private previous?: MissionSnapshot;
  private pendingAlert?: { id: string; expires: number; urgent: boolean };
  private nextNest = 0;
  private nextAlert = 0;

  constructor(engine: AudioEngine) {
    this.engine = engine;
    this.flight = new FlightAudio(engine);
    this.alarm = new CarrierAlarm(engine);
    this.layers = new AudioLayers(engine);
    this.music = new MusicPlayer(engine);
  }

  warm(): void { this.engine.preload(['radio', 'confirm', 'lander', 'recovery', 'hull-impact']); }

  alert(id: 'radio' | 'confirm', urgent = false): void {
    const now = performance.now();
    if (!this.engine.running || (!urgent && (now < this.nextAlert || this.pendingAlert?.urgent))) return;
    this.pendingAlert = { id, expires: now + 800, urgent };
    this.flushAlert(now);
  }

  private flushAlert(now: number): void {
    const alert = this.pendingAlert;
    if (!alert) return;
    if (now >= alert.expires) { this.pendingAlert = undefined; return; }
    if (now < this.nextAlert && !alert.urgent) return;
    if (!this.engine.assets.get(alert.id)) { this.engine.preload([alert.id]); return; }
    const played = this.engine.play(alert.id, { bus: 'ui', level: alert.urgent ? .91 : .66,
      priority: PRIORITY.alert, owner: 'mission-alert' });
    if (played) {
      this.engine.duck(alert.urgent ? 1.05 : .50);
      this.nextAlert = now + 360;
    }
    this.pendingAlert = undefined;
  }

  snapshot(state: MissionSnapshot): void {
    const previous = this.previous;
    this.previous = state;
    this.flight.update(state);
    if (!previous) return;
    if (state.result && state.result.id !== previous.result?.id) this.alert(state.result.extractionSucceeded ? 'confirm' : 'radio', true);
    else if (state.extraction && (state.extraction.method !== previous.extraction?.method ||
        state.extraction.phase !== previous.extraction?.phase)) {
      this.alert(state.extraction.phase === 'LIFT' ? 'confirm' : 'radio', true);
    } else if (state.state === 'EXTRACTION_AVAILABLE' && state.state !== previous.state) this.alert('confirm', true);
    else if (state.objectives.some(({ id, state }) => state === 'defending' &&
        previous.objectives.some((objective) => objective.id === id && objective.state !== 'defending'))) this.alert('radio');
  }

  /** Plays a cue admitted by MissionPresentation. */
  event(event: MissionEvent, state: MissionSnapshot, world: WorldDefinition, listener: AudioPosition): void {
    switch (event.type) {
      case 'ObjectiveUpdated':
        if (event.state === 'complete' || event.state === 'failed') this.alert(event.state === 'complete' ? 'confirm' : 'radio');
        break;
      case 'ReinforcementCallStarted': this.alert('radio'); break;
      case 'ReinforcementCallInterrupted':
        if (event.reason === 'caller-killed') this.alert('confirm');
        break;
      case 'SwarmBreachStarted':
        this.cue('schabe-hiss', 3, event.position, listener, world, .62, 63, .64);
        break;
      case 'SwarmNestDestroyed': {
        const nest = event.position ?? state.nests.find(({ id }) => id === event.nestId);
        if (nest) this.cue('schabe-impact', 2, nest, listener, world, .80, 62, .70);
        break;
      }
      case 'AlbatrossTouchdown':
        this.hull(event.position, listener, world, .88, .76);
        break;
      case 'AlbatrossDamaged':
        if (state.albatross) this.hull(state.albatross, listener, world, .56, .92);
        break;
    }
  }

  update(now: number, tick: number, state: MissionSnapshot, transport: AudioTransport, listener: AudioPosition, world: WorldDefinition): void {
    this.flushAlert(now);
    this.alarm.update(state.result ? undefined : state);
    this.music.update(musicCue(state, tick, this.music.current), state.instanceId);
    const flying = state.state === 'DEPLOYMENT' && state.phase !== 'DOCKED';
    const lifting = state.extraction?.method === 'albatross' && state.extraction.phase === 'LIFT';
    const operational = state.albatross?.lifecycleState === 'OPERATIONAL' || state.albatross?.lifecycleState === 'DAMAGED';
    const ship = !state.result && (flying || lifting || operational) ? transport.ship : undefined;
    this.layers.set('ship', ship ? 'lander' : undefined, 'environment',
      (flying || lifting ? .85 : state.albatross?.lifecycleState === 'DAMAGED' ? .23 : .30), 1.2, ship, AIR_RANGE);
    const recovery = state.result ? undefined : transport.recovery;
    this.layers.set('recovery', recovery ? 'recovery' : undefined, 'environment',
      .79, .9, recovery, AIR_RANGE, 6.1);

    if (tick < this.nextNest || state.result || state.state === 'DEPLOYMENT') return;
    this.nextNest = tick + NET.tickHz * (3.2 + Math.random() * 4.7);
    let closest = 46, candidate: MissionSnapshot['nests'][number] | undefined;
    for (const nest of state.nests) {
      if (nest.state !== 'ACTIVE' && nest.state !== 'DAMAGED' && nest.state !== 'EMERGING') continue;
      const distance = Math.hypot(nest.x - listener.x, nest.z - listener.z);
      if (distance >= closest) continue;
      closest = distance; candidate = nest;
    }
    if (candidate) this.cue('schabe-chitter', 3, candidate, listener, world,
      tick - candidate.lastSpawnAt < NET.tickHz * 2 ? .61 : .37, 46, .60);
  }

  private hull(source: PositionXZ, listener: AudioPosition, world: WorldDefinition, level: number, pitch: number): void {
    if (Math.hypot(source.x - listener.x, source.z - listener.z) > 75) return;
    this.engine.play('hull-impact', { bus: 'environment', level, pitch, priority: PRIORITY.combat,
      position: { x: source.x, y: groundHeight(world, source.x, source.z) + 1, z: source.z }, range: [8, 75] });
  }

  private cue(prefix: string, count: number, source: PositionXZ, listener: AudioPosition, world: WorldDefinition,
    level: number, radius: number, pitch: number): void {
    if (Math.hypot(source.x - listener.x, source.z - listener.z) >= radius) return;
    this.engine.play(this.takes.pick(prefix, prefix, count), { bus: 'environment', level, pitch,
      priority: PRIORITY.world, position: { x: source.x, y: groundHeight(world, source.x, source.z) + .6, z: source.z },
      range: [5, radius] });
  }

  clear(): void {
    this.flight.clear();
    this.alarm.clear();
    this.music.stop();
    this.layers.clear();
    this.takes.clear();
    this.previous = this.pendingAlert = undefined;
    this.nextNest = this.nextAlert = 0;
  }
}
