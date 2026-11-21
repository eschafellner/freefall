import * as T from 'three';
import { PLAYER_MOTION, TEAM_COLORS, isGroundPosture } from '@freefall/shared';
import type { OperatorPosition, PlayerState, PlayersSnapshot, PostureState, WorldDefinition } from '@freefall/shared';
import { remotePose } from '../game/RemoteInterpolation.ts';
import type { RemotePose } from '../game/RemoteInterpolation.ts';
import type { AssetLoader } from './AssetLoader.ts';
import { ASSETS, PRIMARY_WEAPON_ASSET } from './AssetRegistry.ts';
import { prepareCharacterClips } from './characters/animation/CharacterClipSet.ts';
import { PlayerRigBatches } from './characters/PlayerRigBatches.ts';
import { PlayerVisualController } from './characters/PlayerVisualController.ts';
import type { PresentShot, WeaponCue } from './characters/PlayerVisualController.ts';
import { createSoldierParts } from './characters/SoldierRig.ts';
import type { SoldierPart } from './characters/SoldierRig.ts';
import type { ContactShadows } from './ContactShadows.ts';
import { createKestrel } from './weapons/Kestrel.ts';

export class PlayerView {
  private readonly parts = createSoldierParts();
  private readonly rifle = createKestrel();
  private readonly models = TEAM_COLORS.map((color) => new PlayerVisualController(this.parts, this.rifle, color));
  private readonly batches: PlayerRigBatches;
  private disposed = false;
  private latest?: PlayersSnapshot;
  private readonly pose: RemotePose = { x: 0, z: 0, yaw: 0, pitch: 0, tick: 0 };
  localSprint = 0;
  localModel?: PlayerVisualController;

  constructor(scene: T.Scene, assets: AssetLoader) {
    const roots = this.models.map((model) => model.root);
    scene.add(...roots);
    this.batches = new PlayerRigBatches(scene, roots);
    const soldier = ASSETS.soldier;
    if (soldier) {
      void Promise.all([
        assets.model(soldier.path),
        import('three/addons/utils/SkeletonUtils.js'),
        Promise.all((soldier.animationPaths ?? []).map((path) => assets.model(path))),
        Promise.all((soldier.animationPacks ?? []).map((pack) => assets.model(pack.path))),
      ]).then(([gltf, utils, packs, foreign]) => {
        if (this.disposed) return;
        // Retargeting runs once on the rest-pose originals; every clone shares the prepared clips.
        const prepared = prepareCharacterClips(gltf.scene, gltf.animations.concat(packs.flatMap((pack) => pack.animations)),
          (soldier.animationPacks ?? []).map((pack, i) => ({ scene: foreign[i].scene, animations: foreign[i].animations, skeleton: pack.skeleton, label: pack.path })),
          soldier.skeleton);
        for (const note of prepared.notes) console.info('[Freefall] Animation:', note);
        if (!prepared.humanoid.complete) console.warn('[Freefall] Soldaten-GLB: Humanoid-Zuordnung unvollständig, Oberkörper-Ebene und Overlays aus. Fehlend:', prepared.humanoid.missing.join(', '));
        for (const model of this.models) model.attachCharacter(utils.clone(gltf.scene), prepared.clips, soldier);
        const coverage = this.models[0].clipCoverage;
        const missing = Object.entries(coverage?.missingCore ?? {}).map(([group, ids]) => `${group}: ${ids!.join(', ')}`);
        if (missing.length) console.info('[Freefall] Fehlende Kern-Clips (Fallback laut ClipLibrary):', missing.join(' · '));
      }).catch((error: unknown) => console.warn('[Freefall] Soldaten-GLB konnte nicht eingerichtet werden.', error));
    }
    const rifle = ASSETS.weapons[PRIMARY_WEAPON_ASSET];
    if (rifle) {
      void assets.model(rifle.path).then((gltf) => {
        if (this.disposed) return;
        for (const model of this.models) model.weapon.attachModel(gltf.scene.clone(true));
      }).catch((error: unknown) => console.warn('[Freefall] Waffen-GLB konnte nicht eingerichtet werden.', error));
    }
  }

  draw(a: PlayersSnapshot | undefined, b: PlayersSnapshot | undefined, alpha: number, own: string, local: OperatorPosition,
    yaw: number, pitch: number, aim: boolean, sprint: boolean, now: number, dt: number, shadows: ContactShadows, latest?: PlayersSnapshot, currentTick = latest?.tick ?? 0, localPosture?: PostureState, localTick = currentTick, world?: WorldDefinition): void {
    this.latest = latest ?? b ?? a;
    this.localSprint = 0;
    this.localModel = undefined;
    for (const model of this.models) model.root.visible = false;
    if (!own) {
      this.models[0].draw('preview', 0, 100, -.7, 5.4, .19, -.12, false, false, 0, 0, now, dt, true);
      shadows.add(-.7, 5.4, -.19, 1.04, 1.14);
      return;
    }

    const me = this.latest?.players.find((p) => p.id === own);
    if (me) {
      const model = this.models[me.slot];
      const actionTick = a && b ? T.MathUtils.lerp(a.tick, b.tick, Math.min(1, alpha)) : localTick;
      const earlier = a?.players.find((p) => p.id === own && p.life === me.life)?.equipment;
      const later = b?.players.find((p) => p.id === own && p.life === me.life)?.equipment;
      const delayed = later && (actionTick >= (b?.tick ?? 0) || (later.action && later.started <= actionTick)) ? later : earlier;
      const gear = me.equipment?.action && me.equipment.action !== 'grenade' && me.equipment.action !== 'melee' ? me.equipment :
        delayed?.action === 'grenade' || delayed?.action === 'melee' ? delayed : me.equipment;
      model.draw(me.id, me.life, me.hp, local.x, local.z, yaw, pitch, aim, sprint, me.reloadUntil ?? 0,
        localTick, now, dt, true, gear, localPosture, local.y, undefined, me.reload, actionTick);
      this.localSprint = model.animation.sprint;
      this.localModel = model;
      const ground = localPosture && isGroundPosture(localPosture.current);
      shadows.add(local.x, local.z, -(ground ? localPosture.yaw : yaw), .95, ground || !me.hp ? 1.65 : 1.19);
    }
    if (!a || !b) return;
    for (const player of a.players) {
      if (player.id === own) continue;
      const next = b.players.find((p) => p.id === player.id);
      const { x, y, z, yaw: heading, pitch: playerPitch, tick, posture, state, bodyYaw } = remotePose(player, a, b, alpha, next, this.pose, world);
      const frame = state ?? player;
      const motion = frame.motion ?? 0;
      const later = next?.life === frame.life ? next : undefined;
      const currentGear = frame.equipment;
      const nextGear = later?.equipment;
      const switched = (currentGear?.action === 'primary' || currentGear?.action === 'secondary') &&
        tick >= currentGear.until && nextGear?.slot === currentGear.action;
      const gear = nextGear && (switched || nextGear.action && nextGear.started <= tick) ? nextGear : currentGear;
      const reload = later?.reload && later.reload.started <= tick && tick < later.reload.until && later.reloadUntil ? later : frame;
      this.models[player.slot].draw(frame.id, frame.life, frame.hp, x, z, heading, playerPitch,
        Boolean(motion & PLAYER_MOTION.aim), Boolean(motion & PLAYER_MOTION.sprint), reload.reloadUntil ?? 0, tick, now, dt, false, gear, posture, y, bodyYaw, reload.reload);
      shadows.add(x, z, -(bodyYaw ?? heading), .95, !frame.hp || posture && isGroundPosture(posture.current) ? 1.65 : 1.19);
    }
  }

  drawBatches(camera: T.Camera): void { this.batches.draw(camera); }

  hideLocal(id: string): void {
    const me = this.latest?.players.find((player) => player.id === id);
    if (me) this.models[me.slot].root.visible = false;
  }

  queueShot(cue: WeaponCue, shooter: PlayerState | undefined, now: number, present: PresentShot): boolean {
    if (!shooter) return false;
    this.models[shooter.slot].queueShot(cue, now, present);
    return true;
  }

  expireShots(now: number): void { for (const model of this.models) model.expireShots(now); }

  clearShots(): void { for (const model of this.models) model.clearShots(); }

  clear(): void {
    this.latest = undefined;
    this.localModel = undefined;
    for (const model of this.models) model.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.batches.dispose();
    for (const model of this.models) model.dispose();
    const materials = new Set<T.Material>([this.rifle.finish]);
    for (const entry of Object.values(this.parts)) {
      const parts: SoldierPart[] = Array.isArray(entry) ? entry : [entry];
      for (const part of parts) {
        part.geometry.dispose();
        materials.add(part.material);
      }
    }
    for (const part of [this.rifle.body, this.rifle.optic, this.rifle.magazine, this.rifle.pistol.body, this.rifle.pistol.optic, this.rifle.pistol.magazine]) part.dispose();
    this.rifle.pistol.slide?.dispose();
    for (const material of materials) material.dispose();
  }
}
