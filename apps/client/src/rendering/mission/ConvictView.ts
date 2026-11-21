import * as T from 'three';
import { groundHeight } from '@freefall/shared';
import type { ConvictSnapshot, WorldDefinition } from '@freefall/shared';
import { PlayerVisualController } from '../characters/PlayerVisualController.ts';
import type { PresentShot, WeaponCue } from '../characters/PlayerVisualController.ts';
import { PlayerRigBatches } from '../characters/PlayerRigBatches.ts';
import { createSoldierParts } from '../characters/SoldierRig.ts';
import type { SoldierPart } from '../characters/SoldierRig.ts';
import { createKestrel } from '../weapons/Kestrel.ts';

import { stencil } from './ShipParts.ts';

export class ConvictView {
  private readonly parts = createSoldierParts({ olive: 0x9c492c, fabric: 0x723f31 });
  private readonly rifle = createKestrel();
  private readonly models = Array.from({ length: 4 }, () => new PlayerVisualController(this.parts, this.rifle, 0xc47541, false));
  private readonly batch: PlayerRigBatches;
  /** Backpack stencils (own geometry, material and canvas texture per convict). */
  private readonly signs: T.Mesh[] = [];

  constructor(scene: T.Scene) {
    this.models.forEach((model, index) => {
      stencil(model.slots.Backpack, 'C–0' + (index + 1), 'GEWAHRSAM', [0, .035, .017], .18, 0, '#cbc0a2');
      this.signs.push(model.slots.Backpack.children.at(-1) as T.Mesh);
    });
    const roots = this.models.map((model) => model.root);
    scene.add(...roots);
    this.batch = new PlayerRigBatches(scene, roots, false);
  }

  draw(convicts: readonly ConvictSnapshot[], tick: number, now: number, dt: number, camera: T.Camera, hidden: boolean, world?: WorldDefinition): void {
    for (const model of this.models) model.root.visible = false;
    if (!hidden) for (const convict of convicts) {
      const model = this.models[convict.slot];
      const offset = Math.hypot(model.root.position.x - convict.x, model.root.position.z - convict.z);
      const blend = offset > 4 || !model.root.position.lengthSq() ? 1 : 1 - Math.exp(-dt * 15);
      const x = T.MathUtils.lerp(model.root.position.x, convict.x, blend);
      const z = T.MathUtils.lerp(model.root.position.z, convict.z, blend);
      model.draw(convict.id, 0, convict.hp, x, z, convict.yaw, 0, convict.state === 'FIRING',
        convict.state === 'MOVING', convict.reloadUntil, tick, now, dt, false, undefined, undefined, groundHeight(world, x, z));
      if (convict.lastHitAt && tick - convict.lastHitAt < 5 && convict.hp) model.root.rotateZ((5 - (tick - convict.lastHitAt)) * .018);
    }
    for (const model of this.models) model.expireShots(now);
    this.batch.draw(camera);
  }

  queueShot(cue: WeaponCue, now: number, present: PresentShot): boolean {
    if (!cue.shooter.includes('/convict-')) return false;
    const model = this.models[Number(cue.shooter.at(-1)) - 1];
    if (!model) return false;
    model.queueShot(cue, now, present);
    return true;
  }

  clearShots(): void { for (const model of this.models) model.clearShots(); }

  /** Releases everything this view owns, like `PlayerView.dispose`: rig parts, rifle, materials and stencils. */
  dispose(): void {
    this.batch.dispose();
    for (const model of this.models) model.dispose();
    for (const sign of this.signs) {
      const material = sign.material as T.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
      sign.geometry.dispose();
    }
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
