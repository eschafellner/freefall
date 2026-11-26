import * as T from 'three';
import { CARRIER_PROPS, CARRIER_SHIP } from '@freefall/shared';
import { stencil } from '../ShipParts.ts';
import { floorPaint, wallPaint } from './CarrierDecals.ts';
import { AlbatrossView } from '../AlbatrossView.ts';
import type { CarrierContext, PropBuilder } from './CarrierContext.ts';
import type { CarrierScreens } from './CarrierScreens.ts';
import { GRAPHICS_QUALITY } from '../../GraphicsQuality.ts';
import type { MissionSnapshot, WorldDefinition } from '@freefall/shared';

/** Corrugated freight container (2.6 × 2.7 × 6.2 m), doors towards +z. */
function container(c: CarrierContext, y: number, w: number, d: number, paint: T.Material): void {
  const { kit, p } = c;
  const h = 2.62;
  kit.box(paint, 0, y + h / 2, 0, w - .1, h - .1, d - .1, 0, { vary: .05 });
  for (let z = -d / 2 + .25; z < d / 2 - .1; z += .32) for (const s of [-1, 1]) kit.box(paint, s * (w / 2 - .06), y + h / 2, z, .06, h - .3, .14, 0, { vary: .02 });
  for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
    kit.box(p.frameDark, sx * (w / 2 - .08), y + .1 + sy * (h - .2), sz * (d / 2 - .08), .18, .2, .18);
  }
  for (const s of [-1, 1]) {
    kit.box(p.frameDark, s * (w / 2 - .05), y + h / 2, 0, .1, .12, d - .2);
    kit.box(p.frameDark, 0, y + .06 + (s > 0 ? h - .12 : 0), d / 2 - .05, w, .12, .1);
  }
  for (const x of [-.75, -.3, .3, .75]) kit.cylinder(p.steel, x, y + h / 2, d / 2 + .02, .025, h - .3, 'y', 6);
  kit.box(p.white, 0, y + h - .45, d / 2 + .005, .9, .25, .01);
}

export const HANGAR_BUILDERS: Record<string, PropBuilder> = {
  container(c, _s, prop, w, d) {
    const { p } = c;
    const paints = [p.blue, p.red, p.olive];
    const stacked = prop.height > 3;
    const i = Math.round(Math.abs(prop.z));
    container(c, 0, w, d, paints[i % 3]);
    if (stacked) {
      c.kit.push(0, 0, 0, .04);
      container(c, 2.64, w, d, paints[(i + 1) % 3]);
      c.kit.pop();
    }
  },
  'fuel-cart'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.frameDark, 0, .35, 0, w, .2, d);
    for (const x of [-w / 2 + .1, w / 2 - .1]) for (const z of [-d / 2 + .35, d / 2 - .35]) kit.cylinder(p.rubber, x, .25, z, .25, .18, 'x', 14);
    kit.cylinder(p.yellow, 0, 1.0, -.15, .62, d - .7, 'z', 20);
    for (const s of [-1, 1]) kit.cylinder(p.yellow, 0, 1.0, -.15 + s * (d - .7) / 2, .62, .02, 'z', 20, { taper: .7 });
    kit.box(p.hazard, 0, 1.0, -.15, w + .04, .18, .6);
    kit.cylinder(p.red, 0, 1.0, d / 2 - .25, .32, .3, 'x', 18);
    kit.cylinder(p.rubber, 0, 1.0, d / 2 - .25, .26, .32, 'x', 18);
    kit.box(p.frameDark, 0, .7, d / 2 - .25, .5, .5, .5);
    kit.rod(p.rubber, [.1, 1.0, d / 2 - .1], [.6, .05, d / 2 + 1.1], .04);
    kit.rod(p.rubber, [.6, .05, d / 2 + 1.1], [1.6, .05, d / 2 + 1.6], .04);
  },
  crates(c, _s, _prop, w, d) {
    const { kit, p } = c;
    const cols = Math.max(1, Math.round(w / 1.05)), rows = Math.max(1, Math.round(d / 1.05));
    for (let i = 0; i < cols; i++) for (let k = 0; k < rows; k++) {
      const x = -w / 2 + (i + .5) * w / cols, z = -d / 2 + (k + .5) * d / rows;
      const stack = 1 + Math.floor(kit.random() * 2);
      for (let s = 0; s < stack; s++) {
        const size = .9 - s * .08;
        kit.box(s % 2 ? p.fabricTan : p.olive, x, size / 2 + s * .82, z, size, size * .9, size, (kit.random() - .5) * .3, { vary: .1 });
        kit.box(p.frameDark, x, size * .45 + s * .82, z, size + .02, .05, size + .02);
      }
    }
    kit.box(p.frameDark, 0, .06, 0, w, .12, d);
  },
  'tool-cart'(c, _s, _prop, w, d) {
    const { kit, p } = c;
    kit.box(p.red, 0, .6, 0, w, .9, d);
    for (let i = 0; i < 5; i++) {
      kit.box(p.frameDark, w / 2 + .005, .3 + i * .16, 0, .01, .02, d - .1);
      kit.box(p.steel, w / 2 + .02, .36 + i * .16, 0, .02, .02, .3);
    }
    kit.box(p.frameDark, 0, 1.07, 0, w + .04, .04, d + .04);
    for (const x of [-w / 2 + .08, w / 2 - .08]) for (const z of [-d / 2 + .08, d / 2 - .08]) kit.cylinder(p.rubber, x, .07, z, .07, .05, 'x', 10);
    kit.box(p.steel, .1, 1.12, .2, .05, .05, .3);
    kit.box(p.yellow, -.1, 1.12, -.2, .1, .06, .25);
  },
};

/** Albatross 01 in maintenance: a second lander baked into the hangar geometry, scaffold, open panels and hoses. */
function maintenanceLander(c: CarrierContext, x: number, z: number): void {
  const { kit, p } = c;
  const lander = new AlbatrossView();
  const docked = { state: 'CARRIER_HUB', phase: 'DOCKED', phaseAt: 0, phaseUntil: 0, boardingUntil: 0 } as unknown as MissionSnapshot;
  lander.update(docked, 0, GRAPHICS_QUALITY.high, undefined, { obstacles: [] } as unknown as WorldDefinition, true);
  const holder = new T.Group();
  holder.position.set(x - CARRIER_SHIP.x, 0, z - CARRIER_SHIP.z);
  holder.add(lander.root);
  kit.zone = 'hangar';
  kit.bake(holder);
  // Scaffold towers on both flanks with plank decks, a hoist and cables down to an opened engine bay.
  for (const s of [-1, 1]) {
    const sx = x + s * 3.9;
    for (const dz of [-2.4, 0, 2.4]) kit.box(p.yellow, sx, 2.1, z + dz, .08, 4.2, .08);
    for (const dz of [-2.4, 2.4]) kit.box(p.yellow, sx + s * .9, 2.1, z + dz, .08, 4.2, .08);
    for (const y of [1.4, 2.9, 4.2]) {
      kit.box(p.grate, sx + s * .45, y, z, 1.0, .05, 4.9);
      kit.box(p.yellow, sx + s * .45, y + .55, z, .05, .05, 4.9);
    }
    kit.beam(p.yellow, [sx, .1, z - 2.4], [sx, 4.2, z], .05, .05);
  }
  kit.box(p.frameDark, x + 3.3, 2.3, z + 2.4, .05, .9, 1.3);
  kit.box(p.amber, x + 3.25, 2.3, z + 2.4, .02, .7, 1.1);
  for (const [dx, dz] of [[-1, 0], [1.3, 1.5], [.4, -2.6]]) kit.rod(p.rubber, [x + 3.5, 1.4, z + dz], [x + 6 + dx, .04, z + dz + .8], .05);
  kit.box(p.frameDark, x + 5.2, .5, z - 3.4, .8, 1, .8);
  kit.box(p.lcd, x + 5.2, .9, z - 2.99, .5, .3, .01);
  stencil(c.root, 'ALBATROSS 01', 'WARTUNG  /  NICHT EINSATZBEREIT', [x, 4.9, z + 6.4], 3.2, 0, '#d4a63a');
  c.floorGlow.pool(x + 4.2, .03, z, 3, 7);
}

export function buildHangarProps(c: CarrierContext, screens: CarrierScreens): void {
  const { kit, p } = c;
  kit.zone = 'hangar';
  const lander = CARRIER_PROPS.find((prop) => prop.prop === 'lander-maintenance');
  if (lander) maintenanceLander(c, lander.x, lander.z);
  // Wheel chocks and traffic cones around the pad, hoses on the deck.
  kit.fine = true;
  for (const [x, z] of [[-6.4, -24.4], [6.4, -24.4], [-6.4, -38.6], [6.4, -38.6], [-1.6, -40.8], [2.4, -41.3]]) {
    kit.cylinder(p.yellow, x, .3, z, .16, .6, 'y', 10, { taper: .2 });
    kit.box(p.white, x, .32, z, .2, .06, .2);
    kit.box(p.frameDark, x, .02, z, .4, .04, .4);
  }
  kit.rod(p.rubber, [-16.3, 2.6, -37], [-12.4, .04, -33.0], .05);
  kit.rod(p.rubber, [-12.4, .04, -33.0], [-8.4, .04, -32.6], .05);
  kit.fine = false;
  // Status boards on the aft wall either side of the airlock.
  for (const side of [-1, 1]) {
    kit.box(p.frameDark, side * 6.2, 2.7, -23.36, 2.5, 1.5, .08);
    screens.place(side < 0 ? 'status' : 'fleet', side * 6.2, 2.7, -23.41, 2.34, 1.32, Math.PI);
  }
  floorPaint(c.detail, [{ text: '02', size: .8 }, { text: 'STARTPLATZ', size: .2 }], 0, -40.6, 3.6, 3, 0, '#d0a032');
  floorPaint(c.detail, [{ text: 'SCHILDGRENZE  —  NICHT BETRETEN', size: 1 }], 0, -44.9, 12, .7, 0, '#c8402c');
  floorPaint(c.detail, [{ text: 'ZUR SCHLEUSE  ▼', size: 1 }], -5, -24.6, 3, .5, 0, '#c99a2e', .6);
  wallPaint(c.detail, [{ text: '03', size: 1 }], -16.95, 9.6, -36.4, 5, 3.6, Math.PI / 2, '#b98d2c', .75);
  wallPaint(c.detail, [{ text: 'SKYFALL', size: .7 }, { text: 'FLOTTENKOMMANDO  /  TRÄGERGRUPPE 3', size: .3 }], 0, 10.6, -23.34, 8, 1.6, Math.PI, '#c9ccc4', .7);
  stencil(c.root, 'STARTFREIGABE NUR DURCH LEITSTAND', 'SCHILD AKTIV  /  KEINE EVA OHNE SICHERUNG', [-9.4, 4.6, -23.36], 4.6, Math.PI, '#d4a63a');
}
