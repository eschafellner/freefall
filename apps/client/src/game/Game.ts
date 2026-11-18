import {
  BODENBRUCH, BODENBRUCH_ROOM, CARRIER_CONSOLE, CARRIER_ROOMS, CARRIER_SHIP, CARRIER_WORLD, MISSION_REGISTRY,
  NET, distanceSquared, inAlbatross, isCarrierScene, missionGround,
} from '@freefall/shared';
import type { HordeSize, MissionAction, MissionDebugAction, MissionSelection, MissionSnapshot, PlayerState, ServerMetrics } from '@freefall/shared';
import { DesktopInput } from '../input/DesktopInput.ts';
import { Match } from '../networking/Match.ts';
import type { GameMode, JoinMode } from '../networking/Match.ts';
import type { QualityName } from '../rendering/GraphicsQuality.ts';
import { FlightAudio } from '../rendering/mission/FlightAudio.ts';
import { ArenaView } from '../rendering/ArenaView.ts';
import { Prediction } from './Prediction.ts';
import { MatchTimeline } from './Timeline.ts';

export interface GameStatus {
  roomId: string;
  ownId: string;
  ready: boolean;
  locked: boolean;
  host: boolean;
  players: PlayerState[];
  metrics?: ServerMetrics;
  missionRoom: boolean;
  atConsole: boolean;
  mission?: MissionSnapshot;
  serverTick: number;
  interaction: string;
  notice: string;
  fps: number;
  frameMs: number;
  cpuMs: number;
  gpuMs: number | null;
  drawCalls: number;
  triangles: number;
  meshes: number;
  instances: number;
  geometries: number;
  textures: number;
  visibleEnemies: number;
  activeEnemies: number;
  ping: number | null;
  bytesPerSecond: number;
  hit: boolean;
  eliminated: boolean;
  hurt: boolean;
  respawn: number;
}

const STEP = 1000 / NET.tickHz;

export const INITIAL_STATUS: GameStatus = {
  roomId: '', ownId: '', ready: false, locked: false, host: false, players: [],
  missionRoom: false, atConsole: false, serverTick: 0, interaction: '', notice: '',
  fps: 0, frameMs: 0, cpuMs: 0, gpuMs: null, drawCalls: 0, triangles: 0, meshes: 0, instances: 0,
  geometries: 0, textures: 0, visibleEnemies: 0, activeEnemies: 0, ping: null,
  bytesPerSecond: 0, hit: false, eliminated: false, hurt: false, respawn: 0,
};

export class Game {
  private readonly view: ArenaView;
  private readonly input: DesktopInput;
  private readonly publish: (status: GameStatus) => void;
  private readonly error: (message: string) => void;
  private timeline = new MatchTimeline();
  private prediction = new Prediction();
  private status = { ...INITIAL_STATUS };
  private match: Match | undefined;
  private connecting = false;
  private disposed = false;
  private seq = 0;
  private frame = 0;
  private last = performance.now();
  private elapsed = 0;
  private sampleAt = this.last;
  private frames = 0;
  private cpuTotal = 0;
  private hitUntil = 0;
  private killUntil = 0;
  private hurtUntil = 0;
  private hp = 0;
  private tick = 0;
  private readonly heardBlasts = new Set<number>();
  private tickAt = 0;
  private noticeUntil = 0;
  private debugRoutes = false;
  private lastLife = 0;
  private readonly sound = new FlightAudio();
  private readonly surface = missionGround(BODENBRUCH.world);

  constructor(container: HTMLElement, publish: (status: GameStatus) => void, error: (message: string) => void, quality: QualityName) {
    this.publish = publish;
    this.error = error;
    this.view = new ArenaView(container, quality);
    this.input = new DesktopInput(this.view.canvas, (locked) => {
      this.status.locked = locked;
      this.emit();
    }, () => this.error('Maus konnte nicht erfasst werden. Klicke erneut auf „Einsatz betreten“.'),
    () => {
      if (this.match) this.match.input(this.input.sample(++this.seq, true));
    }, () => this.interact(), () => this.action('balloon'));
    this.frame = requestAnimationFrame(this.draw);
  }

  async connect(mode: JoinMode, code: string, gamemode: GameMode): Promise<void> {
    if (this.match || this.connecting || this.disposed) return;
    this.connecting = true;
    try {
      const match = await Match.connect(mode, code, gamemode, {
        players: (packet) => {
          if (!this.match) return;
          this.timeline.players.push(packet);
          this.status.host = packet.host === this.status.ownId;
          this.status.players = packet.players;
          this.tick = packet.tick;
          this.tickAt = performance.now();
          const own = packet.players.find((player) => player.id === this.status.ownId);
          if (!own) return;
          if (this.status.ready && own.hp < this.hp) this.hurtUntil = performance.now() + 200;
          this.hp = own.hp;
          for (const g of packet.grenades ?? []) {
            if (packet.tick >= g.detonates && !this.heardBlasts.has(g.id)) {
              const distance = Math.hypot(own.x - g.x, own.z - g.z);
              this.sound.combat('blast', distance);
              this.view.blast(distance);
              this.heardBlasts.add(g.id);
            }
          }
          for (const id of this.heardBlasts) {
            if (!packet.grenades?.some((g) => g.id === id)) this.heardBlasts.delete(id);
          }
          if (own.life !== this.lastLife) {
            this.input.yaw = own.yaw;
            this.lastLife = own.life;
          }
          this.prediction.confirm(own);
          if (!this.status.ready) {
            this.status.ready = true;
            this.input.yaw = own.yaw;
            this.emit();
          }
        },
        horde: (packet, scale) => this.timeline.receiveHorde(packet, scale),
        mission: (packet) => {
          if (!this.match) return;
          const firstResult = !this.status.mission?.result && packet.result;
          this.status.mission = packet;
          this.sound.update(packet);
          const carrier = isCarrierScene(packet.state, packet.phase);
          this.prediction.world = carrier ? CARRIER_WORLD : this.surface;
          const extraction = packet.extraction;
          const secured = !!extraction?.securedIds.includes(this.status.ownId);
          this.prediction.frozen = packet.state === 'DEPLOYMENT' || !!packet.result || (secured && extraction?.phase === 'LIFT');
          this.prediction.tether = secured && extraction?.method === 'balloon' ? extraction : undefined;
          if (firstResult && this.input.locked) document.exitPointerLock();
          this.emit();
        },
        events: (packet) => {
          for (const event of packet) {
            if (event.type === 'ReinforcementCallInterrupted' && event.reason === 'caller-killed') {
              this.status.notice = 'Verstärkungsruf unterbrochen';
              this.noticeUntil = performance.now() + 2500;
            }
          }
        },
        metrics: (metrics) => { this.status.metrics = metrics; },
        shot: (shot) => {
          const now = performance.now();
          this.view.shot(shot, now);
          const shooter = this.status.players.find((p) => p.id === shot.shooter);
          const distance = Math.hypot(shot.fromX - this.prediction.position.x, shot.fromZ - this.prediction.position.z);
          this.sound.combat(shooter?.equipment?.slot === 'secondary' ? 'pistol' : 'rifle', distance);
          if ((shot.enemy || shot.nest) && shot.shooter === this.status.ownId) {
            this.hitUntil = now + 130;
            if (shot.eliminated) this.killUntil = now + 300;
          }
        },
        notice: (message) => {
          this.status.notice = message;
          this.noticeUntil = performance.now() + 3200;
          this.emit();
        },
        disconnected: (code) => {
          if (this.disposed) return;
          this.resetMatch();
          if (code !== 4000) this.error('Verbindung zum Spielserver getrennt. Du kannst dem Raum erneut beitreten.');
        },
      });
      if (this.disposed) {
        void match.room.leave();
        return;
      }
      this.match = match;
      this.status.roomId = match.room.roomId;
      this.status.ownId = match.room.sessionId;
      this.status.missionRoom = match.room.name === BODENBRUCH_ROOM;
      if (this.status.missionRoom) {
        this.input.yaw = BODENBRUCH.world.deployment.facing;
        this.prediction.world = CARRIER_WORLD;
        this.view.setMission(BODENBRUCH);
      }
      this.emit();
    } finally {
      this.connecting = false;
    }
  }

  lock(): void {
    if (!this.match || !this.status.ready || (this.status.missionRoom &&
        (!this.status.mission || this.status.mission.result))) return;
    this.sound.resume();
    if (typeof this.view.canvas.requestPointerLock !== 'function') {
      this.error('Dieser Browser unterstützt keine Mauserfassung. Verwende einen Desktop-Browser mit Pointer Lock.');
      return;
    }
    this.input.lock();
  }

  setQuality(quality: QualityName): void {
    this.view.setQuality(quality);
  }

  setHorde(size: HordeSize): void {
    if (this.status.host) this.match?.setHorde(size);
  }

  select(selection: MissionSelection): void { if (this.status.host) this.match?.select(selection); }
  action(action: MissionAction): void { this.match?.action(action); }

  private interact(): void {
    if (!this.status.missionRoom) return;
    const mission = this.status.mission;
    if (!mission) return;
    if (mission.state === 'CARRIER_HUB' || mission.state === 'MISSION_SELECTION') {
      if (distanceSquared(this.prediction.position, CARRIER_CONSOLE) <= CARRIER_CONSOLE.radius ** 2) {
        this.status.atConsole = true;
        if (this.input.locked) document.exitPointerLock();
        this.emit();
      } else {
        const room = CARRIER_ROOMS.find((entry) => distanceSquared(this.prediction.position, entry) < 5 ** 2);
        if (room) {
          this.status.notice = 'System noch nicht verfügbar';
          this.noticeUntil = performance.now() + 2200;
          this.emit();
        }
      }
      return;
    }
    this.match?.interact();
  }
  startMission(): void { if (this.status.host) this.match?.startMission(); }
  debug(action: MissionDebugAction): void { if (this.status.host && this.status.mission?.debug) this.match?.debug(action); }
  toggleRoutes(): void { if (this.status.mission?.debug) this.debugRoutes = !this.debugRoutes; }

  async leave(): Promise<void> {
    await this.match?.room.leave();
  }

  private resetMatch(): void {
    this.match = undefined;
    this.heardBlasts.clear();
    this.view.clearMatch();
    this.status = { ...INITIAL_STATUS };
    this.timeline = new MatchTimeline();
    this.prediction = new Prediction();
    this.input.yaw = 0;
    this.input.pitch = -0.12;
    this.seq = 0;
    this.tickAt = this.noticeUntil = 0;
    this.debugRoutes = false;
    this.lastLife = 0;
    this.hp = this.tick = this.hitUntil = this.killUntil = this.hurtUntil = 0;
    if (this.input.locked) document.exitPointerLock();
    this.emit();
  }

  private emit(): void {
    this.publish({ ...this.status });
  }

  private interaction(): string {
    const mission = this.status.mission;
    const definition = mission && MISSION_REGISTRY.get(mission.missionId);
    if (!mission || !definition || this.hp <= 0) return '';
    const position = this.prediction.position;
    if (mission.state === 'CARRIER_HUB' || mission.state === 'MISSION_SELECTION') {
      if (distanceSquared(position, CARRIER_CONSOLE) <= CARRIER_CONSOLE.radius ** 2) return 'Missionskonsole öffnen';
      return CARRIER_ROOMS.some((entry) => distanceSquared(position, entry) < 5 ** 2) ? 'Station prüfen' : '';
    }
    if (mission.state === 'BOARDING' && inAlbatross(position, CARRIER_SHIP)) {
      return mission.operators.some(({ id, ready }) => id === this.status.ownId && ready)
        ? 'Bereitschaft zurücknehmen' : 'Bereit melden';
    }
    if (mission.state === 'EXTRACTION_AVAILABLE' && mission.albatross?.extractionAvailable && inAlbatross(position, mission.albatross))
      return 'Albatross-Start anfordern';
    const extraction = mission.extraction;
    if (mission.state === 'EXTRACTION_IN_PROGRESS' && extraction?.phase !== 'LIFT' && extraction &&
      !extraction.securedIds.includes(this.status.ownId) &&
      (extraction.method === 'albatross' ? inAlbatross(position, extraction) : distanceSquared(position, extraction) <= extraction.radius ** 2))
      return extraction.method === 'balloon' ? 'Am Rettungsseil sichern' : 'Für Abflug sichern';
    if (mission.state !== 'ACTIVE_MISSION') return '';
    for (const objective of definition.objectives) {
      if (objective.kind !== 'activate' || distanceSquared(objective, position) > objective.radius ** 2) continue;
      if (mission.objectives.some(({ id, state }) => id === objective.id && state === 'available')) {
        return objective.label.replace('Kommunikationsanlage ', '') + ' aktivieren';
      }
    }
    return '';
  }

  private readonly draw = (now: number): void => {
    const cpuStart = performance.now();
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    this.elapsed += dt * 1000;
    const steps = Math.floor(this.elapsed / STEP);
    this.elapsed -= steps * STEP;
    if (this.match?.room.connection.isOpen) {
      for (let i = 0; i < steps; i++) {
        const input = this.input.sample(++this.seq, false, this.lastLife);
        this.prediction.step(input);
        this.match.input(input);
      }
    }
    this.prediction.sample(dt);
    const { players, horde } = this.timeline;
    players.sample(now);
    horde.sample(now);
    const mission = this.status.mission;
    const missionTick = Math.max(mission?.tick ?? 0, this.tick + Math.min(3, Math.max(0, (now - this.tickAt) / STEP)));
    this.view.draw(
      now, dt, this.prediction.rendered, this.input.yaw, this.input.pitch, this.status.ownId, this.hp > 0,
      players.before, players.after, players.alpha, horde.before, horde.after, horde.alpha,
      this.input.aim, this.input.sprint, players.latest,
      mission, missionTick, this.status.locked && !mission?.result, this.debugRoutes,
    );
    this.cpuTotal += performance.now() - cpuStart;
    this.frames++;
    const hit = now < this.hitUntil;
    const eliminated = now < this.killUntil;
    const hurt = now < this.hurtUntil;
    const feedbackChanged = this.status.hit !== hit || this.status.eliminated !== eliminated || this.status.hurt !== hurt;
    this.status.hit = hit;
    this.status.eliminated = eliminated;
    this.status.hurt = hurt;
    if (now - this.sampleAt >= 250) {
      this.status.fps = this.frames * 1000 / (now - this.sampleAt);
      this.status.frameMs = 1000 / this.status.fps;
      this.status.cpuMs = this.cpuTotal / this.frames;
      const { gpuMs, ...render } = this.view.metrics();
      Object.assign(this.status, render);
      this.status.gpuMs = gpuMs;
      this.status.visibleEnemies = this.view.horde.visible;
      this.status.activeEnemies = this.status.metrics?.activeEnemies ?? horde.after?.count ?? 0;
      this.status.ping = this.match?.pingMs ?? null;
      this.status.bytesPerSecond = this.match?.rate() ?? 0;
      const own = this.status.players.find((player) => player.id === this.status.ownId);
      this.status.serverTick = missionTick;
      this.status.atConsole = Boolean(mission && (mission.state === 'CARRIER_HUB' || mission.state === 'MISSION_SELECTION') &&
        distanceSquared(this.prediction.position, CARRIER_CONSOLE) <= CARRIER_CONSOLE.radius ** 2);
      this.status.interaction = this.interaction();
      if (now >= this.noticeUntil) this.status.notice = '';
      this.status.respawn = own && !own.hp ? Math.max(0, (own.respawnTick - this.tick) / NET.tickHz) : 0;
      this.sampleAt = now;
      this.frames = 0;
      this.cpuTotal = 0;
      this.emit();
    } else if (feedbackChanged) {
      this.emit();
    }
    this.frame = requestAnimationFrame(this.draw);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.sound.close();
    this.input.dispose();
    this.view.dispose();
    void this.match?.room.leave();
  }
}
