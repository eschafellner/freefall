import * as T from 'three';
import { CARRIER_CABINS, CARRIER_DOORS, CARRIER_ROOMS } from '@freefall/shared';
import type { CarrierDoor, MissionSnapshot, PositionXZ } from '@freefall/shared';
import { stencil } from '../ShipParts.ts';
import type { CarrierContext } from './CarrierContext.ts';
import { ShipKit } from './ShipKit.ts';

interface Leaf { door: CarrierDoor; sign: number; open: number }

const AIRLOCK = (door: CarrierDoor) => door.axis === 'z';
const REACH = 4.4;

/**
 * Door frames and sliding leaves for every doorway. Room doors open as an operator approaches; the airlock pair stays
 * open on deck and closes while the lander is released. Leaves are instanced per material (one draw call each).
 */
export class CarrierDoors {
  private readonly leaves: Leaf[] = [];
  private readonly meshes: T.InstancedMesh[] = [];
  private readonly dummy = new T.Object3D();

  constructor(c: CarrierContext) {
    const { kit, p } = c;
    kit.zone = 'doors';
    for (const door of CARRIER_DOORS) {
      for (const sign of [-1, 1]) this.leaves.push({ door, sign, open: AIRLOCK(door) ? 1 : 0 });
      if (AIRLOCK(door)) continue;
      // Frame on both faces of the wall: jambs, header with a status light, hazard edges.
      const side = Math.sign(door.x);
      const half = door.width / 2;
      for (const face of [-1, 1]) {
        const x = door.x + face * .34;
        for (const s of [-1, 1]) {
          kit.box(p.frameDark, x, door.height / 2 + .1, door.z + s * (half + .16), .14, door.height + .2, .34);
          kit.box(p.hazard, x - face * .02, door.height / 2, door.z + s * (half + .02), .12, door.height, .05);
        }
        kit.box(p.frameDark, x, door.height + .2, door.z, .16, .4, door.width + .66);
        kit.box(p.lamp(0xd8e2dc, 1.1), x + face * .08, door.height + .03, door.z, .02, .025, door.width - .6);
      }
      kit.box(p.hazard, door.x, .01, door.z, .66, .02, door.width);
      const label = [...CARRIER_ROOMS, ...CARRIER_CABINS].find((room) => Math.sign(room.x) === side && room.z === door.z)?.label;
      if (label) {
        const sub = door.z === 0 ? 'DECK 03  /  ZUTRITT FREI' : 'DECK 03  /  STATION';
        stencil(c.root, label, sub, [door.x - side * .44, door.height + .75, door.z], Math.min(3.2, door.width + .6), side * -Math.PI / 2);
      }
    }
    // Leaf template in local space: thickness along x, width along z (leading edge at +z), height along y.
    const template = new ShipKit();
    template.box(p.grey, 0, .5, 0, 1, 1, 1, 0, { vary: 0 });
    for (const face of [-1, 1]) {
      template.box(p.frame, face * .5, .42, -.05, .2, .62, .7, 0, { vary: 0 });
      template.box(p.frameDark, face * .5, .82, -.05, .2, .1, .7, 0, { vary: 0 });
    }
    template.box(p.black, 0, .72, -.1, 1.04, .05, .4, 0, { vary: 0 });
    template.box(p.hazard, 0, .5, .47, 1.06, 1, .06, 0, { vary: 0 });
    template.box(p.yellow, 0, .03, 0, 1.06, .06, 1, 0, { vary: 0 });
    const group = new T.Group();
    for (const mesh of template.finish(group)) {
      const instanced = new T.InstancedMesh(mesh.geometry, mesh.material, this.leaves.length);
      instanced.frustumCulled = false;
      this.meshes.push(instanced);
      c.root.add(instanced);
    }
    this.update(1, undefined, []);
  }

  update(dt: number, state: MissionSnapshot | undefined, operators: readonly PositionXZ[]): void {
    const locked = state?.state === 'DEPLOYMENT';
    for (const [i, leaf] of this.leaves.entries()) {
      const { door, sign } = leaf;
      let target: number;
      if (AIRLOCK(door)) target = locked ? 0 : 1;
      else target = operators.some((o) => (o.x - door.x) ** 2 + (o.z - door.z) ** 2 < REACH ** 2) ? 1 : 0;
      leaf.open += (target - leaf.open) * Math.min(1, dt * (target ? 7 : 3));
      const half = door.width / 2;
      const slide = half * (.5 + leaf.open * 1.06);
      const thickness = AIRLOCK(door) ? .32 : .14;
      if (door.axis === 'x') {
        this.dummy.position.set(door.x, 0, door.z + sign * slide);
        this.dummy.rotation.set(0, sign > 0 ? Math.PI : 0, 0);
        this.dummy.scale.set(thickness, door.height, half + .08);
      } else {
        this.dummy.position.set(door.x + sign * slide, 0, door.z);
        this.dummy.rotation.set(0, sign > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
        this.dummy.scale.set(thickness, door.height, half + .08);
      }
      this.dummy.updateMatrix();
      for (const mesh of this.meshes) mesh.setMatrixAt(i, this.dummy.matrix);
    }
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }
}
