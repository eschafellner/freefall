import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import type { HordeFrame, MissionDefinition, MissionSnapshot, PlayersSnapshot, PositionXZ, ShotEvent } from '@freefall/shared';
import { MissionEnvironment } from './mission/MissionEnvironment.ts';
import { MissionMarkers } from './mission/MissionMarkers.ts';
import { SwarmBreachController } from './mission/SwarmBreachController.ts';
import { CARRIER_WORLD, isCarrierScene, landingShip, missionGround } from '@freefall/shared';
import { AlbatrossView } from './mission/AlbatrossView.ts';
import { Carrier } from './mission/Carrier.ts';
import { ConvictView } from './mission/ConvictView.ts';
import { RecoveryView } from './mission/RecoveryView.ts';
import { DescentView } from './mission/DescentView.ts';
import { PlayerRigBatches } from './characters/PlayerRigBatches.ts';
import { GrenadeView } from './weapons/GrenadeView.ts';
import { PlayerView } from './Agents.ts';
import { AssetLoader } from './AssetLoader.ts';
import { ENEMY_VISUALS, SCHABE_VISUAL } from './AssetRegistry.ts';
import { ContactShadows } from './ContactShadows.ts';
import type { EnemyVisualLOD } from './EnemyVisualLOD.ts';
import { GRAPHICS_QUALITY, initialQuality } from './GraphicsQuality.ts';
import type { GraphicsQuality, QualityName } from './GraphicsQuality.ts';
import { GpuFrameTimer } from './RenderMetrics.ts';
import { ThirdPersonCamera } from './ThirdPersonCamera.ts';
import { VisualEffectsManager } from './VisualEffectsManager.ts';
import { createTerrain } from './terrain.ts';
import { createBase } from './environment/Base.ts';
import { GroundDetails } from './environment/GroundDetails.ts';
import { LIGHTING, createLighting } from './environment/Lighting.ts';
import { createSurfaceMaterials } from './environment/SurfaceMaterials.ts';

const FLIGHT_PHASES = new Set(['DROPPING', 'ATMOSPHERIC_ENTRY', 'BRAKING']);

export class ArenaView {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: T.WebGLRenderer;
  readonly horde: EnemyVisualLOD;
  private readonly scene = new T.Scene();
  private readonly grenades = new GrenadeView(this.scene);
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
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
  };
  private operation?: {
    carrier: Carrier; ship: AlbatrossView; recovery: RecoveryView; convicts: ConvictView; descent: DescentView;
  };
  private missionActive = false;
  private markerMode = '';
  private readonly darkness = new T.Color(0x101b1f);
  private readonly vector = new T.Vector3();
  private ownId = '';
  private readonly overview = { x: -1.8, z: 7.7 };
  private quality: GraphicsQuality = GRAPHICS_QUALITY.medium;
  private debugMarkers?: { server: T.Mesh; predicted: T.Mesh };
  private post?: { composer: EffectComposer; render: RenderPass; output: OutputPass; fxaa: ShaderPass };

  private readonly container: HTMLElement;

  constructor(container: HTMLElement, profile = initialQuality()) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', '3D-Einsatzgebiet Boreal Relay');
    this.renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.gpuTimer = new GpuFrameTimer(this.renderer.getContext() as WebGL2RenderingContext);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LIGHTING.exposure;
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

  setMission(definition?: MissionDefinition): void {
    if (definition && this.mission?.definition !== definition) {
      const environment = new MissionEnvironment(definition, this.materials);
      const breach = new SwarmBreachController(this.materials);
      environment.root.add(breach.root);
      this.scene.add(environment.root);
      const surface = missionGround(definition.world);
      this.mission = { definition, environment, breach, surface };
      if (!this.operation) {
        const carrier = new Carrier(), ship = new AlbatrossView(), recovery = new RecoveryView();
        const convicts = new ConvictView(this.scene);
        const descent = new DescentView();
        this.scene.add(carrier.root, ship.root, recovery.root, descent.root);
        this.operation = { carrier, ship, recovery, convicts, descent };
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
      this.mission.environment.simplify(this.quality === GRAPHICS_QUALITY.low);
    }
    (this.scene.fog as T.FogExp2).density = definition ? .0041 : LIGHTING.fogDensity;
    this.camera.far = definition ? 470 : 325;
    this.camera.updateProjectionMatrix();
    this.canvas.setAttribute('aria-label', definition ? definition.displayName : '3D-Einsatzgebiet Boreal Relay');
    this.markers.root.hidden = true;
    this.resize();
    this.refreshShadows();
  }

  setQuality(name: QualityName): void {
    this.quality = GRAPHICS_QUALITY[name];
    this.effects.setQuality(this.quality);
    this.terrain.simplify(name === 'low');
    this.mission?.environment.simplify(name === 'low');
    const floatColor = this.renderer.extensions.has('EXT_color_buffer_float');
    const { shadowMapSize, fxaa } = this.quality;
    const { sun } = this.light;
    this.renderer.shadowMap.enabled = sun.castShadow = shadowMapSize > 0;
    if (sun.shadow.mapSize.x !== shadowMapSize || !shadowMapSize) {
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      if (shadowMapSize) sun.shadow.mapSize.setScalar(shadowMapSize);
    }
    this.refreshShadows();

    if (fxaa && floatColor && !this.post) {
      const composer = new EffectComposer(this.renderer);
      const render = new RenderPass(this.scene, this.camera);
      const output = new OutputPass();
      const fxaaPass = new ShaderPass(FXAAShader);
      composer.addPass(render);
      composer.addPass(output);
      composer.addPass(fxaaPass);
      this.post = { composer, render, output, fxaa: fxaaPass };
    } else if (!fxaa || !floatColor) {
      this.disposePost();
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

  blast(distance: number): void {
    if (!this.reducedMotion.matches && distance < 16) this.cameraRig.fire(1 - distance / 16);
  }

  shot(event: ShotEvent, now: number): void {
    if (!this.reducedMotion.matches && this.ownId === event.shooter) this.cameraRig.fire();
    this.effects.add(event, now, this.horde.hit(event.enemy, now, event.eliminated), this.operation?.convicts.shot(event) ?? this.players.shotOrigin(event));
  }

  clearMatch(): void {
    this.ownId = '';
    this.cameraRig.reset();
    this.players.clear();
    this.horde.clear();
    this.effects.clear();
    this.setMission();
  }

  draw(now: number, dt: number, position: PositionXZ, yaw: number, pitch: number, own: string, alive: boolean,
    p1: PlayersSnapshot | undefined, p2: PlayersSnapshot | undefined, pAlpha: number,
    h1: HordeFrame | undefined, h2: HordeFrame | undefined, hAlpha: number,
    aim = false, sprint = false, latest?: PlayersSnapshot,
    state?: MissionSnapshot, missionTick = 0, showMarkers = false, debug = false,
  ): void {
    this.ownId = own;
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
      this.refreshShadows();
    }
    this.scene.background = renderCarrier ? this.darkness : this.light.sky;
    const fog = this.scene.fog as T.FogExp2;
    fog.color.setHex(renderCarrier ? 0x1d2b2e : LIGHTING.fog);
    fog.density = renderCarrier ? .009 : mission ? .0041 : LIGHTING.fogDensity;
    if (mission) mission.environment.root.visible = !renderCarrier;
    if (operation) operation.carrier.root.visible = carrier && !flying;
    const world = carrier ? CARRIER_WORLD : mission?.surface;
    this.players.draw(p1, p2, pAlpha, own, position, yaw, pitch, aim, sprint, now, dt, this.contact, latest, missionTick);
    this.cameraRig.update(own ? position : this.overview, own ? yaw : .19, own ? pitch : -.12,
      Boolean(own && alive && aim), this.players.localSprint, dt, world);
    const low = this.quality === GRAPHICS_QUALITY.low;
    if (operation) {
      operation.descent.update(flying && state ? state : undefined, missionTick, low, this.scene, groundBelow);
      PlayerRigBatches.setTransport(this.scene, undefined);
      if (mission && state) {
        operation.carrier.update(now, state, low);
        operation.ship.update(state, missionTick, low);
        operation.recovery.update(state.result || state.state === 'RETURN_TO_CARRIER' ? undefined : state.extraction,
          missionTick, dt, latest, own, position);
        const ship = operation.ship.root;
        if (groundBelow) {
          const t = T.MathUtils.clamp((missionTick - state.phaseAt) / (state.phaseUntil - state.phaseAt), 0, 1);
          ship.position.set(groundBelow.x, 9 + 24 * (1 - t) ** 1.6, groundBelow.z);
        }
        if (state.state === 'DEPLOYMENT' && (flying || state.phase === 'TOUCHDOWN')) {
          const scale = flying ? groundBelow ? 1.25 : 1 : .55;
          this.camera.position.set(ship.position.x + 12.8 * scale, ship.position.y + (groundBelow ? 8.3 : 5.5) * scale,
            ship.position.z + (flying ? 13 : 16));
          this.camera.position.x += Math.sin(missionTick * .7) * (flying ? .13 : .035);
          this.camera.lookAt(ship.position.x, ship.position.y + 1.7, ship.position.z - .7);
        } else if (state.state === 'DEPLOYMENT' && state.phase === 'LOCKED') {
          this.camera.position.y += Math.sin(missionTick * 1.5) * .022;
        }
        const extraction = state.extraction;
        if (extraction?.phase === 'LIFT' && !state.result) {
          const t = T.MathUtils.clamp((missionTick - extraction.phaseAt) / (extraction.endsAt - extraction.phaseAt), 0, 1);
          const offset = extraction.method === 'albatross'
            ? this.vector.set(0, ship.position.y, ship.position.z - extraction.z)
            : this.vector.set(Math.sin(Math.PI * .235) * 95 * t ** 1.8, 45 * t, -Math.cos(Math.PI * .235) * 95 * t ** 1.8);
          const secured = latest?.players.filter((player) => extraction.securedIds.includes(player.id)) ?? [];
          PlayerRigBatches.setTransport(this.scene, new Map(secured.map(({ slot }) => [slot, offset])));
          if (extraction.securedIds.includes(own)) {
            const rescuedByFighter = extraction.method === 'balloon';
            this.camera.position.set(position.x + offset.x + (rescuedByFighter ? 21 : 8),
              offset.y + (rescuedByFighter ? 11.8 : 5.8), position.z + offset.z + (rescuedByFighter ? 22 : 11));
            this.camera.lookAt(position.x + offset.x, offset.y + (rescuedByFighter ? 8.3 : 2.5), position.z + offset.z);
          }
        }
        this.camera.updateMatrixWorld();
        operation.convicts.draw(state.convicts, missionTick, now, dt, this.camera,
          Boolean(flying) || state.phase === 'TOUCHDOWN' || state.state === 'RETURN_TO_CARRIER');
        if (!carrier) {
          mission.environment.updateObjectives(state.objectives);
          mission.environment.debug.visible = debug;
          mission.breach.update(state.nests, missionTick, this.camera, low);
          this.markers.update(mission.definition, state, this.camera, position, missionTick, hAlpha > .5 ? h2 : h1,
            showMarkers && state.state !== 'DEPLOYMENT' && state.extraction?.phase !== 'LIFT');
        } else this.markers.root.hidden = true;
      } else operation.convicts.draw([], missionTick, now, dt, this.camera, true);
    }
    // Player snapshots may be extrapolated a little (alpha > 1); grenades follow a ballistic arc and do not.
    this.grenades.draw(p1, p2, Math.min(1, pAlpha), this.camera, low);
    this.players.drawBatches(this.camera);
    if (!mission) this.details.update(this.camera, this.quality.gravelDistance, this.quality.brushDistance);
    this.horde.draw(this.camera, carrier ? undefined : h1, carrier ? undefined : h2, hAlpha, now, this.quality, this.contact);
    this.contact.end();
    this.effects.draw(now, this.camera);
    this.renderer.info.reset();
    this.gpuTimer.begin();
    try {
      if (this.post) this.post.composer.render(dt);
      else this.renderer.render(this.scene, this.camera);
    } finally {
      this.gpuTimer.end();
    }
  }

  /** Locomotion state and animation speed of the local operator (telemetry). */
  localMotion(): { state: string; speed: number } {
    return { state: this.players.localState, speed: this.players.localSpeed };
  }

  /**
   * Telemetry overlay: orange ring at the last authoritative server position, cyan ring at the
   * simulated client prediction. The rendered operator is drawn between them. Without arguments hidden.
   */
  debugPositions(server?: PositionXZ, predicted?: PositionXZ): void {
    if (!server && !predicted) {
      if (this.debugMarkers) this.debugMarkers.server.visible = this.debugMarkers.predicted.visible = false;
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
      this.debugMarkers = { server: marker(0xff8a3d, .55), predicted: marker(0x5fe3ff, .42) };
    }
    const { server: s, predicted: p } = this.debugMarkers;
    s.visible = !!server;
    p.visible = !!predicted;
    if (server) s.position.set(server.x, .04, server.z);
    if (predicted) p.position.set(predicted.x, .05, predicted.z);
  }

  metrics() {
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
    };
  }

  private disposePost(): void {
    if (!this.post) return;
    this.post.render.dispose();
    this.post.output.dispose();
    this.post.fxaa.dispose();
    this.post.composer.dispose();
    this.post = undefined;
  }

  dispose(): void {
    this.observer.disconnect();
    this.canvas.removeEventListener('webglcontextrestored', this.restoreContext);
    this.disposePost();
    this.light.sun.shadow.dispose();
    this.players.dispose();
    this.operation?.convicts.dispose();
    PlayerRigBatches.setTransport(this.scene, undefined);
    this.assets.dispose();
    this.gpuTimer.dispose();
    const geometries = new Set<T.BufferGeometry>();
    const materials = new Set<T.Material>([...this.terrain.materials, ...(this.mission?.environment.auxiliaryMaterials() ?? [])]);
    const textures = new Set<T.Texture>([this.light.sky]);
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
