import * as T from 'three';
import { BALANCE } from '@freefall/shared';
import type { PlayersSnapshot, SupplyContainerSnapshot } from '@freefall/shared';
import { emitter, metal, plate, stencil } from './ShipParts.ts';

/**
 * Two armored resupply containers bolted to the Albatross hull (grounded military sci-fi). Mount points, serials and
 * charges come from `structures.json`; state (charges, health, availability) from the mission snapshot.
 */
const DEFINITIONS = BALANCE.vehicle('vehicle.albatross_02').supplyContainers;

interface Unit {
  id: string;
  hatch: T.Group;
  charges: T.MeshStandardMaterial[];
  beacon: T.MeshStandardMaterial;
  body: T.MeshStandardMaterial;
  open: number;
}

export class SupplyContainerView {
  readonly root = new T.Group();
  private readonly units: Unit[] = [];

  constructor() {
    const armor = metal(0x4d5442, .82, .42);
    const graphite = metal(0x2a302c, .63, .52);
    const steel = metal(0x6a706a, .5, .6);
    const hazard = metal(0x9b7536, .7, .3);
    for (const definition of DEFINITIONS) {
      const side = definition.side === 'left' ? -1 : 1;
      const group = new T.Group();
      group.position.set(definition.x, 0, definition.z);
      const body = armor.clone();
      // Armored box, mounting brackets into the hull, skid plate.
      const shell = plate(group, body, 0, .95, 0, .46, 1.04, 1.28);
      shell.castShadow = true;
      plate(group, graphite, -side * .26, .95, -.5, .1, .82, .12);
      plate(group, graphite, -side * .26, .95, .5, .1, .82, .12);
      plate(group, graphite, 0, .4, 0, .52, .08, 1.36);
      for (const z of [-.42, 0, .42]) plate(group, steel, side * .235, 1.49, z, .02, .04, .2);
      for (let i = 0; i < 5; i++) plate(group, hazard, side * .236, .5, -.52 + i * .26, .012, .06, .13);
      // Hatch on the outer face, hinged at the top edge.
      const hatch = new T.Group();
      hatch.position.set(side * .245, 1.45, 0);
      plate(hatch, armor, side * .02, -.46, 0, .04, .9, 1.16);
      plate(hatch, graphite, side * .045, -.8, 0, .02, .06, .36);
      group.add(hatch);
      stencil(hatch, 'NACHSCHUB', `${definition.serial}  /  MAG · GR · STIM`, [side * .068, -.3, 0], .98, side * Math.PI / 2, '#e0b85a');
      // Charge indicator: one lamp per charge above the hatch, plus an interaction beacon.
      const charges: T.MeshStandardMaterial[] = [];
      for (let i = 0; i < definition.charges; i++) {
        const lamp = emitter(0x7ad37a, 1.2);
        charges.push(lamp);
        plate(group, lamp, side * .238, 1.53, (i - (definition.charges - 1) / 2) * .16, .02, .05, .1);
      }
      const beacon = emitter(0xd6e7c0, 1.4);
      plate(group, beacon, side * .238, .72, 0, .02, .04, .9);
      this.root.add(group);
      this.units.push({ id: definition.id, hatch, charges, beacon, body, open: 0 });
    }
  }

  update(containers: readonly SupplyContainerSnapshot[] | undefined, tick: number, dt: number, players?: PlayersSnapshot): void {
    for (const unit of this.units) {
      const state = containers?.find(({ id }) => id === unit.id);
      const destroyed = state?.state === 'DESTROYED';
      const offline = state?.state === 'OFFLINE';
      const inUse = players?.players.some((player) => player.equipment?.action === 'resupply' && player.equipment.supplyId === unit.id);
      const recent = state && state.lastUsedAt && tick - state.lastUsedAt < 30;
      const target = destroyed ? .55 : inUse || recent ? 1 : 0;
      unit.open = T.MathUtils.damp(unit.open, target, destroyed ? 2 : 7, dt);
      unit.hatch.rotation.x = 0;
      unit.hatch.rotation.z = (unit.hatch.position.x < 0 ? -1 : 1) * unit.open * 1.25;
      const charges = state?.charges ?? unit.charges.length;
      unit.charges.forEach((lamp, i) => {
        const lit = !destroyed && !offline && i < charges;
        lamp.emissive.setHex(lit ? 0x7ad37a : destroyed ? 0x000000 : 0x2a1608);
        lamp.emissiveIntensity = lit ? 1.2 : .25;
      });
      const pulse = .9 + .5 * Math.sin(tick * .18);
      unit.beacon.emissive.setHex(destroyed ? 0x000000 : offline || state?.state === 'EMPTY' ? 0xc0471c : 0xd6e7c0);
      unit.beacon.emissiveIntensity = destroyed ? 0 : state?.state === 'READY' ? pulse : .5;
      const hit = state?.lastHitAt && tick - state.lastHitAt < 5;
      unit.body.color.setHex(destroyed ? 0x2b2622 : 0x4d5442);
      unit.body.emissive.setHex(hit ? 0x38170b : 0x000000);
    }
  }
}
