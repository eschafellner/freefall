import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import type { AtmosphereState, Circle, ExplosionEvent, HordeFrame, MeleeEvent, MissionDefinition, MissionSnapshot, OperatorPosition, PlanetAtmosphereProfile, PlayerState, PlayersSnapshot, PositionXZ, PostureState, ShotEvent, WeaponSlot, WorldDefinition } from '@freefall/shared';
import { MissionEnvironment } from './mission/MissionEnvironment.ts';
import { disposeMissionMeshes } from './mission/disposeMissionMeshes.ts';
import { MissionMarkers } from './mission/MissionMarkers.ts';
import { SwarmBreachController } from './mission/SwarmBreachController.ts';
import {
  CAMERA_BACK, CARRIER_WORLD, WORLD_PROFILES, groundHeight, GROUND_HIT_ZONES, MAX_PITCH, MUZZLE_HEIGHT, WEAPONS, aimRay, allowsPostureAction, groundHitZoneTop,
  isCarrierScene, isGroundPosture, landingShip, missionGround, newPosture, postureCollider, postureDistanceSquared, shotWorldLimit,
  tacticalAimPitch, tacticalAimYaw, tacticalMuzzle, tacticalShotLimit,
} from '@freefall/shared';
import { AlbatrossView } from './mission/AlbatrossView.ts';
import { Carrier } from './mission/Carrier.ts';
import { ConvictView } from './mission/ConvictView.ts';
import { RecoveryView } from './mission/RecoveryView.ts';
import { DescentView } from './mission/DescentView.ts';
import { PlayerRigBatches } from './characters/PlayerRigBatches.ts';
import type { PresentShot } from './characters/PlayerVisualController.ts';
import { GrenadeView } from './weapons/GrenadeView.ts';
import { PlayerView } from './Agents.ts';
import { AssetLoader } from './AssetLoader.ts';
import { cameraPreferences } from './CameraPreferences.ts';
import { ENEMY_VISUALS, SCHABE_VISUAL } from './AssetRegistry.ts';
import { ContactShadows } from './ContactShadows.ts';
import type { EnemyVisualLOD } from './EnemyVisualLOD.ts';
import { GRAPHICS_QUALITY, initialQuality } from './GraphicsQuality.ts';
import type { GraphicsQuality, QualityName } from './GraphicsQuality.ts';
import { GpuFrameTimer } from './RenderMetrics.ts';
import { ThirdPersonCamera, cameraAnchorWeight } from './ThirdPersonCamera.ts';
import { VisualEffectsManager } from './VisualEffectsManager.ts';
import { createTerrain } from './terrain.ts';
import { createBase } from './environment/Base.ts';
import { GroundDetails } from './environment/GroundDetails.ts';
import { AtmosphereController } from './environment/AtmosphereController.ts';
import { createLighting } from './environment/Lighting.ts';
import { createSurfaceMaterials } from './environment/SurfaceMaterials.ts';

const FLIGHT_PHASES = new Set(['DROPPING', 'ATMOSPHERIC_ENTRY', 'BRAKING']);

/** Camera offset from the lander [x, y, z] and look target offset [y, z] per flight phase and progress. */
function dropCamera(phase: string, e: number): [number, number, number, number, number] {
  switch (phase) {
    // Above and behind: the carrier recedes overhead, the planet waits below.
    case 'DROPPING': return [8 + 3 * e, 7.5 - 4 * e, 15 - 3 * e, .6, -.5];
    // Below the leading edge looking up at the glowing belly and the plasma sheath.
    case 'ATMOSPHERIC_ENTRY': return [-10 + 3 * e, -7 + 2 * e, -12 + 2 * e, 1.2, -.8];
    // Wide flank shot that sinks with the lander until it frames the slam at ground level.
    case 'BRAKING': return [17 - 6 * e, 6 - 4.7 * e, 19 - 6 * e, 1.4, -.6];
    default: return [11, 1.3, 13, 1.6, -.6];
  }
}

export class ArenaView {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: T.WebGLRenderer;
  readonly horde: EnemyVisualLOD;
  private readonly scene = new T.Scene();
  private readonly weather = new AtmosphereController(this.scene);
  private debugWeatherOff = new URLSearchParams(location.search).get('weather') === 'off';
  private readonly grenades = new GrenadeView(this.scene);
  private recoilPitch = 0;
  private recoilYaw = 0;
  private readonly staggered = new Map<number, number>();
  private readonly cameraRig = new ThirdPersonCamera();
  private readonly camera = this.cameraRig.camera;
  private readonly players: PlayerView;
  private readonly effects: VisualEffectsManager;
  private readonly assets: AssetLoader;
  private readonly gpuTimer: GpuFrameTimer;
  private readonly contact: ContactShadows;
  private readonly observer: ResizeObserver;
  private readonly terrain: ReturnType<typeof createTerrain>;
  private readonly light: ReturnType<typeof createLighting>;
  private readonly details: GroundDetails;
  private readonly arenaRoot = new T.Group();
  private readonly materials: ReturnType<typeof createSurfaceMaterials>;
  private readonly markers = new MissionMarkers();
  private mission?: {
    definition: MissionDefinition;
    environment: MissionEnvironment;
    breach: SwarmBreachController;
    surface: MissionDefinition['world'];
    atmosphere?: PlanetAtmosphereProfile;
  };
  private operation?: {
    carrier: Carrier; ship: AlbatrossView; recovery: RecoveryView; convicts: ConvictView; descent: DescentView;
  };
  private missionActive = false;
  private markerMode = '';
  private cameraMode = '';
  private cameraTotal = 0;
  private reticleTotal = 0;
  private readonly vector = new T.Vector3();
  private readonly reticleRay = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 };
  private readonly reticleMuzzle = { x: 0, y: 0, z: 0 };
  private readonly overview = { x: -1.8, z: 7.7 };
  private quality: GraphicsQuality = GRAPHICS_QUALITY.medium;
  private debugMarkers?: { server: T.Mesh; predicted: T.Mesh; collider: T.LineSegments; zones: T.Group };
  private post?: { composer: EffectComposer; render: RenderPass; sanitize: ShaderPass; bloom: UnrealBloomPass; output: OutputPass; fxaa: ShaderPass };

  private readonly container: HTMLElement;

  constructor(container: HTMLElement, profile = initialQuality()) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', '3D-Einsatzgebiet Boreal Relay');
    this.renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.gpuTimer = new GpuFrameTimer(this.renderer.getContext() as WebGL2RenderingContext);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.info.autoReset = false;
    container.appendChild(this.canvas);
    const materials = this.materials = createSurfaceMaterials(this.renderer);
    container.appendChild(this.markers.root);
    this.markers.root.hidden = true;
    this.scene.add(this.arenaRoot);
    this.light = createLighting(this.scene, this.renderer.extensions.has('EXT_color_buffer_float'));
    this.terrain = createTerrain(this.arenaRoot, materials);
    createBase(this.arenaRoot, materials);
    this.details = new GroundDetails(this.arenaRoot);
    this.assets = new AssetLoader(this.renderer);
    this.contact = new ContactShadows(this.scene);
    this.horde = new ENEMY_VISUALS[SCHABE_VISUAL](this.scene);
    this.players = new PlayerView(this.scene, this.assets);
    this.effects = new VisualEffectsManager(this.scene, this.horde.fallenGeometry, this.horde.material);
    this.setQuality(profile);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    this.canvas.addEventListener('webglcontextrestored', this.restoreContext);
  }

  setMission(definition?: MissionDefinition, reservations: readonly Circle[] = []): void {
    if (definition && this.mission?.definition !== definition) {
      if (this.mission) this.disposeMissionEnvironment(this.mission.environment);
      this.weather.clear();
      this.light.clearPlanet();
      const anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      const environment = new MissionEnvironment(definition, this.materials, reservations, anisotropy, this.weather.wind);
      const breach = new SwarmBreachController(this.materials);
      environment.root.add(breach.root);
      this.scene.add(environment.root);
      const surface = missionGround(definition.world);
      breach.world = surface;
      const atmosphere = surface.terrain && surface.planetId ? WORLD_PROFILES.get(surface.planetId)?.atmosphere : undefined;
      this.mission = { definition, environment, breach, surface, atmosphere };
      if (!this.operation) {
        const carrier = new Carrier(), ship = new AlbatrossView(), recovery = new RecoveryView();
        const convicts = new ConvictView(this.scene);
        const descent = new DescentView();
        this.scene.add(carrier.root, ship.root, recovery.root, descent.root);
        this.operation = { carrier, ship, recovery, convicts, descent };
      }
    }
    if (!definition) {
      this.weather.clear();
      this.light.clearPlanet();
      if (this.mission) {
        this.disposeMissionEnvironment(this.mission.environment);
        this.mission = undefined;
      }
    }
    this.missionActive = Boolean(definition);
    this.markerMode = '';
    if (this.operation) {
      this.operation.carrier.root.visible = false;
      this.operation.ship.root.visible = false;
      this.operation.recovery.root.visible = false;
      this.operation.descent.root.visible = false;
    }
    this.arenaRoot.visible = !this.missionActive;
    if (this.mission) {
      this.mission.environment.root.visible = this.missionActive;
      this.mission.environment.debug.visible = false;
      this.mission.environment.configureQuality(this.quality);
    }
    this.camera.far = definition ? 470 : 325;
    this.camera.updateProjectionMatrix();
    this.canvas.setAttribute('aria-label', definition ? definition.displayName : '3D-Einsatzgebiet Boreal Relay');
    this.markers.root.hidden = true;
    this.resize();
    this.refreshShadows();
  }

  audioTransport() {
    const operation = this.operation;
    return {
      ship: operation?.ship.root.visible ? operation.ship.root.position : undefined,
      recovery: operation?.recovery.audioPosition,
    };
  }

  toggleDebugWeather(): void { this.debugWeatherOff = !this.debugWeatherOff; }

  private disposeMissionEnvironment(environment: MissionEnvironment): void {
    disposeMissionMeshes(environment.root, new Set(Object.values(this.materials)),
      environment.auxiliaryMaterials(), environment.generatedTextures());
  }

  setQuality(name: QualityName): void {
    this.quality = GRAPHICS_QUALITY[name];
    this.effects.setQuality(this.quality);
    this.grenades.setQuality(this.quality);
    this.terrain.simplify(name === 'low');
    this.mission?.environment.configureQuality(this.quality);
    const floatColor = this.renderer.extensions.has('EXT_color_buffer_float');
    const { shadowMapSize, fxaa, carrierBloom } = this.quality;
    const { sun } = this.light;
    this.renderer.shadowMap.enabled = sun.castShadow = shadowMapSize > 0;
    if (sun.shadow.mapSize.x !== shadowMapSize || !shadowMapSize) {
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      if (shadowMapSize) sun.shadow.mapSize.setScalar(shadowMapSize);
    }
    this.refreshShadows();

    // The composer runs for FXAA (high) and for the carrier bloom (medium and high, carrier only).
    const wantPost = (fxaa || carrierBloom > 0) && floatColor;
    if (wantPost && !this.post) {
      const composer = new EffectComposer(this.renderer);
      const render = new RenderPass(this.scene, this.camera);
      const bloom = new UnrealBloomPass(new T.Vector2(256, 256), carrierBloom, .28, 1.5);
      // Bloom smears single invalid or extreme pixels (NaN, Inf, tiny specular peaks) into flashing blocks; clamp first.
      const sanitize = new ShaderPass({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
        fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
          void main() {
            vec4 c = texture2D(tDiffuse, vUv);
            bool bad = any(isnan(c.rgb)) || any(isinf(c.rgb));
            gl_FragColor = vec4(bad ? vec3(0.) : min(c.rgb, vec3(24.)), c.a);
          }`,
      });
      const output = new OutputPass();
      const fxaaPass = new ShaderPass(FXAAShader);
      composer.addPass(render);
      composer.addPass(sanitize);
      composer.addPass(bloom);
      composer.addPass(output);
      composer.addPass(fxaaPass);
      this.post = { composer, render, sanitize, bloom, output, fxaa: fxaaPass };
    } else if (!wantPost) {
      this.disposePost();
    }
    if (this.post) {
      this.post.fxaa.enabled = fxaa;
      this.post.bloom.strength = carrierBloom;
    }
    this.resize();
  }

  private readonly restoreContext = (): void => {
    // WebGLRenderer recreates its shadow settings along with the context.
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.enabled = this.quality.shadowMapSize > 0;
    this.renderer.info.autoReset = false;
    this.gpuTimer.restore();
    this.refreshShadows();
  };

  private readonly refreshShadows = (): void => {
    this.light.sun.shadow.needsUpdate = this.renderer.shadowMap.needsUpdate = true;
  };

  private readonly resize = (): void => {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio) * this.quality.resolutionScale;
    if (this.renderer.getPixelRatio() !== pixelRatio) this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.effects.setViewport(this.canvas.height);
    this.markers.resize(width, height);
    this.mission?.breach.setViewport(this.canvas.height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.post) {
      this.post.composer.setPixelRatio(pixelRatio);
      this.post.composer.setSize(width, height);
      const resolution: T.Vector2 = this.post.fxaa.uniforms.resolution.value;
      resolution.set(1 / this.canvas.width, 1 / this.canvas.height);
    }
  };

  explosion(event: ExplosionEvent, distance: number, alive: boolean, now: number): void {
    this.grenades.explode(event, now, this.camera);
    if (alive && distance < 22) this.cameraRig.blast((1 - distance / 22) ** 2);
  }

  melee(event: MeleeEvent, own: boolean, alive: boolean, now: number): void {
    if (own && alive && event.damage > 0) this.cameraRig.impulse('melee', .24);
    if (event.damage <= 0) return;
    const fallen = event.eliminated && event.enemy ? this.horde.hit(event.enemy, now, true) : undefined;
    this.effects.melee(event, now, this.camera, own, fallen);
  }

  /** Predicted gameplay recoil of the local weapon. Moves the camera (and crosshair) onto the server's shot line. */
  setRecoil(pitch: number, yaw: number): void {
    this.recoilPitch = pitch;
    this.recoilYaw = yaw;
  }

  /** Keeps the approved hit reaction of a staggered enemy active for the stagger duration (no new animation). */
  stagger(id: number, until: number): void { if (id) this.staggered.set(id, until); }

  private firingCamera(slot: WeaponSlot): void {
    if (!cameraPreferences.reducedMotion) this.cameraRig.fire(WEAPONS[slot].recoil.cameraKick / .63);
  }

  predictFire(shooter: PlayerState, slot: WeaponSlot, now: number): void {
    this.firingCamera(slot);
    this.players.queueShot({ shooter: shooter.id, life: shooter.life, slot }, shooter, now, (weapon, at) => {
      if (weapon) this.effects.fire(weapon, slot, at, true, this.camera);
    });
  }

  shot(event: ShotEvent, shooter: PlayerState | undefined, local: boolean, predicted: boolean, now: number, audio: () => void): void {
    const slot = event.slot ?? 'primary';
    const present: PresentShot = (weapon, at) => {
      if (weapon) this.effects.fire(weapon, slot, at, local, this.camera);
      const fallen = event.impact?.kind === 'enemy' && event.eliminated ? this.horde.hit(event.enemy, at, true) : undefined;
      this.effects.add(event, at, this.camera, local, fallen);
      audio();
    };
    if (!predicted) {
      if (local) this.firingCamera(slot);
      const cue = local ? { ...event, tick: undefined } : event;
      if (this.players.queueShot(cue, shooter, now, present) || this.operation?.convicts.queueShot(cue, now, present)) return;
    }
    present(undefined, now);
  }

  clearWeaponPresentation(): void {
    this.players.clearShots();
    this.operation?.convicts.clearShots();
    this.effects.clear();
  }

  clearCombatActions(tick: number): void {
    this.grenades.fence(tick);
    this.staggered.clear();
    this.cameraRig.clearImpulse();
  }

  clearCameraFeedback(): void { this.cameraRig.clearImpulse(); }
  damageImpulse(amount: number): void { this.cameraRig.impulse('damage', Math.min(.8, .28 + amount / 100)); }
  missionImpulse(distance: number): void {
    if (distance < 18 && this.quality !== GRAPHICS_QUALITY.low) this.cameraRig.impulse('mission', .26 * (1 - distance / 18));
  }

  clearMatch(): void {
    this.cameraRig.reset();
    this.players.clear();
    this.horde.clear();
    this.clearWeaponPresentation();
    this.grenades.clear(true);
    this.staggered.clear();
    this.setMission();
  }

  draw(now: number, dt: number, position: OperatorPosition, yaw: number, pitch: number, own: string, alive: boolean,
    p1: PlayersSnapshot | undefined, p2: PlayersSnapshot | undefined, pAlpha: number,
    h1: HordeFrame | undefined, h2: HordeFrame | undefined, hAlpha: number,
    aim = false, sprint = false, latest?: PlayersSnapshot,
    state?: MissionSnapshot, missionTick = 0, showMarkers = false, debug = false, posture?: PostureState, poseTick = missionTick,
    reticle?: HTMLElement | null, atmosphere?: AtmosphereState, online = true, measurePresentation = false,
  ): void {
    this.contact.begin();
    const mission = this.missionActive ? this.mission : undefined;
    const operation = this.operation;
    const carrier = !!mission && (!state || isCarrierScene(state.state, state.phase));
    const flying = state?.state === 'DEPLOYMENT' && FLIGHT_PHASES.has(state.phase);
    const braking = state?.phase === 'BRAKING' && Boolean(mission);
    const groundBelow = braking && mission ? landingShip(mission.definition.world.deployment) : undefined;
    const renderCarrier = carrier && !braking;
    const mode = renderCarrier ? 'carrier' : mission ? 'surface' : 'arena';
    if (mode !== this.markerMode) {
      this.markerMode = mode;
      this.effects.clear();
      this.refreshShadows();
    }
    if (mission) mission.environment.root.visible = !renderCarrier;
    if (operation) operation.carrier.root.visible = carrier && !flying;
    const world = carrier ? CARRIER_WORLD : mission?.surface;
    this.contact.world = this.effects.world = this.grenades.world = world;
    const aiming = aim && (!posture || allowsPostureAction(posture, 'aim'));
    const sprinting = sprint && (!posture || allowsPostureAction(posture, 'sprint'));
    this.players.draw(p1, p2, pAlpha, own, position, yaw, pitch, aiming, sprinting, now, dt, this.contact, latest, missionTick, posture, poseTick, world);
    this.players.expireShots(now);
    const shape = own && alive && posture ? postureCollider(posture, poseTick) : undefined;
    const viewYaw = own ? yaw + this.recoilYaw : .19;
    const viewPitch = own ? Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch + this.recoilPitch)) : -.12;
    const securedLift = state?.extraction?.phase === 'LIFT' && state.extraction.securedIds.includes(own);
    const cameraMode = state?.state === 'DEPLOYMENT' || securedLift ? 'transport' : mode;
    if (this.cameraMode !== cameraMode) {
      this.cameraMode = cameraMode;
      this.cameraRig.reset();
    }
    const cameraStart = measurePresentation ? performance.now() : 0;
    this.cameraRig.update(own ? position : this.overview, viewYaw, viewPitch,
      Boolean(own && alive && aiming), this.players.localSprint, dt, world, own ? position.y : 0, shape?.lookHeight,
      shape && posture ? cameraAnchorWeight(posture, poseTick) : 0);
    if (measurePresentation) this.cameraTotal += performance.now() - cameraStart;
    const cameraPosition = this.cameraRig.camera.position;
    if (shape && posture && cameraPosition.y < position.y + shape.height + .11 &&
        postureDistanceSquared(position, shape, posture.yaw, cameraPosition.x, cameraPosition.z) < .11 ** 2) {
      this.players.hideLocal(own);
    }
    if (reticle) {
      const reticleStart = measurePresentation ? performance.now() : 0;
      const slot = latest?.players.find((player) => player.id === own)?.equipment?.slot ?? 'primary';
      this.updateReticle(reticle, position, yaw, viewYaw, viewPitch, poseTick, slot, world, own && alive ? posture : undefined);
      if (measurePresentation) this.reticleTotal += performance.now() - reticleStart;
    }
    const low = this.quality === GRAPHICS_QUALITY.low;
    if (operation) {
      PlayerRigBatches.setTransport(this.scene, undefined);
      if (mission && state) {
        operation.carrier.update(now, state, low, this.renderer.getPixelRatio());
        operation.ship.update(state, missionTick, this.quality, latest, mission.surface, cameraPreferences.reducedMotion);
        operation.recovery.update(state.result || state.state === 'RETURN_TO_CARRIER' ? undefined : state.extraction,
          missionTick, dt, latest, own, position, mission.surface);
        const ship = operation.ship.root;
        // The braking lander descends over its landing pad; the height comes from the drop choreography.
        if (groundBelow) ship.position.set(groundBelow.x, ship.position.y, groundBelow.z);
        // Flight turbulence follows the camera settings: scaled by "Wackeln", off with reduced motion.
        const turbulence = cameraPreferences.reducedMotion ? 0 : cameraPreferences.shake;
        const pose = operation.ship.pose;
        if (state.state === 'DEPLOYMENT' && pose && (flying || state.phase === 'TOUCHDOWN')) {
          const e = T.MathUtils.clamp((missionTick - state.phaseAt) / Math.max(1, state.phaseUntil - state.phaseAt), 0, 1);
          const shot = dropCamera(state.phase, e);
          const ground = mission ? groundHeight(mission.surface, ship.position.x + shot[0], ship.position.z + shot[2]) : 0;
          this.camera.position.set(ship.position.x + shot[0], ship.position.y + shot[1], ship.position.z + shot[2]);
          if (!flying || state.phase === 'BRAKING') this.camera.position.y = Math.max(this.camera.position.y, ground + 1.6);
          const jolt = pose.shake * turbulence;
          this.camera.position.x += (Math.sin(missionTick * 1.9) * .11 + Math.sin(missionTick * 4.3) * .05) * jolt;
          this.camera.position.y += (Math.sin(missionTick * 2.6 + 1) * .09 + Math.sin(missionTick * 5.1) * .04) * jolt;
          this.camera.lookAt(ship.position.x, ship.position.y + shot[3], ship.position.z + shot[4]);
          this.camera.rotateZ(Math.sin(missionTick * 1.3) * .006 * jolt);
        } else if (state.state === 'DEPLOYMENT' && state.phase === 'LOCKED') {
          const jolt = (pose?.shake ?? .2) * turbulence;
          this.camera.position.y += Math.sin(missionTick * 1.5) * .03 * jolt;
          this.camera.position.x += Math.sin(missionTick * 3.7) * .015 * jolt;
        }
        const extraction = state.extraction;
        if (extraction?.phase === 'LIFT' && !state.result) {
          const t = T.MathUtils.clamp((missionTick - extraction.phaseAt) / Math.max(1, extraction.endsAt - extraction.phaseAt), 0, 1);
          const offset = extraction.method === 'albatross'
            ? this.vector.set(0, ship.position.y, ship.position.z - extraction.z)
            : this.vector.set(Math.sin(Math.PI * .235) * 95 * t ** 1.8, 45 * t, -Math.cos(Math.PI * .235) * 95 * t ** 1.8);
          const secured = latest?.players.filter((player) => extraction.securedIds.includes(player.id)) ?? [];
          PlayerRigBatches.setTransport(this.scene, new Map(secured.map(({ slot }) => [slot, offset])));
          if (extraction.securedIds.includes(own)) {
            const rescuedByFighter = extraction.method === 'balloon';
            this.camera.position.set(position.x + offset.x + (rescuedByFighter ? 21 : 8),
              position.y + offset.y + (rescuedByFighter ? 11.8 : 5.8), position.z + offset.z + (rescuedByFighter ? 22 : 11));
            this.camera.lookAt(position.x + offset.x, position.y + offset.y + (rescuedByFighter ? 8.3 : 2.5), position.z + offset.z);
          }
        }
        this.camera.updateMatrixWorld();
        operation.convicts.draw(state.convicts, missionTick, now, dt, this.camera,
          Boolean(flying) || state.phase === 'TOUCHDOWN' || state.state === 'RETURN_TO_CARRIER', world);
        if (!carrier) {
          mission.environment.updateObjectives(state.objectives);
          mission.environment.debug.visible = debug;
          mission.breach.update(state.nests, missionTick, this.camera, low);
          this.markers.update(mission.definition, state, this.camera, position, missionTick, hAlpha > .5 ? h2 : h1,
            showMarkers && state.state !== 'DEPLOYMENT' && !securedLift);
        } else this.markers.root.hidden = true;
      } else operation.convicts.draw([], missionTick, now, dt, this.camera, true);
    }
    for (const [id, until] of this.staggered) {
      if (now >= until) this.staggered.delete(id);
      else this.horde.hit(id, now, false);
    }
    this.players.drawBatches(this.camera);
    if (mission && !renderCarrier) mission.environment.update(this.camera);
    const weatherEnabled = !(state?.debug && this.debugWeatherOff);
    const weatherState = weatherEnabled && atmosphere?.instanceId === state?.instanceId ? atmosphere : undefined;
    const weather = state?.result && mode === 'surface' && weatherEnabled
      ? this.weather.finish(state.instanceId)
      : this.weather.update(state?.result ? undefined : weatherState, mission?.surface, mission?.atmosphere, missionTick, dt, this.camera,
        this.quality, cameraPreferences.reducedMotion, this.renderer.getPixelRatio(), mode === 'surface' && !flying, Boolean(state?.debug));
    const post = this.post && (this.quality.fxaa || (renderCarrier && this.quality.carrierBloom > 0)) ? this.post : undefined;
    if (this.post) this.post.bloom.enabled = this.post.sanitize.enabled = renderCarrier && this.quality.carrierBloom > 0;
    if (this.light.update(mode, Boolean(post), this.camera.position.x, this.camera.position.z, mission?.atmosphere, weather)) {
      this.refreshShadows();
    }
    this.renderer.toneMappingExposure = this.light.exposure;
    operation?.descent.update(flying && state ? state : undefined, missionTick, low, this.scene, groundBelow,
      operation.ship.root.position.y);
    if (!mission) this.details.update(this.camera, this.quality.gravelDistance, this.quality.brushDistance);
    this.horde.draw(this.camera, carrier ? undefined : h1, carrier ? undefined : h2, hAlpha, now, this.quality, this.contact, world);
    this.contact.end();
    const wind = this.weather.wind.flow.value;
    // Operator poses may extrapolate a little; grenade poses stop at the last confirmed sample.
    const combatScene = online && !carrier && !flying && !state?.result;
    this.grenades.draw(combatScene ? p1 : undefined, combatScene ? p2 : undefined, Math.min(1, pAlpha), latest?.tick ?? -1, this.camera, now,
      cameraPreferences.muzzleFlash, cameraPreferences.reducedMotion, wind.x, wind.y);
    this.effects.draw(now, this.camera, cameraPreferences.muzzleFlash, cameraPreferences.reducedMotion, wind.x, wind.y);
    this.renderer.info.reset();
    this.gpuTimer.begin();
    try {
      if (post) post.composer.render(dt);
      else this.renderer.render(this.scene, this.camera);
    } finally {
      this.gpuTimer.end();
    }
  }

  /** Locomotion state and animation speed of the local operator (telemetry). */
  localMotion() {
    const model = this.players.localModel;
    return { playback: model?.playback, locomotion: model?.animation.locomotion, speed: model?.animation.speed ?? 0,
      cameraPosition: this.cameraRig.camera.position, cameraTarget: this.cameraRig.target, collisionPull: this.cameraRig.collisionPull };
  }

  presentationCosts(frames: number) {
    const result = { cameraMs: this.cameraTotal / frames, reticleMs: this.reticleTotal / frames };
    this.cameraTotal = this.reticleTotal = 0;
    return result;
  }

  private updateReticle(element: HTMLElement, position: OperatorPosition, bodyYaw: number, yaw: number, pitch: number, tick: number,
    slot: WeaponSlot, world?: WorldDefinition, posture?: PostureState): void {
    const canFire = !posture || allowsPostureAction(posture, 'fire');
    const tactical = posture && posture.current !== 'STANDING';
    if (!canFire) {
      element.style.left = element.style.top = '50%';
      element.style.visibility = 'hidden';
      element.classList.remove('blocked');
      return;
    }
    const shape = posture ? postureCollider(posture, tick) : undefined;
    const aimYaw = tactical ? tacticalAimYaw(posture, yaw) : yaw;
    const ray = this.reticleRay, muzzle = this.reticleMuzzle;
    aimRay(ray, position, aimYaw, tactical ? tacticalAimPitch(posture, pitch) : pitch, tactical ? shape?.lookHeight : undefined, position.y, !!world?.terrain);
    const range = WEAPONS[slot].effectiveRange;
    const aimDistance = shotWorldLimit(ray, CAMERA_BACK, range + CAMERA_BACK, world);
    let end = aimDistance;
    if (shape && posture && (tactical || world?.terrain)) {
      if (tactical) tacticalMuzzle(muzzle, position, posture, aimYaw, shape);
      else {
        muzzle.x = position.x + Math.cos(bodyYaw) * .58 + Math.sin(bodyYaw) * .66;
        muzzle.y = position.y + MUZZLE_HEIGHT;
        muzzle.z = position.z + Math.sin(bodyYaw) * .58 - Math.cos(bodyYaw) * .66;
      }
      end = tacticalShotLimit(ray, position, muzzle, posture, shape, aimDistance, range, false, world);
    }
    const point = this.vector.set(ray.x + ray.dx * end, ray.y + ray.dy * end, ray.z + ray.dz * end);
    point.project(this.cameraRig.camera);
    const visible = point.z >= -1 && point.z <= 1 && Math.abs(point.x) < .97 && Math.abs(point.y) < .96;
    element.style.visibility = '';
    element.style.left = visible ? `${(1 + point.x) * 50}%` : '50%';
    element.style.top = visible ? `${(1 - point.y) * 50}%` : '50%';
    element.classList.toggle('blocked', !visible || end <= (tactical || world?.terrain ? .28 : CAMERA_BACK + .02));
  }

  /**
   * Telemetry overlay: orange ring at the last authoritative server position, cyan ring at the
   * simulated client prediction. The rendered operator is drawn between them. Without arguments hidden.
   */
  debugPositions(server?: PlayerState, predicted?: OperatorPosition, tick = 0, world?: WorldDefinition): void {
    if (!server && !predicted) {
      if (this.debugMarkers) {
        const { server, predicted, collider, zones } = this.debugMarkers;
        server.visible = predicted.visible = collider.visible = zones.visible = false;
      }
      return;
    }
    if (!this.debugMarkers) {
      const marker = (color: number, radius: number) => {
        const mesh = new T.Mesh(new T.RingGeometry(radius - .045, radius, 40).rotateX(-Math.PI / 2),
          new T.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: .85, toneMapped: false }));
        mesh.renderOrder = 10;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        return mesh;
      };
      const unit = new T.BoxGeometry(1, 1, 1);
      const collider = new T.LineSegments(new T.EdgesGeometry(unit),
        new T.LineBasicMaterial({ color: 0xff8a3d, depthTest: false, transparent: true, opacity: .7, toneMapped: false }));
      unit.dispose();
      collider.renderOrder = 10;
      this.scene.add(collider);
      const zones = new T.Group();
      for (const color of [0xffdf72, 0xff6274, 0x8aff94]) {
        const zone = new T.LineSegments(collider.geometry, new T.LineBasicMaterial({ color, depthTest: false, toneMapped: false }));
        zone.renderOrder = 11;
        zones.add(zone);
      }
      this.scene.add(zones);
      this.debugMarkers = { server: marker(0xff8a3d, .55), predicted: marker(0x5fe3ff, .42), collider, zones };
    }
    const { server: s, predicted: p, collider, zones } = this.debugMarkers;
    s.visible = !!server;
    p.visible = !!predicted;
    collider.visible = !!server && server.hp > 0;
    zones.visible = !!server?.posture && server.hp > 0 && isGroundPosture(server.posture.current);
    if (server) {
      const posture = server.posture ?? newPosture(server.yaw);
      const shape = postureCollider(posture, tick);
      s.position.set(server.x, (server.y ?? 0) + .04, server.z);
      collider.position.set(server.x, (server.y ?? 0) + shape.height / 2, server.z);
      collider.scale.set(shape.radius * 2, shape.height, shape.halfLength * 2);
      collider.rotation.y = posture.current === 'STANDING' || posture.current === 'CROUCHING' ? 0 : -posture.yaw;
      if (zones.visible) {
        const supine = posture.current === 'SUPINE';
        zones.position.set(server.x, server.y ?? 0, server.z);
        zones.rotation.y = -posture.yaw;
        for (const [i, zone] of GROUND_HIT_ZONES.entries()) {
          const top = groundHitZoneTop(zone, supine);
          const centerZ = zone.z * shape.halfLength * (supine ? -1 : 1);
          const elevation = world?.terrain ? groundHeight(world, server.x - Math.sin(posture.yaw) * centerZ,
            server.z + Math.cos(posture.yaw) * centerZ) - zones.position.y : 0;
          zones.children[i].position.set(0, elevation + (top + zone.bottom) * shape.height / 2, centerZ);
          zones.children[i].scale.set(2 * zone.halfWidth * shape.radius, (top - zone.bottom) * shape.height,
            2 * zone.halfLength * shape.halfLength);
        }
      }
    }
    if (predicted) p.position.set(predicted.x, predicted.y + .05, predicted.z);
  }

  metrics(captureCamera = false) {
    if (captureCamera) this.canvas.dataset.camera = JSON.stringify({ position: this.camera.position.toArray(),
      quaternion: this.camera.quaternion.toArray(), fov: this.camera.fov, resolution: [this.canvas.width, this.canvas.height] });
    else if (this.canvas.dataset.camera) delete this.canvas.dataset.camera;
    const { render, memory } = this.renderer.info;
    const { opaque, transparent, transmissive } = this.renderer.renderLists.get(this.scene, 0);
    let meshes = 0;
    let instances = 0;
    for (const list of [opaque, transparent, transmissive]) {
      for (const { object, geometry } of list) {
        if (geometry?.drawRange.count === 0) continue;
        if (object instanceof T.InstancedMesh) instances += object.count;
        else if (object instanceof T.Mesh) meshes++;
      }
    }
    return {
      drawCalls: render.calls, triangles: render.triangles, meshes, instances,
      geometries: memory.geometries, textures: memory.textures, gpuMs: this.gpuTimer.sample(),
      weather: this.weather.metrics(),
      weaponVfx: this.effects.metrics(),
      explosiveVfx: this.grenades.metrics(),
    };
  }

  private disposePost(): void {
    if (!this.post) return;
    this.post.render.dispose();
    this.post.bloom.dispose();
    this.post.sanitize.dispose();
    this.post.output.dispose();
    this.post.fxaa.dispose();
    this.post.composer.dispose();
    this.post = undefined;
  }

  dispose(): void {
    this.observer.disconnect();
    this.canvas.removeEventListener('webglcontextrestored', this.restoreContext);
    this.disposePost();
    this.weather.clear();
    this.light.dispose();
    this.players.dispose();
    this.effects.dispose();
    this.operation?.convicts.dispose();
    PlayerRigBatches.setTransport(this.scene, undefined);
    this.assets.dispose();
    this.gpuTimer.dispose();
    const geometries = new Set<T.BufferGeometry>();
    const materials = new Set<T.Material>([...this.terrain.materials, ...(this.mission?.environment.auxiliaryMaterials() ?? [])]);
    const textures = new Set<T.Texture>(this.mission?.environment.generatedTextures());
    this.scene.traverse((object) => {
      if ('geometry' in object && object.geometry instanceof T.BufferGeometry) geometries.add(object.geometry);
      if ('material' in object) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof T.Material) materials.add(material);
        }
      }
      if (object instanceof T.InstancedMesh) object.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value);
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    this.markers.root.remove();
  }
}
