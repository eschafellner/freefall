import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { ARENA_ROOM, BALANCE, BALANCE_VERSION_MESSAGE, BODENBRUCH_ROOM, WIDE_POSITION_SCALE, compareBalanceVersion } from '@freefall/shared';
import type { CombatEvent, HordeSize, MissionAction, MissionDebugAction, MissionEvent, MissionSelection, MissionSnapshot, PlayerInput, PlayersSnapshot, ServerMetrics, ShotEvent } from '@freefall/shared';

export type JoinMode = 'create' | 'quick' | 'code';
export type GameMode = 'mission' | 'arena';

interface MatchHandlers {
  players: (packet: PlayersSnapshot) => void;
  horde: (packet: Uint8Array, scale?: number) => void;
  mission: (packet: MissionSnapshot) => void;
  events: (packet: MissionEvent[]) => void;
  metrics: (packet: ServerMetrics) => void;
  shot: (packet: ShotEvent) => void;
  combat: (packet: CombatEvent[]) => void;
  disconnected: (code: number) => void;
  notice: (message: string) => void;
}

/** Server feedback codes (`mission-feedback`) and their HUD notices. */
const FEEDBACK: Readonly<Record<string, string>> = {
  'balloon-unavailable': 'Ballon nur nach den Hauptzielen auf freier Fläche einsetzbar.',
  'resupply-full': 'Vollständig versorgt',
  'resupply-empty': 'Nachschubcontainer leer',
  'resupply-destroyed': 'Nachschubcontainer zerstört',
  'resupply-offline': 'Nachschub nicht verfügbar',
  'resupply-range': 'Zu weit vom Container entfernt',
  'resupply-busy': 'Aktion läuft bereits',
};

function endpoint(): string {
  if (import.meta.env.VITE_FREEFALL_SERVER) return import.meta.env.VITE_FREEFALL_SERVER;
  return `${location.protocol}//${location.hostname}:2567`;
}

export class Match {
  readonly room: Room;
  pingMs: number | null = null;
  private transfer = 0;
  private lastSample = performance.now();
  private readonly pingTimer: number;

  static async connect(mode: JoinMode, code: string, gamemode: GameMode, handlers: MatchHandlers): Promise<Match> {
    const client = new Client(endpoint());
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
      this.transfer += 16 + JSON.stringify(packet).length;
      handlers.players(packet);
    });
    room.onMessage<Uint8Array>('horde', (packet) => {
      this.transfer += packet.byteLength + 13;
      handlers.horde(packet);
    });
    room.onMessage<Uint8Array>('horde-wide', (packet) => {
      this.transfer += packet.byteLength + 18;
      handlers.horde(packet, WIDE_POSITION_SCALE);
    });
    room.onMessage<MissionSnapshot>('mission-state', (packet) => {
      this.transfer += 16 + JSON.stringify(packet).length;
      handlers.mission(packet);
    });
    room.onMessage<MissionEvent[]>('mission-events', (packet) => {
      this.transfer += 17 + JSON.stringify(packet).length;
      handlers.events(packet);
    });
    room.onMessage<ServerMetrics>('metrics', (packet) => {
      this.transfer += 142;
      handlers.metrics(packet);
    });
    room.onMessage<ShotEvent>('shot', (packet) => {
      this.transfer += 125;
      handlers.shot(packet);
    });
    room.onMessage<CombatEvent[]>('combat', (packet) => {
      this.transfer += 16 + JSON.stringify(packet).length;
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
    room.onDrop(() => handlers.notice('Verbindung unterbrochen. Verbinde erneut …'));
    room.onReconnect(() => handlers.notice('Verbindung wiederhergestellt.'));
    room.onLeave((code) => {
      window.clearInterval(this.pingTimer);
      handlers.disconnected(code);
    });
    room.send(BALANCE_VERSION_MESSAGE);
    this.pingTimer = window.setInterval(() => {
      if (room.connection.isOpen) room.ping((ms) => { this.pingMs = ms; });
    }, 1000);
  }

  input(input: PlayerInput): void {
    if (!this.room.connection.isOpen) return;
    this.room.send('input', input);
    this.transfer += 79;
  }

  setHorde(size: HordeSize): void {
    this.room.send('horde-size', size);
  }

  select(selection: MissionSelection): void { this.room.send('mission-selection', selection); }
  action(action: MissionAction): void { this.room.send('mission-action', action); }
  startMission(): void { this.room.send('mission-start'); }
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
