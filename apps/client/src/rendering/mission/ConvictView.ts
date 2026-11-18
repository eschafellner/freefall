import * as T from 'three';
import type { ConvictSnapshot, ShotEvent } from '@freefall/shared';
import { PlayerVisualController } from '../characters/PlayerVisualController.ts';
import { PlayerRigBatches } from '../characters/PlayerRigBatches.ts';
import { createSoldierParts } from '../characters/SoldierRig.ts';
import { createKestrel } from '../weapons/Kestrel.ts';

import { stencil } from './ShipParts.ts';

export class ConvictView {
  private readonly parts = createSoldierParts({ olive: 0x9c492c, fabric: 0x723f31 });
  private readonly rifle = createKestrel();
  private readonly models = Array.from({ length: 4 }, () => new PlayerVisualController(this.parts, this.rifle, 0xc47541, false));
  private readonly batch: PlayerRigBatches;
  private readonly muzzle = new T.Vector3();

  constructor(scene: T.Scene) {
    this.models.forEach((model, index) => {
      stencil(model.slots.Backpack, 'C–0' + (index + 1), 'GEWAHRSAM', [0, .035, .017], .18, 0, '#cbc0a2');
    });
    const roots = this.models.map((model) => model.root);
    scene.add(...roots);
    this.batch = new PlayerRigBatches(scene, roots, false);
  }

  draw(convicts: readonly ConvictSnapshot[], tick: number, now: number, dt: number, camera: T.Camera, hidden: boolean): void {
    for (const model of this.models) model.root.visible = false;
    if (!hidden) for (const convict of convicts) {
      const model = this.models[convict.slot];
      const offset = Math.hypot(model.root.position.x - convict.x, model.root.position.z - convict.z);
      const blend = offset > 4 || !model.root.position.lengthSq() ? 1 : 1 - Math.exp(-dt * 15);
      model.draw(convict.id, 0, convict.hp, T.MathUtils.lerp(model.root.position.x, convict.x, blend),
        T.MathUtils.lerp(model.root.position.z, convict.z, blend), convict.yaw, 0, convict.state === 'FIRING',
        convict.state === 'MOVING', convict.reloadUntil, tick, now, dt, false);
      if (convict.lastHitAt && tick - convict.lastHitAt < 5 && convict.hp) model.root.rotateZ((5 - (tick - convict.lastHitAt)) * .018);
    }
    this.batch.draw(camera);
  }

  shot(event: ShotEvent): T.Vector3 | undefined {
    if (!event.shooter.includes('/convict-')) return;
    const slot = Number(event.shooter.at(-1)) - 1;
    return this.models[slot]?.shot(event.shooter, this.muzzle);
  }

  dispose(): void {
    this.batch.dispose();
    for (const model of this.models) model.dispose();
  }
}
