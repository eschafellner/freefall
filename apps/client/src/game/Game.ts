import {
  ALBATROSS, BALANCE, BASE_LOADOUT, BODENBRUCH, BODENBRUCH_ROOM, CARRIER_CONSOLE, CARRIER_ROOMS, CARRIER_SHIP, CARRIER_WORLD,
  NET, PLAYER, PLAYER_MOTION, WEAPONS, allowsPostureAction, applyShotRecoil, canSecureExtraction, createRecoilState, distanceSquared, impactSurface, inAlbatross, isCarrierScene,
  isOperatorGrounded, missionGround, missionObjectives, postureCollider, postureProgress,
  nextShotAt, recoverRecoil, resetRecoil, restoreWorld,
} from '@freefall/shared';
import type {
  CombatEvent, GrenadeReleaseEvent, HordeSize, MeleeEvent, MissionAction, MissionDebugAction, MissionGenerationSelection, MissionSnapshot, PlayerInput, PlayerState,
  AccountProgress, EffectiveLoadout, LoadoutReply, LoadoutSelection, RosterEntry, ServerMetrics, ShotEvent, SupplyContainerSnapshot, WeaponSlot,
} from '@freefall/shared';
import { shotRays } from '@freefall/shared';
import { POI_LOOT } from '@freefall/shared';
import type { PickupKind, PickupSnapshot } from '@freefall/shared';
import { playerWeapon, resolveOwnLoadout, sameSelection, storeSelection, storedSelection } from './Loadouts.ts';
import { AudioEngine } from '../audio/AudioEngine.ts';
import type { AudioPosition, VolumeChannel } from '../audio/AudioEngine.ts';
import { HordeAudio } from '../audio/HordeAudio.ts';
import { ImpactAudio } from '../audio/ImpactAudio.ts';
import { MissionAudio } from '../audio/MissionAudio.ts';
import { MovementAudio } from '../audio/MovementAudio.ts';
import { Soundscape } from '../audio/Soundscape.ts';
import { WeaponAudio } from '../audio/WeaponAudio.ts';
import { CombatPresentation } from '../networking/CombatPresentation.ts';
import { DesktopInput } from '../input/DesktopInput.ts';
import { ACTION_LABELS, bindings } from '../input/Bindings.ts';
import { Match } from '../networking/Match.ts';
import type { GameMode, JoinMode } from '../networking/Match.ts';
import { shotIdentity } from '../networking/ShotHistory.ts';
import { shotMarker } from './HitFeedback.ts';
import { DryTrigger, weaponEmpty } from './DryFire.ts';
import { DamageFeedback } from './DamageFeedback.ts';
import { MissionPresentation, PresentationNotices } from './MissionPresentation.ts';
import type { QualityName } from '../rendering/GraphicsQuality.ts';
import { ArenaView } from '../rendering/ArenaView.ts';
import { Prediction } from './Prediction.ts';
import { remotePose } from './RemoteInterpolation.ts';
import type { RemotePose } from './RemoteInterpolation.ts';
import { MatchTimeline } from './Timeline.ts';

/** Movement and network diagnostics. Only collected while the telemetry panel is open. */
export interface MotionTelemetry {
  frameP95: number;
  frameP99: number;
  cameraMs: number;
  reticleMs: number;
  damageHudMs: number;
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
  playback: string;
  camera: string;
  cameraTarget: string;
  input: string;
  moveSpeed: number;
  animSpeed: number;
  posture: string;
  requestedPosture: string;
  dive: string;
  grounded: boolean;
  bodyYaw: number;
  groundSpeed: number;
  getUp: string;
  action: string;
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
  /** Name, Tag und Level der angemeldeten Operator im Raum (leer im Gastmodus). */
  roster: RosterEntry[];
  /** Letzte EP-Gutschrift für den eigenen Account (gehört zu `progress.resultId`). */
  progress?: AccountProgress;
  metrics?: ServerMetrics;
  weather?: ReturnType<ArenaView['metrics']>['weather'];
  weaponVfx?: ReturnType<ArenaView['metrics']>['weaponVfx'];
  explosiveVfx?: ReturnType<ArenaView['metrics']>['explosiveVfx'];
  duplicateActions?: number;
  meleeSwings?: number;
  confirmedMeleeHits?: number;
  lastImpact?: ShotEvent;
  impactSounds?: number;
  impactRate?: number;
  duplicateShots?: number;
  missionRoom: boolean;
  atConsole: boolean;
  /** At the Carrier station "Ausrüstung" (loadout menu). */
  atLocker: boolean;
  /** Own effective loadout as accepted by the server. */
  loadout: EffectiveLoadout;
  /** Last refusal of a loadout change. */
  loadoutError?: string;
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
  /** Server tick of the last local empty-trigger click (HUD emphasis). */
  dryFireTick?: number;
  eventTiming?: { shot?: number; action?: number; mission?: number; poseWait?: number };
  audio: { voices: number; peak: number; dropped: number; diagnostics?: ReturnType<AudioEngine['metrics']> & {
    planet?: string; weather?: string; wind?: string; rate: number; enemyMs: number; enemyPeakMs: number; updateMs: number;
    windups: number; impacts: number;
    weapon: ReturnType<WeaponAudio['metrics']>;
  } };
  motion?: MotionTelemetry;
}

const STEP = 1000 / NET.tickHz;

export const INITIAL_STATUS: GameStatus = {
  roomId: '', ownId: '', ready: false, locked: false, host: false, players: [], roster: [],
  missionRoom: false, atConsole: false, atLocker: false, loadout: BASE_LOADOUT, serverTick: 0, interaction: '', notice: '',
  fps: 0, frameMs: 0, cpuMs: 0, gpuMs: null, drawCalls: 0, triangles: 0, meshes: 0, instances: 0,
  geometries: 0, textures: 0, visibleEnemies: 0, activeEnemies: 0, ping: null,
  bytesPerSecond: 0, hit: false, eliminated: false, hurt: false, allyHit: false, friendlyNotice: '', respawn: 0,
  audio: { voices: 0, peak: 0, dropped: 0 },
};

/** Container reach, mirrors `ResupplySystem.inReach` on the server. */
const PICKUP_PROMPT: Record<PickupKind, string> = {
  tissue: 'Gewebeprobe aufnehmen', rock: 'Gesteinsprobe aufnehmen', artifact: 'Artefakt aufnehmen', mark: 'Einsatzmarke aufnehmen',
  ammo: 'Munitionsbox aufnehmen', stims: 'Erste-Hilfe-Kasten aufnehmen', grenades: 'Granatenkiste aufnehmen',
};

/** Nächster Gegenstand in Aufnahmereichweite (dieselbe Regel wie am Server). */
function nearestPickup(pickups: readonly PickupSnapshot[] | undefined, position: { x: number; z: number }): PickupSnapshot | undefined {
  let best: PickupSnapshot | undefined, range = POI_LOOT.range ** 2;
  for (const pickup of pickups ?? []) {
    const distance = (pickup.x - position.x) ** 2 + (pickup.z - position.z) ** 2;
    if (distance <= range) { range = distance; best = pickup; }
  }
  return best;
}

/** Truppenstand bei Proben, z. B. " · 4/10". */
function pickupSuffix(kind: PickupKind, mission: MissionSnapshot, _own: string): string {
  if (kind !== 'tissue' && kind !== 'rock' && kind !== 'artifact') return '';
  const samples = mission.samples;
  if (!samples) return '';
  return samples.team[kind] >= samples.limits[kind] ? ' · Limit erreicht' : ` · ${samples.team[kind]}/${samples.limits[kind]}`;
}

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
  /** Titelmusik, solange der Start- und Loginbildschirm sichtbar ist. */
  private titleMusic = false;
  /** Automatischer Einstieg nach dem Raumbeitritt: Ein Fehlschlag (keine Nutzergeste mehr) bleibt ohne Fehlermeldung. */
  private quietLock = false;
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
  private readonly dryTrigger = new DryTrigger();
  /** Client-side prediction of the authoritative recoil (camera only, never sent to the server). */
  private readonly recoil = createRecoilState();
  private recoilTick = 0;
  private recoilFireAt = 0;
  private recoilSlot: WeaponSlot = 'primary';
  /** Unacknowledged predicted fire cues, matched in firing order within the same life and weapon slot. */
  private readonly predictedShots: { seq: number; life: number; slot: WeaponSlot; audible: boolean }[] = [];
  /** Own shot echoes received since the last player snapshot (that snapshot's ammo does not include them yet). */
  private echoedShots = 0;
  private tickAt = 0;
  private readonly notices = new PresentationNotices();
  private readonly missionPresentation = new MissionPresentation(this.notices);
  private readonly damage = new DamageFeedback();
  private debugRoutes = false;
  private lastLife = 0;
  private readonly missionAudio = new MissionAudio(this.audio);
  private readonly soundscape = new Soundscape(this.audio);
  private readonly movementAudio = new MovementAudio(this.audio);
  private readonly hordeAudio = new HordeAudio(this.audio);
  private readonly impactAudio = new ImpactAudio(this.audio);
  private readonly combatPresentation = new CombatPresentation();
  private meleeSwings = 0;
  private confirmedMeleeHits = 0;
  private readonly audioPose: RemotePose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, tick: 0 };
  private readonly audioListener: AudioPosition = { x: 0, y: 0, z: 0 };
  private audioPreloaded = false;
  private audioWorld?: string;
  private audioFloor = -1;
  private impactFloor = -1;
  private awaitingMissionBaseline = false;
  private sampleEvents = 0;
  private lastImpactCount = 0;
  private audioUpdateTotal = 0;
  private surface = missionGround(BODENBRUCH.world);
  private scenePlanId?: string;
  private incompatibleWorld = false;
  private telemetry = false;
  private readonly frameTimes = new Float32Array(240);
  private frameIndex = 0;
  private frameCount = 0;
  private travel = 0;
  private readonly lastRendered = { x: 0, z: 0 };
  private correctionsAt = 0;
  private timelineFrames = 0;
  private readonly reticle?: { readonly current: HTMLElement | null };
  private readonly damageHud?: { readonly current: HTMLElement | null };
  private damageHudTotal = 0;

  constructor(container: HTMLElement, publish: (status: GameStatus) => void, error: (message: string) => void, quality: QualityName,
    reticle?: { readonly current: HTMLElement | null }, damageHud?: { readonly current: HTMLElement | null }) {
    this.publish = publish;
    this.error = error;
    this.reticle = reticle;
    this.damageHud = damageHud;
    this.view = new ArenaView(container, quality);
    this.input = new DesktopInput(this.view.canvas, (locked) => {
      if (locked) this.quietLock = false;
      this.status.locked = locked;
      this.emit();
    }, () => {
      if (this.quietLock) { this.quietLock = false; return; }
      this.error('Maus konnte nicht erfasst werden. Klicke erneut auf „Einsatz betreten“.');
    },
    () => {
      if (this.match) this.match.input(this.input.sample(++this.seq, true));
    }, () => this.interact(), () => this.action('balloon'));
    this.frame = requestAnimationFrame(this.draw);
  }

  /** Startet den Audiokontext nach einer Nutzergeste (Browser blockieren Ton ohne Interaktion). */
  wakeAudio(): void { this.audio.resume(); }

  /**
   * Mauserfassung schon im Klick auf „Raum erstellen“/„Beitreten“ anfordern, bevor der Raum verbunden ist. Die
   * Vollbild-Anforderung verbraucht die Nutzergeste; eine spätere Mauserfassung würde der Browser dann ablehnen.
   */
  preLock(): void {
    if (this.match || typeof this.view.canvas.requestPointerLock !== 'function') return;
    this.quietLock = true;
    this.audio.resume();
    this.input.lock();
  }

  releaseLock(): void { if (this.input.locked) document.exitPointerLock(); }

  /** Ton läuft tatsächlich (Audiokontext vom Browser freigegeben, Audio aktiv). */
  get audioLive(): boolean { return this.audio.running; }

  setTitleMusic(enabled: boolean): void { this.titleMusic = enabled; }

  async connect(mode: JoinMode, code: string, gamemode: GameMode, token?: string): Promise<void> {
    if (this.match || this.connecting || this.disposed) return;
    this.connecting = true;
    try {
      const match = await Match.connect(mode, code, gamemode, {
        players: (packet) => {
          if (!this.match || !this.timeline.players.push(packet)) return false;
          this.status.host = packet.host === this.status.ownId;
          this.status.players = packet.players;
          this.tick = packet.tick;
          this.tickAt = performance.now();
          const own = packet.players.find((player) => player.id === this.status.ownId);
          if (!own) return true;
          if (this.status.ready) this.combatPresentation.snapshot(packet.tick);
          if (this.status.ready && own.hp < this.hp) {
            const now = performance.now();
            if (now >= this.hurtUntil) this.hurtUntil = now + 170;
            if (own.hp > 0 && own.hp <= PLAYER.health * .35 && this.hp > PLAYER.health * .35)
              this.notices.offer('Vitalstatus kritisch', 'damage', now, 1400);
            if (!own.hp) {
              this.damage.clear();
              this.view.clearCameraFeedback();
              this.notices.clear();
            }
          }
          this.hp = own.hp;
          // Shots are broadcast before the snapshot of the same tick, so this ammo already includes every echo.
          this.echoedShots = 0;
          // A predicted shot whose input is well past acknowledgement was never fired by the server (rejected).
          while (this.predictedShots.length && (this.predictedShots[0].life !== own.life ||
            this.predictedShots[0].seq <= own.ack - 2)) this.predictedShots.shift();
          if (own.equipment && own.equipment.slot !== this.recoilSlot) {
            this.recoilSlot = own.equipment.slot;
            resetRecoil(this.recoil);
          }
          this.weaponAudio.handling(packet, this.listener, this.status.ownId, true,
            this.status.ready && packet.tick > this.audioFloor && !this.incompatibleWorld && !this.status.mission?.result);
          this.movementAudio.prune(packet.players);
          if (own.life !== this.lastLife) {
            if (this.lastLife) this.resetHitFeedback(packet.tick);
            this.input.yaw = own.yaw;
            this.lastLife = own.life;
          }
          this.prediction.confirm(own, packet.tick);
          if (!this.status.ready && !this.awaitingMissionBaseline && !this.incompatibleWorld) {
            this.combatPresentation.snapshot(packet.tick);
            this.resetCombatActions(packet.tick);
            this.missionPresentation.fence(packet.tick);
            this.input.sample(this.seq, true, own.life); // Discard one-shot actions queued while offline.
            this.status.ready = true;
            this.input.yaw = own.yaw;
            this.emit();
          }
          return true;
        },
        horde: (packet, scale) => this.timeline.receiveHorde(packet, scale),
        mission: (packet) => {
          if (!this.match || packet.tick <= (this.status.mission?.tick ?? -1)) return;
          if (packet.planId !== this.scenePlanId) {
            this.scenePlanId = packet.planId;
            const plan = packet.plan;
            const generated = plan?.world && restoreWorld(plan.world);
            if (plan?.world && generated?.world.id !== plan.worldId) {
              this.incompatibleWorld = true;
              this.prediction.frozen = true;
              this.error('Die Weltversion stimmt nicht mit dem Server überein. Lade das Spiel neu.');
              if (this.input.locked) document.exitPointerLock();
              this.emit();
              return;
            }
            this.incompatibleWorld = false;
            const definition = generated && plan
              ? { id: plan.id, displayName: plan.displayName, briefing: plan.briefing, world: generated.world,
                  objectives: plan.objectives.map(({ definition }) => definition) }
              : BODENBRUCH;
            this.surface = missionGround(definition.world);
            this.view.setMission(definition, generated && plan
              ? [...generated.relays, ...generated.balloonSites, plan.extraction.albatross, plan.extraction.balloon,
                ...(generated.world.pointsOfInterest ?? [])]
              : []);
          }
          if (this.incompatibleWorld) return;
          const previous = this.status.mission;
          const firstResult = !previous?.result && packet.result;
          const rebasing = this.awaitingMissionBaseline;
          this.awaitingMissionBaseline = false;
          if (firstResult || previous?.instanceId !== packet.instanceId || previous?.planId !== packet.planId ||
              (previous && isCarrierScene(previous.state, previous.phase) !== isCarrierScene(packet.state, packet.phase))) {
            this.resetHitFeedback(packet.tick);
            this.resetCombatActions(packet.tick);
          }
          if (packet.extraction?.phase === 'LIFT' && packet.extraction.securedIds.includes(this.status.ownId) &&
              previous?.extraction?.phase !== 'LIFT') {
            this.damage.clear();
            this.view.clearCameraFeedback();
          }
          if (firstResult || previous?.instanceId !== packet.instanceId) {
            this.movementAudio.clear();
            this.hordeAudio.clear();
          }
          this.status.mission = packet;
          this.missionPresentation.snapshot(packet, performance.now());
          if (this.status.ready || rebasing) this.missionAudio.snapshot(packet);
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
          const state = this.status.mission;
          if (!state || !this.status.ready || this.incompatibleWorld) return;
          const now = performance.now();
          for (const event of packet) {
            if (!this.missionPresentation.event(event, Math.max(this.tick, state.tick), now)) continue;
            if (this.telemetry) (this.status.eventTiming ??= {}).mission = this.eventAge(event.tick, now);
            this.missionAudio.event(event, state, this.surface, this.audioListener);
            if (event.type === 'SwarmNestDestroyed' && this.hp > 0 && this.status.locked) {
              const nest = event.position ?? state.nests.find(({ id }) => id === event.nestId);
              if (nest) this.view.missionImpulse(Math.hypot(nest.x - this.listener.x, nest.z - this.listener.z));
            }
          }
        },
        metrics: (metrics) => { this.status.metrics = metrics; },
        shot: (shot) => {
          if (!this.status.ready || this.incompatibleWorld || shot.tick === undefined ||
              shot.tick <= this.impactFloor || this.status.mission?.result || !this.combatPresentation.shot(shot)) return;
          const now = performance.now();
          const own = shot.shooter === this.status.ownId;
          const shooter = this.status.players.find((p) => p.id === shot.shooter);
          if (shot.life !== undefined && shooter &&
              (own ? shot.life !== shooter.life : shot.life < shooter.life)) return;
          if (shot.impact?.kind === 'operator') {
            const victim = this.status.players.find(({ id }) => id === shot.ally);
            if (victim && victim.life > shot.impact.life) return;
          }
          const slot = shot.slot ?? shooter?.equipment?.slot ?? 'primary';
          const life = shot.life ?? shooter?.life;
          const lateLocalEcho = own && shot.tick <= this.tick;
          const pending = own && !lateLocalEcho ? this.predictedShots.findIndex((entry) => entry.life === life && entry.slot === slot) : -1;
          const predicted = pending !== -1 || lateLocalEcho;
          const audible = lateLocalEcho || (pending !== -1 && this.predictedShots[pending].audible);
          const shotTick = shot.tick;
          if (pending !== -1) this.predictedShots.splice(pending, 1);
          if (own && !lateLocalEcho) this.echoedShots++;
          this.view.shot(shot.slot === undefined ? { ...shot, slot } : shot, shooter, own, predicted, now, () => {
            if (!audible && this.status.ready && shotTick > this.impactFloor && !this.status.mission?.result) {
              const weapon = playerWeapon(shooter, slot);
              this.weaponAudio.shot(weapon.sounds.fire, shot.shooter, { x: shot.fromX, y: shot.fromY, z: shot.fromZ },
                this.listener, own, own && weapon.feed.type === 'magazine' && slot === 'primary' && this.hardCasingFloor());
            }
            // Shot shells: at most three pellet impacts are audible, the rest only show.
            let impacts = 0;
            for (const ray of shotRays(shot)) {
              if (ray.impact && impacts++ >= 3) continue;
              this.impactAudio.play(ray, this.audioListener, own || ray.ally === this.status.ownId, performance.now());
            }
          });
          if (this.telemetry) {
            (this.status.eventTiming ??= {}).shot = this.eventAge(shot.tick, now);
            if (shot.impact) this.status.lastImpact = shot;
            console.debug('[shot]', shotIdentity(shot), shot.impact ?? (shot.ally ? 'blocked' : 'miss'), shot.ally || shot.enemy || shot.nest);
          }
          const markers = shotRays(shot).map((ray) => shotMarker(ray, this.status.ownId));
          const marker = markers.includes('ally') ? 'ally' : markers.includes('kill') ? 'kill' : markers.includes('hit') ? 'hit' : undefined;
          if (marker === 'ally') this.allyUntil = now + 200;
          else if (marker) {
            this.hitUntil = now + 135;
            if (marker === 'kill') this.killUntil = now + 260;
          }
        },
        combat: (events) => this.combatEvents(events),
        roster: (entries) => {
          this.status.roster = entries;
          this.emit();
        },
        progress: (progress) => {
          this.status.progress = progress;
          this.emit();
        },
        loadout: (reply) => this.loadoutReply(reply),
        dropped: () => {
          this.status.ready = false;
          this.audioFloor = Math.max(this.tick, this.status.mission?.tick ?? -1, this.timeline.horde.latest?.tick ?? -1);
          this.awaitingMissionBaseline = this.status.missionRoom;
          this.combatPresentation.suspend(this.audioFloor);
          this.resetAudio();
          this.missionPresentation.reset();
          this.prediction.awaitSnapshot();
          this.predictedShots.length = 0;
          this.resetHitFeedback(this.audioFloor);
          this.resetCombatActions(this.audioFloor);
          resetRecoil(this.recoil);
        },
        notice: (message) => {
          const now = performance.now();
          this.notices.offer(message, 'information', now, 3200);
          this.status.notice = this.notices.current(now);
          this.emit();
        },
        disconnected: (code) => {
          if (this.disposed) return;
          this.resetMatch();
          if (code !== 4000) this.error('Verbindung zum Spielserver getrennt. Du kannst dem Raum erneut beitreten.');
        },
      }, token);
      if (this.disposed) {
        void match.room.leave();
        return;
      }
      this.match = match;
      match.measureTraffic = this.telemetry;
      this.status.roomId = match.room.roomId;
      this.status.ownId = match.room.sessionId;
      this.status.missionRoom = match.room.name === BODENBRUCH_ROOM;
      this.awaitingMissionBaseline = this.status.missionRoom;
      if (this.status.missionRoom) {
        this.input.yaw = BODENBRUCH.world.deployment.facing;
        this.prediction.world = CARRIER_WORLD;
        this.scenePlanId = undefined;
        this.incompatibleWorld = false;
        this.surface = missionGround(BODENBRUCH.world);
        this.view.setMission(BODENBRUCH);
      }
      this.emit();
    } finally {
      this.connecting = false;
    }
  }

  /** Listener for spatial audio: predicted own position and camera heading. */
  private get listener() {
    const { x, y, z } = this.prediction.position;
    return { x, y: y + 1, z, yaw: this.input.yaw };
  }

  setVolume(channel: VolumeChannel, value: number): void { this.audio.setVolume(channel, value); }

  setAudioOption(key: 'muted' | 'enabled', value: boolean): void {
    this.audio.setOption(key, value);
    if (key === 'enabled' && !value) this.resetAudio();
  }

  private resetHitFeedback(tick: number): void {
    this.impactFloor = Math.max(this.impactFloor, tick);
    this.hitUntil = this.killUntil = this.allyUntil = this.hurtUntil = this.friendlyUntil = 0;
    this.status.hit = this.status.eliminated = this.status.allyHit = this.status.hurt = false;
    this.status.friendlyNotice = '';
    this.status.lastImpact = undefined;
    this.damage.clear();
    this.impactAudio.clear();
    this.view.clearWeaponPresentation();
  }

  private label(id: string): string {
    const slot = this.status.players.find((player) => player.id === id)?.slot;
    if (slot === undefined) return 'Convict';
    return this.status.roster.find((entry) => entry.id === id)?.name ?? `OP ${String(slot + 1).padStart(2, '0')}`;
  }

  private resetCombatActions(tick: number): void {
    this.combatPresentation.fence(tick);
    this.weaponAudio.clearTransient();
    this.view.clearCombatActions(tick + 1);
  }

  private eventAge(tick: number, now: number): number {
    // Relative to the latest received player snapshot. This estimate does not require synchronized clocks.
    return Math.max(0, (this.tick - tick) * STEP + now - this.tickAt);
  }

  private readonly presentCombatAction = (event: GrenadeReleaseEvent | MeleeEvent, now: number, waitedMs: number): void => {
    if (this.telemetry) (this.status.eventTiming ??= {}).poseWait = waitedMs;
    const listener = this.listener;
    if (event.type === 'grenade-release') {
      this.weaponAudio.grenadeRelease(event.owner, event, listener, event.owner === this.status.ownId);
      return;
    }
    const own = event.attacker === this.status.ownId;
    this.meleeSwings++;
    this.weaponAudio.meleeSwing(event.attacker, event, listener, own);
    this.view.melee(event, own, this.hp > 0, now);
    if (event.damage <= 0) return;
    this.confirmedMeleeHits++;
    if (event.contact) {
      this.impactAudio.at(event.enemy ? 'chitin' : 'body', event.contact, this.audioListener,
        own || event.ally === this.status.ownId, now, event.eliminated, 'melee');
    }
    if (event.enemy && !event.eliminated) {
      this.view.stagger(event.enemy, now + (event.staggered ? BASE_LOADOUT.melee.staggerSeconds * 1000 : 135));
    }
    if (own && this.hp > 0 && event.tick > this.impactFloor) {
      if (event.enemy) {
        this.hitUntil = now + 130;
        if (event.eliminated) this.killUntil = now + 300;
      }
      if (event.ally) this.allyUntil = now + 260;
    }
  };

  private combatEvents(events: CombatEvent[]): void {
    if (!this.status.ready || this.incompatibleWorld || this.status.mission?.result) return;
    const now = performance.now();
    const ownId = this.status.ownId;
    for (const event of events) {
      if (!this.combatPresentation.accept(event, this.tick, this.impactFloor)) continue;
      if (event.type === 'blast' || event.type === 'grenade-release' || event.type === 'melee') {
        if (this.telemetry) (this.status.eventTiming ??= {}).action = this.eventAge(event.tick, now);
        if (event.type !== 'blast') {
          this.combatPresentation.queue(event, now);
          continue;
        }
        const listener = this.listener;
        const distance = Math.hypot(listener.x - event.x, listener.y - event.y, listener.z - event.z);
        this.view.explosion(event, distance, this.hp > 0, now);
        this.weaponAudio.explosion(event, listener, distance);
        if (event.contact) this.impactAudio.at(event.contact.surface, event, this.audioListener, false, now, false, 'blast');
        continue;
      }
      if ((event.type === 'enemy-hit' || event.type === 'friendly-fire') && event.target === ownId &&
          event.amount > 0 && this.hp > 0 && (event.life === undefined || event.life === this.lastLife)) {
        this.hurtUntil = now + 170;
        this.damage.add(event.direction, now);
        this.view.damageImpulse(event.amount);
      }
      if (event.type === 'friendly-fire') {
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
        if (event.operator === ownId && this.status.players.some((p) => p.id === event.operator) &&
            event.phase === 'MAGAZINE_INSERTION' && event.discarded > 0)
          this.notices.offer(`Magazin gewechselt · ${event.discarded} Schuss verworfen`, 'information', now, 1700);
      } else if (event.type === 'resupply') {
        const container = this.status.mission?.albatross?.supply?.find(({ id }) => id === event.container);
        if (container) this.weaponAudio.resupply(event.operator, container, this.listener, event.operator === ownId);
        if (event.operator === ownId) {
          const { primaryMagazines: p, secondaryMagazines: s, grenades: g, stims } = event.granted;
          this.notices.offer(['Nachschub aufgenommen', p && `+${p} PRIM-MAG`, s && `+${s} SEK-MAG`,
            g && `+${g} GR`, stims && `+${stims} STIM`].filter(Boolean).join(' · '), 'resupply', now);
        }
      }
    }
  }

  /**
   * Predicts own shots for the camera recoil (and immediate own audio). Mirrors the server rules: fire held, ammo
   * left (minus unacknowledged predicted shots), no reload or action, fire interval. Corrections are implicit: both
   * sides recover to zero when the trigger is released.
   */
  private predictShot(input: PlayerInput, now: number): void {
    const own = this.timeline.players.latest?.players.find((player) => player.id === this.status.ownId);
    const slot = own?.equipment?.slot ?? 'primary';
    const weapon = this.status.loadout.weapons[slot];
    const { recoil, spread } = weapon.handling;
    this.recoilTick++;
    recoverRecoil(this.recoil, recoil, spread, this.recoilTick);
    const reloading = own?.reload ? own.reload.phase !== 'READY' && own.reload.phase !== 'RELOAD_INTERRUPTED' : !!own?.reloadUntil;
    const ammo = (own?.ammo ?? 0) - this.predictedShots.length - this.echoedShots;
    const mission = this.status.mission;
    // The server only fires while a mission simulates combat (never on the carrier, during the drop or in the lift).
    const combat = !this.status.missionRoom || (!!mission && !this.prediction.frozen && !mission.result &&
      (mission.state === 'ACTIVE_MISSION' || mission.state === 'OBJECTIVES_COMPLETED' ||
        mission.state === 'EXTRACTION_AVAILABLE' || mission.state === 'EXTRACTION_IN_PROGRESS'));
    const busy = !own || own.hp <= 0 || !!own.equipment?.action || reloading || !combat;
    const allowed = allowsPostureAction(this.prediction.posture, 'fire');
    if (this.dryTrigger.update(input.fire && allowed && !busy, !!own && weaponEmpty(own, ammo), this.recoilTick >= this.recoilFireAt)) {
      this.weaponAudio.dryFire(slot, this.status.ownId, this.listener);
      this.status.dryFireTick = this.status.serverTick;
    }
    if (!allowed || !input.fire || busy || ammo <= 0 || this.recoilTick < this.recoilFireAt) return;
    applyShotRecoil(this.recoil, recoil, spread, this.recoilTick);
    this.recoilFireAt = nextShotAt(this.recoilFireAt, this.recoilTick, weapon.fireInterval);
    const listener = this.listener;
    const audible = this.weaponAudio.shot(weapon.sounds.fire, this.status.ownId, listener, listener, true,
      weapon.feed.type === 'magazine' && slot === 'primary' && this.hardCasingFloor());
    this.predictedShots.push({ seq: input.seq, life: own.life, slot, audible });
    if (this.predictedShots.length > 64) this.predictedShots.shift();
    this.view.predictFire(own, slot, now);
  }

  private hardCasingFloor(): boolean {
    const { x, z } = this.prediction.position;
    const surface = impactSurface(this.prediction.world, x, z);
    return surface === 'metal' || surface === 'concrete' || surface === 'rock' || surface === 'frozen-rock' || surface === 'ice';
  }

  /** Maus erfassen und Raum betreten. `quiet`: automatischer Versuch, Fehlschlag ohne Meldung. Liefert, ob versucht wurde. */
  lock(quiet = false): boolean {
    if (!this.match || !this.status.ready || this.incompatibleWorld || (this.status.missionRoom &&
        (!this.status.mission || this.status.mission.result))) return false;
    this.quietLock = quiet;
    this.audio.resume();
    this.weaponAudio.warm();
    if (typeof this.view.canvas.requestPointerLock !== 'function') {
      if (!quiet) this.error('Dieser Browser unterstützt keine Mauserfassung. Verwende einen Desktop-Browser mit Pointer Lock.');
      return false;
    }
    this.input.lock();
    return true;
  }

  /** Enables movement diagnostics and the authoritative-position overlay (F2). */
  setTelemetry(enabled: boolean): void {
    this.telemetry = enabled;
    if (this.match) this.match.measureTraffic = enabled;
    this.frameCount = this.frameIndex = this.travel = this.timelineFrames = 0;
    this.correctionsAt = this.prediction.stats.corrections;
    const { players } = this.timeline;
    players.extrapolatedFrames = players.heldFrames = 0;
    if (!enabled) {
      this.status.motion = undefined;
      this.status.eventTiming = undefined;
      this.view.debugPositions();
    }
  }

  setQuality(quality: QualityName): void {
    this.view.setQuality(quality);
  }

  setHorde(size: HordeSize): void {
    if (this.status.host) this.match?.setHorde(size);
  }

  select(selection: MissionGenerationSelection): void { if (this.status.host) this.match?.select(selection); }

  /** Carrier › Ausrüstung: requests a loadout. The server validates it and answers with `loadoutReply`. */
  setLoadout(selection: LoadoutSelection): void {
    this.status.loadoutError = undefined;
    this.match?.setLoadout(selection);
    this.emit();
  }

  private loadoutRestored = false;

  private loadoutReply(reply: LoadoutReply): void {
    if ('error' in reply) {
      this.status.loadoutError = reply.error;
      this.notices.offer(reply.error, 'information', performance.now(), 3200);
    } else {
      this.status.loadout = resolveOwnLoadout(reply.selection);
      this.status.loadoutError = undefined;
      this.view.ownWeapons = this.status.loadout.weapons;
      // The first reply after joining is the server's current loadout. Restore the last accepted one once.
      const wanted = storedSelection();
      const restore = !this.loadoutRestored && wanted && !sameSelection(wanted, reply.selection);
      this.loadoutRestored = true;
      if (restore) this.match?.setLoadout(wanted);
      else storeSelection(reply.selection);
    }
    this.emit();
  }
  action(action: MissionAction): void { this.match?.action(action); }

  private interact(): void {
    if (!this.status.missionRoom) return;
    const mission = this.status.mission;
    if (!mission) return;
    if (mission.state === 'CARRIER_HUB' || mission.state === 'MISSION_SELECTION') {
      if (distanceSquared(this.prediction.position, CARRIER_CONSOLE) <= CARRIER_CONSOLE.radius ** 2) {
        this.status.atConsole = true;
        this.missionAudio.alert('confirm');
        if (this.input.locked) document.exitPointerLock();
        this.emit();
      } else {
        const room = CARRIER_ROOMS.find((entry) => distanceSquared(this.prediction.position, entry) < 5 ** 2);
        if (room?.label === 'AUSRÜSTUNG') {
          this.status.atLocker = true;
          this.missionAudio.alert('confirm');
          if (this.input.locked) document.exitPointerLock();
          this.emit();
        } else if (room) {
          this.notices.offer('System noch nicht verfügbar', 'information', performance.now(), 2200);
          this.emit();
        }
      }
      return;
    }
    this.match?.interact();
  }
  startMission(): void { if (this.status.host) this.match?.startMission(this.status.mission?.planId); }
  /** Host only: calls the run off during boarding and returns the squad to mission selection. */
  cancelBoarding(): void { if (this.status.host && this.status.mission?.state === 'BOARDING') this.match?.cancelBoarding(); }
  debug(action: MissionDebugAction): void { if (this.status.host && this.status.mission?.debug) this.match?.debug(action); }
  toggleRoutes(): void { if (this.status.mission?.debug) this.debugRoutes = !this.debugRoutes; }
  toggleWeather(): void { if (this.status.mission?.debug) this.view.toggleDebugWeather(); }

  async leave(): Promise<void> {
    await this.match?.room.leave();
  }

  private resetMatch(): void {
    this.match = undefined;
    this.loadoutRestored = false;
    this.status.loadout = BASE_LOADOUT;
    this.view.ownWeapons = BASE_LOADOUT.weapons;
    this.missionPresentation.reset();
    this.damage.clear();
    this.resetAudio();
    this.combatPresentation.clear();
    this.meleeSwings = this.confirmedMeleeHits = 0;
    this.audioFloor = -1;
    this.impactFloor = -1;
    this.awaitingMissionBaseline = false;
    this.predictedShots.length = 0;
    this.echoedShots = 0;
    resetRecoil(this.recoil);
    this.view.clearMatch();
    this.status = { ...INITIAL_STATUS };
    this.timeline = new MatchTimeline();
    this.prediction = new Prediction();
    this.correctionsAt = 0;
    this.input.yaw = 0;
    this.input.pitch = -0.12;
    this.seq = 0;
    this.tickAt = 0;
    this.debugRoutes = false;
    this.lastLife = 0;
    this.hp = this.tick = this.hitUntil = this.killUntil = this.hurtUntil = this.allyUntil = this.friendlyUntil = 0;
    if (this.input.locked) document.exitPointerLock();
    this.emit();
  }

  private resetAudio(): void {
    this.missionAudio.clear();
    this.soundscape.clear();
    this.movementAudio.clear();
    this.hordeAudio.clear();
    this.weaponAudio.clearTransient();
    this.impactAudio.clear();
    this.audioWorld = undefined;
    this.audioPreloaded = false;
    this.audio.clearVoices();
  }

  private updateAudio(now: number, dt: number, tick: number, mission: MissionSnapshot | undefined): void {
    if (!this.audio.running) return;
    const started = this.telemetry ? performance.now() : 0;
    const carrier = !!mission && isCarrierScene(mission.state, mission.phase);
    const planet = mission && !carrier && !mission.result ? this.surface.planetId ?? 'green-plains' : undefined;
    const activeWorld = this.prediction.world ?? this.surface;
    const pose = this.prediction.rendered;
    const posture = this.prediction.visualPosture;
    const listener = this.audioListener;
    listener.x = pose.x; listener.z = pose.z;
    listener.y = pose.y + postureCollider(posture, this.prediction.visualTick).height * .86;
    this.audio.listener(listener, this.input.yaw);
    const atmosphere = this.match?.atmosphere;
    this.soundscape.update(now, tick, planet, this.surface, atmosphere?.instanceId === mission?.instanceId ? atmosphere : undefined,
      listener, carrier && mission?.state !== 'DEPLOYMENT');
    if (!this.audioPreloaded) {
      this.audioPreloaded = true;
      this.sampleEvents = this.audio.played;
      this.weaponAudio.warm();
      this.missionAudio.warm();
      this.hordeAudio.warm();
      this.impactAudio.warm();
      if (mission) this.missionAudio.snapshot(mission);
    }
    if (activeWorld.id !== this.audioWorld) {
      this.audioWorld = activeWorld.id;
      this.movementAudio.clear();
      this.movementAudio.warm(activeWorld);
    }

    const { players, horde } = this.timeline;
    if (players.before) this.weaponAudio.handling(players.before, { ...listener, yaw: this.input.yaw }, this.status.ownId, false,
      players.before.tick > this.audioFloor && !mission?.result);
    if (!mission?.result && mission?.state !== 'DEPLOYMENT' && mission?.extraction?.phase !== 'LIFT') {
      // A fresh packet can arrive while presentation is still playing pre-drop snapshots.
      if (!carrier && horde.before && horde.after && horde.tick > this.audioFloor)
        this.hordeAudio.update(horde.before, horde.after, horde.alpha, listener, activeWorld);
      const own = players.latest?.players.find(({ id }) => id === this.status.ownId);
      if (own) this.movementAudio.update(own, pose, posture, dt, this.input.sprint, activeWorld, this.tick, true, listener);
      const a = players.before, b = players.after;
      if (a && b) for (const player of a.players) {
        if (player.id === this.status.ownId) continue;
        const next = b.players.find(({ id }) => id === player.id);
        const sampled = remotePose(player, a, b, players.alpha, next, this.audioPose, activeWorld);
        const state = sampled.state ?? player;
        // Use visual positions for remote Foley but read confirmed dive IDs only from authoritative snapshots.
        this.movementAudio.update(next?.life === state.life ? next : state,
          { x: sampled.x, y: sampled.y ?? 0, z: sampled.z }, sampled.posture, dt,
          ((state.motion ?? 0) & PLAYER_MOTION.sprint) !== 0, activeWorld, b.tick, false, listener);
      }
    }
    if (mission) this.missionAudio.update(now, tick, mission, this.view.audioTransport(), listener, this.surface);
    if (this.telemetry) this.audioUpdateTotal += performance.now() - started;
  }

  private emit(): void {
    this.publish({ ...this.status });
  }

  private interaction(): string {
    const mission = this.status.mission;
    if (!mission || this.hp <= 0) return '';
    const position = this.prediction.position;
    if (mission.state === 'CARRIER_HUB' || mission.state === 'MISSION_SELECTION') {
      if (distanceSquared(position, CARRIER_CONSOLE) <= CARRIER_CONSOLE.radius ** 2) return 'Missionskonsole öffnen';
      const room = CARRIER_ROOMS.find((entry) => distanceSquared(position, entry) < 5 ** 2);
      return room?.label === 'AUSRÜSTUNG' ? 'Ausrüstung öffnen' : room ? 'Station prüfen' : '';
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
    const pickup = combat && !container ? nearestPickup(mission.pickups, position) : undefined;
    if (pickup) return PICKUP_PROMPT[pickup.kind] + pickupSuffix(pickup.kind, mission, this.status.ownId);
    const canSecure = canSecureExtraction(this.prediction.posture.current, position, this.prediction.world);
    if (mission.state === 'EXTRACTION_AVAILABLE' && mission.albatross?.extractionAvailable && inAlbatross(position, mission.albatross))
      return canSecure ? 'Albatross-Start anfordern' : 'Für die Extraktion aufrichten';
    const extraction = mission.extraction;
    if (mission.state === 'EXTRACTION_IN_PROGRESS' && extraction?.phase !== 'LIFT' && extraction &&
      !extraction.securedIds.includes(this.status.ownId) &&
      (extraction.method === 'albatross' ? inAlbatross(position, extraction) : distanceSquared(position, extraction) <= extraction.radius ** 2))
      return !canSecure ? 'Für die Extraktion aufrichten' : extraction.method === 'balloon' ? 'Am Rettungsseil sichern' : 'Für Abflug sichern';
    if (mission.state !== 'ACTIVE_MISSION' || (mission.plan && !isOperatorGrounded(position, this.prediction.world))) return '';
    for (const objective of missionObjectives(mission)) {
      if (objective.kind !== 'activate' || distanceSquared(objective, position) > objective.radius ** 2) continue;
      if (mission.objectives.some(({ id, state }) => id === objective.id && state === 'available')) {
        const label = objective.label.replace('Kommunikationsanlage ', '');
        return mission.plan ? label : label + ' aktivieren';
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
    const online = this.status.ready && !this.incompatibleWorld && this.match?.room.connection.isOpen;
    const mission = this.status.mission;
    this.weaponAudio.setEnvironment(!mission ? 'outpost' : isCarrierScene(mission.state, mission.phase) ? 'carrier' : 'open-field',
      this.surface.planetId);
    if (online && this.match) {
      for (let i = 0; i < steps; i++) {
        const input = this.input.sample(++this.seq, false, this.lastLife);
        this.prediction.step(input);
        this.predictShot(input, now);
        this.match.input(input);
      }
    }
    // Each step moves the operator over the following 33 ms. The visible operator follows that committed
    // trajectory at frame time (accumulator fraction) instead of jumping once per step.
    this.prediction.sample(dt, online ? this.elapsed / STEP : 1);
    const { players, horde } = this.timeline;
    players.sample(now);
    horde.sample(now);
    if (online && players.before && players.after) {
      const actionTick = players.before.tick + (players.after.tick - players.before.tick) * Math.min(1, players.alpha);
      this.combatPresentation.draw(actionTick, now, this.presentCombatAction);
    }
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
      if (own) this.view.debugPositions(own, this.prediction.position, players.latest?.tick, this.prediction.world);
      else this.view.debugPositions();
    }
    this.view.setRecoil(this.recoil.pitch, this.recoil.yaw);
    const missionTick = Math.max(mission?.tick ?? 0, this.tick + Math.min(3, Math.max(0, (now - this.tickAt) / STEP)));
    this.view.draw(
      now, dt, this.prediction.rendered, this.input.yaw, this.input.pitch, this.status.ownId, this.hp > 0,
      players.before, players.after, players.alpha, horde.before, horde.after, horde.alpha,
      this.input.aim, this.input.sprint, players.latest,
      mission, missionTick, this.status.locked && !mission?.result, this.debugRoutes, this.prediction.visualPosture, this.prediction.visualTick,
      this.reticle?.current, this.match?.atmosphere, Boolean(online), this.telemetry,
    );
    const damageStart = this.telemetry ? performance.now() : 0;
    this.damage.draw(this.damageHud?.current, this.input.yaw + this.recoil.yaw, now);
    if (this.telemetry) this.damageHudTotal += performance.now() - damageStart;
    if (online && (!mission || mission.tick > this.audioFloor)) this.updateAudio(now, dt, missionTick, mission);
    // Titelmusik ohne Raum; im Raum übernimmt die Missionsmusik (ohne Mission bleibt es still).
    if (!this.match) this.missionAudio.music.update(this.titleMusic ? { track: 'title', offset: 0 } : undefined, 'title');
    else if (!mission) this.missionAudio.music.update(undefined, 'title');
    this.cpuTotal += performance.now() - cpuStart;
    this.frames++;
    const hit = now < this.hitUntil;
    const eliminated = now < this.killUntil;
    const hurt = now < this.hurtUntil;
    const allyHit = now < this.allyUntil && !eliminated;
    const friendly = now < this.friendlyUntil ? this.status.friendlyNotice : '';
    const notice = this.notices.current(now);
    const feedbackChanged = this.status.hit !== hit || this.status.eliminated !== eliminated || this.status.hurt !== hurt ||
      this.status.allyHit !== allyHit || this.status.friendlyNotice !== friendly || this.status.notice !== notice;
    this.status.hit = hit;
    this.status.eliminated = eliminated;
    this.status.hurt = hurt;
    this.status.allyHit = allyHit;
    this.status.friendlyNotice = friendly;
    this.status.notice = notice;
    if (now - this.sampleAt >= 250) {
      this.status.fps = this.frames * 1000 / (now - this.sampleAt);
      this.status.frameMs = 1000 / this.status.fps;
      this.status.cpuMs = this.cpuTotal / this.frames;
      const { gpuMs, ...render } = this.view.metrics(Boolean(mission?.debug));
      Object.assign(this.status, render);
      this.status.gpuMs = gpuMs;
      this.status.visibleEnemies = this.view.horde.visible;
      this.status.activeEnemies = this.status.metrics?.activeEnemies ?? horde.after?.count ?? 0;
      this.status.ping = this.match?.pingMs ?? null;
      this.status.duplicateShots = this.combatPresentation.duplicateShots;
      this.status.impactSounds = this.impactAudio.played;
      this.status.duplicateActions = this.combatPresentation.duplicates;
      this.status.meleeSwings = this.meleeSwings;
      this.status.confirmedMeleeHits = this.confirmedMeleeHits;
      this.status.impactRate = Math.round((render.weaponVfx.impactAccepted - this.lastImpactCount) * 1000 / (now - this.sampleAt));
      this.lastImpactCount = render.weaponVfx.impactAccepted;
      this.status.bytesPerSecond = this.match?.rate() ?? 0;
      const diagnostics = this.telemetry ? { ...this.audio.metrics(), planet: this.soundscape.planet,
        weather: this.soundscape.weather, wind: this.soundscape.layers.asset('wind'),
        rate: Math.round((this.audio.played - this.sampleEvents) * 1000 / (now - this.sampleAt)),
        enemyMs: this.hordeAudio.updateMs, enemyPeakMs: this.hordeAudio.peakMs, updateMs: this.audioUpdateTotal / this.frames,
        windups: this.hordeAudio.windups, impacts: this.hordeAudio.impacts,
        weapon: this.weaponAudio.metrics(),
      } : undefined;
      this.sampleEvents = this.audio.played;
      this.audioUpdateTotal = 0;
      this.status.audio = { voices: this.audio.activeVoices, peak: this.audio.peakVoices, dropped: this.audio.droppedVoices, diagnostics };
      this.audio.peakVoices = this.audio.activeVoices;
      const own = this.status.players.find((player) => player.id === this.status.ownId);
      this.status.serverTick = missionTick;
      this.status.atConsole = Boolean(mission && (mission.state === 'CARRIER_HUB' || mission.state === 'MISSION_SELECTION') &&
        distanceSquared(this.prediction.position, CARRIER_CONSOLE) <= CARRIER_CONSOLE.radius ** 2);
      const locker = CARRIER_ROOMS.find(({ label }) => label === 'AUSRÜSTUNG')!;
      this.status.atLocker = Boolean(mission && (mission.state === 'CARRIER_HUB' || mission.state === 'MISSION_SELECTION') &&
        distanceSquared(this.prediction.position, locker) < 5 ** 2);
      this.status.interaction = this.interaction();
      this.status.respawn = own && !own.hp ? Math.max(0, (own.respawnTick - this.tick) / NET.tickHz) : 0;
      if (this.telemetry) this.collectMotion(now - this.sampleAt, own);
      this.damageHudTotal = 0;
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
      ...this.view.presentationCosts(frames), damageHudMs: this.damageHudTotal / frames,
      snapshotHz: players.rate, snapshotJitterMs: players.jitterTicks * STEP,
      interpolationMs: players.delayTicks * STEP, bufferedMs: players.bufferedTicks * STEP,
      extrapolatedPct: players.extrapolatedFrames / frames * 100, heldPct: players.heldFrames / frames * 100,
      predictionErrorCm: this.prediction.error * 100,
      correctionsPerSecond: (stats.corrections - this.correctionsAt) * 1000 / Math.max(1, windowMs),
      lastCorrectionCm: stats.lastCorrection * 100, maxCorrectionCm: stats.maxCorrection * 100, snaps: stats.snaps,
      unacknowledged: this.prediction.unacknowledged,
      posture: posture.current, requestedPosture: posture.requested, grounded: isOperatorGrounded(position, this.prediction.world),
      bodyYaw: posture.yaw * 180 / Math.PI,
      groundSpeed: Math.hypot(posture.groundMotion?.x ?? 0, posture.groundMotion?.z ?? 0),
      getUp: posture.current === 'GETTING_UP' ? `#${posture.getUpId ?? '–'} · ${Math.round(postureProgress(posture, visualTick) * 100)} %` : '–',
      action: own?.equipment?.action ?? (own?.reloadUntil ? own.reload?.phase ?? 'reload' : '–'),
      dive: (posture.dive
        ? `#${posture.dive.id} · ${posture.dive.x.toFixed(2)} / ${posture.dive.z.toFixed(2)} · ${Math.round(postureProgress(posture, visualTick) * 100)} % · ${posture.dive.impact ? 'blockiert · ' : ''}`
        : '') + `${cooldown.toFixed(2)} s`,
      collider: [shape.radius * 2, shape.height, shape.halfLength * 2].map((v) => v.toFixed(2)).join(' × '),
      actions: own && own.hp > 0 && !this.prediction.frozen
        ? Object.entries(BALANCE.movement.actions[posture.current]).filter(([, allowed]) => allowed).map(([name]) => name).join(', ')
        : '',
      serverPosition: own ? format(own) : '–', visualPosition: format(rendered),
      animState: local.playback?.clip ?? '–',
      playback: local.playback ? [local.locomotion,
        local.playback.normalized ? `${Math.round(local.playback.time * 100)} %` : `${local.playback.time.toFixed(2)} s`,
        local.playback.overlay, local.playback.weight === undefined ? undefined : `${Math.round(local.playback.weight * 100)} %`,
      ].filter(Boolean).join(' · ') : '–',
      camera: `${format(local.cameraPosition)} · ${local.collisionPull.toFixed(2)} m`,
      cameraTarget: format(local.cameraTarget),
      input: this.input.lastAction ? `${ACTION_LABELS[this.input.lastAction]} · ${bindings.label(this.input.lastAction)}` : '–',
      moveSpeed: this.travel * 1000 / Math.max(1, windowMs), animSpeed: local.speed,
    };
    this.correctionsAt = stats.corrections;
    this.travel = this.timelineFrames = 0;
    players.extrapolatedFrames = players.heldFrames = 0;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resetAudio();
    this.audio.close();
    this.input.dispose();
    this.view.dispose();
    void this.match?.room.leave();
  }
}
