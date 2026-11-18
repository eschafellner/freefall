import * as T from 'three';
import { PLAYER_MOTION, TEAM_COLORS, lerpAngle } from '@freefall/shared';
import type { PlayersSnapshot, PositionXZ, ShotEvent } from '@freefall/shared';
import type { AssetLoader } from './AssetLoader.ts';
import { ASSETS, PRIMARY_WEAPON_ASSET } from './AssetRegistry.ts';
import { PlayerRigBatches } from './characters/PlayerRigBatches.ts';
import { PlayerVisualController } from './characters/PlayerVisualController.ts';
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
  private readonly muzzle = new T.Vector3();
  localSprint = 0;

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
      ]).then(([gltf, utils, packs]) => {
        if (this.disposed) return;
        const clips = gltf.animations.concat(packs.flatMap((pack) => pack.animations));
        for (const model of this.models) model.attachCharacter(utils.clone(gltf.scene), clips, soldier);
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

  draw(a: PlayersSnapshot | undefined, b: PlayersSnapshot | undefined, alpha: number, own: string, local: PositionXZ,
    yaw: number, pitch: number, aim: boolean, sprint: boolean, now: number, dt: number, shadows: ContactShadows, latest?: PlayersSnapshot, currentTick = latest?.tick ?? 0): void {
    this.latest = latest ?? b ?? a;
    this.localSprint = 0;
    for (const model of this.models) model.root.visible = false;
    if (!own) {
      this.models[0].draw('preview', 0, 100, -.7, 5.4, .19, -.12, false, false, 0, 0, now, dt, true);
      shadows.add(-.7, 5.4, -.19, 1.04, 1.14);
      return;
    }

    const me = this.latest?.players.find((p) => p.id === own);
    if (me) {
      const model = this.models[me.slot];
      model.draw(me.id, me.life, me.hp, local.x, local.z, yaw, pitch, aim, sprint, me.reloadUntil ?? 0,
        currentTick, now, dt, true, me.equipment);
      this.localSprint = model.animation.sprint;
      shadows.add(local.x, local.z, -yaw, .95, me.hp ? 1.19 : 1.65);
    }
    if (!a || !b) return;
    const tick = a.tick + (b.tick - a.tick) * alpha;
    for (const player of a.players) {
      if (player.id === own) continue;
      const next = b.players.find((p) => p.id === player.id);
      const t = next && next.life === player.life ? alpha : 0;
      const x = player.x + ((next?.x ?? player.x) - player.x) * t;
      const z = player.z + ((next?.z ?? player.z) - player.z) * t;
      const heading = lerpAngle(player.yaw, next?.yaw ?? player.yaw, t);
      const playerPitch = T.MathUtils.lerp(player.pitch ?? 0, next?.pitch ?? player.pitch ?? 0, t);
      const motion = player.motion ?? 0;
      this.models[player.slot].draw(player.id, player.life, player.hp, x, z, heading, playerPitch,
        Boolean(motion & PLAYER_MOTION.aim), Boolean(motion & PLAYER_MOTION.sprint), player.reloadUntil ?? 0, tick, now, dt, false, player.equipment);
      shadows.add(x, z, -heading, .95, player.hp ? 1.19 : 1.65);
    }
  }

  drawBatches(camera: T.Camera): void { this.batches.draw(camera); }

  shotOrigin(event: ShotEvent): T.Vector3 | undefined {
    const shooter = this.latest?.players.find((p) => p.id === event.shooter);
    if (!shooter) return;
    const muzzle = this.models[shooter.slot].shot(shooter.id, this.muzzle);
    if (!muzzle || Math.hypot(muzzle.x - event.fromX, muzzle.y - event.fromY, muzzle.z - event.fromZ) > 2) return;
    return muzzle;
  }

  clear(): void {
    this.latest = undefined;
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
    for (const material of materials) material.dispose();
  }
}
