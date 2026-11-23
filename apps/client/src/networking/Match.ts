import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { ACCOUNT_PROGRESS_MESSAGE, ARENA_ROOM, BALANCE, BALANCE_VERSION_MESSAGE, BODENBRUCH_ROOM, LOADOUT_MESSAGE, ROSTER_MESSAGE, WEATHER_VERSION, WIDE_POSITION_SCALE, compareBalanceVersion, validAtmosphereState } from '@freefall/shared';
import type { AccountProgress, LoadoutReply, LoadoutSelection, RosterEntry } from '@freefall/shared';
import type { AtmosphereState, CombatEvent, HordeSize, MissionAction, MissionDebugAction, MissionEvent, MissionGenerationSelection, MissionPlan, MissionSnapshot, PlayerInput, PlayersSnapshot, ServerMetrics, ShotEvent } from '@freefall/shared';

export type JoinMode = 'create' | 'quick' | 'code';
export type GameMode = 'mission' | 'arena';

interface MatchHandlers {
  players: (packet: PlayersSnapshot) => boolean;
  horde: (packet: Uint8Array, scale?: number) => void;
  mission: (packet: MissionSnapshot) => void;
  events: (packet: MissionEvent[]) => void;
  metrics: (packet: ServerMetrics) => void;
  shot: (packet: ShotEvent) => void;
  combat: (packet: CombatEvent[]) => void;
  roster: (packet: RosterEntry[]) => void;
  progress: (packet: AccountProgress) => void;
  loadout: (packet: LoadoutReply) => void;
  dropped: () => void;
  disconnected: (code: number) => void;
  notice: (message: string) => void;
}

/** Server feedback codes (`mission-feedback`) and their HUD notices. */
const FEEDBACK: Readonly<Record<string, string>> = {
  'generation-failed': 'Auftrag konnte nicht erzeugt werden. Die Missionskonsole behält ihre letzte gültige Auswahl.',
  'balloon-pickup-zone': 'Ballon am markierten Sammelpunkt einsetzen.',
  'balloon-unavailable': 'Ballon nur nach den Hauptzielen auf freier Fläche einsetzbar.',
  'extraction-posture': 'Zum Sichern für die Extraktion erst aufrichten.',
  'resupply-full': 'Vollständig versorgt',
  'resupply-empty': 'Nachschubcontainer leer',
  'resupply-destroyed': 'Nachschubcontainer zerstört',
  'resupply-offline': 'Nachschub nicht verfügbar',
  'resupply-range': 'Zu weit vom Container entfernt',
  'resupply-busy': 'Aktion läuft bereits',
  'resupply-reloading': 'Erst nachladen, dann Nachschub aufnehmen',
  'resupply-posture': 'Nachschub in dieser Haltung nicht möglich',
};

export function endpoint(): string {
  if (import.meta.env.VITE_FREEFALL_SERVER) return import.meta.env.VITE_FREEFALL_SERVER;
  return `${location.protocol}//${location.hostname}:2567`;
}

export class Match {
  readonly room: Room;
  atmosphere?: AtmosphereState;
  pingMs: number | null = null;
  measureTraffic = false;
  private transfer = 0;
  private lastSample = performance.now();
  private readonly pingTimer: number;
  private plan?: MissionPlan;
  private pendingMission?: MissionSnapshot;

  static async connect(mode: JoinMode, code: string, gamemode: GameMode, handlers: MatchHandlers, token?: string): Promise<Match> {
    const client = new Client(endpoint());
    // Sitzungstoken des Accounts. Der Server prüft es in `onAuth`.
    if (token) client.http.authToken = token;
    const roomType = gamemode === 'mission' ? BODENBRUCH_ROOM : ARENA_ROOM;
    const room = mode === 'code' ? await client.joinById(code)
      : mode === 'create' ? await client.create(roomType)
      : await client.joinOrCreate(roomType);
    return new Match(room, handlers);
  }

  private constructor(room: Room, handlers: MatchHandlers) {
    this.room = room;
    room.reconnection.enabled = room.name === BODENBRUCH_ROOM;
    room.reconnection.minUptime = 0;
    room.reconnection.maxEnqueuedMessages = 0;
    room.onMessage<PlayersSnapshot>('players', (packet) => {
      if (this.measureTraffic) this.transfer += 16 + JSON.stringify(packet).length;
      handlers.players(packet);
    });
    room.onMessage<Uint8Array>('horde', (packet) => {
      if (this.measureTraffic) this.transfer += packet.byteLength + 13;
      handlers.horde(packet);
    });
    room.onMessage<Uint8Array>('horde-wide', (packet) => {
      if (this.measureTraffic) this.transfer += packet.byteLength + 18;
      handlers.horde(packet, WIDE_POSITION_SCALE);
    });
    room.onMessage<unknown>('atmosphere-state', (packet) => {
      if (this.measureTraffic) this.transfer += 19 + JSON.stringify(packet).length;
      this.atmosphere = validAtmosphereState(packet) ? packet : undefined;
    });
    let weatherHandshake = false;
    room.onMessage<MissionSnapshot>('mission-state', (packet) => {
      if (this.measureTraffic) this.transfer += 16 + JSON.stringify(packet).length;
      if (!weatherHandshake && packet.atmosphereVersion === WEATHER_VERSION) {
        weatherHandshake = true;
        room.send('atmosphere-state');
      }
      const previous = this.pendingMission?.planId;
      if (packet.planId && this.plan?.id !== packet.planId) {
        this.pendingMission = packet;
        if (packet.planId !== previous) room.send('mission-plan', packet.planId);
        return;
      }
      this.pendingMission = undefined;
      if (packet.planId) packet.plan = this.plan;
      else this.plan = undefined;
      handlers.mission(packet);
    });
    room.onMessage<MissionPlan>('mission-plan', (plan) => {
      if (this.measureTraffic) this.transfer += 16 + JSON.stringify(plan).length;
      const snapshot = this.pendingMission;
      if (!snapshot || plan.id !== snapshot.planId) return;
      this.plan = plan;
      this.pendingMission = undefined;
      handlers.mission({ ...snapshot, plan });
    });
    room.onMessage<MissionEvent[]>('mission-events', (packet) => {
      if (this.measureTraffic) this.transfer += 17 + JSON.stringify(packet).length;
      handlers.events(packet);
    });
    room.onMessage<ServerMetrics>('metrics', (packet) => {
      if (this.measureTraffic) this.transfer += 142;
      handlers.metrics(packet);
    });
    room.onMessage<ShotEvent>('shot', (packet) => {
      if (this.measureTraffic) this.transfer += 8 + JSON.stringify(packet).length;
      handlers.shot(packet);
    });
    room.onMessage<RosterEntry[]>(ROSTER_MESSAGE, (packet) => {
      if (Array.isArray(packet)) handlers.roster(packet);
    });
    room.onMessage<LoadoutReply>(LOADOUT_MESSAGE, (packet) => {
      if (packet && typeof packet === 'object' && ('selection' in packet || 'error' in packet)) handlers.loadout(packet);
    });
    room.onMessage<AccountProgress>(ACCOUNT_PROGRESS_MESSAGE, (packet) => {
      if (packet && typeof packet.resultId === 'string') handlers.progress(packet);
    });
    room.onMessage<CombatEvent[]>('combat', (packet) => {
      if (this.measureTraffic) this.transfer += 16 + JSON.stringify(packet).length;
      if (Array.isArray(packet)) handlers.combat(packet);
    });
    // Display values (ammo, names, timings) come from the bundled registry. The server stays authoritative.
    room.onMessage<unknown>(BALANCE_VERSION_MESSAGE, (version) => {
      const check = compareBalanceVersion(BALANCE.version, version);
      if (check.status === 'match') return;
      console.warn('[balance]', check.message);
      handlers.notice(check.message);
    });
    room.onMessage<string>('mission-feedback', (code) => {
      const message = FEEDBACK[code];
      if (message) handlers.notice(message);
    });
    room.onDrop(() => {
      this.pendingMission = undefined;
      handlers.dropped();
      handlers.notice('Verbindung unterbrochen. Verbinde erneut …');
    });
    room.onReconnect(() => {
      room.send('sync-state');
      if (weatherHandshake) room.send('atmosphere-state');
      handlers.notice('Verbindung wiederhergestellt.');
    });
    room.onLeave((code) => {
      window.clearInterval(this.pingTimer);
      handlers.disconnected(code);
    });
    room.send(BALANCE_VERSION_MESSAGE);
    room.send('sync-state');
    this.pingTimer = window.setInterval(() => {
      if (room.connection.isOpen) room.ping((ms) => { this.pingMs = ms; });
    }, 1000);
  }

  input(input: PlayerInput): void {
    if (!this.room.connection.isOpen) return;
    this.room.send('input', input);
    if (this.measureTraffic) this.transfer += 79;
  }

  setHorde(size: HordeSize): void {
    this.room.send('horde-size', size);
  }

  select(selection: MissionGenerationSelection): void { this.room.send('mission-selection', selection); }
  setLoadout(selection: LoadoutSelection): void { this.room.send(LOADOUT_MESSAGE, selection); }
  action(action: MissionAction): void { this.room.send('mission-action', action); }
  startMission(planId?: string): void { this.room.send('mission-start', planId); }
  cancelBoarding(): void { this.room.send('mission-cancel'); }
  interact(): void { this.room.send('mission-interact'); }
  debug(action: MissionDebugAction): void { this.room.send('mission-debug', action); }

  rate(): number {
    const now = performance.now();
    const result = this.transfer / Math.max(1, now - this.lastSample) * 1000;
    this.lastSample = now;
    this.transfer = 0;
    return result;
  }
}
