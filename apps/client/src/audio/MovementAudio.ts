import { NET, PLAYER, groundHeight, isGroundPosture, terrainHeight } from '@freefall/shared';
import type { PlayerState, PostureState, WorldDefinition } from '@freefall/shared';
import { PLANET_SURFACES, surfaceSample } from '../rendering/environment/PlanetSurfaces.ts';
import type { SurfaceFinish } from '../rendering/environment/PlanetSurfaces.ts';
import { detailSeed } from '../rendering/environment/EnvironmentDetailPlacement.ts';
import type { AudioEngine, AudioPosition } from './AudioEngine.ts';
import { takeIds, Takes } from './Soundscape.ts';
import { PRIORITY } from './VoiceBudget.ts';

const SURFACES: Record<SurfaceFinish, string> = {
  snow: 'snow', ice: 'ice', frost: 'snow', sand: 'sand', hardpan: 'dirt',
  rock: 'rock', gravel: 'rock', grass: 'grass', earth: 'dirt',
  'forest-floor': 'forest-floor', moss: 'forest-floor', litter: 'forest-floor', bark: 'forest-floor',
};

export function surfaceAudio(world: WorldDefinition, x: number, z: number): string {
  const { terrain, planetId } = world;
  if (!terrain || !planetId || !PLANET_SURFACES[planetId]) return 'rock';
  const d = terrain.step;
  const dx = (terrainHeight(terrain, x + d, z) - terrainHeight(terrain, x - d, z)) / (2 * d);
  const dz = (terrainHeight(terrain, x, z + d) - terrainHeight(terrain, x, z - d)) / (2 * d);
  const { weights } = surfaceSample(planetId, detailSeed(world), terrain, x, z, groundHeight(world, x, z), Math.hypot(dx, dz));
  const top = weights.indexOf(Math.max(...weights));
  return SURFACES[PLANET_SURFACES[planetId][top][0]];
}

interface Stride {
  life: number;
  x: number;
  z: number;
  travel: number;
  idle: number;
  since: number;
  motion: string;
  landing: number;
  postureAt: number;
}

export class MovementAudio {
  private readonly strides = new Map<string, Stride>();
  private readonly takes = new Takes();
  private readonly engine: AudioEngine;

  constructor(engine: AudioEngine) { this.engine = engine; }

  warm(world: WorldDefinition): void {
    const palette = world.planetId ? PLANET_SURFACES[world.planetId] : undefined;
    const names = new Set(palette?.map(([finish]) => SURFACES[finish]) ?? ['rock']);
    for (const name of names) this.engine.preload(takeIds(name, 4));
  }

  update(player: PlayerState, pose: AudioPosition, posture: PostureState | undefined, dt: number, sprint: boolean,
    world: WorldDefinition, tick: number, own: boolean, listener: AudioPosition): number {
    const old = this.strides.get(player.id);
    const landed = player.posture?.landedDive;
    if (old?.life !== player.life || !player.hp) {
      this.strides.set(player.id, { life: player.life, x: pose.x, z: pose.z, travel: 0, idle: 0, since: 0,
        motion: '', landing: landed?.until ?? -1, postureAt: posture?.started ?? -1 });
      return 0;
    }
    const distance = Math.hypot(pose.x - old.x, pose.z - old.z);
    old.x = pose.x; old.z = pose.z;
    old.since += dt;
    const current = posture?.current ?? 'STANDING';
    const ground = isGroundPosture(current);
    const mode = ground ? 'crawl' : current === 'CROUCHING' ? 'crouch' : sprint ? 'sprint' : 'walk';
    if (old.motion !== mode) old.travel = 0;
    old.motion = mode;
    const freshLanding = landed && landed.until > old.landing && tick >= landed.until;
    if (freshLanding) old.landing = landed.until;
    const newPosture = posture && posture.started > old.postureAt;
    if (newPosture) old.postureAt = posture.started;
    const close = own || Math.hypot(pose.x - listener.x, pose.z - listener.z) < 29;
    const validStep = distance > Math.max(.001, dt * .17) && distance <= PLAYER.sprintSpeed * dt * 1.9 + .18 &&
      Math.abs(pose.y - groundHeight(world, pose.x, pose.z)) < .24 && (current === 'STANDING' || current === 'CROUCHING' || ground);
    let level = 0, pitch = 1;
    if (freshLanding && tick - landed.until <= NET.tickHz * .55) {
      level = .93; pitch = .72; old.travel = 0;
    } else if (newPosture && (current === 'GETTING_UP' || current === 'DIVING' || current === 'SLIDING')) {
      level = .38; pitch = .83; old.travel = 0;
    } else if (validStep) {
      old.idle = 0;
      old.travel += distance;
      const stride = ground ? .31 : mode === 'crouch' ? .54 : mode === 'sprint' ? 1.14 : .80;
      if (old.travel >= stride && old.since >= (ground ? .34 : .15)) {
        old.travel %= stride;
        level = ground ? .29 : mode === 'crouch' ? .39 : mode === 'sprint' ? .69 : .55;
        pitch = ground ? .78 : mode === 'sprint' ? 1.09 : 1;
      }
    } else {
      old.idle += dt;
      if (old.idle > .13 || distance > .3) old.travel = 0;
    }
    if (!level) return 0;
    old.since = 0;
    if (!close) return 0;
    const material = surfaceAudio(world, pose.x, pose.z);
    return this.engine.play(this.takes.pick(player.id + material, material, 4), {
      bus: 'environment', level: level * (.88 + Math.random() * .2), pitch: pitch * (.94 + Math.random() * .12),
      owner: player.id + ':movement', priority: own ? PRIORITY.world : PRIORITY.detail,
      position: own ? undefined : pose, range: [2.4, 29],
    }) ? 1 : 0;
  }

  prune(players: readonly PlayerState[]): void {
    let removed = false;
    for (const id of this.strides.keys()) if (!players.some((player) => player.id === id)) {
      this.strides.delete(id);
      removed = true;
    }
    if (removed) this.takes.clear();
  }

  clear(): void { this.strides.clear(); this.takes.clear(); }
}
