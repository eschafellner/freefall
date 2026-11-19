import {
  ALBATROSS, BALANCE, BASE_LOADOUT, BODENBRUCH, BODENBRUCH_ROOM, CARRIER_CONSOLE, CARRIER_ROOMS, CARRIER_SHIP, CARRIER_WORLD,
  MISSION_REGISTRY, NET, allowsPostureAction, applyShotRecoil, createRecoilState, distanceSquared, inAlbatross, isCarrierScene, isGroundPosture, missionGround, postureCollider, postureProgress,
  recoverRecoil, resetRecoil,
} from '@freefall/shared';
import type {
  CombatEvent, HordeSize, MissionAction, MissionDebugAction, MissionSelection, MissionSnapshot, PlayerInput, PlayerState,
  ServerMetrics, SupplyContainerSnapshot, WeaponSlot,
} from '@freefall/shared';
import { AudioEngine } from '../audio/AudioEngine.ts';
import type { VolumeChannel } from '../audio/AudioEngine.ts';
import { WeaponAudio } from '../audio/WeaponAudio.ts';
import { DesktopInput } from '../input/DesktopInput.ts';
import { Match } from '../networking/Match.ts';
import type { GameMode, JoinMode } from '../networking/Match.ts';
import type { QualityName } from '../rendering/GraphicsQuality.ts';
import { FlightAudio } from '../rendering/mission/FlightAudio.ts';
import { ArenaView } from '../rendering/ArenaView.ts';
import { Prediction } from './Prediction.ts';
import { MatchTimeline } from './Timeline.ts';

/** Movement and network diagnostics. Only collected while the telemetry panel is open. */
export interface MotionTelemetry {
  frameP95: number;
  frameP99: number;
  snapshotHz: number;
  snapshotJitterMs: number;
  interpolationMs: number;
  bufferedMs: number;
  extrapolatedPct: number;
  heldPct: number;
  predictionErrorCm: number;
  correctionsPerSecond: number;
  lastCorrectionCm: number;
  maxCorrectionCm: number;
  snaps: number;
  unacknowledged: number;
  animState: string;
  moveSpeed: number;
  animSpeed: number;
  posture: string;
  requestedPosture: string;
  dive: string;
  grounded: boolean;
  collider: string;
  actions: string;
  serverPosition: string;
  visualPosition: string;
}

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
  /** Own shot or strike hit an allied operator (friendly fire). */
  allyHit: boolean;
  /** Short HUD line for friendly fire, e.g. "Eigenbeschuss · OP 02". */
  friendlyNotice: string;
  respawn: number;
  audio: { voices: number; peak: number; dropped: number };
  motion?: MotionTelemetry;
}

const STEP = 1000 / NET.tickHz;

export const INITIAL_STATUS: GameStatus = {
  roomId: '', ownId: '', ready: false, locked: false, host: false, players: [],
  missionRoom: false, atConsole: false, serverTick: 0, interaction: '', notice: '',
  fps: 0, frameMs: 0, cpuMs: 0, gpuMs: null, drawCalls: 0, triangles: 0, meshes: 0, instances: 0,
  geometries: 0, textures: 0, visibleEnemies: 0, activeEnemies: 0, ping: null,
  bytesPerSecond: 0, hit: false, eliminated: false, hurt: false, allyHit: false, friendlyNotice: '', respawn: 0,
  audio: { voices: 0, peak: 0, dropped: 0 },
};

/** Container reach, mirrors `ResupplySystem.inReach` on the server. */
function supplyInReach(position: { x: number; z: number }, ship: { x: number }, container: SupplyContainerSnapshot): boolean {
  const lateral = (position.x - ship.x) * (container.side === 'left' ? -1 : 1);
  return lateral >= ALBATROSS.halfWidth + .2 &&
    (position.x - container.x) ** 2 + (position.z - container.z) ** 2 <= BALANCE.resupply.interactionRange ** 2;
}

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
  private allyUntil = 0;
  private friendlyUntil = 0;
  private hp = 0;
  private tick = 0;
  readonly audio = new AudioEngine();
  private readonly weaponAudio = new WeaponAudio(this.audio);
  /** Client-side prediction of the authoritative recoil (camera only, never sent to the server). */
  private readonly recoil = createRecoilState();
  private recoilTick = 0;
  private recoilFireAt = 0;
  private recoilSlot: WeaponSlot = 'primary';
  private readonly predictedShots: number[] = [];
  private readonly lastPostures = new Map<string, { life: number; current: string }>();
  private readonly lastActions = new Map<string, string | undefined>();
  private tickAt = 0;
  private noticeUntil = 0;
  private debugRoutes = false;
  private lastLife = 0;
  private readonly sound = new FlightAudio(this.audio);
  private readonly surface = missionGround(BODENBRUCH.world);
  private telemetry = false;
  private readonly frameTimes = new Float32Array(240);
  private frameIndex = 0;
  private frameCount = 0;
  private travel = 0;
  private readonly lastRendered = { x: 0, z: 0 };
  private correctionsAt = 0;
  private timelineFrames = 0;

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
          // Acknowledged inputs no longer need a predicted shot.
          while (this.predictedShots.length && this.predictedShots[0] <= own.ack) this.predictedShots.shift();
          if (own.equipment && own.equipment.slot !== this.recoilSlot) {
            this.recoilSlot = own.equipment.slot;
            resetRecoil(this.recoil);
          }
          for (const player of packet.players) {
            const action = player.equipment?.action;
            const last = this.lastActions.get(player.id);
            if (action !== last && (action === 'primary' || action === 'secondary')) {
              this.weaponAudio.switchWeapon(player.id, player, this.listener, player.id === this.status.ownId);
            }
            this.lastActions.set(player.id, action);
            const current = player.posture?.current ?? 'STANDING';
            const previous = this.lastPostures.get(player.id);
            if (player.hp > 0 && previous?.life === player.life && previous.current !== current &&
                (current === 'DIVING' || isGroundPosture(current) || current === 'CROUCHING' || current === 'GETTING_UP')) {
              this.weaponAudio.posture(player.id, player, this.listener, player.id === this.status.ownId, isGroundPosture(current));
            }
            this.lastPostures.set(player.id, { life: player.life, current });
          }
          if (this.lastPostures.size > packet.players.length) {
            for (const id of this.lastPostures.keys()) {
              if (packet.players.some((player) => player.id === id)) continue;
              this.lastPostures.delete(id);
              this.lastActions.delete(id);
            }
          }
          if (own.life !== this.lastLife) {
            this.input.yaw = own.yaw;
            this.lastLife = own.life;
          }
          this.prediction.confirm(own, packet.tick);
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
          const own = shot.shooter === this.status.ownId;
          const slot = shot.slot ?? this.status.players.find((p) => p.id === shot.shooter)?.equipment?.slot ?? 'primary';
          // Own shots were already heard when predicted; the server echo only adds tracers and impacts.
          if (!own || !this.predictedShots.length) {
            this.weaponAudio.shot(slot, shot.shooter, { x: shot.fromX, z: shot.fromZ }, this.listener, own);
          }
          if ((shot.enemy || shot.nest) && own) {
            this.hitUntil = now + 130;
            if (shot.eliminated) this.killUntil = now + 300;
          }
          if (shot.ally && own) this.allyUntil = now + 260;
        },
        combat: (events) => this.combatEvents(events),
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

  /** Listener for spatial audio: predicted own position and camera heading. */
  private get listener() {
    return { x: this.prediction.position.x, z: this.prediction.position.z, yaw: this.input.yaw };
  }

  setVolume(channel: VolumeChannel, value: number): void { this.audio.setVolume(channel, value); }

  private label(id: string): string {
    const slot = this.status.players.find((player) => player.id === id)?.slot;
    return slot === undefined ? 'Convict' : `OP ${String(slot + 1).padStart(2, '0')}`;
  }

  private combatEvents(events: CombatEvent[]): void {
    const now = performance.now();
    const ownId = this.status.ownId;
    for (const event of events) {
      if (event.type === 'blast') {
        const distance = Math.hypot(this.prediction.position.x - event.x, this.prediction.position.z - event.z);
        this.view.explosion(event.id, event.x, event.y, event.z, event.radius);
        this.view.blast(distance);
        this.weaponAudio.explosion(event.id, event, this.listener);
      } else if (event.type === 'melee') {
        const own = event.attacker === ownId;
        const loadout = BASE_LOADOUT.melee;
        const hit = !!event.enemy || !!event.ally;
        this.weaponAudio.melee(event.attacker, event, this.listener, own, hit, 0);
        if (event.staggered) this.view.stagger(event.enemy, now + loadout.staggerSeconds * 1000);
        else if (event.enemy) this.view.stagger(event.enemy, now + 135);
        if (own && event.enemy) {
          this.hitUntil = now + 130;
          if (event.eliminated) this.killUntil = now + 300;
        }
        if (own && event.ally) this.allyUntil = now + 260;
      } else if (event.type === 'friendly-fire') {
        if (event.self) continue;
        if (event.attacker === ownId) {
          this.status.friendlyNotice = `Eigenbeschuss · ${this.label(event.target)}`;
          this.friendlyUntil = now + 1600;
        } else if (event.target === ownId) {
          this.status.friendlyNotice = `Getroffen von ${this.label(event.attacker)}`;
          this.friendlyUntil = now + 1600;
        }
        if (this.telemetry) console.debug('[friendly-fire]', event);
      } else if (event.type === 'reload') {
        const player = this.status.players.find((p) => p.id === event.operator);
        if (!player) continue;
        const weapon = BASE_LOADOUT.weapons[event.slot];
        const removal = weapon.reloadRemovalTicks / NET.tickHz;
        const chamber = (weapon.reloadTicks - weapon.reloadInsertionTicks) / NET.tickHz * .6;
        this.weaponAudio.reload(event.operator, event.slot, event.phase, player, this.listener, event.operator === ownId, removal, chamber);
      } else if (event.type === 'resupply') {
        const container = this.status.mission?.albatross?.supply?.find(({ id }) => id === event.container);
        if (container) this.weaponAudio.resupply(event.operator, container, this.listener, event.operator === ownId);
        if (event.operator === ownId) {
          const { primaryMagazines: p, secondaryMagazines: s, grenades: g, stims } = event.granted;
          this.status.notice = ['Nachschub', p && `+${p} MAG`, s && `+${s} P-MAG`, g && `+${g} GR`, stims && `+${stims} STIM`]
            .filter(Boolean).join(' · ');
          this.noticeUntil = now + 2600;
          this.emit();
        }
      }
    }
  }

  /**
   * Predicts own shots for the camera recoil (and immediate own audio). Mirrors the server rules: fire held, ammo
   * left (minus unacknowledged predicted shots), no reload or action, fire interval. Corrections are implicit: both
   * sides recover to zero when the trigger is released.
   */
  private predictShot(input: PlayerInput): void {
    const own = this.timeline.players.latest?.players.find((player) => player.id === this.status.ownId);
    const slot = own?.equipment?.slot ?? 'primary';
    const weapon = BASE_LOADOUT.weapons[slot];
    const { recoil, spread } = weapon.handling;
    this.recoilTick++;
    recoverRecoil(this.recoil, recoil, spread, this.recoilTick);
    const reloading = own?.reload ? own.reload.phase !== 'READY' && own.reload.phase !== 'RELOAD_INTERRUPTED' : !!own?.reloadUntil;
    const ammo = (own?.ammo ?? 0) - this.predictedShots.length;
    const busy = !own || own.hp <= 0 || !!own.equipment?.action || reloading;
    if (!allowsPostureAction(this.prediction.posture, 'fire') || !input.fire || busy || ammo <= 0 || this.recoilTick < this.recoilFireAt) return;
    applyShotRecoil(this.recoil, recoil, spread, this.recoilTick);
    this.recoilFireAt = this.recoilTick + weapon.fireIntervalTicks;
    this.predictedShots.push(input.seq);
    if (this.predictedShots.length > 64) this.predictedShots.shift();
    this.weaponAudio.shot(slot, this.status.ownId, this.listener, this.listener, true);
  }

  lock(): void {
    if (!this.match || !this.status.ready || (this.status.missionRoom &&
        (!this.status.mission || this.status.mission.result))) return;
    this.audio.resume();
    if (typeof this.view.canvas.requestPointerLock !== 'function') {
      this.error('Dieser Browser unterstützt keine Mauserfassung. Verwende einen Desktop-Browser mit Pointer Lock.');
      return;
    }
    this.input.lock();
  }

  /** Enables movement diagnostics and the authoritative-position overlay (F2). */
  setTelemetry(enabled: boolean): void {
    this.telemetry = enabled;
    this.frameCount = this.frameIndex = this.travel = this.timelineFrames = 0;
    this.correctionsAt = this.prediction.stats.corrections;
    const { players } = this.timeline;
    players.extrapolatedFrames = players.heldFrames = 0;
    if (!enabled) {
      this.status.motion = undefined;
      this.view.debugPositions();
    }
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
    this.lastActions.clear();
    this.lastPostures.clear();
    this.predictedShots.length = 0;
    resetRecoil(this.recoil);
    this.view.clearMatch();
    this.status = { ...INITIAL_STATUS };
    this.timeline = new MatchTimeline();
    this.prediction = new Prediction();
    this.correctionsAt = 0;
    this.input.yaw = 0;
    this.input.pitch = -0.12;
    this.seq = 0;
    this.tickAt = this.noticeUntil = 0;
    this.debugRoutes = false;
    this.lastLife = 0;
    this.hp = this.tick = this.hitUntil = this.killUntil = this.hurtUntil = this.allyUntil = this.friendlyUntil = 0;
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
    const ship = mission.albatross;
    const combat = mission.state === 'ACTIVE_MISSION' || mission.state === 'OBJECTIVES_COMPLETED' ||
      mission.state === 'EXTRACTION_AVAILABLE' || mission.state === 'EXTRACTION_IN_PROGRESS';
    const container = combat && ship ? ship.supply?.find((entry) => supplyInReach(position, ship, entry)) : undefined;
    if (container) {
      const own = this.status.players.find((player) => player.id === this.status.ownId);
      if (own?.equipment?.action === 'resupply') return 'Nachschub wird aufgenommen …';
      if (container.state === 'DESTROYED') return 'Nachschubcontainer zerstört';
      if (container.state === 'OFFLINE') return 'Nachschub außer Betrieb';
      if (container.state === 'EMPTY') return 'Nachschubcontainer leer';
      return `Nachschub aufnehmen · ${container.charges}/${container.maxCharges}`;
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
        this.predictShot(input);
        this.match.input(input);
      }
    }
    // Each step moves the operator over the following 33 ms. The visible operator follows that committed
    // trajectory at frame time (accumulator fraction) instead of jumping once per step.
    this.prediction.sample(dt, this.elapsed / STEP);
    const { players, horde } = this.timeline;
    players.sample(now);
    horde.sample(now);
    if (this.telemetry) {
      this.frameTimes[this.frameIndex] = dt * 1000;
      this.frameIndex = (this.frameIndex + 1) % this.frameTimes.length;
      this.frameCount = Math.min(this.frameTimes.length, this.frameCount + 1);
      const rendered = this.prediction.rendered;
      const step = Math.hypot(rendered.x - this.lastRendered.x, rendered.z - this.lastRendered.z);
      if (step < 2) this.travel += step;
      this.lastRendered.x = rendered.x;
      this.lastRendered.z = rendered.z;
      this.timelineFrames++;
      const own = players.latest?.players.find((player) => player.id === this.status.ownId);
      if (own) this.view.debugPositions(own, this.prediction.position, players.latest?.tick);
      else this.view.debugPositions();
    }
    const mission = this.status.mission;
    this.view.setRecoil(this.recoil.pitch, this.recoil.yaw);
    this.weaponAudio.setEnvironment(!mission ? 'outpost' : isCarrierScene(mission.state, mission.phase) ? 'carrier' : 'open-field');
    const missionTick = Math.max(mission?.tick ?? 0, this.tick + Math.min(3, Math.max(0, (now - this.tickAt) / STEP)));
    this.view.draw(
      now, dt, this.prediction.rendered, this.input.yaw, this.input.pitch, this.status.ownId, this.hp > 0,
      players.before, players.after, players.alpha, horde.before, horde.after, horde.alpha,
      this.input.aim, this.input.sprint, players.latest,
      mission, missionTick, this.status.locked && !mission?.result, this.debugRoutes, this.prediction.visualPosture, this.prediction.visualTick,
    );
    this.cpuTotal += performance.now() - cpuStart;
    this.frames++;
    const hit = now < this.hitUntil;
    const eliminated = now < this.killUntil;
    const hurt = now < this.hurtUntil;
    const allyHit = now < this.allyUntil;
    const friendly = now < this.friendlyUntil ? this.status.friendlyNotice : '';
    const feedbackChanged = this.status.hit !== hit || this.status.eliminated !== eliminated || this.status.hurt !== hurt ||
      this.status.allyHit !== allyHit || this.status.friendlyNotice !== friendly;
    this.status.hit = hit;
    this.status.eliminated = eliminated;
    this.status.hurt = hurt;
    this.status.allyHit = allyHit;
    this.status.friendlyNotice = friendly;
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
      this.status.audio = { voices: this.audio.activeVoices, peak: this.audio.peakVoices, dropped: this.audio.droppedVoices };
      this.audio.peakVoices = this.audio.activeVoices;
      const own = this.status.players.find((player) => player.id === this.status.ownId);
      this.status.serverTick = missionTick;
      this.status.atConsole = Boolean(mission && (mission.state === 'CARRIER_HUB' || mission.state === 'MISSION_SELECTION') &&
        distanceSquared(this.prediction.position, CARRIER_CONSOLE) <= CARRIER_CONSOLE.radius ** 2);
      this.status.interaction = this.interaction();
      if (now >= this.noticeUntil) this.status.notice = '';
      this.status.respawn = own && !own.hp ? Math.max(0, (own.respawnTick - this.tick) / NET.tickHz) : 0;
      if (this.telemetry) this.collectMotion(now - this.sampleAt, own);
      this.sampleAt = now;
      this.frames = 0;
      this.cpuTotal = 0;
      this.emit();
    } else if (feedbackChanged) {
      this.emit();
    }
    this.frame = requestAnimationFrame(this.draw);
  };

  private collectMotion(windowMs: number, own: PlayerState | undefined): void {
    const times = Array.from(this.frameTimes.subarray(0, this.frameCount)).sort((a, b) => a - b);
    const q = (p: number) => times.length ? times[Math.min(times.length - 1, Math.ceil(times.length * p) - 1)] : 0;
    const { players } = this.timeline;
    const stats = this.prediction.stats;
    const frames = Math.max(1, this.timelineFrames);
    const local = this.view.localMotion();
    const { posture, position, rendered, visualTick } = this.prediction;
    const shape = postureCollider(posture, visualTick);
    const cooldown = posture.lastDive === undefined ? 0 :
      Math.max(0, BALANCE.movement.diveCooldownSeconds - (visualTick - posture.lastDive) / NET.tickHz);
    const format = (p: { x: number; y?: number; z: number }) => [p.x, p.y ?? 0, p.z].map((v) => v.toFixed(2)).join(' / ');
    this.status.motion = {
      frameP95: q(.95), frameP99: q(.99),
      snapshotHz: players.rate, snapshotJitterMs: players.jitterTicks * STEP,
      interpolationMs: players.delayTicks * STEP, bufferedMs: players.bufferedTicks * STEP,
      extrapolatedPct: players.extrapolatedFrames / frames * 100, heldPct: players.heldFrames / frames * 100,
      predictionErrorCm: this.prediction.error * 100,
      correctionsPerSecond: (stats.corrections - this.correctionsAt) * 1000 / Math.max(1, windowMs),
      lastCorrectionCm: stats.lastCorrection * 100, maxCorrectionCm: stats.maxCorrection * 100, snaps: stats.snaps,
      unacknowledged: this.prediction.unacknowledged,
      posture: posture.current, requestedPosture: posture.requested, grounded: position.y <= 0,
      dive: (posture.dive
        ? `${posture.dive.x.toFixed(2)} / ${posture.dive.z.toFixed(2)} · ${Math.round(postureProgress(posture, visualTick) * 100)} % · `
        : '') + `${cooldown.toFixed(2)} s`,
      collider: [shape.radius * 2, shape.height, shape.halfLength * 2].map((v) => v.toFixed(2)).join(' × '),
      actions: own && own.hp > 0 && !this.prediction.frozen
        ? Object.entries(BALANCE.movement.actions[posture.current]).filter(([, allowed]) => allowed).map(([name]) => name).join(', ')
        : '',
      serverPosition: own ? format(own) : '–', visualPosition: format(rendered),
      animState: local.state, moveSpeed: this.travel * 1000 / Math.max(1, windowMs), animSpeed: local.speed,
    };
    this.correctionsAt = stats.corrections;
    this.travel = this.timelineFrames = 0;
    players.extrapolatedFrames = players.heldFrames = 0;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.audio.close();
    this.input.dispose();
    this.view.dispose();
    void this.match?.room.leave();
  }
}
